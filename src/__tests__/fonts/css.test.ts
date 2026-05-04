import { describe, expect, it } from 'bun:test'
import {
  fontFaceCount,
  generateFontFamilyTokensCss,
  generateFontsCss,
  generateSiteFontsCss,
} from '@core/fonts/css'
import type { FontEntry, SiteFontsSettings } from '@core/fonts/types'

const inter: FontEntry = {
  id: 'f1',
  source: 'google',
  family: 'Inter',
  variants: ['400', '700italic'],
  subsets: ['latin'],
  files: [
    { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
    { variant: '700italic', subset: 'latin', path: '/uploads/fonts/inter/700italic-latin.woff2', format: 'woff2' },
  ],
  category: 'Sans Serif',
  createdAt: 0,
  updatedAt: 0,
}

const malicious: FontEntry = {
  // Attempts to escape the @font-face block via embedded `</style>`,
  // breakouts in family name, and an off-brand path. The generator must
  // strip / refuse all of these.
  id: 'f2',
  source: 'google',
  family: 'Bad"Family</style>',
  variants: ['400'],
  subsets: ['latin'],
  files: [
    { variant: '400', subset: 'latin', path: '/uploads/fonts/bad/400-latin.woff2', format: 'woff2' },
    // Path outside /uploads/fonts/ — must NOT be emitted.
    { variant: '400', subset: 'latin', path: 'https://attacker.example/evil.woff2', format: 'woff2' as const },
  ],
  category: 'Sans Serif',
  createdAt: 0,
  updatedAt: 0,
}

describe('generateSiteFontsCss', () => {
  it('emits one @font-face block per (variant, subset) tuple', () => {
    const css = generateSiteFontsCss({ items: [inter] })
    expect(css.match(/@font-face/g)?.length ?? 0).toBe(2)
    expect(css).toContain('font-family: "Inter";')
    expect(css).toContain('font-weight: 400;')
    expect(css).toContain('font-weight: 700;')
    expect(css).toContain('font-style: italic;')
    expect(css).toContain('url("/uploads/fonts/inter/400-latin.woff2")')
  })

  it('skips files served from outside /uploads/fonts/', () => {
    const css = generateSiteFontsCss({ items: [malicious] })
    expect(css).not.toContain('attacker.example')
  })

  it('strips quotes / angle brackets from the family name in CSS', () => {
    const css = generateSiteFontsCss({ items: [malicious] })
    // No raw quote breakout.
    expect(css).not.toContain('Bad"Family')
    // Closing-style sequence stripped.
    expect(css).not.toContain('</style>')
  })

  it('returns empty string for missing / empty input', () => {
    expect(generateSiteFontsCss(null)).toBe('')
    expect(generateSiteFontsCss(undefined)).toBe('')
    expect(generateSiteFontsCss({ items: [] })).toBe('')
  })
})

describe('generateFontFamilyTokensCss', () => {
  it('emits a --font-<slug> token per family with category fallback', () => {
    const css = generateFontFamilyTokensCss({ items: [inter] })
    expect(css).toContain('--font-inter: "Inter", sans-serif;')
  })

  it('uses serif fallback for serif families', () => {
    const settings: SiteFontsSettings = {
      items: [{ ...inter, family: 'Lora', category: 'Serif' }],
    }
    expect(generateFontFamilyTokensCss(settings)).toContain('--font-lora: "Lora", serif;')
  })

  it('uses cursive fallback for handwriting families', () => {
    const settings: SiteFontsSettings = {
      items: [{ ...inter, family: 'Caveat', category: 'Handwriting' }],
    }
    expect(generateFontFamilyTokensCss(settings)).toContain('--font-caveat: "Caveat", cursive;')
  })
})

describe('generateFontsCss', () => {
  it('combines tokens block + @font-face rules', () => {
    const css = generateFontsCss({ items: [inter] })
    expect(css).toContain('--font-inter')
    expect(css).toContain('@font-face')
  })

  it('returns empty string when nothing is installed', () => {
    expect(generateFontsCss(null)).toBe('')
  })
})

describe('fontFaceCount', () => {
  it('counts woff2 files only', () => {
    expect(fontFaceCount(inter)).toBe(2)
  })
})
