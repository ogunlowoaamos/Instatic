# Admin Fluid Sizing Design

This spec defines a fluid sizing system for the admin UI. It replaces fixed admin
chrome sizes with bounded viewport-fluid tokens and replaces the existing
`density` preference with a personal `uiScale` preference.

The system applies only to admin chrome: toolbars, sidebars, panels, tables,
dialogs, controls, icons, empty states, dashboards, and settings. It must not
affect the canvas iframe, authored site CSS, published pages, framework
typography/spacing scales, uploaded media dimensions, or public rendering.

---

## TL;DR

- Add admin-only fluid size tokens in `src/styles/globals.css`.
- Remove the `density` editor preference and all `data-editor-density` usage.
- Add a per-user `uiScale` preference that sets a scale multiplier on admin
  layout roots.
- Convert normal admin fixed sizing to semantic fluid tokens: text, spacing,
  control heights, icon sizes, row heights, radii, page spacing, and layout
  bounds.
- Keep true hairlines, screen-reader hiding geometry, DOM/canvas runtime
  geometry, authored-site values, media intrinsic dimensions, and breakpoint
  widths out of the migration.
- Add architecture tests that prevent new fixed admin sizing from returning.
- Update design documentation so contributors know which token family to use.

## Current State

Admin CSS modules use fixed `px` values extensively. A scan across CSS modules in
`src/admin`, `src/ui`, and `src/modules` shows repeated design sizes such as
`8px`, `12px`, `10px`, `6px`, `4px`, `11px`, `16px`, `14px`, `26px`, and `28px`.

The design docs already call out the gap:

- `docs/design.md` says type sizes are component-local and do not have a token
  scale yet.
- `docs/reference/design-tokens.md` repeats that type sizes are not tokenized.

There is an existing editor preference named `density`:

- Declared in `src/admin/pages/site/preferences/catalog.ts`.
- Read through `useEditorSelectPreference('density')`.
- Applied as `data-editor-density` on the three admin layout roots:
  `AdminCanvasLayout`, `AdminWorkspaceCanvasLayout`, and `AdminPageLayout`.
- Currently used mainly by `src/admin/pages/site/ui/Tree/TreeRow.module.css`.

This preference is too narrow. It changes a few density-sensitive surfaces, but
does not give the whole admin a consistent adaptive scale. It should be removed,
not expanded.

The codebase already has fluid-scale math for authored sites in
`src/core/framework/scale.ts`. The admin should not consume site framework
settings, but the same clamp model is the right shape: every design size has a
minimum, a fluid viewport expression, and a maximum.

## Goals

1. The admin UI grows and shrinks fluidly with viewport width.
2. Admin users can choose a personal UI scale without affecting other users.
3. The canvas iframe and published output remain isolated from admin sizing.
4. Sizing values become semantic and reviewable instead of one-off numbers.
5. Shared primitives carry most of the migration so page-level CSS gets simpler.
6. Future admin code cannot reintroduce fixed design sizing without a deliberate
   architecture-test exception.

## Non-Goals

- Do not change authored-site framework typography or spacing scales.
- Do not change published CSS output.
- Do not inject admin CSS variables into the canvas iframe.
- Do not convert breakpoint widths, media intrinsic sizes, DOMRect numbers, or
  drag/overlay runtime geometry into design tokens.
- Do not preserve the old `density` preference as a compatibility path. This is
  pre-release; stale localStorage keys can be ignored.
- Do not convert true `1px` hairlines into fluid borders. Hairlines are device
  affordances, not visual scale.

## Token Model

All admin sizing tokens live in `src/styles/globals.css`, next to the existing
color, radius, shadow, and z-index tokens.

Add a dedicated admin sizing group:

```css
:root {
    --admin-fluid-min-vw: 320px;
    --admin-fluid-max-vw: 1600px;
    --admin-ui-scale: 1;

    --admin-text-2xs: calc(clamp(9px, calc(0.18vw + 8.4px), 11px) * var(--admin-ui-scale));
    --admin-text-xs: calc(clamp(10px, calc(0.19vw + 9.4px), 12px) * var(--admin-ui-scale));
    --admin-text-sm: calc(clamp(11px, calc(0.19vw + 10.4px), 13px) * var(--admin-ui-scale));
    --admin-text-md: calc(clamp(12px, calc(0.19vw + 11.4px), 14px) * var(--admin-ui-scale));
    --admin-text-lg: calc(clamp(14px, calc(0.38vw + 12.8px), 18px) * var(--admin-ui-scale));

    --admin-space-1: calc(clamp(2px, calc(0.19vw + 1.4px), 4px) * var(--admin-ui-scale));
    --admin-space-2: calc(clamp(4px, calc(0.19vw + 3.4px), 6px) * var(--admin-ui-scale));
    --admin-space-3: calc(clamp(6px, calc(0.19vw + 5.4px), 8px) * var(--admin-ui-scale));

    --admin-control-sm: calc(clamp(24px, calc(0.38vw + 22.8px), 28px) * var(--admin-ui-scale));
    --admin-control-md: calc(clamp(30px, calc(0.57vw + 28.2px), 36px) * var(--admin-ui-scale));
    --admin-control-lg: calc(clamp(40px, calc(0.38vw + 38.8px), 44px) * var(--admin-ui-scale));

    --admin-icon-xs: calc(clamp(10px, calc(0.19vw + 9.4px), 12px) * var(--admin-ui-scale));
    --admin-icon-sm: calc(clamp(12px, calc(0.19vw + 11.4px), 14px) * var(--admin-ui-scale));
    --admin-icon-md: calc(clamp(14px, calc(0.38vw + 12.8px), 18px) * var(--admin-ui-scale));
}
```

The values above are representative. Implementation should tune the exact
minimums, maximums, and slopes by migrating existing repeated values into a
small semantic scale, then checking the rendered admin at mobile, laptop, and
large-desktop widths.

Token families:

- `--admin-text-*`: admin text sizes from labels to page headings.
- `--admin-line-*`: reusable unitless line heights for dense UI, body copy, and
  headings. Line-height should remain unitless unless a fixed-format skeleton or
  icon alignment case requires a length token.
- `--admin-space-*`: padding, margin, gap, inset offsets, and page rhythm.
- `--admin-control-*`: common control heights and square icon-button sizes.
- `--admin-row-*`: list, table, tree, menu, and command palette row heights.
- `--admin-icon-*`: pixel-art icon dimensions.
- `--admin-radius-*`: scaled radius tokens for UI surfaces whose radius should
  grow with the UI.
- `--admin-layout-*`: page max widths, panel widths, modal widths, and large
  layout offsets that currently use fixed CSS values.

Existing visual-meaning tokens remain separate:

- Color tokens stay under `--editor-*`, `--rail-*`, `--canvas-*`, etc.
- Existing radius aliases such as `--editor-radius`, `--panel-radius`,
  `--card-radius`, and `--tooltip-radius` can be redefined in terms of
  `--admin-radius-*` when the meaning matches.
- Existing scrollbar tokens can become fluid where they represent visible
  chrome, except hairline-like boundaries stay fixed.

## UI Scale Preference

Replace `density` with `uiScale` in `src/admin/pages/site/preferences/catalog.ts`.

Suggested values:

```ts
{
  id: 'uiScale',
  type: 'select',
  category: 'editor',
  label: 'UI scale',
  description: 'Adjust the size of admin text, controls, icons, and spacing.',
  options: [
    { value: 'small', label: 'Small' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' },
    { value: 'extra-large', label: 'Extra large' },
  ],
  default: 'default',
}
```

The layout roots set an attribute:

```tsx
<div className={styles.shell} data-admin-ui-scale={uiScale}>
```

`globals.css` maps that attribute to `--admin-ui-scale`:

```css
[data-admin-ui-scale='small'] {
    --admin-ui-scale: 0.9;
}

[data-admin-ui-scale='default'] {
    --admin-ui-scale: 1;
}

[data-admin-ui-scale='large'] {
    --admin-ui-scale: 1.12;
}

[data-admin-ui-scale='extra-large'] {
    --admin-ui-scale: 1.25;
}
```

Use the same preference mechanism already used for editor preferences:
`localStorage` via `src/admin/pages/site/preferences/editorPreferences.ts`. UI
scale is personal UI state, not site state and not plugin state.

Remove:

- The `density` catalog entry.
- `data-editor-density` attributes from admin layout roots.
- `useEditorSelectPreference('density')` call sites.
- Density-specific CSS branches such as
  `:global([data-editor-density='comfortable'])`.

## Admin Isolation

The scale attribute belongs only on admin layout roots:

- `src/admin/layouts/AdminCanvasLayout/AdminCanvasLayout.tsx`
- `src/admin/layouts/AdminWorkspaceCanvasLayout/AdminWorkspaceCanvasLayout.tsx`
- `src/admin/layouts/AdminPageLayout/AdminPageLayout.tsx`

Do not set UI scale on `html`, `body`, `:root`, the canvas iframe document, or
published-page containers. Root token declarations in `globals.css` provide
defaults, but the per-user multiplier is scoped through the admin shell
attribute.

The canvas iframe continues to receive only authored-site CSS and canvas preview
CSS that already belongs to the rendered page. Admin overlay controls that sit
outside the iframe may use admin fluid tokens; content inside the iframe may not.

## Migration Boundary

Convert normal admin design sizing:

- `font-size`
- fixed `line-height` lengths
- `padding`
- `margin`
- `gap`
- `inset`, `top`, `right`, `bottom`, `left` when used for chrome spacing
- control `width`, `height`, `min-width`, `min-height`, `max-width`, `max-height`
- page and modal layout bounds
- icon dimensions
- visual radii
- skeleton placeholder dimensions that mirror admin UI chrome

Keep fixed values where they are not admin design scale:

- `0` values.
- `1px` borders, outlines, divider gaps, focus-ring strokes, and hairline
  affordances.
- Screen-reader hiding geometry such as `width: 1px; height: 1px`.
- CSS percentages, fractions, viewport units, and transforms that are already
  relative.
- Canvas iframe viewport widths and breakpoint widths.
- DOMRect, pointer, drag, resize, and overlay geometry measured from the
  browser at runtime.
- Media intrinsic `width` and `height`.
- Data values displayed to the user, such as breakpoint width labels.
- Authored-site module CSS in `src/modules` when it ships to published output.

The rule is "no fixed admin design sizing," not "no `px` token endpoints." Fluid
tokens use `px` inside bounded `clamp()` declarations because bounds are what
keep the admin usable at extreme viewport widths.

## Icon Strategy

Admin icon sizes are currently mostly direct numeric props:

```tsx
<PlusIcon size={14} aria-hidden="true" />
```

Migrate these to admin icon tokens.

The vendored `pixel-art-icons` package currently types `IconProps.size` as a
number even though SVG `width` and `height` accept strings. Update the local
vendored type to:

```ts
export interface IconProps {
  size?: number | string
  color?: string
  className?: string
  style?: React.CSSProperties
}
```

Then admin code can use token strings:

```tsx
<PlusIcon size="var(--admin-icon-sm)" aria-hidden="true" />
```

To avoid hundreds of repeated string literals, add a tiny helper:

```ts
export const adminIconSize = {
  xs: 'var(--admin-icon-xs)',
  sm: 'var(--admin-icon-sm)',
  md: 'var(--admin-icon-md)',
  lg: 'var(--admin-icon-lg)',
} as const
```

Use direct pixel-art icon imports as the project already requires. Do not add
lucide, inline SVG strings, or a second icon system.

## Primitive-First Migration

Migrate shared primitives before page-level CSS. This gives the largest coverage
with the smallest surface area.

First wave:

- `src/ui/components/Button/Button.module.css`
- `src/ui/components/Input/Input.module.css`
- `src/ui/components/Select/Select.module.css`
- `src/ui/components/SearchBar/SearchBar.module.css`
- `src/ui/components/TagPill/TagPill.module.css`
- `src/ui/components/DataTable/DataTable.module.css`
- `src/ui/components/ContextMenu/ContextMenu.module.css`
- `src/ui/components/Tabs/Tabs.module.css`
- `src/ui/components/FilterBar/FilterBar.module.css`
- `src/ui/components/Widget/Widget.module.css`
- `src/ui/components/Skeleton/Skeleton.tsx` and related CSS
- `src/admin/pages/site/ui/Tree/TreeRow.module.css`

Second wave:

- Admin layout shells.
- Toolbar and sidebar chrome.
- Settings modal sections.
- Dashboard widgets and dashboard grid chrome.
- Content, Data, Media, Plugins, Users, Account, and AI pages.
- Site editor floating panels and property controls.
- Spotlight command palette.

The migration should delete local density overrides instead of recreating them
with scale-specific branches.

## Architecture Gates

Add source-scan architecture tests so fixed sizing does not come back.

CSS module gate:

- Scan `src/admin/**/*.module.css` and `src/ui/**/*.module.css`.
- Flag fixed length declarations for admin design properties when the value is a
  raw pixel length.
- Allow `0`, `1px` hairlines, screen-reader hiding patterns, and explicitly
  documented geometry exceptions.
- Allow `px` inside `src/styles/globals.css` token definitions.

TSX icon gate:

- Scan `src/admin/**/*.tsx` and `src/ui/**/*.tsx`.
- Flag pixel-art icon JSX with numeric `size={...}` props.
- Allow non-admin authored module editors only when the icon renders inside
  published/canvas module content rather than admin chrome.

Preference gate:

- Assert `density` is not present in `PREFERENCE_CATALOG`.
- Assert the three admin layout roots apply `data-admin-ui-scale`.
- Assert no source uses `data-editor-density`.

Existing tests that assume fixed Button sizes must be updated. For example,
`button-primitive-usage.test.ts` currently asserts `.size-lg` has `height: 44px`.
That should become an assertion that `.size-lg` uses the corresponding admin
control token and icon-only width token.

## Documentation

Update:

- `docs/design.md`
- `docs/reference/design-tokens.md`
- `docs/reference/ui-primitives.md` where primitive sizing is described

Docs should explain:

- Admin sizing is fluid by default.
- Use `--admin-text-*`, `--admin-space-*`, `--admin-control-*`,
  `--admin-row-*`, `--admin-icon-*`, and `--admin-layout-*`.
- Do not add fixed admin design sizing in CSS modules.
- Use `uiScale` for user preference behavior.
- Admin scale is isolated from the canvas iframe and published output.

## Testing

Implementation should be test-driven for the migration scaffolding and gates.

Unit and architecture tests:

- Token presence and naming in `globals.css`.
- `uiScale` preference default and allowed values.
- Removal of `density`.
- CSS fixed-size gate.
- Numeric icon-size gate.
- Button primitive uses admin control tokens.
- Tree row uses admin row/text/icon tokens.

Browser smoke tests:

- Open the admin at `http://127.0.0.1:5173/admin/site`.
- Verify the admin loads at mobile, laptop, and large-desktop viewport widths.
- Switch `uiScale` through every option and verify text, controls, icons, row
  heights, and panel spacing change.
- Verify the canvas iframe content does not change when `uiScale` changes.
- Verify no panel text overlaps or clips at the smallest supported viewport.

End-of-task verification:

```sh
bun run build
bun test
bun run lint
```

Because this migration touches shared primitives, a full verification pass is
required after implementation.

## Rollout Plan

This is one architectural migration, but it should be implemented in focused
commits:

1. Add fluid tokens, `uiScale`, layout root attributes, and remove `density`.
2. Migrate shared primitives and icon-size helpers.
3. Add architecture gates for fixed CSS sizing and numeric icon sizing.
4. Migrate admin layout shells and high-traffic page chrome.
5. Migrate Site editor panels, property controls, Spotlight, and remaining
   admin pages.
6. Update docs and run the full verification suite.

No compatibility shim is needed for `density`. Existing localStorage may keep a
stale `density` key, but no code should read it.
