/**
 * `definePlugin` — type-checked plugin configuration.
 *
 *   import { definePlugin, permissions } from '@pagebuilder/plugin-sdk'
 *   import callout from './modules/callout'
 *   import pack from './pack'
 *
 *   export default definePlugin({
 *     id: 'acme.ui-kit',
 *     name: 'Modern UI Kit',
 *     version: '1.0.0',
 *     description: 'Cards, tiers, testimonials, and a class pack.',
 *     permissions: [permissions.modulesRegister, permissions.visualComponentsRegister],
 *     modules: [callout],
 *     pack,
 *     // Optional entry-point hooks — pure objects, not file paths.
 *     // The build script wires them into the runtime zip layout.
 *     editor: () => import('./editor'),
 *     server: () => import('./server'),
 *     frontend: () => import('./frontend/tracker'),
 *   })
 *
 * The return value is the host's runtime `PluginManifest` plus the bundled
 * builder objects. The build script (PR 1.1, see scripts/build-plugin.ts)
 * uses those builder objects to emit the final zip.
 */

import type { PluginManifest, PluginAdminPage, PluginPermission, PluginResource } from '../types'
import type { PluginModuleDefinition } from '../modules'
import type { PluginPackContents } from './definePack'
import {
  validatePluginSettingsDefinitions,
  type PluginSettingDefinition,
} from './settings'

export interface DefinePluginConfig {
  id: string
  name: string
  version: string
  description?: string
  /** Free-form author metadata surfaced on the plugin card / marketplace. */
  author?: { name: string; email?: string; url?: string }
  /** SPDX license identifier. */
  license?: string
  /** Marketing / repo URLs. */
  homepage?: string
  repository?: string
  /** Discovery keywords. */
  keywords?: string[]
  /** API version the plugin targets. Defaults to 1. */
  apiVersion?: 1
  permissions: PluginPermission[]

  /**
   * Resources declared by the plugin (used by `cms.storage`). The host
   * persists records under each resource's id.
   */
  resources?: PluginResource[]

  /**
   * Admin pages registered by the plugin (markdown / map / resource / app).
   * Auto-deduped against the page id.
   */
  adminPages?: PluginAdminPage[]

  /** Canvas modules registered via `defineModule()`. */
  modules?: PluginModuleDefinition[]

  /** Visual Component / page / class pack from `definePack()`. */
  pack?: PluginPackContents

  /**
   * Declarative plugin settings — the host renders a form using its
   * design-system primitives. Plugin reads values via
   * `api.cms.settings.get(key)` (server / admin app) and
   * `window.__pb.pluginSettings(id)` (frontend, non-secret values only).
   */
  settings?: PluginSettingDefinition[]
}

/**
 * What `definePlugin` returns. Carries the runtime manifest the host
 * expects, plus the bundled builder outputs (modules, pack) that the build
 * script needs to emit JS / JSON files into the zip.
 */
export interface PluginDefinition {
  manifest: PluginManifest
  modules: PluginModuleDefinition[]
  pack: PluginPackContents | null
}

export function definePlugin(config: DefinePluginConfig): PluginDefinition {
  if (!config.id.includes('.')) {
    throw new Error(`[plugin-sdk] Plugin id "${config.id}" must be namespaced as "<vendor>.<name>".`)
  }
  for (const mod of config.modules ?? []) {
    if (!mod.id.startsWith(`${config.id}.`)) {
      throw new Error(
        `[plugin-sdk] Module id "${mod.id}" must start with the plugin id "${config.id}.".`,
      )
    }
  }
  for (const cls of config.pack?.classes ?? []) {
    if (!cls.id.startsWith(`${config.id}/`) && !cls.id.startsWith(`${config.id}.`)) {
      throw new Error(
        `[plugin-sdk] Pack class id "${cls.id}" must be namespaced under the plugin id "${config.id}".`,
      )
    }
  }
  for (const vc of config.pack?.visualComponents ?? []) {
    if (!vc.id.startsWith(`${config.id}/`)) {
      throw new Error(
        `[plugin-sdk] Visual Component id "${vc.id}" must start with "${config.id}/".`,
      )
    }
  }

  if (config.settings && config.settings.length > 0) {
    validatePluginSettingsDefinitions(config.id, config.settings)
  }

  const manifest: PluginManifest = {
    id: config.id,
    name: config.name,
    version: config.version,
    apiVersion: config.apiVersion ?? 1,
    description: config.description,
    permissions: [...config.permissions],
    resources: config.resources ?? [],
    adminPages: config.adminPages ?? [],
    settings: config.settings,
  }
  return {
    manifest,
    modules: config.modules ?? [],
    pack: config.pack ?? null,
  }
}
