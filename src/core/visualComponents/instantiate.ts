/**
 * instantiateVCAtRef — produce a flat node tree for inline rendering of a VC instance.
 *
 * Architecture source: Contribution #619 §8.5
 *
 * Given a VC definition, per-instance `propOverrides` (keyed by VCParam.id), and
 * optional `slotContent` (keyed by slotName), returns a flat `nodes` map ready for
 * VCInlineTree to render.
 *
 * Responsibilities:
 *  - Walk the VC's nested rootNode tree (via childNodes) and flatten to a dict
 *  - Apply propBindings: for each node.propBindings[propKey] = { paramId },
 *    substitute node.props[propKey] with the effective param value
 *    (propOverrides[paramId] ?? param.defaultValue)
 *  - Expand slot outlets: base.slot-outlet nodes are replaced with
 *    slotContent[slotName] if provided; otherwise kept as a placeholder
 *  - base.visual-component-ref nodes pass through unchanged — VCInlineTree
 *    delegates them to VisualComponentRefEditor for recursive rendering
 *
 * Constraint #269: This file must NOT import from editor/ or editor-store/.
 */

import { Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import type { VisualComponent, VCNode } from './schemas'
import { VCNodeSchema } from './schemas'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A flattened VCNode annotated with in-memory Phase 4 canvas metadata.
 * These fields are NEVER persisted — they are computed fresh on every
 * instantiateVCAtRef call and exist solely for canvas selection utilities.
 */
export interface InstantiatedVCNode extends VCNode {
  /** ID of the page-level base.visual-component-ref node that owns this inlined node */
  _owningRefId: string
  /**
   * True when this node came from the ref instance's slotContent (user-authored
   * content that is editable in page context). False when it came from the VC body
   * (template-owned content, not directly editable on the page).
   */
  _fromSlotContent: boolean
}

export interface InstantiatedVC {
  /** Flat map of all nodes in the rendered instance */
  nodes: Record<string, InstantiatedVCNode>
  /** ID of the root node — entry point for VCInlineTree */
  rootNodeId: string
}

// ---------------------------------------------------------------------------
// instantiateVCAtRef
// ---------------------------------------------------------------------------

/**
 * Instantiate a VisualComponent at a reference site.
 *
 * @param vc            - The VC definition to instantiate.
 * @param propOverrides - Per-param value overrides, keyed by VCParam.id (stable).
 * @param slotContent   - Per-slot node arrays, keyed by slotName.
 * @param refId         - ID of the page-level base.visual-component-ref node that
 *                        triggered this instantiation. Every emitted node is annotated
 *                        with this id so canvas utilities can resolve ownership.
 * @returns Flat node map + root node ID for VCInlineTree.
 */
export function instantiateVCAtRef(
  vc: VisualComponent,
  propOverrides: Record<string, unknown>,
  slotContent: Record<string, VCNode[]> = {},
  refId: string,
): InstantiatedVC {
  const nodes: Record<string, InstantiatedVCNode> = {}

  // Build a paramId → effectiveValue map for O(1) lookups during tree walk.
  // propOverrides is keyed by param.id (stable across renames).
  const paramValues = new Map<string, unknown>()
  for (const param of vc.params) {
    const effective = Object.prototype.hasOwnProperty.call(propOverrides, param.id)
      ? propOverrides[param.id]
      : param.defaultValue
    paramValues.set(param.id, effective)
  }

  /**
   * Register a node and all its nested childNodes into the flat map.
   * Used for slot content nodes that arrive pre-structured.
   * All nodes registered via this path are marked _fromSlotContent = true.
   */
  function registerNodeTree(node: VCNode): void {
    const annotated: InstantiatedVCNode = {
      ...node,
      childNodes: undefined,
      _owningRefId: refId,
      _fromSlotContent: true,
    }
    nodes[node.id] = annotated
    if (node.childNodes) {
      for (const child of node.childNodes) {
        registerNodeTree(child)
      }
    }
  }

  /**
   * Process a VC tree node: apply prop bindings, expand slot outlets.
   * Returns the array of node IDs to use in the parent's children list
   * (usually [node.id], but a slot outlet may expand to multiple IDs).
   * All nodes emitted via this path are marked _fromSlotContent = false.
   */
  function processNode(node: VCNode): string[] {
    // ── Slot outlet expansion ──────────────────────────────────────────────
    if (node.moduleId === 'base.slot-outlet') {
      const slotName =
        typeof node.props.slotName === 'string' && node.props.slotName
          ? node.props.slotName
          : 'children'

      // Check instance slot content first, then param defaultValue
      const instanceContent = slotContent[slotName]
      const paramDefault = vc.params.find((p) => p.type === 'slot' && p.name === slotName)
      const defaultContentResult = Array.isArray(paramDefault?.defaultValue)
        ? Value.Check(Type.Array(VCNodeSchema), paramDefault.defaultValue)
        : false
      const defaultContent: VCNode[] = defaultContentResult
        ? (paramDefault!.defaultValue as VCNode[])
        : []

      const contentNodes =
        instanceContent && instanceContent.length > 0 ? instanceContent : defaultContent

      if (contentNodes.length > 0) {
        // Replace slot outlet with content nodes — these are slot content (_fromSlotContent = true)
        for (const contentNode of contentNodes) {
          registerNodeTree(contentNode)
        }
        return contentNodes.map((n) => n.id)
      }

      // No content — keep slot outlet as placeholder (renders as dashed box).
      // The slot outlet itself is part of the VC body, not slot content.
      nodes[node.id] = {
        ...node,
        childNodes: undefined,
        _owningRefId: refId,
        _fromSlotContent: false,
      }
      return [node.id]
    }

    // ── Prop binding substitution ──────────────────────────────────────────
    let props = node.props
    if (node.propBindings && Object.keys(node.propBindings).length > 0) {
      const patched: Record<string, unknown> = { ...node.props }
      for (const [propKey, binding] of Object.entries(node.propBindings)) {
        if (paramValues.has(binding.paramId)) {
          patched[propKey] = paramValues.get(binding.paramId)
        }
      }
      props = patched
    }

    // ── Recurse into children via childNodes ───────────────────────────────
    const effectiveChildren: string[] = []
    if (node.childNodes) {
      for (const childNode of node.childNodes) {
        const childIds = processNode(childNode)
        effectiveChildren.push(...childIds)
      }
    }

    // Register this node with resolved props and effective children.
    // All VC body nodes are _fromSlotContent = false.
    // childNodes omitted — the flat map is the canonical representation.
    nodes[node.id] = {
      ...node,
      props,
      children: effectiveChildren,
      childNodes: undefined,
      _owningRefId: refId,
      _fromSlotContent: false,
    }

    return [node.id]
  }

  processNode(vc.rootNode)

  return { nodes, rootNodeId: vc.rootNode.id }
}
