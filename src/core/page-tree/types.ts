// ---------------------------------------------------------------------------
// Page Tree — re-export shim (Step 4 of Zod migration).
//
// All types and runtime values now originate from `./schemas` (Zod-derived) or
// `../framework/schemas`.  This file is a PURE re-export shim so that the
// entire codebase's `import from '@core/page-tree/types'` path continues to
// work without change.
//
// Decision #309 / Constraint #215–216: flat-map structure, FLAT props.
// No interface or type declarations live here — schemas ARE the contract.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Framework types — canonical home is `../framework/schemas`.
// ---------------------------------------------------------------------------

export type {
  FrameworkColorSettings,
  FrameworkColorToken,
  FrameworkColorUtilityType,
  FrameworkPreferencesSettings,
  FrameworkScaleBreakpointConfig,
  FrameworkScaleManualSize,
  FrameworkScaleMode,
  FrameworkSpacingBreakpointConfig,
  FrameworkSpacingClassGenerator,
  FrameworkSpacingGroup,
  FrameworkSpacingSettings,
  FrameworkTypographyBreakpointConfig,
  FrameworkTypographyClassGenerator,
  FrameworkTypographyGroup,
  FrameworkTypographySettings,
  FrameworkSettings,
  GeneratedClassMetadata,
  GeneratedColorClassMetadata,
  GeneratedSpacingClassMetadata,
  GeneratedTypographyClassMetadata,
} from '../framework/schemas'

// ---------------------------------------------------------------------------
// Page Tree types — canonical home is `./schemas`.
// ---------------------------------------------------------------------------

export type {
  Breakpoint,
  DynamicBindingSource,
  DynamicBindingFormat,
  DynamicPropBinding,
  TemplateContext,
  TemplateCondition,
  PageTemplateConfig,
  PageNode,
  Page,
  FontSource,
  FontFile,
  FontEntry,
  SiteFontsSettings,
  CSSPropertyBag,
  CSSClass,
  SiteSettings,
  SiteDocument,
} from './schemas'

export type { BaseNode } from './baseNode'

// ---------------------------------------------------------------------------
// Schema values — available for callers that need runtime parsing.
// ---------------------------------------------------------------------------

export {
  BreakpointSchema,
  DynamicPropBindingSchema,
  PageTemplateConfigSchema,
  PageNodeSchema,
  PageSchema,
  FontFileSchema,
  FontEntrySchema,
  SiteFontsSettingsSchema,
  CSSPropertyBagSchema,
  CSSClassSchema,
  SiteSettingsSchema,
  SiteDocumentSchema,
} from './schemas'

// ---------------------------------------------------------------------------
// Runtime constants — sourced from `./schemas`.
// ---------------------------------------------------------------------------

export {
  DEFAULT_BREAKPOINTS,
  DEFAULT_COLOR_TOKENS,
  DEFAULT_SITE_SETTINGS,
} from './schemas'
