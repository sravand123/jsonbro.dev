import { describe, expect, it } from 'vitest'

import { monaco, setupMonaco } from '@/lib/monaco/setup'
import { THEME_DARK, THEME_LIGHT } from '@/lib/monaco/theme'
import { computeSyntaxMarkers } from '@/lib/monaco/validate'

/**
 * Monaco is imported through trimmed ESM entry points to keep the bundle small.
 * These tests guard the things that silently break when those imports are wrong:
 * the JSON language disappearing, tokenization falling back to plain text, or
 * our themes not being registered.
 */
describe('monaco setup', () => {
  it('registers the JSON language', () => {
    setupMonaco()
    const ids = monaco.languages.getLanguages().map((language) => language.id)
    expect(ids).toContain('json')
  })

  it('tokenizes JSON into distinct token classes', async () => {
    setupMonaco()

    // The JSON mode (and its tokenizer) is loaded lazily the first time a model
    // uses the language, exactly as it is in the app.
    const model = monaco.editor.createModel('{"key": 12}', 'json')
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      const probe = await monaco.editor.colorize('{"key": 12, "flag": true}', 'json', {})
      const probeClasses = new Set(
        Array.from(probe.matchAll(/class="([^"]+)"/g)).map((match) => match[1]),
      )
      if (probeClasses.size > 1) {
        model.dispose()
        expect(probeClasses.size).toBeGreaterThan(1)
        return
      }
    }
    model.dispose()
    throw new Error('JSON tokenizer never became available')
  })

  it('exposes the editor core APIs the app relies on', () => {
    setupMonaco()
    expect(typeof monaco.editor.create).toBe('function')
    expect(typeof monaco.editor.createDiffEditor).toBe('function')
    expect(typeof monaco.editor.setModelMarkers).toBe('function')
    expect(monaco.editor.ScrollType.Smooth).toBeDefined()
    expect(monaco.editor.OverviewRulerLane.Center).toBeDefined()
    expect(monaco.KeyMod.CtrlCmd).toBeDefined()
    expect(monaco.KeyCode.KeyD).toBeDefined()
  })

  it('registers both custom themes without throwing', () => {
    setupMonaco()
    expect(() => monaco.editor.setTheme(THEME_DARK)).not.toThrow()
    expect(() => monaco.editor.setTheme(THEME_LIGHT)).not.toThrow()
  })

  it('produces a friendly marker for a missing comma', () => {
    setupMonaco()
    const model = monaco.editor.createModel('{\n  "a": 1\n  "b": 2\n}', 'json')
    const markers = computeSyntaxMarkers(monaco, model)
    expect(markers.length).toBeGreaterThan(0)
    expect(markers[0].message).toContain('Missing comma')
    // The marker blames the previous line, where the comma actually belongs.
    expect(markers[0].startLineNumber).toBe(2)
    model.dispose()
  })

  it('reports no markers for valid JSON', () => {
    setupMonaco()
    const model = monaco.editor.createModel('{"a": [1, 2, {"b": null}]}', 'json')
    expect(computeSyntaxMarkers(monaco, model)).toHaveLength(0)
    model.dispose()
  })
})
