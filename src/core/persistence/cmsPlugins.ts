import { z } from 'zod'
import type {
  CmsPluginsPayload,
  InstalledPlugin,
  PluginManifest,
  PluginPermission,
} from '../plugin-sdk'
import { readEnvelope } from './httpJson'
import { responseErrorMessage } from './httpErrors'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

// ---------------------------------------------------------------------------
// Envelope schemas
//
// Same envelope-only strategy as cmsContent.ts: validate the outer keys,
// pass deep types through as unknown, cast at the call site. Surfaced by
// /audit-types — replaces `await res.json() as T` with caller-supplied T.

const PluginsListEnvelope = z.object({
  plugins: z.array(z.unknown()).optional(),
  adminPages: z.array(z.unknown()).optional(),
}).passthrough()

const PluginActionEnvelope = z.object({
  plugin: z.unknown().optional(),
  plugins: z.array(z.unknown()).optional(),
  adminPages: z.array(z.unknown()).optional(),
}).passthrough()

const ManifestEnvelope = z.object({
  manifest: z.unknown().optional(),
}).passthrough()

function emptyPayload(body: Partial<CmsPluginsPayload>): CmsPluginsPayload {
  return {
    plugins: Array.isArray(body.plugins) ? body.plugins : [],
    adminPages: Array.isArray(body.adminPages) ? body.adminPages : [],
  }
}

export async function listCmsPlugins(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<CmsPluginsPayload> {
  const res = await fetchImpl(`${basePath}/plugins`, {
    method: 'GET',
    credentials: 'include',
  })
  const body = await readEnvelope(res, PluginsListEnvelope, `CMS plugins failed with ${res.status}`)
  return emptyPayload(body as Partial<CmsPluginsPayload>)
}

export async function installCmsPluginManifest(
  manifest: PluginManifest,
  grantedPermissionsOrFetch: PluginPermission[] | FetchLike = [],
  fetchImplOrBasePath: FetchLike | string = globalThis.fetch.bind(globalThis),
  maybeBasePath = '/api/cms',
): Promise<{ plugin?: InstalledPlugin } & CmsPluginsPayload> {
  const grantedPermissions = Array.isArray(grantedPermissionsOrFetch) ? grantedPermissionsOrFetch : []
  const fetchImpl =
    typeof grantedPermissionsOrFetch === 'function'
      ? grantedPermissionsOrFetch
      : typeof fetchImplOrBasePath === 'function'
        ? fetchImplOrBasePath
        : globalThis.fetch.bind(globalThis)
  const basePath =
    typeof fetchImplOrBasePath === 'string'
      ? fetchImplOrBasePath
      : maybeBasePath

  const res = await fetchImpl(`${basePath}/plugins`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      grantedPermissions.length > 0
        ? { manifest, grantedPermissions }
        : manifest,
    ),
  })
  const body = await readEnvelope(res, PluginActionEnvelope, `CMS plugin install failed with ${res.status}`)
  return {
    plugin: body.plugin as InstalledPlugin | undefined,
    ...emptyPayload(body as Partial<CmsPluginsPayload>),
  }
}

export async function inspectCmsPluginPackage(
  file: File,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<PluginManifest> {
  const formData = new FormData()
  formData.set('file', file)
  const res = await fetchImpl(`${basePath}/plugins/inspect-package`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const body = await readEnvelope(res, ManifestEnvelope, `CMS plugin package inspection failed with ${res.status}`)
  if (!body.manifest) throw new Error('CMS plugin package inspection response was missing manifest')
  return body.manifest as PluginManifest
}

export async function installCmsPluginPackage(
  file: File,
  grantedPermissions: PluginPermission[],
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<{ plugin?: InstalledPlugin } & CmsPluginsPayload> {
  const formData = new FormData()
  formData.set('file', file)
  formData.set('grantedPermissions', JSON.stringify(grantedPermissions))

  const res = await fetchImpl(`${basePath}/plugins/package`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const body = await readEnvelope(res, PluginActionEnvelope, `CMS plugin package install failed with ${res.status}`)
  return {
    plugin: body.plugin as InstalledPlugin | undefined,
    ...emptyPayload(body as Partial<CmsPluginsPayload>),
  }
}

export async function setCmsPluginEnabled(
  pluginId: string,
  enabled: boolean,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<{ plugin?: InstalledPlugin } & CmsPluginsPayload> {
  const res = await fetchImpl(`${basePath}/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  const body = await readEnvelope(res, PluginActionEnvelope, `CMS plugin update failed with ${res.status}`)
  return {
    plugin: body.plugin as InstalledPlugin | undefined,
    ...emptyPayload(body as Partial<CmsPluginsPayload>),
  }
}

export async function removeCmsPlugin(
  pluginId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<void> {
  const res = await fetchImpl(`${basePath}/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `CMS plugin delete failed with ${res.status}`))
  }
}
