import { type Node, parseTree } from 'jsonc-parser'

/**
 * Source-preserving reformatting.
 *
 * `JSON.stringify(JSON.parse(text))` is the obvious way to format JSON and it is
 * quietly destructive: every number goes through a double. Formatting
 * `123456789012345678901234567890` rewrote it as `1.2345678901234568e+29`, and
 * `1.0`, `1e5` or `-0` were silently normalised too. For a tool whose whole job is
 * handling other people's JSON, that is data loss.
 *
 * These transforms therefore never re-serialise a value. They walk the concrete
 * syntax tree and copy every primitive back out of the original text byte for
 * byte, changing only whitespace and — for sortKeys — the order of members.
 */

export class ReformatError extends Error {}

function assertParsable(text: string): Node {
  const errors: Array<{ error: number; offset: number; length: number }> = []
  const tree = parseTree(text, errors, { allowTrailingComma: false })
  if (!tree || errors.length > 0) {
    // Let the caller surface the engine's own message, which is friendlier.
    JSON.parse(text)
    throw new ReformatError('Document could not be parsed')
  }
  return tree
}

/** Exact source text of a node, including its original number/string spelling. */
function literal(text: string, node: Node): string {
  return text.slice(node.offset, node.offset + node.length)
}

interface EmitOptions {
  indent: string
  newline: string
  space: string
  sortKeys: boolean
}

function emit(text: string, node: Node, depth: number, options: EmitOptions): string {
  const { indent, newline, space } = options

  if (node.type === 'object') {
    const properties = (node.children ?? []).filter((child) => (child.children?.length ?? 0) >= 2)
    if (properties.length === 0) return '{}'

    const entries = properties.map((property) => {
      const [keyNode, valueNode] = property.children!
      return { key: String(keyNode.value), keyNode, valueNode }
    })

    if (options.sortKeys) {
      entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    }

    const inner = entries
      .map(
        ({ keyNode, valueNode }) =>
          indent.repeat(depth + 1) +
          literal(text, keyNode) +
          ':' +
          space +
          emit(text, valueNode, depth + 1, options),
      )
      .join(',' + newline)

    return '{' + newline + inner + newline + indent.repeat(depth) + '}'
  }

  if (node.type === 'array') {
    const items = node.children ?? []
    if (items.length === 0) return '[]'
    const inner = items
      .map((item) => indent.repeat(depth + 1) + emit(text, item, depth + 1, options))
      .join(',' + newline)
    return '[' + newline + inner + newline + indent.repeat(depth) + ']'
  }

  // Strings, numbers, booleans and null are copied verbatim.
  return literal(text, node)
}

/** Pretty-prints with the given indent, preserving every literal exactly. */
export function formatText(text: string, indentWidth: number): string {
  const tree = assertParsable(text)
  return emit(text, tree, 0, {
    indent: ' '.repeat(Math.max(0, indentWidth)),
    newline: '\n',
    space: ' ',
    sortKeys: false,
  })
}

/** Strips all insignificant whitespace, preserving every literal exactly. */
export function minifyText(text: string): string {
  const tree = assertParsable(text)
  return emit(text, tree, 0, { indent: '', newline: '', space: '', sortKeys: false })
}

/** Sorts object members alphabetically at every level, preserving literals. */
export function sortKeysText(text: string, indentWidth: number): string {
  const tree = assertParsable(text)
  return emit(text, tree, 0, {
    indent: ' '.repeat(Math.max(0, indentWidth)),
    newline: '\n',
    space: ' ',
    sortKeys: true,
  })
}

/**
 * Object members whose key appears more than once at the same level.
 *
 * JSON.parse keeps only the last occurrence, silently discarding the earlier
 * values, so the document you see is not the data you get. Worth a warning.
 */
export function findDuplicateKeys(text: string, limit = 5): string[] {
  const tree = parseTree(text, [], { allowTrailingComma: true })
  if (!tree) return []

  const duplicates: string[] = []
  // Breadth-first with a cursor so duplicates are reported in document order.
  const queue: Node[] = [tree]
  let cursor = 0

  while (cursor < queue.length && duplicates.length < limit) {
    const node = queue[cursor++]
    if (node.type === 'object') {
      const seen = new Set<string>()
      for (const property of node.children ?? []) {
        const [keyNode, valueNode] = property.children ?? []
        if (!keyNode) continue
        const key = String(keyNode.value)
        if (seen.has(key) && !duplicates.includes(key)) duplicates.push(key)
        seen.add(key)
        if (valueNode) queue.push(valueNode)
      }
      continue
    }
    if (node.type === 'array') {
      for (const child of node.children ?? []) queue.push(child)
    }
  }

  return duplicates
}
