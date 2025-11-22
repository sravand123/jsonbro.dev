export interface JSONError {
  message: string;
  line?: number;
  column?: number;
  position?: number;
}

export interface JSONNode {
  key?: string;
  value: any;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  path: string;
}

/**
 * Parse JSON and return error information if invalid
 */
export function parseJSONSafe(jsonString: string): { data: any; error: JSONError | null } {
  try {
    const data = JSON.parse(jsonString);
    return { data, error: null };
  } catch (error) {
    if (error instanceof SyntaxError) {
      const message = error.message;
      const line = extractLineNumber(message);
      const column = extractColumnNumber(message);

      return {
        data: null,
        error: {
          message,
          line,
          column,
          position: calculatePosition(jsonString, line, column)
        }
      };
    }
    return {
      data: null,
      error: {
        message: 'Unknown parsing error'
      }
    };
  }
}

/**
 * Format JSON with proper indentation
 */
export function formatJSON(data: any, indent: number = 2): string {
  try {
    return JSON.stringify(data, null, indent);
  } catch (error) {
    throw new Error('Cannot format: ' + (error as Error).message);
  }
}

/**
 * Minify JSON by removing whitespace
 */
export function minifyJSON(data: any): string {
  try {
    return JSON.stringify(data);
  } catch (error) {
    throw new Error('Cannot minify: ' + (error as Error).message);
  }
}

/**
 * Convert JSON to a tree structure for collapsible display
 */
export function convertToTree(data: any, path: string = ''): JSONNode[] {
  const nodes: JSONNode[] = [];

  if (data === null) {
    nodes.push({
      value: null,
      type: 'null',
      path: path || 'root'
    });
    return nodes;
  }

  if (typeof data === 'string') {
    nodes.push({
      value: data,
      type: 'string',
      path: path || 'root'
    });
    return nodes;
  }

  if (typeof data === 'number') {
    nodes.push({
      value: data,
      type: 'number',
      path: path || 'root'
    });
    return nodes;
  }

  if (typeof data === 'boolean') {
    nodes.push({
      value: data,
      type: 'boolean',
      path: path || 'root'
    });
    return nodes;
  }

  if (Array.isArray(data)) {
    nodes.push({
      value: data,
      type: 'array',
      path: path || 'root'
    });

    data.forEach((item, index) => {
      nodes.push(...convertToTree(item, `${path}[${index}]`));
    });
    return nodes;
  }

  if (typeof data === 'object') {
    nodes.push({
      value: data,
      type: 'object',
      path: path || 'root'
    });

    Object.keys(data).forEach(key => {
      nodes.push(...convertToTree(data[key], `${path}.${key}`));
    });
    return nodes;
  }

  return nodes;
}

/**
 * Search through JSON data
 */
export function searchJSON(data: any, searchTerm: string): JSONNode[] {
  const results: JSONNode[] = [];
  const searchLower = searchTerm.toLowerCase();

  function searchRecursive(obj: any, path: string) {
    // Handle null values - make them searchable
    if (obj === null) {
      if (searchLower.includes('null')) {
        results.push({
          value: null,
          type: 'null',
          path
        });
      }
      return;
    }

    // Handle string values
    if (typeof obj === 'string') {
      if (obj.toLowerCase().includes(searchLower)) {
        results.push({
          value: obj,
          type: 'string',
          path
        });
      }
      return;
    }

    // Handle number values
    if (typeof obj === 'number') {
      if (obj.toString().includes(searchTerm)) {
        results.push({
          value: obj,
          type: 'number',
          path
        });
      }
      return;
    }

    // Handle boolean values
    if (typeof obj === 'boolean') {
      const boolStr = obj.toString();
      if (boolStr.toLowerCase().includes(searchLower)) {
        results.push({
          value: obj,
          type: 'boolean',
          path
        });
      }
      return;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const itemPath = path === 'root' ? `root[${index}]` : `${path}[${index}]`;
        searchRecursive(item, itemPath);
      });
      return;
    }

    // Handle objects
    if (typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        const keyPath = path === 'root' ? `root.${key}` : `${path}.${key}`;

        // Check if key matches search term
        if (key.toLowerCase().includes(searchLower)) {
          results.push({
            key,
            value: obj[key],
            type: typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])
              ? 'object'
              : Array.isArray(obj[key])
                ? 'array'
                : typeof obj[key] as 'string' | 'number' | 'boolean' | 'null',
            path: keyPath
          });
        }

        // Recursively search the value
        searchRecursive(obj[key], keyPath);
      });
    }
  }

  searchRecursive(data, 'root');
  return results;
}

/**
 * Extract line number from JSON error message
 */
function extractLineNumber(message: string): number | undefined {
  const match = message.match(/line (\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract column number from JSON error message
 */
function extractColumnNumber(message: string): number | undefined {
  const match = message.match(/column (\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Calculate character position in string
 */
function calculatePosition(text: string, line?: number, column?: number): number {
  if (!line || !column) return 0;

  const lines = text.split('\n');
  let position = 0;

  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    position += lines[i].length + 1; // +1 for newline character
  }

  return position + Math.max(0, column - 1);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch (fallbackError) {
      console.error('Failed to copy to clipboard:', fallbackError);
      return false;
    }
  }
}

/**
 * Download JSON as file
 */
export function downloadJSON(data: any, filename: string = 'formatted.json') {
  try {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download file:', error);
  }
}

/**
 * Validate and parse file content
 */
export async function parseJSONFile(file: File): Promise<{ data: any; error: JSONError | null }> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        resolve({
          data: null,
          error: { message: 'File appears to be empty' }
        });
        return;
      }

      const result = parseJSONSafe(content);
      resolve(result);
    };

    reader.onerror = () => {
      resolve({
        data: null,
        error: { message: 'Failed to read file' }
      });
    };

    reader.readAsText(file);
  });
}

/**
 * Get keyboard shortcuts
 */
// Detect if the user is on a Mac
const isMac = typeof navigator !== 'undefined' ? /Mac|iPod|iPhone|iPad/.test(navigator.platform) : false;

// Get the correct modifier key based on the user's OS
export const getModifierKey = () => isMac ? '⌘' : 'Ctrl';

// Get the full shortcut text for a given shortcut object
export const getShortcutText = (shortcut: typeof KEYBOARD_SHORTCUTS[keyof typeof KEYBOARD_SHORTCUTS]) => {
  const modifier = getModifierKey();
  const shift = (shortcut as any).shift ? 'Shift+' : '';
  const key = shortcut.key === 'delete' ? 'Del' : shortcut.key.toUpperCase();
  return `${modifier}+${shift}${key}`;
};

export const KEYBOARD_SHORTCUTS = {
  FORMAT: { ctrl: true, shift: true, key: 'f', description: 'Format JSON' },
  MINIFY: { ctrl: true, key: 'm', description: 'Minify JSON' },
  COPY: { ctrl: true, shift: true, key: 'c', description: 'Copy to clipboard' },
  CLEAR: { ctrl: true, shift: true, key: 'delete', description: 'Clear input' },
  SEARCH: { ctrl: true, key: 'h', description: 'Focus search' },
  SAVE: { ctrl: true, key: 's', description: 'Download JSON' },
  UPLOAD: { ctrl: true, key: 'o', description: 'Upload file' }
} as const;

/**
 * Check if keyboard shortcut matches
 * Handles both ctrl (Windows/Linux) and cmd (Mac) keys
 * Respects Monaco editor's default behavior
 */
export function isShortcut(event: KeyboardEvent, shortcut: typeof KEYBOARD_SHORTCUTS[keyof typeof KEYBOARD_SHORTCUTS]): boolean {
  // Don't trigger if any text is selected (allows text selection with Shift+Arrow keys)
  if (window.getSelection()?.toString().length > 0) {
    return false;
  }

  // Check if we're in an input or textarea
  const target = event.target as HTMLElement;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

  // If we're in an input/textarea but not in the Monaco editor, don't trigger
  if (isInput && !(target as any).__isMonacoEditor) {
    return false;
  }

  // Check if we're in Monaco editor
  const isMonacoEditor = (target as any).__isMonacoEditor;

  // If we're in Monaco editor, allow our custom shortcuts and block standard ones
  if (isMonacoEditor) {
    // Check if this matches one of our custom shortcuts
    const matchedShortcut = Object.values(KEYBOARD_SHORTCUTS).find(s =>
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.shiftKey === ((s as any).shift || false) &&
      (s.key === 'delete'
        ? (event.key === 'Delete' || event.key === 'Backspace')
        : event.key.toLowerCase() === s.key.toLowerCase())
    );

    // If it's one of our shortcuts, allow it to proceed
    if (matchedShortcut && matchedShortcut.key === shortcut.key) {
      // Continue to the shortcut checking below
    } else {
      // For standard shortcuts (copy, paste, etc.), let Monaco handle them
      const standardShortcuts = ['c', 'v', 'x', 'a', 'z', 'y', 'f'];
      if (standardShortcuts.includes(shortcut.key.toLowerCase()) &&
        (event.ctrlKey || event.metaKey)) {
        return false; // Let Monaco handle these
      }
      // For other key combinations, don't handle them
      return false;
    }
  }

  // Check the actual shortcut
  const modifierPressed = event.ctrlKey || event.metaKey;
  const shiftRequired = (shortcut as any).shift || false;
  const keyMatches = shortcut.key === 'delete'
    ? (event.key === 'Delete' || event.key === 'Backspace')
    : event.key.toLowerCase() === shortcut.key.toLowerCase();

  return (
    modifierPressed &&
    !event.altKey &&
    event.shiftKey === shiftRequired &&
    keyMatches
  );
}