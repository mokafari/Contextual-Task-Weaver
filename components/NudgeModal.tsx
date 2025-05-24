
import React, { useState, useEffect } from 'react';
import type { PotentialMainTask, UserNudgeInput } from '../types';
// import { LoadingSpinner } from './LoadingSpinner'; // If needed for future async operations

interface NudgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  potentialMainTasks: PotentialMainTask[]; // Top few PMTs
  onApplyNudge: (nudge: UserNudgeInput) => void;
}

export const NudgeModal: React.FC<NudgeModalProps> = ({
  isOpen,
  onClose,
  potentialMainTasks,
  onApplyNudge,
}) => {
  const [newGoalText, setNewGoalText] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      setNewGoalText(''); // Reset on close
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleConfirmPMT = (pmtId: string) => {
    onApplyNudge({ type: 'confirm_pmt', pmtId });
    onClose(); // Close modal after applying nudge
  };

  const handleSetNewGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim()) {
      alert("Please enter a description for your new main goal.");
      return;
    }
    onApplyNudge({ type: 'new_goal', goalText: newGoalText.trim() });
    setNewGoalText(''); 
    onClose(); // Close modal after applying nudge
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nudge-modal-title"
    >
      <div className="bg-slate-800 p-4 sm:p-6 rounded-lg shadow-2xl w-full max-w-md">
        <h2 id="nudge-modal-title" className="text-xl sm:text-2xl font-bold text-sky-300 mb-4">
          Nudge AI: Guide Main Task Focus
        </h2>

        {potentialMainTasks && potentialMainTasks.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Confirm AI's Current Understanding:</h3>
            <ul className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar-xs pr-1">
              {potentialMainTasks.map(pmt => (
                <li key={pmt.id} className="p-2 bg-slate-700/70 rounded-md border border-slate-600 flex justify-between items-center hover:border-sky-500 transition-colors">
                  <span className="text-sm text-slate-200 truncate flex-grow mr-2" title={pmt.description}>
                    {pmt.description} 
                    <span className="text-xs text-slate-400 ml-1">(W: {pmt.weight.toFixed(2)})</span>
                  </span>
                  <button
                    onClick={() => handleConfirmPMT(pmt.id)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors flex-shrink-0"
                  >
                    Confirm This
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <form onSubmit={handleSetNewGoal} className="mt-3">
            <div className="mb-3">
            <label htmlFor="newGoalText" className="block text-sm font-medium text-slate-300 mb-1">
                Or, Set a New Main Goal:
            </label>
            <textarea
                id="newGoalText"
                rows={2}
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500 custom-scrollbar-xs"
                placeholder="e.g., Finalize research paper on quantum entanglement."
            />
            </div>
            <button
                type="submit"
                className="w-full px-3 py-2 text-sm font-medium rounded-md bg-green-600 hover:bg-green-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-60"
                disabled={!newGoalText.trim()}
            >
            Set as New Main Goal
            </button>
        </form>


        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 sm:px-4 sm:py-2 text-sm font-medium rounded-md bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="Close nudge modal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
