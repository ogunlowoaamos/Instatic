/**
 * Framework — Zod schemas and derived types.
 *
 * Schemas are the source of truth. Types are derived via `z.infer<typeof Schema>`.
 * No parallel TypeScript interfaces — schema definitions ARE the contract.
 *
 * Resilient parsing semantics replicate `src/core/persistence/validate.ts`
 * (lines ~282–570) so these schemas are ready to replace the hand-rolled
 * validators in Step 5 without behavioural change.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// FrameworkColorUtilityType
// ---------------------------------------------------------------------------

export const FrameworkColorUtilityTypeSchema = z.enum(['text', 'background', 'border', 'fill'])

export type FrameworkColorUtilityType = z.infer<typeof FrameworkColorUtilityTypeSchema>

// ---------------------------------------------------------------------------
// GeneratedClassMetadata — discriminated union on `family`
// ---------------------------------------------------------------------------

export const GeneratedColorClassMetadataSchema = z.object({
  origin: z.literal('framework'),
  family: z.literal('color'),
  sourceId: z.string(),
  utility: FrameworkColorUtilityTypeSchema,
  tokenName: z.string(),
  variantName: z.string().optional(),
  locked: z.literal(true),
}).passthrough()

export type GeneratedColorClassMetadata = z.infer<typeof GeneratedColorClassMetadataSchema>

export const GeneratedTypographyClassMetadataSchema = z.object({
  origin: z.literal('framework'),
  family: z.literal('typography'),
  /** ID of the FrameworkTypographyGroup this class was generated from. */
  sourceId: z.string(),
  /** ID of the FrameworkTypographyClassGenerator (the row in the Class Generator). */
  generatorId: z.string(),
  /** namingConvention of the source group (e.g. "text"). */
  tokenName: z.string(),
  /** Step suffix from the group's `steps` string (e.g. "xs", "m"). */
  step: z.string(),
  locked: z.literal(true),
}).passthrough()

export type GeneratedTypographyClassMetadata = z.infer<typeof GeneratedTypographyClassMetadataSchema>

export const GeneratedSpacingClassMetadataSchema = z.object({
  origin: z.literal('framework'),
  family: z.literal('spacing'),
  sourceId: z.string(),
  generatorId: z.string(),
  tokenName: z.string(),
  step: z.string(),
  locked: z.literal(true),
}).passthrough()

export type GeneratedSpacingClassMetadata = z.infer<typeof GeneratedSpacingClassMetadataSchema>

/**
 * Discriminated union of all framework-generated class metadata.
 * Discriminator key: `family` — matches the GeneratedClassMetadata union in types.ts.
 */
export const GeneratedClassMetadataSchema = z.discriminatedUnion('family', [
  GeneratedColorClassMetadataSchema,
  GeneratedTypographyClassMetadataSchema,
  GeneratedSpacingClassMetadataSchema,
])

export type GeneratedClassMetadata = z.infer<typeof GeneratedClassMetadataSchema>

// ---------------------------------------------------------------------------
// FrameworkColorToken and FrameworkColorSettings
// ---------------------------------------------------------------------------

/**
 * Per-utility enabled/disabled flags.
 * Defaults: text + background + border = true, fill = false.
 * validate.ts: validateFrameworkColorUtilities()
 */
const FrameworkColorUtilitiesSchema = z.object({
  text: z.boolean().catch(true),
  background: z.boolean().catch(true),
  border: z.boolean().catch(true),
  fill: z.boolean().catch(false),
}).catch({ text: true, background: true, border: true, fill: false })

/**
 * Shade / tint variant generation options.
 * Default count is 4 (DEFAULT_COLOR_VARIANT_COUNT in validate.ts).
 * validate.ts: validateFrameworkColorVariantOptions()
 */
const FrameworkColorVariantOptionsSchema = z.object({
  enabled: z.boolean().catch(true),
  count: z.number().catch(4),
}).passthrough()

export const FrameworkColorTokenSchema = z.object({
  id: z.string(),
  /**
   * Free-form category label. Empty string means "uncategorized".
   * Falls back to '' when missing.
   */
  category: z.string().catch(''),
  /** Normalized slug — used as the CSS variable name root (e.g. "primary"). */
  slug: z.string(),
  lightValue: z.string(),
  /** Falls back to '' when missing; validate.ts generates via generateDefaultDarkColor(). */
  darkValue: z.string().catch(''),
  darkModeEnabled: z.boolean().catch(false),
  generateUtilities: FrameworkColorUtilitiesSchema,
  generateTransparent: z.boolean().catch(true),
  generateShades: FrameworkColorVariantOptionsSchema.catch({ enabled: true, count: 4 }),
  generateTints: FrameworkColorVariantOptionsSchema.catch({ enabled: true, count: 4 }),
  /** Falls back to 0; validate.ts uses array index as default. */
  order: z.number().catch(0),
  createdAt: z.number().catch(() => Date.now()),
  updatedAt: z.number().catch(() => Date.now()),
}).passthrough()

export type FrameworkColorToken = z.infer<typeof FrameworkColorTokenSchema>

export const FrameworkColorSettingsSchema = z.object({
  tokens: z.array(FrameworkColorTokenSchema).catch([]),
}).passthrough()

export type FrameworkColorSettings = z.infer<typeof FrameworkColorSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkScaleMode
// ---------------------------------------------------------------------------

export const FrameworkScaleModeSchema = z.enum(['fluid', 'fluid_manual'])

export type FrameworkScaleMode = z.infer<typeof FrameworkScaleModeSchema>

// ---------------------------------------------------------------------------
// FrameworkScaleBreakpointConfig and family-specific extensions
// ---------------------------------------------------------------------------

/**
 * Shared breakpoint config carried by both typography and spacing groups.
 * validate.ts: inline in validateFrameworkTypographyGroup / validateFrameworkSpacingGroup.
 */
export const FrameworkScaleBreakpointConfigSchema = z.object({
  /** Per-breakpoint scale ratio — a preset string or a raw number. */
  scaleRatio: z.union([z.number(), z.string()]),
  /** When true, scaleRatioInputValue overrides scaleRatio. */
  isCustomScaleRatio: z.boolean().optional(),
  scaleRatioInputValue: z.number().optional(),
}).passthrough()

export type FrameworkScaleBreakpointConfig = z.infer<typeof FrameworkScaleBreakpointConfigSchema>

export const FrameworkTypographyBreakpointConfigSchema = FrameworkScaleBreakpointConfigSchema.extend({
  /** Base font size at this breakpoint in px. */
  fontSize: z.number(),
})

export type FrameworkTypographyBreakpointConfig = z.infer<typeof FrameworkTypographyBreakpointConfigSchema>

export const FrameworkSpacingBreakpointConfigSchema = FrameworkScaleBreakpointConfigSchema.extend({
  /** Base spacing size at this breakpoint in px. */
  size: z.number(),
})

export type FrameworkSpacingBreakpointConfig = z.infer<typeof FrameworkSpacingBreakpointConfigSchema>

// ---------------------------------------------------------------------------
// FrameworkScaleManualSize
// ---------------------------------------------------------------------------

export const FrameworkScaleManualSizeSchema = z.object({
  id: z.string(),
  name: z.string(),
  min: z.number(),
  max: z.number(),
}).passthrough()

export type FrameworkScaleManualSize = z.infer<typeof FrameworkScaleManualSizeSchema>

// ---------------------------------------------------------------------------
// Scale group base — fields shared between typography and spacing groups
//
// Duplication elimination: validateFrameworkTypographyGroup and
// validateFrameworkSpacingGroup in validate.ts share ~11 identical fields
// (id, name, mode, manualSizes, isDisabled, order, createdAt, updatedAt).
// Expressed here as a base schema extended with family-specific size fields,
// per-family naming and step defaults, and per-position scaleRatio defaults.
// ---------------------------------------------------------------------------

const FrameworkScaleGroupBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 'fluid' (automatic) or 'fluid_manual' (manual sizes). Falls back to 'fluid'. */
  mode: FrameworkScaleModeSchema.catch('fluid'),
  /** Manual mode entries — consulted only when mode === 'fluid_manual'. */
  manualSizes: z.array(FrameworkScaleManualSizeSchema).optional(),
  isDisabled: z.boolean().optional(),
  /** Falls back to 0; validate.ts uses array index as default. */
  order: z.number().catch(0),
  createdAt: z.number().catch(() => Date.now()),
  updatedAt: z.number().catch(() => Date.now()),
}).passthrough()

// ─── Typography group ─────────────────────────────────────────────────────────

/**
 * Per-position breakpoint configs for typography groups.
 * min.scaleRatio defaults to 1.125 (Major Second),
 * max.scaleRatio defaults to 1.333 (Perfect Fourth).
 * validate.ts: validateFrameworkTypographyGroup(), lines ~408–428.
 */
const TypographyMinBreakpointSchema = FrameworkTypographyBreakpointConfigSchema.extend({
  scaleRatio: z.union([z.number(), z.string()]).catch(1.125),
})

const TypographyMaxBreakpointSchema = FrameworkTypographyBreakpointConfigSchema.extend({
  scaleRatio: z.union([z.number(), z.string()]).catch(1.333),
})

export const FrameworkTypographyGroupSchema = FrameworkScaleGroupBaseSchema.extend({
  /** Variable prefix — e.g. "text" produces --text-xs, --text-m, … */
  namingConvention: z.string().catch('text'),
  min: TypographyMinBreakpointSchema,
  max: TypographyMaxBreakpointSchema,
  /** Comma-separated step labels — e.g. "xs,s,m,l,xl,2xl,3xl,4xl". */
  steps: z.string().catch('xs,s,m,l,xl,2xl,3xl,4xl'),
  /** Index in the steps list whose value equals the base font size. Defaults to 2 ("m"). */
  baseScaleIndex: z.number().catch(2),
})

export type FrameworkTypographyGroup = z.infer<typeof FrameworkTypographyGroupSchema>

// ─── Spacing group ────────────────────────────────────────────────────────────

/**
 * Per-position breakpoint configs for spacing groups.
 * min.scaleRatio defaults to 1.25 (Major Third),
 * max.scaleRatio defaults to 1.414 (Augmented Fourth).
 * validate.ts: validateFrameworkSpacingGroup(), lines ~494–512.
 */
const SpacingMinBreakpointSchema = FrameworkSpacingBreakpointConfigSchema.extend({
  scaleRatio: z.union([z.number(), z.string()]).catch(1.25),
})

const SpacingMaxBreakpointSchema = FrameworkSpacingBreakpointConfigSchema.extend({
  scaleRatio: z.union([z.number(), z.string()]).catch(1.414),
})

export const FrameworkSpacingGroupSchema = FrameworkScaleGroupBaseSchema.extend({
  /** Variable prefix — e.g. "space" produces --space-xs, --space-m, … */
  namingConvention: z.string().catch('space'),
  min: SpacingMinBreakpointSchema,
  max: SpacingMaxBreakpointSchema,
  /** Comma-separated step labels — defaults to 11-step scale. */
  steps: z.string().catch('4xs,3xs,2xs,xs,s,m,l,xl,2xl,3xl,4xl'),
  /** Index in the steps list whose value equals the base size. Defaults to 5 ("m"). */
  baseScaleIndex: z.number().catch(5),
})

export type FrameworkSpacingGroup = z.infer<typeof FrameworkSpacingGroupSchema>

// ---------------------------------------------------------------------------
// Class generators — identical shape for both typography and spacing
// ---------------------------------------------------------------------------

/**
 * A class generator row in the framework Class Generator panel.
 * validate.ts: validateFrameworkClassGenerator() handles both families.
 * Typography and spacing share the exact same shape — the spacing schema
 * is an alias so consumers can import either name.
 */
export const FrameworkTypographyClassGeneratorSchema = z.object({
  id: z.string(),
  /** Class name pattern — `*` or `{step}` is replaced with the step suffix. */
  name: z.string(),
  /** kebab-case CSS properties this generator targets (e.g. ['font-size']). */
  property: z.array(z.string()),
  /** ID of the typography / spacing group (FrameworkTypographyGroup.id). */
  tabId: z.string(),
  isDisabled: z.boolean().optional(),
}).passthrough()

export type FrameworkTypographyClassGenerator = z.infer<typeof FrameworkTypographyClassGeneratorSchema>

// Spacing class generators are identical in shape to typography class generators.
export const FrameworkSpacingClassGeneratorSchema = FrameworkTypographyClassGeneratorSchema

export type FrameworkSpacingClassGenerator = FrameworkTypographyClassGenerator

// ---------------------------------------------------------------------------
// FrameworkTypographySettings and FrameworkSpacingSettings
// ---------------------------------------------------------------------------

export const FrameworkTypographySettingsSchema = z.object({
  groups: z.array(FrameworkTypographyGroupSchema).catch([]),
  classes: z.array(FrameworkTypographyClassGeneratorSchema).optional(),
  isDisabled: z.boolean().optional(),
}).passthrough()

export type FrameworkTypographySettings = z.infer<typeof FrameworkTypographySettingsSchema>

export const FrameworkSpacingSettingsSchema = z.object({
  groups: z.array(FrameworkSpacingGroupSchema).catch([]),
  classes: z.array(FrameworkSpacingClassGeneratorSchema).optional(),
  isDisabled: z.boolean().optional(),
}).passthrough()

export type FrameworkSpacingSettings = z.infer<typeof FrameworkSpacingSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkPreferencesSettings
// ---------------------------------------------------------------------------

/**
 * Shared fluid-scale preferences applied to both typography and spacing.
 * Defaults match Core Framework: rootFontSize=10, minScreen=320, maxScreen=1400, isRem=true.
 * validate.ts: validateFrameworkPreferencesSettings(), lines ~358–376.
 */
export const FrameworkPreferencesSettingsSchema = z.object({
  /** Root font size used to convert px → rem in published CSS. Default 10 (Core Framework). */
  rootFontSize: z.number().catch(10),
  /** Lower clamp anchor in px for fluid scales. Default 320. */
  minScreenWidth: z.number().catch(320),
  /** Upper clamp anchor in px for fluid scales. Default 1400. */
  maxScreenWidth: z.number().catch(1400),
  /** Whether to emit clamp() values in `rem` (true) or `px` (false). */
  isRem: z.boolean().catch(true),
}).passthrough()

export type FrameworkPreferencesSettings = z.infer<typeof FrameworkPreferencesSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkSettings — top-level per-site framework configuration
// ---------------------------------------------------------------------------

/**
 * Structured framework token settings (colors, typography, spacing, preferences).
 * Stored under SiteSettings.framework. Absent means framework features disabled.
 *
 * validate.ts: validateFrameworkSettings(), lines ~536–544.
 * Resilient: if the outer object is invalid, the field is undefined (caller
 * uses `.optional().catch(undefined)` when embedded in SiteSettingsSchema).
 */
export const FrameworkSettingsSchema = z.object({
  colors: FrameworkColorSettingsSchema,
  typography: FrameworkTypographySettingsSchema.optional(),
  spacing: FrameworkSpacingSettingsSchema.optional(),
  preferences: FrameworkPreferencesSettingsSchema.optional(),
})

export type FrameworkSettings = z.infer<typeof FrameworkSettingsSchema>
