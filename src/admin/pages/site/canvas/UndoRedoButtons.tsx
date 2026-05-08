/**
 * UndoRedoButtons — Undo and Redo controls inside the canvas notch.
 *
 * Lives next to the quick-insert actions because undo/redo only operates
 * on the visual editor's page tree — it has no meaning on admin pages
 * outside the canvas (Content, Plugins, …).
 *
 * Accessibility (Guideline #224):
 * - Buttons are ALWAYS rendered in the DOM — never conditionally removed.
 * - When unavailable: aria-disabled="true" + visual grey. NOT the `disabled` HTML attr.
 * - aria-keyshortcuts documents the keyboard shortcut for screen readers.
 */
import { useEffect } from 'react'
import { useCanUndo, useCanRedo, useUndo, useRedo } from '@site/store/store'
import { UndoIcon } from 'pixel-art-icons/icons/undo'
import { RedoIcon } from 'pixel-art-icons/icons/redo'
import { Button } from '@ui/components/Button'
import styles from './CanvasNotch.module.css'

export function UndoRedoButtons() {
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  const undo = useUndo()
  const redo = useRedo()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  return (
    <div
      role="group"
      aria-label="Undo and redo"
      className={styles.historyGroup}
    >
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        className={styles.quickButton}
        aria-label="Undo"
        aria-keyshortcuts="Meta+Z"
        aria-disabled={!canUndo}
        onClick={canUndo ? undo : undefined}
        tooltip="Undo (⌘Z)"
        data-testid="canvas-notch-undo-btn"
      >
        <UndoIcon size={14} aria-hidden="true" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        className={styles.quickButton}
        aria-label="Redo"
        aria-keyshortcuts="Meta+Shift+Z"
        aria-disabled={!canRedo}
        onClick={canRedo ? redo : undefined}
        tooltip="Redo (⌘⇧Z)"
        data-testid="canvas-notch-redo-btn"
      >
        <RedoIcon size={14} aria-hidden="true" />
      </Button>
    </div>
  )
}
