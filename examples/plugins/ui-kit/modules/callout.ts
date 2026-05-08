/**
 * UI Kit — Callout module.
 *
 * Boxed text with a tone color, perfect for tip / warning / info blocks.
 */
import { control, defineModule, html } from '@core/plugin-sdk'
import { sharedCss } from '../shared/css'

export default defineModule({
  id: 'acme.ui-kit.callout',
  name: 'Callout',
  description: 'Boxed text with a tone color, perfect for tip/warning/info blocks.',
  category: 'UI Kit',
  htmlTag: 'aside',
  defaults: {
    icon: '⚡',
    title: 'Heads up',
    body: 'This is a Showcase callout — install the pack and add me from the module library.',
    tone: 'info' as 'info' | 'warning' | 'danger' | 'success',
  },
  schema: {
    icon: control.text('Icon (emoji or symbol)'),
    title: control.text('Title'),
    body: control.textarea('Body', { rows: 3 }),
    tone: control.select('Tone', [
      { label: 'Info', value: 'info' },
      { label: 'Warning', value: 'warning' },
      { label: 'Danger', value: 'danger' },
      { label: 'Success', value: 'success' },
    ]),
  },
  render: ({ props }) => ({
    html: html`
      <aside class="uikit-callout uikit-callout--${props.tone}">
        <span class="uikit-callout__icon" aria-hidden="true">${props.icon}</span>
        <div class="uikit-callout__body">
          <strong class="uikit-callout__title">${props.title}</strong>
          <p class="uikit-callout__text">${props.body}</p>
        </div>
      </aside>
    `,
    css: sharedCss,
  }),
})
