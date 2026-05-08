/**
 * Showcase plugin — admin dashboard.
 *
 * Migrated to the React-based plugin SDK. Notice:
 *   • Zero React imports — `h` and `hooks` come from the host.
 *   • Zero CSS — everything is styled by the host design system via `ui.*`.
 *   • Zero `document.createElement` calls.
 *   • Type-safe — `props.tone` autocompletes to the schema's enum.
 */
import { definePluginAdminApp } from '@core/plugin-sdk'

interface Status {
  ok: boolean
  plugin: string
  total: number
  byEvent: Record<string, number>
}

export default definePluginAdminApp(({ ui, h, hooks, api }) => {
  const [status, setStatus] = hooks.useState<Status | null>(null)
  const [error, setError] = hooks.useState<string | null>(null)
  const [loading, setLoading] = hooks.useState(true)

  const refresh = hooks.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.cms.routes.fetch('status')
      const body = await res.json() as Status
      setStatus(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    } finally {
      setLoading(false)
    }
  }, [])

  hooks.useEffect(() => {
    void refresh()
  }, [refresh])

  const clearAll = hooks.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await api.cms.routes.fetch('clear', { method: 'POST' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear')
      setLoading(false)
    }
  }, [refresh])

  return h(ui.Stack, { gap: 16 }, [
    h(ui.Heading, { level: 2, key: 'h' }, 'Showcase'),
    h(
      ui.Text,
      { variant: 'muted', key: 't' },
      'Open a published page in another tab; events fire automatically and appear here in real time.',
    ),
    error
      ? h(ui.Alert, { tone: 'danger', title: 'Error', key: 'e' }, error)
      : null,
    h(ui.Card, { padding: 16, key: 'c' },
      h(ui.Stack, { gap: 12 }, [
        h(ui.Heading, { level: 3, key: 'sh' }, 'Tracker status'),
        loading
          ? h(ui.Text, { variant: 'muted', key: 'l' }, 'Loading...')
          : h(ui.Code, { key: 'p' }, JSON.stringify(status, null, 2)),
        h(ui.Stack, { direction: 'row', gap: 8, key: 'r' }, [
          h(ui.Button, {
            variant: 'secondary',
            size: 'sm',
            onClick: () => void refresh(),
            disabled: loading,
            key: 'rb',
          }, 'Refresh'),
          h(ui.Button, {
            variant: 'destructive',
            size: 'sm',
            onClick: () => void clearAll(),
            disabled: loading || !status || status.total === 0,
            key: 'cb',
          }, 'Clear events'),
        ]),
      ]),
    ),
  ])
})
