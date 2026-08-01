import { formatBytes, formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AnalyzeResult } from '@/workers/protocol'

interface Props {
  analysis: AnalyzeResult
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground" title={hint}>
        {label}
      </dt>
      <dd className="font-mono text-xs tabular-nums">{value}</dd>
    </div>
  )
}

export function StatsPanel({ analysis }: Props) {
  const { stats, status } = analysis

  const distribution = [
    { label: 'objects', value: stats.objects, className: 'bg-json-key' },
    { label: 'arrays', value: stats.arrays, className: 'bg-json-boolean' },
    { label: 'strings', value: stats.strings, className: 'bg-json-string' },
    { label: 'numbers', value: stats.numbers, className: 'bg-json-number' },
    { label: 'booleans', value: stats.booleans, className: 'bg-info' },
    { label: 'nulls', value: stats.nulls, className: 'bg-json-null' },
  ].filter((entry) => entry.value > 0)

  const totalTyped = distribution.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <dl className="divide-y divide-border/60">
        <Row label="Root type" value={stats.rootType} />
        <Row label="Size" value={formatBytes(stats.bytes)} />
        <Row label="Characters" value={formatCount(stats.characters)} />
        <Row label="Lines" value={formatCount(stats.lines)} />
      </dl>

      {status === 'valid' ? (
        <>
          <h3 className="mb-1 mt-4 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shape
          </h3>
          <dl className="divide-y divide-border/60">
            <Row label="Total nodes" value={formatCount(stats.nodes)} />
            <Row
              label="Max depth"
              value={formatCount(stats.depth)}
              hint="Deepest level of nesting"
            />
            <Row label="Keys" value={formatCount(stats.keys)} />
            <Row
              label="Largest array"
              value={formatCount(stats.largestArray)}
              hint="Item count of the biggest array"
            />
          </dl>

          {totalTyped > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Value types
              </h3>
              <div
                className="flex h-1.5 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label="Distribution of value types"
              >
                {distribution.map((entry) => (
                  <div
                    key={entry.label}
                    className={cn(entry.className)}
                    style={{ width: `${(entry.value / totalTyped) * 100}%` }}
                    title={`${entry.label}: ${formatCount(entry.value)}`}
                  />
                ))}
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {distribution.map((entry) => (
                  <li key={entry.label} className="flex items-center gap-1.5 text-2xs">
                    <span className={cn('h-2 w-2 shrink-0 rounded-sm', entry.className)} />
                    <span className="text-muted-foreground">{entry.label}</span>
                    <span className="ml-auto font-mono tabular-nums">
                      {formatCount(entry.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {status === 'invalid'
            ? 'Shape metrics appear once the document parses.'
            : 'Paste or open a document to see its shape.'}
        </p>
      )}
    </div>
  )
}
