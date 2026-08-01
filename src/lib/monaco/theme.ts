import type * as Monaco from 'monaco-editor'

/**
 * Syntax colours, mirrored from the --json-* tokens in src/index.css.
 * Monaco's theme API needs hex, so these are the hex source of truth.
 */
export const syntaxPalette = {
  light: {
    key: '0A4FAB',
    string: '176B49',
    number: 'B25309',
    boolean: '6B34B0',
    null: '6B7280',
    punctuation: '5A6472',
    comment: '6B7280',
  },
  dark: {
    key: '7CB7FF',
    string: '7EE7A0',
    number: 'FFAD63',
    boolean: 'D3ADFB',
    null: '97A3B6',
    punctuation: '7F8A9C',
    comment: '7F8A9C',
  },
} as const

const shell = {
  light: {
    background: '#FFFFFF',
    foreground: '#0F172A',
    lineHighlight: '#F1F5F9',
    selection: '#B9E7CB',
    selectionHighlight: '#DCF2E5',
    cursor: '#15803D',
    lineNumber: '#94A3B8',
    lineNumberActive: '#0F172A',
    indentGuide: '#E2E8F0',
    indentGuideActive: '#C3CCD9',
    scrollbarShadow: '#00000000',
    findMatch: '#FBDBA7',
    findMatchHighlight: '#FDECC8',
    bracketMatchBorder: '#15803D',
    whitespace: '#CBD5E1',
    diffInserted: '#16A34A26',
    diffRemoved: '#DC262622',
  },
  dark: {
    background: '#0B0F16',
    foreground: '#E7ECF3',
    lineHighlight: '#151B24',
    selection: '#204E3A',
    selectionHighlight: '#1B3A2C',
    cursor: '#34D399',
    lineNumber: '#4C5768',
    lineNumberActive: '#E7ECF3',
    indentGuide: '#1E2632',
    indentGuideActive: '#313D4E',
    scrollbarShadow: '#00000000',
    findMatch: '#6B4B12',
    findMatchHighlight: '#4A360F',
    bracketMatchBorder: '#34D399',
    whitespace: '#2A3441',
    diffInserted: '#22C55E26',
    diffRemoved: '#EF444426',
  },
} as const

export const THEME_LIGHT = 'jsonbro-light'
export const THEME_DARK = 'jsonbro-dark'

function buildTheme(mode: 'light' | 'dark'): Monaco.editor.IStandaloneThemeData {
  const s = syntaxPalette[mode]
  const c = shell[mode]

  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: c.foreground.replace('#', '') },
      // JSON property names are tokenized as `string.key.json`, values as `string.value.json`.
      { token: 'string.key.json', foreground: s.key, fontStyle: 'bold' },
      { token: 'string.value.json', foreground: s.string },
      { token: 'string', foreground: s.string },
      { token: 'number', foreground: s.number },
      { token: 'keyword.json', foreground: s.boolean },
      { token: 'keyword', foreground: s.boolean },
      { token: 'delimiter', foreground: s.punctuation },
      { token: 'delimiter.bracket', foreground: s.punctuation },
      { token: 'delimiter.array', foreground: s.punctuation },
      { token: 'comment', foreground: s.comment, fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': c.background,
      'editor.foreground': c.foreground,
      'editor.lineHighlightBackground': c.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': c.selection,
      'editor.selectionHighlightBackground': c.selectionHighlight,
      'editor.inactiveSelectionBackground': c.selectionHighlight,
      'editor.findMatchBackground': c.findMatch,
      'editor.findMatchHighlightBackground': c.findMatchHighlight,
      'editorCursor.foreground': c.cursor,
      'editorLineNumber.foreground': c.lineNumber,
      'editorLineNumber.activeForeground': c.lineNumberActive,
      'editorIndentGuide.background': c.indentGuide,
      'editorIndentGuide.activeBackground': c.indentGuideActive,
      'editorWhitespace.foreground': c.whitespace,
      'editorBracketMatch.background': '#00000000',
      'editorBracketMatch.border': c.bracketMatchBorder,
      'editorWidget.background': mode === 'dark' ? '#141A23' : '#FFFFFF',
      'editorWidget.border': mode === 'dark' ? '#26303D' : '#E3E8EE',
      'editorSuggestWidget.background': mode === 'dark' ? '#141A23' : '#FFFFFF',
      'editorSuggestWidget.border': mode === 'dark' ? '#26303D' : '#E3E8EE',
      'editorSuggestWidget.selectedBackground': mode === 'dark' ? '#1E2937' : '#EAF6EF',
      'editorHoverWidget.background': mode === 'dark' ? '#141A23' : '#FFFFFF',
      'editorHoverWidget.border': mode === 'dark' ? '#26303D' : '#E3E8EE',
      'editorGutter.background': c.background,
      'editorOverviewRuler.border': '#00000000',
      'scrollbar.shadow': c.scrollbarShadow,
      'diffEditor.insertedTextBackground': c.diffInserted,
      'diffEditor.removedTextBackground': c.diffRemoved,
      'minimap.background': c.background,
    },
  }
}

let registered = false

/** Registers both themes once per Monaco instance. */
export function registerThemes(monaco: typeof Monaco) {
  if (registered) return
  registered = true
  monaco.editor.defineTheme(THEME_LIGHT, buildTheme('light'))
  monaco.editor.defineTheme(THEME_DARK, buildTheme('dark'))
}

export function monacoThemeFor(resolved: 'light' | 'dark') {
  return resolved === 'dark' ? THEME_DARK : THEME_LIGHT
}
