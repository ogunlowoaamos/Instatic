import { isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DbClient } from '../db/client'
import {
  createPluginRecord,
  deletePluginRecord,
  listInstalledPlugins,
  listPluginRecords,
  updatePluginRecord,
} from '../repositories/plugins'
import {
  findPluginResource,
  validatePluginRecordData,
} from '@core/plugins/manifest'
import type {
  PluginManifest,
  PluginMigrationContext,
  PluginModulesEntrypointModule,
  RouteMethod,
  ServerPluginApi,
  ServerPluginLifecycleHook,
  ServerPluginModule,
  ServerPluginRouteHandler,
} from '@core/plugin-sdk'
import { assertPluginPermission } from '@core/plugin-sdk'
import {
  activatePluginModulePack,
  resetPluginModulePacks,
} from '@core/plugins/modulePackLoader'
import {
  validatePluginSettingsRecord,
  type PluginSettingDefinition,
} from '@core/plugin-sdk'
import { jsonResponse, readJsonObject } from '../http'
import { nanoid } from 'nanoid'
import { isCoreCapability, type CoreCapability } from '../auth/capabilities'
import { requireCapability } from '../auth/authz'
import { hookBus } from '@core/plugins/hookBus'
import { loopSourceRegistry } from '@core/loops/registry'
import type { LoopEntitySource as HostLoopEntitySource } from '@core/loops/types'
import { getInstalledPlugin, setPluginSettings } from '../repositories/plugins'

interface ServerPluginRoute {
  pluginId: string
  method: RouteMethod
  path: string
  capability: CoreCapability | null
  handler: ServerPluginRouteHandler
}

class ServerPluginRuntime {
  private routes = new Map<string, ServerPluginRoute>()
  private loopSourcesByPlugin = new Map<string, Set<string>>()

  reset(): void {
    this.routes.clear()
    for (const ids of this.loopSourcesByPlugin.values()) {
      for (const id of ids) loopSourceRegistry.unregister(id)
    }
    this.loopSourcesByPlugin.clear()
  }

  registerRoute(route: ServerPluginRoute): void {
    this.routes.set(this.routeKey(route.pluginId, route.method, route.path), route)
  }

  registerLoopSource(pluginId: string, source: HostLoopEntitySource): void {
    loopSourceRegistry.registerOrReplace(source)
    const ids = this.loopSourcesByPlugin.get(pluginId) ?? new Set<string>()
    ids.add(source.id)
    this.loopSourcesByPlugin.set(pluginId, ids)
  }

  unregisterPlugin(pluginId: string): void {
    for (const key of this.routes.keys()) {
      if (key.startsWith(`${pluginId}:`)) this.routes.delete(key)
    }
    const sourceIds = this.loopSourcesByPlugin.get(pluginId)
    if (sourceIds) {
      for (const id of sourceIds) loopSourceRegistry.unregister(id)
      this.loopSourcesByPlugin.delete(pluginId)
    }
    hookBus.unregisterPlugin(pluginId)
  }

  findRoute(pluginId: string, method: string, path: string): ServerPluginRoute | null {
    return this.routes.get(this.routeKey(pluginId, method.toUpperCase(), normalizeRoutePath(path))) ?? null
  }

  private routeKey(pluginId: string, method: string, path: string): string {
    return `${pluginId}:${method}:${normalizeRoutePath(path)}`
  }
}

export const serverPluginRuntime = new ServerPluginRuntime()

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

function createServerPluginApi(
  manifest: PluginManifest,
  db: DbClient,
): ServerPluginApi {
  function register(
    method: RouteMethod,
    path: string,
    capability: string,
    handler: ServerPluginRouteHandler,
  ) {
    assertPluginPermission(manifest, 'cms.routes')
    if (!isCoreCapability(capability)) {
      throw new Error(`Unknown plugin route capability: ${capability}`)
    }
    serverPluginRuntime.registerRoute({
      pluginId: manifest.id,
      method,
      path: normalizeRoutePath(path),
      capability,
      handler,
    })
  }

  function registerPublic(method: RouteMethod, path: string, handler: ServerPluginRouteHandler) {
    assertPluginPermission(manifest, 'cms.routes')
    serverPluginRuntime.registerRoute({
      pluginId: manifest.id,
      method,
      path: normalizeRoutePath(path),
      capability: null,
      handler,
    })
  }

  return {
    plugin: {
      id: manifest.id,
      version: manifest.version,
      permissions: manifest.grantedPermissions ?? [],
      log: (...args) => {
        console.info(`[plugin:${manifest.id}]`, ...args)
      },
    },
    cms: {
      routes: {
        get: (path, capability, handler) => register('GET', path, capability, handler),
        post: (path, capability, handler) => register('POST', path, capability, handler),
        patch: (path, capability, handler) => register('PATCH', path, capability, handler),
        delete: (path, capability, handler) => register('DELETE', path, capability, handler),
        getPublic: (path, handler) => registerPublic('GET', path, handler),
      },
      storage: {
        collection(resourceId) {
          assertPluginPermission(manifest, 'cms.storage')
          const resource = findPluginResource(manifest, resourceId)
          return {
            list: () => listPluginRecords(db, manifest.id, resourceId),
            create: (data) => createPluginRecord(db, {
              id: nanoid(),
              pluginId: manifest.id,
              resourceId,
              data: resource ? validatePluginRecordData(resource, data) : data,
            }),
            update: (recordId, data) => updatePluginRecord(db, {
              id: recordId,
              pluginId: manifest.id,
              resourceId,
              data: resource ? validatePluginRecordData(resource, data) : data,
            }),
            delete: (recordId) => deletePluginRecord(db, {
              id: recordId,
              pluginId: manifest.id,
              resourceId,
            }),
          }
        },
      },
      hooks: {
        on(event, listener) {
          assertPluginPermission(manifest, 'cms.hooks')
          // Cast through unknown — the SDK types narrow per-event but at the
          // runtime boundary every payload is `unknown` until the host fires
          // it with the documented shape.
          hookBus.on(manifest.id, event as string, listener as (p: unknown) => void | Promise<void>)
        },
        filter(name, handler) {
          assertPluginPermission(manifest, 'cms.hooks')
          hookBus.filter(
            manifest.id,
            name as string,
            handler as (v: unknown, ctx: { pluginId: string }) => unknown | Promise<unknown>,
          )
        },
        async emit(event, payload) {
          assertPluginPermission(manifest, 'cms.hooks')
          await hookBus.emit(event as string, payload)
        },
      },
      loops: {
        registerSource(source) {
          assertPluginPermission(manifest, 'loops.register')
          if (!source.id?.startsWith(`${manifest.id}.`)) {
            throw new Error(
              `Loop source id "${source.id}" must start with the plugin id "${manifest.id}.".`,
            )
          }
          serverPluginRuntime.registerLoopSource(manifest.id, source as HostLoopEntitySource)
        },
      },
      settings: {
        get<T extends string | number | boolean = string>(key: string): T | undefined {
          const cached = pluginSettingsCache.get(manifest.id)
          if (cached) return cached[key] as T | undefined
          // Cache miss should not happen — `installApiSettingsCache` runs
          // before activate(). Returning undefined is safe; the host
          // populates defaults on install.
          return undefined
        },
        getAll() {
          return { ...(pluginSettingsCache.get(manifest.id) ?? {}) }
        },
        async replace(next) {
          const declared = (manifest.settings ?? []) as PluginSettingDefinition[]
          const cleaned = validatePluginSettingsRecord(declared, next)
          await setPluginSettings(db, manifest.id, cleaned)
          pluginSettingsCache.set(manifest.id, cleaned)
          await hookBus.emit(`settings.changed`, {
            pluginId: manifest.id,
            settings: cleaned,
          } as unknown as Record<string, unknown>)
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Settings cache — keyed by plugin id, populated on activation so plugins
// can read settings synchronously inside `activate()` without an async hop.
// Refreshed when the host PUTs new values via the settings route.
// ---------------------------------------------------------------------------

const pluginSettingsCache = new Map<string, Record<string, string | number | boolean>>()

/** Update the in-memory settings cache for one plugin. */
export function updatePluginSettingsCache(
  pluginId: string,
  settings: Record<string, string | number | boolean>,
): void {
  pluginSettingsCache.set(pluginId, settings)
}

/** Drop a plugin's cached settings (on disable / uninstall). */
export function clearPluginSettingsCache(pluginId: string): void {
  pluginSettingsCache.delete(pluginId)
}

/**
 * Refresh a single plugin's cached settings from the DB. Called by the
 * settings PUT route after a successful update so subsequent reads from
 * inside the plugin server runtime see the new values without restart.
 */
export async function refreshPluginSettingsCache(
  db: DbClient,
  pluginId: string,
): Promise<void> {
  const plugin = await getInstalledPlugin(db, pluginId)
  if (!plugin) return
  pluginSettingsCache.set(pluginId, plugin.settings)
}

export async function activateServerPlugin(
  manifest: PluginManifest,
  mod: ServerPluginModule,
  db: DbClient,
): Promise<void> {
  await runServerPluginLifecycleHook(manifest, mod, db, 'activate')
}

export async function runServerPluginLifecycleHook(
  manifest: PluginManifest,
  mod: ServerPluginModule,
  db: DbClient,
  hook: Exclude<ServerPluginLifecycleHook, 'migrate'>,
): Promise<void> {
  const handler = mod[hook]
  if (!handler) return
  await handler(createServerPluginApi(manifest, db))
}

/**
 * Run the `migrate` hook on a plugin module. Separated from the generic
 * lifecycle runner because the signature differs — `migrate` takes a context
 * object with the previous version string in addition to the standard
 * `ServerPluginApi`.
 */
export async function runServerPluginMigrateHook(
  manifest: PluginManifest,
  mod: ServerPluginModule,
  db: DbClient,
  ctx: PluginMigrationContext,
): Promise<void> {
  const handler = mod.migrate
  if (!handler) return
  await handler(ctx, createServerPluginApi(manifest, db))
}

/**
 * Defense-in-depth path containment. The schema-level pattern on
 * `assetBasePath` and the `SAFE_ASSET_PATH_PATTERN` on `entrypoints.*` already
 * exclude `..` segments and absolute paths, but the filesystem sinks recompose
 * paths via `path.join` — so we re-assert the resolved path stays under
 * `uploadsDir` after composition.
 */
export function assertPluginPathWithin(uploadsDir: string, child: string): void {
  const rel = relative(uploadsDir, child)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Plugin path "${child}" escapes uploads root`)
  }
}

export async function loadServerPluginModule(
  manifest: PluginManifest,
  uploadsDir?: string,
): Promise<ServerPluginModule | null> {
  if (!uploadsDir || !manifest.assetBasePath || !manifest.entrypoints?.server) return null
  const relativeBase = manifest.assetBasePath.replace(/^\/uploads\/?/, '')
  const entryPath = join(uploadsDir, relativeBase, manifest.entrypoints.server)
  assertPluginPathWithin(uploadsDir, entryPath)
  return await import(`${pathToFileURL(entryPath).href}?v=${Date.now()}`) as ServerPluginModule
}

export async function loadPluginModulePack(
  manifest: PluginManifest,
  uploadsDir?: string,
): Promise<PluginModulesEntrypointModule | null> {
  if (!uploadsDir || !manifest.assetBasePath || !manifest.entrypoints?.modules) return null
  const relativeBase = manifest.assetBasePath.replace(/^\/uploads\/?/, '')
  const entryPath = join(uploadsDir, relativeBase, manifest.entrypoints.modules)
  assertPluginPathWithin(uploadsDir, entryPath)
  return await import(`${pathToFileURL(entryPath).href}?v=${Date.now()}`) as PluginModulesEntrypointModule
}

export async function handleServerPluginRuntimeRequest(
  req: Request,
  db: DbClient,
): Promise<Response | null> {
  const url = new URL(req.url)
  const match = url.pathname.match(/^\/admin\/api\/cms\/plugins\/([^/]+)\/runtime(\/.*)?$/)
  if (!match) return null

  const pluginId = decodeURIComponent(match[1])
  const routePath = normalizeRoutePath(decodeURIComponent(match[2] ?? '/'))
  const route = serverPluginRuntime.findRoute(pluginId, req.method, routePath)
  if (!route) return jsonResponse({ error: 'Plugin route not found' }, { status: 404 })

  const user = route.capability ? await requireCapability(req, db, route.capability) : null
  if (user instanceof Response) return user

  const body: Record<string, unknown> = req.method !== 'GET'
    ? await readJsonObject(req)
    : {}

  const result = await route.handler({
    req,
    db,
    body,
    user: user
      ? {
        id: user.id,
        email: user.email,
        capabilities: user.capabilities,
      }
      : null,
  })
  if (result instanceof Response) return result
  return jsonResponse(result ?? { ok: true })
}

export async function activateInstalledServerPlugins(
  db: DbClient,
  uploadsDir?: string,
): Promise<void> {
  if (!uploadsDir) return
  serverPluginRuntime.reset()
  resetPluginModulePacks()
  hookBus.reset()
  const plugins = await listInstalledPlugins(db)
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    const manifest: PluginManifest = {
      ...plugin.manifest,
      grantedPermissions: plugin.grantedPermissions,
    }
    if (!manifest.assetBasePath) continue

    // Settings — load cache before `activate()` so plugins can read
    // settings synchronously inside their server lifecycle hook.
    pluginSettingsCache.set(manifest.id, plugin.settings)

    // Module pack — register first so server plugin lifecycle hooks (and
    // anything they call) can already resolve the new modules.
    if (manifest.entrypoints?.modules && plugin.grantedPermissions.includes('modules.register')) {
      try {
        const pack = await loadPluginModulePack(manifest, uploadsDir)
        if (pack) activatePluginModulePack(manifest, pack)
      } catch (err) {
        console.error(`[plugin:${manifest.id}] module pack load failed`, err)
      }
    }

    if (manifest.entrypoints?.server) {
      const mod = await loadServerPluginModule(manifest, uploadsDir)
      if (mod) await activateServerPlugin(manifest, mod, db)
    }
  }
}
