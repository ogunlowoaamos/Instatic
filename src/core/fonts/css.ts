/**
 * Generate `@font-face` CSS for the site's installed font library.
 *
 * The same CSS string is consumed by:
 *   - the canvas runtime (injected into `<style id="mc-fonts">` so the editor
 *     preview matches what visitors will see), and
 *   - the publisher (emitted into the head `<style>` block of every published
 *     page so the live site never reaches out to fonts.googleapis.com).
 *
 * We never emit external CDN URLs in production output (Constraint #fonts:
 * fonts must be self-hosted). All `src` URLs reference files under
 * `/uploads/fonts/...` that are written to disk at install time.
 */

import type { FontEntry, SiteFontsSettings } from './types'
import { parseVariant } from './variants'

/**
 * Strip characters that could break out of a CSS string literal OR a parent
 * `<style>` block. The font `family` value is user-controlled (selected from a
 * curated directory but stored in JSON) so we treat it as untrusted at the
 * CSS boundary. `<` / `>` are stripped to prevent `</style>` from terminating
 * the surrounding `<style>` block (CWE-79 / Constraint #228).
 */
function escapeCssString(value: string): string {
  return value.replace(/["\\\n\r<>]/g, '')
}

/**
 * URLs to woff2 files we wrote to disk. Path tokens are restricted to the
 * `/uploads/fonts/` namespace and pass through `validateFontEntry` first, so
 * they are safe inside `url("...")`. We still strip newlines, quotes, and
 * angle brackets defensively.
 */
function escapeCssUrl(value: string): string {
  return value.replace(/["\\\n\r<>]/g, '')
}

/**
 * Build a single `@font-face` rule for one (variant, subset) tuple.
 * Returns `null` for unparseable variants — callers should skip them.
 */
function fontFaceRule(family: string, variant: string, urlPath: string): string | null {
  const parsed = parseVariant(variant)
  if (!parsed) return null
  return [
    `@font-face {`,
    `  font-family: "${escapeCssString(family)}";`,
    `  font-style: ${parsed.italic ? 'italic' : 'normal'};`,
    `  font-weight: ${parsed.weight};`,
    `  font-display: swap;`,
    `  src: url("${escapeCssUrl(urlPath)}") format("woff2");`,
    `}`,
  ].join('\n')
}

/**
 * Generate the full @font-face block for every installed entry.
 * Empty input yields the empty string — caller should skip the `<style>` tag
 * entirely if there are no fonts installed.
 */
export function generateSiteFontsCss(
  fonts: SiteFontsSettings | null | undefined,
): string {
  if (!fonts || !fonts.items || fonts.items.length === 0) return ''

  const blocks: string[] = []
  for (const entry of fonts.items) {
    if (!entry || !entry.family || !entry.files) continue
    for (const file of entry.files) {
      if (!file || file.format !== 'woff2') continue
      // Only emit files served from our own /uploads/fonts/ namespace —
      // never emit raw third-party URLs (see file's no-CDN guarantee).
      if (!file.path.startsWith('/uploads/fonts/')) continue
      const rule = fontFaceRule(entry.family, file.variant, file.path)
      if (rule) blocks.push(rule)
    }
  }
  return blocks.join('\n\n')
}

/**
 * CSS fallback chain for a Google-Fonts category. Mirrors what fonts.google.com
 * embeds in its own CSS, so a missing weight degrades to a near-equivalent
 * system font instead of unstyled Times.
 */
function categoryFallback(category: string | undefined): string {
  switch ((category ?? '').toLowerCase()) {
    case 'serif': return 'serif'
    case 'monospace': return 'monospace'
    case 'display': return 'sans-serif'
    case 'handwriting': return 'cursive'
    case 'sans serif':
    case 'sans-serif':
    default: return 'sans-serif'
  }
}

/**
 * Slugify a family name for use as a CSS custom-property suffix:
 * "Noto Sans JP" → "noto-sans-jp".
 *
 * Also used to derive the on-disk directory name under `/uploads/fonts/`,
 * keeping settings, files, and CSS variables aligned.
 */
export function familySlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Generate the `:root { --font-<slug>: "Family", fallback; }` block so users can
 * reference an installed font in their CSS without retyping the full stack.
 */
export function generateFontFamilyTokensCss(
  fonts: SiteFontsSettings | null | undefined,
): string {
  if (!fonts || !fonts.items || fonts.items.length === 0) return ''
  const declarations: string[] = []
  for (const entry of fonts.items) {
    if (!entry?.family) continue
    const slug = familySlug(entry.family)
    if (!slug) continue
    const fallback = categoryFallback(entry.category)
    declarations.push(`  --font-${slug}: "${escapeCssString(entry.family)}", ${fallback};`)
  }
  if (declarations.length === 0) return ''
  return `:root {\n${declarations.join('\n')}\n}`
}

/**
 * Combine `@font-face` rules and `--font-*` tokens. This is the single block
 * that gets injected into the canvas and pasted into the publisher head.
 */
export function generateFontsCss(fonts: SiteFontsSettings | null | undefined): string {
  const tokens = generateFontFamilyTokensCss(fonts)
  const faces = generateSiteFontsCss(fonts)
  return [tokens, faces].filter(Boolean).join('\n\n')
}

/**
 * Lightweight summary used by tests and diagnostics — counts how many faces
 * the generator would emit.
 */
export function fontFaceCount(entry: FontEntry): number {
  if (!entry?.files) return 0
  return entry.files.filter((f) => f && f.format === 'woff2').length
}
