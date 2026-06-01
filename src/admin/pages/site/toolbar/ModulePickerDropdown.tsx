/**
 * ModulePickerDropdown — toolbar "+ Add" trigger that opens the module
 * inserter command center.
 *
 * The trigger is a small primary button rendered inside the toolbar. Clicking
 * it opens a modal command surface with registry modules, seeded layout
 * presets, saved Visual Components, recents, and drag-to-canvas insertion.
 *
 * Page / Component creation lives elsewhere (Site Explorer) — this dropdown is
 * exclusively about inserting nodes into the current page.
 *
 * Architecture gate (G1, G5): the Components-category click MUST route through
 * `insertComponentRef` so cycle detection and VC/page-mode dispatch are applied
 * uniformly. See `src/__tests__/architecture/component-system-placement.test.ts`.
 */

import { useRef, useState } from 'react'
import { useEditorStore, selectActiveCanvasPage } from '@site/store/store'
import { resolveInsertLocation, type InsertLocation } from '@site/store/insertLocation'
import { AppGridPlusGlyphIcon } from 'pixel-art-icons/icons/app-grid-plus-glyph'
import { Button } from '@ui/components/Button'
import { pushToast } from '@ui/components/Toast'
import { ModuleInserterDialog } from '@site/module-picker/ModuleInserterDialog'
import type { ModuleInserterItem } from '@site/module-picker/moduleInserterModel'
import { useInsertModule } from '@site/hooks/useInsertModule'
import { useInsertPreset } from '@site/hooks/useInsertPreset'

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

  // selectActiveCanvasPage unifies page mode and VC-canvas mode — Components
  // dropped from the toolbar use the same resolver as the right-click menu.
  const canvasPage = useEditorStore(selectActiveCanvasPage)
  const insertComponentRef = useEditorStore((s) => s.insertComponentRef)
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId)
  const insertModule = useInsertModule()
  const insertPreset = useInsertPreset()

  const handleOpen = () => setOpen(true)
  const handleClose = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleInsertVC = (vcId: string, explicitTarget?: InsertLocation) => {
    if (!canvasPage) {
      return false
    }
    // Same target → location resolution as every other insert flow: explicit
    // selection acts as the target, no selection drops at root, leaf targets
    // become a sibling-after under their parent (see resolveInsertLocation).
    const location =
      explicitTarget ??
      resolveInsertLocation(canvasPage, selectedNodeId ?? canvasPage.rootNodeId)
    if (!location) {
      return false
    }
    insertComponentRef(location.parentId, vcId, location.index)
    return true
  }

  const handleInsertItem = (
    item: ModuleInserterItem,
    target: InsertLocation | undefined,
    mode: 'click' | 'drop',
  ): boolean => {
    const inserted =
      item.kind === 'module'
        ? Boolean(insertModule(item.module, target))
        : item.kind === 'layout'
          ? Boolean(insertPreset(item.preset, target))
          : item.kind === 'component'
            ? handleInsertVC(item.id, target)
            : false

    if (!inserted) return false

    pushToast({
      kind: 'success',
      title: mode === 'drop' ? `Placed ${item.name}` : `Inserted ${item.name}`,
      body: mode === 'drop' ? 'Dropped on canvas.' : 'Inserted at the current selection.',
      location: 'module-inserter',
    })
    return true
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="primary"
        size="sm"
        iconOnly
        accentFill
        className={triggerClassName}
        aria-label="Add to canvas"
        aria-haspopup="dialog"
        aria-expanded={open}
        tooltip="Add to canvas"
        onClick={handleOpen}
        data-testid={triggerTestId}
      >
        <AppGridPlusGlyphIcon size={13} />
      </Button>

      {open && (
        <ModuleInserterDialog
          onClose={handleClose}
          onInsertItem={handleInsertItem}
        />
      )}
    </>
  )
}
