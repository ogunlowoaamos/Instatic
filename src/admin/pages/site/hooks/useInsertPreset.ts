import { selectActiveCanvasPage, useEditorStore } from '@site/store/store'
import { resolveInsertLocation, type InsertLocation } from '@site/store/insertLocation'
import type { InsertionPreset, InsertionPresetNode } from '@site/module-picker'
import type { Page } from '@core/page-tree'
import { normalizeIdentifierValue } from '@core/utils/identifier'

export function useInsertPreset() {
  const canvasPage = useEditorStore(selectActiveCanvasPage)
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId)
  const insertNode = useEditorStore((s) => s.insertNode)
  const updateNodeProps = useEditorStore((s) => s.updateNodeProps)
  const selectNode = useEditorStore((s) => s.selectNode)

  return (preset: InsertionPreset, explicitTarget?: string | InsertLocation) => {
    if (!canvasPage) return null

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

    const rootId = insertPresetNode(insertNode, preset.root, location.parentId, location.index)
    if (preset.kind === 'form') {
      updateNodeProps(rootId, { formId: uniqueFormId(canvasPage, preset.id) })
    }
    selectNode(rootId)
    return rootId
  }
}

function uniqueFormId(page: Page, baseId: string): string {
  const base = normalizeIdentifierValue(baseId, 'form')
  const used = new Set(
    Object.values(page.nodes)
      .filter((node) => node.moduleId === 'base.form')
      .map((node) => normalizeIdentifierValue(String(node.props.formId ?? '')))
      .filter(Boolean),
  )
  if (!used.has(base)) return base

  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`
    if (!used.has(candidate)) return candidate
  }
}

function insertPresetNode(
  insertNode: (moduleId: string, defaults: Record<string, unknown>, parentId: string, index?: number) => string,
  presetNode: InsertionPresetNode,
  parentId: string,
  index?: number,
): string {
  const nodeId = insertNode(presetNode.moduleId, presetNode.defaults ?? {}, parentId, index)
  for (const child of presetNode.children ?? []) {
    insertPresetNode(insertNode, child, nodeId)
  }
  return nodeId
}
