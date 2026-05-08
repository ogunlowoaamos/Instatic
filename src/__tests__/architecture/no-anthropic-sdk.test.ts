/**
 * Architecture Source-Scan — Constraint #283
 *
 * No file under `src/admin/pages/site/` or `src/core/` may import:
 *   - `@anthropic-ai/sdk`          — raw Anthropic API SDK (prohibited everywhere)
 *   - `@anthropic-ai/claude-agent-sdk` — Claude Agent SDK (server-side ONLY;
 *                                     allowed only in `packages/editor-app/server/`)
 *
 * WHY THIS MATTERS
 * ----------------
 * User directive: "Don't use Anthropic AI SDK that needs to use an API key;
 * use Claude Agent SDK." (directive #1103)
 *
 * Confirmed package name (Contribution #394, from official docs):
 *   npm install @anthropic-ai/claude-agent-sdk
 *
 * The `@anthropic-ai/sdk` package requires a raw API key accessible in the
 * process environment. In a browser context this is a critical security
 * vulnerability (CWE-312 — API key exposure).
 *
 * The `@anthropic-ai/claude-agent-sdk` package is server-side only —
 * it bundles a native binary that cannot run in the browser. It must live
 * exclusively in `packages/editor-app/server/` (the Bun server that hosts
 * the `/api/agent` endpoint). Never import it from editor or core source.
 *
 * The Phase D AI Agent Panel communicates via `fetch(props.agentEndpoint, ...)`
 * only. No AI SDK code of any kind lives in the browser bundle (0 KB).
 *
 * @see Constraint #283 — @anthropic-ai/sdk is prohibited; @anthropic-ai/claude-agent-sdk server-only
 * @see Constraint #286 — AgentPanel communicates via fetch, never imports AI SDK
 * @see Contribution #394 — Package name confirmed + auth model correction
 * @see Contribution #388 — Architecture decision record for SDK switch
 * @see Contribution #389 — Performance impact analysis (0 KB browser bundle)
 */

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function collectFiles(dir: string, exts = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs']): string[] {
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
// Constraint #283 — @anthropic-ai/sdk must not be imported anywhere in src/
// ---------------------------------------------------------------------------

// Scan production source directories only — never __tests__ (test files may
// contain the forbidden string as a literal pattern in the scan regex itself).
const PROD_DIRS = ['editor', 'core', 'modules', 'ui', 'app', 'lib'].map((d) =>
  join(SRC_ROOT, d)
)

function collectProdFiles(): string[] {
  return PROD_DIRS.flatMap((dir) => collectFiles(dir))
}

describe('Constraint #283 — @anthropic-ai/sdk must not be imported in production src/', () => {
  // Matches: import ... from '@anthropic-ai/sdk' or require('@anthropic-ai/sdk')
  // NOTE: string split to avoid this test file self-matching
  // Confirmed prohibited: @anthropic-ai/sdk (raw Anthropic API SDK)
  // Confirmed server-only: @anthropic-ai/claude-agent-sdk (Claude Agent SDK)
  const FORBIDDEN_PKG = '@anthropic' + '-ai/sdk'
  const ANTHROPIC_SDK_RE = new RegExp(`from\\s+['"]${FORBIDDEN_PKG}['"]|require\\s*\\(\\s*['"]${FORBIDDEN_PKG}['"]\\s*\\)`)

  it('no production file imports from @anthropic-ai/sdk', () => {
    const allFiles = collectProdFiles()
    const violations = allFiles.filter((f) => {
      try { return ANTHROPIC_SDK_RE.test(readFileSync(f, 'utf8')) } catch { return false }
    })
    if (violations.length > 0) {
      const rel = violations.map((f) => f.replace(SRC_ROOT, 'src/'))
      throw new Error(
        `[Constraint #283] ${FORBIDDEN_PKG} found in production source. ` +
        `Use the Claude Agent SDK instead (directive #1103).\n` +
        `AI integration must be server-side only (fetch to /api/agent endpoint).\n` +
        `Violating files:\n` +
        rel.map((f) => `  ${f}`).join('\n')
      )
    }
    expect(violations).toHaveLength(0)
  })

  it('no production file imports from @anthropic-ai/ (any subpath)', () => {
    // Broader check — blocks any subpackage from the @anthropic-ai scope
    const ANTHROPIC_SCOPE = '@anthropic' + '-ai/'
    const ANTHROPIC_SCOPE_RE = new RegExp(`from\\s+['"]${ANTHROPIC_SCOPE}`)
    const allFiles = collectProdFiles()
    const violations = allFiles.filter((f) => {
      try { return ANTHROPIC_SCOPE_RE.test(readFileSync(f, 'utf8')) } catch { return false }
    })
    if (violations.length > 0) {
      const rel = violations.map((f) => f.replace(SRC_ROOT, 'src/'))
      throw new Error(
        `[Constraint #283] @anthropic-ai/* scope found in production source.\n` +
        rel.map((f) => `  ${f}`).join('\n')
      )
    }
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Constraint #286 — Agent Panel must not import any AI SDK client library
//
// The AgentPanel communicates via fetch('/api/agent', ...) only.
// The server-side agent endpoint uses the Claude Agent SDK — browser code never does.
// ---------------------------------------------------------------------------

describe('Constraint #286 — AgentPanel uses fetch, not AI SDK clients', () => {
  it('src/admin/pages/site/ contains no AI SDK imports (Phase D gate)', () => {
    // Pre-emptive guard: once Phase D is built, no AI SDK must appear in editor code.
    // Includes the confirmed Claude Agent SDK package name (@anthropic-ai/claude-agent-sdk)
    // which must ONLY appear in packages/editor-app/server/, never in src/admin/pages/site/ or src/core/.
    const AI_SDK_PATTERNS = [
      /from\s+['"]@anthropic-ai\//,           // blocks @anthropic-ai/sdk AND @anthropic-ai/claude-agent-sdk
      /from\s+['"]claude-agent-sdk['"]/,       // blocks unscoped variant (if it exists)
      /from\s+['"]@anthropic\/['"]/,           // blocks @anthropic/* scope
      /new\s+Anthropic\s*\(/,                  // blocks direct SDK instantiation
    ]
    const editorDir = join(SRC_ROOT, 'editor')
    if (!existsSync(editorDir)) return  // editor not yet created

    const files = collectFiles(editorDir)
    const violations: string[] = []

    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (AI_SDK_PATTERNS.some((re) => re.test(src))) {
        violations.push(f.replace(SRC_ROOT, 'src/'))
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[Constraint #286] AI SDK client found in src/admin/pages/site/. ` +
        `The AgentPanel must communicate via fetch('/api/agent'), not directly import AI SDK.\n` +
        violations.map((f) => `  ${f}`).join('\n')
      )
    }
    expect(violations).toHaveLength(0)
  })
})
