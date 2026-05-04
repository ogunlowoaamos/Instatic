import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import {
  publishCmsContentEntry,
  saveCmsContentEntryDraft,
  updateCmsContentEntryStatus,
} from '@core/persistence'
import {
  createParagraphBlock,
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
} from '@core/content/markdown'
import type { ContentBlock, ContentEntry, ContentEntryStatus } from '@core/content/schemas'
import { slugFromTitle } from '@core/utils/slug'

export type SaveMessage = 'idle' | 'saving' | 'saved' | 'publishing' | 'published' | 'error'

interface UseContentEntryDraftOptions {
  selectedEntry: ContentEntry | null
  updateSelectedEntry: (entry: ContentEntry) => void
  setError: (message: string | null) => void
}

export function useContentEntryDraft({
  selectedEntry,
  updateSelectedEntry,
  setError,
}: UseContentEntryDraftOptions) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [featuredMediaId, setFeaturedMediaId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<ContentBlock[]>([createParagraphBlock()])
  const [saveMessage, setSaveMessage] = useState<SaveMessage>('idle')

  const applySelectedEntry = useCallback((entry: ContentEntry | null) => {
    setTitle(entry?.title ?? '')
    setSlug(entry?.slug ?? '')
    setSeoTitle(entry?.seoTitle ?? '')
    setSeoDescription(entry?.seoDescription ?? '')
    setFeaturedMediaId(entry?.featuredMediaId ?? null)
    setBlocks(entry ? parseMarkdownBlocks(entry.bodyMarkdown) : [createParagraphBlock()])
    setSaveMessage('idle')
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useLayoutEffect(() => {
    applySelectedEntry(selectedEntry)
  }, [applySelectedEntry, selectedEntry?.id])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const applyEntryFields = useCallback((entry: ContentEntry) => {
    setTitle(entry.title)
    setSlug(entry.slug)
    setSeoTitle(entry.seoTitle)
    setSeoDescription(entry.seoDescription)
    setFeaturedMediaId(entry.featuredMediaId)
  }, [])

  const isDirty = useMemo(() => {
    if (!selectedEntry) return false
    return title !== selectedEntry.title ||
      slug !== selectedEntry.slug ||
      seoTitle !== selectedEntry.seoTitle ||
      seoDescription !== selectedEntry.seoDescription ||
      featuredMediaId !== selectedEntry.featuredMediaId ||
      serializeMarkdownBlocks(blocks) !== selectedEntry.bodyMarkdown
  }, [blocks, featuredMediaId, selectedEntry, seoDescription, seoTitle, slug, title])

  const saveDraft = useCallback(async (): Promise<ContentEntry | null> => {
    if (!selectedEntry) return null
    const nextTitle = title.trim() || 'Untitled'
    const nextSlug = slugFromTitle(slug || nextTitle)
    const entry = await saveCmsContentEntryDraft(selectedEntry.id, {
      title: nextTitle,
      slug: nextSlug,
      bodyMarkdown: serializeMarkdownBlocks(blocks),
      featuredMediaId,
      seoTitle: seoTitle.trim(),
      seoDescription: seoDescription.trim(),
    })
    updateSelectedEntry(entry)
    applyEntryFields(entry)
    return entry
  }, [
    applyEntryFields,
    blocks,
    featuredMediaId,
    selectedEntry,
    seoDescription,
    seoTitle,
    slug,
    title,
    updateSelectedEntry,
  ])

  const handleSaveDraft = useCallback(async () => {
    setSaveMessage('saving')
    setError(null)
    try {
      await saveDraft()
      setSaveMessage('saved')
    } catch (err) {
      setSaveMessage('error')
      setError(err instanceof Error ? err.message : 'Could not save draft')
    }
  }, [saveDraft, setError])

  const handlePublish = useCallback(async () => {
    if (!selectedEntry) return
    setSaveMessage('publishing')
    setError(null)
    try {
      const savedEntry = await saveDraft()
      if (!savedEntry) return
      const publishedEntry = await publishCmsContentEntry(savedEntry.id)
      updateSelectedEntry({
        ...savedEntry,
        status: publishedEntry.status,
        updatedAt: publishedEntry.updatedAt,
        publishedAt: publishedEntry.publishedAt,
        deletedAt: publishedEntry.deletedAt,
      })
      setSaveMessage('published')
    } catch (err) {
      setSaveMessage('error')
      setError(err instanceof Error ? err.message : 'Could not publish entry')
    }
  }, [saveDraft, selectedEntry, setError, updateSelectedEntry])

  const handleStatusChange = useCallback(async (nextStatus: ContentEntryStatus) => {
    if (!selectedEntry || nextStatus === selectedEntry.status) return

    if (nextStatus === 'published') {
      await handlePublish()
      return
    }

    setSaveMessage('saving')
    setError(null)
    try {
      const savedEntry = await saveDraft()
      if (!savedEntry) return
      const updatedEntry = await updateCmsContentEntryStatus(savedEntry.id, nextStatus)
      updateSelectedEntry(updatedEntry)
      applyEntryFields(updatedEntry)
      setSaveMessage('idle')
    } catch (err) {
      setSaveMessage('error')
      setError(err instanceof Error ? err.message : 'Could not update entry status')
    }
  }, [applyEntryFields, handlePublish, saveDraft, selectedEntry, setError, updateSelectedEntry])

  return {
    title,
    slug,
    seoTitle,
    seoDescription,
    featuredMediaId,
    blocks,
    isDirty,
    saveMessage,
    setTitle,
    setSlug,
    setSeoTitle,
    setSeoDescription,
    setFeaturedMediaId,
    setBlocks,
    setSaveMessage,
    handleSaveDraft,
    handlePublish,
    handleStatusChange,
    applySelectedEntry,
  }
}
