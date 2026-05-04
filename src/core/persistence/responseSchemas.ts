/**
 * Response-shape Zod schemas for the CMS persistence layer.
 *
 * Each `await res.json() as Foo` call site in this directory previously
 * trusted the server response without runtime checking. These schemas
 * tighten the boundary so a server-side regression returning the wrong
 * shape now produces a clear ZodError instead of triggering an
 * undefined-access TypeError deep in callers.
 *
 * Strategy:
 *   - Shallow domain types (CmsMediaAsset, CmsPublishStatus, …) are
 *     validated fully — the schemas double as the source of truth.
 *   - Deep domain types (SiteDocument, SiteDependencyLock,
 *     PublishedPageRuntimeAssets, …) live in separate modules with
 *     hundreds of fields. Validating their full structure is a separate
 *     audit-types pass; for now we validate the *envelope* (the
 *     wrapping object key) and pass the inner value through as unknown.
 *     This still catches the "server returned an array / null / wrong
 *     envelope key" class of bug — the most common runtime failure.
 *
 * Surfaced by /audit-types — see #1 in /health-check report.
 */

import { z } from 'zod'

// Re-exported types are inferred from the schemas below — these schemas are
// the source of truth, the types follow. Removes the previous duplication
// where each consumer module also declared its own TS interface.

// ---------------------------------------------------------------------------
// Error envelope used by every CMS endpoint
// ---------------------------------------------------------------------------

export const ErrorEnvelopeSchema = z
  .object({
    error: z.unknown().optional(),
  })
  .partial()
  .passthrough()

// ---------------------------------------------------------------------------
// cmsAuth.ts
// ---------------------------------------------------------------------------

export const CmsSetupStatusSchema = z.object({
  hasSite: z.boolean(),
  hasAdmin: z.boolean(),
  needsSetup: z.boolean(),
})

export type CmsSetupStatus = z.infer<typeof CmsSetupStatusSchema>

// ---------------------------------------------------------------------------
// cmsMedia.ts
// ---------------------------------------------------------------------------

export const CmsMediaAssetSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  publicPath: z.string(),
  createdAt: z.string(),
})

export type CmsMediaAsset = z.infer<typeof CmsMediaAssetSchema>

export const CmsMediaListResponseSchema = z
  .object({
    assets: z.array(CmsMediaAssetSchema).optional(),
  })
  .passthrough()

export const CmsMediaAssetEnvelopeSchema = z.object({
  asset: CmsMediaAssetSchema,
})

// ---------------------------------------------------------------------------
// cmsPublish.ts
// ---------------------------------------------------------------------------

export const CmsPublishResultSchema = z.object({
  publishedPages: z.number(),
})

export type CmsPublishResult = z.infer<typeof CmsPublishResultSchema>

export const CmsPublishStatusSchema = z.object({
  hasPublishedVersion: z.boolean(),
  draftMatchesPublished: z.boolean(),
  draftPages: z.number(),
  publishedPages: z.number(),
  lastPublishedAt: z.string().optional(),
})

export type CmsPublishStatus = z.infer<typeof CmsPublishStatusSchema>

// ---------------------------------------------------------------------------
// cmsRuntime.ts — envelopes only; inner types are deep
// ---------------------------------------------------------------------------

export const CmsRuntimeDependencyEnvelopeSchema = z.object({
  dependencyLock: z.unknown(),
})

export const CmsRuntimePreviewResponseSchema = z
  .object({
    html: z.string(),
    assets: z.array(z.unknown()),
    runtimeAssets: z.unknown(),
    diagnostics: z.array(z.unknown()),
  })
  .passthrough()

// ---------------------------------------------------------------------------
// cms.ts — envelope only; SiteDocument is too deep to schema here
// ---------------------------------------------------------------------------

export const CmsSiteEnvelopeSchema = z
  .object({
    site: z.unknown().optional(),
  })
  .passthrough()

// ---------------------------------------------------------------------------
// fonts API — bundled Google directory + install/uninstall envelopes
// ---------------------------------------------------------------------------

export const GoogleFontFamilySchema = z.object({
  family: z.string(),
  category: z.string(),
  subsets: z.array(z.string()),
  variants: z.array(z.string()),
  popularity: z.number().optional(),
})

export type GoogleFontFamilyDto = z.infer<typeof GoogleFontFamilySchema>

export const CmsGoogleFontsEnvelopeSchema = z.object({
  families: z.array(GoogleFontFamilySchema),
})

// FontEntry mirrors @core/page-tree's FontEntry. We schema the envelope
// shallowly here — full structural validation runs server-side via
// validateSite when the next save happens, so the install response is
// consumed as `unknown` and immediately committed via the addFont action
// which only reads stable top-level fields.
export const CmsFontEntryEnvelopeSchema = z.object({
  font: z.unknown(),
})
