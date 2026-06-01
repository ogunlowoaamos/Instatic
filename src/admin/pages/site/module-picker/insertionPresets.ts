import { LAYOUT_WIRES, MODULE_WIRES, type WireNode } from './moduleWireframes'

export interface InsertionPresetNode {
  moduleId: string
  defaults?: Record<string, unknown>
  children?: InsertionPresetNode[]
}

export interface InsertionPreset {
  id: string
  name: string
  description: string
  kind: 'layout' | 'form'
  root: InsertionPresetNode
  wire: WireNode
}

export type FormPreset = InsertionPreset & { kind: 'form' }

function field(label: string, child: InsertionPresetNode): InsertionPresetNode {
  return {
    moduleId: 'base.container',
    defaults: { tag: 'div' },
    children: [
      {
        moduleId: 'base.label',
        defaults: { text: label, targetMode: 'auto', targetId: '' },
      },
      child,
    ],
  }
}

export const FORM_PRESETS: readonly FormPreset[] = [
  {
    id: 'contact',
    name: 'Contact form',
    description: 'Name, email, message, status messages, and submit.',
    kind: 'form',
    wire: MODULE_WIRES['base.form'],
    root: {
      moduleId: 'base.form',
      defaults: {
        mode: 'cms',
        formId: 'contact',
        successBehavior: 'message',
        successMessage: 'Thanks. Your message was received.',
        honeypotName: 'company',
        minSubmitSeconds: 2,
      },
      children: [
        field('Name', {
          moduleId: 'base.input',
          defaults: {
            inputType: 'text',
            fieldId: 'name',
            name: 'name',
            autocomplete: 'name',
            required: true,
          },
        }),
        field('Email', {
          moduleId: 'base.input',
          defaults: {
            inputType: 'email',
            fieldId: 'email',
            name: 'email',
            autocomplete: 'email',
            required: true,
          },
        }),
        field('Message', {
          moduleId: 'base.textarea',
          defaults: {
            fieldId: 'message',
            name: 'message',
            rows: 5,
            required: true,
            maxLength: 2000,
          },
        }),
        {
          moduleId: 'base.form-message',
          defaults: { kind: 'success', text: '' },
        },
        {
          moduleId: 'base.form-message',
          defaults: { kind: 'error', text: '' },
        },
        {
          moduleId: 'base.submit',
          defaults: { label: 'Send' },
        },
      ],
    },
  },
  {
    id: 'newsletter',
    name: 'Newsletter signup',
    description: 'Email capture with status messages and submit.',
    kind: 'form',
    wire: MODULE_WIRES['base.form'],
    root: {
      moduleId: 'base.form',
      defaults: {
        mode: 'cms',
        formId: 'newsletter',
        successBehavior: 'message',
        successMessage: 'Thanks. You are on the list.',
        honeypotName: 'company',
        minSubmitSeconds: 2,
      },
      children: [
        field('Email', {
          moduleId: 'base.input',
          defaults: {
            inputType: 'email',
            fieldId: 'email',
            name: 'email',
            autocomplete: 'email',
            required: true,
          },
        }),
        field('Consent', {
          moduleId: 'base.checkbox',
          defaults: {
            fieldId: 'consent',
            name: 'consent',
            value: 'yes',
            required: true,
          },
        }),
        {
          moduleId: 'base.form-message',
          defaults: { kind: 'success', text: '' },
        },
        {
          moduleId: 'base.form-message',
          defaults: { kind: 'error', text: '' },
        },
        {
          moduleId: 'base.submit',
          defaults: { label: 'Subscribe' },
        },
      ],
    },
  },
]

const SEEDED_LAYOUT_PRESETS: readonly InsertionPreset[] = [
  {
    id: 'hero-split',
    name: 'Hero split',
    description: 'Headline, copy, call to action, and media block.',
    kind: 'layout',
    wire: LAYOUT_WIRES.heroSplit,
    root: {
      moduleId: 'base.container',
      defaults: { tag: 'section' },
      children: [
        {
          moduleId: 'base.container',
          defaults: { tag: 'div' },
          children: [
            { moduleId: 'base.text', defaults: { tag: 'h1', text: 'Build faster with Page Builder' } },
            { moduleId: 'base.text', defaults: { tag: 'p', text: 'A clean section with space for supporting copy.' } },
            { moduleId: 'base.button', defaults: { label: 'Get started' } },
          ],
        },
        { moduleId: 'base.image', defaults: {} },
      ],
    },
  },
  {
    id: 'feature-grid',
    name: 'Feature grid',
    description: 'Three feature cards with titles and supporting text.',
    kind: 'layout',
    wire: LAYOUT_WIRES.featureGrid,
    root: {
      moduleId: 'base.container',
      defaults: { tag: 'section' },
      children: [
        { moduleId: 'base.text', defaults: { tag: 'h2', text: 'Features' } },
        {
          moduleId: 'base.container',
          defaults: { tag: 'div' },
          children: [
            featureCard('Fast editing'),
            featureCard('Clean output'),
            featureCard('Plugin-ready'),
          ],
        },
      ],
    },
  },
  {
    id: 'cta-banner',
    name: 'CTA banner',
    description: 'Centered headline, copy, and a primary action.',
    kind: 'layout',
    wire: LAYOUT_WIRES.cta,
    root: {
      moduleId: 'base.container',
      defaults: { tag: 'section' },
      children: [
        { moduleId: 'base.text', defaults: { tag: 'h2', text: 'Ready to publish?' } },
        { moduleId: 'base.text', defaults: { tag: 'p', text: 'Drop this section anywhere in the page.' } },
        { moduleId: 'base.button', defaults: { label: 'Publish now' } },
      ],
    },
  },
  {
    id: 'two-column',
    name: 'Two-column text',
    description: 'Side-by-side prose blocks for comparison sections.',
    kind: 'layout',
    wire: LAYOUT_WIRES.twoColumn,
    root: {
      moduleId: 'base.container',
      defaults: { tag: 'section' },
      children: [
        {
          moduleId: 'base.container',
          defaults: { tag: 'div' },
          children: [
            { moduleId: 'base.text', defaults: { tag: 'h3', text: 'First column' } },
            { moduleId: 'base.text', defaults: { tag: 'p', text: 'Add supporting copy here.' } },
          ],
        },
        {
          moduleId: 'base.container',
          defaults: { tag: 'div' },
          children: [
            { moduleId: 'base.text', defaults: { tag: 'h3', text: 'Second column' } },
            { moduleId: 'base.text', defaults: { tag: 'p', text: 'Add supporting copy here.' } },
          ],
        },
      ],
    },
  },
  {
    id: 'card-grid',
    name: 'Card grid',
    description: 'Three image-led cards for posts or resources.',
    kind: 'layout',
    wire: LAYOUT_WIRES.cardGrid,
    root: {
      moduleId: 'base.container',
      defaults: { tag: 'section' },
      children: [card('First card'), card('Second card'), card('Third card')],
    },
  },
  {
    id: 'stats-bar',
    name: 'Stats bar',
    description: 'Four compact metrics in a row.',
    kind: 'layout',
    wire: LAYOUT_WIRES.stats,
    root: {
      moduleId: 'base.container',
      defaults: { tag: 'section' },
      children: [
        stat('42K'),
        stat('98%'),
        stat('12ms'),
        stat('24/7'),
      ],
    },
  },
  {
    id: 'footer-simple',
    name: 'Simple footer',
    description: 'Logo text, links, and newsletter capture.',
    kind: 'layout',
    wire: LAYOUT_WIRES.footer,
    root: {
      moduleId: 'base.container',
      defaults: { tag: 'footer' },
      children: [
        { moduleId: 'base.text', defaults: { tag: 'p', text: 'Page Builder' } },
        { moduleId: 'base.link', defaults: { text: 'Docs', href: '#' } },
        { moduleId: 'base.link', defaults: { text: 'Support', href: '#' } },
      ],
    },
  },
]

export const LAYOUT_PRESETS: readonly InsertionPreset[] = [
  ...SEEDED_LAYOUT_PRESETS,
  ...FORM_PRESETS,
]

function featureCard(title: string): InsertionPresetNode {
  return {
    moduleId: 'base.container',
    defaults: { tag: 'article' },
    children: [
      { moduleId: 'base.text', defaults: { tag: 'h3', text: title } },
      { moduleId: 'base.text', defaults: { tag: 'p', text: 'Short feature description.' } },
    ],
  }
}

function card(title: string): InsertionPresetNode {
  return {
    moduleId: 'base.container',
    defaults: { tag: 'article' },
    children: [
      { moduleId: 'base.image', defaults: {} },
      { moduleId: 'base.text', defaults: { tag: 'h3', text: title } },
      { moduleId: 'base.text', defaults: { tag: 'p', text: 'Add a concise card description.' } },
    ],
  }
}

function stat(value: string): InsertionPresetNode {
  return {
    moduleId: 'base.container',
    defaults: { tag: 'div' },
    children: [
      { moduleId: 'base.text', defaults: { tag: 'strong', text: value } },
      { moduleId: 'base.text', defaults: { tag: 'span', text: 'Metric label' } },
    ],
  }
}

export function countPresetNodes(node: InsertionPresetNode): number {
  let total = 1
  for (const child of node.children ?? []) total += countPresetNodes(child)
  return total
}
