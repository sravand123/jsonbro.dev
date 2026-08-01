import { Download, FileJson2, FileSpreadsheet } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type DownloadFormat = 'json' | 'csv'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultFilename: string
  minified: boolean
  onDownload: (filename: string, format: DownloadFormat, minified: boolean) => void
  csvAvailable: boolean
}

export function DownloadDialog({
  open,
  onOpenChange,
  defaultFilename,
  minified,
  onDownload,
  csvAvailable,
}: Props) {
  const [filename, setFilename] = useState(defaultFilename)
  const [format, setFormat] = useState<DownloadFormat>('json')
  const [minify, setMinify] = useState(minified)

  useEffect(() => {
    if (open) {
      setFilename(defaultFilename)
      setFormat('json')
      setMinify(minified)
    }
  }, [open, defaultFilename, minified])

  const sanitized = filename.trim().replace(/[\\/:*?"<>|]/g, '-') || 'data'

  const submit = () => {
    onDownload(sanitized, format, minify)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save file</DialogTitle>
          <DialogDescription>The file is generated locally in your browser.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label htmlFor="download-filename" className="text-sm font-medium">
            File name
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id="download-filename"
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
              autoFocus
              className="font-mono text-sm"
            />
            <span className="shrink-0 font-mono text-sm text-muted-foreground">.{format}</span>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Format</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'json' as const, label: 'JSON', icon: FileJson2, enabled: true },
                  {
                    value: 'csv' as const,
                    label: 'CSV',
                    icon: FileSpreadsheet,
                    enabled: csvAvailable,
                  },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!option.enabled}
                  onClick={() => setFormat(option.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                    format === option.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground',
                    !option.enabled && 'cursor-not-allowed opacity-40',
                  )}
                  aria-pressed={format === option.value}
                >
                  <option.icon className="h-4 w-4" aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
            {!csvAvailable && (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                CSV export needs an array of objects at the root.
              </p>
            )}
          </fieldset>

          {format === 'json' && (
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={minify}
                onChange={(event) => setMinify(event.target.checked)}
                className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
              />
              Minify output
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="gap-2">
              <Download className="h-4 w-4" aria-hidden="true" />
              Save {sanitized}.{format}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
