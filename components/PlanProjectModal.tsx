
import React, { useState, useEffect } from 'react';
import type { ExternalLLMConfig } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';

interface PlanProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (goal: string, llmConfigId: string) => Promise<void>;
  llmConfigs: ExternalLLMConfig[];
  isProcessing: boolean;
  error: string | null;
}

export const PlanProjectModal: React.FC<PlanProjectModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  llmConfigs,
  isProcessing,
  error,
}) => {
  const [goal, setGoal] = useState<string>('');
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');

  useEffect(() => {
    if (isOpen && llmConfigs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(llmConfigs[0].id);
    }
     if (!isOpen) { // Reset form on close
      setGoal('');
      // setSelectedConfigId(''); // Don't reset selected config, user might reopen with same preference
    }
  }, [isOpen, llmConfigs, selectedConfigId]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) {
      alert("Please describe your project goal.");
      return;
    }
    if (!selectedConfigId) {
      alert("Please select an LLM Connector. You can add one in Settings.");
      return;
    }
    await onSubmit(goal, selectedConfigId);
    // App.tsx handles closing the modal on successful submission.
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-project-modal-title"
    >
      <div className="bg-slate-800 p-4 sm:p-6 rounded-lg shadow-2xl w-full max-w-lg">
        <h2 id="plan-project-modal-title" className="text-xl sm:text-2xl font-bold text-sky-300 mb-5">
          Plan Project with AI
        </h2>

        {error && <ErrorMessage message={error} className="mb-4" />}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="projectGoal" className="block text-sm font-medium text-slate-300 mb-1">
              Describe your Goal or Project:
            </label>
            <textarea
              id="projectGoal"
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500 custom-scrollbar-xs"
              placeholder="e.g., Write a research paper on renewable energy sources, then create a presentation."
              disabled={isProcessing}
              required
            />
          </div>

          <div className="mb-5">
            <label htmlFor="llmConnector" className="block text-sm font-medium text-slate-300 mb-1">
              Select LLM Connector:
            </label>
            {llmConfigs.length === 0 ? (
              <p className="text-sm text-slate-400 italic p-2 bg-slate-700/50 rounded-md">
                No LLM connectors configured. Please <button type="button" onClick={onClose} className="underline">close this</button> and add one in Settings.
              </p>
            ) : (
              <select
                id="llmConnector"
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500"
                disabled={isProcessing}
                required
              >
                <option value="" disabled>-- Select a Connector --</option>
                {llmConfigs.map(config => (
                  <option key={config.id} value={config.id}>
                    {config.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mt-6 flex justify-end space-x-2 sm:space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 sm:px-4 sm:py-2 text-sm font-medium rounded-md bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label="Cancel planning"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-2 sm:px-4 sm:py-2 text-sm font-medium rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 flex items-center"
              aria-label="Generate tasks with selected AI"
              disabled={isProcessing || llmConfigs.length === 0 || !goal.trim() || !selectedConfigId}
            >
              {isProcessing && <LoadingSpinner size="sm" color="text-white" />}
              <span className={isProcessing ? "ml-2" : ""}>
                {isProcessing ? 'Generating...' : 'Generate Tasks'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
