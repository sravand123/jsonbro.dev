import { get, set } from 'idb-keyval'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useRootFontSize } from '@/hooks/useRootFontSize'

export interface EditorSettings {
  tabSize: number
  /** 'auto' scales with viewport width, matching the previous behaviour */
  fontSize: number | 'auto'
  lineHeight: number
  wordWrap: boolean
  minimap: boolean
  lineNumbers: boolean
  bracketPairGuides: boolean
  formatOnPaste: boolean
  fontLigatures: boolean
  renderWhitespace: boolean
  stickyScroll: boolean
}

export const defaultSettings: EditorSettings = {
  tabSize: 2,
  fontSize: 'auto',
  lineHeight: 1.5,
  wordWrap: true,
  minimap: true,
  lineNumbers: true,
  bracketPairGuides: true,
  formatOnPaste: true,
  fontLigatures: true,
  renderWhitespace: false,
  // Sticky scroll pops in and out as the caret moves, which reads as jitter.
  // Available in Settings for anyone who wants it.
  stickyScroll: false,
}

/** Keeps the original key so existing users keep their saved preferences. */
const SETTINGS_KEY = 'json-viewer-settings'

/**
 * Automatic editor font size.
 *
 * A fixed proportion of the interface scale (see the clamp on `html`), so code and
 * chrome grow together: 13px on a 1512px laptop, ~26px at half zoom, ~52px at quarter zoom. 0.82 of the root keeps code slightly denser than UI text, as editors
 * conventionally do. Anyone who wants a fixed size regardless of display can choose
 * one in Settings, which bypasses this entirely.
 */
export function fontSizeForRoot(rootPx: number): number {
  // Bounds mirror the root's own so the ratio holds from 25% zoom through 150%.
  return Math.max(9, Math.min(60, Math.round(rootPx * 0.82)))
}

export function resolveFontSize(fontSize: number | 'auto', rootPx = 16): number {
  if (fontSize !== 'auto') return fontSize
  return fontSizeForRoot(rootPx)
}

export function useEditorSettings() {
  const [settings, setSettings] = useState<EditorSettings>(defaultSettings)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stored = await get(SETTINGS_KEY)
        if (!cancelled && stored) {
          const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
          // Merge so settings added after a user last saved still get defaults.
          setSettings({ ...defaultSettings, ...parsed })
        }
      } catch {
        // Ignore unreadable settings and keep defaults.
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    void set(SETTINGS_KEY, settings).catch(() => {})
  }, [settings, loaded])

  const update = useCallback((patch: Partial<EditorSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  const reset = useCallback(() => setSettings(defaultSettings), [])

  // Auto sizing tracks the interface scale, which itself tracks viewport and zoom.
  const rootPx = useRootFontSize()

  const effectiveFontSize = useMemo(() => {
    if (settings.fontSize !== 'auto') return settings.fontSize
    return fontSizeForRoot(rootPx)
  }, [settings.fontSize, rootPx])

  return { settings, update, reset, loaded, effectiveFontSize, rootPx }
}
