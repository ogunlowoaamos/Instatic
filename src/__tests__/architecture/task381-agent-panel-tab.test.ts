/**
 * Architecture Gate Tests — Task #381: AgentPanel Independence (Guideline #410)
 *
 * ─── Architectural history ────────────────────────────────────────────────────
 *
 * Guideline #380 (superseded) proposed AgentPanel as a tab inside the right
 * PropertiesPanel shell ("Properties | AI" tablist). Task #424 (Contribution #584)
 * superseded this design by making AgentPanel independent from PropertiesPanel.
 * The current left-sidebar architecture renders AgentPanel as a docked left
 * sidebar panel, while PropertiesPanel remains its own floating inspector.
 *
 * Guideline #410 (current) — Panel Architecture:
 *   - LeftSidebar panels:   Files, Dependencies, Layers, Agent
 *   - PropertiesPanel:      independent floating inspector, disconnected from
 *                           the left rail
 *
 * Shared panel chrome stays in PanelHeader. LeftSidebar owns left-docked panel
 * selection; PropertiesPanel owns its draggable floating behavior.
 *
 * ─── What these gates guard ──────────────────────────────────────────────────
 *
 * The superseded tab-integration design MUST NOT be re-introduced. These gates
 * serve as stays-independent regression guards:
 *
 *   Gate 1 [STABLE] — PropertiesPanel does NOT import AgentPanel
 *     The Guideline #380 "Properties | AI" tab shell is gone. If someone re-adds
 *     an AgentPanel import to PropertiesPanel, this gate fails immediately.
 *
 *   Gate 2 [STABLE] — AgentPanel exists as its own independent component
 *     Regression guard: AgentPanel must not be deleted or merged into PropertiesPanel.
 *     The component must remain at its canonical path (Task #424 implementation).
 *
 * @see Guideline #410 — Panel Architecture (supersedes Guideline #380)
 * @see Task #424 — Panel Decomposition (Contribution #584)
 * @see Task #426 — Shared PanelHeader + draggable panels (Contribution #601)
 * @see src/admin/AdminLayout.tsx — renders LeftSidebar and independent overlays
 */

import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')

const PROPERTIES_PANEL_PATH = join(SRC_ROOT, 'admin/pages/site/panels/PropertiesPanel/PropertiesPanel.tsx')
const AGENT_PANEL_PATH      = join(SRC_ROOT, 'admin/pages/site/panels/AgentPanel/AgentPanel.tsx')

// ---------------------------------------------------------------------------
// Gate 1 [STABLE] — PropertiesPanel must NOT import AgentPanel
//
// Context: Guideline #380 (superseded) put AgentPanel inside PropertiesPanel as
// a tab. Guideline #410 keeps them in independent panel surfaces.
// This gate ensures the old tab-integration design does not creep back in.
//
// If this fails: someone has re-added an AgentPanel import to PropertiesPanel.
// Remove it — AgentPanel is rendered by LeftSidebar, not inside PropertiesPanel.
// ---------------------------------------------------------------------------

describe('[STABLE] Task #381 Gate 1 — PropertiesPanel does NOT import AgentPanel (Guideline #410)', () => {
  it('PropertiesPanel.tsx must exist', () => {
    if (!existsSync(PROPERTIES_PANEL_PATH)) {
      throw new Error(
        '[Task #381 Gate 1] PropertiesPanel.tsx not found.\n' +
        'Expected at: src/admin/pages/site/components/PropertiesPanel/PropertiesPanel.tsx\n\n' +
        'PropertiesPanel must exist as an independent floating inspector per Guideline #410.'
      )
    }
    expect(existsSync(PROPERTIES_PANEL_PATH)).toBe(true)
  })

  it('PropertiesPanel.tsx must NOT import AgentPanel (superseded tab-shell design)', () => {
    if (!existsSync(PROPERTIES_PANEL_PATH)) return // covered by previous test

    const src = readFileSync(PROPERTIES_PANEL_PATH, 'utf8')
    const importsAgentPanel = /import\s+.*AgentPanel/i.test(src)

    if (importsAgentPanel) {
      throw new Error(
        '[Task #381 Gate 1] PropertiesPanel.tsx imports AgentPanel — Guideline #410 violation.\n\n' +
        'The "Properties | AI" tablist pattern (Guideline #380) was superseded by\n' +
        'Guideline #410 (Task #424 — Panel Decomposition). AgentPanel is now an\n' +
        'independent left-sidebar panel, separate from PropertiesPanel.\n\n' +
        'Remove the AgentPanel import from PropertiesPanel and ensure it is only\n' +
        'rendered by the left-sidebar panel system.\n\n' +
        'See Guideline #410, Task #424 (Contribution #584).'
      )
    }
    expect(importsAgentPanel).toBe(false)
  })

  it('PropertiesPanel.tsx must NOT contain role="tablist" for a Properties/AI tab shell', () => {
    if (!existsSync(PROPERTIES_PANEL_PATH)) return

    const src = readFileSync(PROPERTIES_PANEL_PATH, 'utf8')

    // A Properties/AI outer tablist would indicate the superseded Guideline #380 design.
    // Check for role="tablist" near "AI" or "AgentPanel" references.
    // Note: the inner module/classes/advanced tablist in PropertiesPanel is legitimate;
    // this check specifically guards against an outer Properties/AI tab shell.
    const hasOuterAiTablist =
      // Check for tab element labelled "AI"
      /role\s*=\s*["']tab["'][^>]*>\s*AI/.test(src) ||
      />\s*AI\s*<\/[^>]+>[^>]*role\s*=\s*["']tab["']/.test(src) ||
      // Check for aria-controls pointing to an "ai" panel
      /aria-controls\s*=\s*["']panel-ai["']/.test(src) ||
      /id\s*=\s*["']tab-ai["']/.test(src)

    if (hasOuterAiTablist) {
      throw new Error(
        '[Task #381 Gate 1] PropertiesPanel.tsx contains an outer Properties/AI tablist.\n\n' +
        'This is the superseded Guideline #380 pattern. Under Guideline #410 (Task #424),\n' +
        'AgentPanel is an independent left-sidebar panel — NOT a tab inside PropertiesPanel.\n\n' +
        'Remove the outer tablist and render AgentPanel through LeftSidebar.\n\n' +
        'See Guideline #410, Task #424 (Contribution #584).'
      )
    }
    expect(hasOuterAiTablist).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Gate 2 [STABLE] — AgentPanel exists as its own independent component
//
// Context: AgentPanel must remain at its canonical path as a self-contained
// panel component. This gate guards against accidental deletion or merging
// of AgentPanel into PropertiesPanel.
//
// The component must:
//   - Exist at src/admin/pages/site/components/AgentPanel/AgentPanel.tsx
//   - Support the panel shell used by the left-sidebar architecture
//   - Use <PanelHeader> from shared/ (Task #426 architecture)
// ---------------------------------------------------------------------------

describe('[STABLE] Task #381 Gate 2 — AgentPanel exists as independent component (Guideline #410)', () => {
  it('AgentPanel.tsx must exist at its canonical path', () => {
    if (!existsSync(AGENT_PANEL_PATH)) {
      throw new Error(
        '[Task #381 Gate 2] AgentPanel.tsx not found.\n' +
        'Expected at: src/admin/pages/site/components/AgentPanel/AgentPanel.tsx\n\n' +
        'Per Guideline #410, AgentPanel is a self-contained independent panel.\n' +
        'It must not be deleted or merged into PropertiesPanel.\n\n' +
        'See Guideline #410, Task #424 (Contribution #584).'
      )
    }
    expect(existsSync(AGENT_PANEL_PATH)).toBe(true)
  })

  it('AgentPanel.tsx must import and use <PanelHeader from shared/ (Task #426 architecture)', () => {
    if (!existsSync(AGENT_PANEL_PATH)) return

    const src = readFileSync(AGENT_PANEL_PATH, 'utf8')
    const usesPanelHeader = /import\s+.*PanelHeader/.test(src) && src.includes('<PanelHeader')

    if (!usesPanelHeader) {
      throw new Error(
        '[Task #381 Gate 2] AgentPanel.tsx does not use the shared <PanelHeader> component.\n\n' +
        'Per Task #426 (Contribution #601), all floating panels must use the shared\n' +
        'PanelHeader component for consistent chrome (close button, drag handle, title).\n\n' +
        'Expected:\n' +
        "  import { PanelHeader } from '../shared/PanelHeader'\n" +
        '  // ... inside render:\n' +
        '  <PanelHeader panelId="agent" title="AI Assistant" onClose={...} />\n\n' +
        'See Task #426, Guideline #410.'
      )
    }
    expect(usesPanelHeader).toBe(true)
  })
})
