import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'

import type { EditorSettings } from '@/hooks/useEditorSettings'
import { scaleFromRoot } from '@/hooks/useRootFontSize'
import { monaco as monacoInstance, setupMonaco } from '@/lib/monaco/setup'
import { monacoThemeFor } from '@/lib/monaco/theme'
import { MARKER_OWNER, computeSyntaxMarkers } from '@/lib/monaco/validate'
import { getJSONPathAtPosition } from '@/utils/jsonUtils'
import { withRoot } from '@/lib/path'
import { LARGE_DOCUMENT_LIMIT } from '@/workers/protocol'

setupMonaco()

export interface EditorHighlight {
  offset: number
  length: number
  active?: boolean
}

export interface RevealOptions {
  /** Leave keyboard focus where it is — used by find-style navigation. */
  preserveFocus?: boolean
}

export interface JsonEditorHandle {
  /** True once Monaco has actually created the editor, so focus() will take effect. */
  isReady(): boolean
  focus(): void
  revealOffset(offset: number, length?: number, options?: RevealOptions): void
  revealPosition(line: number, column?: number, options?: RevealOptions): void
  getEditor(): Monaco.editor.IStandaloneCodeEditor | null
  runAction(actionId: string): void
}

interface Props {
  value: string
  onChange: (value: string) => void
  resolvedTheme: 'light' | 'dark'
  settings: EditorSettings
  fontSize: number
  /** Interface scale, so the editor's own chrome tracks the rest of the app. */
  rootPx?: number
  readOnly?: boolean
  /** reported as a `$`-rooted path plus caret position */
  onCursorChange?: (info: { line: number; column: number; path: string }) => void
  highlights?: EditorHighlight[]
  errorLine?: number
  ariaLabel: string
  className?: string
  onFocusChange?: (focused: boolean) => void
}

/**
 * The single Monaco host used by the editor workspace and both compare panes.
 *
 * Options are derived entirely from user settings (the old component hard-coded
 * font size, tab size and line height at mount, fighting the settings dialog),
 * and navigation is offset-based so search results land exactly on the match.
 */
export const JsonEditor = forwardRef<JsonEditorHandle, Props>(function JsonEditor(
  {
    value,
    onChange,
    resolvedTheme,
    settings,
    fontSize,
    rootPx = 16,
    readOnly = false,
    onCursorChange,
    highlights,
    errorLine,
    ariaLabel,
    className,
    onFocusChange,
  },
  ref,
) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  const errorDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cursorCallback = useRef(onCursorChange)
  cursorCallback.current = onCursorChange

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => editorRef.current !== null,
      focus: () => editorRef.current?.focus(),
      revealOffset: (offset: number, length = 0, options?: RevealOptions) => {
        const editor = editorRef.current
        const model = editor?.getModel()
        if (!editor || !model) return
        const start = model.getPositionAt(offset)
        const end = model.getPositionAt(offset + length)
        editor.revealRangeInCenterIfOutsideViewport(
          {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          monacoInstance.editor.ScrollType.Smooth,
        )
        editor.setSelection({
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        })
        // Stepping through matches from the search box must not move focus into the
        // document: doing so meant a second Enter typed a newline into the user's JSON.
        if (!options?.preserveFocus) editor.focus()
      },
      revealPosition: (line: number, column = 1, options?: RevealOptions) => {
        const editor = editorRef.current
        if (!editor) return
        editor.revealLineInCenter(line, monacoInstance.editor.ScrollType.Smooth)
        editor.setPosition({ lineNumber: line, column })
        if (!options?.preserveFocus) editor.focus()
      },
      getEditor: () => editorRef.current,
      runAction: (actionId: string) => {
        void editorRef.current?.getAction(actionId)?.run()
      },
    }),
    [],
  )

  const scale = (basePx: number) => scaleFromRoot(basePx, rootPx)

  const options = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      readOnly,
      fontSize,
      lineHeight: settings.lineHeight,
      tabSize: settings.tabSize,
      insertSpaces: true,
      wordWrap: settings.wordWrap ? 'on' : 'off',
      // Continuation lines are indented so a wrapped long line cannot be mistaken
      // for two short ones, and `.` is removed from the break set: Monaco's default
      // allows breaking after it, which split decimal numbers in half.
      wrappingIndent: 'indent',
      wordWrapBreakAfterCharacters: ' \t})]?|/&,;',
      wordWrapBreakBeforeCharacters: '([{\u201c\u2018',
      minimap: {
        enabled: settings.minimap,
        renderCharacters: false,
        maxColumn: 100,
        scale: rootPx >= 20 ? 2 : 1,
      },
      lineNumbers: settings.lineNumbers ? 'on' : 'off',
      renderWhitespace: settings.renderWhitespace ? 'boundary' : 'none',
      fontLigatures: settings.fontLigatures,
      stickyScroll: { enabled: settings.stickyScroll },
      guides: {
        bracketPairs: settings.bracketPairGuides,
        indentation: true,
        highlightActiveIndentation: true,
      },
      bracketPairColorization: { enabled: settings.bracketPairGuides },
      fontFamily:
        "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      automaticLayout: true,
      scrollBeyondLastLine: false,
      // Room for the floating error banner so it never covers the last line.
      padding: { top: scale(14), bottom: scale(56) },
      // Smooth scrolling, animated carets and mouse-wheel zoom all read as
      // instability while typing, so they stay off.
      smoothScrolling: false,
      cursorBlinking: 'blink',
      cursorSmoothCaretAnimation: 'off',
      mouseWheelZoom: false,
      renderLineHighlight: 'line',
      roundedSelection: false,
      scrollbar: {
        verticalScrollbarSize: scale(12),
        horizontalScrollbarSize: scale(12),
        useShadows: false,
      },
      overviewRulerBorder: false,
      /*
        Gutter width is the sum of four reserved columns. The glyph margin was 21px
        of empty space (the error indicator now lives in the line-decorations
        column instead), and line numbers reserved five digits no matter how short
        the document was. Together that was ~40px of dead space to the left of every
        line number.
      */
      glyphMargin: false,
      /*
        Four reserved digits rather than three. Because line numbers are right-aligned,
        the spare width shows up as breathing room to their left — the effect the user
        asked for, achieved inside Monaco's own layout. Shifting them with a CSS
        transform instead pushed them into the decorations lane, where they collided with
        the folding chevron and the error marker.
      */
      lineNumbersMinChars: 4,
      /*
        Holds the folding chevron at any interface scale, plus the 5px inset the line
        numbers are shifted by.

        Monaco adds a constant 16px folding reserve on top of this value, which would
        otherwise dilute the scaling (the column grew x1.6 while everything around it grew
        x2). Subtracting that constant makes the rendered column scale exactly.
      */
      lineDecorationsWidth: Math.max(0, scale(40) - 16),
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'always',
      matchBrackets: 'always',
      autoIndent: 'advanced',
      formatOnType: false,
      formatOnPaste: false,
      multiCursorModifier: 'ctrlCmd',
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      suggestSelection: 'first',
      /*
        The hover card carries the JSON path and its Copy path action. A short delay
        made it pop up constantly while scanning a document; one second means it only
        appears when someone rests on a key or value, without feeling sluggish when
        they actually want it.
      */
      hover: { enabled: true, delay: 1000, sticky: true },
      contextmenu: true,
      accessibilitySupport: 'auto',
      ariaLabel,
      fixedOverflowWidgets: true,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly, fontSize, settings, ariaLabel, rootPx],
  )

  const revalidate = useCallback(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!model) return
    monacoInstance.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      computeSyntaxMarkers(monacoInstance, model),
    )
  }, [])

  const handleMount = useCallback<OnMount>(
    (editor) => {
      editorRef.current = editor
      decorationsRef.current = editor.createDecorationsCollection([])
      errorDecorationsRef.current = editor.createDecorationsCollection([])

      editor.onDidChangeCursorPosition((event) => {
        const model = editor.getModel()
        if (!model || !cursorCallback.current) return
        const offset = model.getOffsetAt(event.position)
        cursorCallback.current({
          line: event.position.lineNumber,
          column: event.position.column,
          path: withRoot(getJSONPathAtPosition(model.getValue(), offset)),
        })
      })

      editor.onDidFocusEditorText(() => onFocusChange?.(true))
      editor.onDidBlurEditorText(() => onFocusChange?.(false))

      const model = editor.getModel()
      if (model) {
        model.onDidChangeContent(() => {
          if (validateTimer.current) clearTimeout(validateTimer.current)
          validateTimer.current = setTimeout(revalidate, 300)
        })
        revalidate()
      }

      // Preserved from the original editor: ⌘D duplicates the current line.
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyD, () => {
        void editor.getAction('editor.action.copyLinesDownAction')?.run()
      })

      // Format valid pasted JSON, but never freeze on a huge paste.
      editor.onDidPaste(() => {
        if (!settingsRef.current.formatOnPaste) return
        const currentModel = editor.getModel()
        if (!currentModel) return
        const content = currentModel.getValue()
        if (content.length > LARGE_DOCUMENT_LIMIT) return
        try {
          const formatted = JSON.stringify(JSON.parse(content), null, settingsRef.current.tabSize)
          if (formatted === content) return
          const position = editor.getPosition()
          currentModel.setValue(formatted)
          if (position) editor.setPosition(position)
        } catch {
          // Partial or invalid paste: leave exactly what the user pasted.
        }
      })
    },
    [onFocusChange, revalidate],
  )

  // Latest settings for callbacks registered once at mount.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current)
    }
  }, [])

  // Search highlight decorations.
  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    const collection = decorationsRef.current
    if (!editor || !model || !collection) return

    if (!highlights || highlights.length === 0) {
      collection.set([])
      return
    }

    collection.set(
      highlights.map((highlight) => {
        const start = model.getPositionAt(highlight.offset)
        const end = model.getPositionAt(highlight.offset + highlight.length)
        return {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          options: {
            className: highlight.active ? 'jb-search-match-active' : 'jb-search-match',
            overviewRuler: {
              color: highlight.active ? '#F59E0B' : '#F59E0B99',
              position: monacoInstance.editor.OverviewRulerLane.Center,
            },
            stickiness:
              monacoInstance.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        }
      }),
    )
  }, [highlights, value])

  // Error line highlight.
  useEffect(() => {
    const collection = errorDecorationsRef.current
    const model = editorRef.current?.getModel()
    if (!collection || !model) return

    if (!errorLine || errorLine < 1 || errorLine > model.getLineCount()) {
      collection.set([])
      return
    }

    collection.set([
      {
        // A real range rather than an empty one: Monaco silently drops zero-width
        // whole-line decorations, which is why the marker never appeared.
        range: {
          startLineNumber: errorLine,
          startColumn: 1,
          endLineNumber: errorLine,
          endColumn: model.getLineMaxColumn(errorLine),
        },
        options: {
          isWholeLine: true,
          className: 'jb-error-line',
          /*
            Colour the line number rather than drawing a bar in the decorations lane:
            that lane also holds the folding chevron, and Monaco stacks both at the same
            offset, so they overlapped.
          */
          lineNumberClassName: 'jb-error-line-number',
        },
      },
    ])
  }, [errorLine, value])

  return (
    <div className={className} data-testid="json-editor">
      <Editor
        language="json"
        theme={monacoThemeFor(resolvedTheme)}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        options={options}
        height="100%"
        loading={
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading editor…
          </div>
        }
      />
    </div>
  )
})
