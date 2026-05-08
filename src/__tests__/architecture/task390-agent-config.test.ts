/**
 * Architecture Gate Tests — Task #390: Extract hardcoded `/api/agent` route
 *
 * Tech debt: `agentSlice.ts` currently contains the network route as an inline
 * string literal:
 *
 *   const endpoint = '/api/agent'   // line 138 in sendAgentMessage()
 *
 * A Zustand store slice should not own a transport-layer constant. When Phase 8
 * (Convex backend) adds a second HTTP surface, the agent path needs to be a
 * named constant so refactors propagate cleanly, not found by string-searching.
 *
 * ─── Gate 1 — agentConfig.ts exports AGENT_API_PATH (Adaptive-skip) ──────────
 * When `src/admin/pages/site/agent/agentConfig.ts` is created, verifies that it exports a
 * const named `AGENT_API_PATH`. This constant is the single source of truth for
 * the `/api/agent` Vite-proxy path.
 *
 * Activation signal: `src/admin/pages/site/agent/agentConfig.ts` exists on disk.
 *
 * ─── Gate 2 — agentSlice.ts must not contain the hardcoded route (Adaptive-skip)
 * When `src/admin/pages/site/agent/agentConfig.ts` exists, verifies that `agentSlice.ts`
 * no longer contains `'/api/agent'` or `"/api/agent"` as a raw string literal —
 * meaning the slice has been updated to import from `agentConfig.ts`.
 *
 * Activation signal: `src/admin/pages/site/agent/agentConfig.ts` exists on disk.
 *
 * Both gates are pre-registered (adaptive-skip). They pass as no-ops today and
 * activate only when FSE lands the fix. The suite stays green throughout.
 *
 * @see Task #390 — Tech Debt: Extract hardcoded `/api/agent` route from `agentSlice.ts`
 * @see Architect review of Contribution #554 — requested this extraction
 * @see src/core/agent/agentSlice.ts — line 138 (`const endpoint = '/api/agent'`)
 */

import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')
const AGENT_CONFIG_PATH = join(SRC_ROOT, 'admin/pages/site/agent/agentConfig.ts')
const AGENT_SLICE_PATH = join(SRC_ROOT, 'admin/pages/site/agent/agentSlice.ts')

// ---------------------------------------------------------------------------
// Gate 1 — agentConfig.ts must export AGENT_API_PATH (Adaptive-skip)
//
// Context: Task #390 — once agentConfig.ts is created, it must export the
// route constant so it can be imported by agentSlice.ts and (optionally)
// referenced in comments/docs in vite.config.ts.
//
// Required shape:
//   export const AGENT_API_PATH = '/api/agent' as const;
//
// The `as const` assertion ensures the type is the narrow literal
// `'/api/agent'` rather than `string`, giving callers type-safe route names.
//
// Activates when src/core/agent/agentConfig.ts exists on disk.
// ---------------------------------------------------------------------------

describe(
  'Task #390 Gate 1 — agentConfig.ts must export AGENT_API_PATH const (Task #390)',
  () => {
    it(
      '[pre-registered] agentConfig.ts must export AGENT_API_PATH as a named const (Task #390 / Architect review of #554)',
      () => {
        if (!existsSync(AGENT_CONFIG_PATH)) {
          console.log(
            '[Task390 gate] src/core/agent/agentConfig.ts not yet created — ' +
              'AGENT_API_PATH export gate pre-registered ' +
              '(Task #390 / Architect review of Contribution #554)'
          )
          expect(true).toBe(true)
          return
        }

        const src = readFileSync(AGENT_CONFIG_PATH, 'utf8')

        // Accept: `export const AGENT_API_PATH = ...`
        //         `export const AGENT_API_PATH: string = ...`
        const hasExport =
          /export\s+const\s+AGENT_API_PATH\s*[=:]/.test(src) ||
          /export\s*\{\s*AGENT_API_PATH\s*\}/.test(src)

        if (!hasExport) {
          throw new Error(
            '[Task #390] `AGENT_API_PATH` export not found in agentConfig.ts.\n\n' +
              'agentConfig.ts must export the Vite-proxy route constant so that\n' +
              'agentSlice.ts and future consumers can import it instead of\n' +
              'hardcoding the route string:\n\n' +
              "  // src/core/agent/agentConfig.ts\n" +
              "  export const AGENT_API_PATH = '/api/agent' as const;\n\n" +
              'The `as const` assertion narrows the type from `string` to\n' +
              "the literal `'/api/agent'`, providing type safety at call sites.\n\n" +
              'See Task #390, Architect review of Contribution #554.'
          )
        }

        expect(hasExport).toBe(true)
      }
    )
  }
)

// ---------------------------------------------------------------------------
// Gate 2 — agentSlice.ts must not contain the hardcoded `/api/agent` literal
// (Adaptive-skip)
//
// Context: Task #390 — after agentConfig.ts is created and AGENT_API_PATH is
// exported, agentSlice.ts must be updated to import and use it rather than
// embedding the route as a string literal.
//
// Currently (before fix):
//   const endpoint = '/api/agent'   ← must be replaced
//
// After fix:
//   import { AGENT_API_PATH } from './agentConfig'
//   const endpoint = AGENT_API_PATH  ← imports from single source of truth
//
// Activation signal: src/core/agent/agentConfig.ts exists (implies the
// refactor was started — now check it was completed in agentSlice.ts too).
// ---------------------------------------------------------------------------

describe(
  'Task #390 Gate 2 — agentSlice.ts must not contain hardcoded `/api/agent` string literal',
  () => {
    it(
      '[pre-registered] agentSlice.ts must import AGENT_API_PATH from agentConfig rather than hardcode the route (Task #390)',
      () => {
        if (!existsSync(AGENT_CONFIG_PATH)) {
          console.log(
            '[Task390 gate] src/core/agent/agentConfig.ts not yet created — ' +
              "hardcoded '/api/agent' gate pre-registered " +
              '(Task #390 / Architect review of Contribution #554)'
          )
          expect(true).toBe(true)
          return
        }

        if (!existsSync(AGENT_SLICE_PATH)) {
          console.log(
            '[Task390 gate] agentSlice.ts not found — gate skipped'
          )
          expect(true).toBe(true)
          return
        }

        const src = readFileSync(AGENT_SLICE_PATH, 'utf8')

        // The raw string literal '/api/agent' or "/api/agent" must not appear
        // in agentSlice.ts once agentConfig.ts exists (the slice must use the import).
        //
        // We intentionally only check for the string in context of assignment or
        // fetch call — avoids false positives from comments.
        //
        // Pattern: the literal appears as a value (quoted string, not just in a comment)
        const hasHardcodedRoute =
          /(?:=\s*['"`]\/api\/agent['"`]|fetch\s*\(\s*['"`]\/api\/agent['"`])/.test(src)

        if (hasHardcodedRoute) {
          throw new Error(
            "[Task #390] agentSlice.ts still contains the hardcoded `'/api/agent'` string literal.\n\n" +
              'Once agentConfig.ts exists, agentSlice.ts must import AGENT_API_PATH\n' +
              'from it instead of embedding the route as an inline string.\n\n' +
              'Required change in agentSlice.ts:\n\n' +
              "  // ❌ Before (tech debt):\n" +
              "  const endpoint = '/api/agent'\n\n" +
              "  // ✅ After (Task #390 fix):\n" +
              "  import { AGENT_API_PATH } from './agentConfig'\n" +
              '  ...\n' +
              '  const endpoint = AGENT_API_PATH\n\n' +
              'Why this matters: Phase 8 (Convex backend) will add a second HTTP\n' +
              'surface. Named constants for network routes let changes propagate\n' +
              'cleanly without requiring grep-based string replacement.\n\n' +
              'See Task #390, Architect review of Contribution #554.'
          )
        }

        expect(hasHardcodedRoute).toBe(false)
      }
    )
  }
)
