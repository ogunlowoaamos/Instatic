import { control, defineModule, html, raw, safeUrl } from '@core/plugin-sdk'
import { sharedCss } from '../shared/css'

export default defineModule({
  id: 'acme.ui-kit.pricing-tier',
  name: 'Pricing Tier',
  description: 'Single pricing card with name, price, feature list, and a CTA. Mark "featured" for the highlighted tier.',
  category: 'UI Kit',
  htmlTag: 'div',
  defaults: {
    name: 'Pro',
    price: '$29',
    cadence: '/ month',
    features: 'Unlimited pages\nCustom domain\nPriority support',
    ctaLabel: 'Start free trial',
    ctaHref: '#signup',
    featured: false,
  },
  schema: {
    name: control.text('Tier name'),
    price: control.text('Price'),
    cadence: control.text('Cadence (e.g. /mo)'),
    features: control.textarea('Features (one per line)', { rows: 4 }),
    ctaLabel: control.text('CTA label'),
    ctaHref: control.url('CTA href'),
    featured: control.toggle('Highlight as featured'),
  },
  render: ({ props }) => {
    const featuresList = String(props.features || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => html`<li>${line}</li>`)
      .join('')
    const featured = props.featured ? ' uikit-pricing--featured' : ''
    return {
      html: html`
        <div class="uikit-pricing${raw(featured)}">
          <h3 class="uikit-pricing__name">${props.name}</h3>
          <div class="uikit-pricing__price">
            <strong>${props.price}</strong>
            <span>${props.cadence}</span>
          </div>
          <ul class="uikit-pricing__features">${raw(featuresList)}</ul>
          <a class="uikit-pricing__cta" href="${safeUrl(props.ctaHref)}">${props.ctaLabel}</a>
        </div>
      `,
      css: sharedCss,
    }
  },
})
