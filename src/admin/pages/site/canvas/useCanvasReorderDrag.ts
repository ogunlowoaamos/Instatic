import { useCallback, useEffect, useRef, useState } from 'react'
import { registry } from '@core/module-engine/registry'
import { selectActiveCanvasPage, useEditorStore } from '@site/store/store'
import type { CanvasDropResolution } from './canvasDnd'
import { resolveCanvasDropTarget } from './canvasDnd'
import {
  getViewportLocalPoint,
  measureCanvasDropCandidates,
} from './canvasDomGeometry'

interface UseCanvasReorderDragOptions {
  viewportRef: React.RefObject<HTMLElement | null>
  selectedNodeIds: readonly string[]
  enabled: boolean
  panBy?: (dx: number, dy: number) => void
  canvasRootRef?: React.RefObject<HTMLElement | null>
}

interface DragSession {
  pointerId: number
  draggedId: string
  draggedIds: string[]
  candidates: ReturnType<typeof measureCanvasDropCandidates>
}

interface CanvasReorderDragState extends CanvasDropResolution {
  dragging: boolean
}

const EMPTY_DRAG_STATE: CanvasReorderDragState = {
  dragging: false,
  target: null,
  invalid: null,
}

const AUTO_PAN_EDGE_PX = 48
const AUTO_PAN_MAX_SPEED = 18

export function useCanvasReorderDrag({
  viewportRef,
  selectedNodeIds,
  enabled,
  panBy,
  canvasRootRef,
}: UseCanvasReorderDragOptions) {
  const sessionRef = useRef<DragSession | null>(null)
  const latestResolutionRef = useRef<CanvasDropResolution>({ target: null, invalid: null })
  const latestClientPointRef = useRef<{ x: number; y: number } | null>(null)
  const autoPanFrameRef = useRef<number | null>(null)
  const runAutoPanRef = useRef<() => void>(() => {})
  const removeWindowListenersRef = useRef<(() => void) | null>(null)
  const [dragState, setDragState] = useState<CanvasReorderDragState>(EMPTY_DRAG_STATE)

  const stopAutoPan = useCallback(() => {
    if (autoPanFrameRef.current !== null) {
      cancelAnimationFrame(autoPanFrameRef.current)
      autoPanFrameRef.current = null
    }
  }, [])

  const queueAutoPanFrame = useCallback(() => {
    autoPanFrameRef.current = requestAnimationFrame(() => runAutoPanRef.current())
  }, [])

  const setResolution = useCallback((resolution: CanvasDropResolution) => {
    latestResolutionRef.current = resolution
    setDragState({
      dragging: sessionRef.current !== null,
      target: resolution.target,
      invalid: resolution.invalid,
    })
  }, [])

  const resolveAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const session = sessionRef.current
    const viewport = viewportRef.current
    const tree = selectActiveCanvasPage(useEditorStore.getState())
    if (!session || !viewport || !tree) {
      setResolution({ target: null, invalid: null })
      return
    }

    const point = getViewportLocalPoint(viewport, clientX, clientY)
    setResolution(resolveCanvasDropTarget({
      tree,
      draggedId: session.draggedId,
      draggedIds: session.draggedIds,
      candidates: session.candidates,
      point,
      canHaveChildren,
    }))
  }, [setResolution, viewportRef])

  const runAutoPan = useCallback(() => {
    autoPanFrameRef.current = null
    const root = canvasRootRef?.current
    const point = latestClientPointRef.current
    if (!root || !point || !panBy || !sessionRef.current) return

    const rect = root.getBoundingClientRect()
    const leftDistance = point.x - rect.left
    const rightDistance = rect.right - point.x
    const topDistance = point.y - rect.top
    const bottomDistance = rect.bottom - point.y

    let dx = 0
    let dy = 0

    if (leftDistance >= 0 && leftDistance < AUTO_PAN_EDGE_PX) {
      dx = autoPanSpeed(leftDistance)
    } else if (rightDistance >= 0 && rightDistance < AUTO_PAN_EDGE_PX) {
      dx = -autoPanSpeed(rightDistance)
    }

    if (topDistance >= 0 && topDistance < AUTO_PAN_EDGE_PX) {
      dy = autoPanSpeed(topDistance)
    } else if (bottomDistance >= 0 && bottomDistance < AUTO_PAN_EDGE_PX) {
      dy = -autoPanSpeed(bottomDistance)
    }

    if (dx !== 0 || dy !== 0) {
      panBy(dx, dy)
      resolveAtClientPoint(point.x, point.y)
      queueAutoPanFrame()
    }
  }, [canvasRootRef, panBy, queueAutoPanFrame, resolveAtClientPoint])

  useEffect(() => {
    runAutoPanRef.current = runAutoPan
  }, [runAutoPan])

  const scheduleAutoPan = useCallback((clientX: number, clientY: number) => {
    latestClientPointRef.current = { x: clientX, y: clientY }
    if (autoPanFrameRef.current === null) {
      queueAutoPanFrame()
    }
  }, [queueAutoPanFrame])

  const resetDrag = useCallback(() => {
    stopAutoPan()
    sessionRef.current = null
    latestClientPointRef.current = null
    latestResolutionRef.current = { target: null, invalid: null }
    removeWindowListenersRef.current?.()
    removeWindowListenersRef.current = null
    setDragState(EMPTY_DRAG_STATE)
  }, [stopAutoPan])

  const handleWindowPointerMove = useCallback((event: PointerEvent) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    event.preventDefault()
    latestClientPointRef.current = { x: event.clientX, y: event.clientY }
    resolveAtClientPoint(event.clientX, event.clientY)
    scheduleAutoPan(event.clientX, event.clientY)
  }, [resolveAtClientPoint, scheduleAutoPan])

  const handleWindowPointerUp = useCallback((event: PointerEvent) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    event.preventDefault()

    const target = latestResolutionRef.current.target
    resetDrag()

    if (!target) return
    try {
      useEditorStore.getState().moveNodes(target.draggedIds, target.parentId, target.index)
    } catch (err) {
      console.warn('[canvas-dnd] Ignored stale canvas drag target:', err)
    }
  }, [resetDrag])

  const handleWindowPointerCancel = useCallback((event: PointerEvent) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    resetDrag()
  }, [resetDrag])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) return

    const viewport = viewportRef.current
    const state = useEditorStore.getState()
    const tree = selectActiveCanvasPage(state)
    if (!viewport || !tree) return

    const draggedIds = resolveDraggedIds(tree, selectedNodeIds)
    const draggedId = state.selectedNodeId && draggedIds.includes(state.selectedNodeId)
      ? state.selectedNodeId
      : draggedIds[draggedIds.length - 1]

    if (!draggedId || draggedIds.length === 0) return

    event.preventDefault()
    event.stopPropagation()
    resetDrag()

    sessionRef.current = {
      pointerId: event.pointerId,
      draggedId,
      draggedIds,
      candidates: measureCanvasDropCandidates(viewport, tree),
    }
    latestClientPointRef.current = { x: event.clientX, y: event.clientY }
    setDragState({ dragging: true, target: null, invalid: null })

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerCancel)
    removeWindowListenersRef.current = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
    }
  }, [
    enabled,
    handleWindowPointerCancel,
    handleWindowPointerMove,
    handleWindowPointerUp,
    resetDrag,
    selectedNodeIds,
    viewportRef,
  ])

  useEffect(() => resetDrag, [resetDrag])

  return {
    ...dragState,
    handlePointerDown,
  }
}

function resolveDraggedIds(
  tree: NonNullable<ReturnType<typeof selectActiveCanvasPage>>,
  selectedNodeIds: readonly string[],
): string[] {
  const result: string[] = []
  for (const id of selectedNodeIds) {
    const node = tree.nodes[id]
    if (!node) return []
    if (id === tree.rootNodeId) return []
    if (node.locked) return []
    result.push(id)
  }
  return result
}

function canHaveChildren(moduleId: string): boolean {
  return registry.get(moduleId)?.canHaveChildren === true
}

function autoPanSpeed(distanceFromEdge: number): number {
  const ratio = 1 - Math.max(0, Math.min(AUTO_PAN_EDGE_PX, distanceFromEdge)) / AUTO_PAN_EDGE_PX
  return Math.max(1, Math.ceil(ratio * AUTO_PAN_MAX_SPEED))
}
