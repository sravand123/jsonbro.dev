import { useEffect, useRef } from 'react'

/**
 * Returns focus to wherever it was before an overlay opened.
 *
 * Radix restores focus to the element that opened a dialog only when the dialog is
 * driven by its own trigger. Our overlays are opened from the command registry and
 * from keyboard shortcuts too, so keyboard users were dropped back on <body> when
 * a dialog closed. This makes the return explicit for every opening path.
 */
export function useFocusReturn(open: boolean) {
  const previous = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previous.current = document.activeElement as HTMLElement | null
      return
    }

    const target = previous.current
    previous.current = null
    if (!target || !target.isConnected) return
    // Let the overlay finish unmounting before moving focus back.
    const frame = requestAnimationFrame(() => target.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])
}
