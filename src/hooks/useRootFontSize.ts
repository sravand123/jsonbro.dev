import { useEffect, useState } from 'react'

const BASE_ROOT_PX = 16

function readRootFontSize(): number {
  if (typeof document === 'undefined') return BASE_ROOT_PX
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(size) && size > 0 ? size : BASE_ROOT_PX
}

/**
 * The current root font size in pixels.
 *
 * The chrome scales through rem (see the clamp on `html` in src/index.css), but a
 * few surfaces are inherently pixel-driven — Monaco's font size and padding, and the
 * virtualised tree's row height. Reading the same root value keeps those in step
 * with everything else instead of staying frozen at laptop dimensions on a large
 * display, and it tracks browser zoom, which changes the effective viewport width.
 */
export function useRootFontSize(): number {
  const [rootPx, setRootPx] = useState(readRootFontSize)

  useEffect(() => {
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRootPx(readRootFontSize()))
    }

    window.addEventListener('resize', sync)
    // Zoom changes report through resize in every current browser, but the visual
    // viewport fires more reliably on some of them.
    window.visualViewport?.addEventListener('resize', sync)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [])

  return rootPx
}

/** Scales a laptop-baseline pixel value by the current root size. */
export function scaleFromRoot(basePx: number, rootPx: number): number {
  return Math.round((basePx * rootPx) / BASE_ROOT_PX)
}
