export interface SiteRow {
  id: string
  name: string
  settings_json: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

export interface AdminUserRow {
  id: string
  email: string
  password_hash: string
  created_at: Date | string
}

export interface SessionRow {
  id_hash: string
  admin_user_id: string
  expires_at: Date | string
  created_at: Date | string
}
