import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import type { editor } from 'monaco-editor';
import {
  Download,
  Upload,
  Copy,
  Trash2,
  Search,
  Moon,
  Sun,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  GitCompare,
  Pencil,
  ArrowLeft,
  FileCode,
  FileCheck,
  Minimize2,
  Save,
  Settings,
  Grid,
  Sparkles,
  Scaling,
  Split,
  Columns
} from 'lucide-react';
import { GitHubStars } from './GitHubStars';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  parseJSONSafe,
  formatJSON,
  minifyJSON,
  copyToClipboard,
  downloadJSON,
  parseJSONFile,
  searchJSON,
  KEYBOARD_SHORTCUTS,
  isShortcut,
  getShortcutText,
  type JSONNode
} from '../utils/jsonUtils';
import { MonacoJSONEditor } from './MonacoJSONEditor';
import Editor, { DiffEditor } from '@monaco-editor/react';
import ReactJson from 'react-json-view';

interface JSONViewerProps {
  theme?: string;
  setTheme?: (theme: string) => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function JSONViewer({ theme = 'light', setTheme }: JSONViewerProps = {}) {
  // For diff mode - Load saved inputs from localStorage on mount
  const [leftInput, setLeftInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('json-viewer-diff-left');
      return saved || '';
    }
    return '';
  });
  const [rightInput, setRightInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('json-viewer-diff-right');
      return saved || '';
    }
    return '';
  });
  const [showDiff, setShowDiff] = useState(false);
  const leftEditorRef = useRef<any>(null);
  const rightEditorRef = useRef<any>(null);
  const diffEditorRef = useRef<any>(null);
  const [currentDiffIndex, setCurrentDiffIndex] = useState<number>(-1);
  const [totalDiffs, setTotalDiffs] = useState<number>(0);
  // Load saved input from localStorage on mount
  const [input, setInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('json-viewer-input');
      return saved || '';
    }
    return '';
  });
  const [error, setError] = useState<{ message: string; line?: number; column?: number; position?: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<JSONNode[]>([]);
  const [activeSearchResult, setActiveSearchResult] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [viewMode, setViewMode] = useState<'formatted' | 'diff'>('formatted');
  const [isFormatting, setIsFormatting] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ lineNumber: 1, column: 1 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // Passive validation - only for status indicators, doesn't interrupt editing
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid' | 'empty'>('empty');

  // Save input to localStorage when it changes (only in normal mode)
  useEffect(() => {
    if (viewMode === 'formatted' && typeof window !== 'undefined') {
      localStorage.setItem('json-viewer-input', input);
    }
  }, [input, viewMode]);

  // Save diff mode inputs to localStorage when they change
  useEffect(() => {
    if (viewMode === 'diff' && typeof window !== 'undefined') {
      localStorage.setItem('json-viewer-diff-left', leftInput);
    }
  }, [leftInput, viewMode]);

  useEffect(() => {
    if (viewMode === 'diff' && typeof window !== 'undefined') {
      localStorage.setItem('json-viewer-diff-right', rightInput);
    }
  }, [rightInput, viewMode]);

  useEffect(() => {
    // Only update passive validation status, don't set error states
    if (input.trim() === '') {
      setValidationStatus('empty');
      return;
    }

    const timer = setTimeout(() => {
      try {
        const { data, error: parseError } = parseJSONSafe(input);
        setValidationStatus(parseError ? 'invalid' : 'valid');
      } catch (err) {
        setValidationStatus('invalid');
      }
    }, 500); // Longer debounce for less intrusive validation

    return () => clearTimeout(timer);
  }, [input]);

  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
  }, []);

  // Handle diff navigation
  const navigateDiff = useCallback((direction: 'next' | 'previous') => {
    if (!diffEditorRef.current) return;

    const diffEditor = diffEditorRef.current;
    const model = diffEditor.getModel();
    if (!model) return;

    const lineChanges = diffEditor.getLineChanges() || [];
    if (lineChanges.length === 0) return;

    // Calculate the next index
    let nextIndex = direction === 'next'
      ? (currentDiffIndex + 1) % lineChanges.length
      : (currentDiffIndex - 1 + lineChanges.length) % lineChanges.length;

    const change = lineChanges[nextIndex];
    if (!change) return;

    // Scroll to the change in both editors
    diffEditor.revealLineInCenter(change.originalStartLineNumber, 1); // 1 = center
    diffEditor.revealLineInCenter(change.modifiedStartLineNumber, 1);

    // Set the cursor to the change
    diffEditor.setPosition({
      lineNumber: change.originalStartLineNumber,
      column: 1
    });

    // Update the diff indicator
    setCurrentDiffIndex(nextIndex);
    setTotalDiffs(lineChanges.length);
  }, [currentDiffIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Disable all shortcuts in diff mode
      if (viewMode === 'diff') {
        return;
      }
      // Get the active element
      const activeElement = document.activeElement;
      if (!activeElement) return;

      // Check if we're in a Monaco editor by checking the parent chain
      let isMonacoEditor = false;
      let current: HTMLElement | null = activeElement as HTMLElement;
      while (current) {
        if ((current as any).__isMonacoEditor) {
          isMonacoEditor = true;
          break;
        }
        current = current.parentElement;
      }

      // If we're in Monaco editor, allow our custom shortcuts and block standard ones
      if (isMonacoEditor) {
        // Check if this matches one of our custom shortcuts
        const matchedShortcut = Object.values(KEYBOARD_SHORTCUTS).find(shortcut =>
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          event.shiftKey === ((shortcut as any).shift || false) &&
          (shortcut.key === 'delete'
            ? (event.key === 'Delete' || event.key === 'Backspace')
            : event.key.toLowerCase() === shortcut.key.toLowerCase())
        );

        // If it's one of our shortcuts, allow it to proceed
        if (matchedShortcut) {
          // Continue to the shortcut handling below
        } else {
          // For standard shortcuts (copy, paste, etc.), let Monaco handle them
          const standardShortcuts = ['c', 'v', 'x', 'a', 'z', 'y', 'f'];
          if (standardShortcuts.includes(event.key.toLowerCase()) &&
            (event.ctrlKey || event.metaKey)) {
            return; // Let Monaco handle these
          }
          // For other key combinations, don't handle them
          return;
        }
      }

      if (isShortcut(event, KEYBOARD_SHORTCUTS.FORMAT)) {
        event.preventDefault();
        handleFormat();
      } else if (isShortcut(event, KEYBOARD_SHORTCUTS.MINIFY)) {
        event.preventDefault();
        handleMinify();
      } else if (isShortcut(event, KEYBOARD_SHORTCUTS.COPY)) {
        event.preventDefault();
        handleCopy();
      } else if (isShortcut(event, KEYBOARD_SHORTCUTS.CLEAR)) {
        event.preventDefault();
        handleClear();
      } else if (isShortcut(event, KEYBOARD_SHORTCUTS.SEARCH)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (isShortcut(event, KEYBOARD_SHORTCUTS.SAVE)) {
        event.preventDefault();
        handleDownload();
      } else if (isShortcut(event, KEYBOARD_SHORTCUTS.UPLOAD)) {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [input, viewMode]);

  // Handle editor mount
  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    // Store the editor instance in the ref
    editorRef.current = editor;
    setEditorInstance(editor);

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        lineNumber: e.position.lineNumber,
        column: e.position.column
      });
    });

    // Set up a small delay to ensure the editor is fully initialized
    const timer = setTimeout(() => {
      try {
        // Focus the editor and set cursor to the beginning
        editor.focus();
        editor.setPosition({ lineNumber: 1, column: 1 });
      } catch (error) {
        console.error('Error focusing editor:', error);
      }
    }, 100);

    // Clean up the timer if the component unmounts
    return () => clearTimeout(timer);
  }, []);

  // Handle search result click
  const handleSearchResultClick = useCallback((result: JSONNode, index: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    setActiveSearchResult(index);

    try {
      const model = editor.getModel();
      if (!model) return;

      // Get the JSON string and the value to search for
      const jsonString = model.getValue();

      // Convert the path to a string representation that can be found in the JSON
      // The path is already a string in the format 'root.property.subproperty'
      const pathString = result.path.replace(/^root\.?/, ''); // Remove 'root.' prefix if it exists
      const valueString = typeof result.value === 'string' ? `"${result.value}"` : String(result.value);

      // Find the position of the value in the JSON string
      // First, try to find the exact match with the full path
      let searchPattern = new RegExp(`"${escapeRegExp(pathString)}"\\s*:\\s*${escapeRegExp(valueString)}`, 'g');
      let match;
      let matchIndex = 0;
      let foundPosition = -1;

      // Find the nth occurrence that matches our search
      while ((match = searchPattern.exec(jsonString)) !== null) {
        if (matchIndex === index) {
          foundPosition = match.index;
          break;
        }
        matchIndex++;
      }

      // If not found with full path, try with just the value
      if (foundPosition === -1) {
        searchPattern = new RegExp(escapeRegExp(valueString), 'g');
        matchIndex = 0;

        while ((match = searchPattern.exec(jsonString)) !== null) {
          if (matchIndex === index) {
            foundPosition = match.index;
            break;
          }
          matchIndex++;
        }
      }

      if (foundPosition === -1) return;

      // Get the position in the editor
      const startPos = model.getPositionAt(foundPosition);
      const endPos = model.getPositionAt(foundPosition + valueString.length);

      // Reveal the line and set the cursor position
      editor.revealLineInCenter(startPos.lineNumber);
      editor.setPosition(startPos);

      // Set the selection to highlight the match
      editor.setSelection({
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column
      });

      // Focus the editor
      editor.focus();
    } catch (error) {
      console.error('Error navigating to search result:', error);
    }
  }, []);

  // Helper function to escape special regex characters
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // Search functionality
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setActiveSearchResult(null);
      return;
    }

    try {
      const { data, error } = parseJSONSafe(input);
      if (error) {
        setSearchResults([]);
        return;
      }
      // Allow searching even if data is null (for root-level null values)
      const results = searchJSON(data, searchTerm);
      setSearchResults(results);
    } catch (err) {
      setSearchResults([]);
    }
  }, [searchTerm, input]);

  const handleFormat = useCallback(() => {
    if (!input.trim()) {
      addToast('No JSON to format', 'error');
      return;
    }

    setIsFormatting(true);

    try {
      const { data, error: parseError } = parseJSONSafe(input);
      if (parseError) {
        // Show error but preserve original content - don't modify editor
        addToast('Invalid JSON syntax - Please check your syntax and try again', 'error');
        return;
      }

      const formatted = formatJSON(data);

      // Preserve cursor position
      const editor = editorRef.current;
      const position = editor ? editor.getPosition() : null;

      setInput(formatted);

      // Restore cursor position after formatting
      setTimeout(() => {
        if (editor && position) {
          editor.setPosition(position);
          editor.focus();
        }
      }, 50);

      addToast('JSON formatted successfully', 'success');
    } catch (err) {
      addToast('Failed to format JSON', 'error');
    } finally {
      setIsFormatting(false);
    }
  }, [input, addToast]);

  const handleMinify = useCallback(() => {
    if (!input.trim()) {
      addToast('No JSON to minify', 'error');
      return;
    }

    setIsFormatting(true);

    try {
      const { data, error: parseError } = parseJSONSafe(input);
      if (parseError) {
        // Show error but preserve original content - don't modify editor
        addToast('Invalid JSON syntax - Please check your syntax and try again', 'error');
        return;
      }

      const minified = minifyJSON(data);

      // Preserve cursor position
      const editor = editorRef.current;
      const position = editor ? editor.getPosition() : null;

      setInput(minified);

      // Restore cursor position after minifying
      setTimeout(() => {
        if (editor && position) {
          editor.setPosition(position);
          editor.focus();
        }
      }, 50);

      addToast('JSON minified successfully', 'success');
    } catch (err) {
      addToast('Failed to minify JSON', 'error');
    } finally {
      setIsFormatting(false);
    }
  }, [input, addToast]);

  const handleCopy = useCallback(async () => {
    if (!input.trim()) {
      addToast('No JSON to copy', 'error');
      return;
    }

    // Validate before copying - only show error if invalid
    const { data, error: parseError } = parseJSONSafe(input);
    if (parseError) {
      addToast('Invalid JSON - Cannot copy invalid syntax', 'error');
      return;
    }

    const success = await copyToClipboard(input);
    if (success) {
      addToast('JSON copied to clipboard', 'success');
    } else {
      addToast('Failed to copy JSON', 'error');
    }
  }, [input, addToast]);

  const handleClear = useCallback(() => {
    if (viewMode === 'diff') {
      setLeftInput('');
      setRightInput('');
      if (showDiff) {
        setShowDiff(false);
      }
      addToast('Both editors cleared', 'info');
    } else {
      setInput('');
      setSearchTerm('');
      setSearchResults([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('json-viewer-input');
      }
      addToast('JSON cleared', 'info');
    }
  }, [viewMode, showDiff, addToast]);

  const handleDownload = useCallback(() => {
    if (!input.trim()) {
      addToast('No JSON to download', 'error');
      return;
    }

    // Validate before downloading - only show error if invalid
    const { data, error: parseError } = parseJSONSafe(input);
    if (parseError) {
      addToast('Invalid JSON - Cannot download invalid syntax', 'error');
      return;
    }

    const filename = data && typeof data === 'object' && Object.keys(data).length > 0
      ? `formatted_${Date.now()}.json`
      : 'formatted.json';

    downloadJSON(input, filename);
    addToast('JSON downloaded', 'success');
  }, [input, addToast]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      addToast('Please select a JSON file', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: parseError } = await parseJSONFile(file);

      if (parseError) {
        addToast('Invalid JSON file: ' + parseError.message, 'error');
        return;
      }

      setInput(JSON.stringify(data, null, 2));
      addToast(`Loaded ${file.name}`, 'success');
    } catch (err) {
      addToast('Failed to load file', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // Get current data for tree view
  const { data: parsedData } = parseJSONSafe(input);

  // Handlers for ReactJson onAdd/onEdit/onDelete to sync changes back to the editor
  const handleReactJsonAdd = (edit: any) => {
    try {
      if (edit && edit.updated_src) {
        const newValue = JSON.stringify(edit.updated_src, null, 2);
        setInput(newValue);
        setValidationStatus('valid');
        addToast('Property added', 'success');
      }
    } catch (err) {
      addToast('Failed to apply addition', 'error');
    }
  };

  const handleReactJsonEdit = (edit: any) => {
    try {
      if (edit && edit.updated_src) {
        const newValue = JSON.stringify(edit.updated_src, null, 2);
        setInput(newValue);
        setValidationStatus('valid');
        addToast('Property updated', 'success');
      }
    } catch (err) {
      addToast('Failed to apply edit', 'error');
    }
  };

  const handleReactJsonDelete = (edit: any) => {
    try {
      if (edit && edit.updated_src) {
        const newValue = JSON.stringify(edit.updated_src, null, 2);
        setInput(newValue);
        setValidationStatus('valid');
        addToast('Property deleted', 'success');
      }
    } catch (err) {
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background font-sans text-foreground overflow-hidden selection:bg-primary/10">
        {/* Header */}
        <header className="flex items-center justify-between px-4 3xl:px-8 4xl:px-12 5xl:px-16 py-3 3xl:py-4 4xl:py-5 5xl:py-6 border-b bg-background/80 backdrop-blur-md z-10 h-16 3xl:h-20 4xl:h-24 5xl:h-28 shrink-0 supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3 3xl:gap-5 4xl:gap-6 5xl:gap-8">
            <div className="flex items-center justify-center relative group">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <img
                src="/icon.svg"
                alt="JSON Icon"
                className="w-8 h-8 3xl:w-10 3xl:h-10 4xl:w-12 4xl:h-12 5xl:w-16 5xl:h-16 relative z-10"
                style={{
                  filter: 'drop-shadow(0 0 8px rgba(var(--primary), 0.3))',
                }}
              />
            </div>
            <div>
              <h1 className="text-lg 3xl:text-xl 4xl:text-2xl 5xl:text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">JsonBro.Dev</h1>
              <p className="text-[10px] 3xl:text-xs 4xl:text-sm 5xl:text-base text-muted-foreground font-medium tracking-widest opacity-80">Your bro for JSON formatting</p>
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex bg-muted/50 p-1 3xl:p-1.5 4xl:p-2 5xl:p-3 rounded-lg border border-border/40 shadow-inner">
              <button
                onClick={() => setViewMode('formatted')}
                className={`px-4 3xl:px-5 4xl:px-6 5xl:px-8 py-1.5 3xl:py-2 4xl:py-2.5 5xl:py-3 rounded-md text-sm 3xl:text-base 4xl:text-lg 5xl:text-xl font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'formatted'
                  ? 'bg-background text-primary shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  }`}
              >
                <FileText className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
                Editor
              </button>
              <button
                onClick={() => setViewMode('diff')}
                className={`px-4 3xl:px-5 4xl:px-6 5xl:px-8 py-1.5 3xl:py-2 4xl:py-2.5 5xl:py-3 rounded-md text-sm 3xl:text-base 4xl:text-lg 5xl:text-xl font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'diff'
                  ? 'bg-background text-orange-500 shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  }`}
              >
                <GitCompare className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
                Compare
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 3xl:gap-3 4xl:gap-4 5xl:gap-5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="h-9 w-9 3xl:h-11 3xl:w-11 4xl:h-12 4xl:w-12 5xl:h-14 5xl:w-14 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 text-muted-foreground">
                  <Upload className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                <p>Upload File <span className="text-muted-foreground ml-1">({getShortcutText(KEYBOARD_SHORTCUTS.UPLOAD)})</span></p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleFormat} disabled={viewMode === 'diff' || isFormatting} className="h-9 w-9 3xl:h-11 3xl:w-11 4xl:h-12 4xl:w-12 5xl:h-14 5xl:w-14 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 text-muted-foreground">
                  {isFormatting ? <Loader2 className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7 animate-spin" /> : <Sparkles className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                <p>Format <span className="text-muted-foreground ml-1">({getShortcutText(KEYBOARD_SHORTCUTS.FORMAT)})</span></p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleMinify} disabled={viewMode === 'diff' || isFormatting} className="h-9 w-9 3xl:h-11 3xl:w-11 4xl:h-12 4xl:w-12 5xl:h-14 5xl:w-14 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 text-muted-foreground">
                  <Minimize2 className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                <p>Minify <span className="text-muted-foreground ml-1">({getShortcutText(KEYBOARD_SHORTCUTS.MINIFY)})</span></p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border/50 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleCopy} className="h-9 w-9 3xl:h-11 3xl:w-11 4xl:h-12 4xl:w-12 5xl:h-14 5xl:w-14 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 text-muted-foreground">
                  <Copy className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                <p>Copy <span className="text-muted-foreground ml-1">({getShortcutText(KEYBOARD_SHORTCUTS.COPY)})</span></p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleDownload} className="h-9 w-9 3xl:h-11 3xl:w-11 4xl:h-12 4xl:w-12 5xl:h-14 5xl:w-14 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 text-muted-foreground">
                  <Download className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                <p>Save <span className="text-muted-foreground ml-1">({getShortcutText(KEYBOARD_SHORTCUTS.SAVE)})</span></p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleClear} className="h-9 w-9 3xl:h-11 3xl:w-11 4xl:h-12 4xl:w-12 5xl:h-14 5xl:w-14 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all duration-200 text-muted-foreground">
                  <Trash2 className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                <p>Clear <span className="text-muted-foreground ml-1">({getShortcutText(KEYBOARD_SHORTCUTS.CLEAR)})</span></p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border/50 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="h-9 w-9 3xl:h-11 3xl:w-11 4xl:h-12 4xl:w-12 5xl:h-14 5xl:w-14 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 text-muted-foreground">
                  {theme === 'dark' ? <Sun className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" /> : <Moon className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                <p>Toggle Theme</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border/50 mx-1" />

            <GitHubStars />
          </div>
        </header>

        {/* Main Content */}
        <main
          className={`flex-1 relative overflow-hidden ${isDragOver ? 'bg-primary/5' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-background/80 backdrop-blur-sm border-2 border-primary border-dashed m-4 rounded-xl">
              <div className="text-center">
                <Upload className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-bold">Drop JSON file here</h3>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-background/50 backdrop-blur-sm">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {viewMode === 'formatted' ? (
            <div className="h-full w-full relative group">
              <MonacoJSONEditor
                ref={editorRef}
                value={input}
                onChange={(value) => setInput(value || '')}
                theme={theme}
                height="100%"
                options={{
                  minimap: { enabled: true },
                  padding: { top: 20, bottom: 20 },
                  fontSize: Math.max(13, Math.min(28, 13 + (window.innerWidth - 1280) * 0.006)),
                  lineHeight: 1.6,
                  scrollBeyondLastLine: false,
                }}
                onMount={handleEditorDidMount}
              />



              {/* Hidden inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
              />
            </div>
          ) : (
            <div className="h-full w-full flex flex-col">
              {/* Diff Controls Sub-header */}
              <div className="flex items-center justify-between px-6 py-2 border-b bg-muted/30 h-12 shrink-0 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center space-x-3 bg-muted/50 p-1 rounded-lg border border-border/50">
                    <span
                      onClick={() => !(!leftInput.trim() || !rightInput.trim()) && setShowDiff(false)}
                      className={`text-xs font-medium px-2 transition-colors cursor-pointer hover:opacity-70 ${!showDiff ? 'text-foreground' : 'text-muted-foreground'} ${(!leftInput.trim() || !rightInput.trim()) ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      Edit
                    </span>
                    <Switch
                      checked={showDiff}
                      onCheckedChange={setShowDiff}
                      disabled={!leftInput.trim() || !rightInput.trim()}
                      className="data-[state=checked]:bg-primary !h-4 !w-8 [&>span]:!h-3 [&>span]:!w-3 [&>span]:data-[state=checked]:!translate-x-4"
                    />
                    <span
                      onClick={() => !(!leftInput.trim() || !rightInput.trim()) && setShowDiff(true)}
                      className={`text-xs font-medium px-2 transition-colors cursor-pointer hover:opacity-70 ${showDiff ? 'text-foreground' : 'text-muted-foreground'} ${(!leftInput.trim() || !rightInput.trim()) ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      Diff Result
                    </span>
                  </div>
                </div>

                {showDiff && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigateDiff('previous')} className="h-7 px-3 text-xs font-medium gap-1" disabled={totalDiffs === 0}>
                      <ArrowLeft className="w-3 h-3" /> Prev
                    </Button>
                    <span className="text-xs text-muted-foreground min-w-[100px] text-center font-mono">
                      {totalDiffs > 0 ? `${currentDiffIndex + 1} / ${totalDiffs}` : '0 changes'}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => navigateDiff('next')} className="h-7 px-3 text-xs font-medium gap-1" disabled={totalDiffs === 0}>
                      Next <ArrowLeft className="w-3 h-3 rotate-180" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 relative">
                {!showDiff ? (
                  <div className="flex h-full">
                    <div className="flex-1 flex flex-col border-r border-border/50">
                      <div className="px-4 py-2 bg-muted/10 border-b border-border/50 text-xs font-medium text-muted-foreground flex justify-between items-center">
                        <span className="flex items-center gap-2"><FileCode className="w-3 h-3" /> Original</span>
                        <span className="font-mono opacity-70">{leftInput.length} chars</span>
                      </div>
                      <div className="flex-1">
                        <MonacoJSONEditor
                          ref={leftEditorRef}
                          value={leftInput}
                          onChange={(value) => setLeftInput(value || '')}
                          theme={theme}
                          height="100%"
                          options={{ minimap: { enabled: false } }}
                        />
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col">
                      <div className="px-4 py-2 bg-muted/10 border-b border-border/50 text-xs font-medium text-muted-foreground flex justify-between items-center">
                        <span className="flex items-center gap-2"><FileCheck className="w-3 h-3" /> Modified</span>
                        <span className="font-mono opacity-70">{rightInput.length} chars</span>
                      </div>
                      <div className="flex-1">
                        <MonacoJSONEditor
                          ref={rightEditorRef}
                          value={rightInput}
                          onChange={(value) => setRightInput(value || '')}
                          theme={theme}
                          height="100%"
                          options={{ minimap: { enabled: false } }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <DiffEditor
                    height="100%"
                    theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                    original={leftInput}
                    modified={rightInput}
                    language="json"
                    onMount={(editor) => {
                      diffEditorRef.current = editor;
                      setTimeout(() => {
                        const lineChanges = editor.getLineChanges() || [];
                        setTotalDiffs(lineChanges.length);
                        if (lineChanges.length > 0) {
                          setCurrentDiffIndex(0);
                          const firstChange = lineChanges[0];
                          editor.revealLineInCenter(firstChange.originalStartLineNumber, 1);
                        }
                      }, 100);
                    }}
                    options={{
                      readOnly: true,
                      fontSize: 14,
                      renderSideBySide: true,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </main>

        {/* Footer Status Bar */}
        <footer className="flex items-center justify-between px-4 3xl:px-8 4xl:px-12 5xl:px-16 py-2 3xl:py-2.5 4xl:py-3 5xl:py-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 text-[11px] 3xl:text-xs 4xl:text-sm 5xl:text-base font-medium text-muted-foreground select-none h-9 3xl:h-10 4xl:h-12 5xl:h-14 shrink-0">
          <div className="flex items-center gap-3 3xl:gap-4 4xl:gap-5">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
              JSON
            </div>
            <div className="w-px h-3 bg-border" />
            {validationStatus === 'valid' && (
              <div className="flex items-center gap-1.5 text-green-500">
                <CheckCircle className="w-3 h-3 3xl:w-3.5 3xl:h-3.5 4xl:w-4 4xl:h-4 5xl:w-5 5xl:h-5" />
                Valid
              </div>
            )}
            {validationStatus === 'invalid' && (
              <div className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="w-3 h-3 3xl:w-3.5 3xl:h-3.5 4xl:w-4 4xl:h-4 5xl:w-5 5xl:h-5" />
                Invalid
              </div>
            )}
            {validationStatus === 'empty' && (
              <div className="flex items-center gap-1.5 text-muted-foreground opacity-70">
                Empty
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 3xl:gap-4 4xl:gap-5 5xl:gap-6 font-mono opacity-80">
            <span>{new TextEncoder().encode(input).length} bytes</span>
            <div className="w-px h-3 bg-border" />
            <span>Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}</span>
            <div className="w-px h-3 bg-border" />
            <span>UTF-8</span>
          </div>
        </footer>

        {/* Toasts */}
        <div className="fixed bottom-12 3xl:bottom-14 4xl:bottom-16 5xl:bottom-20 right-6 3xl:right-8 4xl:right-12 5xl:right-16 flex flex-col gap-2 3xl:gap-3 4xl:gap-4 5xl:gap-5 z-50 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`p-3 3xl:p-4 4xl:p-5 5xl:p-6 rounded-lg border shadow-lg min-w-[300px] 3xl:min-w-[350px] 4xl:min-w-[400px] 5xl:min-w-[450px] animate-in slide-in-from-bottom-2 pointer-events-auto flex items-center gap-3 ${toast.type === 'success'
                ? 'bg-background border-green-500/20 text-green-500'
                : toast.type === 'error'
                  ? 'bg-background border-destructive/20 text-destructive'
                  : 'bg-background border-border text-foreground'
                }`}
            >
              {toast.type === 'success' && <CheckCircle className="h-4 w-4 3xl:h-5 3xl:w-5 4xl:h-6 4xl:w-6 5xl:h-7 5xl:w-7" />}
              {toast.type === 'error' && <AlertCircle className="h-4 w-4 3xl:h-5 3xl:w-5 4xl:h-6 4xl:w-6 5xl:h-7 5xl:w-7" />}
              {toast.type === 'info' && <FileText className="h-4 w-4 3xl:h-5 3xl:w-5 4xl:h-6 4xl:w-6 5xl:h-7 5xl:w-7" />}
              <span className="text-sm 3xl:text-base 4xl:text-lg 5xl:text-xl font-medium">{toast.message}</span>
            </div>
          ))}
        </div>
      </div>

    </TooltipProvider >
  );
}