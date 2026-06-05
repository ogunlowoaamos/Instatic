import { describe, expect, it } from 'bun:test'
import { classKindSelector, classifySelectorCreateInput, type PageNode, type StyleRule } from '@core/page-tree'
import { deriveSelectorPickerModel } from '@site/panels/PropertiesPanel/selectorPickerModel'

function rule(overrides: Partial<StyleRule> & { id: string; name: string }): StyleRule {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: 'class',
    selector: classKindSelector(overrides.name),
    order: 0,
    styles: {},
    contextStyles: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function node(classIds: string[] = []): PageNode {
  return {
    id: 'title',
    moduleId: 'base.text',
    props: {},
    breakpointOverrides: {},
    children: [],
    classIds,
  }
}

describe('selectorPickerModel', () => {
  it('matches a descendant selector on the selected element subject only', () => {
    document.body.innerHTML = '<section class="hero"><h1 data-node-id="title" class="title"></h1></section>'
    const selected = document.querySelector<HTMLElement>('[data-node-id="title"]')!
    const ancestor = document.querySelector<HTMLElement>('.hero')!
    const heroTitle = rule({
      id: 'ambient-1',
      name: '.hero .title',
      kind: 'ambient',
      selector: '.hero .title',
    })

    const selectedModel = deriveSelectorPickerModel({
      rules: { [heroTitle.id]: heroTitle },
      node: node(),
      selectedElement: selected,
      activeRuleId: null,
    })
    const ancestorModel = deriveSelectorPickerModel({
      rules: { [heroTitle.id]: heroTitle },
      node: node(),
      selectedElement: ancestor,
      activeRuleId: null,
    })

    expect(selectedModel.pills.map((pill) => pill.rule.id)).toEqual(['ambient-1'])
    expect(ancestorModel.pills.map((pill) => pill.rule.id)).toEqual([])
  })

  it('includes trailing pseudo selectors as inactive matches', () => {
    document.body.innerHTML = '<a data-node-id="link" href="#">Link</a>'
    const selected = document.querySelector<HTMLElement>('[data-node-id="link"]')!
    const hover = rule({
      id: 'hover',
      name: 'a:hover',
      kind: 'ambient',
      selector: 'a:hover',
    })

    const model = deriveSelectorPickerModel({
      rules: { [hover.id]: hover },
      node: { ...node(), id: 'link' },
      selectedElement: selected,
      activeRuleId: null,
    })

    expect(model.pills).toHaveLength(1)
    expect(model.pills[0].match).toEqual({ kind: 'inactive-pseudo', pseudo: ':hover' })
  })

  it('matches a pseudo state inside a comma-separated selector list', () => {
    document.body.innerHTML = '<a data-node-id="btn" class="btn-card" href="#">Buy</a>'
    const selected = document.querySelector<HTMLElement>('[data-node-id="btn"]')!
    // First entry carries the :hover state; the second entry targets a different
    // element. Stripping only the whole string's trailing pseudo would miss this.
    const listed = rule({
      id: 'listed',
      name: '.btn-card:hover, .featured .btn-card',
      kind: 'ambient',
      selector: '.btn-card:hover, .featured .btn-card',
    })

    const model = deriveSelectorPickerModel({
      rules: { [listed.id]: listed },
      node: { ...node(), id: 'btn' },
      selectedElement: selected,
      activeRuleId: null,
    })

    expect(model.pills).toHaveLength(1)
    expect(model.pills[0].match).toEqual({ kind: 'inactive-pseudo', pseudo: ':hover' })
  })

  it('matches a pseudo state combined with a pseudo-element', () => {
    document.body.innerHTML = '<div data-node-id="card" class="program-card"></div>'
    const selected = document.querySelector<HTMLElement>('[data-node-id="card"]')!
    const hoverAfter = rule({
      id: 'hoverAfter',
      name: '.program-card:hover::after',
      kind: 'ambient',
      selector: '.program-card:hover::after',
    })

    const model = deriveSelectorPickerModel({
      rules: { [hoverAfter.id]: hoverAfter },
      node: { ...node(), id: 'card' },
      selectedElement: selected,
      activeRuleId: null,
    })

    expect(model.pills).toHaveLength(1)
    expect(model.pills[0].match).toEqual({ kind: 'inactive-pseudo', pseudo: ':hover' })
  })

  it('surfaces other interaction-state pseudos (e.g. :checked) as inactive matches', () => {
    document.body.innerHTML = '<input data-node-id="cb" type="checkbox" class="toggle">'
    const selected = document.querySelector<HTMLElement>('[data-node-id="cb"]')!
    const checked = rule({
      id: 'checked',
      name: '.toggle:checked',
      kind: 'ambient',
      selector: '.toggle:checked',
    })

    const model = deriveSelectorPickerModel({
      rules: { [checked.id]: checked },
      node: { ...node(), id: 'cb' },
      selectedElement: selected,
      activeRuleId: null,
    })

    expect(model.pills).toHaveLength(1)
    expect(model.pills[0].match).toEqual({ kind: 'inactive-pseudo', pseudo: ':checked' })
  })

  it('does not surface attribute-structural pseudos like :required as states', () => {
    document.body.innerHTML = '<input data-node-id="f" class="field">'
    const selected = document.querySelector<HTMLElement>('[data-node-id="f"]')!
    // `:required` is an attribute condition, not a transient state — on a field
    // that isn't required it must not appear as an editable inactive-state pill.
    const required = rule({
      id: 'required',
      name: '.field:required',
      kind: 'ambient',
      selector: '.field:required',
    })

    const model = deriveSelectorPickerModel({
      rules: { [required.id]: required },
      node: { ...node(), id: 'f' },
      selectedElement: selected,
      activeRuleId: null,
    })

    expect(model.pills).toHaveLength(0)
  })

  it('does not treat structural pseudo-classes as inactive pseudo states', () => {
    document.body.innerHTML = '<ul><li data-node-id="row" class="row"></li></ul>'
    const selected = document.querySelector<HTMLElement>('[data-node-id="row"]')!
    // :first-child is structural, not an interactive state — and it already
    // matches directly, so it should be a direct match, never inactive-pseudo.
    const firstChild = rule({
      id: 'firstChild',
      name: '.row:first-child',
      kind: 'ambient',
      selector: '.row:first-child',
    })

    const model = deriveSelectorPickerModel({
      rules: { [firstChild.id]: firstChild },
      node: { ...node(), id: 'row' },
      selectedElement: selected,
      activeRuleId: null,
    })

    expect(model.pills).toHaveLength(1)
    expect(model.pills[0].match).toEqual({ kind: 'direct' })
  })

  it('orders pills weakest → strongest by specificity', () => {
    document.body.innerHTML = '<a data-node-id="btn" class="btn-primary" href="#">Buy</a>'
    const selected = document.querySelector<HTMLElement>('[data-node-id="btn"]')!
    const star = rule({ id: 'star', name: '*', kind: 'ambient', selector: '*' })
    const base = rule({ id: 'base', name: 'btn-primary', kind: 'class', selector: '.btn-primary', order: 5 })
    const hover = rule({
      id: 'hover',
      name: '.btn-primary:hover',
      kind: 'ambient',
      selector: '.btn-primary:hover',
    })

    const model = deriveSelectorPickerModel({
      // Registry insertion order deliberately scrambled to prove sort, not order.
      rules: { [hover.id]: hover, [star.id]: star, [base.id]: base },
      node: { ...node(['base']), id: 'btn' },
      selectedElement: selected,
      activeRuleId: null,
    })

    // `*` (0,0,0) < `.btn-primary` (0,1,0) < `.btn-primary:hover` (0,2,0) — and the
    // base class sits next to its hover variant rather than behind `*`.
    expect(model.pills.map((pill) => pill.rule.selector)).toEqual([
      '*',
      '.btn-primary',
      '.btn-primary:hover',
    ])
  })

  it('disables non-matching ambient selector suggestions', () => {
    document.body.innerHTML = '<h1 data-node-id="title" class="title"></h1>'
    const selected = document.querySelector<HTMLElement>('[data-node-id="title"]')!
    const card = rule({ id: 'card', name: '.card', kind: 'ambient', selector: '.card' })

    const model = deriveSelectorPickerModel({
      rules: { [card.id]: card },
      node: node(),
      selectedElement: selected,
      activeRuleId: null,
    })

    expect(model.suggestions[0]).toMatchObject({
      rule: card,
      disabled: true,
      disabledReason: "Doesn't match this element",
    })
  })

  it('infers class creation for class-like input and ambient creation for selector-shaped input', () => {
    expect(classifySelectorCreateInput('display')).toEqual({ kind: 'class', name: 'display' })
    expect(classifySelectorCreateInput('.display')).toEqual({ kind: 'class', name: 'display' })
    expect(classifySelectorCreateInput('.hero .title')).toEqual({ kind: 'ambient', selector: '.hero .title' })
    expect(classifySelectorCreateInput('a:hover')).toEqual({ kind: 'ambient', selector: 'a:hover' })
  })
})
