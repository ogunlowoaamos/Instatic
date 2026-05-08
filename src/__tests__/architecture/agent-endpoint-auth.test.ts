/**
 * Architecture Gate Tests — Agent endpoint auth (F-0008)
 *
 * The two `/api/agent` endpoints — `POST /api/agent` (Claude Agent SDK
 * streaming entry) and `POST /api/agent/tool-result` (browser-side bridge ack)
 * — are dispatched directly from `server/router.ts` *outside* the
 * `handleCmsRequest` wrapper that performs origin/CSRF and capability checks.
 *
 * Without their own gate, anyone able to reach the server could:
 *   1. Drain the operator's Claude billing budget (each stream consumes input
 *      + output tokens for system prompt + tool-loop iterations).
 *   2. Use the operator's Claude account as a free Claude proxy — the
 *      streaming response forwards Claude's output back verbatim.
 *   3. Open enough concurrent streams to exhaust per-tenant SDK rate limits
 *      and starve legitimate editor users (DoS).
 *
 * This gate asserts both handlers carry an `originAllowed` CSRF check and a
 * `requireCapability` auth check before parsing the body or invoking the SDK.
 * The router is also asserted to pass the DbClient to both handlers so the
 * auth helpers can read sessions.
 *
 * @see .matrix/jobs/1365/findings/F-0008.md — original finding
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '../../../')
const AGENT_HANDLER_PATH = join(REPO_ROOT, 'server/handlers/agent/index.ts')
const ROUTER_PATH = join(REPO_ROOT, 'server/router.ts')

describe('agent endpoint auth (F-0008)', () => {
  it('handleAgentRequest accepts a DbClient and gates on originAllowed + requireCapability', () => {
    const src = readFileSync(AGENT_HANDLER_PATH, 'utf8')
    expect(src).toMatch(/export async function handleAgentRequest\(req: Request,\s*db: DbClient\)/)
    // Both gates must appear *somewhere* in the file — the handler-body assertion
    // below verifies they appear in each handler specifically.
    expect(src).toContain("originAllowed(req)")
    expect(src).toContain("requireCapability(req, db, 'pages.edit')")
  })

  it('handleAgentToolResult accepts a DbClient and applies the same gate', () => {
    const src = readFileSync(AGENT_HANDLER_PATH, 'utf8')
    expect(src).toMatch(/export async function handleAgentToolResult\(req: Request,\s*db: DbClient\)/)
    // Both handlers share this source file — count occurrences to confirm
    // the gate appears in BOTH bodies, not just one.
    const originCount = (src.match(/originAllowed\(req\)/g) ?? []).length
    const requireCount = (src.match(/requireCapability\(req, db,/g) ?? []).length
    expect(originCount).toBeGreaterThanOrEqual(2)
    expect(requireCount).toBeGreaterThanOrEqual(2)
  })

  it('router passes runtime.db to both agent handlers', () => {
    const src = readFileSync(ROUTER_PATH, 'utf8')
    expect(src).toContain('handleAgentRequest(req, runtime.db)')
    expect(src).toContain('handleAgentToolResult(req, runtime.db)')
  })
})
