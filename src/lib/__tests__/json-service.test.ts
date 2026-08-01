import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The worker transport must never leave a promise unsettled: a pending request is
 * a spinner that never stops. Two ways that used to happen:
 *
 *   1. React StrictMode runs effect cleanups on a throwaway first mount in
 *      development, which disposed the worker while the memoised service lived on.
 *      Every later request hung and the UI sat on "Checking…" / "Searching…".
 *   2. A worker that dies silently (out of memory on a huge document) never sends
 *      a message and never fires `error`.
 */

class FakeWorker {
  static instances: FakeWorker[] = []
  static mode: 'echo' | 'silent' = 'echo'

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  posted: unknown[] = []

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(request: { id: number; type: string; text: string }) {
    this.posted.push(request)
    if (FakeWorker.mode === 'silent') return
    // Answer asynchronously, like a real worker.
    setTimeout(() => {
      if (this.terminated) return
      this.onmessage?.({
        data: {
          id: request.id,
          ok: true,
          type: request.type,
          result: {
            status: 'valid',
            error: null,
            canRepair: false,
            repairProbeSkipped: false,
            stats: { bytes: 999, nodes: 1, rootType: 'object' },
          },
        },
      } as MessageEvent)
    }, 0)
  }

  terminate() {
    this.terminated = true
  }
}

let createJsonService: typeof import('@/lib/json-service').createJsonService

beforeEach(async () => {
  FakeWorker.instances = []
  FakeWorker.mode = 'echo'
  vi.stubGlobal('Worker', FakeWorker)
  vi.resetModules()
  createJsonService = (await import('@/lib/json-service')).createJsonService
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('json service worker transport', () => {
  it('uses a worker when one is available', async () => {
    const service = createJsonService()
    const result = await service.analyze('{"a":1}')
    expect(service.usingWorker).toBe(true)
    expect(result.stats.bytes).toBe(999)
    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('respawns after dispose instead of hanging forever', async () => {
    const service = createJsonService()
    await service.analyze('{"a":1}')

    // Equivalent to StrictMode's throwaway-mount cleanup.
    service.dispose()
    expect(FakeWorker.instances[0].terminated).toBe(true)

    const result = await service.analyze('{"b":2}')
    expect(result.stats.bytes).toBe(999)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('rejects in-flight requests when the worker errors, and recovers', async () => {
    FakeWorker.mode = 'silent'
    const service = createJsonService()
    const inFlight = service.analyze('{"a":1}')

    FakeWorker.instances[0].onerror?.({ message: 'boom' })
    await expect(inFlight).rejects.toThrow(/boom/)

    FakeWorker.mode = 'echo'
    await expect(service.analyze('{"a":1}')).resolves.toMatchObject({ status: 'valid' })
  })

  it('answers on the main thread when the worker goes silent', async () => {
    vi.useFakeTimers()
    FakeWorker.mode = 'silent'
    const service = createJsonService()

    const pending = service.analyze('{"a":1}')
    await vi.advanceTimersByTimeAsync(61_000)

    // Real analysis of the document, produced inline rather than left unsettled.
    const result = await pending
    expect(result.status).toBe('valid')
    expect(result.stats.bytes).toBe(7)
    expect(FakeWorker.instances[0].terminated).toBe(true)
  })

  it('falls back to inline execution when workers do not exist at all', async () => {
    vi.stubGlobal('Worker', undefined)
    vi.resetModules()
    const { createJsonService: create } = await import('@/lib/json-service')
    const service = create()
    expect(service.usingWorker).toBe(false)
    await expect(service.analyze('{"a":1}')).resolves.toMatchObject({ status: 'valid' })
  })
})
