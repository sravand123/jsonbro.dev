import * as matchers from '@testing-library/jest-dom/matchers'
import 'fake-indexeddb/auto'
import { expect, vi } from 'vitest'

expect.extend(matchers)

// jsdom does not implement matchMedia, which the theme + reduced-motion hooks rely on.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

// jsdom lacks ResizeObserver, used by Radix + the resizable panels.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// Clipboard is used by copy actions. user-event replaces this with its own stub,
// so it must stay configurable.
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
    writable: true,
    configurable: true,
  })
}
