import type { ContentEntry } from '@core/content/schemas'
import type { CmsCurrentUser } from '@core/persistence'
import type { CoreCapability } from '@core/capabilities'
import type { AdminWorkspace } from './workspace'

const CONTENT_ACCESS_CAPABILITIES: CoreCapability[] = [
  'content.create',
  'content.edit.own',
  'content.edit.any',
  'content.publish.own',
  'content.publish.any',
  'content.manage',
]

export function hasCapability(user: CmsCurrentUser | null, capability: CoreCapability): boolean {
  return Boolean(user?.capabilities.includes(capability))
}

function hasAnyCapability(user: CmsCurrentUser | null, capabilities: readonly CoreCapability[]): boolean {
  return capabilities.some((capability) => hasCapability(user, capability))
}

export function hasAllCapabilities(user: CmsCurrentUser | null, capabilities: readonly CoreCapability[]): boolean {
  return capabilities.every((capability) => hasCapability(user, capability))
}

function ownsContentEntry(user: CmsCurrentUser | null, entry: ContentEntry | null): boolean {
  if (!user || !entry) return false
  return entry.authorUserId === user.id || (!entry.authorUserId && entry.createdByUserId === user.id)
}

function canAccessContent(user: CmsCurrentUser | null): boolean {
  return hasAnyCapability(user, CONTENT_ACCESS_CAPABILITIES)
}

export function canCreateContent(user: CmsCurrentUser | null): boolean {
  return hasCapability(user, 'content.create')
}

export function canManageContentCollections(user: CmsCurrentUser | null): boolean {
  return hasCapability(user, 'content.manage')
}

export function canEditAnyContent(user: CmsCurrentUser | null): boolean {
  return hasAnyCapability(user, ['content.edit.any', 'content.manage'])
}

export function canEditContentEntry(user: CmsCurrentUser | null, entry: ContentEntry | null): boolean {
  return canEditAnyContent(user) || (ownsContentEntry(user, entry) && hasCapability(user, 'content.edit.own'))
}

export function canPublishContentEntry(user: CmsCurrentUser | null, entry: ContentEntry | null): boolean {
  return hasCapability(user, 'content.publish.any') ||
    (ownsContentEntry(user, entry) && hasCapability(user, 'content.publish.own'))
}

function canAccessUsersWorkspace(user: CmsCurrentUser | null): boolean {
  return hasAnyCapability(user, ['users.manage', 'roles.manage', 'audit.read'])
}

export function canAccessWorkspace(user: CmsCurrentUser | null, workspace: AdminWorkspace): boolean {
  switch (workspace) {
    case 'site':
      return hasCapability(user, 'site.read')
    case 'content':
      return canAccessContent(user)
    case 'media':
      return hasCapability(user, 'media.manage')
    case 'plugins':
    case 'pluginPage':
      return hasCapability(user, 'plugins.manage')
    case 'users':
      return canAccessUsersWorkspace(user)
    case 'account':
      // Self-targeted page — every authenticated user can manage their own
      // profile + devices. Anonymous visitors fall through to false.
      return user !== null
  }
}

export function firstAccessibleWorkspace(user: CmsCurrentUser | null): AdminWorkspace | null {
  const order: AdminWorkspace[] = ['site', 'content', 'media', 'plugins', 'users']
  return order.find((workspace) => canAccessWorkspace(user, workspace)) ?? null
}

export function workspacePath(workspace: AdminWorkspace): string {
  switch (workspace) {
    case 'site':
      return '/admin/site'
    case 'content':
      return '/admin/content'
    case 'media':
      return '/admin/media'
    case 'plugins':
      return '/admin/plugins'
    case 'users':
      return '/admin/users'
    case 'pluginPage':
      return '/admin/plugins'
    case 'account':
      return '/admin/account'
  }
}
