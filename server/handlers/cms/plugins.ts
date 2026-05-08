/**
 * Plugin endpoints (gated by `plugins.manage`).
 *
 *   GET    /admin/api/cms/plugins                                   — list installed plugins + admin pages
 *   POST   /admin/api/cms/plugins                                   — install from a manifest JSON body
 *   POST   /admin/api/cms/plugins/inspect-package                   — read a plugin .zip without installing
 *   POST   /admin/api/cms/plugins/package                           — install from an uploaded .zip
 *   PATCH  /admin/api/cms/plugins/:id                               — enable / disable an installed plugin
 *   DELETE /admin/api/cms/plugins/:id                               — uninstall + delete on-disk assets
 *   GET    /admin/api/cms/plugins/:id/resources/:rid/records        — list records for a plugin resource
 *   POST   /admin/api/cms/plugins/:id/resources/:rid/records        — create a plugin record
 *   PATCH  /admin/api/cms/plugins/:id/resources/:rid/records/:rec   — update a plugin record
 *   DELETE /admin/api/cms/plugins/:id/resources/:rid/records/:rec   — delete a plugin record
 *   *      /admin/api/cms/plugins/:id/runtime/...                   — opaque runtime requests handled by
 *                                                                     the plugin's own server module
 *
 * The lifecycle hooks (`install`, `activate`, `deactivate`, `uninstall`) are
 * fired through `runPluginLifecycleHook`, which catches errors, parks the
 * plugin in `error` status, and lets the caller render a sensible response.
 *
 * `handlePluginsRoutes` is a thin dispatcher: it matches the URL pattern,
 * runs the `plugins.manage` capability check, and forwards to one of the
 * per-route handlers below. Each route handler owns its own method-routing
 * + body-parsing + repository calls.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gt as semverGt, lt as semverLt } from 'semver'
import type { DbClient } from '../../db/client'
import { requireCapability } from '../../auth/authz'
import type { AuthUser } from '../../repositories/users'
import { createAuditEvent } from '../../repositories/audit'
import {
  createPluginRecord,
  deletePluginRecord,
  deletePlugin,
  getInstalledPlugin,
  installPlugin,
  listInstalledPlugins,
  listPluginRecords,
  setPluginLifecycleStatus,
  setPluginEnabled,
  updatePluginRecord,
} from '../../repositories/plugins'
import {
  collectEnabledAdminPages,
  findPluginResource,
  missingPluginPermissionGrants,
  parsePluginManifest,
  validatePluginRecordData,
} from '@core/plugins/manifest'
import type {
  InstalledPlugin,
  PluginLifecycleStatus,
  PluginManifest,
  PluginPermission,
  PluginResource,
  ServerPluginLifecycleHook,
} from '@core/plugin-sdk'
import { readPluginPackage } from '../../plugins/package'
import {
  activateInstalledServerPlugins,
  assertPluginPathWithin,
  handleServerPluginRuntimeRequest,
  loadPluginModulePack,
  loadServerPluginModule,
  refreshPluginSettingsCache,
  runServerPluginLifecycleHook,
  runServerPluginMigrateHook,
  serverPluginRuntime,
} from '../../plugins/runtime'
import {
  validatePluginSettingsRecord,
  maskSecretSettings,
  type PluginSettingDefinition,
} from '@core/plugin-sdk'
import {
  setPluginSettings,
} from '../../repositories/plugins'
import { hookBus } from '@core/plugins/hookBus'
import {
  activatePluginModulePack,
  deactivatePluginModulePack,
} from '@core/plugins/modulePackLoader'
import {
  applyPluginPackToSite,
  loadPluginPackFile,
  parsePluginPack,
  PluginPackError,
} from '../../plugins/pack'
import { loadDraftSite, saveDraftSite } from '../../repositories/site'
import { badRequest, jsonResponse, methodNotAllowed, readJsonObject } from '../../http'
import { requestAuditContext, type CmsHandlerOptions } from './shared'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pluginsPayload(db: DbClient) {
  const plugins = await listInstalledPlugins(db)
  return {
    plugins,
    adminPages: collectEnabledAdminPages(plugins),
  }
}

function readPermissionGrants(value: unknown): PluginPermission[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is PluginPermission => typeof item === 'string') as PluginPermission[]
}

function assertPluginPermissionGrants(
  manifest: PluginManifest,
  grantedPermissions: PluginPermission[],
): Response | null {
  const missing = missingPluginPermissionGrants(manifest, grantedPermissions)
  if (missing.length === 0) return null
  return badRequest(`Plugin install requires permission grants: ${missing.join(', ')}`)
}

function pluginManifestWithGrants(plugin: InstalledPlugin): PluginManifest {
  return {
    ...plugin.manifest,
    grantedPermissions: plugin.grantedPermissions,
  }
}

function lifecycleErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Plugin lifecycle hook failed'
}

/**
 * Wrapper used for the install / activate / deactivate / uninstall lifecycle
 * paths. The `migrate` hook is intentionally excluded — its signature differs
 * (takes a context object) and the upgrade flow handles it directly via
 * `runServerPluginMigrateHook`.
 */
async function runPluginLifecycleHook(
  db: DbClient,
  plugin: InstalledPlugin,
  options: CmsHandlerOptions,
  hook: Exclude<ServerPluginLifecycleHook, 'migrate'>,
  successStatus: PluginLifecycleStatus,
): Promise<{ plugin: InstalledPlugin; ok: boolean }> {
  const manifest = pluginManifestWithGrants(plugin)

  try {
    // On `activate`, also load the plugin's canvas module pack into the
    // server-side registry so the publisher can render plugin modules
    // immediately (without restart). On `deactivate` / `uninstall`, drop them.
    if (hook === 'activate'
      && manifest.entrypoints?.modules
      && manifest.grantedPermissions?.includes('modules.register')) {
      try {
        const pack = await loadPluginModulePack(manifest, options.uploadsDir)
        if (pack) activatePluginModulePack(manifest, pack)
      } catch (err) {
        console.error(`[plugin:${plugin.id}] module pack activate failed`, err)
      }
    }
    if (hook === 'deactivate' || hook === 'uninstall') {
      deactivatePluginModulePack(plugin.id)
    }

    const mod = await loadServerPluginModule(manifest, options.uploadsDir)
    if (!mod?.[hook]) {
      const updated = await setPluginLifecycleStatus(db, plugin.id, successStatus)
      return { plugin: updated ?? plugin, ok: true }
    }

    await runServerPluginLifecycleHook(manifest, mod, db, hook)
    const updated = await setPluginLifecycleStatus(db, plugin.id, successStatus)
    return { plugin: updated ?? plugin, ok: true }
  } catch (err) {
    if (hook === 'activate') {
      serverPluginRuntime.unregisterPlugin(plugin.id)
      deactivatePluginModulePack(plugin.id)
    }
    const updated = await setPluginLifecycleStatus(db, plugin.id, 'error', lifecycleErrorMessage(err))
    return { plugin: updated ?? plugin, ok: false }
  }
}

/**
 * Schedule deletion of a plugin's old version directory after the current
 * tick — fire-and-forget. Used by the upgrade flow's success and rollback
 * paths instead of an inline `await rm(...)` so the calling handler can
 * return its Response synchronously without waiting on filesystem cleanup.
 *
 * Why deferred? In dev (`bun --watch`) the runtime tracks dynamically-
 * imported plugin server files in its watch graph; deleting one triggers
 * a server reload. Done inline that reload races the in-flight HTTP
 * response and kills it mid-flush, leaving the client (e.g. the upgrade
 * dialog in the admin UI) hanging in an inconsistent state. Deferring the
 * `rm` past the response boundary is enough: the client receives its 200
 * (or 400 on rollback) before bun's watcher fires.
 *
 * In production (no `--watch`), there is no reload to race with — the
 * deferral is a harmless no-op delay.
 */
function scheduleStaleVersionCleanup(
  pluginId: string,
  version: string,
  uploadsDir: string,
): void {
  const target = join(uploadsDir, `plugins/${pluginId}/${version}`)
  // Defense-in-depth — same containment check as `removePluginAssets`.
  try {
    assertPluginPathWithin(uploadsDir, target)
  } catch (err) {
    console.error(
      `[plugin:${pluginId}] scheduleStaleVersionCleanup refused to delete escaping path:`,
      err,
    )
    return
  }
  setTimeout(() => {
    rm(target, { recursive: true, force: true }).catch((err: unknown) => {
      console.error(
        `[plugin:${pluginId}] cleanup of /uploads/plugins/${pluginId}/${version} failed:`,
        err,
      )
    })
  }, 0)
}

async function removePluginAssets(plugin: InstalledPlugin, uploadsDir?: string): Promise<void> {
  const assetBasePath = plugin.manifest.assetBasePath
  if (!uploadsDir || !assetBasePath?.startsWith('/uploads/plugins/')) return
  const relativeBasePath = assetBasePath.replace(/^\/uploads\/?/, '')
  const target = join(uploadsDir, relativeBasePath)
  // Defense-in-depth: a string-prefix match on `/uploads/plugins/` does not
  // block `..` traversal that the schema is supposed to reject — re-assert
  // containment after `path.join` normalises the segments so a corrupted
  // stored manifest (or a future schema regression) can't trigger an
  // arbitrary `rm -rf`.
  try {
    assertPluginPathWithin(uploadsDir, target)
  } catch (err) {
    console.error('[plugins] removePluginAssets refused to delete escaping path:', err)
    return
  }
  await rm(target, { recursive: true, force: true })
}

async function readPluginPackageForm(req: Request): Promise<{
  file: File | null
  grantedPermissions: PluginPermission[]
}> {
  const body = await req.formData()
  const file = body.get('file')
  const rawPermissions = body.get('grantedPermissions')
  let grantedPermissions: PluginPermission[] = []
  if (typeof rawPermissions === 'string') {
    try {
      // JSON.parse returns unknown — readPermissionGrants validates the shape
      // (must be array, items must be strings) before returning. Safe boundary.
      grantedPermissions = readPermissionGrants(JSON.parse(rawPermissions))
    } catch {
      grantedPermissions = []
    }
  }
  return {
    file: file instanceof File ? file : null,
    grantedPermissions,
  }
}

async function writePluginPackageFiles(
  uploadsDir: string,
  manifest: PluginManifest,
  files: Record<string, string | Uint8Array>,
): Promise<PluginManifest> {
  const relativeBasePath = `plugins/${manifest.id}/${manifest.version}`
  const diskBasePath = join(uploadsDir, relativeBasePath)
  await rm(diskBasePath, { recursive: true, force: true })

  for (const [path, content] of Object.entries(files)) {
    if (path === 'plugin.json') continue
    const outputPath = join(diskBasePath, path)
    await mkdir(dirname(outputPath), { recursive: true })
    // Binary entries (icon PNG/WEBP, fonts) come through as Uint8Array;
    // text entries (JS / JSON / SVG) as string. `writeFile` accepts both.
    if (typeof content === 'string') {
      await writeFile(outputPath, content, 'utf-8')
    } else {
      await writeFile(outputPath, content)
    }
  }

  return {
    ...manifest,
    assetBasePath: `/uploads/${relativeBasePath}`,
  }
}

async function getEnabledPluginResource(
  db: DbClient,
  pluginId: string,
  resourceId: string,
): Promise<PluginResource | null> {
  const plugin = await getInstalledPlugin(db, pluginId)
  if (!plugin?.enabled) return null
  return findPluginResource(plugin.manifest, resourceId)
}

/**
 * Record a plugin lifecycle action in the audit log. The mutation endpoints
 * (install / update / enable / disable / delete) emit the same envelope —
 * actor, action verb, and a metadata payload — so this helper exists purely
 * to keep the route handlers tidy. Update events carry the version delta in
 * metadata so audit log consumers can distinguish a fresh install from an
 * upgrade without re-fetching the plugin row.
 */
async function recordPluginAuditEvent(
  db: DbClient,
  user: AuthUser,
  req: Request,
  action: 'plugin.install' | 'plugin.update' | 'plugin.enable' | 'plugin.disable' | 'plugin.delete',
  pluginId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await createAuditEvent(db, {
    actorUserId: user.id,
    action,
    targetType: 'plugin',
    targetId: pluginId,
    metadata: { pluginId, ...metadata },
    ...requestAuditContext(req),
  })
}

const PLUGIN_NOT_FOUND = jsonResponse({ error: 'Plugin not found' }, { status: 404 })
const PLUGIN_RECORD_NOT_FOUND = jsonResponse({ error: 'Plugin record not found' }, { status: 404 })
const PLUGIN_RESOURCE_NOT_FOUND = jsonResponse({ error: 'Plugin resource not found' }, { status: 404 })

// ---------------------------------------------------------------------------
// Per-route handlers — one function per URL pattern
// ---------------------------------------------------------------------------

async function handlePluginsCollection(
  req: Request,
  db: DbClient,
  user: AuthUser,
): Promise<Response> {
  if (req.method === 'GET') {
    return jsonResponse(await pluginsPayload(db))
  }

  if (req.method === 'POST') {
    const body = await readJsonObject(req)
    try {
      // JSON-installed plugins have no on-disk package — only the zip-install
      // path writes files and assigns `assetBasePath`. Drop any caller-supplied
      // value before validating so a malicious manifest cannot point the
      // filesystem sinks at attacker-chosen paths.
      const rawManifest = body.manifest ?? body
      const sanitizedInput = rawManifest && typeof rawManifest === 'object' && !Array.isArray(rawManifest)
        ? { ...(rawManifest as Record<string, unknown>), assetBasePath: undefined }
        : rawManifest
      const manifest = parsePluginManifest(sanitizedInput)
      const grantedPermissions = readPermissionGrants(body.grantedPermissions)
      const grantError = assertPluginPermissionGrants(manifest, grantedPermissions)
      if (grantError) return grantError
      const installed = await installPlugin(db, manifest, grantedPermissions)
      const plugin = await setPluginLifecycleStatus(db, installed.id, 'active') ?? installed
      await recordPluginAuditEvent(db, user, req, 'plugin.install', plugin.id)
      return jsonResponse({ plugin, ...await pluginsPayload(db) }, { status: 201 })
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : 'Invalid plugin manifest')
    }
  }

  return methodNotAllowed()
}

async function handleInspectPackage(req: Request): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed()

  const { file } = await readPluginPackageForm(req)
  if (!file) return badRequest('Missing plugin package')
  try {
    const pluginPackage = await readPluginPackage(file)
    return jsonResponse({ manifest: pluginPackage.manifest })
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Invalid plugin package')
  }
}

async function handlePackageInstall(
  req: Request,
  db: DbClient,
  options: CmsHandlerOptions,
  user: AuthUser,
): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed()
  if (!options.uploadsDir) {
    return jsonResponse({ error: 'Uploads directory is not configured' }, { status: 500 })
  }

  const { file, grantedPermissions } = await readPluginPackageForm(req)
  if (!file) return badRequest('Missing plugin package')

  try {
    const pluginPackage = await readPluginPackage(file)
    const grantError = assertPluginPermissionGrants(pluginPackage.manifest, grantedPermissions)
    if (grantError) return grantError

    // Detect upgrade vs. fresh install BEFORE writing assets. The repository
    // does an upsert, but the lifecycle and rollback semantics differ
    // significantly between the two paths so we branch explicitly.
    const existing = await getInstalledPlugin(db, pluginPackage.manifest.id)
    if (existing && semverLt(pluginPackage.manifest.version, existing.version)) {
      return badRequest(
        `Plugin "${existing.id}" is installed at ${existing.version}; refusing to downgrade to ${pluginPackage.manifest.version}.`,
      )
    }

    if (existing && semverGt(pluginPackage.manifest.version, existing.version)) {
      return await handlePluginUpgrade({
        db,
        options,
        user,
        req,
        existing,
        pluginPackage,
        grantedPermissions,
      })
    }

    return await handleFreshPluginInstall({
      db,
      options,
      user,
      req,
      pluginPackage,
      grantedPermissions,
    })
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Invalid plugin package')
  }
}

interface InstallContext {
  db: DbClient
  options: CmsHandlerOptions
  user: AuthUser
  req: Request
  pluginPackage: Awaited<ReturnType<typeof readPluginPackage>>
  grantedPermissions: PluginPermission[]
}

async function handleFreshPluginInstall(ctx: InstallContext): Promise<Response> {
  const { db, options, user, req, pluginPackage, grantedPermissions } = ctx
  if (!options.uploadsDir) throw new Error('uploadsDir required')

  const manifest = await writePluginPackageFiles(
    options.uploadsDir,
    pluginPackage.manifest,
    pluginPackage.files,
  )
  const installed = await installPlugin(db, manifest, grantedPermissions)
  const installLifecycle = await runPluginLifecycleHook(db, installed, options, 'install', 'installed')
  if (!installLifecycle.ok) {
    return jsonResponse(
      { plugin: installLifecycle.plugin, ...await pluginsPayload(db) },
      { status: 201 },
    )
  }

  serverPluginRuntime.unregisterPlugin(installed.id)
  const activateLifecycle = await runPluginLifecycleHook(
    db,
    installLifecycle.plugin,
    options,
    'activate',
    'active',
  )

  // Auto-install bundled pack — when the manifest declares one and the user
  // granted `visualComponents.register`, importing the pack is what they
  // expected. Skipping the manual "Install pack" click means a UI Kit-style
  // plugin "just works" after upload.
  let packSummary: Awaited<ReturnType<typeof installPluginPackToSite>> | null = null
  if (
    activateLifecycle.ok &&
    activateLifecycle.plugin.manifest.pack &&
    activateLifecycle.plugin.grantedPermissions.includes('visualComponents.register') &&
    options.uploadsDir
  ) {
    try {
      packSummary = await installPluginPackToSite(
        db,
        activateLifecycle.plugin,
        options.uploadsDir,
        user.id,
        req,
      )
    } catch (err) {
      console.error(`[plugins:${activateLifecycle.plugin.id}] auto pack install failed`, err)
    }
  }

  await recordPluginAuditEvent(db, user, req, 'plugin.install', activateLifecycle.plugin.id, {
    version: activateLifecycle.plugin.version,
  })
  return jsonResponse(
    {
      plugin: activateLifecycle.plugin,
      ...await pluginsPayload(db),
      pack: packSummary,
    },
    { status: 201 },
  )
}

interface UpgradeContext extends InstallContext {
  existing: InstalledPlugin
}

/**
 * Upgrade an existing plugin to a newer version.
 *
 * Order of operations:
 *   1. Run old version's `deactivate(api)` and unregister its module pack.
 *   2. Write the new version's assets to its own version-stamped dir
 *      (`/uploads/plugins/{id}/{newVersion}/`). The old version's dir is
 *      preserved on disk until step 6 — that's what makes rollback cheap.
 *   3. Replace the DB row with the new manifest (settings, granted
 *      permissions from the user's confirmation, installed_at preserved).
 *   4. Run new version's `migrate({ fromVersion }, api)`.
 *   5. Run new version's `activate(api)`.
 *   6. Delete the OLD version's asset dir.
 *
 * Any failure in steps 4 or 5 triggers a rollback: revert the DB row to the
 * previous manifest, delete the new version's assets, re-activate the
 * previous version. The plugin ends in `error` status with a message that
 * explains the upgrade failure.
 */
async function handlePluginUpgrade(ctx: UpgradeContext): Promise<Response> {
  const { db, options, user, req, existing, pluginPackage, grantedPermissions } = ctx
  if (!options.uploadsDir) throw new Error('uploadsDir required')
  const fromVersion = existing.version
  const newVersion = pluginPackage.manifest.version
  const pluginId = existing.id

  // 1. Deactivate the old version. Best-effort — a deactivate failure
  //    shouldn't prevent the upgrade from proceeding (the new version is
  //    about to replace it anyway). We log and move on.
  try {
    const oldManifest = pluginManifestWithGrants(existing)
    if (oldManifest.entrypoints?.server) {
      const oldMod = await loadServerPluginModule(oldManifest, options.uploadsDir)
      if (oldMod?.deactivate) {
        await runServerPluginLifecycleHook(oldManifest, oldMod, db, 'deactivate')
      }
    }
  } catch (err) {
    console.error(`[plugin:${pluginId}] pre-upgrade deactivate failed`, err)
  }
  serverPluginRuntime.unregisterPlugin(pluginId)
  deactivatePluginModulePack(pluginId)

  // 2. Write new assets.
  const newManifest = await writePluginPackageFiles(
    options.uploadsDir,
    pluginPackage.manifest,
    pluginPackage.files,
  )

  // 3. Replace DB row. `installPlugin` upserts — settings_json + installed_at
  //    are preserved by the SET clause (it doesn't reference them).
  const upgraded = await installPlugin(db, newManifest, grantedPermissions)

  // 4 + 5. Try to migrate then activate. On any failure we restore the old
  //        version end-to-end.
  try {
    const upgradedManifest = pluginManifestWithGrants(upgraded)
    const newMod = await loadServerPluginModule(upgradedManifest, options.uploadsDir)
    if (newMod?.migrate) {
      await runServerPluginMigrateHook(upgradedManifest, newMod, db, { fromVersion })
    }
    if (
      upgradedManifest.entrypoints?.modules
      && upgradedManifest.grantedPermissions?.includes('modules.register')
    ) {
      try {
        const pack = await loadPluginModulePack(upgradedManifest, options.uploadsDir)
        if (pack) activatePluginModulePack(upgradedManifest, pack)
      } catch (err) {
        console.error(`[plugin:${pluginId}] post-upgrade module pack load failed`, err)
      }
    }
    if (newMod?.activate) {
      await runServerPluginLifecycleHook(upgradedManifest, newMod, db, 'activate')
    }
    await setPluginLifecycleStatus(db, pluginId, 'active')
  } catch (err) {
    // Rollback. The DB row + on-disk new assets need to be reverted.
    const failureMessage = lifecycleErrorMessage(err)
    console.error(`[plugin:${pluginId}] upgrade ${fromVersion} → ${newVersion} failed:`, err)
    await rollbackUpgrade({ db, options, existing, newManifest })
    return jsonResponse(
      {
        error: `Upgrade failed: ${failureMessage}. Rolled back to version ${fromVersion}.`,
        ...await pluginsPayload(db),
      },
      { status: 400 },
    )
  }

  // 6. Drop the old version's assets — DEFERRED. In dev (`bun --watch`)
  //    the runtime tracks dynamically-imported plugin files in its watch
  //    graph, and deleting one triggers a server reload. If we awaited the
  //    `rm` here, the reload would race the response write: the in-flight
  //    HTTP response would get killed mid-flush and the admin client would
  //    see an aborted connection (catch block fires → `setPendingInstall`
  //    never clears → upgrade dialog sticks). Scheduling the cleanup with
  //    `setTimeout(_, 0)` returns the response synchronously after this
  //    function ends; bun's reload (if it happens) fires after the client
  //    has its 200. In production (no `--watch`), this is just a tiny
  //    bookkeeping deferral — no reload to worry about.
  scheduleStaleVersionCleanup(pluginId, fromVersion, options.uploadsDir)

  // Re-fetch so the response carries the post-activation row (settings,
  // lifecycle = 'active', etc.).
  const finalRow = (await getInstalledPlugin(db, pluginId)) ?? upgraded

  // Auto-install pack on upgrade too — same trigger conditions as fresh
  // install. A new pack version often ships new VCs/templates that the
  // user expects to see immediately.
  let packSummary: Awaited<ReturnType<typeof installPluginPackToSite>> | null = null
  if (
    finalRow.manifest.pack &&
    finalRow.grantedPermissions.includes('visualComponents.register')
  ) {
    try {
      packSummary = await installPluginPackToSite(db, finalRow, options.uploadsDir, user.id, req)
    } catch (err) {
      console.error(`[plugins:${pluginId}] post-upgrade pack install failed`, err)
    }
  }

  await recordPluginAuditEvent(db, user, req, 'plugin.update', pluginId, {
    fromVersion,
    toVersion: newVersion,
  })
  return jsonResponse(
    {
      plugin: finalRow,
      ...await pluginsPayload(db),
      pack: packSummary,
      upgrade: { fromVersion, toVersion: newVersion },
    },
    { status: 200 },
  )
}

/**
 * Restore a plugin to its prior version after a failed upgrade.
 *
 *  - DB row is rolled back via `installPlugin(prevManifest, prevGrants)`.
 *    This is the same upsert path as a fresh install — `settings_json`
 *    and `installed_at` are preserved automatically.
 *  - The prior version's asset dir is still on disk (we didn't touch it
 *    during the upgrade attempt), so no asset restore is needed.
 *  - The new version's asset dir is removed.
 *  - Best-effort re-activation of the prior version. If THAT fails too,
 *    the plugin is parked in `error` state with a chained message; the
 *    site owner can resolve manually from the admin UI.
 */
async function rollbackUpgrade(args: {
  db: DbClient
  options: CmsHandlerOptions
  existing: InstalledPlugin
  newManifest: PluginManifest
}): Promise<void> {
  const { db, options, existing, newManifest } = args
  const pluginId = existing.id

  // Restore DB row to previous manifest + grants. The upsert preserves
  // settings + installed_at automatically.
  const restored = await installPlugin(
    db,
    pluginManifestWithGrants(existing),
    existing.grantedPermissions,
  )

  // Drop new version assets — the upgrade didn't take. Same dev-watch
  // hazard as the success-path cleanup: deleting an imported plugin file
  // races the response write under `bun --watch`. Defer with the shared
  // helper so the 400 lands on the client first.
  if (options.uploadsDir) {
    scheduleStaleVersionCleanup(pluginId, newManifest.version, options.uploadsDir)
  }

  // Re-activate prior version. Best-effort: a rollback that crashes during
  // re-activation leaves the plugin disabled-with-error, which is still a
  // safer state than half-upgraded.
  serverPluginRuntime.unregisterPlugin(pluginId)
  deactivatePluginModulePack(pluginId)
  try {
    const restoredManifest = pluginManifestWithGrants(restored)
    if (
      restoredManifest.entrypoints?.modules
      && restoredManifest.grantedPermissions?.includes('modules.register')
    ) {
      const pack = await loadPluginModulePack(restoredManifest, options.uploadsDir)
      if (pack) activatePluginModulePack(restoredManifest, pack)
    }
    if (restoredManifest.entrypoints?.server) {
      const restoredMod = await loadServerPluginModule(restoredManifest, options.uploadsDir)
      if (restoredMod?.activate) {
        await runServerPluginLifecycleHook(restoredManifest, restoredMod, db, 'activate')
      }
    }
    await setPluginLifecycleStatus(
      db,
      pluginId,
      'error',
      `Upgrade to ${newManifest.version} failed; rolled back to ${existing.version}.`,
    )
  } catch (err) {
    console.error(`[plugin:${pluginId}] rollback re-activate failed`, err)
    await setPluginLifecycleStatus(
      db,
      pluginId,
      'error',
      `Upgrade to ${newManifest.version} failed and rollback re-activate failed: ${lifecycleErrorMessage(err)}`,
    )
  }
}

/**
 * Pure helper: load the plugin's pack from disk, merge into the active site,
 * and emit an audit event. Used by both auto-install (zip upload) and the
 * explicit `POST /pack/install` endpoint.
 */
async function installPluginPackToSite(
  db: DbClient,
  plugin: InstalledPlugin,
  uploadsDir: string,
  actorUserId: string,
  req: Request,
): Promise<{
  installed: { visualComponents: { id: string; name: string }[]; pages: { id: string; title: string }[]; classes: { id: string; name: string }[] }
  replaced: { visualComponents: string[]; pages: string[]; classes: string[] }
} | null> {
  if (!plugin.manifest.pack) return null
  if (!plugin.manifest.assetBasePath) return null
  const raw = await loadPluginPackFile(uploadsDir, plugin.manifest.assetBasePath, plugin.manifest.pack.path)
  const pack = parsePluginPack(plugin.id, raw)
  const site = await loadDraftSite(db)
  if (!site) return null
  const { site: nextSite, replaced } = applyPluginPackToSite(site, pack)
  await saveDraftSite(db, nextSite, actorUserId)
  await createAuditEvent(db, {
    actorUserId,
    action: 'plugin.pack.install',
    targetType: 'plugin',
    targetId: plugin.id,
    metadata: {
      pluginId: plugin.id,
      installedVisualComponents: pack.visualComponents.length,
      installedPages: pack.pages.length,
      installedClasses: pack.classes.length,
      replacedVisualComponents: replaced.visualComponents,
      replacedPages: replaced.pages,
      replacedClasses: replaced.classes,
    },
    ...requestAuditContext(req),
  })
  return {
    installed: {
      visualComponents: pack.visualComponents.map((vc) => ({ id: vc.id, name: vc.name })),
      pages: pack.pages.map((p) => ({ id: p.id, title: p.title })),
      classes: pack.classes.map((c) => ({ id: c.id, name: c.name })),
    },
    replaced,
  }
}

/**
 * PATCH `enabled` on a single plugin. The shape is symmetric — both branches
 * flip the enabled flag, run the matching lifecycle hook, re-bind the runtime
 * registry, and emit one audit event — only the verbs and statuses differ.
 */
async function setPluginEnabledFromRequest(
  req: Request,
  db: DbClient,
  options: CmsHandlerOptions,
  user: AuthUser,
  pluginId: string,
  enabled: boolean,
): Promise<Response> {
  const updated = await setPluginEnabled(db, pluginId, enabled)
  if (!updated) return PLUGIN_NOT_FOUND

  serverPluginRuntime.unregisterPlugin(pluginId)
  const lifecycle = await runPluginLifecycleHook(
    db,
    updated,
    options,
    enabled ? 'activate' : 'deactivate',
    enabled ? 'active' : 'disabled',
  )

  // Disabling a plugin frees its registry slot but leaves the rest of the
  // installed surface registered — re-activate the others so they pick up
  // their hooks again.
  if (!enabled) {
    await activateInstalledServerPlugins(db, options.uploadsDir)
  }

  await recordPluginAuditEvent(
    db,
    user,
    req,
    enabled ? 'plugin.enable' : 'plugin.disable',
    pluginId,
  )
  return jsonResponse({ plugin: lifecycle.plugin, ...await pluginsPayload(db) })
}

async function handlePluginItem(
  req: Request,
  db: DbClient,
  options: CmsHandlerOptions,
  user: AuthUser,
  pluginId: string,
): Promise<Response> {
  if (req.method === 'PATCH') {
    const body = await readJsonObject(req)
    if (typeof body.enabled !== 'boolean') return badRequest('Plugin enabled must be a boolean')

    const current = await getInstalledPlugin(db, pluginId)
    if (!current) return PLUGIN_NOT_FOUND

    return setPluginEnabledFromRequest(req, db, options, user, pluginId, body.enabled)
  }

  if (req.method === 'DELETE') {
    const current = await getInstalledPlugin(db, pluginId)
    if (!current) return PLUGIN_NOT_FOUND

    const lifecycle = await runPluginLifecycleHook(db, current, options, 'uninstall', current.lifecycleStatus)
    if (!lifecycle.ok) {
      return badRequest(lifecycle.plugin.lastError ?? 'Plugin uninstall failed')
    }

    const deleted = await deletePlugin(db, pluginId)
    if (!deleted) return PLUGIN_NOT_FOUND
    serverPluginRuntime.unregisterPlugin(pluginId)
    await removePluginAssets(current, options.uploadsDir)
    await activateInstalledServerPlugins(db, options.uploadsDir)
    await recordPluginAuditEvent(db, user, req, 'plugin.delete', pluginId)
    return jsonResponse({ ok: true })
  }

  return methodNotAllowed()
}

async function handlePluginPackInstall(
  req: Request,
  db: DbClient,
  options: CmsHandlerOptions,
  user: AuthUser,
  pluginId: string,
): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed()
  if (!options.uploadsDir) {
    return jsonResponse({ error: 'Uploads directory is not configured' }, { status: 500 })
  }

  const plugin = await getInstalledPlugin(db, pluginId)
  if (!plugin) return PLUGIN_NOT_FOUND
  if (!plugin.grantedPermissions.includes('visualComponents.register')) {
    return badRequest(`Plugin "${pluginId}" requires the visualComponents.register permission to install a pack`)
  }
  if (!plugin.manifest.pack) {
    return badRequest(`Plugin "${pluginId}" does not declare a pack`)
  }
  if (!plugin.manifest.assetBasePath) {
    return badRequest(`Plugin "${pluginId}" has no on-disk package`)
  }

  try {
    const summary = await installPluginPackToSite(
      db,
      plugin,
      options.uploadsDir,
      user.id,
      req,
    )
    if (!summary) {
      return badRequest('No draft site to install pack into; finish initial setup first.')
    }
    return jsonResponse(summary)
  } catch (err) {
    if (err instanceof PluginPackError) return badRequest(err.message)
    throw err
  }
}

/**
 * GET / PUT plugin settings.
 *   GET  → return the masked settings (secret values become `'***'`)
 *   PUT  → validate against the plugin's declared schema, persist, refresh
 *          the runtime cache, fire `settings.changed` so plugin server hooks
 *          can react.
 */
async function handlePluginSettings(
  req: Request,
  db: DbClient,
  user: AuthUser,
  pluginId: string,
): Promise<Response> {
  const plugin = await getInstalledPlugin(db, pluginId)
  if (!plugin) return PLUGIN_NOT_FOUND
  const declared = (plugin.manifest.settings ?? []) as PluginSettingDefinition[]
  if (declared.length === 0) {
    return badRequest(`Plugin "${pluginId}" does not declare settings`)
  }

  if (req.method === 'GET') {
    return jsonResponse({
      schema: declared,
      settings: maskSecretSettings(declared, plugin.settings),
    })
  }

  if (req.method === 'PUT') {
    const body = await readJsonObject(req)
    let cleaned: Record<string, string | number | boolean>
    try {
      cleaned = validatePluginSettingsRecord(declared, body.settings ?? body)
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : 'Invalid settings payload')
    }
    await setPluginSettings(db, pluginId, cleaned)
    await refreshPluginSettingsCache(db, pluginId)
    await hookBus.emit('settings.changed', {
      pluginId,
      settings: cleaned,
    } as unknown as Record<string, unknown>)
    await createAuditEvent(db, {
      actorUserId: user.id,
      action: 'plugin.settings.update',
      targetType: 'plugin',
      targetId: pluginId,
      metadata: {
        pluginId,
        keys: Object.keys(cleaned),
      },
      ...requestAuditContext(req),
    })
    return jsonResponse({ settings: maskSecretSettings(declared, cleaned) })
  }

  return methodNotAllowed()
}

async function handlePluginRecordsCollection(
  req: Request,
  db: DbClient,
  pluginId: string,
  resourceId: string,
): Promise<Response> {
  const resource = await getEnabledPluginResource(db, pluginId, resourceId)
  if (!resource) return PLUGIN_RESOURCE_NOT_FOUND

  if (req.method === 'GET') {
    return jsonResponse({
      resource,
      records: await listPluginRecords(db, pluginId, resourceId),
    })
  }

  if (req.method === 'POST') {
    const body = await readJsonObject(req)
    try {
      const data = validatePluginRecordData(resource, body.data ?? body)
      const record = await createPluginRecord(db, {
        id: nanoid(),
        pluginId,
        resourceId,
        data,
      })
      return jsonResponse({ record }, { status: 201 })
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : 'Invalid plugin record data')
    }
  }

  return methodNotAllowed()
}

async function handlePluginRecordItem(
  req: Request,
  db: DbClient,
  pluginId: string,
  resourceId: string,
  recordId: string,
): Promise<Response> {
  const resource = await getEnabledPluginResource(db, pluginId, resourceId)
  if (!resource) return PLUGIN_RESOURCE_NOT_FOUND

  if (req.method === 'PATCH') {
    const body = await readJsonObject(req)
    try {
      const data = validatePluginRecordData(resource, body.data ?? body)
      const record = await updatePluginRecord(db, {
        id: recordId,
        pluginId,
        resourceId,
        data,
      })
      if (!record) return PLUGIN_RECORD_NOT_FOUND
      return jsonResponse({ record })
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : 'Invalid plugin record data')
    }
  }

  if (req.method === 'DELETE') {
    const deleted = await deletePluginRecord(db, {
      id: recordId,
      pluginId,
      resourceId,
    })
    if (!deleted) return PLUGIN_RECORD_NOT_FOUND
    return jsonResponse({ ok: true })
  }

  return methodNotAllowed()
}

// ---------------------------------------------------------------------------
// Route patterns
// ---------------------------------------------------------------------------

const PLUGIN_ITEM_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)$/
const PLUGIN_RECORDS_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/resources\/([^/]+)\/records$/
const PLUGIN_RECORD_ITEM_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/resources\/([^/]+)\/records\/([^/]+)$/
const PLUGIN_RUNTIME_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/runtime(?:\/.*)?$/
const PLUGIN_PACK_INSTALL_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/pack\/install$/
const PLUGIN_SETTINGS_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/settings$/

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handlePluginsRoutes(
  req: Request,
  db: DbClient,
  options: CmsHandlerOptions,
): Promise<Response | null> {
  const url = new URL(req.url)
  const { pathname } = url

  // Plugin runtime is a pass-through to the plugin's own server module — its
  // capability gating lives inside `handleServerPluginRuntimeRequest` because
  // the module decides which routes are public vs. authenticated.
  if (PLUGIN_RUNTIME_PATTERN.test(pathname)) {
    return (
      (await handleServerPluginRuntimeRequest(req, db)) ??
      jsonResponse({ error: 'Plugin route not found' }, { status: 404 })
    )
  }

  // Every CMS-side plugin route requires `plugins.manage`.
  if (!isPluginAdminPath(pathname)) return null
  const user = await requireCapability(req, db, 'plugins.manage')
  if (user instanceof Response) return user

  if (pathname === '/admin/api/cms/plugins') {
    return handlePluginsCollection(req, db, user)
  }

  if (pathname === '/admin/api/cms/plugins/inspect-package') {
    return handleInspectPackage(req)
  }

  if (pathname === '/admin/api/cms/plugins/package') {
    return handlePackageInstall(req, db, options, user)
  }

  const packInstallMatch = pathname.match(PLUGIN_PACK_INSTALL_PATTERN)
  if (packInstallMatch) {
    return handlePluginPackInstall(req, db, options, user, decodeURIComponent(packInstallMatch[1]))
  }

  const settingsMatch = pathname.match(PLUGIN_SETTINGS_PATTERN)
  if (settingsMatch) {
    return handlePluginSettings(req, db, user, decodeURIComponent(settingsMatch[1]))
  }

  const recordItemMatch = pathname.match(PLUGIN_RECORD_ITEM_PATTERN)
  if (recordItemMatch) {
    return handlePluginRecordItem(
      req,
      db,
      decodeURIComponent(recordItemMatch[1]),
      decodeURIComponent(recordItemMatch[2]),
      decodeURIComponent(recordItemMatch[3]),
    )
  }

  const recordsMatch = pathname.match(PLUGIN_RECORDS_PATTERN)
  if (recordsMatch) {
    return handlePluginRecordsCollection(
      req,
      db,
      decodeURIComponent(recordsMatch[1]),
      decodeURIComponent(recordsMatch[2]),
    )
  }

  const itemMatch = pathname.match(PLUGIN_ITEM_PATTERN)
  if (itemMatch) {
    return handlePluginItem(req, db, options, user, decodeURIComponent(itemMatch[1]))
  }

  return null
}

/**
 * Quick check that `pathname` is one of the plugin admin routes — the
 * runtime route is handled separately above. Centralising the prefix keeps
 * the dispatcher's auth gate from running on unrelated CMS paths.
 */
function isPluginAdminPath(pathname: string): boolean {
  if (pathname === '/admin/api/cms/plugins') return true
  if (pathname === '/admin/api/cms/plugins/inspect-package') return true
  if (pathname === '/admin/api/cms/plugins/package') return true
  return pathname.startsWith('/admin/api/cms/plugins/')
}
