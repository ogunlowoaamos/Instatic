import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import type { DbClient } from '../db/client'
import { normalizeCapabilities, type CoreCapability } from '../auth/capabilities'
import type { UserRow, UserStatus } from '../types'
import { Type, filterArray } from '@core/utils/typeboxHelpers'

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
  failedLoginCount: number
  lockedUntil: string | null
  avatarMediaId: string | null
  passwordUpdatedAt: string | null
  mfaEnabled: boolean
  mfaEnabledAt: string | null
  mfaRecoveryCodesRemaining: number
  /** Public path of the uploaded avatar (resolved from media_assets), or null. */
  avatarUrl: string | null
  /** SHA-256 hex of the normalized email — drives the Gravatar fallback URL. */
  gravatarHash: string
  createdAt: string
  updatedAt: string
}

export interface AuthUser extends CmsUser {
  passwordHash: string
  mfaTotpSecret: string | null
  mfaRecoveryCodeHashes: string[]
}

interface JoinedUserRow extends UserRow {
  role_slug: string
  role_name: string
  role_description: string
  role_is_system: boolean | number
  role_capabilities_json: unknown
  avatar_public_path: string | null
}

const RecoveryCodeHashSchema = Type.String()

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

function dateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  return new Date(value).toISOString()
}

/**
 * SHA-256 hex of the normalized email. Gravatar accepts both MD5 and SHA-256
 * hashes; we use SHA-256 because Node/Bun ship it natively and it's the modern
 * default. The hash is recomputed on every read — there's no value in caching
 * it (cheap to derive, always tracks `email` mutations).
 */
function computeGravatarHash(email: string): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex')
}

export function rowToUser(row: JoinedUserRow): AuthUser {
  const capabilities = normalizeCapabilities(row.role_capabilities_json)
  const mfaRecoveryCodeHashes = filterArray(
    RecoveryCodeHashSchema,
    row.mfa_recovery_code_hashes_json,
  )
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
    failedLoginCount: Number(row.failed_login_count ?? 0),
    lockedUntil: dateString(row.locked_until),
    avatarMediaId: row.avatar_media_id ?? null,
    passwordUpdatedAt: dateString(row.password_updated_at),
    mfaEnabled: Boolean(row.mfa_enabled),
    mfaEnabledAt: dateString(row.mfa_enabled_at),
    mfaTotpSecret: row.mfa_totp_secret ?? null,
    mfaRecoveryCodeHashes,
    mfaRecoveryCodesRemaining: mfaRecoveryCodeHashes.length,
    avatarUrl: row.avatar_public_path ?? null,
    gravatarHash: computeGravatarHash(row.email),
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
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    avatarMediaId: user.avatarMediaId,
    passwordUpdatedAt: user.passwordUpdatedAt,
    mfaEnabled: user.mfaEnabled,
    mfaEnabledAt: user.mfaEnabledAt,
    mfaRecoveryCodesRemaining: user.mfaRecoveryCodesRemaining,
    avatarUrl: user.avatarUrl,
    gravatarHash: user.gravatarHash,
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
           users.failed_login_count,
           users.locked_until,
           users.avatar_media_id,
           users.password_updated_at,
           users.mfa_enabled,
           users.mfa_enabled_at,
           users.mfa_totp_secret,
           users.mfa_recovery_code_hashes_json,
           users.created_at,
           users.updated_at,
           users.deleted_at,
           roles.slug as role_slug,
           roles.name as role_name,
           roles.description as role_description,
           roles.is_system as role_is_system,
           roles.capabilities_json as role_capabilities_json,
           media_assets.public_path as avatar_public_path
    from users
    join roles on roles.id = users.role_id
    left join media_assets on media_assets.id = users.avatar_media_id
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
           users.failed_login_count,
           users.locked_until,
           users.avatar_media_id,
           users.password_updated_at,
           users.mfa_enabled,
           users.mfa_enabled_at,
           users.mfa_totp_secret,
           users.mfa_recovery_code_hashes_json,
           users.created_at,
           users.updated_at,
           users.deleted_at,
           roles.slug as role_slug,
           roles.name as role_name,
           roles.description as role_description,
           roles.is_system as role_is_system,
           roles.capabilities_json as role_capabilities_json,
           media_assets.public_path as avatar_public_path
    from users
    join roles on roles.id = users.role_id
    left join media_assets on media_assets.id = users.avatar_media_id
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
           users.failed_login_count,
           users.locked_until,
           users.avatar_media_id,
           users.password_updated_at,
           users.mfa_enabled,
           users.mfa_enabled_at,
           users.mfa_totp_secret,
           users.mfa_recovery_code_hashes_json,
           users.created_at,
           users.updated_at,
           users.deleted_at,
           roles.slug as role_slug,
           roles.name as role_name,
           roles.description as role_description,
           roles.is_system as role_is_system,
           roles.capabilities_json as role_capabilities_json,
           media_assets.public_path as avatar_public_path
    from users
    join roles on roles.id = users.role_id
    left join media_assets on media_assets.id = users.avatar_media_id
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
    returning id, email, email_normalized, display_name, password_hash, status, role_id, last_login_at, failed_login_count, locked_until, avatar_media_id, password_updated_at, mfa_enabled, mfa_enabled_at, mfa_totp_secret, mfa_recovery_code_hashes_json, created_at, updated_at, deleted_at
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
  const passwordUpdatedAt = input.passwordHash === undefined ? current.passwordUpdatedAt : new Date()

  const { rows } = await db<UserRow>`
    update users
    set email = ${email},
        email_normalized = ${emailNormalized},
        display_name = ${displayName},
        password_hash = ${passwordHash},
        password_updated_at = ${passwordUpdatedAt},
        status = ${status},
        role_id = ${roleId},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
    returning id, email, email_normalized, display_name, password_hash, status, role_id, last_login_at, failed_login_count, locked_until, avatar_media_id, password_updated_at, mfa_enabled, mfa_enabled_at, mfa_totp_secret, mfa_recovery_code_hashes_json, created_at, updated_at, deleted_at
  `
  if (!rows[0]) return null
  const updated = await findUserById(db, rows[0].id)
  if (!updated) return null
  return toPublicUser(updated)
}

/**
 * Update only the avatar reference on a user row. Returns the post-update
 * public user view (with `avatarUrl` resolved via the join) or null when
 * the target row is missing/soft-deleted.
 */
export async function setUserAvatarMediaId(
  db: DbClient,
  userId: string,
  mediaId: string | null,
): Promise<CmsUser | null> {
  const result = await db`
    update users
    set avatar_media_id = ${mediaId},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
  `
  if (result.rowCount === 0) return null
  const refreshed = await findUserById(db, userId)
  return refreshed ? toPublicUser(refreshed) : null
}

export async function updateUserPasswordHash(
  db: DbClient,
  userId: string,
  passwordHash: string,
): Promise<CmsUser | null> {
  const result = await db`
    update users
    set password_hash = ${passwordHash},
        password_updated_at = current_timestamp,
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
  `
  if (result.rowCount === 0) return null
  const refreshed = await findUserById(db, userId)
  return refreshed ? toPublicUser(refreshed) : null
}

export async function enableUserTotpMfa(
  db: DbClient,
  userId: string,
  input: {
    secret: string
    recoveryCodeHashes: string[]
  },
): Promise<CmsUser | null> {
  const result = await db`
    update users
    set mfa_enabled = ${true},
        mfa_enabled_at = current_timestamp,
        mfa_totp_secret = ${input.secret},
        mfa_recovery_code_hashes_json = ${input.recoveryCodeHashes},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
  `
  if (result.rowCount === 0) return null
  const refreshed = await findUserById(db, userId)
  return refreshed ? toPublicUser(refreshed) : null
}

export async function disableUserTotpMfa(
  db: DbClient,
  userId: string,
): Promise<CmsUser | null> {
  const result = await db`
    update users
    set mfa_enabled = ${false},
        mfa_enabled_at = ${null},
        mfa_totp_secret = ${null},
        mfa_recovery_code_hashes_json = ${[]},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
  `
  if (result.rowCount === 0) return null
  const refreshed = await findUserById(db, userId)
  return refreshed ? toPublicUser(refreshed) : null
}

export async function replaceUserRecoveryCodeHashes(
  db: DbClient,
  userId: string,
  recoveryCodeHashes: string[],
): Promise<CmsUser | null> {
  const result = await db`
    update users
    set mfa_recovery_code_hashes_json = ${recoveryCodeHashes},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
      and mfa_enabled = ${true}
  `
  if (result.rowCount === 0) return null
  const refreshed = await findUserById(db, userId)
  return refreshed ? toPublicUser(refreshed) : null
}

export async function consumeUserRecoveryCodeHash(
  db: DbClient,
  userId: string,
  usedHash: string,
): Promise<boolean> {
  const user = await findUserById(db, userId)
  if (!user || !user.mfaRecoveryCodeHashes.includes(usedHash)) return false
  const remaining = user.mfaRecoveryCodeHashes.filter((hash) => hash !== usedHash)
  const result = await db`
    update users
    set mfa_recovery_code_hashes_json = ${remaining},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
      and mfa_enabled = ${true}
  `
  return result.rowCount > 0
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
        failed_login_count = 0,
        locked_until = ${null},
        updated_at = current_timestamp
    where id = ${userId}
  `
}

/**
 * Increment the user's failed-login counter and (if a lockout was triggered)
 * persist the new `locked_until` deadline. Returns the post-update user row so
 * the caller can decide whether to emit a lock audit event.
 *
 * Idempotent in the sense that it always runs an UPDATE; the caller is
 * responsible for not double-counting (one call per failed attempt).
 */
export async function recordFailedLoginAttempt(
  db: DbClient,
  userId: string,
  lockedUntil: Date | null,
): Promise<{ failedLoginCount: number; lockedUntil: string | null } | null> {
  const { rows } = await db<{ failed_login_count: number; locked_until: Date | string | null }>`
    update users
    set failed_login_count = failed_login_count + 1,
        locked_until = ${lockedUntil},
        updated_at = current_timestamp
    where id = ${userId}
      and deleted_at is null
    returning failed_login_count, locked_until
  `
  if (!rows[0]) return null
  return {
    failedLoginCount: Number(rows[0].failed_login_count ?? 0),
    lockedUntil: dateString(rows[0].locked_until),
  }
}
