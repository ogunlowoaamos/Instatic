import { afterEach, describe, expect, it } from 'bun:test'
import { materializeRuntimePreviewDocument } from '../../editor/components/Canvas/runtimePreviewDocument'

const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

afterEach(() => {
  URL.createObjectURL = originalCreateObjectUrl
  URL.revokeObjectURL = originalRevokeObjectUrl
})

describe('runtime preview document materialization', () => {
  it('rewrites preview asset paths to sandbox-safe object URLs', () => {
    const revoked: string[] = []
    URL.createObjectURL = (() => 'blob:http://localhost/runtime-entry') as typeof URL.createObjectURL
    URL.revokeObjectURL = ((url: string) => {
      revoked.push(url)
    }) as typeof URL.revokeObjectURL

    const result = materializeRuntimePreviewDocument({
      html:
        `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" ` +
        `content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">` +
        `<script type="module" src="/_pb/preview/runtime/entries/entry.js"></script>`,
      assets: [{
        path: 'entries/entry.js',
        publicPath: '/_pb/preview/runtime/entries/entry.js',
        content: 'window.__preview = true',
        contentType: 'text/javascript; charset=utf-8',
      }],
    })

    expect(result.html).toContain('blob:http://localhost/runtime-entry')
    expect(result.html).toContain("script-src 'self' blob: data:")
    result.revoke()
    expect(revoked).toEqual(['blob:http://localhost/runtime-entry'])
  })
})
