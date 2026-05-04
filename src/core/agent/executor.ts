/**
 * Phase D — Agent tool executor.
 *
 * Maps agent action objects (from the server NDJSON stream) to Zustand
 * store calls. All inputs are validated with TypeBox before touching the store
 * (Constraint #272 — all tool calls must pass validation before dispatch).
 *
 * Constraint #283/#286: No Anthropic SDK imports here.
 */

import { Type, type Static, parseValue } from '@core/utils/typeboxHelpers'
import type { EditorStore } from '../editor-store/types'
import { registry } from '../module-engine/registry'
import { sanitizeRichtext, isRichtextPropKey } from '../sanitize'
import { getAgentStoreApi } from './storeRef'
import type {
  AgentAction,
  AgentActionResult,
  InsertTreeNode,
} from './types'

// Live access to the editor store. Routed through `./storeRef` so this module
// has no static import edge back into `editor-store/store.ts` — that's how the
// executor → store → agentSlice → executor runtime cycle is broken.
const getStoreState = (): EditorStore => getAgentStoreApi<EditorStore>().getState()
const setStoreState = (partial: Partial<EditorStore>): void =>
  getAgentStoreApi<EditorStore>().setState(partial)

// ---------------------------------------------------------------------------
// Per-action TypeBox schemas (Constraint #272)
// ---------------------------------------------------------------------------

const insertNodeSchema = Type.Object({
  type: Type.Literal('insertNode'),
  moduleId: Type.String({ minLength: 1 }),
  parentId: Type.Optional(Type.String({ minLength: 1 })),
  parentRef: Type.Optional(Type.String({ minLength: 1 })),
  ref: Type.Optional(Type.String({ minLength: 1 })),
  index: Type.Optional(Type.Integer({ minimum: 0 })),
  props: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  classIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
})

// Cross-field invariant: either parentId or parentRef must be provided.
function hasInsertNodeParent(value: Static<typeof insertNodeSchema>): boolean {
  return Boolean(value.parentId || value.parentRef)
}

const classStylePatchSchema = Type.Record(
  Type.String(),
  Type.Union([Type.String(), Type.Number()]),
)

const classBreakpointStylesSchema = Type.Record(
  Type.String({ minLength: 1 }),
  classStylePatchSchema,
)

const classDefinitionSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  styles: Type.Optional(classStylePatchSchema),
  breakpointStyles: Type.Optional(classBreakpointStylesSchema),
})

const insertTreeNodeSchema = Type.Recursive((Self) =>
  Type.Object({
    moduleId: Type.String({ minLength: 1 }),
    ref: Type.Optional(Type.String({ minLength: 1 })),
    props: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    classIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    children: Type.Optional(Type.Array(Self)),
  }),
)

const insertTreeSchema = Type.Object({
  type: Type.Literal('insertTree'),
  parentId: Type.Optional(Type.String({ minLength: 1 })),
  parentRef: Type.Optional(Type.String({ minLength: 1 })),
  index: Type.Optional(Type.Integer({ minimum: 0 })),
  classes: Type.Optional(Type.Array(classDefinitionSchema)),
  tree: insertTreeNodeSchema,
})

// Cross-field invariant: either parentId or parentRef must be provided.
function hasInsertTreeParent(value: Static<typeof insertTreeSchema>): boolean {
  return Boolean(value.parentId || value.parentRef)
}

const deleteNodeSchema = Type.Object({
  type: Type.Literal('deleteNode'),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  nodeRef: Type.Optional(Type.String({ minLength: 1 })),
})

// Cross-field invariant: either nodeId or nodeRef must be provided.
function hasDeleteNodeTarget(value: Static<typeof deleteNodeSchema>): boolean {
  return Boolean(value.nodeId || value.nodeRef)
}

const updateNodePropsSchema = Type.Object({
  type: Type.Literal('updateNodeProps'),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  nodeRef: Type.Optional(Type.String({ minLength: 1 })),
  breakpointId: Type.Optional(Type.String({ minLength: 1 })),
  patch: Type.Record(Type.String(), Type.Unknown()),
})

// Cross-field invariant: either nodeId or nodeRef must be provided.
function hasUpdateNodeTarget(value: Static<typeof updateNodePropsSchema>): boolean {
  return Boolean(value.nodeId || value.nodeRef)
}

const moveNodeSchema = Type.Object({
  type: Type.Literal('moveNode'),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  nodeRef: Type.Optional(Type.String({ minLength: 1 })),
  newParentId: Type.Optional(Type.String({ minLength: 1 })),
  newParentRef: Type.Optional(Type.String({ minLength: 1 })),
  newIndex: Type.Integer({ minimum: 0 }),
})

// Cross-field invariant 1: either nodeId or nodeRef must be provided.
function hasMoveNodeSource(value: Static<typeof moveNodeSchema>): boolean {
  return Boolean(value.nodeId || value.nodeRef)
}

// Cross-field invariant 2: either newParentId or newParentRef must be provided.
function hasMoveNodeDestination(value: Static<typeof moveNodeSchema>): boolean {
  return Boolean(value.newParentId || value.newParentRef)
}

const renameNodeSchema = Type.Object({
  type: Type.Literal('renameNode'),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  nodeRef: Type.Optional(Type.String({ minLength: 1 })),
  label: Type.String({ minLength: 1 }),
})

// Cross-field invariant: either nodeId or nodeRef must be provided.
function hasRenameNodeTarget(value: Static<typeof renameNodeSchema>): boolean {
  return Boolean(value.nodeId || value.nodeRef)
}

const createClassSchema = Type.Object({
  type: Type.Literal('createClass'),
  name: Type.String({ minLength: 1 }),
  styles: Type.Optional(classStylePatchSchema),
  breakpointStyles: Type.Optional(classBreakpointStylesSchema),
})

const updateClassStylesSchema = Type.Object({
  type: Type.Literal('updateClassStyles'),
  classId: Type.String({ minLength: 1 }),
  breakpointId: Type.Optional(Type.String({ minLength: 1 })),
  patch: classStylePatchSchema,
})

const assignClassSchema = Type.Object({
  type: Type.Literal('assignClass'),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  nodeRef: Type.Optional(Type.String({ minLength: 1 })),
  classId: Type.String({ minLength: 1 }),
})

// Cross-field invariant: either nodeId or nodeRef must be provided.
function hasAssignClassTarget(value: Static<typeof assignClassSchema>): boolean {
  return Boolean(value.nodeId || value.nodeRef)
}

const removeClassSchema = Type.Object({
  type: Type.Literal('removeClass'),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  nodeRef: Type.Optional(Type.String({ minLength: 1 })),
  classId: Type.String({ minLength: 1 }),
})

// Cross-field invariant: either nodeId or nodeRef must be provided.
function hasRemoveClassTarget(value: Static<typeof removeClassSchema>): boolean {
  return Boolean(value.nodeId || value.nodeRef)
}

const addPageSchema = Type.Object({
  type: Type.Literal('addPage'),
  title: Type.String({ minLength: 1 }),
  slug: Type.Optional(Type.String()),
})

const updateSiteSettingsSchema = Type.Object({
  type: Type.Literal('updateSiteSettings'),
  patch: Type.Record(Type.String(), Type.Unknown()),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a classId that may be either a real nanoid (checked first) or a
 * class name (fallback lookup).  Returns the resolved ID string, or null if
 * no matching class is found.
 *
 * This bridges the "same-batch ID gap": the agent can't know the nanoid
 * assigned to a class it just created, so it's allowed to pass the class
 * *name* in assignClass / updateClassStyles / removeClass.  The executor
 * transparently resolves it here so callers never need to worry about it.
 */
function resolveClassId(
  store: EditorStore,
  classIdOrName: string,
): string | null {
  const classes = store.site?.classes
  if (!classes) return null
  // Direct ID match (fast path)
  if (classes[classIdOrName]) return classIdOrName
  // Name-based fallback — use filter instead of find so we can detect ambiguity.
  // Uniqueness is enforced at createClass/renameClass time (classSlice), but this
  // guard provides defense-in-depth: if two classes somehow share a name, refuse to
  // guess rather than silently picking the wrong one.
  const matches = Object.values(classes).filter((c) => c.name === classIdOrName)
  if (matches.length > 1) return null // ambiguous — fail safely
  return matches[0]?.id ?? null
}

interface AgentExecutionContext {
  nodeRefs: Map<string, string>
}

type AgentBatchSnapshot = Pick<
  EditorStore,
  | 'site'
  | 'activePageId'
  | 'activeDocument'
  | 'selectedNodeId'
  | 'hoveredNodeId'
  | 'activeClassId'
  | 'hasUnsavedChanges'
  | '_historyPast'
  | '_historyFuture'
  | 'canUndo'
  | 'canRedo'
>

const EMPTY_TREE_CHILDREN: InsertTreeNode[] = []
const EMPTY_TREE_CLASS_IDS: string[] = []
const EMPTY_PROPS: Record<string, unknown> = {}
const EMPTY_CLASS_STYLES: Record<string, string | number> = {}
const EMPTY_BREAKPOINT_STYLES: Record<string, Record<string, string | number>> = {}

function cloneSerializable<T>(value: T): T {
  return value === null || value === undefined ? value : structuredClone(value)
}

function takeBatchSnapshot(): AgentBatchSnapshot {
  const state = getStoreState()
  return {
    site: cloneSerializable(state.site),
    activePageId: state.activePageId,
    activeDocument: cloneSerializable(state.activeDocument),
    selectedNodeId: state.selectedNodeId,
    hoveredNodeId: state.hoveredNodeId,
    activeClassId: state.activeClassId,
    hasUnsavedChanges: state.hasUnsavedChanges,
    _historyPast: cloneSerializable(state._historyPast),
    _historyFuture: cloneSerializable(state._historyFuture),
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  }
}

function restoreBatchSnapshot(snapshot: AgentBatchSnapshot): void {
  setStoreState({
    ...snapshot,
    site: cloneSerializable(snapshot.site),
    activeDocument: cloneSerializable(snapshot.activeDocument),
    _historyPast: cloneSerializable(snapshot._historyPast),
    _historyFuture: cloneSerializable(snapshot._historyFuture),
  })
}

function resolveParentId(
  action: Static<typeof insertNodeSchema>,
  context: AgentExecutionContext | undefined,
): string | null {
  if (action.parentRef) {
    return context?.nodeRefs.get(action.parentRef) ?? null
  }
  return action.parentId ?? null
}

function resolveTreeParentId(
  action: Static<typeof insertTreeSchema>,
  context: AgentExecutionContext | undefined,
): string | null {
  if (action.parentRef) {
    return context?.nodeRefs.get(action.parentRef) ?? null
  }
  return action.parentId ?? null
}

function resolveNodeId(
  action: { nodeId?: string; nodeRef?: string },
  context: AgentExecutionContext | undefined,
): string | null {
  if (action.nodeRef) {
    return context?.nodeRefs.get(action.nodeRef) ?? null
  }
  return action.nodeId ?? null
}

function resolveMoveParentId(
  action: Static<typeof moveNodeSchema>,
  context: AgentExecutionContext | undefined,
): string | null {
  if (action.newParentRef) {
    return context?.nodeRefs.get(action.newParentRef) ?? null
  }
  return action.newParentId ?? null
}

function resolveOrCreateClassId(
  store: EditorStore,
  classIdOrName: string,
  styles: Record<string, string | number> = {},
): string | null {
  const resolved = resolveClassId(store, classIdOrName)
  if (resolved) return resolved

  try {
    return store.createClass(classIdOrName, styles).id
  } catch {
    return null
  }
}

function resolveKnownClassIds(
  store: EditorStore,
  classIdsOrNames: string[],
): { classIds: string[]; missing: null } | { classIds: null; missing: string } {
  const resolved: string[] = []
  for (const classIdOrName of classIdsOrNames) {
    const classId = resolveClassId(store, classIdOrName)
    if (!classId) return { classIds: null, missing: classIdOrName }
    if (!resolved.includes(classId)) resolved.push(classId)
  }
  return { classIds: resolved, missing: null }
}

function ensureClassIdWithStyles(
  store: EditorStore,
  classIdOrName: string,
  styles: Record<string, string | number> = {},
  breakpointStyles: Record<string, Record<string, string | number>> = {},
): string | null {
  const breakpointError = validateBreakpointStyles(store, breakpointStyles)
  if (breakpointError) return null
  const classId = resolveOrCreateClassId(store, classIdOrName, styles)
  if (!classId) return null
  if (Object.keys(styles).length > 0) {
    store.updateClassStyles(classId, styles)
  }
  applyClassBreakpointStyles(store, classId, breakpointStyles)
  return classId
}

function validateBreakpointId(
  store: EditorStore,
  breakpointId: string,
): string | null {
  const site = store.site
  if (!site) return `Breakpoint not found: ${breakpointId}`
  return site.breakpoints.some((breakpoint) => breakpoint.id === breakpointId)
    ? null
    : `Breakpoint not found: ${breakpointId}`
}

function validateBreakpointStyles(
  store: EditorStore,
  breakpointStyles: Record<string, Record<string, string | number>>,
): string | null {
  for (const breakpointId of Object.keys(breakpointStyles)) {
    const error = validateBreakpointId(store, breakpointId)
    if (error) return error
  }
  return null
}

function applyClassBreakpointStyles(
  store: EditorStore,
  classId: string,
  breakpointStyles: Record<string, Record<string, string | number>>,
): void {
  for (const [breakpointId, styles] of Object.entries(breakpointStyles)) {
    if (Object.keys(styles).length > 0) {
      store.setClassBreakpointStyles(classId, breakpointId, styles)
    }
  }
}

function validateRegisteredModule(moduleId: string): string | null {
  const mod = registry.get(moduleId)
  if (!mod) return `Module not found: ${moduleId}`
  if (typeof mod.component !== 'function') return `Module component unavailable: ${moduleId}`
  return null
}

function validateTreeModules(node: InsertTreeNode): string | null {
  const moduleError = validateRegisteredModule(node.moduleId)
  if (moduleError) return moduleError
  for (const child of node.children ?? EMPTY_TREE_CHILDREN) {
    const childError = validateTreeModules(child)
    if (childError) return childError
  }
  return null
}

function sanitizeNodeProps(props: Record<string, unknown>): Record<string, unknown> {
  const sanitizedProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    sanitizedProps[key] = isRichtextPropKey(key) && typeof value === 'string'
      ? sanitizeRichtext(value)
      : value
  }
  return sanitizedProps
}

function ensureTreeClassIds(
  store: EditorStore,
  node: InsertTreeNode,
): string | null {
  const resolved = resolveKnownClassIds(store, node.classIds ?? EMPTY_TREE_CLASS_IDS)
  if (resolved.missing) return resolved.missing
  for (const child of node.children ?? EMPTY_TREE_CHILDREN) {
    const unresolved = ensureTreeClassIds(store, child)
    if (unresolved) return unresolved
  }
  return null
}

function insertTreeNode(
  store: EditorStore,
  node: InsertTreeNode,
  parentId: string,
  index: number | undefined,
  context: AgentExecutionContext | undefined,
): string {
  const nodeId = store.insertNode(
    node.moduleId,
    sanitizeNodeProps(node.props ?? EMPTY_PROPS),
    parentId,
    index,
  )
  if (node.ref) context?.nodeRefs.set(node.ref, nodeId)

  const resolved = resolveKnownClassIds(store, node.classIds ?? EMPTY_TREE_CLASS_IDS)
  const classIds = resolved.classIds ?? EMPTY_TREE_CLASS_IDS
  for (const classId of classIds) {
    store.addNodeClass(nodeId, classId)
  }

  for (const child of node.children ?? EMPTY_TREE_CHILDREN) {
    insertTreeNode(store, child, nodeId, undefined, context)
  }

  return nodeId
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute a single agent action against the Zustand store.
 *
 * Validates the action with TypeBox before dispatch (Constraint #272).
 * Returns `{ success: true, nodeId? }` or `{ success: false, error }`.
 */
export async function executeAgentAction(
  action: AgentAction,
  context?: AgentExecutionContext,
): Promise<AgentActionResult> {
  const store = getStoreState()

  try {
    switch (action.type) {
      case 'insertNode': {
        const a = parseValue(insertNodeSchema, action)
        if (!hasInsertNodeParent(a)) {
          return { success: false, error: 'Either parentId or parentRef is required' }
        }
        const moduleError = validateRegisteredModule(a.moduleId)
        if (moduleError) return { success: false, error: moduleError }
        const parentId = resolveParentId(a, context)
        if (!parentId) {
          const ref = a.parentRef ? `parentRef "${a.parentRef}"` : 'parentId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        const resolvedClassIds = resolveKnownClassIds(store, a.classIds ?? EMPTY_TREE_CLASS_IDS)
        if (resolvedClassIds.missing) {
          return { success: false, error: `Class not found: ${resolvedClassIds.missing}` }
        }
        const classIds = resolvedClassIds.classIds
        if (!classIds) {
          return { success: false, error: 'One or more classes could not be resolved for insertNode' }
        }
        // Sanitize richtext-keyed props before writing to store (Constraint #299)
        const sanitizedProps = sanitizeNodeProps(a.props ?? EMPTY_PROPS)
        const nodeId = store.insertNode(
          a.moduleId,
          sanitizedProps,
          parentId,
          a.index,
        )
        if (a.ref) context?.nodeRefs.set(a.ref, nodeId)
        for (const classId of classIds) {
          store.addNodeClass(nodeId, classId)
        }
        return { success: true, nodeId }
      }

      case 'insertTree': {
        const a = parseValue(insertTreeSchema, action)
        if (!hasInsertTreeParent(a)) {
          return { success: false, error: 'Either parentId or parentRef is required' }
        }
        const parentId = resolveTreeParentId(a, context)
        if (!parentId) {
          const ref = a.parentRef ? `parentRef "${a.parentRef}"` : 'parentId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        const moduleError = validateTreeModules(a.tree as InsertTreeNode)
        if (moduleError) return { success: false, error: moduleError }

        for (const classDef of (a.classes ?? [])) {
          const breakpointError = validateBreakpointStyles(
            getStoreState(),
            classDef.breakpointStyles ?? EMPTY_BREAKPOINT_STYLES,
          )
          if (breakpointError) return { success: false, error: breakpointError }
        }

        for (const classDef of (a.classes ?? [])) {
          const classId = ensureClassIdWithStyles(
            getStoreState(),
            classDef.name,
            classDef.styles ?? EMPTY_CLASS_STYLES,
            classDef.breakpointStyles ?? EMPTY_BREAKPOINT_STYLES,
          )
          if (!classId) return { success: false, error: `Class could not be created: ${classDef.name}` }
        }

        const unresolvedClass = ensureTreeClassIds(getStoreState(), a.tree as InsertTreeNode)
        if (unresolvedClass) {
          return { success: false, error: `Class could not be resolved: ${unresolvedClass}` }
        }

        const nodeId = insertTreeNode(getStoreState(), a.tree as InsertTreeNode, parentId, a.index, context)
        return { success: true, nodeId }
      }

      case 'deleteNode': {
        const a = parseValue(deleteNodeSchema, action)
        if (!hasDeleteNodeTarget(a)) {
          return { success: false, error: 'Either nodeId or nodeRef is required' }
        }
        const nodeId = resolveNodeId(a, context)
        if (!nodeId) {
          const ref = a.nodeRef ? `nodeRef "${a.nodeRef}"` : 'nodeId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        store.deleteNode(nodeId)
        return { success: true }
      }

      case 'updateNodeProps': {
        const a = parseValue(updateNodePropsSchema, action)
        if (!hasUpdateNodeTarget(a)) {
          return { success: false, error: 'Either nodeId or nodeRef is required' }
        }
        const nodeId = resolveNodeId(a, context)
        if (!nodeId) {
          const ref = a.nodeRef ? `nodeRef "${a.nodeRef}"` : 'nodeId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        // Sanitize richtext-keyed props before writing to store (Constraint #299)
        const sanitizedPatch: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(a.patch)) {
          sanitizedPatch[key] = isRichtextPropKey(key) && typeof value === 'string'
            ? sanitizeRichtext(value)
            : value
        }
        if (a.breakpointId) {
          const breakpointError = validateBreakpointId(store, a.breakpointId)
          if (breakpointError) return { success: false, error: breakpointError }
          store.setBreakpointOverride(nodeId, a.breakpointId, sanitizedPatch)
        } else {
          store.updateNodeProps(nodeId, sanitizedPatch)
        }
        return { success: true }
      }

      case 'moveNode': {
        const a = parseValue(moveNodeSchema, action)
        if (!hasMoveNodeSource(a)) {
          return { success: false, error: 'Either nodeId or nodeRef is required' }
        }
        if (!hasMoveNodeDestination(a)) {
          return { success: false, error: 'Either newParentId or newParentRef is required' }
        }
        const nodeId = resolveNodeId(a, context)
        if (!nodeId) {
          const ref = a.nodeRef ? `nodeRef "${a.nodeRef}"` : 'nodeId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        const newParentId = resolveMoveParentId(a, context)
        if (!newParentId) {
          const ref = a.newParentRef ? `newParentRef "${a.newParentRef}"` : 'newParentId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        store.moveNode(nodeId, newParentId, a.newIndex)
        return { success: true }
      }

      case 'renameNode': {
        const a = parseValue(renameNodeSchema, action)
        if (!hasRenameNodeTarget(a)) {
          return { success: false, error: 'Either nodeId or nodeRef is required' }
        }
        const nodeId = resolveNodeId(a, context)
        if (!nodeId) {
          const ref = a.nodeRef ? `nodeRef "${a.nodeRef}"` : 'nodeId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        store.renameNode(nodeId, a.label)
        return { success: true }
      }

      case 'createClass': {
        const a = parseValue(createClassSchema, action)
        const breakpointError = validateBreakpointStyles(
          store,
          a.breakpointStyles ?? EMPTY_BREAKPOINT_STYLES,
        )
        if (breakpointError) return { success: false, error: breakpointError }
        const cls = store.createClass(
          a.name,
          a.styles ?? EMPTY_CLASS_STYLES,
        )
        applyClassBreakpointStyles(
          store,
          cls.id,
          a.breakpointStyles ?? EMPTY_BREAKPOINT_STYLES,
        )
        return { success: true, nodeId: cls.id }
      }

      case 'updateClassStyles': {
        const a = parseValue(updateClassStylesSchema, action)
        // Resolve classId by ID first, then fall back to name lookup.
        // This lets the agent reference a class it just created in the same
        // batch by name (since nanoid IDs are unknown at generation time).
        const ucsResolvedId = resolveOrCreateClassId(
          store,
          a.classId,
          a.patch,
        )
        if (!ucsResolvedId) return { success: false, error: `Class not found: ${a.classId}` }
        if (a.breakpointId) {
          const breakpointError = validateBreakpointId(store, a.breakpointId)
          if (breakpointError) return { success: false, error: breakpointError }
          store.setClassBreakpointStyles(
            ucsResolvedId,
            a.breakpointId,
            a.patch,
          )
        } else {
          store.updateClassStyles(
            ucsResolvedId,
            a.patch,
          )
        }
        return { success: true }
      }

      case 'assignClass': {
        const a = parseValue(assignClassSchema, action)
        if (!hasAssignClassTarget(a)) {
          return { success: false, error: 'Either nodeId or nodeRef is required' }
        }
        const nodeId = resolveNodeId(a, context)
        if (!nodeId) {
          const ref = a.nodeRef ? `nodeRef "${a.nodeRef}"` : 'nodeId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        // Resolve classId by ID first, then fall back to name lookup.
        const acResolvedId = resolveClassId(store, a.classId)
        if (!acResolvedId) return { success: false, error: `Class not found: ${a.classId}` }
        store.addNodeClass(nodeId, acResolvedId)
        return { success: true }
      }

      case 'removeClass': {
        const a = parseValue(removeClassSchema, action)
        if (!hasRemoveClassTarget(a)) {
          return { success: false, error: 'Either nodeId or nodeRef is required' }
        }
        const nodeId = resolveNodeId(a, context)
        if (!nodeId) {
          const ref = a.nodeRef ? `nodeRef "${a.nodeRef}"` : 'nodeId'
          return { success: false, error: `Could not resolve ${ref}` }
        }
        // Resolve classId by ID first, then fall back to name lookup.
        const rcResolvedId = resolveClassId(store, a.classId)
        if (!rcResolvedId) return { success: false, error: `Class not found: ${a.classId}` }
        store.removeNodeClass(nodeId, rcResolvedId)
        return { success: true }
      }

      case 'addPage': {
        const a = parseValue(addPageSchema, action)
        store.addPage(a.title, a.slug)
        return { success: true }
      }

      case 'updateSiteSettings': {
        const a = parseValue(updateSiteSettingsSchema, action)
        // updateSiteSettings is a shallow merge via updateNodeProps pattern
        // (site settings live in site.settings — use the settings slice if available)
        // For now, emit a warning since there's no direct store method
        console.warn('[agent] updateSiteSettings action ignored — no store method yet', a)
        return { success: false, error: 'updateSiteSettings not yet implemented' }
      }

      default: {
        const exhaustive: never = action
        return { success: false, error: `Unknown action type: ${(exhaustive as AgentAction).type}` }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Execute a batch of agent actions in order.
 * Stops on first failure (fail-fast) and returns all results up to the failure.
 */
export async function executeAgentActions(
  actions: AgentAction[],
): Promise<AgentActionResult[]> {
  const results: AgentActionResult[] = []
  const snapshot = takeBatchSnapshot()
  const context: AgentExecutionContext = { nodeRefs: new Map() }
  for (const action of actions) {
    const result = await executeAgentAction(action, context)
    results.push(result)
    if (!result.success) {
      restoreBatchSnapshot(snapshot)
      break
    }
  }
  return results
}
