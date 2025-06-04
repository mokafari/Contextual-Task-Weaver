import React, { useState } from 'react';
import { 
    FiChevronLeft, FiChevronRight, FiSettings, 
    FiCpu, FiZap, FiChevronDown, FiChevronUp,  // FiMessageSquare, FiTerminal removed as they are not used for now
    FiAlertTriangle, FiRefreshCw, FiUnlock
} from 'react-icons/fi';
import { AIProposedHookCommand, MacOSActiveApplicationInfo, HookMessage, AppSettings, LockedKeyword } from '../types';
import { HookStatus } from '../services/nativeHookService'; // Sole import for HookStatus enum
import { v4 as uuidv4 } from 'uuid'; // For generating IDs for new locked keywords

interface AIHubSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  hookStatus: HookStatus;
  hookStatusMessage?: string;
  flowStateHue: number;
  inferredContextTags: string[];
  lastExecutedHookCommand: HookMessage | null; 
  lastProposedAIAction: AIProposedHookCommand | null;
  isProposingAIAction: boolean;
  naturalLanguageCommandInput: string;
  onSetNaturalLanguageCommandInput: (value: string) => void;
  onProposeAIAction: () => void;
  onExecuteAIAction: (command: AIProposedHookCommand) => void;
  onCancelAIAction: (actionId: string) => void;
  isExecutingAIAction: boolean;
  activeMacosAppInfo: MacOSActiveApplicationInfo | null; 
  onRestartCursor: () => void; 
  isRestartingCursor: boolean; 
  settings: AppSettings;
  onSettingsChange: (newSettings: Partial<AppSettings>) => void;
  availableModels: string[];
  isAIPromptContext: boolean;
}

const iconSize = 16;

const AIHubSidebar: React.FC<AIHubSidebarProps> = ({
  isOpen,
  onToggle,
  hookStatus,
  hookStatusMessage,
  flowStateHue,
  inferredContextTags,
  lastExecutedHookCommand,
  lastProposedAIAction,
  isProposingAIAction,
  naturalLanguageCommandInput,
  onSetNaturalLanguageCommandInput,
  onProposeAIAction,
  onExecuteAIAction,
  onCancelAIAction,
  isExecutingAIAction,
  activeMacosAppInfo, 
  onRestartCursor, 
  isRestartingCursor,
  settings,
  onSettingsChange,
  availableModels,
  isAIPromptContext,
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'ai_actions' | 'settings'>('status');
  const [isExecutingThisAction, setIsExecutingThisAction] = useState<string | null>(null);

  const tabs = [
    { id: 'status', label: 'Status', icon: FiZap },
    { id: 'ai_actions', label: 'AI Actions', icon: FiCpu },
    { id: 'settings', label: 'Settings', icon: FiSettings },
  ];

  const handleExecute = async (commandToExecute: AIProposedHookCommand) => {
    if (!commandToExecute.id) {
      console.error("Cannot execute action without an ID");
      return;
    }
    setIsExecutingThisAction(commandToExecute.id);
    try {
      await onExecuteAIAction(commandToExecute);
    } finally {
      setIsExecutingThisAction(null);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'status':
        return (
          <>
            <div className="p-1 text-xs text-neutral-400 mb-1">Real-time System & AI Feed:</div>
            <div className="text-xs p-2 bg-neutral-900 rounded-md min-h-[100px] max-h-[300px] overflow-y-auto font-mono leading-relaxed break-all whitespace-pre-wrap scrollbar-thin scrollbar-thumb-neutral-600 scrollbar-track-neutral-700">
              <p><span className="font-semibold text-sky-400">FlowState Hue:</span> {flowStateHue}</p>
              <p><span className="font-semibold text-sky-400">Inferred Tags:</span> {inferredContextTags.join(', ') || 'N/A'}</p>
              {activeMacosAppInfo && (
                <>
                  <p><span className="font-semibold text-sky-400">Active App:</span> {activeMacosAppInfo.application_name}</p>
                  <p><span className="font-semibold text-sky-400">Window:</span> {activeMacosAppInfo.window_title}</p>
                  <p><span className="font-semibold text-sky-400">Bundle ID:</span> {activeMacosAppInfo.bundle_id}</p>
                </>
              )}
              {lastExecutedHookCommand && (
                <div className="mt-2 pt-2 border-t border-neutral-700">
                  <p className="font-semibold text-amber-400">Last Hook Action:</p>
                  <p>ID: {lastExecutedHookCommand.id}</p>
                  <p>Type: {lastExecutedHookCommand.type}</p>
                  <p>Status: {lastExecutedHookCommand.status}</p>
                  {lastExecutedHookCommand.error_message && <p className={'text-red-400'}>Error: {lastExecutedHookCommand.error_message}</p>}
                  {lastExecutedHookCommand.payload && <p>Payload: {JSON.stringify(lastExecutedHookCommand.payload, null, 2)}</p>}
                </div>
              )}
            </div>
          </>
        );
      case 'ai_actions':
        return (
          <>
            <div className="p-1 text-xs text-neutral-400 mb-1">Natural Language Command:</div>
            <textarea
              value={naturalLanguageCommandInput}
              onChange={(e) => onSetNaturalLanguageCommandInput(e.target.value)}
              placeholder="e.g., 'type Hello World in the active chat' or 'run git status in terminal'"
              rows={3}
              className="w-full p-2 text-xs bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none resize-none mb-2"
            />
            <button 
              onClick={onProposeAIAction}
              disabled={isProposingAIAction || !naturalLanguageCommandInput.trim()}
              className="w-full flex items-center justify-center px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 disabled:bg-neutral-600 text-white rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-neutral-800"
            >
              {isProposingAIAction ? (
                <>
                  <FiZap className={"mr-1.5 animate-ping"} /> Proposing...
                </>
              ) : (
                <>
                  <FiCpu className={"mr-1.5"} /> Propose AI Action
                </>
              )}
            </button>

            {lastProposedAIAction && (
              <div className="mt-3 pt-3 border-t border-neutral-700">
                <div className="text-xs text-neutral-400 mb-1">Last Proposed Action:</div>
                <div className="p-2 bg-neutral-900 rounded-md text-xs">
                  <p><span className="font-semibold">ID:</span> {lastProposedAIAction.id}</p>
                  <p><span className="font-semibold">Command:</span> {lastProposedAIAction.command}</p>
                  <p><span className="font-semibold">Target:</span> {lastProposedAIAction.target_app_bundle_id || 'N/A'}</p>
                  <p><span className="font-semibold">Params:</span></p>
                  <pre className={"whitespace-pre-wrap break-all text-neutral-300 text-xs"}>{JSON.stringify(lastProposedAIAction.params, null, 2)}</pre>
                  {lastProposedAIAction.confidence && (
                    <p><span className="font-semibold">Confidence:</span> {lastProposedAIAction.confidence.toFixed(2)}</p>
                  )}
                  {lastProposedAIAction.reasoning && (
                    <p><span className="font-semibold">Reasoning:</span> {lastProposedAIAction.reasoning}</p>
                  )}
                  {lastProposedAIAction.error && (
                     <p className={"text-red-400"}><span className={"font-semibold"}>Parse Error:</span> {lastProposedAIAction.error}</p>
                  )}
                </div>
                {!lastProposedAIAction.error && (
                  <div className="mt-2 flex space-x-2">
                    <button 
                      onClick={() => handleExecute(lastProposedAIAction)}
                      disabled={isExecutingAIAction || isExecutingThisAction === lastProposedAIAction.id}
                      className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:bg-neutral-600 text-white rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-neutral-800"
                    >
                      {isExecutingThisAction === lastProposedAIAction.id ? (
                        <FiZap className={"mr-1.5 animate-ping"} /> 
                      ) : (
                        <FiCpu className={"mr-1.5"} />
                      )}
                      {isExecutingThisAction === lastProposedAIAction.id ? 'Executing...' : 'Execute Action'}
                    </button>
                    <button 
                      onClick={() => lastProposedAIAction.id && onCancelAIAction(lastProposedAIAction.id)}
                      disabled={isExecutingAIAction || isExecutingThisAction === lastProposedAIAction.id}
                      className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:bg-neutral-600 text-white rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-neutral-800"
                    >
                      <FiAlertTriangle className={"mr-1.5"} /> Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Restart Cursor Button - Conditionally Rendered */}
            {activeMacosAppInfo?.bundle_id === 'com.todesktop.it.Cursor' && (
                <div className="mt-3 pt-3 border-t border-neutral-700">
                    <button 
                        onClick={onRestartCursor}
                        disabled={isRestartingCursor}
                        className="w-full flex items-center justify-center px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:bg-neutral-600 text-white rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-neutral-800"
                    >
                        <FiRefreshCw className={`mr-1.5 ${isRestartingCursor ? 'animate-spin' : ''}`} />
                        {isRestartingCursor ? 'Restarting Cursor...' : 'Restart Cursor AI'}
                    </button>
                </div>
            )}

          </>
        );
      case 'settings':
        return <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} availableModels={availableModels} />;
      default:
        return null;
    }
  };

  // Collapsed view
  if (isOpen) {
    return (
      <div className="fixed top-0 right-0 h-full bg-neutral-800 shadow-lg z-50 p-2 flex flex-col items-center">
        <button onClick={onToggle} className="p-1 text-neutral-300 hover:text-white mb-3">
          <FiChevronLeft size={iconSize + 2} />
        </button>
        {tabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} // Type assertion for tab.id
            className={`p-2 my-1 rounded-md ${activeTab === tab.id ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:bg-neutral-700 hover:text-white'}`}
            title={tab.label}
          >
            <tab.icon size={iconSize} />
          </button>
        ))}
      </div>
    );
  }

  // Expanded view
  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-neutral-800 shadow-lg z-50 flex flex-col p-3 text-sm">
      {/* Header with Toggle and Title */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
            <div 
                className="w-3 h-3 rounded-full mr-2 transition-colors duration-300"
                style={{ backgroundColor: `hsl(${flowStateHue}, 70%, 50%)` }}
                title={`FlowState Hue: ${flowStateHue}`}
            ></div>
            <h2 className="text-sm font-semibold text-white">AI Co-Captain Hub</h2>
        </div>
        <button onClick={onToggle} className="p-1 text-neutral-300 hover:text-white">
          <FiChevronRight size={iconSize + 2} />
        </button>
      </div>

      {/* Hook Connection Status */}
      <div className={`mb-3 p-2 rounded-md text-xs text-center ${hookStatus === HookStatus.CONNECTED ? 'bg-green-700 text-green-100' : hookStatus === HookStatus.CONNECTING || hookStatus === HookStatus.RECONNECTING ? 'bg-yellow-600 text-yellow-100' : 'bg-red-700 text-red-100'}`}>
        Hook: {hookStatus} {hookStatusMessage && `- ${hookStatusMessage}`}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-neutral-700 mb-3">
        {tabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} // Type assertion for tab.id
            className={`flex-1 py-2 px-1 text-xs flex items-center justify-center 
                        ${activeTab === tab.id ? 'border-b-2 border-sky-500 text-sky-400' : 'text-neutral-400 hover:text-sky-400'}`}
          >
            <tab.icon size={iconSize -2} className="mr-1" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-neutral-600 scrollbar-track-neutral-700">
        {renderContent()}
      </div>
    </div>
  );
};

// Settings Panel 
interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (newSettings: Partial<AppSettings>) => void;
  availableModels: string[];
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSettingsChange, availableModels }) => {
  const [newKeyword, setNewKeyword] = useState('');
  const [newKeywordMeaning, setNewKeywordMeaning] = useState('');
  const [activeSettingsTab, setActiveSettingsTab] = useState('general'); // 'general', 'keywords'

  const handleAddKeyword = () => {
    if (newKeyword.trim()) { // Meaning can be optional initially
      const newLockedKeyword: LockedKeyword = {
        id: uuidv4(),
        phrase: newKeyword.trim(),
        meaning: newKeywordMeaning.trim() || undefined, // Set to undefined if empty
        context: 'user-defined',
        priority: 3, // Default priority
        createdAt: Date.now(),
      };
      const updatedKeywords = [...(settings.lockedKeywords || []), newLockedKeyword];
      onSettingsChange({ lockedKeywords: updatedKeywords });
      setNewKeyword('');
      setNewKeywordMeaning('');
    }
  };

  const handleRemoveKeyword = (index: number) => {
    const updatedKeywords = [...(settings.lockedKeywords || [])];
    updatedKeywords.splice(index, 1);
    onSettingsChange({ lockedKeywords: updatedKeywords });
  };

  return (
    <div className="space-y-4 text-xs">
        <div className="flex border-b border-neutral-700 mb-2">
            <button 
                onClick={() => setActiveSettingsTab('general')}
                className={`flex-1 py-1.5 px-1 text-xs ${activeSettingsTab === 'general' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-neutral-400 hover:text-amber-400'}`}
            >
                General
            </button>
            <button 
                onClick={() => setActiveSettingsTab('keywords')}
                className={`flex-1 py-1.5 px-1 text-xs ${activeSettingsTab === 'keywords' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-neutral-400 hover:text-amber-400'}`}
            >
                Locked Keywords
            </button>
        </div>

        {activeSettingsTab === 'general' && (
            <>
                <div>
                    <label htmlFor="geminiApiKey" className="block text-neutral-300 mb-1">Gemini API Key:</label>
                    <input 
                        type="password" 
                        id="geminiApiKey" 
                        value={settings.geminiApiKey || ''}
                        onChange={(e) => onSettingsChange({ geminiApiKey: e.target.value })}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                </div>
                 <div>
                    <label htmlFor="selectedModel" className="block text-neutral-300 mb-1">Cognitive Parser Model (Gemini):</label>
                    <input 
                        type="text" 
                        id="selectedModel" 
                        placeholder="e.g., gemini-1.5-flash-latest"
                        value={settings.selectedModel || ''}
                        onChange={(e) => onSettingsChange({ selectedModel: e.target.value })}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                </div>
                 <div>
                    <label htmlFor="aiCommandParserModel" className="block text-neutral-300 mb-1">AI Command Parser Model (Gemini):</label>
                    <input 
                        type="text" 
                        id="aiCommandParserModel" 
                        placeholder="e.g., gemini-1.5-flash-latest"
                        value={settings.aiCommandParserModel || ''}
                        onChange={(e) => onSettingsChange({ aiCommandParserModel: e.target.value })}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                </div>
                 <div>
                    <label htmlFor="promptEnhancerModel" className="block text-neutral-300 mb-1">Prompt Enhancer Model (Gemini):</label>
                    <input 
                        type="text" 
                        id="promptEnhancerModel" 
                        placeholder="e.g., gemini-1.5-pro-latest"
                        value={settings.promptEnhancerModel || ''}
                        onChange={(e) => onSettingsChange({ promptEnhancerModel: e.target.value })}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                </div>
                 <div>
                    <label htmlFor="captureIntervalSeconds" className="block text-neutral-300 mb-1">Capture Interval (seconds):</label>
                    <input 
                        type="number" 
                        id="captureIntervalSeconds" 
                        value={settings.captureIntervalSeconds || 5}
                        onChange={(e) => onSettingsChange({ captureIntervalSeconds: parseInt(e.target.value, 10) || 5 })}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                </div>
                 <div>
                    <label htmlFor="maxTaskListSize" className="block text-neutral-300 mb-1">Max Task List Size:</label>
                    <input 
                        type="number" 
                        id="maxTaskListSize" 
                        value={settings.maxTaskListSize || 100}
                        onChange={(e) => onSettingsChange({ maxTaskListSize: parseInt(e.target.value, 10) || 100 })}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                </div>
                 <div className="flex items-center">
                    <input 
                        type="checkbox" 
                        id="showDebugInfo" 
                        checked={settings.showDebugInfo || false}
                        onChange={(e) => onSettingsChange({ showDebugInfo: e.target.checked })}
                        className="mr-2 h-4 w-4 text-sky-500 bg-neutral-900 border-neutral-700 rounded focus:ring-sky-500 focus:ring-offset-neutral-800"
                    />
                    <label htmlFor="showDebugInfo" className="text-neutral-300">Show Debug Info in UI</label>
                </div>
            </>
        )}

        {activeSettingsTab === 'keywords' && (
             <>
                <div className="space-y-2">
                    <input 
                        type="text" 
                        placeholder="Keyword/Phrase" 
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                    <textarea 
                        placeholder="Meaning/Context for this keyword" 
                        value={newKeywordMeaning}
                        onChange={(e) => setNewKeywordMeaning(e.target.value)}
                        rows={2}
                        className="w-full p-1.5 bg-neutral-900 border border-neutral-700 rounded-md focus:ring-1 focus:ring-sky-500 outline-none resize-none"
                    />
                    <button 
                        onClick={handleAddKeyword} 
                        className="w-full px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                        Add Locked Keyword
                    </button>
                </div>
                <div className="mt-3 space-y-1">
                    {(settings.lockedKeywords || []).map((kw, index) => (
                        <div key={index} className="flex items-center justify-between p-1.5 bg-neutral-700 rounded-md">
                            <div>
                                <p className="font-semibold text-neutral-200">{kw.phrase}</p>
                                <p className="text-neutral-400">{kw.meaning}</p>
                            </div>
                            <button onClick={() => handleRemoveKeyword(index)} className="text-red-500 hover:text-red-400">
                                <FiUnlock size={iconSize -2} />
                            </button>
                        </div>
                    ))}
                    {(!settings.lockedKeywords || settings.lockedKeywords.length === 0) && (
                        <p className="text-neutral-500 italic">No locked keywords defined.</p>
                    )}
                </div>
            </>
        )}
    </div>
  );
};

export default AIHubSidebar; 