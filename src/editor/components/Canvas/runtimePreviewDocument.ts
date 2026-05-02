import type { CmsRuntimePreviewAsset, CmsRuntimePreviewResult } from '../../../core/persistence/cmsRuntime'

export interface MaterializedRuntimePreviewDocument {
  html: string
  revoke: () => void
}

export function materializeRuntimePreviewDocument(
  result: Pick<CmsRuntimePreviewResult, 'html' | 'assets'>,
): MaterializedRuntimePreviewDocument {
  const replacements = new Map<string, string>()
  const objectUrls: string[] = []

  for (const asset of result.assets) {
    const url = createAssetUrl(asset)
    replacements.set(asset.publicPath, url)
    if (url.startsWith('blob:')) objectUrls.push(url)
  }

  let html = result.html
  for (const [publicPath, url] of replacements) {
    html = replaceAll(html, publicPath, url)
  }
  html = allowSandboxPreviewAssetUrls(html)

  return {
    html,
    revoke: () => {
      for (const url of objectUrls) URL.revokeObjectURL(url)
    },
  }
}

function createAssetUrl(asset: CmsRuntimePreviewAsset): string {
  if (typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
    return URL.createObjectURL(new Blob([asset.content], { type: asset.contentType }))
  }

  return `data:${asset.contentType},${encodeDataUrlContent(asset.content)}`
}

function encodeDataUrlContent(content: string): string {
  return encodeURIComponent(content).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function replaceAll(input: string, search: string, replacement: string): string {
  return input.split(search).join(replacement)
}

function allowSandboxPreviewAssetUrls(html: string): string {
  return html
    .replace(/script-src 'self'/g, "script-src 'self' blob: data:")
    .replace(/style-src 'self' 'unsafe-inline'/g, "style-src 'self' 'unsafe-inline' blob: data:")
}
