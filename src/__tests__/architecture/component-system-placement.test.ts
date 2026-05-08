/**
 * Architecture Source-Scan — Phase 4 Component-System Placement Gate
 *
 * Locks down the three component-placement flows introduced in Phase 4.
 * Every flow that inserts a `base.visual-component-ref` node MUST route
 * through the shared `insertComponentRef` action in siteSlice.ts.
 * Direct calls to `insertNode` or `addNodeToVc` with the literal moduleId
 * `'base.visual-component-ref'` are forbidden in placement-flow files —
 * those raw mutations bypass cycle detection and the unified VC / page mode
 * dispatch that `insertComponentRef` encapsulates.
 *
 * PLACEMENT FLOWS (Phase 4):
 * 1. ModulePickerDropdown.tsx — Components category click in the toolbar picker.
 * 2. SiteExplorerPanel.tsx + AdminLayout.tsx — drag from site-explorer onto the
 *    canvas; the explorer registers the drag source with the `visualComponentRef`
 *    payload kind, and AdminLayout's `onDragEnd` calls `insertComponentRef`.
 * 3. LayerNodeContextMenu.tsx — 'Insert module here' submenu click (which
 *    opens the shared ModulePickerMenu; picking a Visual Component flows
 *    through this file via the onSelectVC callback).
 *
 * ENFORCED CONSTRAINTS:
 * G1 — ModulePickerDropdown must call insertComponentRef for VC insertion.
 * G2 — SiteExplorerPanel must register the drag payload with kind 'visualComponentRef'.
 * G3 — AdminLayout must call insertComponentRef inside the visualComponentRef drag handler.
 * G4 — LayerNodeContextMenu must call insertComponentRef for VC insertion.
 * G5 — No placement file may call insertNode with 'base.visual-component-ref' directly.
 * G6 — No placement file may call addNodeToVc with 'base.visual-component-ref' directly.
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dir, '../../..')

const PICKER_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/pages/site/toolbar/ModulePickerDropdown.tsx',
)
const EXPLORER_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/pages/site/panels/SiteExplorerPanel/SiteExplorerPanel.tsx',
)
const CONTEXT_MENU_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/pages/site/panels/DomPanel/LayerNodeContextMenu.tsx',
)
const ADMIN_LAYOUT_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/AdminLayout.tsx',
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

/**
 * Returns true when `callFn(` appears (on a non-comment line) within
 * `windowLines` lines of the literal `'base.visual-component-ref'` or
 * `"base.visual-component-ref"`. This detects a bypass call expression
 * even when the arguments span multiple lines.
 */
function containsBypassCall(src: string, callFn: string, windowLines = 10): boolean {
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip comment lines
    if (/^\s*\/\//.test(line.trim())) continue
    if (!line.includes(`${callFn}(`)) continue

    // Scan forward in a window for the VC ref module ID literal
    const end = Math.min(lines.length, i + windowLines)
    for (let j = i; j < end; j++) {
      const scanLine = lines[j]
      if (
        scanLine.includes("'base.visual-component-ref'") ||
        scanLine.includes('"base.visual-component-ref"')
      ) {
        return true
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Gate 1 — ModulePickerDropdown must use insertComponentRef
// ---------------------------------------------------------------------------

describe('G1 — ModulePickerDropdown calls insertComponentRef for VC insertion (Phase 4)', () => {
  test('ModulePickerDropdown.tsx must reference insertComponentRef', () => {
    const src = readSource(PICKER_PATH)
    if (!src.includes('insertComponentRef')) {
      throw new Error(
        '[Phase 4 / G1] ModulePickerDropdown.tsx does not reference insertComponentRef.\n' +
        'The Components-category click must route through insertComponentRef — the single\n' +
        'shared action that handles both page-mode and VC-mode insertion with cycle detection.\n' +
        'File: src/admin/pages/site/components/Toolbar/ModulePickerDropdown.tsx',
      )
    }
    expect(src).toContain('insertComponentRef')
  })
})

// ---------------------------------------------------------------------------
// Gate 2 — SiteExplorerPanel must register the correct drag payload kind
//
// The explorer is the drag *source*. It does not call insertComponentRef
// directly — that happens in AdminLayout's onDragEnd (Gate 3). However,
// the drag payload MUST use kind 'visualComponentRef' so the handler can
// identify and dispatch the insert correctly.
// ---------------------------------------------------------------------------

describe("G2 — SiteExplorerPanel drag source uses 'visualComponentRef' payload kind (Phase 4)", () => {
  test("SiteExplorerPanel.tsx drag payload kind must be 'visualComponentRef'", () => {
    const src = readSource(EXPLORER_PATH)
    if (!src.includes("'visualComponentRef'")) {
      throw new Error(
        "[Phase 4 / G2] SiteExplorerPanel.tsx drag payload does not use kind: 'visualComponentRef'.\n" +
        "The DraggableComponentRow must register the dnd-kit draggable with:\n" +
        "  data: { kind: 'visualComponentRef', componentId: component.id }\n" +
        "Without this, AdminLayout's onDragEnd cannot identify the drag as a VC insertion.\n" +
        'File: src/admin/pages/site/components/SiteExplorerPanel/SiteExplorerPanel.tsx',
      )
    }
    expect(src).toContain("'visualComponentRef'")
  })
})

// ---------------------------------------------------------------------------
// Gate 3 — AdminLayout onDragEnd must call insertComponentRef
//
// AdminLayout is the DndContext host for canvas-level VC drops. Its
// handleCanvasDragEnd handler is the single insertion point for the
// SiteExplorerPanel drag flow. It must delegate to insertComponentRef.
// ---------------------------------------------------------------------------

describe('G3 — AdminLayout onDragEnd calls insertComponentRef for visualComponentRef drops (Phase 4)', () => {
  test('AdminLayout.tsx must reference insertComponentRef inside the drag handler', () => {
    const src = readSource(ADMIN_LAYOUT_PATH)
    if (!src.includes('insertComponentRef')) {
      throw new Error(
        '[Phase 4 / G3] AdminLayout.tsx does not reference insertComponentRef.\n' +
        "The handleCanvasDragEnd function must call state.insertComponentRef(parentId, componentId)\n" +
        "after resolving the drop target from the 'visualComponentRef' drag payload.\n" +
        'File: src/admin/AdminLayout.tsx',
      )
    }
    expect(src).toContain('insertComponentRef')
  })
})

// ---------------------------------------------------------------------------
// Gate 4 — LayerNodeContextMenu must use insertComponentRef
// ---------------------------------------------------------------------------

describe("G4 — LayerNodeContextMenu calls insertComponentRef for 'Insert module here' (Phase 4)", () => {
  test('LayerNodeContextMenu.tsx must reference insertComponentRef', () => {
    const src = readSource(CONTEXT_MENU_PATH)
    if (!src.includes('insertComponentRef')) {
      throw new Error(
        '[Phase 4 / G4] LayerNodeContextMenu.tsx does not reference insertComponentRef.\n' +
        "The 'Insert module here' submenu's VC-pick callback must route through\n" +
        "insertComponentRef so cycle detection and VC/page mode dispatch are\n" +
        'applied uniformly.\n' +
        'File: src/admin/pages/site/components/DomPanel/LayerNodeContextMenu.tsx',
      )
    }
    expect(src).toContain('insertComponentRef')
  })
})

// ---------------------------------------------------------------------------
// Gate 5 — No placement file may bypass insertComponentRef via insertNode
//
// insertNode(moduleId, defaults, parentId) can create any node type directly,
// including 'base.visual-component-ref'. Calling it with that moduleId in a
// placement-flow file skips cycle detection and the VC-mode path entirely.
// ---------------------------------------------------------------------------

describe("G5 — No placement file calls insertNode with 'base.visual-component-ref' directly (Phase 4)", () => {
  const FILES: [string, string][] = [
    ['ModulePickerDropdown.tsx', PICKER_PATH],
    ['SiteExplorerPanel.tsx', EXPLORER_PATH],
    ['LayerNodeContextMenu.tsx', CONTEXT_MENU_PATH],
    ['AdminLayout.tsx', ADMIN_LAYOUT_PATH],
  ]

  for (const [label, filePath] of FILES) {
    test(`${label} must not call insertNode with 'base.visual-component-ref'`, () => {
      const src = readSource(filePath)
      const hasBypass = containsBypassCall(src, 'insertNode')
      if (hasBypass) {
        throw new Error(
          `[Phase 4 / G5] ${label} calls insertNode with 'base.visual-component-ref'.\n` +
          "Use insertComponentRef(parentId, componentId) instead — it handles both VC and page\n" +
          "mode, prevents cycles, and is the single authorised entry point for VC ref insertion.\n" +
          `File: ${filePath}`,
        )
      }
      expect(hasBypass).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// Gate 6 — No placement file may bypass insertComponentRef via addNodeToVc
//
// addNodeToVc(vcId, parentNodeId, newNode) adds a pre-constructed VCNode to a
// Visual Component tree. Calling it with a node whose moduleId is
// 'base.visual-component-ref' in a placement-flow file bypasses
// insertComponentRef's cycle check and page-mode dispatch.
// ---------------------------------------------------------------------------

describe("G6 — No placement file calls addNodeToVc with 'base.visual-component-ref' directly (Phase 4)", () => {
  const FILES: [string, string][] = [
    ['ModulePickerDropdown.tsx', PICKER_PATH],
    ['SiteExplorerPanel.tsx', EXPLORER_PATH],
    ['LayerNodeContextMenu.tsx', CONTEXT_MENU_PATH],
    ['AdminLayout.tsx', ADMIN_LAYOUT_PATH],
  ]

  for (const [label, filePath] of FILES) {
    test(`${label} must not call addNodeToVc with 'base.visual-component-ref'`, () => {
      const src = readSource(filePath)
      const hasBypass = containsBypassCall(src, 'addNodeToVc')
      if (hasBypass) {
        throw new Error(
          `[Phase 4 / G6] ${label} calls addNodeToVc with 'base.visual-component-ref'.\n` +
          "Use insertComponentRef(parentId, componentId) instead — it wraps addNodeToVc\n" +
          "with cycle detection and is the single authorised entry point for VC ref insertion.\n" +
          `File: ${filePath}`,
        )
      }
      expect(hasBypass).toBe(false)
    })
  }
})
