/**
 * Site Runtime — Zod schemas and derived types.
 *
 * Schemas are the source of truth. Types are derived via `z.infer<typeof Schema>`.
 * No parallel TypeScript interfaces — schema definitions ARE the contract.
 *
 * Exception: `RuntimeScriptImportAnalysis` is a plain TypeScript interface
 * (no Zod schema) because the `usage` field is a JS Map — not JSON-serializable.
 * This type is never persisted or sent over HTTP; it is only used as a function
 * return type inside the import-analysis pipeline.
 */

import { z } from 'zod'
import { SiteFileSchema } from '../files/schemas'

// ---------------------------------------------------------------------------
// LockedSiteDependency
// ---------------------------------------------------------------------------

export const LockedSiteDependencySchema = z.object({
  name: z.string(),
  requested: z.string(),
  version: z.string(),
  integrity: z.string().optional(),
  tarballUrl: z.string().optional(),
  resolvedAt: z.number(),
})

export type LockedSiteDependency = z.infer<typeof LockedSiteDependencySchema>

// ---------------------------------------------------------------------------
// SiteDependencyLock
// ---------------------------------------------------------------------------

export const SiteDependencyLockSchema = z.object({
  /** Literal 1 — schema version, not a counter */
  version: z.literal(1),
  packages: z.record(z.string(), LockedSiteDependencySchema),
  updatedAt: z.number(),
})

export type SiteDependencyLock = z.infer<typeof SiteDependencyLockSchema>

// ---------------------------------------------------------------------------
// SiteScriptPlacement
// ---------------------------------------------------------------------------

export const SiteScriptPlacementSchema = z.enum(['head', 'body-end'])

export type SiteScriptPlacement = z.infer<typeof SiteScriptPlacementSchema>

// ---------------------------------------------------------------------------
// SiteScriptTiming
// ---------------------------------------------------------------------------

export const SiteScriptTimingSchema = z.enum(['immediate', 'dom-ready', 'idle'])

export type SiteScriptTiming = z.infer<typeof SiteScriptTimingSchema>

// ---------------------------------------------------------------------------
// SiteScriptScope — discriminated union on `type`
// ---------------------------------------------------------------------------

export const SiteScriptScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all-pages') }),
  z.object({ type: z.literal('pages'), pageIds: z.array(z.string()) }),
  z.object({ type: z.literal('templates'), templatePageIds: z.array(z.string()) }),
]).catch({ type: 'all-pages' as const })

export type SiteScriptScope = z.infer<typeof SiteScriptScopeSchema>

// ---------------------------------------------------------------------------
// SiteScriptRuntimeConfig
// ---------------------------------------------------------------------------

export const SiteScriptRuntimeConfigSchema = z.object({
  enabled: z.boolean(),
  runInCanvas: z.boolean(),
  placement: SiteScriptPlacementSchema,
  timing: SiteScriptTimingSchema,
  scope: SiteScriptScopeSchema,
  priority: z.number(),
})

export type SiteScriptRuntimeConfig = z.infer<typeof SiteScriptRuntimeConfigSchema>

// ---------------------------------------------------------------------------
// SiteRuntimeConfig
// ---------------------------------------------------------------------------

export const SiteRuntimeConfigSchema = z.object({
  dependencyLock: SiteDependencyLockSchema,
  scripts: z.record(z.string(), SiteScriptRuntimeConfigSchema),
})

export type SiteRuntimeConfig = z.infer<typeof SiteRuntimeConfigSchema>

// ---------------------------------------------------------------------------
// SiteRuntimeTarget
// ---------------------------------------------------------------------------

export const SiteRuntimeTargetSchema = z.enum(['canvas', 'publish'])

export type SiteRuntimeTarget = z.infer<typeof SiteRuntimeTargetSchema>

// ---------------------------------------------------------------------------
// SiteRuntimeDiagnosticSeverity
// ---------------------------------------------------------------------------

export const SiteRuntimeDiagnosticSeveritySchema = z.enum(['error', 'warning', 'info'])

export type SiteRuntimeDiagnosticSeverity = z.infer<typeof SiteRuntimeDiagnosticSeveritySchema>

// ---------------------------------------------------------------------------
// SiteRuntimeDiagnostic
// ---------------------------------------------------------------------------

export const SiteRuntimeDiagnosticSchema = z.object({
  code: z.string(),
  severity: SiteRuntimeDiagnosticSeveritySchema,
  message: z.string(),
  fileId: z.string().optional(),
  path: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  packageName: z.string().optional(),
})

export type SiteRuntimeDiagnostic = z.infer<typeof SiteRuntimeDiagnosticSchema>

// ---------------------------------------------------------------------------
// RuntimeImportKind
// ---------------------------------------------------------------------------

export const RuntimeImportKindSchema = z.enum(['static', 'dynamic', 'reexport'])

export type RuntimeImportKind = z.infer<typeof RuntimeImportKindSchema>

// ---------------------------------------------------------------------------
// RuntimeImportSpecifier
// ---------------------------------------------------------------------------

export const RuntimeImportSpecifierSchema = z.object({
  specifier: z.string(),
  kind: RuntimeImportKindSchema,
  start: z.number(),
  end: z.number(),
})

export type RuntimeImportSpecifier = z.infer<typeof RuntimeImportSpecifierSchema>

// ---------------------------------------------------------------------------
// RuntimePackageUsageFile
// ---------------------------------------------------------------------------

export const RuntimePackageUsageFileSchema = z.object({
  fileId: z.string(),
  path: z.string(),
})

export type RuntimePackageUsageFile = z.infer<typeof RuntimePackageUsageFileSchema>

// ---------------------------------------------------------------------------
// RuntimePackageDependencyUsage
// ---------------------------------------------------------------------------

export const RuntimePackageDependencyUsageSchema = z.object({
  name: z.string(),
  requestedVersion: z.string().nullable(),
  specifiers: z.array(z.string()),
  files: z.array(RuntimePackageUsageFileSchema),
})

export type RuntimePackageDependencyUsage = z.infer<typeof RuntimePackageDependencyUsageSchema>

// ---------------------------------------------------------------------------
// PublishedRuntimeScriptAsset
// ---------------------------------------------------------------------------

export const PublishedRuntimeScriptAssetSchema = z.object({
  fileId: z.string(),
  src: z.string(),
  placement: SiteScriptPlacementSchema,
  timing: SiteScriptTimingSchema,
  priority: z.number(),
  integrity: z.string().optional(),
})

export type PublishedRuntimeScriptAsset = z.infer<typeof PublishedRuntimeScriptAssetSchema>

// ---------------------------------------------------------------------------
// PublishedPageRuntimeAssets
// ---------------------------------------------------------------------------

export const PublishedPageRuntimeAssetsSchema = z.object({
  scripts: z.array(PublishedRuntimeScriptAssetSchema),
})

export type PublishedPageRuntimeAssets = z.infer<typeof PublishedPageRuntimeAssetsSchema>

// ---------------------------------------------------------------------------
// RuntimeScriptEntry
// ---------------------------------------------------------------------------

export const RuntimeScriptEntrySchema = z.object({
  file: SiteFileSchema,
  config: SiteScriptRuntimeConfigSchema,
})

export type RuntimeScriptEntry = z.infer<typeof RuntimeScriptEntrySchema>

// ---------------------------------------------------------------------------
// RuntimeScriptImportAnalysis
//
// Plain TypeScript interface — not Zod-backed — because `usage` is a JS Map,
// which is not JSON-serializable. Never persisted or sent over HTTP.
// ---------------------------------------------------------------------------

export interface RuntimeScriptImportAnalysis {
  imports: RuntimeImportSpecifier[]
  usage: Map<string, RuntimePackageDependencyUsage>
  diagnostics: SiteRuntimeDiagnostic[]
}
