import Papa from 'papaparse';

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
 * Download JSON as CSV file
 */
export function downloadCSV(data: any, filename: string = 'formatted.csv') {
  try {
    // Parse the data if it's a string
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

    // Convert to array if it's a single object
    const arrayData = Array.isArray(parsedData) ? parsedData : [parsedData];

    // Use PapaParse to convert JSON to CSV
    const csv = Papa.unparse(arrayData);

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download CSV:', error);
    throw error;
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
 * Parse CSV file and convert to JSON
 */
export async function parseCSVFile(file: File): Promise<{ data: any; error: JSONError | null }> {
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

      try {
        const data = parseCSV(content);
        resolve({ data, error: null });
      } catch (error) {
        resolve({
          data: null,
          error: { message: 'Failed to parse CSV: ' + (error as Error).message }
        });
      }
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
 * Parse CSV string to JSON array using PapaParse
 */
function parseCSV(csvString: string): any[] {
  const result = Papa.parse(csvString, {
    header: true, // Use first row as headers
    dynamicTyping: true, // Automatically convert numbers and booleans
    skipEmptyLines: true, // Skip empty lines
    transformHeader: (header: string) => header.trim(), // Trim header whitespace
    transform: (value: string) => value.trim() // Trim cell values
  });

  if (result.errors.length > 0) {
    const error = result.errors[0];
    throw new Error(`CSV parsing error at row ${error.row}: ${error.message}`);
  }

  return result.data;
}


import { getLocation, findNodeAtOffset } from 'jsonc-parser';

/**
 * Get the JSON path at a specific character offset
 */
export function getJSONPathAtPosition(json: string, offset: number): string {
  if (!json || offset < 0 || offset > json.length) return '';

  try {
    const location = getLocation(json, offset);
    let path = location.path;
    if (path[path.length - 1] === '') {
      path = path.slice(0, path.length - 1)
    }

    if (!path || path.length === 0) return '';
    let result = '';
    for (let i = 0; i < path.length; i++) {
      const segment = path[i];

      if (typeof segment === 'number') {
        result += `[${segment}]`;
      } else {
        // Check if the segment is a valid JavaScript identifier
        // If it is, we can use dot notation. Otherwise, use bracket notation.
        // Valid identifier: starts with letter, _, $; followed by letters, numbers, _, $
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)) {
          if (result.length > 0) {
            result += '.';
          }
          result += segment;
        } else {
          // Use bracket notation for non-identifiers (including empty strings)
          result += `['${segment}']`;
        }
      }
    }

    return result;
  } catch (e) {
    console.error('Error getting JSON path:', e);
    return '';
  }
}
