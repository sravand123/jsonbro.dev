import React from 'react';
import { Brain, Zap, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntelligentStatusProps {
  className?: string;
  suggestionsActive?: boolean;
  contextAnalyzed?: boolean;
  patternsLearned?: number;
}

export function IntelligentStatus({ 
  className, 
  suggestionsActive = false, 
  contextAnalyzed = false, 
  patternsLearned = 0 
}: IntelligentStatusProps) {
  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <div className="flex items-center gap-1">
        <Brain className={cn("h-3 w-3", suggestionsActive ? "text-green-500" : "text-gray-400")} />
        <span className={suggestionsActive ? "text-green-600 dark:text-green-400" : ""}>
          Smart
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        <Target className={cn("h-3 w-3", contextAnalyzed ? "text-blue-500" : "text-gray-400")} />
        <span className={contextAnalyzed ? "text-blue-600 dark:text-blue-400" : ""}>
          Context
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        <Zap className={cn("h-3 w-3", patternsLearned > 0 ? "text-purple-500" : "text-gray-400")} />
        <span className={patternsLearned > 0 ? "text-purple-600 dark:text-purple-400" : ""}>
          {patternsLearned} patterns
        </span>
      </div>
      
      {suggestionsActive && (
        <div className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
          Learning
        </div>
      )}
    </div>
  );
}