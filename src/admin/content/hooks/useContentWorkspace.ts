import { useCallback, useEffect, useState } from 'react'
import {
  createCmsContentCollection,
  createCmsContentEntry,
  deleteCmsContentCollection,
  deleteCmsContentEntry,
  listCmsContentCollections,
  listCmsContentEntries,
  publishCmsContentEntry,
  saveCmsContentEntryDraft,
  updateCmsContentEntryCollection,
  updateCmsContentCollection,
  updateCmsContentEntryStatus,
} from '@core/persistence'
import { useEditorStore } from '@core/editor-store/store'
import type {
  ContentCollection,
  ContentEntry,
  ContentEntryStatus,
  CreateContentCollectionInput,
  UpdateContentCollectionInput,
} from '@core/content/schemas'
import { updateEntryList } from '../utils/contentEntryUtils'

export function useContentWorkspace() {
  const [collections, setCollections] = useState<ContentCollection[]>([])
  const [entries, setEntries] = useState<ContentEntry[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<ContentEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) ?? null
  const contentLoading = loading || entriesLoading

  const selectEntry = useCallback((entry: ContentEntry | null) => {
    setSelectedEntry(entry)
    useEditorStore.getState().setPropertiesPanel({ collapsed: false })
  }, [])

  const updateSelectedEntry = useCallback((entry: ContentEntry) => {
    setSelectedEntry(entry)
    setEntries((current) => updateEntryList(current, entry))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCollections() {
      setLoading(true)
      setEntriesLoading(true)
      setError(null)
      try {
        const nextCollections = await listCmsContentCollections()
        if (cancelled) return
        const fallbackCollectionId = nextCollections[0]?.id ?? null
        setCollections(nextCollections)
        setEntriesLoading(Boolean(fallbackCollectionId))
        setSelectedCollectionId((current) => current ?? fallbackCollectionId)
      } catch (err) {
        if (!cancelled) {
          setEntriesLoading(false)
          setError(err instanceof Error ? err.message : 'Could not load content')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCollections()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedCollectionId) {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) setEntriesLoading(false)
      })
      return () => { cancelled = true }
    }
    const collectionId = selectedCollectionId
    let cancelled = false

    async function loadEntries() {
      setEntriesLoading(true)
      setError(null)
      try {
        const nextEntries = await listCmsContentEntries(collectionId)
        if (cancelled) return
        setEntries(nextEntries)
        setSelectedEntry((current) => {
          if (!current || current.collectionId !== collectionId) {
            useEditorStore.getState().setPropertiesPanel({ collapsed: false })
            return nextEntries[0] ?? null
          }
          return current
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load entries')
      } finally {
        if (!cancelled) setEntriesLoading(false)
      }
    }

    void loadEntries()
    return () => { cancelled = true }
  }, [selectedCollectionId])

  const selectCollection = useCallback((collectionId: string) => {
    if (collectionId === selectedCollectionId) return
    setEntriesLoading(true)
    setSelectedCollectionId(collectionId)
  }, [selectedCollectionId])

  const createUntitledEntry = useCallback(async () => {
    if (!selectedCollection) return null
    const nextSlug = entries.length === 0 ? 'untitled' : `untitled-${entries.length + 1}`
    const entry = await createCmsContentEntry(selectedCollection.id, {
      title: 'Untitled',
      slug: nextSlug,
    })
    setEntries((current) => updateEntryList(current, entry))
    selectEntry(entry)
    return entry
  }, [entries.length, selectEntry, selectedCollection])

  const createCollection = useCallback(async (input: CreateContentCollectionInput) => {
    setError(null)
    setEntriesLoading(true)
    const collection = await createCmsContentCollection(input)
    setCollections((current) => [...current, collection])
    setEntries([])
    setSelectedCollectionId(collection.id)
    selectEntry(null)
    return collection
  }, [selectEntry])

  const updateCollection = useCallback(async (
    collectionId: string,
    input: UpdateContentCollectionInput,
  ) => {
    setError(null)
    const collection = await updateCmsContentCollection(collectionId, input)
    setCollections((current) => current.map((candidate) =>
      candidate.id === collection.id ? collection : candidate
    ))
    return collection
  }, [])

  const deleteCollection = useCallback(async (collectionId: string) => {
    setError(null)
    await deleteCmsContentCollection(collectionId)

    const nextCollections = collections.filter((collection) => collection.id !== collectionId)
    const nextSelectedCollectionId = selectedCollectionId === collectionId
      ? nextCollections[0]?.id ?? null
      : selectedCollectionId
    setCollections(nextCollections)

    if (selectedCollectionId === collectionId) {
      setSelectedCollectionId(nextSelectedCollectionId)
      setEntries([])
      setEntriesLoading(Boolean(nextSelectedCollectionId))
      selectEntry(null)
    }
  }, [collections, selectEntry, selectedCollectionId])

  const renameEntry = useCallback(async (
    entry: ContentEntry,
    input: Pick<ContentEntry, 'title' | 'slug'>,
  ) => {
    setError(null)
    const updatedEntry = await saveCmsContentEntryDraft(entry.id, {
      title: input.title,
      slug: input.slug,
      bodyMarkdown: entry.bodyMarkdown,
      featuredMediaId: entry.featuredMediaId,
      seoTitle: entry.seoTitle,
      seoDescription: entry.seoDescription,
    })
    setEntries((current) => updateEntryList(current, updatedEntry))
    if (selectedEntry?.id === entry.id) selectEntry(updatedEntry)
    return updatedEntry
  }, [selectEntry, selectedEntry?.id])

  const deleteEntry = useCallback(async (entry: ContentEntry) => {
    setError(null)
    await deleteCmsContentEntry(entry.id)

    const nextEntries = entries.filter((candidate) => candidate.id !== entry.id)
    const nextSelectedEntry = selectedEntry?.id === entry.id
      ? nextEntries[0] ?? null
      : selectedEntry
    setEntries(nextEntries)

    if (selectedEntry?.id === entry.id) {
      selectEntry(nextSelectedEntry)
    }
    return nextSelectedEntry
  }, [entries, selectEntry, selectedEntry])

  const publishEntry = useCallback(async (entry: ContentEntry) => {
    setError(null)
    const updatedEntry = await publishCmsContentEntry(entry.id)
    setEntries((current) => updateEntryList(current, updatedEntry))
    if (selectedEntry?.id === entry.id) selectEntry(updatedEntry)
    return updatedEntry
  }, [selectEntry, selectedEntry?.id])

  const updateEntryStatus = useCallback(async (
    entry: ContentEntry,
    status: Exclude<ContentEntryStatus, 'published'>,
  ) => {
    setError(null)
    const updatedEntry = await updateCmsContentEntryStatus(entry.id, status)
    setEntries((current) => updateEntryList(current, updatedEntry))
    if (selectedEntry?.id === entry.id) selectEntry(updatedEntry)
    return updatedEntry
  }, [selectEntry, selectedEntry?.id])

  const moveSelectedEntryToCollection = useCallback(async (collectionId: string) => {
    if (!selectedEntry || selectedEntry.collectionId === collectionId) return selectedEntry
    setError(null)
    setEntriesLoading(true)
    const entry = await updateCmsContentEntryCollection(selectedEntry.id, collectionId)
    setSelectedCollectionId(collectionId)
    setEntries([entry])
    selectEntry(entry)
    return entry
  }, [selectEntry, selectedEntry])

  return {
    collections,
    entries,
    selectedCollection,
    selectedCollectionId,
    selectedEntry,
    contentLoading,
    error,
    setError,
    selectCollection,
    selectEntry,
    updateSelectedEntry,
    createUntitledEntry,
    createCollection,
    updateCollection,
    deleteCollection,
    renameEntry,
    deleteEntry,
    publishEntry,
    updateEntryStatus,
    moveSelectedEntryToCollection,
  }
}
