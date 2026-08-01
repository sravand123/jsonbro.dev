import { beforeEach, describe, expect, it } from 'vitest'

import { readWorkspace, writeWorkspace } from '@/lib/workspace'

/**
 * The static landing pages link into the app with `?w=`, so this parameter is a published
 * contract rather than an internal convenience. It has to win over the stored preference —
 * someone arriving from /json-diff/ wants the diff, not whatever they used last time.
 */
describe('readWorkspace', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('defaults to the editor with no preference and no parameter', () => {
    expect(readWorkspace()).toBe('editor')
  })

  it('uses the stored preference when there is no parameter', () => {
    writeWorkspace('tree')
    expect(readWorkspace()).toBe('tree')
  })

  it('lets the URL parameter override the stored preference', () => {
    writeWorkspace('tree')
    window.history.replaceState({}, '', '/?w=compare')
    expect(readWorkspace()).toBe('compare')
  })

  it('accepts the longer workspace parameter name', () => {
    window.history.replaceState({}, '', '/?workspace=query')
    expect(readWorkspace()).toBe('query')
  })

  it('ignores an unknown workspace and falls back to the preference', () => {
    writeWorkspace('tree')
    window.history.replaceState({}, '', '/?w=nonsense')
    expect(readWorkspace()).toBe('tree')
  })

  it('ignores an unknown workspace and falls back to the editor', () => {
    window.history.replaceState({}, '', '/?w=../etc/passwd')
    expect(readWorkspace()).toBe('editor')
  })
})
