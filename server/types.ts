export interface SiteRow {
  id: string
  name: string
  settings_json: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

export type UserStatus = 'active' | 'suspended'

export interface RoleRow {
  id: string
  slug: string
  name: string
  description: string
  is_system: boolean | number
  capabilities_json: unknown
  created_at: Date | string
  updated_at: Date | string
}

export interface UserRow {
  id: string
  email: string
  email_normalized: string
  display_name: string
  password_hash: string
  status: UserStatus
  role_id: string
  last_login_at: Date | string | null
  failed_login_count: number
  locked_until: Date | string | null
  avatar_media_id: string | null
  password_updated_at: Date | string | null
  mfa_enabled: boolean | number
  mfa_enabled_at: Date | string | null
  mfa_totp_secret: string | null
  mfa_recovery_code_hashes_json: unknown
  created_at: Date | string
  updated_at: Date | string
  deleted_at: Date | string | null
}

export interface SessionRow {
  id_hash: string
  user_id: string
  device_label: string
  ip_address: string | null
  user_agent: string | null
  created_at: Date | string
  last_seen_at: Date | string
  expires_at: Date | string
  revoked_at: Date | string | null
  mfa_passed_at: Date | string | null
  step_up_expires_at: Date | string | null
}
