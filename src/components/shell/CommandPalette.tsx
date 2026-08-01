import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { Kbd } from '@/components/ui/primitives'
import { groupCommands, type Command } from '@/lib/commands'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: Command[]
}

/**
 * One discoverable surface for every action in the app.
 *
 * This is what lets the toolbar stay small (Hick's Law) without hiding
 * functionality: anything not on screen is two keystrokes away.
 */
export function CommandPalette({ open, onOpenChange, commands }: Props) {
  const groups = groupCommands(commands)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search commands…" aria-label="Search commands" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        {groups.map(({ group, items }) => (
          <CommandGroup key={group} heading={group}>
            {items.map((command) => {
              const Icon = command.icon
              return (
                <CommandItem
                  key={command.id}
                  value={`${command.title} ${command.group} ${command.keywords ?? ''}`}
                  disabled={command.enabled === false}
                  onSelect={() => {
                    onOpenChange(false)
                    void command.run()
                  }}
                >
                  {Icon && (
                    <Icon
                      className={
                        command.destructive
                          ? 'h-4 w-4 shrink-0 text-destructive'
                          : 'h-4 w-4 shrink-0 text-muted-foreground'
                      }
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className={command.destructive ? 'text-destructive' : undefined}>
                      {command.title}
                    </span>
                    {command.detail && (
                      <span className="truncate text-2xs text-muted-foreground">
                        {command.detail}
                      </span>
                    )}
                  </span>
                  {command.binding && (
                    <CommandShortcut>
                      <Kbd binding={command.binding} />
                    </CommandShortcut>
                  )}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
