/**
 * Architecture gate — AI site write-tool surface.
 *
 * Asserts that the legacy node-construction tools (`insertNode`,
 * `insertTree`) are absent from the registered site write-tool list, and
 * that the HTML-native replacements (`insertHtml`, `getNodeHtml`,
 * `replaceNodeHtml`) are present.
 *
 * This gate catches accidental re-introduction of the old tools and
 * ensures the agent has exactly the HTML-native surface it was redesigned
 * around.
 */

import { describe, it, expect } from 'bun:test'
import { siteWriteTools } from '../../../server/ai/tools/site/writeTools'

describe('agent-tool-surface gate', () => {
  const toolNames = siteWriteTools.map((t) => t.name)

  it('siteWriteTools array is non-empty', () => {
    expect(toolNames.length).toBeGreaterThan(0)
  })

  it('deprecated insertNode is absent', () => {
    expect(toolNames).not.toContain('insertNode')
  })

  it('deprecated insertTree is absent', () => {
    expect(toolNames).not.toContain('insertTree')
  })

  it('HTML-native insertHtml tool is present', () => {
    expect(toolNames).toContain('insertHtml')
  })

  it('HTML-native getNodeHtml tool is present', () => {
    expect(toolNames).toContain('getNodeHtml')
  })

  it('HTML-native replaceNodeHtml tool is present', () => {
    expect(toolNames).toContain('replaceNodeHtml')
  })

  it('total tool count is 17 (15 mutation tools + render_snapshot + getNodeHtml)', () => {
    expect(toolNames).toHaveLength(17)
  })
})
