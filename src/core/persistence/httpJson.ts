/**
 * Shared HTTP+JSON helper for the persistence layer.
 *
 * Combines the OK-or-throw check (using `responseErrorMessage` for the body
 * of the error message) with Zod validation of the response body. Replaces
 * the previously-duplicated `readEnvelope` / `readJson` helpers in
 * cmsContent, cmsPlugins, cmsPluginRecords.
 */

import type { z } from 'zod'
import { parseJsonResponse } from '@core/utils/jsonValidate'
import { responseErrorMessage } from './httpErrors'

export async function readEnvelope<T>(
  res: Response,
  schema: z.ZodType<T>,
  fallback: string,
): Promise<T> {
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, fallback))
  }
  return await parseJsonResponse(res, schema)
}
