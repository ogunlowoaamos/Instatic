import { describe, expect, it, beforeEach } from 'bun:test'
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'fs'
import { useEditorStore } from '../../core/editor-store/store'
import { BreakpointFrame } from '../../editor/components/Canvas/BreakpointFrame'
import { CanvasRoot } from '../../editor/components/Canvas/CanvasRoot'
import '../../modules/base'

const BREAKPOINT_FRAME_CSS = new URL(
  '../../editor/components/Canvas/BreakpointFrame.module.css',
  import.meta.url,
)

beforeEach(() => {
  cleanup()
  useEditorStore.setState({
    site: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    selectedNodeId: null,
    hoveredNodeId: null,
    activeDocument: null,
    activePageId: null,
    activeBreakpointId: 'desktop',
    propertiesPanel: { collapsed: false, x: 0, y: 0, width: 360 },
    propertiesPanelMode: 'docked',
    hasUnsavedChanges: false,
  })
})

describe('canvas breakpoint rendering', () => {
  it('renders node breakpoint prop overrides inside the matching breakpoint frame', () => {
    const site = useEditorStore.getState().createSite('Breakpoint Props')
    const page = site.pages[0]
    const rootId = page.rootNodeId
    const textId = useEditorStore.getState().insertNode('base.text', {
      text: 'Desktop headline',
      tag: 'h1',
    }, rootId)
    useEditorStore.getState().setBreakpointOverride(textId, 'mobile', {
      text: 'Mobile headline',
    })

    render(
      <BreakpointFrame
        page={useEditorStore.getState().site!.pages[0]}
        breakpoint={{ id: 'mobile', label: 'Mobile', width: 375, icon: 'smartphone' }}
        isActive
        onActivate={() => {}}
      />,
    )

    expect(screen.getByText('Mobile headline')).toBeTruthy()
    expect(screen.queryByText('Desktop headline')).toBeNull()
  })

  it('activates the clicked breakpoint when selecting a node inside that frame', () => {
    const site = useEditorStore.getState().createSite('Breakpoint Selection')
    const page = site.pages[0]
    const textId = useEditorStore.getState().insertNode('base.text', {
      text: 'Shared headline',
      tag: 'h1',
    }, page.rootNodeId)
    useEditorStore.getState().setActiveBreakpoint('desktop')

    render(<CanvasRoot />)

    const mobileNode = document.querySelector(`[data-breakpoint-id="mobile"] [data-node-id="${textId}"]`)
    expect(mobileNode).toBeTruthy()

    fireEvent.click(mobileNode!)

    const state = useEditorStore.getState()
    expect(state.selectedNodeId).toBe(textId)
    expect(state.activeBreakpointId).toBe('mobile')
  })

  it('scopes canvas hover to the concrete breakpoint frame under the pointer', () => {
    const site = useEditorStore.getState().createSite('Breakpoint Hover Scope')
    const page = site.pages[0]
    const textId = useEditorStore.getState().insertNode('base.text', {
      text: 'Shared headline',
      tag: 'h1',
    }, page.rootNodeId)

    render(<CanvasRoot />)

    const mobileNode = document.querySelector(`[data-breakpoint-id="mobile"] [data-node-id="${textId}"]`)
    const desktopNode = document.querySelector(`[data-breakpoint-id="desktop"] [data-node-id="${textId}"]`)
    expect(mobileNode).toBeTruthy()
    expect(desktopNode).toBeTruthy()

    fireEvent.mouseEnter(mobileNode!)

    expect(mobileNode!.getAttribute('data-hovered')).toBe('true')
    expect(desktopNode!.hasAttribute('data-hovered')).toBe(false)

    fireEvent.mouseLeave(mobileNode!)
    fireEvent.mouseEnter(desktopNode!)

    expect(mobileNode!.hasAttribute('data-hovered')).toBe(false)
    expect(desktopNode!.getAttribute('data-hovered')).toBe('true')
  })

  it('dims inactive breakpoint frames only while editing a selected node in the open properties panel', () => {
    const site = useEditorStore.getState().createSite('Breakpoint Editing Focus')
    const page = site.pages[0]
    const textId = useEditorStore.getState().insertNode('base.text', {
      text: 'Shared headline',
      tag: 'h1',
    }, page.rootNodeId)
    useEditorStore.setState({
      activeBreakpointId: 'tablet',
      selectedNodeId: textId,
      propertiesPanel: { collapsed: false, x: 0, y: 0, width: 360 },
      propertiesPanelMode: 'docked',
    } as Parameters<typeof useEditorStore.setState>[0])

    const { rerender } = render(<CanvasRoot />)

    const tabletFrame = document.querySelector('[data-breakpoint-id="tablet"]')?.parentElement
    const mobileFrame = document.querySelector('[data-breakpoint-id="mobile"]')?.parentElement
    const desktopFrame = document.querySelector('[data-breakpoint-id="desktop"]')?.parentElement

    expect(tabletFrame?.getAttribute('data-breakpoint-dimmed')).toBeNull()
    expect(mobileFrame?.getAttribute('data-breakpoint-dimmed')).toBe('true')
    expect(desktopFrame?.getAttribute('data-breakpoint-dimmed')).toBe('true')

    act(() => {
      useEditorStore.setState({
        propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
      } as Parameters<typeof useEditorStore.setState>[0])
    })
    rerender(<CanvasRoot />)

    expect(mobileFrame?.getAttribute('data-breakpoint-dimmed')).toBeNull()
    expect(desktopFrame?.getAttribute('data-breakpoint-dimmed')).toBeNull()

    const css = readFileSync(BREAKPOINT_FRAME_CSS, 'utf-8')
    expect(css).toContain('.frameWrapperDimmed')
    expect(css).toContain('opacity: 0.42')
  })
})
