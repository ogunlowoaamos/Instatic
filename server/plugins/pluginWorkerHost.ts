/**
 * Plugin worker host — main-side manager for the per-process plugin worker.
 *
 * Owns the bidirectional RPC bridge to `pluginWorker.ts`:
 *  - Outbound: `loadPlugin`, `unloadPlugin`, `runLifecycle`, `runMigrate`,
 *    `runRoute`, `runHookListener`, `runHookFilter`, `runLoopFetch`,
 *    `runLoopPreview` — all return promises that resolve on the matching
 *    `*-result` message from the worker.
 *  - Inbound: dispatches `api-call` messages from the worker to the
 *    appropriate host primitive (db repository, hookBus, loopSourceRegistry,
 *    serverPluginRuntime, plugin settings repository, audit log).
 *
 * Lifecycle:
 *  - The worker is lazily spawned on the first call and reused for every
 *    plugin in this process.
 *  - On uncaught crash the worker is replaced; all loaded plugins must be
 *    re-loaded by the caller (the host's existing `activateInstalledServerPlugins`
 *    loop already handles this on server boot, so a respawn is followed
 *    by a re-bind round).
 *
 * Single shared worker is the v1 design — one bad plugin can crash its
 * peers. Per-plugin workers are an additive future extension; the protocol
 * is identical, only the host's worker pool differs.
 */

import { nanoid } from 'nanoid'
import type { DbClient } from '../db/client'
import type {
  PluginManifest,
  PluginPermission,
  PluginRecord,
  ServerPluginLifecycleHook,
} from '@core/plugin-sdk'
import {
  validatePluginSettingsRecord,
  type PluginSettingDefinition,
} from '@core/plugin-sdk'
import { findPluginResource, validatePluginRecordData } from '@core/plugins/manifest'
import { hookBus } from '@core/plugins/hookBus'
import { loopSourceRegistry } from '@core/loops/registry'
import type { LoopEntitySource } from '@core/loops/types'
import {
  createPluginRecord,
  deletePluginRecord,
  getInstalledPlugin,
  listPluginRecords,
  setPluginSettings,
  updatePluginRecord,
} from '../repositories/plugins'
import { isCoreCapability, type CoreCapability } from '../auth/capabilities'
import type {
  ApiCall,
  LoadPluginResult,
  MainToWorkerMessage,
  SerializedRequest,
  SerializedResponse,
  SerializedUser,
  WorkerToMainMessage,
} from './workerProtocol'
import { isAllowedApiTarget } from './workerProtocol'

// ---------------------------------------------------------------------------
// Per-plugin host-side bookkeeping
// ---------------------------------------------------------------------------

interface HostRouteEntry {
  pluginId: string
  method: string
  path: string
  capability: CoreCapability | null
  routeKey: string
}

interface HostHookListenerEntry {
  pluginId: string
  listenerId: string
}

interface HostHookFilterEntry {
  pluginId: string
  filterId: string
}

interface HostLoopSourceEntry {
  pluginId: string
  sourceId: string
}

interface HostPluginRecord {
  manifest: PluginManifest
  routes: Map<string, HostRouteEntry>
  hookListeners: HostHookListenerEntry[]
  hookFilters: HostHookFilterEntry[]
  loopSources: HostLoopSourceEntry[]
}

const hostPlugins = new Map<string, HostPluginRecord>()

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

let worker: Worker | null = null
const pendingRequests = new Map<
  string,
  { resolve: (value: WorkerToMainMessage) => void; reject: (err: unknown) => void }
>()

let dbForApi: DbClient | null = null

export function setPluginWorkerDbClient(db: DbClient): void {
  dbForApi = db
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./pluginWorker.ts', import.meta.url).href)
  worker.addEventListener('message', (event: MessageEvent) => {
    handleWorkerMessage(event.data as WorkerToMainMessage)
  })
  worker.addEventListener('error', (event: ErrorEvent) => {
    console.error('[plugin-worker] uncaught error in worker:', event.message, event.error)
    // Reject everything outstanding so callers don't hang forever.
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error(`Plugin worker crashed: ${event.message}`))
    }
    pendingRequests.clear()
    // Clear the reference; next call respawns.
    if (worker) {
      worker.terminate()
      worker = null
    }
    hostPlugins.clear()
  })
  return worker
}

function send(msg: MainToWorkerMessage): void {
  ensureWorker().postMessage(msg)
}

function request<TKind extends WorkerToMainMessage['kind']>(
  msg: MainToWorkerMessage,
  expectedKind: TKind,
): Promise<Extract<WorkerToMainMessage, { kind: TKind }>> {
  return new Promise<Extract<WorkerToMainMessage, { kind: TKind }>>((resolve, reject) => {
    pendingRequests.set(msg.correlationId, {
      resolve: (value) => {
        if (value.kind !== expectedKind) {
          reject(new Error(`Plugin worker returned unexpected message kind "${value.kind}"`))
          return
        }
        resolve(value as Extract<WorkerToMainMessage, { kind: TKind }>)
      },
      reject,
    })
    send(msg)
  })
}

function handleWorkerMessage(msg: WorkerToMainMessage): void {
  switch (msg.kind) {
    case 'log':
      console.info(`[plugin:${msg.pluginId}]`, ...msg.args)
      return
    case 'api-call':
      void dispatchApiCall(msg)
      return
    default: {
      const pending = pendingRequests.get(msg.correlationId)
      if (!pending) return
      pendingRequests.delete(msg.correlationId)
      pending.resolve(msg)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — used by the rest of the host
// ---------------------------------------------------------------------------

export async function loadPluginInWorker(args: {
  manifest: PluginManifest
  entryFileUrl: string
  settings: Record<string, string | number | boolean>
}): Promise<LoadPluginResult> {
  const correlationId = nanoid()
  hostPlugins.set(args.manifest.id, {
    manifest: args.manifest,
    routes: new Map(),
    hookListeners: [],
    hookFilters: [],
    loopSources: [],
  })
  const result = await request(
    {
      kind: 'load-plugin',
      correlationId,
      pluginId: args.manifest.id,
      manifest: args.manifest,
      entryFileUrl: args.entryFileUrl,
      settings: args.settings,
    },
    'load-plugin-result',
  )
  return result
}

export async function unloadPluginInWorker(pluginId: string): Promise<void> {
  // Tear down host-side registrations BEFORE the worker forgets the plugin
  // — once the worker is told to drop, any in-flight callbacks would have
  // nowhere to go.
  const entry = hostPlugins.get(pluginId)
  if (entry) {
    for (const route of entry.routes.values()) {
      // The cms server runtime owns the actual route table; we just
      // remember which routes were ours so we know to forward inbound
      // requests through the worker. Removing them is the runtime's job.
    }
    for (const source of entry.loopSources) {
      loopSourceRegistry.unregister(source.sourceId)
    }
    hookBus.unregisterPlugin(pluginId)
  }
  hostPlugins.delete(pluginId)

  if (!worker) return
  await request(
    { kind: 'unload-plugin', correlationId: nanoid(), pluginId },
    'unload-plugin-result',
  )
}

export async function runLifecycleInWorker(
  pluginId: string,
  hook: Exclude<ServerPluginLifecycleHook, 'migrate'>,
): Promise<void> {
  const result = await request(
    { kind: 'run-lifecycle', correlationId: nanoid(), pluginId, hook },
    'lifecycle-result',
  )
  if (!result.ok) {
    throw new Error(result.error ?? `Plugin "${pluginId}" ${hook} failed`)
  }
}

export async function runMigrateInWorker(
  pluginId: string,
  fromVersion: string,
): Promise<void> {
  const result = await request(
    { kind: 'run-migrate', correlationId: nanoid(), pluginId, fromVersion },
    'lifecycle-result',
  )
  if (!result.ok) {
    throw new Error(result.error ?? `Plugin "${pluginId}" migrate failed`)
  }
}

/**
 * Forward an inbound HTTP request to the plugin's route handler in the
 * worker. The host has already verified the route is registered + the
 * caller has the required capability — this function only handles the
 * worker round-trip and response materialisation.
 */
export async function runRouteInWorker(args: {
  pluginId: string
  method: string
  path: string
  request: Request
  user: SerializedUser | null
}): Promise<Response> {
  const entry = hostPlugins.get(args.pluginId)
  const routeKey = `${args.method.toUpperCase()}:${normalizeRoutePath(args.path)}`
  const route = entry?.routes.get(routeKey)
  if (!route) return new Response('Plugin route not found', { status: 404 })

  // Read the body once, pre-parse the JSON form for the handler context.
  const bodyText = args.method !== 'GET' ? await args.request.text() : ''
  let parsedBody: Record<string, unknown> = {}
  if (bodyText) {
    try {
      const parsed: unknown = JSON.parse(bodyText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedBody = parsed as Record<string, unknown>
      }
    } catch {
      // non-JSON body — handler can read raw via req.text()
    }
  }

  const headers: Record<string, string> = {}
  args.request.headers.forEach((v, k) => { headers[k] = v })

  const serializedReq: SerializedRequest = {
    url: args.request.url,
    method: args.request.method,
    headers,
    body: bodyText,
  }

  const result = await request(
    {
      kind: 'run-route',
      correlationId: nanoid(),
      pluginId: args.pluginId,
      routeKey,
      request: serializedReq,
      user: args.user,
      body: parsedBody,
    },
    'route-result',
  )
  if (!result.ok || !result.response) {
    return Response.json({ error: result.error ?? 'Plugin route failed' }, { status: 500 })
  }
  return materializeResponse(result.response)
}

function materializeResponse(response: SerializedResponse): Response {
  if (response.kind === 'response') {
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  }
  return Response.json(response.value)
}

export function getRegisteredRoute(
  pluginId: string,
  method: string,
  path: string,
): { capability: CoreCapability | null } | null {
  const entry = hostPlugins.get(pluginId)
  const route = entry?.routes.get(`${method.toUpperCase()}:${normalizeRoutePath(path)}`)
  return route ? { capability: route.capability } : null
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

/**
 * Fully tear down host-side state. Called by `serverPluginRuntime.reset()`
 * before re-binding plugins (e.g. on server boot).
 */
export async function resetPluginWorker(): Promise<void> {
  hostPlugins.clear()
  if (!worker) return
  worker.terminate()
  worker = null
  // Reject pending; respawn happens on next call.
  for (const [, pending] of pendingRequests) {
    pending.reject(new Error('Plugin worker reset'))
  }
  pendingRequests.clear()
}

// ---------------------------------------------------------------------------
// Inbound api-call dispatch
// ---------------------------------------------------------------------------

async function dispatchApiCall(msg: ApiCall): Promise<void> {
  if (!isAllowedApiTarget(msg.target)) {
    replyApiError(msg.correlationId, `Unknown api target "${msg.target}"`)
    return
  }
  if (!dbForApi) {
    replyApiError(msg.correlationId, 'Plugin worker host has no DbClient configured')
    return
  }
  const db = dbForApi
  const entry = hostPlugins.get(msg.pluginId)
  if (!entry) {
    replyApiError(msg.correlationId, `Plugin "${msg.pluginId}" is not loaded`)
    return
  }

  try {
    switch (msg.target) {
      case 'cms.routes.register': {
        const arg = msg.args[0] as {
          method: string
          path: string
          capability: string | null
          routeKey: string
        }
        if (arg.capability !== null && !isCoreCapability(arg.capability)) {
          throw new Error(`Unknown plugin route capability: ${arg.capability}`)
        }
        entry.routes.set(arg.routeKey, {
          pluginId: msg.pluginId,
          method: arg.method,
          path: arg.path,
          capability: arg.capability as CoreCapability | null,
          routeKey: arg.routeKey,
        })
        replyApiOk(msg.correlationId)
        return
      }

      case 'cms.hooks.on': {
        const { event, listenerId } = msg.args[0] as { event: string; listenerId: string }
        entry.hookListeners.push({ pluginId: msg.pluginId, listenerId })
        // The hookBus listener is a thin shim that round-trips back to the worker.
        hookBus.on(msg.pluginId, event, async (payload: unknown) => {
          await runHookListenerInWorker(msg.pluginId, listenerId, event, payload)
        })
        replyApiOk(msg.correlationId)
        return
      }

      case 'cms.hooks.filter': {
        const { name, filterId } = msg.args[0] as { name: string; filterId: string }
        entry.hookFilters.push({ pluginId: msg.pluginId, filterId })
        hookBus.filter(msg.pluginId, name, async (value: unknown) => {
          return await runHookFilterInWorker(msg.pluginId, filterId, name, value)
        })
        replyApiOk(msg.correlationId)
        return
      }

      case 'cms.hooks.emit': {
        const { event, payload } = msg.args[0] as { event: string; payload: unknown }
        await hookBus.emit(event, payload)
        replyApiOk(msg.correlationId)
        return
      }

      case 'cms.loops.registerSource': {
        const descriptor = msg.args[0] as Omit<LoopEntitySource, 'fetch' | 'preview'>
        if (!descriptor.id?.startsWith(`${msg.pluginId}.`)) {
          throw new Error(
            `Loop source id "${descriptor.id}" must start with the plugin id "${msg.pluginId}.".`,
          )
        }
        const fullSource: LoopEntitySource = {
          ...descriptor,
          fetch: async (ctx) => {
            return await runLoopFetchInWorker(msg.pluginId, descriptor.id, ctx)
          },
          preview: () => {
            // preview() is synchronous in the contract — we can't await the
            // worker. Returning [] is fine: the editor uses the publisher's
            // fetch path for live preview now (see useLoopPreviewItems),
            // and any plugin that ships a synchronous preview-only path
            // can be added later via a worker-backed sync invariant.
            return []
          },
        }
        entry.loopSources.push({ pluginId: msg.pluginId, sourceId: descriptor.id })
        loopSourceRegistry.registerOrReplace(fullSource)
        replyApiOk(msg.correlationId)
        return
      }

      case 'cms.storage.list': {
        const [resourceId] = msg.args as [string]
        const records = await listPluginRecords(db, msg.pluginId, resourceId)
        replyApiOk(msg.correlationId, records as unknown)
        return
      }

      case 'cms.storage.create': {
        const [resourceId, data] = msg.args as [string, Record<string, unknown>]
        const resource = findPluginResource(entry.manifest, resourceId)
        const cleanedData = resource ? validatePluginRecordData(resource, data) : data
        const created: PluginRecord = await createPluginRecord(db, {
          id: nanoid(),
          pluginId: msg.pluginId,
          resourceId,
          data: cleanedData,
        })
        replyApiOk(msg.correlationId, created as unknown)
        return
      }

      case 'cms.storage.update': {
        const [resourceId, recordId, data] = msg.args as [string, string, Record<string, unknown>]
        const resource = findPluginResource(entry.manifest, resourceId)
        const cleanedData = resource ? validatePluginRecordData(resource, data) : data
        const updated = await updatePluginRecord(db, {
          id: recordId,
          pluginId: msg.pluginId,
          resourceId,
          data: cleanedData,
        })
        replyApiOk(msg.correlationId, updated as unknown)
        return
      }

      case 'cms.storage.delete': {
        const [resourceId, recordId] = msg.args as [string, string]
        const ok = await deletePluginRecord(db, {
          id: recordId,
          pluginId: msg.pluginId,
          resourceId,
        })
        replyApiOk(msg.correlationId, ok as unknown)
        return
      }

      case 'cms.settings.replace': {
        const [next] = msg.args as [Record<string, unknown>]
        const declared = (entry.manifest.settings ?? []) as PluginSettingDefinition[]
        const cleaned = validatePluginSettingsRecord(declared, next)
        await setPluginSettings(db, msg.pluginId, cleaned)
        // Refresh worker-side cache via the existing settings route — actually
        // the worker's local cache is updated from the api reply value.
        await hookBus.emit('settings.changed', {
          pluginId: msg.pluginId,
          settings: cleaned,
        } as unknown as Record<string, unknown>)
        replyApiOk(msg.correlationId, cleaned as unknown)
        return
      }
    }
  } catch (err) {
    replyApiError(msg.correlationId, err instanceof Error ? err.message : String(err))
  }
}

function replyApiOk(correlationId: string, value?: unknown): void {
  send({ kind: 'api-reply', correlationId, ok: true, value })
}

function replyApiError(correlationId: string, message: string): void {
  send({ kind: 'api-reply', correlationId, ok: false, error: message })
}

async function runHookListenerInWorker(
  pluginId: string,
  listenerId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const result = await request(
    { kind: 'run-hook-listener', correlationId: nanoid(), pluginId, listenerId, event, payload },
    'hook-listener-result',
  )
  if (!result.ok) {
    console.error(
      `[plugin:${pluginId}] hook listener for "${event}" threw:`,
      result.error,
    )
  }
}

async function runHookFilterInWorker(
  pluginId: string,
  filterId: string,
  name: string,
  value: unknown,
): Promise<unknown> {
  const result = await request(
    { kind: 'run-hook-filter', correlationId: nanoid(), pluginId, filterId, name, value },
    'hook-filter-result',
  )
  if (!result.ok) {
    console.error(`[plugin:${pluginId}] hook filter "${name}" threw:`, result.error)
    return value
  }
  return result.value
}

async function runLoopFetchInWorker(
  pluginId: string,
  sourceId: string,
  ctx: unknown,
): Promise<{ items: unknown[]; totalItems: number }> {
  const result = await request(
    { kind: 'run-loop-fetch', correlationId: nanoid(), pluginId, sourceId, ctx },
    'loop-fetch-result',
  )
  if (!result.ok || !result.value) {
    console.error(
      `[plugin:${pluginId}] loop source "${sourceId}" fetch failed:`,
      result.error,
    )
    return { items: [], totalItems: 0 }
  }
  return result.value
}

/**
 * Lookup helper used by the existing plugin-runtime route table — given a
 * plugin id and request method/path, return whether that plugin has a
 * registered route, and which capability gates it.
 */
export function findPluginRouteCapability(
  pluginId: string,
  method: string,
  path: string,
): { capability: CoreCapability | null } | null {
  return getRegisteredRoute(pluginId, method, path)
}

/**
 * Test-only / diagnostics: list current host-side bookkeeping. Useful for
 * checking that registrations land where expected.
 */
export function inspectPluginWorkerState(): {
  loaded: string[]
  routes: { pluginId: string; method: string; path: string }[]
} {
  const loaded = [...hostPlugins.keys()]
  const routes: { pluginId: string; method: string; path: string }[] = []
  for (const [pluginId, entry] of hostPlugins) {
    for (const route of entry.routes.values()) {
      routes.push({ pluginId, method: route.method, path: route.path })
    }
  }
  return { loaded, routes }
}

// Re-export the permission union so external callers can pass it.
export type { PluginPermission }
