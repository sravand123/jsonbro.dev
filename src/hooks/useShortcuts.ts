import hotkeys from 'hotkeys-js'
import { useEffect, useRef } from 'react'

import { toHotkeysBinding } from '@/lib/shortcuts'
import type { Command } from '@/lib/commands'

/**
 * Binds the command registry to the keyboard.
 *
 * The old implementation set `hotkeys.filter = () => true`, so ⌘S fired while the
 * user was typing a filename and ⌘O fired inside text fields. Here, shortcuts are
 * suppressed inside form fields unless a command opts in, while still working
 * inside the Monaco editor (whose caret also lives in a textarea).
 */
export function useShortcuts(commands: Command[]) {
  const commandsRef = useRef(commands)
  commandsRef.current = commands

  // Rebinding on every command change would thrash listeners, so the effect only
  // depends on the *shape* of the registry; handlers stay fresh via the ref.
  const registrySignature = commands
    .map((command) => `${command.id}:${command.binding ?? ''}`)
    .join('|')

  useEffect(() => {
    // Let every key reach our handlers; each handler decides whether it is
    // allowed to act based on where focus currently is.
    hotkeys.filter = () => true
  }, [])

  useEffect(() => {
    const bound: string[] = []

    for (const command of commandsRef.current) {
      if (!command.binding) continue
      // Commands with a raw key matcher own their key outright. Registering them
      // with hotkeys-js as well risks mis-parsed key names: `mod+comma` fell back
      // to the letter `c`, which turned ⌘C into "open settings".
      if (command.keyMatcher) continue

      const binding = toHotkeysBinding(command.binding)
      bound.push(binding)

      hotkeys(binding, { capture: true }, (event) => {
        const target = event.target as HTMLElement | null
        const inPlainField =
          !!target &&
          !target.closest('.monaco-editor') &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)

        if (inPlainField && !command.allowInInput) return

        const current = commandsRef.current.find((entry) => entry.id === command.id)
        if (!current || current.enabled === false) return

        event.preventDefault()
        void current.run()
      })
    }

    return () => {
      for (const binding of bound) hotkeys.unbind(binding)
    }
  }, [registrySignature])

  // Commands that cannot be described as a hotkeys-js binding.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const inTextEntry =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          Boolean(target.closest('.monaco-editor')))

      // A bare key (like `?`) must type a character while text entry has focus.
      // A modifier combination (like ⌘,) is never a character, so it always fires.
      const isModified = event.metaKey || event.ctrlKey

      for (const command of commandsRef.current) {
        if (!command.keyMatcher || command.enabled === false) continue
        if (inTextEntry && !isModified && !command.allowInInput) continue
        if (!command.keyMatcher(event)) continue
        event.preventDefault()
        void command.run()
        return
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
