/**
 * Site-editor page-context adapter.
 *
 * Reads the active page + the two editor-only scalars (`selectedNodeId`,
 * `activeBreakpointId`) off the live store and delegates to the pure
 * `buildSiteAgentSnapshot`, which emits the raw authoritative tree the server
 * renders (publishPage + buildSiteCssBundle) into the agent's HTML read
 * surface. This is the only *site-specific* piece of the agent layer — wired in
 * via `agentSliceConfig.site.ts`.
 *
 * Returns `undefined` when there is no active page/site; the chat handler then
 * falls back to its empty snapshot.
 */

import type { EditorStore } from '@site/store/types'
import { buildSiteAgentSnapshot, type SiteAgentSnapshot } from './siteAgentSnapshot'

export function buildCurrentPageContext(get: () => EditorStore): SiteAgentSnapshot | undefined {
  const state = get()
  const activePage =
    state.site?.pages.find((p) => p.id === state.activePageId) ?? state.site?.pages[0]
  if (!activePage || !state.site) return undefined
  return buildSiteAgentSnapshot(activePage, state.site, {
    selectedNodeId: state.selectedNodeId,
    activeBreakpointId: state.activeBreakpointId,
  })
}
