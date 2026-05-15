/**
 * Auth-adjacent security helpers — request-side concerns that don't fit
 * inside the auth.ts crypto/session module.
 *
 *   - `isStateChangingMethod`  — POST/PUT/PATCH/DELETE
 *   - `expectedOrigin`         — what the request's Origin *should* be,
 *                                accounting for the X-Forwarded-* headers
 *                                that Caddy sets in compose.tls.yml.
 *   - `originAllowed`          — true when the request's Origin matches the
 *                                expected origin, or is on the dev allowlist.
 *   - `clientIp`               — the forwarded client IP from the proxy, or
 *                                the socket peer address stamped by the
 *                                Bun.serve fetch boundary.
 *   - `stampSocketIp`          — called once at the Bun.serve boundary; strips
 *                                any inbound spoof of the synthetic header
 *                                and stamps the real socket peer address so
 *                                `clientIp` has a non-proxy fallback.
 *
 * Used by handlers.ts for CSRF defense-in-depth and by the login endpoint
 * for rate limiting.
 */

/** Extra origins allowed by the Origin check (set via env in dev/test). */
export const DEV_ORIGIN_ALLOWLIST: string[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  process.env.VITE_ALLOWED_ORIGIN ?? '',
].filter(Boolean)

/** Methods that mutate server state — the only ones the Origin check applies to. */
export function isStateChangingMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}

/**
 * The origin the client *should* be talking to, derived from request headers.
 *
 * When behind a reverse proxy (Caddy → app:3001), `req.url` reports the
 * upstream backend address. We trust `X-Forwarded-Proto` and
 * `X-Forwarded-Host` to recover the user-facing origin. Falls back to the
 * inbound `Host` header and finally to `req.url` for direct connections.
 */
export function expectedOrigin(req: Request): string {
  const fallback = new URL(req.url)
  const proto = (req.headers.get('x-forwarded-proto') ?? fallback.protocol.replace(':', '')).toLowerCase()
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? fallback.host
  return `${proto}://${host}`
}

/**
 * True when the request's `Origin` header is acceptable for a state-changing
 * action. The check is a CSRF defense-in-depth on top of `SameSite=Lax`:
 *
 *   - No Origin header → trust (curl, server-to-server, same-origin form
 *     POST in some browsers); cannot be a cross-origin browser fetch since
 *     all modern browsers send Origin for CORS-significant requests.
 *   - Origin matches expectedOrigin(req) → same-origin, allow.
 *   - Origin is in the dev allowlist (Vite at :5173, etc.) → allow.
 *   - Anything else → reject.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  if (origin === expectedOrigin(req)) return true
  return DEV_ORIGIN_ALLOWLIST.includes(origin)
}

/**
 * Internal synthetic header used to ferry the socket peer address from the
 * `Bun.serve` fetch boundary (where `server.requestIP(req)` is available)
 * down to the handler stack (where only `Request` is in scope).
 *
 * The header is intentionally namespaced so it can't be confused with a
 * standard one, and any inbound version is stripped in `stampSocketIp`
 * before we set our own value — clients cannot spoof it.
 */
const BUN_SOCKET_IP_HEADER = 'x-bun-socket-ip'

/**
 * Called once per request at the `Bun.serve` fetch boundary, before any
 * handler logic runs. Strips any inbound copy of the synthetic header
 * (defense against spoofing) and stamps the real socket peer address that
 * Bun surfaces via `server.requestIP(req)`.
 *
 * This is how `clientIp(req)` can return a real address in dev or any
 * self-hosted deployment that isn't fronted by a proxy setting
 * `X-Forwarded-For`.
 */
export function stampSocketIp(req: Request, address: string | null): void {
  req.headers.delete(BUN_SOCKET_IP_HEADER)
  if (address) req.headers.set(BUN_SOCKET_IP_HEADER, address)
}

/**
 * Best-effort client IP.
 *
 *   1. `X-Forwarded-For` (set by Caddy / any reverse proxy) wins — this is
 *      the only trustworthy source when the app sits behind a proxy. The
 *      chain is comma-separated, most-recent-proxy first by spec; the first
 *      entry is the original client.
 *   2. Otherwise fall back to the synthetic `x-bun-socket-ip` header that
 *      `stampSocketIp` writes at the Bun.serve boundary from
 *      `server.requestIP(req)`. That covers dev (`bun run dev`) and any
 *      self-hosted deployment without a fronting proxy.
 *   3. If neither is available, return `null` — audit/activity logs render
 *      this as "unknown" rather than persisting a fake address.
 */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const socketIp = req.headers.get(BUN_SOCKET_IP_HEADER)
  if (socketIp) return socketIp
  return null
}
