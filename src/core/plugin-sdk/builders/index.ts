/**
 * Plugin SDK builder surface — author-facing API.
 *
 * Re-exports every builder so plugin authors can pull what they need from
 * a single import path:
 *
 *   import {
 *     definePlugin, defineModule, defineComponent, definePack,
 *     control, html, raw, safeUrl,
 *     permissions, createNamespace, h, vc,
 *   } from '@pagebuilder/plugin-sdk'
 *
 * The host re-exports this surface from `@core/plugin-sdk` so first-party
 * plugins (in this monorepo) can use the same API without an extra
 * dependency.
 */

export { definePlugin } from './definePlugin'
export type { DefinePluginConfig, PluginDefinition } from './definePlugin'
export { defineModule } from './defineModule'
export { defineComponent, vc, h } from './tree'
export { definePack } from './definePack'
export type { PluginPackContents } from './definePack'
export { control } from './controls'
export { html, raw, safeUrl, escapeHtml } from './html'
export { permissions } from './permissions'
export type { PermissionAlias } from './permissions'
export { createNamespace } from './namespace'
export type { PluginNamespace } from './namespace'
export { definePluginAdminApp } from './adminApp'
export type {
  PluginAdminAppRenderContext,
  PluginAdminAppRenderFn,
  PluginAdminH,
  PluginAdminHooks,
  PluginAdminUi,
  PluginUiAlertProps,
  PluginUiButtonProps,
  PluginUiCardProps,
  PluginUiCheckboxProps,
  PluginUiCodeProps,
  PluginUiEmptyStateProps,
  PluginUiHeadingProps,
  PluginUiInputProps,
  PluginUiSearchBarProps,
  PluginUiSelectProps,
  PluginUiSeparatorProps,
  PluginUiStackProps,
  PluginUiSwitchProps,
  PluginUiTextProps,
  PluginUiTextareaProps,
} from './adminApp'
