import { describe, expect, it } from 'vitest'
import {
  convertToTree,
  formatJSON,
  formatJSONWithSortedKeys,
  getJSONPathAtPosition,
  minifyJSON,
  parseJSONSafe,
  searchJSON,
  sortJSONKeys,
} from '../jsonUtils'

describe('parseJSONSafe', () => {
  it('parses valid JSON', () => {
    const { data, error } = parseJSONSafe('{"a":1}')
    expect(error).toBeNull()
    expect(data).toEqual({ a: 1 })
  })

  it('reports an error for invalid JSON', () => {
    const { data, error } = parseJSONSafe('{"a":}')
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.message).toBeTruthy()
  })

  it('surfaces a line number when the engine provides one', () => {
    const { error } = parseJSONSafe('{\n  "a": 1,\n  "b":\n}')
    expect(error).not.toBeNull()
    // V8 emits "... (line N column M)"; when present we must expose it for jump-to-error.
    if (/line \d+/i.test(error!.message)) {
      expect(error!.line).toBeGreaterThan(0)
      expect(error!.position).toBeGreaterThan(0)
    }
  })
})

describe('formatJSON / minifyJSON', () => {
  it('formats with the requested indent', () => {
    expect(formatJSON({ a: 1 }, 4)).toBe('{\n    "a": 1\n}')
    expect(formatJSON({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
  })

  it('minifies away all whitespace', () => {
    expect(minifyJSON({ a: [1, 2], b: 'x' })).toBe('{"a":[1,2],"b":"x"}')
  })
})

describe('sortJSONKeys', () => {
  it('sorts keys recursively and preserves array order', () => {
    const sorted = sortJSONKeys({ b: 1, a: { d: 1, c: 2 }, arr: [{ z: 1, y: 2 }] })
    expect(Object.keys(sorted)).toEqual(['a', 'arr', 'b'])
    expect(Object.keys(sorted.a)).toEqual(['c', 'd'])
    expect(Object.keys(sorted.arr[0])).toEqual(['y', 'z'])
  })

  it('passes primitives through untouched', () => {
    expect(sortJSONKeys(null)).toBeNull()
    expect(sortJSONKeys(5)).toBe(5)
    expect(sortJSONKeys('s')).toBe('s')
  })

  it('formatJSONWithSortedKeys combines sort + indent', () => {
    expect(formatJSONWithSortedKeys({ b: 1, a: 2 }, 2)).toBe('{\n  "a": 2,\n  "b": 1\n}')
  })
})

describe('convertToTree', () => {
  it('emits a node for the container and every descendant', () => {
    const nodes = convertToTree({ a: 1, b: [true, null] })
    expect(nodes[0].type).toBe('object')
    expect(nodes[0].path).toBe('root')
    const types = nodes.map((n) => n.type)
    expect(types).toContain('number')
    expect(types).toContain('array')
    expect(types).toContain('boolean')
    expect(types).toContain('null')
  })

  it('handles primitive roots', () => {
    expect(convertToTree('hello')).toEqual([{ value: 'hello', type: 'string', path: 'root' }])
  })
})

describe('searchJSON', () => {
  const data = {
    name: 'Alpha',
    nested: { name: 'Beta', count: 42, flag: true, empty: null },
    list: ['alpha', 'gamma'],
  }

  it('matches keys and returns their path', () => {
    const results = searchJSON(data, 'name')
    expect(results.some((r) => r.path === 'root.name')).toBe(true)
    expect(results.some((r) => r.path === 'root.nested.name')).toBe(true)
  })

  it('matches string values case-insensitively', () => {
    const results = searchJSON(data, 'ALPHA')
    expect(results.some((r) => r.path === 'root.list[0]')).toBe(true)
  })

  it('matches numbers and booleans', () => {
    expect(searchJSON(data, '42').some((r) => r.path === 'root.nested.count')).toBe(true)
    expect(searchJSON(data, 'true').some((r) => r.path === 'root.nested.flag')).toBe(true)
  })

  it('matches null values', () => {
    expect(searchJSON(data, 'null').some((r) => r.path === 'root.nested.empty')).toBe(true)
  })

  it('returns nothing for a term with no matches', () => {
    expect(searchJSON(data, 'zzzz')).toHaveLength(0)
  })
})

describe('getJSONPathAtPosition', () => {
  const json = '{\n  "user": {\n    "name": "bro",\n    "tags": ["a", "b"]\n  }\n}'

  it('returns a dot path for nested object keys', () => {
    const offset = json.indexOf('"bro"')
    expect(getJSONPathAtPosition(json, offset)).toBe('user.name')
  })

  it('returns bracket notation for array indices', () => {
    const offset = json.indexOf('"b"')
    expect(getJSONPathAtPosition(json, offset)).toBe('user.tags[1]')
  })

  it('returns an empty string at the document root', () => {
    expect(getJSONPathAtPosition(json, 0)).toBe('')
  })

  it('guards against out-of-range offsets', () => {
    expect(getJSONPathAtPosition(json, -1)).toBe('')
    expect(getJSONPathAtPosition(json, json.length + 10)).toBe('')
    expect(getJSONPathAtPosition('', 0)).toBe('')
  })

  it('uses bracket notation for keys that are not identifiers', () => {
    const weird = '{ "a-b": 1 }'
    expect(getJSONPathAtPosition(weird, weird.indexOf('1'))).toBe("['a-b']")
  })
})
