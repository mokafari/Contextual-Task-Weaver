
import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import type { CaptureMode } from '../types';

interface MonitoringControlsProps {
  isMonitoring: boolean;
  isProcessing: boolean; 
  isStarting: boolean; 
  isCapturingFrame: boolean;
  onStart: () => void;
  onStop: () => void;
  onManualCapture: () => void;
  onOpenSettings: () => void;
  onOpenPlanProjectModal: () => void;
  statusMessage: string; // App.tsx will format this to include PMT info
  captureInterval: number;
  currentCaptureMode: CaptureMode;
  onSetCaptureMode: (mode: CaptureMode) => void;
  disabledAllControls?: boolean; 
  onOpenNudgeModal: () => void; 
  topPMTDescription?: string; // This prop might not be directly used in statusMessage here if App.tsx handles it
}

export const MonitoringControls: React.FC<MonitoringControlsProps> = ({
  isMonitoring,
  isProcessing,
  isStarting,
  isCapturingFrame,
  onStart,
  onStop,
  onManualCapture,
  onOpenSettings,
  onOpenPlanProjectModal,
  statusMessage,
  captureInterval,
  currentCaptureMode,
  onSetCaptureMode,
  disabledAllControls,
  onOpenNudgeModal,
  // topPMTDescription prop is available if direct display logic is preferred here
}) => {
  const baseButtonClass = "px-4 py-2 text-sm sm:px-5 sm:py-2.5 sm:text-base font-semibold rounded-lg shadow-md transform transition-all duration-300 ease-in-out flex items-center justify-center hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-opacity-50 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100";
  
  const anyProcessingWhichDisablesSettings = isProcessing || isStarting || disabledAllControls;
  // More granular disabling for start/stop/manual capture
  const disableStart = isStarting || disabledAllControls || isMonitoring;
  const disableStop = disabledAllControls && !isMonitoring; // Only truly disable if master disable is on AND not monitoring (e.g. error state)
  const disableManualCapture = (isProcessing && isMonitoring) || (isCapturingFrame && !isMonitoring) || disabledAllControls;


  return (
    <div className="w-full flex flex-col items-center space-y-3 bg-slate-850 rounded-lg shadow-md p-3 sm:p-4 mb-3">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
         <div className="flex items-center space-x-3 p-2 bg-slate-700/50 rounded-md">
            <span className="text-sm text-slate-300 sr-only" id="capture-mode-label">Capture:</span>
            <div>
                <input 
                type="radio" id="captureScreen" name="captureMode" value="screen"
                checked={currentCaptureMode === 'screen'}
                onChange={() => onSetCaptureMode('screen')}
                disabled={isMonitoring || anyProcessingWhichDisablesSettings}
                className="mr-1 sm:mr-1.5 accent-sky-500 focus:ring-sky-400"
                aria-labelledby="capture-mode-label"
                aria-label="Capture Screen"
                />
                <label htmlFor="captureScreen" className={`cursor-pointer text-xs sm:text-sm ${(isMonitoring || anyProcessingWhichDisablesSettings) ? 'text-slate-500' : 'text-slate-200'}`}>
                Screen
                </label>
            </div>
            <div>
                <input 
                type="radio" id="captureCamera" name="captureMode" value="camera"
                checked={currentCaptureMode === 'camera'}
                onChange={() => onSetCaptureMode('camera')}
                disabled={isMonitoring || anyProcessingWhichDisablesSettings}
                className="mr-1 sm:mr-1.5 accent-sky-500 focus:ring-sky-400"
                aria-labelledby="capture-mode-label"
                aria-label="Use Camera"
                />
                <label htmlFor="captureCamera" className={`cursor-pointer text-xs sm:text-sm ${(isMonitoring || anyProcessingWhichDisablesSettings) ? 'text-slate-500' : 'text-slate-200'}`}>
                Camera
                </label>
            </div>
        </div>

        {!isMonitoring ? (
          <button
            onClick={onStart}
            disabled={disableStart}
            className={`${baseButtonClass} bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white focus:ring-green-300`}
            aria-label={`Start ${currentCaptureMode} monitoring`}
          >
            {isStarting ? (
              <><LoadingSpinner size="sm" /> <span className="ml-2">Starting...</span></>
            ) : (
              `Start ${currentCaptureMode === 'screen' ? 'Screen' : 'Camera'} Monitor`
            )}
          </button>
        ) : (
          <button
            onClick={onStop}
            disabled={disableStop}
            className={`${baseButtonClass} bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white focus:ring-red-300`}
            aria-label="Stop monitoring"
          >
            Stop Monitor
          </button>
        )}
        <button
          onClick={onManualCapture}
          disabled={disableManualCapture}
          className={`${baseButtonClass} bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white focus:ring-sky-300`}
          aria-label={`Capture ${currentCaptureMode} manually now`}
        >
          {isProcessing && isMonitoring ? 
            (<><LoadingSpinner size="sm" /> <span className="ml-2">Processing...</span></>) : 
            (isCapturingFrame && !isMonitoring ? (<><LoadingSpinner size="sm" /> <span className="ml-2">Capturing...</span></>) : `Capture Now`)
          }
        </button>
        <button
          onClick={onOpenNudgeModal}
          disabled={anyProcessingWhichDisablesSettings}
          className={`${baseButtonClass} bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white focus:ring-teal-300`}
          aria-label="Nudge AI or set main goal"
        >
          Nudge AI
        </button>
         <button
          onClick={onOpenPlanProjectModal}
          disabled={anyProcessingWhichDisablesSettings}
          className={`${baseButtonClass} bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white focus:ring-purple-300`}
          aria-label="Plan project with AI"
        >
          Plan with AI
        </button>
        <button
          onClick={onOpenSettings}
          disabled={anyProcessingWhichDisablesSettings && isMonitoring} // Allow settings if not monitoring, even if processing non-monitoring stuff
          className={`${baseButtonClass} bg-gradient-to-r from-slate-500 to-gray-500 hover:from-slate-600 hover:to-gray-600 text-white focus:ring-slate-300`}
          aria-label="Open settings"
        >
          Settings
        </button>
      </div>
      <div className="text-xs sm:text-sm text-slate-400 flex items-center flex-wrap justify-center sm:justify-start pt-1 sm:pt-2 min-h-[20px] text-center sm:text-left" aria-live="polite">
        {(isProcessing || isStarting || (isCapturingFrame && !isMonitoring) ) && <LoadingSpinner size="sm" color="text-sky-400"/>}
        <span className={`ml-2 ${(isProcessing || isStarting) ? 'italic' : ''}`}>{statusMessage}</span>
        {isMonitoring && !isProcessing && !isStarting && <span className="ml-2 text-xs text-slate-500">(Interval: {captureInterval}s)</span>}
      </div>
    </div>
  );
};
