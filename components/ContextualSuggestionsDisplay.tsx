
import React, { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface ContextualSuggestionsDisplayProps {
  suggestions: string[];
  contextTitle: string | null;
  isLoading: boolean;
  contextIdForFeedback: string | null; // ID of the CognitiveParserOutput
  onRateSuggestions: (contextId: string, rating: 'useful' | 'not_useful') => void;
  currentFeedback?: 'useful' | 'not_useful' | 'neutral';
}

export const ContextualSuggestionsDisplay: React.FC<ContextualSuggestionsDisplayProps> = ({
  suggestions,
  contextTitle,
  isLoading,
  contextIdForFeedback,
  onRateSuggestions,
  currentFeedback
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="w-full max-w-xl mx-auto mt-3 mb-1 p-3 bg-slate-850 rounded-lg shadow-md">
        <div className="flex items-center justify-center text-sky-300">
          <LoadingSpinner size="sm" />
          <span className="ml-2 text-xs sm:text-sm">AI is generating suggestions...</span>
        </div>
      </div>
    );
  }
  
  if (!suggestions.length || !contextTitle) {
    return null;
  }

  const handleSuggestionClick = (suggestionText: string, index: number) => {
    navigator.clipboard.writeText(suggestionText).then(() => {
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 1500); 
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleFeedbackClick = (rating: 'useful' | 'not_useful') => {
    if (contextIdForFeedback) {
        onRateSuggestions(contextIdForFeedback, rating);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-3 mb-1 p-2.5 sm:p-3 bg-slate-850 rounded-lg shadow-lg border border-sky-700/50">
      <div className="flex justify-between items-start mb-1.5">
        <h3 className="text-sm sm:text-md font-semibold text-sky-300 ">{contextTitle}</h3>
        {contextIdForFeedback && (
            <div className="flex space-x-1.5 flex-shrink-0">
                 <button
                    onClick={() => handleFeedbackClick('useful')}
                    className={`text-xs px-1.5 py-0.5 rounded ${currentFeedback === 'useful' ? 'bg-green-600 text-white' : 'bg-slate-600 hover:bg-green-700'}`}
                    aria-pressed={currentFeedback === 'useful'}
                    title="Suggestions were useful"
                >
                    👍
                </button>
                <button
                    onClick={() => handleFeedbackClick('not_useful')}
                    className={`text-xs px-1.5 py-0.5 rounded ${currentFeedback === 'not_useful' ? 'bg-red-600 text-white' : 'bg-slate-600 hover:bg-red-700'}`}
                    aria-pressed={currentFeedback === 'not_useful'}
                    title="Suggestions were not useful"
                >
                    👎
                </button>
            </div>
        )}
      </div>
      {suggestions.length === 0 ? (
        <p className="text-slate-400 text-xs sm:text-sm italic">No suggestions available for this context.</p>
      ) : (
        <ul className="space-y-1">
          {suggestions.map((suggestion, index) => (
            <li 
              key={index} 
              className={`p-1.5 sm:p-2 text-xs sm:text-sm rounded-md border transition-all duration-150 cursor-pointer 
                ${copiedIndex === index 
                  ? 'bg-green-600 border-green-500 text-white' 
                  : 'bg-slate-700/70 border-slate-600 hover:border-sky-500 text-slate-200 hover:bg-slate-700'
                }`}
              title="Click to copy suggestion"
              onClick={() => handleSuggestionClick(suggestion, index)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && handleSuggestionClick(suggestion, index)}
            >
              {copiedIndex === index ? 'Copied!' : suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
