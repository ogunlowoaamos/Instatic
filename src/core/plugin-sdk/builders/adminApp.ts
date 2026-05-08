/**
 * `definePluginAdminApp` — type-safe plugin admin app entrypoint.
 *
 *   import { definePluginAdminApp } from '@pagebuilder/plugin-sdk'
 *
 *   export default definePluginAdminApp(({ ui, h, hooks, api }) => {
 *     const [count, setCount] = hooks.useState(0)
 *     return h(ui.Card, {}, [
 *       h(ui.Heading, { level: 2 }, 'Counter'),
 *       h(ui.Button, {
 *         variant: 'primary',
 *         onClick: () => setCount(count + 1),
 *       }, `Increment (${count})`),
 *     ])
 *   })
 *
 * The plugin's bundle has **zero React imports**: `h` and `hooks` are
 * passed as arguments. The host's admin app loads the plugin via dynamic
 * import, then calls the default-exported function with its own React
 * runtime + a curated, plugin-friendly UI namespace. This means:
 *
 *   • Plugins never have a stale React copy
 *   • Plugins can't reach into host internals
 *   • The plugin's bundle stays tiny — no react vendor blob
 *   • The host can refactor its UI components without breaking plugins;
 *     the `ui` namespace is the stable contract.
 *
 * The function may also opt into cleanup with `useEffect`'s return
 * — there's no separate `cleanup()` hook on the SDK contract.
 */

import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { PluginAdminAppApi, PluginAdminPageRoute } from '../types'

// ---------------------------------------------------------------------------
// UI namespace exposed to plugins. Each entry is a host wrapper component;
// the SDK declares the prop shape so plugins compile against a stable API.
// ---------------------------------------------------------------------------

export interface PluginUiButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  fullWidth?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  type?: 'button' | 'submit' | 'reset'
  ariaLabel?: string
  children?: ReactNode
}

export interface PluginUiInputProps {
  label?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'url' | 'number' | 'search'
  invalid?: boolean
  disabled?: boolean
  required?: boolean
  prefix?: string
  unit?: string
  description?: string
  onChange?: (value: string) => void
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
}

export interface PluginUiTextareaProps {
  label?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  rows?: number
  invalid?: boolean
  disabled?: boolean
  required?: boolean
  description?: string
  onChange?: (value: string) => void
}

export interface PluginUiSelectProps<T extends string = string> {
  label?: string
  value?: T
  description?: string
  disabled?: boolean
  options: ReadonlyArray<{ label: string; value: T; disabled?: boolean }>
  onChange?: (value: T) => void
}

export interface PluginUiSwitchProps {
  label?: string
  checked?: boolean
  description?: string
  disabled?: boolean
  onChange?: (next: boolean) => void
}

export interface PluginUiCheckboxProps {
  label?: string
  checked?: boolean
  description?: string
  disabled?: boolean
  onChange?: (next: boolean) => void
}

export interface PluginUiSearchBarProps {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
}

export interface PluginUiStackProps {
  /** Gap between children, in pixels. */
  gap?: number
  /** Stack direction. Defaults to 'column'. */
  direction?: 'row' | 'column'
  /** Cross-axis alignment. */
  align?: 'start' | 'center' | 'end' | 'stretch'
  /** Main-axis distribution. */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  /** Whether children should wrap onto new lines. */
  wrap?: boolean
  children?: ReactNode
}

export interface PluginUiCardProps {
  /** Padding in pixels. Defaults to 16. */
  padding?: number
  /** Display the card with a subtle border. Defaults to true. */
  bordered?: boolean
  children?: ReactNode
}

export interface PluginUiHeadingProps {
  /** Heading level — 1 through 6. */
  level: 1 | 2 | 3 | 4 | 5 | 6
  children?: ReactNode
}

export interface PluginUiTextProps {
  variant?: 'default' | 'muted' | 'strong' | 'mono'
  size?: 'sm' | 'md' | 'lg'
  children?: ReactNode
}

export interface PluginUiSeparatorProps {
  /** Defaults to 'horizontal'. */
  orientation?: 'horizontal' | 'vertical'
}

export interface PluginUiEmptyStateProps {
  title: string
  body?: string
  action?: ReactNode
}

export interface PluginUiAlertProps {
  /** Defaults to 'info'. */
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children?: ReactNode
}

export interface PluginUiCodeProps {
  children?: ReactNode
}

/**
 * The `ui` namespace handed to plugin admin apps at runtime. Each value is
 * a host-provided React component that maps the plugin-facing prop API to
 * the internal Button/Input/etc. primitives.
 */
export interface PluginAdminUi {
  Button: ComponentType<PluginUiButtonProps>
  Input: ComponentType<PluginUiInputProps>
  Textarea: ComponentType<PluginUiTextareaProps>
  Select: ComponentType<PluginUiSelectProps>
  Switch: ComponentType<PluginUiSwitchProps>
  Checkbox: ComponentType<PluginUiCheckboxProps>
  SearchBar: ComponentType<PluginUiSearchBarProps>
  Stack: ComponentType<PluginUiStackProps>
  Card: ComponentType<PluginUiCardProps>
  Heading: ComponentType<PluginUiHeadingProps>
  Text: ComponentType<PluginUiTextProps>
  Separator: ComponentType<PluginUiSeparatorProps>
  EmptyState: ComponentType<PluginUiEmptyStateProps>
  Alert: ComponentType<PluginUiAlertProps>
  Code: ComponentType<PluginUiCodeProps>
}

// ---------------------------------------------------------------------------
// Hyperscript shim handed to plugins. We expose React.createElement and a
// curated subset of hooks. Plugins receive this via the `h` and `hooks`
// arguments — they don't import from React directly, which lets the host
// keep ownership of the React instance and refactor freely.
// ---------------------------------------------------------------------------

export type PluginAdminH = (
  type: ComponentType<unknown> | string,
  props?: Record<string, unknown> | null,
  ...children: ReactNode[]
) => ReactElement

export interface PluginAdminHooks {
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void]
  useEffect: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void
  useMemo: <T>(factory: () => T, deps: ReadonlyArray<unknown>) => T
  useCallback: <T extends (...args: never[]) => unknown>(callback: T, deps: ReadonlyArray<unknown>) => T
  useRef: <T>(initial: T | null) => { current: T | null }
}

// ---------------------------------------------------------------------------
// Render context — what the plugin's render function receives.
//
// Named `PluginAdminAppRenderContext` to distinguish from the legacy
// `PluginAdminAppContext` shape (still exported from `./types` for the
// imperative-DOM admin app API). New plugins use this React-based context;
// the legacy one is kept until external plugins finish migrating.
// ---------------------------------------------------------------------------

export interface PluginAdminAppRenderContext {
  /** The page descriptor the plugin admin app is rendering for. */
  page: PluginAdminPageRoute
  /** Persistence + plugin route helpers. */
  api: PluginAdminAppApi
  /** Curated UI surface (Button, Input, Stack, Card, …). */
  ui: PluginAdminUi
  /** Hyperscript factory — `h(ui.Button, { variant: 'primary' }, 'Click')`. */
  h: PluginAdminH
  /** Curated React hooks. */
  hooks: PluginAdminHooks
}

export type PluginAdminAppRenderFn = (ctx: PluginAdminAppRenderContext) => ReactElement

/**
 * Identity wrapper that gives plugin authors type narrowing without any
 * runtime cost. The host's admin loader expects either:
 *   - `mod.default` is a function (the render fn), OR
 *   - `mod.default.render` is a function (when there's metadata too)
 *
 * Both shapes work; the function form is the simplest.
 */
export function definePluginAdminApp(
  render: PluginAdminAppRenderFn,
): PluginAdminAppRenderFn {
  return render
}
