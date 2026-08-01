import { applyEdits, modify } from 'jsonc-parser'
import {
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Crosshair,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { scaleFromRoot } from '@/hooks/useRootFontSize'
import { formatPath, type PathSegment } from '@/lib/path'
import { cn } from '@/lib/utils'

const BASE_ROW_HEIGHT = 22
const OVERSCAN = 12

/**
 * How a typed value is stored.
 *
 * The field used to be pre-filled with `""`, so typing `"newValue"` between the
 * quotes produced `"""newValue""` and was stored as that literal string. Values
 * are now interpreted explicitly and previewed before they are committed: valid
 * JSON is stored as that value, anything else is stored as a plain string.
 */
function interpretValue(raw: string): { value: unknown; kind: string; note?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: '', kind: 'empty string' }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed === null) return { value: null, kind: 'null' }
    if (Array.isArray(parsed)) return { value: parsed, kind: `array of ${parsed.length}` }
    switch (typeof parsed) {
      case 'number':
        return { value: parsed, kind: 'number' }
      case 'boolean':
        return { value: parsed, kind: 'boolean' }
      case 'object':
        return { value: parsed, kind: 'object' }
      default:
        return { value: parsed, kind: 'string' }
    }
  } catch {
    const looksLikeBrokenQuotes = /^".*[^\\]"./.test(trimmed) || /^"[^"]*$/.test(trimmed)
    return {
      value: trimmed,
      kind: 'string',
      note: looksLikeBrokenQuotes
        ? 'Quotes are added for you — type the text on its own'
        : undefined,
    }
  }
}

type Kind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

interface Row {
  path: string
  segments: PathSegment[]
  key: string | null
  index: number | null
  value: unknown
  kind: Kind
  depth: number
  childCount: number
  expandable: boolean
  expanded: boolean
}

function kindOf(value: unknown): Kind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'object') return 'object'
  if (t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  return 'string'
}

const valueClass: Record<Kind, string> = {
  string: 'text-json-string',
  number: 'text-json-number',
  boolean: 'text-json-boolean',
  null: 'text-json-null italic',
  object: 'text-muted-foreground',
  array: 'text-muted-foreground',
}

function renderValue(value: unknown, kind: Kind, childCount: number): string {
  switch (kind) {
    case 'object':
      return childCount === 0 ? '{}' : `{…} ${childCount} ${childCount === 1 ? 'key' : 'keys'}`
    case 'array':
      return childCount === 0 ? '[]' : `[…] ${childCount} ${childCount === 1 ? 'item' : 'items'}`
    case 'string':
      return JSON.stringify(value)
    default:
      return String(value)
  }
}

interface Props {
  data: unknown
  text: string
  onTextChange: (next: string) => void
  indent: number
  editable: boolean
  onRevealPath: (segments: PathSegment[]) => void
  onCopyPath: (path: string) => void
  onCopyValue: (value: unknown) => void
  selectedPath?: string
  className?: string
  /** Surfaced to the user when an action could not be carried out in full. */
  onNotice?: (message: string) => void
  /** Interface scale; row height tracks it so the tree is not tiny on a big display. */
  rootPx?: number
}

/**
 * Structural browser for the document.
 *
 * Rows are windowed (only what fits on screen is rendered) and children are
 * walked lazily, so a 100k-node document expands without stalling. Edits are
 * applied through jsonc-parser so untouched formatting survives.
 */
export function TreeView({
  data,
  text,
  onTextChange,
  indent,
  editable,
  onRevealPath,
  onCopyPath,
  onCopyValue,
  selectedPath,
  className,
  onNotice,
  rootPx = 16,
}: Props) {
  const ROW_HEIGHT = scaleFromRoot(BASE_ROW_HEIGHT, rootPx)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['$']))
  const [cursor, setCursor] = useState(0)
  const [editing, setEditing] = useState<{ path: string; draft: string } | null>(null)
  const [adding, setAdding] = useState<{ path: string; key: string; value: string } | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(480)

  const viewportRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight))
    observer.observe(node)
    setViewportHeight(node.clientHeight)
    return () => observer.disconnect()
  }, [])

  const rows = useMemo(() => {
    const output: Row[] = []

    const visit = (
      value: unknown,
      segments: PathSegment[],
      key: string | null,
      index: number | null,
      depth: number,
    ) => {
      const path = formatPath(segments)
      const kind = kindOf(value)
      const childCount =
        kind === 'array'
          ? (value as unknown[]).length
          : kind === 'object'
            ? Object.keys(value as Record<string, unknown>).length
            : 0
      const expandable = childCount > 0
      const isExpanded = expandable && expanded.has(path)

      output.push({
        path,
        segments,
        key,
        index,
        value,
        kind,
        depth,
        childCount,
        expandable,
        expanded: isExpanded,
      })

      if (!isExpanded) return

      if (kind === 'array') {
        ;(value as unknown[]).forEach((item, itemIndex) => {
          visit(item, [...segments, itemIndex], null, itemIndex, depth + 1)
        })
        return
      }

      if (kind === 'object') {
        for (const childKey of Object.keys(value as Record<string, unknown>)) {
          visit(
            (value as Record<string, unknown>)[childKey],
            [...segments, childKey],
            childKey,
            null,
            depth + 1,
          )
        }
      }
    }

    visit(data, [], null, null, 0)
    return output
  }, [data, expanded])

  useEffect(() => {
    if (cursor > rows.length - 1) setCursor(Math.max(0, rows.length - 1))
  }, [rows.length, cursor])

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  /**
   * Expand as much as the budget allows, shallowest levels first.
   *
   * This used to walk the entire document and then silently discard the result past
   * a threshold — on a 3,000-item array the button appeared to do nothing at all,
   * with no spinner, message or change. Now it expands whole levels up to a budget
   * and says what happened, so the outcome is never a mystery.
   */
  const expandAll = useCallback(() => {
    const CONTAINER_BUDGET = 15_000
    const next = new Set<string>()
    let level: Array<{ value: unknown; segments: PathSegment[] }> = [{ value: data, segments: [] }]
    let levelsExpanded = 0
    let truncated = false

    while (level.length > 0) {
      const containers = level.filter(
        (entry) => entry.value !== null && typeof entry.value === 'object',
      )
      if (containers.length === 0) break
      if (next.size + containers.length > CONTAINER_BUDGET) {
        truncated = true
        break
      }

      const children: Array<{ value: unknown; segments: PathSegment[] }> = []
      for (const entry of containers) {
        next.add(formatPath(entry.segments))
        const value = entry.value
        if (Array.isArray(value)) {
          value.forEach((item, index) =>
            children.push({ value: item, segments: [...entry.segments, index] }),
          )
        } else {
          for (const key of Object.keys(value as Record<string, unknown>)) {
            children.push({
              value: (value as Record<string, unknown>)[key],
              segments: [...entry.segments, key],
            })
          }
        }
      }

      levelsExpanded++
      level = children
    }

    setExpanded(next.size > 0 ? next : new Set(['$']))

    if (truncated) {
      onNotice?.(
        levelsExpanded <= 1
          ? 'This document has too many branches to expand at once. Open the ones you need individually.'
          : `Expanded ${levelsExpanded} levels — the rest is too large to open at once. Expand the branches you need from here.`,
      )
    }
  }, [data, onNotice])

  const applyEdit = useCallback(
    (segments: PathSegment[], value: unknown) => {
      const edits = modify(text, segments as Array<string | number>, value, {
        formattingOptions: { tabSize: indent, insertSpaces: true },
      })
      onTextChange(applyEdits(text, edits))
    },
    [text, indent, onTextChange],
  )

  const commitEdit = useCallback(
    (row: Row, draft: string) => {
      applyEdit(row.segments, interpretValue(draft).value)
      setEditing(null)
    },
    [applyEdit],
  )

  const removeRow = useCallback(
    (row: Row) => {
      applyEdit(row.segments, undefined)
    },
    [applyEdit],
  )

  const addChild = useCallback(
    (row: Row, key: string, rawValue: string) => {
      if (row.kind === 'object' && key.trim() === '') return
      const segment: PathSegment = row.kind === 'array' ? row.childCount : key.trim()
      applyEdit([...row.segments, segment], interpretValue(rawValue).value)
      setAdding(null)
    },
    [applyEdit],
  )

  const total = rows.length
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
  const endIndex = Math.min(total, startIndex + visibleCount)
  const visibleRows = rows.slice(startIndex, endIndex)

  const focusRow = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(total - 1, index))
      setCursor(clamped)
      const node = viewportRef.current
      if (!node) return
      const top = clamped * ROW_HEIGHT
      if (top < node.scrollTop) node.scrollTop = top
      else if (top + ROW_HEIGHT > node.scrollTop + node.clientHeight) {
        node.scrollTop = top - node.clientHeight + ROW_HEIGHT
      }
    },
    [total],
  )

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing || adding) return
    const row = rows[cursor]

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(cursor + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(cursor - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        if (row?.expandable && !row.expanded) toggle(row.path)
        else focusRow(cursor + 1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (row?.expandable && row.expanded) toggle(row.path)
        else {
          const parentDepth = (row?.depth ?? 0) - 1
          for (let i = cursor - 1; i >= 0; i--) {
            if (rows[i].depth === parentDepth) {
              focusRow(i)
              break
            }
          }
        }
        break
      case 'Home':
        event.preventDefault()
        focusRow(0)
        break
      case 'End':
        event.preventDefault()
        focusRow(total - 1)
        break
      case 'Enter':
        event.preventDefault()
        if (!row) break
        if (row.expandable) toggle(row.path)
        else onRevealPath(row.segments)
        break
      case 'c':
        if (event.metaKey || event.ctrlKey) return
        event.preventDefault()
        if (row) onCopyPath(row.path)
        break
      case 'e':
        event.preventDefault()
        if (row && editable && !row.expandable) {
          setEditing({ path: row.path, draft: JSON.stringify(row.value) })
        }
        break
      default:
        break
    }
  }

  const allExpanded = rows.every((row) => !row.expandable || row.expanded)

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => (allExpanded ? setExpanded(new Set(['$'])) : expandAll())}
        >
          {allExpanded ? (
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </Button>
        <span className="ml-auto font-mono text-2xs text-muted-foreground">
          {total.toLocaleString()} rows
        </span>
      </div>

      <div
        ref={viewportRef}
        role="tree"
        aria-label="JSON structure"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto font-mono text-xs focus-visible:ring-inset"
      >
        <div style={{ height: total * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}>
            {visibleRows.map((row, offset) => {
              const index = startIndex + offset
              const isCursor = index === cursor
              const isSelected = selectedPath === row.path
              const isEditing = editing?.path === row.path

              return (
                <div
                  key={row.path}
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-expanded={row.expandable ? row.expanded : undefined}
                  aria-selected={isCursor}
                  style={{
                    height: ROW_HEIGHT,
                    paddingLeft: scaleFromRoot(6, rootPx) + row.depth * scaleFromRoot(14, rootPx),
                  }}
                  className={cn(
                    'group flex items-center gap-1 pr-2',
                    isCursor && 'bg-accent',
                    !isCursor && isSelected && 'bg-accent/50',
                    !isCursor && !isSelected && 'hover:bg-accent/40',
                  )}
                  onMouseDown={() => setCursor(index)}
                  onDoubleClick={() => {
                    if (row.expandable) toggle(row.path)
                    else if (editable) setEditing({ path: row.path, draft: JSON.stringify(row.value) })
                  }}
                >
                  {row.expandable ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.path)}
                      aria-label={row.expanded ? 'Collapse' : 'Expand'}
                      className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          'h-3 w-3 transition-transform duration-fast',
                          row.expanded && 'rotate-90',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}

                  {row.key !== null && <span className="shrink-0 text-json-key">{row.key}</span>}
                  {row.index !== null && (
                    <span className="shrink-0 text-json-null">{row.index}</span>
                  )}
                  {row.depth === 0 && <span className="shrink-0 text-json-key">$</span>}
                  {(row.key !== null || row.index !== null || row.depth === 0) && (
                    <span className="shrink-0 text-json-punctuation">:</span>
                  )}

                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editing.draft}
                      onChange={(event) => setEditing({ path: row.path, draft: event.target.value })}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitEdit(row, editing.draft)
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setEditing(null)
                        }
                      }}
                      className="h-5 flex-1 px-1 py-0 font-mono text-xs"
                      aria-label={`New value for ${row.path}`}
                    />
                  ) : (
                    // Clicking a row selects it. Jumping to the editor is an
                    // explicit action, so browsing the tree never yanks you out of it.
                    <span className={cn('min-w-0 flex-1 truncate', valueClass[row.kind])}>
                      {renderValue(row.value, row.kind, row.childCount)}
                    </span>
                  )}

                  <span
                    className={cn(
                      'shrink-0 items-center gap-0.5',
                      // Visible for the focused row so the actions are reachable by
                      // keyboard and on touch devices, where hover does not exist.
                      isCursor ? 'flex' : 'hidden group-hover:flex',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onRevealPath(row.segments)}
                      aria-label={`Reveal ${row.path} in the editor`}
                      title="Reveal in editor"
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Crosshair className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onCopyPath(row.path)}
                      aria-label={`Copy path ${row.path}`}
                      title="Copy path"
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onCopyValue(row.value)}
                      aria-label={`Copy value at ${row.path}`}
                      title="Copy value"
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
                    </button>
                    {editable && !row.expandable && row.depth > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ path: row.path, draft: JSON.stringify(row.value) })
                        }
                        aria-label={`Edit value at ${row.path}`}
                        title="Edit value"
                        className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                    {editable && row.expandable && (
                      <button
                        type="button"
                        onClick={() => setAdding({ path: row.path, key: '', value: '' })}
                        aria-label={`Add child to ${row.path}`}
                        title="Add child"
                        className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                    {editable && row.depth > 0 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row)}
                        aria-label={`Delete ${row.path}`}
                        title="Delete"
                        className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {adding &&
        (() => {
          const targetRow = rows.find((entry) => entry.path === adding.path)
          const intoArray = targetRow?.kind === 'array'
          const interpreted = interpretValue(adding.value)
          const keyMissing = !intoArray && adding.key.trim() === ''
          const submit = () => {
            if (targetRow && !keyMissing) addChild(targetRow, adding.key, adding.value)
          }

          return (
            <div className="shrink-0 border-t bg-surface px-2 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xs text-muted-foreground">{adding.path}</span>
                {!intoArray && (
                  <Input
                    autoFocus
                    value={adding.key}
                    placeholder="key"
                    onChange={(event) => setAdding({ ...adding, key: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submit()
                      if (event.key === 'Escape') setAdding(null)
                    }}
                    className="h-7 w-32 font-mono text-xs"
                    aria-label="New property key"
                  />
                )}
                <Input
                  autoFocus={intoArray}
                  value={adding.value}
                  placeholder="text, 42, true, null, [] or {}"
                  onChange={(event) => setAdding({ ...adding, value: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submit()
                    if (event.key === 'Escape') setAdding(null)
                  }}
                  className="h-7 flex-1 font-mono text-xs"
                  aria-label="New property value"
                />
                <Button
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={submit}
                  disabled={keyMissing}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setAdding(null)}
                >
                  Cancel
                </Button>
              </div>

              <p className="mt-1.5 pl-1 text-2xs text-muted-foreground" aria-live="polite">
                {keyMissing ? (
                  'Enter a property name to continue.'
                ) : (
                  <>
                    Stored as {interpreted.kind}:{' '}
                    <span className="font-mono text-foreground">
                      {JSON.stringify(interpreted.value)}
                    </span>
                    {interpreted.note ? ` — ${interpreted.note}` : ''}
                  </>
                )}
              </p>
            </div>
          )
        })()}
    </div>
  )
}
