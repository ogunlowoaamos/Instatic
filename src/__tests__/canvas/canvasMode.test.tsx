/**
 * Canvas mode (Design / Preview) tests.
 *
 * Covers:
 * - canvasView default + setCanvasView store action
 * - CanvasModeToggle component reflects + drives the store
 * - BreakpointFrame swaps between NodeRenderer (design) and
 *   CanvasRuntimePreview (preview) — never stacks them
 * - CanvasRuntimePreview's bundle signature: a property edit on a node does
 *   not retrigger the runtime build, but a script-content edit, packageJson
 *   change, or breakpoint switch does. That contract is the entire point of
 *   the design-vs-preview split.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CanvasModeToggle } from '@editor/components/Canvas/CanvasModeToggle'
import { BreakpointFrame } from '@editor/components/Canvas/BreakpointFrame'
import { CanvasRuntimePreview } from '@editor/components/Canvas/CanvasRuntimePreview'
import { useEditorStore } from '@core/editor-store/store'
import { normalizeSiteRuntimeConfig } from '@core/site-runtime'
import { makeNode, makePage, makeSite } from '../fixtures'

afterEach(cleanup)

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

beforeEach(() => {
  // Reset to a clean canvas-view default for every test.
  useEditorStore.setState({ canvasView: 'design' } as Parameters<typeof useEditorStore.setState>[0])
})

// ---------------------------------------------------------------------------
// canvasView state + setCanvasView action
// ---------------------------------------------------------------------------

describe('canvasView store state', () => {
  it('defaults to "design" so existing users keep their familiar canvas', () => {
    expect(useEditorStore.getState().canvasView).toBe('design')
  })

  it('setCanvasView swaps between "design" and "preview"', () => {
    act(() => useEditorStore.getState().setCanvasView('preview'))
    expect(useEditorStore.getState().canvasView).toBe('preview')

    act(() => useEditorStore.getState().setCanvasView('design'))
    expect(useEditorStore.getState().canvasView).toBe('design')
  })
})

// ---------------------------------------------------------------------------
// CanvasModeToggle
// ---------------------------------------------------------------------------

describe('CanvasModeToggle', () => {
  it('renders both tabs with the design tab pre-selected', () => {
    render(<CanvasModeToggle />)

    const design = screen.getByTestId('canvas-mode-toggle-design')
    const preview = screen.getByTestId('canvas-mode-toggle-preview')
    expect(design.getAttribute('aria-selected')).toBe('true')
    expect(preview.getAttribute('aria-selected')).toBe('false')
  })

  it('clicking Preview switches the store to preview mode', () => {
    render(<CanvasModeToggle />)
    fireEvent.click(screen.getByTestId('canvas-mode-toggle-preview'))
    expect(useEditorStore.getState().canvasView).toBe('preview')
  })

  it('clicking Design switches the store back to design mode', () => {
    act(() => useEditorStore.getState().setCanvasView('preview'))
    render(<CanvasModeToggle />)
    fireEvent.click(screen.getByTestId('canvas-mode-toggle-design'))
    expect(useEditorStore.getState().canvasView).toBe('design')
  })
})

// ---------------------------------------------------------------------------
// BreakpointFrame mutual exclusion
// ---------------------------------------------------------------------------

function withRuntimeSite() {
  const runtime = normalizeSiteRuntimeConfig({
    scripts: {
      entry: { enabled: true, runInCanvas: true, placement: 'body-end', timing: 'dom-ready', scope: { type: 'all-pages' }, priority: 100 },
    },
  })
  const page = makePage({
    id: 'page-1',
    nodes: { root: makeNode({ id: 'root', moduleId: 'base.root', children: [] }) },
  })
  const site = makeSite({
    pages: [page],
    files: [{
      id: 'entry',
      path: 'src/scripts/entry.ts',
      type: 'script',
      content: 'console.log("hi")',
      createdAt: 1,
      updatedAt: 1,
    }],
    packageJson: { dependencies: {}, devDependencies: {} },
    runtime,
  })

  useEditorStore.setState({
    site,
    packageJson: site.packageJson,
    siteRuntime: runtime,
    activePageId: 'page-1',
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])

  return { page, breakpoint: site.breakpoints[0] }
}

describe('BreakpointFrame mode-conditional rendering', () => {
  it('design mode renders the React canvas (no runtime iframe)', () => {
    const { page, breakpoint } = withRuntimeSite()
    render(
      <BreakpointFrame
        page={page}
        breakpoint={breakpoint}
        isActive
        onActivate={() => {}}
      />,
    )
    expect(screen.queryByTestId('canvas-runtime-preview')).toBeNull()
  })

  it('preview mode renders the runtime iframe (no React canvas)', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        html: '<!DOCTYPE html><html><body></body></html>',
        assets: [],
        runtimeAssets: { scripts: [] },
        diagnostics: [],
      }), { status: 200 })) as typeof fetch

    const { page, breakpoint } = withRuntimeSite()
    act(() => useEditorStore.getState().setCanvasView('preview'))

    render(
      <BreakpointFrame
        page={page}
        breakpoint={breakpoint}
        isActive
        onActivate={() => {}}
      />,
    )

    // Runtime preview eventually mounts after the debounced build resolves.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })

    const iframe = await screen.findByTestId('canvas-runtime-preview')
    expect(iframe).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// CanvasRuntimePreview rebuild contract
// ---------------------------------------------------------------------------

describe('CanvasRuntimePreview rebuild trigger', () => {
  let buildCalls = 0
  beforeEach(() => {
    buildCalls = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/cms/runtime/preview')) {
        buildCalls += 1
        return new Response(JSON.stringify({
          html: '<!DOCTYPE html><html><body></body></html>',
          assets: [],
          runtimeAssets: { scripts: [] },
          diagnostics: [],
        }), { status: 200 })
      }
      return new Response('', { status: 404 })
    }) as typeof fetch
  })

  async function flushDebounce(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
  }

  it('does NOT rebuild when only unrelated site state changes (e.g. node prop edits)', async () => {
    const { page } = withRuntimeSite()
    render(<CanvasRuntimePreview page={page} breakpointId="desktop" active />)
    await flushDebounce()
    expect(buildCalls).toBe(1)

    act(() => {
      const current = useEditorStore.getState().site!
      const nextPages = current.pages.map((p) =>
        p.id !== 'page-1' ? p : {
          ...p,
          nodes: {
            ...p.nodes,
            root: { ...p.nodes.root, props: { ...p.nodes.root.props, padding: '16px' } },
          },
        },
      )
      useEditorStore.setState({
        site: { ...current, pages: nextPages, updatedAt: Date.now() },
      } as Parameters<typeof useEditorStore.setState>[0])
    })
    await flushDebounce()

    // Critically: still 1, not 2. A property edit must not retrigger the
    // bundle nor reload the iframe (which would re-execute scripts).
    expect(buildCalls).toBe(1)
  })

  it('rebuilds when a script file changes', async () => {
    const { page } = withRuntimeSite()
    render(<CanvasRuntimePreview page={page} breakpointId="desktop" active />)
    await flushDebounce()
    expect(buildCalls).toBe(1)

    act(() => {
      const current = useEditorStore.getState().site!
      const nextFiles = current.files.map((f) =>
        f.id !== 'entry' ? f : { ...f, content: 'console.log("changed")' },
      )
      useEditorStore.setState({
        site: { ...current, files: nextFiles, updatedAt: Date.now() },
      } as Parameters<typeof useEditorStore.setState>[0])
    })
    await flushDebounce()

    expect(buildCalls).toBe(2)
  })

  it('rebuilds when packageJson changes', async () => {
    const { page } = withRuntimeSite()
    render(<CanvasRuntimePreview page={page} breakpointId="desktop" active />)
    await flushDebounce()
    expect(buildCalls).toBe(1)

    act(() => {
      const current = useEditorStore.getState().site!
      const nextPackageJson = {
        ...current.packageJson!,
        dependencies: { 'canvas-confetti': '*' },
      }
      useEditorStore.setState({
        site: { ...current, packageJson: nextPackageJson, updatedAt: Date.now() },
        packageJson: nextPackageJson,
      } as Parameters<typeof useEditorStore.setState>[0])
    })
    await flushDebounce()

    expect(buildCalls).toBe(2)
  })

  it('rebuilds when the breakpoint switches', async () => {
    const { page } = withRuntimeSite()
    const { rerender } = render(<CanvasRuntimePreview page={page} breakpointId="desktop" active />)
    await flushDebounce()
    expect(buildCalls).toBe(1)

    rerender(<CanvasRuntimePreview page={page} breakpointId="mobile" active />)
    await flushDebounce()

    expect(buildCalls).toBe(2)
  })

  it('rebuilds on Refresh click even when nothing else changed', async () => {
    const { page } = withRuntimeSite()
    render(<CanvasRuntimePreview page={page} breakpointId="desktop" active />)
    await flushDebounce()
    expect(buildCalls).toBe(1)

    fireEvent.click(await screen.findByTestId('canvas-runtime-preview-refresh'))
    await flushDebounce()
    expect(buildCalls).toBe(2)
  })
})
