/**
 * The raw authoritative tree the site-editor agent posts each turn.
 *
 * Replaces the old flattened `SiteSnapshot`. The server renders this directly
 * (publishPage + buildSiteCssBundle) instead of consuming a bespoke flattened
 * shape — single source of truth, server owns all derivation.
 *
 * Only the ACTIVE page carries full `nodes`. Non-active pages keep metadata
 * (id/title/slug) with emptied `nodes`, because server-side rendering and CSS
 * collection only ever touch the active page + site-level styleRules. This
 * bounds the per-turn payload on multi-page sites.
 */

import type { Page, SiteDocument } from '@core/page-tree'

export interface SiteAgentSnapshot {
  /** Active page, full node map — the tree the agent reads and mutates. */
  page: Page
  /** Site document: styleRules/settings/breakpoints intact; non-active pages emptied. */
  site: SiteDocument
  selectedNodeId: string | null
  activeBreakpointId: string
}

export interface SiteAgentSnapshotOptions {
  selectedNodeId: string | null
  activeBreakpointId: string
}

export function buildSiteAgentSnapshot(
  page: Page,
  site: SiteDocument,
  options: SiteAgentSnapshotOptions,
): SiteAgentSnapshot {
  const pages = site.pages.map((p) => (p.id === page.id ? p : { ...p, nodes: {} }))
  return {
    page,
    site: { ...site, pages },
    selectedNodeId: options.selectedNodeId,
    activeBreakpointId: options.activeBreakpointId,
  }
}
