import type { StateCreator } from 'zustand'
import type { EditorStore } from '../store'

type CanvasMode = 'select' | 'pan' | 'insert'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const DEFAULT_ZOOM = 1

/**
 * Maximum pan offset in each direction (pixels in document space).
 * Belt-and-suspenders guard against agent tool writes that bypass call-site guards.
 * Architecture spec: Contribution #435, Security Auditor review (message #1270).
 */
export const MAX_PAN = 50_000

export interface CanvasSlice {
  zoom: number
  panX: number
  panY: number
  /** Active breakpoint ID — determines which viewport frame is "focused" */
  activeBreakpointId: string
  /** Active page ID */
  activePageId: string | null
  /** Current editor interaction mode */
  canvasMode: CanvasMode

  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  setCanvasTransform: (zoom: number, x: number, y: number) => void
  setActiveBreakpoint: (id: string) => void
  setActivePage: (pageId: string) => void
  setCanvasMode: (mode: CanvasMode) => void
  resetView: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomTo: (zoom: number, originX?: number, originY?: number) => void
}

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

function clampPan(v: number): number {
  return Math.max(-MAX_PAN, Math.min(MAX_PAN, v))
}

function nearestZoomStep(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((z) => z > current + 1e-9) ?? MAX_ZOOM
  } else {
    return [...ZOOM_STEPS].reverse().find((z) => z < current - 1e-9) ?? MIN_ZOOM
  }
}

export const createCanvasSlice: StateCreator<EditorStore, [], [], CanvasSlice> = (set, get) => ({
  zoom: DEFAULT_ZOOM,
  panX: 0,
  panY: 0,
  activeBreakpointId: 'desktop',
  activePageId: null,
  canvasMode: 'select',

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

  setPan: (panX, panY) => set({ panX: clampPan(panX), panY: clampPan(panY) }),

  setCanvasTransform: (zoom, panX, panY) => set({
    zoom: clampZoom(zoom),
    panX: clampPan(panX),
    panY: clampPan(panY),
  }),

  setActiveBreakpoint: (id) => set({ activeBreakpointId: id }),

  setActivePage: (pageId) => set({ activePageId: pageId }),

  setCanvasMode: (mode) => set({ canvasMode: mode }),

  resetView: () => set({ zoom: DEFAULT_ZOOM, panX: 0, panY: 0 }),

  zoomIn: () => {
    const { zoom } = get()
    set({ zoom: nearestZoomStep(zoom, 1) })
  },

  zoomOut: () => {
    const { zoom } = get()
    set({ zoom: nearestZoomStep(zoom, -1) })
  },

  /**
   * Zoom to a target level, optionally around a viewport origin point.
   * Used for Ctrl+Wheel zoom (zoom towards cursor position).
   */
  zoomTo: (targetZoom, originX = 0, originY = 0) => {
    const { zoom, panX, panY } = get()
    const newZoom = clampZoom(targetZoom)
    const scale = newZoom / zoom
    // Adjust pan so the origin point stays fixed in viewport space
    const newPanX = clampPan(originX - scale * (originX - panX))
    const newPanY = clampPan(originY - scale * (originY - panY))
    set({ zoom: newZoom, panX: newPanX, panY: newPanY })
  },
})

// ---------------------------------------------------------------------------
// Zoom math utilities — exported as pure functions for unit testing
// ---------------------------------------------------------------------------

export { clampZoom, clampPan, nearestZoomStep, ZOOM_STEPS }
