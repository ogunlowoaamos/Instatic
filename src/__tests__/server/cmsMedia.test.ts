import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../server/cms/auth'
import type { DbClient, DbResult } from '../../../server/cms/db'
import { handleCmsRequest } from '../../../server/cms/handlers'
import {
  createMediaAsset,
  deleteMediaAsset,
  listMediaAssets,
  renameMediaAsset,
} from '../../../server/cms/mediaRepository'

function makeFakeDb() {
  const admins: Record<string, unknown>[] = [
    {
      id: 'admin_1',
      email: 'owner@example.com',
      password_hash: 'hash',
      created_at: new Date('2026-01-01').toISOString(),
    },
  ]
  const sessions: Record<string, unknown>[] = []
  const media: Record<string, unknown>[] = []

  const handle = async <Row extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<DbResult<Row>> => {
    // Reconstruct a parameterized SQL string for pattern matching.
    const sql = strings.reduce<string>((acc, str, i) => (i === 0 ? str : `${acc}$${i}${str}`), '')
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    // findAdminBySessionHash — values[0] = idHash
    if (normalized.includes('select admin_users.id, admin_users.email')) {
      const session = sessions.find((s) => String(s.id_hash) === String(values[0]))
      if (!session) return { rows: [], rowCount: 0 }
      const admin = admins.find((a) => a.id === session.admin_user_id)
      return { rows: admin ? [admin as Row] : [], rowCount: admin ? 1 : 0 }
    }
    // createMediaAsset — values[0..5] = id, filename, mimeType, sizeBytes, storagePath, publicPath
    if (normalized.includes('insert into media_assets')) {
      const row = {
        id: values[0],
        filename: values[1],
        mime_type: values[2],
        size_bytes: values[3],
        storage_path: values[4],
        public_path: values[5],
        created_at: new Date('2026-01-03').toISOString(),
      }
      media.push(row)
      return { rows: [row as Row], rowCount: 1 }
    }
    // listMediaAssets — no values
    if (normalized.includes('select id, filename, mime_type')) {
      return { rows: [...media].reverse() as Row[], rowCount: media.length }
    }
    // renameMediaAsset — values[0] = filename, values[1] = id
    if (normalized.includes('update media_assets set filename')) {
      const row = media.find((asset) => asset.id === values[1])
      if (!row) return { rows: [], rowCount: 0 }
      row.filename = values[0]
      return { rows: [row as Row], rowCount: 1 }
    }
    // deleteMediaAsset — values[0] = id
    if (normalized.includes('delete from media_assets')) {
      const index = media.findIndex((asset) => asset.id === values[0])
      if (index === -1) return { rows: [], rowCount: 0 }
      const [row] = media.splice(index, 1)
      return { rows: [row as Row], rowCount: 1 }
    }
    throw new Error(`Unhandled SQL: ${sql}`)
  }

  handle.transaction = async <T>(cb: (tx: DbClient) => Promise<T>): Promise<T> =>
    cb(handle as unknown as DbClient)

  return Object.assign(handle as DbClient, { admins, sessions, media })
}

async function createCookie(db: ReturnType<typeof makeFakeDb>): Promise<string> {
  const token = 'valid-session-token'
  db.sessions.push({
    id_hash: await hashSessionToken(token),
    admin_user_id: 'admin_1',
    expires_at: new Date('2030-01-01').toISOString(),
  })
  return `${SESSION_COOKIE_NAME}=${token}`
}

function cmsRequest(
  url: string,
  init: { method?: string; formData?: FormData; headers?: Record<string, string>; body?: string } = {},
): Request {
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    url,
    method: init.method ?? 'GET',
    headers: {
      get(name: string) {
        return headers.get(name.toLowerCase()) ?? null
      },
    },
    async formData() {
      return init.formData ?? new FormData()
    },
    async json() {
      return init.body ? JSON.parse(init.body) : {}
    },
  } as Request
}

describe('CMS media repository', () => {
  it('stores and lists media asset metadata newest-first', async () => {
    const db = makeFakeDb()

    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const assets = await listMediaAssets(db)

    expect(assets).toEqual([{
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      publicPath: '/uploads/asset_1-hero.png',
      createdAt: '2026-01-03T00:00:00.000Z',
    }])
  })

  it('renames media asset metadata', async () => {
    const db = makeFakeDb()

    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const asset = await renameMediaAsset(db, 'asset_1', 'Hero renamed.png')

    expect(asset?.filename).toBe('Hero renamed.png')
    expect(db.media[0].filename).toBe('Hero renamed.png')
  })

  it('deletes media asset metadata and returns its storage path', async () => {
    const db = makeFakeDb()

    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const deleted = await deleteMediaAsset(db, 'asset_1')

    expect(deleted?.storagePath).toBe('asset_1-hero.png')
    expect(db.media).toHaveLength(0)
  })
})

describe('CMS media handlers', () => {
  it('requires an admin session for media listing', async () => {
    const res = await handleCmsRequest(
      cmsRequest('http://localhost/api/cms/media'),
      makeFakeDb(),
    )

    expect(res.status).toBe(401)
  })

  it('uploads image files to disk and stores metadata for authenticated admins', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    const body = new FormData()
    body.set('file', new File(['image-bytes'], 'Hero Image.png', { type: 'image/png' }))

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/api/cms/media', {
          method: 'POST',
          headers: { cookie },
          formData: body,
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(201)
      const payload = await res.json() as { asset: { filename: string; publicPath: string; mimeType: string } }
      expect(payload.asset).toMatchObject({
        filename: 'Hero Image.png',
        mimeType: 'image/png',
      })
      expect(payload.asset.publicPath).toStartWith('/uploads/')
      expect(db.media).toHaveLength(1)
      expect(await readFile(join(uploadsDir, String(db.media[0].storage_path)), 'utf-8')).toBe('image-bytes')
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  it('lists uploaded media assets for authenticated admins', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/api/cms/media', {
        headers: { cookie },
      }),
      db,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      assets: [{ filename: 'hero.png', publicPath: '/uploads/asset_1-hero.png' }],
    })
  })

  it('renames uploaded media assets for authenticated admins', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/api/cms/media/asset_1', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'Hero renamed.png' }),
      }),
      db,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      asset: { filename: 'Hero renamed.png', publicPath: '/uploads/asset_1-hero.png' },
    })
  })

  it('deletes uploaded media assets and removes their stored file for authenticated admins', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })
    await writeFile(join(uploadsDir, 'asset_1-hero.png'), 'image-bytes')

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/api/cms/media/asset_1', {
          method: 'DELETE',
          headers: { cookie },
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(db.media).toHaveLength(0)
      await expect(readFile(join(uploadsDir, 'asset_1-hero.png'), 'utf-8')).rejects.toThrow()
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })
})
