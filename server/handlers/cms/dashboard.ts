/**
 * Dashboard stats endpoints — per-domain.
 *
 *   GET /admin/api/cms/dashboard/pages
 *   GET /admin/api/cms/dashboard/posts
 *   GET /admin/api/cms/dashboard/media
 *   GET /admin/api/cms/dashboard/plugins
 *   GET /admin/api/cms/dashboard/publish-lineup
 *   GET /admin/api/cms/dashboard/activity
 *
 * One endpoint per dashboard widget data domain. Each runs only the
 * queries that domain needs, so:
 *   1. The client fires all six in parallel from the widget hooks.
 *      Cheap domains (Pages: two counts) resolve in ~10 ms; the
 *      expensive Activity feed (audit_events scan + 50-row projection)
 *      takes ~150 ms. The dashboard fills in progressively as data
 *      arrives, instead of stalling on the slowest widget.
 *   2. A widget that doesn't appear in the user's grid never causes
 *      its endpoint to be called. Adding a new widget that pulls
 *      data from a new source means a new endpoint, not bloating an
 *      existing aggregate.
 *
 * No filtering / range tabs yet — the dashboard's "Today / 7d / 30d"
 * range affects only the analytics widgets (which live in the plugin's
 * own `/runtime/stats` route). The Pages / Posts / Media counters in
 * this response are point-in-time totals + a fixed "this week" delta.
 */
import type { DbClient } from '../../db/client'
import { requireAuthenticatedUser } from '../../auth/authz'
import { jsonResponse, methodNotAllowed } from '../../http'
import type { AuditAction } from '../../repositories/audit'
import { computeGravatarHash } from '../../repositories/users'
import { CMS_API_PREFIX } from './shared'

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface PagesStats {
  total: number
  published: number
  drafts: number
  scheduled: number
  /**
   * How many pages were published in the trailing 7 days. Used by the
   * Pages widget's "+N this week" delta line.
   */
  deltaPublishedThisWeek: number
}

export interface PostsStats {
  total: number
  /** Number of `kind: 'postType'` tables. */
  categories: number
  scheduled: number
  /**
   * Daily count of post publishes for the last 28 days, oldest first.
   * Drives the Posts widget's mini bar chart.
   */
  daily28: number[]
}

export interface MediaStatsThumb {
  id: string
  publicPath: string
  altText: string
  mimeType: string
  width: number | null
  height: number | null
  variants: Array<{ width: number; height: number; format: string; path: string }>
}

export interface MediaStats {
  count: number
  totalBytes: number
  /**
   * Up to 16 most-recently-uploaded image assets, each with the
   * variant ladder so the dashboard `<Image>` primitive can build a
   * srcset for the mosaic thumbnails.
   */
  latestThumbs: MediaStatsThumb[]
}

/**
 * Per-plugin row returned to the dashboard. Mirrors `InstalledPlugin`
 * but trimmed to the fields the Plugins widget actually renders —
 * manifest/permissions/settings stay server-side so the payload is small.
 */
export interface PluginsStatsRow {
  id: string
  name: string
  version: string
  /**
   * Coarse health state for the widget's status dot. Computed
   * server-side from `enabled` + `lifecycle_status` so the widget
   * doesn't need to know the matrix.
   */
  state: 'active' | 'disabled' | 'error'
  /**
   * Public URL for the plugin's manifest-declared icon (resolved
   * server-side from `manifest.icon` + `manifest.assetBasePath`).
   * `null` when the plugin omits an icon — the widget renders its
   * fallback plug glyph in that case. Same resolution rule as the
   * Plugins admin page's `PluginCard`.
   */
  iconUrl: string | null
}

export interface PluginsStats {
  total: number
  active: number
  disabled: number
  errored: number
  /** Up to 8 most-recently-installed plugin rows, newest first. */
  rows: PluginsStatsRow[]
}

/**
 * A single row in the "Publish lineup" widget. Surfaces what's coming
 * up (scheduled), what just shipped (published), and the drafts the
 * operator is still working on.
 *
 *   • `path` — public route ("/blog/sandbox-deep-dive") derived from
 *     the row's table.route_base + row.slug. Falls back to
 *     `/${tableId}/${slug}` when route_base is missing.
 *
 *   • `at` — ISO datetime relevant to the status:
 *       - 'scheduled' → scheduled_publish_at (future)
 *       - 'published' → published_at (past)
 *       - 'draft'     → null
 *
 *   The widget formats this client-side relative to "now" so the labels
 *   say "in 12m" / "2h ago" without the server having to know the
 *   user's clock.
 */
export interface PublishLineupRow {
  id: string
  path: string
  status: 'scheduled' | 'published' | 'draft'
  at: string | null
}

export interface PublishLineupStats {
  rows: PublishLineupRow[]
}

/**
 * Compact actor record for the Activity widget — the exact slice of
 * fields the shared `<UserAvatar>` primitive needs to render an image
 * (uploaded avatar → Gravatar → initials), plus the strings the
 * widget uses for its `title` tooltip.
 *
 * Shape matches `Pick<CmsCurrentUser, 'avatarUrl' | 'gravatarHash' |
 * 'displayName' | 'email'>` so the widget can pass the object straight
 * to `<UserAvatar user={…} />` without an adapter step.
 *
 * `gravatarHash` is computed server-side from the actor's normalized
 * email (same helper as `server/repositories/users.ts`) so we don't
 * leak the raw email to clients that don't need it.
 */
export interface RecentActivityActor {
  displayName: string
  email: string
  avatarUrl: string | null
  gravatarHash: string
}

/**
 * One row in the dashboard "Activity" widget feed. A flattened,
 * widget-ready projection of `audit_events` — server-side we already
 * know who did what and to which target, so we ship the resolved
 * actor record + targetCode/targetText and the widget just picks a
 * verb per action.
 *
 *   • `actor`         — current display name / email / avatar info
 *     for the actor user, or `null` for system-initiated events
 *     (`actor_user_id is null` in the row). The widget renders a
 *     fallback icon for the null case.
 *   • `targetCode`    — string to render in <code> styling (paths,
 *     plugin ids, slugs). Null when the action has no code-flavoured
 *     target (e.g. "site was published").
 *   • `targetText`    — string to render in plain/em styling (display
 *     names for user/role events, free-form text). Null when no text
 *     target applies.
 *   • `createdAt`     — ISO datetime. The widget formats this as
 *     a short relative label ("2m" / "1h" / "yest.").
 *
 * The widget never reads `metadata` directly — every field it needs
 * has been resolved on the server against the *current* users / tables
 * maps, so a row whose actor user was later deleted still renders
 * with the snapshot label the audit event carried.
 */
export interface RecentActivityEntry {
  id: string
  action: AuditAction
  actor: RecentActivityActor | null
  targetCode: string | null
  targetText: string | null
  createdAt: string
}

export interface RecentActivityStats {
  rows: RecentActivityEntry[]
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

/**
 * Group counts of `data_rows.status` for a single table. Returns
 * {draft, published, scheduled, total} so the handler can derive
 * everything from one round-trip per table.
 */
async function readStatusCounts(
  db: DbClient,
  tableId: string,
): Promise<{ total: number; published: number; drafts: number; scheduled: number }> {
  const { rows } = await db<{ status: string; count: number | string }>`
    select status, count(*) as count
    from data_rows
    where table_id = ${tableId}
      and deleted_at is null
    group by status
  `
  let published = 0
  let drafts = 0
  let scheduled = 0
  for (const r of rows) {
    const n = typeof r.count === 'string' ? parseInt(r.count, 10) : r.count
    if (r.status === 'published') published += n
    else if (r.status === 'draft') drafts += n
    else if (r.status === 'scheduled') scheduled += n
  }
  return {
    total: published + drafts + scheduled,
    published,
    drafts,
    scheduled,
  }
}

/**
 * Count `data_rows` whose `published_at` lies in the trailing 7 days,
 * for one table. Used by the Pages widget's "+N this week" delta.
 */
async function readPublishedSinceCount(
  db: DbClient,
  tableId: string,
  sinceIso: string,
): Promise<number> {
  const { rows } = await db<{ count: number | string }>`
    select count(*) as count
    from data_rows
    where table_id = ${tableId}
      and deleted_at is null
      and status = 'published'
      and published_at is not null
      and published_at >= ${sinceIso}
  `
  const c = rows[0]?.count ?? 0
  return typeof c === 'string' ? parseInt(c, 10) : c
}

/**
 * 28-day publish histogram across ALL post-type tables. Groups by the
 * date portion of `published_at` (interpreted in UTC). The handler
 * post-processes the rows into a dense [28]-array so the front-end can
 * render bars without conditional gaps.
 */
async function readPostsHistogram(
  db: DbClient,
  postTypeTableIds: readonly string[],
  sinceIso: string,
): Promise<Map<string, number>> {
  if (postTypeTableIds.length === 0) return new Map()
  // ANSI-SQL date truncation: `substr(published_at::text, 1, 10)` keeps
  // it dialect-naive (Postgres `::text` cast is forbidden by
  // architecture gate db-postgres-isms; SQLite stores timestamps as
  // strings already). We rely on the fact that BOTH dialects emit
  // ISO-prefix strings from `published_at` when concatenated. The
  // approach: pull every published row in the window (cardinality is
  // bounded by the trailing-28-day window times the table count) and
  // bin client-side.
  const { rows } = await db<{ table_id: string; published_at: string | Date }>`
    select table_id, published_at
    from data_rows
    where deleted_at is null
      and status = 'published'
      and published_at is not null
      and published_at >= ${sinceIso}
  `
  const counts = new Map<string, number>()
  const postTypeSet = new Set(postTypeTableIds)
  for (const r of rows) {
    if (!postTypeSet.has(r.table_id)) continue
    const iso = typeof r.published_at === 'string'
      ? r.published_at
      : r.published_at.toISOString()
    const day = iso.slice(0, 10)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return counts
}

/**
 * Aggregated plugin stats for the Plugins dashboard widget.
 *
 *   • total       — every non-deleted installed plugin row
 *   • active      — rows with enabled=true AND lifecycle_status='active'
 *   • disabled    — rows with enabled=false OR lifecycle_status='disabled'
 *   • errored     — rows with lifecycle_status='error' (problem state)
 *   • rows        — up to 8 most-recently-installed plugins (id/name/
 *                   version/state) for the widget's body list
 *
 * `state` collapses `enabled` × `lifecycle_status` into a single value
 * the widget can dot-color directly. `'installed'` lifecycle rows show
 * as `'disabled'` for the widget (not yet activated).
 */
async function readPluginsStats(db: DbClient): Promise<PluginsStats> {
  const { rows } = await db<{
    id: string
    name: string
    version: string
    enabled: boolean | number
    lifecycle_status: string
    manifest_json: unknown
  }>`
    select id, name, version, enabled, lifecycle_status, manifest_json
    from installed_plugins
    order by installed_at desc
  `

  let active = 0
  let disabled = 0
  let errored = 0
  const out: PluginsStatsRow[] = []

  for (const r of rows) {
    // SQLite returns integer booleans (0/1); PG returns boolean.
    const isEnabled = r.enabled === true || r.enabled === 1
    const lifecycle = r.lifecycle_status
    const state: PluginsStatsRow['state'] =
      lifecycle === 'error'
        ? 'error'
        : isEnabled && lifecycle === 'active'
          ? 'active'
          : 'disabled'

    if (state === 'active') active += 1
    else if (state === 'error') errored += 1
    else disabled += 1

    // Cap the per-row payload at the 8 most recent; the counts above
    // include every plugin so the widget can show "12 plugins · 3
    // disabled" alongside the truncated list.
    if (out.length < 8) {
      out.push({
        id: r.id,
        name: r.name,
        version: r.version,
        state,
        iconUrl: resolveManifestIconUrl(r.manifest_json),
      })
    }
  }

  return {
    total: rows.length,
    active,
    disabled,
    errored,
    rows: out,
  }
}

/**
 * Resolve the public URL of a plugin's manifest-declared icon
 * (`manifest.icon`) against its `manifest.assetBasePath`. The same
 * resolution rule the Plugins admin card uses — keep them in lockstep
 * so the dashboard widget shows the same glyph the operator picked.
 *
 * Returns `null` when:
 *   - the manifest has no `icon` field, or
 *   - the manifest has no `assetBasePath` (broken / dev plugin), or
 *   - the column value is not a parseable JSON object.
 *
 * The SQLite adapter auto-parses `*_json` strings on read, so the
 * value normally arrives as an object on both dialects. The defensive
 * `JSON.parse` covers the edge case of a corrupted row that the
 * SQLite adapter handed back as the raw string.
 */
function resolveManifestIconUrl(manifestJson: unknown): string | null {
  let manifest: unknown = manifestJson
  if (typeof manifest === 'string') {
    try {
      manifest = JSON.parse(manifest)
    } catch {
      return null
    }
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null
  const m = manifest as Record<string, unknown>
  const icon = typeof m.icon === 'string' && m.icon.trim() ? m.icon.trim() : null
  const assetBasePath =
    typeof m.assetBasePath === 'string' && m.assetBasePath.trim() ? m.assetBasePath : null
  if (!icon || !assetBasePath) return null
  return `${assetBasePath.replace(/\/+$/, '')}/${icon.replace(/^\/+/, '')}`
}

/**
 * Pull the rows that fill the dashboard "Publish lineup" widget.
 *
 *   • Up to 3 upcoming scheduled rows, soonest-first
 *   • Up to 2 recently-published rows, newest-first
 *   • Up to 2 drafts, most-recently-touched first
 *
 * Joined to `data_tables` so we can render the row's public path
 * (`route_base + slug`) — matches what the user sees in the editor.
 * Three separate queries (not one UNION) because:
 *   1. ANSI SQL UNION with mixed ORDER BY is dialect-painful, and
 *   2. The three slices have different sort keys, which a UNION would
 *      force into a single composite key.
 *
 * Combined and ordered client-side: scheduled rows (chronological,
 * soonest first) → published rows (newest first) → drafts. Same order
 * the original mocked widget used so the visual rhythm is preserved.
 */
async function readPublishLineup(db: DbClient): Promise<PublishLineupStats> {
  const scheduledRowsLimit = 3
  const publishedRowsLimit = 2
  const draftRowsLimit = 2

  type LineupRow = {
    id: string
    slug: string
    table_id: string
    route_base: string | null
    scheduled_publish_at: string | Date | null
    published_at: string | Date | null
  }

  // Upcoming scheduled — soonest first.
  const { rows: scheduledRows } = await db<LineupRow>`
    select r.id,
           r.slug,
           r.table_id,
           t.route_base,
           r.scheduled_publish_at,
           r.published_at
    from data_rows r
    join data_tables t on t.id = r.table_id
    where r.deleted_at is null
      and r.status = 'scheduled'
      and r.scheduled_publish_at is not null
    order by r.scheduled_publish_at asc
    limit ${scheduledRowsLimit}
  `

  // Recently published — newest first.
  const { rows: publishedRows } = await db<LineupRow>`
    select r.id,
           r.slug,
           r.table_id,
           t.route_base,
           r.scheduled_publish_at,
           r.published_at
    from data_rows r
    join data_tables t on t.id = r.table_id
    where r.deleted_at is null
      and r.status = 'published'
      and r.published_at is not null
    order by r.published_at desc
    limit ${publishedRowsLimit}
  `

  // Drafts — most-recently-touched first. We don't list the entire
  // backlog; the widget is a snapshot, not the Content workspace.
  const { rows: draftRows } = await db<LineupRow>`
    select r.id,
           r.slug,
           r.table_id,
           t.route_base,
           r.scheduled_publish_at,
           r.published_at
    from data_rows r
    join data_tables t on t.id = r.table_id
    where r.deleted_at is null
      and r.status = 'draft'
    order by r.updated_at desc
    limit ${draftRowsLimit}
  `

  function makePath(routeBase: string | null, tableId: string, slug: string): string {
    const safeSlug = slug || '(no slug)'
    const base = routeBase && routeBase.trim().length > 0 ? routeBase : `/${tableId}`
    const normalizedBase = base.startsWith('/') ? base : `/${base}`
    const trimmedBase = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase
    return `${trimmedBase}/${safeSlug}`
  }

  function toIsoOrNull(value: string | Date | null): string | null {
    if (value === null) return null
    return typeof value === 'string' ? value : value.toISOString()
  }

  const rows: PublishLineupRow[] = [
    ...scheduledRows.map((r): PublishLineupRow => ({
      id: r.id,
      path: makePath(r.route_base, r.table_id, r.slug),
      status: 'scheduled',
      at: toIsoOrNull(r.scheduled_publish_at),
    })),
    ...publishedRows.map((r): PublishLineupRow => ({
      id: r.id,
      path: makePath(r.route_base, r.table_id, r.slug),
      status: 'published',
      at: toIsoOrNull(r.published_at),
    })),
    ...draftRows.map((r): PublishLineupRow => ({
      id: r.id,
      path: makePath(r.route_base, r.table_id, r.slug),
      status: 'draft',
      at: null,
    })),
  ]

  return { rows }
}

/**
 * 16 most-recent image-type media assets. The dashboard widget renders
 * them as a thumbnail mosaic via the shared `<Image>` primitive,
 * which builds a srcset from the variant ladder.
 */
async function readLatestImageThumbs(db: DbClient, limit: number): Promise<MediaStatsThumb[]> {
  const { rows } = await db<{
    id: string
    public_path: string
    alt_text: string | null
    mime_type: string
    width: number | null
    height: number | null
    variants_json: unknown
  }>`
    select id, public_path, alt_text, mime_type, width, height, variants_json
    from media_assets
    where deleted_at is null
      and mime_type like 'image/%'
    order by created_at desc
    limit ${limit}
  `
  return rows.map((r) => ({
    id: r.id,
    publicPath: r.public_path,
    altText: r.alt_text ?? '',
    mimeType: r.mime_type,
    width: r.width,
    height: r.height,
    variants: Array.isArray(r.variants_json)
      ? r.variants_json
          .filter((v): v is { width: number; height: number; format: string; path: string } => {
            if (!v || typeof v !== 'object') return false
            const x = v as Record<string, unknown>
            return (
              typeof x.width === 'number' &&
              typeof x.height === 'number' &&
              typeof x.format === 'string' &&
              typeof x.path === 'string'
            )
          })
          .map((v) => ({ width: v.width, height: v.height, format: v.format, path: v.path }))
      : [],
  }))
}

/**
 * Recent activity for the dashboard widget — a curated slice of
 * `audit_events`, joined to current `users` / `data_tables` so the
 * widget can render each row without extra lookups.
 *
 *   • We deliberately skip the `login.*` and `logout` events: those
 *     belong in Account → Sign-in history. The dashboard activity feed
 *     is about *operational* changes to the site (edits, publishes,
 *     plugin lifecycle, user/role mutations).
 *   • We pre-build `targetCode` / `targetText` from each event's
 *     metadata + the current table/user maps. For `data.row.*` events
 *     that means resolving `tableId + slug → /route_base/slug` exactly
 *     like the publish lineup widget does.
 */
async function readRecentActivity(db: DbClient): Promise<RecentActivityStats> {
  const widgetLimit = 10
  // Pull an oversized window so we can drop login.* noise (filtered in JS;
  // see below) and still have enough rows to fill the widget. 50 is the
  // practical ceiling: even a busy admin afternoon rarely produces more
  // than that, and the audit_events table already has an index on
  // `created_at desc` so this is a cheap scan.
  const fetchLimit = 50

  type ActivityRow = {
    id: string
    actor_user_id: string | null
    action: AuditAction
    target_type: string | null
    target_id: string | null
    metadata_json: unknown
    created_at: string | Date
    actor_display_name: string | null
    actor_email: string | null
    actor_avatar_path: string | null
    target_user_display_name: string | null
    target_user_email: string | null
  }

  // `where action in (...)` would be dialect-painful (Postgres requires
  // ANY($n::text[]) and SQLite needs an inline expansion that the tagged-
  // template binding here can't produce). The set is small and bounded,
  // so we filter client-side after the query — same end result, dialect-
  // naive query.
  //
  // The actor join also pulls `media_assets.public_path` for the actor's
  // uploaded avatar (via `users.avatar_media_id`) so the widget can
  // render the same `<UserAvatar>` primitive the toolbar and Users page
  // use — uploaded image first, Gravatar fallback (computed from email
  // below), then initials.
  const { rows } = await db<ActivityRow>`
    select e.id,
           e.actor_user_id,
           e.action,
           e.target_type,
           e.target_id,
           e.metadata_json,
           e.created_at,
           u.display_name as actor_display_name,
           u.email as actor_email,
           am.public_path as actor_avatar_path,
           tu.display_name as target_user_display_name,
           tu.email as target_user_email
    from audit_events e
    left join users u on u.id = e.actor_user_id
    left join media_assets am on am.id = u.avatar_media_id
    left join users tu on tu.id = e.target_id and e.target_type = 'user'
    order by e.created_at desc
    limit ${fetchLimit}
  `

  const visible = rows.filter((r) => !isDashboardActivityNoise(r.action)).slice(0, widgetLimit)

  // Look up the route_base for every data.* event in one shot so we can
  // build "/blog/launching-..." paths without an N+1.
  const tableIds = new Set<string>()
  for (const r of visible) {
    if (r.action.startsWith('data.row.') || r.action === 'data.author.assign') {
      const meta = metadataAsRecord(r.metadata_json)
      const tableId = readString(meta, 'tableId')
      if (tableId) tableIds.add(tableId)
    }
  }
  const routeBaseById = new Map<string, string | null>()
  for (const id of tableIds) {
    const { rows: tableRows } = await db<{ route_base: string | null }>`
      select route_base from data_tables where id = ${id}
    `
    routeBaseById.set(id, tableRows[0]?.route_base ?? null)
  }

  return {
    rows: visible.map((r): RecentActivityEntry => projectActivityRow(r, routeBaseById)),
  }
}

/**
 * `login.*` and `logout` events live in Account → Sign-in history. The
 * dashboard Activity widget is about *operational* changes to the site,
 * so we skip them — they would otherwise drown out the signal on a
 * busy login day.
 */
function isDashboardActivityNoise(action: AuditAction): boolean {
  return action.startsWith('login.') || action === 'logout'
}

function projectActivityRow(
  row: {
    id: string
    actor_user_id: string | null
    action: AuditAction
    target_type: string | null
    target_id: string | null
    metadata_json: unknown
    created_at: string | Date
    actor_display_name: string | null
    actor_email: string | null
    actor_avatar_path: string | null
    target_user_display_name: string | null
    target_user_email: string | null
  },
  routeBaseById: Map<string, string | null>,
): RecentActivityEntry {
  const metadata = metadataAsRecord(row.metadata_json)
  const target = activityTarget(row.action, row.target_id, metadata, routeBaseById, {
    targetUserLabel: userDisplayLabel(row.target_user_display_name, row.target_user_email),
  })

  return {
    id: row.id,
    action: row.action,
    actor: buildActor(row),
    targetCode: target.code,
    targetText: target.text,
    createdAt: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
  }
}

/**
 * Build the actor payload for an audit row. Returns null for
 * system-initiated events (no actor user). When the actor user has
 * since been deleted the join columns come back null too; we surface
 * that as a system row rather than ghosting the row with placeholder
 * text — the widget already has a clean fallback.
 */
function buildActor(row: {
  actor_user_id: string | null
  actor_display_name: string | null
  actor_email: string | null
  actor_avatar_path: string | null
}): RecentActivityActor | null {
  if (row.actor_user_id === null || row.actor_email === null) return null
  return {
    displayName: row.actor_display_name ?? '',
    email: row.actor_email,
    avatarUrl: row.actor_avatar_path,
    gravatarHash: computeGravatarHash(row.actor_email),
  }
}

function metadataAsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const v = metadata[key]
  return typeof v === 'string' && v.trim() ? v : null
}

function userDisplayLabel(displayName: string | null, email: string | null): string | null {
  const cleanName = displayName?.trim() ?? ''
  if (cleanName) return cleanName
  if (email && email.trim()) return email
  return null
}

function buildRowPath(
  tableId: string,
  slug: string,
  routeBaseById: Map<string, string | null>,
): string {
  const routeBase = routeBaseById.get(tableId) ?? null
  const safeSlug = slug || '(no slug)'
  const base = routeBase && routeBase.trim().length > 0 ? routeBase : `/${tableId}`
  const normalizedBase = base.startsWith('/') ? base : `/${base}`
  const trimmedBase = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase
  return `${trimmedBase}/${safeSlug}`
}

/**
 * Resolve the `targetCode` / `targetText` pair for a single activity
 * row. The split between the two fields is the widget's contract:
 * `targetCode` renders in <code> styling (paths, slugs, plugin ids);
 * `targetText` renders in plain styling (human names). Each action
 * picks one or the other — never both.
 */
function activityTarget(
  action: AuditAction,
  targetId: string | null,
  metadata: Record<string, unknown>,
  routeBaseById: Map<string, string | null>,
  context: { targetUserLabel: string | null },
): { code: string | null; text: string | null } {
  // Data-row events: render a code-styled path so the row reads
  // "edited /blog/launching-page-builder".
  if (action.startsWith('data.row.') || action === 'data.author.assign') {
    const tableId = readString(metadata, 'tableId')
    const slug = readString(metadata, 'slug')
    if (tableId && slug !== null) {
      return { code: buildRowPath(tableId, slug ?? '', routeBaseById), text: null }
    }
    return { code: null, text: null }
  }

  // Data-table events: target_id is the collection id, metadata.name
  // is the human label. Prefer the human label when present.
  if (action.startsWith('data.table.')) {
    const name = readString(metadata, 'name')
    if (name) return { code: null, text: name }
    return { code: targetId ?? null, text: null }
  }

  // Plugin events: pluginId may live in metadata (preferred) or
  // target_id depending on the call site.
  if (action.startsWith('plugin.')) {
    const pluginId = readString(metadata, 'pluginId') ?? targetId
    return { code: pluginId, text: null }
  }

  // User events: prefer the current display name (joined), fall back
  // to the snapshot stored in metadata.email so a deleted user still
  // renders something useful.
  if (action.startsWith('user.') || action === 'password.change') {
    if (context.targetUserLabel) return { code: null, text: context.targetUserLabel }
    const email = readString(metadata, 'email')
    if (email) return { code: null, text: email }
    return { code: null, text: targetId ?? null }
  }

  // Role events: target_id is the role id. metadata.name carries
  // the snapshot label; for role.assign the actual subject is the
  // user being assigned to (handled separately by the widget verb).
  if (action.startsWith('role.')) {
    const name = readString(metadata, 'name')
    if (name) return { code: null, text: name }
    return { code: null, text: targetId ?? null }
  }

  // 'publish' — no per-row target; the verb alone reads "published the site".
  return { code: null, text: null }
}

// ---------------------------------------------------------------------------
// Per-domain readers
//
// Each reader runs ONLY the queries its widget needs. They share the
// helpers above (readStatusCounts, readPostsHistogram, …) so the SQL
// is not duplicated; what's split is the entry point + the response
// shape returned to the client.
// ---------------------------------------------------------------------------

async function readPagesStats(db: DbClient): Promise<PagesStats> {
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [counts, delta] = await Promise.all([
    readStatusCounts(db, 'pages'),
    readPublishedSinceCount(db, 'pages', sevenDaysAgoIso),
  ])
  return {
    total: counts.total,
    published: counts.published,
    drafts: counts.drafts,
    scheduled: counts.scheduled,
    deltaPublishedThisWeek: delta,
  }
}

async function readPostsStats(db: DbClient): Promise<PostsStats> {
  const twentyEightDaysAgoIso = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
  const { rows: postTypeRows } = await db<{ id: string }>`
    select id
    from data_tables
    where kind = 'postType'
      and deleted_at is null
  `
  const postTypeIds = postTypeRows.map((r) => r.id)

  // Read per-table counts + the histogram in parallel — they are
  // independent queries against the same rows.
  const [countsArr, histogram] = await Promise.all([
    Promise.all(postTypeIds.map((id) => readStatusCounts(db, id))),
    readPostsHistogram(db, postTypeIds, twentyEightDaysAgoIso),
  ])

  let postsTotal = 0
  let postsScheduled = 0
  for (const c of countsArr) {
    postsTotal += c.total
    postsScheduled += c.scheduled
  }

  // Densify into [28] oldest-first.
  const daily28 = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(Date.now() - (27 - i) * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    return histogram.get(key) ?? 0
  })

  return {
    total: postsTotal,
    categories: postTypeIds.length,
    scheduled: postsScheduled,
    daily28,
  }
}

async function readMediaStats(db: DbClient): Promise<MediaStats> {
  // Two queries — totals + the latest thumbs — fire in parallel.
  const [totalsResult, latestThumbs] = await Promise.all([
    db<{ count: number | string; bytes: number | string | null }>`
      select count(*) as count, coalesce(sum(size_bytes), 0) as bytes
      from media_assets
      where deleted_at is null
    `,
    readLatestImageThumbs(db, 16),
  ])
  const mediaTotals = totalsResult.rows
  const mediaCount = typeof mediaTotals[0]?.count === 'string'
    ? parseInt(mediaTotals[0].count, 10)
    : mediaTotals[0]?.count ?? 0
  const mediaBytes = mediaTotals[0]?.bytes === null || mediaTotals[0]?.bytes === undefined
    ? 0
    : typeof mediaTotals[0].bytes === 'string'
      ? parseInt(mediaTotals[0].bytes, 10)
      : mediaTotals[0].bytes
  return {
    count: mediaCount,
    totalBytes: mediaBytes,
    latestThumbs,
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

type DashboardReader = (db: DbClient) => Promise<unknown>

// `/dashboard/<segment>` → reader. The segment is the public slug, the
// reader returns the JSON-serialisable response body. Keeps the route
// dispatch a single Map lookup and the per-endpoint differences are
// only the URL slug + the reader function.
const DASHBOARD_READERS: Record<string, DashboardReader> = {
  'pages': readPagesStats,
  'posts': readPostsStats,
  'media': readMediaStats,
  'plugins': readPluginsStats,
  'publish-lineup': readPublishLineup,
  'activity': readRecentActivity,
}

export async function handleDashboardRoutes(
  req: Request,
  db: DbClient,
): Promise<Response | null> {
  const url = new URL(req.url)
  const prefix = `${CMS_API_PREFIX}/dashboard/`
  if (!url.pathname.startsWith(prefix)) return null
  const segment = url.pathname.slice(prefix.length)
  const reader = DASHBOARD_READERS[segment]
  if (!reader) return null
  if (req.method !== 'GET') return methodNotAllowed()

  // Any authenticated admin user can read dashboard stats. The
  // dashboard widgets are visible to anyone with admin-app access; we
  // don't gate behind a specific capability (the underlying counts are
  // already non-sensitive — total counts, no row content).
  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user

  const body = await reader(db)
  return jsonResponse(body)
}
