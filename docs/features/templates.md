# Templates

Templates — the mechanism that lets one page layout render many rows. Two flavors:

1. **Entry templates** — a special page in the `pages` table that renders an individual row from a postType (e.g. one blog post per template). Selected automatically by the public route `/<routeBase>/<rowSlug>`.
2. **Dynamic bindings** — per-node prop bindings that resolve against context frames (`currentEntry`, `parentEntry`, `page`, `site`, `route`) at render time. Used inside loops and entry templates.

---

## TL;DR

- Entry template lookup: `selectEntryTemplate(site, tableSlug)` in `src/core/templates/templateMatching.ts`. Picks the page that has `entryTemplateForTableId` set to the postType's data table id.
- Dynamic bindings: `PageNode.dynamicBindings: Record<propKey, { source, field }>`. Source is one of `currentEntry | parentEntry | page | site | route`. Resolved by `resolveDynamicProps(...)` in `src/core/templates/dynamicBindings.ts`.
- Context frames built by `buildPageFrame`, `buildSiteFrame`, `buildRouteFrame` in `contextFrames.ts`.
- Token interpolation: text props can mix literal text + tokens (`Hello {currentEntry.title}`). Parsed by `parseTokenString(...)` in `tokenInterpolation.ts`.
- Preview data: `buildPreviewCells(table)` produces fake `currentEntry` values for the editor canvas so templates render meaningfully at edit time.

---

## Where the code lives

```text
src/core/templates/
├── contextFrames.ts        — PageFrame, SiteFrame, RouteFrame + builders
├── dynamicBindings.ts      — TemplateRenderDataContext + resolveDynamicProps
├── templateMatching.ts     — normalizeRouteBase, selectEntryTemplate
├── templatePreviewData.ts  — buildPreviewCells (canvas preview defaults)
└── tokenInterpolation.ts   — parseTokenString, interpolateTokens, walkFieldPath
```

---

## Entry templates

An entry template is a row in the `pages` table that has the system field `entryTemplateForTableId` set to a postType's `data_tables.id`. When the public router resolves `/<routeBase>/<rowSlug>`, it:

1. Looks up the `data_table` by `routeBase`.
2. Looks up the `data_row` by `slug` (and `status: 'published'`).
3. Calls `selectEntryTemplate(site, tableSlug)` to pick the right entry template page.
4. Pushes the row onto the entry stack as `currentEntry`.
5. Renders the entry template — its `dynamicBindings` resolve `currentEntry.title`, `currentEntry.body`, etc.

The entry template is a normal page tree — it can have headings, containers, loops, VC refs. The only special thing is its `entryTemplateForTableId` pointer and the convention that its nodes use `dynamicBindings` to read from `currentEntry`.

### Default templates

When a postType `data_table` is created, the system seeds a **default entry template** automatically — a page with `entryTemplateForTableId = <tableId>` and a basic layout (heading bound to `title`, content bound to `body`).

Seeding happens via `seedDefaultEntryTemplate(...)` in `server/repositories/data/templateSeeding.ts`. The boot-time backfill `backfillDefaultEntryTemplates(db)` covers postType tables that existed before this feature.

A user can edit the default template freely, or replace it with a different page. The matching is by `entryTemplateForTableId`, not by name.

---

## Context frames

When the publisher renders a template, it builds the **context frames** that dynamic bindings read against:

```ts
interface TemplateRenderDataContext {
  page?:        PageFrame                   // current page (id, slug, title, ...)
  site?:        SiteFrame                   // site name, settings, breakpoints
  route?:       RouteFrame                  // current URL parts
  entryStack:   LoopItem[]                  // pushed by loops + entry-template render
}
```

Builders:

```ts
buildPageFrame(page)                                 // { id, slug, title, ... }
buildSiteFrame(site)                                 // { name, settings, breakpoints, ... }
buildRouteFrame(urlOrPath)                           // { pathname, segments, query }
```

`entryStack` is pushed/popped during the publisher walk:

- **Loop** — for each iteration, push the current `LoopItem` onto the stack, render the variant's subtree, then pop.
- **Entry template** — push the published row once before rendering the template root.

Top of stack resolves `currentEntry`; second-from-top resolves `parentEntry` (used by nested loops or VCs that wrap row data).

---

## Dynamic bindings

A page node can bind a prop to a dynamic source instead of carrying a static value:

```jsonc
{
  "moduleId": "base.heading",
  "props": { "text": "Default title", "level": 2 },
  "dynamicBindings": {
    "text": { "source": "currentEntry", "field": "title" }
  }
}
```

At render time, `resolveDynamicProps(node.props, node.dynamicBindings, ctx)`:

1. Reads the frame matching `source` (e.g. `ctx.entryStack[top]` for `currentEntry`).
2. Walks `field` (a dotted path) into the frame.
3. Substitutes the resolved value for `props.text`.

If the source frame is missing (e.g. `currentEntry` outside a loop / template), the binding falls back to the static `props.text`. This is what lets a template render meaningfully even when previewed standalone.

### Available sources

| Source         | Frame                     | Use case                                                |
|----------------|---------------------------|---------------------------------------------------------|
| `currentEntry` | Top of `entryStack`       | Inside loops, inside entry templates                    |
| `parentEntry`  | Second-from-top           | Nested loop (outer + inner)                             |
| `site`         | `ctx.site`                | Anywhere — "site name", "primary color"                 |
| `route`        | `ctx.route`               | URL-driven (e.g. `route.segments[1]`)                   |
| `page`         | `ctx.page`                | The current page's metadata                             |

The editor picker is stricter than the render context. `src/admin/pages/site/property-controls/bindingCompatibility.ts` decides whether a property control can bind at all: free text, textarea, richtext, and URL controls insert `{source.field}` tokens; image, media, number, and toggle controls use whole-prop `dynamicBindings`; fixed selects, color fields, SVG, data-table pickers, groups, and identifier-normalized text fields show no binding affordance. `src/admin/pages/site/property-controls/DynamicBindingControl/BindingPickerPopover.tsx` filters each source to compatible rows before rendering it, so incompatible fields are hidden rather than shown disabled.

System frames still contain internal bookkeeping for runtime code, but `src/admin/pages/site/property-controls/systemSources.ts` exposes only author-facing fields in the picker: page title/slug/permalink/parent slug, site name, and route path/slug. Page ids, site ids, template flags, and template table slugs are not user-facing binding choices.

### Field path walking

`walkFieldPath(frame, 'cells.author.displayName')` walks a dotted path. Returns `undefined` for missing keys.

### Binding picker per-row preview

Each row in the binding picker shows a preview value so authors can confirm the field has real data before committing. For `currentEntry` bindings, the preview item is resolved when the picker opens:

1. **Loop-bound table scope** — fetches the most recently published row via `previewCmsDataLoopItems(tableId, { limit: 1, orderBy: 'publishedAt', direction: 'desc' })`.
2. **Template-page scope (or loop-bound with no published rows)** — synthesizes preview values via `dataTablePreviewToLoopItem(table)`.

The fetched item is stored together with its `tableId`. The popover derives the displayed value during render and only surfaces the item when it still matches the current scope — so switching scope never flashes the previous table's preview values.

System-frame previews (`page`, `site`, `route`) are read live from the editor store via `buildPageFrame`, `buildSiteFrame`, `buildRouteFrame`.

Source: `src/admin/pages/site/property-controls/DynamicBindingControl/BindingPickerPopover.tsx`

---

## Token interpolation

In addition to whole-prop bindings, **text props** can mix literal text + tokens:

```text
"Hello {currentEntry.title} — read more at {site.name}"
```

`parseTokenString(input)` returns a list of `TokenSegmentNode`:

```ts
[
  { kind: 'text',  value: 'Hello ' },
  { kind: 'token', source: 'currentEntry', field: 'title' },
  { kind: 'text',  value: ' — read more at ' },
  { kind: 'token', source: 'site', field: 'name' },
]
```

`interpolateTokens(input, ctx)` evaluates each segment and concatenates. Tokens that resolve to `undefined` render as the empty string (so missing data doesn't leak `undefined` into the page).

`containsTokens(value)` is a cheap precheck — if a string has no `{...}` patterns, skip parsing.

Modules that opt into token interpolation read `value = interpolateTokens(props.text, ctx)` inside their `render`. Most use whole-prop bindings instead.

---

## Editor canvas preview

A template needs `currentEntry` to render. In the **editor canvas**, there's no published row — just the template's own tree. `buildPreviewCells(table)` provides fake values:

```ts
const cells = buildPreviewCells(table)
// {
//   title:    'Sample title',
//   slug:     'sample-slug',
//   body:     'Sample body text…',
//   featuredMedia: '<sample-media-id>',
//   ...
// }
```

The canvas pushes a synthesized `LoopItem` (`{ id: 'preview', fields: cells }`) onto the entry stack when rendering an entry-template page. Result: the user sees a meaningful preview at edit time without having to switch to a real published row.

`dataTablePreviewToLoopItem(table)` wraps the cells as a `LoopItem` — used by both the canvas and the binding picker's synthetic fallback.

---

## Cookbook

### Bind a heading to a row's title

In the editor's Properties panel for a `base.heading` node, choose "Bind text → currentEntry.title". Internally:

```jsonc
{
  "moduleId": "base.heading",
  "props": { "text": "Heading", "level": 2 },
  "dynamicBindings": { "text": { "source": "currentEntry", "field": "title" } }
}
```

The canvas immediately shows the preview cell's title (`'Sample title'`). At publish, the published row's actual title appears.

### Make an entry template for a postType

1. Create a `data_table` of kind `postType` (e.g. "Products").
2. The system seeds a default entry template in the `pages` table automatically.
3. Open the template (it's listed in the pages roster under the postType).
4. Edit it like any other page. Bind heading / body / image to `currentEntry.<field>`.
5. Set `routeBase` on the data table (e.g. `/products`).
6. Add a product row, publish. URL: `/products/<slug>`.

### Use the same template for two postTypes

Set `entryTemplateForTableId` to point at one table; for the other, point its rows at a different template page.

To **share** a template across postTypes, two options:

- Make one template that uses `currentEntry.<field>` paths that exist in both tables.
- Use a Visual Component as the template body, instantiated by two different entry-template pages.

### Custom token in text

```ts
// In an editor property control or a programmatic setter:
node.props.text = 'Posted by {currentEntry.author.displayName} on {currentEntry.publishedAt}'
```

The publisher's text-emitting modules call `interpolateTokens(props.text, ctx)`. Make sure the field paths exist in the row — paths that resolve to `undefined` render as the empty string.

---

## Forbidden patterns

| Pattern                                                              | Use instead                                              |
|----------------------------------------------------------------------|----------------------------------------------------------|
| Reading `currentEntry` from a module's `render` without bindings     | Set `dynamicBindings` on the node — keeps the schema honest |
| Hardcoding the entry template's slug in handlers                     | Look it up via `selectEntryTemplate(site, tableSlug)`    |
| Creating an entry template via `INSERT INTO pages`                   | Use `seedDefaultEntryTemplate(...)` or the seeded helper |
| Walking a deep path with `JSON.parse(JSON.stringify(...))`           | Use `walkFieldPath(frame, 'a.b.c')`                      |
| Showing the literal `{currentEntry.title}` in published output       | The publisher calls `interpolateTokens` — make sure your module opted in |
| Pushing `currentEntry` outside the publisher (in the editor store)   | Entry stack lives in `RenderContext`, not in the editor store |

---

## Related

- [docs/architecture.md](../architecture.md) — system overview (templates + loops)
- [docs/features/content-storage.md](content-storage.md) — `data_tables.routeBase` + `data_rows.slug` lookup
- [docs/features/publisher.md](publisher.md) — walker pushes `currentEntry` for entry templates
- [docs/features/loops.md](loops.md) — loops push items onto the same entry stack
- [docs/reference/page-tree.md](../reference/page-tree.md) — `PageNode.dynamicBindings`
- Source-of-truth files:
  - `src/core/templates/contextFrames.ts` — frame shapes + builders
  - `src/core/templates/dynamicBindings.ts` — `TemplateRenderDataContext`, `resolveDynamicProps`
  - `src/core/templates/templateMatching.ts` — `selectEntryTemplate`, `normalizeRouteBase`
  - `src/core/templates/templatePreviewData.ts` — preview cells for the canvas
  - `src/core/templates/tokenInterpolation.ts` — `parseTokenString`, `interpolateTokens`
  - `server/repositories/data/templateSeeding.ts` — default-template seeding
  - `server/index.ts` — `backfillDefaultEntryTemplates(db)` boot step
