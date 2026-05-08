/**
 * Media library endpoints (gated by `media.manage`).
 *
 *   GET    /admin/api/cms/media       — list every uploaded asset
 *   POST   /admin/api/cms/media       — upload a new image/video file
 *                                        (multipart `file=`, max 50MB)
 *   PATCH  /admin/api/cms/media/:id   — rename a stored asset
 *   DELETE /admin/api/cms/media/:id   — delete the row + remove the file
 *
 * The upload writes the bytes to `<uploadsDir>/<nanoid>-<safeName>` and
 * stores both the storage path and the public URL on the row.
 *
 * Security model — DO NOT TRUST CLIENT-SUPPLIED METADATA:
 *   - We never inspect the multipart `Content-Type` (`file.type`); it is
 *     attacker-controllable and was the entry point for stored XSS via
 *     `image/png`-claimed `.html` payloads.
 *   - The accepted MIME is derived from the actual file bytes (magic-byte
 *     sniffing). Anything that doesn't match a known image/video signature
 *     in `MEDIA_MAGIC_SIGNATURES` is rejected at the boundary, so corrupt
 *     or misrepresented payloads never hit disk.
 *   - The on-disk extension is the server-chosen one for the detected MIME
 *     (see `EXTENSION_FOR_MIME`), NOT the user-supplied extension. Even if
 *     the static handler later derives Content-Type from the on-disk
 *     extension, the worst it can serve is the inert image/video MIME we
 *     verified ourselves.
 *   - SVG is deliberately not on the allowlist — SVG can carry inline
 *     `<script>` and `javascript:` URIs. Re-enabling SVG would require a
 *     DOMPurify SVG profile pass before persistence.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { nanoid } from 'nanoid'
import type { DbClient } from '../../db/client'
import { requireCapability } from '../../auth/authz'
import {
  createMediaAsset,
  deleteMediaAsset,
  listMediaAssets,
  renameMediaAsset,
} from '../../repositories/media'
import { badRequest, jsonResponse, methodNotAllowed, readJsonObject } from '../../http'
import { readString, type CmsHandlerOptions } from './shared'

const MAX_MEDIA_BYTES = 50 * 1024 * 1024

/**
 * Whitelist of media MIMEs we accept — keys are the canonical MIME, values
 * are the server-chosen on-disk extension. The static handler maps file
 * extension → Content-Type, so picking the extension here is what guarantees
 * the served Content-Type.
 *
 * Notably absent: `image/svg+xml` (SVG can carry `<script>`),
 * `application/pdf` (browsers may render PDFs inline with embedded JS),
 * anything HTML/CSS/JS adjacent.
 */
const EXTENSION_FOR_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
} as const

type AcceptedMediaMime = keyof typeof EXTENSION_FOR_MIME

/**
 * Magic-byte signatures for each accepted MIME. Each signature is a list of
 * `(offset, byte)` constraints — the file passes the signature if every
 * constraint is satisfied. Some formats (WebP, MP4) need non-contiguous
 * checks (`RIFF....WEBP`, `....ftyp`), hence the offset list rather than a
 * single contiguous prefix match.
 */
type MagicConstraint = readonly [offset: number, byte: number]

const MEDIA_MAGIC_SIGNATURES: ReadonlyArray<{
  mime: AcceptedMediaMime
  bytes: ReadonlyArray<MagicConstraint>
}> = [
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', bytes: [[0, 0x89], [1, 0x50], [2, 0x4e], [3, 0x47], [4, 0x0d], [5, 0x0a], [6, 0x1a], [7, 0x0a]] },
  // JPEG: FF D8 FF (SOI marker followed by any APPx marker)
  { mime: 'image/jpeg', bytes: [[0, 0xff], [1, 0xd8], [2, 0xff]] },
  // GIF87a / GIF89a
  { mime: 'image/gif', bytes: [[0, 0x47], [1, 0x49], [2, 0x46], [3, 0x38], [4, 0x37], [5, 0x61]] },
  { mime: 'image/gif', bytes: [[0, 0x47], [1, 0x49], [2, 0x46], [3, 0x38], [4, 0x39], [5, 0x61]] },
  // WebP: RIFF<size>WEBP — bytes 0..3 = RIFF, bytes 8..11 = WEBP
  { mime: 'image/webp', bytes: [[0, 0x52], [1, 0x49], [2, 0x46], [3, 0x46], [8, 0x57], [9, 0x45], [10, 0x42], [11, 0x50]] },
  // MP4 / ISO Base Media: `ftyp` box at offset 4..7. The first 4 bytes are
  // the box size which varies; only the type identifier matters here.
  { mime: 'video/mp4', bytes: [[4, 0x66], [5, 0x74], [6, 0x79], [7, 0x70]] },
  // WebM: EBML header 1A 45 DF A3 (also Matroska — close enough for us;
  // the content-type we serve is video/webm regardless and browsers will
  // refuse to play non-webm Matroska, which is the desired outcome).
  { mime: 'video/webm', bytes: [[0, 0x1a], [1, 0x45], [2, 0xdf], [3, 0xa3]] },
]

function detectAcceptedMime(bytes: Uint8Array): AcceptedMediaMime | null {
  for (const sig of MEDIA_MAGIC_SIGNATURES) {
    let matches = true
    for (const [offset, expected] of sig.bytes) {
      if (offset >= bytes.length || bytes[offset] !== expected) {
        matches = false
        break
      }
    }
    if (matches) return sig.mime
  }
  return null
}

/**
 * Strip the user-supplied extension off a filename and sanitise the stem,
 * leaving only `[a-zA-Z0-9_-]`. The caller is responsible for re-attaching
 * a server-trusted extension. Returns `'upload'` for empty / all-illegal
 * stems so the storage filename is never blank.
 *
 * NOTE: dot is no longer in the allow-list. Earlier versions kept dot to
 * preserve the original extension, which let an attacker plant `.html` and
 * have the static handler serve it as `text/html`. The fix is structural:
 * never trust user-supplied extensions for an on-disk filename.
 */
function safeStorageStem(filename: string): string {
  const normalized = filename.replace(/\\/g, '/')
  const stem = basename(normalized).replace(/\.[^.]*$/, '')
  const safe = stem.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '')
  return safe || 'upload'
}

async function readUploadedFile(req: Request): Promise<File | null> {
  const body = await req.formData()
  const file = body.get('file')
  return file instanceof File ? file : null
}

export async function handleMediaRoutes(
  req: Request,
  db: DbClient,
  options: CmsHandlerOptions,
): Promise<Response | null> {
  const url = new URL(req.url)

  if (url.pathname === '/admin/api/cms/media') {
    const user = await requireCapability(req, db, 'media.manage')
    if (user instanceof Response) return user

    if (req.method === 'GET') {
      return jsonResponse({ assets: await listMediaAssets(db) })
    }

    if (req.method === 'POST') {
      if (!options.uploadsDir) {
        return jsonResponse({ error: 'Uploads directory is not configured' }, { status: 500 })
      }

      const file = await readUploadedFile(req)
      if (!file) return badRequest('Missing file')
      if (file.size <= 0) return badRequest('File is empty')
      if (file.size > MAX_MEDIA_BYTES) return badRequest('File exceeds the 50 MB hard limit')

      // Detect MIME from the actual bytes (NEVER from `file.type`, which is
      // attacker-controlled in any non-browser HTTP client). Reject anything
      // that doesn't match a known image/video signature.
      const bytes = new Uint8Array(await file.arrayBuffer())
      const detectedMime = detectAcceptedMime(bytes)
      if (!detectedMime) {
        return badRequest('Only JPEG, PNG, GIF, WebP, MP4, and WebM files can be uploaded')
      }

      // Use the server-chosen extension for the on-disk filename so the
      // static handler's extension→Content-Type lookup can only ever yield
      // the verified inert MIME we just sniffed. The client-supplied
      // filename stem is sanitised but its extension (if any) is dropped.
      const storageName = `${safeStorageStem(file.name)}${EXTENSION_FOR_MIME[detectedMime]}`
      const storagePath = `${nanoid()}-${storageName}`
      const publicPath = `/uploads/${storagePath}`
      await mkdir(options.uploadsDir, { recursive: true })
      await writeFile(join(options.uploadsDir, storagePath), bytes)

      const asset = await createMediaAsset(db, {
        id: nanoid(),
        filename: file.name || storagePath,
        // Store the server-derived MIME, not the client's claim. Listing
        // and downstream consumers see the verified type.
        mimeType: detectedMime,
        sizeBytes: file.size,
        storagePath,
        publicPath,
        uploadedByUserId: user.id,
      })
      return jsonResponse({ asset }, { status: 201 })
    }

    return methodNotAllowed()
  }

  const mediaItemMatch = url.pathname.match(/^\/admin\/api\/cms\/media\/([^/]+)$/)
  if (mediaItemMatch) {
    const user = await requireCapability(req, db, 'media.manage')
    if (user instanceof Response) return user

    const assetId = decodeURIComponent(mediaItemMatch[1])

    if (req.method === 'PATCH') {
      const body = await readJsonObject(req)
      const filename = readString(body, 'filename')
      if (!filename) return badRequest('Filename is required')

      const asset = await renameMediaAsset(db, assetId, filename)
      if (!asset) return jsonResponse({ error: 'Media asset not found' }, { status: 404 })
      return jsonResponse({ asset })
    }

    if (req.method === 'DELETE') {
      if (!options.uploadsDir) {
        return jsonResponse({ error: 'Uploads directory is not configured' }, { status: 500 })
      }

      const deleted = await deleteMediaAsset(db, assetId)
      if (!deleted) return jsonResponse({ error: 'Media asset not found' }, { status: 404 })

      await rm(join(options.uploadsDir, deleted.storagePath), { force: true })
      return jsonResponse({ ok: true })
    }

    return methodNotAllowed()
  }

  return null
}
