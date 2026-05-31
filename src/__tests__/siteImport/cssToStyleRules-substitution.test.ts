/**
 * Regression tests for the Chromium "pending-substitution value" drop.
 *
 * When a CSS *shorthand* (background, transition, gap, padding, …) is set to a
 * value containing `var()`/`env()`, Chromium stores one un-expandable
 * pending-substitution value: `style.length` enumerates the shorthand's
 * LONGHANDS, but `getPropertyValue(longhand)` returns `""` for every one. The
 * old parser's `if (!value) continue` then dropped the whole declaration (e.g.
 * `html, body { background: var(--bg) }` lost its background entirely on import).
 *
 * This behaviour does NOT reproduce under happy-dom (which keeps the shorthand
 * enumerated with its value), so these tests simulate Chromium's CSSStyleDeclaration
 * directly, using values captured from HeadlessChrome 148:
 *   background: var(--bg)  → 9 empty background-* longhands, cssText keeps shorthand
 *   transition: …var(…)    → 5 empty transition-* longhands
 *   gap: var(--g)          → empty row-gap/column-gap
 *   padding: 13px var(--p) → 4 empty padding-* longhands
 */

import { describe, it, expect } from 'bun:test'
import {
  parseDeclarations,
  recoverSubstitutionShorthands,
} from '@core/siteImport/cssToStyleRules'
import type { ImportWarning } from '@core/siteImport'

// ---------------------------------------------------------------------------
// Mock CSSStyleDeclaration that mimics Chromium's pending-substitution
// enumeration: empty longhands + a faithful cssText.
// ---------------------------------------------------------------------------

function mockStyle(
  enumerated: Array<[kebab: string, value: string]>,
  cssText: string,
): CSSStyleDeclaration {
  const values = new Map(enumerated)
  const indexed = enumerated.map(([k]) => k)
  const obj: Record<string | number, unknown> = {
    length: indexed.length,
    cssText,
    getPropertyValue: (k: string) => values.get(k) ?? '',
  }
  indexed.forEach((k, i) => {
    obj[i] = k
  })
  return obj as unknown as CSSStyleDeclaration
}

// ---------------------------------------------------------------------------
// parseDeclarations — Chromium pending-substitution recovery
// ---------------------------------------------------------------------------

describe('parseDeclarations — recovers shorthand+var dropped by Chromium', () => {
  it('recovers background: var(--bg) from empty background-* longhands', () => {
    const warnings: ImportWarning[] = []
    const style = mockStyle(
      [
        ['background-image', ''],
        ['background-position-x', ''],
        ['background-position-y', ''],
        ['background-size', ''],
        ['background-repeat', ''],
        ['background-attachment', ''],
        ['background-origin', ''],
        ['background-clip', ''],
        ['background-color', ''],
        ['color', 'var(--ink)'],
      ],
      'background: var(--bg); color: var(--ink);',
    )
    const decls = parseDeclarations(style, 'html, body', warnings)
    expect(decls.background).toBe('var(--bg)')
    // The longhand-with-var is captured by enumeration, not duplicated.
    expect(decls.color).toBe('var(--ink)')
    expect(decls.backgroundColor).toBeUndefined()
    expect(warnings).toHaveLength(0)
  })

  it('recovers transition / gap / padding shorthands that use var()', () => {
    const warnings: ImportWarning[] = []
    const style = mockStyle(
      [
        ['transition-property', ''],
        ['transition-duration', ''],
        ['transition-timing-function', ''],
        ['transition-delay', ''],
        ['row-gap', ''],
        ['column-gap', ''],
        ['padding-top', ''],
        ['padding-right', ''],
        ['padding-bottom', ''],
        ['padding-left', ''],
      ],
      'transition: background 140ms var(--easing); gap: var(--g); padding: 13px var(--p);',
    )
    const decls = parseDeclarations(style, '.btn', warnings)
    expect(decls.transition).toBe('background 140ms var(--easing)')
    expect(decls.gap).toBe('var(--g)')
    expect(decls.padding).toBe('13px var(--p)')
  })

  it('does not clobber a longhand the enumeration already resolved', () => {
    const warnings: ImportWarning[] = []
    // backgroundColor resolved (non-var) AND a separate background-image var().
    const style = mockStyle(
      [['background-color', 'rgb(255, 0, 0)']],
      'background-color: rgb(255, 0, 0); background-image: var(--img);',
    )
    const decls = parseDeclarations(style, '.x', warnings)
    expect(decls.backgroundColor).toBe('rgb(255, 0, 0)') // untouched
    expect(decls.backgroundImage).toBe('var(--img)') // recovered longhand-var
  })
})

// ---------------------------------------------------------------------------
// recoverSubstitutionShorthands — unit behaviour
// ---------------------------------------------------------------------------

describe('recoverSubstitutionShorthands', () => {
  it('skips declarations already present in decls (longhand var)', () => {
    const warnings: ImportWarning[] = []
    const decls: Record<string, unknown> = { color: 'var(--ink)' }
    recoverSubstitutionShorthands('color: var(--ink); background: var(--bg);', decls, 's', warnings)
    expect(decls.color).toBe('var(--ink)') // unchanged
    expect(decls.background).toBe('var(--bg)') // added
  })

  it('ignores declarations without a substitution function', () => {
    const warnings: ImportWarning[] = []
    const decls: Record<string, unknown> = {}
    recoverSubstitutionShorthands('background: #fff; margin: 0px;', decls, 's', warnings)
    expect(Object.keys(decls)).toHaveLength(0)
  })

  it('does not split a value on a `;` nested inside parens', () => {
    const warnings: ImportWarning[] = []
    const decls: Record<string, unknown> = {}
    // A (contrived) nested semicolon inside var() must not terminate the value.
    recoverSubstitutionShorthands('grid-template: var(--a, "x;y");', decls, 's', warnings)
    expect(decls.gridTemplate).toBe('var(--a, "x;y")')
  })

  it('handles an empty / undefined cssText without throwing', () => {
    const warnings: ImportWarning[] = []
    const decls: Record<string, unknown> = {}
    recoverSubstitutionShorthands('', decls, 's', warnings)
    recoverSubstitutionShorthands(undefined, decls, 's', warnings)
    expect(Object.keys(decls)).toHaveLength(0)
  })
})
