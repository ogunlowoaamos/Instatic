import { Type } from '@sinclair/typebox'
import type { PropertiesPanelMode } from '@core/editor-store/slices/uiSlice'
import { safeParseJson } from '@core/utils/jsonValidate'

export const EDITOR_LAYOUT_STORAGE_KEY = 'pb-editor-layout-v1'

/**
 * 2D position of a draggable / floating panel relative to the viewport.
 * Defined here (the storage layer) so the hook layer can import it without
 * creating a cycle back to the storage layer.
 */
export interface PanelPosition {
  x: number
  y: number
}

export type FloatingPanelId =
  | 'dom'
  | 'properties'
  | 'site'
  | 'selectors'
  | 'colors'
  | 'typography'
  | 'spacing'
  | 'media'
  | 'dependencies'
  | 'codeeditor'
  | 'agent'

export interface StoredPanelLayout {
  open?: boolean
  position?: PanelPosition
  width?: number
  mode?: PropertiesPanelMode
}

export interface StoredEditorLayout {
  version: 1
  panels?: Partial<Record<FloatingPanelId, StoredPanelLayout>>
  sidebars?: {
    leftWidth?: number
  }
  activeEditorFileId?: string | null
}

// ---------------------------------------------------------------------------
// Storage schema
//
// .passthrough() so future fields written by other parts of the editor (or
// older versions) don't crash this reader. Strict version:1 check happens at
// the call site to allow migrating older shapes if we ever add v2.
// Surfaced by /audit-types.

const PanelPositionSchema = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
  },
  { additionalProperties: true },
)

const StoredPanelLayoutSchema = Type.Object(
  {
    open: Type.Optional(Type.Boolean()),
    position: Type.Optional(PanelPositionSchema),
    width: Type.Optional(Type.Number()),
    // PropertiesPanelMode is a string union; keep loose to avoid coupling to
    // its exact membership here.
    mode: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
)

const StoredEditorLayoutSchema = Type.Object(
  {
    version: Type.Literal(1),
    panels: Type.Optional(Type.Record(Type.String(), StoredPanelLayoutSchema)),
    sidebars: Type.Optional(
      Type.Object(
        {
          leftWidth: Type.Optional(Type.Number()),
        },
        { additionalProperties: true },
      ),
    ),
    activeEditorFileId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: true },
)

function storageAvailable() {
  return typeof localStorage !== 'undefined'
}

function isPanelPosition(value: unknown): value is PanelPosition {
  if (!value || typeof value !== 'object') return false
  const pos = value as Partial<PanelPosition>
  return typeof pos.x === 'number' && Number.isFinite(pos.x)
    && typeof pos.y === 'number' && Number.isFinite(pos.y)
}

export function readEditorLayout(): StoredEditorLayout | null {
  if (!storageAvailable()) return null
  const raw = localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY)
  if (!raw) return null
  const result = safeParseJson(raw, StoredEditorLayoutSchema)
  if (!result.ok) return null
  return result.value as StoredEditorLayout
}

export function writeEditorLayout(layout: StoredEditorLayout) {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Ignore quota/storage errors. Layout persistence is best-effort.
  }
}

function updateEditorLayout(
  updater: (layout: StoredEditorLayout) => StoredEditorLayout,
) {
  const current = readEditorLayout() ?? { version: 1, panels: {} }
  writeEditorLayout(updater(current))
}

export function readStoredPanelPosition(panelId: FloatingPanelId): PanelPosition | null {
  const position = readEditorLayout()?.panels?.[panelId]?.position
  return isPanelPosition(position) ? position : null
}

export function writeStoredPanelPosition(panelId: FloatingPanelId, position: PanelPosition) {
  updateEditorLayout((layout) => ({
    ...layout,
    version: 1,
    panels: {
      ...layout.panels,
      [panelId]: {
        ...layout.panels?.[panelId],
        position,
      },
    },
  }))
}
