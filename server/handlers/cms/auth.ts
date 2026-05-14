/**
 * Authentication endpoints — login, logout, and "who am I".
 *
 *   POST /admin/api/cms/login  — exchange (email, password) for a session
 *                                 cookie, after rate-limit + constant-time
 *                                 password verification.
 *   POST /admin/api/cms/logout — revoke the current session row + clear
 *                                 the cookie.
 *   GET  /admin/api/cms/me     — return the authenticated user, role, and
 *                                 capabilities (used by the admin shell).
 */
import type { DbClient } from '../../db/client'
import {
  createSessionToken,
  hashSessionToken,
  sessionExpiry,
  verifyPassword,
} from '../../auth/tokens'
import {
  createSession,
  findUserByPendingMfaSessionHash,
  rotateSessionToken,
  revokeSessionByHash,
} from '../../auth/sessions'
import {
  listSessionsForUser,
  revokeAllOtherSessions,
  revokeSessionByHashForUser,
} from '../../repositories/sessions'
import {
  findUserById,
  findUserByEmail,
  markUserLoggedIn,
  recordFailedLoginAttempt,
  consumeUserRecoveryCodeHash,
  toPublicUser,
  type AuthUser,
} from '../../repositories/users'
import {
  requireAuthenticatedUser,
  requireStepUp,
  getSessionHash,
  STEP_UP_WINDOW_MS,
} from '../../auth/authz'
import { createAuditEvent } from '../../repositories/audit'
import {
  listLoginActivityForUser,
  recordLoginAttempt,
  type LoginAttemptResult,
} from '../../repositories/loginAttempts'
import { loginPerIpRateLimit, loginRateLimit, mfaRateLimit } from '../../auth/rateLimit'
import { evaluateFailedAttempt, evaluateLockState } from '../../auth/lockout'
import { clientIp } from '../../auth/security'
import { findMatchingRecoveryCodeHash, verifyTotpCode } from '../../auth/mfa'
import { jsonResponse, methodNotAllowed, readJsonObject, setCookieHeader } from '../../http'
import { CMS_API_PREFIX, readString, requestAuditContext } from './shared'
import { clearSessionCookie, getDummyPasswordHash, sessionCookie } from './session'

/**
 * True when the user row carried any prior lockout signal — either an active
 * `locked_until` timestamp (we already let the legitimate user through after
 * the window elapsed but before a successful login cleared the column) or a
 * non-zero failed-login counter.
 *
 * Drives the `login.unlocked` audit event so operators see when an account
 * recovers from a lock. Pure read of the AuthUser row already in memory.
 */
function previouslyLocked(user: AuthUser): boolean {
  if (user.failedLoginCount > 0) return true
  return user.lockedUntil !== null
}

function retryAfterSeconds(ms: number): string {
  return String(Math.ceil(ms / 1000))
}

async function recordStepUpRateLimit(
  db: DbClient,
  req: Request,
  user: AuthUser,
  ip: string | null,
  scope: 'ip' | 'tuple',
  retryAfterMs: number,
): Promise<Response> {
  await recordLoginAttempt(db, {
    emailNorm: user.email.toLowerCase(),
    ipAddress: ip,
    userId: user.id,
    result: 'rate_limited',
  })
  await createAuditEvent(db, {
    actorUserId: user.id,
    action: 'login.rate_limited',
    targetType: 'user',
    targetId: user.id,
    metadata: { email: user.email.toLowerCase(), scope: `step_up_${scope}` },
    ...requestAuditContext(req),
  })
  return jsonResponse(
    { error: scope === 'ip' ? 'Too many login attempts from this address. Try again later.' : 'Too many login attempts. Try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': retryAfterSeconds(retryAfterMs) },
    },
  )
}

async function recordStepUpPasswordFailure(
  db: DbClient,
  req: Request,
  user: AuthUser,
  ip: string | null,
): Promise<Response> {
  await recordLoginAttempt(db, {
    emailNorm: user.email.toLowerCase(),
    ipAddress: ip,
    userId: user.id,
    result: 'bad_password',
  })

  const lockout = evaluateFailedAttempt(user.failedLoginCount)
  await recordFailedLoginAttempt(db, user.id, lockout.lockedUntil)

  if (lockout.triggered && lockout.lockedUntil) {
    await createAuditEvent(db, {
      actorUserId: user.id,
      action: 'login.locked',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        email: user.email.toLowerCase(),
        lockedUntil: lockout.lockedUntil.toISOString(),
        failedLoginCount: lockout.failedLoginCount,
        reason: 'step_up',
      },
      ...requestAuditContext(req),
    })
  }

  await createAuditEvent(db, {
    actorUserId: user.id,
    action: 'login.failure',
    targetType: 'user',
    targetId: user.id,
    metadata: { reason: 'step_up' },
    ...requestAuditContext(req),
  })

  if (lockout.triggered && lockout.lockedUntil) {
    const retryAfterMs = Math.max(0, lockout.lockedUntil.getTime() - Date.now())
    return jsonResponse(
      { error: 'Account locked. Try again later.' },
      {
        status: 423,
        headers: { 'Retry-After': retryAfterSeconds(retryAfterMs) },
      },
    )
  }

  return jsonResponse({ error: 'Invalid password' }, { status: 401 })
}

export async function handleAuthRoutes(req: Request, db: DbClient): Promise<Response | null> {
  const url = new URL(req.url)

  if (url.pathname === `${CMS_API_PREFIX}/login`) {
    if (req.method !== 'POST') return methodNotAllowed()
    const body = await readJsonObject(req)
    const email = readString(body, 'email').toLowerCase()
    const password = readString(body, 'password')
    const ip = clientIp(req)

    // Layer 1 — per-IP rate limit. Blanket protection so a single attacker IP
    // cannot grind through many target accounts. Skipped when no IP is
    // surfaced (Bun.serve without a proxy in front); the per-(ip, email)
    // tuple limiter still applies.
    if (ip) {
      const ipDecision = loginPerIpRateLimit.consume(ip)
      if (!ipDecision.ok) {
        await recordLoginAttempt(db, {
          emailNorm: email || null,
          ipAddress: ip,
          userId: null,
          result: 'rate_limited',
        })
        await createAuditEvent(db, {
          actorUserId: null,
          action: 'login.rate_limited',
          targetType: 'user',
          targetId: null,
          metadata: { email, scope: 'ip' },
          ...requestAuditContext(req),
        })
        return jsonResponse(
          { error: 'Too many login attempts from this address. Try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil(ipDecision.retryAfterMs / 1000)) },
          },
        )
      }
    }

    // Layer 2 — per-(IP, email) tuple. Defends a single account across many
    // attacker IPs that haven't individually hit the per-IP cap. The bucket
    // is consumed BEFORE any DB lookup or password verification — an
    // attacker who triggers the 429 cannot make us burn argon2id CPU cycles.
    const rateLimitKey = `${ip ?? 'unknown'}|${email}`
    const decision = loginRateLimit.consume(rateLimitKey)
    if (!decision.ok) {
      await recordLoginAttempt(db, {
        emailNorm: email || null,
        ipAddress: ip,
        userId: null,
        result: 'rate_limited',
      })
      await createAuditEvent(db, {
        actorUserId: null,
        action: 'login.rate_limited',
        targetType: 'user',
        targetId: null,
        metadata: { email, scope: 'tuple' },
        ...requestAuditContext(req),
      })
      return jsonResponse(
        { error: 'Too many login attempts. Try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(decision.retryAfterMs / 1000)) },
        },
      )
    }

    // Constant-time path: ALWAYS run argon2id verify, even when the email
    // doesn't match a user. Without this, "user not found" returns in ~5ms
    // while "user found, wrong password" takes ~100ms — a timing oracle for
    // email enumeration. We verify against a fixed dummy hash on the no-user
    // branch; the result is always false, but the latency profile is the
    // same as the real branch.
    const user = await findUserByEmail(db, email)
    const verifiedHash = user?.passwordHash ?? (await getDummyPasswordHash())
    const passwordOk = await verifyPassword(password, verifiedHash)

    // Layer 3 — per-account lockout. Checked AFTER constant-time password
    // verify so the locked-vs-not-locked latency profile doesn't leak whether
    // the email exists.
    const lockState = user ? evaluateLockState(user.lockedUntil) : { locked: false, retryAfterMs: 0 }
    if (user && lockState.locked) {
      await recordLoginAttempt(db, {
        emailNorm: email || null,
        ipAddress: ip,
        userId: user.id,
        result: 'locked',
      })
      await createAuditEvent(db, {
        actorUserId: user.id,
        action: 'login.failure',
        targetType: 'user',
        targetId: user.id,
        metadata: { email, locked: true, lockedUntil: user.lockedUntil ?? '' },
        ...requestAuditContext(req),
      })
      return jsonResponse(
        { error: 'Account locked. Try again later.' },
        {
          status: 423,
          headers: { 'Retry-After': String(Math.ceil(lockState.retryAfterMs / 1000)) },
        },
      )
    }

    if (!user || user.status !== 'active' || !passwordOk) {
      const failureReason: LoginAttemptResult = !user
        ? 'no_user'
        : user.status !== 'active'
          ? 'account_disabled'
          : 'bad_password'

      await recordLoginAttempt(db, {
        emailNorm: email || null,
        ipAddress: ip,
        userId: user?.id ?? null,
        result: failureReason,
      })

      // Bump the per-account counter ONLY for the bad-password-against-active
      // branch. A "no such user" attempt is bound to the IP layer and the
      // login_attempts log; we don't speculatively penalise an account that
      // doesn't exist. A suspended/disabled account doesn't need its counter
      // raised either — the operator already gated it.
      let lockoutTriggered = false
      let triggeredLockedUntil: string | null = null
      if (user && user.status === 'active' && failureReason === 'bad_password') {
        const lockout = evaluateFailedAttempt(user.failedLoginCount)
        await recordFailedLoginAttempt(db, user.id, lockout.lockedUntil)
        if (lockout.triggered && lockout.lockedUntil) {
          lockoutTriggered = true
          triggeredLockedUntil = lockout.lockedUntil.toISOString()
          await createAuditEvent(db, {
            actorUserId: user.id,
            action: 'login.locked',
            targetType: 'user',
            targetId: user.id,
            metadata: {
              email,
              lockedUntil: triggeredLockedUntil,
              failedLoginCount: lockout.failedLoginCount,
            },
            ...requestAuditContext(req),
          })
        }
      }

      await createAuditEvent(db, {
        actorUserId: user?.id ?? null,
        action: 'login.failure',
        targetType: 'user',
        targetId: user?.id ?? null,
        metadata: { email, reason: failureReason },
        ...requestAuditContext(req),
      })

      if (lockoutTriggered && triggeredLockedUntil) {
        const retryAfterMs = Math.max(0, Date.parse(triggeredLockedUntil) - Date.now())
        return jsonResponse(
          { error: 'Account locked. Try again later.' },
          {
            status: 423,
            headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
          },
        )
      }
      return jsonResponse({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Successful login → release this user's bucket so a forgotten password
    // followed by a correct attempt doesn't continue eating into the quota.
    loginRateLimit.reset(rateLimitKey)

    const wasPreviouslyLocked = previouslyLocked(user)

    const token = createSessionToken()
    const expiresAt = sessionExpiry()
    await createSession(db, {
      idHash: await hashSessionToken(token),
      userId: user.id,
      expiresAt,
      mfaPassedAt: user.mfaEnabled ? null : new Date(),
      ...requestAuditContext(req),
    })

    if (user.mfaEnabled) {
      return setCookieHeader(
        jsonResponse({ ok: true, mfaRequired: true }),
        sessionCookie(req, token, expiresAt),
      )
    }

    await recordLoginAttempt(db, {
      emailNorm: email || null,
      ipAddress: ip,
      userId: user.id,
      result: 'success',
    })
    await markUserLoggedIn(db, user.id)

    if (wasPreviouslyLocked) {
      await createAuditEvent(db, {
        actorUserId: user.id,
        action: 'login.unlocked',
        targetType: 'user',
        targetId: user.id,
        metadata: { email },
        ...requestAuditContext(req),
      })
    }

    await createAuditEvent(db, {
      actorUserId: user.id,
      action: 'login.success',
      targetType: 'user',
      targetId: user.id,
      metadata: {},
      ...requestAuditContext(req),
    })

    return setCookieHeader(
      jsonResponse({ ok: true, mfaRequired: false }),
      sessionCookie(req, token, expiresAt),
    )
  }

  if (url.pathname === `${CMS_API_PREFIX}/auth/mfa/verify`) {
    if (req.method !== 'POST') return methodNotAllowed()
    const idHash = await getSessionHash(req)
    if (!idHash) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
    const user = await findUserByPendingMfaSessionHash(db, idHash)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

    const ip = clientIp(req)
    const rateLimitKey = ip ?? 'unknown'
    const decision = mfaRateLimit.consume(rateLimitKey)
    if (!decision.ok) {
      await recordLoginAttempt(db, {
        emailNorm: user.email.toLowerCase(),
        ipAddress: ip,
        userId: user.id,
        result: 'rate_limited',
      })
      return jsonResponse(
        { error: 'Too many MFA attempts. Try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(decision.retryAfterMs / 1000)) },
        },
      )
    }

    const body = await readJsonObject(req)
    const code = readString(body, 'code')
    const totpOk = user.mfaTotpSecret ? verifyTotpCode(user.mfaTotpSecret, code) : false
    const recoveryHash = findMatchingRecoveryCodeHash(code, user.mfaRecoveryCodeHashes)
    if (!totpOk && !recoveryHash) {
      await recordLoginAttempt(db, {
        emailNorm: user.email.toLowerCase(),
        ipAddress: ip,
        userId: user.id,
        result: 'mfa_failed',
      })
      await createAuditEvent(db, {
        actorUserId: user.id,
        action: 'login.failure',
        targetType: 'user',
        targetId: user.id,
        metadata: { reason: 'mfa' },
        ...requestAuditContext(req),
      })
      return jsonResponse({ error: 'Invalid authentication code' }, { status: 401 })
    }

    if (recoveryHash) {
      const consumed = await consumeUserRecoveryCodeHash(db, user.id, recoveryHash)
      if (!consumed) return jsonResponse({ error: 'Invalid authentication code' }, { status: 401 })
    }

    const nextToken = createSessionToken()
    const rotatedSession = await rotateSessionToken(db, idHash, {
      nextIdHash: await hashSessionToken(nextToken),
      mfaPassedAt: new Date(),
    })
    if (!rotatedSession) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

    await markUserLoggedIn(db, user.id)
    await recordLoginAttempt(db, {
      emailNorm: user.email.toLowerCase(),
      ipAddress: ip,
      userId: user.id,
      result: 'success',
    })
    mfaRateLimit.reset(rateLimitKey)
    await createAuditEvent(db, {
      actorUserId: user.id,
      action: 'login.success',
      targetType: 'user',
      targetId: user.id,
      metadata: { mfa: true, recoveryCodeUsed: Boolean(recoveryHash) },
      ...requestAuditContext(req),
    })
    return setCookieHeader(
      jsonResponse({ ok: true }),
      sessionCookie(req, nextToken, rotatedSession.expiresAt),
    )
  }

  if (url.pathname === `${CMS_API_PREFIX}/logout`) {
    if (req.method !== 'POST') return methodNotAllowed()
    const user = await requireAuthenticatedUser(req, db)
    const idHash = await getSessionHash(req)
    if (idHash) await revokeSessionByHash(db, idHash)
    if (!(user instanceof Response)) {
      await createAuditEvent(db, {
        actorUserId: user.id,
        action: 'logout',
        targetType: 'user',
        targetId: user.id,
        metadata: {},
        ...requestAuditContext(req),
      })
    }
    return setCookieHeader(jsonResponse({ ok: true }), clearSessionCookie(req))
  }

  if (url.pathname === `${CMS_API_PREFIX}/me`) {
    if (req.method !== 'GET') return methodNotAllowed()
    const user = await requireAuthenticatedUser(req, db)
    if (user instanceof Response) return user
    return jsonResponse({ user: toPublicUser(user), role: user.role, capabilities: user.capabilities })
  }

  // GET /admin/api/cms/auth/sessions — list the current user's live sessions.
  // Drives the Account → Sessions tab. The current session is flagged via
  // `isCurrent: true` so the UI can pin it and disable its "Sign out" action.
  if (url.pathname === `${CMS_API_PREFIX}/auth/sessions`) {
    if (req.method !== 'GET') return methodNotAllowed()
    const user = await requireAuthenticatedUser(req, db)
    if (user instanceof Response) return user
    const currentSessionHash = await getSessionHash(req)
    const sessions = await listSessionsForUser(db, user.id, currentSessionHash)
    return jsonResponse({ sessions })
  }

  // DELETE /admin/api/cms/auth/sessions/:id — revoke one of the current
  // user's sessions. The :id segment IS the session hash. Cross-user revoke
  // is blocked by the repo's `user_id = $userId` predicate.
  //
  // Revoking the *current* session is rejected with 400 to nudge clients to
  // use the regular `/logout` endpoint, which also clears the cookie. The
  // current cookie would otherwise remain on the client until next request.
  //
  // Step-up gated: the user must have re-entered their password within the
  // last 15 minutes — kicking another device off your account is sensitive
  // enough that we don't want a stolen cookie alone to enable it.
  const sessionDeleteMatch = url.pathname.match(
    new RegExp(`^${CMS_API_PREFIX}/auth/sessions/([^/]+)$`),
  )
  if (sessionDeleteMatch) {
    if (req.method !== 'DELETE') return methodNotAllowed()
    const user = await requireStepUp(req, db)
    if (user instanceof Response) return user
    const targetHash = sessionDeleteMatch[1]
    if (!targetHash) return jsonResponse({ error: 'Invalid session id' }, { status: 400 })
    const currentSessionHash = await getSessionHash(req)
    if (currentSessionHash && currentSessionHash === targetHash) {
      return jsonResponse(
        { error: 'Use POST /logout to sign out the current session.' },
        { status: 400 },
      )
    }
    const revoked = await revokeSessionByHashForUser(db, targetHash, user.id)
    if (!revoked) return jsonResponse({ error: 'Session not found' }, { status: 404 })
    await createAuditEvent(db, {
      actorUserId: user.id,
      action: 'logout',
      targetType: 'user',
      targetId: user.id,
      metadata: { scope: 'device' },
      ...requestAuditContext(req),
    })
    return jsonResponse({ ok: true })
  }

  // POST /admin/api/cms/auth/step-up — re-authenticate with the current
  // user's password to open a 15-minute step-up window on the active
  // session. Sensitive endpoints (delete user, revoke device, sign out
  // all devices) call `requireStepUp(req, db)` and return 401
  // `{ error: 'step_up_required' }` when the window is closed; the client
  // shows a step-up dialog that POSTs here, then retries the original
  // request after a 200.
  //
  // Locked accounts cannot open a step-up window (the lockout policy
  // blocks login too — same threat model). Failed step-up attempts are
  // recorded in `login_attempts` with `result: 'bad_password'` so the
  // forensic trail captures them.
  if (url.pathname === `${CMS_API_PREFIX}/auth/step-up`) {
    if (req.method !== 'POST') return methodNotAllowed()
    const user = await requireAuthenticatedUser(req, db)
    if (user instanceof Response) return user
    const idHash = await getSessionHash(req)
    if (!idHash) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

    // Mirror login's locked-account check so a compromised cookie can't
    // brute-force the password through step-up.
    const lockState = evaluateLockState(user.lockedUntil)
    if (lockState.locked) {
      return jsonResponse(
        { error: 'Account locked. Try again later.' },
        {
          status: 423,
          headers: { 'Retry-After': String(Math.ceil(lockState.retryAfterMs / 1000)) },
        },
      )
    }

    const ip = clientIp(req)
    if (ip) {
      const ipDecision = loginPerIpRateLimit.consume(ip)
      if (!ipDecision.ok) {
        return recordStepUpRateLimit(db, req, user, ip, 'ip', ipDecision.retryAfterMs)
      }
    }

    const rateLimitKey = `${ip ?? 'unknown'}|${user.email.toLowerCase()}`
    const decision = loginRateLimit.consume(rateLimitKey)
    if (!decision.ok) {
      return recordStepUpRateLimit(db, req, user, ip, 'tuple', decision.retryAfterMs)
    }

    const body = await readJsonObject(req)
    const password = readString(body, 'password')
    const mfaCode = readString(body, 'mfaCode')
    const passwordOk = await verifyPassword(password, user.passwordHash)
    if (!passwordOk) {
      return recordStepUpPasswordFailure(db, req, user, ip)
    }
    loginRateLimit.reset(rateLimitKey)

    let refreshedUser = user
    if (user.mfaEnabled) {
      if (!mfaCode) {
        return jsonResponse({ error: 'Authentication code required' }, { status: 401 })
      }

      const rateLimitKey = ip ?? 'unknown'
      const mfaDecision = mfaRateLimit.consume(rateLimitKey)
      if (!mfaDecision.ok) {
        await recordLoginAttempt(db, {
          emailNorm: user.email.toLowerCase(),
          ipAddress: ip,
          userId: user.id,
          result: 'rate_limited',
        })
        return jsonResponse(
          { error: 'Too many MFA attempts. Try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil(mfaDecision.retryAfterMs / 1000)) },
          },
        )
      }

      const totpOk = (() => {
        try {
          return user.mfaTotpSecret ? verifyTotpCode(user.mfaTotpSecret, mfaCode) : false
        } catch {
          return false
        }
      })()
      const recoveryHash = findMatchingRecoveryCodeHash(mfaCode, user.mfaRecoveryCodeHashes)
      if (!totpOk && !recoveryHash) {
        await recordLoginAttempt(db, {
          emailNorm: user.email.toLowerCase(),
          ipAddress: ip,
          userId: user.id,
          result: 'mfa_failed',
        })
        await createAuditEvent(db, {
          actorUserId: user.id,
          action: 'login.failure',
          targetType: 'user',
          targetId: user.id,
          metadata: { reason: 'step_up_mfa' },
          ...requestAuditContext(req),
        })
        return jsonResponse({ error: 'Invalid authentication code' }, { status: 401 })
      }

      if (recoveryHash) {
        const consumed = await consumeUserRecoveryCodeHash(db, user.id, recoveryHash)
        if (!consumed) return jsonResponse({ error: 'Invalid authentication code' }, { status: 401 })
        refreshedUser = await findUserById(db, user.id) ?? user
      }

      mfaRateLimit.reset(rateLimitKey)
    }

    const expiresAt = new Date(Date.now() + STEP_UP_WINDOW_MS)
    const nextToken = createSessionToken()
    const rotatedSession = await rotateSessionToken(db, idHash, {
      nextIdHash: await hashSessionToken(nextToken),
      stepUpExpiresAt: expiresAt,
    })
    if (!rotatedSession) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

    return setCookieHeader(
      jsonResponse({
        ok: true,
        stepUpExpiresAt: expiresAt.toISOString(),
        user: toPublicUser(refreshedUser),
      }),
      sessionCookie(req, nextToken, rotatedSession.expiresAt),
    )
  }

  // GET /admin/api/cms/auth/activity — login activity feed for the current
  // user. Drives the Account → Activity tab. Combines `user_id`-matched rows
  // with pre-lookup IP attempts that mention the user's email.
  if (url.pathname === `${CMS_API_PREFIX}/auth/activity`) {
    if (req.method !== 'GET') return methodNotAllowed()
    const user = await requireAuthenticatedUser(req, db)
    if (user instanceof Response) return user
    const events = await listLoginActivityForUser(db, user.id, user.email.toLowerCase())
    return jsonResponse({ events })
  }

  // POST /admin/api/cms/auth/logout-all — revoke every other live session
  // for the current user. The current cookie is intentionally preserved so
  // the user issuing the action stays signed in. Step-up gated — wholesale
  // device wipe is the highest-blast-radius session action we expose.
  if (url.pathname === `${CMS_API_PREFIX}/auth/logout-all`) {
    if (req.method !== 'POST') return methodNotAllowed()
    const user = await requireStepUp(req, db)
    if (user instanceof Response) return user
    const currentSessionHash = await getSessionHash(req)
    const revokedCount = await revokeAllOtherSessions(db, user.id, currentSessionHash)
    await createAuditEvent(db, {
      actorUserId: user.id,
      action: 'logout',
      targetType: 'user',
      targetId: user.id,
      metadata: { scope: 'all_other_devices', revokedCount },
      ...requestAuditContext(req),
    })
    return jsonResponse({ ok: true, revokedCount })
  }

  return null
}
