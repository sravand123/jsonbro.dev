import { ClipboardPaste, FileJson2, FolderOpen, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/primitives'

interface Props {
  onPaste: () => void
  onUpload: () => void
  onLoadSample: () => void
  onOpenPalette: () => void
  paletteBinding: string
  hints: Array<{ label: string; binding: string }>
}

/**
 * First-run guidance: three ways in, plus the shortcuts that matter, so the tool
 * teaches itself instead of presenting an empty grey rectangle.
 *
 * Only the interactive controls capture pointer events — clicking anywhere else
 * still lands in the editor underneath and starts a caret, which is what people
 * instinctively do.
 */
export function EmptyState({
  onPaste,
  onUpload,
  onLoadSample,
  onOpenPalette,
  paletteBinding,
  hints,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center animate-slide-up">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-surface">
          <FileJson2 className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>

        <h2 className="text-balance text-lg font-semibold tracking-tight">
          Drop in some JSON to get started
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-balance text-sm text-muted-foreground">
          Everything runs in your browser — nothing is uploaded anywhere. Your work is saved
          locally, so it survives a refresh.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onPaste} className="pointer-events-auto gap-2">
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            Paste from clipboard
          </Button>
          <Button variant="outline" onClick={onUpload} className="pointer-events-auto gap-2">
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            Open file
          </Button>
          <Button variant="ghost" onClick={onLoadSample} className="pointer-events-auto gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Try a sample
          </Button>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={onOpenPalette}
            className="pointer-events-auto mx-auto flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Press <Kbd binding={paletteBinding} /> for every command
          </button>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-left text-2xs text-muted-foreground">
            {hints.map((hint) => (
              <div key={hint.binding} className="flex items-center justify-between gap-2">
                <dt className="truncate">{hint.label}</dt>
                <dd>
                  <Kbd binding={hint.binding} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
