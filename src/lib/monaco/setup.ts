import { loader } from '@monaco-editor/react'
// Trimmed Monaco: the editor core plus the JSON language only. Importing the
// `monaco-editor` barrel would also pull in TypeScript, CSS, HTML and ~40 basic
// languages that a JSON tool can never use.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/editor.all.js'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

import { copyToClipboard, getJSONPathAtPosition } from '@/utils/jsonUtils'
import { COMPLETION_TRIGGER_CHARACTERS, buildCompletions } from './intellisense'
import { emitPathCopied } from './path-copy-bus'
import { registerThemes } from './theme'

/**
 * Monaco bootstrap.
 *
 * Previously @monaco-editor/react fetched Monaco from a CDN at runtime *and* the
 * bundle contained a second copy, so the editor could not start offline. We now
 * hand our bundled instance to the loader and host the language workers
 * ourselves, which makes the app fully offline-capable.
 */

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment
  }
}

let initialised = false

export function setupMonaco() {
  if (initialised) return monaco
  initialised = true

  window.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === 'json') return new jsonWorker()
      return new editorWorker()
    },
  }

  loader.config({ monaco })

  registerThemes(monaco)

  /**
   * Hand the app's shortcuts back to the app.
   *
   * Monaco binds ⌘F, ⌘G, ⌘⇧G and the ⌘K chord itself. Because its keybinding
   * service runs inside the editor, pressing ⌘F used to open Monaco's find widget
   * *and* focus our search panel. Setting `command: null` removes Monaco's binding,
   * so these keys reach the app cleanly; the native find widget moves to ⌥⌘F.
   */
  monaco.editor.addKeybindingRules([
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, command: null },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, command: null },
    {
      keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyG,
      command: null,
    },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, command: null },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, command: null },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, command: null },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK, command: null },
    // Native find and replace, advertised in the shortcuts dialog.
    {
      keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      command: 'actions.find',
    },
    // Monaco's own zoom bindings fight the app's font-size setting.
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, command: null },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, command: null },
    /*
      Marker navigation opens a peek panel that pushes the document down to repeat a
      message already shown in the hover, in the inline report and in the status bar.
      "Go to first error" (⌘⌥E) does the useful half of that without moving any code.
    */
    { keybinding: monaco.KeyCode.F8, command: null },
    { keybinding: monaco.KeyMod.Shift | monaco.KeyCode.F8, command: null },
    { keybinding: monaco.KeyMod.Alt | monaco.KeyCode.F8, command: null },
    { keybinding: monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F8, command: null },

    /*
      Jump to the top or bottom of the document.

      Monaco binds Ctrl+Home only on Windows/Linux, so on macOS neither Ctrl+Home
      (what people coming from VS Code press) nor Cmd+Home did anything. Bind both
      modifiers on every platform, and keep the selection variants with Shift.
    */
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Home, command: 'cursorTop' },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.End, command: 'cursorBottom' },
    { keybinding: monaco.KeyMod.WinCtrl | monaco.KeyCode.Home, command: 'cursorTop' },
    { keybinding: monaco.KeyMod.WinCtrl | monaco.KeyCode.End, command: 'cursorBottom' },
    {
      keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Home,
      command: 'cursorTopSelect',
    },
    {
      keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.End,
      command: 'cursorBottomSelect',
    },
  ])

  // The built-in schema service is intentionally silent: no network schema
  // requests, no $schema suggestions. Syntax errors come from our own markers,
  // which produce friendlier messages.
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    trailingCommas: 'error',
    comments: 'error',
    schemas: [],
    enableSchemaRequest: false,
    schemaRequest: 'error',
    schemaValidation: 'error',
  })

  monaco.languages.json.jsonDefaults.setModeConfiguration({
    documentFormattingEdits: true,
    documentRangeFormattingEdits: true,
    completionItems: false,
    hovers: false,
    documentSymbols: true,
    tokens: true,
    colors: true,
    foldingRanges: true,
    diagnostics: false,
    selectionRanges: true,
  })

  monaco.languages.registerCompletionItemProvider('json', {
    triggerCharacters: COMPLETION_TRIGGER_CHARACTERS,
    provideCompletionItems: (model, position) => {
      try {
        return { suggestions: buildCompletions(monaco, model, position) }
      } catch {
        return { suggestions: [] }
      }
    },
  })

  monaco.editor.registerCommand('jsonbro.copyPath', async (_accessor, path: string) => {
    if (!path) return
    const ok = await copyToClipboard(path)
    emitPathCopied(path, ok)

    /*
      Dismiss the hover once its action has been used: acting on a card means you are
      finished reading it, and leaving it hanging over the code obscures the very line you
      just copied a path from. Monaco keeps the card open by default because most hovers
      are informational rather than interactive.
    */
    for (const editor of monaco.editor.getEditors()) {
      const hover = editor.getContribution('editor.contrib.contentHover') as
        | { hideContentHover?: () => void }
        | null
      hover?.hideContentHover?.()
    }
  })

  monaco.languages.registerHoverProvider('json', {
    provideHover: (model, position) => {
      const path = getJSONPathAtPosition(model.getValue(), model.getOffsetAt(position))
      if (!path) return null
      const args = encodeURIComponent(JSON.stringify([path]))
      return {
        contents: [
          { value: `**Path** \`${path}\`` },
          {
            value: `[Copy path](command:jsonbro.copyPath?${args} "Copy this JSON path")`,
            isTrusted: true,
          },
        ],
      }
    },
  })

  return monaco
}

export { monaco }
