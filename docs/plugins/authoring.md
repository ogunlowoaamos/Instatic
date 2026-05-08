# Plugin Authoring

Plugins are zip packages that contain a `plugin.json` manifest and optional JavaScript entrypoints. The current SDK lives in this repo at `src/core/plugin-sdk/`; the contract is structured as the future `@cms/plugin-sdk` package, with TypeScript declarations in `examples/plugins/plugin-sdk.d.ts`.

## Package Shape

```text
plugin.json
server/index.js
admin/dashboard.js
editor/index.js
modules/index.js
frontend/tracker.js
pack/site.json
```

Create a package with:

```bash
cd examples/plugins/template
zip -qr ../template.plugin.zip .
```

Upload the resulting zip from the Plugins admin page.

## Manifest

`plugin.json` declares identity, permissions, resources, admin pages, and entrypoints:

```json
{
  "id": "acme.template",
  "name": "Template Plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "permissions": ["admin.navigation", "cms.storage", "cms.routes"],
  "entrypoints": {
    "server": "server/index.js",
    "editor": "editor/index.js",
    "modules": "modules/index.js",
    "frontend": "frontend/tracker.js"
  },
  "resources": [],
  "adminPages": [],
  "pack": { "path": "pack/site.json" }
}
```

Plugin IDs must be namespaced, such as `acme.workflow`. Versions must be semver-like, such as `1.0.0`.

`apiVersion: 1` is the only currently supported value.

### Entrypoints

| Field | Required permission | Loaded by | Use it for |
| --- | --- | --- | --- |
| `server` | `cms.routes` (and any others your routes touch) | Server boot | Lifecycle hooks, CMS routes, hooks, storage |
| `editor` | `editor.commands` / `editor.toolbar` etc. | Editor mount | Toolbar buttons, commands, store transactions |
| `admin` | `admin.navigation` | Admin app pages | Custom admin app rendered into a plugin admin page |
| `modules` | `modules.register` | Editor mount + server boot | Adding new modules to the canvas library |
| `frontend` | `frontend.scripts` (+ `frontend.tracker` if posting events) | Published pages | Analytics, custom widgets, A/B testing |

### Pack

If `pack.path` is set, the plugin can ship Visual Components, page templates, and CSS classes. The site owner triggers an "Install pack" action from the Plugins admin page; the host validates and merges into the active site.

```jsonc
// pack/site.json
{
  "visualComponents": [/* VisualComponent[] */],
  "pages": [/* Page[] */],
  "classes": [/* CSSClass[] */]
}
```

CSS class ids must be namespaced under the plugin id (`acme.template/hero-root`).

## Server Entrypoint

```js
export function install(api) {}
export function activate(api) {}
export function deactivate(api) {}
export function uninstall(api) {}
```

`activate(api)` is the right place to register routes, hooks, and loop sources.

```js
export function activate(api) {
  api.cms.routes.get('/status', 'plugins.manage', () => ({ ok: true }))
  api.cms.hooks.on('publish.before', (e) => api.plugin.log('publish', e))
  api.cms.hooks.filter('publish.html', (html) => html.replace('</body>', '<!-- acme -->\n</body>'))
}
```

Routes mount under `/admin/api/cms/plugins/:pluginId/runtime/*`.

## Plugin Storage

Declare resources in the manifest, then use `cms.storage`:

```js
const items = api.cms.storage.collection('items')
await items.create({ title: 'Draft', status: 'pending' })
const records = await items.list()
```

## Admin Apps

Admin app pages use manifest content kind `app` and default-export a render function. The plugin doesn't import React — the host passes a curated UI namespace, a hyperscript factory `h`, and a hooks bag, so plugin admin pages match the CMS design system without inventing their own:

```ts
import { definePluginAdminApp } from '@pagebuilder/plugin-sdk'

export default definePluginAdminApp(({ ui, h, hooks, api }) => {
  const [count, setCount] = hooks.useState(0)
  return h(ui.Card, {}, [
    h(ui.Heading, { level: 2, key: 'h' }, 'Counter'),
    h(ui.Stack, { gap: 12, key: 's' }, [
      h(ui.Text, { variant: 'muted', key: 't' }, `Total clicks: ${count}`),
      h(ui.Button, {
        variant: 'primary',
        onClick: () => setCount(count + 1),
        key: 'b',
      }, 'Increment'),
    ]),
  ])
})
```

What the plugin gets:

- **`ui`** — the design-system surface: `Button`, `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `SearchBar`, `Stack`, `Card`, `Heading`, `Text`, `Separator`, `EmptyState`, `Alert`, `Code`. Each is a thin wrapper around the host's primitives — the props are the stable plugin-facing API.
- **`h`** — `React.createElement`, used as `h(component, props, ...children)`.
- **`hooks`** — `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`. Same React rules of hooks apply.
- **`api`** — `cms.routes.fetch / json` and `cms.storage.collection(resourceId)` for backend access.

The plugin's bundle has **zero React imports**: the host owns the React instance, eliminating duplicate-React mismatches and giving every plugin admin page consistent styling. Cleanup belongs in `useEffect`'s return — there's no separate `cleanup()` hook.

## Plugin Settings

Plugins declare configuration in `definePlugin({ settings })`. The host renders a Settings dialog automatically using the same `pluginAdminUi` primitives, so plugin authors don't ship a settings UI — they describe the schema:

```ts
import { definePlugin, permissions } from '@pagebuilder/plugin-sdk'

export default definePlugin({
  id: 'acme.analytics',
  name: 'Analytics',
  version: '1.0.0',
  permissions: [permissions.cmsHooks, permissions.cmsRoutes],
  settings: [
    {
      id: 'apiKey',
      label: 'API key',
      type: 'password',
      secret: true,
      description: 'Required for the upstream analytics service.',
    },
    {
      id: 'trackOutbound',
      label: 'Track outbound clicks',
      type: 'toggle',
      default: true,
    },
    {
      id: 'sampleRate',
      label: 'Sample rate',
      type: 'select',
      options: [
        { label: '100%', value: '100' },
        { label: '50%',  value: '50'  },
        { label: '10%',  value: '10'  },
      ],
      default: '100',
    },
  ],
  server: () => import('./server'),
})
```

Setting types:

| `type`     | Renders as                       | Value type |
| ---------- | -------------------------------- | ---------- |
| `text`     | text input                       | `string`   |
| `textarea` | multi-line input                 | `string`   |
| `number`   | numeric input (with min/max)     | `number`   |
| `toggle`   | switch                           | `boolean`  |
| `select`   | dropdown                         | `string`   |
| `color`    | text input (color string)        | `string`   |
| `url`      | url input                        | `string`   |
| `password` | masked input + secret-flag impl. | `string`   |

`secret: true` masks the value as `***` in the form re-render, strips it from frontend bundles, and tells the host to treat it carefully in audit logs.

### Reading settings

**Server (inside `activate()` / hook listeners):**

```ts
api.cms.settings.get<string>('apiKey')          // typed value
api.cms.settings.getAll()                        // full record
await api.cms.settings.replace({ trackOutbound: false }) // emits settings.changed
```

**Admin app (inside `definePluginAdminApp`):**

```ts
api.cms.settings.get('apiKey')
api.cms.settings.getAll()
await api.cms.settings.update({ sampleRate: '50' })
```

Reads are synchronous because the host snapshots settings into the admin context at render time. Updates round-trip through the host, then refresh the admin app's snapshot.

### Settings storage

Persisted per-plugin in `installed_plugins.settings_json`. On install, the host populates defaults declared in the schema. On a plugin update that adds a new setting, the host transparently fills in the default; on a setting removal, the host drops the orphan key.

### `settings.changed` event

Whenever an admin saves new values, the host emits `settings.changed` through the hook bus with `{ pluginId, settings }`. Plugin server hooks listening for this event can react in real time:

```ts
api.cms.hooks.on('settings.changed', (payload) => {
  if (payload.pluginId !== api.plugin.id) return
  api.plugin.log('settings updated', payload.settings)
})
```

## Editor Entrypoint

```js
export function activate(api) {
  api.editor.commands.register({
    id: 'plugin.action',
    label: 'Run Action',
    run: () => ({ message: 'Action complete' }),
  })

  api.editor.toolbar.addButton({
    id: 'plugin.action',
    label: 'Action',
    command: 'plugin.action',
  })
}
```

## Canvas Modules (`modules.register`)

`modules/index.js` default-exports an array of plugin module definitions. The host wraps each into a host `ModuleDefinition` and registers it with the canvas registry. Module ids must start with `<pluginId>.`.

```js
export default ({ pluginId }) => [
  {
    id: `${pluginId}.callout`,
    name: 'Callout',
    category: 'Acme',
    version: '1.0.0',
    canHaveChildren: false,
    defaults: { heading: 'Heads up', body: '...', tone: 'info' },
    schema: {
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Body', rows: 4 },
      tone: { type: 'select', label: 'Tone', options: [
        { label: 'Info', value: 'info' },
      ] },
    },
    htmlTag: 'aside',
    render: (props) => ({
      html: `<aside class="cb">${props.heading}\n${props.body}</aside>`,
      css: `.cb{padding:14px 18px;}`,
    }),
  },
]
```

Same `render(props, children)` runs on the publisher (server) and inside the editor canvas preview, so the markup you ship is exactly what visitors see.

## Frontend Tracker (`frontend.scripts` + `frontend.tracker`)

The host injects a tiny tracker runtime into every published page when any installed plugin has `frontend.scripts` or `frontend.tracker` granted. The runtime exposes `window.__pb`:

```ts
window.__pb.visitorId    // stable per-browser id
window.__pb.sessionId    // stable per-session id
window.__pb.tracker.send(name, payload)              // implicit pluginId
window.__pb.tracker.sendFor(pluginId, name, payload) // explicit
window.__pb.hooks.on(name, listener)                 // page-view, link-click, scroll-depth, ...
window.__pb.hooks.emit(name, detail)
```

Server-side, plugins listen with `api.cms.hooks.on('tracker.event', ...)` and persist into their own resource via `api.cms.storage.collection(...)`.

```js
// frontend/tracker.js
window.__pb.hooks.on('page-view', (detail) => {
  window.__pb.tracker.sendFor('acme.showcase', 'page-view', detail)
})
```

## Loop Sources (`loops.register`)

```js
export function activate(api) {
  api.cms.loops.registerSource({
    id: 'acme.products',
    label: 'Acme Products',
    filterSchema: {},
    orderByOptions: [{ id: 'name', label: 'Name' }],
    fields: [
      { id: 'title', label: 'Title' },
      { id: 'price', label: 'Price' },
    ],
    fetch: async (ctx) => ({ items: [], totalItems: 0 }),
    preview: () => [{ id: 'sample', fields: { title: 'Sample', price: '$10' } }],
  })
}
```

## Hooks Reference

Built-in events:

| Event | Payload |
| --- | --- |
| `publish.before` | `{ siteId, pageId? }` |
| `publish.after` | `{ siteId, pageId? }` |
| `tracker.event` | `{ pluginId, eventName, payload, visitorId, sessionId, pagePath, referrer, receivedAt }` |
| `content.entry.created/updated/deleted` | `{ collectionId, entryId }` |

Built-in filters:

| Filter | Type |
| --- | --- |
| `publish.html` | `string` (full HTML before sending to browser) |
| `publish.headers` | `Record<string, string>` |

Plugins can `emit` and `on` any event. If you publish a documented event under your namespace, prefix it with `plugin.<your-id>.`.

## Type Declarations

Until the SDK is published, copy:

```text
examples/plugins/plugin-sdk.d.ts
```

The starter package and end-to-end showcase live at:

```text
examples/plugins/template/
examples/plugins/showcase/
```
