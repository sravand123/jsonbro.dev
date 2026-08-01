export type PathSegment = string | number

const IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

/** Renders segments as a jq-style path: `$`, `$.user.name`, `$.items[0]['odd key']`. */
export function formatPath(segments: PathSegment[]): string {
  let out = '$'
  for (const segment of segments) {
    if (typeof segment === 'number') out += `[${segment}]`
    else if (IDENTIFIER.test(segment)) out += `.${segment}`
    else out += `['${segment.replace(/'/g, "\\'")}']`
  }
  return out
}

/** Renders the trailing label for a segment, used by the breadcrumb. */
export function segmentLabel(segment: PathSegment): string {
  return typeof segment === 'number' ? `[${segment}]` : segment
}

/**
 * Normalises a raw path produced by getJSONPathAtPosition (`user.name`,
 * `items[0]`) into the `$`-rooted form used everywhere in the UI.
 */
export function withRoot(rawPath: string): string {
  if (!rawPath) return '$'
  if (rawPath.startsWith('$')) return rawPath
  if (rawPath.startsWith('[')) return `$${rawPath}`
  return `$.${rawPath}`
}

/** Splits a `$`-rooted path back into segments. */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  const body = path.startsWith('$') ? path.slice(1) : path
  const pattern = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)|\['((?:[^'\\]|\\.)*)'\]|\[(\d+)\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    if (match[1] !== undefined) segments.push(match[1])
    else if (match[2] !== undefined) segments.push(match[2].replace(/\\'/g, "'"))
    else if (match[3] !== undefined) segments.push(Number(match[3]))
  }
  return segments
}

/** Progressive breadcrumb entries: each label plus the path that selects it. */
export function breadcrumbFor(path: string): Array<{ label: string; path: string }> {
  const segments = parsePath(path)
  const crumbs: Array<{ label: string; path: string }> = [{ label: '$', path: '$' }]
  const walked: PathSegment[] = []
  for (const segment of segments) {
    walked.push(segment)
    crumbs.push({ label: segmentLabel(segment), path: formatPath([...walked]) })
  }
  return crumbs
}
