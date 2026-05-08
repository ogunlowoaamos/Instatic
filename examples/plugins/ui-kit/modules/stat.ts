import { control, defineModule, html } from '@core/plugin-sdk'
import { sharedCss } from '../shared/css'

export default defineModule({
  id: 'acme.ui-kit.stat',
  name: 'Stat Block',
  description: 'Large number + supporting label.',
  category: 'UI Kit',
  htmlTag: 'div',
  defaults: {
    value: '99.9%',
    label: 'Uptime measured across our edge network',
  },
  schema: {
    value: control.text('Value'),
    label: control.text('Label'),
  },
  render: ({ props }) => ({
    html: html`
      <div class="uikit-stat">
        <div class="uikit-stat__value">${props.value}</div>
        <div class="uikit-stat__label">${props.label}</div>
      </div>
    `,
    css: sharedCss,
  }),
})
