export interface DocumentStats {
  bytes: number
  lines: number
  characters: number
  nodes: number
  depth: number
  objects: number
  arrays: number
  keys: number
  strings: number
  numbers: number
  booleans: number
  nulls: number
  rootType: string
  largestArray: number
}

export const emptyStats: DocumentStats = {
  bytes: 0,
  lines: 0,
  characters: 0,
  nodes: 0,
  depth: 0,
  objects: 0,
  arrays: 0,
  keys: 0,
  strings: 0,
  numbers: 0,
  booleans: 0,
  nulls: 0,
  rootType: 'empty',
  largestArray: 0,
}

export function describeType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Walks the parsed document iteratively (an explicit stack, so deeply nested
 * documents cannot blow the call stack) and collects shape metrics.
 */
export function computeStats(text: string, data: unknown, parsed: boolean): DocumentStats {
  const stats: DocumentStats = {
    ...emptyStats,
    bytes: new TextEncoder().encode(text).length,
    characters: text.length,
    lines: text.length === 0 ? 0 : text.split('\n').length,
    rootType: text.trim() === '' ? 'empty' : parsed ? describeType(data) : 'invalid',
  }

  if (!parsed || text.trim() === '') return stats

  const stack: Array<{ value: unknown; depth: number }> = [{ value: data, depth: 1 }]

  while (stack.length > 0) {
    const { value, depth } = stack.pop()!
    stats.nodes++
    if (depth > stats.depth) stats.depth = depth

    if (value === null) {
      stats.nulls++
      continue
    }

    if (Array.isArray(value)) {
      stats.arrays++
      if (value.length > stats.largestArray) stats.largestArray = value.length
      for (const item of value) stack.push({ value: item, depth: depth + 1 })
      continue
    }

    switch (typeof value) {
      case 'object': {
        stats.objects++
        const entries = Object.keys(value as Record<string, unknown>)
        stats.keys += entries.length
        for (const key of entries) {
          stack.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 })
        }
        break
      }
      case 'string':
        stats.strings++
        break
      case 'number':
        stats.numbers++
        break
      case 'boolean':
        stats.booleans++
        break
      default:
        break
    }
  }

  return stats
}
