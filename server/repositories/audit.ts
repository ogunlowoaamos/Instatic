import { nanoid } from 'nanoid'
import type { DbClient } from '../db/client'
import { Type, Value, type Static } from '@core/utils/typeboxHelpers'

const AuditActionSchema = Type.Union([
  Type.Literal('login.success'),
  Type.Literal('login.failure'),
  Type.Literal('logout'),
  Type.Literal('user.create'),
  Type.Literal('user.update'),
  Type.Literal('user.delete'),
  Type.Literal('user.suspend'),
  Type.Literal('password.change'),
  Type.Literal('role.create'),
  Type.Literal('role.update'),
  Type.Literal('role.delete'),
  Type.Literal('role.assign'),
  Type.Literal('content.collection.create'),
  Type.Literal('content.collection.update'),
  Type.Literal('content.collection.delete'),
  Type.Literal('content.entry.create'),
  Type.Literal('content.entry.update'),
  Type.Literal('content.entry.delete'),
  Type.Literal('content.entry.publish'),
  Type.Literal('content.entry.status'),
  Type.Literal('content.entry.move'),
  Type.Literal('content.author.assign'),
  Type.Literal('publish'),
  Type.Literal('plugin.install'),
  Type.Literal('plugin.enable'),
  Type.Literal('plugin.disable'),
  Type.Literal('plugin.delete'),
])

const AuditMetadataSchema = Type.Record(
  Type.String(),
  Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null(), Type.Array(Type.String())]),
)

export type AuditAction = Static<typeof AuditActionSchema>
export type AuditMetadata = Static<typeof AuditMetadataSchema>

interface AuditEventRow {
  id: string
  actor_user_id: string | null
  action: AuditAction
  target_type: string | null
  target_id: string | null
  metadata_json: unknown
  ip_address: string | null
  user_agent: string | null
  created_at: Date | string
}

interface AuditUserLabelRow {
  id: string
  email: string
  display_name: string
}

interface AuditRoleLabelRow {
  id: string
  name: string
}

interface AuditEventLabels {
  actorLabel: string | null
  targetLabel: string | null
  metadataLabels: Record<string, string>
}

export interface AuditEvent {
  id: string
  actorUserId: string | null
  action: AuditAction
  targetType: string | null
  targetId: string | null
  metadata: AuditMetadata
  actorLabel: string | null
  targetLabel: string | null
  metadataLabels: Record<string, string>
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

function normalizeMetadata(value: unknown): AuditMetadata {
  return Value.Check(AuditMetadataSchema, value) ? Value.Decode(AuditMetadataSchema, value) : {}
}

function userAuditLabel(row: AuditUserLabelRow): string {
  return row.display_name.trim() || row.email || row.id
}

function metadataString(metadata: AuditMetadata, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function rowToAuditEvent(row: AuditEventRow, metadata: AuditMetadata, labels: AuditEventLabels): AuditEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata,
    actorLabel: labels.actorLabel,
    targetLabel: labels.targetLabel,
    metadataLabels: labels.metadataLabels,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

async function auditLabelMaps(db: DbClient): Promise<{
  usersById: Map<string, string>
  rolesById: Map<string, string>
}> {
  const [usersResult, rolesResult] = await Promise.all([
    db<AuditUserLabelRow>`select id, email, display_name from users`,
    db<AuditRoleLabelRow>`select id, name from roles`,
  ])

  const usersById = new Map<string, string>()
  for (const row of usersResult.rows) {
    usersById.set(row.id, userAuditLabel(row))
  }

  const rolesById = new Map<string, string>()
  for (const row of rolesResult.rows) {
    rolesById.set(row.id, row.name)
  }

  return { usersById, rolesById }
}

function labelsForAuditEvent(
  row: AuditEventRow,
  metadata: AuditMetadata,
  maps: { usersById: Map<string, string>; rolesById: Map<string, string> },
): AuditEventLabels {
  const metadataLabels: Record<string, string> = {}
  const roleId = metadataString(metadata, 'roleId')
  if (roleId) {
    const roleLabel = maps.rolesById.get(roleId)
    if (roleLabel) metadataLabels.roleId = roleLabel
  }

  const actorLabel = row.actor_user_id ? maps.usersById.get(row.actor_user_id) ?? null : null
  const targetLabel = row.target_type === 'user' && row.target_id
    ? maps.usersById.get(row.target_id) ?? null
    : row.target_type === 'role' && row.target_id
      ? maps.rolesById.get(row.target_id) ?? metadataString(metadata, 'name') ?? metadataString(metadata, 'slug')
      : null

  return { actorLabel, targetLabel, metadataLabels }
}

export async function createAuditEvent(
  db: DbClient,
  input: {
    actorUserId: string | null
    action: AuditAction
    targetType?: string | null
    targetId?: string | null
    metadata?: AuditMetadata
    ipAddress?: string | null
    userAgent?: string | null
  },
): Promise<void> {
  await db`
    insert into audit_events (id, actor_user_id, action, target_type, target_id, metadata_json, ip_address, user_agent)
    values (
      ${nanoid()},
      ${input.actorUserId},
      ${input.action},
      ${input.targetType ?? null},
      ${input.targetId ?? null},
      ${input.metadata ?? {}},
      ${input.ipAddress ?? null},
      ${input.userAgent ?? null}
    )
  `
}

export async function listAuditEvents(db: DbClient, limit = 100): Promise<AuditEvent[]> {
  const { rows } = await db<AuditEventRow>`
    select id, actor_user_id, action, target_type, target_id, metadata_json, ip_address, user_agent, created_at
    from audit_events
    order by created_at desc
    limit ${limit}
  `
  const maps = await auditLabelMaps(db)
  return rows.map((row) => {
    const metadata = normalizeMetadata(row.metadata_json)
    return rowToAuditEvent(row, metadata, labelsForAuditEvent(row, metadata, maps))
  })
}
