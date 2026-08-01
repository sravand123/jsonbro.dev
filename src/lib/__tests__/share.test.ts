import { beforeEach, describe, expect, it } from 'vitest'

import { buildShareUrl, consumeSharedDocument } from '@/lib/share'

describe('shareable links', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('refuses to build a link for an empty document', async () => {
    const result = await buildShareUrl('   ')
    expect(result.url).toBeNull()
    expect(result.reason).toBeTruthy()
  })

  it('round-trips a document through the URL fragment', async () => {
    const document = JSON.stringify({ hello: 'world', items: [1, 2, 3] }, null, 2)
    const { url } = await buildShareUrl(document)
    expect(url).toBeTruthy()

    // The payload lives in the fragment, which browsers never send to a server.
    const [, fragment] = url!.split('#')
    expect(fragment.startsWith('doc=')).toBe(true)
    expect(url).not.toContain(encodeURIComponent('hello'))

    window.location.hash = `#${fragment}`
    expect(await consumeSharedDocument()).toBe(document)
  })

  it('clears the fragment after consuming it', async () => {
    const { url } = await buildShareUrl('{"a":1}')
    window.location.hash = `#${url!.split('#')[1]}`
    await consumeSharedDocument()
    expect(window.location.hash).toBe('')
  })

  it('returns null when there is no shared document', async () => {
    expect(await consumeSharedDocument()).toBeNull()
  })

  it('ignores a corrupted payload instead of throwing', async () => {
    window.location.hash = '#doc=not-a-valid-payload!!'
    await expect(consumeSharedDocument()).resolves.toBeNull()
  })

  it('refuses documents that will not fit in a link', async () => {
    // Random-ish content so compression cannot shrink it below the limit.
    const huge = JSON.stringify(
      Array.from({ length: 20_000 }, (_, index) => `${index}-${Math.sin(index)}`),
    )
    const result = await buildShareUrl(huge)
    expect(result.url).toBeNull()
    expect(result.reason).toMatch(/too large/i)
  })
})
