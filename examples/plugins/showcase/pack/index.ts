/**
 * Showcase plugin — Visual Component / class pack.
 */
import { definePack, h, vc, createNamespace } from '@core/plugin-sdk'

const ns = createNamespace('acme.showcase')

const hero = vc(ns.vc('hero'), 'Showcase Hero', () =>
  h.container({ tag: 'section', classIds: [ns.classRef('hero-root')] }, [
    h.text({
      tag: 'h1',
      text: 'Plugins make Page Builder yours.',
    }),
    h.text({
      tag: 'p',
      text: 'Install canvas modules, design packs, frontend trackers, and CMS hooks — all from a single zip.',
    }),
  ]),
)

export default definePack({
  pluginId: 'acme.showcase',
  visualComponents: [hero],
  classes: {
    'hero-root': {
      name: 'showcase-hero-root',
      styles: {
        paddingTop: '48px',
        paddingBottom: '48px',
        paddingLeft: '24px',
        paddingRight: '24px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
        color: '#ffffff',
        borderRadius: '16px',
        textAlign: 'center',
      },
    },
  },
})
