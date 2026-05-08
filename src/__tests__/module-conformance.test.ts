/**
 * Module Conformance Test Suite
 *
 * This file serves two purposes:
 *
 *   1. VALIDATION: Runs the conformance harness on stub modules so the harness
 *      itself stays green and can be used with confidence by J9 (base modules).
 *
 *   2. SECURITY CONTRACT: Tests the three security properties every module
 *      must satisfy (from the Security Auditor's threat model, msg #911):
 *      - XSS: string props must be HTML-escaped before interpolation
 *      - URL safety: `javascript:` hrefs must be stripped or rejected
 *      - Global purity: render() must not access document / fetch / eval
 *
 * When implementing a base module (J9), add:
 *   import { runModuleConformanceSuite } from '../helpers'
 *   import { myModule } from './my-module'
 *   runModuleConformanceSuite(myModule)
 */

import { describe, it, expect } from 'bun:test'
import './matchers'  // Register toBeCleanHTML and other custom matchers

import type { AnyModuleDefinition } from '@core/module-engine/types'
import {
  makeModule,
  makeContainerModule,
  makeSafeTextModule,
  makeSafeLinkModule,
  makeUnsafeTextModule,
} from './fixtures'
import { renderModule, runModuleConformanceSuite, withBannedGlobals } from './helpers'

// ---------------------------------------------------------------------------
// 1. Conformance harness validation — run against stubs
// ---------------------------------------------------------------------------

// Minimal stub with no props, no children
runModuleConformanceSuite(makeModule('test.stub'))

// Container stub (canHaveChildren: true) — exercises the children embedding test
runModuleConformanceSuite(makeContainerModule('test.container'))

// Properly-escaping text module — exercises schema + render with props
runModuleConformanceSuite(makeSafeTextModule('test.safe-text'))

// Properly-sanitising link module
runModuleConformanceSuite(makeSafeLinkModule('test.safe-link'))

// ---------------------------------------------------------------------------
// 2. Security: XSS via malicious prop values
// ---------------------------------------------------------------------------

describe('Security — XSS: HTML escaping in render() output', () => {
  it('a properly-escaped module produces clean HTML from malicious text prop', () => {
    const mod = makeSafeTextModule()
    const { html } = renderModule(mod, { text: '<script>alert(1)</script>' })

    // Should NOT contain raw script tags
    expect(html).toBeCleanHTML()
    // Should contain the escaped form
    expect(html).toContain('&lt;script&gt;')
  })

  it('a properly-escaped module handles & < > " \' in text prop', () => {
    const mod = makeSafeTextModule()
    const { html } = renderModule(mod, { text: '&<>"\'Hello' })

    expect(html).toBeCleanHTML()
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;')
    expect(html).toContain('&gt;')
  })

  it('a properly-escaped module handles nested HTML attack vectors', () => {
    const mod = makeSafeTextModule()
    const attacks = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '"><script>alert(1)</script>',
    ]
    for (const attack of attacks) {
      const { html } = renderModule(mod, { text: attack })
      expect(html).toBeCleanHTML()
    }
  })

  it('DETECTION: an unescaped module leaks <script> into output (expected failure pattern)', () => {
    // This test DOCUMENTS the vulnerability pattern — it asserts that the unsafe module
    // DOES produce a security issue, which is how we know our detection works.
    const badMod = makeUnsafeTextModule()
    const { html } = renderModule(badMod, { text: '<script>alert(1)</script>' })

    // The output CONTAINS the raw script — this is the problem we detect
    expect(html).toContain('<script>')
    // Confirm our toBeCleanHTML matcher WOULD catch this
    expect(() => expect(html).toBeCleanHTML()).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 3. Security: javascript: URL stripping
// ---------------------------------------------------------------------------

describe('Security — XSS: javascript: URL sanitisation', () => {
  it('a properly-sanitised link module strips javascript: href', () => {
    const mod = makeSafeLinkModule()
    const { html } = renderModule(mod, { href: 'javascript:alert(1)' })

    expect(html).toBeCleanHTML()
    expect(html).not.toContain('javascript:')
  })

  it('a properly-sanitised link module strips mixed-case javascript: href', () => {
    const mod = makeSafeLinkModule()
    const { html } = renderModule(mod, { href: 'JaVaScRiPt:alert(1)' })

    expect(html).toBeCleanHTML()
  })

  it('a properly-sanitised link module strips padded javascript: href (leading spaces)', () => {
    const mod = makeSafeLinkModule()
    const { html } = renderModule(mod, { href: '   javascript:alert(1)' })

    expect(html).toBeCleanHTML()
  })

  it('a properly-sanitised link module allows safe https:// hrefs', () => {
    const mod = makeSafeLinkModule()
    const { html } = renderModule(mod, { href: 'https://example.com' })

    expect(html).toBeCleanHTML()
    expect(html).toContain('https://example.com')
  })

  it('a properly-sanitised link module allows relative hrefs', () => {
    const mod = makeSafeLinkModule()
    const { html } = renderModule(mod, { href: '/about' })

    expect(html).toBeCleanHTML()
    expect(html).toContain('/about')
  })
})

// ---------------------------------------------------------------------------
// 4. Security: render() global access violations (Constraint #179)
// ---------------------------------------------------------------------------

describe('Security — Constraint #179: render() must not access DOM globals', () => {
  it('a pure render() does not access document, fetch, or eval', () => {
    const mod = makeModule()
    expect(() =>
      withBannedGlobals(() => mod.render(mod.defaults, []))
    ).not.toThrow()
  })

  it('DETECTION: a render() that accesses document is caught by withBannedGlobals', () => {
    const badMod: AnyModuleDefinition = {
      ...makeModule('test.bad-document'),
      render: (_props, _children) => {
        // Accesses a property ON the document proxy — triggers the get() handler
        const doc = (globalThis as Record<string, unknown>)['document'] as Record<string, unknown>
        void doc['createElement']  // This line triggers the throwing Proxy
        return { html: '<div></div>' }
      },
    }
    expect(() =>
      withBannedGlobals(() => badMod.render({}, []))
    ).toThrow('[Constraint #179]')
  })

  it('DETECTION: a render() that calls fetch is caught by withBannedGlobals', () => {
    const badMod: AnyModuleDefinition = {
      ...makeModule('test.bad-fetch'),
      render: (_props, _children) => {
        // @ts-expect-error intentionally calling a banned global
        ;(globalThis as Record<string, unknown>)['fetch']?.('https://evil.com')
        return { html: '<div></div>' }
      },
    }
    // When fetch is replaced by a throwing Proxy, accessing it throws
    expect(() =>
      withBannedGlobals(() => badMod.render({}, []))
    ).toThrow()
  })

  it('a container render() does not access globals even with children', () => {
    const mod = makeContainerModule()
    expect(() =>
      withBannedGlobals(() => mod.render({}, ['<p>child</p>']))
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 5. renderModule helper correctness
// ---------------------------------------------------------------------------

describe('renderModule helper', () => {
  it('merges def.defaults with provided props (defaults first, props override)', () => {
    const mod = makeModule('test.defaults', {
      defaults: { color: 'red', size: 16 },
      render: (props, _) => ({
        html: `<div color="${props['color']}" size="${props['size']}"></div>`,
      }),
    })

    const { html } = renderModule(mod, { size: 32 })
    expect(html).toContain('color="red"')
    expect(html).toContain('size="32"')
  })

  it('passes renderedChildren to render()', () => {
    const mod = makeContainerModule()
    const { html } = renderModule(mod, {}, ['<p>child one</p>', '<p>child two</p>'])
    expect(html).toContain('<p>child one</p>')
    expect(html).toContain('<p>child two</p>')
  })

  it('uses empty props and empty children when called with no arguments', () => {
    const mod = makeModule()
    expect(() => renderModule(mod)).not.toThrow()
    const { html } = renderModule(mod)
    expect(typeof html).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// 6. Fixture factories self-validation
// ---------------------------------------------------------------------------

describe('Fixture factory: makeModule', () => {
  it('returns a valid ModuleDefinition stub', () => {
    const m = makeModule()
    expect(m.id).toBe('test.stub')
    expect(m.trusted).toBe(true)
    expect(m.canHaveChildren).toBe(false)
    expect(typeof m.render).toBe('function')
  })

  it('accepts overrides', () => {
    const m = makeModule('custom.mod', { canHaveChildren: true, trusted: false })
    expect(m.id).toBe('custom.mod')
    expect(m.canHaveChildren).toBe(true)
    expect(m.trusted).toBe(false)
  })
})

describe('Fixture factory: makeContainerModule', () => {
  it('has canHaveChildren: true', () => {
    expect(makeContainerModule().canHaveChildren).toBe(true)
  })

  it('wraps children in a div', () => {
    const { html } = renderModule(makeContainerModule(), {}, ['<p>hi</p>'])
    expect(html).toContain('<div')
    expect(html).toContain('<p>hi</p>')
  })
})

describe('Fixture factory: makeSafeTextModule', () => {
  it('escapes HTML in text prop', () => {
    const { html } = renderModule(makeSafeTextModule(), { text: '<b>bold</b>' })
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('Fixture factory: makeSafeLinkModule', () => {
  it('strips javascript: URLs', () => {
    const { html } = renderModule(makeSafeLinkModule(), { href: 'javascript:evil()' })
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="#"')
  })
})
