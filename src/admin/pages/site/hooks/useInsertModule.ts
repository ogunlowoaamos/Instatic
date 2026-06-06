import { selectActiveCanvasPage, useEditorStore } from '@site/store/store'
import { resolveInsertLocation, type InsertLocation } from '@site/store/insertLocation'
import { getMissingModuleDependencies } from '@core/module-engine'
import type { AnyModuleDefinition } from '@core/module-engine'
import type { Page } from '@core/page-tree'
import { pushToast } from '@ui/components/Toast'

/** Whether a document tree already contains a `base.outlet` node. */
function hasOutletNode(page: Page): boolean {
  for (const id in page.nodes) {
    if (page.nodes[id].moduleId === 'base.outlet') return true
  }
  return false
}

/**
 * Insert a module into the active canvas document (page or Visual Component).
 *
 * Parent + insertion-index resolution is delegated to `resolveInsertLocation`,
 * which is shared by every UI flow that inserts relative to a clicked target
 * (toolbar picker, canvas right-click, DOM-panel right-click, clipboard paste).
 * Targets that accept children receive the new node as a last child; leaf
 * targets (Text, Button, Image, etc.) get a sibling-after insertion under
 * their parent so right-click "Insert module here" is never a silent no-op.
 *
 * Without an explicit `parentId`, the selected node is used as the target;
 * with no selection, the new node lands at the canvas root.
 *
 * Uses `selectActiveCanvasPage` so resolution works in BOTH page mode and
 * VC-canvas mode — the slice's `insertNode` action then routes to the correct
 * tree (page vs. VC) based on `activeDocument.kind`.
 */
export function useInsertModule() {
  const canvasPage = useEditorStore(selectActiveCanvasPage)
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId)
  const insertNode = useEditorStore((s) => s.insertNode)
  const selectNode = useEditorStore((s) => s.selectNode)
  const packageJson = useEditorStore((s) => s.packageJson)
  const setDependency = useEditorStore((s) => s.setDependency)

  return (mod: AnyModuleDefinition, explicitTarget?: string | InsertLocation) => {
    if (!canvasPage) return null

    // A document hosts matched content in a SINGLE `base.outlet`: the template
    // composer and the canvas fill only the first outlet, so a second one would
    // render as a dead, empty "Content outlet" placeholder. Block it with a
    // clear message instead of letting the author create a confusing duplicate.
    if (mod.id === 'base.outlet' && hasOutletNode(canvasPage)) {
      pushToast({
        kind: 'warning',
        title: 'Only one content outlet',
        body: 'This template already has a content outlet — matched content can flow into just one.',
        location: 'module-inserter',
      })
      return null
    }

    const location =
      typeof explicitTarget === 'object'
        ? explicitTarget
        : resolveInsertLocation(
            canvasPage,
            (explicitTarget && canvasPage.nodes[explicitTarget] ? explicitTarget : null) ??
              selectedNodeId ??
              canvasPage.rootNodeId,
          )
    if (!location) return null

    for (const dependency of getMissingModuleDependencies(mod, packageJson)) {
      setDependency(dependency.name, dependency.version, dependency.dev)
    }

    const nodeId = insertNode(mod.id, mod.defaults, location.parentId, location.index)
    selectNode(nodeId)
    return nodeId
  }
}
