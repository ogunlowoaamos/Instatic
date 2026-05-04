import type { CmsMediaAsset } from '@core/persistence'
import type { ContentEntry, ContentMediaType } from '@core/content/schemas'

export function updateEntryList(entries: ContentEntry[], entry: ContentEntry): ContentEntry[] {
  const existing = entries.findIndex((candidate) => candidate.id === entry.id)
  if (existing === -1) return [entry, ...entries]
  const next = [...entries]
  next[existing] = entry
  return next
}

export function mediaTypeFromAsset(asset: CmsMediaAsset): ContentMediaType {
  return asset.mimeType.startsWith('video/') ? 'video' : 'image'
}

export function publicContentPath(routeBase: string, entrySlug: string): string {
  const trimmedBase = routeBase.trim()
  const withLeadingSlash = trimmedBase.startsWith('/') ? trimmedBase : `/${trimmedBase}`
  const normalizedBase = withLeadingSlash.replace(/\/+$/g, '') || '/'
  return `${normalizedBase === '/' ? '' : normalizedBase}/${entrySlug}`
}
