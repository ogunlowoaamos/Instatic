import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../server/auth/tokens'
import type { DbClient, DbResult } from '../../../server/db'
import { handleCmsRequest } from '../../../server/handlers/cms'
import {
  createMediaAsset,
  deleteMediaAsset,
  listMediaAssets,
  renameMediaAsset,
} from '../../../server/repositories/media'

// Real magic-byte prefixes used to make the upload handler's MIME sniffer
// accept the test fixture as the indicated type. Padded with a few bytes
// so the prefix never coincides with `file.size <= 0`.
const PNG_PREFIX = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
const JPEG_PREFIX = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

function pngFile(name: string): File {
  return new File([PNG_PREFIX], name, { type: 'image/png' })
}

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

    if (normalized.includes('from sessions') && normalized.includes('join users')) {
      const session = sessions.find((s) => String(s.id_hash) === String(values[0]))
      if (!session) return { rows: [], rowCount: 0 }
      const admin = admins.find((a) => a.id === session.user_id)
      return {
        rows: admin ? [{
          ...admin,
          email_normalized: admin.email,
          display_name: 'Owner',
          status: 'active',
          role_id: 'owner',
          last_login_at: null,
          updated_at: admin.created_at,
          deleted_at: null,
          role_slug: 'owner',
          role_name: 'Owner',
          role_description: '',
          role_is_system: true,
          role_capabilities_json: ['media.manage'],
        } as Row] : [],
        rowCount: admin ? 1 : 0,
      }
    }
    if (normalized.includes('update sessions') && normalized.includes('last_seen_at')) {
      return { rows: [], rowCount: 1 }
    }
    // createMediaAsset — values[0..6] = id, filename, mimeType, sizeBytes, storagePath, publicPath, uploadedByUserId
    if (normalized.includes('insert into media_assets')) {
      const row = {
        id: values[0],
        filename: values[1],
        mime_type: values[2],
        size_bytes: values[3],
        storage_path: values[4],
        public_path: values[5],
        uploaded_by_user_id: values[6],
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
    user_id: 'admin_1',
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
      uploadedByUserId: 'user_1',
    })

    const assets = await listMediaAssets(db)

    expect(assets).toEqual([{
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      publicPath: '/uploads/asset_1-hero.png',
      uploadedByUserId: 'user_1',
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
      uploadedByUserId: 'user_1',
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
      uploadedByUserId: 'user_1',
    })

    const deleted = await deleteMediaAsset(db, 'asset_1')

    expect(deleted?.storagePath).toBe('asset_1-hero.png')
    expect(db.media).toHaveLength(0)
  })
})

describe('CMS media handlers', () => {
  it('requires an admin session for media listing', async () => {
    const res = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/media'),
      makeFakeDb(),
    )

    expect(res.status).toBe(401)
  })

  it('uploads image files to disk and stores metadata for authenticated admins', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    const body = new FormData()
    body.set('file', pngFile('Hero Image.png'))

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/media', {
          method: 'POST',
          headers: { cookie },
          formData: body,
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(201)
      const payload = await res.json() as {
        asset: { filename: string; publicPath: string; mimeType: string; uploadedByUserId: string }
      }
      expect(payload.asset).toMatchObject({
        filename: 'Hero Image.png',
        mimeType: 'image/png',
        uploadedByUserId: 'admin_1',
      })
      expect(payload.asset.publicPath).toStartWith('/uploads/')
      expect(db.media).toHaveLength(1)
      // The on-disk extension is server-chosen (`.png`), not user-supplied —
      // the original filename's extension is irrelevant once stripped.
      expect(extname(String(db.media[0].storage_path))).toBe('.png')
      expect(new Uint8Array(await readFile(join(uploadsDir, String(db.media[0].storage_path))))).toEqual(PNG_PREFIX)
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  // F-0002 regression: stored XSS via spoofed Content-Type was the entry
  // point. The upload handler MUST reject any file whose actual bytes do
  // not match an accepted image/video signature, regardless of what the
  // client claimed in the multipart `Content-Type` header.
  it('rejects an HTML payload that lies about its Content-Type as image/png (F-0002)', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    const body = new FormData()
    // Attacker plants `<script>` HTML but sets the multipart Content-Type
    // to `image/png`. Old code accepted this and wrote `pwn.html` to disk.
    body.set(
      'file',
      new File(['<!doctype html><script>alert(1)</script>'], 'pwn.html', { type: 'image/png' }),
    )

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/media', {
          method: 'POST',
          headers: { cookie },
          formData: body,
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        error: expect.stringContaining('JPEG'),
      })
      expect(db.media).toHaveLength(0)
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  // F-0002 regression: even when the bytes ARE valid (e.g. a real PNG), the
  // user-supplied filename extension must not survive — otherwise an
  // attacker could plant `pwn.html` filename containing real PNG bytes
  // (still gets `text/html` from the static handler's extension lookup) or
  // vary other tricks. The on-disk filename extension MUST be server-chosen.
  it('strips the user-supplied filename extension and uses a server-chosen one (F-0002)', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    const body = new FormData()
    // Real PNG bytes, but the filename claims `.html`. Server must rename
    // it to `.png` (the magic-byte-derived extension) on disk.
    body.set('file', new File([PNG_PREFIX], 'pwn.html', { type: 'image/png' }))

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/media', {
          method: 'POST',
          headers: { cookie },
          formData: body,
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(201)
      expect(db.media).toHaveLength(1)
      const storagePath = String(db.media[0].storage_path)
      expect(extname(storagePath)).toBe('.png')
      expect(storagePath.endsWith('.html')).toBe(false)
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  it('rejects an SVG upload (XSS gadget — explicitly off the allowlist)', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    const body = new FormData()
    body.set(
      'file',
      new File(
        ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
        'evil.svg',
        { type: 'image/svg+xml' },
      ),
    )

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/media', {
          method: 'POST',
          headers: { cookie },
          formData: body,
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(400)
      expect(db.media).toHaveLength(0)
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  it('accepts a JPEG when bytes match the JPEG signature', async () => {
    const db = makeFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    const body = new FormData()
    body.set('file', new File([JPEG_PREFIX], 'photo.jpg', { type: 'image/jpeg' }))

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/media', {
          method: 'POST',
          headers: { cookie },
          formData: body,
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(201)
      expect(db.media).toHaveLength(1)
      expect(db.media[0].mime_type).toBe('image/jpeg')
      expect(extname(String(db.media[0].storage_path))).toBe('.jpg')
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
      uploadedByUserId: 'user_1',
    })

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/media', {
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
      uploadedByUserId: 'user_1',
    })

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/admin/api/cms/media/asset_1', {
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
      uploadedByUserId: 'user_1',
    })
    await writeFile(join(uploadsDir, 'asset_1-hero.png'), 'image-bytes')

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/admin/api/cms/media/asset_1', {
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
