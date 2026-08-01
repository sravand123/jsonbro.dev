/**
 * A small, dependency-free JSONPath evaluator.
 *
 * Supported syntax:
 *   $                      root
 *   .key / ['key']         child access
 *   [0] / [-1]             index access (negative counts from the end)
 *   [0:3] / [:2] / [1:]    slices
 *   [*] / .*               wildcard over arrays and objects
 *   ..key / ..*            recursive descent (descendant-or-self)
 *   [?(@.age > 30)]        filters with == != > >= < <= and =~ (regex)
 *   [?(@.flag)]            truthiness filter
 *
 * Filter semantics follow what people actually mean:
 *   $.team[?(@.active)]    selects the *members of* team that match
 *   $..[?(@.active)]       selects *any node anywhere* that matches, the root
 *                          included — "find everything where active is true"
 *
 * Deliberately not a full RFC 9535 implementation — it covers what people
 * actually type when exploring a document, and reports clear errors otherwise.
 */

export interface QueryMatch {
  path: string
  value: unknown
}

export interface QueryResult {
  matches: QueryMatch[]
  error: string | null
}

type Segment =
  | { kind: 'child'; name: string }
  | { kind: 'index'; index: number }
  | { kind: 'slice'; start: number | null; end: number | null }
  | { kind: 'wildcard' }
  | { kind: 'descend' }
  | { kind: 'filter'; expr: FilterExpr }
  /** Filter applied to the nodes themselves, used straight after a descent. */
  | { kind: 'filterSelf'; expr: FilterExpr }

interface FilterExpr {
  left: string[]
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | '=~' | 'truthy'
  right?: unknown
}

function joinPath(base: string, segment: string | number): string {
  if (typeof segment === 'number') return `${base}[${segment}]`
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)) return base === '' ? segment : `${base}.${segment}`
  return `${base}['${segment}']`
}

function parseLiteral(raw: string): unknown {
  const token = raw.trim()
  if (token === 'true') return true
  if (token === 'false') return false
  if (token === 'null') return null
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) return Number(token)
  if (
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1)
  }
  return token
}

function parseFilter(body: string): FilterExpr {
  const match = body.match(/^\s*@((?:\.[\w$]+|\['[^']*'\])*)\s*(==|!=|>=|<=|>|<|=~)?\s*(.*)$/)
  if (!match) throw new Error(`Unsupported filter: ${body}`)

  const [, pathPart, op, rightRaw] = match
  const left = Array.from(pathPart.matchAll(/\.([\w$]+)|\['([^']*)'\]/g)).map(
    (m) => m[1] ?? m[2],
  )

  if (!op) return { left, op: 'truthy' }
  return { left, op: op as FilterExpr['op'], right: parseLiteral(rightRaw) }
}

function tokenize(path: string): Segment[] {
  let cursor = 0
  const segments: Segment[] = []
  const trimmed = path.trim()
  // Whether the segment we are about to read directly follows `..`.
  let afterDescend = false

  if (trimmed === '') throw new Error('Empty query')

  if (trimmed[0] === '$') cursor = 1
  else if (trimmed[0] !== '.' && trimmed[0] !== '[') throw new Error('Query must start with $')

  while (cursor < trimmed.length) {
    const char = trimmed[cursor]

    if (char === '.') {
      if (trimmed[cursor + 1] === '.') {
        cursor += 2
        // `..` is descendant-or-self: the node itself plus every node beneath it.
        // The segment that follows then applies to that whole set, which is what
        // makes `$..key`, `$..*` and `$..[?(...)]` all work from one rule.
        segments.push({ kind: 'descend' })
        afterDescend = true
        if (trimmed[cursor] === '*') {
          segments.push({ kind: 'wildcard' })
          afterDescend = false
          cursor += 1
          continue
        }
        if (trimmed[cursor] === '[') continue
        const nameMatch = trimmed.slice(cursor).match(/^[\w$]+/)
        if (!nameMatch) throw new Error('Expected a property name after ".."')
        segments.push({ kind: 'child', name: nameMatch[0] })
        afterDescend = false
        cursor += nameMatch[0].length
        continue
      }

      cursor += 1
      if (trimmed[cursor] === '*') {
        segments.push({ kind: 'wildcard' })
        afterDescend = false
        cursor += 1
        continue
      }
      const nameMatch = trimmed.slice(cursor).match(/^[\w$]+/)
      if (!nameMatch) throw new Error('Expected a property name after "."')
      segments.push({ kind: 'child', name: nameMatch[0] })
      afterDescend = false
      cursor += nameMatch[0].length
      continue
    }

    if (char === '[') {
      const close = findClosingBracket(trimmed, cursor)
      const body = trimmed.slice(cursor + 1, close).trim()
      const followsDescend = afterDescend
      afterDescend = false
      cursor = close + 1

      if (body === '*') {
        segments.push({ kind: 'wildcard' })
        continue
      }
      if (body.startsWith('?')) {
        const inner = body.replace(/^\?\s*\(?/, '').replace(/\)$/, '')
        const expr = parseFilter(inner)
        // `$..[?(...)]` reads as "any node that matches"; `$.team[?(...)]` reads as
        // "the members of team that match".
        segments.push(followsDescend ? { kind: 'filterSelf', expr } : { kind: 'filter', expr })
        continue
      }
      if (
        (body.startsWith("'") && body.endsWith("'")) ||
        (body.startsWith('"') && body.endsWith('"'))
      ) {
        segments.push({ kind: 'child', name: body.slice(1, -1) })
        continue
      }
      if (body.includes(':')) {
        const [rawStart, rawEnd] = body.split(':')
        segments.push({
          kind: 'slice',
          start: rawStart.trim() === '' ? null : Number(rawStart),
          end: rawEnd?.trim() === '' || rawEnd === undefined ? null : Number(rawEnd),
        })
        continue
      }
      if (/^-?\d+$/.test(body)) {
        segments.push({ kind: 'index', index: Number(body) })
        continue
      }
      throw new Error(`Unsupported bracket expression: [${body}]`)
    }

    throw new Error(`Unexpected character "${char}" at position ${cursor}`)
  }

  return segments
}

function findClosingBracket(text: string, openIndex: number): number {
  let depth = 0
  let inQuote: string | null = null
  for (let i = openIndex; i < text.length; i++) {
    const char = text[i]
    if (inQuote) {
      if (char === inQuote) inQuote = null
      continue
    }
    if (char === "'" || char === '"') {
      inQuote = char
      continue
    }
    if (char === '[') depth++
    if (char === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error('Unbalanced "[" in query')
}

function resolveRelative(value: unknown, keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function matchesFilter(value: unknown, expr: FilterExpr): boolean {
  const target = expr.left.length === 0 ? value : resolveRelative(value, expr.left)

  switch (expr.op) {
    case 'truthy':
      return Boolean(target)
    case '==':
      return target === expr.right
    case '!=':
      return target !== expr.right
    case '>':
      return typeof target === 'number' && typeof expr.right === 'number' && target > expr.right
    case '>=':
      return typeof target === 'number' && typeof expr.right === 'number' && target >= expr.right
    case '<':
      return typeof target === 'number' && typeof expr.right === 'number' && target < expr.right
    case '<=':
      return typeof target === 'number' && typeof expr.right === 'number' && target <= expr.right
    case '=~':
      try {
        return typeof target === 'string' && new RegExp(String(expr.right)).test(target)
      } catch {
        return false
      }
    default:
      return false
  }
}

/** Pushes `node` and every node beneath it, in document order. */
function collectDescendantOrSelf(node: QueryMatch, sink: QueryMatch[]) {
  sink.push(node)
  const value = node.value
  if (value === null || typeof value !== 'object') return

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectDescendantOrSelf({ path: joinPath(node.path, index), value: item }, sink)
    })
    return
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    collectDescendantOrSelf(
      { path: joinPath(node.path, key), value: (value as Record<string, unknown>)[key] },
      sink,
    )
  }
}

export function queryJSON(data: unknown, query: string, limit = 5000): QueryResult {
  let segments: Segment[]
  try {
    segments = tokenize(query)
  } catch (error) {
    return { matches: [], error: (error as Error).message }
  }

  let current: QueryMatch[] = [{ path: '$', value: data }]

  for (const segment of segments) {
    const next: QueryMatch[] = []

    for (const node of current) {
      const value = node.value

      switch (segment.kind) {
        case 'child': {
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            if (segment.name in (value as Record<string, unknown>)) {
              next.push({
                path: joinPath(node.path === '$' ? '$' : node.path, segment.name),
                value: (value as Record<string, unknown>)[segment.name],
              })
            }
          } else if (Array.isArray(value)) {
            // Convenience: `.key` over an array maps across its elements.
            value.forEach((item, index) => {
              if (item !== null && typeof item === 'object' && segment.name in (item as object)) {
                next.push({
                  path: joinPath(joinPath(node.path, index), segment.name),
                  value: (item as Record<string, unknown>)[segment.name],
                })
              }
            })
          }
          break
        }
        case 'index': {
          if (Array.isArray(value)) {
            const index = segment.index < 0 ? value.length + segment.index : segment.index
            if (index >= 0 && index < value.length) {
              next.push({ path: joinPath(node.path, index), value: value[index] })
            }
          }
          break
        }
        case 'slice': {
          if (Array.isArray(value)) {
            const start = segment.start === null ? 0 : segment.start
            const end = segment.end === null ? value.length : segment.end
            const from = start < 0 ? Math.max(0, value.length + start) : start
            const to = end < 0 ? value.length + end : Math.min(end, value.length)
            for (let i = from; i < to; i++) {
              next.push({ path: joinPath(node.path, i), value: value[i] })
            }
          }
          break
        }
        case 'wildcard': {
          if (Array.isArray(value)) {
            value.forEach((item, index) =>
              next.push({ path: joinPath(node.path, index), value: item }),
            )
          } else if (value !== null && typeof value === 'object') {
            for (const key of Object.keys(value as Record<string, unknown>)) {
              next.push({
                path: joinPath(node.path, key),
                value: (value as Record<string, unknown>)[key],
              })
            }
          }
          break
        }
        case 'descend': {
          collectDescendantOrSelf(node, next)
          break
        }
        case 'filterSelf': {
          if (matchesFilter(value, segment.expr)) next.push(node)
          break
        }
        case 'filter': {
          if (Array.isArray(value)) {
            value.forEach((item, index) => {
              if (matchesFilter(item, segment.expr)) {
                next.push({ path: joinPath(node.path, index), value: item })
              }
            })
          } else if (value !== null && typeof value === 'object') {
            for (const key of Object.keys(value as Record<string, unknown>)) {
              const item = (value as Record<string, unknown>)[key]
              if (matchesFilter(item, segment.expr)) {
                next.push({ path: joinPath(node.path, key), value: item })
              }
            }
          }
          break
        }
      }
    }

    /*
      Two routes can legitimately reach the same node — `$..title` finds a book's
      title both through the book object and through the `.key`-over-an-array
      convenience. They produce identical paths, so collapsing on path keeps the
      convenience without ever reporting a node twice.
    */
    const seen = new Set<string>()
    const deduped: QueryMatch[] = []
    for (const match of next) {
      if (seen.has(match.path)) continue
      seen.add(match.path)
      deduped.push(match)
      if (deduped.length >= limit) break
    }

    current = deduped
    if (current.length === 0) break
  }

  return { matches: current, error: null }
}
