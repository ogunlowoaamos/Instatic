import type { DbClient } from '../db/client'
import { rowToUser, type AuthUser } from '../repositories/users'
import type { UserRow } from '../types'
import { deriveDeviceLabel } from './deviceLabel'

const SESSION_IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 30

interface SessionUserRow extends UserRow {
  role_slug: string
  role_name: string
  role_description: string
  role_is_system: boolean | number
  role_capabilities_json: unknown
  avatar_public_path: string | null
  session_mfa_passed_at: Date | string | null
}

interface SessionRotationRow {
  user_id: string
  expires_at: Date | string
  ip_address: string | null
  user_agent: string | null
  device_label: string
  mfa_passed_at: Date | string | null
  step_up_expires_at: Date | string | null
}

export interface RotatedSession {
  expiresAt: Date
}

function sessionIdleCutoff(now = Date.now()): Date {
  return new Date(now - SESSION_IDLE_TIMEOUT_MS)
}

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export async function createSession(
  db: DbClient,
  input: {
    idHash: string
    userId: string
    expiresAt: Date
    ipAddress: string | null
    userAgent: string | null
    /**
     * Optional override for the device label. Falls back to a UA-derived
     * label, then the empty string. Empty is acceptable — the schema allows
     * it as a not-null sentinel and the UI renders "Unknown device".
     */
    deviceLabel?: string
    mfaPassedAt?: Date | null
  },
): Promise<void> {
  const deviceLabel = input.deviceLabel ?? deriveDeviceLabel(input.userAgent)
  await db`
    insert into sessions (id_hash, user_id, expires_at, ip_address, user_agent, device_label, mfa_passed_at)
    values (${input.idHash}, ${input.userId}, ${input.expiresAt}, ${input.ipAddress}, ${input.userAgent}, ${deviceLabel}, ${input.mfaPassedAt ?? null})
  `
}

async function findSessionUserRow(
  db: DbClient,
  idHash: string,
  now = Date.now(),
): Promise<SessionUserRow | null> {
  const idleCutoff = sessionIdleCutoff(now)
  const currentTime = new Date(now)
  const { rows } = await db<SessionUserRow>`
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
           sessions.mfa_passed_at as session_mfa_passed_at,
           roles.slug as role_slug,
           roles.name as role_name,
           roles.description as role_description,
           roles.is_system as role_is_system,
           roles.capabilities_json as role_capabilities_json,
           media_assets.public_path as avatar_public_path
    from sessions
    join users on users.id = sessions.user_id
    join roles on roles.id = users.role_id
    left join media_assets on media_assets.id = users.avatar_media_id
    where sessions.id_hash = ${idHash}
      and sessions.revoked_at is null
      and sessions.expires_at > ${currentTime}
      and sessions.last_seen_at > ${idleCutoff}
      and users.status = ${'active'}
      and users.deleted_at is null
    limit 1
  `
  return rows[0] ?? null
}

export async function findUserBySessionHash(
  db: DbClient,
  idHash: string,
  now = Date.now(),
): Promise<AuthUser | null> {
  const row = await findSessionUserRow(db, idHash, now)
  if (!row) return null
  const user = rowToUser(row)
  if (user.mfaEnabled && row.session_mfa_passed_at == null) return null

  await db`
    update sessions
    set last_seen_at = current_timestamp
    where id_hash = ${idHash}
  `
  return user
}

export async function sessionRequiresMfa(db: DbClient, idHash: string): Promise<boolean> {
  const row = await findSessionUserRow(db, idHash)
  if (!row) return false
  const user = rowToUser(row)
  return user.mfaEnabled && row.session_mfa_passed_at == null
}

export async function findUserByPendingMfaSessionHash(
  db: DbClient,
  idHash: string,
): Promise<AuthUser | null> {
  const row = await findSessionUserRow(db, idHash)
  if (!row) return null
  const user = rowToUser(row)
  if (!user.mfaEnabled || row.session_mfa_passed_at != null) return null
  return user
}

export async function revokeSessionByHash(db: DbClient, idHash: string): Promise<void> {
  await db`
    update sessions
    set revoked_at = current_timestamp
    where id_hash = ${idHash}
  `
}

/**
 * Read the `step_up_expires_at` column for a single live session. Used by
 * `requireStepUp` in `authz.ts` to decide whether the cookie's owner is
 * inside their fresh re-auth window.
 *
 * Returns `null` when the session doesn't exist, has been revoked, or has
 * never had a step-up grant. Callers must treat null as "needs step-up".
 */
export async function getSessionStepUpExpiresAt(
  db: DbClient,
  idHash: string,
): Promise<Date | null> {
  const { rows } = await db<{ step_up_expires_at: Date | string | null }>`
    select step_up_expires_at
    from sessions
    where id_hash = ${idHash}
      and revoked_at is null
    limit 1
  `
  const value = rows[0]?.step_up_expires_at ?? null
  return value ? new Date(value) : null
}

export async function rotateSessionToken(
  db: DbClient,
  currentIdHash: string,
  input: {
    nextIdHash: string
    mfaPassedAt?: Date | null
    stepUpExpiresAt?: Date | null
  },
): Promise<RotatedSession | null> {
  return db.transaction(async (tx) => {
    const { rows } = await tx<SessionRotationRow>`
      select user_id,
             expires_at,
             ip_address,
             user_agent,
             device_label,
             mfa_passed_at,
             step_up_expires_at
      from sessions
      where id_hash = ${currentIdHash}
        and revoked_at is null
      limit 1
    `
    const current = rows[0]
    if (!current) return null

    await tx`
      update sessions
      set revoked_at = current_timestamp
      where id_hash = ${currentIdHash}
        and revoked_at is null
    `

    const mfaPassedAt = input.mfaPassedAt !== undefined
      ? input.mfaPassedAt
      : current.mfa_passed_at
    const stepUpExpiresAt = input.stepUpExpiresAt !== undefined
      ? input.stepUpExpiresAt
      : current.step_up_expires_at

    await tx`
      insert into sessions (
        id_hash,
        user_id,
        expires_at,
        ip_address,
        user_agent,
        device_label,
        mfa_passed_at,
        step_up_expires_at
      )
      values (
        ${input.nextIdHash},
        ${current.user_id},
        ${dateValue(current.expires_at)},
        ${current.ip_address},
        ${current.user_agent},
        ${current.device_label},
        ${mfaPassedAt},
        ${stepUpExpiresAt}
      )
    `

    return { expiresAt: dateValue(current.expires_at) }
  })
}

export async function markSessionMfaPassed(
  db: DbClient,
  idHash: string,
  passedAt: Date = new Date(),
): Promise<void> {
  await db`
    update sessions
    set mfa_passed_at = ${passedAt},
        last_seen_at = current_timestamp
    where id_hash = ${idHash}
      and revoked_at is null
  `
}
