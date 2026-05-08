import { control, defineModule, html } from '@core/plugin-sdk'
import { sharedCss } from '../shared/css'

export default defineModule({
  id: 'acme.ui-kit.feature-card',
  name: 'Feature Card',
  description: 'Icon + title + body block. Stack three of them for a feature row.',
  category: 'UI Kit',
  htmlTag: 'div',
  defaults: {
    icon: '⚡',
    title: 'Fast by default',
    body: 'Built for performance — clean HTML, deduped CSS, no client runtime.',
  },
  schema: {
    icon: control.text('Icon (emoji or symbol)'),
    title: control.text('Title'),
    body: control.textarea('Body', { rows: 3 }),
  },
  render: ({ props }) => ({
    html: html`
      <div class="uikit-feature">
        <span class="uikit-feature__icon" aria-hidden="true">${props.icon}</span>
        <h3 class="uikit-feature__title">${props.title}</h3>
        <p class="uikit-feature__body">${props.body}</p>
      </div>
    `,
    css: sharedCss,
  }),
})
