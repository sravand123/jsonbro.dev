import { describe, expect, it } from 'vitest'

import { analyze, runQuery, search, sortForDiff, sortKeysDeep, transform } from '@/lib/analysis'
import type { SearchOptions } from '@/workers/protocol'

const defaultOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  scope: 'both',
}

const document = JSON.stringify(
  {
    name: 'Alpha',
    count: 42,
    nested: { name: 'beta', flag: true, missing: null },
    list: ['alpha', 'gamma', 3],
  },
  null,
  2,
)

describe('analyze', () => {
  it('reports empty documents', () => {
    const result = analyze('   ')
    expect(result.status).toBe('empty')
    expect(result.canRepair).toBe(false)
    expect(result.stats.rootType).toBe('empty')
  })

  it('reports valid documents with shape statistics', () => {
    const result = analyze(document)
    expect(result.status).toBe('valid')
    expect(result.error).toBeNull()
    expect(result.stats.rootType).toBe('object')
    expect(result.stats.objects).toBe(2)
    expect(result.stats.arrays).toBe(1)
    expect(result.stats.strings).toBe(4)
    expect(result.stats.numbers).toBe(2)
    expect(result.stats.booleans).toBe(1)
    expect(result.stats.nulls).toBe(1)
    expect(result.stats.depth).toBe(3)
    expect(result.stats.largestArray).toBe(3)
    expect(result.stats.bytes).toBeGreaterThan(0)
  })

  it('reports invalid documents with a friendly message and a location', () => {
    const result = analyze('{\n  "a": 1\n  "b": 2\n}')
    expect(result.status).toBe('invalid')
    expect(result.error).not.toBeNull()
    expect(result.error!.friendly).toMatch(/comma/i)
    expect(result.error!.line).toBe(3)
    expect(result.error!.position).toBeGreaterThan(0)
  })

  it('detects when a document can be repaired automatically', () => {
    expect(analyze("{'a': 1,}").canRepair).toBe(true)
    expect(analyze('{"a": ').canRepair).toBe(true)
  })

  it('explains single quotes and trailing commas in plain language', () => {
    expect(analyze("{'a': 1}").error!.friendly).toMatch(/double quotes/i)
    expect(analyze('{"a": 1,}').error!.friendly).toMatch(/trailing comma|property name/i)
    expect(analyze('{"a": 1').error!.friendly).toMatch(/ends too early/i)
  })
})

describe('search', () => {
  it('finds keys and values with exact source offsets', () => {
    const result = search(document, 'name', defaultOptions)
    expect(result.total).toBeGreaterThanOrEqual(2)
    const paths = result.matches.map((match) => match.path)
    expect(paths).toContain('$.name')
    expect(paths).toContain('$.nested.name')

    const first = result.matches[0]
    expect(typeof first.offset).toBe('number')
    // The offset must point at the literal in the source text.
    expect(document.slice(first.offset!, first.offset! + first.length!)).toContain('name')
  })

  it('honours the keys-only and values-only scopes', () => {
    const keysOnly = search(document, 'alpha', { ...defaultOptions, scope: 'keys' })
    expect(keysOnly.total).toBe(0)

    const valuesOnly = search(document, 'alpha', { ...defaultOptions, scope: 'values' })
    expect(valuesOnly.total).toBeGreaterThan(0)
    expect(valuesOnly.matches.every((match) => match.matchedIn === 'value')).toBe(true)
  })

  it('honours case sensitivity', () => {
    expect(search(document, 'ALPHA', defaultOptions).total).toBeGreaterThan(0)
    expect(search(document, 'ALPHA', { ...defaultOptions, caseSensitive: true }).total).toBe(0)
  })

  it('honours whole-word matching', () => {
    expect(search(document, 'alph', defaultOptions).total).toBeGreaterThan(0)
    expect(search(document, 'alph', { ...defaultOptions, wholeWord: true }).total).toBe(0)
    expect(search(document, 'alpha', { ...defaultOptions, wholeWord: true }).total).toBeGreaterThan(0)
  })

  it('supports regular expressions and survives invalid ones', () => {
    const result = search(document, '^g.mma$', { ...defaultOptions, useRegex: true })
    expect(result.matches.map((match) => match.path)).toContain('$.list[1]')
    expect(search(document, '[unclosed', { ...defaultOptions, useRegex: true }).total).toBe(0)
  })

  it('matches numbers, booleans and nulls', () => {
    expect(search(document, '42', defaultOptions).matches[0].path).toBe('$.count')
    expect(search(document, 'true', defaultOptions).matches.some((m) => m.path === '$.nested.flag')).toBe(true)
    expect(
      search(document, 'null', defaultOptions).matches.some((m) => m.path === '$.nested.missing'),
    ).toBe(true)
  })

  it('caps results and flags truncation', () => {
    const big = JSON.stringify(Array.from({ length: 50 }, (_, index) => ({ id: index })))
    const result = search(big, 'id', defaultOptions, 10)
    expect(result.matches).toHaveLength(10)
    expect(result.total).toBe(50)
    expect(result.truncated).toBe(true)
  })

  it('returns nothing for an empty term', () => {
    expect(search(document, '', defaultOptions).total).toBe(0)
  })
})

describe('transform', () => {
  it('formats with the requested indent', () => {
    expect(transform('{"a":1}', 'format', 4)).toBe('{\n    "a": 1\n}')
  })

  it('minifies', () => {
    expect(transform('{\n  "a": 1\n}', 'minify', 2)).toBe('{"a":1}')
  })

  it('repairs and formats broken input', () => {
    expect(transform("{'a': 1,}", 'repair', 2)).toBe('{\n  "a": 1\n}')
  })

  it('sorts keys', () => {
    expect(transform('{"b":1,"a":2}', 'sortKeys', 2)).toBe('{\n  "a": 2,\n  "b": 1\n}')
  })

  it('throws on invalid input so callers can report it', () => {
    expect(() => transform('{invalid', 'format', 2)).toThrow()
  })
})

describe('sortForDiff', () => {
  it('sorts valid input', () => {
    expect(sortForDiff('{"b":1,"a":2}', 2)).toBe('{\n  "a": 2,\n  "b": 1\n}')
  })

  it('passes invalid input through unchanged so the diff still renders', () => {
    expect(sortForDiff('{oops', 2)).toBe('{oops')
  })

  it('keeps array order intact', () => {
    expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2])
  })
})

describe('runQuery', () => {
  it('requires valid JSON', () => {
    const result = runQuery('{bad', '$.a')
    expect(result.error).toMatch(/valid JSON/i)
  })

  it('returns matches with paths and previews', () => {
    const result = runQuery(document, '$..name')
    expect(result.total).toBe(2)
    expect(result.matches.map((match) => match.path)).toEqual(['$.name', '$.nested.name'])
  })

  it('reports query syntax errors', () => {
    expect(runQuery(document, 'nonsense').error).toBeTruthy()
  })
})
