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

export function createAdminPluginApi(
  pluginId: string,
  fetchImpl: FetchLike = defaultFetch,
): PluginAdminAppApi {
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
