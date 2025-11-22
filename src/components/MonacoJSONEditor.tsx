import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Track if we've already registered the completion provider
let isCompletionProviderRegistered = false;

interface MonacoJSONEditorProps {
  value: string;
  onChange: OnChange;
  theme: string;
  height?: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

export const MonacoJSONEditor = forwardRef<monaco.editor.IStandaloneCodeEditor | null, MonacoJSONEditorProps>((
  { value, onChange, theme, height = '400px', options = {}, onMount }, ref
) => {
  const internalEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<typeof monaco | null>(null);
  const resizeListenerRef = useRef<(() => void) | null>(null);

  /**
   * Extracts unique words from JSON content for autocomplete suggestions
   * Handles both valid JSON and malformed JSON content
   */
  const extractExistingWords = (jsonContent: string): string[] => {
    const words = new Set<string>();

    try {
      // First try to parse as valid JSON
      const parsed = JSON.parse(jsonContent);
      extractWordsFromObject(parsed, words);
    } catch (e) {
      // Fallback: Extract strings using regex for malformed JSON
      const stringMatches = jsonContent.match(/"([^"\\]*(\\.[^"\\]*)*)"/g);
      if (stringMatches) {
        stringMatches.forEach(match => {
          const stringContent = match.slice(1, -1);
          if (stringContent.length > 0) {
            const wordParts = stringContent.split(/[\s,.;:!?()\[\]{}"'-]/g).filter(word => word.length > 0);
            wordParts.forEach(word => words.add(word));
          }
        });
      }
    }

    return Array.from(words);
  };

  /**
   * Extracts word chunks (1-3 words) from JSON content for better context-aware suggestions
   */
  const extractWordChunks = (jsonContent: string): string[] => {
    const chunks = new Set<string>();

    try {
      const parsed = JSON.parse(jsonContent);
      extractChunksFromObject(parsed, chunks);
    } catch (e) {
      // Fallback for malformed JSON
      const stringMatches = jsonContent.match(/"([^"\\]*(\\.[^"\\]*)*)"/g);
      if (stringMatches) {
        stringMatches.forEach(match => {
          const stringContent = match.slice(1, -1);
          if (stringContent.length > 0) {
            const words = stringContent.split(/[\s,.;:!?()\[\]{}"'-]/g).filter(word => word.length > 0);
            words.forEach(word => chunks.add(word));
          }
        });
      }
    }

    return Array.from(chunks);
  };

  // Removed unused function: extractStringsFromObject

  // Recursively extract words from parsed JSON object
  const extractWordsFromObject = (obj: any, words: Set<string>) => {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'string') {
      // Split into words by spaces and other delimiters
      const wordParts = obj.split(/[\s,.;:!?()\[\]{}"'-]/g).filter(word => word.length > 0);
      wordParts.forEach(word => words.add(word));
    } else if (Array.isArray(obj)) {
      obj.forEach(item => extractWordsFromObject(item, words));
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        // Add key as single word
        words.add(key);
        // Also break key into words if it contains spaces
        const keyWords = key.split(/[\s,.;:!?()\[\]{}"'-]/g).filter(word => word.length > 0);
        keyWords.forEach(word => words.add(word));
        extractWordsFromObject(obj[key], words);
      });
    }
  };

  // Recursively extract chunks from parsed JSON object
  const extractChunksFromObject = (obj: any, chunks: Set<string>) => {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'string') {
      const words = obj.split(/[\s,.;:!?()\[\]{}"'-]/g).filter(word => word.length > 0);
      words.forEach(word => chunks.add(word));
    } else if (Array.isArray(obj)) {
      obj.forEach(item => extractChunksFromObject(item, chunks));
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        const keyWords = key.split(/[\s,.;:!?()\[\]{}"'-]/g).filter(word => word.length > 0);
        keyWords.forEach(word => chunks.add(word));
        extractChunksFromObject(obj[key], chunks);
      });
    }
  };

  // Enhanced suggestions including words and chunks from JSON content with better deduplication
  const getWordBasedSuggestions = (context: { text: string; path: string[]; isValue: boolean; insideQuotes: boolean }, existingWords: string[], existingChunks: string[]) => {
    const inputText = context.text;
    const suggestions: any[] = [];
    const processedSuggestions = new Set<string>(); // Track to avoid duplicates by insert text
    const allWords = new Set<string>(); // Track all words for better deduplication
    const lowercaseToOriginal = new Map<string, string>(); // Map lowercase to original case
    const existingSuggestions = new Set<string>(); // Track existing suggestions by label

    // Use the insideQuotes flag from context
    const shouldAddQuotes = !context.insideQuotes;

    // Add auto-quoted suggestion if needed and input exists
    if (shouldAddQuotes && inputText.length > 0) {
      const quotedVersion = `"${inputText}"`;
      suggestions.push({
        label: quotedVersion,
        kind: monaco.languages.CompletionItemKind.Value,
        insertText: quotedVersion,
        detail: 'Auto-quoted string',
        documentation: 'Convert unquoted string to JSON string format'
      });
      processedSuggestions.add(quotedVersion);
      allWords.add(inputText);
    }

    // Filter out common/generic words that don't add value
    const commonWords = new Set(['and', 'or', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'to', 'of', 'in', 'for', 'on', 'at', 'by', 'from', 'with', 'as', 'but', 'not', 'be', 'been', 'it', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they']);

    // Add word suggestions from JSON content with better deduplication
    existingWords.forEach(word => {
      if (word && word.length > 0 && word.length < 50) { // Filter very long words
        const lowerWord = word.toLowerCase();

        // Track original case, preferring longer versions of the same word
        if (lowercaseToOriginal.has(lowerWord)) {
          const existing = lowercaseToOriginal.get(lowerWord)!;
          if (word.length > existing.length) {
            lowercaseToOriginal.set(lowerWord, word);
          }
        } else {
          lowercaseToOriginal.set(lowerWord, word);
        }

        // Check if this word partially matches the input
        if (!inputText || lowerWord.includes(inputText.toLowerCase())) {
          // Skip common words unless they exactly match the input
          if (!commonWords.has(lowerWord) || (inputText && lowerWord === inputText.toLowerCase())) {
            const displayWord = lowercaseToOriginal.get(lowerWord) || word;
            const suggestion = shouldAddQuotes
              ? {
                label: `"${displayWord}"`,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: `"${displayWord}"`,
                documentation: `Use quoted word: "${displayWord}"`
              }
              : {
                label: displayWord,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: displayWord,
                documentation: `Use word: "${displayWord}"`
              };

            const suggestionKey = suggestion.insertText.toLowerCase();
            const suggestionLabel = suggestion.label.toLowerCase();

            // Check if we've already added this exact suggestion or a very similar one
            if (!processedSuggestions.has(suggestionKey) && !existingSuggestions.has(suggestionLabel)) {
              suggestions.push(suggestion);
              processedSuggestions.add(suggestionKey);
              existingSuggestions.add(suggestionLabel);
              allWords.add(lowerWord);
            }
          }
        }
      }
    });

    // Process chunks with deduplication
    const processedChunks = new Set<string>();

    // Add chunk suggestions from JSON content (only if they match input and are unique)
    existingChunks.forEach(chunk => {
      if (chunk && chunk.length > 0 && chunk.length < 100) { // Filter very long chunks
        const lowerChunk = chunk.toLowerCase();
        if (processedChunks.has(lowerChunk)) return;
        processedChunks.add(lowerChunk);

        const chunkWords = chunk.split(' ').filter(word => word.length > 0);
        // Only suggest chunks if they contain multiple words or the entire chunk matches the input
        if (chunkWords.length > 1 && (!inputText || lowerChunk.includes(inputText.toLowerCase()))) {
          // Additional deduplication: ensure chunk doesn't already exist as individual words
          const chunkAlreadyExists = chunkWords.every(word => allWords.has(word.toLowerCase()));

          if (!chunkAlreadyExists) {
            const suggestion = shouldAddQuotes
              ? {
                label: `"${chunk}"`,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: `"${chunk}"`,
                documentation: `Use quoted chunk: "${chunk}"`,
                sortText: `1${chunk}` // Sort after single words
              }
              : {
                label: chunk,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: chunk,
                documentation: `Use word chunk: "${chunk}"`,
                sortText: `1${chunk}` // Sort after single words
              };

            const suggestionKey = suggestion.insertText.toLowerCase();
            const suggestionLabel = suggestion.label.toLowerCase();

            // Check if we've already added this exact suggestion or a very similar one
            if (!processedSuggestions.has(suggestionKey) && !existingSuggestions.has(suggestionLabel)) {
              suggestions.push(suggestion);
              processedSuggestions.add(suggestionKey);
              existingSuggestions.add(suggestionLabel);
            }
          }
        }
      }
    });

    return suggestions;
  };

  // Enhanced context detection for nested JSON structures
  const detectStringContext = (model: monaco.editor.ITextModel, position: monaco.Position): { text: string; path: string[]; isValue: boolean; insideQuotes: boolean } => {
    const line = model.getLineContent(position.lineNumber);
    const beforeCursor = line.substring(0, position.column - 1);
    const currentLineUntilCursor = line.substring(0, position.column);

    // Track the JSON path and determine if we're in a value position
    const path: string[] = [];
    let isValue = false;

    // Function to extract the current object path
    const getCurrentPath = () => {
      let depth = 0;
      let currentKey = '';
      let inString = false;
      let escapeNext = false;

      // Look through previous lines to handle multi-line objects
      for (let lineNum = position.lineNumber; lineNum >= 1; lineNum--) {
        const currentLine = lineNum === position.lineNumber
          ? currentLineUntilCursor
          : model.getLineContent(lineNum);

        for (let i = currentLine.length - 1; i >= 0; i--) {
          const char = currentLine[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '}' || char === ']') {
              depth++;
            } else if (char === '{' || char === '[') {
              depth--;
              if (depth < 0) {
                // We've found the start of our current object
                if (currentKey) {
                  path.unshift(currentKey);
                }
                return;
              }
            } else if (char === ':' && depth === 0) {
              isValue = true;
              // Look backwards to find the key
              let keyMatch = currentLine.substring(0, i).match(/"([^"]+)"(?=\s*:)/);
              if (keyMatch) {
                currentKey = keyMatch[1];
                path.unshift(currentKey);
                return;
              }
            }
          }
        }
      }
    };

    getCurrentPath();

    // Extract the text we're currently typing
    let currentText = '';
    const wordMatch = beforeCursor.match(/[a-zA-Z0-9_.-]*$/);
    if (wordMatch) {
      currentText = wordMatch[0];
    }

    // Check if we're inside quotes by counting quote marks before cursor
    let insideQuotes = false;
    let quoteCount = 0;
    let isEscaped = false;

    for (let i = 0; i < beforeCursor.length; i++) {
      const char = beforeCursor[i];
      if (char === '\\') {
        isEscaped = !isEscaped;
        continue;
      }
      if (char === '"' && !isEscaped) {
        quoteCount++;
      }
      isEscaped = false;
    }
    insideQuotes = quoteCount % 2 === 1;

    return {
      text: currentText,
      path,
      isValue,
      insideQuotes
    };
  };

  // Expose editor instance to parent via ref
  useImperativeHandle(ref, () => internalEditorRef.current, []);

  // Reactively update Monaco theme when document dark class changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          const newTheme = isDark ? 'vs-dark' : 'vs';

          if (monacoInstance) {
            monacoInstance.editor.setTheme(newTheme);
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, [monacoInstance]);

  // Update theme when theme prop changes
  useEffect(() => {
    if (monacoInstance) {
      const isDark = document.documentElement.classList.contains('dark');
      const newTheme = isDark ? 'vs-dark' : 'vs';
      monacoInstance.editor.setTheme(newTheme);
    }
  }, [theme, monacoInstance]);

  // Cleanup resize listener on unmount
  useEffect(() => {
    return () => {
      if (resizeListenerRef.current) {
        resizeListenerRef.current();
      }
    };
  }, []);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    internalEditorRef.current = editor;
    setMonacoInstance(monaco);

    // Call the onMount prop if provided
    if (onMount) {
      onMount(editor);
    }

    // Mark the editor element so keyboard shortcuts can identify it
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      (editorDomNode as any).__isMonacoEditor = true;
    }

    // Add window resize listener to update font size dynamically
    const handleResize = () => {
      const newFontSize = Math.max(13, Math.min(28, 13 + (window.innerWidth - 1280) * 0.006));
      editor.updateOptions({ fontSize: newFontSize });
    };

    window.addEventListener('resize', handleResize);

    // Store cleanup function
    resizeListenerRef.current = () => {
      window.removeEventListener('resize', handleResize);
    };

    // Enable JSON validation with custom settings
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true, // Enable validation
      allowComments: false,
      trailingCommas: 'error',
      comments: 'error',
      schemas: [],
      enableSchemaRequest: false,
      schemaRequest: 'error',
      schemaValidation: 'error',
    });

    // Configure the editor to show validation errors
    const model = editor.getModel();
    if (model) {
      // Set the language to JSON
      monaco.editor.setModelLanguage(model, 'json');

      // Add custom validation for JSON syntax errors
      const validate = () => {
        const content = model.getValue();
        const markers: monaco.editor.IMarkerData[] = [];

        try {
          // First, try to parse the JSON
          JSON.parse(content);
          // If we get here, the JSON is valid - clear any existing markers
          monaco.editor.setModelMarkers(model, 'json', []);
          return;
        } catch (e) {
          if (e instanceof SyntaxError) {
            // Get the position from the error message
            const positionMatch = e.message.match(/at position (\d+)/);
            if (positionMatch) {
              const errorPosition = parseInt(positionMatch[1], 10);
              const position = model.getPositionAt(errorPosition);
              const lineNumber = position.lineNumber;
              let column = position.column;
              const lineContent = model.getLineContent(lineNumber);

              // Check if the error is likely a missing comma
              const isMissingComma = e.message.includes('Unexpected token') ||
                e.message.includes('Expected');

              if (isMissingComma) {
                // For missing commas, we want to highlight the end of the previous line
                if (column <= 1 && lineNumber > 1) {
                  // Find the previous non-empty line
                  let prevLineNum = lineNumber - 1;
                  while (prevLineNum > 0 && model.getLineContent(prevLineNum).trim() === '') {
                    prevLineNum--;
                  }

                  if (prevLineNum > 0) {
                    const prevLine = model.getLineContent(prevLineNum);
                    const trimmedLine = prevLine.trim();

                    // Only add marker if the previous line ends with a value (not a closing bracket/brace)
                    if (trimmedLine.length > 0 && !/[\]}{]\s*$/.test(trimmedLine)) {
                      // Find the last non-whitespace character
                      let lastCharPos = prevLine.length;
                      while (lastCharPos > 0 && /\s/.test(prevLine[lastCharPos - 1])) {
                        lastCharPos--;
                      }

                      if (lastCharPos > 0) {
                        markers.push({
                          severity: monaco.MarkerSeverity.Error,
                          message: 'Missing comma after this element',
                          startLineNumber: prevLineNum,
                          startColumn: lastCharPos,
                          endLineNumber: prevLineNum,
                          endColumn: lastCharPos + 1
                        });
                      }
                    }
                  }
                } else {
                  // For errors in the middle of the line, try to find the token boundaries
                  const lineStart = model.getOffsetAt({ lineNumber, column: 1 });
                  const relativePos = errorPosition - lineStart;

                  // Look for the start of the token
                  let startColumn = Math.max(1, column);
                  for (let i = relativePos - 1; i >= 0; i--) {
                    if (/[\s\n\r,{}\[\]]/.test(lineContent[i])) break;
                    startColumn = i + 1;
                  }

                  // Look for the end of the token
                  let endColumn = Math.min(lineContent.length + 1, column + 1);
                  for (let i = relativePos; i < lineContent.length; i++) {
                    if (/[\s\n\r,{}\[\]]/.test(lineContent[i])) break;
                    endColumn = i + 2;
                  }

                  markers.push({
                    severity: monaco.MarkerSeverity.Error,
                    message: e.message,
                    startLineNumber: lineNumber,
                    startColumn: startColumn,
                    endLineNumber: lineNumber,
                    endColumn: endColumn
                  });
                }
              } else {
                // For other types of errors, just use the position from the error
                markers.push({
                  severity: monaco.MarkerSeverity.Error,
                  message: e.message,
                  startLineNumber: lineNumber,
                  startColumn: column,
                  endLineNumber: lineNumber,
                  endColumn: column + 1
                });
              }
            }
          }
        }

        // Set the markers
        monaco.editor.setModelMarkers(model, 'json', markers);
      };

      // Validate on content change with debounce
      let timeoutId: NodeJS.Timeout;
      model.onDidChangeContent(() => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(validate, 300); // Debounce validation
      });

      // Initial validation
      validate();
    }

    // Remove the default JSON mode provider to prevent built-in suggestions
    monaco.languages.json.jsonDefaults.setModeConfiguration({
      documentFormattingEdits: true,
      documentRangeFormattingEdits: true,
      completionItems: false, // Disable default completion items
      hovers: true,
      documentSymbols: true,
      tokens: true,
      colors: true,
      foldingRanges: true,
      diagnostics: false // Disable diagnostics which can trigger schema suggestions
    });

    // Only register the completion provider once
    if (!isCompletionProviderRegistered) {
      isCompletionProviderRegistered = true;

      // Register enhanced completion provider with nested JSON awareness
      monaco.languages.registerCompletionItemProvider('json', {
        provideCompletionItems: (model, position) => {
          try {
            const fullContent = model.getValue();

            // Get enhanced context including path and value position
            const context = detectStringContext(model, position);

            // Filter out any suggestions that might lead to $schema
            const currentLine = model.getLineContent(position.lineNumber);
            const linePrefix = currentLine.substring(0, position.column);
            if (linePrefix.includes('$') || linePrefix.includes('schema') || context.text.includes('$') || context.text.toLowerCase().includes('schema')) {
              return { suggestions: [] };
            }

            // Extract existing words and chunks from JSON content
            const existingWords = extractExistingWords(fullContent);
            const existingChunks = extractWordChunks(fullContent);

            // Analyze the JSON structure to get relevant suggestions
            let relevantSuggestions: any[] = [];

            try {
              const jsonContent = JSON.parse(fullContent);

              // If we're in a nested object, look for similar properties at the same nesting level
              if (context.path.length > 0) {
                const getSimilarProperties = (obj: any, path: string[], depth: number = 0): string[] => {
                  if (!obj || typeof obj !== 'object') return [];

                  if (depth === path.length - 1) {
                    // We're at the target nesting level, collect sibling properties
                    return Object.keys(obj);
                  }

                  const currentKey = path[depth];
                  if (obj[currentKey]) {
                    return getSimilarProperties(obj[currentKey], path, depth + 1);
                  }

                  return [];
                };

                // Get properties from similar nesting levels
                const similarProps = getSimilarProperties(jsonContent, context.path);
                relevantSuggestions.push(
                  ...similarProps.map(prop => ({
                    label: `"${prop}"`,
                    kind: monaco.languages.CompletionItemKind.Property,
                    insertText: `"${prop}"`,
                    detail: 'Similar property from current context',
                    sortText: '0' + prop // Sort these suggestions first
                  }))
                );
              }
            } catch (e) {
              // JSON parsing failed, fall back to word-based suggestions
            }

            // Get word-based suggestions as fallback
            const wordSuggestions = getWordBasedSuggestions(context, existingWords, existingChunks);
            relevantSuggestions.push(...wordSuggestions);

            // Calculate word boundary for proper range
            const line = model.getLineContent(position.lineNumber);
            let wordStart = position.column - 1;
            while (wordStart > 0 && /[a-zA-Z0-9_.-]/.test(line[wordStart - 1])) {
              wordStart--;
            }

            const wordRange = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: wordStart + 1,
              endColumn: position.column
            };

            // Filter out any suggestions containing $schema and deduplicate by insertText/label
            const seen = new Set<string>();
            const uniqueSuggestions: any[] = [];

            for (const suggestion of relevantSuggestions) {
              const textRaw = (suggestion.insertText || suggestion.label || '').toString();
              const text = textRaw.toLowerCase();

              if (!text || text.includes('$schema')) continue;

              // Use the raw text as the uniqueness key (preserves quotes if present)
              const key = textRaw;
              if (seen.has(key)) continue;

              seen.add(key);
              uniqueSuggestions.push({ ...suggestion, range: wordRange });
            }

            return { suggestions: uniqueSuggestions };
          } catch (error) {
            console.error('Completion provider error:', error);
            return { suggestions: [] };
          }
        },
        // Trigger on letters, underscore, and symbols (excluding punctuation like comma, full stop)
        triggerCharacters: [
          // Letters (excluding 's' to prevent $schema triggers)
          'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 't', 'u', 'v', 'w', 'x', 'y', 'z',
          'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
          // Underscore
          '_'
        ]
      });
    }

    // Configure JSON language features - Disable schema suggestions
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      trailingCommas: 'error',
      comments: 'ignore',
      schemas: [] // Disable all JSON schemas to remove $schema suggestions
    });

    // Add keyboard shortcuts (excluding Ctrl+F and Ctrl+H to avoid conflicts with global shortcuts)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      editor.getAction('editor.action.copyLinesDownAction')?.run();
    });

    // Configure editor options with responsive font size (fluid scaling)
    const responsiveFontSize = Math.max(13, Math.min(28, 13 + (window.innerWidth - 1280) * 0.006));
    editor.updateOptions({
      fontSize: responsiveFontSize,
      lineHeight: 1.6,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, Consolas, 'Courier New', monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'on',
      contextmenu: true,
      mouseWheelZoom: true,
      multiCursorModifier: 'ctrlCmd',
      matchBrackets: 'always',
      autoIndent: 'advanced',
      formatOnPaste: true,
      formatOnType: true,
      renderWhitespace: 'boundary',
      renderControlCharacters: false,
      rulers: [80],
      showFoldingControls: 'always',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true
      },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on'
    });
  };

  const responsiveFontSize = typeof window !== 'undefined'
    ? Math.max(13, Math.min(28, 13 + (window.innerWidth - 1280) * 0.006))
    : 13;

  const defaultOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    language: 'json',
    theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fontSize: responsiveFontSize,
    lineHeight: 1.6,
    minimap: { enabled: true },
    showFoldingControls: 'always',
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true
    },
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, Consolas, 'Courier New', monospace",
    fontLigatures: true,
    lineNumbers: 'on',
    contextmenu: true,
    mouseWheelZoom: true,
    matchBrackets: 'always',
    autoIndent: 'advanced',
    formatOnPaste: true,
    formatOnType: true,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    ...options
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-background" style={{ height }}>
      <Editor
        height="100%"
        defaultLanguage="json"
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'}
        options={defaultOptions}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        }
      />
    </div>
  );
});

MonacoJSONEditor.displayName = 'MonacoJSONEditor';