import { describe, expect, it } from 'bun:test'
import { normalizeContentCollectionFields } from '@core/content/fields'

describe('normalizeContentCollectionFields', () => {
  it('returns the default shape when given non-objects', () => {
    expect(normalizeContentCollectionFields(undefined)).toEqual({
      builtIn: { body: true, featuredMedia: true, seo: true },
      custom: [],
    })
    expect(normalizeContentCollectionFields(null)).toEqual({
      builtIn: { body: true, featuredMedia: true, seo: true },
      custom: [],
    })
    expect(normalizeContentCollectionFields('not-an-object')).toEqual({
      builtIn: { body: true, featuredMedia: true, seo: true },
      custom: [],
    })
  })

  it('preserves valid custom field definitions through round-trip', () => {
    const result = normalizeContentCollectionFields({
      builtIn: { body: true, featuredMedia: true, seo: true },
      custom: [
        { id: 'date', label: 'Publish date', type: 'date' },
        { id: 'tags', label: 'Tags', type: 'tags' },
      ],
    })
    expect(result.custom).toHaveLength(2)
    expect(result.custom[0]).toEqual({ id: 'date', label: 'Publish date', type: 'date' })
    expect(result.custom[1]).toEqual({ id: 'tags', label: 'Tags', type: 'tags' })
  })

  it('drops invalid custom field entries while keeping valid ones', () => {
    const result = normalizeContentCollectionFields({
      builtIn: { body: true, featuredMedia: false, seo: true },
      custom: [
        { id: 'ok', label: 'Good', type: 'text' },
        // missing fields and bad shapes — should be filtered out
        { id: 'partial', label: 'No type' },
        { id: 42, label: 'Bad id', type: 'text' },
        null,
        'string entry',
      ],
    })
    expect(result.custom).toHaveLength(1)
    expect(result.custom[0]).toEqual({ id: 'ok', label: 'Good', type: 'text' })
    expect(result.builtIn.featuredMedia).toBe(false)
  })

  it('returns [] for non-array custom values', () => {
    expect(
      normalizeContentCollectionFields({
        builtIn: { body: true, featuredMedia: true, seo: true },
        custom: 'oops',
      }).custom,
    ).toEqual([])
  })

  it('falls back to defaults for non-boolean built-in values', () => {
    const result = normalizeContentCollectionFields({
      builtIn: { body: 'yes', featuredMedia: 1, seo: null },
      custom: [],
    })
    expect(result.builtIn).toEqual({ body: true, featuredMedia: true, seo: true })
  })
})
