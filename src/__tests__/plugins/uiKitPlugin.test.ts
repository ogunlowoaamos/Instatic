/**
 * Smoke test for the UI Kit example plugin (TypeScript-first migration).
 *
 * The plugin source is `examples/plugins/ui-kit/pb-plugin.config.ts` —
 * one TypeScript entry that returns a `PluginDefinition`. This test
 * imports it directly (Bun transpiles), so we verify the SDK output
 * shape without running the build script.
 *
 * The runtime zip is produced by `scripts/build-plugin.ts` from the same
 * source. There's a separate end-to-end test for that path.
 */
import { describe, expect, it } from 'bun:test'

describe('UI Kit plugin (TypeScript source)', () => {
  it('definePlugin produces a valid PluginManifest with namespaced modules', async () => {
    const { default: definition } = await import(
      '../../../examples/plugins/ui-kit/pb-plugin.config'
    ) as { default: import('@core/plugin-sdk').PluginDefinition }

    expect(definition.manifest.id).toBe('acme.ui-kit')
    expect(definition.manifest.name).toBe('Modern UI Kit')
    expect(definition.manifest.permissions.sort()).toEqual([
      'modules.register',
      'visualComponents.register',
    ].sort())

    const moduleIds = definition.modules.map((m) => m.id)
    expect(moduleIds.sort()).toEqual([
      'acme.ui-kit.callout',
      'acme.ui-kit.feature-card',
      'acme.ui-kit.pricing-tier',
      'acme.ui-kit.stat',
      'acme.ui-kit.testimonial',
    ].sort())
  })

  it('every canvas module renders pure, escaped HTML when given its defaults', async () => {
    const { default: definition } = await import(
      '../../../examples/plugins/ui-kit/pb-plugin.config'
    ) as { default: import('@core/plugin-sdk').PluginDefinition }

    for (const mod of definition.modules) {
      const out = mod.render(mod.defaults, [])
      expect(typeof out.html).toBe('string')
      expect(out.html.length).toBeGreaterThan(0)
      // No raw `javascript:` URLs slipped through (the safeUrl wrapper).
      expect(out.html).not.toMatch(/href="javascript:/i)
      // Pricing tier interpolates user-provided strings; ensure escaping.
      // Render with a hostile-looking value and check.
      const hostile = mod.render({ ...mod.defaults, title: '<script>alert(1)</script>' }, [])
      expect(hostile.html).not.toMatch(/<script>alert\(1\)<\/script>/)
    }
  })

  it('pack imports namespaced classes with valid CSS class names', async () => {
    const { default: definition } = await import(
      '../../../examples/plugins/ui-kit/pb-plugin.config'
    ) as { default: import('@core/plugin-sdk').PluginDefinition }
    const pack = definition.pack
    if (!pack) throw new Error('Pack missing')

    expect(pack.classes.length).toBeGreaterThanOrEqual(8)
    for (const cls of pack.classes) {
      expect(cls.id.startsWith('acme.ui-kit/')).toBe(true)
      expect(/^[A-Za-z_][A-Za-z0-9_-]*$/.test(cls.name)).toBe(true)
    }
  })

  it('pack ships at least three Visual Components and one landing page', async () => {
    const { default: definition } = await import(
      '../../../examples/plugins/ui-kit/pb-plugin.config'
    ) as { default: import('@core/plugin-sdk').PluginDefinition }
    const pack = definition.pack
    if (!pack) throw new Error('Pack missing')

    expect(pack.visualComponents.length).toBeGreaterThanOrEqual(3)
    expect(pack.pages.length).toBe(1)
    for (const vc of pack.visualComponents) {
      expect(vc.id.startsWith('acme.ui-kit/')).toBe(true)
    }
  })
})
