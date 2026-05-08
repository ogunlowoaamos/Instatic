import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../server/auth/tokens'
import type { DbClient, DbResult } from '../../../server/db'
import { handleCmsRequest } from '../../../server/handlers/cms'
import { assertPluginPathWithin } from '../../../server/plugins/runtime'

function makeFakeDb() {
  const admins: Record<string, unknown>[] = [
    {
      id: 'admin_1',
      email: 'owner@example.com',
      password_hash: 'hash',
      created_at: new Date('2026-01-01').toISOString(),
    },
  ]
  const sessions: Record<string, unknown>[] = []
  const plugins: Record<string, unknown>[] = []
  const records: Record<string, unknown>[] = []

  const handle = async <Row extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<DbResult<Row>> => {
    // Reconstruct a parameterized SQL string for pattern matching.
    const sql = strings.reduce<string>((acc, str, i) => (i === 0 ? str : `${acc}$${i}${str}`), '')
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    if (normalized.includes('from sessions') && normalized.includes('join users')) {
      const session = sessions.find((s) => String(s.id_hash) === String(values[0]))
      if (!session) return { rows: [], rowCount: 0 }
      const admin = admins.find((a) => a.id === session.user_id)
      return {
        rows: admin ? [{
          ...admin,
          email_normalized: admin.email,
          display_name: 'Owner',
          status: 'active',
          role_id: 'owner',
          last_login_at: null,
          updated_at: admin.created_at,
          deleted_at: null,
          role_slug: 'owner',
          role_name: 'Owner',
          role_description: '',
          role_is_system: true,
          role_capabilities_json: ['plugins.manage'],
        } as Row] : [],
        rowCount: admin ? 1 : 0,
      }
    }
    if (normalized.includes('update sessions') && normalized.includes('last_seen_at')) {
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes('insert into audit_events')) {
      return { rows: [], rowCount: 1 }
    }
    // getInstalledPlugin — single-row lookup by id
    if (normalized.includes('select id, name, version, enabled') && normalized.includes('where id =')) {
      const row = plugins.find((plugin) => plugin.id === values[0])
      return { rows: row ? [row as Row] : [], rowCount: row ? 1 : 0 }
    }
    // listInstalledPlugins — no values
    if (normalized.includes('select id, name, version, enabled')) {
      return { rows: [...plugins] as Row[], rowCount: plugins.length }
    }
    // setPluginSettings — values[0]=settings_json, values[1]=id
    if (normalized.includes('update installed_plugins') && normalized.includes('set settings_json')) {
      const row = plugins.find((plugin) => plugin.id === values[1])
      if (!row) return { rows: [], rowCount: 0 }
      row.settings_json = values[0]
      row.updated_at = new Date('2026-05-01T10:07:00.000Z').toISOString()
      return { rows: [row as Row], rowCount: 1 }
    }
    // installPlugin — values[0..5]=id, name, version, manifestJson, permsJson, settingsJson
    if (normalized.includes('insert into installed_plugins')) {
      const now = new Date('2026-05-01T10:00:00.000Z').toISOString()
      const id = values[0]
      const previous = plugins.find((p) => p.id === id)
      const row = {
        id,
        name: values[1],
        version: values[2],
        enabled: true,
        lifecycle_status: 'installed',
        last_error: null,
        manifest_json: values[3],
        granted_permissions_json: values[4] ?? [],
        // Upsert preserves stored settings + installed_at across re-installs
        // (matches the real `on conflict do update` clause that doesn't SET
        // those columns).
        settings_json: previous?.settings_json ?? values[5] ?? '{}',
        installed_at: previous?.installed_at ?? now,
        updated_at: now,
      }
      const index = plugins.findIndex((plugin) => plugin.id === id)
      if (index >= 0) plugins[index] = row
      else plugins.push(row)
      return { rows: [row as Row], rowCount: 1 }
    }
    // setPluginEnabled — values[0]=enabled, values[1]=id (note: order changed from old pg API)
    if (normalized.includes('update installed_plugins set enabled')) {
      const row = plugins.find((plugin) => plugin.id === values[1])
      if (!row) return { rows: [], rowCount: 0 }
      row.enabled = values[0]
      row.updated_at = new Date('2026-05-01T10:05:00.000Z').toISOString()
      return { rows: [row as Row], rowCount: 1 }
    }
    // setPluginLifecycleStatus — values[0]=lifecycleStatus, values[1]=lastError, values[2]=id
    if (normalized.includes('update installed_plugins set lifecycle_status')) {
      const row = plugins.find((plugin) => plugin.id === values[2])
      if (!row) return { rows: [], rowCount: 0 }
      row.lifecycle_status = values[0]
      row.last_error = values[1] ?? null
      row.updated_at = new Date('2026-05-01T10:06:00.000Z').toISOString()
      return { rows: [row as Row], rowCount: 1 }
    }
    // deletePlugin — values[0]=id
    if (normalized.includes('delete from installed_plugins where id')) {
      const index = plugins.findIndex((plugin) => plugin.id === values[0])
      if (index === -1) return { rows: [], rowCount: 0 }
      plugins.splice(index, 1)
      return { rows: [], rowCount: 1 }
    }
    // createPluginRecord — values[0..3]=id, pluginId, resourceId, dataJson
    if (normalized.includes('insert into plugin_records')) {
      const now = new Date('2026-05-01T10:10:00.000Z').toISOString()
      const row = {
        id: values[0],
        plugin_id: values[1],
        resource_id: values[2],
        data_json: values[3],
        created_at: now,
        updated_at: now,
      }
      records.push(row)
      return { rows: [row as Row], rowCount: 1 }
    }
    throw new Error(`Unhandled SQL: ${sql}`)
  }

  handle.transaction = async <T>(cb: (tx: DbClient) => Promise<T>): Promise<T> =>
    cb(handle as unknown as DbClient)

  return Object.assign(handle as DbClient, { admins, sessions, plugins, records })
}

async function createCookie(db: ReturnType<typeof makeFakeDb>): Promise<string> {
  const token = 'valid-session-token'
  db.sessions.push({
    id_hash: await hashSessionToken(token),
    user_id: 'admin_1',
    expires_at: new Date('2030-01-01').toISOString(),
  })
  return `${SESSION_COOKIE_NAME}=${token}`
}

function cmsRequest(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Request {
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    url,
    method: init.method ?? 'GET',
    headers: {
      get(name: string) {
        return headers.get(name.toLowerCase()) ?? null
      },
    },
    async json() {
      return init.body ? JSON.parse(init.body) : {}
    },
  } as Request
}

function cmsFormRequest(
  url: string,
  formData: FormData,
  headers: Record<string, string> = {},
): Request {
  const headerMap = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    url,
    method: 'POST',
    headers: {
      get(name: string) {
        return headerMap.get(name.toLowerCase()) ?? null
      },
    },
    async formData() {
      return formData
    },
  } as Request
}

function pluginZip(files: Record<string, string>): File {
  const zipped = zipSync(Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
  ))
  return new File([zipped], 'workflow-tools.zip', { type: 'application/zip' })
}

const mapManifest = {
  id: 'local.map',
  name: 'Map Studio',
  version: '1.0.0',
  apiVersion: 1,
  permissions: ['admin.navigation'],
  adminPages: [{
    id: 'overview',
    title: 'Map Studio',
    navLabel: 'Map',
    icon: 'map',
    content: {
      kind: 'map',
      heading: 'Store Map',
      body: 'Track important locations.',
      centerLabel: 'Prague',
      pins: [{ label: 'HQ', detail: 'Main office', x: 42, y: 55 }],
    },
  }],
}

describe('CMS plugin handlers', () => {
  it('requires an admin session for plugin listing', async () => {
    const res = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins'),
      makeFakeDb(),
    )

    expect(res.status).toBe(401)
  })

  it('installs, lists, disables, and removes a declarative plugin manifest', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)

    const install = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          manifest: mapManifest,
          grantedPermissions: ['admin.navigation'],
        }),
      }),
      db,
    )

    expect(install.status).toBe(201)
    expect(await install.json()).toMatchObject({
      plugin: {
        id: 'local.map',
        name: 'Map Studio',
        enabled: true,
        lifecycleStatus: 'active',
        lastError: null,
        manifest: {
          adminPages: [{ route: '/admin/plugins/local.map/overview' }],
        },
      },
      adminPages: [{ pluginId: 'local.map', route: '/admin/plugins/local.map/overview' }],
    })

    const list = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins', {
        headers: { cookie },
      }),
      db,
    )
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({
      plugins: [{ id: 'local.map', enabled: true }],
      adminPages: [{ navLabel: 'Map' }],
    })

    const disable = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins/local.map', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
      db,
    )
    expect(disable.status).toBe(200)
    expect(await disable.json()).toMatchObject({
      plugin: { id: 'local.map', enabled: false },
      plugins: [{ id: 'local.map', lifecycleStatus: 'disabled' }],
      adminPages: [],
    })

    const remove = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins/local.map', {
        method: 'DELETE',
        headers: { cookie },
      }),
      db,
    )
    expect(remove.status).toBe(200)
    expect(await remove.json()).toEqual({ ok: true })
    expect(db.plugins).toHaveLength(0)
  })

  it('strips caller-supplied assetBasePath from JSON-installed manifests (path-traversal sink)', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)

    // Attacker-shaped manifest: assetBasePath escapes /uploads/plugins/
    // via `..` segments. The JSON install path must drop the value before
    // it is validated/stored — otherwise both filesystem sinks
    // (loadServerPluginModule, removePluginAssets) would later compose
    // an arbitrary path.
    const attackerManifest = {
      ...mapManifest,
      id: 'atk.evil',
      name: 'evil',
      version: '1.0.0',
      assetBasePath: '/uploads/plugins/../../etc',
      entrypoints: { server: 'pwn.js' },
    }

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          manifest: attackerManifest,
          grantedPermissions: ['admin.navigation'],
        }),
      }),
      db,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { plugin: { manifest: { assetBasePath?: unknown } } }
    expect(body.plugin.manifest.assetBasePath).toBeUndefined()
    expect(db.plugins).toHaveLength(1)
  })

  it('rejects invalid plugin manifests before persistence', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ ...mapManifest, id: '../bad' }),
      }),
      db,
    )

    expect(res.status).toBe(400)
    expect(db.plugins).toHaveLength(0)
  })

  it('requires explicit permission grants before installing privileged plugins', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const privilegedManifest = {
      ...mapManifest,
      id: 'acme.workflow',
      name: 'Workflow Tools',
      permissions: ['editor.toolbar', 'editor.store.write', 'cms.routes', 'cms.storage'],
      entrypoints: {
        editor: 'editor/index.js',
        server: 'server/index.js',
      },
    }

    const denied = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: privilegedManifest, grantedPermissions: ['editor.toolbar'] }),
      }),
      db,
    )

    expect(denied.status).toBe(400)
    expect(db.plugins).toHaveLength(0)

    const accepted = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          manifest: privilegedManifest,
          grantedPermissions: privilegedManifest.permissions,
        }),
      }),
      db,
    )

    expect(accepted.status).toBe(201)
    expect(await accepted.json()).toMatchObject({
      plugin: {
        id: 'acme.workflow',
        grantedPermissions: privilegedManifest.permissions,
        manifest: {
          entrypoints: {
            editor: 'editor/index.js',
            server: 'server/index.js',
          },
        },
      },
    })
    expect(typeof db.plugins[0].manifest_json).toBe('string')
    expect(typeof db.plugins[0].granted_permissions_json).toBe('string')
    expect(JSON.parse(String(db.plugins[0].granted_permissions_json)))
      .toEqual(privilegedManifest.permissions)
  })

  it('installs zip plugin packages, writes assets, and activates backend routes', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'page-builder-plugins-'))
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const manifest = {
      id: 'acme.workflow',
      name: 'Workflow Tools',
      version: '1.0.0',
      apiVersion: 1,
      permissions: ['admin.navigation', 'cms.routes'],
      entrypoints: {
        server: 'server/index.js',
      },
      resources: [],
      adminPages: [{
        id: 'dashboard',
        title: 'Workflow',
        navLabel: 'Workflow',
        content: {
          kind: 'app',
          heading: 'Workflow Dashboard',
          entry: 'admin/dashboard.js',
        },
      }],
    }

    try {
      const formData = new FormData()
      formData.set('file', pluginZip({
        'plugin.json': JSON.stringify(manifest),
        'server/index.js': 'export function activate(api) { api.cms.routes.get("/ping", "plugins.manage", () => ({ ok: true })) }',
        'admin/dashboard.js': 'export function render({ root }) { root.textContent = "Workflow" }',
      }))
      formData.set('grantedPermissions', JSON.stringify(manifest.permissions))

      const install = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', formData, { cookie }),
        db,
        { uploadsDir },
      )

      expect(install.status).toBe(201)
      expect(typeof db.plugins[0].manifest_json).toBe('string')
      expect(typeof db.plugins[0].granted_permissions_json).toBe('string')
      expect(await install.json()).toMatchObject({
        plugin: {
          id: 'acme.workflow',
          lifecycleStatus: 'active',
          lastError: null,
          manifest: {
            assetBasePath: '/uploads/plugins/acme.workflow/1.0.0',
          },
        },
        adminPages: [{
          pluginId: 'acme.workflow',
          content: {
            kind: 'app',
            assetPath: '/uploads/plugins/acme.workflow/1.0.0',
          },
        }],
      })
      await expect(readFile(
        join(uploadsDir, 'plugins/acme.workflow/1.0.0/server/index.js'),
        'utf-8',
      )).resolves.toContain('activate')

      const runtime = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/plugins/acme.workflow/runtime/ping', {
          headers: { cookie },
        }),
        db,
        { uploadsDir },
      )

      expect(runtime.status).toBe(200)
      expect(await runtime.json()).toEqual({ ok: true })
    } finally {
      await rm(uploadsDir, { recursive: true, force: true })
    }
  })

  it('runs packaged server plugin lifecycle hooks on install, disable, enable, and remove', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'page-builder-lifecycle-'))
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const manifest = {
      id: 'acme.lifecycle',
      name: 'Lifecycle Demo',
      version: '1.0.0',
      apiVersion: 1,
      permissions: ['cms.routes', 'cms.storage'],
      entrypoints: {
        server: 'server/index.js',
      },
      resources: [{
        id: 'events',
        title: 'Events',
        fields: [{ id: 'name', label: 'Name', type: 'text', required: true }],
      }],
      adminPages: [],
    }
    const serverEntrypoint = `
      function mark(api, name) {
        globalThis.__cmsLifecycleEvents = [...(globalThis.__cmsLifecycleEvents || []), name + ':' + api.plugin.id]
      }
      export async function install(api) {
        mark(api, 'install')
        await api.cms.storage.collection('events').create({ name: 'installed' })
      }
      export function activate(api) {
        mark(api, 'activate')
        api.cms.routes.get('/ping', 'plugins.manage', () => ({ ok: true, plugin: api.plugin.id }))
      }
      export function deactivate(api) { mark(api, 'deactivate') }
      export function uninstall(api) { mark(api, 'uninstall') }
    `

    try {
      ;(globalThis as typeof globalThis & { __cmsLifecycleEvents?: string[] }).__cmsLifecycleEvents = []
      const formData = new FormData()
      formData.set('file', pluginZip({
        'plugin.json': JSON.stringify(manifest),
        'server/index.js': serverEntrypoint,
      }))
      formData.set('grantedPermissions', JSON.stringify(manifest.permissions))

      const install = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', formData, { cookie }),
        db,
        { uploadsDir },
      )
      expect(install.status).toBe(201)
      expect((globalThis as typeof globalThis & { __cmsLifecycleEvents?: string[] }).__cmsLifecycleEvents)
        .toEqual(['install:acme.lifecycle', 'activate:acme.lifecycle'])
      expect(db.records).toHaveLength(1)

      const disable = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/plugins/acme.lifecycle', {
          method: 'PATCH',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        }),
        db,
        { uploadsDir },
      )
      expect(disable.status).toBe(200)
      expect(await disable.json()).toMatchObject({
        plugin: { enabled: false, lifecycleStatus: 'disabled' },
      })

      const enable = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/plugins/acme.lifecycle', {
          method: 'PATCH',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        }),
        db,
        { uploadsDir },
      )
      expect(enable.status).toBe(200)
      expect(await enable.json()).toMatchObject({
        plugin: { enabled: true, lifecycleStatus: 'active' },
      })

      const remove = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/plugins/acme.lifecycle', {
          method: 'DELETE',
          headers: { cookie },
        }),
        db,
        { uploadsDir },
      )
      expect(remove.status).toBe(200)
      expect((globalThis as typeof globalThis & { __cmsLifecycleEvents?: string[] }).__cmsLifecycleEvents)
        .toContain('uninstall:acme.lifecycle')
      expect(db.plugins).toHaveLength(0)
    } finally {
      delete (globalThis as typeof globalThis & { __cmsLifecycleEvents?: string[] }).__cmsLifecycleEvents
      await rm(uploadsDir, { recursive: true, force: true })
    }
  })

  it('assertPluginPathWithin rejects paths that escape the uploads root', () => {
    const root = '/srv/uploads'
    // Same root and a child below the root → ok.
    expect(() => assertPluginPathWithin(root, '/srv/uploads/plugins/atk.evil/1.0.0/x.js'))
      .not.toThrow()
    // path.join already normalised these, but we still re-check the resolved value.
    expect(() => assertPluginPathWithin(root, '/srv/etc'))
      .toThrow('escapes uploads root')
    expect(() => assertPluginPathWithin(root, '/srv/uploads/../etc'))
      .toThrow('escapes uploads root')
    // The root itself is rejected — there is no legitimate plugin file at exactly the uploads root.
    expect(() => assertPluginPathWithin(root, '/srv/uploads'))
      .toThrow('escapes uploads root')
  })

  it('stores lifecycle errors for admin diagnostics without losing the plugin row', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'page-builder-lifecycle-error-'))
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const manifest = {
      id: 'acme.broken',
      name: 'Broken Plugin',
      version: '1.0.0',
      apiVersion: 1,
      permissions: [],
      entrypoints: {
        server: 'server/index.js',
      },
      resources: [],
      adminPages: [],
    }

    try {
      const formData = new FormData()
      formData.set('file', pluginZip({
        'plugin.json': JSON.stringify(manifest),
        'server/index.js': 'export function install() { throw new Error("install exploded") }',
      }))
      formData.set('grantedPermissions', JSON.stringify([]))

      const install = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', formData, { cookie }),
        db,
        { uploadsDir },
      )

      expect(install.status).toBe(201)
      expect(await install.json()).toMatchObject({
        plugin: {
          id: 'acme.broken',
          lifecycleStatus: 'error',
          lastError: 'install exploded',
        },
      })
      expect(db.plugins).toHaveLength(1)
    } finally {
      await rm(uploadsDir, { recursive: true, force: true })
    }
  })

  // ─── Upgrade flow ────────────────────────────────────────────────────────
  //
  // The upgrade path detects an already-installed plugin id, runs the new
  // version's `migrate({ fromVersion }, api)` between the old version's
  // deactivate and the new version's activate, preserves settings + installed_at,
  // drops the old version's asset dir on success, and rolls back to the prior
  // version on activate failure.

  it('routes a same-id newer-version upload through the upgrade flow with migrate', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'page-builder-upgrade-'))
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const baseManifest = (version: string) => ({
      id: 'acme.upgrade',
      name: 'Upgrade Demo',
      version,
      apiVersion: 1,
      permissions: ['cms.routes'],
      entrypoints: { server: 'server/index.js' },
      resources: [],
      adminPages: [],
    })

    try {
      ;(globalThis as typeof globalThis & { __upgradeCalls?: string[] }).__upgradeCalls = []
      // Old version: just records its own activate/deactivate.
      const v1 = `
        export function activate(api) {
          (globalThis.__upgradeCalls ??= []).push('v1.activate')
        }
        export function deactivate() {
          (globalThis.__upgradeCalls ??= []).push('v1.deactivate')
        }
      `
      // New version: declares a migrate hook + activate. Migrate must run
      // between old.deactivate and new.activate.
      const v2 = `
        export function migrate(ctx) {
          (globalThis.__upgradeCalls ??= []).push('v2.migrate:' + ctx.fromVersion)
        }
        export function activate() {
          (globalThis.__upgradeCalls ??= []).push('v2.activate')
        }
      `

      // Fresh install of v1.
      const v1FormData = new FormData()
      v1FormData.set('file', pluginZip({
        'plugin.json': JSON.stringify(baseManifest('1.0.0')),
        'server/index.js': v1,
      }))
      v1FormData.set('grantedPermissions', JSON.stringify(['cms.routes']))
      const installV1 = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', v1FormData, { cookie }),
        db,
        { uploadsDir },
      )
      expect(installV1.status).toBe(201)

      // Capture installed_at so we can verify it's preserved on upgrade.
      const installedAtBefore = db.plugins[0].installed_at

      // Upload v2 of the same plugin id.
      const v2FormData = new FormData()
      v2FormData.set('file', pluginZip({
        'plugin.json': JSON.stringify(baseManifest('1.1.0')),
        'server/index.js': v2,
      }))
      v2FormData.set('grantedPermissions', JSON.stringify(['cms.routes']))
      const upgrade = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', v2FormData, { cookie }),
        db,
        { uploadsDir },
      )
      expect(upgrade.status).toBe(200)
      const upgradeBody = await upgrade.json() as {
        plugin: { version: string; lifecycleStatus: string }
        upgrade?: { fromVersion: string; toVersion: string }
      }
      expect(upgradeBody.plugin.version).toBe('1.1.0')
      expect(upgradeBody.plugin.lifecycleStatus).toBe('active')
      expect(upgradeBody.upgrade).toEqual({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      // Lifecycle ordering: v1.deactivate → v2.migrate(fromVersion=1.0.0) → v2.activate
      expect((globalThis as typeof globalThis & { __upgradeCalls?: string[] }).__upgradeCalls)
        .toEqual([
          'v1.activate',
          'v1.deactivate',
          'v2.migrate:1.0.0',
          'v2.activate',
        ])

      // installed_at preserved across the upgrade.
      expect(db.plugins[0].installed_at).toBe(installedAtBefore)

      // Old version's asset dir was deleted; new version's is on disk.
      await expect(readFile(
        join(uploadsDir, 'plugins/acme.upgrade/1.1.0/server/index.js'),
        'utf-8',
      )).resolves.toContain('migrate')
      const { existsSync } = await import('node:fs')
      expect(existsSync(join(uploadsDir, 'plugins/acme.upgrade/1.0.0'))).toBe(false)
    } finally {
      await rm(uploadsDir, { recursive: true, force: true })
    }
  })

  it('rolls back to the prior version when the new version\'s activate hook throws', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'page-builder-rollback-'))
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const baseManifest = (version: string) => ({
      id: 'acme.rollback',
      name: 'Rollback Demo',
      version,
      apiVersion: 1,
      permissions: ['cms.routes'],
      entrypoints: { server: 'server/index.js' },
      resources: [],
      adminPages: [],
    })

    try {
      const v1 = `export function activate() {}`
      // v2 throws on activate to force rollback.
      const v2 = `export function activate() { throw new Error('v2 activate exploded') }`

      const v1FormData = new FormData()
      v1FormData.set('file', pluginZip({
        'plugin.json': JSON.stringify(baseManifest('1.0.0')),
        'server/index.js': v1,
      }))
      v1FormData.set('grantedPermissions', JSON.stringify(['cms.routes']))
      const installV1 = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', v1FormData, { cookie }),
        db,
        { uploadsDir },
      )
      expect(installV1.status).toBe(201)

      const v2FormData = new FormData()
      v2FormData.set('file', pluginZip({
        'plugin.json': JSON.stringify(baseManifest('1.1.0')),
        'server/index.js': v2,
      }))
      v2FormData.set('grantedPermissions', JSON.stringify(['cms.routes']))
      const upgrade = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', v2FormData, { cookie }),
        db,
        { uploadsDir },
      )
      expect(upgrade.status).toBe(400)
      const body = await upgrade.json() as { error: string; plugins: { id: string; version: string; lifecycleStatus: string }[] }
      expect(body.error).toMatch(/Upgrade failed/)
      expect(body.error).toMatch(/Rolled back to version 1\.0\.0/)

      // DB row reflects the prior version.
      expect(db.plugins[0].version).toBe('1.0.0')

      // Old version's asset dir is still on disk; new version's was deleted.
      const { existsSync } = await import('node:fs')
      expect(existsSync(join(uploadsDir, 'plugins/acme.rollback/1.0.0'))).toBe(true)
      expect(existsSync(join(uploadsDir, 'plugins/acme.rollback/1.1.0'))).toBe(false)
    } finally {
      await rm(uploadsDir, { recursive: true, force: true })
    }
  })

  it('refuses to downgrade to an older version', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'page-builder-downgrade-'))
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const baseManifest = (version: string) => ({
      id: 'acme.downgrade',
      name: 'Downgrade Demo',
      version,
      apiVersion: 1,
      permissions: ['cms.routes'],
      entrypoints: { server: 'server/index.js' },
      resources: [],
      adminPages: [],
    })

    try {
      const v2FormData = new FormData()
      v2FormData.set('file', pluginZip({
        'plugin.json': JSON.stringify(baseManifest('2.0.0')),
        'server/index.js': 'export function activate() {}',
      }))
      v2FormData.set('grantedPermissions', JSON.stringify(['cms.routes']))
      const installV2 = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', v2FormData, { cookie }),
        db,
        { uploadsDir },
      )
      expect(installV2.status).toBe(201)

      const v1FormData = new FormData()
      v1FormData.set('file', pluginZip({
        'plugin.json': JSON.stringify(baseManifest('1.0.0')),
        'server/index.js': 'export function activate() {}',
      }))
      v1FormData.set('grantedPermissions', JSON.stringify(['cms.routes']))
      const downgrade = await handleCmsRequest(
        cmsFormRequest('http://localhost/admin/api/cms/plugins/package', v1FormData, { cookie }),
        db,
        { uploadsDir },
      )
      expect(downgrade.status).toBe(400)
      const body = await downgrade.json() as { error: string }
      expect(body.error).toMatch(/refusing to downgrade/)
      // DB row unchanged.
      expect(db.plugins[0].version).toBe('2.0.0')
    } finally {
      await rm(uploadsDir, { recursive: true, force: true })
    }
  })

  it('rejects manifests targeting an unsupported apiVersion at the boundary', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)

    const futureManifest = {
      ...mapManifest,
      id: 'acme.future',
      apiVersion: 99,
    }
    const res = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/plugins', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          manifest: futureManifest,
          grantedPermissions: ['admin.navigation'],
        }),
      }),
      db,
    )
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/apiVersion 99/)
    expect(db.plugins).toHaveLength(0)
  })
})
