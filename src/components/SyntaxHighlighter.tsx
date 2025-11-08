import React, { useMemo } from 'react';
import { JSONError } from '../utils/jsonUtils';

interface SyntaxHighlighterProps {
  content: string;
  className?: string;
  error?: JSONError;
}

interface Token {
  type: string;
  value: string;
  start: number;
  end: number;
}

const tokenPatterns = [
  { type: 'string', pattern: /"[^"\\]*(\\[.][^"\\]*)*"/g },
  { type: 'number', pattern: /-?\d+(\.\d+)?([eE][+-]?\d+)?/g },
  { type: 'boolean', pattern: /\b(true|false)\b/g },
  { type: 'null', pattern: /\bnull\b/g },
  { type: 'punctuation', pattern: /[{}[\],:]/g },
];

export function SyntaxHighlighter({ content, className = '', error }: SyntaxHighlighterProps) {
  const tokens = useMemo(() => {
    const allTokens: Token[] = [];
    let processedContent = content;

    // First, identify all tokens
    tokenPatterns.forEach(({ type, pattern }) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        allTokens.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    });

    // Sort tokens by position
    allTokens.sort((a, b) => a.start - b.start);

    return allTokens;
  }, [content]);

  const highlightedContent = useMemo(() => {
    let result = '';
    let lastIndex = 0;

    tokens.forEach((token, index) => {
      // Add any non-token content before this token
      if (token.start > lastIndex) {
        result += content.slice(lastIndex, token.start);
      }

      // Add the token with appropriate styling
      const isError = error && 
        token.start <= (error.position || 0) && 
        token.end >= (error.position || 0);

      const tokenClass = getTokenClass(token.type, isError);
      result += `<span class="${tokenClass}">${escapeHtml(token.value)}</span>`;

      lastIndex = token.end;
    });

    // Add any remaining content
    if (lastIndex < content.length) {
      result += content.slice(lastIndex);
    }

    return result;
  }, [tokens, content, error]);

  return (
    <div className={`relative ${className}`}>
      <pre className="whitespace-pre-wrap font-mono text-sm overflow-auto p-4">
        <code 
          dangerouslySetInnerHTML={{ __html: highlightedContent }}
          className="select-text"
        />
      </pre>
      {error && (
        <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-mono">
          Line {error.line}, Column {error.column}
        </div>
      )}
    </div>
  );
}

function getTokenClass(type: string, isError: boolean): string {
  const baseClasses = 'font-mono';
  
  if (isError) {
    return `${baseClasses} bg-red-500/20 text-red-600 dark:text-red-400`;
  }

  switch (type) {
    case 'string':
      return `${baseClasses} text-green-600 dark:text-green-400`;
    case 'number':
      return `${baseClasses} text-blue-600 dark:text-blue-400`;
    case 'boolean':
      return `${baseClasses} text-purple-600 dark:text-purple-400`;
    case 'null':
      return `${baseClasses} text-gray-600 dark:text-gray-400`;
    case 'punctuation':
      return `${baseClasses} text-gray-500 dark:text-gray-300`;
    default:
      return baseClasses;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}