/**
 * Site-scope tool barrel — exports the toolset and the system prompt builder.
 *
 * The chat handler imports `siteTools` for `scope === 'site'` and
 * `buildSiteSystemPrompt` when assembling the prompt for a site-scope
 * conversation.
 *
 * Write tools (everything in `siteWriteTools` except `render_snapshot`) are
 * stamped `mutates: true` so `selectToolsForScope` can filter them out for
 * callers without `ai.tools.write`. `render_snapshot` lives in the write
 * file for historical reasons but is a pure read — explicitly tagged as
 * non-mutating.
 */

import type { AiTool } from '../types'
import { siteReadTools } from './readTools'
import { siteWriteTools } from './writeTools'

const READ_ONLY_NAMES_IN_WRITE_FILE = new Set(['render_snapshot'])

function stampMutationFlag(tools: AiTool[], isMutating: boolean): AiTool[] {
  return tools.map((t) => {
    // render_snapshot lives in writeTools.ts but is a read — exclude it
    // from the auto-mutating stamp.
    const mutates = isMutating && !READ_ONLY_NAMES_IN_WRITE_FILE.has(t.name)
    return { ...t, mutates }
  })
}

export const siteTools: AiTool[] = [
  ...stampMutationFlag(siteReadTools, false),
  ...stampMutationFlag(siteWriteTools, true),
]

export { buildSiteSystemPrompt } from './systemPrompt'
export type { SiteAgentSnapshot } from './snapshot'
