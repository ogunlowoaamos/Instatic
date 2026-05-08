/**
 * Public surface of the content repository.
 *
 * Split into three modules by responsibility:
 *
 *   collections.ts — content_collections CRUD
 *   entries.ts     — content_entries CRUD (drafts, status, author, move, delete)
 *   publish.ts     — content_entry_versions + redirects + public-route lookups
 *
 * Domain types (`ContentEntry`, `ContentCollection`, `PublishedContentEntry`,
 * `ContentEntryRedirect`, `ContentEntryVersion`, `ContentUserReference`)
 * are TypeBox schemas in `@core/content/schemas` — import them from there.
 * Row shapes and mappers stay co-located with the queries that produce them.
 */
export {
  listContentCollections,
  createContentCollection,
  updateContentCollection,
  softDeleteContentCollection,
} from './collections'

export {
  listContentEntries,
  getContentEntry,
  listContentAuthorOptions,
  createContentEntry,
  saveContentEntryDraft,
  softDeleteContentEntry,
  updateContentEntryCollection,
  updateContentEntryStatus,
  updateContentEntryAuthor,
} from './entries'

export {
  publishContentEntry,
  getPublishedContentEntryByRoute,
  getContentEntryRedirectByRoute,
} from './publish'
