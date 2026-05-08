/**
 * Editor-side factory that produces the React canvas-preview component for
 * a `PluginModuleDefinition`. Lives under `src/admin/pages/site/canvas/`
 * because the factory wires plugin modules into canvas rendering, and
 * `src/core/` is banned from importing runtime React.
 *
 * The component renders the plugin's `preview()` (falling back to `render()`)
 * HTML inside a wrapper div via `dangerouslySetInnerHTML`. Children (already
 * rendered React subtrees) are rendered as a sibling node, so plugins that
 * opt into `canHaveChildren` still see the host-rendered nested modules.
 *
 * This file deliberately exports only the factory function (a regular
 * function, not a React component) so React Fast Refresh stays happy. Each
 * call returns a fresh anonymous component class — those don't enter
 * Fast Refresh boundaries because they're not module-level exports.
 */
import type {
  ModuleComponentProps,
} from '@core/module-engine/types'
import type {
  PluginModuleDefinition,
} from '@core/plugin-sdk'
import type { PluginModuleComponentFactory } from '@core/plugins/moduleAdapter'

export const editorPluginModuleComponentFactory: PluginModuleComponentFactory = (definition: PluginModuleDefinition) => {
  const renderForEditor = definition.preview ?? definition.render
  const canHaveChildren = Boolean(definition.canHaveChildren)
  return function PluginCanvasModule(props: ModuleComponentProps) {
    const childList: string[] = []
    // Defensive wrap — a throwing plugin preview()/render() is caught by the
    // per-node ErrorBoundary above us, but that boundary swaps the entire
    // module subtree for an alert section, which can shift layout and noise
    // up adjacent siblings. Catching here lets us keep the wrapper div in
    // place and emit an inline placeholder, so a single bad module remains
    // visually contained to its own slot.
    let html: string
    try {
      html = renderForEditor(props.props, childList).html
    } catch (err) {
      console.error(`[plugin-module:${definition.id}] preview/render() threw:`, err)
      html = `<!-- pb: plugin module "${definition.id}" render failed -->`
    }
    if (canHaveChildren) {
      // dangerouslySetInnerHTML and children are mutually exclusive in React.
      // Plugins with `canHaveChildren: true` need both: rendered HTML + a
      // slot for nested React subtrees. Render the static HTML in one
      // sibling div, mount children in another, outside the dangerous boundary.
      return (
        <div className={props.mcClassName} data-plugin-canvas-module="true">
          <div dangerouslySetInnerHTML={{ __html: html }} />
          <div data-plugin-children="true">{props.children}</div>
        </div>
      )
    }
    return (
      <div
        className={props.mcClassName}
        data-plugin-canvas-module="true"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
}
