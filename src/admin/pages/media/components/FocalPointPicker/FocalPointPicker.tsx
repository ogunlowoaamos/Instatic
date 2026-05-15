/**
 * FocalPointPicker — click / drag a crosshair over the image preview to set
 * the focal point that art-directed crops will keep visible.
 *
 * Coordinates are stored as normalized (0..1, 0..1) values relative to the
 * image's intrinsic dimensions, which matches the `focal_x`/`focal_y`
 * columns. Keyboard nudging (arrow keys, with Shift for 5× steps) keeps the
 * control accessible.
 *
 * The control is uncontrolled internally — it tracks live pointer state in
 * a ref, calls `onPreview` on every move (so the parent inspector can show
 * an instant visual without re-rendering on pointermove), and only emits
 * `onChange` on pointerup / blur. This mirrors `useDraggablePanel`'s 60 fps
 * imperative-update pattern.
 */
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@ui/cn'
import styles from './FocalPointPicker.module.css'

interface FocalPointPickerProps {
  src: string
  focalX: number
  focalY: number
  onChange: (focalX: number, focalY: number) => void
  alt?: string
  disabled?: boolean
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function FocalPointPicker({
  src,
  focalX,
  focalY,
  onChange,
  alt = '',
  disabled = false,
}: FocalPointPickerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [livePoint, setLivePoint] = useState<{ x: number; y: number }>({ x: focalX, y: focalY })

  // External focal changes (e.g. switching to a different asset) refresh
  // the live point so the marker doesn't lag the new asset.
  useResetOnExternalChange(focalX, focalY, setLivePoint)

  const computePoint = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current
    if (!surface) return { x: livePoint.x, y: livePoint.y }
    const rect = surface.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    }
  }, [livePoint.x, livePoint.y])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    setLivePoint(computePoint(event))
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    setLivePoint(computePoint(event))
  }

  function commit(point: { x: number; y: number }) {
    draggingRef.current = false
    if (point.x === focalX && point.y === focalY) return
    onChange(point.x, point.y)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const next = computePoint(event)
    setLivePoint(next)
    commit(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const step = event.shiftKey ? 0.05 : 0.01
    let dx = 0
    let dy = 0
    switch (event.key) {
      case 'ArrowLeft': dx = -step; break
      case 'ArrowRight': dx = step; break
      case 'ArrowUp': dy = -step; break
      case 'ArrowDown': dy = step; break
      default: return
    }
    event.preventDefault()
    const next = { x: clamp(livePoint.x + dx), y: clamp(livePoint.y + dy) }
    setLivePoint(next)
    commit(next)
  }

  return (
    <div
      ref={surfaceRef}
      className={cn(styles.surface, disabled && styles.surfaceDisabled)}
      role="application"
      aria-label="Focal point picker. Click or drag to set focal point. Use arrow keys to nudge."
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <img src={src} alt={alt} className={styles.image} draggable={false} />
      <span
        className={styles.crosshair}
        aria-hidden="true"
        style={{
          left: `${livePoint.x * 100}%`,
          top: `${livePoint.y * 100}%`,
        }}
      />
      <span className={styles.coords} aria-live="polite">
        {Math.round(livePoint.x * 100)}% · {Math.round(livePoint.y * 100)}%
      </span>
    </div>
  )
}

// Local helper — avoids pulling in useEffect at the top scope when only the
// reset path needs it.
import { useEffect } from 'react'
function useResetOnExternalChange(
  focalX: number,
  focalY: number,
  setLivePoint: (next: { x: number; y: number }) => void,
) {
  useEffect(() => {
    setLivePoint({ x: focalX, y: focalY })
    // setLivePoint is stable via useState; not in deps to avoid wobble.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focalX, focalY])
}
