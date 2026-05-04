import { describe, expect, it } from 'bun:test'
import { handleServerRequest } from '../../../server/router'
import type { DbClient, DbResult } from '../../../server/cms/db'

interface FakeDbCounts {
  site: number
  adminUsers: number
}

class RouterFakeDb implements DbClient {
  constructor(private readonly counts: FakeDbCounts = { site: 0, adminUsers: 0 }) {}

  async query<Row = Record<string, unknown>>(sql: string): Promise<DbResult<Row>> {
    const normalized = sql.toLowerCase()
    if (normalized.includes('count(*)::int as count from site')) {
      return { rows: [{ count: this.counts.site } as Row], rowCount: 1 }
    }
    if (normalized.includes('count(*)::int as count from admin_users')) {
      return { rows: [{ count: this.counts.adminUsers } as Row], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
  }
}

describe('server router', () => {
  it('serves health checks', async () => {
    const res = await handleServerRequest(new Request('http://localhost/health'), { db: new RouterFakeDb() })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })

  it('routes cms setup status', async () => {
    const res = await handleServerRequest(new Request('http://localhost/api/cms/setup/status'), { db: new RouterFakeDb() })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ needsSetup: true })
  })

  it('redirects unmatched public routes to /admin on a fresh install', async () => {
    const res = await handleServerRequest(
      new Request('http://localhost/'),
      { db: new RouterFakeDb({ site: 0, adminUsers: 0 }) },
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin')
  })

  it('returns 404 for unknown routes once setup is complete', async () => {
    const res = await handleServerRequest(
      new Request('http://localhost/nope'),
      { db: new RouterFakeDb({ site: 1, adminUsers: 1 }) },
    )
    expect(res.status).toBe(404)
  })

  it('explains where the admin UI lives when /admin is hit on the cms port without a build', async () => {
    const res = await handleServerRequest(
      new Request('http://localhost/admin'),
      { db: new RouterFakeDb() },
    )
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    const body = await res.text()
    expect(body).toContain('http://localhost:5173/admin')
  })
})
