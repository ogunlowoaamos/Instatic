/**
 * ClassComposer — CSS section content renderer for a single class.
 *
 * Renders the style property sections for the given class filtered by
 * activeStyleSectionId and styleQuery. The rail, search bar, and section
 * navigation are owned by the parent (StyleSurface).
 */

import { useEditorStore } from '@site/store/store'
import type { StyleRule, CSSPropertyBag } from '@core/page-tree'
import { ClassPropertyRow } from './ClassPropertyRow'
import { Section } from '@ui/components/Section'
import { SpacingBoxControl } from './SpacingBoxControl/SpacingBoxControl'
import { BorderControl } from './BorderControl/BorderControl'
import { CustomPropertiesSection } from './CustomPropertiesSection'
import { LayoutSection } from './LayoutSection'
import { PositionSection } from './PositionSection'
import {
  CLASS_STYLE_SECTIONS,
  cssPropertyLabel,
  getCSSPropertyDefaultValue,
  getActiveStyleTab,
  type ClassStyleSectionDefinition,
} from './cssControlTypes'
import { hasStyleValue } from './styleValueUtils'
import styles from './ClassComposer.module.css'
import sectionStyles from '@ui/components/Section/Section.module.css'

const SPACING_SECTION_ID = 'spacing'
const LAYOUT_SECTION_ID = 'layout'
const POSITION_SECTION_ID = 'position'
const BORDER_SECTION_ID = 'border'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ClassComposerProps {
  classId: string
  cls: StyleRule
  /** Search query — filters visible properties across all categories. */
  styleQuery: string
  mode?: 'contextual' | 'global'
}

// ---------------------------------------------------------------------------
// ClassComposer
// ---------------------------------------------------------------------------

export function ClassComposer({
  classId,
  cls,
  styleQuery,
  mode: _mode = 'contextual',
}: ClassComposerProps) {
  const activeBreakpointId = useEditorStore((s) => s.activeBreakpointId)
  // The editing context is owned by the canvas toolbar's context switcher:
  // either the active viewport (base / breakpoint) or a custom condition. The
  // selector validates the active condition id against the registry and returns
  // a stable string | null, so a stale id (condition removed) falls back to
  // viewport editing without re-render churn.
  const activeConditionId = useEditorStore((s) => {
    const id = s.activeConditionId
    if (id === null) return null
    const cs = s.site?.conditions
    return cs && cs.some((c) => c.id === id) ? id : null
  })
  const updateClassStyles = useEditorStore((s) => s.updateClassStyles)
  const setClassContextStyles = useEditorStore((s) => s.setClassContextStyles)
  const removeClassStyleProperty = useEditorStore((s) => s.removeClassStyleProperty)
  const setPreviewClassStyles = useEditorStore((s) => s.setPreviewClassStyles)
  const clearPreviewClassStyles = useEditorStore((s) => s.clearPreviewClassStyles)

  const onCondition = activeConditionId !== null

  const activeTab = getActiveStyleTab(activeBreakpointId)

  // The active context key: a condition id, a breakpoint id, or none (base).
  const activeContextId = onCondition
    ? activeConditionId
    : activeTab !== 'base'
      ? activeTab
      : null

  const storedStyles: Record<string, unknown> = activeContextId
    ? (cls.contextStyles[activeContextId] ?? {})
    : cls.styles
  const currentStyles: Record<string, unknown> = activeContextId
    ? { ...cls.styles, ...storedStyles }
    : cls.styles

  const visibleStyleSections = getVisibleStyleSections(styleQuery)

  const handleChange = (key: keyof CSSPropertyBag, value: string | number | undefined) => {
    const patch = { [key]: value ?? null } as Partial<CSSPropertyBag>
    if (activeContextId) {
      setClassContextStyles(classId, activeContextId, patch)
    } else {
      updateClassStyles(classId, patch)
    }
  }

  const handleRemoveProperty = (key: keyof CSSPropertyBag) => {
    handleChange(key, undefined)
  }

  /**
   * Fully clear a property — used by visual switchers (LayoutSection) where
   * the X / clear affordance must really make a property go away regardless
   * of whether the value at the active tab is stored or inherited from base.
   * Routes through `removeClassStyleProperty` which removes the key from
   * base styles AND every breakpoint override in a single history entry.
   */
  const handleClearProperty = (key: keyof CSSPropertyBag) => {
    if (onCondition && activeConditionId) {
      // On a custom-condition tab, "clear" removes the prop from that
      // condition's override bag only. On a width-breakpoint tab it clears the
      // property everywhere (base + every context) so the inherited base value
      // can't bleed through and leave the switcher segment stuck pressed.
      setClassContextStyles(classId, activeConditionId, {
        [key]: undefined,
      } as Partial<CSSPropertyBag>)
      return
    }
    removeClassStyleProperty(classId, key)
  }

  // Preview a transient style patch on the canvas while a property
  // control's hover-suggestion menu is open. The preview lives entirely
  // in store UI state — no class document mutation, no history entry.
  const handlePreview = (patch: Partial<CSSPropertyBag>) => {
    // The canvas preview channel is keyed by classId + optional breakpointId
    // — it can't target a conditional layer. Skip preview while a condition
    // tab is active rather than previewing onto the wrong (base/breakpoint)
    // target. The actual edit still commits correctly via handleChange.
    if (onCondition) return
    setPreviewClassStyles({
      classId,
      breakpointId: activeTab !== 'base' ? activeTab : null,
      styles: patch,
    })
  }

  const handleClearPreview = () => {
    clearPreviewClassStyles(classId)
  }

  // Re-key the section controls on the active editing context (base /
  // breakpoint / condition) so they remount and re-read the right stored bag
  // when the toolbar context switcher changes the target.
  const sectionKey = activeContextId ?? 'base'

  return (
    <div className={styles.styleSections}>
      {visibleStyleSections.map((section) => (
        <div key={section.id} data-style-section={section.id}>
          <ClassStyleSection
            section={section}
            currentStyles={currentStyles}
            storedStyles={storedStyles}
            activeTab={sectionKey}
            onChange={handleChange}
            onRemove={handleRemoveProperty}
            onClearProperty={handleClearProperty}
            onPreview={handlePreview}
            onClearPreview={handleClearPreview}
          />
        </div>
      ))}
      {/* Custom properties — generic editor for the long tail of CSS the
          curated sections don't claim. Hidden while a style search is active
          (the search filters the curated sections; the raw editor isn't a
          search target). */}
      {!styleQuery.trim() && (
        <div data-style-section="custom">
          <CustomPropertiesSection
            key={sectionKey}
            storedStyles={storedStyles}
            onChange={handleChange}
            onRemove={handleRemoveProperty}
          />
        </div>
      )}
      {visibleStyleSections.length === 0 && styleQuery.trim() && (
        <div className={styles.noStyleMatches}>No matching styles.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ClassStyleSection
// ---------------------------------------------------------------------------

interface ClassStyleSectionProps {
  section: ClassStyleSectionDefinition
  currentStyles: Record<string, unknown>
  storedStyles: Record<string, unknown>
  activeTab: string
  onChange: (property: keyof CSSPropertyBag, value: string | number | undefined) => void
  onRemove: (property: keyof CSSPropertyBag) => void
  onClearProperty: (property: keyof CSSPropertyBag) => void
  onPreview: (patch: Partial<CSSPropertyBag>) => void
  onClearPreview: () => void
}

function ClassStyleSection({
  section,
  currentStyles,
  storedStyles,
  activeTab,
  onChange,
  onRemove,
  onClearProperty,
  onPreview,
  onClearPreview,
}: ClassStyleSectionProps) {
  const setCount = section.properties.filter((prop) => hasStyleValue(storedStyles[prop])).length

  // Per-property adapter over the patch-shaped section preview channel, used
  // by the generic ClassPropertyRow rows (each owns a single property).
  const previewProperty = (
    property: keyof CSSPropertyBag,
    value: string | number | undefined,
  ) => onPreview({ [property]: value ?? null } as Partial<CSSPropertyBag>)

  return (
    <Section
      title={section.title}
      icon={section.icon}
      defaultOpen
      indicator={setCount > 0}
      indicatorTestId={`class-style-section-dot-${section.id}`}
      meta={setCount > 0 ? `${setCount} set` : undefined}
    >
      <div className={sectionStyles.sectionBody}>
        {section.id === SPACING_SECTION_ID ? (
          // Spacing section uses a single visual box-model widget instead of
          // a stack of 10 padding/margin rows. The widget owns shorthand
          // collapse and writes through the same onChange/onRemove pipeline.
          <SpacingBoxControl
            key={activeTab}
            storedStyles={storedStyles}
            currentStyles={currentStyles}
            onChange={onChange}
            onRemove={onRemove}
            onPreview={onPreview}
            onClearPreview={onClearPreview}
          />
        ) : section.id === LAYOUT_SECTION_ID ? (
          // Layout uses a task-shaped editor: an unlabeled segmented
          // Display switcher with a dropdown trail, plus icon switchers
          // for flex direction / wrap / alignment. Generic rows for the
          // long-tail layout properties still appear below.
          <LayoutSection
            key={activeTab}
            storedStyles={storedStyles}
            currentStyles={currentStyles}
            activeTab={activeTab}
            onChange={onChange}
            onRemove={onRemove}
            onClearProperty={onClearProperty}
            onPreview={onPreview}
            onClearPreview={onClearPreview}
          />
        ) : section.id === POSITION_SECTION_ID ? (
          // Position uses a task-shaped editor: a segmented Position
          // switcher with the four directional offsets revealed when the
          // value actually honors them, plus a z-index row that always
          // stays available inside the section.
          <PositionSection
            key={activeTab}
            storedStyles={storedStyles}
            currentStyles={currentStyles}
            activeTab={activeTab}
            onChange={onChange}
            onRemove={onRemove}
            onClearProperty={onClearProperty}
            onPreview={onPreview}
            onClearPreview={onClearPreview}
          />
        ) : section.id === BORDER_SECTION_ID ? (
          // Border uses a visual per-side editor (width / style / colour per
          // edge with a link toggle) + a radius corner editor + an outline
          // pair. The raw shorthand rows (border / borderTop / borderRadius /
          // …) live in the Advanced disclosure below for power users who want
          // to paste a shorthand string directly.
          <>
            <BorderControl
              key={activeTab}
              storedStyles={storedStyles}
              currentStyles={currentStyles}
              onChange={onChange}
              onClearProperty={onClearProperty}
              onPreview={onPreview}
              onClearPreview={onClearPreview}
            />
            <AdvancedRows
              activeTab={activeTab}
              properties={BORDER_ADVANCED_PROPERTIES}
              storedStyles={storedStyles}
              currentStyles={currentStyles}
              onChange={onChange}
              onRemove={onRemove}
              onPreview={previewProperty}
              onClearPreview={onClearPreview}
            />
          </>
        ) : (
          section.properties.map((prop) => {
            const storedValue = storedStyles[prop]
            const isSet = hasStyleValue(storedValue)
            const currentValue = currentStyles[prop]
            const fallbackValue = hasStyleValue(currentValue)
              ? currentValue
              : getCSSPropertyDefaultValue(prop)

            return (
              <ClassPropertyRow
                key={`${activeTab}-${String(prop)}`}
                property={prop}
                // storedValue is narrowed to string | number by the isSet guard above
                value={isSet ? (storedValue as string | number) : undefined}
                placeholder={!isSet ? fallbackValue : undefined}
                isSet={isSet}
                onChange={onChange}
                onRemove={onRemove}
                onPreview={previewProperty}
                onClearPreview={onClearPreview}
              />
            )
          })
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Border advanced rows — raw CSS shorthand props that the visual
// BorderControl deliberately doesn't surface. Kept available behind a
// disclosure for power users who paste shorthand strings.
// ---------------------------------------------------------------------------

const BORDER_ADVANCED_PROPERTIES: ReadonlyArray<keyof CSSPropertyBag> = [
  'border',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'borderRadius',
  'appearance',
]

interface AdvancedRowsProps {
  activeTab: string
  properties: ReadonlyArray<keyof CSSPropertyBag>
  storedStyles: Record<string, unknown>
  currentStyles: Record<string, unknown>
  onChange: (property: keyof CSSPropertyBag, value: string | number | undefined) => void
  onRemove: (property: keyof CSSPropertyBag) => void
  /** Per-property hover-preview adapter (see ClassStyleSection.previewProperty). */
  onPreview?: (property: keyof CSSPropertyBag, value: string | number | undefined) => void
  onClearPreview?: () => void
}

/**
 * A `<details>` disclosure wrapping a stack of raw property rows. Used for the
 * Border section's shorthand props. Native `<details>`/`<summary>` is semantic
 * HTML (not a bare interactive control), so it's outside the button-primitive
 * gate without needing an allowlist entry.
 */
function AdvancedRows({
  activeTab,
  properties,
  storedStyles,
  currentStyles,
  onChange,
  onRemove,
  onPreview,
  onClearPreview,
}: AdvancedRowsProps) {
  // Open by default when any advanced prop already carries a value, so an
  // imported class that set `border: 1px solid red` as a shorthand is visible.
  const anySet = properties.some((prop) => hasStyleValue(storedStyles[prop]))

  return (
    <details className={styles.advanced} open={anySet}>
      <summary className={styles.advancedSummary}>Advanced</summary>
      <div className={styles.advancedBody}>
        {properties.map((prop) => {
          const storedValue = storedStyles[prop]
          const isSet = hasStyleValue(storedValue)
          const currentValue = currentStyles[prop]
          const fallbackValue = hasStyleValue(currentValue)
            ? currentValue
            : getCSSPropertyDefaultValue(prop)
          return (
            <ClassPropertyRow
              key={`${activeTab}-${String(prop)}`}
              property={prop}
              value={isSet ? (storedValue as string | number) : undefined}
              placeholder={!isSet ? fallbackValue : undefined}
              isSet={isSet}
              onChange={onChange}
              onRemove={onRemove}
              onPreview={onPreview}
              onClearPreview={onClearPreview}
            />
          )
        })}
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function getVisibleStyleSections(
  query: string,
): ReadonlyArray<ClassStyleSectionDefinition> {
  const normalizedQuery = query.trim().toLowerCase()

  return CLASS_STYLE_SECTIONS
    .map((section) => ({
      ...section,
      properties: section.properties.filter(
        (prop) =>
          !normalizedQuery ||
          sectionMatchesQuery(section, normalizedQuery) ||
          propertyMatchesQuery(prop, normalizedQuery),
      ),
    }))
    .filter((section) => section.properties.length > 0)
}

function sectionMatchesQuery(section: ClassStyleSectionDefinition, query: string): boolean {
  return section.id.toLowerCase().includes(query) || section.title.toLowerCase().includes(query)
}

function propertyMatchesQuery(prop: keyof CSSPropertyBag, query: string): boolean {
  const raw = String(prop).toLowerCase()
  const label = cssPropertyLabel(String(prop)).toLowerCase()
  return raw.includes(query) || label.includes(query)
}
