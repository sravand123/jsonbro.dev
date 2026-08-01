/**
 * Turns engine syntax errors into something a developer can act on.
 *
 * V8, JavaScriptCore and SpiderMonkey all word these differently, and none of
 * them name the actual mistake. Where the surrounding text makes the cause
 * obvious (single quotes, a trailing comma, an unquoted key) we say so outright,
 * and only fall back to normalising the engine's own wording.
 */

function charAt(text: string, index: number): string {
  return index >= 0 && index < text.length ? text[index] : ''
}

/** Index of the last non-whitespace character before `offset`. */
function lastMeaningfulIndex(text: string, offset: number): number {
  let index = Math.min(offset, text.length) - 1
  while (index >= 0 && /\s/.test(text[index])) index--
  return index
}

export function friendlyParseError(message: string, text: string, position?: number): string {
  const at = typeof position === 'number' ? position : -1
  const here = charAt(text, at)
  const previousIndex = at >= 0 ? lastMeaningfulIndex(text, at) : -1
  const previous = charAt(text, previousIndex)

  // Cause-first checks: these beat any engine wording.
  if (here === "'" || (previous === "'" && here !== '"')) {
    return 'JSON requires double quotes — single quotes are not valid.'
  }
  if (previous === ',' && (here === '}' || here === ']')) {
    return 'Trailing comma — JSON does not allow a comma before } or ].'
  }

  if (/Unexpected end of (JSON input|input)|end of data|Unexpected EOF/i.test(message)) {
    return 'The document ends too early — a closing } or ] is missing.'
  }
  // The parser ran out of input: whatever it "expected" next, the real problem is
  // that the document is unterminated.
  if (at >= 0 && at >= text.trimEnd().length && !/after JSON/i.test(message)) {
    return 'The document ends too early — a closing } or ] is missing.'
  }
  if (/Unexpected non-whitespace character after JSON/i.test(message)) {
    return 'Extra content after the end of the JSON value. Only one top-level value is allowed.'
  }
  if (/Expected ',' or '}'/i.test(message)) {
    return 'Missing comma between object properties, or an unclosed }.'
  }
  if (/Expected ',' or ']'/i.test(message)) {
    return 'Missing comma between array items, or an unclosed ].'
  }
  if (/Expected double-quoted property name/i.test(message)) {
    return 'Property names must be wrapped in double quotes.'
  }
  if (/Expected property name/i.test(message)) {
    return here === '}' || here === ']'
      ? 'Expected a property name — this often means a trailing comma before }.'
      : 'Property names must be wrapped in double quotes.'
  }
  if (/Bad control character in string/i.test(message)) {
    return 'A raw control character (such as a literal newline or tab) appears inside a string. Escape it as \\n or \\t.'
  }
  if (/Bad escaped character|Invalid escape/i.test(message)) {
    return 'Invalid escape sequence inside a string.'
  }
  if (/Unterminated string/i.test(message)) {
    return 'A string is never closed — a double quote is missing.'
  }
  if (/Expected ':'/i.test(message)) {
    return 'Missing colon between a property name and its value.'
  }
  if (/Unexpected token/i.test(message)) {
    return here
      ? `Unexpected \`${here}\` — check for a missing comma, quote, or bracket just before it.`
      : 'Unexpected token — check for a missing comma, quote, or bracket.'
  }
  if (/is not valid JSON$/i.test(message)) {
    return 'This is not valid JSON. Check the quotes, commas, and brackets.'
  }

  return message.replace(/\s*in JSON at position \d+.*$/, '').trim() || message
}

export function extractPosition(message: string): number | undefined {
  const match = message.match(/at position (\d+)/)
  return match ? Number.parseInt(match[1], 10) : undefined
}

export function extractLineColumn(message: string): { line?: number; column?: number } {
  const line = message.match(/line (\d+)/i)
  const column = message.match(/column (\d+)/i)
  return {
    line: line ? Number.parseInt(line[1], 10) : undefined,
    column: column ? Number.parseInt(column[1], 10) : undefined,
  }
}

/** Derives 1-based line/column from a character offset. */
export function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let lastBreak = -1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      lastBreak = i
    }
  }
  return { line, column: offset - lastBreak }
}
