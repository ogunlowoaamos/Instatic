/**
 * ModulePickerDropdown — toolbar "+ Add" trigger that opens the shared
 * `ModulePickerMenu` (search + categorized module list).
 *
 * The trigger is a small primary button rendered inside the toolbar. Clicking
 * it opens the picker as a `ContextMenu` anchored to the button, auto-flipping
 * to stay on screen. Picking a module / Visual Component inserts it into the
 * active page using the toolbar's "smart parent" resolution (selectedNodeId
 * falls back to its parent or the page root) and closes the dropdown.
 *
 * Page / Component creation lives elsewhere (Site Explorer) — this dropdown is
 * exclusively about inserting nodes into the current page.
 *
 * Architecture gate (G1, G5): the Components-category click MUST route through
 * `insertComponentRef` so cycle detection and VC/page-mode dispatch are applied
 * uniformly. See `src/__tests__/architecture/component-system-placement.test.ts`.
 */

import { useCallback, useRef, useState } from 'react'
import { useEditorStore, selectActivePage } from '@site/store/store'
import { registry } from '@core/module-engine/registry'
import type { AnyModuleDefinition } from '@core/module-engine/types'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { Button } from '@ui/components/Button'
import { ModulePickerMenu } from '@site/module-picker'
import { useInsertModule } from '@site/hooks/useInsertModule'

interface ModulePickerDropdownProps {
  triggerClassName?: string
  triggerTestId?: string
}

export function ModulePickerDropdown({
  triggerClassName,
  triggerTestId = 'toolbar-add-module-btn',
}: ModulePickerDropdownProps = {}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeDocument = useEditorStore((s) => s.activeDocument)
  const visualComponents = useEditorStore((s) => s.site?.visualComponents)
  const insertComponentRef = useEditorStore((s) => s.insertComponentRef)
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId)
  const page = useEditorStore(selectActivePage)
  const insertModule = useInsertModule()

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  const handleInsertModule = useCallback(
    (mod: AnyModuleDefinition) => {
      if (insertModule(mod)) handleClose()
    },
    [insertModule, handleClose],
  )

  const handleInsertVC = useCallback(
    (vcId: string) => {
      if (activeDocument?.kind === 'visualComponent') {
        // VC edit mode: prefer the selected node as parent, else the VC root.
        const vc = visualComponents?.find((v) => v.id === activeDocument.vcId)
        if (!vc) {
          handleClose()
          return
        }
        const parentId = selectedNodeId ?? vc.tree.rootNodeId
        insertComponentRef(parentId, vcId)
      } else {
        // Page mode: mirror useInsertModule's parent resolution.
        if (!page) {
          handleClose()
          return
        }
        let parentId = page.rootNodeId
        if (selectedNodeId) {
          const selectedNode = page.nodes[selectedNodeId]
          if (selectedNode) {
            const def = registry.get(selectedNode.moduleId)
            if (def?.canHaveChildren) {
              parentId = selectedNodeId
            } else {
              const parentNode = Object.values(page.nodes).find((node) =>
                node.children.includes(selectedNodeId),
              )
              if (parentNode) parentId = parentNode.id
            }
          }
        }
        insertComponentRef(parentId, vcId)
      }
      handleClose()
    },
    [
      activeDocument,
      visualComponents,
      page,
      selectedNodeId,
      insertComponentRef,
      handleClose,
    ],
  )

  return (
    <>
      <Button
        ref={triggerRef}
        variant="primary"
        size="sm"
        iconOnly
        accentFill
        className={triggerClassName}
        aria-label="Add module"
        aria-haspopup="menu"
        aria-expanded={open}
        tooltip="Add module"
        onClick={handleOpen}
        data-testid={triggerTestId}
      >
        <PlusIcon size={13} />
      </Button>

      {open && (
        <ModulePickerMenu
          anchorRef={triggerRef}
          onClose={handleClose}
          onSelectModule={handleInsertModule}
          onSelectVC={handleInsertVC}
        />
      )}
    </>
  )
}
