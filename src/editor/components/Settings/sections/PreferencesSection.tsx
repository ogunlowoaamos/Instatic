/**
 * PreferencesSection — local editor preferences.
 */
import { useState } from 'react'
import { Switch } from '@ui/components/Switch'
import {
  DEFAULT_EDITOR_PREFS,
  EDITOR_PREFS_KEY,
  EditorPrefsSchema,
  notifyEditorPrefsChanged,
  type EditorPrefs,
} from '@editor/preferences/editorPreferences'
import { parseJsonWithFallback } from '@core/utils/jsonValidate'
import s from '../Settings.module.css'

function loadPrefs(): Required<EditorPrefs> {
  const raw = (() => {
    try { return localStorage.getItem(EDITOR_PREFS_KEY) } catch { return null }
  })()
  const parsed = parseJsonWithFallback(raw, EditorPrefsSchema, {})
  return { ...DEFAULT_EDITOR_PREFS, ...parsed }
}

function savePrefs(prefs: EditorPrefs) {
  try {
    localStorage.setItem(EDITOR_PREFS_KEY, JSON.stringify(prefs))
    notifyEditorPrefsChanged()
  } catch { /* ignore */ }
}

export function PreferencesSection() {
  // The UI binds <Switch checked> directly to these fields, so they need
  // concrete booleans — use Required<EditorPrefs> here even though the
  // schema (and storage) tolerate missing fields.
  const [prefs, setPrefs] = useState<Required<EditorPrefs>>(loadPrefs)

  const update = (patch: Partial<EditorPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    savePrefs(next)
  }

  return (
    <div>
      <h3 className={s.sectionHeading}>Preferences</h3>
      <p className={s.sectionDescription}>
        Editor preferences are stored locally on this device and do not affect the site file.
      </p>

      <div>
        <ToggleRow
          label="Auto-save"
          description="Automatically save the site every 30 seconds."
          checked={prefs.autoSave}
          id="pref-autosave"
          onChange={(v) => update({ autoSave: v })}
        />
        <ToggleRow
          label="Preview classes on hover"
          description="Temporarily apply class suggestions to the selected canvas element while hovering them."
          checked={prefs.classHoverPreview}
          id="pref-class-hover-preview"
          onChange={(v) => update({ classHoverPreview: v })}
        />
      </div>

      <p className={s.prefNote}>
        More preferences (theme, language, spell-check) coming in a future sprint.
      </p>
    </div>
  )
}

// ─── Helper: ToggleRow ────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  id: string
  onChange: (v: boolean) => void
}

function ToggleRow({ label, description, checked, id, onChange }: ToggleRowProps) {
  return (
    <div className={s.toggleRow}>
      <div className={s.toggleRowContent}>
        <label htmlFor={id} className={s.toggleRowLabel}>
          {label}
        </label>
        <p className={s.toggleRowDesc}>{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        hitArea
        onCheckedChange={onChange}
      />
    </div>
  )
}
