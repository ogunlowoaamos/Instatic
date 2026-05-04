/**
 * Site Runtime — TypeBox schemas and derived types.
 *
 * Schemas are the source of truth. Types are derived via `Static<typeof Schema>`.
 * No parallel TypeScript interfaces — schema definitions ARE the contract.
 *
 * Exception: `RuntimeScriptImportAnalysis` is a plain TypeScript interface
 * (no schema) because the `usage` field is a JS Map — not JSON-serializable.
 * This type is never persisted or sent over HTTP; it is only used as a function
 * return type inside the import-analysis pipeline.
 */

import { Type, type Static } from '@sinclair/typebox'
import { withFallback } from '@core/utils/typeboxHelpers'
import { SiteFileSchema } from '../files/schemas'

// ---------------------------------------------------------------------------
// LockedSiteDependency
// ---------------------------------------------------------------------------

export const LockedSiteDependencySchema = Type.Object({
  name: Type.String(),
  requested: Type.String(),
  version: Type.String(),
  integrity: Type.Optional(Type.String()),
  tarballUrl: Type.Optional(Type.String()),
  resolvedAt: Type.Number(),
})

export type LockedSiteDependency = Static<typeof LockedSiteDependencySchema>

// ---------------------------------------------------------------------------
// SiteDependencyLock
// ---------------------------------------------------------------------------

export const SiteDependencyLockSchema = Type.Object({
  /** Literal 1 — schema version, not a counter */
  version: Type.Literal(1),
  packages: Type.Record(Type.String(), LockedSiteDependencySchema),
  updatedAt: Type.Number(),
})

export type SiteDependencyLock = Static<typeof SiteDependencyLockSchema>

// ---------------------------------------------------------------------------
// SiteScriptPlacement
// ---------------------------------------------------------------------------

export const SiteScriptPlacementSchema = Type.Union([
  Type.Literal('head'),
  Type.Literal('body-end'),
])

export type SiteScriptPlacement = Static<typeof SiteScriptPlacementSchema>

// ---------------------------------------------------------------------------
// SiteScriptTiming
// ---------------------------------------------------------------------------

export const SiteScriptTimingSchema = Type.Union([
  Type.Literal('immediate'),
  Type.Literal('dom-ready'),
  Type.Literal('idle'),
])

export type SiteScriptTiming = Static<typeof SiteScriptTimingSchema>

// ---------------------------------------------------------------------------
// SiteScriptScope — discriminated union on `type`
// ---------------------------------------------------------------------------

export const SiteScriptScopeSchema = withFallback(
  Type.Union([
    Type.Object({ type: Type.Literal('all-pages') }),
    Type.Object({ type: Type.Literal('pages'), pageIds: Type.Array(Type.String()) }),
    Type.Object({ type: Type.Literal('templates'), templatePageIds: Type.Array(Type.String()) }),
  ]),
  { type: 'all-pages' as const },
)

export type SiteScriptScope = Static<typeof SiteScriptScopeSchema>

// ---------------------------------------------------------------------------
// SiteScriptRuntimeConfig
// ---------------------------------------------------------------------------

export const SiteScriptRuntimeConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  runInCanvas: Type.Boolean(),
  placement: SiteScriptPlacementSchema,
  timing: SiteScriptTimingSchema,
  scope: SiteScriptScopeSchema,
  priority: Type.Number(),
})

export type SiteScriptRuntimeConfig = Static<typeof SiteScriptRuntimeConfigSchema>

// ---------------------------------------------------------------------------
// SiteRuntimeConfig
// ---------------------------------------------------------------------------

export const SiteRuntimeConfigSchema = Type.Object({
  dependencyLock: SiteDependencyLockSchema,
  scripts: Type.Record(Type.String(), SiteScriptRuntimeConfigSchema),
})

export type SiteRuntimeConfig = Static<typeof SiteRuntimeConfigSchema>

// ---------------------------------------------------------------------------
// SiteRuntimeTarget
// ---------------------------------------------------------------------------

export const SiteRuntimeTargetSchema = Type.Union([
  Type.Literal('canvas'),
  Type.Literal('publish'),
])

export type SiteRuntimeTarget = Static<typeof SiteRuntimeTargetSchema>

// ---------------------------------------------------------------------------
// SiteRuntimeDiagnosticSeverity
// ---------------------------------------------------------------------------

export const SiteRuntimeDiagnosticSeveritySchema = Type.Union([
  Type.Literal('error'),
  Type.Literal('warning'),
  Type.Literal('info'),
])

export type SiteRuntimeDiagnosticSeverity = Static<typeof SiteRuntimeDiagnosticSeveritySchema>

// ---------------------------------------------------------------------------
// SiteRuntimeDiagnostic
// ---------------------------------------------------------------------------

export const SiteRuntimeDiagnosticSchema = Type.Object({
  code: Type.String(),
  severity: SiteRuntimeDiagnosticSeveritySchema,
  message: Type.String(),
  fileId: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  line: Type.Optional(Type.Number()),
  column: Type.Optional(Type.Number()),
  packageName: Type.Optional(Type.String()),
})

export type SiteRuntimeDiagnostic = Static<typeof SiteRuntimeDiagnosticSchema>

// ---------------------------------------------------------------------------
// RuntimeImportKind
// ---------------------------------------------------------------------------

export const RuntimeImportKindSchema = Type.Union([
  Type.Literal('static'),
  Type.Literal('dynamic'),
  Type.Literal('reexport'),
])

export type RuntimeImportKind = Static<typeof RuntimeImportKindSchema>

// ---------------------------------------------------------------------------
// RuntimeImportSpecifier
// ---------------------------------------------------------------------------

export const RuntimeImportSpecifierSchema = Type.Object({
  specifier: Type.String(),
  kind: RuntimeImportKindSchema,
  start: Type.Number(),
  end: Type.Number(),
})

export type RuntimeImportSpecifier = Static<typeof RuntimeImportSpecifierSchema>

// ---------------------------------------------------------------------------
// RuntimePackageUsageFile
// ---------------------------------------------------------------------------

export const RuntimePackageUsageFileSchema = Type.Object({
  fileId: Type.String(),
  path: Type.String(),
})

export type RuntimePackageUsageFile = Static<typeof RuntimePackageUsageFileSchema>

// ---------------------------------------------------------------------------
// RuntimePackageDependencyUsage
// ---------------------------------------------------------------------------

export const RuntimePackageDependencyUsageSchema = Type.Object({
  name: Type.String(),
  requestedVersion: Type.Union([Type.String(), Type.Null()]),
  specifiers: Type.Array(Type.String()),
  files: Type.Array(RuntimePackageUsageFileSchema),
})

export type RuntimePackageDependencyUsage = Static<typeof RuntimePackageDependencyUsageSchema>

// ---------------------------------------------------------------------------
// PublishedRuntimeScriptAsset
// ---------------------------------------------------------------------------

export const PublishedRuntimeScriptAssetSchema = Type.Object({
  fileId: Type.String(),
  src: Type.String(),
  placement: SiteScriptPlacementSchema,
  timing: SiteScriptTimingSchema,
  priority: Type.Number(),
  integrity: Type.Optional(Type.String()),
})

export type PublishedRuntimeScriptAsset = Static<typeof PublishedRuntimeScriptAssetSchema>

// ---------------------------------------------------------------------------
// PublishedPageRuntimeAssets
// ---------------------------------------------------------------------------

export const PublishedPageRuntimeAssetsSchema = Type.Object({
  scripts: Type.Array(PublishedRuntimeScriptAssetSchema),
})

export type PublishedPageRuntimeAssets = Static<typeof PublishedPageRuntimeAssetsSchema>

// ---------------------------------------------------------------------------
// RuntimeScriptEntry
// ---------------------------------------------------------------------------

export const RuntimeScriptEntrySchema = Type.Object({
  file: SiteFileSchema,
  config: SiteScriptRuntimeConfigSchema,
})

export type RuntimeScriptEntry = Static<typeof RuntimeScriptEntrySchema>

// ---------------------------------------------------------------------------
// RuntimeScriptImportAnalysis
//
// Plain TypeScript interface — not schema-backed — because `usage` is a JS Map,
// which is not JSON-serializable. Never persisted or sent over HTTP.
// ---------------------------------------------------------------------------

export interface RuntimeScriptImportAnalysis {
  imports: RuntimeImportSpecifier[]
  usage: Map<string, RuntimePackageDependencyUsage>
  diagnostics: SiteRuntimeDiagnostic[]
}
