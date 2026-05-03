/**
 * Editor store — combined-state type.
 *
 * `EditorStore` is declared here as an EMPTY interface that each slice file
 * augments via `declare module '@core/editor-store/types' { interface
 * EditorStore extends MySlice {} }`. By the time a consumer references
 * `EditorStore`, all slice files have been loaded by the TS compiler and the
 * augmentations have merged together — `EditorStore` resolves to the full
 * union of every slice's state and actions.
 *
 * Why this shape?
 *
 * The naïve form — `export type EditorStore = SiteSlice & CanvasSlice & …` —
 * forces this module to import each slice's type, while every slice file
 * needs to import `EditorStore` for its `StateCreator<EditorStore, …, MySlice>`
 * generic. That creates a static-graph cycle (`types → slice → types`) at the
 * type level. The cycle is harmless at runtime (every edge is `import type`,
 * erased by tsc), but tools like madge that don't distinguish type-only
 * imports flag it as a circular dependency.
 *
 * Module augmentation breaks the cycle structurally:
 *   • `types.ts` imports nothing — it's a leaf node.
 *   • Each slice imports `EditorStore` (one-way).
 *   • Each slice extends `EditorStore` via `declare module` (no source-level
 *     import edge created — augmentation is type-system-only).
 *
 * To register a new slice:
 *   1. Define and export its slice interface from the slice file.
 *   2. Add a `declare module '@core/editor-store/types'` block alongside the
 *      slice interface declaring `interface EditorStore extends MySlice {}`.
 *   3. Wire its creator into `./store.ts`.
 *
 * NOTE: Don't add slice fields here directly. The whole point is that the
 * slice files own their own state shape and contribute it via augmentation.
 */
// EditorStore intentionally starts empty; slice files augment it.
// Allowed by `@typescript-eslint/no-empty-object-type`'s `allowWithName` rule
// configured in `eslint.config.js`.
export interface EditorStore {}
