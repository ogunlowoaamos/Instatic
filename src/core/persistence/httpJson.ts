/**
 * Shared HTTP+JSON helper for the persistence layer.
 *
 * Combines the OK-or-throw check (using `responseErrorMessage` for the body
 * of the error message) with TypeBox validation of the response body.
 */

import type { TSchema, Static } from '@sinclair/typebox'
import { parseJsonResponse } from '@core/utils/jsonValidate'
import { responseErrorMessage } from './httpErrors'

export async function readEnvelope<T extends TSchema>(
  res: Response,
  schema: T,
  fallback: string,
): Promise<Static<T>> {
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, fallback))
  }
  return await parseJsonResponse(res, schema)
}
