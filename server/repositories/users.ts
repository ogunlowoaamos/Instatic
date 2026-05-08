import { nanoid } from 'nanoid'
import type { DbClient } from '../db/client'
import { normalizeCapabilities, type CoreCapability } from '../auth/capabilities'
import type { UserRow, UserStatus } from '../types'

export interface UserRole {
  id: string
  slug: string
  name: string
  description: string
  isSystem: boolean
  capabilities: CoreCapability[]
}

export interface CmsUser {
  id: string
  email: string
  displayName: string
  status: UserStatus
  role: UserRole
  capabilities: CoreCapability[]
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthUser extends CmsUser {
  passwordHash: string
}

interface JoinedUserRow extends UserRow {
  role_slug: string
  role_name: string
  role_description: string
  role_is_system: boolean | number
  role_capabilities_json: unknown
}

export class UserMutationError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'UserMutationError'
    this.status = status
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function dateString(value: Date | string | null): string | null {
  if (value === null) return null
  return new Date(value).toISOString()
}

export function rowToUser(row: JoinedUserRow): AuthUser {
  const capabilities = normalizeCapabilities(row.role_capabilities_json)
  const role: UserRole = {
    id: row.role_id,
    slug: row.role_slug,
    name: row.role_name,
    description: row.role_description,
    isSystem: Boolean(row.role_is_system),
    capabilities,
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    role,
    capabilities,
    passwordHash: row.password_hash,
    lastLoginAt: dateString(row.last_login_at),
    createdAt: dateString(row.created_at)!,
    updatedAt: dateString(row.updated_at)!,
  }
}

export function toPublicUser(user: AuthUser): CmsUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    role: user.role,
    capabilities: user.capabilities,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function listUsers(db: DbClient): Promise<CmsUser[]> {
  const { rows } = await db<JoinedUserRow>`
    select users.id,
           users.email,
           users.email_normalized,
           users.display_name,
           users.password_hash,
           users.status,
           users.role_id,
           users.last_login_at,
           users.created_at,
           users.updated_at,
           users.deleted_at,
           roles.slug as role_slug,
           roles.name as role_name,
           roles.description as role_description,
           roles.is_system as role_is_system,
           roles.capabilities_json as role_capabilities_json
    from users
    join roles on roles.id = users.role_id
    where users.deleted_at is null
    order by users.created_at asc
  `
  return rows.map((row) => toPublicUser(rowToUser(row)))
}

export async function findUserById(db: DbClient, userId: string): Promise<AuthUser | null> {
  const { rows } = await db<JoinedUserRow>`
    select users.id,
           users.email,
           users.email_normalized,
           users.display_name,
           users.password_hash,
           users.status,
           users.role_id,
           users.last_login_at,
           users.created_at,
           users.updated_at,
           users.deleted_at,
           roles.slug as role_slug,
           roles.name as role_name,
           roles.description as role_description,
           roles.is_system as role_is_system,
           roles.capabilities_json as role_capabilities_json
    from users
    join roles on roles.id = users.role_id
    where users.id = ${userId}
      and users.deleted_at is null
    limit 1
  `
  return rows[0] ? rowToUser(rows[0]) : null
}

export async function findUserByEmail(db: DbClient, email: string): Promise<AuthUser | null> {
  const { rows } = await db<JoinedUserRow>`
    select users.id,
           users.email,
           users.email_normalized,
           users.display_name,
           users.password_hash,
           users.status,
           users.role_id,
           users.last_login_at,
           users.created_at,
           users.updated_at,
           users.deleted_at,
           roles.slug as role_slug,
           roles.name as role_name,
           roles.description as role_description,
           roles.is_system as role_is_system,
           roles.capabilities_json as role_capabilities_json
    from users
    join roles on roles.id = users.role_id
    where users.email_normalized = ${normalizeEmail(email)}
      and users.deleted_at is null
    limit 1
  `
  return rows[0] ? rowToUser(rows[0]) : null
}

export async function createUser(
  db: DbClient,
  input: {
    id?: string
    email: string
    displayName: string
    passwordHash: string
    roleId: string
    status?: UserStatus
    allowOwnerRole?: boolean
  },
): Promise<CmsUser> {
  const email = input.email.trim()
  const emailNormalized = normalizeEmail(email)
  if (!emailNormalized.includes('@')) throw new UserMutationError('Invalid email')
  const displayName = input.displayName.trim() || email
  const id = input.id ?? nanoid()
  const status = input.status ?? 'active'
  if (input.roleId === 'owner' && input.allowOwnerRole !== true) {
    throw new UserMutationError('Owner role is setup-only')
  }

  const { rows } = await db<UserRow>`
    insert into users (id, email, email_normalized, display_name, password_hash, status, role_id)
    values (${id}, ${email}, ${emailNormalized}, ${displayName}, ${input.passwordHash}, ${status}, ${input.roleId})
    returning id, email, email_normalized, display_name, password_hash, status, role_id, last_login_at, created_at, updated_at, deleted_at
  `
  const created = await findUserById(db, rows[0]!.id)
  if (!created) throw new UserMutationError('User was not created', 500)
  return toPublicUser(created)
}

export async function updateUser(
  db: DbClient,
  userId: string,
  input: {
    email?: string
    displayName?: string
    passwordHash?: string
    status?: UserStatus
    roleId?: string
  },
): Promise<CmsUser | null> {
  const current = await findUserById(db, userId)
  if (!current) return null

  const email = input.email === undefined ? current.email : input.email.trim()
  const emailNormalized = normalizeEmail(email)
  if (!emailNormalized.includes('@')) throw new UserMutationError('Invalid email')
  const displayName = input.displayName === undefined
    ? current.displayName
    : input.displayName.trim() || email
  const status = input.status ?? current.status
  const roleId = input.roleId ?? current.role.id
  const passwordHash = input.passwordHash ?? current.passwordHash

  const { rows } = await db<UserRow>`
    update users
    set email = ${email},
        email_normalized = ${emailNormalized},
        display_name = ${displayName},
        password_hash = ${passwordHash},
        status = ${status},
        role_id = ${roleId},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
    returning id, email, email_normalized, display_name, password_hash, status, role_id, last_login_at, created_at, updated_at, deleted_at
  `
  if (!rows[0]) return null
  const updated = await findUserById(db, rows[0].id)
  if (!updated) return null
  return toPublicUser(updated)
}

export async function softDeleteUser(db: DbClient, userId: string): Promise<boolean> {
  const result = await db`
    update users
    set deleted_at = current_timestamp,
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
  `
  return result.rowCount > 0
}

export async function countActiveOwners(db: DbClient): Promise<number> {
  const { rows } = await db<{ count: number }>`
    select count(*) as count
    from users
    where role_id = ${'owner'}
      and status = ${'active'}
      and deleted_at is null
  `
  return Number(rows[0]?.count ?? 0)
}

export async function markUserLoggedIn(db: DbClient, userId: string): Promise<void> {
  await db`
    update users
    set last_login_at = current_timestamp,
        updated_at = current_timestamp
    where id = ${userId}
  `
}
