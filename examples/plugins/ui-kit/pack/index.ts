/**
 * UI Kit pack — Visual Components, classes, and the landing page template.
 *
 * The `definePack` builder shape:
 *
 *   • `pluginId`        — namespaces every class id automatically
 *   • `visualComponents` — array of `vc()` results (already namespaced)
 *   • `classes`         — `{ '<className>': { ...styles } }` map; the
 *                         class id becomes `<pluginId>/<className>` and
 *                         the CSS classname is auto-derived to be valid
 *   • `pages`           — array of `Page` objects (manually composed
 *                         until the SDK ships a page builder)
 */
import { definePack } from '@core/plugin-sdk'
import { ctaBand, featureRow, heroCentered } from './components'
import { landingPage } from './landingPage'

export default definePack({
  pluginId: 'acme.ui-kit',
  visualComponents: [heroCentered, featureRow, ctaBand],
  pages: [landingPage],
  classes: {
    section: {
      paddingTop: '72px',
      paddingBottom: '72px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1120px',
      marginLeft: 'auto',
      marginRight: 'auto',
    },
    hero: {
      display: 'grid',
      gap: '16px',
      textAlign: 'center',
    },
    eyebrow: {
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      fontSize: '0.78rem',
      fontWeight: '700',
      color: '#1d4ed8',
    },
    'heading-xl': {
      fontSize: 'clamp(2.4rem, 4vw, 3.4rem)',
      fontWeight: '700',
      lineHeight: '1.1',
      color: '#0f172a',
    },
    'heading-lg': {
      fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
      fontWeight: '700',
      lineHeight: '1.2',
      color: '#0f172a',
    },
    'text-muted': {
      color: '#475569',
      fontSize: '1.05rem',
      lineHeight: '1.6',
      maxWidth: '640px',
      marginLeft: 'auto',
      marginRight: 'auto',
    },
    center: {
      marginLeft: 'auto',
      marginRight: 'auto',
      textAlign: 'center',
    },
    'row-center': {
      display: 'flex',
      gap: '12px',
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    'grid-3': {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: '20px',
    },
    'btn-primary': {
      display: 'inline-block',
      paddingTop: '12px',
      paddingBottom: '12px',
      paddingLeft: '22px',
      paddingRight: '22px',
      borderRadius: '8px',
      background: '#1d4ed8',
      color: '#ffffff',
      fontWeight: '600',
      textDecoration: 'none',
    },
    'btn-secondary': {
      display: 'inline-block',
      paddingTop: '12px',
      paddingBottom: '12px',
      paddingLeft: '22px',
      paddingRight: '22px',
      borderRadius: '8px',
      background: 'transparent',
      color: '#0f172a',
      border: '1px solid #cbd5e1',
      fontWeight: '600',
      textDecoration: 'none',
    },
    'cta-band': {
      background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
      color: '#ffffff',
      borderRadius: '16px',
      paddingTop: '56px',
      paddingBottom: '56px',
      textAlign: 'center',
      display: 'grid',
      gap: '12px',
    },
  },
})
