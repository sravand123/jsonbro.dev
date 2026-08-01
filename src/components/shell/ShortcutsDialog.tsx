import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/primitives'
import { COMMAND_GROUP_ORDER, type Command } from '@/lib/commands'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: Command[]
}

const EXTRA_SHORTCUTS: Array<{ title: string; binding: string; group: string }> = [
  { title: 'Editor find & replace', binding: 'mod+alt+f', group: 'Editor' },
  { title: 'Duplicate current line', binding: 'mod+d', group: 'Editor' },
  { title: 'Fold / unfold block', binding: 'mod+alt+left', group: 'Editor' },
  { title: 'Zoom editor text', binding: 'mod+scroll', group: 'Editor' },
  { title: 'Close dialogs and panels', binding: 'escape', group: 'Editor' },
]

/**
 * Generated from the live command registry, so documented shortcuts can never
 * drift from the ones actually bound.
 */
export function ShortcutsDialog({ open, onOpenChange, commands }: Props) {
  const bound = commands.filter((command) => command.binding)

  const groups = COMMAND_GROUP_ORDER.map((group) => ({
    group: group as string,
    items: bound
      .filter((command) => command.group === group)
      .map((command) => ({ title: command.title, binding: command.binding! })),
  }))
    .concat([{ group: 'Editor', items: EXTRA_SHORTCUTS.map(({ title, binding }) => ({ title, binding })) }])
    .filter((entry) => entry.items.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts work anywhere in the app, including while the editor has focus.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-x-8 gap-y-5 overflow-y-auto pr-1 sm:grid-cols-2">
          {groups.map((entry) => (
            <section key={entry.group}>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {entry.group}
              </h3>
              <dl className="divide-y divide-border/60">
                {entry.items.map((item) => (
                  <div
                    key={`${entry.group}-${item.binding}-${item.title}`}
                    className="flex items-center justify-between gap-4 py-1.5"
                  >
                    <dt className="min-w-0 truncate text-sm">{item.title}</dt>
                    <dd className="shrink-0">
                      {item.binding === 'mod+scroll' ? (
                        <span className="kbd">⌘ + scroll</span>
                      ) : (
                        <Kbd binding={item.binding} />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
