import type { BaseNode } from './baseNode'

/**
 * Remove the given root nodes and their entire subtrees from a flat node map,
 * in place: each root is spliced out of its (single) parent's `children[]` and
 * every descendant is deleted from the map.
 *
 * Used to cascade-remove `base.visual-component-ref` nodes — when their target
 * VC is deleted in the editor, or is missing when a site is loaded — so no
 * orphaned slot-instances or user content are left behind. Callers pick which
 * refs to remove; this performs the identical tree surgery either way.
 *
 * Safe to call inside a Mutative producer (the in-place splice/delete operate
 * on the draft) or on a plain object map.
 */
export function removeNodeSubtrees(
  nodes: Record<string, BaseNode>,
  rootNodeIds: readonly string[],
): void {
  for (const rootId of rootNodeIds) {
    // DFS-collect the whole subtree rooted at this node.
    const subtreeIds: string[] = []
    const stack: string[] = [rootId]
    while (stack.length > 0) {
      const id = stack.pop()!
      const node = nodes[id]
      if (!node) continue
      subtreeIds.push(id)
      stack.push(...node.children)
    }

    // Splice the root out of its parent's children[] (exactly one parent).
    for (const node of Object.values(nodes)) {
      const idx = node.children.indexOf(rootId)
      if (idx !== -1) {
        node.children.splice(idx, 1)
        break
      }
    }

    // Delete the root + entire subtree from the flat map.
    for (const id of subtreeIds) {
      delete nodes[id]
    }
  }
}
