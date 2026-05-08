import { control, defineModule, html } from '@core/plugin-sdk'
import { sharedCss } from '../shared/css'

export default defineModule({
  id: 'acme.ui-kit.testimonial',
  name: 'Testimonial',
  description: 'Customer quote with attribution. Drop into a card or onto its own background.',
  category: 'UI Kit',
  htmlTag: 'figure',
  defaults: {
    quote: 'Page Builder is the first CMS we adopted that didn\'t fight us.',
    author: 'Alex Morgan',
    role: 'Head of Design, Acme Inc.',
  },
  schema: {
    quote: control.textarea('Quote', { rows: 3 }),
    author: control.text('Author name'),
    role: control.text('Author role'),
  },
  render: ({ props }) => ({
    html: html`
      <figure class="uikit-testimonial">
        <blockquote class="uikit-testimonial__quote">“${props.quote}”</blockquote>
        <figcaption class="uikit-testimonial__author">
          <strong>${props.author}</strong>
          <span>${props.role}</span>
        </figcaption>
      </figure>
    `,
    css: sharedCss,
  }),
})
