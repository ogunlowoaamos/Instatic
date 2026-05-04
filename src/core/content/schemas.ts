/**
 * Content module — Zod schemas and derived types.
 *
 * Schemas are the source of truth. Types are derived via `z.infer<typeof Schema>`.
 * No parallel TypeScript interfaces — schema definitions ARE the contract.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// ContentEntryStatus
// ---------------------------------------------------------------------------

export const ContentEntryStatusSchema = z.enum(['draft', 'published', 'unpublished'])

export type ContentEntryStatus = z.infer<typeof ContentEntryStatusSchema>

// ---------------------------------------------------------------------------
// BuiltInContentCollectionField
// ---------------------------------------------------------------------------

export const BuiltInContentCollectionFieldSchema = z.enum(['body', 'featuredMedia', 'seo'])

export type BuiltInContentCollectionField = z.infer<typeof BuiltInContentCollectionFieldSchema>

// ---------------------------------------------------------------------------
// ContentCollectionBuiltInFields
// ---------------------------------------------------------------------------

export const ContentCollectionBuiltInFieldsSchema = z.object({
  body: z.boolean(),
  featuredMedia: z.boolean(),
  seo: z.boolean(),
})

export type ContentCollectionBuiltInFields = z.infer<typeof ContentCollectionBuiltInFieldsSchema>

// ---------------------------------------------------------------------------
// ContentCustomFieldDefinition
// ---------------------------------------------------------------------------

export const ContentCustomFieldDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
})

export type ContentCustomFieldDefinition = z.infer<typeof ContentCustomFieldDefinitionSchema>

// ---------------------------------------------------------------------------
// ContentCollectionFields
//
// Previously named ContentCollectionFieldSchema — renamed to drop the
// confusing *Schema suffix on a TypeScript type (not a Zod schema).
// ---------------------------------------------------------------------------

export const ContentCollectionFieldsSchema = z.object({
  builtIn: ContentCollectionBuiltInFieldsSchema,
  custom: z.array(ContentCustomFieldDefinitionSchema),
})

export type ContentCollectionFields = z.infer<typeof ContentCollectionFieldsSchema>

// ---------------------------------------------------------------------------
// ContentCollection
// ---------------------------------------------------------------------------

export const ContentCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  routeBase: z.string(),
  singularLabel: z.string(),
  pluralLabel: z.string(),
  fields: ContentCollectionFieldsSchema.optional(),
  /** ISO datetime string from DB */
  createdAt: z.string(),
  /** ISO datetime string from DB */
  updatedAt: z.string(),
})

export type ContentCollection = z.infer<typeof ContentCollectionSchema>

// ---------------------------------------------------------------------------
// CreateContentCollectionInput
// ---------------------------------------------------------------------------

export const CreateContentCollectionInputSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  routeBase: z.string().optional(),
  singularLabel: z.string().optional(),
  pluralLabel: z.string().optional(),
  fields: ContentCollectionFieldsSchema.optional(),
})

export type CreateContentCollectionInput = z.infer<typeof CreateContentCollectionInputSchema>

// ---------------------------------------------------------------------------
// UpdateContentCollectionInput
// ---------------------------------------------------------------------------

export const UpdateContentCollectionInputSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  routeBase: z.string().optional(),
  singularLabel: z.string().optional(),
  pluralLabel: z.string().optional(),
  fields: ContentCollectionFieldsSchema.optional(),
})

export type UpdateContentCollectionInput = z.infer<typeof UpdateContentCollectionInputSchema>

// ---------------------------------------------------------------------------
// ContentEntry
// ---------------------------------------------------------------------------

export const ContentEntrySchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  title: z.string(),
  slug: z.string(),
  status: ContentEntryStatusSchema,
  bodyMarkdown: z.string(),
  featuredMediaId: z.string().nullable(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  /** ISO datetime string from DB */
  createdAt: z.string(),
  /** ISO datetime string from DB */
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
})

export type ContentEntry = z.infer<typeof ContentEntrySchema>

// ---------------------------------------------------------------------------
// ContentEntryDraftInput
// ---------------------------------------------------------------------------

export const ContentEntryDraftInputSchema = z.object({
  title: z.string(),
  slug: z.string(),
  bodyMarkdown: z.string(),
  featuredMediaId: z.string().nullable(),
  seoTitle: z.string(),
  seoDescription: z.string(),
})

export type ContentEntryDraftInput = z.infer<typeof ContentEntryDraftInputSchema>

// ---------------------------------------------------------------------------
// CreateContentEntryInput
// ---------------------------------------------------------------------------

export const CreateContentEntryInputSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  featuredMediaId: z.string().nullable().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
})

export type CreateContentEntryInput = z.infer<typeof CreateContentEntryInputSchema>

// ---------------------------------------------------------------------------
// UpdateContentEntryCollectionInput
// ---------------------------------------------------------------------------

export const UpdateContentEntryCollectionInputSchema = z.object({
  collectionId: z.string(),
})

export type UpdateContentEntryCollectionInput = z.infer<typeof UpdateContentEntryCollectionInputSchema>

// ---------------------------------------------------------------------------
// ContentMediaType
// ---------------------------------------------------------------------------

export const ContentMediaTypeSchema = z.enum(['image', 'video'])

export type ContentMediaType = z.infer<typeof ContentMediaTypeSchema>

// ---------------------------------------------------------------------------
// ContentBlock — discriminated union on `type`
// ---------------------------------------------------------------------------

export const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('paragraph'),
    text: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('heading'),
    level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    text: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('media'),
    mediaType: ContentMediaTypeSchema.nullable(),
    src: z.string(),
    alt: z.string(),
  }),
])

export type ContentBlock = z.infer<typeof ContentBlockSchema>
