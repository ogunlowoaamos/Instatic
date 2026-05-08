import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleServerRequest } from '../../../server/router'
import { createFakeDb } from './dbTestFake'

// Static file serving tests never touch the database.
const fakeDb = createFakeDb(async (sql) => {
  throw new Error(`Unexpected DB call in static admin test: ${sql}`)
})

function createStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'page-builder-static-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<div id="root">admin app</div>')
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("admin")')
  return dir
}

describe('self-hosted admin static serving', () => {
  it('serves the built admin SPA at /admin', async () => {
    const staticDir = createStaticDir()
    try {
      const res = await handleServerRequest(new Request('http://localhost/admin'), {
        db: fakeDb,
        staticDir,
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(await res.text()).toContain('admin app')
    } finally {
      rmSync(staticDir, { recursive: true, force: true })
    }
  })

  it('serves built asset files from /assets', async () => {
    const staticDir = createStaticDir()
    try {
      const res = await handleServerRequest(new Request('http://localhost/assets/app.js'), {
        db: fakeDb,
        staticDir,
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('javascript')
      expect(await res.text()).toContain('console.log')
    } finally {
      rmSync(staticDir, { recursive: true, force: true })
    }
  })

  it('serves uploaded media files from /uploads', async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    try {
      writeFileSync(join(uploadsDir, 'hero.png'), 'image-bytes')

      const res = await handleServerRequest(new Request('http://localhost/uploads/hero.png'), {
        db: fakeDb,
        uploadsDir,
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('image/png')
      // Inert image MIMEs are allowed to render inline (no `attachment`).
      expect(res.headers.get('content-disposition')).toBeNull()
      // Defense-in-depth header should be set unconditionally for /uploads/*.
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(await res.text()).toBe('image-bytes')
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  // F-0002 regression: even if a file with an unsafe extension somehow
  // landed in the uploads dir (legacy file from before extension hardening,
  // or a future regression), forcing `Content-Disposition: attachment` on
  // any non-inert MIME prevents top-level navigation from rendering it as
  // HTML on the admin origin.
  it('forces attachment disposition for non-inert MIMEs in /uploads (F-0002)', async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    try {
      writeFileSync(join(uploadsDir, 'pwn.html'), '<script>alert(1)</script>')

      const res = await handleServerRequest(new Request('http://localhost/uploads/pwn.html'), {
        db: fakeDb,
        uploadsDir,
      })

      expect(res.status).toBe(200)
      // The static handler still derives Content-Type from the extension —
      // that's OK because the disposition + nosniff together prevent
      // top-level execution on the admin origin.
      expect(res.headers.get('content-disposition')).toBe('attachment')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  it('forces attachment disposition for SVG in /uploads (XSS gadget)', async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    try {
      writeFileSync(
        join(uploadsDir, 'evil.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      )

      const res = await handleServerRequest(new Request('http://localhost/uploads/evil.svg'), {
        db: fakeDb,
        uploadsDir,
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toBe('attachment')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })
})
