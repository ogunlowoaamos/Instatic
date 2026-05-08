import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useEditorStore } from '@site/store/store'
import { registry } from '@core/module-engine/registry'
import { useInsertModule } from '@site/hooks/useInsertModule'
import { makeNode, makePage, makeSite } from '../fixtures'
import '@modules/base/index'

beforeEach(() => {
  useEditorStore.setState({
    site: null,
    activePageId: null,
    activeDocument: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
    packageJson: {},
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  })
})

afterEach(() => {
  cleanup()
})

describe('useInsertModule', () => {
  it('selects the inserted module and opens Properties', () => {
    useEditorStore.getState().createSite('Test SiteDocument')
    const mod = registry.get('base.text')
    expect(mod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedNodeId: string | null = null

    act(() => {
      insertedNodeId = result.current(mod!)
    })

    const state = useEditorStore.getState()
    expect(insertedNodeId).toBeTruthy()
    expect(state.selectedNodeId).toBe(insertedNodeId)
    expect(state.propertiesPanel.collapsed).toBe(false)
  })

  it('inserts into the active VC tree (not the page tree) when in VC edit mode', () => {
    // Create a site, then create a VC and switch into VC edit mode.
    const store = useEditorStore.getState()
    store.createSite('VC Insert Test')
    const vcId = store.createVisualComponent('TestCard')
    store.setActiveDocument({ kind: 'visualComponent', vcId })

    // Sanity: activeDocument is now the VC
    expect(useEditorStore.getState().activeDocument).toEqual({
      kind: 'visualComponent',
      vcId,
    })

    // Insert a Slot via the same hook the toolbar/ModulePicker uses.
    const slotMod = registry.get('base.slot-outlet')
    expect(slotMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedNodeId: string | null = null
    act(() => {
      insertedNodeId = result.current(slotMod!)
    })

    expect(insertedNodeId).toBeTruthy()

    // The slot must be inside the VC tree…
    const state = useEditorStore.getState()
    const vc = state.site!.visualComponents.find((v) => v.id === vcId)!
    const vcRoot = vc.tree.nodes[vc.tree.rootNodeId]
    // Root node lists the inserted slot as a child
    expect(vcRoot.children).toContain(insertedNodeId)
    // The node itself is registered in the flat nodes map
    const insertedNode = vc.tree.nodes[insertedNodeId!]
    expect(insertedNode).toBeDefined()
    expect(insertedNode?.moduleId).toBe('base.slot-outlet')

    // …and NOT in any page tree.
    for (const page of state.site!.pages) {
      expect(page.nodes[insertedNodeId!]).toBeUndefined()
    }

    // Selection follows the inserted node so the Properties panel shows it.
    expect(state.selectedNodeId).toBe(insertedNodeId)
  })
})

describe('useInsertModule — VC ref redirect', () => {
  /**
   * Builds a page with a VC ref that has two slot-instance children:
   *   vcRef (base.visual-component-ref)
   *     slot-1 (base.slot-instance, slotName: 'children', locked)
   *     slot-2 (base.slot-instance, slotName: 'actions', locked)
   */
  function setupPageWithVcRef() {
    useEditorStore.setState({
      site: makeSite({
        pages: [
          makePage({
            id: 'page-vc',
            rootNodeId: 'root',
            nodes: {
              root: makeNode({ id: 'root', moduleId: 'base.body', children: ['vc-ref'] }),
              'vc-ref': makeNode({
                id: 'vc-ref',
                moduleId: 'base.visual-component-ref',
                props: { componentId: 'vc-1' },
                children: ['slot-1', 'slot-2'],
              }),
              'slot-1': makeNode({
                id: 'slot-1',
                moduleId: 'base.slot-instance',
                props: { slotName: 'children' },
                children: [],
                locked: true,
              }),
              'slot-2': makeNode({
                id: 'slot-2',
                moduleId: 'base.slot-instance',
                props: { slotName: 'actions' },
                children: [],
                locked: true,
              }),
            },
          }),
        ],
      }),
      activePageId: 'page-vc',
      activeDocument: null,
      selectedNodeId: null,
    selectedNodeIds: [],
      hoveredNodeId: null,
      propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
      packageJson: {},
      _historyPast: [],
      _historyFuture: [],
      canUndo: false,
      canRedo: false,
      hasUnsavedChanges: false,
    } as Parameters<typeof useEditorStore.setState>[0])
  }

  it('Test A: inserts into the first slot-instance when the selected node is a VC ref', () => {
    setupPageWithVcRef()
    useEditorStore.setState({ selectedNodeId: 'vc-ref' } as Parameters<typeof useEditorStore.setState>[0])

    const textMod = registry.get('base.text')
    expect(textMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedId: string | null = null
    act(() => { insertedId = result.current(textMod!) })

    const state = useEditorStore.getState()
    const page = state.site!.pages.find((p) => p.id === 'page-vc')!

    // New node must be a child of slot-1 (the first slot-instance)
    expect(page.nodes['slot-1'].children).toContain(insertedId)

    // VC ref's direct children must be unchanged — still just the two slot-instances
    expect(page.nodes['vc-ref'].children).toEqual(['slot-1', 'slot-2'])
  })

  it('Test B: inserts into the first slot-instance when explicit parent is a VC ref', () => {
    setupPageWithVcRef()

    const textMod = registry.get('base.text')
    expect(textMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedId: string | null = null
    // Pass the VC ref id as the explicit parent
    act(() => { insertedId = result.current(textMod!, 'vc-ref') })

    const state = useEditorStore.getState()
    const page = state.site!.pages.find((p) => p.id === 'page-vc')!

    expect(page.nodes['slot-1'].children).toContain(insertedId)
    expect(page.nodes['vc-ref'].children).toEqual(['slot-1', 'slot-2'])
  })

  it('Test C: warns and skips insertion when VC ref has no slot-instance children', () => {
    // Page with a VC ref that has NO slot-instance children (edge case)
    useEditorStore.setState({
      site: makeSite({
        pages: [
          makePage({
            id: 'page-empty-vc',
            rootNodeId: 'root',
            nodes: {
              root: makeNode({ id: 'root', moduleId: 'base.body', children: ['vc-ref'] }),
              'vc-ref': makeNode({
                id: 'vc-ref',
                moduleId: 'base.visual-component-ref',
                props: { componentId: 'vc-1' },
                children: [],
              }),
            },
          }),
        ],
      }),
      activePageId: 'page-empty-vc',
      activeDocument: null,
      selectedNodeId: 'vc-ref',
      hoveredNodeId: null,
      propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
      packageJson: {},
      _historyPast: [],
      _historyFuture: [],
      canUndo: false,
      canRedo: false,
      hasUnsavedChanges: false,
    } as Parameters<typeof useEditorStore.setState>[0])

    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})

    const textMod = registry.get('base.text')
    expect(textMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedId: string | null | undefined
    act(() => { insertedId = result.current(textMod!) })

    // Hook must return null (insertion skipped)
    expect(insertedId).toBeNull()

    // console.warn must have been called with the expected prefix
    expect(warnSpy).toHaveBeenCalled()
    const warnArgs = warnSpy.mock.calls[0]
    expect(warnArgs[0]).toMatch(/\[useInsertModule\]/)

    // VC ref must still have no children
    const state = useEditorStore.getState()
    const vcRef = state.site!.pages[0].nodes['vc-ref']
    expect(vcRef.children).toEqual([])

    warnSpy.mockRestore()
  })
})

