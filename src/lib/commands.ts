import type { LucideIcon } from 'lucide-react'

export type CommandGroupName =
  | 'Transform'
  | 'Document'
  | 'Navigate'
  | 'View'
  | 'Compare'
  | 'Help'

export interface Command {
  id: string
  title: string
  group: CommandGroupName
  icon?: LucideIcon
  /** portable binding, e.g. `mod+shift+f` */
  binding?: string
  /** extra words the palette should match on */
  keywords?: string
  /** short explanation shown in the palette and cheat sheet */
  detail?: string
  enabled?: boolean
  destructive?: boolean
  /** fire even when focus is inside a plain text field */
  allowInInput?: boolean
  /**
   * Escape hatch for keys hotkeys-js cannot express (for example `?`, which
   * arrives as a shifted `/`). When present it is matched against raw keydown
   * events in addition to `binding`.
   */
  keyMatcher?: (event: KeyboardEvent) => boolean
  /** keep out of the palette (still bound to its key) */
  hiddenInPalette?: boolean
  run: () => void | Promise<void>
}

export const COMMAND_GROUP_ORDER: CommandGroupName[] = [
  'Transform',
  'Document',
  'Navigate',
  'View',
  'Compare',
  'Help',
]

export function pickCommand(commands: Command[], id: string): Command | undefined {
  return commands.find((command) => command.id === id)
}

export function groupCommands(commands: Command[]): Array<{ group: CommandGroupName; items: Command[] }> {
  return COMMAND_GROUP_ORDER.map((group) => ({
    group,
    items: commands.filter((command) => command.group === group && !command.hiddenInPalette),
  })).filter((entry) => entry.items.length > 0)
}
