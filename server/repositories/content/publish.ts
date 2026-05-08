/**
 * Publishing flow + public-route lookups for content entries.
 *
 *   publishContentEntry              — append a new content_entry_versions row,
 *                                      flip the entry to `published`, and (when
 *                                      the slug changed) record a redirect from
 *                                      the previous public path
 *   getPublishedContentEntryByRoute  — resolve a public URL to the active
 *                                      published version of an entry
 *   getContentEntryRedirectByRoute   — resolve a public URL to a redirect
 *                                      target when the URL belongs to a
 *                                      previously-published slug
 */
import { nanoid } from 'nanoid'
import type { DbClient } from '../../db/client'
import type {
  ContentEntry,
  ContentEntryRedirect,
  ContentEntryVersion,
  PublishedContentEntry,
} from '@core/content/schemas'
import { normalizeRouteBase } from '@core/templates/templateMatching'
import { getContentEntry } from './entries'

interface PublishedContentEntryRow {
  id: string
  entry_id: string
  collection_id: string
  collection_slug: string
  collection_route_base: string
  version_number: number
  title: string
  slug: string
  body_markdown: string
  featured_media_id: string | null
  // Optional rather than `string | null` because joined / nullable columns
  // are missing entirely when test fakes only populate the keys a given
  // test cares about. The mapper coerces undefined → null at the boundary.
  featured_media_path?: string | null
  seo_title: string
  seo_description: string
  author_user_id?: string | null
  author_display_name?: string | null
  author_role_slug?: string | null
  author_role_name?: string | null
  published_by_user_id?: string | null
  published_by_display_name?: string | null
  published_by_role_slug?: string | null
  published_by_role_name?: string | null
  /** Date in test fakes, ISO string in production. */
  published_at: string | Date
  created_at: string | Date
}

interface PreviousPublishedRouteRow {
  previous_slug: string
  previous_route_base: string
}

interface ContentEntryRedirectRow {
  id: string
  from_route_base: string
  from_slug: string
  target_route_base: string
  target_slug: string
}

interface PublishContentEntryResult {
  entry: ContentEntry
  version: ContentEntryVersion
}

const toIso = (value: string | Date): string =>
  typeof value === 'string' ? value : value.toISOString()

function publicContentPath(routeBase: string, slug: string): string {
  const normalizedBase = normalizeRouteBase(routeBase)
  return `${normalizedBase === '/' ? '' : normalizedBase}/${slug}`
}

function mapPublishedEntry(row: PublishedContentEntryRow): PublishedContentEntry {
  const publishedAt = toIso(row.published_at)
  // `?? null` collapses both null and the undefined that test fakes hand back
  // when they only populate the columns a given test cares about.
  return {
    id: row.id,
    entryId: row.entry_id,
    collectionId: row.collection_id,
    collectionSlug: row.collection_slug,
    collectionRouteBase: row.collection_route_base
      ? normalizeRouteBase(row.collection_route_base)
      : normalizeRouteBase(row.collection_slug),
    versionNumber: Number(row.version_number),
    title: row.title,
    slug: row.slug,
    bodyMarkdown: row.body_markdown,
    featuredMediaId: row.featured_media_id ?? null,
    featuredMediaPath: row.featured_media_path ?? null,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    authorUserId: row.author_user_id ?? null,
    authorName: row.author_display_name ?? null,
    authorRoleSlug: row.author_role_slug ?? null,
    authorRoleName: row.author_role_name ?? null,
    publishedByUserId: row.published_by_user_id ?? null,
    publishedByName: row.published_by_display_name ?? null,
    publishedByRoleSlug: row.published_by_role_slug ?? null,
    publishedByRoleName: row.published_by_role_name ?? null,
    publishedAt,
    createdAt: toIso(row.created_at),
  }
}

function mapRedirect(row: ContentEntryRedirectRow): ContentEntryRedirect | null {
  const fromPath = publicContentPath(row.from_route_base, row.from_slug)
  const targetPath = publicContentPath(row.target_route_base, row.target_slug)
  if (fromPath === targetPath) return null
  return { id: row.id, fromPath, targetPath }
}

export async function publishContentEntry(
  db: DbClient,
  entryId: string,
  publisherUserId: string,
): Promise<PublishContentEntryResult> {
  return db.transaction(async (tx) => {
    const entry = await getContentEntry(tx, entryId)
    if (!entry) throw new Error('content entry not found')

    const previousRoute = await readPreviousPublishedRoute(tx, entryId)
    const versionNumber = await nextVersionNumber(tx, entryId)
    const versionId = nanoid()

    await tx`
      insert into content_entry_versions
        (
          id,
          entry_id,
          version_number,
          title,
          slug,
          body_markdown,
          featured_media_id,
          seo_title,
          seo_description,
          published_by_user_id
        )
      values (
        ${versionId},
        ${entry.id},
        ${versionNumber},
        ${entry.title},
        ${entry.slug},
        ${entry.bodyMarkdown},
        ${entry.featuredMediaId},
        ${entry.seoTitle},
        ${entry.seoDescription},
        ${publisherUserId}
      )
    `

    const { rows: updateRows } = await tx<{ id: string }>`
      update content_entries
      set status = 'published',
          active_version_id = ${versionId},
          published_by_user_id = ${publisherUserId},
          published_at = current_timestamp,
          updated_by_user_id = ${publisherUserId},
          updated_at = current_timestamp
      where id = ${entry.id}
        and deleted_at is null
      returning id
    `
    if (!updateRows[0]) throw new Error('content entry publish update failed')

    if (previousRoute && previousRouteChanged(previousRoute, entry.slug)) {
      await tx`
        insert into content_entry_redirects (id, collection_id, from_route_base, from_slug, target_entry_id)
        values (
          ${nanoid()},
          ${entry.collectionId},
          ${normalizeRouteBase(previousRoute.previous_route_base)},
          ${previousRoute.previous_slug},
          ${entry.id}
        )
        on conflict (from_route_base, from_slug) do update
          set collection_id = excluded.collection_id,
              target_entry_id = excluded.target_entry_id
      `
    }

    const publishedEntry = await getContentEntry(tx, entry.id)
    if (!publishedEntry) throw new Error('content entry could not be re-read after publish')

    const publishedAt = publishedEntry.publishedAt ?? new Date().toISOString()
    return {
      entry: publishedEntry,
      version: {
        id: versionId,
        entryId: publishedEntry.id,
        versionNumber,
        title: publishedEntry.title,
        slug: publishedEntry.slug,
        bodyMarkdown: publishedEntry.bodyMarkdown,
        featuredMediaId: publishedEntry.featuredMediaId,
        seoTitle: publishedEntry.seoTitle,
        seoDescription: publishedEntry.seoDescription,
        publishedByUserId: publisherUserId,
        publishedAt,
        createdAt: publishedAt,
      },
    }
  })
}

async function readPreviousPublishedRoute(
  db: DbClient,
  entryId: string,
): Promise<PreviousPublishedRouteRow | null> {
  const { rows } = await db<PreviousPublishedRouteRow>`
    select content_entry_versions.slug as previous_slug,
           coalesce(nullif(content_collections.route_base, ''), '/' || content_collections.slug) as previous_route_base
    from content_entries
    join content_collections on content_collections.id = content_entries.collection_id
    join content_entry_versions on content_entry_versions.id = content_entries.active_version_id
    where content_entries.id = ${entryId}
      and content_entries.deleted_at is null
      and content_collections.deleted_at is null
    limit 1
  `
  return rows[0] ?? null
}

async function nextVersionNumber(db: DbClient, entryId: string): Promise<number> {
  const { rows } = await db<{ next_version: number }>`
    select coalesce(max(version_number), 0) + 1 as next_version
    from content_entry_versions
    where entry_id = ${entryId}
  `
  return Number(rows[0]?.next_version ?? 1)
}

function previousRouteChanged(previous: PreviousPublishedRouteRow, currentSlug: string): boolean {
  return (
    previous.previous_slug.length > 0 &&
    publicContentPath(previous.previous_route_base, previous.previous_slug) !==
      publicContentPath(previous.previous_route_base, currentSlug)
  )
}

export async function getPublishedContentEntryByRoute(
  db: DbClient,
  collectionRouteBase: string,
  entrySlug: string,
): Promise<PublishedContentEntry | null> {
  const { rows } = await db<PublishedContentEntryRow>`
    select content_entry_versions.id,
           content_entry_versions.entry_id,
           content_entries.collection_id,
           content_collections.slug as collection_slug,
           content_collections.route_base as collection_route_base,
           content_entry_versions.version_number,
           content_entry_versions.title,
           content_entry_versions.slug,
           content_entry_versions.body_markdown,
           content_entry_versions.featured_media_id,
           media_assets.public_path as featured_media_path,
           content_entry_versions.seo_title,
           content_entry_versions.seo_description,
           content_entries.author_user_id,
           author_users.display_name as author_display_name,
           author_roles.slug as author_role_slug,
           author_roles.name as author_role_name,
           content_entry_versions.published_by_user_id,
           publisher_users.display_name as published_by_display_name,
           publisher_roles.slug as published_by_role_slug,
           publisher_roles.name as published_by_role_name,
           content_entry_versions.published_at,
           content_entry_versions.created_at
    from content_entries
    join content_collections on content_collections.id = content_entries.collection_id
    join content_entry_versions on content_entry_versions.id = content_entries.active_version_id
    left join media_assets on media_assets.id = content_entry_versions.featured_media_id
    left join users author_users on author_users.id = content_entries.author_user_id
    left join roles author_roles on author_roles.id = author_users.role_id
    left join users publisher_users on publisher_users.id = content_entry_versions.published_by_user_id
    left join roles publisher_roles on publisher_roles.id = publisher_users.role_id
    where coalesce(nullif(content_collections.route_base, ''), '/' || content_collections.slug) = ${normalizeRouteBase(collectionRouteBase)}
      and content_entry_versions.slug = ${entrySlug}
      and content_entries.status = 'published'
      and content_entries.deleted_at is null
      and content_collections.deleted_at is null
    limit 1
  `
  return rows[0] ? mapPublishedEntry(rows[0]) : null
}

export async function getContentEntryRedirectByRoute(
  db: DbClient,
  collectionRouteBase: string,
  entrySlug: string,
): Promise<ContentEntryRedirect | null> {
  const { rows } = await db<ContentEntryRedirectRow>`
    select content_entry_redirects.id,
           content_entry_redirects.from_route_base,
           content_entry_redirects.from_slug,
           coalesce(nullif(target_collections.route_base, ''), '/' || target_collections.slug) as target_route_base,
           content_entry_versions.slug as target_slug
    from content_entry_redirects
    join content_entries target_entries on target_entries.id = content_entry_redirects.target_entry_id
    join content_collections target_collections on target_collections.id = target_entries.collection_id
    join content_entry_versions on content_entry_versions.id = target_entries.active_version_id
    where content_entry_redirects.from_route_base = ${normalizeRouteBase(collectionRouteBase)}
      and content_entry_redirects.from_slug = ${entrySlug}
      and target_entries.status = 'published'
      and target_entries.deleted_at is null
      and target_collections.deleted_at is null
    limit 1
  `
  return rows[0] ? mapRedirect(rows[0]) : null
}
