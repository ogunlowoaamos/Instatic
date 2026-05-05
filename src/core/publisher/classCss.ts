import type { CSSClass } from '../page-tree/schemas'
import { cssClassSelector } from '../page-tree/classNames'
import { sanitiseCssValue } from './utils'

/**
 * Convert a camelCase CSS property name to kebab-case.
 * "backgroundColor" -> "background-color", "zIndex" -> "z-index"
 */
function toKebab(camel: string): string {
  return camel.replace(/([A-Z])/g, (_, c: string) => `-${c.toLowerCase()}`)
}

/** Allowlist of CSS property names from CSSPropertyBag. */
const ALLOWED_PROPS = new Set<string>([
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
  'lineHeight', 'textAlign', 'textDecoration', 'textTransform', 'color', 'textShadow',
  'display', 'flexDirection', 'flexWrap', 'alignItems', 'justifyContent',
  'justifyItems', 'alignSelf', 'justifySelf', 'flex', 'gap', 'rowGap', 'columnGap',
  'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'aspectRatio', 'boxSizing',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'backgroundColor', 'background', 'backgroundImage', 'backgroundSize',
  'backgroundPosition', 'backgroundRepeat', 'objectFit', 'objectPosition',
  'opacity', 'overflow', 'overflowX', 'overflowY',
  'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
  'borderColor',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
  'outline', 'outlineOffset',
  'boxShadow', 'filter', 'backdropFilter', 'transform', 'transformOrigin',
  'transition', 'animation',
  'cursor', 'pointerEvents', 'userSelect', 'scrollBehavior',
  'fill',
])

/**
 * Serialise a style map to a CSS declaration block string.
 * Only emits properties in the allowlist with sanitised values.
 * Accepts the wide persistence type (Record<string, unknown>) since styles are
 * stored without per-property narrowing at the persistence boundary.
 */
export function bagToCSS(bag: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [prop, value] of Object.entries(bag)) {
    if (!ALLOWED_PROPS.has(prop)) continue
    if (value === undefined || value === null || value === '') continue
    const sanitised = sanitiseCssValue(value as string | number)
    if (sanitised === null) continue
    lines.push(`  ${toKebab(prop)}: ${sanitised};`)
  }
  return lines.join('\n')
}

/**
 * Generate the full CSS string for all classes in the registry.
 * Includes base styles and @media blocks for breakpoint overrides.
 *
 * Cascade order matters. We emit breakpoint @media blocks in DESCENDING
 * width order (widest first, narrowest last). All @media (max-width: N)
 * blocks have the same selector specificity, so the last-matching one in
 * source order wins. Desktop is widest → its rule applies at wider
 * viewports while shadowed by tablet/mobile when the viewport narrows.
 *
 * If we iterated `cls.breakpointStyles` in insertion order, the user's
 * editing sequence would silently determine which breakpoint "wins" at
 * any given viewport — e.g. mobile-then-desktop would let desktop styles
 * leak through to mobile widths because desktop's @media rule was last
 * in source. Sorting by width fixes that for good.
 */
export function generateClassCSS(
  classes: Record<string, CSSClass>,
  breakpoints: Array<{ id: string; width: number }>,
): string {
  const blocks: string[] = []
  // Map id → width once per call so we can sort breakpoint entries below
  // without re-scanning the array per class.
  const widthById = new Map<string, number>(breakpoints.map((bp) => [bp.id, bp.width]))

  for (const cls of Object.values(classes)) {
    const baseDecls = bagToCSS(cls.styles)
    if (baseDecls) {
      blocks.push(`${cssClassSelector(cls)} {\n${baseDecls}\n}`)
    }

    const bpEntries = Object.entries(cls.breakpointStyles)
      .map(([bpId, bpStyles]) => ({ bpStyles, width: widthById.get(bpId) }))
      .filter((entry): entry is { bpStyles: typeof entry.bpStyles; width: number } =>
        entry.width !== undefined,
      )
      // Widest first → narrowest last. The narrowest matching @media rule
      // ends up later in source and wins on equal specificity.
      .sort((a, b) => b.width - a.width)

    for (const { bpStyles, width } of bpEntries) {
      const decls = bagToCSS(bpStyles)
      if (!decls) continue
      blocks.push(`@media (max-width: ${width}px) {\n  ${cssClassSelector(cls)} {\n${decls}\n  }\n}`)
    }
  }

  return blocks.join('\n\n')
}
