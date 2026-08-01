import { DiffEditor } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Columns2,
  GitCompareArrows,
  Rows2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  JsonEditor,
  type EditorHighlight,
  type JsonEditorHandle,
} from '@/components/editor/JsonEditor'
import { PaneStatus } from '@/components/shell/StatusBar'
import { Button } from '@/components/ui/button'
import { Segmented, Separator } from '@/components/ui/primitives'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EditorSettings } from '@/hooks/useEditorSettings'
import type { JsonDocument } from '@/hooks/useJsonDocument'
import { useSettled } from '@/hooks/useSettled'
import type { JsonService } from '@/lib/json-service'
import { scaleFromRoot } from '@/hooks/useRootFontSize'
import { monaco } from '@/lib/monaco/setup'
import { monacoThemeFor } from '@/lib/monaco/theme'
import { cn } from '@/lib/utils'

export interface CompareOptions {
  ignoreKeyOrder: boolean
  ignoreWhitespace: boolean
  layout: 'split' | 'unified'
  mode: 'edit' | 'diff'
}

export type ComparePane = 'left' | 'right'

interface Props {
  left: JsonDocument
  right: JsonDocument
  options: CompareOptions
  onOptionsChange: (patch: Partial<CompareOptions>) => void
  settings: EditorSettings
  fontSize: number
  rootPx: number
  resolvedTheme: 'light' | 'dark'
  service: JsonService
  onCopyPath: (path: string) => void
  onSwap: () => void
  isNarrow: boolean
  /** Editor handles are owned by the shell so the inspector can reveal matches. */
  leftRef: React.RefObject<JsonEditorHandle>
  rightRef: React.RefObject<JsonEditorHandle>
  /** Which pane the inspector is currently bound to. */
  activePane: ComparePane
  onActivePaneChange: (pane: ComparePane) => void
  highlights?: EditorHighlight[]
  /** The Editor workspace's document, offered as a starting point for a side. */
  mainDocumentText: string
  onUseMainDocument: (pane: ComparePane) => void
}

interface Cursor {
  line: number
  column: number
  path: string
}

const initialCursor: Cursor = { line: 1, column: 1, path: '$' }

/**
 * Compare workspace.
 *
 * Fixes carried over from the old implementation: each pane now reports its own
 * caret position (both previously showed the main editor's), comparison options
 * live in one labelled group instead of three different control idioms, and the
 * diff can be read either split or unified.
 */
export function CompareWorkspace({
  left,
  right,
  options,
  onOptionsChange,
  settings,
  fontSize,
  rootPx,
  resolvedTheme,
  service,
  onCopyPath,
  onSwap,
  isNarrow,
  leftRef,
  rightRef,
  activePane,
  onActivePaneChange,
  highlights,
  mainDocumentText,
  onUseMainDocument,
}: Props) {
  const diffRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)

  /*
    Monaco logs "TextModel got disposed before DiffEditorWidget model got reset"
    when the diff editor is torn down while still holding its models — which is
    what happens when you leave the Compare tab. Detaching them first keeps the
    console clean and avoids leaking the widget's listeners.
  */
  useEffect(
    () => () => {
      const editor = diffRef.current
      diffRef.current = null
      try {
        editor?.setModel(null)
      } catch {
        // Already disposed by Monaco; nothing to release.
      }
    },
    [],
  )

  const [leftCursor, setLeftCursor] = useState<Cursor>(initialCursor)
  const [rightCursor, setRightCursor] = useState<Cursor>(initialCursor)
  const [diffIndex, setDiffIndex] = useState(-1)
  const [diffCount, setDiffCount] = useState(0)
  const [sorted, setSorted] = useState<{ left: string; right: string } | null>(null)
  interface CaretTarget {
    pane: ComparePane
    line?: number
    column?: number
  }

  /** Where to put the caret once the editable panes are mounted. */
  const [pendingFocus, setPendingFocus] = useState<CaretTarget | null>(null)
  /** Last caret seen inside the diff view, used when returning to Edit. */
  const [diffCaret, setDiffCaret] = useState<{ pane: ComparePane; line: number; column: number } | null>(null)
  /**
   * False until the diff has been laid out with the corrected gutter.
   *
   * Monaco paints one frame with its own wider original-side gutter before the override
   * lands, which read as a sideways jump. Holding the view back for that frame keeps the
   * switch clean, and `data-diff-ready` gives tests something deterministic to wait on.
   */
  const [diffReady, setDiffReady] = useState(false)

  /*
    Line numbers only correspond between the two modes when the diff is showing the
    document as written. With "ignore key order" the diff renders a re-sorted copy, so
    restoring a line number would land somewhere unrelated — in that case the caret is
    left alone and only focus moves.
  */
  const positionsAreComparable =
    !options.ignoreKeyOrder ||
    (sorted !== null && sorted.left === left.text && sorted.right === right.text)

  // The pane caret to reopen the diff on.
  const paneCaretRef = useRef<{ pane: ComparePane; line: number; column: number } | null>(null)
  /**
   * Re-applies the diff's per-instance glyph-margin override.
   *
   * Construction options never reach the inner editors, and a side-by-side diff forces a
   * glyph margin onto the original one — which made its gutter wider than the modified
   * side and than an edit pane. Changing layout re-applies Monaco's own options, so this
   * has to run again afterwards.
   */
  const alignGuttersRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const cursor = activePane === 'right' ? rightCursor : leftCursor
    paneCaretRef.current = { pane: activePane, line: cursor.line, column: cursor.column }
  }, [activePane, leftCursor, rightCursor])

  // Same courtesy as the editor workspace: report only once typing stops.
  const leftSettled = useSettled(left.text, 800)
  const rightSettled = useSettled(right.text, 800)

  const bothPresent = left.text.trim() !== '' && right.text.trim() !== ''
  const showDiff = options.mode === 'diff' && bothPresent

  // Key sorting happens in the worker so large documents do not block typing.
  useEffect(() => {
    if (!showDiff || !options.ignoreKeyOrder) {
      setSorted(null)
      return
    }
    let cancelled = false
    void Promise.all([
      service.sortForDiff(left.text, settings.tabSize),
      service.sortForDiff(right.text, settings.tabSize),
    ]).then(([leftSorted, rightSorted]) => {
      if (!cancelled) setSorted({ left: leftSorted, right: rightSorted })
    })
    return () => {
      cancelled = true
    }
  }, [showDiff, options.ignoreKeyOrder, left.text, right.text, service, settings.tabSize])

  const diffOriginal = options.ignoreKeyOrder ? (sorted?.left ?? left.text) : left.text
  const diffModified = options.ignoreKeyOrder ? (sorted?.right ?? right.text) : right.text

  /*
    Switching between split and unified re-applies Monaco's construction options, which
    discards the per-instance gutter correction — so re-run it whenever anything that
    triggers a diff re-layout changes.
  */
  useEffect(() => {
    if (options.mode !== 'diff') {
      setDiffReady(false)
      return
    }
    const frame = requestAnimationFrame(() => alignGuttersRef.current?.())
    return () => cancelAnimationFrame(frame)
  }, [options.mode, options.layout, isNarrow, fontSize, rootPx, diffOriginal, diffModified])

  const navigate = useCallback(
    (direction: 1 | -1) => {
      const editor = diffRef.current
      if (!editor) return
      const changes = editor.getLineChanges() ?? []
      if (changes.length === 0) return

      const next = (diffIndex + direction + changes.length) % changes.length
      const change = changes[next]
      editor.revealLineInCenter(change.modifiedStartLineNumber || change.originalStartLineNumber)
      editor.setPosition({
        lineNumber: change.modifiedStartLineNumber || change.originalStartLineNumber,
        column: 1,
      })
      setDiffIndex(next)
      setDiffCount(changes.length)
    },
    [diffIndex],
  )

  /*
    The editable panes mount asynchronously (Monaco arrives via a dynamic import), so
    a single frame is not enough to hand focus over. Retry briefly, then give up rather
    than stealing focus from wherever the person has moved on to.
  */
  // Leaving the diff by the toggle or shortcut should also land where you were.
  useEffect(() => {
    if (options.mode !== 'edit' || pendingFocus || !diffCaret) return
    const fallback = paneCaretRef.current
    setPendingFocus(
      positionsAreComparable
        ? diffCaret
        : {
            pane: diffCaret.pane,
            line: fallback?.pane === diffCaret.pane ? fallback.line : undefined,
            column: fallback?.pane === diffCaret.pane ? fallback.column : undefined,
          },
    )
    setDiffCaret(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.mode])

  useEffect(() => {
    if (!pendingFocus || options.mode !== 'edit') return
    let cancelled = false
    let attempts = 0

    const tryFocus = () => {
      if (cancelled) return
      const handle = pendingFocus.pane === 'left' ? leftRef : rightRef
      // The imperative handle attaches before Monaco creates the editor, so focus()
      // would silently do nothing; wait until the instance actually exists.
      if (handle.current?.isReady()) {
        if (pendingFocus.line) {
          handle.current.revealPosition(pendingFocus.line, pendingFocus.column ?? 1)
        } else {
          handle.current.focus()
        }
        setPendingFocus(null)
        return
      }
      if (attempts++ < 60) requestAnimationFrame(tryFocus)
      else setPendingFocus(null)
    }

    requestAnimationFrame(tryFocus)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus, options.mode, leftRef, rightRef, positionsAreComparable])

  const scale = (basePx: number) => scaleFromRoot(basePx, rootPx)

  const diffOptions = useMemo<Monaco.editor.IDiffEditorConstructionOptions>(
    () => ({
      readOnly: true,
      originalEditable: false,
      renderSideBySide: options.layout === 'split' && !isNarrow,
      ignoreTrimWhitespace: options.ignoreWhitespace,
      fontSize,
      lineHeight: settings.lineHeight,
      fontFamily:
        "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontLigatures: settings.fontLigatures,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      /*
        Gutter geometry must match the editable panes exactly, or code shifts sideways
        when switching modes. Two of Monaco's diff defaults break that:

          - a 20px glyph margin is forced on the original side to draw +/- indicators,
            so the two halves of the diff did not even agree with each other;
          - the diff's folding column is narrower than a standalone editor's.

        Indicators are turned off (added and removed lines are already coloured, and the
        overview ruler marks them), and the decorations column is widened by the
        difference so the total lands on the same width as an edit pane.
      */
      glyphMargin: false,
      renderIndicators: false,
      // The revert arrows and the gutter menu both live in the glyph margin, so each
      // of them reserves it on the original side even with glyphMargin disabled.
      renderMarginRevertIcon: false,
      renderGutterMenu: false,
      lineNumbersMinChars: 4,
      // Same decorations width and folding affordance as an edit pane, so the gutter
      // adds up to the same total instead of being nudged by a magic offset.
      /*
        Monaco reserves a constant 16px for folding in a standalone editor but not in a
        diff, so the diff needs that much more decoration width to land on the same
        gutter. Measured as exactly 16px at every interface scale, which is why this is a
        plain offset rather than the measure-and-correct dance it replaced.
      */
      lineDecorationsWidth: scale(40),
      folding: true,
      showFoldingControls: 'always',
      padding: { top: scale(14), bottom: scale(56) },
      wordWrap: settings.wordWrap ? 'on' : 'off',
      renderOverviewRuler: true,
      diffWordWrap: 'inherit',
      scrollbar: {
        verticalScrollbarSize: scale(12),
        horizontalScrollbarSize: scale(12),
        useShadows: false,
      },
      accessibilityVerbose: false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.layout, options.ignoreWhitespace, isNarrow, fontSize, settings, rootPx],
  )

  const pane = (
    side: ComparePane,
    doc: JsonDocument,
    handle: React.RefObject<JsonEditorHandle>,
    cursor: Cursor,
    setCursor: (cursor: Cursor) => void,
  ) => {
    const label = side === 'left' ? 'Original' : 'Changed'
    const isActive = activePane === side
    return (
      <section
        aria-label={label}
        onMouseDownCapture={() => onActivePaneChange(side)}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          side === 'left' && !isNarrow && 'border-r',
          side === 'left' && isNarrow && 'border-b',
        )}
      >
        <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-surface px-2.5">
          <span
            className={cn(
              'text-2xs font-semibold uppercase tracking-wide',
              isActive ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {label}
          </span>
          {isActive && (
            <span
              className="rounded-full bg-primary/15 px-1.5 py-0.5 text-3xs font-medium leading-none text-primary"
              title="Search, query and statistics apply to this side"
            >
              inspecting
            </span>
          )}
          <span className="ml-auto font-mono text-2xs text-muted-foreground">
            {doc.text.length.toLocaleString()} chars
          </span>
        </div>

        <div className="relative min-h-0 flex-1">
          <JsonEditor
            ref={handle}
            value={doc.text}
            onChange={doc.setText}
            resolvedTheme={resolvedTheme}
            settings={{ ...settings, minimap: false }}
            fontSize={fontSize}
            rootPx={rootPx}
            ariaLabel={`${label} JSON editor`}
            onCursorChange={setCursor}
            onFocusChange={(focused) => {
              if (focused) onActivePaneChange(side)
            }}
            highlights={isActive ? highlights : undefined}
            errorLine={doc.analysis.error?.line}
            className="h-full"
          />

          {/* Bridge from the Editor workspace: no copy-paste round trip needed. */}
          {doc.text.trim() === '' && mainDocumentText.trim() !== '' && (
            <div className="pointer-events-none absolute inset-x-0 top-10 z-10 flex justify-center px-3">
              <button
                type="button"
                onClick={() => onUseMainDocument(side)}
                className="pointer-events-auto rounded-md border border-border/70 bg-surface/95 px-2.5 py-1.5
                  text-xs text-muted-foreground shadow-panel backdrop-blur-sm transition-colors
                  hover:border-border hover:text-foreground"
              >
                Use the document from the Editor
              </button>
            </div>
          )}

        </div>

        <div className="flex h-[1.375rem] shrink-0 items-center border-t bg-surface px-2.5 text-2xs">
          <PaneStatus
            analysis={doc.analysis}
            analyzing={doc.analyzing}
            cursor={{ line: cursor.line, column: cursor.column }}
            path={cursor.path}
            onCopyPath={onCopyPath}
            compact
            errorDetail={side === 'left' ? leftSettled : rightSettled}
            onJumpToError={() => {
              const error = doc.analysis.error
              if (!error?.line) return
              handle.current?.revealPosition(error.line, error.column ?? 1)
            }}
          />
        </div>
      </section>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 flex-wrap items-center gap-2 border-b bg-surface px-2.5">
        <Segmented
          label="Compare mode"
          value={options.mode}
          onChange={(mode) => onOptionsChange({ mode })}
          options={[
            { value: 'edit', label: 'Edit', title: 'Edit both sides' },
            {
              value: 'diff',
              label: 'Diff',
              disabled: !bothPresent,
              title: bothPresent ? 'Show the differences' : 'Add JSON to both sides first',
            },
          ]}
        />

        {/*
          The segmented control alone was easy to miss, so once both sides have content
          the next step is offered explicitly. It disappears in diff mode, where it has
          nothing left to say.
        */}
        {bothPresent && options.mode === 'edit' && (
          <Button
            size="sm"
            className="h-6 gap-1.5 px-2 text-2xs"
            onClick={() => onOptionsChange({ mode: 'diff' })}
          >
            <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
            Show differences
          </Button>
        )}

        <Separator orientation="vertical" className="h-4" />

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={options.ignoreKeyOrder}
            onChange={(event) => onOptionsChange({ ignoreKeyOrder: event.target.checked })}
            className="h-3.5 w-3.5 rounded border-input accent-[hsl(var(--primary))]"
          />
          Ignore key order
        </label>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={options.ignoreWhitespace}
            onChange={(event) => onOptionsChange({ ignoreWhitespace: event.target.checked })}
            className="h-3.5 w-3.5 rounded border-input accent-[hsl(var(--primary))]"
          />
          Ignore whitespace
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          {showDiff && (
            <>
              <Segmented
                label="Diff layout"
                size="sm"
                value={options.layout}
                onChange={(layout) => onOptionsChange({ layout })}
                options={[
                  { value: 'split', label: 'Split', icon: Columns2 },
                  { value: 'unified', label: 'Unified', icon: Rows2 },
                ]}
              />
              <Separator orientation="vertical" className="h-4" />
              <span
                className="min-w-[5rem] text-center font-mono text-2xs tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {diffCount === 0
                  ? 'No changes'
                  : `${diffIndex + 1} / ${diffCount} ${diffCount === 1 ? 'change' : 'changes'}`}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => navigate(-1)}
                disabled={diffCount === 0}
                aria-label="Previous change"
              >
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => navigate(1)}
                disabled={diffCount === 0}
                aria-label="Next change"
              >
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onSwap}
                aria-label="Swap sides"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="py-1 text-xs">
              Swap sides
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {showDiff ? (
        /*
          The diff view carries the same header and status rows as the editable panes.
          Without them the editor region changed height when switching modes, so the
          content jumped — and the caret landed somewhere other than where you left it.
        */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-7 shrink-0 items-stretch border-b bg-surface text-2xs">
            <div className="flex flex-1 items-center gap-2 px-2.5">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                Original
              </span>
              <span className="ml-auto font-mono text-muted-foreground">
                {left.text.length.toLocaleString()} chars
              </span>
            </div>
            {options.layout === 'split' && !isNarrow && (
              <div className="flex flex-1 items-center gap-2 border-l px-2.5">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                  Changed
                </span>
                <span className="ml-auto font-mono text-muted-foreground">
                  {right.text.length.toLocaleString()} chars
                </span>
              </div>
            )}
          </div>

          <div
            data-diff-ready={diffReady}
            className={cn(
              'min-h-0 flex-1 transition-opacity duration-fast',
              diffReady ? 'opacity-100' : 'opacity-0',
            )}
          >
            <DiffEditor
              height="100%"
              language="json"
              theme={monacoThemeFor(resolvedTheme)}
              original={diffOriginal}
              modified={diffModified}
              options={diffOptions}
              onMount={(editor) => {
                diffRef.current = editor

                /*
                  Side-by-side diffs force a glyph margin onto the original editor to
                  host their gutter controls, which made its gutter 20px wider than the
                  modified side and than an edit pane — so code jumped sideways when
                  switching modes. The construction options do not reach it, so override
                  it on the instance and re-apply whenever the diff recomputes.
                */
                /*
                  A side-by-side diff forces a glyph margin onto its original editor to
                  host gutter controls, making that side 20px wider than the modified one
                  and than an edit pane. Construction options never reach the inner
                  editors, and Monaco re-asserts its own value on every re-layout — so
                  watch for that and put it back, guarded so the update cannot loop.
                */
                const enforce = (inner: Monaco.editor.ICodeEditor) => {
                  if (inner.getOption(monaco.editor.EditorOption.glyphMargin)) {
                    inner.updateOptions({ glyphMargin: false })
                  }
                }
                const alignGutters = () => {
                  for (const inner of [editor.getOriginalEditor(), editor.getModifiedEditor()]) {
                    enforce(inner)
                  }
                }
                for (const inner of [editor.getOriginalEditor(), editor.getModifiedEditor()]) {
                  inner.onDidChangeConfiguration(() => enforce(inner))
                }
                alignGuttersRef.current = alignGutters
                alignGutters()
                requestAnimationFrame(() => setDiffReady(true))
                editor.onDidUpdateDiff(alignGutters)

                /*
                  The diff view is read-only, so keystrokes there used to vanish with no
                  explanation. Monaco reports the attempt, which is a reliable signal of
                  intent: drop back into Edit on the side that was touched and put the
                  caret where the person was already typing.
                */
                const returnToEdit = (pane: ComparePane) => {
                  const inner =
                    pane === 'left' ? editor.getOriginalEditor() : editor.getModifiedEditor()
                  const position = inner.getPosition()
                  onActivePaneChange(pane)
                  onOptionsChange({ mode: 'edit' })
                  toast.info(
                    `Switched to Edit — the diff view is read-only. Editing the ${pane === 'left' ? 'Original' : 'Changed'} side.`,
                  )
                  // Under "ignore key order" the diff shows a re-sorted copy, so its line
                  // numbers mean nothing in the real document — fall back to where the
                  // caret was in that pane before the diff was opened.
                  const fallback = paneCaretRef.current
                  setPendingFocus(
                    positionsAreComparable
                      ? { pane, line: position?.lineNumber, column: position?.column }
                      : {
                          pane,
                          line: fallback?.pane === pane ? fallback.line : undefined,
                          column: fallback?.pane === pane ? fallback.column : undefined,
                        },
                  )
                }
                editor.getOriginalEditor().onDidAttemptReadOnlyEdit(() => returnToEdit('left'))
                editor.getModifiedEditor().onDidAttemptReadOnlyEdit(() => returnToEdit('right'))

                // Remember where the caret is on either side, so leaving the diff by any
                // route (the toggle, the shortcut) lands in the same place.
                editor
                  .getOriginalEditor()
                  .onDidChangeCursorPosition((event) =>
                    setDiffCaret({ pane: 'left', line: event.position.lineNumber, column: event.position.column }),
                  )
                editor
                  .getModifiedEditor()
                  .onDidChangeCursorPosition((event) =>
                    setDiffCaret({ pane: 'right', line: event.position.lineNumber, column: event.position.column }),
                  )

                // Open on the line the person was editing before they asked for the diff.
                const entry = paneCaretRef.current
                if (entry) {
                  const inner =
                    entry.pane === 'left' ? editor.getOriginalEditor() : editor.getModifiedEditor()
                  if (positionsAreComparable) {
                    inner.revealLineInCenter(entry.line)
                    inner.setPosition({ lineNumber: entry.line, column: entry.column })
                  }
                }

                const sync = () => {
                  const changes = editor.getLineChanges() ?? []
                  setDiffCount(changes.length)
                  setDiffIndex((current) => {
                    if (changes.length === 0) return -1
                    return current < 0 ? 0 : Math.min(current, changes.length - 1)
                  })
                }
                editor.onDidUpdateDiff(sync)
                setTimeout(sync, 120)
              }}
            />
          </div>

          <div className="flex h-[1.375rem] shrink-0 items-center gap-4 border-t bg-surface px-2.5 text-2xs">
            <PaneStatus analysis={left.analysis} analyzing={left.analyzing} compact />
            <Separator orientation="vertical" className="h-3" />
            <PaneStatus analysis={right.analysis} analyzing={right.analyzing} compact />
          </div>
        </div>
      ) : (
        <div className={cn('flex min-h-0 flex-1', isNarrow ? 'flex-col' : 'flex-row')}>
          {pane('left', left, leftRef, leftCursor, setLeftCursor)}
          {pane('right', right, rightRef, rightCursor, setRightCursor)}
        </div>
      )}
    </div>
  )
}
