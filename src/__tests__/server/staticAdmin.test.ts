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
      expect(await res.text()).toBe('image-bytes')
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })
})
