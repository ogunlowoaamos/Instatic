/**
 * Per-widget dashboard data hooks.
 *
 * Each hook owns ONE network round-trip against a per-domain endpoint
 * (`/admin/api/cms/dashboard/<domain>`). The 6 hooks fire in parallel
 * when the dashboard mounts, and each widget unblocks AS ITS DATA
 * ARRIVES — the dashboard fills in progressively instead of stalling
 * on the slowest endpoint (the audit-events-driven Activity feed).
 *
 *   • `usePagesStats()`        — Pages widget (cheap; 2 small counts)
 *   • `usePostsStats()`        — Posts widget (one query per postType
 *                                  + a 28-day histogram)
 *   • `useMediaStats()`        — Media widget (totals + 16 thumbs)
 *   • `usePluginsStats()`      — Plugins widget (one scan of
 *                                  `installed_plugins`)
 *   • `usePublishLineupStats()`— Publish Lineup widget (three small
 *                                  range queries)
 *   • `useRecentActivityStats()`— Activity widget (a 50-row audit-events
 *                                  scan + projections; slowest)
 *
 * Validation: each response is type-guarded at the JSON boundary.
 * Mismatched payloads fall back to `null` (the widget keeps showing
 * its skeleton — better than throwing and blanking the dashboard).
 *
 * Cancellation: each effect tracks a `cancelled` flag so a fast
 * unmount-then-remount doesn't race the response into a stale state.
 *
 * No SWR / cache here yet — the dashboard is a single mount per
 * session and the responses are small. If we later cache across
 * mounts, do it module-level so multiple sibling widgets that share a
 * domain (none today) reuse one fetch.
 */
import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Response shapes (must stay in sync with `server/handlers/cms/dashboard.ts`)
// ---------------------------------------------------------------------------

export interface DashboardMediaThumb {
  id: string
  publicPath: string
  altText: string
  mimeType: string
  width: number | null
  height: number | null
  variants: Array<{ width: number; height: number; format: string; path: string }>
}

export interface DashboardPluginRow {
  id: string
  name: string
  version: string
  state: 'active' | 'disabled' | 'error'
  /**
   * Public URL for the plugin's manifest-declared icon, resolved on the
   * server. `null` when the plugin omits an icon — the widget renders
   * its fallback plug glyph in that case.
   */
  iconUrl: string | null
}

export interface DashboardPublishLineupRow {
  id: string
  /** Public path (`/blog/sandbox-deep-dive`). */
  path: string
  status: 'scheduled' | 'published' | 'draft'
  /**
   * ISO datetime relevant to the status:
   *   - scheduled → future scheduled_publish_at
   *   - published → past published_at
   *   - draft     → null
   * The widget renders this as a relative-time label client-side.
   */
  at: string | null
}

export interface DashboardActivityActor {
  displayName: string
  email: string
  avatarUrl: string | null
  gravatarHash: string
}

export interface DashboardActivityEntry {
  id: string
  action: string
  actor: DashboardActivityActor | null
  targetCode: string | null
  targetText: string | null
  createdAt: string
}

export interface DashboardPagesStats {
  total: number
  published: number
  drafts: number
  scheduled: number
  deltaPublishedThisWeek: number
}

export interface DashboardPostsStats {
  total: number
  categories: number
  scheduled: number
  daily28: number[]
}

export interface DashboardMediaStats {
  count: number
  totalBytes: number
  latestThumbs: DashboardMediaThumb[]
}

export interface DashboardPluginsStats {
  total: number
  active: number
  disabled: number
  errored: number
  rows: DashboardPluginRow[]
}

export interface DashboardPublishLineupStats {
  rows: DashboardPublishLineupRow[]
}

export interface DashboardActivityStats {
  rows: DashboardActivityEntry[]
}

// ---------------------------------------------------------------------------
// Type guards — used at the JSON boundary so widgets can trust the
// payload by the time they receive a non-null value.
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPagesStats(v: unknown): v is DashboardPagesStats {
  if (!isObject(v)) return false
  return (
    typeof v.total === 'number' &&
    typeof v.published === 'number' &&
    typeof v.drafts === 'number' &&
    typeof v.scheduled === 'number' &&
    typeof v.deltaPublishedThisWeek === 'number'
  )
}

function isPostsStats(v: unknown): v is DashboardPostsStats {
  if (!isObject(v)) return false
  return (
    typeof v.total === 'number' &&
    typeof v.categories === 'number' &&
    typeof v.scheduled === 'number' &&
    Array.isArray(v.daily28)
  )
}

function isMediaStats(v: unknown): v is DashboardMediaStats {
  if (!isObject(v)) return false
  return (
    typeof v.count === 'number' &&
    typeof v.totalBytes === 'number' &&
    Array.isArray(v.latestThumbs)
  )
}

function isPluginsStats(v: unknown): v is DashboardPluginsStats {
  if (!isObject(v)) return false
  return (
    typeof v.total === 'number' &&
    typeof v.active === 'number' &&
    typeof v.disabled === 'number' &&
    typeof v.errored === 'number' &&
    Array.isArray(v.rows)
  )
}

function isPublishLineupStats(v: unknown): v is DashboardPublishLineupStats {
  if (!isObject(v)) return false
  return Array.isArray(v.rows)
}

function isActivityStats(v: unknown): v is DashboardActivityStats {
  if (!isObject(v)) return false
  return Array.isArray(v.rows)
}

// ---------------------------------------------------------------------------
// Generic fetch hook factory
// ---------------------------------------------------------------------------

/**
 * Generic `useEffect`-based fetcher with cancellation + type-guarded
 * boundary parsing. Each per-domain hook below is a one-liner over this.
 */
function useDashboardEndpoint<T>(
  endpoint: string,
  isValid: (value: unknown) => value is T,
): T | null {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/admin/api/cms/dashboard/${endpoint}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) {
          console.warn(`[dashboard] /${endpoint} returned`, res.status)
          return
        }
        const body: unknown = await res.json()
        if (cancelled) return
        if (isValid(body)) setData(body)
        else console.warn(`[dashboard] /${endpoint} returned unexpected shape`)
      } catch (err) {
        console.error(`[dashboard] failed to load /${endpoint}:`, err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint, isValid])
  return data
}

// ---------------------------------------------------------------------------
// Per-domain hooks
// ---------------------------------------------------------------------------

/** Pages widget. Two cheap counts on `data_rows` for the system pages table. */
export function usePagesStats(): DashboardPagesStats | null {
  return useDashboardEndpoint('pages', isPagesStats)
}

/** Posts widget. One query per postType table + a 28-day histogram. */
export function usePostsStats(): DashboardPostsStats | null {
  return useDashboardEndpoint('posts', isPostsStats)
}

/** Media widget. Totals + 16 most-recent image thumbnails. */
export function useMediaStats(): DashboardMediaStats | null {
  return useDashboardEndpoint('media', isMediaStats)
}

/** Plugins widget. One scan of `installed_plugins`. */
export function usePluginsStats(): DashboardPluginsStats | null {
  return useDashboardEndpoint('plugins', isPluginsStats)
}

/** Publish Lineup widget. Three small queries against `data_rows`. */
export function usePublishLineupStats(): DashboardPublishLineupStats | null {
  return useDashboardEndpoint('publish-lineup', isPublishLineupStats)
}

/** Activity widget. The heaviest endpoint — a 50-row `audit_events` scan. */
export function useRecentActivityStats(): DashboardActivityStats | null {
  return useDashboardEndpoint('activity', isActivityStats)
}
