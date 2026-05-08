import type { TSchema, Static } from '@sinclair/typebox'
import {
  createCmsPluginResourceRecord,
  deleteCmsPluginResourceRecord,
  listCmsPluginResourceRecords,
  updateCmsPluginResourceRecord,
} from '@core/persistence/cmsPluginRecords'
import { parseJsonResponse } from '@core/utils/jsonValidate'
import type {
  PluginAdminAppApi,
  PluginAdminAppRenderFn,
  PluginAdminPageRoute,
} from '@core/plugin-sdk'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Loaded plugin admin app module shape — `mod.default` is the
 * SDK render function from `definePluginAdminApp`. There is no other
 * supported shape.
 */
export type LoadedAdminAppModule = { default: PluginAdminAppRenderFn }

export type PluginAdminAppImport = (url: string) => Promise<LoadedAdminAppModule>

const defaultImportModule: PluginAdminAppImport = async (url) =>
  await import(/* @vite-ignore */ url) as LoadedAdminAppModule

export function pluginAdminAssetUrl(assetPath: string, entrypoint: string): string {
  return `${assetPath.replace(/\/+$/g, '')}/${entrypoint.replace(/^\/+/g, '')}`
}

function runtimePath(pluginId: string, path: string): string {
  const normalized = path.trim().replace(/^\/+/g, '')
  return `/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/runtime/${normalized}`
}

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init)

export interface CreateAdminPluginApiOptions {
  /** Snapshot of the plugin's current settings; omitted = empty record. */
  settingsSnapshot?: Record<string, string | number | boolean>
  fetchImpl?: FetchLike
}

export function createAdminPluginApi(
  pluginId: string,
  options: CreateAdminPluginApiOptions = {},
): PluginAdminAppApi {
  const fetchImpl = options.fetchImpl ?? defaultFetch
  // Local mutable snapshot — `update()` mutates this so subsequent reads
  // see the new values without a round-trip through the host.
  const settingsSnapshot: Record<string, string | number | boolean> = {
    ...(options.settingsSnapshot ?? {}),
  }
  return {
    cms: {
      routes: {
        fetch(path, init) {
          return fetchImpl(runtimePath(pluginId, path), {
            credentials: 'include',
            ...init,
          })
        },
        async json<T extends TSchema>(path: string, schema: T, init?: RequestInit): Promise<Static<T>> {
          const res = await fetchImpl(runtimePath(pluginId, path), {
            credentials: 'include',
            ...init,
          })
          if (!res.ok) throw new Error(`Plugin route failed with ${res.status}`)
          return await parseJsonResponse(res, schema)
        },
      },
      storage: {
        collection(resourceId) {
          return {
            list: () => listCmsPluginResourceRecords(pluginId, resourceId, fetchImpl),
            create: (data) => createCmsPluginResourceRecord(pluginId, resourceId, data, fetchImpl),
            update: (recordId, data) => updateCmsPluginResourceRecord(pluginId, resourceId, recordId, data, fetchImpl),
            delete: (recordId) => deleteCmsPluginResourceRecord(pluginId, resourceId, recordId, fetchImpl),
          }
        },
      },
      settings: {
        get<T extends string | number | boolean = string>(key: string): T | undefined {
          return settingsSnapshot[key] as T | undefined
        },
        getAll() {
          return { ...settingsSnapshot }
        },
        async update(next) {
          const res = await fetchImpl(`/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/settings`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(next),
          })
          if (!res.ok) {
            throw new Error(await res.text() || `Plugin settings update failed with ${res.status}`)
          }
          const body = await res.json() as { settings: Record<string, string | number | boolean> }
          // Replace the local snapshot with the host's authoritative response
          // so subsequent `get()` calls see the same values the server stored.
          for (const key of Object.keys(settingsSnapshot)) delete settingsSnapshot[key]
          Object.assign(settingsSnapshot, body.settings)
          return body.settings
        },
      },
    },
  }
}

/**
 * Resolve a plugin admin page's entrypoint module via dynamic `import()`.
 * Throws if the module doesn't default-export a `definePluginAdminApp`
 * render function.
 */
export async function loadPluginAdminAppModule(
  page: PluginAdminPageRoute,
  importModule: PluginAdminAppImport = defaultImportModule,
): Promise<{ render: PluginAdminAppRenderFn }> {
  if (page.content.kind !== 'app') {
    throw new Error('Plugin admin app loader requires app page content')
  }
  if (!page.content.assetPath) {
    throw new Error(`Plugin admin app "${page.pluginId}:${page.id}" is missing an asset path`)
  }
  const mod = await importModule(pluginAdminAssetUrl(page.content.assetPath, page.content.entry))
  const render = (mod as { default?: unknown }).default
  if (typeof render !== 'function') {
    throw new Error(
      `Plugin admin app "${page.pluginId}:${page.id}" must default-export a definePluginAdminApp() render function.`,
    )
  }
  return { render: render as PluginAdminAppRenderFn }
}
