import { useEffect, useState } from 'react'

/**
 * True once `value` has been unchanged for `delay` milliseconds.
 *
 * Used to keep diagnostics quiet while someone is mid-thought: a document is
 * transiently invalid on almost every keystroke, so surfacing that immediately is
 * noise. Waiting for a pause means the report appears when it is useful — when you
 * have stopped and might actually want to read it.
 */
export function useSettled<T>(value: T, delay: number): boolean {
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    setSettled(false)
    const handle = setTimeout(() => setSettled(true), delay)
    return () => clearTimeout(handle)
  }, [value, delay])

  return settled
}
