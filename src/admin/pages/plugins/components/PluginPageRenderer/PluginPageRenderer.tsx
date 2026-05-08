import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { Button } from '@ui/components/Button'
import { Checkbox } from '@ui/components/Checkbox'
import { ErrorBoundary } from '@ui/components/ErrorBoundary'
import type {
  PluginAdminAppRenderFn,
  PluginAdminH,
  PluginAdminHooks,
  PluginAdminPageRoute,
  PluginPageContent,
  PluginRecord,
  PluginResource,
  PluginResourceField,
} from '@core/plugin-sdk'
import {
  createAdminPluginApi,
  loadPluginAdminAppModule,
  type PluginAdminAppImport,
} from '@core/plugins/adminRuntime'
import {
  createCmsPluginResourceRecord,
  deleteCmsPluginResourceRecord,
  loadCmsPluginResource,
} from '@core/persistence'
import { pluginAdminUi } from '../PluginAdminUi'
import styles from '../../PluginsPage.module.css'

interface PluginPageRendererProps {
  page: PluginAdminPageRoute
  importModule?: PluginAdminAppImport
}

type ResourcePluginPageRoute = PluginAdminPageRoute & {
  content: Extract<PluginPageContent, { kind: 'resource' }>
}

type AppPluginPageRoute = PluginAdminPageRoute & {
  content: Extract<PluginPageContent, { kind: 'app' }>
}

export function PluginPageRenderer({ page, importModule }: PluginPageRendererProps) {
  // Plugins are user-installed code — a render failure inside one must not
  // blank the admin shell. Reset key combines plugin id + page id so
  // navigating between plugin pages naturally clears stuck errors.
  return (
    <ErrorBoundary
      location="plugin-page"
      resetKeys={[page.pluginId, page.id]}
    >
      <PluginPageContent page={page} importModule={importModule} />
    </ErrorBoundary>
  )
}

function PluginPageContent({ page, importModule }: PluginPageRendererProps) {
  if (page.content.kind === 'map') {
    return (
      <section className={styles.pluginPage} aria-labelledby="plugin-page-title">
        <header className={styles.pluginPageHeader}>
          <p>{page.pluginName}</p>
          <h1 id="plugin-page-title">{page.content.heading}</h1>
          {page.content.body && <span>{page.content.body}</span>}
        </header>
        <div className={styles.mapSurface} aria-label={page.title}>
          <div className={styles.mapGrid} aria-hidden="true" />
          {page.content.centerLabel && (
            <div className={styles.mapCenterLabel}>{page.content.centerLabel}</div>
          )}
          {page.content.pins.map((pin) => (
            <article
              key={`${pin.label}-${pin.x}-${pin.y}`}
              className={styles.mapPin}
              style={{ '--pin-x': `${pin.x}%`, '--pin-y': `${pin.y}%` } as CSSProperties}
            >
              <span aria-hidden="true" />
              <strong>{pin.label}</strong>
              {pin.detail && <small>{pin.detail}</small>}
            </article>
          ))}
        </div>
      </section>
    )
  }

  if (page.content.kind === 'resource') {
    return <PluginResourcePage page={page as ResourcePluginPageRoute} />
  }

  if (page.content.kind === 'app') {
    return <PluginAppPage page={page as AppPluginPageRoute} importModule={importModule} />
  }

  return (
    <section className={styles.pluginPage} aria-labelledby="plugin-page-title">
      <header className={styles.pluginPageHeader}>
        <p>{page.pluginName}</p>
        <h1 id="plugin-page-title">{page.content.heading ?? page.title}</h1>
      </header>
      <div className={styles.markdownPanel}>
        {page.content.body.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

/**
 * `pluginHooks` — the curated React hook surface handed to plugin admin
 * apps. Plugins receive this via the `hooks` argument of their render
 * function so they can share the host's React instance without importing
 * React themselves.
 */
const pluginHooks: PluginAdminHooks = {
  useState: useState as PluginAdminHooks['useState'],
  useEffect: useEffect as PluginAdminHooks['useEffect'],
  useMemo: useMemo as PluginAdminHooks['useMemo'],
  useCallback: useCallback as PluginAdminHooks['useCallback'],
  useRef: useRef as PluginAdminHooks['useRef'],
}

const pluginH: PluginAdminH = createElement as PluginAdminH

/**
 * Inner component that calls the plugin's render function on every React
 * render — this means hooks declared inside the plugin's function are
 * subject to the regular React rules of hooks (stable order). Wrapping
 * the plugin's element in our own component lets the editor's
 * ErrorBoundary catch render-time exceptions cleanly.
 */
function PluginReactSubtree({
  render,
  page,
}: {
  render: PluginAdminAppRenderFn
  page: AppPluginPageRoute
}): ReactElement {
  const api = useMemo(() => createAdminPluginApi(page.pluginId), [page.pluginId])
  return render({
    page,
    api,
    ui: pluginAdminUi,
    h: pluginH,
    hooks: pluginHooks,
  })
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'react'; render: PluginAdminAppRenderFn }
  | { kind: 'error'; message: string }

function PluginAppPage({
  page,
  importModule,
}: {
  page: AppPluginPageRoute
  importModule?: PluginAdminAppImport
}) {
  // Track the page identity that produced the current `loadState`. When
  // the page changes (different plugin or different page id), the next
  // render emits `loading` immediately while the effect below imports
  // the new plugin module. Threading a `key` through state means we can
  // discard the stale `loaded` payload if a new page arrived first,
  // without doing a `setState` inside useEffect's body (cascade renders).
  const pageKey = `${page.pluginId}:${page.id}`
  const [loadState, setLoadState] = useState<LoadState & { key?: string }>({
    kind: 'loading',
    key: pageKey,
  })
  const visibleState: LoadState = loadState.key === pageKey
    ? loadState
    : { kind: 'loading' }

  useEffect(() => {
    let cancelled = false
    void loadPluginAdminAppModule(page, importModule)
      .then((loaded) => {
        if (cancelled) return
        setLoadState({ kind: 'react', render: loaded.render, key: pageKey })
      })
      .catch((err) => {
        if (cancelled) return
        setLoadState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not load plugin app',
          key: pageKey,
        })
      })
    return () => { cancelled = true }
  }, [importModule, page, pageKey])

  return (
    <section className={styles.pluginPage} aria-labelledby="plugin-page-title">
      <header className={styles.pluginPageHeader}>
        <p>{page.pluginName}</p>
        <h1 id="plugin-page-title">{page.content.heading}</h1>
      </header>

      {visibleState.kind === 'loading' && (
        <p className={styles.emptyState}>Loading plugin app...</p>
      )}
      {visibleState.kind === 'error' && (
        <p className={styles.error} role="alert">{visibleState.message}</p>
      )}
      {visibleState.kind === 'react' && (
        <PluginReactSubtree render={visibleState.render} page={page} />
      )}
    </section>
  )
}

function emptyForm(resource: PluginResource | null): Record<string, string | boolean> {
  if (!resource) return {}
  return Object.fromEntries(resource.fields.map((field) => [
    field.id,
    field.type === 'boolean' ? false : '',
  ]))
}

function recordValue(record: PluginRecord, field: PluginResourceField): string {
  const value = record.data[field.id]
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === undefined || value === null) return ''
  return String(value)
}

function PluginResourcePage({ page }: { page: ResourcePluginPageRoute }) {
  const [resource, setResource] = useState<PluginResource | null>(null)
  const [records, setRecords] = useState<PluginRecord[]>([])
  const [formData, setFormData] = useState<Record<string, string | boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadResource() {
      setLoading(true)
      setError(null)
      try {
        const payload = await loadCmsPluginResource(page.pluginId, page.content.resource)
        if (cancelled) return
        setResource(payload.resource)
        setRecords(payload.records)
        setFormData(emptyForm(payload.resource))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load plugin records')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadResource()
    return () => { cancelled = true }
  }, [page.content.resource, page.pluginId])

  function readFormRecord(): Record<string, unknown> {
    if (!resource) return {}
    const data: Record<string, unknown> = {}
    for (const field of resource.fields) {
      const value = formData[field.id]
      if (field.type === 'boolean') {
        data[field.id] = Boolean(value)
        continue
      }
      if (typeof value !== 'string' || !value.trim()) continue
      if (field.type === 'number') {
        data[field.id] = Number(value)
      } else {
        data[field.id] = value.trim()
      }
    }
    return data
  }

  async function createRecord() {
    if (!resource) return
    setSaving(true)
    setError(null)
    try {
      const record = await createCmsPluginResourceRecord(page.pluginId, resource.id, readFormRecord())
      setRecords((current) => [record, ...current])
      setFormData(emptyForm(resource))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create record')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord(record: PluginRecord) {
    if (!resource) return
    setError(null)
    try {
      await deleteCmsPluginResourceRecord(page.pluginId, resource.id, record.id)
      setRecords((current) => current.filter((candidate) => candidate.id !== record.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete record')
    }
  }

  return (
    <section className={styles.pluginPage} aria-labelledby="plugin-page-title">
      <header className={styles.pluginPageHeader}>
        <p>{page.pluginName}</p>
        <h1 id="plugin-page-title">{page.content.heading}</h1>
      </header>

      {loading ? (
        <p className={styles.emptyState}>Loading records...</p>
      ) : error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : resource ? (
        <div className={styles.resourceLayout}>
          <form
            className={styles.resourceForm}
            onSubmit={(event) => {
              event.preventDefault()
              void createRecord()
            }}
          >
            <h2>New {resource.singularLabel ?? resource.title}</h2>
            {resource.fields.map((field) => (
              <label key={field.id} className={styles.resourceField}>
                <span>{field.label}</span>
                {field.type === 'longtext' ? (
                  <textarea
                    value={String(formData[field.id] ?? '')}
                    required={field.required}
                    onChange={(event) => setFormData((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))}
                  />
                ) : field.type === 'boolean' ? (
                  <Checkbox
                    checked={Boolean(formData[field.id])}
                    onCheckedChange={(next) => setFormData((current) => ({
                      ...current,
                      [field.id]: next,
                    }))}
                  />
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    value={String(formData[field.id] ?? '')}
                    required={field.required}
                    onChange={(event) => setFormData((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))}
                  />
                )}
              </label>
            ))}
            <Button variant="primary" size="sm" type="submit" disabled={saving}>
              <span>{saving ? 'Creating' : `Create ${resource.singularLabel ?? resource.title}`}</span>
            </Button>
          </form>

          <div className={styles.resourceRecords} aria-label={`${resource.title} records`}>
            {records.length === 0 ? (
              <p className={styles.emptyState}>No records yet.</p>
            ) : records.map((record) => (
              <article key={record.id} className={styles.resourceRecord}>
                <dl>
                  {resource.fields.map((field) => (
                    <div key={field.id}>
                      <dt>{field.label}</dt>
                      <dd>{recordValue(record, field) || '-'}</dd>
                    </div>
                  ))}
                </dl>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void deleteRecord(record)}
                  aria-label={`Delete ${recordValue(record, resource.fields[0]) || record.id}`}
                >
                  <span>Delete</span>
                </Button>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.emptyState}>Plugin resource unavailable.</p>
      )}
    </section>
  )
}
