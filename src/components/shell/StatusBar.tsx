import { AlertCircle, Check, CircleDashed, Copy, Loader2 } from 'lucide-react'
import { useMemo } from 'react'

import { Separator } from '@/components/ui/primitives'
import { formatBytes, formatCount } from '@/lib/format'
import { breadcrumbFor } from '@/lib/path'
import { cn } from '@/lib/utils'
import type { AnalyzeResult } from '@/workers/protocol'

/**
 * Document validity, and — when it is invalid — what is wrong and where.
 *
 * This is where a code editor reports problems: always visible, costing no space over the
 * code, and never moving. Earlier versions floated a panel above the editor instead, which
 * covered the very lines it was describing and had to be shrunk twice before it stopped
 * being a nuisance. The repair action lives in the top bar, where actions live.
 *
 * "Invalid JSON" appears the moment analysis says so, but the line and the explanation wait
 * for a pause in typing: a document is invalid for most of the time you are editing it, and
 * a message rewriting itself on every keystroke is noise in the corner of your eye.
 */
function ValidityChip({
  analysis,
  analyzing,
  detail,
  onJumpToError,
  compact,
}: {
  analysis: AnalyzeResult
  analyzing: boolean
  detail: boolean
  onJumpToError?: () => void
  compact: boolean
}) {
  if (analyzing) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Checking
      </span>
    )
  }

  if (analysis.status === 'valid') {
    return (
      <span className="flex items-center gap-1.5 text-success">
        <Check className="h-3 w-3" aria-hidden="true" />
        Valid JSON
      </span>
    )
  }

  if (analysis.status === 'invalid') {
    const error = analysis.error
    const line = detail && typeof error?.line === 'number' ? error.line : null
    const canJump = Boolean(onJumpToError && line !== null)

    const body = (
      <>
        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="shrink-0">Invalid JSON</span>
        {line !== null && (
          <span className="shrink-0 font-mono text-muted-foreground">line {line}</span>
        )}
        {detail && error && !compact && (
          <span className="hidden min-w-0 max-w-[28rem] truncate text-muted-foreground lg:inline">
            {error.friendly}
          </span>
        )}
        {detail && analysis.repairProbeSkipped && !compact && (
          <span className="hidden shrink-0 text-muted-foreground xl:inline">
            too large to auto-fix
          </span>
        )}
      </>
    )

    if (!canJump) {
      return <span className="flex min-w-0 items-center gap-1.5 text-destructive">{body}</span>
    }

    return (
      <button
        type="button"
        onClick={onJumpToError}
        title={`${error?.friendly ?? 'Invalid JSON'} — go to line ${line}`}
        className="flex min-w-0 items-center gap-1.5 rounded px-1 text-destructive transition-colors hover:bg-destructive/10"
      >
        {body}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <CircleDashed className="h-3 w-3" aria-hidden="true" />
      Empty
    </span>
  )
}

interface PaneStatusProps {
  label?: string
  analysis: AnalyzeResult
  analyzing: boolean
  cursor?: { line: number; column: number }
  path?: string
  onCopyPath?: (path: string) => void
  compact?: boolean
  /** False while the user is still typing, so the error detail can hold still. */
  errorDetail?: boolean
  onJumpToError?: () => void
}

export function PaneStatus({
  label,
  analysis,
  analyzing,
  cursor,
  path,
  onCopyPath,
  compact = false,
  errorDetail = false,
  onJumpToError,
}: PaneStatusProps) {
  const crumbs = useMemo(() => (path ? breadcrumbFor(path) : []), [path])
  const showPath = crumbs.length > 1 && !compact

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      {label && (
        <>
          <span className="shrink-0 font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Separator orientation="vertical" className="h-3" />
        </>
      )}

      <ValidityChip
        analysis={analysis}
        analyzing={analyzing}
        detail={errorDetail}
        onJumpToError={onJumpToError}
        compact={compact}
      />

      {showPath && (
        <>
          <Separator orientation="vertical" className="h-3" />
          <nav aria-label="JSON path" className="flex min-w-0 items-center">
            <ol className="flex min-w-0 items-center">
              {crumbs.map((crumb, index) => (
                <li key={crumb.path} className="flex min-w-0 items-center">
                  {index > 0 && <span className="px-0.5 text-muted-foreground/50">/</span>}
                  <button
                    type="button"
                    onClick={() => onCopyPath?.(crumb.path)}
                    title={`Copy ${crumb.path}`}
                    className={cn(
                      'max-w-[10rem] truncate rounded px-1 font-mono transition-colors hover:bg-accent hover:text-foreground',
                      index === crumbs.length - 1 ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {crumb.label}
                  </button>
                </li>
              ))}
            </ol>
            {onCopyPath && path && (
              <button
                type="button"
                onClick={() => onCopyPath(path)}
                aria-label="Copy full JSON path"
                title="Copy full JSON path"
                className="ml-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </nav>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2.5 font-mono text-muted-foreground">
        {analysis.status === 'valid' && !compact && (
          <>
            <span title="Total nodes in the document">
              {formatCount(analysis.stats.nodes)} nodes
            </span>
            <Separator orientation="vertical" className="h-3" />
          </>
        )}
        <span title="Document size">{formatBytes(analysis.stats.bytes)}</span>
        {cursor && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span>
              Ln {cursor.line}, Col {cursor.column}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export function StatusBar({ children }: { children: React.ReactNode }) {
  return (
    <footer
      className={cn(
        'flex h-statusbar shrink-0 items-center gap-3 border-t bg-surface px-3',
        'text-2xs font-medium text-muted-foreground',
      )}
    >
      {children}
    </footer>
  )
}
