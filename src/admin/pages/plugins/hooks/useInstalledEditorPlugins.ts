import { useEffect } from 'react'
import { activateInstalledEditorPlugins } from '@core/plugins/editorPluginLoader'
import { editorPluginModuleComponentFactory } from '@site/canvas/pluginModuleComponentFactory'
import { CMS_PLUGINS_CHANGED_EVENT } from '@plugins/utils/pluginEvents'
import { setEditorActivationFailures } from './editorPluginActivationErrors'

export function useInstalledEditorPlugins(): void {
  useEffect(() => {
    let cancelled = false

    async function activatePlugins() {
      const result = await activateInstalledEditorPlugins({
        componentFactory: editorPluginModuleComponentFactory,
      })
      if (cancelled) return
      // Fan failures out to the activation-errors store so the Plugins admin
      // page can render them inline next to server-side `lastError`. The
      // store is replaced wholesale on every pass — successful re-activation
      // clears stale entries automatically.
      setEditorActivationFailures(result.failed)
      if (result.failed.length > 0) {
        console.error('Some editor plugins failed to activate', result.failed)
      }
    }

    function refreshPlugins() {
      void activatePlugins().catch(() => {
        // The editor remains usable when plugin metadata cannot be loaded.
      })
    }

    refreshPlugins()
    window.addEventListener(CMS_PLUGINS_CHANGED_EVENT, refreshPlugins)

    return () => {
      cancelled = true
      window.removeEventListener(CMS_PLUGINS_CHANGED_EVENT, refreshPlugins)
    }
  }, [])
}
