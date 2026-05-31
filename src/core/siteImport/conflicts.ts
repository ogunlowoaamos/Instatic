/**
 * conflicts — detect and resolve slug / class-name collisions.
 *
 * Page conflicts:
 *   The desired slug (from htmlPagePlan) collides with an existing page slug
 *   in the site. Default resolution: auto-rename (`about` → `about-2`,
 *   `-3`, `-4`, ... until a free slot is found).
 *
 * Rule conflicts:
 *   Only `kind:'class'` rules can conflict because class names must be unique
 *   across the global registry. Ambient rules never conflict — multiple rules
 *   with identical selectors are allowed and resolved by `order`.
 *
 * Applying resolutions:
 *   `applyConflictResolutions(plan, resolutions)` returns a new ImportPlan
 *   with resolved slugs / names applied. Callers can override individual
 *   items by passing a partial array of resolutions.
 */

import type {
  ImportPlan,
  PageConflict,
  RuleConflict,
  PagePlan,
  NewStyleRule,
} from './types'
import type { SiteDocument, PageNode } from '@core/page-tree'
import type { ImportFragment } from '@core/htmlImport'

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface ConflictDetectionResult {
  pages: PageConflict[]
  rules: RuleConflict[]
}

/**
 * Detect all slug and rule-name collisions between an in-progress ImportPlan
 * and the existing site.
 *
 * Does NOT mutate the plan — returns a description of the conflicts with
 * default resolutions pre-computed.
 */
export function detectConflicts(
  currentSite: SiteDocument,
  pagePlans: PagePlan[],
  styleRules: NewStyleRule[],
): ConflictDetectionResult {
  const pageConflicts = detectPageConflicts(currentSite, pagePlans)
  const ruleConflicts = detectRuleConflicts(currentSite, styleRules)
  return { pages: pageConflicts, rules: ruleConflicts }
}

// ---------------------------------------------------------------------------
// Page conflict detection
// ---------------------------------------------------------------------------

function detectPageConflicts(
  site: SiteDocument,
  pagePlans: PagePlan[],
): PageConflict[] {
  const conflicts: PageConflict[] = []

  // Build slug → id map for existing pages
  const existingSlugs = new Map<string, string>()
  for (const page of site.pages) {
    existingSlugs.set(page.slug, page.id)
  }

  // Track ALL claimed slugs — existing pages AND earlier items in the same
  // import batch. This catches both site-vs-import AND intra-batch collisions
  // (two HTML files that would resolve to the same slug).
  //
  // Values: real page id for existing-page claims, 'import:<source>' for
  // intra-batch claims. The existingPageId on the conflict reflects this:
  // empty string for intra-batch collisions (no real page yet).
  const claimedSlugs = new Map<string, string>(existingSlugs)

  for (const plan of pagePlans) {
    const desiredSlug = plan.slug
    const claimedBy = claimedSlugs.get(desiredSlug)

    if (claimedBy !== undefined) {
      const resolvedSlug = nextAvailableSlug(desiredSlug, claimedSlugs)
      // existingPageId is the real site-page id if the collision is with an
      // existing page; empty string for intra-batch collisions.
      const existingPageId = existingSlugs.get(desiredSlug) ?? ''
      conflicts.push({
        source: plan.source,
        desiredSlug,
        existingPageId,
        defaultResolution: {
          action: 'auto-rename',
          resolvedSlug,
        },
      })
      claimedSlugs.set(resolvedSlug, `import:${plan.source}`)
    } else {
      // No conflict — claim the slug for subsequent items in the same batch.
      claimedSlugs.set(desiredSlug, `import:${plan.source}`)
    }
  }

  return conflicts
}

// ---------------------------------------------------------------------------
// Rule conflict detection
// ---------------------------------------------------------------------------

function detectRuleConflicts(
  site: SiteDocument,
  styleRules: NewStyleRule[],
): RuleConflict[] {
  const conflicts: RuleConflict[] = []

  // Only kind:'class' rules have unique-name constraints
  const existingClassNames = new Map<string, string>()
  for (const rule of Object.values(site.styleRules)) {
    if (rule.kind === 'class') existingClassNames.set(rule.name, rule.id)
  }

  // Track names claimed by earlier items in the import batch
  const claimedNames = new Map<string, string>(existingClassNames)

  for (const rule of styleRules) {
    if (rule.kind !== 'class') continue // ambient rules never conflict

    const desiredName = rule.name
    const existingId = existingClassNames.get(desiredName)

    if (existingId) {
      const resolvedName = nextAvailableName(desiredName, claimedNames)
      conflicts.push({
        source: '', // CSS file path is not tracked per-rule in NewStyleRule
        desiredName,
        existingRuleId: existingId,
        defaultResolution: {
          action: 'auto-rename',
          resolvedName,
        },
      })
      claimedNames.set(resolvedName, `import:${desiredName}`)
    } else {
      claimedNames.set(desiredName, `import:${desiredName}`)
    }
  }

  return conflicts
}

// ---------------------------------------------------------------------------
// Auto-rename helpers
// ---------------------------------------------------------------------------

/**
 * Find the first available slug by appending `-2`, `-3`, `-4`, ... until
 * none of the claimed slugs match.
 */
function nextAvailableSlug(
  baseSlug: string,
  claimedSlugs: Map<string, string>,
): string {
  let suffix = 2
  while (true) {
    const candidate = `${baseSlug}-${suffix}`
    if (!claimedSlugs.has(candidate)) return candidate
    suffix++
  }
}

/**
 * Find the first available class name by appending `-2`, `-3`, `-4`, ...
 */
function nextAvailableName(
  baseName: string,
  claimedNames: Map<string, string>,
): string {
  let suffix = 2
  while (true) {
    const candidate = `${baseName}-${suffix}`
    if (!claimedNames.has(candidate)) return candidate
    suffix++
  }
}

// ---------------------------------------------------------------------------
// Resolution application
// ---------------------------------------------------------------------------

/**
 * Apply a set of conflict resolutions to an ImportPlan, returning a new plan
 * with resolved slugs and rule names substituted in.
 *
 * Pass the full `plan.conflicts.pages` / `plan.conflicts.rules` arrays as
 * `resolutions` to apply defaults, or pass a modified copy to apply user
 * overrides.
 */
export function applyConflictResolutions(
  plan: ImportPlan,
  pageResolutions: PageConflict[],
  ruleResolutions: RuleConflict[],
): ImportPlan {
  // Build lookup maps
  const pageRes = new Map(pageResolutions.map((r) => [r.source, r.defaultResolution]))
  const ruleRes = new Map(ruleResolutions.map((r) => [r.desiredName, r.defaultResolution]))

  // Build the `originalName → resolvedName` rename map. Only auto-rename
  // resolutions move a class to a new name; `skip` keeps the original name
  // (the node intentionally binds to the pre-existing same-named rule).
  const classRenames = new Map<string, string>()
  for (const r of ruleResolutions) {
    const res = r.defaultResolution
    if (res.action === 'auto-rename' && res.resolvedName && res.resolvedName !== r.desiredName) {
      classRenames.set(r.desiredName, res.resolvedName)
    }
  }

  // Apply page resolutions. Imported fragment nodes still carry class *names*
  // in `classIds` (walkAndMap copies `el.classList` verbatim; names become
  // registry ids only at commit). When a rule was auto-renamed we MUST rewrite
  // those names too, otherwise the node keeps referencing the original name and
  // silently binds to a different same-named rule at commit — stranding the
  // imported rule's styles in the renamed-but-unreferenced class.
  const pages: PagePlan[] = plan.pages.map((page) => {
    const remappedFragment = classRenames.size > 0
      ? remapFragmentClassNames(page.nodeFragment, classRenames)
      : page.nodeFragment

    const res = pageRes.get(page.source)
    if (!res || res.action === 'skip') {
      // No slug change (or skip handled at commit time), but the fragment may
      // still need its class names remapped.
      return remappedFragment === page.nodeFragment
        ? page
        : { ...page, nodeFragment: remappedFragment }
    }
    const resolvedSlug = res.resolvedSlug ?? page.slug
    return { ...page, slug: resolvedSlug, nodeFragment: remappedFragment }
  })

  // Apply rule name resolutions
  const styleRules: NewStyleRule[] = plan.styleRules.map((rule) => {
    if (rule.kind !== 'class') return rule
    const res = ruleRes.get(rule.name)
    if (!res) return rule
    if (res.action === 'skip') return rule // skip handled at commit time
    const resolvedName = res.resolvedName ?? rule.name
    // The selector must stay in sync with the name for class-kind rules
    return {
      ...rule,
      name: resolvedName,
      selector: `.${resolvedName}`,
    }
  })

  return { ...plan, pages, styleRules }
}

/**
 * Rewrite every node's `classIds` (class *names* at the plan stage) through a
 * `originalName → resolvedName` rename map, returning a new fragment. Names not
 * in the map pass through unchanged. Nodes without `classIds` are untouched.
 */
function remapFragmentClassNames(
  fragment: ImportFragment,
  renames: Map<string, string>,
): ImportFragment {
  const nodes: Record<string, PageNode> = {}
  for (const [id, node] of Object.entries(fragment.nodes)) {
    if (!node.classIds?.length) {
      nodes[id] = node
      continue
    }
    nodes[id] = {
      ...node,
      classIds: node.classIds.map((name) => renames.get(name) ?? name),
    }
  }
  return { nodes, rootIds: fragment.rootIds }
}
