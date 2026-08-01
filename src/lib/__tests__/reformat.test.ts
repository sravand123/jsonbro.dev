import { describe, expect, it } from 'vitest'

import { transform, sortForDiff } from '@/lib/analysis'
import { findDuplicateKeys, formatText, minifyText, sortKeysText } from '@/lib/reformat'

/**
 * Reported: formatting `123456789012345678901234567890` rewrote it as
 * `1.2345678901234568e+29`. Any transform that changes a value is data loss, so
 * these tests pin literal preservation for the cases JavaScript numbers mangle.
 */
describe('lossless reformatting', () => {
  const bigInt = '123456789012345678901234567890'
  const cases: Array<[string, string]> = [
    ['big integer', bigInt],
    ['high-precision decimal', '0.1234567890123456789012345'],
    ['trailing zero decimal', '1.0'],
    ['exponent form', '1e5'],
    ['explicit plus exponent', '1.5E+10'],
    ['negative zero', '-0'],
    ['very small', '1e-400'],
    ['long integer id', '9007199254740993'],
  ]

  it.each(cases)('format preserves a %s exactly', (_label, literal) => {
    const source = `{"value":${literal}}`
    const formatted = formatText(source, 2)
    expect(formatted).toBe(`{\n  "value": ${literal}\n}`)
    // The destructive round trip, for contrast.
    expect(JSON.stringify(JSON.parse(source))).not.toBe(`{"value":${literal}}`)
  })

  it('minify preserves literals exactly', () => {
    const source = `{\n  "a": ${bigInt},\n  "b": 1.0\n}`
    expect(minifyText(source)).toBe(`{"a":${bigInt},"b":1.0}`)
  })

  it('sortKeys preserves literals while reordering', () => {
    const source = `{"b":1.0,"a":${bigInt}}`
    expect(sortKeysText(source, 2)).toBe(`{\n  "a": ${bigInt},\n  "b": 1.0\n}`)
  })

  it('the transform entry points are lossless too', () => {
    const source = `{"id":${bigInt}}`
    expect(transform(source, 'format', 2)).toContain(bigInt)
    expect(transform(source, 'minify', 2)).toBe(`{"id":${bigInt}}`)
    expect(transform(source, 'sortKeys', 2)).toContain(bigInt)
    expect(sortForDiff(source, 2)).toContain(bigInt)
  })

  it('repair keeps literals intact', () => {
    expect(transform(`{'id': ${bigInt},}`, 'repair', 2)).toBe(`{\n  "id": ${bigInt}\n}`)
  })

  it('preserves string escapes and unicode verbatim', () => {
    const source = String.raw`{"s":"tab\there \u00e9 \ud83d\ude00 \/slash"}`
    expect(minifyText(source)).toBe(source)
  })

  it('keeps key order stable when formatting', () => {
    expect(formatText('{"z":1,"a":2}', 2)).toBe('{\n  "z": 1,\n  "a": 2\n}')
  })

  it('handles empty containers and nesting', () => {
    expect(minifyText('{ "a": [], "b": {}, "c": [ { "d": [ 1 ] } ] }')).toBe(
      '{"a":[],"b":{},"c":[{"d":[1]}]}',
    )
  })

  it('respects the requested indent width', () => {
    expect(formatText('{"a":1}', 4)).toBe('{\n    "a": 1\n}')
    expect(formatText('{"a":1}', 0)).toBe('{\n"a": 1\n}')
  })

  it('rejects invalid documents rather than silently producing output', () => {
    expect(() => formatText('{"a":}', 2)).toThrow()
    expect(() => minifyText('nope', )).toThrow()
  })
})

describe('duplicate key detection', () => {
  it('reports keys that appear twice in the same object', () => {
    expect(findDuplicateKeys('{"dup":1,"dup":2}')).toEqual(['dup'])
  })

  it('finds duplicates in nested objects and arrays', () => {
    expect(findDuplicateKeys('{"a":{"x":1,"x":2},"b":[{"y":1,"y":2}]}')).toEqual(['x', 'y'])
  })

  it('does not flag the same key at different levels', () => {
    expect(findDuplicateKeys('{"a":{"id":1},"b":{"id":2}}')).toEqual([])
  })

  it('returns nothing for clean documents', () => {
    expect(findDuplicateKeys('{"a":1,"b":2}')).toEqual([])
  })
})
