import { control, defineModule, html } from '@core/plugin-sdk'

export default defineModule({
  id: 'acme.showcase.event-counter',
  name: 'Event Counter',
  description: 'Renders a placeholder count badge — wired by the showcase frontend tracker bundle on the live page.',
  category: 'Showcase',
  htmlTag: 'div',
  defaults: {
    label: 'Tracked events',
    eventName: 'page-view',
  },
  schema: {
    label: control.text('Label'),
    eventName: control.text('Event to count'),
  },
  render: ({ props }) => {
    const css = `
      .pb-showcase-counter{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:#111;color:#fff;font-family:ui-monospace,monospace;font-size:0.85rem;}
      .pb-showcase-counter span{color:#9ca3af;}
      .pb-showcase-counter strong{color:#fff;}
    `
    return {
      html: html`
        <div class="pb-showcase-counter" data-pb-counter="${props.eventName}">
          <span>${props.label}</span>
          <strong data-pb-counter-value>0</strong>
        </div>
      `,
      css,
    }
  },
})
