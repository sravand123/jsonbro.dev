import { del, get, set } from 'idb-keyval'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { JsonService } from '@/lib/json-service'
import { emptyStats } from '@/lib/stats'
import type { AnalyzeResult, TransformOp } from '@/workers/protocol'

export const idleAnalysis: AnalyzeResult = {
  status: 'empty',
  error: null,
  canRepair: false,
  stats: emptyStats,
  repairProbeSkipped: false,
  duplicateKeys: [],
}

interface Options {
  service: JsonService
  /** IndexedDB key; omit to disable persistence */
  storageKey?: string
  indent: number
  /** pause persistence (e.g. compare panes while in single-document mode) */
  persist?: boolean
  debounceMs?: number
}

/**
 * Size metrics computed synchronously so the status bar reflects the document as
 * you type. Node counts still come from the worker; these are the cheap ones.
 * TextEncoder is skipped past a threshold, where scanning every keystroke would
 * cost more than the precision is worth.
 */
const EXACT_BYTES_LIMIT = 2 * 1024 * 1024

function localMetrics(text: string) {
  const characters = text.length
  const lines = characters === 0 ? 0 : text.split('\n').length
  const bytes =
    characters === 0
      ? 0
      : characters <= EXACT_BYTES_LIMIT
        ? new TextEncoder().encode(text).length
        : // Close enough for a status bar, and O(1) instead of O(n).
          Math.round(characters * 1.02)
  return { characters, lines, bytes }
}

export interface JsonDocument {
  text: string
  setText: (next: string) => void
  analysis: AnalyzeResult
  analyzing: boolean
  restoring: boolean
  busy: TransformOp | null
  /** true when a previous value can be restored after a destructive action */
  canUndo: boolean
  apply: (op: TransformOp) => Promise<boolean>
  clear: () => void
  undo: () => void
  replace: (next: string, options?: { snapshot?: boolean }) => void
}

/**
 * One JSON document: its text, its analysis, its transforms and its persistence.
 * Used three times over (main editor plus both compare panes), which is what
 * removed the triplicated state from the old 1,500-line component.
 */
export function useJsonDocument({
  service,
  storageKey,
  indent,
  persist = true,
  debounceMs = 90,
}: Options): JsonDocument {
  const [text, setTextState] = useState('')
  const [analysis, setAnalysis] = useState<AnalyzeResult>(idleAnalysis)
  const [analyzing, setAnalyzing] = useState(false)
  const [restoring, setRestoring] = useState(Boolean(storageKey))
  const [busy, setBusy] = useState<TransformOp | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)

  const requestSeq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore persisted content.
  useEffect(() => {
    if (!storageKey) return
    let cancelled = false
    ;(async () => {
      try {
        const stored = await get(storageKey)
        if (!cancelled && typeof stored === 'string' && stored.length > 0) {
          setTextState(stored)
        }
      } catch {
        // Ignore restore failures; an empty editor is a safe fallback.
      } finally {
        if (!cancelled) setRestoring(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storageKey])

  // Persist content.
  useEffect(() => {
    if (!storageKey || restoring || !persist) return
    void set(storageKey, text).catch(() => {})
  }, [text, storageKey, restoring, persist])

  // Debounced analysis, always applying only the newest result.
  useEffect(() => {
    if (restoring) return

    if (text.trim() === '') {
      setAnalysis(idleAnalysis)
      setAnalyzing(false)
      return
    }

    setAnalyzing(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const seq = ++requestSeq.current
      service
        .analyze(text)
        .then((result) => {
          if (seq !== requestSeq.current) return
          setAnalysis(result)
        })
        .catch(() => {
          if (seq !== requestSeq.current) return
          setAnalysis(idleAnalysis)
        })
        .finally(() => {
          if (seq === requestSeq.current) setAnalyzing(false)
        })
    }, debounceMs)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [text, service, restoring, debounceMs])

  const setText = useCallback((next: string) => setTextState(next), [])

  const replace = useCallback(
    (next: string, options?: { snapshot?: boolean }) => {
      if (options?.snapshot !== false) setSnapshot(text)
      setTextState(next)
    },
    [text],
  )

  const apply = useCallback(
    async (op: TransformOp) => {
      if (text.trim() === '') return false
      setBusy(op)
      try {
        const result = await service.transform(text, op, indent)
        setSnapshot(text)
        setTextState(result)
        return true
      } finally {
        setBusy(null)
      }
    },
    [text, service, indent],
  )

  const clear = useCallback(() => {
    setSnapshot(text)
    setTextState('')
    if (storageKey) void del(storageKey).catch(() => {})
  }, [text, storageKey])

  const undo = useCallback(() => {
    if (snapshot === null) return
    setTextState(snapshot)
    setSnapshot(null)
  }, [snapshot])

  /*
    The worker's node counts lag a keystroke behind by design; size, characters and
    lines do not have to. Merging the instant values keeps the status bar honest
    instead of showing stale numbers (or 0 B) while analysis is in flight.
  */
  const mergedAnalysis = useMemo<AnalyzeResult>(() => {
    const metrics = localMetrics(text)
    return {
      ...analysis,
      stats: { ...analysis.stats, ...metrics },
    }
  }, [analysis, text])

  return useMemo(
    () => ({
      text,
      setText,
      analysis: mergedAnalysis,
      analyzing,
      restoring,
      busy,
      canUndo: snapshot !== null && snapshot !== text,
      apply,
      clear,
      undo,
      replace,
    }),
    [
      text,
      setText,
      mergedAnalysis,
      analyzing,
      restoring,
      busy,
      snapshot,
      apply,
      clear,
      undo,
      replace,
    ],
  )
}
