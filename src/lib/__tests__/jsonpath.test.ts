import { describe, expect, it } from 'vitest'

import { queryJSON } from '@/lib/jsonpath'
import { breadcrumbFor, formatPath, parsePath, withRoot } from '@/lib/path'

const data = {
  store: {
    books: [
      { title: 'A', price: 10, active: true },
      { title: 'B', price: 25, active: false },
      { title: 'C', price: 5, active: true },
    ],
    owner: { name: 'Sam', id: 7 },
  },
  'odd key': 1,
}

const paths = (query: string) => queryJSON(data, query).matches.map((match) => match.path)
const pathsIn = (input: unknown, query: string) =>
  queryJSON(input, query).matches.map((match) => match.path)
const values = (query: string) => queryJSON(data, query).matches.map((match) => match.value)

describe('queryJSON', () => {
  it('resolves the root', () => {
    expect(queryJSON(data, '$').matches).toHaveLength(1)
  })

  it('walks child keys', () => {
    expect(values('$.store.owner.name')).toEqual(['Sam'])
    expect(paths('$.store.owner.name')).toEqual(['$.store.owner.name'])
  })

  it('supports bracket notation for awkward keys', () => {
    expect(values("$['odd key']")).toEqual([1])
  })

  it('indexes arrays, including from the end', () => {
    expect(values('$.store.books[0].title')).toEqual(['A'])
    expect(values('$.store.books[-1].title')).toEqual(['C'])
  })

  it('slices arrays', () => {
    expect(values('$.store.books[0:2].title')).toEqual(['A', 'B'])
    expect(values('$.store.books[1:].title')).toEqual(['B', 'C'])
  })

  it('expands wildcards over arrays and objects', () => {
    expect(values('$.store.books[*].price')).toEqual([10, 25, 5])
    expect(paths('$.store.owner.*')).toEqual(['$.store.owner.name', '$.store.owner.id'])
  })

  it('applies filters to any node anywhere after a descent', () => {
    // Reported: `$..[?(...)]` matched nothing, because `..` collected descendants
    // only while filters tested a node's children — nothing in between was tested.
    expect(queryJSON({ active: true, name: 'x' }, '$..[?(@.active == true)]').matches).toEqual([
      { path: '$', value: { active: true, name: 'x' } },
    ])
    expect(pathsIn({ c: { d: 3 } }, '$..[?(@.d == 3)]')).toEqual(['$.c'])
    expect(pathsIn({ a: { b: { flag: true } }, z: { flag: false } }, '$..[?(@.flag)]')).toEqual([
      '$.a.b',
    ])
  })

  it('accepts a path segment after a filter', () => {
    const team = { team: [{ active: true, name: 'a' }, { active: false, name: 'b' }] }
    expect(queryJSON(team, '$.team[?(@.active == true)].name').matches).toEqual([
      { path: '$.team[0].name', value: 'a' },
    ])
    expect(queryJSON(team, '$..[?(@.active == true)].name').matches).toEqual([
      { path: '$.team[0].name', value: 'a' },
    ])
  })

  it('descends recursively', () => {
    expect(values('$..title')).toEqual(['A', 'B', 'C'])
    expect(queryJSON(data, '$..*').matches.length).toBeGreaterThan(5)
  })

  it('filters with comparisons', () => {
    expect(values('$.store.books[?(@.price > 9)].title')).toEqual(['A', 'B'])
    expect(values('$.store.books[?(@.price <= 5)].title')).toEqual(['C'])
    expect(values('$.store.books[?(@.title == "B")].price')).toEqual([25])
    expect(values('$.store.books[?(@.title != "B")].price')).toEqual([10, 5])
  })

  it('filters on truthiness', () => {
    expect(values('$.store.books[?(@.active)].title')).toEqual(['A', 'C'])
  })

  it('filters with a regular expression', () => {
    expect(values('$.store.books[?(@.title =~ "^[AB]$")].price')).toEqual([10, 25])
  })

  it('returns an empty result rather than throwing for missing paths', () => {
    expect(queryJSON(data, '$.nothing.here').matches).toEqual([])
  })

  it('reports syntax errors', () => {
    expect(queryJSON(data, 'store.books').error).toBeTruthy()
    expect(queryJSON(data, '$[').error).toBeTruthy()
    expect(queryJSON(data, '').error).toBeTruthy()
  })

  it('respects the result limit', () => {
    const big = Array.from({ length: 100 }, (_, index) => index)
    expect(queryJSON(big, '$[*]', 10).matches).toHaveLength(10)
  })
})

describe('path helpers', () => {
  it('formats segments', () => {
    expect(formatPath([])).toBe('$')
    expect(formatPath(['a', 'b'])).toBe('$.a.b')
    expect(formatPath(['a', 0, 'b'])).toBe('$.a[0].b')
    expect(formatPath(['odd key'])).toBe("$['odd key']")
  })

  it('round-trips through parsePath', () => {
    for (const segments of [['a', 'b'], ['a', 0, 'b'], ['odd key', 2]] as Array<
      Array<string | number>
    >) {
      expect(parsePath(formatPath(segments))).toEqual(segments)
    }
  })

  it('adds the root prefix to raw editor paths', () => {
    expect(withRoot('')).toBe('$')
    expect(withRoot('user.name')).toBe('$.user.name')
    expect(withRoot('[0].name')).toBe('$[0].name')
    expect(withRoot('$.already')).toBe('$.already')
  })

  it('builds progressive breadcrumbs', () => {
    expect(breadcrumbFor('$.a[1].b')).toEqual([
      { label: '$', path: '$' },
      { label: 'a', path: '$.a' },
      { label: '[1]', path: '$.a[1]' },
      { label: 'b', path: '$.a[1].b' },
    ])
  })
})
