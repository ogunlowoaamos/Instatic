/**
 * Framework module — barrel export.
 *
 * Exports Zod schemas (for parsing / validation) and their derived types
 * (via `z.infer`) from the canonical `./schemas` source.
 *
 * Runtime helpers (CSS generators, scale math, color utilities, defaults)
 * are consumed directly from their own files. Only the shared data types
 * and their schemas are barrel-exported here.
 */

export {
  FrameworkColorUtilityTypeSchema,
  FrameworkColorSettingsSchema,
  FrameworkColorTokenSchema,
  FrameworkScaleModeSchema,
  FrameworkScaleBreakpointConfigSchema,
  FrameworkTypographyBreakpointConfigSchema,
  FrameworkSpacingBreakpointConfigSchema,
  FrameworkScaleManualSizeSchema,
  FrameworkTypographyGroupSchema,
  FrameworkTypographyClassGeneratorSchema,
  FrameworkTypographySettingsSchema,
  FrameworkSpacingGroupSchema,
  FrameworkSpacingClassGeneratorSchema,
  FrameworkSpacingSettingsSchema,
  FrameworkPreferencesSettingsSchema,
  GeneratedColorClassMetadataSchema,
  GeneratedTypographyClassMetadataSchema,
  GeneratedSpacingClassMetadataSchema,
  GeneratedClassMetadataSchema,
} from './schemas'

export type {
  FrameworkColorUtilityType,
  FrameworkColorSettings,
  FrameworkColorToken,
  FrameworkScaleMode,
  FrameworkScaleBreakpointConfig,
  FrameworkTypographyBreakpointConfig,
  FrameworkSpacingBreakpointConfig,
  FrameworkScaleManualSize,
  FrameworkTypographyGroup,
  FrameworkTypographyClassGenerator,
  FrameworkTypographySettings,
  FrameworkSpacingGroup,
  FrameworkSpacingClassGenerator,
  FrameworkSpacingSettings,
  FrameworkPreferencesSettings,
  GeneratedColorClassMetadata,
  GeneratedTypographyClassMetadata,
  GeneratedSpacingClassMetadata,
  GeneratedClassMetadata,
} from './schemas'
