/// <reference lib="webworker" />
import { analyze, runQuery, search, sortForDiff, transform } from '@/lib/analysis'
import type { WorkerRequest, WorkerResponse } from './protocol'

/**
 * Thin dispatcher. All behaviour lives in src/lib/analysis.ts so the same code
 * runs on the main thread when workers are unavailable.
 */
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  const reply = (response: WorkerResponse) => self.postMessage(response)

  try {
    switch (request.type) {
      case 'analyze':
        reply({ id: request.id, ok: true, type: 'analyze', result: analyze(request.text) })
        break
      case 'search':
        reply({
          id: request.id,
          ok: true,
          type: 'search',
          result: search(request.text, request.term, request.options, request.limit),
        })
        break
      case 'transform':
        reply({
          id: request.id,
          ok: true,
          type: 'transform',
          result: transform(request.text, request.op, request.indent),
        })
        break
      case 'query':
        reply({
          id: request.id,
          ok: true,
          type: 'query',
          result: runQuery(request.text, request.expression, request.limit),
        })
        break
      case 'sortForDiff':
        reply({
          id: request.id,
          ok: true,
          type: 'sortForDiff',
          result: sortForDiff(request.text, request.indent),
        })
        break
    }
  } catch (error) {
    reply({ id: request.id, ok: false, type: request.type, error: (error as Error).message })
  }
}
