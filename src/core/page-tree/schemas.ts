/**
 * Page Tree — Zod schemas and derived types.
 *
 * Schemas are the source of truth. Types are derived via `z.infer<typeof Schema>`.
 * No parallel TypeScript interfaces — schema definitions ARE the contract.
 *
 * Resilient parsing semantics replicate `src/core/persistence/validate.ts`
 * so these schemas are ready to replace the hand-rolled validators in Step 5
 * without behavioural change.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { z } from 'zod'
import { BaseNodeSchema, type BaseNode } from './baseNode'
import {
  FrameworkSettingsSchema,
  GeneratedClassMetadataSchema,
} from '../framework/schemas'
import { SiteFileSchema } from '../files/schemas'
import { VisualComponentSchema } from '../visualComponents/schemas'
import { SiteRuntimeConfigSchema } from '../site-runtime/schemas'
import { SitePackageJsonSchema } from '../site-dependencies/manifest'

// ---------------------------------------------------------------------------
// Breakpoint
// ---------------------------------------------------------------------------

export const BreakpointSchema = z.object({
  id: z.string(),
  /** Display label e.g. "Mobile", "Tablet", "Desktop" */
  label: z.string(),
  /** Viewport width in pixels */
  width: z.number().finite(),
  /**
   * pixel-art-icons kebab-case icon name — e.g. "smartphone", "tablet", "monitor".
   * Falls back to "monitor" if missing or non-string.
   */
  icon: z.string().catch('monitor').default('monitor'),
})

export type Breakpoint = z.infer<typeof BreakpointSchema>

// ---------------------------------------------------------------------------
// Dynamic template binding
// ---------------------------------------------------------------------------

export const DynamicBindingSourceSchema = z.enum(['currentEntry'])
export type DynamicBindingSource = z.infer<typeof DynamicBindingSourceSchema>

export const DynamicBindingFormatSchema = z.enum(['plain', 'html', 'url', 'media'])
export type DynamicBindingFormat = z.infer<typeof DynamicBindingFormatSchema>

export const DynamicPropBindingSchema = z.object({
  source: DynamicBindingSourceSchema,
  field: z.string().min(1),
  /** Valid format tag; silently dropped if unrecognised or absent. */
  format: DynamicBindingFormatSchema.optional().catch(undefined),
  /** Fallback strategy; silently dropped if unrecognised or absent. */
  fallback: z.enum(['static', 'empty']).optional().catch(undefined),
})

export type DynamicPropBinding = z.infer<typeof DynamicPropBindingSchema>

// ---------------------------------------------------------------------------
// Page template configuration
// ---------------------------------------------------------------------------

export const TemplateContextSchema = z.enum(['entry'])
export type TemplateContext = z.infer<typeof TemplateContextSchema>

export const TemplateConditionSchema = z.object({
  id: z.string(),
  field: z.string(),
  operator: z.literal('equals'),
  value: z.string(),
})

export type TemplateCondition = z.infer<typeof TemplateConditionSchema>

export const PageTemplateConfigSchema = z.object({
  enabled: z.literal(true),
  context: TemplateContextSchema,
  collectionId: z.string().min(1),
  /** Falls back to 0 when missing or not a finite number. */
  priority: z.number().finite().catch(0).default(0),
  /** Invalid items are silently dropped; missing array becomes []. */
  conditions: z.array(TemplateConditionSchema).catch([]).default([]),
})

export type PageTemplateConfig = z.infer<typeof PageTemplateConfigSchema>

// ---------------------------------------------------------------------------
// PageNode — extends BaseNode with CMS-template-only fields
//
// The explicit `PageNode` type alias is the recursive forward-declaration
// required by Zod's `z.lazy()` pattern (same as VCNode in visualComponents/schemas.ts).
// It is NOT a hand-rolled type that could drift from the schema — it IS the
// type the schema produces, declared first so TypeScript can resolve recursion.
// ---------------------------------------------------------------------------

export type PageNode = BaseNode & {
  /**
   * Template-only prop bindings.
   * Static props remain stored as fallback values; dynamicBindings overlay them
   * at render time when a page is used as a CMS content template.
   */
  dynamicBindings?: Record<string, DynamicPropBinding>
  /**
   * VC-tree only: nested child PageNode objects for tree traversal.
   * Only populated on nodes inside a VisualComponent.rootNode tree.
   * Page nodes use the flat `nodes: Record<string, PageNode>` map instead.
   */
  childNodes?: PageNode[]
}

export const PageNodeSchema: z.ZodType<PageNode> = BaseNodeSchema.extend({
  dynamicBindings: z
    .record(z.string(), DynamicPropBindingSchema)
    .optional()
    .catch(undefined),
  childNodes: z.lazy(() => z.array(PageNodeSchema)).optional().catch(undefined),
})

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const PageSchema = z.object({
  id: z.string(),
  /** URL-safe slug — used as the public URL path when published */
  slug: z.string(),
  /** Display title e.g. "Home", "About Us" */
  title: z.string(),
  /**
   * FLAT MAP of all nodes on this page.
   * All mutations go through page-tree/mutations.ts.
   */
  nodes: z.record(z.string(), PageNodeSchema),
  /**
   * ID of the root container node — always "base.root".
   * Entry point for all tree traversal and the publisher.
   */
  rootNodeId: z.string(),
  /** Optional CMS template configuration. Missing means a normal static page. */
  template: PageTemplateConfigSchema.optional().catch(undefined),
})

export type Page = z.infer<typeof PageSchema>

// ---------------------------------------------------------------------------
// Default breakpoints
// ---------------------------------------------------------------------------

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: 'mobile',  label: 'Mobile',  width: 375,  icon: 'smartphone' },
  { id: 'tablet',  label: 'Tablet',  width: 768,  icon: 'tablet'     },
  { id: 'desktop', label: 'Desktop', width: 1440, icon: 'monitor'    },
]

// ---------------------------------------------------------------------------
// Font schemas — FontSource, FontFile, FontEntry, SiteFontsSettings
// ---------------------------------------------------------------------------

export const FontSourceSchema = z.enum(['google', 'custom'])

export type FontSource = z.infer<typeof FontSourceSchema>

/**
 * One downloaded font file.  The `path` must be under `/uploads/fonts/`, end
 * with `.woff2`, and contain no traversal sequences — mirrors `isSafeFontPath`
 * in `validate.ts` (lines ~557–563).
 */
export const FontFileSchema = z.object({
  variant: z.string().min(1),
  subset: z.string().min(1),
  path: z.string().refine(
    (p) =>
      p.startsWith('/uploads/fonts/') &&
      !p.includes('..') &&
      !/[\s"<>\\]/.test(p) &&
      p.endsWith('.woff2'),
    'Font path must start with /uploads/fonts/ and end with .woff2',
  ),
  format: z.literal('woff2'),
})

export type FontFile = z.infer<typeof FontFileSchema>

/**
 * One font installed in the site library.
 * Invalid entries are silently dropped at the SiteFontsSettings level.
 * Mirrors `validateFontEntry` in validate.ts (lines ~575–603).
 */
export const FontEntrySchema = z.object({
  id: z.string().min(1),
  source: FontSourceSchema.catch('google' as const),
  family: z.string().min(1),
  variants: z.array(z.string().min(1)).catch([]),
  subsets: z.array(z.string().min(1)).catch([]),
  /** Invalid font-file entries are silently dropped. */
  files: z.array(z.unknown()).default([]).transform((items) =>
    items.flatMap((item) => {
      const r = FontFileSchema.safeParse(item)
      return r.success ? [r.data] : []
    }),
  ),
  category: z.string().optional(),
  createdAt: z.number().catch(() => Date.now()),
  updatedAt: z.number().catch(() => Date.now()),
})

export type FontEntry = z.infer<typeof FontEntrySchema>

/**
 * Library of installed fonts for a site.
 * Mirrors `validateSiteFontsSettings` in validate.ts (lines ~605–612).
 */
export const SiteFontsSettingsSchema = z.object({
  items: z.array(z.unknown()).default([]).transform((items) =>
    items.flatMap((item) => {
      const r = FontEntrySchema.safeParse(item)
      return r.success ? [r.data] : []
    }),
  ),
})

export type SiteFontsSettings = z.infer<typeof SiteFontsSettingsSchema>

// ---------------------------------------------------------------------------
// CSSPropertyBagSchema — publisher-boundary narrowing type
//
// §4.1 rationale: validate.ts line 822 stores `styles` as
// `Record<string, unknown>` without narrowing to CSSPropertyBag.  The editor
// only writes known CSSPropertyBag keys via classSlice, but the persistence
// layer preserves arbitrary keys (forward-compat with future CSS properties).
//
// Consequence:
//   - `CSSClassSchema.styles` uses `z.record(z.string(), z.unknown())` to
//     match the persistence semantics exactly.
//   - `CSSPropertyBagSchema` exists as the Zod source-of-truth for the type
//     only, used at the publisher narrowing point (classCss.ts `bagToCSS`).
//   - Per-property `.catch()` is intentionally absent: the publisher already
//     guards via the ALLOWED_PROPS set + `sanitiseCssValue`, so silently
//     coercing bad values here would be redundant and misleading.
// ---------------------------------------------------------------------------

export const CSSPropertyBagSchema = z.object({
  // Typography
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  fontWeight: z.string().optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  letterSpacing: z.string().optional(),
  lineHeight: z.string().optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  textDecoration: z.string().optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
  color: z.string().optional(),
  textShadow: z.string().optional(),

  // Layout
  display: z.enum(['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none']).optional(),
  flexDirection: z.enum(['row', 'column', 'row-reverse', 'column-reverse']).optional(),
  flexWrap: z.enum(['nowrap', 'wrap']).optional(),
  alignItems: z.string().optional(),
  justifyContent: z.string().optional(),
  justifyItems: z.string().optional(),
  alignSelf: z.string().optional(),
  justifySelf: z.string().optional(),
  flex: z.string().optional(),
  gap: z.string().optional(),
  rowGap: z.string().optional(),
  columnGap: z.string().optional(),
  gridTemplateColumns: z.string().optional(),
  gridTemplateRows: z.string().optional(),
  gridColumn: z.string().optional(),
  gridRow: z.string().optional(),

  // Size
  width: z.string().optional(),
  height: z.string().optional(),
  minWidth: z.string().optional(),
  maxWidth: z.string().optional(),
  minHeight: z.string().optional(),
  maxHeight: z.string().optional(),
  aspectRatio: z.string().optional(),
  boxSizing: z.enum(['border-box', 'content-box']).optional(),

  // Spacing
  margin: z.string().optional(),
  marginTop: z.string().optional(),
  marginRight: z.string().optional(),
  marginBottom: z.string().optional(),
  marginLeft: z.string().optional(),
  padding: z.string().optional(),
  paddingTop: z.string().optional(),
  paddingRight: z.string().optional(),
  paddingBottom: z.string().optional(),
  paddingLeft: z.string().optional(),

  // Position
  position: z.enum(['static', 'relative', 'absolute', 'fixed', 'sticky']).optional(),
  top: z.string().optional(),
  right: z.string().optional(),
  bottom: z.string().optional(),
  left: z.string().optional(),
  zIndex: z.number().optional(),

  // Visual
  backgroundColor: z.string().optional(),
  background: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundSize: z.string().optional(),
  backgroundPosition: z.string().optional(),
  backgroundRepeat: z.string().optional(),
  objectFit: z.enum(['contain', 'cover', 'fill', 'none', 'scale-down']).optional(),
  objectPosition: z.string().optional(),
  opacity: z.number().optional(),
  overflow: z.string().optional(),
  overflowX: z.string().optional(),
  overflowY: z.string().optional(),

  // Border
  border: z.string().optional(),
  borderTop: z.string().optional(),
  borderRight: z.string().optional(),
  borderBottom: z.string().optional(),
  borderLeft: z.string().optional(),
  borderColor: z.string().optional(),
  borderRadius: z.string().optional(),
  borderTopLeftRadius: z.string().optional(),
  borderTopRightRadius: z.string().optional(),
  borderBottomLeftRadius: z.string().optional(),
  borderBottomRightRadius: z.string().optional(),
  outline: z.string().optional(),
  outlineOffset: z.string().optional(),

  // Effects
  boxShadow: z.string().optional(),
  filter: z.string().optional(),
  backdropFilter: z.string().optional(),
  transform: z.string().optional(),
  transformOrigin: z.string().optional(),

  // Motion
  transition: z.string().optional(),
  animation: z.string().optional(),

  // Interaction
  cursor: z.string().optional(),
  pointerEvents: z.enum(['none', 'auto']).optional(),
  userSelect: z.string().optional(),

  // Scrollbar
  scrollBehavior: z.string().optional(),

  // SVG / icon color utilities
  fill: z.string().optional(),
})

export type CSSPropertyBag = z.infer<typeof CSSPropertyBagSchema>

// ---------------------------------------------------------------------------
// CSSClassSchema
// ---------------------------------------------------------------------------

/**
 * A named, reusable CSS class that can be assigned to any node.
 *
 * §4.1 persistence note: `styles` and `breakpointStyles` are stored as
 * `Record<string, unknown>` matching validate.ts line 822 which stores the raw
 * object without narrowing to CSSPropertyBag.  Narrowing happens at the
 * publisher boundary (`bagToCSS` in classCss.ts).
 *
 * CSSPropertyBag is used for the WRITE API (classSlice / framework generators)
 * which always writes only known CSS property keys.
 */
export const CSSClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  /**
   * Optional ownership scope.  If the scope object does not match the exact
   * shape, it is silently dropped (validate.ts lines 804–815).
   */
  scope: z.object({
    type: z.literal('node'),
    nodeId: z.string(),
    role: z.literal('module-style'),
  }).optional().catch(undefined),
  /**
   * Base CSS styles — arbitrary string→unknown map at persistence boundary.
   * validate.ts line 822 stores these without per-property validation.
   */
  styles: z.record(z.string(), z.unknown()).catch({}),
  /**
   * Per-breakpoint overrides — same persistence semantics as `styles`.
   * validate.ts line 822 stores these as Record<string, Record<string, unknown>>.
   */
  breakpointStyles: z.record(z.string(), z.record(z.string(), z.unknown())).catch({}),
  /** Optional search/filter tags. Invalid items silently dropped. */
  tags: z.array(z.string()).optional().catch(undefined),
  /** Metadata for framework-generated classes. Undefined if invalid. */
  generated: GeneratedClassMetadataSchema.optional().catch(undefined),
  createdAt: z.number().catch(() => Date.now()),
  updatedAt: z.number().catch(() => Date.now()),
})

export type CSSClass = z.infer<typeof CSSClassSchema>

// ---------------------------------------------------------------------------
// Default design-token values (source of truth — re-exported from types.ts)
// ---------------------------------------------------------------------------

export const DEFAULT_COLOR_TOKENS: Record<string, string> = {
  '--color-primary': '#6366f1',
  '--color-secondary': '#8b5cf6',
  '--color-accent': '#ec4899',
  '--color-surface': '#ffffff',
  '--color-on-surface': '#0f172a',
  '--color-border': '#e2e8f0',
  '--color-muted': '#94a3b8',
}

// ---------------------------------------------------------------------------
// SiteSettingsSchema
// ---------------------------------------------------------------------------

/**
 * Per-site configuration stored in SiteDocument.settings.
 * Mirrors `validateSettings` in validate.ts (lines ~614–633).
 *
 * Resilience:
 *   - colorTokens / shortcuts default to {} when missing or non-object.
 *   - framework / fonts return undefined when missing or structurally invalid.
 *   - All other fields are simple optional strings.
 */
export const SiteSettingsSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  faviconUrl: z.string().optional(),
  fontImportUrl: z.string().optional(),
  language: z.string().optional(),
  /** Global CSS custom property tokens (design tokens). */
  // .default({}) handles absent key (Zod v4 requires default for optional-looking
  // required fields that must fall back to {}); .catch({}) handles invalid values.
  colorTokens: z.record(z.string(), z.string()).catch({}).default({}),
  /** Structured framework token settings — absent means framework disabled. */
  framework: FrameworkSettingsSchema.optional().catch(undefined),
  /** Library of installed fonts — absent when no fonts added. */
  fonts: SiteFontsSettingsSchema.optional().catch(undefined),
  /** Keyboard shortcut overrides — defaults to {} when missing. */
  shortcuts: z.record(z.string(), z.string()).catch({}).default({}),
})

export type SiteSettings = z.infer<typeof SiteSettingsSchema>

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  colorTokens: DEFAULT_COLOR_TOKENS,
  shortcuts: {},
}

// ---------------------------------------------------------------------------
// SiteDocumentSchema — top-level persisted site document
// ---------------------------------------------------------------------------

/**
 * The top-level site document stored in the CMS database.
 *
 * Resilience semantics mirror `validateSite` in validate.ts (lines ~775–893):
 *
 *   THROWS (no fallback) if missing / wrong type:
 *     id, name, pages (also ≥ 1 item), breakpoints, classes, files,
 *     visualComponents, createdAt, updatedAt
 *
 *   RESILIENT (fallback to default):
 *     settings → DEFAULT_SITE_SETTINGS
 *     packageJson → { dependencies: {}, devDependencies: {} }
 *     runtime → { dependencyLock: { version: 1, packages: {}, updatedAt: 0 }, scripts: {} }
 *
 * Per-entry leniency:
 *   classes — entries missing id/name are silently dropped (mirrors validate.ts
 *             lines 800–830 which iterates raw.classes and skips bad entries).
 *   files — invalid entries are silently dropped (mirrors validateSiteFile).
 *   visualComponents — invalid entries are silently dropped.
 *
 * Known divergences from validate.ts (to be aligned in Step 5):
 *   - Slug format / uniqueness validation (validate.ts lines 838–846) is NOT
 *     in this schema — adding it requires a `.superRefine()` that would
 *     import pageSlugError/pageSlugDuplicateError, creating an indirect
 *     cycle via slugs.ts → types.ts → schemas.ts.
 *   - SiteFile path safety (isSafePath / normalizePath) is structural, not in
 *     SiteFileSchema — Step 5 can add a `.superRefine()`.
 *   - VisualComponent name validation (validateComponentName) is deferred.
 *   - SitePackageJson name sanitisation (isSafePackageName) is deferred.
 */
export const SiteDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** At least one page is required — mirrors `assertArray` + length check. */
  pages: z.array(PageSchema).min(1),
  breakpoints: z.array(BreakpointSchema),
  settings: SiteSettingsSchema.catch(DEFAULT_SITE_SETTINGS),
  /**
   * Class registry — required object (throws when absent / non-object).
   * Per-entry leniency: entries failing CSSClassSchema are silently dropped.
   */
  classes: z.preprocess(
    (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
      const result: Record<string, unknown> = {}
      for (const [id, cls] of Object.entries(raw as Record<string, unknown>)) {
        const r = CSSClassSchema.safeParse(cls)
        if (r.success) result[id] = r.data
      }
      return result
    },
    z.record(z.string(), CSSClassSchema),
  ),
  /**
   * Site files — required array; invalid individual entries are silently
   * dropped (mirrors validateSiteFile returning null for bad entries).
   */
  files: z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const r = SiteFileSchema.safeParse(item)
      return r.success ? [r.data] : []
    }),
  ),
  /**
   * Visual components — required array; invalid entries silently dropped
   * (mirrors validateVisualComponent returning null for bad entries).
   */
  visualComponents: z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const r = VisualComponentSchema.safeParse(item)
      return r.success ? [r.data] : []
    }),
  ),
  /**
   * Package manifest — fully resilient (normalizeSitePackageJson always
   * succeeds).  Name sanitisation deferred to Step 5.
   * .default() handles absent key (Zod v4); .catch() in SitePackageJsonSchema
   * handles invalid values.
   */
  packageJson: SitePackageJsonSchema.default({ dependencies: {}, devDependencies: {} }),
  /**
   * Runtime config — fully resilient (normalizeSiteRuntimeConfig always
   * succeeds).  Inline default avoids importing from site-runtime/scriptConfig
   * which transitively imports Page, creating a page-tree cycle.
   * .default() handles absent key (Zod v4); .catch() handles invalid values.
   */
  runtime: SiteRuntimeConfigSchema
    .catch({
      dependencyLock: { version: 1 as const, packages: {}, updatedAt: 0 },
      scripts: {},
    })
    .default({
      dependencyLock: { version: 1 as const, packages: {}, updatedAt: 0 },
      scripts: {},
    }),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type SiteDocument = z.infer<typeof SiteDocumentSchema>
