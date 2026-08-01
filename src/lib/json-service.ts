import JsonWorker from '@/workers/json.worker?worker'
import type {
  AnalyzeResult,
  QueryResultPayload,
  SearchOptions,
  SearchResultPayload,
  TransformOp,
  WorkerRequest,
  WorkerResponse,
} from '@/workers/protocol'
import { analyze, runQuery, search, sortForDiff, transform } from './analysis'

/**
 * Async facade over document analysis.
 *
 * Uses a Web Worker when the environment provides one, and falls back to running
 * the identical pure functions on the main thread otherwise (jsdom in tests,
 * or a hardened browser that blocks workers). Callers never need to care.
 */
/** Distributive omit so each request variant keeps its own fields. */
type PendingRequest = WorkerRequest extends infer Variant
  ? Variant extends { id: number }
    ? Omit<Variant, 'id'>
    : never
  : never

export interface JsonService {
  analyze(text: string): Promise<AnalyzeResult>
  search(
    text: string,
    term: string,
    options: SearchOptions,
    limit?: number,
  ): Promise<SearchResultPayload>
  transform(text: string, op: TransformOp, indent: number): Promise<string>
  query(text: string, expression: string, limit?: number): Promise<QueryResultPayload>
  sortForDiff(text: string, indent: number): Promise<string>
  dispose(): void
  readonly usingWorker: boolean
}

function createInlineService(): JsonService {
  return {
    async analyze(text) {
      return analyze(text)
    },
    async search(text, term, options, limit = 500) {
      return search(text, term, options, limit)
    },
    async transform(text, op, indent) {
      return transform(text, op, indent)
    },
    async query(text, expression, limit = 500) {
      return runQuery(text, expression, limit)
    },
    async sortForDiff(text, indent) {
      return sortForDiff(text, indent)
    },
    dispose() {},
    usingWorker: false,
  }
}

/**
 * Upper bound on how long we wait for the worker before answering on the main
 * thread instead. Scaled by document size so a genuinely large parse is not
 * mistaken for a wedged worker.
 */
function timeoutFor(text: string): number {
  return Math.min(60_000, 8_000 + (text.length / (1024 * 1024)) * 2_000)
}

function createWorkerService(): JsonService {
  let worker: Worker | null = null
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (value: never) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }
  >()

  function settleAll(error: Error) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  function recycle() {
    if (!worker) return
    worker.onmessage = null
    worker.onerror = null
    worker.terminate()
    worker = null
  }

  /**
   * Spawned on demand rather than once up front.
   *
   * React StrictMode runs effect cleanups on a throwaway first mount in
   * development, which used to terminate the worker while the memoised service
   * lived on — every later request then hung forever and the UI sat on
   * "Checking…" and "Searching…". Recreating on demand makes that impossible.
   */
  function ensureWorker(): Worker {
    if (worker) return worker
    const instance = new JsonWorker()

    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response: WorkerResponse = event.data
      const entry = pending.get(response.id)
      if (!entry) return
      pending.delete(response.id)
      clearTimeout(entry.timer)
      if (response.ok === true) entry.resolve(response.result as never)
      else entry.reject(new Error(response.error))
    }

    instance.onerror = (event) => {
      recycle()
      settleAll(new Error(event.message || 'JSON worker failed'))
    }

    instance.onmessageerror = () => {
      recycle()
      settleAll(new Error('JSON worker sent a message that could not be read'))
    }

    worker = instance
    return instance
  }

  /** Runs in the worker, falling back to the main thread if it does not answer. */
  function send<T>(request: PendingRequest, inline: () => T, sizeHint: string): Promise<T> {
    let instance: Worker
    try {
      instance = ensureWorker()
    } catch {
      return Promise.resolve(inline())
    }

    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        // The worker is wedged or gone: replace it and answer synchronously so the
        // interface never waits on a promise that will not settle.
        recycle()
        try {
          resolve(inline())
        } catch (error) {
          reject(error as Error)
        }
      }, timeoutFor(sizeHint))

      pending.set(id, {
        resolve: resolve as (value: never) => void,
        reject,
        timer,
      })

      try {
        instance.postMessage({ ...request, id } as WorkerRequest)
      } catch (error) {
        pending.delete(id)
        clearTimeout(timer)
        recycle()
        try {
          resolve(inline())
        } catch {
          reject(error as Error)
        }
      }
    })
  }

  return {
    analyze: (text) => send<AnalyzeResult>({ type: 'analyze', text }, () => analyze(text), text),
    search: (text, term, options, limit = 500) =>
      send<SearchResultPayload>(
        { type: 'search', text, term, options, limit },
        () => search(text, term, options, limit),
        text,
      ),
    transform: (text, op, indent) =>
      send<string>({ type: 'transform', text, op, indent }, () => transform(text, op, indent), text),
    query: (text, expression, limit = 500) =>
      send<QueryResultPayload>(
        { type: 'query', text, expression, limit },
        () => runQuery(text, expression, limit),
        text,
      ),
    sortForDiff: (text, indent) =>
      send<string>({ type: 'sortForDiff', text, indent }, () => sortForDiff(text, indent), text),
    dispose() {
      recycle()
      settleAll(new Error('JSON worker disposed'))
    },
    usingWorker: true,
  }
}

export function createJsonService(): JsonService {
  if (typeof Worker === 'undefined') return createInlineService()
  try {
    return createWorkerService()
  } catch {
    return createInlineService()
  }
}
