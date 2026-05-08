import { control, defineModule, html } from '@core/plugin-sdk'

export default defineModule({
  id: 'acme.showcase.callout',
  name: 'Callout',
  description: 'Boxed text with a tone color, perfect for tip/warning/info blocks.',
  category: 'Showcase',
  htmlTag: 'aside',
  defaults: {
    heading: 'Heads up',
    body: 'This is a Showcase callout — install the pack and add me from the module library.',
    tone: 'info' as 'info' | 'warning' | 'danger' | 'success',
  },
  schema: {
    heading: control.text('Heading'),
    body: control.textarea('Body', { rows: 4 }),
    tone: control.select('Tone', [
      { label: 'Info (blue)', value: 'info' },
      { label: 'Warning (amber)', value: 'warning' },
      { label: 'Danger (red)', value: 'danger' },
      { label: 'Success (green)', value: 'success' },
    ]),
  },
  render: ({ props }) => {
    const palette: Record<typeof props.tone, string> = {
      info: '#1d4ed8',
      warning: '#d97706',
      danger: '#dc2626',
      success: '#16a34a',
    }
    const css = `
      .pb-showcase-callout{border-radius:8px;padding:14px 18px;border:1px solid ${palette[props.tone]};background:rgba(0,0,0,0.04);font-family:inherit;line-height:1.5;}
      .pb-showcase-callout strong{display:block;margin-bottom:4px;font-size:0.95em;}
    `
    return {
      html: html`
        <aside class="pb-showcase-callout pb-showcase-callout--${props.tone}">
          <strong>${props.heading}</strong>
          ${props.body}
        </aside>
      `,
      css,
    }
  },
})
