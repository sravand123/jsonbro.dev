import { BarChart3, Search, Terminal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { InspectorTab } from '@/lib/workspace'
import { cn } from '@/lib/utils'

interface Props {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  onClose: () => void
  matchCount?: number
  /**
   * Control that selects which document the panels are bound to. Rendered only
   * when there is more than one document in play (the Compare workspace).
   */
  subjectControl?: React.ReactNode
  children: React.ReactNode
}

const tabs: Array<{ value: InspectorTab; label: string; icon: typeof Search }> = [
  { value: 'search', label: 'Search', icon: Search },
  { value: 'query', label: 'Query', icon: Terminal },
  { value: 'stats', label: 'Stats', icon: BarChart3 },
]

export function Inspector({
  tab,
  onTabChange,
  onClose,
  matchCount,
  subjectControl,
  children,
}: Props) {
  return (
    <aside
      aria-label="Inspector"
      className="flex h-full w-full min-w-0 flex-col border-l bg-surface animate-slide-in-right md:w-[17rem] lg:w-[19rem] xl:w-[20rem] 2xl:w-[22rem]"
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-1.5">
        {/*
          The tablist must contain only tabs, so the close button lives beside it
          rather than inside it.
        */}
        <div className="flex items-center gap-1" role="tablist" aria-label="Inspector sections">
          {tabs.map((entry) => {
            const active = entry.value === tab
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`inspector-panel-${entry.value}`}
                id={`inspector-tab-${entry.value}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onTabChange(entry.value)}
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded px-1.5 text-2xs font-medium transition-colors',
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <entry.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {entry.label}
                {entry.value === 'search' && matchCount ? (
                  <span className="rounded-full bg-primary/15 px-1.5 text-3xs tabular-nums text-primary">
                    {matchCount > 999 ? '999+' : matchCount}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {subjectControl && <div className="ml-auto">{subjectControl}</div>}

        <Button
          variant="ghost"
          size="icon"
          className={
            subjectControl ? 'h-6 w-6 text-muted-foreground' : 'ml-auto h-6 w-6 text-muted-foreground'
          }
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      <div
        role="tabpanel"
        id={`inspector-panel-${tab}`}
        aria-labelledby={`inspector-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </div>
    </aside>
  )
}
