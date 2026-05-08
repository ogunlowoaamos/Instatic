/**
 * Architecture Source-Scan — Constraint #275
 *
 * No file under the visual editor (`src/admin/pages/site/`) or `src/core/` may
 * import from a router — neither `react-router-dom` (legacy) nor the in-house
 * `@admin/lib/routing` (under `src/admin/lib/routing/`).
 *
 * WHY THIS MATTERS
 * ----------------
 * The editor is being prepared for Phase F (embeddable npm package).
 * When `<PageBuilder />` is embedded in a host React app, the host app owns the
 * router. The editor MUST NOT import or depend on routing internally — it would
 * conflict with the host app's router and break nested routing.
 *
 * In the current standalone app, routing lives in the admin shell
 * (`src/admin/{router,AdminEntry,lib/routing}.tsx`). The site page itself
 * (`src/admin/pages/site/`) and core logic (`src/core/`) must be completely
 * router-agnostic.
 *
 * @see Constraint #275 — Editor components must not import a router
 * @see Task #274 — Phase F: Embeddable Editor npm Package
 * @see Contribution #386 — Phase F architecture spec
 */

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')

// ---------------------------------------------------------------------------
// File walker — recursively collect all .ts/.tsx files under a directory
// ---------------------------------------------------------------------------

function collectFiles(dir: string, exts = ['.ts', '.tsx']): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, exts))
    } else if (exts.includes(extname(entry))) {
      results.push(full)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Constraint #275 — no react-router-dom in editor/ or core/
// ---------------------------------------------------------------------------

describe('Constraint #275 — routers must not be imported in site page/, core/, or modules/', () => {
  // Catches both the legacy `react-router-dom` import and any alias-based
  // import of the in-house admin router (`@admin/lib/routing`).
  const ROUTER_IMPORT_RE = /from\s+['"](?:react-router-dom|@admin\/lib\/routing|(?:[./]+)admin\/lib\/routing)['"]/

  it('no file in src/admin/pages/site/ imports a router', () => {
    const editorFiles = collectFiles(join(SRC_ROOT, 'admin/pages/site'))
    const violations = editorFiles.filter((f) =>
      ROUTER_IMPORT_RE.test(readFileSync(f, 'utf8'))
    )
    if (violations.length > 0) {
      const rel = violations.map((f) => f.replace(SRC_ROOT, 'src/'))
      throw new Error(
        `[Constraint #275] router import found in site page/ — keep routing in the admin shell:\n` +
        rel.map((f) => `  ${f}`).join('\n')
      )
    }
    expect(violations).toHaveLength(0)
  })

  it('no file in src/core/ imports a router', () => {
    const coreFiles = collectFiles(join(SRC_ROOT, 'core'))
    const violations = coreFiles.filter((f) =>
      ROUTER_IMPORT_RE.test(readFileSync(f, 'utf8'))
    )
    if (violations.length > 0) {
      const rel = violations.map((f) => f.replace(SRC_ROOT, 'src/'))
      throw new Error(
        `[Constraint #275] router import found in core/ — routing must not leak into core logic:\n` +
        rel.map((f) => `  ${f}`).join('\n')
      )
    }
    expect(violations).toHaveLength(0)
  })

  it('no file in src/modules/ imports a router', () => {
    const modulesFiles = collectFiles(join(SRC_ROOT, 'modules'))
    const violations = modulesFiles.filter((f) =>
      ROUTER_IMPORT_RE.test(readFileSync(f, 'utf8'))
    )
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Constraint #271 — astro-publisher/ must not import from html publisher or editor
// (will be enforced when the astro-publisher directory is created in Phase E)
// ---------------------------------------------------------------------------

describe('Constraint #271 — astro-publisher isolation (Phase E gate)', () => {
  it('src/core/astro-publisher/ does not exist yet — Phase E not started', () => {
    // When Phase E is claimed, this test will be replaced with the real isolation scan.
    // For now it just documents the constraint on the board.
    const astroPubDir = join(SRC_ROOT, 'core/astro-publisher')
    if (existsSync(astroPubDir)) {
      // Phase E has started — enforce isolation
      const FORBIDDEN_IMPORT_RE = /from\s+['"][^'"]*(?:core\/publisher|src\/admin\/pages\/site|src\/app)/
      const files = collectFiles(astroPubDir)
      const violations = files.filter((f) =>
        FORBIDDEN_IMPORT_RE.test(readFileSync(f, 'utf8'))
      )
      if (violations.length > 0) {
        const rel = violations.map((f) => f.replace(SRC_ROOT, 'src/'))
        throw new Error(
          `[Constraint #271] astro-publisher imports from forbidden paths:\n` +
          rel.map((f) => `  ${f}`).join('\n')
        )
      }
      expect(violations).toHaveLength(0)
    } else {
      // Phase E not started — constraint is pre-registered but not enforced yet
      expect(existsSync(astroPubDir)).toBe(false)
    }
  })
})
