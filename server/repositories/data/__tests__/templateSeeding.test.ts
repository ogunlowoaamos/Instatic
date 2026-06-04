import { describe, expect, it } from 'bun:test'
import { buildDefaultTemplateCells } from '../templateSeeding'
import type { DataTable } from '@core/data/schemas'

const table = { slug: 'posts', singularLabel: 'Post' } as DataTable

describe('buildDefaultTemplateCells', () => {
  it('targets the post type and uses base.outlet for the body', () => {
    const cells = buildDefaultTemplateCells(table, 'posts-template') as Record<string, any>
    expect(cells.templateTarget).toEqual({ kind: 'postTypes', tableSlugs: ['posts'] })
    expect(cells.templateContext).toBeUndefined()
    const nodes = cells.body.nodes as Record<string, any>
    const outlet = Object.values(nodes).find((n: any) => n.moduleId === 'base.outlet') as any
    expect(outlet).toBeTruthy()
    expect(outlet.dynamicBindings.html).toEqual({ source: 'currentEntry', field: 'body', format: 'html' })
    expect(Object.values(nodes).some((n: any) => n.moduleId === 'base.content')).toBe(false)
  })
})
