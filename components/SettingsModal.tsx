
import React, { useState, useEffect, useRef } from 'react';
import type { AppSettings, ExternalLLMConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../services/logger';

const COMPONENT_NAME = "SettingsModal";

interface SettingsModalProps {
  currentSettings: AppSettings;
  externalLLMConfigs: ExternalLLMConfig[];
  onSaveAppSettings: (newSettings: Pick<AppSettings, 'captureIntervalSeconds' | 'maxTaskListSize'>) => void;
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
  onToggleShowDebugInfo,
  onExportData,
  onImportData,
}) => {
  const [captureInterval, setCaptureInterval] = useState<string>(String(currentSettings.captureIntervalSeconds));
  const [maxTasks, setMaxTasks] = useState<string>(String(currentSettings.maxTaskListSize));
  const [showDebug, setShowDebug] = useState<boolean>(currentSettings.showDebugInfo);
  
  const [llmConfigs, setLlmConfigs] = useState<ExternalLLMConfig[]>(() => 
    initialLLMConfigs.map(c => ({...c}))
  );
  const [editingLlmConfig, setEditingLlmConfig] = useState<Partial<ExternalLLMConfig> | null>(null);
  const [isAddingNewLlm, setIsAddingNewLlm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    setLlmConfigs(initialLLMConfigs.map(c => ({...c})));
  }, [initialLLMConfigs]);
  
  useEffect(() => {
    setCaptureInterval(String(currentSettings.captureIntervalSeconds));
    setMaxTasks(String(currentSettings.maxTaskListSize));
    setShowDebug(currentSettings.showDebugInfo);
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
      captureIntervalSeconds: intervalNum,
      maxTaskListSize: maxTasksNum,
    });
    onSaveLLMConfigs(llmConfigs.map(c => ({...c}))); 
    onClose();
  };

  const handleAddNewLlmConfig = () => {
    setIsAddingNewLlm(true);
    setEditingLlmConfig({ id: uuidv4(), name: '', apiUrl: '', apiKey: '', promptInstruction: 'Break down the following user goal into a list of actionable tasks. Respond with ONLY a JSON array of objects, where each object has a "description" field (string), and optionally a "name" field for a shorter title. e.g., [{"name":"Task Title", "description":"Task 1 details"}, {"description":"Task 2 details"}]. User Goal: ' });
  };

  const handleEditLlmConfig = (configToEdit: ExternalLLMConfig) => {
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
      setSelectedFile(null); // Reset file input
      if(importFileRef.current) importFileRef.current.value = "";
    } else {
      alert("Please select a JSON file to import.");
    }
  };


  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-slate-800 p-4 sm:p-6 rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h2 id="settings-modal-title" className="text-xl sm:text-2xl font-bold text-sky-300 mb-5">Settings</h2>

        {editingLlmConfig ? (
          // LLM Config Editing UI (from previous correct implementation)
          <div>
            <h3 className="text-lg font-semibold text-sky-400 mb-3">{isAddingNewLlm ? "Add New" : "Edit"} LLM Connector</h3>
            <LLMConfigInput
              config={editingLlmConfig}
              onUpdate={(updatedField) => setEditingLlmConfig(prev => ({ ...prev, ...updatedField }))}
            />
            <div className="flex justify-end space-x-2 mt-4">
              <button onClick={() => setEditingLlmConfig(null)} className="px-3 py-1.5 text-sm rounded bg-slate-600 hover:bg-slate-500">Cancel</button>
              <button onClick={handleSaveCurrentLlmConfig} className="px-3 py-1.5 text-sm rounded bg-sky-600 hover:bg-sky-500">Save Connector</button>
            </div>
            <hr className="my-5 border-slate-700" />
          </div>
        ) : (
          <>
            <h3 className="text-md sm:text-lg font-semibold text-sky-400 mb-2">App Configuration</h3>
            <div className="mb-4">
              <label htmlFor="captureInterval" className="block text-sm font-medium text-slate-300 mb-1">
                Capture Interval (seconds)
              </label>
              <input
                type="number" id="captureInterval" value={captureInterval}
                onChange={(e) => setCaptureInterval(e.target.value)} min="3" step="1"
                className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
                aria-describedby="captureIntervalHelp"
              />
              <p id="captureIntervalHelp" className="text-xs text-slate-400 mt-1">
                Frequency of automatic captures. Min 3s.
              </p>
            </div>
            <div className="mb-4">
              <label htmlFor="maxTaskListSize" className="block text-sm font-medium text-slate-300 mb-1">
                Max Task List Size
              </label>
              <input
                type="number" id="maxTaskListSize" value={maxTasks}
                onChange={(e) => setMaxTasks(e.target.value)} min="5" step="1"
                className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
                aria-describedby="maxTaskListSizeHelp"
              />
              <p id="maxTaskListSizeHelp" className="text-xs text-slate-400 mt-1">
                Max tasks to keep. Oldest are removed if limit exceeded. Min 5.
              </p>
            </div>
             <div className="mb-4">
              <label htmlFor="showDebugInfo" className="flex items-center text-sm font-medium text-slate-300">
                <input
                  type="checkbox" id="showDebugInfo" checked={showDebug}
                  onChange={() => { setShowDebug(!showDebug); onToggleShowDebugInfo(); }}
                  className="mr-2 h-4 w-4 rounded border-slate-500 text-sky-500 focus:ring-sky-400 accent-sky-500"
                />
                Show Debug Info (Dynamic Context, PMTs, Performance)
              </label>
            </div>
            <hr className="my-5 border-slate-700" />

            <div className="mb-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-md sm:text-lg font-semibold text-sky-400">External LLM Connectors (for "Plan with AI")</h3>
                    <button 
                        onClick={handleAddNewLlmConfig}
                        className="px-3 py-1.5 text-sm font-medium rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                    > + Add New </button>
                </div>
                {llmConfigs.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No external LLM connectors configured.</p>
                ) : (
                    <ul className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar-xs pr-1">
                    {llmConfigs.map(config => (
                        <li key={config.id} className="p-2.5 bg-slate-700/60 rounded-md border border-slate-600">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold text-slate-200 text-sm">{config.name}</p>
                                <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-xs" title={config.apiUrl}>{config.apiUrl}</p>
                            </div>
                            <div className="flex space-x-1.5 flex-shrink-0 ml-2">
                            <button onClick={() => handleEditLlmConfig(config)} className="text-xs px-2 py-1 rounded bg-slate-600 hover:bg-slate-500">Edit</button>
                            <button onClick={() => handleDeleteLlmConfig(config.id)} className="text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600">Del</button>
                            </div>
                        </div>
                        </li>
                    ))}
                    </ul>
                )}
            </div>
            <hr className="my-5 border-slate-700" />
            
            {/* Data Portability Section */}
            <div className="mb-4">
                 <h3 className="text-md sm:text-lg font-semibold text-sky-400 mb-2">Data Portability</h3>
                 <div className="space-y-3">
                    <div>
                        <button
                            onClick={onExportData}
                            className="w-full px-3 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                        > Export All Application Data
                        </button>
                        <p className="text-xs text-slate-400 mt-1">Download all your tasks, contexts, settings, and AI configurations as a JSON file.</p>
                    </div>
                    <div>
                        <label htmlFor="importFile" className="block text-sm font-medium text-slate-300 mb-1">Import Data from JSON File:</label>
                        <input 
                            type="file" 
                            id="importFile" 
                            ref={importFileRef}
                            accept=".json" 
                            onChange={handleFileSelect}
                            className="block w-full text-sm text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-700 file:text-sky-100 hover:file:bg-sky-600 cursor-pointer mb-2"
                        />
                        <button
                            onClick={triggerImport}
                            disabled={!selectedFile}
                            className="w-full px-3 py-2 text-sm font-medium rounded-md bg-teal-600 hover:bg-teal-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
                        > Import from Selected File
                        </button>
                        <p className="text-xs text-orange-400 mt-1">Warning: Importing will overwrite ALL current application data. This action cannot be undone.</p>
                    </div>
                 </div>
            </div>


          </>
        )}

        <div className="mt-6 flex justify-end space-x-2 sm:space-x-3">
          <button
            type="button" onClick={onClose}
            className="px-3 py-2 sm:px-4 sm:py-2 text-sm font-medium rounded-md bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="Cancel and close settings"
          > Cancel </button>
          <button
            type="button" onClick={handleSaveAllSettingsAndClose}
            className="px-3 py-2 sm:px-4 sm:py-2 text-sm font-medium rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400"
            aria-label="Save all settings and close"
            disabled={!!editingLlmConfig} // Disable if actively editing an LLM config
          > Save & Close </button>
        </div>
      </div>
    </div>
  );
};
