import { z } from 'zod'
import type {
  ContentCollection,
  ContentEntry,
  ContentEntryDraftInput,
  ContentEntryStatus,
  CreateContentCollectionInput,
  CreateContentEntryInput,
  UpdateContentEntryCollectionInput,
  UpdateContentCollectionInput,
} from '../content/types'
import { readEnvelope } from './httpJson'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

// ---------------------------------------------------------------------------
// Envelope schemas
//
// ContentCollection and ContentEntry are deep domain types. We validate the
// outer envelope (object with the expected key) but pass the inner entity
// through as `unknown` then cast at the call site — same envelope strategy
// used by responseSchemas.ts. Catches "server returned wrong shape" without
// duplicating the entire content type tree as Zod.
//
// Surfaced by /audit-types — was `await res.json() as T` with caller-supplied
// type parameter. The cast was the very thing we want to remove.

const CollectionsListEnvelope = z.object({
  collections: z.array(z.unknown()).optional(),
}).passthrough()

const EntriesListEnvelope = z.object({
  entries: z.array(z.unknown()).optional(),
}).passthrough()

const CollectionEnvelope = z.object({
  collection: z.unknown().optional(),
}).passthrough()

const EntryEnvelope = z.object({
  entry: z.unknown().optional(),
}).passthrough()

// ---------------------------------------------------------------------------

export async function listCmsContentCollections(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentCollection[]> {
  const res = await fetchImpl(`${basePath}/content/collections`, {
    method: 'GET',
    credentials: 'include',
  })
  const body = await readEnvelope(res, CollectionsListEnvelope, `CMS content collections failed with ${res.status}`)
  return (body.collections ?? []) as ContentCollection[]
}

export async function listCmsContentEntries(
  collectionId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentEntry[]> {
  const res = await fetchImpl(`${basePath}/content/collections/${encodeURIComponent(collectionId)}/entries`, {
    method: 'GET',
    credentials: 'include',
  })
  const body = await readEnvelope(res, EntriesListEnvelope, `CMS content entries failed with ${res.status}`)
  return (body.entries ?? []) as ContentEntry[]
}

export async function createCmsContentCollection(
  input: CreateContentCollectionInput,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentCollection> {
  const res = await fetchImpl(`${basePath}/content/collections`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, CollectionEnvelope, `CMS content collection create failed with ${res.status}`)
  if (!body.collection) throw new Error('CMS content collection create response was missing collection')
  return body.collection as ContentCollection
}

export async function updateCmsContentCollection(
  collectionId: string,
  input: UpdateContentCollectionInput,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentCollection> {
  const res = await fetchImpl(`${basePath}/content/collections/${encodeURIComponent(collectionId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, CollectionEnvelope, `CMS content collection update failed with ${res.status}`)
  if (!body.collection) throw new Error('CMS content collection update response was missing collection')
  return body.collection as ContentCollection
}

export async function deleteCmsContentCollection(
  collectionId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentCollection> {
  const res = await fetchImpl(`${basePath}/content/collections/${encodeURIComponent(collectionId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const body = await readEnvelope(res, CollectionEnvelope, `CMS content collection delete failed with ${res.status}`)
  if (!body.collection) throw new Error('CMS content collection delete response was missing collection')
  return body.collection as ContentCollection
}

export async function createCmsContentEntry(
  collectionId: string,
  input: CreateContentEntryInput,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentEntry> {
  const res = await fetchImpl(`${basePath}/content/collections/${encodeURIComponent(collectionId)}/entries`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, EntryEnvelope, `CMS content entry create failed with ${res.status}`)
  if (!body.entry) throw new Error('CMS content entry create response was missing entry')
  return body.entry as ContentEntry
}

export async function saveCmsContentEntryDraft(
  entryId: string,
  input: ContentEntryDraftInput,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentEntry> {
  const res = await fetchImpl(`${basePath}/content/entries/${encodeURIComponent(entryId)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, EntryEnvelope, `CMS content entry save failed with ${res.status}`)
  if (!body.entry) throw new Error('CMS content entry save response was missing entry')
  return body.entry as ContentEntry
}

export async function deleteCmsContentEntry(
  entryId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentEntry> {
  const res = await fetchImpl(`${basePath}/content/entries/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const body = await readEnvelope(res, EntryEnvelope, `CMS content entry delete failed with ${res.status}`)
  if (!body.entry) throw new Error('CMS content entry delete response was missing entry')
  return body.entry as ContentEntry
}

export async function publishCmsContentEntry(
  entryId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentEntry> {
  const res = await fetchImpl(`${basePath}/content/entries/${encodeURIComponent(entryId)}/publish`, {
    method: 'POST',
    credentials: 'include',
  })
  const body = await readEnvelope(res, EntryEnvelope, `CMS content entry publish failed with ${res.status}`)
  if (!body.entry) throw new Error('CMS content entry publish response was missing entry')
  return body.entry as ContentEntry
}

export async function updateCmsContentEntryStatus(
  entryId: string,
  status: Exclude<ContentEntryStatus, 'published'>,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentEntry> {
  const res = await fetchImpl(`${basePath}/content/entries/${encodeURIComponent(entryId)}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const body = await readEnvelope(res, EntryEnvelope, `CMS content entry status update failed with ${res.status}`)
  if (!body.entry) throw new Error('CMS content entry status response was missing entry')
  return body.entry as ContentEntry
}

export async function updateCmsContentEntryCollection(
  entryId: string,
  collectionId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<ContentEntry> {
  const input: UpdateContentEntryCollectionInput = { collectionId }
  const res = await fetchImpl(`${basePath}/content/entries/${encodeURIComponent(entryId)}/collection`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, EntryEnvelope, `CMS content entry collection update failed with ${res.status}`)
  if (!body.entry) throw new Error('CMS content entry collection response was missing entry')
  return body.entry as ContentEntry
}
