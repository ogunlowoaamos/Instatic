/**
 * CRUD for content collections.
 *
 *   listContentCollections        — read every non-deleted collection
 *   createContentCollection       — insert a new collection
 *   updateContentCollection       — partial update (all fields optional)
 *   softDeleteContentCollection   — set deleted_at; refuses if entries exist
 *                                   or if it's the seeded `posts` collection
 */
import { nanoid } from 'nanoid'
import type { DbClient } from '../../db/client'
import { normalizeRouteBase } from '@core/templates/templateMatching'
import { normalizeContentCollectionFields } from '@core/content/fields'
import type {
  ContentCollection,
  ContentCollectionFields,
} from '@core/content/schemas'

interface CreateContentCollectionInput {
  id?: string
  name: string
  slug: string
  routeBase?: string
  singularLabel: string
  pluralLabel: string
  fields?: ContentCollectionFields
  createdByUserId?: string | null
  updatedByUserId?: string | null
}

interface UpdateContentCollectionInput {
  name?: string
  slug?: string
  routeBase?: string
  singularLabel?: string
  pluralLabel?: string
  fields?: ContentCollectionFields
  updatedByUserId?: string | null
}

interface ContentCollectionRow {
  id: string
  name: string
  slug: string
  route_base: string
  singular_label: string
  plural_label: string
  fields_json?: unknown
  created_by_user_id: string | null
  updated_by_user_id: string | null
  /**
   * The PG adapter normalizes Date instances to ISO strings, and SQLite stores
   * timestamps as ISO TEXT. Either way the value reaches us as a string in
   * production. Test fakes, however, hand back raw Date objects, so the
   * `Date | string` union here keeps the mapper honest across both paths.
   */
  created_at: string | Date
  updated_at: string | Date
}

const toIso = (value: string | Date): string =>
  typeof value === 'string' ? value : value.toISOString()

function mapCollection(row: ContentCollectionRow): ContentCollection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    routeBase: row.route_base ? normalizeRouteBase(row.route_base) : normalizeRouteBase(row.slug),
    singularLabel: row.singular_label,
    pluralLabel: row.plural_label,
    fields: normalizeContentCollectionFields(row.fields_json),
    // `?? null` collapses both null and the undefined that test fakes hand
    // back when they only populate the columns a given test cares about.
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export async function listContentCollections(db: DbClient): Promise<ContentCollection[]> {
  const { rows } = await db<ContentCollectionRow>`
    select id, name, slug, route_base, singular_label, plural_label, fields_json,
           created_by_user_id, updated_by_user_id, created_at, updated_at
    from content_collections
    where deleted_at is null
    order by created_at asc
  `
  return rows.map(mapCollection)
}

export async function createContentCollection(
  db: DbClient,
  input: CreateContentCollectionInput,
): Promise<ContentCollection> {
  const fields = normalizeContentCollectionFields(input.fields)
  const { rows } = await db<ContentCollectionRow>`
    insert into content_collections (
      id,
      name,
      slug,
      route_base,
      singular_label,
      plural_label,
      fields_json,
      created_by_user_id,
      updated_by_user_id
    )
    values (
      ${input.id ?? nanoid()},
      ${input.name},
      ${input.slug},
      ${normalizeRouteBase(input.routeBase ?? input.slug)},
      ${input.singularLabel},
      ${input.pluralLabel},
      ${fields},
      ${input.createdByUserId ?? null},
      ${input.updatedByUserId ?? input.createdByUserId ?? null}
    )
    returning id, name, slug, route_base, singular_label, plural_label, fields_json,
              created_by_user_id, updated_by_user_id, created_at, updated_at
  `
  return mapCollection(rows[0])
}

export async function updateContentCollection(
  db: DbClient,
  collectionId: string,
  input: UpdateContentCollectionInput,
): Promise<ContentCollection | null> {
  const fields = input.fields === undefined ? null : normalizeContentCollectionFields(input.fields)
  const routeBase = input.routeBase === undefined ? null : normalizeRouteBase(input.routeBase)
  const { rows } = await db<ContentCollectionRow>`
    update content_collections
    set name = coalesce(${input.name ?? null}, name),
        slug = coalesce(${input.slug ?? null}, slug),
        route_base = coalesce(${routeBase}, route_base),
        singular_label = coalesce(${input.singularLabel ?? null}, singular_label),
        plural_label = coalesce(${input.pluralLabel ?? null}, plural_label),
        fields_json = coalesce(${fields}, fields_json),
        updated_by_user_id = coalesce(${input.updatedByUserId ?? null}, updated_by_user_id),
        updated_at = current_timestamp
    where id = ${collectionId}
      and deleted_at is null
    returning id, name, slug, route_base, singular_label, plural_label, fields_json,
              created_by_user_id, updated_by_user_id, created_at, updated_at
  `
  return rows[0] ? mapCollection(rows[0]) : null
}

/**
 * Refuses to delete the seeded `posts` collection or any collection that
 * still contains non-deleted entries. Both are guard rails enforced at the
 * repository layer rather than the handler so other callers (e.g. CLI tools)
 * inherit the safety check.
 */
export async function softDeleteContentCollection(
  db: DbClient,
  collectionId: string,
  actorUserId: string | null = null,
): Promise<ContentCollection | null> {
  if (collectionId === 'posts') return null

  const { rows: countRows } = await db<{ count: number }>`
    select count(*) as count
    from content_entries
    where collection_id = ${collectionId}
      and deleted_at is null
  `
  if (Number(countRows[0]?.count ?? 0) > 0) return null

  const { rows } = await db<ContentCollectionRow>`
    update content_collections
    set deleted_at = current_timestamp,
        updated_by_user_id = ${actorUserId},
        updated_at = current_timestamp
    where id = ${collectionId}
      and deleted_at is null
    returning id, name, slug, route_base, singular_label, plural_label, fields_json,
              created_by_user_id, updated_by_user_id, created_at, updated_at
  `
  return rows[0] ? mapCollection(rows[0]) : null
}
