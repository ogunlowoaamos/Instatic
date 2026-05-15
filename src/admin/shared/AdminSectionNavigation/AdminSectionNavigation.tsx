/**
 * AdminSectionNavigation — the row of section links shown inside the
 * editor toolbar (Site · Content · Plugins · Users · …plugin pages).
 *
 * Lives next to the toolbar styles it consumes so both the heavy
 * AdminCanvasLayout (Site / Content) and the lightweight AdminPageLayout
 * (Plugins / Users / Account / plugin pages) can share it without one
 * layout pulling the other layout's module graph in.
 */
import { useEffect, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { listCmsPlugins } from '@core/persistence/cmsPlugins'
import type { CmsCurrentUser } from '@core/persistence'
import type { PluginAdminPageRoute } from '@core/plugin-sdk'
import { Link, useLocation } from '@admin/lib/routing'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import { useCurrentAdminUser } from '@admin/sessionContext'
import { canAccessWorkspace } from '@admin/access'
import {
  getPluginsInErrorCount,
  subscribePluginIssues,
} from '@admin/pages/plugins/utils/pluginIssuesStore'
import { CMS_PLUGINS_CHANGED_EVENT } from '@admin/pages/plugins/utils/pluginEvents'
import type { AdminWorkspace } from '@admin/workspace'
import toolbarStyles from '@site/toolbar/Toolbar.module.css'

interface AdminSectionNavigationProps {
  section: AdminWorkspace
  currentUser?: CmsCurrentUser | null
  onWorkspaceNavigateStart?: () => void
}

export function AdminSectionNavigation({
  section,
  currentUser,
  onWorkspaceNavigateStart,
}: AdminSectionNavigationProps) {
  const [pluginPages, setPluginPages] = useState<PluginAdminPageRoute[]>([])
  const sessionUser = useCurrentAdminUser()
  const effectiveUser = currentUser ?? sessionUser ?? null
  const unrestricted = !effectiveUser
  const canAccess = (workspace: AdminWorkspace) => unrestricted || canAccessWorkspace(effectiveUser, workspace)
  const canAccessPlugins = canAccess('plugins')

  useEffect(() => {
    let cancelled = false

    async function loadPluginPages() {
      if (!canAccessPlugins) {
        setPluginPages([])
        return
      }
      try {
        const payload = await listCmsPlugins()
        if (!cancelled) {
          setPluginPages((current) => {
            const next = payload.adminPages
            const unchanged =
              current.length === next.length &&
              current.every((page, index) => page.route === next[index]?.route)
            return unchanged ? current : next
          })
        }
      } catch {
        // Navigation remains usable when plugins cannot be loaded.
      }
    }

    function refreshPluginPages() {
      void loadPluginPages()
    }

    refreshPluginPages()
    window.addEventListener(CMS_PLUGINS_CHANGED_EVENT, refreshPluginPages)
    return () => {
      cancelled = true
      window.removeEventListener(CMS_PLUGINS_CHANGED_EVENT, refreshPluginPages)
    }
  }, [canAccessPlugins])

  return (
    <>
      {canAccess('site') && (
        section === 'site' ? (
          <span className={toolbarStyles.activeSection}>Site</span>
        ) : (
          <AdminRouteLink to="/admin/site" onNavigateStart={onWorkspaceNavigateStart}>Site</AdminRouteLink>
        )
      )}
      {canAccess('content') && (
        section === 'content' ? (
          <span className={toolbarStyles.activeSection}>Content</span>
        ) : (
          <AdminRouteLink to="/admin/content" onNavigateStart={onWorkspaceNavigateStart}>Content</AdminRouteLink>
        )
      )}
      {canAccess('media') && (
        section === 'media' ? (
          <span className={toolbarStyles.activeSection}>Media</span>
        ) : (
          <AdminRouteLink to="/admin/media" onNavigateStart={onWorkspaceNavigateStart}>Media</AdminRouteLink>
        )
      )}
      {canAccess('plugins') && (
        <PluginsNavLink
          active={section === 'plugins'}
          onNavigateStart={onWorkspaceNavigateStart}
        />
      )}
      {canAccess('users') && (
        section === 'users' ? (
          <span className={toolbarStyles.activeSection}>Users</span>
        ) : (
          <AdminRouteLink to="/admin/users" onNavigateStart={onWorkspaceNavigateStart}>Users</AdminRouteLink>
        )
      )}
      {canAccessPlugins && pluginPages.map((page) => (
        <AdminRouteLink
          key={`${page.pluginId}:${page.id}`}
          to={page.route}
          onNavigateStart={onWorkspaceNavigateStart}
        >
          {page.navLabel ?? page.title}
        </AdminRouteLink>
      ))}
    </>
  )
}

/**
 * Plugins nav link — renders a tiny red dot next to the label when any
 * plugin is currently in `error` lifecycle state. The dot is fed by the
 * live SSE-driven `pluginIssuesStore`, so a plugin crashing while the
 * user is on (say) the Content page lights up the badge in real time.
 */
function PluginsNavLink({
  active,
  onNavigateStart,
}: {
  active: boolean
  onNavigateStart?: () => void
}) {
  const issuesCount = useSyncExternalStore(
    subscribePluginIssues,
    getPluginsInErrorCount,
    getPluginsInErrorCount,
  )
  const dot = issuesCount > 0 ? (
    <span
      className={toolbarStyles.pluginsErrorDot}
      role="status"
      aria-label={`${issuesCount} plugin${issuesCount === 1 ? '' : 's'} in error state`}
      title={`${issuesCount} plugin${issuesCount === 1 ? '' : 's'} need${issuesCount === 1 ? 's' : ''} attention`}
    />
  ) : null

  if (active) {
    return (
      <span className={toolbarStyles.activeSection}>
        Plugins
        {dot}
      </span>
    )
  }
  return (
    <AdminRouteLink to="/admin/plugins" onNavigateStart={onNavigateStart}>
      Plugins
      {dot}
    </AdminRouteLink>
  )
}

/**
 * Soft-navigating admin nav link. Always rendered inside the admin Router
 * (the admin shell unconditionally mounts one), so we don't fork into a
 * router-vs-static branch — calling `useAdminNavigate` here is always safe.
 */
function AdminRouteLink({
  to,
  children,
  onNavigateStart,
}: {
  to: string
  children: ReactNode
  onNavigateStart?: () => void
}) {
  const navigate = useAdminNavigate()
  const location = useLocation()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Modifier keys / non-primary buttons / target=_blank → let the native
    // <a> behaviour run (open-in-new-tab, etc.). Same-page clicks are a
    // no-op so the soft transition doesn't replay needlessly.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.currentTarget.target
    ) {
      return
    }

    if (location.pathname === to) return

    event.preventDefault()
    onNavigateStart?.()
    navigate(to)
  }

  return (
    <Link className={toolbarStyles.adminLink} to={to} onClick={handleClick}>
      {children}
    </Link>
  )
}
