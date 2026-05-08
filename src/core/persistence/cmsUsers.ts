import { Type } from '@sinclair/typebox'
import { readEnvelope } from './httpJson'
import { responseErrorMessage } from './httpErrors'
import type { CmsCurrentUser } from './cmsAuth'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface CmsRole {
  id: string
  slug: string
  name: string
  description: string
  isSystem: boolean
  capabilities: string[]
  createdAt: string
  updatedAt: string
}

export interface CmsAuditEvent {
  id: string
  actorUserId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown>
  actorLabel: string | null
  targetLabel: string | null
  metadataLabels: Record<string, string>
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

const UsersEnvelope = Type.Object({ users: Type.Optional(Type.Array(Type.Unknown())) }, { additionalProperties: true })
const UserEnvelope = Type.Object({ user: Type.Optional(Type.Unknown()) }, { additionalProperties: true })
const RolesEnvelope = Type.Object({ roles: Type.Optional(Type.Array(Type.Unknown())) }, { additionalProperties: true })
const RoleEnvelope = Type.Object({ role: Type.Optional(Type.Unknown()) }, { additionalProperties: true })
const AuditEnvelope = Type.Object({ events: Type.Optional(Type.Array(Type.Unknown())) }, { additionalProperties: true })

export async function listCmsUsers(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<CmsCurrentUser[]> {
  const res = await fetchImpl(`${basePath}/users`, { method: 'GET', credentials: 'include' })
  const body = await readEnvelope(res, UsersEnvelope, `CMS users failed with ${res.status}`)
  return Array.isArray(body.users) ? body.users as CmsCurrentUser[] : []
}

export async function createCmsUser(
  input: { email: string; displayName: string; password: string; roleId: string; status?: 'active' | 'suspended' },
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<CmsCurrentUser> {
  const res = await fetchImpl(`${basePath}/users`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, UserEnvelope, `CMS user create failed with ${res.status}`)
  if (!body.user) throw new Error('CMS user create response was missing user')
  return body.user as CmsCurrentUser
}

export async function updateCmsUser(
  userId: string,
  input: Partial<{ email: string; displayName: string; password: string; roleId: string; status: 'active' | 'suspended' }>,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<CmsCurrentUser> {
  const res = await fetchImpl(`${basePath}/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, UserEnvelope, `CMS user update failed with ${res.status}`)
  if (!body.user) throw new Error('CMS user update response was missing user')
  return body.user as CmsCurrentUser
}

export async function deleteCmsUser(
  userId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<void> {
  const res = await fetchImpl(`${basePath}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(await responseErrorMessage(res, `CMS user delete failed with ${res.status}`))
}

export async function listCmsRoles(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<CmsRole[]> {
  const res = await fetchImpl(`${basePath}/roles`, { method: 'GET', credentials: 'include' })
  const body = await readEnvelope(res, RolesEnvelope, `CMS roles failed with ${res.status}`)
  return Array.isArray(body.roles) ? body.roles as CmsRole[] : []
}

export async function createCmsRole(
  input: { name: string; slug?: string; description: string; capabilities: string[] },
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<CmsRole> {
  const res = await fetchImpl(`${basePath}/roles`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, RoleEnvelope, `CMS role create failed with ${res.status}`)
  if (!body.role) throw new Error('CMS role create response was missing role')
  return body.role as CmsRole
}

export async function updateCmsRole(
  roleId: string,
  input: Partial<{ name: string; slug: string; description: string; capabilities: string[] }>,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<CmsRole> {
  const res = await fetchImpl(`${basePath}/roles/${encodeURIComponent(roleId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readEnvelope(res, RoleEnvelope, `CMS role update failed with ${res.status}`)
  if (!body.role) throw new Error('CMS role update response was missing role')
  return body.role as CmsRole
}

export async function deleteCmsRole(
  roleId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<void> {
  const res = await fetchImpl(`${basePath}/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(await responseErrorMessage(res, `CMS role delete failed with ${res.status}`))
}

export async function listCmsAuditEvents(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<CmsAuditEvent[]> {
  const res = await fetchImpl(`${basePath}/audit`, { method: 'GET', credentials: 'include' })
  const body = await readEnvelope(res, AuditEnvelope, `CMS audit events failed with ${res.status}`)
  return Array.isArray(body.events) ? body.events as CmsAuditEvent[] : []
}
