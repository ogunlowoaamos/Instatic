import { useEditorStore } from '@site/store/store'
import {
  createCmsPluginResourceRecord,
  deleteCmsPluginResourceRecord,
  listCmsPluginResourceRecords,
  updateCmsPluginResourceRecord,
} from '@core/persistence/cmsPluginRecords'
import type {
  EditorPluginApi,
  EditorPluginModule,
  PluginCanvasOverlay,
  PluginCommand,
  PluginCommandResult,
  PluginEditorPanel,
  PluginManifest,
  PluginToolbarButton,
  RegisteredPluginCanvasOverlay,
  RegisteredPluginEditorPanel,
  RegisteredPluginToolbarButton,
} from '@core/plugin-sdk'
import { assertPluginPermission } from '@core/plugin-sdk'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type RuntimeListener = () => void

/**
 * Internal panel record — keeps the live manifest alongside the panel so
 * the host's `PluginEditorPanelMount` can build an api with the right
 * permission grants without a fresh round-trip to the plugins endpoint.
 */
interface PanelRecord {
  panel: RegisteredPluginEditorPanel
  manifest: PluginManifest
}

class PluginRuntime {
  private commands = new Map<string, PluginCommand & { pluginId: string }>()
  private toolbarButtons = new Map<string, RegisteredPluginToolbarButton>()
  private panels = new Map<string, PanelRecord>()
  private canvasOverlays = new Map<string, RegisteredPluginCanvasOverlay>()
  private pluginSettings = new Map<string, Record<string, string | number | boolean>>()
  private listeners = new Set<RuntimeListener>()

  /**
   * Cached snapshots — `useSyncExternalStore` requires `getSnapshot()` to
   * return a referentially stable value when nothing has changed, otherwise
   * React tears the subscriber on every render and triggers an infinite
   * loop. We invalidate (set to null) on every mutation and rebuild lazily
   * the next time a getter is called.
   */
  private toolbarButtonsSnapshot: RegisteredPluginToolbarButton[] | null = null
  private panelsSnapshot: RegisteredPluginEditorPanel[] | null = null
  private canvasOverlaysSnapshot: RegisteredPluginCanvasOverlay[] | null = null

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  reset(): void {
    this.commands.clear()
    this.toolbarButtons.clear()
    this.panels.clear()
    this.canvasOverlays.clear()
    this.pluginSettings.clear()
    this.toolbarButtonsSnapshot = null
    this.panelsSnapshot = null
    this.canvasOverlaysSnapshot = null
    this.emit()
  }

  /**
   * Cache the live settings snapshot for a plugin so panel api factories
   * can hand it to the plugin's render code without a per-mount round-trip.
   * Refreshed by `activateInstalledEditorPlugins` on every editor reload
   * and by the Plugins admin page after a settings PUT.
   */
  setPluginSettings(pluginId: string, settings: Record<string, string | number | boolean>): void {
    this.pluginSettings.set(pluginId, { ...settings })
  }

  getPluginSettings(pluginId: string): Record<string, string | number | boolean> {
    return { ...(this.pluginSettings.get(pluginId) ?? {}) }
  }

  registerCommand(pluginId: string, command: PluginCommand): void {
    this.commands.set(command.id, { ...command, pluginId })
    this.emit()
  }

  registerToolbarButton(pluginId: string, button: PluginToolbarButton): void {
    this.toolbarButtons.set(button.id, { ...button, pluginId })
    this.toolbarButtonsSnapshot = null
    this.emit()
  }

  /**
   * Register an editor panel on behalf of a plugin. Caller MUST have already
   * asserted the `editor.panels` permission. The panel id must be
   * namespace-locked under the plugin id (`<pluginId>.<rest>`).
   *
   * The manifest is captured alongside the panel so the host can build a
   * permission-aware api when mounting the panel later, without a fresh
   * round-trip to the plugins endpoint.
   */
  registerPanel(manifest: PluginManifest, panel: PluginEditorPanel): void {
    if (!panel.id.startsWith(`${manifest.id}.`)) {
      throw new Error(
        `Plugin "${manifest.id}" cannot register panel "${panel.id}" — id must start with "${manifest.id}.".`,
      )
    }
    this.panels.set(panel.id, {
      panel: { ...panel, pluginId: manifest.id },
      manifest,
    })
    this.panelsSnapshot = null
    this.emit()
  }

  /**
   * Register a canvas overlay on behalf of a plugin. Caller MUST have
   * already asserted the `editor.canvas` permission. The overlay id must
   * be namespace-locked under the plugin id (`<pluginId>.<rest>`).
   */
  registerCanvasOverlay(pluginId: string, overlay: PluginCanvasOverlay): void {
    if (!overlay.id.startsWith(`${pluginId}.`)) {
      throw new Error(
        `Plugin "${pluginId}" cannot register canvas overlay "${overlay.id}" — id must start with "${pluginId}.".`,
      )
    }
    this.canvasOverlays.set(overlay.id, { ...overlay, pluginId })
    this.canvasOverlaysSnapshot = null
    this.emit()
  }

  /**
   * Returns the cached toolbar-button array. Stable reference across calls
   * until a `register*` / `reset()` mutation invalidates the cache. Required
   * for `useSyncExternalStore` consumers (PanelRail, Toolbar).
   */
  getToolbarButtons(): RegisteredPluginToolbarButton[] {
    if (this.toolbarButtonsSnapshot === null) {
      this.toolbarButtonsSnapshot = [...this.toolbarButtons.values()]
    }
    return this.toolbarButtonsSnapshot
  }

  /**
   * Returns the cached panels array. Stable reference across calls until a
   * `registerPanel` / `reset()` mutation invalidates the cache. PanelRail
   * subscribes via `useSyncExternalStore` — a fresh array on every getter
   * call would tear the subscriber and trigger an infinite re-render loop.
   */
  getPanels(): RegisteredPluginEditorPanel[] {
    if (this.panelsSnapshot === null) {
      this.panelsSnapshot = [...this.panels.values()].map((record) => record.panel)
    }
    return this.panelsSnapshot
  }

  getPanel(panelId: string): RegisteredPluginEditorPanel | undefined {
    return this.panels.get(panelId)?.panel
  }

  /**
   * Resolve the manifest a panel was registered with — used by
   * `PluginEditorPanelMount` to build a permission-checked api at render
   * time. Returns `undefined` for unknown panel ids.
   */
  getPanelManifest(panelId: string): PluginManifest | undefined {
    return this.panels.get(panelId)?.manifest
  }

  /**
   * Returns the cached canvas overlays array. Stable reference until a
   * mutation invalidates the cache — same `useSyncExternalStore` shape as
   * `getPanels()` / `getToolbarButtons()`.
   */
  getCanvasOverlays(): RegisteredPluginCanvasOverlay[] {
    if (this.canvasOverlaysSnapshot === null) {
      this.canvasOverlaysSnapshot = [...this.canvasOverlays.values()]
    }
    return this.canvasOverlaysSnapshot
  }

  async runCommand(commandId: string): Promise<PluginCommandResult> {
    const command = this.commands.get(commandId)
    if (!command) throw new Error(`Plugin command "${commandId}" is not registered`)
    return await command.run()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export const pluginRuntime = new PluginRuntime()

function createEditorPluginApi(
  manifest: PluginManifest,
  fetchImpl: FetchLike,
): EditorPluginApi {
  return {
    editor: {
      commands: {
        register(command) {
          assertPluginPermission(manifest, 'editor.commands')
          pluginRuntime.registerCommand(manifest.id, command)
        },
      },
      toolbar: {
        addButton(button) {
          assertPluginPermission(manifest, 'editor.toolbar')
          pluginRuntime.registerToolbarButton(manifest.id, button)
        },
      },
      panels: {
        register(panel) {
          assertPluginPermission(manifest, 'editor.panels')
          pluginRuntime.registerPanel(manifest, panel)
        },
      },
      canvas: {
        registerOverlay(overlay) {
          assertPluginPermission(manifest, 'editor.canvas')
          pluginRuntime.registerCanvasOverlay(manifest.id, overlay)
        },
      },
      store: {
        read() {
          assertPluginPermission(manifest, 'editor.store.read')
          return useEditorStore.getState()
        },
        transaction(mutate) {
          assertPluginPermission(manifest, 'editor.store.write')
          useEditorStore.setState((state) => {
            mutate(state)
          })
        },
      },
    },
    cms: {
      storage: {
        collection(resourceId) {
          assertPluginPermission(manifest, 'cms.storage')
          return {
            list: () => listCmsPluginResourceRecords(manifest.id, resourceId, fetchImpl),
            create: (data) => createCmsPluginResourceRecord(manifest.id, resourceId, data, fetchImpl),
            update: (recordId, data) => updateCmsPluginResourceRecord(manifest.id, resourceId, recordId, data, fetchImpl),
            delete: (recordId) => deleteCmsPluginResourceRecord(manifest.id, resourceId, recordId, fetchImpl),
          }
        },
      },
    },
  }
}

export async function activateEditorPlugin(
  manifest: PluginManifest,
  mod: EditorPluginModule,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): Promise<void> {
  await mod.activate(createEditorPluginApi(manifest, fetchImpl))
}
