import type * as Monaco from 'monaco-editor'

/**
 * Context-aware JSON autocomplete.
 *
 * Extracted verbatim in behaviour from the original MonacoJSONEditor so the
 * suggestion quality developers already rely on is preserved:
 *   - sibling property names at the current nesting level (ranked first)
 *   - every word and multi-word chunk that appears anywhere in the document
 *   - automatic quoting when the caret is not already inside a string
 *   - `$schema` suggestions suppressed entirely
 */

const WORD_SPLIT = /[\s,.;:!?()[\]{}"'-]/g

const COMMON_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'to', 'of',
  'in', 'for', 'on', 'at', 'by', 'from', 'with', 'as', 'but', 'not', 'be', 'been', 'it', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
])

export interface StringContext {
  text: string
  path: string[]
  isValue: boolean
  insideQuotes: boolean
}

function splitWords(input: string): string[] {
  return input.split(WORD_SPLIT).filter((word) => word.length > 0)
}

function collectFromStringLiterals(jsonContent: string, sink: Set<string>) {
  const stringMatches = jsonContent.match(/"([^"\\]*(\\.[^"\\]*)*)"/g)
  if (!stringMatches) return
  for (const match of stringMatches) {
    const content = match.slice(1, -1)
    if (content.length === 0) continue
    for (const word of splitWords(content)) sink.add(word)
  }
}

function walkForWords(value: unknown, sink: Set<string>, includeRawKeys: boolean) {
  if (value === null || value === undefined) return

  if (typeof value === 'string') {
    for (const word of splitWords(value)) sink.add(word)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) walkForWords(item, sink, includeRawKeys)
    return
  }

  if (typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (includeRawKeys) sink.add(key)
      for (const word of splitWords(key)) sink.add(word)
      walkForWords((value as Record<string, unknown>)[key], sink, includeRawKeys)
    }
  }
}

/** Unique words available in the document, falling back to regex scraping for invalid JSON. */
export function extractExistingWords(jsonContent: string): string[] {
  const words = new Set<string>()
  try {
    walkForWords(JSON.parse(jsonContent), words, true)
  } catch {
    collectFromStringLiterals(jsonContent, words)
  }
  return Array.from(words)
}

/** Word chunks (used to offer multi-word string values). */
export function extractWordChunks(jsonContent: string): string[] {
  const chunks = new Set<string>()
  try {
    walkForWords(JSON.parse(jsonContent), chunks, false)
  } catch {
    collectFromStringLiterals(jsonContent, chunks)
  }
  return Array.from(chunks)
}

/** Property names that are siblings of the caret's position in the parsed document. */
export function getSimilarProperties(root: unknown, path: string[], depth = 0): string[] {
  if (!root || typeof root !== 'object') return []
  if (path.length === 0) return []
  if (depth === path.length - 1) return Object.keys(root as Record<string, unknown>)

  const currentKey = path[depth]
  const next = (root as Record<string, unknown>)[currentKey]
  if (next) return getSimilarProperties(next, path, depth + 1)
  return []
}

/**
 * Determines what the user is typing: the partial token, the object path leading
 * to it, whether it sits in a value position, and whether it is inside quotes.
 */
export function detectStringContext(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): StringContext {
  const line = model.getLineContent(position.lineNumber)
  const beforeCursor = line.substring(0, position.column - 1)
  const currentLineUntilCursor = line.substring(0, position.column)

  const path: string[] = []
  let isValue = false

  const resolvePath = () => {
    let depth = 0
    let currentKey = ''
    let inString = false
    let escapeNext = false

    for (let lineNum = position.lineNumber; lineNum >= 1; lineNum--) {
      const currentLine =
        lineNum === position.lineNumber ? currentLineUntilCursor : model.getLineContent(lineNum)

      for (let i = currentLine.length - 1; i >= 0; i--) {
        const char = currentLine[i]

        if (escapeNext) {
          escapeNext = false
          continue
        }
        if (char === '\\') {
          escapeNext = true
          continue
        }
        if (char === '"') {
          inString = !inString
          continue
        }
        if (inString) continue

        if (char === '}' || char === ']') {
          depth++
        } else if (char === '{' || char === '[') {
          depth--
          if (depth < 0) {
            if (currentKey) path.unshift(currentKey)
            return
          }
        } else if (char === ':' && depth === 0) {
          isValue = true
          const keyMatch = currentLine.substring(0, i).match(/"([^"]+)"(?=\s*:)/)
          if (keyMatch) {
            currentKey = keyMatch[1]
            path.unshift(currentKey)
            return
          }
        }
      }
    }
  }

  resolvePath()

  const wordMatch = beforeCursor.match(/[a-zA-Z0-9_.-]*$/)
  const text = wordMatch ? wordMatch[0] : ''

  let quoteCount = 0
  let isEscaped = false
  for (let i = 0; i < beforeCursor.length; i++) {
    const char = beforeCursor[i]
    if (char === '\\') {
      isEscaped = !isEscaped
      continue
    }
    if (char === '"' && !isEscaped) quoteCount++
    isEscaped = false
  }

  return { text, path, isValue, insideQuotes: quoteCount % 2 === 1 }
}

type Suggestion = Omit<Monaco.languages.CompletionItem, 'range'>

/** Word/chunk based suggestions, deduplicated and case-normalised. */
export function getWordBasedSuggestions(
  monaco: typeof Monaco,
  context: StringContext,
  existingWords: string[],
  existingChunks: string[],
): Suggestion[] {
  const inputText = context.text
  const lowerInput = inputText.toLowerCase()
  const suggestions: Suggestion[] = []
  const processed = new Set<string>()
  const labels = new Set<string>()
  const allWords = new Set<string>()
  const canonical = new Map<string, string>()
  const shouldAddQuotes = !context.insideQuotes

  if (shouldAddQuotes && inputText.length > 0) {
    const quoted = `"${inputText}"`
    suggestions.push({
      label: quoted,
      kind: monaco.languages.CompletionItemKind.Value,
      insertText: quoted,
      detail: 'Auto-quoted string',
      documentation: 'Convert unquoted string to JSON string format',
    })
    processed.add(quoted.toLowerCase())
    allWords.add(inputText)
  }

  for (const word of existingWords) {
    if (!word || word.length === 0 || word.length >= 50) continue
    const lower = word.toLowerCase()

    const existing = canonical.get(lower)
    if (!existing || word.length > existing.length) canonical.set(lower, word)

    if (inputText && !lower.includes(lowerInput)) continue
    if (COMMON_WORDS.has(lower) && !(inputText && lower === lowerInput)) continue

    const display = canonical.get(lower) ?? word
    const suggestion: Suggestion = shouldAddQuotes
      ? {
          label: `"${display}"`,
          kind: monaco.languages.CompletionItemKind.Value,
          insertText: `"${display}"`,
          documentation: `Use quoted word: "${display}"`,
        }
      : {
          label: display,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: display,
          documentation: `Use word: "${display}"`,
        }

    const key = String(suggestion.insertText).toLowerCase()
    const labelKey = String(suggestion.label).toLowerCase()
    if (processed.has(key) || labels.has(labelKey)) continue

    suggestions.push(suggestion)
    processed.add(key)
    labels.add(labelKey)
    allWords.add(lower)
  }

  const processedChunks = new Set<string>()
  for (const chunk of existingChunks) {
    if (!chunk || chunk.length === 0 || chunk.length >= 100) continue
    const lower = chunk.toLowerCase()
    if (processedChunks.has(lower)) continue
    processedChunks.add(lower)

    const chunkWords = chunk.split(' ').filter((w) => w.length > 0)
    if (chunkWords.length <= 1) continue
    if (inputText && !lower.includes(lowerInput)) continue
    if (chunkWords.every((w) => allWords.has(w.toLowerCase()))) continue

    const suggestion: Suggestion = shouldAddQuotes
      ? {
          label: `"${chunk}"`,
          kind: monaco.languages.CompletionItemKind.Value,
          insertText: `"${chunk}"`,
          documentation: `Use quoted chunk: "${chunk}"`,
          sortText: `1${chunk}`,
        }
      : {
          label: chunk,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: chunk,
          documentation: `Use word chunk: "${chunk}"`,
          sortText: `1${chunk}`,
        }

    const key = String(suggestion.insertText).toLowerCase()
    const labelKey = String(suggestion.label).toLowerCase()
    if (processed.has(key) || labels.has(labelKey)) continue

    suggestions.push(suggestion)
    processed.add(key)
    labels.add(labelKey)
  }

  return suggestions
}

/** Full suggestion list for a caret position. Returns [] when suppressed. */
export function buildCompletions(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const fullContent = model.getValue()
  const context = detectStringContext(model, position)

  // Never lead the user toward $schema.
  const linePrefix = model.getLineContent(position.lineNumber).substring(0, position.column)
  if (
    linePrefix.includes('$') ||
    linePrefix.includes('schema') ||
    context.text.includes('$') ||
    context.text.toLowerCase().includes('schema')
  ) {
    return []
  }

  const collected: Suggestion[] = []

  try {
    const parsed = JSON.parse(fullContent)
    if (context.path.length > 0) {
      for (const prop of getSimilarProperties(parsed, context.path)) {
        collected.push({
          label: `"${prop}"`,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: `"${prop}"`,
          detail: 'Property in current context',
          sortText: `0${prop}`,
        })
      }
    }
  } catch {
    // Invalid JSON: word-based suggestions below still work.
  }

  collected.push(
    ...getWordBasedSuggestions(
      monaco,
      context,
      extractExistingWords(fullContent),
      extractWordChunks(fullContent),
    ),
  )

  const line = model.getLineContent(position.lineNumber)
  let wordStart = position.column - 1
  while (wordStart > 0 && /[a-zA-Z0-9_.-]/.test(line[wordStart - 1])) wordStart--

  const range: Monaco.IRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: wordStart + 1,
    endColumn: position.column,
  }

  const seen = new Set<string>()
  const unique: Monaco.languages.CompletionItem[] = []
  for (const suggestion of collected) {
    const raw = String(suggestion.insertText ?? suggestion.label ?? '')
    if (!raw || raw.toLowerCase().includes('$schema')) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    unique.push({ ...suggestion, range })
  }

  return unique
}

/** Trigger characters: every letter except `s` (which invites $schema) plus `_`. */
export const COMPLETION_TRIGGER_CHARACTERS = [
  ...'abcdefghijklmnopqrtuvwxyz'.split(''),
  ...'ABCDEFGHIJKLMNOPQRTUVWXYZ'.split(''),
  '_',
]
