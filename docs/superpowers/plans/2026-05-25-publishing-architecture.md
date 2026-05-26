# Publishing architecture — four-layer plan

**Status:** Proposed (not implemented). Pick up across sessions by scanning the
"Status checkboxes" block at the top of each layer section.

**Date:** 2026-05-25

**Author:** evaluation handoff from rendering-unification work (see
`server/publish/publicRouter.ts`).

This document is the single source of truth for the four-layer publishing
overhaul. Each layer is implementable as a discrete change set with its own
acceptance criteria and tests. The layers are designed to compose; later
layers do **not** require earlier ones, but the canonical implementation
order is A → B → C → D.

---

## Why this spec exists

Today every visitor request runs `publishPage()` against a JSON snapshot in
`data_row_versions.snapshot_json` and then runs `applyPublishedHtmlPipeline`
on the result. That works but has three problems:

1. **No static fast-path.** Even a stand-alone marketing page with no loops
   and no per-request bindings re-renders + re-filters on every visitor hit.
2. **`publish.html` filters fire per-request.** The filter is conceptually a
   publish-time mutation; running it on every visitor multiplies plugin cost
   and turns deterministic transforms into per-request work.
3. **No invalidation primitive.** There's no concept of "this URL's HTML is
   fresh until X." Adding a cache today would require inventing a key + a
   purge protocol from scratch.

The four layers below close those gaps in order from cheapest-to-biggest
architectural shift.

---

## Goals

- **Visitor TTFB** for a stand-alone published page should be ≤ 5 ms warm and
  ≤ 30 ms cold, served from disk with no DB hit and no render.
- **Visitor TTFB** for a route that must be rendered (loops with `?page=N`,
  per-row template) should be ≤ 5 ms warm from the in-memory cache.
- Plugin `publish.html` / `publish.before` / `publish.after` filters run at
  publish time, not per request. (Plugins with truly per-request needs use
  Layer C "holes" instead.)
- One single readable place that knows where a route's HTML comes from
  (`server/publish/publicRouter.ts` stays the gate).
- No backward compatibility shims. Each layer fully replaces what it
  supersedes.

## Non-goals

- Shipping the published SQLite to the visitor's browser (PGlite /
  sql.js-httpvfs). That's a follow-on once Layer D lands; out of scope here.
- Edge / CDN integration. The single-process model is correct for the
  product. Future Layer E ("publish to CDN") sits on top of Layer D's bundle
  output and is out of scope for this spec.
- Server-rendered React. The publisher already emits clean HTML; no
  hydration of layout.
- Personalisation per logged-in visitor. The product is self-hosted public
  publishing; visitor identity is anonymous.

---

## Glossary

- **`PublishedPageSnapshot`** — JSON record currently stored in
  `data_row_versions.snapshot_json` containing the full `SiteDocument` (all
  pages, VC defs, runtime asset refs). Schema: `server/repositories/publish.ts`.
- **Publish DB** — read-only SQLite file at `uploads/published-site.sqlite`
  (Layer D). Replaces `data_row_versions.snapshot_json` as the canonical
  read-time artefact.
- **Edit DB** — the existing `DbClient` (Postgres or SQLite) backing the
  admin / editor. Owns all writes. Never read by the visitor router.
- **Static artefact** — pre-rendered `<route>.html` on disk under
  `uploads/published/` (Layer A). The fastest path.
- **Render cache** — in-memory LRU keyed by `(url, publishVersion)`
  (Layer B). Used for routes whose output varies per request (loops,
  postType pagination).
- **Hole** — a node whose `defineModule` is marked `dynamic: true`. The
  publisher emits a placeholder; a small client script fetches the rendered
  fragment after page paint via `/_pb/hole/<holeId>` (Layer C).
- **`publishVersion`** — opaque monotonic string identifying the published
  site state. Stored in `site_meta.version_id` in the Publish DB. Bumps on
  every publish. Used as cache key suffix for Layer B and ETag for browser
  caches.
- **Bundle hash** — a content hash of the Publish DB at the moment of
  publish, used in asset URLs that need `immutable` caching.

---

## Architecture overview

```text
                            visitor request
                                  │
                                  ▼
                  server/publish/publicRouter.ts
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼ (Layer A)               ▼ (Layer B)               ▼ (Layer C, lazily)
   static artefact?          render cache hit?         hole fragment endpoint
   uploads/published/        in-memory LRU keyed by     /_pb/hole/<holeId>
   <route>.html              (url, publishVersion)      renders one node
        │                         │                         (against publish DB
        │ hit → stream            │ hit → return string     for fresh content)
        │                         │
        │ miss                    │ miss
        ▼                         ▼
   resolvePublicRoute      renderPublicResolution
   reads Publish DB (D)      runs publishPage()
        │                         + applyPublishedHtmlPipeline
        │                         │
        └────────────┬────────────┘
                     ▼
              HTTP 200 / 301 / 404
```

The **Publish DB** is the canonical published state. Static artefacts on
disk are a derived cache: writing them happens at publish time from the
Publish DB. The render cache is a second derived cache for routes whose
output isn't safe to bake.

On publish:

```text
admin clicks Publish
        │
        ▼
publishDraftSite / publishDataRow (server/repositories/...)
        │
        ├─→ build PublishedPageSnapshot for each page-table row
        ├─→ build per-row metadata for each data row
        ├─→ build routes table mapping url_path → {kind, target_id}
        ├─→ write `uploads/published-site.sqlite.tmp`
        ├─→ fsync + atomic rename → uploads/published-site.sqlite
        ├─→ bump publishVersion (uuid or monotonic)
        ├─→ for every "isFullyStatic" route: render + write
        │     uploads/published/<route>.html (overwrites prior)
        ├─→ delete stale disk files for routes that disappeared
        └─→ render cache: invalidateAll()
```

---

## Layer A — Static-to-disk for fully-static routes

### Status checkboxes

- [ ] Design accepted
- [ ] `isFullyStatic(snapshot, page)` predicate implemented + unit tested
- [ ] `staticArtefact.ts` IO helpers implemented (read / write / purge)
- [ ] `publishDraftSite` writes disk artefacts for each fully-static page
- [ ] `publishDataRow` writes disk artefact for each published row whose
      entry template is fully static
- [ ] `publicRouter.ts` tries the disk path before resolution
- [ ] `applyPublishedHtmlPipeline` is invoked **only** at publish-time
- [ ] Disk artefacts include plugin frontend-asset injection (baked at
      publish, not at request)
- [ ] Tests gate that pages with `base.loop` / dynamic bindings to
      `currentEntry` etc. **do not** get a disk artefact
- [ ] Stale disk files for unpublished / renamed routes are purged

### Goal

For routes whose rendered output cannot vary by request, write the final
HTML (post `applyPublishedHtmlPipeline`) to disk at publish time. The
visitor router streams the file with `content-type: text/html`.

### Files

- **New:** `server/publish/staticArtefact.ts`
  - `writeStaticArtefact(uploadsDir, urlPath, html): Promise<void>`
    — atomic write: `tmp` + fsync + rename
  - `readStaticArtefact(uploadsDir, urlPath): Promise<string | null>`
    — returns null if missing; resolves the file path under
    `<uploadsDir>/published/<safePath>/index.html`
    (using `index.html` instead of a `*.html` at-leaf simplifies serving
    and avoids extension juggling)
  - `purgeStaticArtefact(uploadsDir, urlPath): Promise<void>`
  - `listStaticArtefactRoutes(uploadsDir): Promise<string[]>` — used by
    the publish cleanup step
- **New:** `src/core/publisher/staticAnalysis.ts`
  - `isFullyStaticPage(page, site): boolean`
  - Walks the page tree; returns false if any of:
    - any node has `moduleId === 'base.loop'`
    - any node has a dynamic-module flag (Layer C) — for now this is
      forward-compat; first-party modules don't set it yet
    - any `dynamicBindings` value references `currentEntry.*` and the
      page is not itself a postType entry template (entry templates are
      handled as row-routes; their bindings resolve to a fixed row at
      publish time)
    - any binding references `route.query.*` or similar per-request values
    - the page contains a `base.visual-component-ref` whose definition is
      not itself static (recursive check, with cycle guard)
- **Modified:** `server/repositories/publish.ts`
  - After writing each row+snapshot, if `isFullyStaticPage(page, site)`,
    render once with `publishPage()`, run `applyPublishedHtmlPipeline`,
    and write disk artefact
  - After loop, purge any pre-existing disk artefact at paths no longer
    present in the route set
- **Modified:** `server/repositories/data/publish.ts` (`publishDataRow`)
  - For each newly-published row, if the matched entry template is fully
    static, render the row through that template and write disk artefact
    at `/<table-route-base>/<row-slug>`
  - Purge the old slug's artefact if the slug changed (row redirect case)
- **Modified:** `server/publish/publicRouter.ts`
  - At the very top of `renderPublicResolution`, try `readStaticArtefact`
    keyed by `url.pathname`. On hit, return the HTML directly without
    touching the snapshot.
  - The disk path lives ahead of the resolver to keep cold-start fast: a
    visitor hit means one `fs.access` + one `fs.readFile` for fully-static
    routes.

### Invariants

- The disk artefact is the **final** HTML — post `applyPublishedHtmlPipeline`
  including all plugin filter side-effects. `applyPublishedHtmlPipeline`
  must no longer fire on a request hitting the disk path.
- Disk artefacts are derived state. If `uploads/published/` is deleted, a
  republish (`republishAllPages`) rebuilds them. The publisher must never
  refuse to publish because of a missing disk artefact directory.
- Disk artefact writes are atomic (tmp + rename). A reader that races a
  writer either sees the old version or the new version, never a partial
  file.

### Tests

- `staticArtefact.test.ts` — write/read/purge happy paths, atomic-rename
  semantics, path safety (no `..` escapes).
- `staticAnalysis.test.ts` — table-driven test over fixture page trees:
  - page with only static modules → true
  - page with a `base.loop` → false
  - page with `currentEntry.*` binding (not a postType template) → false
  - page with VC ref pointing at a static VC → true
  - page with VC ref pointing at a dynamic VC → false
  - cycle in VC refs → terminate, return false
- `publishStaticArtefact.test.ts` (integration) — `publishDraftSite` with a
  fixture site of mixed static/dynamic pages writes the right files.
- `publicRouter.test.ts` — when a disk artefact exists for `/about`, the
  router returns it without consulting the snapshot.

### Performance target

Fully-static route: ≤ 5 ms TTFB warm, ≤ 30 ms cold. Measured with the
existing `bun run bench:http`. Add a `bench/staticArtefactServe.ts` if not
already covered.

---

## Layer B — In-memory render cache with `publishVersion` keys

### Status checkboxes

- [ ] Design accepted
- [ ] `renderCache.ts` LRU implemented (bounded size, configurable)
- [ ] Cache key includes `publishVersion`
- [ ] `publicRouter.ts` wraps the resolver/renderer path with `getOrRender`
- [ ] Layer A's disk path bypasses the cache (already final HTML)
- [ ] On publish, `invalidateAll()` is called from the publish handlers
- [ ] Tests gate that a publish invalidates the cache; that two requests
      hit the renderer once then return cached output

### Goal

Routes that **must** render per request (postType `/posts?page=2` with a
loop, or any route a future Layer C-using page wants live) get memoised on
the first hit. Cache key includes a `publishVersion` that bumps every
publish, so any republish naturally evicts everything.

### Files

- **New:** `server/publish/renderCache.ts`
  - `interface RenderCacheKey { urlPath: string; queryString: string }`
  - LRU with configurable max (env `RENDER_CACHE_MAX_ENTRIES`, default
    `1000`); reasonable upper bound on per-process memory.
  - `getOrRender(key, factory: () => Promise<string>): Promise<string>`
  - `invalidateAll(): void`
  - `setPublishVersion(version: string): void` — bumps the version key
    used internally so the next `getOrRender` recomputes
  - `getStats(): { hits: number; misses: number; size: number }` — for
    benchmark/observability
- **Modified:** `server/publish/publicRouter.ts`
  - After Layer A's disk miss, wrap the resolve+render call:
    ```ts
    return cache.getOrRender(
      { urlPath: url.pathname, queryString: url.search },
      async () => {
        const resolution = await resolvePublicRoute(db, url)
        const response = await renderPublicResolution(resolution, db, url)
        return response
      }
    )
    ```
  - For 301 redirects / 404s, do **not** cache (the wrapper checks the
    factory's status; only 200 responses get cached)
- **Modified:** publish handlers (`publishDraftSite`, `publishDataRow`,
  `unpublishDataRow`, etc.) call `cache.invalidateAll()` after the DB write
  commits.

### Invariants

- Cache stores the response body string + content-type + status. A cache
  hit produces a fresh `Response` object (responses are not reusable in
  Bun.serve).
- Only 200-status responses are cached. Redirects and 404s are cheap to
  recompute and shouldn't poison the cache with possibly-stale state.
- Cache key includes the full querystring so `/posts?page=2` and
  `/posts?page=3` are distinct entries.
- Bumping `publishVersion` invalidates every entry whose internal version
  no longer matches. Eviction is lazy (no global walk).

### Tests

- `renderCache.test.ts` — bounded eviction, hit/miss semantics, version
  bump invalidates, parallel `getOrRender` calls for the same key only run
  the factory once (single-flight).
- `publicRouterCache.integration.test.ts` — first request for a dynamic
  route renders, second returns from cache; publish event evicts.

### Performance target

Warm cache hit on a dynamic route: ≤ 5 ms TTFB. Measured per-route via
`bench/dynamicRouteCache.ts`.

---

## Layer C — Server islands ("holes")

### Status checkboxes

- [ ] Design accepted
- [ ] `defineModule` accepts `dynamic: true` and the registry surfaces it
- [ ] Publisher emits placeholder + hole metadata for dynamic nodes
- [ ] `/_pb/hole/<bundleHash>/<nodeId>` endpoint renders a single subtree
- [ ] `pb-hole-runtime.js` (~1 KB) included only on pages that contain holes
- [ ] Layer A's `isFullyStaticPage` returns false when any node is dynamic
- [ ] CSP / sandbox stays sane (no inline scripts; runtime served from
      `/_pb/assets/`)
- [ ] Tests: a page with a dynamic module emits placeholder; the hole
      endpoint returns the rendered fragment; the runtime swaps it in

### Goal

Modules / VCs that need to render fresh per-request — e.g. "currently N
users online", "live stock", "logged-in nav" — declare themselves
`dynamic: true`. The rest of the page is fully static (Layer A) or cached
(Layer B); only the dynamic subtree runs at request time.

This is the Astro `server:defer` pattern, self-hosted, no client JS
framework involved.

### Files

- **Modified:** `src/core/module-engine/defineModule.ts` and the registry
  - Add an optional `dynamic?: boolean` flag to the module options
  - Registry exposes `isDynamic(moduleId): boolean`
- **Modified:** `src/core/publisher/renderNode.ts`
  - When the current node's module is `dynamic`, instead of running
    `module.render(...)`, emit:
    ```html
    <pb-hole id="hole-<nodeId>" data-pb-hole="<nodeId>"></pb-hole>
    ```
    and register the node's id in the page's hole map (passed through the
    `RenderContext`).
- **Modified:** `src/core/publisher/render.ts`
  - When the page has at least one hole, inject `<script type="module"
    src="/_pb/hole-runtime.js" defer></script>` once into the head; do not
    inject otherwise.
- **New:** `server/publish/holeRuntime.ts`
  - Exports `HOLE_RUNTIME_JS`, the ~1 KB client script as a string. The
    script: finds every `[data-pb-hole]`, fetches
    `/_pb/hole/<bundleHash>/<nodeId>` in parallel, swaps with the response
    body using `idiomorph` or a tiny morphdom-style swap (do **not** add a
    dependency for this; hand-write the swap in ~30 lines).
- **New:** `server/handlers/cms/hole.ts`
  - `GET /_pb/hole/<bundleHash>/<nodeId>` → opens the Publish DB at
    `bundleHash`, finds the node, renders it through `renderNode` against
    a minimal `RenderContext`, returns the resulting HTML fragment.
  - Caches results in the Layer B render cache with key
    `hole:<bundleHash>:<nodeId>:<queryString>` so a popular hole renders
    once per request shape.
- **Modified:** `server/router.ts`
  - Register `tryServeHoleRuntime` (the script) and `tryServeHole` (the
    fragment endpoint) before `tryServePublicRoute`.
- **Modified:** `src/core/publisher/staticAnalysis.ts` (Layer A)
  - `isFullyStaticPage` returns false if any node's module is `dynamic`.

### Wire shape

Placeholder in the published HTML:

```html
<pb-hole id="hole-abc123" data-pb-hole="abc123"
         style="display:contents"></pb-hole>
```

Runtime (`/_pb/hole-runtime.js`):

```js
// pb-hole-runtime — swaps server-rendered fragments into placeholders.
// Bundle hash is baked into the script URL by the publisher so the
// runtime knows which Publish DB version to query.
const BUNDLE_HASH = /* baked at publish */ '...'
for (const el of document.querySelectorAll('pb-hole[data-pb-hole]')) {
  fetch(`/_pb/hole/${BUNDLE_HASH}/${el.dataset.pbHole}`)
    .then(r => r.text())
    .then(html => { el.outerHTML = html })
    .catch(() => { /* leave placeholder empty */ })
}
```

(Actual implementation will be slightly more careful: progressive
enhancement fallback, abort on `unload`, CSS class on the placeholder so
authors can style the loading state.)

### Invariants

- A dynamic module's `render(...)` never runs at publish time. The published
  HTML contains only the placeholder.
- The Publish DB is read-only at request time. Hole rendering reads the
  same `bundleHash`'s node tree the original page render used, so a publish
  doesn't race an in-flight hole fetch into an inconsistent state.
- The hole fragment endpoint is the **only** place the dynamic node's
  `render` runs per request. The first request rebuilds; subsequent
  identical requests hit Layer B's cache.

### Tests

- `staticAnalysis.dynamic.test.ts` — page with a dynamic module is not
  static.
- `holePublisher.test.ts` — page tree with a dynamic node renders to a
  placeholder + script tag in the head.
- `holeRouteHandler.test.ts` — `/_pb/hole/<hash>/<nodeId>` returns the
  rendered fragment.
- `holeRuntime.smoke.test.ts` — DOM test: given a fixture HTML with two
  placeholders + a mock fetch, the runtime swaps both correctly.

### Out of scope

- No first-party module is `dynamic` yet. This layer is the seam plugins
  use. Plugin SDK docs get updated to surface the flag, but the built-in
  module catalogue doesn't change.

---

## Layer D — Publish DB (read-only SQLite site bundle)

### Status checkboxes

- [ ] Design accepted
- [ ] Publish DB schema agreed (see below) + applied to a fresh file at
      `uploads/published-site.sqlite`
- [ ] `server/publish/publishDb.ts` opens the file lazily in read-only
      mode and re-opens on rename detection
- [ ] `publishDraftSite` builds the new Publish DB atomically (tmp +
      rename); old file remains valid until rename
- [ ] `publishDataRow` updates the existing Publish DB in place
      (transaction; `routes`, `rows`, possibly `media`)
- [ ] `resolvePublicRoute` reads from the Publish DB, not from
      `data_row_versions.snapshot_json`
- [ ] `republishSinglePage` / `republishAllPages` rebuild the Publish DB
      consistently
- [ ] Layer A's per-route disk writes happen against the new Publish DB
- [ ] Layer B's `publishVersion` comes from `site_meta.version_id` in the
      Publish DB
- [ ] Layer C's `bundleHash` comes from a hash of the Publish DB file
- [ ] Tests gate atomic publish, cross-instance HA consistency (if both
      hosts share the file via a shared volume — out of scope to deploy,
      but the schema should not preclude it)

### Goal

Split the **edit** read/write surface from the **publish** read surface.
Today both go through one `DbClient`; visitor reads contend with editor
writes, and the published artefact (a JSON snapshot per page row) is
scattered across `data_row_versions`. After Layer D:

- The **Edit DB** (Postgres or SQLite, via `DbClient`) owns all admin
  writes and never serves visitor reads.
- The **Publish DB** (always SQLite, at
  `uploads/published-site.sqlite`) is the canonical published state. The
  visitor router reads from it in read-only mode.
- Publishing builds a fresh Publish DB and atomically replaces the old
  one (or, for single-row publish, updates the affected tables in a
  single transaction).

### Schema

```sql
-- One row, identifies the current publish version.
CREATE TABLE site_meta (
  version_id          TEXT PRIMARY KEY,
  published_at        TEXT NOT NULL,
  bundle_hash         TEXT NOT NULL,                 -- hex of sha-256 over a
                                                     -- canonical serialisation
                                                     -- of all tables; used as
                                                     -- ETag and as Layer C's
                                                     -- bundle hash
  runtime_importmap   TEXT,                          -- nullable; matches the
                                                     -- existing field on
                                                     -- PublishedPageSnapshot
  runtime_assets_json TEXT                           -- per-version asset map
);

CREATE TABLE routes (
  url_path        TEXT PRIMARY KEY,                  -- e.g. '/about', '/posts/hello'
  kind            TEXT NOT NULL CHECK (kind IN ('page', 'row', 'redirect')),
  page_id         TEXT,                              -- non-null when kind='page'
  row_id          TEXT,                              -- non-null when kind='row'
  redirect_target TEXT                               -- non-null when kind='redirect'
);

CREATE TABLE pages (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL,
  snapshot_json   TEXT NOT NULL,                     -- PublishedPageSnapshot
  is_fully_static INTEGER NOT NULL DEFAULT 0         -- cached predicate result
);

CREATE TABLE rows (
  id                TEXT PRIMARY KEY,
  table_id          TEXT NOT NULL,
  table_route_base  TEXT NOT NULL,
  slug              TEXT NOT NULL,
  cells_json        TEXT NOT NULL,                   -- as written by publishDataRow
  published_at      TEXT NOT NULL,
  entry_template_id TEXT                             -- nullable; resolved at publish
);

CREATE INDEX idx_rows_route ON rows(table_route_base, slug);
CREATE INDEX idx_routes_kind ON routes(kind);

CREATE TABLE media (
  id              TEXT PRIMARY KEY,
  manifest_json   TEXT NOT NULL                      -- width, height, blurhash,
                                                     -- variants, public_path
);
```

WAL mode enabled. Read-only connections open with `mode=ro&immutable=0`
(immutable=0 because writers exist) — see `bun:sqlite` docs.

### Files

- **New:** `server/publish/publishDb.ts`
  - `openPublishDb(uploadsDir): PublishDbClient` — opens the SQLite file
    in read-only mode using `bun:sqlite`. Caches the handle; watches the
    file's `mtime` and re-opens after any external rename (the publisher
    does the rename; the visitor router needs to pick it up).
  - `PublishDbClient.findRoute(urlPath): { kind, ... } | null`
  - `PublishDbClient.findPage(id): { snapshot, ... } | null`
  - `PublishDbClient.findRowByRoute(routeBase, slug): { row, ... } | null`
  - `PublishDbClient.findRedirect(routeBase, slug): { target } | null`
  - `PublishDbClient.getMeta(): { versionId, bundleHash }`
  - `PublishDbClient.close(): void` — for tests
- **New:** `server/publish/publishDbBuild.ts`
  - `buildPublishDb(editDb, uploadsDir): Promise<{ versionId, bundleHash }>`
    — full rebuild path. Used by `publishDraftSite` and republish.
  - `updatePublishDbRow(editDb, uploadsDir, rowId): Promise<...>` —
    incremental update path for `publishDataRow`. Opens the Publish DB in
    write mode (single-instance assumption), runs a transaction that
    updates `rows`, possibly `routes`, refreshes `site_meta.version_id`
    and `bundle_hash`.
- **Modified:** `server/repositories/publish.ts` — calls
  `buildPublishDb` after the existing write-snapshot logic. (Snapshots in
  `data_row_versions.snapshot_json` continue to exist — they're the edit
  history record. The Publish DB is derived from them at publish time.)
- **Modified:** `server/repositories/data/publish.ts` — calls
  `updatePublishDbRow` after the existing write.
- **Modified:** `server/publish/publicRouter.ts` — `resolvePublicRoute`
  reads from the Publish DB:
  ```ts
  const route = publishDb.findRoute(url.pathname)
  switch (route?.kind) {
    case 'page': return { kind: 'page', snapshot: ... }
    case 'row':  return { kind: 'row', snapshot: ..., row: ... }
    case 'redirect': return { kind: 'redirect', location: ... }
    default: return { kind: 'not-found' }
  }
  ```
- **Modified:** `server/handlers/cms/loop.ts` — also reads from the
  Publish DB for page-by-path lookups inside the loop endpoint (the
  `publicSlugFromPath` import already added during the previous render
  unification stays).

### Atomic publish protocol

```text
1. Open tmp file uploads/published-site.sqlite.tmp.<random>
2. Apply schema (CREATE TABLEs)
3. Insert/upsert all rows (one transaction)
4. PRAGMA wal_checkpoint(TRUNCATE)
5. Compute bundle_hash from canonical serialisation
6. UPDATE site_meta SET version_id = <new>, bundle_hash = <new>
7. Close (which fsyncs)
8. fs.rename(tmpPath, finalPath) — atomic on the same filesystem
9. Notify in-process visitor router: bump cached PublishDbClient
```

For incremental row publish, steps 1–8 are skipped; we open the live file
in write mode, transact, and bump `site_meta.version_id` in place. SQLite
WAL guarantees readers don't see a partial transaction.

### Lifecycle of `data_row_versions.snapshot_json`

The JSON snapshot stays. It's the audit-trail record of "what was
published at this version_id" and the source of truth for "republish from
the historical state of revision N". The Publish DB is **rebuildable**
from `data_row_versions` — wipe the file, call `buildPublishDb`, it
reconstructs.

### Invariants

- The visitor router never opens a `DbClient` for a published-page lookup.
  Read-only Publish DB only.
- The Publish DB is **the** read-time artefact. Nothing else (no JSON
  snapshot lookup, no live-render-from-edit-rows) sits between the visitor
  request and the SQLite file.
- A publish never partially-updates the Publish DB. Either the new state
  is fully visible, or the old state is. `PRAGMA wal_checkpoint(TRUNCATE)`
  before the rename guarantees no leftover WAL frames.
- The Edit DB never reads from the Publish DB. The Publish DB never writes
  to the Edit DB. They are decoupled.

### Tests

- `publishDbBuild.test.ts` — given a fixture Edit DB state, building the
  Publish DB produces the expected `routes`, `pages`, `rows`, `meta`.
- `publishDbAtomicity.test.ts` — kill the publisher mid-build: the live
  Publish DB is still the previous good state.
- `publicRouterPublishDb.test.ts` — the router reads from the Publish DB
  (mock it; verify the DbClient is NOT touched for visitor requests).
- `loopHandlerPublishDb.test.ts` — `/_pb/loop/...` resolves pages via the
  Publish DB.

### Migration

There is no production data to protect (pre-release). The Edit DB stays as
is; the Publish DB is built from scratch on the first publish after this
ships. Existing dev databases re-publish to populate. Architecture test
that gates "no visitor-request handler imports `DbClient` for content
lookup".

---

## Cross-layer invariants

These are the rules that must hold across every layer:

1. **One gateway.** Every visitor HTML response is produced by
   `tryServePublicRoute` in `server/router.ts` →
   `server/publish/publicRouter.ts`. The router file order
   (`tryServeMediaRedirect` < `tryServeUpload` < `tryServePublicRoute`)
   stays gated by `media-signed-redirect-serving.test.ts`.
2. **One source of truth at publish.** Layer D's Publish DB is the
   canonical state. Layer A's disk artefacts and Layer B's cache are
   derived; both must be rebuildable from the Publish DB alone.
3. **No per-request `publish.html`.** Plugin filters fire once at publish
   time and bake into Layer A artefacts / Layer B cache entries / Layer C
   hole responses. Per-request work for visitors is bounded to: disk read
   (A), cache lookup (B), or one node render (C).
4. **No backward compatibility for the visitor path.** Old code that
   served pages by reading `data_row_versions.snapshot_json` directly gets
   deleted in Layer D. No "legacy mode" flag.
5. **publishVersion monotonicity.** Every publish — full or per-row —
   bumps `site_meta.version_id`. Layer B uses it for cache eviction;
   Layer C uses it (via bundle_hash) for asset URL stability.
6. **No DbClient calls in the visitor render path** (post-Layer D). The
   Publish DB connection is the only thing the router opens. Architecture
   test gates this once D is in.
7. **Plugin filter side-effects** (publish.before / publish.after) fire
   ONCE per publish, against the freshly-built page HTML, before that HTML
   is written to disk / cached. `applyPublishedHtmlPipeline` is a
   publish-time function after Layer A.

---

## Implementation order and jobs

Layers are independent enough that A, B, C can ship in any order, but
**Layer D is the foundation** — it changes what the visitor router reads
from. Two viable orderings:

### Option 1 — D first (recommended)

1. **Job 1:** Layer D. Build the Publish DB infrastructure. Visitor
   router reads from it. No behaviour change for users; just a cleaner
   internal split.
2. **Job 2:** Layer A. Static-to-disk on top of D. The disk path bypasses
   the Publish DB read for fully-static routes.
3. **Job 3:** Layer B. In-memory cache for the remaining dynamic routes.
4. **Job 4:** Layer C. Server islands. Plugin SDK update + the hole
   endpoint.

### Option 2 — A first

1. **Job 1:** Layer A. Reuse the existing `data_row_versions.snapshot_json`
   read path; just add the disk fast-path on top. No D yet.
2. **Job 2:** Layer B. Same: wraps existing render path.
3. **Job 3:** Layer D. Now we swap the data source. A/B continue working
   because they consume HTML / strings, not snapshots.
4. **Job 4:** Layer C. Independent of A/B/D.

Option 1 is cleaner — every later layer slots into the right architecture
from the start. Option 2 ships visible visitor wins earlier (A first =
fastest TTFB win) but pays for refactoring twice. **Default to Option 1
unless there's a reason to prioritise visible perf.**

---

## Testing strategy

- **Per-layer:** unit tests in each new file; integration tests at the
  router level for the resolution path.
- **Architecture tests** added to `src/__tests__/architecture/`:
  - `publish-db-only-for-visitors.test.ts` — visitor handlers don't import
    `DbClient`.
  - `publish-filter-not-per-request.test.ts` — `applyPublishedHtmlPipeline`
    is called only from publish entry points, not from `publicRouter.ts`.
- **Benchmarks:** existing `bun run bench:http` covers cold + warm.
  Targets:
  - Fully-static route warm: ≤ 5 ms
  - Cached dynamic route warm: ≤ 5 ms
  - Cold cache miss → render: depends on page (existing baseline)
- **Smoke:** `agent-browser` against the local admin to publish, then
  curl the public site and check the disk artefact exists. Use the seeded
  `ai@ai.com / qwerty123456` credentials (see `CLAUDE.md`).

---

## Open questions

1. **Pagination for postType index pages** (`/posts`, `/posts?page=2`):
   Layer A says these are NOT fully-static (loop present). Layer B caches
   them. Future: should we pre-render the first N pages of pagination
   to disk and only fall back to B on `?page > N`? Not in this spec;
   revisit after A/B/D ship.
2. **`/_pb/css/`, `/_pb/assets/` runtime caching** is unchanged; they
   already use content-hashed URLs with `Cache-Control: immutable`. No
   action needed.
3. **Multi-instance HA with a shared Publish DB file.** The current model
   keeps the file local to each instance (each builds its own from the
   shared Edit DB on publish events). If a future change wants a single
   shared Publish DB on a shared volume, the schema is ready; the
   open-and-watch logic in `publishDb.ts` just needs to handle external
   updates. Not in scope here.
4. **Ship the Publish DB to the browser** (PGlite / sql.js-httpvfs) is
   genuinely interesting for client-side faceted browsing and search.
   Explicit non-goal of this spec; revisit as a follow-on once D is
   stable.

---

## References

- `server/publish/publicRouter.ts` — the existing single-entry resolver
  (post-unification).
- `server/repositories/publish.ts:publishDraftSite` — current publish
  entry for pages.
- `server/repositories/data/publish.ts:publishDataRow` — current publish
  entry for rows.
- `server/handlers/cms/loop.ts` — the loop pagination endpoint; will be
  rewired in D.
- `docs/architecture.md` — top-level architecture doc; gets a section
  pointing here once layers ship.
- Astro Server Islands — `server:defer` directive; defines the pattern
  Layer C follows.
- Next.js Partial Prerendering (cacheComponents, default in Next 16) — the
  static-shell + dynamic-holes model Layer A + C compose to mirror.
- Simon Willison's Baked Data pattern — the philosophical ancestor of
  Layer D.
- `bun:sqlite` docs — read-only mode, WAL, rename-and-reopen.
