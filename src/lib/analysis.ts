import { type Node, type ParseError, parseTree, parse as parseJsonc } from 'jsonc-parser'
import { jsonrepair } from 'jsonrepair'

import { queryJSON } from '@/lib/jsonpath'
import {
  extractLineColumn,
  extractPosition,
  friendlyParseError,
  lineColumnAt,
} from '@/lib/parse-error'
import { formatPath, type PathSegment } from '@/lib/path'
import { findDuplicateKeys, formatText, minifyText, sortKeysText } from '@/lib/reformat'
import { computeStats } from '@/lib/stats'
import {
  REPAIR_PROBE_LIMIT,
  type AnalyzeResult,
  type MatchInfo,
  type QueryResultPayload,
  type SearchOptions,
  type SearchResultPayload,
  type TransformOp,
  type ValueKind,
} from '@/workers/protocol'

/**
 * Pure document analysis. Runs inside the worker in the browser, and directly on
 * the main thread when workers are unavailable (tests, very old browsers), so
 * there is exactly one implementation of each behaviour.
 */

const PREVIEW_LIMIT = 200

export function previewOf(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const quoted = JSON.stringify(value)
    return quoted.length > PREVIEW_LIMIT ? `${quoted.slice(0, PREVIEW_LIMIT)}…` : quoted
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  if (typeof value === 'object') return `{ ${Object.keys(value as object).length} keys }`
  return String(value)
}

export function kindOf(value: unknown): ValueKind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'object') return 'object'
  if (t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  return 'string'
}

/**
 * Duplicate detection is a nicety, not a verdict: if the concrete syntax tree
 * cannot be built (very deep nesting, for instance) the document is still valid.
 */
function safeDuplicateKeys(text: string): string[] {
  try {
    return findDuplicateKeys(text)
  } catch {
    return []
  }
}

/** First syntax-error offset according to jsonc-parser, when the engine gives none. */
function offsetFromParser(text: string): number | undefined {
  try {
    const errors: ParseError[] = []
    parseJsonc(text, errors, { allowTrailingComma: false })
    return errors.length > 0 ? errors[0].offset : undefined
  } catch {
    return undefined
  }
}

export function analyze(text: string): AnalyzeResult {
  if (text.trim() === '') {
    return {
      status: 'empty',
      error: null,
      canRepair: false,
      stats: computeStats(text, null, false),
      repairProbeSkipped: false,
      duplicateKeys: [],
    }
  }

  try {
    const data = JSON.parse(text)
    return {
      status: 'valid',
      error: null,
      canRepair: false,
      stats: computeStats(text, data, true),
      repairProbeSkipped: false,
      duplicateKeys: safeDuplicateKeys(text),
    }
  } catch (error) {
    const message = (error as Error).message
    /*
      V8 only includes a position for some messages: short documents produce the
      "... is not valid JSON" form with no location at all, which left the report
      without a line to jump to and no highlight in the gutter. jsonc-parser reports an
      offset for every syntax error, so fall back to that.
    */
    const position = extractPosition(message) ?? offsetFromParser(text)
    const fromMessage = extractLineColumn(message)
    const derived = position !== undefined ? lineColumnAt(text, position) : undefined

    const skipProbe = text.length > REPAIR_PROBE_LIMIT
    let canRepair = false
    if (!skipProbe) {
      try {
        JSON.parse(jsonrepair(text))
        canRepair = true
      } catch {
        canRepair = false
      }
    }

    return {
      status: 'invalid',
      error: {
        message,
        friendly: friendlyParseError(message, text, position),
        line: fromMessage.line ?? derived?.line,
        column: fromMessage.column ?? derived?.column,
        position,
      },
      canRepair,
      stats: computeStats(text, null, false),
      repairProbeSkipped: skipProbe,
      duplicateKeys: [],
    }
  }
}

interface Entry {
  segments: PathSegment[]
  key?: string
  kind: ValueKind
  preview: string
  /** primitive text used for value matching; undefined for containers */
  text?: string
  keyOffset?: number
  keyLength?: number
  valueOffset: number
  valueLength: number
}

function kindOfNode(node: Node): ValueKind {
  switch (node.type) {
    case 'object':
      return 'object'
    case 'array':
      return 'array'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    default:
      return 'string'
  }
}

function previewOfNode(node: Node): string {
  if (node.type === 'object') return `{ ${node.children?.length ?? 0} keys }`
  if (node.type === 'array') return `Array(${node.children?.length ?? 0})`
  return previewOf(node.value)
}

/**
 * Walks the concrete syntax tree once so every hit carries an exact source
 * offset. Values are never re-materialised, keeping this linear in document size.
 */
function collectEntries(text: string): Entry[] {
  const root = parseTree(text, [], { allowTrailingComma: true })
  const entries: Entry[] = []
  if (!root) return entries

  const stack: Array<{
    node: Node
    segments: PathSegment[]
    key?: { name: string; offset: number; length: number }
  }> = [{ node: root, segments: [] }]

  while (stack.length > 0) {
    const { node, segments, key } = stack.pop()!
    const kind = kindOfNode(node)

    entries.push({
      segments,
      key: key?.name,
      kind,
      preview: previewOfNode(node),
      text: kind === 'object' || kind === 'array' ? undefined : String(node.value),
      keyOffset: key?.offset,
      keyLength: key?.length,
      valueOffset: node.offset,
      valueLength: node.length,
    })

    if (node.type === 'object') {
      const properties = node.children ?? []
      for (let i = properties.length - 1; i >= 0; i--) {
        const [keyNode, valueNode] = properties[i].children ?? []
        if (!keyNode || !valueNode) continue
        stack.push({
          node: valueNode,
          segments: [...segments, String(keyNode.value)],
          key: { name: String(keyNode.value), offset: keyNode.offset, length: keyNode.length },
        })
      }
    } else if (node.type === 'array') {
      const items = node.children ?? []
      for (let i = items.length - 1; i >= 0; i--) {
        stack.push({ node: items[i], segments: [...segments, i] })
      }
    }
  }

  return entries
}

function buildMatcher(term: string, options: SearchOptions) {
  if (options.useRegex) {
    const regex = new RegExp(term, options.caseSensitive ? '' : 'i')
    return (candidate: string) => regex.test(candidate)
  }

  const needle = options.caseSensitive ? term : term.toLowerCase()
  if (options.wholeWord) {
    return (candidate: string) => {
      const haystack = options.caseSensitive ? candidate : candidate.toLowerCase()
      return haystack.split(/[^a-zA-Z0-9_]+/).some((word) => word === needle)
    }
  }
  return (candidate: string) => {
    const haystack = options.caseSensitive ? candidate : candidate.toLowerCase()
    return haystack.includes(needle)
  }
}

export function search(
  text: string,
  term: string,
  options: SearchOptions,
  limit = 500,
): SearchResultPayload {
  if (term.trim() === '' || text.trim() === '') {
    return { matches: [], total: 0, truncated: false }
  }

  let matcher: (candidate: string) => boolean
  try {
    matcher = buildMatcher(term, options)
  } catch {
    // Invalid regex while the user is still typing it.
    return { matches: [], total: 0, truncated: false }
  }

  const matches: MatchInfo[] = []
  let total = 0

  for (const entry of collectEntries(text)) {
    const canMatchKey = options.scope !== 'values' && entry.key !== undefined
    const canMatchValue = options.scope !== 'keys' && entry.text !== undefined

    if (canMatchKey && matcher(entry.key!)) {
      total++
      if (matches.length < limit) {
        matches.push({
          path: formatPath(entry.segments),
          key: entry.key,
          kind: entry.kind,
          preview: entry.preview,
          offset: entry.keyOffset,
          length: entry.keyLength,
          matchedIn: 'key',
        })
      }
      continue
    }

    if (canMatchValue && matcher(entry.text!)) {
      total++
      if (matches.length < limit) {
        matches.push({
          path: formatPath(entry.segments),
          key: entry.key,
          kind: entry.kind,
          preview: entry.preview,
          offset: entry.valueOffset,
          length: entry.valueLength,
          matchedIn: 'value',
        })
      }
    }
  }

  return { matches, total, truncated: total > matches.length }
}

export function runQuery(text: string, expression: string, limit = 500): QueryResultPayload {
  if (expression.trim() === '') return { matches: [], total: 0, truncated: false, error: null }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return {
      matches: [],
      total: 0,
      truncated: false,
      error: 'The document must be valid JSON before it can be queried.',
    }
  }

  const { matches, error } = queryJSON(data, expression, limit + 1)
  if (error) return { matches: [], total: 0, truncated: false, error }

  const truncated = matches.length > limit
  return {
    matches: matches.slice(0, limit).map((match) => ({
      path: match.path,
      kind: kindOf(match.value),
      preview: previewOf(match.value),
      matchedIn: 'value' as const,
    })),
    total: truncated ? matches.length - 1 : matches.length,
    truncated,
    error: null,
  }
}

export function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
  }
  return out
}

/**
 * Text transforms.
 *
 * All of these are source-preserving: numbers, strings and escapes are copied
 * from the original text rather than re-serialised, so a value can never change
 * as a side effect of formatting. See src/lib/reformat.ts.
 */
export function transform(text: string, op: TransformOp, indent: number): string {
  switch (op) {
    case 'format':
      return formatText(text, indent)
    case 'minify':
      return minifyText(text)
    case 'repair':
      // jsonrepair works on text and keeps literals intact; format the result.
      return formatText(jsonrepair(text), indent)
    case 'sortKeys':
    case 'formatSorted':
      return sortKeysText(text, indent)
    default:
      throw new Error(`Unknown transform: ${op as string}`)
  }
}

/** Key-sorted rendering for the diff view; invalid input is passed through. */
export function sortForDiff(text: string, indent: number): string {
  try {
    return sortKeysText(text, indent)
  } catch {
    return text
  }
}
