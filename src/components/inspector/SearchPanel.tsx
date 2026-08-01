import { CaseSensitive, ChevronDown, ChevronUp, Regex, WholeWord, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { MatchInfo, SearchOptions, SearchResultPayload } from '@/workers/protocol'

interface Props {
  term: string
  onTermChange: (term: string) => void
  options: SearchOptions
  onOptionsChange: (patch: Partial<SearchOptions>) => void
  results: SearchResultPayload
  activeIndex: number
  onActivate: (index: number) => void
  onNext: () => void
  onPrevious: () => void
  searching: boolean
  inputRef?: React.RefObject<HTMLInputElement>
}

const kindColor: Record<MatchInfo['kind'], string> = {
  string: 'text-json-string',
  number: 'text-json-number',
  boolean: 'text-json-boolean',
  null: 'text-json-null',
  object: 'text-json-key',
  array: 'text-json-key',
}

function ToggleIcon({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: typeof Regex
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

export function SearchPanel({
  term,
  onTermChange,
  options,
  onOptionsChange,
  results,
  activeIndex,
  onActivate,
  onNext,
  onPrevious,
  searching,
  inputRef,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-2.5">
        <div className="relative">
          <Input
            ref={inputRef}
            value={term}
            onChange={(event) => onTermChange(event.target.value)}
            onKeyDown={(event) => {
              // Enter/Shift+Enter and Down/Up both step through matches, which are the
              // two conventions people arrive with. Focus stays in the box either way.
              if (event.key === 'Enter') {
                event.preventDefault()
                if (event.shiftKey) onPrevious()
                else onNext()
                return
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                onNext()
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                onPrevious()
              }
            }}
            placeholder="Find keys or values…"
            aria-label="Search the document"
            className="h-9 pr-[5.5rem] text-sm"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <ToggleIcon
              active={options.caseSensitive}
              onClick={() => onOptionsChange({ caseSensitive: !options.caseSensitive })}
              label="Match case"
              icon={CaseSensitive}
            />
            <ToggleIcon
              active={options.wholeWord}
              onClick={() => onOptionsChange({ wholeWord: !options.wholeWord })}
              label="Match whole word"
              icon={WholeWord}
            />
            <ToggleIcon
              active={options.useRegex}
              onClick={() => onOptionsChange({ useRegex: !options.useRegex })}
              label="Use regular expression"
              icon={Regex}
            />
            {term.length > 0 && (
              <ToggleIcon active={false} onClick={() => onTermChange('')} label="Clear search" icon={X} />
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <Segmented
            label="Search scope"
            size="sm"
            value={options.scope}
            onChange={(scope) => onOptionsChange({ scope })}
            options={[
              { value: 'both', label: 'All' },
              { value: 'keys', label: 'Keys' },
              { value: 'values', label: 'Values' },
            ]}
          />

          <div className="flex items-center gap-1">
            <span
              className="min-w-[4.5rem] text-right text-2xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {searching
                ? 'Searching…'
                : results.total === 0
                  ? term
                    ? 'No results'
                    : ''
                  : `${activeIndex + 1} of ${results.total}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onPrevious}
              disabled={results.matches.length === 0}
              aria-label="Previous match"
              title="Previous match (Shift+Enter or Up arrow)"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onNext}
              disabled={results.matches.length === 0}
              aria-label="Next match"
              title="Next match (Enter or Down arrow)"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1" aria-label="Search results">
        {term.trim() === '' && (
          <li className="px-2 py-3 text-2xs leading-relaxed text-muted-foreground">
            Search matches keys and values across the whole document, however deeply nested. Each
            result shows its JSON path — select one to jump to it in the editor. Once you have
            results, Enter or the down arrow steps forward, Shift+Enter or the up arrow steps back.
          </li>
        )}

        {results.matches.map((match, index) => (
          <li key={`${match.path}-${match.matchedIn}-${index}`}>
            <button
              type="button"
              data-active={index === activeIndex}
              onClick={() => onActivate(index)}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left transition-colors',
                index === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
                  {match.path}
                </span>
                <span className="shrink-0 text-3xs uppercase tracking-wide text-muted-foreground/70">
                  {match.matchedIn}
                </span>
              </span>
              <span className={cn('mt-0.5 block truncate font-mono text-xs', kindColor[match.kind])}>
                {match.preview}
              </span>
            </button>
          </li>
        ))}

        {results.truncated && (
          <li className="px-2 py-2 text-2xs text-muted-foreground">
            Showing the first {results.matches.length} of {results.total} matches. Refine your
            search to narrow it down.
          </li>
        )}
      </ul>
    </div>
  )
}
