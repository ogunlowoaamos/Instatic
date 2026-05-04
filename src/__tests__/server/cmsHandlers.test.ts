import { describe, expect, it } from 'bun:test'
import { handleCmsRequest } from '../../../server/cms/handlers'
import type { DbClient, DbResult } from '../../../server/cms/db'
import { SESSION_COOKIE_NAME } from '../../../server/cms/auth'

function makeFakeDb() {
  const site: Record<string, unknown>[] = []
  const admins: Record<string, unknown>[] = []
  const sessions: Record<string, unknown>[] = []
  const pages: Record<string, unknown>[] = []

  const handle = async <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<DbResult<Row>> => {
    // Reconstruct a parameterized SQL string for pattern matching.
    const sql = strings.reduce<string>((acc, str, i) => (i === 0 ? str : `${acc}$${i}${str}`), '')
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    // getSetupStatus — no values
    if (normalized.includes('count(*)::int as count from site')) {
      return { rows: [{ count: site.length } as Row], rowCount: 1 }
    }
    if (normalized.includes('count(*)::int as count from admin_users')) {
      return { rows: [{ count: admins.length } as Row], rowCount: 1 }
    }
    // createSite (repositories.ts) — values[0]=name, values[1]=settings
    // saveDraftSite (siteRepository.ts) — values[0]=name, values[1]=siteShell (via transaction)
    if (normalized.includes('insert into site')) {
      const row = { id: 'default', name: values[0], settings_json: values[1] }
      const index = site.findIndex((s) => s.id === 'default')
      if (index >= 0) site[index] = row
      else site.push(row)
      return { rows: [], rowCount: 1 }
    }
    // createAdminUser — values[0]=id, values[1]=email, values[2]=passwordHash
    if (normalized.includes('insert into admin_users')) {
      admins.push({
        id: values[0],
        email: values[1],
        password_hash: values[2],
        created_at: new Date().toISOString(),
      })
      return { rows: [], rowCount: 1 }
    }
    // saveDraftSite pages (siteRepository.ts, via transaction) — values[0..4]=id, title, slug, page, index
    if (normalized.includes('insert into pages')) {
      const page = {
        id: values[0],
        title: values[1],
        slug: values[2],
        draft_document_json: values[3],
        sort_order: values[4],
      }
      const index = pages.findIndex((p) => p.id === page.id)
      if (index >= 0) pages[index] = page
      else pages.push(page)
      return { rows: [], rowCount: 1 }
    }
    // findAdminByEmail — values[0]=email
    if (normalized.includes('select id, email, password_hash')) {
      return { rows: admins.filter((a) => a.email === values[0]) as Row[], rowCount: 1 }
    }
    // createSession — values[0]=idHash, values[1]=adminUserId, values[2]=expiresAt
    if (normalized.includes('insert into sessions')) {
      sessions.push({ id_hash: values[0], admin_user_id: values[1], expires_at: values[2] })
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unhandled SQL: ${sql}`)
  }

  handle.transaction = async <T>(cb: (tx: DbClient) => Promise<T>): Promise<T> =>
    cb(handle as unknown as DbClient)

  return Object.assign(handle as DbClient, { site, admins, sessions, pages })
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>
}

describe('CMS handlers', () => {
  it('reports setup status', async () => {
    const db = makeFakeDb()
    const res = await handleCmsRequest(new Request('http://localhost/api/cms/setup/status'), db)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ hasSite: false, hasAdmin: false, needsSetup: true })
  })

  it('creates the first site, admin account, and a starter homepage', async () => {
    const db = makeFakeDb()
    const res = await handleCmsRequest(new Request('http://localhost/api/cms/setup', {
      method: 'POST',
      body: JSON.stringify({ siteName: 'Example', email: 'owner@example.com', password: 'long-enough-password' }),
      headers: { 'content-type': 'application/json' },
    }), db)
    expect(res.status).toBe(201)
    expect(await json(res)).toMatchObject({ ok: true })
    expect(db.site).toHaveLength(1)
    expect(db.admins).toHaveLength(1)
    // A starter homepage MUST be seeded — SiteDocumentSchema requires
    // pages.length >= 1, otherwise the editor errors on first load.
    expect(db.pages).toHaveLength(1)
    expect(db.pages[0]).toMatchObject({ title: 'Home', slug: 'index', sort_order: 0 })
    const doc = db.pages[0].draft_document_json as { rootNodeId: string; nodes: Record<string, { moduleId: string }> }
    expect(doc.nodes[doc.rootNodeId].moduleId).toBe('base.root')
  })

  it('refuses setup after an admin exists', async () => {
    const db = makeFakeDb()
    db.site.push({ id: 'default', name: 'Existing' })
    db.admins.push({ id: 'admin_1', email: 'owner@example.com', password_hash: 'hash' })
    const res = await handleCmsRequest(new Request('http://localhost/api/cms/setup', {
      method: 'POST',
      body: JSON.stringify({ siteName: 'Example', email: 'new@example.com', password: 'long-enough-password' }),
      headers: { 'content-type': 'application/json' },
    }), db)
    expect(res.status).toBe(409)
  })

  it('logs in and sets an HttpOnly session cookie', async () => {
    const db = makeFakeDb()
    await handleCmsRequest(new Request('http://localhost/api/cms/setup', {
      method: 'POST',
      body: JSON.stringify({ siteName: 'Example', email: 'owner@example.com', password: 'long-enough-password' }),
      headers: { 'content-type': 'application/json' },
    }), db)
    const res = await handleCmsRequest(new Request('http://localhost/api/cms/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner@example.com', password: 'long-enough-password' }),
      headers: { 'content-type': 'application/json' },
    }), db)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
    expect(db.sessions).toHaveLength(1)
  })
})
