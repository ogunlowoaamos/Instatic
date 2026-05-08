/**
 * TypeBox schemas for the structured-content endpoints.
 *
 * These describe what every collection / entry handler accepts on the wire.
 * Handlers use `readValidatedBody(req, Schema)` to refuse anything that
 * doesn't match before any repository code runs.
 *
 * `fields` (on collection create / patch) is intentionally `Type.Unknown()`
 * because `normalizeContentCollectionFields` is the source of truth for that
 * shape — it tolerates partial / legacy payloads and coerces them into the
 * canonical `ContentCollectionFields`. Locking the schema here would force
 * us to keep two definitions in sync.
 */
import { Type, type Static } from '@core/utils/typeboxHelpers'

const NullableString = Type.Union([Type.String(), Type.Null()])

export const CollectionCreateBodySchema = Type.Object({
  name: Type.String(),
  slug: Type.Optional(Type.String()),
  routeBase: Type.Optional(Type.String()),
  singularLabel: Type.Optional(Type.String()),
  pluralLabel: Type.Optional(Type.String()),
  fields: Type.Optional(Type.Unknown()),
})

export const CollectionPatchBodySchema = Type.Partial(Type.Object({
  name: Type.String(),
  slug: Type.String(),
  routeBase: Type.String(),
  singularLabel: Type.String(),
  pluralLabel: Type.String(),
  fields: Type.Unknown(),
}))

export const EntryUpsertBodySchema = Type.Object({
  title: Type.Optional(Type.String()),
  slug: Type.Optional(Type.String()),
  bodyMarkdown: Type.Optional(Type.String()),
  featuredMediaId: Type.Optional(NullableString),
  seoTitle: Type.Optional(Type.String()),
  seoDescription: Type.Optional(Type.String()),
})

export const EntryStatusBodySchema = Type.Object({
  status: Type.Union([Type.Literal('draft'), Type.Literal('unpublished')]),
})

export const EntryAuthorBodySchema = Type.Object({
  authorUserId: Type.String(),
})

export const EntryCollectionBodySchema = Type.Object({
  collectionId: Type.String(),
})

export type CollectionPatchBody = Static<typeof CollectionPatchBodySchema>
export type EntryUpsertBody = Static<typeof EntryUpsertBodySchema>
