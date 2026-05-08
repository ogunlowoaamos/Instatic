import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

const SRC_ROOT = join(import.meta.dir, '..', '..')

function readSource(path: string): string {
  return readFileSync(join(SRC_ROOT, path), 'utf8')
}

describe('Canvas Fast Refresh boundaries', () => {
  it('keeps component modules free of Fast Refresh suppression comments', () => {
    const files = [
      'admin/pages/site/canvas/ModuleSandboxFrame.tsx',
      'admin/pages/site/canvas/NodeRenderer.tsx',
    ]

    for (const file of files) {
      expect(readSource(file)).not.toContain('react-refresh/only-export-components')
    }
  })

  it('keeps NodeRenderer exports limited to React components', () => {
    const source = readSource('admin/pages/site/canvas/NodeRenderer.tsx')

    expect(source).not.toContain('export const CanvasSelectionContext')
    expect(source).not.toContain('export const CanvasBreakpointContext')
    expect(source).not.toContain('export const CanvasTemplateContext')
    expect(source).not.toContain('export function getCanvasNodeClassName')
  })

  it('keeps ModuleSandboxFrame exports limited to React components', () => {
    const source = readSource('admin/pages/site/canvas/ModuleSandboxFrame.tsx')

    expect(source).not.toContain('export function createSandboxSrcDoc')
  })
})
