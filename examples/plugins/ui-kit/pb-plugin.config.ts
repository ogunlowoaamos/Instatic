/**
 * `pb-plugin.config.ts` — the single source of truth for this plugin.
 *
 * The build script (`bun run scripts/build-plugin.ts examples/plugins/ui-kit`)
 * reads this file, evaluates it via Bun's TypeScript loader, then emits the
 * runtime zip layout the host installer expects:
 *
 *   examples/plugins/ui-kit/dist/
 *     plugin.json
 *     modules/index.js
 *     pack/site.json
 *
 *   examples/plugins/ui-kit.plugin.zip
 *
 * From the developer's seat: edit any TypeScript file under this folder,
 * re-run the build, re-upload the zip.
 */
import { definePlugin, permissions } from '@core/plugin-sdk'
import callout from './modules/callout'
import featureCard from './modules/featureCard'
import pricingTier from './modules/pricingTier'
import stat from './modules/stat'
import testimonial from './modules/testimonial'
import pack from './pack'

export default definePlugin({
  id: 'acme.ui-kit',
  name: 'Modern UI Kit',
  version: '1.0.0',
  description:
    'Pure visual kit: canvas modules, Visual Components, page templates, and a class pack — no server code. Install the pack to drop curated layouts straight into your site.',
  author: { name: 'Acme', url: 'https://acme.dev' },
  license: 'MIT',
  keywords: ['ui-kit', 'landing', 'marketing', 'pricing'],
  permissions: [
    permissions.modulesRegister,
    permissions.visualComponentsRegister,
  ],
  modules: [callout, featureCard, pricingTier, stat, testimonial],
  pack,
})
