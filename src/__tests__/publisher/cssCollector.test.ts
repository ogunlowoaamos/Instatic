import { describe, it, expect, beforeEach } from 'bun:test'
import { CssCollector, sanitizeModuleCSS } from '@core/publisher/cssCollector'

// ---------------------------------------------------------------------------
// sanitizeModuleCSS — Constraint #228
// ---------------------------------------------------------------------------

describe('sanitizeModuleCSS', () => {
  it('strips </style> to prevent breaking out of <style> block (CWE-79)', () => {
    // The dangerous sequence is </style> closing the block early — strip it.
    // The remaining <script> text is harmless inside <style> content (parsed as raw text).
    const malicious = 'h1{color:red}</style><script>alert(1)</script><style>'
    const sanitized = sanitizeModuleCSS(malicious)
    expect(sanitized).not.toContain('</style>')
    // </style> was removed so the closing tag can no longer escape the style block
    expect(sanitized).not.toMatch(/<\/style\s*>/)
  })

  it('strips </STYLE> (case-insensitive)', () => {
    expect(sanitizeModuleCSS('a{}</STYLE><b>')).not.toContain('</STYLE>')
  })

  it('strips </style  > (whitespace before >)', () => {
    expect(sanitizeModuleCSS('a{}</style  ><b>')).not.toContain('</style')
  })

  it('passes through safe CSS unchanged', () => {
    const safe = 'h1 { color: red; } .container { display: flex; }'
    expect(sanitizeModuleCSS(safe)).toBe(safe)
  })

  it('handles empty string', () => {
    expect(sanitizeModuleCSS('')).toBe('')
  })
})

describe('CssCollector', () => {
  let collector: CssCollector

  beforeEach(() => {
    collector = new CssCollector()
  })

  it('starts empty', () => {
    expect(collector.size).toBe(0)
    expect(collector.isEmpty).toBe(true)
    expect(collector.collect()).toBe('')
  })

  it('adds one module CSS and collects it', () => {
    collector.add('base.text', 'h1 { color: red; }')
    expect(collector.size).toBe(1)
    expect(collector.collect()).toBe('h1 { color: red; }')
  })

  it('deduplicates: second add for same moduleId is ignored', () => {
    collector.add('base.text', 'h1 { color: red; }')
    collector.add('base.text', 'h1 { color: blue; }') // ignored
    expect(collector.size).toBe(1)
    expect(collector.collect()).toBe('h1 { color: red; }') // first wins
  })

  it('collects CSS from multiple module types', () => {
    collector.add('base.text', 'h1 { margin: 0; }')
    collector.add('base.container', '.container { display: flex; }')
    collector.add('base.image', 'img { max-width: 100%; }')
    expect(collector.size).toBe(3)
    const css = collector.collect()
    expect(css).toContain('h1 { margin: 0; }')
    expect(css).toContain('.container { display: flex; }')
    expect(css).toContain('img { max-width: 100%; }')
  })

  it('50 instances of the same module → size stays 1', () => {
    for (let i = 0; i < 50; i++) {
      collector.add('base.text', 'h1 { font-family: sans-serif; }')
    }
    expect(collector.size).toBe(1)
  })

  it('sanitizes </style> injection in add() — strips </style> (Constraint #228)', () => {
    // </style> is stripped; remaining <script> text is inside <style> block = harmless raw text
    collector.add('evil.mod', 'a{}</style><script>alert(1)</script><style>')
    const css = collector.collect()
    expect(css).not.toContain('</style>')
    expect(css).not.toMatch(/<\/style\s*>/)
  })

  it('clear() resets the collector', () => {
    collector.add('base.text', 'h1 { color: red; }')
    collector.clear()
    expect(collector.size).toBe(0)
    expect(collector.isEmpty).toBe(true)
    expect(collector.collect()).toBe('')
  })

  it('collect() joins entries with newline', () => {
    collector.add('mod.a', 'a { }')
    collector.add('mod.b', 'b { }')
    expect(collector.collect()).toBe('a { }\nb { }')
  })
})
