/**
 * Site-scope read tools — server-side, resolve from the posted SiteAgentSnapshot.
 *
 * `read_page` is the primary surface: it renders the active page into the
 * published HTML the agent edits (annotated `<body>` + `<style>` bundle). The
 * remaining four tools are catalogs that describe things NOT present in the
 * page's own HTML (insertable modules, design tokens, sibling pages,
 * breakpoints). Each tool casts `ctx.snapshot` to SiteAgentSnapshot at the top
 * of its handler — the runtime is scope-agnostic and hands tools an `unknown`
 * snapshot.
 */

import { Type, type Static } from '@core/utils/typeboxHelpers'
import type { AiTool } from '../types'
import type { SiteAgentSnapshot } from './snapshot'
import {
  describeAgentModules,
  describeAgentTokens,
  filterTokenFamily,
  renderAgentPage,
  type TokenFamily,
} from './render'

function asSnap(snapshot: unknown): SiteAgentSnapshot {
  return snapshot as SiteAgentSnapshot
}

// ---------------------------------------------------------------------------
// read_page
// ---------------------------------------------------------------------------

const ReadPageInput = Type.Object({})

const readPageTool: AiTool = {
  name: 'read_page',
  scope: 'site',
  execution: 'server',
  description:
    'Return the active page as the published HTML the agent edits: an annotated <body> where every element carries uid="<nodeId>" (pass that id verbatim to write tools), plus the page\'s CSS in a <style> block (design-token vars, utility classes, your classes, and @media breakpoint rules). One call gives the whole page + its styles — no per-node looping. Class handles are the class names you see in the CSS / `class=` attributes.',
  inputSchema: ReadPageInput,
  handler: async (_input, ctx) => {
    const snap = asSnap(ctx.snapshot)
    return renderAgentPage(snap)
  },
}

// ---------------------------------------------------------------------------
// list_modules
// ---------------------------------------------------------------------------

const ListModulesInput = Type.Object({
  category: Type.Optional(Type.String()),
})

const listModulesTool: AiTool = {
  name: 'list_modules',
  scope: 'site',
  execution: 'server',
  description:
    'List registered modules with id, name, category, props schema, and style targets. `category` filters case-insensitively.',
  inputSchema: ListModulesInput,
  handler: async (input, ctx) => {
    const { category } = input as Static<typeof ListModulesInput>
    const normalized = category?.toLowerCase()
    const all = describeAgentModules()
    const modules = normalized
      ? all.filter((m) => m.category.toLowerCase() === normalized)
      : all
    return { modules }
  },
}

// ---------------------------------------------------------------------------
// list_tokens
// ---------------------------------------------------------------------------

const ListTokensInput = Type.Object({
  family: Type.Optional(
    Type.Union([
      Type.Literal('colors'),
      Type.Literal('typography'),
      Type.Literal('spacing'),
      Type.Literal('fonts'),
    ]),
  ),
})

const listTokensTool: AiTool = {
  name: 'list_tokens',
  scope: 'site',
  execution: 'server',
  description:
    "List the site's design tokens — color tokens (with shades/tints), typography & spacing scale steps, and font tokens — each with its CSS variable (use as `var(--name)` in a <style> block) and the utility class(es) bound to it (e.g. `text-primary`, `text-l`, `padding-m`). Prefer these over hardcoded colors/sizes/fonts. `family` narrows to one of colors|typography|spacing|fonts.",
  inputSchema: ListTokensInput,
  handler: async (input, ctx) => {
    const { family } = input as Static<typeof ListTokensInput>
    const snap = asSnap(ctx.snapshot)
    return { tokens: filterTokenFamily(describeAgentTokens(snap.site), family as TokenFamily | undefined) }
  },
}

// ---------------------------------------------------------------------------
// list_pages
// ---------------------------------------------------------------------------

const ListPagesInput = Type.Object({})

const listPagesTool: AiTool = {
  name: 'list_pages',
  scope: 'site',
  execution: 'server',
  description:
    'List every page (id, title, slug, active, isHomepage). Homepage = slug "index". Use for site-level admin (duplicate, rename, set homepage).',
  inputSchema: ListPagesInput,
  handler: async (_input, ctx) => {
    const snap = asSnap(ctx.snapshot)
    const pages = snap.site.pages.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      active: p.id === snap.page.id,
      isHomepage: p.slug === 'index',
    }))
    return { pages }
  },
}

// ---------------------------------------------------------------------------
// list_breakpoints
// ---------------------------------------------------------------------------

const ListBreakpointsInput = Type.Object({})

const listBreakpointsTool: AiTool = {
  name: 'list_breakpoints',
  scope: 'site',
  execution: 'server',
  description:
    'List configured breakpoints (id, label, frame width px, media query, icon) plus the active id. Same info is already in the system suffix; only call if you lost track.',
  inputSchema: ListBreakpointsInput,
  handler: async (_input, ctx) => {
    const snap = asSnap(ctx.snapshot)
    return {
      activeBreakpointId: snap.activeBreakpointId,
      breakpoints: snap.site.breakpoints,
    }
  },
}

// ---------------------------------------------------------------------------
// All read tools — convenient barrel for the registry
// ---------------------------------------------------------------------------

export const siteReadTools: AiTool[] = [
  readPageTool,
  listModulesTool,
  listTokensTool,
  listPagesTool,
  listBreakpointsTool,
]
