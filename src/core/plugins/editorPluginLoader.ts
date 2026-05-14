import { listCmsPlugins } from '@core/persistence/cmsPlugins'
import type {
  EditorPluginModule,
  PluginManifest,
  PluginModulesEntrypointModule,
} from '@core/plugin-sdk'
import { activateEditorPlugin, pluginRuntime } from './runtime'
import {
  activatePluginModulePack,
  resetPluginModulePacks,
} from './modulePackLoader'
import type { PluginModuleComponentFactory } from './moduleAdapter'
import { pluginCacheKey, withPluginCacheBuster } from './cacheBuster'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type ImportEditorModule = (url: string, cacheKey?: string) => Promise<EditorPluginModule>
type ImportModulePack = (url: string, cacheKey?: string) => Promise<PluginModulesEntrypointModule>

export interface InstalledEditorPluginActivationFailure {
  pluginId: string
  error: unknown
}

export interface InstalledEditorPluginActivationResult {
  activated: string[]
  failed: InstalledEditorPluginActivationFailure[]
  /** Plugins that registered canvas modules (for diagnostics in the editor). */
  modulePacksLoaded: string[]
}

interface ActivateInstalledEditorPluginsOptions {
  fetchImpl?: FetchLike
  importEditorModule?: ImportEditorModule
  importModulePack?: ImportModulePack
  /**
   * Factory used by the canvas registry to build the React preview
   * component for plugin-provided modules. Required at the editor entry
   * point because `src/core/` cannot import runtime React. Tests and the
   * server rely on a stub factory.
   */
  componentFactory?: PluginModuleComponentFactory
}

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init)

const defaultImportEditorModule: ImportEditorModule = async (url, cacheKey) =>
  await import(/* @vite-ignore */ withPluginCacheBuster(url, cacheKey ?? '')) as EditorPluginModule

const defaultImportModulePack: ImportModulePack = async (url, cacheKey) =>
  await import(/* @vite-ignore */ withPluginCacheBuster(url, cacheKey ?? '')) as PluginModulesEntrypointModule

function joinAssetPath(assetBasePath: string, entrypoint: string): string {
  return `${assetBasePath.replace(/\/+$/g, '')}/${entrypoint.replace(/^\/+/g, '')}`
}

function manifestWithGrants(
  manifest: PluginManifest,
  grantedPermissions: PluginManifest['grantedPermissions'],
): PluginManifest {
  return { ...manifest, grantedPermissions }
}

export async function activateInstalledEditorPlugins(
  options: ActivateInstalledEditorPluginsOptions = {},
): Promise<InstalledEditorPluginActivationResult> {
  const fetchImpl = options.fetchImpl ?? defaultFetch
  const importEditorModule = options.importEditorModule ?? defaultImportEditorModule
  const importModulePack = options.importModulePack ?? defaultImportModulePack

  const result: InstalledEditorPluginActivationResult = {
    activated: [],
    failed: [],
    modulePacksLoaded: [],
  }

  pluginRuntime.reset()
  resetPluginModulePacks()

  const payload = await listCmsPlugins(fetchImpl)
  for (const plugin of payload.plugins) {
    const manifest = manifestWithGrants(plugin.manifest, plugin.grantedPermissions)
    // Cache the live settings snapshot so editor panels can read settings
    // synchronously inside their render(). Done unconditionally — even for
    // plugins without an editor entrypoint, since the snapshot might be
    // consulted by another plugin's panel via cross-plugin runCommand etc.
    pluginRuntime.setPluginSettings(plugin.id, plugin.settings)
    if (!plugin.enabled || plugin.lifecycleStatus === 'error' || !manifest.assetBasePath) {
      continue
    }

    let editorActivated = false
    // Cache key for this plugin's bundle URLs. In production it's
    // stable per install (version + updatedAt) so the browser caches
    // the plugin bundle across editor visits. In dev mode, the helper
    // overrides with a timestamp so `pb-plugin dev` rebuilds reload
    // immediately. See `cacheBuster.ts`.
    const cacheKey = pluginCacheKey(plugin)

    // Module pack — load first so plugins that ship both an editor entry
    // AND modules can rely on their modules being registered when the
    // editor entry's `activate()` runs.
    if (manifest.entrypoints?.modules && plugin.grantedPermissions.includes('modules.register')) {
      try {
        const mod = await importModulePack(
          joinAssetPath(manifest.assetBasePath, manifest.entrypoints.modules),
          cacheKey,
        )
        activatePluginModulePack(manifest, mod, options.componentFactory)
        result.modulePacksLoaded.push(plugin.id)
      } catch (error) {
        result.failed.push({ pluginId: plugin.id, error })
      }
    }

    // Editor entrypoint — toolbar, commands, store transactions, etc.
    if (manifest.entrypoints?.editor) {
      try {
        const mod = await importEditorModule(
          joinAssetPath(manifest.assetBasePath, manifest.entrypoints.editor),
          cacheKey,
        )
        await activateEditorPlugin(manifest, mod, fetchImpl)
        editorActivated = true
      } catch (error) {
        result.failed.push({ pluginId: plugin.id, error })
      }
    }

    if (editorActivated || result.modulePacksLoaded.includes(plugin.id)) {
      result.activated.push(plugin.id)
    }
  }

  return result
}
