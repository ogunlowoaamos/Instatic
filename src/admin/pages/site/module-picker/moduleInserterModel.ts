import type { AnyModuleDefinition } from '@core/module-engine'
import type { VisualComponent } from '@core/visualComponents'
import {
  countPresetNodes,
  type InsertionPreset,
} from './insertionPresets'
import {
  moduleWireForId,
  wireFromTree,
  type WireNode,
} from './moduleWireframes'

export type ModuleInserterAccent = 'mint' | 'lilac' | 'sky' | 'peach' | 'rose'
export type ModuleInserterSectionId =
  | 'modules'
  | 'layouts'
  | 'components'
  | 'community'
  | 'recent'
export type ModuleInserterItemKind = 'module' | 'layout' | 'component' | 'community'

export interface RegistryModuleForInserter {
  id: string
  name: string
  category: string
  description?: string
}

export interface ModuleInserterRecentRef {
  kind: ModuleInserterItemKind
  id: string
}

interface BaseInserterItem {
  key: string
  id: string
  kind: ModuleInserterItemKind
  name: string
  description: string
  accent: ModuleInserterAccent
  wire: WireNode
  searchText: string
}

export interface ModuleInserterModuleItem<
  TModule extends RegistryModuleForInserter = AnyModuleDefinition,
> extends BaseInserterItem {
  kind: 'module'
  module: TModule
  category: string
}

export interface ModuleInserterLayoutItem extends BaseInserterItem {
  kind: 'layout'
  preset: InsertionPreset
  blocks: number
}

export interface ModuleInserterComponentItem extends BaseInserterItem {
  kind: 'component'
  component: VisualComponent
  uses: number
}

export interface ModuleInserterCommunityItem extends BaseInserterItem {
  kind: 'community'
}

export type ModuleInserterItem =
  | ModuleInserterModuleItem
  | ModuleInserterLayoutItem
  | ModuleInserterComponentItem
  | ModuleInserterCommunityItem

const HIDDEN_MODULE_IDS = new Set([
  'base.body',
  'base.visual-component-ref',
  'base.slot-instance',
])

export function moduleAccentForCategory(category: string): ModuleInserterAccent {
  if (category === 'Forms') return 'mint'
  if (category === 'Media') return 'sky'
  if (category === 'Typography') return 'peach'
  if (category === 'Interactive' || category === 'CMS') return 'rose'
  return 'lilac'
}

export function isInsertableModule(
  mod: RegistryModuleForInserter,
  isVCMode: boolean,
): boolean {
  if (HIDDEN_MODULE_IDS.has(mod.id)) return false
  if (mod.id === 'base.slot-outlet') return isVCMode
  return true
}

export function getInsertableModuleItems<TModule extends RegistryModuleForInserter>(
  modules: readonly TModule[],
  isVCMode: boolean,
): ModuleInserterModuleItem<TModule>[] {
  return modules
    .filter((mod) => isInsertableModule(mod, isVCMode))
    .map((mod) => {
      const description = mod.description ?? `${mod.name} module`
      return {
        key: recentKey({ kind: 'module', id: mod.id }),
        id: mod.id,
        kind: 'module',
        name: mod.name,
        description,
        category: mod.category,
        accent: moduleAccentForCategory(mod.category),
        module: mod,
        wire: moduleWireForId(mod.id, mod.category),
        searchText: searchText([mod.name, mod.id, mod.category, description]),
      }
    })
}

export function getLayoutPresetItems(
  presets: readonly InsertionPreset[],
): ModuleInserterLayoutItem[] {
  return presets.map((preset) => ({
    key: recentKey({ kind: 'layout', id: preset.id }),
    id: preset.id,
    kind: 'layout',
    name: preset.name,
    description: preset.description,
    accent: preset.kind === 'form' ? 'mint' : 'sky',
    preset,
    blocks: countPresetNodes(preset.root),
    wire: preset.wire,
    searchText: searchText([preset.name, preset.id, preset.description, preset.kind]),
  }))
}

export function getComponentItems(
  components: readonly VisualComponent[],
): ModuleInserterComponentItem[] {
  return components.map((component) => ({
    key: recentKey({ kind: 'component', id: component.id }),
    id: component.id,
    kind: 'component',
    name: component.name,
    description: 'Saved Visual Component',
    accent: 'mint',
    component,
    uses: 0,
    wire: wireFromTree(component.tree),
    searchText: searchText([component.name, component.id, 'visual component']),
  }))
}

export function filterInserterItems<TItem extends ModuleInserterItem>(
  items: readonly TItem[],
  query: string,
): TItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((item) => item.searchText.includes(q))
}

export function recentRefForItem(item: ModuleInserterItem): ModuleInserterRecentRef {
  return { kind: item.kind, id: item.id }
}

export function resolveRecentItems(
  recent: readonly ModuleInserterRecentRef[],
  items: readonly ModuleInserterItem[],
): ModuleInserterItem[] {
  const byKey = new Map(items.map((item) => [item.key, item]))
  const resolved: ModuleInserterItem[] = []
  const seen = new Set<string>()
  for (const ref of recent) {
    const key = recentKey(ref)
    if (seen.has(key)) continue
    const item = byKey.get(key)
    if (!item) continue
    resolved.push(item)
    seen.add(key)
  }
  return resolved
}

export function itemDescription(item: ModuleInserterItem): string {
  if (item.kind === 'layout') return `${item.blocks} blocks · ${item.description}`
  if (item.kind === 'component') {
    const count = item.component.params.length
    return count === 1 ? '1 param · Saved component' : `${count} params · Saved component`
  }
  return item.description
}

export function recentKey(ref: ModuleInserterRecentRef): string {
  return `${ref.kind}:${ref.id}`
}

function searchText(parts: readonly string[]): string {
  return parts.join(' ').toLowerCase()
}
