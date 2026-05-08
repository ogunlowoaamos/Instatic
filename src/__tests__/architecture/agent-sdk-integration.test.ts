/**
 * Architecture Gate Tests — Agent SDK Integration (Constraint #385)
 *
 * These gates document the incomplete Claude Agent SDK integration in
 * `agentSlice.ts`. The current code contains a stub that injects an assistant
 * chat message telling users to "Set VITE_AGENT_ENDPOINT in .env.local" when
 * no endpoint is provided — this is the confusing UI the user reported in
 * message #1646.
 *
 * Per Constraint #385 and user directive (message #1603), the standalone editor
 * authenticates via Claude Code local credentials — no API key, no endpoint URL,
 * no env var required.
 *
 * ─── Gate 1 — No `VITE_AGENT_ENDPOINT` stub in `agentSlice.ts` ─────────────
 * Asserts that `agentSlice.ts` does NOT reference `VITE_AGENT_ENDPOINT`.
 * Currently FAILING — the stub code at line ~138 suggests this env var to users.
 *
 * ─── Gate 2 — No "integration is in progress" stub message ──────────────────
 * Asserts that `agentSlice.ts` does NOT contain the stub fallback message
 * "Claude Agent SDK integration is in progress…".
 * Currently FAILING — this message is being injected as a chat bubble.
 *
 * ─── Required fix ─────────────────────────────────────────────────────────────
 * Replace the `if (!endpoint) { inject stub message }` branch in
 * `sendAgentMessage()` with a real Claude Agent SDK call using local
 * Claude Code credentials (Constraint #385). The endpoint prop may remain as an
 * optional override for custom server deployments, but absent-endpoint must
 * trigger the SDK path — not a user-visible error message.
 *
 * @see Constraint #385 — Standalone Editor: AgentPanel Uses Claude Code Local Credentials
 * @see Architect message #1649 — Root cause diagnosis (Q1, Q2, Q3)
 * @see User message #1646 — User-reported confusing VITE_AGENT_ENDPOINT prompt
 * @see no-anthropic-sdk.test.ts — SDK import gate (applies while stub is in place)
 */

import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')
const AGENT_SLICE_PATH = join(SRC_ROOT, 'admin/pages/site/agent/agentSlice.ts')

// ---------------------------------------------------------------------------
// Gate 1 — agentSlice.ts must NOT reference VITE_AGENT_ENDPOINT
//
// Context: Constraint #385 — standalone editor uses Claude Code local
// credentials. No env var configuration should be needed or suggested.
//
// Root cause (Architect message #1649):
//   EditorLayout.tsx reads `import.meta.env.VITE_AGENT_ENDPOINT` and passes
//   it to PropertiesPanel → AgentPanel → sendAgentMessage(content, endpoint).
//   When the env var is unset, `endpoint` is `undefined` and the stub branch
//   fires, injecting a confusing assistant chat message.
//
// This gate asserts the stub branch has been replaced with real SDK code.
// It will FAIL immediately against the current implementation.
// ---------------------------------------------------------------------------

describe(
  'Agent SDK Gate 1 — agentSlice must not reference VITE_AGENT_ENDPOINT (Constraint #385)',
  () => {
    it(
      '[FAILING] agentSlice.ts must not contain VITE_AGENT_ENDPOINT — standalone editor uses local credentials (Constraint #385 / Architect #1649)',
      () => {
        if (!existsSync(AGENT_SLICE_PATH)) {
          console.log(
            '[AgentSDK gate] agentSlice.ts not found — ' +
              'VITE_AGENT_ENDPOINT stub gate pre-registered (Constraint #385)'
          )
          expect(true).toBe(true)
          return
        }

        const src = readFileSync(AGENT_SLICE_PATH, 'utf8')

        if (src.includes('VITE_AGENT_ENDPOINT')) {
          throw new Error(
            '[Constraint #385 / Architect #1649] agentSlice.ts references VITE_AGENT_ENDPOINT.\n\n' +
              'The standalone editor does not require an agent endpoint — it authenticates\n' +
              'via Claude Code local credentials (user directive #1603, Constraint #385).\n\n' +
              'The stub code at agentSlice.ts ~line 138 injects an assistant message\n' +
              'telling users to "Set VITE_AGENT_ENDPOINT in .env.local". This is the\n' +
              'confusing message reported by the user in message #1646.\n\n' +
              'Required fix:\n' +
              '  • Remove the `if (!endpoint) { inject stub message }` branch from\n' +
              '    sendAgentMessage() in agentSlice.ts\n' +
              '  • Replace with a real Claude Agent SDK call using local credentials\n' +
              '  • Absent `endpoint` means "use SDK directly" — not "show error to user"\n\n' +
              'The `endpoint` prop may remain as an optional override for custom server\n' +
              'deployments (comment in EditorLayout.tsx is correct about that use case),\n' +
              'but it must never gate SDK availability in the standalone editor.\n\n' +
              'See Constraint #385, user directive #1603, Architect message #1649, user message #1646.'
          )
        }

        expect(src).not.toContain('VITE_AGENT_ENDPOINT')
      }
    )
  }
)

// ---------------------------------------------------------------------------
// Gate 2 — agentSlice.ts must NOT contain the "integration is in progress" stub
//
// The stub injects this assistant message when no endpoint is configured:
//   "Claude Agent SDK integration is in progress. Set VITE_AGENT_ENDPOINT
//    in .env.local to connect to an agent server, or the local SDK path will
//    be wired in the next update."
//
// This message:
//   1. Contradicts Constraint #385 (no endpoint needed)
//   2. Leaks an implementation detail ("wired in the next update") to users
//   3. Is factually wrong — the SDK integration IS the next step, not indefinite
//
// This gate will FAIL immediately against the current implementation.
// ---------------------------------------------------------------------------

describe(
  'Agent SDK Gate 2 — agentSlice must not contain "integration is in progress" stub message (Constraint #385)',
  () => {
    it(
      '[FAILING] agentSlice.ts must not inject the stub "integration is in progress" chat message (Architect #1649)',
      () => {
        if (!existsSync(AGENT_SLICE_PATH)) {
          console.log(
            '[AgentSDK gate] agentSlice.ts not found — ' +
              'stub message gate pre-registered (Constraint #385 / Architect #1649)'
          )
          expect(true).toBe(true)
          return
        }

        const src = readFileSync(AGENT_SLICE_PATH, 'utf8')

        // Match the exact stub text injected into the chat (lines 151–153 in agentSlice.ts)
        const stubMessagePattern = /integration is in progress/i

        if (stubMessagePattern.test(src)) {
          throw new Error(
            '[Constraint #385 / Architect #1649] agentSlice.ts contains the stub message:\n' +
              '  "Claude Agent SDK integration is in progress. Set VITE_AGENT_ENDPOINT…"\n\n' +
              'This message is injected as an assistant chat bubble when `endpoint` is\n' +
              'undefined — causing the confusing UI the user reported in message #1646.\n\n' +
              'Root cause (Architect message #1649): EditorLayout reads VITE_AGENT_ENDPOINT,\n' +
              'passes it as `agentEndpoint` to PropertiesPanel → AgentPanel → sendAgentMessage.\n' +
              'When the env var is unset (normal standalone usage), endpoint is undefined\n' +
              'and the stub fires every time the user sends a message.\n\n' +
              'Required fix:\n' +
              '  • Delete the stub branch in sendAgentMessage() at agentSlice.ts ~line 138:\n' +
              '      if (!endpoint) { /* inject stub message */ return }  ← REMOVE THIS\n' +
              '  • Replace with a real Claude Agent SDK call\n' +
              '  • Absent endpoint = use SDK directly (Constraint #385)\n\n' +
              'See Constraint #385, Architect message #1649, user message #1646.'
          )
        }

        expect(stubMessagePattern.test(src)).toBe(false)
      }
    )
  }
)
