import { findNodeAtLocation, parseTree } from 'jsonc-parser'
import {
  ArrowDownToLine,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  FileJson2,
  GitCompare,
  Keyboard,
  Link2,
  ListTree,
  Minimize2,
  MoveDown,
  MoveUp,
  Palette,
  PanelRight,
  Search,
  Settings,
  SortAsc,
  Sparkles,
  Terminal,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { toast } from 'sonner'

import type { ComparePane, CompareOptions } from '@/components/compare/CompareWorkspace'
import { DuplicateKeyNotice } from '@/components/editor/DuplicateKeyNotice'
import { ErrorBanner } from '@/components/editor/ErrorBanner'
import type { JsonEditorHandle } from '@/components/editor/JsonEditor'
import { Inspector } from '@/components/inspector/Inspector'
import { QueryPanel } from '@/components/inspector/QueryPanel'
import { SearchPanel } from '@/components/inspector/SearchPanel'
import { StatsPanel } from '@/components/inspector/StatsPanel'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { DownloadDialog, type DownloadFormat } from '@/components/shell/DownloadDialog'
import { EmptyState } from '@/components/shell/EmptyState'
import { SettingsDialog } from '@/components/shell/SettingsDialog'
import { ShortcutsDialog } from '@/components/shell/ShortcutsDialog'
import { PaneStatus, StatusBar } from '@/components/shell/StatusBar'
import { TopBar } from '@/components/shell/TopBar'
import { TreeView } from '@/components/tree/TreeView'
import { Segmented } from '@/components/ui/primitives'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useEditorSettings } from '@/hooks/useEditorSettings'
import { useFocusReturn } from '@/hooks/useFocusReturn'
import { useJsonDocument } from '@/hooks/useJsonDocument'
import { useSettled } from '@/hooks/useSettled'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useTheme } from '@/hooks/useTheme'
import type { Command } from '@/lib/commands'
import { createJsonService } from '@/lib/json-service'
import { onPathCopied } from '@/lib/monaco/path-copy-bus'
import { formatPath, parsePath, type PathSegment } from '@/lib/path'
import { minifyText } from '@/lib/reformat'
import { SAMPLE_JSON } from '@/lib/sample'
import { buildShareUrl, consumeSharedDocument } from '@/lib/share'
import {
  readInspectorOpen,
  readWorkspace,
  writeInspectorOpen,
  writeWorkspace,
  type InspectorTab,
  type Workspace,
} from '@/lib/workspace'
import {
  copyToClipboard,
  downloadCSV,
  downloadJSON,
  parseCSVFile,
  parseJSONFile,
} from '@/utils/jsonUtils'
import type { SearchOptions, SearchResultPayload, QueryResultPayload } from '@/workers/protocol'

/** FileReader rather than Blob.text(): dependable in every environment we target. */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsText(file)
  })
}

const emptySearch: SearchResultPayload = { matches: [], total: 0, truncated: false }
const emptyQuery: QueryResultPayload = { matches: [], total: 0, truncated: false, error: null }

/**
 * Monaco is ~3.6 MB of the bundle. Loading it lazily lets the shell, the empty
 * state and the status bar paint immediately instead of waiting on the editor.
 */
const JsonEditor = lazy(() =>
  import('@/components/editor/JsonEditor').then((module) => ({ default: module.JsonEditor })),
)
const CompareWorkspace = lazy(() =>
  import('@/components/compare/CompareWorkspace').then((module) => ({
    default: module.CompareWorkspace,
  })),
)

function EditorSkeleton() {
  return (
    <div className="flex h-full items-center justify-center" aria-live="polite" aria-busy="true">
      <span className="text-sm text-muted-foreground">Loading editor…</span>
    </div>
  )
}

const BINDINGS = {
  palette: 'mod+k',
  format: 'mod+shift+f',
  minify: 'mod+alt+m',
  sortKeys: 'mod+alt+s',
  repair: 'mod+alt+r',
  copy: 'mod+alt+c,mod+shift+c',
  download: 'mod+s',
  open: 'mod+o',
  paste: 'mod+alt+v',
  clear: 'mod+shift+backspace,mod+shift+delete',
  restore: 'mod+alt+z',
  share: 'mod+alt+l',
  search: 'mod+f',
  nextMatch: 'mod+g',
  previousMatch: 'mod+shift+g',
  goToError: 'mod+alt+e',
  inspector: 'mod+b',
  editor: 'mod+alt+1',
  tree: 'mod+alt+2',
  compare: 'mod+alt+3',
  query: 'mod+alt+4',
  theme: 'mod+alt+t',
  settings: 'mod+comma',
  shortcuts: 'shift+/',
  toggleDiff: 'mod+alt+d',
} as const

export function JsonBroApp() {
  const service = useMemo(() => createJsonService(), [])
  useEffect(() => () => service.dispose(), [service])

  const { preference, setPreference, resolved } = useTheme()
  const {
    settings,
    update: updateSettings,
    reset: resetSettings,
    effectiveFontSize,
    rootPx,
  } = useEditorSettings()

  const doc = useJsonDocument({
    service,
    storageKey: 'json-viewer-input',
    indent: settings.tabSize,
  })
  const left = useJsonDocument({
    service,
    storageKey: 'json-viewer-diff-left',
    indent: settings.tabSize,
  })
  const right = useJsonDocument({
    service,
    storageKey: 'json-viewer-diff-right',
    indent: settings.tabSize,
  })

  const [workspace, setWorkspaceState] = useState<Workspace>(readWorkspace)
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  )
  // On phones the inspector is a sheet that covers the editor, so it starts closed.
  const [inspectorOpen, setInspectorOpen] = useState(() =>
    readInspectorOpen(typeof window === 'undefined' ? true : window.innerWidth >= 768),
  )
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('search')

  const [cursor, setCursor] = useState({ line: 1, column: 1, path: '$' })
  const [isDragging, setIsDragging] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    scope: 'both',
  })
  const [searchResults, setSearchResults] = useState<SearchResultPayload>(emptySearch)
  const [searching, setSearching] = useState(false)
  const [activeMatch, setActiveMatch] = useState(0)

  const [queryExpression, setQueryExpression] = useState('$')
  const [queryResult, setQueryResult] = useState<QueryResultPayload>(emptyQuery)
  const [querying, setQuerying] = useState(false)

  const [activePane, setActivePane] = useState<ComparePane>('left')
  const [compareOptions, setCompareOptions] = useState<CompareOptions>({
    ignoreKeyOrder: true,
    ignoreWhitespace: false,
    layout: 'split',
    mode: 'edit',
  })

  const editorRef = useRef<JsonEditorHandle>(null)
  const leftEditorRef = useRef<JsonEditorHandle>(null)
  const rightEditorRef = useRef<JsonEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  /**
   * The document every action applies to.
   *
   * In Compare, the visible documents are the two panes — not the main editor's.
   * Binding search, query, statistics and the transforms to the focused pane is
   * what makes "find" work on what you are actually looking at; previously they all
   * silently operated on the hidden main document.
   */
  /*
    Diagnostics wait for a pause in typing. A document is transiently invalid on almost
    every keystroke, so reporting immediately turns the editor into a flickering scold.
  */
  const typingSettled = useSettled(doc.text, 800)

  const inCompare = workspace === 'compare'
  const activeDoc = inCompare ? (activePane === 'right' ? right : left) : doc
  const activeHandle = inCompare
    ? activePane === 'right'
      ? rightEditorRef
      : leftEditorRef
    : editorRef
  const activeSubject = inCompare ? (activePane === 'right' ? 'Changed' : 'Original') : null

  // Keyboard users must land back where they were when an overlay closes.
  useFocusReturn(paletteOpen)
  useFocusReturn(shortcutsOpen)
  useFocusReturn(settingsOpen)
  useFocusReturn(downloadOpen)

  const setWorkspace = useCallback((next: Workspace) => {
    setWorkspaceState(next)
    writeWorkspace(next)
  }, [])

  const toggleInspector = useCallback(() => {
    setInspectorOpen((open) => {
      writeInspectorOpen(!open)
      return !open
    })
  }, [])

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // A document shared by link wins over restored local content.
  useEffect(() => {
    void consumeSharedDocument().then((shared) => {
      if (shared) {
        doc.setText(shared)
        toast.success('Loaded the shared document')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Monaco's hover card can copy a path; report it once here.
  useEffect(
    () =>
      onPathCopied((path, ok) => {
        if (ok) toast.success(`Copied ${path}`)
        else toast.error('Could not copy the path')
      }),
    [],
  )

  const copyPath = useCallback(async (path: string) => {
    const ok = await copyToClipboard(path)
    if (ok) toast.success(`Copied ${path}`)
    else toast.error('Could not copy the path')
  }, [])

  // ── Search ────────────────────────────────────────────────────────────────
  const searchSeq = useRef(0)

  useEffect(() => {
    if (searchTerm.trim() === '' || activeDoc.text.trim() === '') {
      searchSeq.current++
      setSearchResults(emptySearch)
      setSearching(false)
      return
    }

    // Same guard as the query panel: a superseded response must never overwrite
    // the results for the term currently in the box.
    const seq = ++searchSeq.current
    setSearching(true)
    const handle = setTimeout(() => {
      void service
        .search(activeDoc.text, searchTerm, searchOptions, 500)
        .then((result) => {
          if (seq !== searchSeq.current) return
          setSearchResults(result)
          setActiveMatch(0)
        })
        .catch(() => {
          if (seq === searchSeq.current) setSearchResults(emptySearch)
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false)
        })
    }, 140)

    return () => clearTimeout(handle)
  }, [searchTerm, searchOptions, activeDoc.text, service])

  const highlights = useMemo(
    () =>
      searchResults.matches
        .filter((match) => typeof match.offset === 'number')
        .map((match, index) => ({
          offset: match.offset!,
          length: match.length ?? 0,
          active: index === activeMatch,
        })),
    [searchResults, activeMatch],
  )

  const revealMatch = useCallback(
    (index: number, options?: { preserveFocus?: boolean }) => {
      const match = searchResults.matches[index]
      if (!match || typeof match.offset !== 'number') return
      setActiveMatch(index)
      // Tree has no caret to reveal into, so hop to the editor; Compare reveals
      // inside whichever pane the inspector is bound to.
      if (workspace === 'tree') setWorkspace('editor')
      activeHandle.current?.revealOffset(match.offset, match.length ?? 0, options)
    },
    [searchResults, workspace, setWorkspace, activeHandle],
  )

  /**
   * Enter / Shift+Enter and ⌘G / ⌘⇧G step through matches while keeping focus in the
   * search box, the way a find widget behaves. Selecting a result with the mouse is an
   * explicit "take me there", so that one does move focus into the editor.
   */
  const stepMatch = useCallback(
    (direction: 1 | -1) => {
      if (searchResults.matches.length === 0) return
      const next =
        (activeMatch + direction + searchResults.matches.length) % searchResults.matches.length
      revealMatch(next, { preserveFocus: true })
    },
    [activeMatch, searchResults.matches.length, revealMatch],
  )

  // Scroll the first match into view as soon as results arrive, without taking focus.
  const revealedFor = useRef<string | null>(null)
  useEffect(() => {
    const signature = `${searchTerm}:${searchResults.matches[0]?.offset ?? ''}`
    if (searchResults.matches.length === 0) {
      revealedFor.current = null
      return
    }
    if (revealedFor.current === signature) return
    revealedFor.current = signature
    revealMatch(0, { preserveFocus: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults, searchTerm])

  const openSearch = useCallback(() => {
    setInspectorOpen(true)
    writeInspectorOpen(true)
    setInspectorTab('search')
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  // ── Query ─────────────────────────────────────────────────────────────────
  const querySeq = useRef(0)

  useEffect(() => {
    const expression = queryExpression.trim()
    if (expression === '' || expression === '$' || activeDoc.text.trim() === '') {
      querySeq.current++
      setQueryResult(emptyQuery)
      setQuerying(false)
      return
    }

    /*
      Results must never outlive the question. Previously a slow response could
      land after the expression had already changed, so the panel confidently
      showed the answer to the previous query — and clicking a suggestion chip
      appeared to do nothing. The sequence guard drops superseded responses, and
      the old results are cleared immediately so nothing stale is ever on screen.
    */
    const seq = ++querySeq.current
    setQuerying(true)
    setQueryResult(emptyQuery)

    const handle = setTimeout(() => {
      void service
        .query(activeDoc.text, expression, 500)
        .then((result) => {
          if (seq !== querySeq.current) return
          setQueryResult(result)
        })
        .catch((error: Error) => {
          if (seq !== querySeq.current) return
          setQueryResult({ matches: [], total: 0, truncated: false, error: error.message })
        })
        .finally(() => {
          if (seq === querySeq.current) setQuerying(false)
        })
    }, 180)

    return () => clearTimeout(handle)
  }, [queryExpression, activeDoc.text, service])

  // ── Navigation helpers ────────────────────────────────────────────────────
  const revealSegments = useCallback(
    (segments: PathSegment[]) => {
      if (segments.length === 0) {
        activeHandle.current?.revealPosition(1, 1)
        return
      }
      const tree = parseTree(activeDoc.text, [], { allowTrailingComma: true })
      if (!tree) return
      const node = findNodeAtLocation(tree, segments as Array<string | number>)
      if (!node) return
      if (workspace === 'tree') setWorkspace('editor')
      const handle = activeHandle
      requestAnimationFrame(() => handle.current?.revealOffset(node.offset, node.length))
    },
    [activeDoc.text, workspace, setWorkspace, activeHandle],
  )

  const goToError = useCallback(() => {
    const error = activeDoc.analysis.error
    if (!error?.line) return
    activeHandle.current?.revealPosition(error.line, error.column ?? 1)
  }, [activeDoc.analysis.error, activeHandle])

  // ── Files ─────────────────────────────────────────────────────────────────
  const processFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase()
      const isJson = name.endsWith('.json') || name.endsWith('.jsonl') || name.endsWith('.txt')
      const isCsv = name.endsWith('.csv')

      if (!isJson && !isCsv) {
        toast.error('Unsupported file type', { description: 'Choose a .json or .csv file.' })
        return
      }

      setLoadingFile(true)
      try {
        if (isCsv) {
          const result = await parseCSVFile(file)
          if (result.error) {
            toast.error(`Could not read ${file.name}`, { description: result.error.message })
            return
          }
          doc.replace(JSON.stringify(result.data, null, settings.tabSize))
          toast.success(`Loaded ${file.name}`, { description: 'Converted from CSV to JSON.' })
          return
        }

        // Load JSON files verbatim. Re-serialising through JSON.parse would rewrite
        // large numbers (losing precision) and discard the author's formatting.
        const text = await readTextFile(file)
        doc.replace(text)
        toast.success(`Loaded ${file.name}`)
      } catch {
        toast.error(`Could not read ${file.name}`)
      } finally {
        setLoadingFile(false)
      }
    },
    [doc, settings.tabSize],
  )

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        toast.info('Your clipboard is empty')
        return
      }
      try {
        doc.replace(JSON.stringify(JSON.parse(text), null, settings.tabSize))
        toast.success('Pasted and formatted')
      } catch {
        doc.replace(text)
        toast.success('Pasted', { description: 'The content is not valid JSON yet.' })
      }
    } catch {
      toast.error('Clipboard access was blocked', {
        description: 'Paste directly into the editor instead.',
      })
    }
  }, [doc, settings.tabSize])

  const csvAvailable = useMemo(() => {
    if (activeDoc.analysis.status !== 'valid') return false
    return (
      activeDoc.analysis.stats.rootType === 'array' ||
      activeDoc.analysis.stats.rootType === 'object'
    )
  }, [activeDoc.analysis])

  const handleDownload = useCallback(
    (filename: string, format: DownloadFormat, minified: boolean) => {
      try {
        if (format === 'csv') {
          downloadCSV(activeDoc.text, `${filename}.csv`)
          toast.success(`Saved ${filename}.csv`)
          return
        }
        const payload = minified ? minifyText(activeDoc.text) : activeDoc.text
        downloadJSON(payload, `${filename}.json`)
        toast.success(`Saved ${filename}.json`)
      } catch (error) {
        toast.error('Could not save the file', { description: (error as Error).message })
      }
    },
    [activeDoc.text],
  )

  // ── Transform actions with feedback ───────────────────────────────────────
  const runTransform = useCallback(
    async (
      target: typeof doc,
      op: 'format' | 'minify' | 'repair' | 'sortKeys',
      messages: { empty: string; success: string; failure: string },
    ) => {
      if (target.text.trim() === '') {
        toast.info(messages.empty)
        return
      }
      try {
        await target.apply(op)
        toast.success(messages.success)
      } catch (error) {
        toast.error(messages.failure, { description: (error as Error).message })
      }
    },
    [],
  )

  const copyDocument = useCallback(async () => {
    if (activeDoc.text.trim() === '') {
      toast.info('Nothing to copy yet')
      return
    }
    const ok = await copyToClipboard(activeDoc.text)
    if (ok) toast.success(activeSubject ? `Copied ${activeSubject}` : 'Copied the document')
    else toast.error('Could not copy to the clipboard')
  }, [activeDoc.text, activeSubject])

  const clearDocument = useCallback(() => {
    if (activeDoc.text.trim() === '') {
      toast.info(activeSubject ? `${activeSubject} is already empty` : 'The editor is already empty')
      return
    }
    activeDoc.clear()
    if (!inCompare) setSearchTerm('')
    toast.success(activeSubject ? `Cleared ${activeSubject}` : 'Cleared the editor', {
      action: { label: 'Undo', onClick: () => activeDoc.undo() },
    })
  }, [activeDoc, activeSubject, inCompare])

  const share = useCallback(async () => {
    const { url, reason } = await buildShareUrl(activeDoc.text)
    if (!url) {
      toast.error(reason ?? 'Could not create a link')
      return
    }
    const ok = await copyToClipboard(url)
    if (ok) {
      toast.success('Link copied', {
        description: 'The document travels inside the link, not through a server.',
      })
    } else {
      toast.error('Could not copy the link')
    }
  }, [activeDoc.text])

  const swapCompare = useCallback(() => {
    const previousLeft = left.text
    left.replace(right.text, { snapshot: false })
    right.replace(previousLeft, { snapshot: false })
    toast.success('Swapped sides')
  }, [left, right])

  // ── Command registry ──────────────────────────────────────────────────────
  const hasContent = activeDoc.text.trim() !== ''
  const isValid = activeDoc.analysis.status === 'valid'

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'transform.format',
        title: 'Format document',
        group: 'Transform',
        icon: Sparkles,
        binding: BINDINGS.format,
        keywords: 'beautify pretty indent',
        enabled: hasContent,
        run: () =>
          runTransform(activeDoc, 'format', {
            empty: 'Nothing to format yet',
            success: 'Formatted',
            failure: 'Could not format — fix the syntax errors first',
          }),
      },
      {
        id: 'transform.minify',
        title: 'Minify document',
        group: 'Transform',
        icon: Minimize2,
        binding: BINDINGS.minify,
        keywords: 'compact compress strip whitespace',
        enabled: hasContent,
        run: () =>
          runTransform(activeDoc, 'minify', {
            empty: 'Nothing to minify yet',
            success: 'Minified',
            failure: 'Could not minify — fix the syntax errors first',
          }),
      },
      {
        id: 'transform.sortKeys',
        title: 'Sort keys alphabetically',
        group: 'Transform',
        icon: SortAsc,
        binding: BINDINGS.sortKeys,
        keywords: 'order alphabetical normalise',
        enabled: hasContent && isValid,
        run: () =>
          runTransform(activeDoc, 'sortKeys', {
            empty: 'Nothing to sort yet',
            success: 'Keys sorted',
            failure: 'Could not sort keys',
          }),
      },
      {
        id: 'transform.repair',
        title: 'Repair invalid JSON',
        group: 'Transform',
        icon: Wand2,
        binding: BINDINGS.repair,
        detail: activeDoc.analysis.canRepair ? 'A fix is available' : undefined,
        keywords: 'fix broken heal',
        enabled: activeDoc.analysis.canRepair,
        run: () =>
          runTransform(activeDoc, 'repair', {
            empty: 'Nothing to repair yet',
            success: 'Repaired and formatted',
            failure: 'Could not repair this document',
          }),
      },
      {
        id: 'document.copy',
        title: 'Copy document',
        group: 'Document',
        icon: Copy,
        binding: BINDINGS.copy,
        enabled: hasContent,
        run: copyDocument,
      },
      {
        id: 'document.download',
        title: 'Save as file…',
        group: 'Document',
        icon: Download,
        binding: BINDINGS.download,
        keywords: 'export json csv save',
        enabled: hasContent,
        run: () => setDownloadOpen(true),
      },
      {
        id: 'document.open',
        title: 'Open a file…',
        group: 'Document',
        icon: Upload,
        binding: BINDINGS.open,
        keywords: 'import upload json csv',
        allowInInput: true,
        run: () => fileInputRef.current?.click(),
      },
      {
        id: 'document.paste',
        title: 'Paste from clipboard',
        group: 'Document',
        icon: ClipboardPaste,
        binding: BINDINGS.paste,
        run: pasteFromClipboard,
      },
      {
        id: 'document.sample',
        title: 'Load sample document',
        group: 'Document',
        icon: FileJson2,
        keywords: 'example demo try',
        run: () => {
          doc.replace(SAMPLE_JSON)
          toast.success('Loaded a sample document')
        },
      },
      {
        id: 'document.share',
        title: 'Copy shareable link',
        group: 'Document',
        icon: Link2,
        binding: BINDINGS.share,
        detail: 'The document is encoded in the link itself',
        enabled: hasContent,
        run: share,
      },
      {
        id: 'document.clear',
        title: 'Clear',
        group: 'Document',
        icon: Eraser,
        binding: BINDINGS.clear,
        destructive: true,
        detail: 'Undo is offered afterwards',
        run: clearDocument,
      },
      {
        id: 'document.restore',
        title: 'Restore previous content',
        group: 'Document',
        icon: Undo2,
        binding: BINDINGS.restore,
        enabled: activeDoc.canUndo,
        run: () => {
          activeDoc.undo()
          toast.success('Restored the previous content')
        },
      },
      {
        id: 'navigate.search',
        title: 'Find in document',
        group: 'Navigate',
        icon: Search,
        binding: BINDINGS.search,
        keywords: 'search filter keys values',
        allowInInput: true,
        run: openSearch,
      },
      {
        id: 'navigate.nextMatch',
        title: 'Next match',
        group: 'Navigate',
        icon: MoveDown,
        binding: BINDINGS.nextMatch,
        enabled: searchResults.matches.length > 0,
        allowInInput: true,
        run: () => stepMatch(1),
      },
      {
        id: 'navigate.previousMatch',
        title: 'Previous match',
        group: 'Navigate',
        icon: MoveUp,
        binding: BINDINGS.previousMatch,
        enabled: searchResults.matches.length > 0,
        allowInInput: true,
        run: () => stepMatch(-1),
      },
      {
        id: 'navigate.error',
        title: 'Go to first error',
        group: 'Navigate',
        icon: ArrowDownToLine,
        binding: BINDINGS.goToError,
        enabled: Boolean(activeDoc.analysis.error?.line),
        run: goToError,
      },
      {
        id: 'view.editor',
        title: 'Go to Editor',
        group: 'View',
        icon: FileJson2,
        binding: BINDINGS.editor,
        run: () => setWorkspace('editor'),
      },
      {
        id: 'view.tree',
        title: 'Go to Tree',
        group: 'View',
        icon: ListTree,
        binding: BINDINGS.tree,
        run: () => setWorkspace('tree'),
      },
      {
        id: 'view.compare',
        title: 'Go to Compare',
        group: 'View',
        icon: GitCompare,
        binding: BINDINGS.compare,
        run: () => setWorkspace('compare'),
      },
      {
        id: 'view.query',
        title: 'Go to Query',
        group: 'View',
        icon: Terminal,
        binding: BINDINGS.query,
        run: () => setWorkspace('query'),
      },
      {
        id: 'view.inspector',
        title: 'Toggle inspector',
        group: 'View',
        icon: PanelRight,
        binding: BINDINGS.inspector,
        run: toggleInspector,
      },
      {
        id: 'view.theme',
        title: 'Toggle light / dark theme',
        group: 'View',
        icon: Palette,
        binding: BINDINGS.theme,
        run: () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'view.settings',
        title: 'Open settings',
        group: 'View',
        icon: Settings,
        binding: BINDINGS.settings,
        // `,` cannot be expressed safely as a hotkeys-js binding, so match the raw
        // event. Without this, ⌘C was interpreted as ⌘, and opened this dialog.
        keyMatcher: (event) =>
          event.key === ',' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey,
        run: () => setSettingsOpen(true),
      },
      {
        id: 'compare.sendLeft',
        title: 'Compare this document…',
        group: 'Compare',
        icon: GitCompare,
        detail: 'Copies it into the Original side and opens Compare',
        keywords: 'diff send original left handoff',
        enabled: doc.text.trim() !== '',
        run: () => {
          left.replace(doc.text)
          setWorkspace('compare')
          toast.success('Sent to the Original side', {
            description: 'Paste or open the other version on the Changed side.',
          })
        },
      },
      {
        id: 'compare.sendRight',
        title: 'Compare: send this document to the Changed side',
        group: 'Compare',
        icon: GitCompare,
        keywords: 'diff send changed right handoff',
        enabled: doc.text.trim() !== '',
        run: () => {
          right.replace(doc.text)
          setWorkspace('compare')
          toast.success('Sent to the Changed side')
        },
      },
      {
        id: 'compare.toggleDiff',
        title:
          compareOptions.mode === 'diff'
            ? 'Compare: edit both sides'
            : 'Compare: show differences',
        group: 'Compare',
        icon: GitCompare,
        binding: BINDINGS.toggleDiff,
        detail: 'The diff view is read-only; typing in it returns you here',
        keywords: 'diff differences edit toggle',
        enabled: left.text.trim() !== '' && right.text.trim() !== '',
        run: () => {
          setWorkspace('compare')
          setCompareOptions((current) => ({
            ...current,
            mode: current.mode === 'diff' ? 'edit' : 'diff',
          }))
        },
      },
      {
        id: 'compare.swap',
        title: 'Compare: swap sides',
        group: 'Compare',
        icon: GitCompare,
        run: swapCompare,
      },
      {
        id: 'help.shortcuts',
        title: 'Keyboard shortcuts',
        group: 'Help',
        icon: Keyboard,
        binding: BINDINGS.shortcuts,
        // `?` reaches the browser as a shifted `/`; different input stacks report
        // it as either the resulting character or the physical key.
        keyMatcher: (event) =>
          (event.key === '?' || (event.key === '/' && event.shiftKey)) &&
          !event.metaKey &&
          !event.ctrlKey,
        run: () => setShortcutsOpen(true),
      },
      {
        id: 'help.palette',
        title: 'Open command palette',
        group: 'Help',
        icon: Search,
        binding: BINDINGS.palette,
        allowInInput: true,
        hiddenInPalette: true,
        run: () => setPaletteOpen((open) => !open),
      },
    ]

    return list
  }, [
    doc,
    left,
    right,
    activeDoc,
    activeSubject,
    hasContent,
    isValid,
    runTransform,
    copyDocument,
    pasteFromClipboard,
    share,
    clearDocument,
    openSearch,
    stepMatch,
    goToError,
    searchResults.matches.length,
    setWorkspace,
    toggleInspector,
    setPreference,
    resolved,
    swapCompare,
    compareOptions.mode,
    right,
  ])

  useShortcuts(commands)

  // ── Tree data ─────────────────────────────────────────────────────────────
  const treeData = useMemo(() => {
    if (workspace !== 'tree') return null
    if (doc.analysis.status !== 'valid') return null
    try {
      return JSON.parse(doc.text) as unknown
    } catch {
      return null
    }
  }, [workspace, doc.text, doc.analysis.status])

  /**
   * In Compare there are two visible documents, so the inspector must say which one
   * it is reading — and let you switch without hunting for focus (the panel covers
   * the panes entirely on phones).
   */
  const subjectControl = inCompare ? (
    <Segmented<ComparePane>
      label="Inspect which side"
      size="sm"
      value={activePane}
      onChange={setActivePane}
      options={[
        { value: 'left', label: 'Original', title: 'Inspect the Original side' },
        { value: 'right', label: 'Changed', title: 'Inspect the Changed side' },
      ]}
    />
  ) : null

  const inspectorContent = () => {
    if (inspectorTab === 'search') {
      return (
        <SearchPanel
          term={searchTerm}
          onTermChange={setSearchTerm}
          options={searchOptions}
          onOptionsChange={(patch) => setSearchOptions((current) => ({ ...current, ...patch }))}
          results={searchResults}
          activeIndex={activeMatch}
          onActivate={revealMatch}
          onNext={() => stepMatch(1)}
          onPrevious={() => stepMatch(-1)}
          searching={searching}
          inputRef={searchInputRef}
        />
      )
    }
    if (inspectorTab === 'query') {
      return (
        <QueryPanel
          expression={queryExpression}
          onExpressionChange={setQueryExpression}
          result={queryResult}
          running={querying}
          onCopyResults={async () => {
            const ok = await copyToClipboard(
              JSON.stringify(queryResult.matches.map((match) => match.preview), null, 2),
            )
            if (ok) toast.success('Copied the query results')
          }}
          onSelectPath={(path) => revealSegments(parsePath(path))}
          compact
        />
      )
    }
    return <StatsPanel analysis={activeDoc.analysis} />
  }

  const showEmptyState =
    workspace === 'editor' && !doc.restoring && doc.text.length === 0 && !loadingFile

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
        <a
          href="#workspace"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground"
        >
          Skip to editor
        </a>

        {/*
          The page needs one heading that says what this is, for screen readers arriving at
          an unfamiliar tool and for crawlers, which otherwise see an app with no headings
          at all. Visually hidden because the top bar already carries the brand, and a
          headline would cost vertical space this dense layout does not have.
        */}
        <h1 className="sr-only">
          JsonBro — JSON editor, formatter, validator, tree viewer and diff tool
        </h1>

        <TopBar
          commands={commands}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
          themePreference={preference}
          onThemeChange={setPreference}
          inspectorOpen={inspectorOpen}
          onToggleInspector={toggleInspector}
          onOpenPalette={() => setPaletteOpen(true)}
          paletteBinding={BINDINGS.palette}
          busy={doc.busy !== null}
        />

        <main
          id="workspace"
          className="relative flex min-h-0 flex-1"
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) void processFile(file)
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            {workspace === 'editor' && (
              <div className="relative min-h-0 flex-1">
                <Suspense fallback={<EditorSkeleton />}>
                  <JsonEditor
                    ref={editorRef}
                    value={doc.text}
                    onChange={doc.setText}
                    resolvedTheme={resolved}
                    // The minimap costs width that phones cannot spare.
                    settings={isNarrow ? { ...settings, minimap: false } : settings}
                    fontSize={effectiveFontSize}
                    rootPx={rootPx}
                    ariaLabel="JSON editor"
                    onCursorChange={setCursor}
                    highlights={highlights}
                    errorLine={doc.analysis.error?.line}
                    className="h-full"
                  />
                </Suspense>

                {!doc.analysis.error && typingSettled && doc.analysis.duplicateKeys.length > 0 && (
                  <DuplicateKeyNotice keys={doc.analysis.duplicateKeys} />
                )}

                {doc.analysis.error && typingSettled && (
                  <ErrorBanner
                    key={doc.analysis.error.friendly}
                    error={doc.analysis.error}
                    canRepair={doc.analysis.canRepair}
                    repairing={doc.busy === 'repair'}
                    repairProbeSkipped={doc.analysis.repairProbeSkipped}
                    onJumpToError={goToError}
                    onRepair={() =>
                      void runTransform(doc, 'repair', {
                        empty: 'Nothing to repair yet',
                        success: 'Repaired and formatted',
                        failure: 'Could not repair this document',
                      })
                    }
                  />
                )}

                {showEmptyState && (
                  <EmptyState
                    onPaste={pasteFromClipboard}
                    onUpload={() => fileInputRef.current?.click()}
                    onLoadSample={() => doc.replace(SAMPLE_JSON)}
                    onOpenPalette={() => setPaletteOpen(true)}
                    paletteBinding={BINDINGS.palette}
                    hints={[
                      { label: 'Format', binding: BINDINGS.format },
                      { label: 'Find', binding: BINDINGS.search },
                      { label: 'Open file', binding: BINDINGS.open },
                      { label: 'Shortcuts', binding: BINDINGS.shortcuts },
                    ]}
                  />
                )}
              </div>
            )}

            {workspace === 'tree' &&
              (treeData !== null ? (
                <TreeView
                  data={treeData}
                  text={doc.text}
                  onTextChange={doc.setText}
                  indent={settings.tabSize}
                  rootPx={rootPx}
                  editable
                  onRevealPath={revealSegments}
                  onCopyPath={copyPath}
                  onCopyValue={async (value) => {
                    const ok = await copyToClipboard(JSON.stringify(value, null, settings.tabSize))
                    if (ok) toast.success('Copied the value')
                  }}
                  selectedPath={cursor.path}
                  onNotice={(message) => toast.info(message)}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                  <ListTree className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    {doc.text.trim() === ''
                      ? 'Add a document to browse its structure.'
                      : 'The tree appears once the document is valid JSON.'}
                  </p>
                  {doc.analysis.error && (
                    <button
                      type="button"
                      onClick={() => setWorkspace('editor')}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      Go to the editor to fix it
                    </button>
                  )}
                </div>
              ))}

            {workspace === 'compare' && (
              <Suspense fallback={<EditorSkeleton />}>
                <CompareWorkspace
                  left={left}
                  right={right}
                  leftRef={leftEditorRef}
                  rightRef={rightEditorRef}
                  activePane={activePane}
                  onActivePaneChange={setActivePane}
                  highlights={highlights}
                  options={compareOptions}
                  onOptionsChange={(patch) =>
                    setCompareOptions((current) => ({ ...current, ...patch }))
                  }
                  settings={settings}
                  fontSize={effectiveFontSize}
                  rootPx={rootPx}
                  resolvedTheme={resolved}
                  service={service}
                  onCopyPath={copyPath}
                  onSwap={swapCompare}
                  isNarrow={isNarrow}
                  mainDocumentText={doc.text}
                  onUseMainDocument={(pane) => {
                    const target = pane === 'right' ? right : left
                    target.replace(doc.text)
                    setActivePane(pane)
                    toast.success(
                      pane === 'right' ? 'Filled the Changed side' : 'Filled the Original side',
                    )
                  }}
                />
              </Suspense>
            )}

            {workspace === 'query' && (
              <QueryPanel
                expression={queryExpression}
                onExpressionChange={setQueryExpression}
                result={queryResult}
                running={querying}
                onCopyResults={async () => {
                  const ok = await copyToClipboard(
                    JSON.stringify(queryResult.matches.map((match) => match.preview), null, 2),
                  )
                  if (ok) toast.success('Copied the query results')
                }}
                onSelectPath={(path) => revealSegments(parsePath(path))}
              />
            )}
          </div>

          {inspectorOpen && workspace !== 'query' && !isNarrow && (
            <Inspector
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              onClose={toggleInspector}
              matchCount={searchResults.total}
              subjectControl={subjectControl}
            >
              {inspectorContent()}
            </Inspector>
          )}

          {/* On phones the inspector becomes a sheet so it never squeezes the editor. */}
          {inspectorOpen && workspace !== 'query' && isNarrow && (
            <>
              <button
                type="button"
                aria-label="Close inspector"
                className="absolute inset-0 z-40 bg-background/60 backdrop-blur-sm"
                onClick={toggleInspector}
              />
              <div className="absolute inset-x-0 bottom-0 z-50 flex h-[65%] flex-col rounded-t-xl border-t bg-surface shadow-overlay animate-slide-up">
                <Inspector
                  tab={inspectorTab}
                  onTabChange={setInspectorTab}
                  onClose={toggleInspector}
                  matchCount={searchResults.total}
                  subjectControl={subjectControl}
                >
                  {inspectorContent()}
                </Inspector>
              </div>
            </>
          )}

          {isDragging && (
            <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
              <div className="text-center">
                <Upload className="mx-auto mb-2 h-7 w-7 text-primary" aria-hidden="true" />
                <p className="text-sm font-semibold">Drop a .json or .csv file</p>
              </div>
            </div>
          )}

          {loadingFile && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground">Reading file…</p>
            </div>
          )}
        </main>

        <StatusBar>
          {workspace === 'compare' ? (
            <div className="flex w-full items-center gap-3">
              <span className="font-semibold uppercase tracking-wide">Compare</span>
              <span className="text-muted-foreground">
                {compareOptions.mode === 'diff' ? 'Reviewing changes' : 'Editing both sides'}
              </span>
            </div>
          ) : (
            <PaneStatus
              analysis={doc.analysis}
              analyzing={doc.analyzing}
              cursor={workspace === 'editor' ? { line: cursor.line, column: cursor.column } : undefined}
              path={cursor.path}
              onCopyPath={copyPath}
            />
          )}
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            <span className="text-muted-foreground/70">UTF-8</span>
          </span>
        </StatusBar>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,.txt,application/json,text/csv"
          className="hidden"
          aria-label="Choose a JSON or CSV file"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void processFile(file)
            event.target.value = ''
          }}
        />

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
        <ShortcutsDialog
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
          commands={commands}
        />
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onChange={updateSettings}
          onReset={resetSettings}
          themePreference={preference}
          onThemeChange={setPreference}
          usingWorker={service.usingWorker}
        />
        <DownloadDialog
          open={downloadOpen}
          onOpenChange={setDownloadOpen}
          defaultFilename={`jsonbro-${new Date().toISOString().slice(0, 10)}`}
          minified={false}
          onDownload={handleDownload}
          csvAvailable={csvAvailable}
        />
      </div>
    </TooltipProvider>
  )
}
