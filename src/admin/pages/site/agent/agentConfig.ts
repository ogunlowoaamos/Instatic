/**
 * Agent network configuration.
 *
 * Centralises the Vite proxy path so that agentSlice.ts, vite.config.ts, and
 * any future transport adapters all reference one authoritative constant rather
 * than scattered string literals.
 *
 * Phase 8 note: when the Convex backend is added this constant (or a companion
 * export) should be updated to reflect the production endpoint, keeping the
 * transport layer decoupled from the state slice.
 *
 * The endpoints live under `/admin/api/agent` so the session cookie (scoped
 * to `Path=/admin` for cookie-isolation from the public site) is sent by
 * the browser. Outside `/admin`, the cookie wouldn't be carried and the
 * `requireCapability('pages.edit')` gate would 401 every request.
 *
 * @see Constraint #385 — No API key / endpoint configuration required (ambient credentials)
 */

/** Vite dev-proxy path for the agent API. The proxy forwards to the local Bun server. */
export const AGENT_API_PATH = '/admin/api/agent' as const

/**
 * Browser-bridge response endpoint. The browser POSTs `{ bridgeId, requestId,
 * result }` here after applying a write tool against the editor store; the
 * server resolves the in-flight MCP tool-call promise so Claude receives the
 * tool_result and continues the agent loop.
 */
export const AGENT_TOOL_RESULT_PATH = '/admin/api/agent/tool-result' as const
