import type { EditorStore } from '@site/store/types'

export const PLUGIN_API_VERSION = 1
export type PluginApiVersion = typeof PLUGIN_API_VERSION

export const PLUGIN_PERMISSION_VALUES = [
  // Admin / nav
  'admin.navigation',
  // Storage
  'cms.storage',
  // Server runtime
  'cms.routes',
  'cms.hooks',
  // Editor surfaces
  'editor.toolbar',
  'editor.commands',
  'editor.canvas',
  'editor.panels',
  'editor.store.read',
  'editor.store.write',
  // Builder extensions
  'modules.register',
  'loops.register',
  'visualComponents.register',
  // Frontend / published pages
  'frontend.scripts',
  'frontend.tracker',
  // Reserved
  'unstable.internals',
] as const

export type PluginPermission = typeof PLUGIN_PERMISSION_VALUES[number]

export type ServerPluginLifecycleHook = 'install' | 'activate' | 'deactivate' | 'uninstall'

export const SERVER_PLUGIN_LIFECYCLE_HOOKS: ServerPluginLifecycleHook[] = [
  'install',
  'activate',
  'deactivate',
  'uninstall',
]

export interface PluginPin {
  label: string
  detail?: string
  x: number
  y: number
}

export interface PluginEntrypoints {
  server?: string
  editor?: string
  admin?: string
  /** Module pack — default-exports an array of PluginModuleDefinition. */
  modules?: string
  /** Bundle injected on every published page (frontend.scripts permission). */
  frontend?: string
}

export type PluginResourceFieldType = 'text' | 'longtext' | 'number' | 'date' | 'boolean'

export interface PluginResourceField {
  id: string
  label: string
  type: PluginResourceFieldType
  required?: boolean
}

export interface PluginResource {
  id: string
  title: string
  singularLabel?: string
  pluralLabel?: string
  fields: PluginResourceField[]
}

export interface PluginRecord {
  id: string
  pluginId: string
  resourceId: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type PluginLifecycleStatus = 'installed' | 'active' | 'disabled' | 'error'

export type PluginPageContent =
  | {
    kind: 'markdown'
    heading?: string
    body: string
  }
  | {
    kind: 'map'
    heading: string
    body?: string
    centerLabel?: string
    pins: PluginPin[]
  }
  | {
    kind: 'resource'
    heading: string
    resource: string
  }
  | {
    kind: 'app'
    heading: string
    entry: string
    assetPath?: string
  }

export interface PluginAdminPage {
  id: string
  title: string
  navLabel?: string
  icon?: string
  /**
   * Optional admin route override. The host derives the final route from
   * the plugin id + page id at install time (`/admin/plugins/:pluginId/:pageId`),
   * so plugin authors never need to set it. Kept on the type for forward
   * compatibility (e.g. nested plugin pages).
   */
  route?: string
  content: PluginPageContent
}

export interface PluginPackManifest {
  /**
   * Path inside the package zip (relative to plugin.json) of a JSON file
   * with the shape `{ visualComponents?: VisualComponent[]; pages?: Page[];
   * classes?: CSSClass[]; }`. The host imports these into the active site
   * on plugin activation.
   */
  path: string
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  apiVersion: PluginApiVersion
  description?: string
  permissions: PluginPermission[]
  grantedPermissions?: PluginPermission[]
  entrypoints?: PluginEntrypoints
  assetBasePath?: string
  resources: PluginResource[]
  adminPages: PluginAdminPage[]
  /** Optional Visual Component / template / class pack. */
  pack?: PluginPackManifest
}

export interface InstalledPlugin {
  id: string
  name: string
  version: string
  enabled: boolean
  lifecycleStatus: PluginLifecycleStatus
  lastError: string | null
  grantedPermissions: PluginPermission[]
  manifest: PluginManifest
  installedAt: string
  updatedAt: string
}

export interface PluginAdminPageRoute extends Omit<PluginAdminPage, 'route'> {
  pluginId: string
  pluginName: string
  /** Always populated by the host's manifest parser. */
  route: string
}

export interface CmsPluginsPayload {
  plugins: InstalledPlugin[]
  adminPages: PluginAdminPageRoute[]
}

export type PluginCommandResult = void | {
  message?: string
}

export interface PluginCommand {
  id: string
  label: string
  run: () => PluginCommandResult | Promise<PluginCommandResult>
}

export interface PluginToolbarButton {
  id: string
  label: string
  command: string
}

export interface RegisteredPluginToolbarButton extends PluginToolbarButton {
  pluginId: string
}

export interface EditorPluginApi {
  editor: {
    commands: {
      register: (command: PluginCommand) => void
    }
    toolbar: {
      addButton: (button: PluginToolbarButton) => void
    }
    store: {
      read: () => EditorStore
      transaction: (mutate: (store: EditorStore) => void) => void
    }
  }
  cms: {
    storage: {
      collection: (resourceId: string) => {
        list: () => Promise<PluginRecord[]>
        create: (data: Record<string, unknown>) => Promise<PluginRecord>
        update: (recordId: string, data: Record<string, unknown>) => Promise<PluginRecord>
        delete: (recordId: string) => Promise<void>
      }
    }
  }
}

export interface EditorPluginModule {
  activate: (api: EditorPluginApi) => void | Promise<void>
}

export interface PluginAdminAppApi {
  cms: {
    routes: {
      fetch: (path: string, init?: RequestInit) => Promise<Response>
      /**
       * Validated JSON helper. The TypeBox schema is required — that's the whole
       * point: deeply-typed responses without an unsafe `as T` cast at the
       * call site. Plugins that prefer raw access can use `fetch(path)` and
       * `.json()` directly.
       */
      json: <T extends import('@sinclair/typebox').TSchema>(
        path: string,
        schema: T,
        init?: RequestInit,
      ) => Promise<import('@sinclair/typebox').Static<T>>
    }
    storage: {
      collection: (resourceId: string) => {
        list: () => Promise<PluginRecord[]>
        create: (data: Record<string, unknown>) => Promise<PluginRecord>
        update: (recordId: string, data: Record<string, unknown>) => Promise<PluginRecord>
        delete: (recordId: string) => Promise<void>
      }
    }
  }
}

export type RouteMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface ServerPluginRouteContext {
  req: Request
  db: unknown
  body: Record<string, unknown>
  user: {
    id: string
    email: string
    capabilities: string[]
  } | null
}

export type ServerPluginRouteHandler = (
  context: ServerPluginRouteContext,
) => unknown | Promise<unknown>

// ---------------------------------------------------------------------------
// CMS server-side hook event surface
// ---------------------------------------------------------------------------

export interface CmsServerEvents {
  'publish.before': { siteId: string; pageId?: string }
  'publish.after': { siteId: string; pageId?: string }
  'content.entry.created': { collectionId: string; entryId: string }
  'content.entry.updated': { collectionId: string; entryId: string }
  'content.entry.deleted': { collectionId: string; entryId: string }
  'tracker.event': {
    pluginId: string
    eventName: string
    payload: Record<string, unknown>
    visitorId?: string
    sessionId?: string
    pagePath?: string
    referrer?: string
    receivedAt: string
  }
  // Plugin-defined events fall through.
  [key: string]: Record<string, unknown>
}

export interface CmsServerFilters {
  'publish.html': string
  'publish.headers': Record<string, string>
  // Plugin-defined filters fall through.
  [key: string]: unknown
}

export interface ServerPluginHooksApi {
  on: <K extends keyof CmsServerEvents | string>(
    event: K,
    listener: (
      payload: K extends keyof CmsServerEvents ? CmsServerEvents[K] : Record<string, unknown>,
    ) => void | Promise<void>,
  ) => void
  filter: <K extends keyof CmsServerFilters | string>(
    name: K,
    handler: (
      value: K extends keyof CmsServerFilters ? CmsServerFilters[K] : unknown,
      context: { pluginId: string },
    ) =>
      | (K extends keyof CmsServerFilters ? CmsServerFilters[K] : unknown)
      | Promise<K extends keyof CmsServerFilters ? CmsServerFilters[K] : unknown>,
  ) => void
  emit: <K extends keyof CmsServerEvents | string>(
    event: K,
    payload: K extends keyof CmsServerEvents ? CmsServerEvents[K] : Record<string, unknown>,
  ) => Promise<void>
}

// Forward-declared opaque type — full shape lives in `@core/loops/types`.
// We keep it opaque on the SDK boundary so plugin authors aren't pulled
// into the loops module dependency graph until they need it.
export type LoopEntitySource = {
  id: string
  label: string
  description?: string
  filterSchema: Record<string, unknown>
  orderByOptions: Array<{ id: string; label: string }>
  fields: Array<{ id: string; label: string; description?: string; format?: 'plain' | 'html' | 'url' | 'media' }>
  fetch: (ctx: unknown) => Promise<{ items: unknown[]; totalItems: number }>
  preview: (ctx: unknown) => unknown[]
}

export interface ServerPluginApi {
  plugin: {
    id: string
    version: string
    permissions: PluginPermission[]
    log: (...args: unknown[]) => void
  }
  cms: {
    routes: {
      get: (path: string, capability: string, handler: ServerPluginRouteHandler) => void
      post: (path: string, capability: string, handler: ServerPluginRouteHandler) => void
      patch: (path: string, capability: string, handler: ServerPluginRouteHandler) => void
      delete: (path: string, capability: string, handler: ServerPluginRouteHandler) => void
      getPublic: (path: string, handler: ServerPluginRouteHandler) => void
    }
    loops: {
      /**
       * Register a loop entity source. Source ID must be `<pluginId>.<name>`.
       * The host enforces the namespace lock at registration time.
       */
      registerSource: (source: LoopEntitySource) => void
    }
    storage: {
      collection: (resourceId: string) => {
        list: () => Promise<PluginRecord[]>
        create: (data: Record<string, unknown>) => Promise<PluginRecord>
        update: (recordId: string, data: Record<string, unknown>) => Promise<PluginRecord | null>
        delete: (recordId: string) => Promise<boolean>
      }
    }
    hooks: ServerPluginHooksApi
  }
}

export interface ServerPluginModule {
  install?: (api: ServerPluginApi) => void | Promise<void>
  activate?: (api: ServerPluginApi) => void | Promise<void>
  deactivate?: (api: ServerPluginApi) => void | Promise<void>
  uninstall?: (api: ServerPluginApi) => void | Promise<void>
}
