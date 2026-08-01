export const isApplePlatform = (() => {
  if (typeof navigator === 'undefined') return false
  const source = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
  return /Mac|iPhone|iPad|iPod/i.test(source)
})()

/**
 * Converts a portable binding such as `mod+shift+f` into a hotkeys-js binding.
 *
 * Both the Command and Control variants are registered: the platform-native one
 * first (so labels and hotkeys-js precedence follow the platform), the other as a
 * fallback for external keyboards and remote sessions where the reported modifier
 * does not match the OS.
 */
export function toHotkeysBinding(binding: string): string {
  const alternatives: string[] = []

  for (const part of binding.split(',')) {
    const trimmed = part.trim()
    if (!/\bmod\b/.test(trimmed)) {
      alternatives.push(trimmed)
      continue
    }
    const native = trimmed.replace(/\bmod\b/g, isApplePlatform ? 'command' : 'ctrl')
    const fallback = trimmed.replace(/\bmod\b/g, isApplePlatform ? 'ctrl' : 'command')
    alternatives.push(native)
    if (fallback !== native) alternatives.push(fallback)
  }

  return alternatives.join(',')
}

const KEY_LABELS: Record<string, string> = {
  mod: isApplePlatform ? '⌘' : 'Ctrl',
  command: '⌘',
  cmd: '⌘',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  shift: isApplePlatform ? '⇧' : 'Shift',
  alt: isApplePlatform ? '⌥' : 'Alt',
  option: '⌥',
  enter: '↵',
  escape: 'Esc',
  esc: 'Esc',
  backspace: isApplePlatform ? '⌫' : 'Backspace',
  delete: 'Del',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  slash: '/',
  '/': '/',
  comma: ',',
  ',': ',',
  period: '.',
}

/** Human-readable key chips for the first alternative of a binding. */
export function shortcutTokens(binding: string): string[] {
  const [first] = binding.split(',')
  return first
    .trim()
    .split('+')
    .map((key) => {
      const lower = key.toLowerCase()
      return KEY_LABELS[lower] ?? (key.length === 1 ? key.toUpperCase() : key)
    })
}

export function shortcutLabel(binding: string): string {
  return shortcutTokens(binding).join(isApplePlatform ? '' : '+')
}
