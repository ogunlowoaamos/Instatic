/**
 * ClassComposer - style editor for a single CSS class.
 *
 * The class editor mirrors the module settings surface: categorized sections,
 * typed controls, a compact breakpoint picker, and direct remove affordances per property.
 */

import { useState, useCallback } from 'react'
import { useEditorStore } from '@core/editor-store/store'
import type { CSSClass, CSSPropertyBag } from '@core/page-tree/types'
import { Button } from '@ui/components/Button'
import { SearchBar } from '@ui/components/SearchBar'
import { CloseIcon } from '@ui/icons/icons/close'
import { Settings2Icon } from '@ui/icons/icons/settings-2'
import { BoxStackIcon } from '@ui/icons/icons/box-stack'
import { PropertyControlRenderer } from '../PropertyControls/PropertyControlRenderer'
import { ClassPropertyRow } from './ClassPropertyRow'
import { Section } from './Section'
import type { AnyModuleDefinition } from '@core/module-engine/types'
import {
  clearModuleStylePatch,
  getModuleStyleBindings,
  isModuleStyleSet,
  type ResolvedModuleStyleBinding,
} from './moduleStyleBindings'
import {
  CLASS_STYLE_SECTIONS,
  cssPropertyLabel,
  getCSSPropertyDefaultValue,
  type ClassStyleSectionDefinition,
} from './cssControlTypes'
import styles from './ClassComposer.module.css'

interface ClassComposerProps {
  classId: string
  cls: CSSClass
  moduleDefinition?: AnyModuleDefinition | null
  moduleProps?: Record<string, unknown>
  autoFocusName?: boolean
  mode?: 'contextual' | 'global'
}

export function ClassComposer({
  classId,
  cls,
  moduleDefinition,
  moduleProps = {},
  mode = 'contextual',
}: ClassComposerProps) {
  const activeBreakpointId = useEditorStore((s) => s.activeBreakpointId)
  const updateClassStyles = useEditorStore((s) => s.updateClassStyles)
  const setClassBreakpointStyles = useEditorStore((s) => s.setClassBreakpointStyles)

  const activeTab = getActiveStyleTab(activeBreakpointId)
  const [styleQuery, setStyleQuery] = useState('')
  const [activeStyleSectionId, setActiveStyleSectionId] = useState(ALL_STYLE_CATEGORY_ID)

  const storedStyles: Partial<CSSPropertyBag> = activeTab !== 'base'
    ? (cls.breakpointStyles[activeTab] ?? {})
    : cls.styles
  const currentStyles: Partial<CSSPropertyBag> = activeTab !== 'base'
    ? { ...cls.styles, ...storedStyles }
    : cls.styles
  const moduleBindings = mode === 'global' ? [] : getModuleStyleBindings(moduleDefinition)
  const assignedModuleBindings = getAssignedModuleStyleBindings(moduleBindings, currentStyles)
  const hasStyleQuery = Boolean(styleQuery.trim())
  const visibleModuleBindings = hasStyleQuery || activeStyleSectionId === ALL_STYLE_CATEGORY_ID
    ? getVisibleModuleStyleBindings(styleQuery, moduleBindings)
    : []
  const allModuleOwnedProperties = new Set(moduleBindings.flatMap(({ binding }) => binding.properties))
  const styleSectionSetCounts = getClassStyleSectionSetCounts(storedStyles, allModuleOwnedProperties)
  const visibleStyleSections = getVisibleStyleSections(styleQuery, activeStyleSectionId, allModuleOwnedProperties)

  const handleChange = useCallback(
    (key: keyof CSSPropertyBag, value: string | number | undefined) => {
      const patch = { [key]: value ?? null } as Partial<CSSPropertyBag>
      if (activeTab !== 'base') {
        setClassBreakpointStyles(classId, activeTab, patch)
      } else {
        updateClassStyles(classId, patch)
      }
    },
    [classId, activeTab, updateClassStyles, setClassBreakpointStyles],
  )

  const handleStylePatch = useCallback(
    (patch: Partial<CSSPropertyBag>) => {
      if (activeTab !== 'base') {
        setClassBreakpointStyles(classId, activeTab, patch)
      } else {
        updateClassStyles(classId, patch)
      }
    },
    [classId, activeTab, updateClassStyles, setClassBreakpointStyles],
  )

  const handleRemoveProperty = useCallback(
    (key: keyof CSSPropertyBag) => {
      handleChange(key, undefined)
    },
    [handleChange],
  )

  const clearStyleQuery = useCallback(() => {
    setStyleQuery('')
  }, [])

  const handleStyleQueryChange = useCallback(
    (nextQuery: string) => {
      setStyleQuery(nextQuery)
    },
    [],
  )

  function handleModuleStyleChange(binding: ResolvedModuleStyleBinding, value: unknown) {
    handleStylePatch(binding.binding.toCSS(value, currentStyles))
  }

  function handleRemoveModuleStyle(binding: ResolvedModuleStyleBinding) {
    handleStylePatch(clearModuleStylePatch(binding))
  }

  return (
    <div className={styles.composer}>
      <div className={styles.styleToolbar}>
        <div className={styles.toolbarRow}>
          <SearchBar
            value={styleQuery}
            onValueChange={handleStyleQueryChange}
            onClear={clearStyleQuery}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                clearStyleQuery()
              }
            }}
            placeholder={`Search styles in ${cls.name}...`}
            aria-label="Search class style properties to add"
          />
        </div>
      </div>

      <div className={styles.styleCatalogLayout}>
        <div className={styles.styleSections}>
          {visibleModuleBindings.length > 0 && (
            <Section
              title={`${moduleDefinition?.name ?? 'Module'} styles`}
              icon={Settings2Icon}
              defaultOpen
              meta={assignedModuleBindings.length > 0 ? `${assignedModuleBindings.length} set` : undefined}
            >
              <div className={styles.styleSectionBody}>
                {visibleModuleBindings.map((binding) => (
                  <ModuleStyleBindingRow
                    key={`${activeTab}-${binding.key}`}
                    binding={binding}
                    currentStyles={currentStyles}
                    moduleProps={moduleProps}
                    moduleDefaults={moduleDefinition?.defaults}
                    isSet={isModuleStyleSet(binding, storedStyles)}
                    onChange={handleModuleStyleChange}
                    onRemove={handleRemoveModuleStyle}
                  />
                ))}
              </div>
            </Section>
          )}
          {visibleStyleSections.map((section) => (
            <ClassStyleSection
              key={section.id}
              section={section}
              currentStyles={currentStyles}
              storedStyles={storedStyles}
              activeTab={activeTab}
              onChange={handleChange}
              onRemove={handleRemoveProperty}
            />
          ))}
          {visibleModuleBindings.length === 0 && visibleStyleSections.length === 0 && (
            <div className={styles.noStyleMatches}>No matching styles.</div>
          )}
        </div>
        <StyleCategoryRail
          activeSectionId={activeStyleSectionId}
          sectionSetCounts={styleSectionSetCounts}
          onChange={setActiveStyleSectionId}
        />
      </div>
    </div>
  )
}

interface ClassStyleSectionProps {
  section: ClassStyleSectionDefinition
  currentStyles: Partial<CSSPropertyBag>
  storedStyles: Partial<CSSPropertyBag>
  activeTab: string
  onChange: (property: keyof CSSPropertyBag, value: string | number | undefined) => void
  onRemove: (property: keyof CSSPropertyBag) => void
}

function ClassStyleSection({
  section,
  currentStyles,
  storedStyles,
  activeTab,
  onChange,
  onRemove,
}: ClassStyleSectionProps) {
  const setCount = section.properties.filter((prop) => hasStyleValue(storedStyles[prop])).length

  return (
    <Section
      title={section.title}
      icon={section.icon}
      defaultOpen
      indicator={setCount > 0 ? 'set' : undefined}
      indicatorTestId={`class-style-section-dot-${section.id}`}
      meta={setCount > 0 ? `${setCount} set` : undefined}
    >
      <div className={styles.styleSectionBody}>
        {section.properties.map((prop) => {
          const storedValue = storedStyles[prop]
          const isSet = hasStyleValue(storedValue)
          const fallbackValue = hasStyleValue(currentStyles[prop])
            ? currentStyles[prop]
            : getCSSPropertyDefaultValue(prop)

          return (
            <ClassPropertyRow
              key={`${activeTab}-${String(prop)}`}
              property={prop}
              value={isSet ? storedValue : undefined}
              placeholder={!isSet ? fallbackValue : undefined}
              isSet={isSet}
              onChange={onChange}
              onRemove={onRemove}
            />
          )
        })}
      </div>
    </Section>
  )
}

interface ModuleStyleBindingRowProps {
  binding: ResolvedModuleStyleBinding
  currentStyles: Partial<CSSPropertyBag>
  moduleProps: Record<string, unknown>
  moduleDefaults?: Record<string, unknown>
  isSet: boolean
  onChange: (binding: ResolvedModuleStyleBinding, value: unknown) => void
  onRemove: (binding: ResolvedModuleStyleBinding) => void
}

function ModuleStyleBindingRow({
  binding,
  currentStyles,
  moduleProps,
  moduleDefaults,
  isSet,
  onChange,
  onRemove,
}: ModuleStyleBindingRowProps) {
  const styleValue = binding.binding.fromCSS(currentStyles)
  const value = hasStyleValue(styleValue as string | number | undefined)
    ? styleValue
    : (moduleProps[binding.key] ?? moduleDefaults?.[binding.key] ?? binding.binding.defaultValue ?? '')

  return (
    <div
      className={styles.moduleStyleRow}
      data-state={isSet ? 'set' : 'unset'}
      data-testid={`module-style-row-${binding.key}`}
    >
      <PropertyControlRenderer
        propKey={`module-style-${binding.key}`}
        control={binding.control}
        value={value}
        onChange={(_, nextValue) => onChange(binding, nextValue)}
      />
      {isSet && (
        <Button
          variant="ghost"
          size="micro"
          iconOnly
          onClick={() => onRemove(binding)}
          aria-label={`Remove ${binding.label} module style`}
          title={`Remove ${binding.label}`}
          className={styles.moduleStyleRemoveBtn}
        >
          <CloseIcon size={16} color="currentColor" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

interface StyleCategoryRailProps {
  activeSectionId: string
  sectionSetCounts: ReadonlyMap<string, number>
  onChange: (sectionId: string) => void
}

function StyleCategoryRail({ activeSectionId, sectionSetCounts, onChange }: StyleCategoryRailProps) {
  return (
    <div className={styles.categoryRail} role="toolbar" aria-label="Class style categories">
      <Button
        variant="ghost"
        size="xs"
        iconOnly
        pressed={activeSectionId === ALL_STYLE_CATEGORY_ID}
        onClick={() => onChange(ALL_STYLE_CATEGORY_ID)}
        aria-label="Show all class style categories"
        title="All styles"
        className={styles.categoryRailButton}
      >
        <BoxStackIcon size={14} aria-hidden="true" />
      </Button>
      {CLASS_STYLE_SECTIONS.map((section) => {
        const SectionIcon = section.icon
        const setCount = sectionSetCounts.get(section.id) ?? 0
        const hasSetStyles = setCount > 0
        return (
          <Button
            key={section.id}
            variant="ghost"
            size="xs"
            iconOnly
            pressed={activeSectionId === section.id}
            onClick={() => onChange(section.id)}
            aria-label={`Show ${section.title} styles`}
            title={section.title}
            className={styles.categoryRailButton}
            data-has-set-styles={hasSetStyles ? 'true' : undefined}
          >
            <span className={styles.categoryRailIconWrap}>
              <SectionIcon size={14} aria-hidden="true" />
              {hasSetStyles && (
                <span
                  className={styles.categoryRailSetDot}
                  data-testid={`class-style-category-dot-${section.id}`}
                  aria-hidden="true"
                />
              )}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

function getClassStyleSectionSetCounts(
  storedStyles: Partial<CSSPropertyBag>,
  hiddenProperties = new Set<keyof CSSPropertyBag>(),
): ReadonlyMap<string, number> {
  return new Map(
    CLASS_STYLE_SECTIONS.map((section) => [
      section.id,
      section.properties.filter((prop) => !hiddenProperties.has(prop) && hasStyleValue(storedStyles[prop])).length,
    ]),
  )
}

function getVisibleStyleSections(
  query: string,
  activeSectionId: string,
  hiddenProperties = new Set<keyof CSSPropertyBag>(),
): ReadonlyArray<ClassStyleSectionDefinition> {
  const normalizedQuery = query.trim().toLowerCase()
  const effectiveSectionId = normalizedQuery ? ALL_STYLE_CATEGORY_ID : activeSectionId

  return CLASS_STYLE_SECTIONS
    .filter((section) => effectiveSectionId === ALL_STYLE_CATEGORY_ID || section.id === effectiveSectionId)
    .map((section) => ({
      ...section,
      properties: section.properties.filter(
        (prop) =>
          !hiddenProperties.has(prop) &&
          (!normalizedQuery || sectionMatchesQuery(section, normalizedQuery) || propertyMatchesQuery(prop, normalizedQuery)),
      ),
    }))
    .filter((section) => section.properties.length > 0)
}

function getAssignedModuleStyleBindings(
  bindings: ReadonlyArray<ResolvedModuleStyleBinding>,
  styles: Partial<CSSPropertyBag>,
): ReadonlyArray<ResolvedModuleStyleBinding> {
  return bindings.filter((binding) => isModuleStyleSet(binding, styles))
}

function getVisibleModuleStyleBindings(
  query: string,
  bindings: ReadonlyArray<ResolvedModuleStyleBinding>,
): ReadonlyArray<ResolvedModuleStyleBinding> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return bindings

  return bindings.filter(
    (binding) =>
      (binding.key.toLowerCase().includes(normalizedQuery) || binding.label.toLowerCase().includes(normalizedQuery)),
  )
}

function sectionMatchesQuery(section: ClassStyleSectionDefinition, query: string): boolean {
  return section.id.toLowerCase().includes(query) || section.title.toLowerCase().includes(query)
}

function propertyMatchesQuery(prop: keyof CSSPropertyBag, query: string): boolean {
  const raw = String(prop).toLowerCase()
  const label = cssPropertyLabel(String(prop)).toLowerCase()
  return raw.includes(query) || label.includes(query)
}

function hasStyleValue(value: string | number | undefined): value is string | number {
  return value !== undefined && value !== null && value !== ''
}

function getActiveStyleTab(activeBreakpointId: string | undefined): string {
  return activeBreakpointId && activeBreakpointId !== 'desktop' ? activeBreakpointId : 'base'
}

const ALL_STYLE_CATEGORY_ID = 'all'
