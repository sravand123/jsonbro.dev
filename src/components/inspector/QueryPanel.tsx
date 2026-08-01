import { AlertCircle, Copy, HelpCircle, Loader2, Play } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { QueryResultPayload } from '@/workers/protocol'

interface Props {
  expression: string
  onExpressionChange: (expression: string) => void
  result: QueryResultPayload
  running: boolean
  onCopyResults: () => void
  onSelectPath: (path: string) => void
  compact?: boolean
}

/** The results currently on screen belong to the expression in the box. */

const EXAMPLES = [
  { label: 'Every value', expression: '$..*' },
  { label: 'All ids anywhere', expression: '$..id' },
  { label: 'First three items', expression: '$[0:3]' },
  { label: 'Filter by field', expression: '$..[?(@.active == true)]' },
]

/** The supported grammar, kept next to the implementation in src/lib/jsonpath.ts. */
const SYNTAX: Array<{ syntax: string; meaning: string }> = [
  { syntax: '$', meaning: 'the whole document' },
  { syntax: '.key', meaning: 'a property; use [\'odd key\'] when it has spaces or dashes' },
  { syntax: '[0]', meaning: 'an array item; [-1] counts back from the end' },
  { syntax: '[1:4]', meaning: 'a slice; [:2] and [2:] work too' },
  { syntax: '.* or [*]', meaning: 'every child, of an object or an array' },
  { syntax: '..key', meaning: 'that property at any depth' },
  { syntax: '$..[?(…)]', meaning: 'any node anywhere matching the test' },
  { syntax: '$.list[?(…)]', meaning: 'the members of list matching the test' },
  { syntax: '@.field', meaning: 'a field of the node being tested' },
  { syntax: '== != > >= < <=', meaning: 'comparisons against a number, string, true/false or null' },
  { syntax: '=~ "re"', meaning: 'regular-expression match on a string' },
  { syntax: '[?(@.flag)]', meaning: 'nodes where the field is truthy' },
]

export function QueryPanel({
  expression,
  onExpressionChange,
  result,
  running,
  onCopyResults,
  onSelectPath,
  compact = false,
}: Props) {
  const [showSyntax, setShowSyntax] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground"
              aria-hidden="true"
            >
              $
            </span>
            <Input
              value={expression.startsWith('$') ? expression.slice(1) : expression}
              // The leading `$` is rendered as a static prefix, so strip any the
              // user types or pastes instead of ending up with `$$.users`.
              onChange={(event) => onExpressionChange(`$${event.target.value.replace(/^\$+/, '')}`)}
              placeholder=".users[0].name"
              aria-label="JSONPath expression"
              spellCheck={false}
              className="h-9 pl-5 font-mono text-sm"
            />
          </div>
          {/*
            This used to be a bare icon that looked like a run button but did
            nothing when clicked. Queries run as you type; the button re-runs the
            current one, which is useful after editing the document.
          */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground"
            onClick={() => onExpressionChange(expression)}
            disabled={running}
            aria-label="Run the query again"
            title="Run again"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSyntax((open) => !open)}
            aria-expanded={showSyntax}
            className="mr-0.5 inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5
              text-3xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            title="Show the supported query syntax"
          >
            <HelpCircle className="h-3 w-3" aria-hidden="true" />
            Syntax
          </button>
          {EXAMPLES.map((example) => (
            <button
              key={example.expression}
              type="button"
              onClick={() => onExpressionChange(example.expression)}
              className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-3xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              title={example.label}
            >
              {example.expression}
            </button>
          ))}
        </div>
      </div>

      {showSyntax && (
        <div className="max-h-56 shrink-0 overflow-y-auto border-b bg-surface/60 px-2.5 py-2">
          <p className="mb-1.5 text-2xs leading-relaxed text-muted-foreground">
            JSONPath-style expressions, evaluated as you type. This is a practical subset rather
            than the full specification — everything it understands is listed here.
          </p>
          <dl className="grid gap-x-3 gap-y-1">
            {SYNTAX.map((entry) => (
              <div key={entry.syntax} className="flex items-baseline gap-2">
                <dt className="shrink-0 font-mono text-2xs text-json-key">{entry.syntax}</dt>
                <dd className="min-w-0 text-2xs text-muted-foreground">{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {result.error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-destructive/25 bg-destructive/[0.07] px-2.5 py-2 text-xs"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <span>{result.error}</span>
        </div>
      )}

      <div className="flex items-center justify-between border-b px-2.5 py-1.5">
        <span className="text-2xs text-muted-foreground" aria-live="polite">
          {expression.trim() === '' || expression === '$'
            ? 'Enter an expression'
            : running
              ? 'Running…'
              : `${result.total} ${result.total === 1 ? 'match' : 'matches'}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-1.5 text-2xs"
          onClick={onCopyResults}
          disabled={result.matches.length === 0}
        >
          <Copy className="h-3 w-3" aria-hidden="true" />
          Copy results
        </Button>
      </div>

      <ul
        className={cn('min-h-0 flex-1 overflow-y-auto p-1', compact && 'text-xs')}
        aria-label="Query results"
      >
        {result.matches.map((match, index) => (
          <li key={`${match.path}-${index}`}>
            <button
              type="button"
              onClick={() => onSelectPath(match.path)}
              className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
            >
              <span className="block truncate font-mono text-2xs text-muted-foreground">
                {match.path}
              </span>
              <span className="mt-0.5 block truncate font-mono text-xs">{match.preview}</span>
            </button>
          </li>
        ))}
        {result.truncated && (
          <li className="px-2 py-2 text-2xs text-muted-foreground">
            Output truncated to the first {result.matches.length} matches.
          </li>
        )}
      </ul>
    </div>
  )
}
