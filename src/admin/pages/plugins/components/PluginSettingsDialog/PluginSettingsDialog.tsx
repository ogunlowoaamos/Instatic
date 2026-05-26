/**
 * Plugin settings dialog — renders a plugin's `definePlugin({ settings })`
 * schema as a form using the shared `pluginAdminUi` primitives. Built on
 * the shared `<Dialog/>` primitive; only the body content lives here.
 *
 * Flow:
 *   1. Open dialog → `loadCmsPluginSettings` fetches the declared schema +
 *      the masked stored values (secrets are `'***'`).
 *   2. User edits form fields.
 *   3. Save → `updateCmsPluginSettings`, wrapped in `runStepUp`. The host
 *      requires a fresh step-up window for the PUT
 *      (`server/handlers/cms/plugins/index.ts:requiresStepUp`); the wrapper
 *      catches the `step_up_required` rejection, opens the password-confirm
 *      dialog, and retries the save on success.
 *   4. On success the dialog closes and notifies the parent so the plugin
 *      list can re-render with the new settings.
 */
import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import {
  loadCmsPluginSettings,
  updateCmsPluginSettings,
  type PluginSettingsRecord,
  type PluginSettingsSchema,
  type PluginSettingsValue,
} from '@core/persistence'
import { StepUpCancelledMessage, useStepUp } from '@admin/shared/StepUp'
import { pluginAdminUi } from '../PluginAdminUi'

type SettingDefinition = PluginSettingsSchema[number]

interface PluginSettingsDialogProps {
  pluginId: string
  pluginName: string
  onClose: () => void
  onSaved?: (next: PluginSettingsRecord) => void
}

export function PluginSettingsDialog({
  pluginId,
  pluginName,
  onClose,
  onSaved,
}: PluginSettingsDialogProps) {
  const { runStepUp } = useStepUp()
  // pluginId is the load-key — when it changes we discard the old load.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [schema, setSchema] = useState<PluginSettingsSchema | null>(null)
  const [values, setValues] = useState<PluginSettingsRecord>({})
  const [saving, setSaving] = useState(false)
  // Load and save errors are surfaced under different alert titles so the
  // operator can tell whether the dialog failed to read the current settings
  // or failed to persist their edits.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const loading = loadedFor !== pluginId

  useEffect(() => {
    let cancelled = false
    void loadCmsPluginSettings(pluginId)
      .then((body) => {
        if (cancelled) return
        setSchema(body.schema)
        setValues({ ...body.settings })
        setLoadedFor(pluginId)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load settings')
        setLoadedFor(pluginId)
      })
    return () => { cancelled = true }
  }, [pluginId])

  function setValue(id: string, next: PluginSettingsValue) {
    setValues((current) => ({ ...current, [id]: next }))
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      // `updateCmsPluginSettings` rejects with `Error('step_up_required')`
      // when the session has no fresh step-up window. `runStepUp` catches
      // that rejection, prompts for the password, then retries the save.
      const next = await runStepUp(() => updateCmsPluginSettings(pluginId, values))
      onSaved?.(next)
      onClose()
    } catch (err) {
      if (err instanceof Error && err.message === StepUpCancelledMessage) {
        // User dismissed the password dialog — leave the form open with the
        // pending edits intact so they can retry without retyping.
        return
      }
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={saving ? () => {} : onClose}
      eyebrow="Plugin settings"
      title={pluginName}
      size="lg"
      loading={loading}
      footer={
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !schema || schema.length === 0 || loadError !== null}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </>
      }
    >
      {loadError && (
        <pluginAdminUi.Alert tone="danger" title="Could not load settings">
          {loadError}
        </pluginAdminUi.Alert>
      )}
      {saveError && (
        <pluginAdminUi.Alert tone="danger" title="Could not save settings">
          {saveError}
        </pluginAdminUi.Alert>
      )}
      {!loading && !loadError && schema && schema.length === 0 && (
        <pluginAdminUi.EmptyState
          title="No settings declared"
          body="This plugin does not expose any user-configurable settings."
        />
      )}
      {!loading && !loadError && schema && schema.length > 0 && (
        <pluginAdminUi.Stack gap={14}>
          {schema.map((field) => renderField(field, values, setValue))}
        </pluginAdminUi.Stack>
      )}
    </Dialog>
  )
}

function renderField(
  field: SettingDefinition,
  values: PluginSettingsRecord,
  setValue: (id: string, next: PluginSettingsValue) => void,
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
