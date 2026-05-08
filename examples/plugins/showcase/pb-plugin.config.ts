/**
 * Showcase plugin — single source of truth.
 *
 * Run `bun run plugin:build examples/plugins/showcase` to produce the
 * runtime zip at `examples/plugins/showcase.plugin.zip`.
 */
import { definePlugin, permissions } from '@core/plugin-sdk'
import callout from './modules/callout'
import eventCounter from './modules/eventCounter'
import pack from './pack'

export default definePlugin({
  id: 'acme.showcase',
  name: 'Showcase',
  version: '1.0.0',
  description:
    'End-to-end demo plugin — exercises every plugin SDK surface: admin app, server routes, hooks, canvas modules, frontend tracker, and a Visual Component pack.',
  author: { name: 'Acme Engineering', email: 'plugins@acme.dev', url: 'https://acme.dev' },
  license: 'MIT',
  homepage: 'https://acme.dev/page-builder/showcase',
  repository: 'https://github.com/acme/page-builder-showcase',
  keywords: ['demo', 'showcase', 'analytics', 'modules', 'pack'],
  icon: 'icon.svg',
  permissions: [
    permissions.adminNavigation,
    permissions.cmsStorage,
    permissions.cmsRoutes,
    permissions.cmsHooks,
    permissions.editorToolbar,
    permissions.editorCommands,
    permissions.modulesRegister,
    permissions.visualComponentsRegister,
    permissions.frontendScripts,
    permissions.frontendTracker,
  ],
  resources: [
    {
      id: 'events',
      title: 'Tracker Events',
      singularLabel: 'Event',
      pluralLabel: 'Events',
      fields: [
        { id: 'name', label: 'Event', type: 'text', required: true },
        { id: 'page', label: 'Page', type: 'text' },
        { id: 'visitor', label: 'Visitor', type: 'text' },
        { id: 'session', label: 'Session', type: 'text' },
        { id: 'payload', label: 'Payload', type: 'longtext' },
        { id: 'received-at', label: 'Received At', type: 'date' },
      ],
    },
  ],
  adminPages: [
    {
      id: 'dashboard',
      title: 'Showcase',
      navLabel: 'Showcase',
      icon: 'box-stack',
      content: {
        kind: 'app',
        heading: 'Showcase Plugin',
        entry: 'admin/dashboard.js',
      },
    },
    {
      id: 'events',
      title: 'Tracker Events',
      navLabel: 'Events',
      content: {
        kind: 'resource',
        heading: 'Tracker Events',
        resource: 'events',
      },
    },
  ],
  modules: [callout, eventCounter],
  pack,
  settings: [
    {
      id: 'eventLabelPrefix',
      label: 'Event label prefix',
      type: 'text',
      placeholder: 'showcase',
      description:
        'Prepended to every tracker event the plugin records. Useful for tagging events with a deployment id.',
      default: 'showcase',
    },
    {
      id: 'storeOutboundClicks',
      label: 'Store outbound clicks',
      type: 'toggle',
      description: 'When off, link-click events bypass storage but the front-end runtime still fires them.',
      default: true,
    },
    {
      id: 'apiKey',
      label: 'Upstream API key',
      type: 'password',
      description: 'Optional — forwarded to a downstream analytics service when set. Stored encrypted at rest.',
      secret: true,
    },
  ],
})
