/**
 * ZoomControls — toolbar controls for canvas navigation.
 *
 * Three logical groups, packed into one row:
 *
 *   [Frame selection] [Fit content]  |  [Zoom -] [%] [Zoom +]
 *
 * The first group is the new Figma-style framing pair (Task: canvas QoL):
 *   - "Frame selection" pans+zooms so the current selection fills the viewport.
 *     If nothing is selected, it falls through to "Fit content" so the action
 *     never feels like a no-op. Bound to `F` (and `2`) in the canvas.
 *   - "Fit content" zooms the entire document into view. Bound to `1`.
 *
 * The second group is the long-standing +/− zoom controls. Zooming +/−
 * anchors around the canvas viewport center so the visible content scales
 * around the middle of the screen instead of the document's top-left.
 *
 * Performance: subscribes only to `zoom` and `selectedNodeIds.length` — the
 * frame button switches between "Frame selection" and "Fit content" labelling
 * depending on whether anything is selected.
 *
 * Keyboard shortcuts (handled in useCanvas, documented here for screen readers):
 *   +/= → zoom in
 *   -   → zoom out
 *   F / 2 → frame selection (or fit content if nothing is selected)
 *   1   → fit content
 *   Cmd/Ctrl+0 → reset to 100%
 *   Shift+1 → reset to 100% (legacy muscle-memory)
 */

import { useCallback } from 'react'
import { useEditorStore } from '@site/store/store'
import { MinusIcon } from 'pixel-art-icons/icons/minus'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { TargetIcon } from 'pixel-art-icons/icons/target'
import { ProportionsIcon } from 'pixel-art-icons/icons/proportions'
import { Button } from '@ui/components/Button'
import { frameSelectedNodes, fitContentCanvas } from '@site/canvas/canvasFraming'
import styles from './Toolbar.module.css'

/**
 * Resolve the canvas viewport center in canvas-local coordinates.
 * Returns `null` if the canvas root isn't mounted (e.g. before first render).
 *
 * The canvas root is queried by data-testid because ZoomControls lives in the
 * toolbar (a sibling of the canvas), not inside CanvasRoot — passing a ref
 * would require threading it through several layers of layout components for
 * a one-off geometry lookup at click time.
 */
function getCanvasCenter(): { x: number; y: number } | null {
  const el = document.querySelector('[data-testid="canvas-root"]')
  if (!(el instanceof HTMLElement)) return null
  const rect = el.getBoundingClientRect()
  return { x: rect.width / 2, y: rect.height / 2 }
}

export function ZoomControls() {
  // Subscribe only to zoom — no re-render when other canvas state changes
  const zoom = useEditorStore((s) => s.zoom)
  const zoomIn = useEditorStore((s) => s.zoomIn)
  const zoomOut = useEditorStore((s) => s.zoomOut)
  const resetView = useEditorStore((s) => s.resetView)
  // Re-render only when the *count* changes — the Frame button needs to flip
  // its label "Frame selection" ↔ "Fit content" but doesn't care which specific
  // nodes are selected.
  const hasSelection = useEditorStore((s) => s.selectedNodeIds.length > 0)

  const handleZoomIn = useCallback(() => {
    const center = getCanvasCenter()
    if (center) zoomIn(center.x, center.y)
    else zoomIn()
  }, [zoomIn])

  const handleZoomOut = useCallback(() => {
    const center = getCanvasCenter()
    if (center) zoomOut(center.x, center.y)
    else zoomOut()
  }, [zoomOut])

  const handleFrameSelection = useCallback(() => {
    // frameSelectedNodes already falls back to fitContentCanvas when nothing
    // is selected — we still split the buttons so users can see both options.
    frameSelectedNodes()
  }, [])

  const handleFitContent = useCallback(() => {
    fitContentCanvas()
  }, [])

  const pct = Math.round(zoom * 100)

  return (
    <div
      role="group"
      aria-label="Canvas navigation"
      data-testid="toolbar-zoom-controls"
      className={styles.zoomGroup}
    >
      {/* Frame selection — pan+zoom so the current selection fills the viewport.
          Disabled label flips to "Fit content" when nothing is selected so the
          action remains visible and discoverable even without a selection. */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={hasSelection ? 'Frame selection' : 'Frame selection (fits content)'}
        aria-keyshortcuts="F"
        tooltip={hasSelection ? 'Frame selection (F)' : 'Frame selection (F) — no selection: fits content'}
        onClick={handleFrameSelection}
        data-testid="toolbar-frame-selection-btn"
      >
        <TargetIcon size={14} />
      </Button>

      {/* Fit content — zoom the entire document into view. */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Fit content to viewport"
        aria-keyshortcuts="1"
        tooltip="Fit content (1)"
        onClick={handleFitContent}
        data-testid="toolbar-fit-content-btn"
      >
        <ProportionsIcon size={14} />
      </Button>

      {/* Visual divider between framing and zoom-step groups */}
      <span aria-hidden="true" className={styles.zoomDivider} />

      {/* Zoom out */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Zoom out"
        aria-keyshortcuts="-"
        tooltip="Zoom out (−)"
        onClick={handleZoomOut}
      >
        <MinusIcon size={14} />
      </Button>

      {/* Zoom % display — click to reset to 100% */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Current zoom ${pct}%. Click to reset to 100%.`}
        tooltip="Reset to 100% (Cmd/Ctrl+0)"
        onClick={resetView}
        numeric
        className={styles.zoomPct}
      >
        {pct}%
      </Button>

      {/* Zoom in */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Zoom in"
        aria-keyshortcuts="="
        tooltip="Zoom in (+)"
        onClick={handleZoomIn}
      >
        <PlusIcon size={14} />
      </Button>
    </div>
  )
}
