import { afterEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PluginPageRenderer } from '@plugins/components/PluginPageRenderer/PluginPageRenderer'
import type {
  PluginAdminAppRenderFn,
  PluginAdminPageRoute,
} from '@core/plugin-sdk'

const originalFetch = globalThis.fetch

const booksPage: PluginAdminPageRoute = {
  pluginId: 'acme.books',
  pluginName: 'Books',
  id: 'books',
  title: 'Books',
  navLabel: 'Books',
  route: '/admin/plugins/acme.books/books',
  content: {
    kind: 'resource',
    heading: 'Books',
    resource: 'books',
  },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  cleanup()
})

describe('PluginPageRenderer resource pages', () => {
  it('loads backend records and creates new records through the plugin resource API', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init })
      const url = String(input)

      if (url === '/admin/api/cms/plugins/acme.books/resources/books/records' && init?.method === 'GET') {
        return json({
          resource: {
            id: 'books',
            title: 'Books',
            singularLabel: 'Book',
            pluralLabel: 'Books',
            fields: [
              { id: 'title', label: 'Title', type: 'text', required: true },
              { id: 'author', label: 'Author', type: 'text' },
            ],
          },
          records: [{
            id: 'record_1',
            pluginId: 'acme.books',
            resourceId: 'books',
            data: { title: 'Invisible Cities', author: 'Italo Calvino' },
            createdAt: '2026-05-01T10:00:00.000Z',
            updatedAt: '2026-05-01T10:00:00.000Z',
          }],
        })
      }

      if (url === '/admin/api/cms/plugins/acme.books/resources/books/records' && init?.method === 'POST') {
        return json({
          record: {
            id: 'record_2',
            pluginId: 'acme.books',
            resourceId: 'books',
            data: JSON.parse(String(init.body)).data,
            createdAt: '2026-05-01T10:05:00.000Z',
            updatedAt: '2026-05-01T10:05:00.000Z',
          },
        }, 201)
      }

      return json({ error: `Unhandled ${url}` }, 500)
    }

    render(<PluginPageRenderer page={booksPage} />)

    expect(await screen.findByText('Invisible Cities')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The Dispossessed' } })
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Ursula K. Le Guin' } })
    fireEvent.click(screen.getByRole('button', { name: /create book/i }))

    await waitFor(() => {
      expect(calls.some((call) =>
        String(call.input) === '/admin/api/cms/plugins/acme.books/resources/books/records' &&
        call.init?.method === 'POST' &&
        call.init.body === JSON.stringify({
          data: {
            title: 'The Dispossessed',
            author: 'Ursula K. Le Guin',
          },
        })
      )).toBe(true)
    })
  })

  it('mounts packaged admin app pages and threads the plugin-scoped CMS API into the SDK render fn', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init })
      return json({
        resource: {
          id: 'approvals',
          title: 'Approvals',
          fields: [
            { id: 'pageTitle', label: 'Page Title', type: 'text', required: true },
          ],
        },
        records: [{
          id: 'record_1',
          pluginId: 'acme.demo',
          resourceId: 'approvals',
          data: { pageTitle: 'Home', status: 'approved' },
          createdAt: '2026-05-01T10:00:00.000Z',
          updatedAt: '2026-05-01T10:00:00.000Z',
        }],
      })
    }

    render(
      <PluginPageRenderer
        page={{
          pluginId: 'acme.demo',
          pluginName: 'Demo Plugin',
          id: 'dashboard',
          title: 'Dashboard',
          route: '/admin/plugins/acme.demo/dashboard',
          content: {
            kind: 'app',
            heading: 'Demo Dashboard',
            entry: 'admin/dashboard.js',
            assetPath: '/uploads/plugins/acme.demo/1.0.0',
          },
        }}
        importModule={async (url) => {
          expect(url).toBe('/uploads/plugins/acme.demo/1.0.0/admin/dashboard.js')
          return {
            default: ({ h, hooks, api }) => {
              const [count, setCount] = hooks.useState<number | null>(null)
              hooks.useEffect(() => {
                let cancelled = false
                void api.cms.storage.collection('approvals').list().then((records) => {
                  if (!cancelled) setCount(records.length)
                })
                return () => { cancelled = true }
              }, [])
              return h('strong', null, count === null ? 'Loading...' : `Approvals: ${count}`)
            },
          }
        }}
      />,
    )

    expect(await screen.findByText('Approvals: 1')).toBeDefined()
    expect(calls[0]?.input).toBe('/admin/api/cms/plugins/acme.demo/resources/approvals/records')
  })

  it('keeps stale async admin app loads from duplicating the visible plugin UI', async () => {
    const appPage: PluginAdminPageRoute = {
      pluginId: 'acme.demo',
      pluginName: 'Demo Plugin',
      id: 'dashboard',
      title: 'Dashboard',
      route: '/admin/plugins/acme.demo/dashboard',
      content: {
        kind: 'app',
        heading: 'Demo Dashboard',
        entry: 'admin/dashboard.js',
        assetPath: '/uploads/plugins/acme.demo/1.0.0',
      },
    }

    type Resolver = (mod: { default: PluginAdminAppRenderFn }) => void
    const imports: Resolver[] = []
    const importModule = async () =>
      await new Promise<{ default: PluginAdminAppRenderFn }>((resolve) => {
        imports.push(resolve)
      })

    const renderFn: PluginAdminAppRenderFn = ({ h }) => h('strong', null, 'Plugin dashboard subtree')

    const { rerender } = render(<PluginPageRenderer page={{ ...appPage }} importModule={importModule} />)

    await waitFor(() => {
      expect(imports).toHaveLength(1)
    })

    rerender(<PluginPageRenderer page={{ ...appPage }} importModule={importModule} />)

    await waitFor(() => {
      expect(imports).toHaveLength(2)
    })

    await act(async () => {
      imports[0]({ default: renderFn })
      imports[1]({ default: renderFn })
    })

    await waitFor(() => {
      expect(screen.getAllByText('Plugin dashboard subtree')).toHaveLength(1)
    })
  })
})
