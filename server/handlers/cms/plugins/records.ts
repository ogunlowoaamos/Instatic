/**
 * Plugin record CRUD endpoints.
 *
 *   GET    /admin/api/cms/plugins/:id/resources/:rid/records          — list
 *   POST   /admin/api/cms/plugins/:id/resources/:rid/records          — create
 *   PATCH  /admin/api/cms/plugins/:id/resources/:rid/records/:recId   — update
 *   DELETE /admin/api/cms/plugins/:id/resources/:rid/records/:recId   — delete
 *
 * "Resources" are the named, schema-bound tables a plugin's manifest can
 * declare. The dispatcher matches the URL, this handler validates the body
 * against the resource's schema and persists via the records repository.
 */
import { nanoid } from 'nanoid'
import type { DbClient } from '../../../db/client'
import {
  createPluginRecord,
  deletePluginRecord,
  listPluginRecords,
  updatePluginRecord,
} from '../../../repositories/plugins'
import { validatePluginRecordData } from '@core/plugins/manifest'
import { badRequest, jsonResponse, methodNotAllowed, readJsonObject } from '../../../http'
import {
  getEnabledPluginResource,
  pluginRecordNotFound,
  pluginResourceNotFound,
} from './shared'

export async function handlePluginRecordsCollection(
  req: Request,
  db: DbClient,
  pluginId: string,
  resourceId: string,
): Promise<Response> {
  const resource = await getEnabledPluginResource(db, pluginId, resourceId)
  if (!resource) return pluginResourceNotFound()

  if (req.method === 'GET') {
    return jsonResponse({
      resource,
      records: await listPluginRecords(db, pluginId, resourceId),
    })
  }

  if (req.method === 'POST') {
    const body = await readJsonObject(req)
    try {
      const data = validatePluginRecordData(resource, body.data ?? body)
      const record = await createPluginRecord(db, {
        id: nanoid(),
        pluginId,
        resourceId,
        data,
      })
      return jsonResponse({ record }, { status: 201 })
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : 'Invalid plugin record data')
    }
  }

  return methodNotAllowed()
}

export async function handlePluginRecordItem(
  req: Request,
  db: DbClient,
  pluginId: string,
  resourceId: string,
  recordId: string,
): Promise<Response> {
  const resource = await getEnabledPluginResource(db, pluginId, resourceId)
  if (!resource) return pluginResourceNotFound()

  if (req.method === 'PATCH') {
    const body = await readJsonObject(req)
    try {
      const data = validatePluginRecordData(resource, body.data ?? body)
      const record = await updatePluginRecord(db, {
        id: recordId,
        pluginId,
        resourceId,
        data,
      })
      if (!record) return pluginRecordNotFound()
      return jsonResponse({ record })
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : 'Invalid plugin record data')
    }
  }

  if (req.method === 'DELETE') {
    const deleted = await deletePluginRecord(db, {
      id: recordId,
      pluginId,
      resourceId,
    })
    if (!deleted) return pluginRecordNotFound()
    return jsonResponse({ ok: true })
  }

  return methodNotAllowed()
}
