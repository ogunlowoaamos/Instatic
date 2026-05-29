import { Type, type Static } from '@core/utils/typeboxHelpers'

/**
 * Capability surface — closed TypeBox literal union enumerating every
 * permission a CMS user can hold. Mirrored in `src/core/capabilities.ts`
 * (client-side); the two lists MUST stay in sync — the
 * `capability-picker-coverage.test.ts` gate enforces that every literal
 * here also appears in the role-picker UI.
 *
 * Site-editing capabilities are split three ways:
 *
 *   site.structure.edit  — add/remove/move/duplicate/rename nodes; manage
 *                          pages, visual components, classes registry.
 *                          Anything that changes the tree shape or page roster.
 *   site.content.edit    — modify content-typed props on existing nodes
 *                          (text, richtext, image src/alt, link href, etc.).
 *                          Does NOT permit structural changes or style changes.
 *                          This is the "client / copy editor" surface.
 *   site.style.edit      — modify CSS classes, style overrides, breakpoints,
 *                          framework tokens (colors, typography, spacing).
 *
 * Media is split four ways (read / write / replace / delete) — see B1 in
 * docs/reference/capabilities.md for the design. Plugins, runtime/storage,
 * and the Data workspace are similarly split.
 */
const CoreCapabilitySchema = Type.Union([
  Type.Literal('dashboard.read'),
  Type.Literal('site.read'),
  Type.Literal('site.structure.edit'),
  Type.Literal('site.content.edit'),
  Type.Literal('site.style.edit'),
  Type.Literal('pages.edit'),
  Type.Literal('pages.publish'),
  Type.Literal('content.create'),
  Type.Literal('content.edit.own'),
  Type.Literal('content.edit.any'),
  Type.Literal('content.publish.own'),
  Type.Literal('content.publish.any'),
  Type.Literal('content.manage'),
  // Media — granular split (was a single `media.manage`).
  //   media.read     Open library, browse assets/folders, see thumbnails in pickers.
  //   media.write    Upload, edit metadata, manage folders, restore from trash.
  //   media.replace  Overwrite bytes for an existing asset (variants regenerate).
  //   media.delete   Soft-delete (trash) + hard purge (purge also requires step-up).
  Type.Literal('media.read'),
  Type.Literal('media.write'),
  Type.Literal('media.replace'),
  Type.Literal('media.delete'),
  // Runtime + storage — split out of the old monolithic `runtime.manage`.
  //   runtime.dependencies  Edit site package.json and trigger resolve/install.
  //   storage.elect         Elect media storage adapter / variant delegate per role.
  //   storage.migrate       Run the migration SSE that moves bytes between adapters.
  Type.Literal('runtime.dependencies'),
  Type.Literal('storage.elect'),
  Type.Literal('storage.migrate'),
  // Plugins — granular split (was a single `plugins.manage`).
  //   plugins.read       List installed plugins, read masked settings, view events.
  //   plugins.configure  Edit per-plugin settings + manage plugin records.
  //   plugins.install    Install / upgrade / uninstall plugins (RCE-class, step-up gated).
  //   plugins.lifecycle  Enable/disable/restart + schedule run-now/pause/resume.
  Type.Literal('plugins.read'),
  Type.Literal('plugins.configure'),
  Type.Literal('plugins.install'),
  Type.Literal('plugins.lifecycle'),
  Type.Literal('users.manage'),
  Type.Literal('roles.manage'),
  Type.Literal('audit.read'),
  // Data workspace — split from `content.manage`. The Content workspace
  // keeps the `content.*` family for post-type editing; the Data workspace
  // owns schema + raw row + bundle export/import.
  //   data.tables.read    Open Data workspace, browse tables and field schemas.
  //   data.tables.manage  Create/rename/delete tables; add/rename/delete fields.
  //   data.rows.move      Cross-collection row move (PATCH /data/rows/:id/table).
  //   data.export         Read-only bundle export + import preview.
  //   data.import         Write-mode bundle import. `replace` strategy ALSO
  //                       requires `content.manage` AND step-up.
  Type.Literal('data.tables.read'),
  Type.Literal('data.tables.manage'),
  Type.Literal('data.rows.move'),
  Type.Literal('data.export'),
  Type.Literal('data.import'),
  // AI runtime — see docs/plans/2026-05-26-ai-runtime-rewrite.md.
  //   ai.chat              Open conversations + use read-only tools (snapshot,
  //                        search). Mutating tools require `ai.tools.write`.
  //   ai.tools.write       Enable canvas write tools (insertHtml, replaceNodeHtml,
  //                        deleteNode, etc.). The chat endpoint filters tool
  //                        registration by this cap.
  //   ai.providers.manage  Create/update/delete API-key credentials + per-scope
  //                        defaults.
  //   ai.audit.read        Read site-wide AI usage / cost / errors across users.
  Type.Literal('ai.chat'),
  Type.Literal('ai.tools.write'),
  Type.Literal('ai.providers.manage'),
  Type.Literal('ai.audit.read'),
])

export type CoreCapability = Static<typeof CoreCapabilitySchema>

const CORE_CAPABILITIES: CoreCapability[] = [
  'dashboard.read',
  'site.read',
  'site.structure.edit',
  'site.content.edit',
  'site.style.edit',
  'pages.edit',
  'pages.publish',
  'content.create',
  'content.edit.own',
  'content.edit.any',
  'content.publish.own',
  'content.publish.any',
  'content.manage',
  'media.read',
  'media.write',
  'media.replace',
  'media.delete',
  'runtime.dependencies',
  'storage.elect',
  'storage.migrate',
  'plugins.read',
  'plugins.configure',
  'plugins.install',
  'plugins.lifecycle',
  'users.manage',
  'roles.manage',
  'audit.read',
  'data.tables.read',
  'data.tables.manage',
  'data.rows.move',
  'data.export',
  'data.import',
  'ai.chat',
  'ai.tools.write',
  'ai.providers.manage',
  'ai.audit.read',
]

/**
 * Convenience set — any of these capabilities means the user can mutate the
 * draft site in some way. The site save handler accepts a write if the
 * caller has at least one of them; granular diff validation enforces which
 * kinds of changes are actually allowed.
 */
export const SITE_WRITE_CAPABILITIES: readonly CoreCapability[] = [
  'site.structure.edit',
  'site.content.edit',
  'site.style.edit',
]

/**
 * Convenience super-set — every media capability. Roles that have the full
 * media surface should reference this, not enumerate the four leaf caps
 * inline, so a future media cap auto-flows into them.
 */
export const MEDIA_CAPABILITIES: readonly CoreCapability[] = [
  'media.read',
  'media.write',
  'media.replace',
  'media.delete',
]

/**
 * Convenience super-set — every plugin capability.
 */
export const PLUGIN_CAPABILITIES: readonly CoreCapability[] = [
  'plugins.read',
  'plugins.configure',
  'plugins.install',
  'plugins.lifecycle',
]

/**
 * Convenience super-set — runtime + storage admin capabilities.
 */
export const RUNTIME_STORAGE_CAPABILITIES: readonly CoreCapability[] = [
  'runtime.dependencies',
  'storage.elect',
  'storage.migrate',
]

/**
 * Convenience super-set — every Data-workspace capability.
 */
export const DATA_WORKSPACE_CAPABILITIES: readonly CoreCapability[] = [
  'data.tables.read',
  'data.tables.manage',
  'data.rows.move',
  'data.export',
  'data.import',
]

/**
 * Convenience super-set — every AI capability.
 */
export const AI_CAPABILITIES: readonly CoreCapability[] = [
  'ai.chat',
  'ai.tools.write',
  'ai.providers.manage',
  'ai.audit.read',
]

export interface SystemRoleDefinition {
  id: string
  slug: string
  name: string
  description: string
  capabilities: CoreCapability[]
}

/**
 * The four built-in system roles.
 *
 * - **Owner** is force-resynced from `CORE_CAPABILITIES` on every boot via
 *   `syncSystemRoles(db)` so adding a new capability never strands an
 *   existing Owner on a stale grant list.
 *
 * - **Admin** is *also* force-resynced from its explicit literal list on
 *   every boot. The list is intentionally written out (not derived by
 *   filtering CORE_CAPABILITIES) so every new capability requires a
 *   conscious decision per PR about whether Admin gets it. This stops
 *   the previous silent-drift bug where new caps silently appeared on
 *   Admin or never appeared at all.
 *
 * - **Client** and **Member** are seeded once and freely editable.
 */
const adminCapabilities: CoreCapability[] = [
  'dashboard.read',
  'site.read',
  'site.structure.edit',
  'site.content.edit',
  'site.style.edit',
  'pages.edit',
  'pages.publish',
  'content.create',
  'content.edit.own',
  'content.edit.any',
  'content.publish.own',
  'content.publish.any',
  'content.manage',
  'media.read',
  'media.write',
  'media.replace',
  'media.delete',
  'runtime.dependencies',
  'storage.elect',
  'storage.migrate',
  'plugins.read',
  'plugins.configure',
  'plugins.install',
  'plugins.lifecycle',
  'users.manage',
  // `roles.manage` is owner-only by design — admin cannot grant capabilities.
  'audit.read',
  'data.tables.read',
  'data.tables.manage',
  'data.rows.move',
  'data.export',
  'data.import',
  'ai.chat',
  'ai.tools.write',
  'ai.providers.manage',
  'ai.audit.read',
]

const clientCapabilities: CoreCapability[] = [
  'dashboard.read',
  'site.read',
  'site.content.edit',
  // Client needs to browse the media library to swap images on existing
  // nodes (`site.content.edit` already lets them change image src; this
  // makes the picker actually usable).
  'media.read',
  // Data workspace = read-only schema/row browsing. Client can see the
  // shape of the site's data but cannot mutate schema or row authors.
  'data.tables.read',
]

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    id: 'owner',
    slug: 'owner',
    name: 'Owner',
    description: 'Permanent installation owner with full system access.',
    capabilities: CORE_CAPABILITIES,
  },
  {
    id: 'admin',
    slug: 'admin',
    name: 'Admin',
    description: 'Full admin access (cannot manage roles).',
    capabilities: adminCapabilities,
  },
  {
    id: 'client',
    slug: 'client',
    name: 'Client',
    description: 'Can edit page copy (text, images, links) but not structure or styles.',
    capabilities: clientCapabilities,
  },
  {
    id: 'member',
    slug: 'member',
    name: 'Member',
    description: 'Public-facing member account — no admin access by default.',
    capabilities: [],
  },
]

/**
 * The Owner role id is the well-known constant the boot-time sync targets.
 */
export const OWNER_ROLE_ID = 'owner'

/**
 * The Admin role id — also boot-resynced (see `SYSTEM_ROLES` comment).
 */
export const ADMIN_ROLE_ID = 'admin'

/**
 * Role ids that get their capability list force-synced from code on every
 * boot. Owner and Admin are managed by the system; Client and Member are
 * seeded once and freely editable.
 */
export const FORCE_SYNC_ROLE_IDS: readonly string[] = [OWNER_ROLE_ID, ADMIN_ROLE_ID]

export function isCoreCapability(value: unknown): value is CoreCapability {
  return typeof value === 'string' && CORE_CAPABILITIES.includes(value as CoreCapability)
}

export function normalizeCapabilities(value: unknown): CoreCapability[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<CoreCapability>()
  for (const item of value) {
    if (isCoreCapability(item)) seen.add(item)
  }
  return [...seen].sort((a, b) => CORE_CAPABILITIES.indexOf(a) - CORE_CAPABILITIES.indexOf(b))
}

export function roleHasCapability(capabilities: readonly CoreCapability[], capability: CoreCapability): boolean {
  return capabilities.includes(capability)
}
