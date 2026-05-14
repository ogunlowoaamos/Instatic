/**
 * Media library endpoints (gated by `media.manage`).
 *
 *   GET    /admin/api/cms/media       — list every uploaded asset
 *   POST   /admin/api/cms/media       — upload a new image/video file
 *                                        (multipart `file=`, max 50MB)
 *   PATCH  /admin/api/cms/media/:id   — rename a stored asset
 *   DELETE /admin/api/cms/media/:id   — delete the row + remove the file
 *
 * The upload pipeline (multipart parse, magic-byte MIME sniff, sanitised
 * on-disk filename, media row insert) lives in `./mediaUpload.ts` and is
 * shared with the avatar endpoint in `./me.ts`. Anything that writes to
 * `uploads/` MUST go through `acceptUploadedMedia` so the byte-level
 * checks stay in one place.
 */
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { DbClient } from '../../db/client'
import { requireCapability } from '../../auth/authz'
import {
  deleteMediaAsset,
  listMediaAssets,
  renameMediaAsset,
} from '../../repositories/media'
import { badRequest, jsonResponse, methodNotAllowed, readJsonObject } from '../../http'
import { readString, type CmsHandlerOptions } from './shared'
import {
  EXTENSION_FOR_MIME,
  acceptUploadedMedia,
  readUploadedFile,
  uploadsDirRequired,
} from './mediaUpload'

const MAX_MEDIA_BYTES = 50 * 1024 * 1024

const MEDIA_LIBRARY_MIMES = Object.keys(EXTENSION_FOR_MIME) as Array<
  keyof typeof EXTENSION_FOR_MIME
>

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
      if (!options.uploadsDir) return uploadsDirRequired()

      const file = await readUploadedFile(req)
      if (!file) return badRequest('Missing file')

      const result = await acceptUploadedMedia(db, {
        file,
        maxBytes: MAX_MEDIA_BYTES,
        allowedMimes: MEDIA_LIBRARY_MIMES,
        uploadsDir: options.uploadsDir,
        uploadedByUserId: user.id,
        oversizedMessage: 'File exceeds the 50 MB hard limit',
        unsupportedMessage:
          'Only JPEG, PNG, GIF, WebP, MP4, and WebM files can be uploaded',
      })
      if (result instanceof Response) return result
      return jsonResponse({ asset: result }, { status: 201 })
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
      if (!options.uploadsDir) return uploadsDirRequired()

      const deleted = await deleteMediaAsset(db, assetId)
      if (!deleted) return jsonResponse({ error: 'Media asset not found' }, { status: 404 })

      await rm(join(options.uploadsDir, deleted.storagePath), { force: true })
      return jsonResponse({ ok: true })
    }

    return methodNotAllowed()
  }

  return null
}
