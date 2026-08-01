import { del } from 'idb-keyval'
import React from 'react'

function serializeError(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n\n${error.stack ?? ''}`.trim()
  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

interface State {
  hasError: boolean
  error: unknown
  copied: boolean
}

/**
 * Crash screen.
 *
 * Two things matter when the app breaks: the user's work must not be lost, and
 * they must have a way out. The document lives in IndexedDB and is restored on
 * load, so a document that triggers a render crash would otherwise crash-loop on
 * every reload — hence the explicit "start empty" escape hatch, which discards
 * only the restored document.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, copied: false }
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Keep the details in the console for anyone with devtools open.
    console.error('JsonBro crashed:', error, info.componentStack)
  }

  private copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(serializeError(this.state.error))
      this.setState({ copied: true })
    } catch {
      this.setState({ copied: false })
    }
  }

  private startEmpty = async () => {
    await Promise.all([
      del('json-viewer-input').catch(() => {}),
      del('json-viewer-diff-left').catch(() => {}),
      del('json-viewer-diff-right').catch(() => {}),
    ])
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-full items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-lg">
          <h1 className="text-lg font-semibold tracking-tight">Something broke</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your document is saved locally and was not lost. Reloading usually fixes this. If the
            crash keeps happening, the saved document may be the cause — starting empty will
            discard it.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.copyDetails}
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              {this.state.copied ? 'Details copied' : 'Copy error details'}
            </button>
            <button
              type="button"
              onClick={this.startEmpty}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Start with an empty document
            </button>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Technical details
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-surface p-3 text-2xs leading-relaxed">
              {serializeError(this.state.error)}
            </pre>
          </details>

          <p className="mt-4 text-xs text-muted-foreground">
            Please{' '}
            <a
              href="https://github.com/sravand123/jsonbro.dev/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              report this
            </a>{' '}
            with the details above.
          </p>
        </div>
      </div>
    )
  }
}
