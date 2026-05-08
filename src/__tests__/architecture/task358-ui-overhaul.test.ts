/**
 * Architecture Gate Tests — Task #358: UI Overhaul
 *
 * Guards for the UI Overhaul directives (Task #358 / User directive #1532):
 *
 * 1. AdminLayout canvas-wrapper uses CSS-module `position: relative` (the containing block
 *    for absolutely-positioned overlay panels).
 *    Guideline #356: floating panels use `position: absolute` — they need a
 *    `position: relative` ancestor scoped to the canvas area, not the viewport.
 *
 * 2. No `min-h-[44px]` in editor Toolbar and panel controls.
 *    Guideline #357: editor chrome targets ≤28px control height.
 *    The user explicitly waived WCAG touch-target requirements for editor UI
 *    (message #1532). `min-h-[44px]` must be replaced with `h-7` (28px) or `h-6` (24px).
 *
 * Gates are pre-registered until Task #358 lands (detected by the
 * existence of `usePropertiesPanelAutoOpen.ts`).
 *
 * @see Task #358 — UI Overhaul (FSE: Full Stack Engineer)
 * @see Guideline #356 — Panel Visual Style — Floating Overlay (supersedes #213)
 * @see Guideline #357 — Editor UI Density — Compact Mode (amends #189)
 * @see Constraint #257 — No Hardcoded Hex Values in Component Files
 */

import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')

const EDITOR_LAYOUT_PATH = join(SRC_ROOT, 'admin/AdminLayout.tsx')

// Candidate paths for the usePropertiesPanelAutoOpen hook (Task #358 Deliverable 4)
const AUTO_OPEN_HOOK_CANDIDATES = [
  join(SRC_ROOT, 'admin/pages/site/panels/PropertiesPanel/usePropertiesPanelAutoOpen.ts'),
  join(SRC_ROOT, 'admin/pages/site/panels/PropertiesPanel/usePropertiesPanelAutoOpen.tsx'),
  join(SRC_ROOT, 'admin/pages/site/hooks/usePropertiesPanelAutoOpen.ts'),
  join(SRC_ROOT, 'admin/pages/site/hooks/usePropertiesPanelAutoOpen.tsx'),
]

// Task #358 is considered "landed" when the auto-open hook file exists.
// (It is one of the final deliverables — its existence implies the overlay
// panel redesign, token wiring, and compact density pass are complete.)
function isTask358Landed(): boolean {
  return AUTO_OPEN_HOOK_CANDIDATES.some(existsSync)
}
const TASK358_LANDED = isTask358Landed()

// Directories to scan for compact-density violations (Guideline #357).
// Excludes: SettingsModal (Phase 6, governed by Guideline #225),
//           AgentPanel (Phase D, separate density scope).
const COMPACT_DENSITY_DIRS = [
  join(SRC_ROOT, 'admin/pages/site/toolbar'),
  join(SRC_ROOT, 'admin/pages/site/panels/DomPanel'),
  join(SRC_ROOT, 'admin/pages/site/panels/PropertiesPanel'),
  join(SRC_ROOT, 'admin/pages/site/property-controls'),
]

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function collectTs(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...collectTs(full))
    } else if (['.ts', '.tsx'].includes(extname(entry))) {
      results.push(full)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Gate 1 — AdminLayout canvas-wrapper uses position:relative (Guideline #356)
//
// Floating overlay panels (DomPanel, PropertiesPanel) use:
//   position: absolute; top: 16px; left/right: 16px; z-index: 50
//
// For `position: absolute` to scope to the editor canvas area (and NOT the
// browser viewport), the nearest positioned ancestor must be the canvas-
// containing div. The CSS module class applied to that div must carry
// `position: relative`.
//
// Without this, panel overlays will escape the canvas area and overlap the
// browser chrome / app shell.
//
// Pre-registered until Task #358 lands (usePropertiesPanelAutoOpen.ts exists).
// ---------------------------------------------------------------------------

describe('Task #358 Gate 1 — AdminLayout canvas-wrapper must be position:relative (Guideline #356)', () => {
  it('[pre-registered] The canvas-containing div in AdminLayout must use a CSS module class with position:relative', () => {
    if (!TASK358_LANDED) {
      console.log(
        '[Task358 gate] Task #358 not yet landed — ' +
        'AdminLayout position:relative containing-block gate pre-registered (Guideline #356)'
      )
      expect(true).toBe(true)
      return
    }

    if (!existsSync(EDITOR_LAYOUT_PATH)) {
      throw new Error(
        '[Task #358 / Guideline #356] AdminLayout.tsx not found.\n' +
        'Expected at: ' + EDITOR_LAYOUT_PATH.replace(SRC_ROOT, 'src/')
      )
    }

    const src = readFileSync(EDITOR_LAYOUT_PATH, 'utf8')
    const css = readFileSync(join(SRC_ROOT, 'admin/AdminLayout.module.css'), 'utf8')

    const usesCanvasStageClass = /className=\{cn\(styles\.canvasStage/.test(src)
    const canvasStageBlock = css.match(/\.canvasStage\s*\{[^}]*\}/)?.[0] ?? ''
    const hasRelativePosition = /position:\s*relative\s*;/.test(canvasStageBlock)

    if (!usesCanvasStageClass || !hasRelativePosition) {
      throw new Error(
        '[Task #358 / Guideline #356] AdminLayout.tsx canvas-wrapper does not have position:relative.\n' +
        'Floating panels use `position: absolute` for overlay positioning.\n' +
        'Without a `position: relative` ancestor, they escape the canvas area and overlay browser chrome.\n' +
        '\n' +
        'Required change to AdminLayout.tsx:\n' +
        'Required pattern: AdminLayout applies styles.canvasStage and AdminLayout.module.css defines\n' +
        '`.canvasStage { position: relative; }`.\n' +
        'See Guideline #356 — Panel Visual Style, Task #358 Deliverable 6.'
      )
    }

    expect(usesCanvasStageClass).toBe(true)
    expect(hasRelativePosition).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Gate 2 — No min-h-[44px] in editor Toolbar and panel controls (Guideline #357)
//
// User directive (message #1532): "I really don't care about WCAG … we really
// need to have smaller and cleaner elements. We cannot have these huge ass buttons!"
//
// Guideline #357 amends Guideline #189 for editor chrome:
//   - Toolbar buttons: h-7 (28px)
//   - Icon-only buttons: h-6 (24px)
//   - Input controls in panels: h-6 (24px)
//
// `min-h-[44px]` was the WCAG 2.1 AA touch-target minimum — it is explicitly
// waived for editor chrome. After Task #358, no toolbar or panel control file
// should contain this class.
//
// Scoped to: Toolbar, DomPanel, PropertiesPanel, PropertyControls.
// Excludes:  SettingsModal (Guideline #225 governs modal a11y separately),
//            AgentPanel (Phase D, separate scope).
//
// Pre-registered until Task #358 lands.
// ---------------------------------------------------------------------------

describe('Task #358 Gate 2 — No min-h-[44px] in editor Toolbar / panel controls (Guideline #357)', () => {
  it('[pre-registered] Editor control files must not use min-h-[44px] (compact density required)', () => {
    if (!TASK358_LANDED) {
      console.log(
        '[Task358 gate] Task #358 not yet landed — ' +
        'compact density min-h-[44px] gate pre-registered (Guideline #357 / Task #358 Deliverable 5)'
      )
      expect(true).toBe(true)
      return
    }

    const MIN_H_44_RE = /\bmin-h-\[44px\]/

    const violations: string[] = []

    for (const dir of COMPACT_DENSITY_DIRS) {
      for (const file of collectTs(dir)) {
        let src: string
        try { src = readFileSync(file, 'utf8') } catch { continue }

        if (!MIN_H_44_RE.test(src)) continue

        const lines = src.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          // Skip comments
          if (/^\s*\/\//.test(line)) continue
          if (MIN_H_44_RE.test(line)) {
            violations.push(
              `${file.replace(SRC_ROOT, 'src/')}:${i + 1} — ` +
              'min-h-[44px] must be replaced with h-7 (toolbar: 28px) or h-6 (icon: 24px)'
            )
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        '[Task #358 / Guideline #357] min-h-[44px] found in editor Toolbar/panel control files.\n' +
        'User directive #1532 relaxes WCAG touch-target requirements for editor chrome.\n' +
        'All toolbar buttons must be ≤28px height; icon-only buttons must be ≤24px.\n' +
        '\n' +
        'Replacements:\n' +
        '  min-h-[44px]  →  h-7        (toolbar action buttons, 28px)\n' +
        '  min-h-[44px]  →  h-6 w-6    (icon-only buttons, 24px)\n' +
        '  p-3 / p-4     →  px-2 py-1  (toolbar button padding)\n' +
        '\n' +
        'See Guideline #357 — Editor UI Density — Compact Mode, Task #358 Deliverable 5.\n' +
        'Violations:\n' +
        violations.map((v) => `  ${v}`).join('\n')
      )
    }

    expect(violations).toHaveLength(0)
  })
})
