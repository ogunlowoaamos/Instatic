/**
 * UI Kit — Visual Components, composed with the `h.*` tree builder.
 *
 * Each `vc(id, name, factory)` returns a `VisualComponent` document the
 * pack imports into the active site. The IDs use `<pluginId>/<name>`
 * convention.
 */
import { h, vc, createNamespace } from '@core/plugin-sdk'

const ns = createNamespace('acme.ui-kit')

export const heroCentered = vc(ns.vc('hero-centered'), 'UI Kit — Hero (Centered)', () =>
  h.container({ tag: 'section', classIds: [ns.classRef('section'), ns.classRef('hero')] }, [
    h.text({ tag: 'small', text: 'INTRODUCING', classIds: [ns.classRef('eyebrow')] }),
    h.text({
      tag: 'h1',
      text: 'Build pages your team is proud to ship.',
      classIds: [ns.classRef('heading-xl')],
    }),
    h.text({
      tag: 'p',
      text: 'A modern visual page builder with a first-class plugin system. Drop these layouts in and customize.',
      classIds: [ns.classRef('text-muted')],
    }),
    h.container({ tag: 'div', classIds: [ns.classRef('row-center')] }, [
      h.button({ label: 'Get started', href: '#get-started', classIds: [ns.classRef('btn-primary')] }),
      h.button({ label: 'View pricing', href: '#pricing', classIds: [ns.classRef('btn-secondary')] }),
    ]),
  ]),
)

export const featureRow = vc(ns.vc('feature-row'), 'UI Kit — Feature Row (3 columns)', () =>
  h.container({ tag: 'section', classIds: [ns.classRef('section')] }, [
    h.container({ tag: 'div', classIds: [ns.classRef('grid-3')] }, [
      h.custom(ns.module('feature-card'), {
        icon: '⚡',
        title: 'Fast by default',
        body: 'Clean HTML, deduped CSS, no client runtime.',
      }),
      h.custom(ns.module('feature-card'), {
        icon: '🧩',
        title: 'Plugin friendly',
        body: 'Modules, components, hooks, trackers — all from one zip.',
      }),
      h.custom(ns.module('feature-card'), {
        icon: '🛠',
        title: 'Made to extend',
        body: 'Type-safe SDK, pure renders, predictable lifecycle.',
      }),
    ]),
  ]),
)

export const ctaBand = vc(ns.vc('cta-band'), 'UI Kit — CTA Band', () =>
  h.container({ tag: 'section', classIds: [ns.classRef('section'), ns.classRef('cta-band')] }, [
    h.text({
      tag: 'h2',
      text: 'Ready to ship?',
      classIds: [ns.classRef('heading-lg'), ns.classRef('center')],
    }),
    h.text({
      tag: 'p',
      text: 'Install the UI kit, drop in a layout, and publish in minutes.',
      classIds: [ns.classRef('text-muted'), ns.classRef('center')],
    }),
    h.button({
      label: 'Start building',
      href: '#start',
      classIds: [ns.classRef('btn-primary'), ns.classRef('center')],
    }),
  ]),
)
