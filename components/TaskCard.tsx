
import React, { useState, useEffect, useRef } from 'react';
import type { TaskItem, CognitiveParserOutput, TaskStatus, UserEdit } from '../types';

interface TaskCardProps {
  task: TaskItem;
  allContexts: Map<string, CognitiveParserOutput>;
  onUpdateTask: (taskId: string, updates: Partial<TaskItem>, editLog?: UserEdit) => void;
  onRateTaskAccuracy: (taskId: string, rating: 'relevant' | 'irrelevant') => void;
}

const DetailItem: React.FC<{ label: string; value: string | number | undefined | null; isMono?: boolean; isSmall?: boolean; truncate?: boolean; className?: string }> = ({ label, value, isMono = false, isSmall = false, truncate = false, className = "" }) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return (
    <div className={`text-slate-400 ${isSmall ? 'text-xs' : 'text-sm'} ${className}`}>
      <span className="font-semibold text-slate-300">{label}: </span>
      <span className={`${isMono ? 'font-mono' : ''} ${truncate ? 'truncate block' : ''}`} title={truncate && typeof value === 'string' ? value : undefined}>
        {String(value)}
      </span>
    </div>
  );
};

const ContextDetailsDisplay: React.FC<{ context: CognitiveParserOutput | undefined; title: string }> = ({ context, title }) => {
  if (!context) return <p className="text-xs text-slate-500 italic mt-1">{title}: Context data not available.</p>;
  return (
    <div className="space-y-0.5 mt-1 p-1.5 bg-slate-900/60 rounded-md border border-slate-600/50">
        <h5 className="text-xs font-semibold text-sky-400 mb-0.5">{title} (Via {context.captureModeUsed})</h5>
        <DetailItem label="Activity" value={context.inferredActivity} isSmall truncate />
        {context.activeApplication && <DetailItem label="App" value={context.activeApplication} isSmall truncate />}
        {context.windowTitle && <DetailItem label="Window" value={context.windowTitle} isSmall truncate />}
        
        {context.keyTexts && context.keyTexts.length > 0 && (
          <div className="text-slate-400 text-xs mt-0.5">
            <span className="font-semibold text-slate-300">Key Texts: </span>
            <ul className="list-disc list-inside pl-1">
              {context.keyTexts.slice(0,2).map((kt, i) => <li key={`${context.id}-kt-${i}`} className="truncate" title={kt.text}>{kt.text} {kt.role && `(${kt.role})`}</li>)}
            </ul>
          </div>
        )}
        {context.uiElements && context.uiElements.length > 0 && (
           <div className="text-slate-400 text-xs mt-0.5">
            <span className="font-semibold text-slate-300">UI Elements: </span>
            <ul className="list-disc list-inside pl-1">
              {context.uiElements.slice(0,2).map((el, i) => <li key={`${context.id}-ui-${i}`} className="truncate" title={el.label}>{el.type} {el.label && `- ${el.label}`} {el.state && `(${el.state})`}</li>)}
            </ul>
          </div>
        )}
    </div>
  );
};


export const TaskCard: React.FC<TaskCardProps> = ({ task, allContexts, onUpdateTask, onRateTaskAccuracy }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editingDesc, setEditingDesc] = useState(task.description);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editingNotes, setEditingNotes] = useState(task.notes || '');
  const [newTag, setNewTag] = useState('');

  const descInputRef = useRef<HTMLTextAreaElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingDescription && descInputRef.current) {
        descInputRef.current.focus();
        descInputRef.current.select();
    }
  }, [isEditingDescription]);

  useEffect(() => {
    if (isEditingNotes && notesInputRef.current) {
        notesInputRef.current.focus();
    }
  }, [isEditingNotes]);


  const latestContext = task.latestContextId ? allContexts.get(task.latestContextId) : undefined;
  const firstSeenContext = task.firstSeenContextId ? allContexts.get(task.firstSeenContextId) : undefined;

  const timeAgo = (ts: number) => {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 5) return `just now`;
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours/24);
    return `${days}d ago`;
  };

  const handleDescriptionSave = () => {
    if (editingDesc.trim() === '') {
        alert("Description cannot be empty.");
        setEditingDesc(task.description); // Revert
        setIsEditingDescription(false);
        return;
    }
    if (editingDesc !== task.description) {
        onUpdateTask(task.id, { description: editingDesc.trim() }, {
            timestamp: Date.now(),
            editedField: 'description',
            oldValue: task.description,
            newValue: editingDesc.trim(),
            editSource: 'user_manual'
        });
    }
    setIsEditingDescription(false);
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (newStatus !== task.status) {
        onUpdateTask(task.id, { status: newStatus }, {
            timestamp: Date.now(),
            editedField: 'status',
            oldValue: task.status,
            newValue: newStatus,
            editSource: 'user_manual'
        });
    }
  };
  
  const handleNotesSave = () => {
    if (editingNotes.trim() !== (task.notes || '').trim()) {
        onUpdateTask(task.id, { notes: editingNotes.trim() }, {
            timestamp: Date.now(),
            editedField: 'notes',
            oldValue: task.notes || '',
            newValue: editingNotes.trim(),
            editSource: 'user_manual'
        });
    }
    setIsEditingNotes(false);
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase();
    if (trimmedTag && !(task.tags || []).includes(trimmedTag)) {
      const updatedTags = [...(task.tags || []), trimmedTag];
      onUpdateTask(task.id, { tags: updatedTags }, {
        timestamp: Date.now(),
        editedField: 'tags',
        oldValue: task.tags,
        newValue: updatedTags,
        editSource: 'user_manual'
      });
      setNewTag('');
    } else if (!trimmedTag) {
        alert("Tag cannot be empty.");
    } else {
        alert("Tag already exists.");
        setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = (task.tags || []).filter(t => t !== tagToRemove);
    onUpdateTask(task.id, { tags: updatedTags }, {
        timestamp: Date.now(),
        editedField: 'tags',
        oldValue: task.tags,
        newValue: updatedTags,
        editSource: 'user_manual'
      });
  };

  const handleFeedback = (rating: 'relevant' | 'irrelevant') => {
    onRateTaskAccuracy(task.id, rating);
  };

  return (
    <div className="p-2 sm:p-3 bg-slate-700/70 rounded-md shadow border border-slate-600/70 hover:border-sky-500/60 transition-all duration-150 ease-in-out">
      <div className="flex justify-between items-start mb-1">
        {!isEditingDescription ? (
          <h3 
            className="text-sm sm:text-md font-semibold text-sky-300 flex-grow mr-2 break-words pr-1 cursor-pointer hover:text-sky-200"
            onClick={() => { setIsEditingDescription(true); setEditingDesc(task.description);}}
            title="Click to edit description"
          >
            {task.description}
          </h3>
        ) : (
          <div className="flex-grow mr-2">
            <textarea
              ref={descInputRef}
              value={editingDesc}
              onChange={(e) => setEditingDesc(e.target.value)}
              onBlur={handleDescriptionSave} // Save on blur
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescriptionSave(); } if (e.key === 'Escape') { setIsEditingDescription(false); setEditingDesc(task.description); } }}
              className="w-full p-1 text-sm bg-slate-600 border border-sky-500 rounded-md text-slate-100 focus:ring-sky-400 focus:border-sky-400 custom-scrollbar-xs"
              rows={Math.max(2, Math.min(5, editingDesc.split('\n').length))} // Dynamic rows
            />
            <div className="flex justify-end space-x-1 mt-1">
                <button onClick={() => {setIsEditingDescription(false); setEditingDesc(task.description);}} className="text-xs px-1.5 py-0.5 rounded bg-slate-500 hover:bg-slate-400">Cancel</button>
                <button onClick={handleDescriptionSave} className="text-xs px-1.5 py-0.5 rounded bg-sky-600 hover:bg-sky-500">Save</button>
            </div>
          </div>
        )}
        <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-1.5 py-0.5 text-xs font-medium rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors flex-shrink-0"
            aria-expanded={showDetails}
            aria-controls={`task-details-${task.id}`}
            title={showDetails ? "Hide details" : "Show details"}
          >
            {showDetails ? 'Less' : 'More...'}
        </button>
      </div>
      
      <div className="text-xs text-slate-400 mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
         {showDetails ? (
            <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className={`font-bold px-1.5 py-0.5 rounded-full text-xs shadow-sm appearance-none cursor-pointer focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-700
                    ${task.status === 'Done' ? 'bg-green-700/80 text-green-100 focus:ring-green-400' :
                    task.status === 'Doing' ? 'bg-yellow-600/80 text-yellow-100 animate-pulse focus:ring-yellow-400' :
                    'bg-blue-700/80 text-blue-100 focus:ring-blue-400'
                    }`}
            >
                <option value="To-Do">To-Do</option>
                <option value="Doing">Doing</option>
                <option value="Done">Done</option>
            </select>
         ) : (
            <span className={`font-bold px-1.5 py-0.5 rounded-full text-xs shadow-sm ${
                task.status === 'Done' ? 'bg-green-700/80 text-green-100' :
                task.status === 'Doing' ? 'bg-yellow-600/80 text-yellow-100 animate-pulse' :
                'bg-blue-700/80 text-blue-100'
              }`}>
                {task.status}
            </span>
         )}
        <span title={new Date(task.lastUpdatedTimestamp).toLocaleString()}>Updated: {timeAgo(task.lastUpdatedTimestamp)}</span>
        {task.priority && <span className={`hidden sm:inline px-1.5 py-0.5 rounded-full text-xs ${task.priority === 'high' ? 'bg-red-500/70 text-red-100' : task.priority === 'medium' ? 'bg-orange-500/70 text-orange-100' : 'bg-slate-500/70 text-slate-200'}`}>{task.priority}</span>}
        {task.confidence && <span className="hidden sm:inline">(Conf: {(task.confidence * 100).toFixed(0)}%)</span>}
      </div>

      {latestContext && !showDetails && (
        <p className="text-xs sm:text-sm text-slate-300 bg-slate-800/60 p-1.5 rounded-sm border border-slate-600/40 max-h-16 overflow-y-auto custom-scrollbar-xs mb-1 text-ellipsis overflow-hidden" title={`Latest activity: ${latestContext.inferredActivity}`}>
          <em>Context:</em> {latestContext.inferredActivity}
        </p>
      )}
       {task.tags && task.tags.length > 0 && !showDetails && (
         <div className="flex flex-wrap gap-1 mt-1 mb-1">
            {task.tags.slice(0,3).map(tag => ( // Show only a few tags when details are hidden
                <span key={tag} className="text-xs bg-sky-700/70 text-sky-200 px-1.5 py-0.5 rounded-full">
                    #{tag}
                </span>
            ))}
            {task.tags.length > 3 && <span className="text-xs text-sky-400">...</span>}
        </div>
       )}


      {showDetails && (
        <div id={`task-details-${task.id}`} className="mt-1.5 border-t border-slate-600/70 pt-1.5 space-y-2.5">
          <DetailItem label="Task ID" value={task.id} isMono isSmall truncate />
          <DetailItem label="First Seen" value={`${new Date(task.firstSeenTimestamp).toLocaleTimeString([], { day: 'numeric', month:'short', hour: '2-digit', minute: '2-digit' })} (${timeAgo(task.firstSeenTimestamp)})`} isSmall />
          
          <div>
            <div className="flex justify-between items-center">
                <h4 className="text-xs font-semibold text-slate-300">Notes:</h4>
                {!isEditingNotes && (
                    <button onClick={() => {setIsEditingNotes(true); setEditingNotes(task.notes || '');}} className="text-xs px-1.5 py-0.5 rounded bg-slate-600 hover:bg-slate-500">Edit Notes</button>
                )}
            </div>
            {isEditingNotes ? (
                 <div className="mt-1">
                    <textarea
                        ref={notesInputRef}
                        value={editingNotes}
                        onChange={(e) => setEditingNotes(e.target.value)}
                        onBlur={() => handleNotesSave()}
                        onKeyDown={(e) => { if (e.key === 'Escape') { setIsEditingNotes(false); setEditingNotes(task.notes || ''); }}}
                        className="w-full p-1 text-xs bg-slate-600 border border-sky-500 rounded-md text-slate-100 focus:ring-sky-400 focus:border-sky-400 custom-scrollbar-xs"
                        rows={3}
                        placeholder="Add notes for this task..."
                    />
                    <div className="flex justify-end space-x-1 mt-1">
                        <button onClick={() => {setIsEditingNotes(false); setEditingNotes(task.notes || '');}} className="text-xs px-1.5 py-0.5 rounded bg-slate-500 hover:bg-slate-400">Cancel</button>
                        <button onClick={handleNotesSave} className="text-xs px-1.5 py-0.5 rounded bg-sky-600 hover:bg-sky-500">Save Notes</button>
                    </div>
                </div>
            ) : (
                task.notes ? <p className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-800/50 p-1.5 rounded-sm border border-slate-600/30">{task.notes}</p> : <p className="text-xs text-slate-500 italic">No notes added.</p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-300">Tags:</h4>
            <div className="flex flex-wrap gap-1 mt-1">
                {(task.tags || []).map(tag => (
                    <span key={tag} className="text-xs bg-sky-700/80 text-sky-100 px-1.5 py-0.5 rounded-full flex items-center">
                        #{tag}
                        <button onClick={() => handleRemoveTag(tag)} className="ml-1 text-sky-300 hover:text-white text-sm leading-none" title="Remove tag">&times;</button>
                    </span>
                ))}
            </div>
            <div className="flex items-center gap-1 mt-1.5">
                <input 
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {if (e.key === 'Enter') {e.preventDefault(); handleAddTag();}}}
                    placeholder="Add tag..."
                    className="flex-grow p-1 text-xs bg-slate-600 border border-slate-500 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
                />
                <button onClick={handleAddTag} className="text-xs px-2 py-1 rounded bg-sky-600 hover:bg-sky-500">Add</button>
            </div>
          </div>
          
          {task.keywords && task.keywords.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mt-1.5">Associated Keywords:</h4>
              <div className="flex flex-wrap gap-1 mt-1">
                {task.keywords.map((kw, idx) => (
                  <span key={`${kw}-${idx}`} className="text-xs bg-teal-700/70 text-teal-100 px-1.5 py-0.5 rounded-full">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {task.relatedTaskSuggestions && task.relatedTaskSuggestions.length > 0 && (
            <div className="mt-2">
              <h4 className="text-xs font-semibold text-slate-300">Suggested Related Tasks:</h4>
              <ul className="list-disc list-inside pl-2 text-xs text-slate-400 max-h-24 overflow-y-auto custom-scrollbar-xs space-y-0.5 mt-1">
                {task.relatedTaskSuggestions.map(suggestion => (
                  <li key={suggestion.taskId} className="hover:text-slate-200">
                    <span className="font-medium text-slate-300 truncate" title={suggestion.description}>{suggestion.description.substring(0,40)}{suggestion.description.length > 40 ? "..." : ""}</span>
                    <span className="text-slate-500 text-[0.65rem] ml-1"> (Reason: {suggestion.reason.substring(0,30)}{suggestion.reason.length > 30 ? "..." : ""}, Conf: {(suggestion.confidence * 100).toFixed(0)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.historySnapshots && task.historySnapshots.length > 0 && (
             <div className="mt-2">
                <p className="text-xs font-semibold text-slate-300">Context History ({task.historySnapshots.length}):</p>
                <ul className="list-disc list-inside pl-2 text-xs text-slate-400 max-h-20 overflow-y-auto custom-scrollbar-xs space-y-0.5 mt-1">
                    {task.historySnapshots.map((snapshot, idx) => <li key={idx} className="truncate" title={snapshot}>{snapshot}</li>)}
                </ul>
            </div>
          )}
          
          {task.userEditsHistory && task.userEditsHistory.length > 0 && (
             <div className="mt-2">
                <p className="text-xs font-semibold text-slate-300">Edit History ({task.userEditsHistory.length}):</p>
                <ul className="list-disc list-inside pl-2 text-xs text-slate-400 max-h-20 overflow-y-auto custom-scrollbar-xs space-y-0.5 mt-1">
                    {task.userEditsHistory.slice(-3).map((edit, idx) => (
                        <li key={idx} className="truncate" title={`(${edit.editSource}) Field: ${edit.editedField}, New: ${typeof edit.newValue === 'string' ? edit.newValue.substring(0,30) : JSON.stringify(edit.newValue)}, Old: ${typeof edit.oldValue === 'string' ? edit.oldValue.substring(0,30) : JSON.stringify(edit.oldValue)}`}>
                            ({edit.editSource}) Edited {edit.editedField} ({timeAgo(edit.timestamp)})
                        </li>
                    ))}
                </ul>
            </div>
          )}

          {latestContext && <ContextDetailsDisplay context={latestContext} title="Latest Context" />}
          
          {firstSeenContext && firstSeenContext.id !== latestContext?.id && (
            <ContextDetailsDisplay context={firstSeenContext} title="Initial Context" />
          )}

          <div className="mt-2.5 pt-2 border-t border-slate-600/70">
            <h4 className="text-xs font-semibold text-slate-300 mb-1">AI Task Accuracy Feedback:</h4>
            <div className="flex space-x-2">
              <button
                onClick={() => handleFeedback('relevant')}
                className={`text-xs px-2 py-1 rounded ${task.aiAccuracyFeedback?.rating === 'relevant' ? 'bg-green-600 text-white ring-2 ring-green-400' : 'bg-slate-600 hover:bg-green-700'}`}
                aria-pressed={task.aiAccuracyFeedback?.rating === 'relevant'}
                title="Mark AI processing for this task as relevant"
              >
                👍 Relevant
              </button>
              <button
                onClick={() => handleFeedback('irrelevant')}
                className={`text-xs px-2 py-1 rounded ${task.aiAccuracyFeedback?.rating === 'irrelevant' ? 'bg-red-600 text-white ring-2 ring-red-400' : 'bg-slate-600 hover:bg-red-700'}`}
                aria-pressed={task.aiAccuracyFeedback?.rating === 'irrelevant'}
                title="Mark AI processing for this task as irrelevant"
              >
                👎 Irrelevant
              </button>
            </div>
            {task.aiAccuracyFeedback && <p className="text-xs text-slate-500 mt-1">Feedback given: {task.aiAccuracyFeedback.rating} ({timeAgo(task.aiAccuracyFeedback.timestamp)})</p>}
          </div>
        </div>
      )}
    </div>
  );
};
