import type { IModuleRegistry, AnyModuleDefinition, ModuleDefinition } from './types'

/**
 * ModuleRegistry — Singleton that holds all registered ModuleDefinitions.
 *
 * Base modules self-register via `src/modules/base/index.ts` on app boot.
 * Community modules are registered dynamically when installed/loaded.
 *
 * The registry holds the type-erased AnyModuleDefinition shape (props typed as
 * Record<string, unknown>). Each module's narrow TProps is visible at the
 * definition site; runtime callers receive props as a generic record. The
 * narrow→erased cast happens once at this boundary so user code never needs
 * to widen its types.
 */
class ModuleRegistry implements IModuleRegistry {
  private readonly _modules = new Map<string, AnyModuleDefinition>()

  /**
   * One controlled point of TProps→Record<string, unknown> erasure.
   * The cast is sound: every ModuleDefinition<T> is structurally a superset of
   * AnyModuleDefinition at runtime — its render/component just expect a
   * narrower props shape than the registry can statically promise.
   */
  private erase<T extends Record<string, unknown>>(
    definition: ModuleDefinition<T>,
  ): AnyModuleDefinition {
    return definition as unknown as AnyModuleDefinition
  }

  register<T extends Record<string, unknown>>(definition: ModuleDefinition<T>): void {
    if (!definition.id || !definition.id.includes('.')) {
      throw new Error(
        `[ModuleRegistry] Invalid module ID "${definition.id}". ` +
          `IDs must be namespaced: "namespace.module-name" (e.g. "base.text").`
      )
    }
    if (this._modules.has(definition.id)) {
      throw new Error(
        `[ModuleRegistry] Module "${definition.id}" is already registered. ` +
          `Use registerOrReplace() to intentionally overwrite.`
      )
    }
    this._modules.set(definition.id, this.erase(definition))
  }

  registerOrReplace<T extends Record<string, unknown>>(definition: ModuleDefinition<T>): void {
    if (!definition.id || !definition.id.includes('.')) {
      throw new Error(
        `[ModuleRegistry] Invalid module ID "${definition.id}".`
      )
    }
    this._modules.set(definition.id, this.erase(definition))
  }

  unregister(id: string): void {
    this._modules.delete(id)
  }

  get(id: string): AnyModuleDefinition | undefined {
    return this._modules.get(id)
  }

  getOrThrow(id: string): AnyModuleDefinition {
    const mod = this._modules.get(id)
    if (!mod) {
      throw new Error(
        `[ModuleRegistry] Module "${id}" is not registered. ` +
          `Ensure the module is imported and registered before use.`
      )
    }
    return mod
  }

  has(id: string): boolean {
    return this._modules.has(id)
  }

  list(): AnyModuleDefinition[] {
    return Array.from(this._modules.values())
  }

  listByCategory(): Record<string, AnyModuleDefinition[]> {
    const result: Record<string, AnyModuleDefinition[]> = {}
    for (const mod of this._modules.values()) {
      const cat = mod.category
      if (!result[cat]) result[cat] = []
      result[cat].push(mod)
    }
    return result
  }

  get size(): number {
    return this._modules.size
  }
}

export const registry = new ModuleRegistry()
