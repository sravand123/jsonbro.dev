import { AlertCircle } from 'lucide-react'

/**
 * Duplicate keys are valid JSON syntax but lossy in practice: every parser keeps
 * only the last occurrence, so the data the document produces is not the data on
 * screen. Silently collapsing them is exactly the kind of surprise this tool
 * exists to prevent.
 */
export function DuplicateKeyNotice({ keys }: { keys: string[] }) {
  const shown = keys.slice(0, 3)
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex items-center gap-2.5
        rounded-lg border border-warning/30 bg-warning/[0.08] px-3 py-2 shadow-panel backdrop-blur-sm
        animate-slide-up"
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
        <span className="font-medium">
          Duplicate {keys.length === 1 ? 'key' : 'keys'}:{' '}
          {shown.map((key) => `"${key}"`).join(', ')}
          {keys.length > shown.length ? ` and ${keys.length - shown.length} more` : ''}
        </span>
        <span className="ml-2 text-muted-foreground">
          Only the last value of each is kept when this document is parsed.
        </span>
      </p>
    </div>
  )
}
