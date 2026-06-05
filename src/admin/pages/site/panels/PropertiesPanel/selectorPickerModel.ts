import { styleRuleSelector, type PageNode, type StyleRule } from '@core/page-tree'
import { readIdentifierEnd, splitSelectorList, stripStatePseudos } from '@site/cssStatePseudo'

export type SelectorMatch =
  | { kind: 'direct' }
  | { kind: 'inactive-pseudo'; pseudo: string }

export interface SelectorPillItem {
  rule: StyleRule
  match: SelectorMatch
  active: boolean
  removable: boolean
}

export interface SelectorSuggestionItem {
  rule: StyleRule
  disabled: boolean
  disabledReason: string | null
  match: SelectorMatch | null
}

export interface SelectorPickerModelInput {
  rules: Record<string, StyleRule>
  node: PageNode | null
  selectedElement: Element | null
  activeRuleId: string | null
}

export interface SelectorPickerModel {
  pills: SelectorPillItem[]
  suggestions: SelectorSuggestionItem[]
}

export function deriveSelectorPickerModel(input: SelectorPickerModelInput): SelectorPickerModel {
  const { rules, node, selectedElement, activeRuleId } = input
  const assignedIds = node?.classIds ?? []
  const assignedIdSet = new Set(assignedIds)
  const pills: SelectorPillItem[] = []
  const suggestions: SelectorSuggestionItem[] = []

  for (const classId of assignedIds) {
    const rule = rules[classId]
    if (!rule || rule.kind === 'ambient') continue
    pills.push({
      rule,
      match: { kind: 'direct' },
      active: activeRuleId === rule.id,
      removable: true,
    })
  }

  for (const rule of sortedRules(rules)) {
    if (rule.kind === 'ambient') {
      const match = matchAmbientRule(rule, selectedElement)
      if (match) {
        pills.push({
          rule,
          match,
          active: activeRuleId === rule.id,
          removable: false,
        })
      }
      suggestions.push({
        rule,
        match,
        disabled: match === null,
        disabledReason: match === null ? "Doesn't match this element" : null,
      })
      continue
    }

    if (!assignedIdSet.has(rule.id)) {
      suggestions.push({
        rule,
        match: null,
        disabled: false,
        disabledReason: null,
      })
    }
  }

  return { pills: sortPillsBySpecificity(pills), suggestions }
}

function sortedRules(rules: Record<string, StyleRule>): StyleRule[] {
  return Object.values(rules).slice().sort((a, b) => {
    const byOrder = normaliseOrder(a) - normaliseOrder(b)
    return byOrder !== 0 ? byOrder : a.name.localeCompare(b.name)
  })
}

function normaliseOrder(rule: StyleRule): number {
  return Number.isFinite(rule.order) ? rule.order : 0
}

/**
 * Order pills weakest → strongest by CSS specificity, so the chip that actually
 * wins the cascade reads last (e.g. `*` → `.btn-primary` → `.btn-primary:hover`).
 * Equal specificity falls back to stylesheet source order, then name, for a
 * stable result.
 */
function sortPillsBySpecificity(pills: SelectorPillItem[]): SelectorPillItem[] {
  return pills
    .map((pill) => ({ pill, specificity: selectorSpecificity(styleRuleSelector(pill.rule)) }))
    .sort((a, b) => {
      const bySpecificity = compareSpecificity(a.specificity, b.specificity)
      if (bySpecificity !== 0) return bySpecificity
      const byOrder = normaliseOrder(a.pill.rule) - normaliseOrder(b.pill.rule)
      if (byOrder !== 0) return byOrder
      return a.pill.rule.name.localeCompare(b.pill.rule.name)
    })
    .map((entry) => entry.pill)
}

type Specificity = readonly [number, number, number]

function compareSpecificity(a: Specificity, b: Specificity): number {
  return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2])
}

/**
 * Pragmatic CSS specificity `(ids, classes, types)` for a selector, used purely
 * to order pills:
 *   - ids:     `#id`
 *   - classes: `.class`, `[attr]`, and `:pseudo-class` (`:where()` counts 0)
 *   - types:   element names and `::pseudo-element`
 * The universal `*` and combinators count nothing. For a selector list the
 * strongest comma-separated part wins. Functional-pseudo arguments
 * (`:not()`/`:is()`/`:has()`) are not recursed into — exact cascade weight isn't
 * needed for ordering, so the simpler count is intentional.
 */
function selectorSpecificity(selector: string): Specificity {
  let strongest: Specificity = [0, 0, 0]
  for (const part of splitSelectorList(selector)) {
    const partSpecificity = compoundSpecificity(part)
    if (compareSpecificity(partSpecificity, strongest) > 0) strongest = partSpecificity
  }
  return strongest
}

const IDENTIFIER_CHAR = /[\w-]/

function compoundSpecificity(selector: string): Specificity {
  let ids = 0
  let classes = 0
  let types = 0
  let i = 0
  while (i < selector.length) {
    const ch = selector[i]
    if (ch === '[' || ch === '(') {
      // Attribute selectors count as a class; pseudo arguments are skipped.
      if (ch === '[') classes++
      i = skipBalanced(selector, i)
      continue
    }
    if (ch === '#') {
      ids++
      i = readIdentifierEnd(selector, i + 1)
      continue
    }
    if (ch === '.') {
      classes++
      i = readIdentifierEnd(selector, i + 1)
      continue
    }
    if (ch === ':') {
      if (selector[i + 1] === ':') {
        types++ // pseudo-element
        i = readIdentifierEnd(selector, i + 2)
        continue
      }
      const end = readIdentifierEnd(selector, i + 1)
      if (selector.slice(i + 1, end) !== 'where') classes++ // `:where()` is always 0
      i = end
      continue
    }
    if (IDENTIFIER_CHAR.test(ch)) {
      types++ // element/type selector
      i = readIdentifierEnd(selector, i + 1)
      continue
    }
    // `*`, combinators, and whitespace contribute nothing.
    i++
  }
  return [ids, classes, types]
}

/** Skip from an opening `(`/`[` to just past its matching close, depth-aware. */
function skipBalanced(selector: string, start: number): number {
  const open = selector[start]
  const close = open === '(' ? ')' : ']'
  let depth = 0
  let i = start
  while (i < selector.length) {
    const ch = selector[i]
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return i
}

function matchAmbientRule(rule: StyleRule, selectedElement: Element | null): SelectorMatch | null {
  if (!selectedElement) return null
  const selector = styleRuleSelector(rule)
  if (safeMatches(selectedElement, selector)) return { kind: 'direct' }

  // The selector did not match as-is. If it targets the element in an
  // interactive pseudo-state (`:hover`/`:focus`/…) the rule is still relevant —
  // surface it as an inactive-pseudo match so the state styles stay editable.
  // The state pseudo may live in one entry of a comma-separated selector list
  // (`.btn:hover, .x .btn`) and may sit alongside a `::pseudo-element`
  // (`.card:hover::after`), so we test every list entry independently after
  // stripping its state pseudos and pseudo-elements.
  for (const alternative of splitSelectorList(selector)) {
    const { base, pseudo } = stripStatePseudos(alternative)
    if (!pseudo || !base) continue
    if (safeMatches(selectedElement, base)) return { kind: 'inactive-pseudo', pseudo }
  }
  return null
}

function safeMatches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector)
  } catch (_err) {
    // Corrupt persisted selectors must not break the Properties panel render path.
    return false
  }
}
