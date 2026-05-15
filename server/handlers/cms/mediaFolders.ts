/**
 * Media folder endpoints (gated by `media.manage`).
 *
 *   GET    /admin/api/cms/media/folders         — flat list; client builds tree
 *   POST   /admin/api/cms/media/folders         — { name, parentId? }
 *   PATCH  /admin/api/cms/media/folders/:id     — { name?, parentId?, sortOrder? }
 *   DELETE /admin/api/cms/media/folders/:id     — cascade removes child folders +
 *                                                  asset membership rows (assets
 *                                                  themselves stay, just become
 *                                                  Uncategorized)
 *
 * Slug is auto-generated from the name on create and on rename (when `name`
 * changes). Uniqueness scoped per parent (gated by a unique index on
 * `coalesce(parent_id, '')` + `slug`) so users can have two "Logos" folders
 * under different roots.
 */
import { nanoid } from 'nanoid'
import type { DbClient } from '../../db/client'
import { requireCapability } from '../../auth/authz'
import {
  createMediaFolder,
  deleteMediaFolder,
  getMediaFolder,
  isMediaFolderSlugTaken,
  listMediaFolders,
  updateMediaFolder,
  type UpdateMediaFolderInput,
} from '../../repositories/mediaFolders'
import { slugFromTitle } from '@core/utils/slug'
import { badRequest, jsonResponse, methodNotAllowed, readJsonObject } from '../../http'

function readNonEmptyString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readParentId(body: Record<string, unknown>): string | null | undefined {
  // Three states matter:
  //   - omitted             → undefined → keep existing parent on update
  //   - null                → null      → move to root
  //   - non-empty string    → string    → reparent under that folder id
  // Anything else (number, empty string, object) → 400-worthy, caller decides
  if (!('parentId' in body)) return undefined
  const value = body['parentId']
  if (value === null) return null
  if (typeof value === 'string' && value.length > 0) return value
  return undefined
}

function readSortOrder(body: Record<string, unknown>): number | null {
  const value = body['sortOrder']
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

export async function handleMediaFolderRoutes(
  req: Request,
  db: DbClient,
): Promise<Response | null> {
  const url = new URL(req.url)

  if (url.pathname === '/admin/api/cms/media/folders') {
    const user = await requireCapability(req, db, 'media.manage')
    if (user instanceof Response) return user

    if (req.method === 'GET') {
      return jsonResponse({ folders: await listMediaFolders(db) })
    }

    if (req.method === 'POST') {
      const body = await readJsonObject(req)
      const name = readNonEmptyString(body, 'name')
      if (!name) return badRequest('Folder name is required')

      const parentRaw = readParentId(body) ?? null
      const parentId = parentRaw === undefined ? null : parentRaw

      if (parentId !== null) {
        const parent = await getMediaFolder(db, parentId)
        if (!parent) return badRequest('Parent folder does not exist')
      }

      const slug = slugFromTitle(name) || nanoid(8).toLowerCase()
      if (await isMediaFolderSlugTaken(db, parentId, slug)) {
        return badRequest(`A folder with the slug "${slug}" already exists here`)
      }

      const folder = await createMediaFolder(db, {
        id: nanoid(),
        parentId,
        name,
        slug,
        createdByUserId: user.id,
      })
      return jsonResponse({ folder }, { status: 201 })
    }

    return methodNotAllowed()
  }

  const folderItemMatch = url.pathname.match(/^\/admin\/api\/cms\/media\/folders\/([^/]+)$/)
  if (folderItemMatch) {
    const user = await requireCapability(req, db, 'media.manage')
    if (user instanceof Response) return user

    const folderId = decodeURIComponent(folderItemMatch[1])

    if (req.method === 'PATCH') {
      const body = await readJsonObject(req)
      const existing = await getMediaFolder(db, folderId)
      if (!existing) return jsonResponse({ error: 'Folder not found' }, { status: 404 })

      const patch: UpdateMediaFolderInput = {}

      const name = readNonEmptyString(body, 'name')
      if (name) {
        patch.name = name
        const slug = slugFromTitle(name) || nanoid(8).toLowerCase()
        // The slug derives from the name — the user can't set it directly.
        // Re-check uniqueness against the new (parent, slug) pair.
        const targetParent = readParentId(body)
        const effectiveParent = targetParent !== undefined ? targetParent : existing.parentId
        if (await isMediaFolderSlugTaken(db, effectiveParent, slug, folderId)) {
          return badRequest(`A folder with the slug "${slug}" already exists here`)
        }
        patch.slug = slug
      }

      const parentRaw = readParentId(body)
      if (parentRaw !== undefined) {
        // Forbid making a folder its own ancestor — walk up the parent chain
        // from the candidate parent and reject if we run into `folderId`.
        if (parentRaw === folderId) {
          return badRequest('A folder cannot be its own parent')
        }
        if (parentRaw !== null) {
          let cursor: string | null = parentRaw
          while (cursor) {
            if (cursor === folderId) {
              return badRequest('A folder cannot be moved into its own descendant')
            }
            const ancestor = await getMediaFolder(db, cursor)
            cursor = ancestor?.parentId ?? null
          }
          const parent = await getMediaFolder(db, parentRaw)
          if (!parent) return badRequest('Target parent folder does not exist')
        }
        patch.parentId = parentRaw
      }

      const sortOrder = readSortOrder(body)
      if (sortOrder !== null) patch.sortOrder = sortOrder

      if (Object.keys(patch).length === 0) {
        return badRequest('No editable fields supplied')
      }

      const folder = await updateMediaFolder(db, folderId, patch)
      if (!folder) return jsonResponse({ error: 'Folder not found' }, { status: 404 })
      return jsonResponse({ folder })
    }

    if (req.method === 'DELETE') {
      const ok = await deleteMediaFolder(db, folderId)
      if (!ok) return jsonResponse({ error: 'Folder not found' }, { status: 404 })
      return jsonResponse({ ok: true })
    }

    return methodNotAllowed()
  }

  return null
}
