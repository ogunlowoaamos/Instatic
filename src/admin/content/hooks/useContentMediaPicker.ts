import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listCmsMediaAssets,
  type CmsMediaAsset,
} from '@core/persistence'
import { createMediaBlock } from '@core/content/markdown'
import type { ContentBlock } from '@core/content/schemas'
import { mediaTypeFromAsset } from '../utils/contentEntryUtils'

export type MediaPickerKind = 'media' | 'featured'

export interface MediaPickerState {
  kind: MediaPickerKind
  targetBlockId?: string
}

interface UseContentMediaPickerOptions {
  featuredMediaId: string | null
  setFeaturedMediaId: (mediaId: string | null) => void
  setBlocks: (updater: (blocks: ContentBlock[]) => ContentBlock[]) => void
}

export function useContentMediaPicker({
  featuredMediaId,
  setFeaturedMediaId,
  setBlocks,
}: UseContentMediaPickerOptions) {
  const [mediaAssets, setMediaAssets] = useState<CmsMediaAsset[]>([])
  const [mediaAssetsLoaded, setMediaAssetsLoaded] = useState(false)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaPicker, setMediaPicker] = useState<MediaPickerState | null>(null)

  const featuredMediaAsset = mediaAssets.find((asset) => asset.id === featuredMediaId) ?? null

  const filteredMediaAssets = useMemo(() => {
    if (!mediaPicker) return []
    return mediaAssets.filter((asset) =>
      asset.mimeType.startsWith('image/') || asset.mimeType.startsWith('video/'),
    )
  }, [mediaAssets, mediaPicker])

  const loadMediaAssets = useCallback(async () => {
    try {
      const assets = await listCmsMediaAssets()
      setMediaAssets(assets)
      return assets
    } finally {
      setMediaAssetsLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!featuredMediaId || mediaAssetsLoaded) return
    void loadMediaAssets().catch(() => {})
  }, [featuredMediaId, mediaAssetsLoaded, loadMediaAssets])

  const openMediaPicker = useCallback(async (kind: MediaPickerKind, targetBlockId?: string) => {
    setMediaPicker({ kind, targetBlockId })
    setMediaLoading(true)
    setMediaError(null)
    try {
      await loadMediaAssets()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load media'
      setMediaError(message)
      console.error('[ContentPage] load media picker error:', err)
    } finally {
      setMediaLoading(false)
    }
  }, [loadMediaAssets])

  const insertMedia = useCallback((asset: CmsMediaAsset) => {
    if (!mediaPicker) return

    if (mediaPicker.kind === 'featured') {
      setFeaturedMediaId(asset.id)
      setMediaPicker(null)
      return
    }

    const mediaType = mediaTypeFromAsset(asset)
    setBlocks((current) => {
      if (!mediaPicker.targetBlockId) {
        return [
          ...current,
          createMediaBlock(asset.publicPath, mediaType, mediaType === 'image' ? asset.filename : ''),
        ]
      }

      return current.map((block) => {
        if (block.id !== mediaPicker.targetBlockId) return block
        return {
          id: block.id,
          type: 'media',
          mediaType,
          src: asset.publicPath,
          alt: mediaType === 'image' ? asset.filename : '',
        }
      })
    })
    setMediaPicker(null)
  }, [mediaPicker, setBlocks, setFeaturedMediaId])

  return {
    mediaAssets,
    mediaLoading,
    mediaError,
    mediaPicker,
    featuredMediaAsset,
    filteredMediaAssets,
    openMediaPicker,
    closeMediaPicker: () => setMediaPicker(null),
    insertMedia,
  }
}
