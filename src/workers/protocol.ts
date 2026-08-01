import type { DocumentStats } from '@/lib/stats'

export type ValidationStatus = 'valid' | 'invalid' | 'empty'

export interface ParseErrorInfo {
  message: string
  friendly: string
  line?: number
  column?: number
  position?: number
}

export interface AnalyzeResult {
  status: ValidationStatus
  error: ParseErrorInfo | null
  canRepair: boolean
  stats: DocumentStats
  /** true when the document was too large for the repair probe */
  repairProbeSkipped: boolean
  /**
   * Keys that appear more than once in the same object. JSON.parse keeps only the
   * last one, so the parsed data differs from what is on screen.
   */
  duplicateKeys: string[]
}

export type ValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export interface MatchInfo {
  path: string
  key?: string
  kind: ValueKind
  preview: string
  /** where the key/value appears in the source text, when locatable */
  offset?: number
  length?: number
  matchedIn: 'key' | 'value'
}

export interface SearchResultPayload {
  matches: MatchInfo[]
  total: number
  truncated: boolean
}

export interface QueryResultPayload {
  matches: MatchInfo[]
  total: number
  truncated: boolean
  error: string | null
}

export type TransformOp = 'format' | 'minify' | 'repair' | 'sortKeys' | 'formatSorted'

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  scope: 'both' | 'keys' | 'values'
}

export type WorkerRequest =
  | { id: number; type: 'analyze'; text: string }
  | {
      id: number
      type: 'search'
      text: string
      term: string
      options: SearchOptions
      limit: number
    }
  | { id: number; type: 'transform'; text: string; op: TransformOp; indent: number }
  | { id: number; type: 'query'; text: string; expression: string; limit: number }
  | { id: number; type: 'sortForDiff'; text: string; indent: number }

export type WorkerResponse =
  | { id: number; ok: true; type: 'analyze'; result: AnalyzeResult }
  | { id: number; ok: true; type: 'search'; result: SearchResultPayload }
  | { id: number; ok: true; type: 'transform'; result: string }
  | { id: number; ok: true; type: 'query'; result: QueryResultPayload }
  | { id: number; ok: true; type: 'sortForDiff'; result: string }
  | { id: number; ok: false; type: WorkerRequest['type']; error: string }

/** Documents above this size skip the jsonrepair probe, which is O(n) but costly. */
export const REPAIR_PROBE_LIMIT = 2 * 1024 * 1024

/** Above this size the editor stops auto-formatting on paste and warns instead. */
export const LARGE_DOCUMENT_LIMIT = 3 * 1024 * 1024
