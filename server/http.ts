import { Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const res = new Response(JSON.stringify(body), init)
  res.headers.set('content-type', 'application/json')
  return res
}

// Validates a request body is a JSON object (not an array, not a primitive,
// not null). Each individual handler is expected to narrow further with its
// own TypeBox schema for the specific fields it consumes; this helper just
// guarantees you can safely destructure with no runtime crash on garbage
// input. Surfaced by /audit-types — was `await req.json() as Record<...>`.
const JsonObjectSchema = Type.Record(Type.String(), Type.Unknown())

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return {}
  }
  return Value.Check(JsonObjectSchema, raw) ? (raw as Record<string, unknown>) : {}
}

export function methodNotAllowed(): Response {
  return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
}

export function badRequest(message: string): Response {
  return jsonResponse({ error: message }, { status: 400 })
}

export function setCookieHeader(res: Response, value: string): Response {
  res.headers.append('set-cookie', value)
  return res
}
