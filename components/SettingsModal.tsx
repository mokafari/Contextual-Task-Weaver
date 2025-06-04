import React, { useState, useEffect, useRef } from 'react';
import type { AppSettings, ExternalLLMConfig, LockedKeyword } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../services/logger';

const COMPONENT_NAME = "SettingsModal";

interface SettingsModalProps {
  currentSettings: AppSettings;
  externalLLMConfigs: ExternalLLMConfig[];
  onSaveAppSettings: (newSettings: AppSettings) => void;
  onSaveLLMConfigs: (newConfigs: ExternalLLMConfig[]) => void;
  onClose: () => void;
  onToggleShowDebugInfo: () => void; 
  onExportData: () => void;
  onImportData: (file: File) => void;
}

const LLMConfigInput: React.FC<{
  config: Partial<ExternalLLMConfig>;
  onUpdate: (updatedField: Partial<ExternalLLMConfig>) => void;
}> = ({ config, onUpdate }) => (
  <>
    <div className="mb-3">
      <label htmlFor={`llmName-${config.id || 'new'}`} className="block text-xs font-medium text-slate-300 mb-1">Connector Name</label>
      <input
        type="text"
        id={`llmName-${config.id || 'new'}`}
        placeholder="e.g., My Task Planner LLM"
        value={config.name || ''}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
      />
    </div>
    <div className="mb-3">
      <label htmlFor={`llmApiUrl-${config.id || 'new'}`} className="block text-xs font-medium text-slate-300 mb-1">API Endpoint URL</label>
      <input
        type="url"
        id={`llmApiUrl-${config.id || 'new'}`}
        placeholder="https://api.example.com/v1/complete"
        value={config.apiUrl || ''}
        onChange={(e) => onUpdate({ apiUrl: e.target.value })}
        className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
      />
    </div>
    <div className="mb-3">
      <label htmlFor={`llmApiKey-${config.id || 'new'}`} className="block text-xs font-medium text-slate-300 mb-1">API Key (Prefix with 'Bearer ' if it's a Bearer Token)</label>
      <input
        type="password" 
        id={`llmApiKey-${config.id || 'new'}`}
        placeholder="sk-xxxxxxxx or Bearer your_token"
        value={config.apiKey || ''}
        onChange={(e) => onUpdate({ apiKey: e.target.value })}
        className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
      />
       <p className="text-xs text-slate-500 mt-1">Note: API keys are stored locally in your browser. Use a backend proxy for production systems to protect keys.</p>
    </div>
    <div className="mb-3">
      <label htmlFor={`llmPromptInstruction-${config.id || 'new'}`} className="block text-xs font-medium text-slate-300 mb-1">System Prompt Instruction (for Task Generation by "Plan with AI")</label>
      <textarea
        id={`llmPromptInstruction-${config.id || 'new'}`}
        rows={3}
        placeholder='Example: Break down the following user goal into a list of actionable tasks. Respond with ONLY a JSON array of objects, where each object has a "description" field (string). e.g., [{"description":"Task 1 details"}, {"description":"Task 2 details"}]. User Goal: '
        value={config.promptInstruction || ''}
        onChange={(e) => onUpdate({ promptInstruction: e.target.value })}
        className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500 custom-scrollbar-xs"
      />
      <p className="text-xs text-slate-500 mt-1">This instruction will be prepended to the user's goal. It must guide the LLM to return a JSON array of tasks, each with a "description".</p>
    </div>
  </>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  currentSettings,
  externalLLMConfigs: initialLLMConfigs,
  onSaveAppSettings,
  onSaveLLMConfigs,
  onClose,
  onExportData,
  onImportData,
}) => {
  const [captureInterval, setCaptureInterval] = useState<string>(String(currentSettings.captureIntervalSeconds));
  const [maxTasks, setMaxTasks] = useState<string>(String(currentSettings.maxTaskListSize));
  const [showDebug, setShowDebug] = useState<boolean>(currentSettings.showDebugInfo);
  const [localLockedKeywords, setLocalLockedKeywords] = useState<LockedKeyword[]>(currentSettings.lockedKeywords || []);

  const [llmConfigs, setLlmConfigs] = useState<ExternalLLMConfig[]>(() => 
    initialLLMConfigs.map(c => ({...c}))
  );
  const [editingLlmConfig, setEditingLlmConfig] = useState<Partial<ExternalLLMConfig> | null>(null);
  const [isAddingNewLlm, setIsAddingNewLlm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'eks' | 'llm' | 'data'>('general');

  const [editingLockedKeyword, setEditingLockedKeyword] = useState<Partial<LockedKeyword> | null>(null);
  const [isAddingNewLockedKeyword, setIsAddingNewLockedKeyword] = useState(false);

  useEffect(() => {
    setLlmConfigs(initialLLMConfigs.map(c => ({...c})));
  }, [initialLLMConfigs]);
  
  useEffect(() => {
    setCaptureInterval(String(currentSettings.captureIntervalSeconds));
    setMaxTasks(String(currentSettings.maxTaskListSize));
    setShowDebug(currentSettings.showDebugInfo);
    setLocalLockedKeywords(currentSettings.lockedKeywords || []);
  }, [currentSettings]);

  const handleSaveAllSettingsAndClose = () => {
    const intervalNum = parseInt(captureInterval, 10);
    const maxTasksNum = parseInt(maxTasks, 10);

    if (isNaN(intervalNum) || intervalNum <= 0) {
      alert("Please enter a valid positive number for the capture interval (e.g., 5 or greater).");
      return;
    }
    if (intervalNum < 3 && (currentSettings.captureIntervalSeconds >=3 && intervalNum < currentSettings.captureIntervalSeconds) ) {
      if(!window.confirm("Warning: Setting a very low capture interval (<3s) can heavily load the AI and may lead to rapid quota usage or performance issues. Are you sure?")) return;
    }
    if (isNaN(maxTasksNum) || maxTasksNum < 5) { 
      alert("Please enter a valid number for max tasks (minimum 5).");
      return;
    }
    
    onSaveAppSettings({ 
      ...currentSettings,
      captureIntervalSeconds: intervalNum,
      maxTaskListSize: maxTasksNum,
      showDebugInfo: showDebug,
      lockedKeywords: localLockedKeywords,
    });
    onSaveLLMConfigs(llmConfigs.map(c => ({...c}))); 
    onClose();
  };

  const handleAddNewLlmConfig = () => {
    setActiveTab('llm');
    setIsAddingNewLlm(true);
    setEditingLlmConfig({ id: uuidv4(), name: '', apiUrl: '', apiKey: '', promptInstruction: 'Break down the following user goal into a list of actionable tasks. Respond with ONLY a JSON array of objects, where each object has a "description" field (string), and optionally a "name" field for a shorter title. e.g., [{"name":"Task Title", "description":"Task 1 details"}, {"description":"Task 2 details"}]. User Goal: ' });
  };

  const handleEditLlmConfig = (configToEdit: ExternalLLMConfig) => {
    setActiveTab('llm');
    setIsAddingNewLlm(false);
    setEditingLlmConfig({ ...configToEdit });
  };

  const handleSaveCurrentLlmConfig = () => {
    if (editingLlmConfig && editingLlmConfig.name && editingLlmConfig.apiUrl && editingLlmConfig.apiKey && editingLlmConfig.promptInstruction) {
      if (isAddingNewLlm) {
        setLlmConfigs(prev => [...prev, editingLlmConfig as ExternalLLMConfig]);
      } else {
        setLlmConfigs(prev => prev.map(c => c.id === editingLlmConfig!.id ? editingLlmConfig as ExternalLLMConfig : c));
      }
      setEditingLlmConfig(null);
      setIsAddingNewLlm(false);
    } else {
      alert("Please fill in all fields for the LLM Connector: Name, API URL, API Key, and Prompt Instruction.");
    }
  };
  
  const handleDeleteLlmConfig = (idToDelete: string) => {
    if (window.confirm("Are you sure you want to delete this LLM connector? This action cannot be undone.")) {
      setLlmConfigs(prev => prev.filter(c => c.id !== idToDelete));
      if (editingLlmConfig && editingLlmConfig.id === idToDelete) {
        setEditingLlmConfig(null); 
        setIsAddingNewLlm(false);
      }
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const triggerImport = () => {
    if (selectedFile) {
      onImportData(selectedFile);
      setSelectedFile(null); 
      if(importFileRef.current) importFileRef.current.value = "";
    } else {
      alert("Please select a JSON file to import.");
    }
  };

  const handleAddNewLockedKeyword = () => {
    setActiveTab('eks');
    setIsAddingNewLockedKeyword(true);
    setEditingLockedKeyword({ id: uuidv4(), phrase: '', meaning: '', context: '', priority: 3, createdAt: Date.now() });
  };

  const handleEditLockedKeyword = (keywordToEdit: LockedKeyword) => {
    setActiveTab('eks');
    setIsAddingNewLockedKeyword(false);
    setEditingLockedKeyword({ ...keywordToEdit });
  };

  const handleSaveCurrentLockedKeyword = () => {
    if (editingLockedKeyword && editingLockedKeyword.phrase && editingLockedKeyword.priority !== undefined) {
      const phrase = editingLockedKeyword.phrase.trim();
      if (!phrase) {
        alert("Phrase cannot be empty.");
        return;
      }
      const priority = Number(editingLockedKeyword.priority);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        alert("Priority must be a number between 1 and 5.");
        return;
      }

      const finalKeyword: LockedKeyword = {
        id: editingLockedKeyword.id || uuidv4(),
        phrase: phrase,
        meaning: editingLockedKeyword.meaning?.trim() || undefined,
        context: editingLockedKeyword.context?.trim() || undefined,
        priority: priority,
        createdAt: editingLockedKeyword.createdAt || Date.now(),
        lastUsedTimestamp: editingLockedKeyword.lastUsedTimestamp
      };

      if (isAddingNewLockedKeyword) {
        setLocalLockedKeywords(prev => [...prev, finalKeyword].sort((a,b) => b.priority - a.priority || a.phrase.localeCompare(b.phrase)));
      } else {
        setLocalLockedKeywords(prev => prev.map(k => k.id === finalKeyword.id ? finalKeyword : k).sort((a,b) => b.priority - a.priority || a.phrase.localeCompare(b.phrase)));
      }
      setEditingLockedKeyword(null);
      setIsAddingNewLockedKeyword(false);
    } else {
      alert("Please fill in at least the Phrase and Priority for the Locked Keyword.");
    }
  };

  const handleDeleteLockedKeyword = (idToDelete: string) => {
    if (window.confirm("Are you sure you want to delete this Locked Keyword? This action cannot be undone.")) {
      setLocalLockedKeywords(prev => prev.filter(k => k.id !== idToDelete));
      if (editingLockedKeyword && editingLockedKeyword.id === idToDelete) {
        setEditingLockedKeyword(null);
        setIsAddingNewLockedKeyword(false);
      }
    }
  };

  const renderGeneralSettings = () => (
    <>
      <h3 className="text-lg font-semibold text-sky-400 mb-3">Application Settings</h3>
      <div className="mb-3">
        <label htmlFor="captureInterval" className="block text-xs font-medium text-slate-300 mb-1">Capture Interval (seconds)</label>
        <input
          type="number"
          id="captureInterval"
          min="3"
          value={captureInterval}
          onChange={(e) => setCaptureInterval(e.target.value)}
          className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
        />
        <p className="text-xs text-slate-500 mt-1">Interval for screen/camera captures. Min 3s. Lower values are more responsive but use more resources.</p>
      </div>
      <div className="mb-4">
        <label htmlFor="maxTasks" className="block text-xs font-medium text-slate-300 mb-1">Maximum Task List Size</label>
        <input
          type="number"
          id="maxTasks"
          min="5"
          value={maxTasks}
          onChange={(e) => setMaxTasks(e.target.value)}
          className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
        />
        <p className="text-xs text-slate-500 mt-1">Max tasks to keep. Older tasks trimmed. Min 5.</p>
      </div>
      <div className="flex items-center mb-4">
        <input
          id="showDebugInfo"
          type="checkbox"
          checked={showDebug}
          onChange={(e) => setShowDebug(e.target.checked)} 
          className="form-checkbox h-4 w-4 text-sky-500 bg-slate-700 border-slate-600 rounded focus:ring-sky-500 focus:ring-offset-slate-800"
        />
        <label htmlFor="showDebugInfo" className="ml-2 text-sm text-slate-300">Show Debug Information</label>
      </div>
    </>
  );

  const renderLLMSettings = () => (
    <>
      <h3 className="text-lg font-semibold text-sky-400 mb-3">External LLM Connectors <span className="text-xs text-slate-500">(for "Plan with AI")</span></h3>
      {llmConfigs.length === 0 && !editingLlmConfig && (
        <p className="text-sm text-slate-400 mb-3">No LLM connectors configured. Add one for "Plan with AI".</p>
      )}
      <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar-xs pr-2">
        {llmConfigs.map(config => (
          <div key={config.id} className="p-3 bg-slate-750 rounded-md border border-slate-600">
            <p className="text-sm font-semibold text-sky-300">{config.name}</p>
            <p className="text-xs text-slate-400 truncate">API URL: {config.apiUrl}</p>
            <div className="mt-2 space-x-2">
              <button onClick={() => handleEditLlmConfig(config)} className="text-xs text-sky-400 hover:text-sky-300">Edit</button>
              <button onClick={() => handleDeleteLlmConfig(config.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          </div>
        ))}
      </div>
      {!editingLlmConfig && (
        <button onClick={handleAddNewLlmConfig} className="mt-3 w-full text-sm bg-sky-600 hover:bg-sky-500 text-white py-2 px-4 rounded-md transition-colors">
          Add New LLM Connector
        </button>
      )}
    </>
  );
  
  const renderEKSSettings = () => (
    <>
      <h3 className="text-lg font-semibold text-sky-400 mb-3">Locked Keywords (EKS)</h3>
      <p className="text-xs text-slate-400 mb-2">Define keywords for high importance in context analysis. Phrase & Priority (1-5, 5=highest) required.</p>
      {localLockedKeywords.length === 0 && !editingLockedKeyword && (
         <p className="text-sm text-slate-400 mb-3">No Locked Keywords defined.</p>
      )}
      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar-xs pr-2 mb-3">
        {localLockedKeywords.sort((a,b) => b.priority - a.priority || a.phrase.localeCompare(b.phrase)).map(kw => (
          <div key={kw.id} className="p-3 bg-slate-750 rounded-md border border-slate-600">
             <div className="flex justify-between items-start">
                <div className="flex-grow">
                    <p className="text-sm font-semibold text-sky-300 break-all">{kw.phrase} <span className="text-xs text-slate-400">(Priority: {kw.priority})</span></p>
                    {kw.meaning && <p className="text-xs text-slate-400 mt-0.5 break-all">Meaning: {kw.meaning}</p>}
                    {kw.context && <p className="text-xs text-slate-400 mt-0.5 break-all">Context: {kw.context}</p>}
                </div>
                <div className="mt-1 space-x-2 flex-shrink-0 ml-2">
                    <button onClick={() => handleEditLockedKeyword(kw)} className="text-xs text-sky-400 hover:text-sky-300 px-2 py-1 rounded bg-slate-600 hover:bg-slate-500">Edit</button>
                    <button onClick={() => handleDeleteLockedKeyword(kw.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-slate-600 hover:bg-slate-500">Del</button>
                </div>
            </div>
          </div>
        ))}
      </div>
      {!editingLockedKeyword && (
        <button onClick={handleAddNewLockedKeyword} className="mt-1 w-full text-sm bg-teal-600 hover:bg-teal-500 text-white py-2 px-4 rounded-md transition-colors">
          Add New Locked Keyword
        </button>
      )}
    </>
  );
  
  const renderDataSettings = () => (
    <>
      <h3 className="text-lg font-semibold text-sky-400 mb-3">Data Management</h3>
      <div className="mb-4">
        <button 
          onClick={onExportData}
          className="w-full text-sm bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-md transition-colors mb-2"
        >
          Export All Data
        </button>
        <p className="text-xs text-slate-500">Exports tasks, contexts, and settings to JSON.</p>
      </div>
      <div>
        <label htmlFor="importFile" className="block text-xs font-medium text-slate-300 mb-1">Import Data from JSON</label>
        <div className="flex space-x-2">
          <input 
            type="file" 
            id="importFile"
            ref={importFileRef}
            accept=".json"
            onChange={handleFileSelect}
            className="block w-full text-xs text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-500 transition-colors cursor-pointer"
          />
          <button 
            onClick={triggerImport} 
            disabled={!selectedFile}
            className="text-sm bg-green-600 hover:bg-green-500 text-white py-2 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
        {selectedFile && <p className="text-xs text-slate-400 mt-1">Selected: {selectedFile.name}</p>}
        <p className="text-xs text-slate-500 mt-1">Warning: Importing overwrites current data. Backup if needed.</p>
      </div>
    </>
  );

  const renderActiveTabContent = () => {
    if (editingLlmConfig) {
      return (
        <div>
          <h3 className="text-lg font-semibold text-sky-400 mb-3">{isAddingNewLlm ? "Add New" : "Edit"} LLM Connector</h3>
          <LLMConfigInput
            config={editingLlmConfig}
            onUpdate={(updatedField) => setEditingLlmConfig(prev => ({ ...prev, ...updatedField }))}
          />
          <div className="flex justify-end space-x-2 mt-4">
            <button onClick={() => { setEditingLlmConfig(null); setIsAddingNewLlm(false); }} className="text-sm text-slate-300 hover:text-white py-2 px-4 rounded-md">Cancel</button>
            <button onClick={handleSaveCurrentLlmConfig} className="text-sm bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-md transition-colors">Save Connector</button>
          </div>
        </div>
      );
    } 
    if (editingLockedKeyword) {
      return (
        <div>
          <h3 className="text-lg font-semibold text-sky-400 mb-3">{isAddingNewLockedKeyword ? "Add New" : "Edit"} Locked Keyword</h3>
          <div className="space-y-3 p-1">
            <div className="mb-2">
              <label htmlFor="lkPhrase" className="block text-xs font-medium text-slate-300 mb-0.5">Keyword/Phrase (Required)</label>
              <input type="text" id="lkPhrase" value={editingLockedKeyword.phrase || ''} onChange={e => setEditingLockedKeyword(k => ({...k, phrase: e.target.value}))} className="w-full p-1.5 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"/>
            </div>
            <div className="mb-2">
              <label htmlFor="lkMeaning" className="block text-xs font-medium text-slate-300 mb-0.5">Meaning/Expansion (Optional)</label>
              <textarea id="lkMeaning" rows={2} value={editingLockedKeyword.meaning || ''} onChange={e => setEditingLockedKeyword(k => ({...k, meaning: e.target.value}))} className="w-full p-1.5 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 custom-scrollbar-xs focus:ring-sky-500 focus:border-sky-500"/>
            </div>
            <div className="mb-2">
              <label htmlFor="lkContext" className="block text-xs font-medium text-slate-300 mb-0.5">Specific Context (Optional)</label>
              <input type="text" id="lkContext" value={editingLockedKeyword.context || ''} onChange={e => setEditingLockedKeyword(k => ({...k, context: e.target.value}))} className="w-full p-1.5 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"/>
            </div>
            <div>
              <label htmlFor="lkPriority" className="block text-xs font-medium text-slate-300 mb-0.5">Priority (1-5, Required)</label>
              <input type="number" id="lkPriority" min="1" max="5" value={editingLockedKeyword.priority || 3} onChange={e => setEditingLockedKeyword(k => ({...k, priority: parseInt(e.target.value,10) || 3}))} className="w-full p-1.5 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"/>
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <button onClick={() => { setEditingLockedKeyword(null); setIsAddingNewLockedKeyword(false); }} className="text-sm text-slate-300 hover:text-white py-2 px-4 rounded-md">Cancel</button>
            <button onClick={handleSaveCurrentLockedKeyword} className="text-sm bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-md transition-colors">Save Keyword</button>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'general': return renderGeneralSettings();
      case 'eks': return renderEKSSettings();
      case 'llm': return renderLLMSettings();
      case 'data': return renderDataSettings();
      default: return renderGeneralSettings();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-slate-800 p-4 sm:p-6 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-4">
          <h2 id="settings-modal-title" className="text-xl sm:text-2xl font-bold text-sky-300">Settings</h2>
          <div className="border-b-0 flex-grow flex justify-start ml-6">
            <nav className="-mb-px flex space-x-1 sm:space-x-2" aria-label="Tabs">
              {(['general', 'eks', 'llm', 'data'] as Array<'general' | 'llm' | 'eks' | 'data'>).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    if ((editingLlmConfig && tab !== 'llm') || (editingLockedKeyword && tab !== 'eks')) {
                      if (!window.confirm("You have unsaved changes. Discard and switch tab?")) return;
                      setEditingLlmConfig(null); setIsAddingNewLlm(false);
                      setEditingLockedKeyword(null); setIsAddingNewLockedKeyword(false);
                    }
                    setActiveTab(tab);
                  }}
                  className={`whitespace-nowrap py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm transition-colors
                    ${activeTab === tab ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-sky-300 hover:border-slate-500'}
                  `}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1).replace('llm', 'LLM').replace('eks','EKS')}
                </button>
              ))}
            </nav>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-full -mr-2 -mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div className="mt-1">
          {renderActiveTabContent()} 
        </div>

        {!editingLlmConfig && !editingLockedKeyword && (
          <div className="mt-6 pt-4 border-t border-slate-700 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose} 
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAllSettingsAndClose}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-500"
            >
              Save Settings & Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
