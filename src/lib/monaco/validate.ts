import type * as Monaco from 'monaco-editor'

export const MARKER_OWNER = 'jsonbro'

interface Marker {
  message: string
  startOffset: number
  endOffset: number
}

/** Index of the last non-whitespace character before `offset`. */
function lastMeaningfulIndex(text: string, offset: number): number {
  let index = Math.min(offset, text.length) - 1
  while (index >= 0 && /\s/.test(text[index])) index--
  return index
}

/**
 * Works out what to underline, and what to say about it.
 *
 * Monaco's own diagnostics underline a single character and repeat the engine's
 * wording. Developers then have to translate "Unexpected token }" into "you left
 * a comma on the previous line". This maps the common structural mistakes onto
 * the token that actually needs changing.
 */
function analyseSyntaxError(content: string, message: string): Marker | null {
  const positionMatch = message.match(/at position (\d+)/)
  const errorPosition = positionMatch
    ? Math.min(Number.parseInt(positionMatch[1], 10), content.length)
    : null

  if (errorPosition === null) {
    return { message, startOffset: 0, endOffset: Math.min(1, content.length) }
  }

  const culprit = lastMeaningfulIndex(content, errorPosition)

  // Missing separator: blame the end of the element that should be followed by a comma.
  if (/Expected ',' or '[}\]]'/.test(message) || /Expected ',' or/.test(message)) {
    if (culprit >= 0) {
      return {
        message: "Missing comma after this element",
        startOffset: culprit,
        endOffset: culprit + 1,
      }
    }
  }

  // Trailing comma: the character before the error is the offending comma.
  if (/Expected (property name|double-quoted property name)/.test(message)) {
    if (culprit >= 0 && content[culprit] === ',') {
      return {
        message: 'Trailing comma — JSON does not allow a comma before } or ]',
        startOffset: culprit,
        endOffset: culprit + 1,
      }
    }
  }

  if (/Unexpected end of JSON input/.test(message)) {
    const start = Math.max(0, content.length - 1)
    return {
      message: 'The document ends too early — a closing } or ] is missing',
      startOffset: start,
      endOffset: content.length,
    }
  }

  // Otherwise widen the marker to the whole offending token so it is easy to spot.
  let start = errorPosition
  while (start > 0 && !/[\s,{}[\]:]/.test(content[start - 1])) start--
  let end = errorPosition + 1
  while (end < content.length && !/[\s,{}[\]:]/.test(content[end])) end++

  return {
    message: message.replace(/\s*in JSON at position \d+.*$/, ''),
    startOffset: start,
    endOffset: Math.max(end, start + 1),
  }
}

export function computeSyntaxMarkers(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
): Monaco.editor.IMarkerData[] {
  const content = model.getValue()
  if (content.trim() === '') return []

  try {
    JSON.parse(content)
    return []
  } catch (error) {
    if (!(error instanceof SyntaxError)) return []

    const marker = analyseSyntaxError(content, error.message)
    if (!marker) return []

    const start = model.getPositionAt(marker.startOffset)
    const end = model.getPositionAt(marker.endOffset)

    return [
      {
        severity: monaco.MarkerSeverity.Error,
        message: marker.message,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
    ]
  }
}
