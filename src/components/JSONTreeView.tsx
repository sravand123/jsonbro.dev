import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Hash, Quote, Type, Square, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JSONTreeViewProps {
  data: any;
  path?: string;
  depth?: number;
}

interface TreeNodeProps {
  key: string;
  value: any;
  path: string;
  depth: number;
}

function TreeNode({ key, value, path, depth }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels

  const getTypeIcon = (val: any) => {
    if (val === null) return <Circle className="h-3 w-3" />;
    if (typeof val === 'string') return <Quote className="h-3 w-3" />;
    if (typeof val === 'number') return <Type className="h-3 w-3" />;
    if (typeof val === 'boolean') return <Square className="h-3 w-3" />;
    if (Array.isArray(val)) return <Hash className="h-3 w-3" />;
    if (typeof val === 'object') return <Hash className="h-3 w-3" />;
    return <Circle className="h-3 w-3" />;
  };

  const getTypeColor = (val: any) => {
    if (val === null) return 'text-gray-500';
    if (typeof val === 'string') return 'text-green-600 dark:text-green-400';
    if (typeof val === 'number') return 'text-blue-600 dark:text-blue-400';
    if (typeof val === 'boolean') return 'text-purple-600 dark:text-purple-400';
    if (Array.isArray(val)) return 'text-orange-600 dark:text-orange-400';
    if (typeof val === 'object') return 'text-yellow-600 dark:text-yellow-400';
    return 'text-gray-500';
  };

  const formatValue = (val: any, isCollapsed: boolean = false): string => {
    if (val === null) return 'null';
    if (typeof val === 'string') return `"${val}"`;
    if (typeof val === 'number') return val.toString();
    if (typeof val === 'boolean') return val.toString();
    if (Array.isArray(val)) {
      return isCollapsed ? '[...]' : `Array(${val.length})`;
    }
    if (typeof val === 'object' && val !== null) {
      return isCollapsed ? '{...}' : `Object(${Object.keys(val).length})`;
    }
    return String(val);
  };
  
  // Ensure collapsed values don't have any whitespace that could cause wrapping
  const getDisplayValue = (val: any, isCollapsed: boolean) => {
    const formatted = formatValue(val, isCollapsed);
    return isCollapsed ? formatted.replace(/\s+/g, '') : formatted;
  };

  const hasChildren = () => {
    return (typeof value === 'object' && value !== null) || Array.isArray(value);
  };

  const toggleExpanded = () => {
    if (hasChildren()) {
      setIsExpanded(!isExpanded);
    }
  };

  const isCollapsed = !isExpanded && hasChildren();
  
  if (isCollapsed) {
    // Render collapsed items as a single inline element
    return (
      <div 
        className={cn(
          "inline-flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer select-text",
          depth > 0 && "ml-4"
        )}
        onClick={toggleExpanded}
        style={{
          display: 'inline-flex',
          whiteSpace: 'nowrap',
          flexWrap: 'nowrap'
        }}
      >
        <button className="p-0.5 hover:bg-muted rounded flex-shrink-0">
          <ChevronRight className="h-3 w-3" />
        </button>
        
        <div className={cn("flex items-center gap-1.5 flex-shrink-0", getTypeColor(value))}>
          {getTypeIcon(value)}
          <span className="text-sm font-mono">{key}:</span>
        </div>
        
        <span 
          className={cn("text-sm font-mono flex-shrink-0", getTypeColor(value))}
          style={{
            display: 'inline',
            whiteSpace: 'nowrap'
          }}
        >
          {formatValue(value, true)}
        </span>
      </div>
    );
  }
  
  // Render expanded items normally
  return (
    <div className="select-text">
      <div 
        className={cn(
          "flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer",
          depth > 0 && "ml-4"
        )}
        onClick={toggleExpanded}
      >
        {hasChildren() ? (
          <button className="p-0.5 hover:bg-muted rounded">
            <ChevronDown className="h-3 w-3" />
          </button>
        ) : (
          <div className="w-5" /> // Spacer for alignment
        )}
        
        <div className={cn("flex items-center gap-1.5", getTypeColor(value))}>
          {getTypeIcon(value)}
          <span className="text-sm font-mono">{key}:</span>
        </div>
        
        <span className={cn("text-sm font-mono", getTypeColor(value))}>
          {formatValue(value, false)}
        </span>
      </div>

      {isExpanded && hasChildren() && (
        <div className="border-l border-border ml-2">
          {Array.isArray(value) ? (
            value.map((item, index) => (
              <TreeNode
                key={index.toString()}
                value={item}
                path={`${path}[${index}]`}
                depth={depth + 1}
              />
            ))
          ) : (
            Object.entries(value).map(([childKey, childValue]) => (
              <TreeNode
                key={childKey}
                value={childValue}
                path={`${path}.${childKey}`}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function JSONTreeView({ data, path = 'root', depth = 0 }: JSONTreeViewProps) {
  if (data === null) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Circle className="h-3 w-3 text-gray-500" />
        <span className="text-sm font-mono text-gray-500">null</span>
      </div>
    );
  }

  if (typeof data !== 'object') {
    return (
      <div className="flex items-center gap-2 py-1">
        {typeof data === 'string' && <Quote className="h-3 w-3 text-green-600" />}
        {typeof data === 'number' && <Type className="h-3 w-3 text-blue-600" />}
        {typeof data === 'boolean' && <Square className="h-3 w-3 text-purple-600" />}
        <span className={cn(
          "text-sm font-mono",
          typeof data === 'string' && "text-green-600 dark:text-green-400",
          typeof data === 'number' && "text-blue-600 dark:text-blue-400",
          typeof data === 'boolean' && "text-purple-600 dark:text-purple-400"
        )}>
          {typeof data === 'string' ? `"${data}"` : String(data)}
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const entries = isArray ? data : Object.entries(data);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 py-2 border-b">
        <Hash className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-mono text-muted-foreground">
          {isArray ? `Array(${data.length})` : `Object(${Object.keys(data).length})`}
        </span>
      </div>

      {entries.map(([key, value]) => (
        <TreeNode
          key={key}
          value={value}
          path={isArray ? `${path}[${key}]` : `${path}.${key}`}
          depth={0}
        />
      ))}
    </div>
  );
}