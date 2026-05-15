/**
 * FloatingWindow — shared shell for the Media page's three draggable windows
 * (Upload Queue, Detached Inspector, Bulk Edit). Wraps `useDraggablePanel`
 * with a `PanelHeader` and a scrollable body so each window can focus on
 * its own contents.
 *
 * Position is persisted automatically by `useDraggablePanel` via the
 * `panelLayoutStorage` module (each `FloatingPanelId` gets its own key).
 * Visibility is owned by the caller — pass `open` from your component
 * state. Closing fires `onClose`.
 */
import { forwardRef, useImperativeHandle, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PanelHeader } from '@admin/shared/PanelHeader'
import { useDraggablePanel } from '@site/hooks/useDraggablePanel'
import type { FloatingPanelId, PanelPosition } from '@site/layout/panelLayoutStorage'
import { cn } from '@ui/cn'
import styles from './FloatingWindow.module.css'

interface FloatingWindowProps {
  panelId: FloatingPanelId
  /** Visibility — when false the window unmounts (drag state stays in storage). */
  open: boolean
  title: string
  /** Default position when no stored position exists. */
  defaultPosition: PanelPosition
  /** Header right-slot actions (e.g. "Clear" buttons on the upload queue). */
  headerActions?: ReactNode
  /** Width in pixels — driven by a CSS var, allows simple resizing later. */
  width?: number
  /** Optional max height in pixels — body scrolls when exceeded. */
  maxHeight?: number
  /** Extra class on the root container. */
  className?: string
  ariaLabel?: string
  testId?: string
  onClose: () => void
  children?: ReactNode
}

export const FloatingWindow = forwardRef<HTMLDivElement, FloatingWindowProps>(function FloatingWindow(
  {
    panelId,
    open,
    title,
    defaultPosition,
    headerActions,
    width = 320,
    maxHeight,
    className,
    ariaLabel,
    testId,
    onClose,
    children,
  },
  forwardedRef,
) {
  const { panelRef, headerDragProps, panelPositionStyle } = useDraggablePanel(
    panelId,
    () => defaultPosition,
  )

  // The drag panel ref is typed as HTMLElement so it can attach to <aside>
  // / <section> as well. Cast for the forwarded HTMLDivElement contract.
  const localRef = useRef<HTMLDivElement | null>(null)
  useImperativeHandle(forwardedRef, () => localRef.current as HTMLDivElement)

  if (!open) return null

  const style = {
    '--floating-window-w': `${width}px`,
    ...(maxHeight ? { '--floating-window-max-h': `${maxHeight}px` } : {}),
    ...panelPositionStyle,
  } as CSSProperties

  // Portal into <body> so the window can float above ANY ancestor — including
  // sidebars with `overflow: hidden` and modal backdrops.
  return createPortal(
    <aside
      ref={(node) => {
        panelRef.current = node
        localRef.current = node as HTMLDivElement | null
      }}
      className={cn(styles.window, className)}
      role="dialog"
      aria-label={ariaLabel ?? title}
      data-testid={testId ?? `floating-window-${panelId}`}
      style={style}
      onClick={(event) => event.stopPropagation()}
    >
      <PanelHeader
        panelId={panelId}
        title={title}
        onClose={onClose}
        dragHandleProps={headerDragProps}
      >
        {headerActions}
      </PanelHeader>
      <div className={styles.body}>{children}</div>
    </aside>,
    document.body,
  )
})
