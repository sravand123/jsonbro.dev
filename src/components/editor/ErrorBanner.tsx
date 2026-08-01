import { AlertTriangle, Loader2, Wand2, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import type { ParseErrorInfo } from '@/workers/protocol'

interface Props {
  error: ParseErrorInfo
  canRepair: boolean
  repairing: boolean
  repairProbeSkipped: boolean
  onJumpToError: () => void
  onRepair: () => void
  className?: string
}

/**
 * Inline error report.
 *
 * Collapsed to a chip barely wider than the line number it points at. A document is
 * transiently invalid the whole time you are typing in it, so anything larger is noise
 * sitting on top of the code you are trying to read — earlier versions were a full-width
 * bar, then a 434px pill with a solid yellow button, which was the loudest thing on the
 * screen for the most routine situation there is.
 *
 * The explanation and the repair action are one hover (or one Tab) away, which is soon
 * enough: the chip already says a problem exists and where. Clicking it jumps there.
 *
 * It floats over the editor rather than sitting in the layout, so showing and hiding it
 * never resizes the code, and the parent keys it by message so dismissing one problem
 * still lets a *different* one speak up. The status bar carries the always-on
 * "Invalid JSON" indicator.
 */
export function ErrorBanner({
  error,
  canRepair,
  repairing,
  repairProbeSkipped,
  onJumpToError,
  onRepair,
  className,
}: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const location = typeof error.line === 'number' ? `line ${error.line}` : 'problem'

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'group absolute bottom-2 left-2 z-20 flex max-w-[calc(100%-1rem)] items-center',
        'rounded border border-destructive/25 bg-destructive/[0.07] text-2xs',
        'shadow-panel backdrop-blur-sm animate-slide-up',
        className,
      )}
    >
      {/* The chip itself: what and where, in as little space as that takes. */}
      <button
        type="button"
        onClick={onJumpToError}
        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
        title={`${error.friendly} — click to go to this line`}
      >
        <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />
        <span className="font-mono">{location}</span>
      </button>

      {/*
        Detail on demand. Hidden until hover or keyboard focus reaches the chip, so the
        resting state stays tiny while the full explanation is never more than a pointer
        away. Kept in the DOM so screen readers announce the message with the alert.
      */}
      <div className="hidden min-w-0 items-center gap-1 pr-1 group-hover:flex group-focus-within:flex">
        <span className="min-w-0 truncate border-l border-destructive/20 pl-1.5 text-foreground">
          {error.friendly}
        </span>

        {canRepair && (
          <button
            type="button"
            onClick={onRepair}
            disabled={repairing}
            title="Repair the document automatically"
            className="flex shrink-0 items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-px font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-60"
          >
            {repairing ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-2.5 w-2.5" aria-hidden="true" />
            )}
            Fix
          </button>
        )}

        {repairProbeSkipped && (
          <span className="shrink-0 text-muted-foreground">too large to auto-fix</span>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss this message"
          title="Dismiss"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-foreground"
        >
          <X className="h-2.5 w-2.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
