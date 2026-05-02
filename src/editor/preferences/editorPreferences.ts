import { z } from 'zod'
import { parseJsonWithFallback } from '@core/utils/jsonValidate'

export const EDITOR_PREFS_KEY = 'pb-editor-prefs'
const EDITOR_PREFS_CHANGED_EVENT = 'pb-editor-prefs-changed'

// EditorPrefsSchema covers only the keys this module reads. Other call sites
// (e.g. PreferencesSection) use their own EditorPrefs type for the full UI
// model — these readers only need the fields they consume, with everything
// else allowed via .passthrough() so future fields don't crash older readers.
//
// Surfaced by /audit-types — was `JSON.parse(raw) as { autoSave?: unknown }`.
const EditorPrefsSchema = z
  .object({
    autoSave: z.boolean().optional(),
    classHoverPreview: z.boolean().optional(),
  })
  .passthrough()

const DEFAULT_PREFS: z.infer<typeof EditorPrefsSchema> = {
  autoSave: true,
  classHoverPreview: true,
}

function readEditorPrefs() {
  const raw = globalThis.localStorage?.getItem(EDITOR_PREFS_KEY) ?? null
  return parseJsonWithFallback(raw, EditorPrefsSchema, DEFAULT_PREFS)
}

export function readAutoSavePreference(): boolean {
  return readEditorPrefs().autoSave ?? true
}

export function readClassHoverPreviewPreference(): boolean {
  return readEditorPrefs().classHoverPreview ?? true
}

export function notifyEditorPrefsChanged() {
  try {
    globalThis.window?.dispatchEvent(new Event(EDITOR_PREFS_CHANGED_EVENT))
  } catch {
    // Preferences are best-effort local UI state.
  }
}

export function subscribeToEditorPrefsChanged(listener: () => void): () => void {
  const win = globalThis.window
  if (!win) return () => {}

  const handleStorage = (event: StorageEvent) => {
    if (event.key === EDITOR_PREFS_KEY) listener()
  }

  win.addEventListener(EDITOR_PREFS_CHANGED_EVENT, listener)
  win.addEventListener('storage', handleStorage)
  return () => {
    win.removeEventListener(EDITOR_PREFS_CHANGED_EVENT, listener)
    win.removeEventListener('storage', handleStorage)
  }
}
