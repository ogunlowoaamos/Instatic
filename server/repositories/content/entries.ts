/**
 * CRUD for content entries.
 *
 *   listContentEntries             — list non-deleted entries in a collection,
 *                                    optionally restricted to entries owned
 *                                    by the calling user
 *   getContentEntry                — read a single entry by id with hydrated
 *                                    author / createdBy / updatedBy / publishedBy
 *                                    user references
 *   listContentAuthorOptions       — list active users for the author picker
 *   createContentEntry             — insert a new draft
 *   saveContentEntryDraft          — overwrite the draft fields
 *   softDeleteContentEntry         — set deleted_at
 *   updateContentEntryCollection   — move an entry to another collection
 *                                    (rejects on slug conflict)
 *   updateContentEntryStatus       — flip between draft / unpublished
 *                                    (clears published metadata)
 *   updateContentEntryAuthor       — reassign the author user id
 *
 * Mutations (other than soft-delete) always RETURN id only, then re-read the
 * hydrated entry through `getContentEntry` so callers receive consistently
 * populated user references. Soft-delete is the one exception: a soft-deleted
 * row is filtered out by `getContentEntry`'s `deleted_at is null` clause, so
 * the row is mapped directly from RETURNING (without user references — the
 * delete handler only consumes id / collectionId / slug for audit logging).
 */
import { nanoid } from 'nanoid'
import type { DbClient } from '../../db/client'
import type {
  ContentEntry,
  ContentEntryStatus,
  ContentUserReference,
} from '@core/content/schemas'

interface CreateContentEntryInput {
  id?: string
  collectionId: string
  title: string
  slug: string
  bodyMarkdown?: string
  featuredMediaId?: string | null
  seoTitle?: string
  seoDescription?: string
}

interface SaveContentEntryDraftInput {
  title: string
  slug: string
  bodyMarkdown: string
  featuredMediaId: string | null
  seoTitle: string
  seoDescription: string
}

interface ListContentEntriesVisibility {
  /**
   * If set, only entries authored or (when no author is assigned) created by
   * this user are returned. Used by the editor list to scope visibility for
   * roles that can only see their own content.
   */
  ownerUserId?: string | null
}

export type UpdateContentEntryCollectionResult =
  | { ok: true; entry: ContentEntry }
  | { ok: false; reason: 'entry_not_found' | 'collection_not_found' | 'slug_conflict' }

/**
 * Every column produced by the canonical "fetch entry with hydrated user
 * references" SELECT. The four user-ref groups (author / created_by /
 * updated_by / published_by) all share the same five-column shape:
 * `<group>_user_id`, `<group>_email`, `<group>_display_name`,
 * `<group>_role_slug`, `<group>_role_name` — exploited by `userRefAt()`.
 */
interface ContentEntryRow {
  id: string
  collection_id: string
  title: string
  slug: string
  status: ContentEntryStatus
  body_markdown: string
  featured_media_id: string | null
  seo_title: string
  seo_description: string
  author_user_id: string | null
  created_by_user_id: string | null
  updated_by_user_id: string | null
  published_by_user_id: string | null
  author_email?: string | null
  author_display_name?: string | null
  author_role_slug?: string | null
  author_role_name?: string | null
  created_by_email?: string | null
  created_by_display_name?: string | null
  created_by_role_slug?: string | null
  created_by_role_name?: string | null
  updated_by_email?: string | null
  updated_by_display_name?: string | null
  updated_by_role_slug?: string | null
  updated_by_role_name?: string | null
  published_by_email?: string | null
  published_by_display_name?: string | null
  published_by_role_slug?: string | null
  published_by_role_name?: string | null
  /**
   * Date in test fakes, ISO string in production (PG adapter normalizes Dates;
   * SQLite stores TEXT). The mapper converts both via `toIso` below.
   */
  created_at: string | Date
  updated_at: string | Date
  published_at: string | Date | null
  deleted_at: string | Date | null
}

interface ContentAuthorRow {
  id: string
  email: string
  display_name: string | null
  role_slug: string | null
  role_name: string | null
}

type UserJoinPrefix = 'author' | 'created_by' | 'updated_by' | 'published_by'

const toIso = (value: string | Date): string =>
  typeof value === 'string' ? value : value.toISOString()

/**
 * Pull the user reference from a row using the column-prefix convention. When
 * `<prefix>_user_id` is null, no user is assigned.
 */
function userRefAt(row: ContentEntryRow, prefix: UserJoinPrefix): ContentUserReference | null {
  const userId = row[`${prefix}_user_id`]
  if (!userId) return null
  const email = row[`${prefix}_email`] ?? ''
  return {
    id: userId,
    email,
    displayName: row[`${prefix}_display_name`] ?? email ?? userId,
    roleSlug: row[`${prefix}_role_slug`] ?? null,
    roleName: row[`${prefix}_role_name`] ?? null,
  }
}

function mapEntry(row: ContentEntryRow): ContentEntry {
  return {
    id: row.id,
    collectionId: row.collection_id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    bodyMarkdown: row.body_markdown,
    featuredMediaId: row.featured_media_id ?? null,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    // `?? null` collapses both null and the undefined that test fakes hand
    // back when they only populate the columns a given test cares about.
    authorUserId: row.author_user_id ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    publishedByUserId: row.published_by_user_id ?? null,
    author: userRefAt(row, 'author'),
    createdBy: userRefAt(row, 'created_by'),
    updatedBy: userRefAt(row, 'updated_by'),
    publishedBy: userRefAt(row, 'published_by'),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    publishedAt: row.published_at ? toIso(row.published_at) : null,
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
  }
}

/**
 * Tests whether the calling user is the effective owner of `entry`. The author
 * overrides; if no author is assigned, falls back to the creator. Mirrors the
 * SQL filter previously inlined in `listContentEntries`.
 */
function isOwnedByUser(entry: ContentEntry, ownerUserId: string): boolean {
  if (entry.authorUserId === ownerUserId) return true
  if (entry.authorUserId === null) return entry.createdByUserId === ownerUserId
  return false
}

export async function listContentEntries(
  db: DbClient,
  collectionId: string,
  visibility: ListContentEntriesVisibility = {},
): Promise<ContentEntry[]> {
  const { rows } = await db<ContentEntryRow>`
    select content_entries.id,
           content_entries.collection_id,
           content_entries.title,
           content_entries.slug,
           content_entries.status,
           content_entries.body_markdown,
           content_entries.featured_media_id,
           content_entries.seo_title,
           content_entries.seo_description,
           content_entries.author_user_id,
           content_entries.created_by_user_id,
           content_entries.updated_by_user_id,
           content_entries.published_by_user_id,
           author_users.email as author_email,
           author_users.display_name as author_display_name,
           author_roles.slug as author_role_slug,
           author_roles.name as author_role_name,
           creator_users.email as created_by_email,
           creator_users.display_name as created_by_display_name,
           creator_roles.slug as created_by_role_slug,
           creator_roles.name as created_by_role_name,
           updater_users.email as updated_by_email,
           updater_users.display_name as updated_by_display_name,
           updater_roles.slug as updated_by_role_slug,
           updater_roles.name as updated_by_role_name,
           publisher_users.email as published_by_email,
           publisher_users.display_name as published_by_display_name,
           publisher_roles.slug as published_by_role_slug,
           publisher_roles.name as published_by_role_name,
           content_entries.created_at,
           content_entries.updated_at,
           content_entries.published_at,
           content_entries.deleted_at
    from content_entries
    left join users author_users on author_users.id = content_entries.author_user_id
    left join roles author_roles on author_roles.id = author_users.role_id
    left join users creator_users on creator_users.id = content_entries.created_by_user_id
    left join roles creator_roles on creator_roles.id = creator_users.role_id
    left join users updater_users on updater_users.id = content_entries.updated_by_user_id
    left join roles updater_roles on updater_roles.id = updater_users.role_id
    left join users publisher_users on publisher_users.id = content_entries.published_by_user_id
    left join roles publisher_roles on publisher_roles.id = publisher_users.role_id
    where content_entries.collection_id = ${collectionId}
      and content_entries.deleted_at is null
    order by content_entries.updated_at desc, content_entries.created_at desc
  `
  const entries = rows.map(mapEntry)
  if (visibility.ownerUserId) {
    const ownerUserId = visibility.ownerUserId
    return entries.filter((entry) => isOwnedByUser(entry, ownerUserId))
  }
  return entries
}

export async function getContentEntry(
  db: DbClient,
  entryId: string,
): Promise<ContentEntry | null> {
  const { rows } = await db<ContentEntryRow>`
    select content_entries.id,
           content_entries.collection_id,
           content_entries.title,
           content_entries.slug,
           content_entries.status,
           content_entries.body_markdown,
           content_entries.featured_media_id,
           content_entries.seo_title,
           content_entries.seo_description,
           content_entries.author_user_id,
           content_entries.created_by_user_id,
           content_entries.updated_by_user_id,
           content_entries.published_by_user_id,
           author_users.email as author_email,
           author_users.display_name as author_display_name,
           author_roles.slug as author_role_slug,
           author_roles.name as author_role_name,
           creator_users.email as created_by_email,
           creator_users.display_name as created_by_display_name,
           creator_roles.slug as created_by_role_slug,
           creator_roles.name as created_by_role_name,
           updater_users.email as updated_by_email,
           updater_users.display_name as updated_by_display_name,
           updater_roles.slug as updated_by_role_slug,
           updater_roles.name as updated_by_role_name,
           publisher_users.email as published_by_email,
           publisher_users.display_name as published_by_display_name,
           publisher_roles.slug as published_by_role_slug,
           publisher_roles.name as published_by_role_name,
           content_entries.created_at,
           content_entries.updated_at,
           content_entries.published_at,
           content_entries.deleted_at
    from content_entries
    left join users author_users on author_users.id = content_entries.author_user_id
    left join roles author_roles on author_roles.id = author_users.role_id
    left join users creator_users on creator_users.id = content_entries.created_by_user_id
    left join roles creator_roles on creator_roles.id = creator_users.role_id
    left join users updater_users on updater_users.id = content_entries.updated_by_user_id
    left join roles updater_roles on updater_roles.id = updater_users.role_id
    left join users publisher_users on publisher_users.id = content_entries.published_by_user_id
    left join roles publisher_roles on publisher_roles.id = publisher_users.role_id
    where content_entries.id = ${entryId}
      and content_entries.deleted_at is null
    limit 1
  `
  return rows[0] ? mapEntry(rows[0]) : null
}

export async function listContentAuthorOptions(db: DbClient): Promise<ContentUserReference[]> {
  const { rows } = await db<ContentAuthorRow>`
    select users.id,
           users.email,
           users.display_name,
           roles.slug as role_slug,
           roles.name as role_name
    from users
    join roles on roles.id = users.role_id
    where users.deleted_at is null
      and users.status = ${'active'}
    order by users.display_name asc, users.email asc
  `
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? row.email ?? row.id,
    roleSlug: row.role_slug,
    roleName: row.role_name,
  }))
}

export async function createContentEntry(
  db: DbClient,
  input: CreateContentEntryInput,
  actorUserId: string | null = null,
): Promise<ContentEntry> {
  const { rows } = await db<{ id: string }>`
    insert into content_entries (
      id,
      collection_id,
      title,
      slug,
      status,
      body_markdown,
      featured_media_id,
      seo_title,
      seo_description,
      author_user_id,
      created_by_user_id,
      updated_by_user_id
    )
    values (
      ${input.id ?? nanoid()},
      ${input.collectionId},
      ${input.title},
      ${input.slug},
      ${'draft'},
      ${input.bodyMarkdown ?? ''},
      ${input.featuredMediaId ?? null},
      ${input.seoTitle ?? ''},
      ${input.seoDescription ?? ''},
      ${actorUserId},
      ${actorUserId},
      ${actorUserId}
    )
    returning id
  `
  const created = await getContentEntry(db, rows[0].id)
  if (!created) throw new Error('content entry was created but could not be re-read')
  return created
}

export async function saveContentEntryDraft(
  db: DbClient,
  entryId: string,
  input: SaveContentEntryDraftInput,
  actorUserId: string | null = null,
): Promise<ContentEntry | null> {
  const { rows } = await db<{ id: string }>`
    update content_entries
    set title = ${input.title},
        slug = ${input.slug},
        body_markdown = ${input.bodyMarkdown},
        featured_media_id = ${input.featuredMediaId},
        seo_title = ${input.seoTitle},
        seo_description = ${input.seoDescription},
        updated_by_user_id = ${actorUserId},
        updated_at = current_timestamp
    where id = ${entryId}
      and deleted_at is null
    returning id
  `
  return rows[0] ? getContentEntry(db, rows[0].id) : null
}

/**
 * Soft-delete is the one mutation that returns the row directly from
 * RETURNING rather than re-reading via `getContentEntry`: the row now has
 * `deleted_at` set, so `getContentEntry`'s `deleted_at is null` filter would
 * mask it. The handler only consumes the id / collectionId / slug for audit
 * logging, so the absence of hydrated user references on the returned shape
 * is acceptable.
 */
export async function softDeleteContentEntry(
  db: DbClient,
  entryId: string,
  actorUserId: string | null = null,
): Promise<ContentEntry | null> {
  const { rows } = await db<ContentEntryRow>`
    update content_entries
    set deleted_at = current_timestamp,
        updated_by_user_id = ${actorUserId},
        updated_at = current_timestamp
    where id = ${entryId}
      and deleted_at is null
    returning id, collection_id, title, slug, status, body_markdown, featured_media_id,
              seo_title, seo_description, author_user_id, created_by_user_id,
              updated_by_user_id, published_by_user_id, created_at, updated_at,
              published_at, deleted_at
  `
  return rows[0] ? mapEntry(rows[0]) : null
}

/**
 * Move an entry to another collection. Refuses if the target collection is
 * missing or already has an entry with the same slug. Returns a discriminated
 * union so handlers can map the failure mode to the right HTTP status.
 */
export async function updateContentEntryCollection(
  db: DbClient,
  entryId: string,
  collectionId: string,
  actorUserId: string | null = null,
): Promise<UpdateContentEntryCollectionResult> {
  const entry = await getContentEntry(db, entryId)
  if (!entry) return { ok: false, reason: 'entry_not_found' }
  if (entry.collectionId === collectionId) return { ok: true, entry }

  const { rows: collectionRows } = await db<{ id: string }>`
    select id from content_collections
    where id = ${collectionId}
      and deleted_at is null
    limit 1
  `
  if (!collectionRows[0]) return { ok: false, reason: 'collection_not_found' }

  const { rows: conflictRows } = await db<{ id: string }>`
    select id from content_entries
    where collection_id = ${collectionId}
      and slug = ${entry.slug}
      and id <> ${entryId}
      and deleted_at is null
    limit 1
  `
  if (conflictRows[0]) return { ok: false, reason: 'slug_conflict' }

  const { rows } = await db<{ id: string }>`
    update content_entries
    set collection_id = ${collectionId},
        updated_by_user_id = ${actorUserId},
        updated_at = current_timestamp
    where id = ${entryId}
      and deleted_at is null
    returning id
  `
  if (!rows[0]) return { ok: false, reason: 'entry_not_found' }
  const updated = await getContentEntry(db, rows[0].id)
  if (!updated) return { ok: false, reason: 'entry_not_found' }
  return { ok: true, entry: updated }
}

/**
 * Flip an entry between `draft` and `unpublished` (the only states reachable
 * from this endpoint — `published` goes through the dedicated publish flow).
 * Always clears the `published_at` / `published_by_user_id` columns since
 * neither remains meaningful in the new state.
 */
export async function updateContentEntryStatus(
  db: DbClient,
  entryId: string,
  status: 'draft' | 'unpublished',
  actorUserId: string | null = null,
): Promise<ContentEntry | null> {
  const { rows } = await db<{ id: string }>`
    update content_entries
    set status = ${status},
        published_at = null,
        published_by_user_id = null,
        updated_by_user_id = ${actorUserId},
        updated_at = current_timestamp
    where id = ${entryId}
      and deleted_at is null
    returning id
  `
  return rows[0] ? getContentEntry(db, rows[0].id) : null
}

export async function updateContentEntryAuthor(
  db: DbClient,
  entryId: string,
  authorUserId: string,
  actorUserId: string | null = null,
): Promise<ContentEntry | null> {
  const { rows } = await db<{ id: string }>`
    update content_entries
    set author_user_id = ${authorUserId},
        updated_by_user_id = ${actorUserId},
        updated_at = current_timestamp
    where id = ${entryId}
      and deleted_at is null
    returning id
  `
  return rows[0] ? getContentEntry(db, rows[0].id) : null
}
