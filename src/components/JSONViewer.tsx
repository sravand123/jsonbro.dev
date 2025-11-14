import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  // For diff mode
  const [leftInput, setLeftInput] = useState('');
  const [rightInput, setRightInput] = useState('');
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

      // If we're in Monaco editor, only handle specific non-standard shortcuts
      if (isMonacoEditor) {
        // Allow standard editor shortcuts to work
        const standardShortcuts = ['c', 'v', 'x', 'a', 'z', 'y', 'f', 'h'];
        if (standardShortcuts.includes(event.key.toLowerCase()) && 
            (event.ctrlKey || event.metaKey)) {
          return;
        }
        
        // For other shortcuts in Monaco, only proceed if they're our custom shortcuts
        const isOurShortcut = Object.values(KEYBOARD_SHORTCUTS).some(shortcut => 
          (event.ctrlKey || event.metaKey) && 
          !event.altKey && 
          !event.shiftKey && 
          event.key.toLowerCase() === shortcut.key
        );
        
        if (!isOurShortcut) {
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
      addToast('Failed to apply delete', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 relative">
          <div className="flex justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
                <img 
                  src="/icon.svg" 
                  alt="JSON Icon" 
                  className="w-6 h-6"
                  style={{
                    filter: 'drop-shadow(0 0 5px rgba(34, 197, 94, 0.5))',
                    transition: 'filter 0.2s ease-in-out'
                  }}
                />
                <span>JsonBro.Dev</span>
              </h1>
              <p className="text-sm text-muted-foreground">Handle JSON like a pro, bro!!</p>
            </div>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <GitHubStars />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">

        {/* Main Editor Area - Improved Layout */}
        <div>
          <div className="w-full max-w-[85%] mx-auto">
            {/* Main Action Buttons - Aligned with Editor */}
            <div className="flex items-center justify-center flex-wrap gap-3 mb-4">
              <Button 
                onClick={handleFormat} 
                variant="outline" 
                disabled={viewMode === 'diff' || isFormatting || !input.trim()}
                className="flex items-center gap-2 hover:bg-primary/10 transition-colors"
              >
                {isFormatting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Format</span>
                <span className="text-xs text-muted-foreground hidden md:inline">({getShortcutText(KEYBOARD_SHORTCUTS.FORMAT.key)})</span>
              </Button>
              
              <Button 
                onClick={handleMinify} 
                variant="outline" 
                disabled={viewMode === 'diff' || isFormatting || !input.trim()}
                className="flex items-center gap-2 hover:bg-primary/10 transition-colors"
              >
                {isFormatting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Minify</span>
                <span className="text-xs text-muted-foreground hidden md:inline">({getShortcutText(KEYBOARD_SHORTCUTS.MINIFY.key)})</span>
              </Button>
              
              <Button 
                onClick={handleCopy} 
                variant="outline" 
                disabled={viewMode === 'diff' || !input.trim()} 
                className="flex items-center gap-2 hover:bg-primary/10 transition-colors"
              >
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Copy</span>
                <span className="text-xs text-muted-foreground hidden md:inline">({getShortcutText(KEYBOARD_SHORTCUTS.COPY.key)})</span>
              </Button>
              
              <Button 
                onClick={handleDownload} 
                variant="outline" 
                disabled={viewMode === 'diff' || !input.trim()}
                className="flex items-center gap-2 hover:bg-primary/10 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
                <span className="text-xs text-muted-foreground hidden md:inline">({getShortcutText(KEYBOARD_SHORTCUTS.SAVE.key)})</span>
              </Button>
              
              <Button 
                onClick={handleClear} 
                variant="outline" 
                disabled={viewMode === 'diff'}
                className="flex items-center gap-2 hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clear</span>
                <span className="text-xs text-muted-foreground hidden md:inline">({getShortcutText(KEYBOARD_SHORTCUTS.CLEAR.key)})</span>
              </Button>
            </div>

            {/* Search and File Upload - Aligned with Editor */}
            {viewMode !== 'diff' && (
              <>
                <div className="flex gap-4 items-center justify-center mb-4">
                  <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      placeholder={`Search JSON... (${getShortcutText(KEYBOARD_SHORTCUTS.SEARCH.key)})`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    className="hidden"
                  />
                  
                  <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    variant="outline" 
                    className="flex items-center gap-2 hover:bg-primary/10 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">Upload File</span>
                  </Button>
                </div>

                {/* Search Results - Aligned with Editor */}
                {searchTerm && searchResults.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 max-w-[600px] mx-auto">
                    <p className="text-sm text-muted-foreground mb-2">
                      Found {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {searchResults.map((result, index) => (
                        <div 
                          key={index} 
                          className={`text-sm font-mono p-2 rounded border cursor-pointer transition-colors ${
                            activeSearchResult === index 
                              ? 'bg-primary/10 border-primary' 
                              : 'bg-background hover:bg-muted/50'
                          }`}
                          onClick={() => handleSearchResultClick(result, index)}
                        >
                          <span className="text-muted-foreground">{result.path}:</span>
                          <span className="ml-2">
                            {typeof result.value === 'string' ? `"${result.value}"` : String(result.value === null ? 'null' : result.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {/* Status Bar */}
            <div className="flex items-center justify-between mb-6 p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center space-x-4">
                {viewMode === 'diff' && showDiff ? (
                  <>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <GitCompare className="h-5 w-5 text-primary" />
                      JSON Diff
                    </h3>
                    <div className="flex items-center space-x-3 text-sm">
                      <span className="text-muted-foreground">
                        {leftInput.length + rightInput.length} total characters
                      </span>
                      <div className="w-px h-4 bg-border"></div>
                      {leftInput.trim() && (() => {
                        const { error: leftError } = parseJSONSafe(leftInput);
                        const { error: rightError } = parseJSONSafe(rightInput);
                        if (leftError || rightError) {
                          return (
                            <span className="flex items-center gap-1.5 text-destructive bg-destructive/10 px-2 py-1 rounded-full text-xs">
                              <AlertCircle className="h-3 w-3" />
                              <span className="hidden sm:inline">Invalid JSON</span>
                            </span>
                          );
                        }
                        if (leftInput.trim() && rightInput.trim()) {
                          return (
                            <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-1 rounded-full text-xs">
                              <CheckCircle className="h-3 w-3" />
                              <span className="hidden sm:inline">Both Valid</span>
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </>
                ) : viewMode === 'diff' ? (
                  <>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FileCode className="h-5 w-5 text-primary" />
                      JSON Diff
                    </h3>
                    <div className="flex items-center space-x-3 text-sm">
                      <span className="text-muted-foreground">
                        {leftInput.length + rightInput.length} total characters
                      </span>
                      <div className="w-px h-4 bg-border"></div>
                      {leftInput.trim() && (() => {
                        const { error: leftError } = parseJSONSafe(leftInput);
                        const { error: rightError } = parseJSONSafe(rightInput);
                        if (leftError || rightError) {
                          return (
                            <span className="flex items-center gap-1.5 text-destructive bg-destructive/10 px-2 py-1 rounded-full text-xs">
                              <AlertCircle className="h-3 w-3" />
                              <span className="hidden sm:inline">Invalid JSON</span>
                            </span>
                          );
                        }
                        if (leftInput.trim() && rightInput.trim()) {
                          return (
                            <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-1 rounded-full text-xs">
                              <CheckCircle className="h-3 w-3" />
                              <span className="hidden sm:inline">Both Valid</span>
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      JSON Editor
                    </h3>
                    <div className="flex items-center space-x-3 text-sm">
                      <span className="text-muted-foreground">{input.length} characters</span>
                      <div className="w-px h-4 bg-border"></div>
                      {validationStatus === 'invalid' && (
                        <span className="flex items-center gap-1.5 text-destructive bg-destructive/10 px-2 py-1 rounded-full text-xs">
                          <AlertCircle className="h-3 w-3" />
                          <span className="hidden sm:inline">Invalid JSON</span>
                        </span>
                      )}
                      {validationStatus === 'valid' && (
                        <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-1 rounded-full text-xs">
                          <CheckCircle className="h-3 w-3" />
                          <span className="hidden sm:inline">Valid JSON</span>
                        </span>
                      )}
                      {validationStatus === 'empty' && (
                        <span className="flex items-center gap-1.5 text-muted-foreground bg-muted/50 px-2 py-1 rounded-full text-xs">
                          <FileText className="h-3 w-3" />
                          <span className="hidden sm:inline">Ready to edit</span>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-end space-x-2">
                {viewMode === 'diff' && !showDiff && (
                  <Button
                    onClick={() => setShowDiff(true)}
                    variant="default"
                    size="sm"
                    className="flex items-center gap-2"
                    disabled={!leftInput.trim() || !rightInput.trim()}
                    aria-label="Show diff"
                  >
                    <GitCompare className="h-4 w-4" />
                    <span>Show Diff</span>
                  </Button>
                )}
                {viewMode === 'diff' && showDiff && (
                  <Button
                    onClick={() => setShowDiff(false)}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    aria-label="Back to editing"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Edit</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="h-9"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                
                <Button
                  variant={viewMode === 'formatted' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('formatted')}
                >
                  Editor
                </Button>
                <Button
                  variant={viewMode === 'diff' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('diff')}
                >
                  Diff
                </Button>
              </div>
            </div>
            
            <div
              className={`relative border border-border rounded-xl transition-all duration-200 shadow-sm ${
                isDragOver 
                  ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20' 
                  : 'hover:border-primary/50 hover:shadow-md'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isLoading && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
              
              {viewMode === 'diff' ? (
                showDiff ? (
                  <div className="flex flex-col gap-4">
                    {/* Diff Editor */}
                    <div className="relative border rounded-lg overflow-hidden shadow-sm bg-card" style={{ height: 600 }}>
                      <div className="relative h-full">
                        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-4 p-2 bg-card/80 backdrop-blur-sm border-b">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="hidden sm:inline">Navigate:</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigateDiff('previous')}
                              className="h-7 px-2 gap-1"
                              title="Previous difference (Alt+Left)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m15 18-6-6 6-6"/>
                              </svg>
                              <span className="hidden sm:inline">Previous</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigateDiff('next')}
                              className="h-7 px-2 gap-1"
                              title="Next difference (Alt+Right)"
                            >
                              <span className="hidden sm:inline">Next</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m9 18 6-6-6-6"/>
                              </svg>
                            </Button>
                            <div className="text-xs text-muted-foreground ml-2 hidden md:flex items-center gap-2">
                              <span>{totalDiffs > 0 ? `${currentDiffIndex + 1} of ${totalDiffs} changes` : 'No changes'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="h-full pt-10">
                          <DiffEditor
                            height="100%"
                            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                            original={leftInput}
                            modified={rightInput}
                            language="json"
                            onMount={(editor) => {
                              diffEditorRef.current = editor;
                              
                              // Set up a small delay to ensure the editor is fully initialized
                              setTimeout(() => {
                                const lineChanges = editor.getLineChanges() || [];
                                setTotalDiffs(lineChanges.length);
                                
                                // Navigate to first diff if there are any
                                if (lineChanges.length > 0) {
                                  setCurrentDiffIndex(0);
                                  const firstChange = lineChanges[0];
                                  editor.revealLineInCenter(firstChange.originalStartLineNumber, 1);
                                  editor.revealLineInCenter(firstChange.modifiedStartLineNumber, 1);
                                  editor.setPosition({
                                    lineNumber: firstChange.originalStartLineNumber,
                                    column: 1
                                  });
                                }
                              }, 100);
                            }}
                            options={{
                              readOnly: true,
                              fontSize: 14,
                              lineHeight: 1.6,
                              minimap: { enabled: true },
                              renderSideBySide: true,
                              scrollBeyondLastLine: false,
                              wordWrap: 'on',
                              renderIndentGuides: true,
                              renderWhitespace: 'selection',
                              renderLineHighlight: 'all',
                              automaticLayout: true,
                              folding: true,
                              foldingHighlight: true,
                              showFoldingControls: 'always',
                              bracketPairColorization: { enabled: true },
                              guides: {
                                bracketPairs: true,
                                indentation: true
                              }
                            }}
                            loading={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Dual Editor Layout */}
                    <div className="flex flex-row gap-3">
                      {/* Left Editor */}
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-3 px-3">
                          <div className="flex items-center gap-2 p-1">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">Original</span>
                          </div>
                          {leftInput.trim() && (() => {
                            const { error } = parseJSONSafe(leftInput);
                            return error ? (
                              <span className="flex items-center gap-1 text-xs text-destructive">
                                <AlertCircle className="h-3 w-3" />
                                Invalid
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle className="h-3 w-3" />
                                Valid
                              </span>
                            );
                          })()}
                        </div>
                        <div className="border rounded-lg overflow-hidden shadow-sm">
                          <MonacoJSONEditor
                            ref={leftEditorRef}
                            value={leftInput}
                            onChange={(value) => setLeftInput(value || '')}
                            theme={theme}
                            height="650px"
                            options={{
                              fontSize: 15,
                              lineHeight: 1.7,
                              minimap: { enabled: true },
                              showFoldingControls: 'always',
                              bracketPairColorization: { enabled: true },
                              scrollBeyondLastLine: false,
                              wordWrap: 'on',
                              padding: { top: 16, bottom: 16 },
                              guides: {
                                bracketPairs: true,
                                indentation: true
                              }
                            }}
                          />
                        </div>
                      </div>

                      {/* Center Divider */}
                      <div className="flex flex-col justify-center items-center px-1">
                        <div className="w-px h-full bg-border"></div>
                      </div>

                      {/* Right Editor */}
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-3 px-3">
                          <div className="flex items-center gap-2 p-1">
                            <FileCheck className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">Modified</span>
                          </div>
                          {rightInput.trim() && (() => {
                            const { error } = parseJSONSafe(rightInput);
                            return error ? (
                              <span className="flex items-center gap-1 text-xs text-destructive">
                                <AlertCircle className="h-3 w-3" />
                                Invalid
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle className="h-3 w-3" />
                                Valid
                              </span>
                            );
                          })()}
                        </div>
                        <div className="border rounded-lg overflow-hidden shadow-sm">
                          <MonacoJSONEditor
                            ref={rightEditorRef}
                            value={rightInput}
                            onChange={(value) => setRightInput(value || '')}
                            theme={theme}
                            height="650px"
                            options={{
                              fontSize: 15,
                              lineHeight: 1.7,
                              minimap: { enabled: true },
                              showFoldingControls: 'always',
                              bracketPairColorization: { enabled: true },
                              scrollBeyondLastLine: false,
                              wordWrap: 'on',
                              padding: { top: 16, bottom: 16 },
                              guides: {
                                bracketPairs: true,
                                indentation: true
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <MonacoJSONEditor
                  ref={editorRef}
                  value={input}
                  onChange={(value) => setInput(value || '')}
                  theme={theme}
                  height="600px"
                  options={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    minimap: { enabled: true },
                    showFoldingControls: 'always',
                    bracketPairColorization: { enabled: true },
                    guides: {
                      bracketPairs: true,
                      indentation: true
                    }
                  }}
                  onMount={handleEditorDidMount}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-3 rounded-lg border shadow-lg min-w-[300px] animate-in slide-in-from-bottom-2 ${
              toast.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200'
                : toast.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200'
                : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' && <CheckCircle className="h-4 w-4" />}
              {toast.type === 'error' && <AlertCircle className="h-4 w-4" />}
              {toast.type === 'info' && <FileText className="h-4 w-4" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}