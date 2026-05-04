/**
 * BaseNode — shared structural base for both page-flat-map nodes (PageNode)
 * and Visual Component tree nodes (VCNode).
 *
 * Lives in its own module (rather than inside `page-tree/types.ts`) so that
 * `visualComponents/schemas.ts` can import this base without pulling in the
 * full Site / page-tree type graph — which would create the cycle
 * `page-tree/types ↔ visualComponents/{types,schemas}`.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// PropBinding — used by both BaseNode (propBindings field) and VCNodeSchema
// ---------------------------------------------------------------------------

/** Maps prop key → { paramId } for render-time VC parameter substitution. */
export const PropBindingSchema = z.object({ paramId: z.string() })

// ---------------------------------------------------------------------------
// BaseNodeSchema — shared structural schema for PageNode and VCNode
//
// `PageNodeSchema` (in `./schemas`) extends this with `dynamicBindings` and
// a recursive `childNodes?: PageNode[]`.
//
// `VCNodeSchema` (in `src/core/visualComponents/schemas.ts`) extends this
// with a recursive `childNodes?: VCNode[]` — no dynamic-bindings surface.
//
// The shared base eliminates `as unknown as PageNode` / `as unknown as VCNode`
// casts when tree-walking functions need to operate on nodes from either context.
// ---------------------------------------------------------------------------

export const BaseNodeSchema = z.object({
  // Unique ID — generated with nanoid()
  id: z.string(),

  // References a ModuleDefinition in the registry.
  // Format: "namespace.module-name" — e.g. "base.text"
  moduleId: z.string(),

  // Resolved property values for this node's module.
  // Shape validated against ModuleDefinition.schema at runtime.
  // Keys are FLAT — no dot-path nesting.
  props: z.record(z.string(), z.unknown()).catch({}).default({}),

  // Per-breakpoint prop overrides — shallow-merged on top of props when
  // rendering at a given breakpoint. Key is Breakpoint.id.
  breakpointOverrides: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .catch({})
    .default({}),

  // Ordered array of child node IDs.
  // Only meaningful when ModuleDefinition.canHaveChildren === true.
  // All children are in a single default slot (multi-slot deferred post-MVP).
  // Strict (no .catch): non-array children throw SiteValidationError at load time
  // (mirrors validatePageNode assertArray behaviour — Constraint #230).
  children: z.array(z.string()),

  // Optional user-facing label — overrides the module name in the DOM tree panel
  label: z.string().optional().catch(undefined),

  // When true, cannot be selected or moved in the editor
  locked: z.boolean().optional().catch(undefined),

  // When true, hidden on the canvas (still present in the tree)
  hidden: z.boolean().optional().catch(undefined),

  // Ordered class IDs from the site's class registry.
  // Applied as the referenced user-facing class names on the element.
  // Later classes in the array win in cascade order.
  // Empty array when no classes are applied.
  classIds: z.array(z.string()).catch([]).default([]),

  // Prop bindings for render-time parameter substitution.
  // Maps prop key → { paramId } (stable VCParam.id reference).
  // When present, the renderer substitutes instanceProps[param.name] for
  // the bound prop key at render time (Contribution #619 §4 Option β).
  // Optional — absent on all standard Page nodes and unbound VC nodes.
  //
  // Per-entry lenience (5.3): entries failing PropBindingSchema are silently
  // dropped rather than nuking the entire map.  The original validatePageNode()
  // did the same — filter individual bad entries, keep the good ones.
  //
  // .catch({}) handles invalid values; .transform() filters per-entry;
  // .optional() is outermost so ZodOptional is the top-level wrapper — this
  // makes propBindings infer as `?:` (key can be absent) rather than a
  // required key typed `T | undefined` (Zod v4 optional semantics).
  propBindings: z
    .record(z.string(), z.unknown())
    .catch({})
    .transform((map) => {
      const out: Record<string, { paramId: string }> = {}
      for (const [k, v] of Object.entries(map)) {
        const parsed = PropBindingSchema.safeParse(v)
        if (parsed.success) out[k] = parsed.data
      }
      return Object.keys(out).length > 0 ? out : undefined
    })
    .optional(),
})

export type BaseNode = z.infer<typeof BaseNodeSchema>
