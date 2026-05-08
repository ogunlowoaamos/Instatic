/**
 * Plugin settings dialog — renders a plugin's `definePlugin({ settings })`
 * schema as a form using the shared `pluginAdminUi` primitives. The same
 * components plugin admin apps render with, so settings UIs and plugin
 * admin pages look identical out of the box.
 *
 * Flow:
 *   1. Open dialog → fetch latest settings + schema from
 *      `GET /admin/api/cms/plugins/:id/settings`
 *   2. User edits form fields
 *   3. Save → `PUT` the cleaned record; backend validates against schema,
 *      persists, refreshes the plugin runtime cache, emits
 *      `settings.changed` for plugin server hooks to react
 *   4. Dialog re-renders with the masked response and closes on success
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@ui/components/Button'
import { useDialogEscape } from '@ui/lib/useDialogEscape'
import { CloseIcon } from 'pixel-art-icons/icons/close'
import type { PluginManifest } from '@core/plugin-sdk'
import { pluginAdminUi } from '../PluginAdminUi'
import styles from './PluginSettingsDialog.module.css'

type SettingsValue = string | number | boolean
type SettingsRecord = Record<string, SettingsValue>
type SettingsSchema = NonNullable<PluginManifest['settings']>
type SettingDefinition = SettingsSchema[number]

interface SettingsResponse {
  schema: SettingsSchema
  settings: SettingsRecord
}

interface PluginSettingsDialogProps {
  pluginId: string
  pluginName: string
  onClose: () => void
  onSaved?: (next: SettingsRecord) => void
}

export function PluginSettingsDialog({
  pluginId,
  pluginName,
  onClose,
  onSaved,
}: PluginSettingsDialogProps) {
  // pluginId is the load-key — when it changes we want to discard the old
  // load. State is keyed by pluginId; the current view falls back to
  // "loading" whenever the key doesn't match the latest payload, so we can
  // omit the synchronous setLoading(true) from inside useEffect.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [schema, setSchema] = useState<SettingsSchema | null>(null)
  const [values, setValues] = useState<SettingsRecord>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loading = loadedFor !== pluginId

  useDialogEscape(onClose)

  useEffect(() => {
    let cancelled = false
    void fetch(`/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/settings`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text() || `Load failed (${res.status})`)
        return res.json() as Promise<SettingsResponse>
      })
      .then((body) => {
        if (cancelled) return
        setSchema(body.schema)
        setValues({ ...body.settings })
        setLoadedFor(pluginId)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load settings')
        setLoadedFor(pluginId)
      })
    return () => { cancelled = true }
  }, [pluginId])

  function setValue(id: string, next: SettingsValue) {
    setValues((current) => ({ ...current, [id]: next }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: values }),
      })
      if (!res.ok) throw new Error(await res.text() || `Save failed (${res.status})`)
      const body = await res.json() as { settings: SettingsRecord }
      onSaved?.(body.settings)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="plugin-settings-title">
      <div className={styles.dialog}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Plugin settings</p>
            <h2 id="plugin-settings-title" className={styles.title}>{pluginName}</h2>
          </div>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            type="button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <CloseIcon size={14} />
          </Button>
        </header>

        <div className={styles.body}>
          {loading && <p className={styles.empty}>Loading settings...</p>}
          {error && (
            <pluginAdminUi.Alert tone="danger" title="Could not load settings">
              {error}
            </pluginAdminUi.Alert>
          )}
          {!loading && schema && schema.length === 0 && (
            <pluginAdminUi.EmptyState
              title="No settings declared"
              body="This plugin does not expose any user-configurable settings."
            />
          )}
          {!loading && schema && schema.length > 0 && (
            <pluginAdminUi.Stack gap={14}>
              {schema.map((field) => renderField(field, values, setValue))}
            </pluginAdminUi.Stack>
          )}
        </div>

        <footer className={styles.footer}>
          <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !schema || schema.length === 0}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function renderField(
  field: SettingDefinition,
  values: SettingsRecord,
  setValue: (id: string, next: SettingsValue) => void,
) {
  const value = values[field.id]
  switch (field.type) {
    case 'toggle':
      return (
        <pluginAdminUi.Switch
          key={field.id}
          label={field.label}
          description={field.description}
          checked={Boolean(value)}
          onChange={(next) => setValue(field.id, next)}
        />
      )
    case 'select':
      return (
        <pluginAdminUi.Select
          key={field.id}
          label={field.label}
          description={field.description}
          value={String(value ?? '')}
          options={[...(field.options ?? [])]}
          onChange={(next) => setValue(field.id, next)}
        />
      )
    case 'textarea':
      return (
        <pluginAdminUi.Textarea
          key={field.id}
          label={field.label}
          description={field.description}
          rows={field.rows}
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onChange={(next) => setValue(field.id, next)}
        />
      )
    case 'number':
      return (
        <pluginAdminUi.Input
          key={field.id}
          label={field.label}
          description={field.description}
          type="number"
          value={String(value ?? '')}
          onChange={(next) => {
            const parsed = next === '' ? 0 : Number(next)
            setValue(field.id, Number.isFinite(parsed) ? parsed : 0)
          }}
        />
      )
    case 'password':
      return (
        <pluginAdminUi.Input
          key={field.id}
          label={field.label}
          description={field.description}
          type="password"
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onChange={(next) => setValue(field.id, next)}
        />
      )
    case 'url':
      return (
        <pluginAdminUi.Input
          key={field.id}
          label={field.label}
          description={field.description}
          type="url"
          value={String(value ?? '')}
          onChange={(next) => setValue(field.id, next)}
        />
      )
    case 'color':
    case 'text':
    default:
      return (
        <pluginAdminUi.Input
          key={field.id}
          label={field.label}
          description={field.description}
          type="text"
          placeholder={field.type === 'text' ? field.placeholder : undefined}
          value={String(value ?? '')}
          onChange={(next) => setValue(field.id, next)}
        />
      )
  }
}
