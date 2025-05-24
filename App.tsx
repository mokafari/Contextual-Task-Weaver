



import React, { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { cognitiveParseScreenImage, updateTasksWithChronographer, generateContextualSuggestions } from './services/geminiService';
import { MonitoringControls } from './components/MonitoringControls';
import { ErrorMessage } from './components/ErrorMessage';
import { ScreenPreview } from './components/ScreenPreview';
import { TaskColumn } from './components/TaskColumn';
import { SettingsModal } from './components/SettingsModal';
import { PlanProjectModal } from './components/PlanProjectModal';
import { ContextualSuggestionsDisplay } from './components/ContextualSuggestionsDisplay';
import { NudgeModal } from './components/NudgeModal';
import type { TaskItem, CognitiveParserOutput, AppSettings, TaskStatus, ExternalLLMConfig, CaptureMode, UserEdit, DynamicContextMemory, PotentialMainTask, UserNudgeInput, ExportDataV1 } from './types';
import { logger } from './services/logger';
import { fetchHarmoniaDigitalisDocument } from './services/documentFetcher'; // Will fetch Apex Doctrine
import * as dynamicContextManager from './services/dynamicContextManager';

const TASKS_STORAGE_KEY = 'contextualWeaverTasks_v2';
const CONTEXTS_STORAGE_KEY = 'contextualWeaverAllContexts_v2';
const SETTINGS_STORAGE_KEY = 'contextualWeaverSettings_v2';
const LLM_CONFIG_STORAGE_KEY = 'contextualWeaverLLMConfigs_v2';
const DYNAMIC_CONTEXT_MEMORY_STORAGE_KEY = 'contextualWeaverDynamicContextMemory_v2';
const POTENTIAL_MAIN_TASKS_STORAGE_KEY = 'contextualWeaverPotentialMainTasks_v2';

const APP_COMPONENT_NAME = "App";

const App: React.FC = () => {
  const [captureMode, setCaptureMode] = useState<CaptureMode>('screen');
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCapturingFrame, setIsCapturingFrame] = useState<boolean>(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState<boolean>(false);
  
  const [latestPreview, setLatestPreview] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [allContexts, setAllContexts] = useState<Map<string, CognitiveParserOutput>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [fullErrorDetails, setFullErrorDetails] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to weave tasks.");
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const defaultSettings = { 
      captureIntervalSeconds: 15,
      maxTaskListSize: 50,
      showDebugInfo: false, 
    };
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        return { ...defaultSettings, ...parsed };
      } catch (e) {
        logger.warn(APP_COMPONENT_NAME, "useState[settings]", "Failed to parse stored settings, using default.", e);
        return defaultSettings;
      }
    }
    return defaultSettings;
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  
  const [externalLLMConfigs, setExternalLLMConfigs] = useState<ExternalLLMConfig[]>(() => {
    const storedConfigs = localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
    return storedConfigs ? JSON.parse(storedConfigs) : [];
  });
  const [showPlanProjectModal, setShowPlanProjectModal] = useState<boolean>(false);
  const [isPlanningProject, setIsPlanningProject] = useState<boolean>(false);
  const [planningProjectError, setPlanningProjectError] = useState<string | null>(null);

  const [contextualSuggestions, setContextualSuggestions] = useState<string[]>([]);
  const [suggestionContextId, setSuggestionContextId] = useState<string | null>(null); 

  const [apexDoctrineContent, setApexDoctrineContent] = useState<string | null>(null);

  const [dynamicContextMemory, setDynamicContextMemory] = useState<DynamicContextMemory>(new Map());
  const [potentialMainTasks, setPotentialMainTasks] = useState<PotentialMainTask[]>([]);
  const [showNudgeModal, setShowNudgeModal] = useState<boolean>(false);
  const [taskSearchTerm, setTaskSearchTerm] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const captureIntervalIdRef = useRef<number | null>(null);
  
  const isProcessingAnyRef = useRef(isProcessing || isCapturingFrame || isGeneratingSuggestions || isPlanningProject);
  useEffect(() => { 
    isProcessingAnyRef.current = isProcessing || isCapturingFrame || isGeneratingSuggestions || isPlanningProject; 
  }, [isProcessing, isCapturingFrame, isGeneratingSuggestions, isPlanningProject]);

  const isMonitoringRef = useRef(isMonitoring);
  useEffect(() => { isMonitoringRef.current = isMonitoring; }, [isMonitoring]);

  useEffect(() => {
    fetchHarmoniaDigitalisDocument().then(content => {
      if (content) {
        setApexDoctrineContent(content);
        logger.info(APP_COMPONENT_NAME, "useEffect[]", "AI Agent Apex Doctrine loaded successfully.");
      } else {
        logger.warn(APP_COMPONENT_NAME, "useEffect[]", "AI Agent Apex Doctrine could not be loaded. AI operations will proceed without foundational principle guidance for this session.");
        setStatusMessage(prev => prev + " (Warning: Core principles document failed to load)");
      }
    });

    try {
      const storedTasks = localStorage.getItem(TASKS_STORAGE_KEY);
      if (storedTasks) setTasks(JSON.parse(storedTasks));
      
      const storedContexts = localStorage.getItem(CONTEXTS_STORAGE_KEY);
      if (storedContexts) setAllContexts(new Map(JSON.parse(storedContexts)));
      
      const storedDynamicContext = localStorage.getItem(DYNAMIC_CONTEXT_MEMORY_STORAGE_KEY);
      if (storedDynamicContext) setDynamicContextMemory(new Map(JSON.parse(storedDynamicContext)));
      
      const storedPMTs = localStorage.getItem(POTENTIAL_MAIN_TASKS_STORAGE_KEY);
      if (storedPMTs) setPotentialMainTasks(JSON.parse(storedPMTs));

    } catch (e) {
      logger.error(APP_COMPONENT_NAME, "useEffect[]", "Failed to load data from localStorage", e);
      setError("Failed to load previous session. Data might be corrupted.");
      setFullErrorDetails(e);
    }
  }, []);

  useEffect(() => { try { localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { logger.error(APP_COMPONENT_NAME, "useEffect[tasks]", "Failed to save tasks", e); }}, [tasks]);
  useEffect(() => { try { localStorage.setItem(CONTEXTS_STORAGE_KEY, JSON.stringify(Array.from(allContexts.entries()))); } catch (e) { logger.error(APP_COMPONENT_NAME, "useEffect[allContexts]", "Failed to save contexts", e); }}, [allContexts]);
  useEffect(() => { try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch (e) { logger.error(APP_COMPONENT_NAME, "useEffect[settings]", "Failed to save settings", e); }}, [settings]);
  useEffect(() => { try { localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(externalLLMConfigs)); } catch (e) { logger.error(APP_COMPONENT_NAME, "useEffect[llmConfigs]", "Failed to save LLM configs", e); }}, [externalLLMConfigs]);
  useEffect(() => { try { localStorage.setItem(DYNAMIC_CONTEXT_MEMORY_STORAGE_KEY, JSON.stringify(Array.from(dynamicContextMemory.entries()))); } catch (e) { logger.error(APP_COMPONENT_NAME, "useEffect[dynamicContext]", "Failed to save dynamic context", e); }}, [dynamicContextMemory]);
  useEffect(() => { try { localStorage.setItem(POTENTIAL_MAIN_TASKS_STORAGE_KEY, JSON.stringify(potentialMainTasks)); } catch (e) { logger.error(APP_COMPONENT_NAME, "useEffect[pmts]", "Failed to save PMTs", e); }}, [potentialMainTasks]);

  useEffect(() => {
    const currentVideoElement = videoRef.current;
    if (!currentVideoElement) {
      videoRef.current = document.createElement('video');
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
    }
    return () => {
      stopMonitoring(false, "Component unmounting");
      // Use videoRef.current directly in cleanup if it might have changed or for consistency
      const videoToClean = videoRef.current; 
      if (videoToClean) {
        videoToClean.onloadedmetadata = null;
        videoToClean.onerror = null;
        if (videoToClean.srcObject) {
            (videoToClean.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            videoToClean.srcObject = null;
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Context Cleanup Effect
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setAllContexts(prevContexts => {
        const newContexts = new Map(prevContexts);
        let changed = false;
        const referencedContextIds = new Set<string>();

        tasks.forEach(task => {
          referencedContextIds.add(task.firstSeenContextId);
          referencedContextIds.add(task.latestContextId);
        });
        if (suggestionContextId) {
          referencedContextIds.add(suggestionContextId);
        }
        potentialMainTasks.forEach(pmt => {
          pmt.contributingContextIds?.forEach(id => referencedContextIds.add(id));
        });
        dynamicContextMemory.forEach(dci => {
            dci.sourceContextIds?.forEach(id => referencedContextIds.add(id));
        });


        for (const contextId of newContexts.keys()) {
          if (!referencedContextIds.has(contextId)) {
            newContexts.delete(contextId);
            changed = true;
          }
        }
        if (changed) {
          logger.info(APP_COMPONENT_NAME, "contextCleanup", `Cleaned up ${prevContexts.size - newContexts.size} unreferenced contexts. New count: ${newContexts.size}`);
          return newContexts;
        }
        return prevContexts;
      });
    }, 5 * 60 * 1000); // Run every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [tasks, suggestionContextId, potentialMainTasks, dynamicContextMemory]);


  const applyTaskTrimming = useCallback((tasksToTrim: TaskItem[]): TaskItem[] => {
    if (tasksToTrim.length > settings.maxTaskListSize) {
      const sortedTasks = [...tasksToTrim].sort((a, b) => a.firstSeenTimestamp - b.firstSeenTimestamp);
      logger.info(APP_COMPONENT_NAME, "applyTaskTrimming", `Trimmed tasks from ${tasksToTrim.length} to ${settings.maxTaskListSize}`);
      return sortedTasks.slice(Math.max(0, sortedTasks.length - settings.maxTaskListSize));
    }
    return tasksToTrim;
  }, [settings.maxTaskListSize]);

  const stopMonitoring = useCallback((notifyUser = true, reason?: string) => {
    setIsMonitoring(false);
    if (captureIntervalIdRef.current) clearInterval(captureIntervalIdRef.current);
    captureIntervalIdRef.current = null;
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setIsProcessing(false); setIsCapturingFrame(false); setIsGeneratingSuggestions(false);
    setContextualSuggestions([]); setSuggestionContextId(null);
    if (notifyUser) setStatusMessage(reason || "Monitoring stopped.");
    logger.info(APP_COMPONENT_NAME, "stopMonitoring", reason || "Monitoring stopped by user call.");
  }, []);

  const processCapture = useCallback(async (isUserInitiated = false) => {
    if (!mediaStreamRef.current || !mediaStreamRef.current.active || !videoRef.current || !videoRef.current.srcObject) {
      if (isMonitoringRef.current) {
        const msg = `Error: ${captureMode} stream lost. Monitoring stopped.`;
        setStatusMessage(msg); setError(msg); setFullErrorDetails({ message: "Stream lost", streamState: mediaStreamRef.current?.active });
        stopMonitoring(false, msg); logger.warn(APP_COMPONENT_NAME, "processCapture", msg);
      }
      setIsCapturingFrame(false); return;
    }
    if (isProcessingAnyRef.current && !isUserInitiated) {
      logger.debug(APP_COMPONENT_NAME, "processCapture", "Skipped capture due to another process running."); return;
    }
    
    setIsCapturingFrame(true); setIsProcessing(true); setError(null); setFullErrorDetails(null);
    setStatusMessage(`Capturing from ${captureMode}...`);

    const video = videoRef.current;
    if (video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
        setStatusMessage(`Preparing ${captureMode} capture...`);
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!mediaStreamRef.current || !mediaStreamRef.current.active || video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
             setStatusMessage(`Capture from ${captureMode} skipped (video not ready).`);
             setIsCapturingFrame(false); setIsProcessing(false);
             logger.warn(APP_COMPONENT_NAME, "processCapture", "Capture skipped, video not ready after wait.", { readyState: video.readyState, width: video.videoWidth, height: video.videoHeight });
             return;
        }
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      if (canvas.width === 0 || canvas.height === 0) throw new Error(`Canvas dimensions are zero. Video: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}.`);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get 2D context.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageDataUrl = canvas.toDataURL('image/png');
      setLatestPreview(imageDataUrl);
      const base64ImageData = imageDataUrl.split(',')[1];
      if (!base64ImageData) throw new Error("Failed to extract base64 data from image.");
      
      setStatusMessage(`Cognitive Parser analyzing ${captureMode} capture...`);
      const parsedContext = await cognitiveParseScreenImage(base64ImageData, apexDoctrineContent, captureMode);
      
      setAllContexts(prevMap => new Map(prevMap).set(parsedContext.id, parsedContext));
      setIsCapturingFrame(false);

      const { updatedMemory, extractedKeywords } = dynamicContextManager.updateDynamicContextMemory(parsedContext, dynamicContextMemory);
      setDynamicContextMemory(updatedMemory);
      const updatedPMTs = dynamicContextManager.updatePotentialMainTasks(parsedContext, updatedMemory, potentialMainTasks, null);
      setPotentialMainTasks(updatedPMTs);
      const topPMT = dynamicContextManager.getHighestWeightedPMTs(updatedPMTs, 1)[0] || null;

      if (parsedContext.activeInteractionContext || parsedContext.inferredActivity) {
        setIsGeneratingSuggestions(true);
        setStatusMessage("Generating contextual suggestions...");
        try {
          const suggestions = await generateContextualSuggestions(apexDoctrineContent, updatedMemory, topPMT, parsedContext.activeInteractionContext, parsedContext.inferredActivity);
          // Fix: Access the 'result' property from the suggestions object
          setContextualSuggestions(suggestions.result); setSuggestionContextId(parsedContext.id);
        } catch (suggestionErr: any) {
          logger.warn(APP_COMPONENT_NAME, "processCapture", "Failed to generate suggestions", suggestionErr);
          setError(`Suggestion Error: ${suggestionErr.message.substring(0,100)}...`); setFullErrorDetails(suggestionErr);
          setContextualSuggestions([]); setSuggestionContextId(null);
        } finally { setIsGeneratingSuggestions(false); }
      } else { setContextualSuggestions([]); setSuggestionContextId(null); }

      setStatusMessage("Task Chronographer updating tasks...");
      const updatedTasksFromLLM = await updateTasksWithChronographer(tasks, parsedContext, apexDoctrineContent, updatedMemory, topPMT, extractedKeywords);
      // Fix: Access the 'result' property from updatedTasksFromLLM
      const trimmedTasks = applyTaskTrimming(updatedTasksFromLLM.result);
      setTasks(trimmedTasks);
      
      setStatusMessage(isMonitoringRef.current ? `Tasks updated. Monitoring ${captureMode}...` : "Tasks updated.");
      logger.info(APP_COMPONENT_NAME, "processCapture", "Capture processed successfully.");

    } catch (err: any) {
      logger.error(APP_COMPONENT_NAME, `processCapture (${captureMode})`, "Processing capture failed", err);
      const errorMessage = err.message || `An unknown error occurred.`;
      setError(errorMessage); setFullErrorDetails(err);
      setStatusMessage(`Error: ${errorMessage.substring(0, 100)}...`);
      setIsCapturingFrame(false); 
    } finally { setIsProcessing(false); }
  }, [tasks, allContexts, stopMonitoring, applyTaskTrimming, captureMode, apexDoctrineContent, dynamicContextMemory, potentialMainTasks]);

  const startMonitoring = useCallback(async () => {
    if (!navigator.mediaDevices) {
      const msg = "Media devices API not available in this browser.";
      setError(msg); setFullErrorDetails({ message: msg }); setStatusMessage(msg);
      logger.error(APP_COMPONENT_NAME, "startMonitoring", msg);
      return;
    }
    setError(null); setFullErrorDetails(null); setIsProcessing(true);
    setStatusMessage(`Requesting ${captureMode} access...`);
    try {
      let stream: MediaStream;
      if (captureMode === 'screen') stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always", width: { ideal: 1920 }, height: { ideal: 1080 } } as any, audio: false });
      else stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      mediaStreamRef.current = stream;
      if (!videoRef.current) throw new Error("Video element not initialized.");
      videoRef.current.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => { stopMonitoring(false, `${captureMode} sharing ended.`); logger.info(APP_COMPONENT_NAME, "stream.onended", `${captureMode} ended.`); };
      await new Promise<void>((resolve, reject) => {
        if (!videoRef.current) return reject(new Error("Video ref not available."));
        const vid = videoRef.current;
        vid.onloadedmetadata = () => { vid.play().then(resolve).catch(reject); };
        vid.onerror = () => reject(new Error(`Video playback error.`));
        if (vid.readyState >= vid.HAVE_METADATA) vid.play().then(resolve).catch(reject);
      });
      setIsMonitoring(true); setStatusMessage(`Monitoring ${captureMode}. Initial capture...`);
      setIsProcessing(false); 
      await processCapture(true); 
      if (captureIntervalIdRef.current) clearInterval(captureIntervalIdRef.current);
      captureIntervalIdRef.current = setInterval(() => {
        if (isMonitoringRef.current && !isProcessingAnyRef.current && !document.hidden) processCapture();
        else if (document.hidden && isMonitoringRef.current) setStatusMessage(`Monitoring ${captureMode} paused (page hidden).`);
      }, settings.captureIntervalSeconds * 1000) as unknown as number;
      logger.info(APP_COMPONENT_NAME, "startMonitoring", `Monitoring started for ${captureMode}.`);
    } catch (err: any) {
      logger.error(APP_COMPONENT_NAME, `startMonitoring (${captureMode})`, "Failed to start", err);
      const msg = err.message || `Failed to start ${captureMode}.`;
      setError(msg); setFullErrorDetails(err); setStatusMessage(`Error: ${msg.substring(0,100)}...`);
      setIsProcessing(false); stopMonitoring(false, `Error starting.`);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError(`Permission for ${captureMode} denied. Please check browser site settings.`);
      }
    }
  }, [processCapture, settings.captureIntervalSeconds, stopMonitoring, captureMode]);

  const handleManualCapture = useCallback(() => { processCapture(true); }, [processCapture]);
  
  // Fix: Adjust parameter type to match SettingsModalProps definition
  const handleSaveAppSettings = (newSettings: Pick<AppSettings, 'captureIntervalSeconds' | 'maxTaskListSize'>) => {
    const oldInterval = settings.captureIntervalSeconds;
    setSettings(prevSettings => ({...prevSettings, ...newSettings})); 
    if (isMonitoring && newSettings.captureIntervalSeconds !== oldInterval) {
      logger.info(APP_COMPONENT_NAME, "handleSaveAppSettings", `Capture interval changed from ${oldInterval}s to ${newSettings.captureIntervalSeconds}s. Restarting monitoring.`);
      stopMonitoring(false, "Interval changed, restarting...");
      // Set a short timeout to allow stopMonitoring to fully complete before starting
      setTimeout(() => startMonitoring(), 100); 
    }
  };
  const handleSaveLLMConfigs = (newConfigs: ExternalLLMConfig[]) => { setExternalLLMConfigs(newConfigs); };
  
  const handleUpdateTask = useCallback((taskId: string, updates: Partial<TaskItem>, editLogEntry?: UserEdit) => {
    setTasks(prevTasks => {
      const newTasks = prevTasks.map(task => {
        if (task.id === taskId) {
          const updatedTask = { ...task, ...updates, lastUpdatedTimestamp: Date.now() };
          if (editLogEntry) {
            updatedTask.userEditsHistory = [...(task.userEditsHistory || []), editLogEntry].slice(-10);
          }
          return updatedTask;
        }
        return task;
      });
      return applyTaskTrimming(newTasks);
    });
  }, [applyTaskTrimming]);

  const handleRateTaskAccuracy = useCallback((taskId: string, rating: 'relevant' | 'irrelevant') => {
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.id === taskId 
          ? { ...task, aiAccuracyFeedback: { timestamp: Date.now(), rating, contextIdWhenRated: task.latestContextId } }
          : task
      )
    );
  }, []);

  const handleRateSuggestions = useCallback((contextId: string, rating: 'useful' | 'not_useful') => {
    setAllContexts(prevContexts => {
      const newContexts = new Map(prevContexts);
      const contextToUpdate = newContexts.get(contextId);
      if (contextToUpdate) {
        newContexts.set(contextId, {
          ...contextToUpdate,
          suggestionsFeedback: { timestamp: Date.now(), rating }
        });
      }
      return newContexts;
    });
  }, []);

  const handleGenerateTasksFromGoal = async (goal: string, llmConfigId: string) => {
    const config = externalLLMConfigs.find(c => c.id === llmConfigId);
    if (!config) { 
      setPlanningProjectError("Selected LLM Connector not found.");
      logger.error(APP_COMPONENT_NAME, "handleGenerateTasksFromGoal", "LLM config not found", { llmConfigId });
      return; 
    }
    setIsPlanningProject(true); setPlanningProjectError(null); setStatusMessage("Generating tasks with external LLM...");
    try {
      let fullPrompt = "";
      const topPMT = dynamicContextManager.getHighestWeightedPMTs(potentialMainTasks, 1)[0];
      const contextSummary = Array.from(dynamicContextMemory.entries())
                                .sort(([,a],[,b]) => b.weight - a.weight)
                                .slice(0, 5)
                                .map(([kw]) => kw)
                                .join(', ');

      let contextualPrefix = `Current high-level context for the user:\n`;
      if (topPMT) contextualPrefix += `Primary User Goal Hypothesis: ${topPMT.description}\n`;
      if (contextSummary) contextualPrefix += `Key Contextual Themes: ${contextSummary}\n\n`;
      
      const baseInstructionForLLM = `Your task is to break down the following user goal into a list of actionable tasks. Respond with ONLY a valid JSON array of objects, where each object has a "description" field (string), and optionally a "name" field if a shorter title is appropriate. For example: [{"name": "Task 1 Title", "description":"Task 1 details"}, {"description":"Task 2 details"}].`;

      if (apexDoctrineContent) {
        fullPrompt = `<apex_doctrine source="AI Agent Apex Doctrine (AAD) - v5.0">\n${apexDoctrineContent}\n</apex_doctrine>\n\nYour primary instruction is to assist the user with planning. Adhere to the Apex Doctrine in all task suggestions and planning.\n${contextualPrefix}${baseInstructionForLLM}\nUser Goal: ${goal}\nCustom Prompt Instruction: ${config.promptInstruction}`;
      } else {
        fullPrompt = `${contextualPrefix}${baseInstructionForLLM}\nUser Goal: ${goal}\nCustom Prompt Instruction: ${config.promptInstruction}`;
      }
      
      logger.debug(APP_COMPONENT_NAME, "handleGenerateTasksFromGoal", "Sending prompt to external LLM:", { apiUrl: config.apiUrl, promptStart: fullPrompt.substring(0,100) });

      const requestBody = { prompt: fullPrompt }; // Common structure, adapt if needed
      // If external LLM uses Gemini format, structure might be:
      // const requestBody = { contents: [{ parts: [{ text: fullPrompt }] }] };
      
      const response = await fetch(config.apiUrl, { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          // Add Authorization header if needed, e.g., for OpenAI or other LLMs
          // 'Authorization': `Bearer ${config.apiKey}` // Example for Bearer token
        },
        body: JSON.stringify(requestBody), 
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`External LLM API request failed: ${response.status} ${response.statusText}. Response: ${errorText.substring(0,200)}`);
      }
      
       const responseData = await response.json();
       let taskDataToParse: any;
       // Adapt response parsing based on common LLM API structures
       if (responseData.text && typeof responseData.text === 'string') taskDataToParse = responseData.text; // Simple text response
       else if (responseData.choices && Array.isArray(responseData.choices) && responseData.choices[0]?.message?.content) taskDataToParse = responseData.choices[0].message.content; // OpenAI like
       else if (responseData.candidates && Array.isArray(responseData.candidates) && responseData.candidates[0]?.content?.parts?.[0]?.text) taskDataToParse = responseData.candidates[0].content.parts[0].text; // Gemini like
       else if (Array.isArray(responseData)) taskDataToParse = responseData; // Direct array response
       else throw new Error("Could not find task list in LLM response. Unexpected format.");

       let parsedTasks: Array<{description: string; name?: string}>;
       if (typeof taskDataToParse === 'string') {
         let jsonStr = taskDataToParse.trim().replace(/^```(?:json)?\s*|\s*```$/gs, '');
         try {
           parsedTasks = JSON.parse(jsonStr);
         } catch (parseErr: any) {
           logger.error(APP_COMPONENT_NAME, "handleGenerateTasksFromGoal", "Failed to parse JSON from LLM response string.", {jsonStr, parseErr});
           throw new Error(`LLM returned malformed JSON: ${parseErr.message}. Raw output: ${jsonStr.substring(0,200)}`);
         }
       } else if (Array.isArray(taskDataToParse)) {
         parsedTasks = taskDataToParse;
       } else {
         throw new Error("LLM response for tasks was not a string or array.");
       }


       if (!Array.isArray(parsedTasks) || !parsedTasks.every(pt => typeof pt === 'object' && pt !== null && typeof pt.description === 'string')) {
         throw new Error("LLM response for tasks was not a valid array of task objects with descriptions.");
       }


       const now = Date.now();
       const newGoalTasks: TaskItem[] = parsedTasks.map(pt => ({
         id: uuidv4(), 
         description: pt.name || pt.description, 
         status: 'To-Do',
         firstSeenContextId: `external-llm-${uuidv4()}`, 
         latestContextId: `external-llm-${uuidv4()}`,    
         firstSeenTimestamp: now, 
         lastUpdatedTimestamp: now,
         historySnapshots: [`Task planned for goal: ${goal.substring(0,50)}... (via Ext. LLM: ${config.name.substring(0,20)})`],
         userEditsHistory: [{timestamp: now, editedField: 'description', newValue: pt.name || pt.description, editSource: 'user_manual'}], // Treat as initial 'manual' setup
         keywords: dynamicContextManager.extractKeywordsFromContext({ inferredActivity: pt.description } as CognitiveParserOutput), // Add some keywords
       }));
       setTasks(prevTasks => applyTaskTrimming([...newGoalTasks, ...prevTasks]));
       setStatusMessage(`Generated ${newGoalTasks.length} tasks for "${goal.substring(0,30)}...".`); 
       setShowPlanProjectModal(false);
    } catch (err: any) { 
      logger.error(APP_COMPONENT_NAME, "handleGenerateTasksFromGoal", "Error generating tasks from goal", err);
      setPlanningProjectError(err.message || "An unknown error occurred during project planning.");
      setStatusMessage(`Error planning project: ${err.message?.substring(0,50)}...`);
    } 
    finally { setIsPlanningProject(false); }
  };
  
  const handleOpenNudgeModal = () => setShowNudgeModal(true);
  const handleApplyNudge = (nudge: UserNudgeInput) => {
    logger.info(APP_COMPONENT_NAME, "handleApplyNudge", "Applying user nudge", nudge);
    const updatedPMTs = dynamicContextManager.updatePotentialMainTasks(null, dynamicContextMemory, potentialMainTasks, nudge);
    setPotentialMainTasks(updatedPMTs);
    setShowNudgeModal(false);
    const nudgeDesc = nudge.type === 'new_goal' ? nudge.goalText?.substring(0,30) : 
                      potentialMainTasks.find(p=>p.id===nudge.pmtId)?.description.substring(0,30);
    setStatusMessage(`AI focus updated by user: ${nudgeDesc || 'Confirmed goal'}.`);
  };

  const handleExportData = useCallback(() => {
    logger.info(APP_COMPONENT_NAME, "handleExportData", "Export data functionality called.");
    const dataToExport: ExportDataV1 = {
      version: "1.0.0", // Ensure this matches your ExportDataV1 type
      exportTimestamp: Date.now(),
      tasks,
      allContexts: Array.from(allContexts.entries()),
      settings,
      externalLLMConfigs,
      dynamicContextMemory: Array.from(dynamicContextMemory.entries()),
      potentialMainTasks,
      // Fix: Initialize aggregatedFeedback as an empty array as it's required by ExportDataV1 but no state exists for it
      aggregatedFeedback: [], 
    };
    try {
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(dataToExport, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = `contextualWeaverData_v1_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      setStatusMessage("Data exported successfully.");
    } catch (e: any) {
      logger.error(APP_COMPONENT_NAME, "handleExportData", "Failed to export data", e);
      setError("Failed to export data. " + e.message);
      setFullErrorDetails(e);
    }
  }, [tasks, allContexts, settings, externalLLMConfigs, dynamicContextMemory, potentialMainTasks]);

  const handleImportData = useCallback((file: File) => {
    logger.info(APP_COMPONENT_NAME, "handleImportData", `Import data functionality called with file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        if (!jsonString) {
          throw new Error("File content is empty or could not be read.");
        }
        const importedData = JSON.parse(jsonString) as Partial<ExportDataV1>; // Use Partial for flexibility
        
        if (!importedData || typeof importedData !== 'object' || !importedData.version) {
            throw new Error("Invalid data format: Missing version or not an object.");
        }
        if (importedData.version !== "1.0.0") {
             logger.warn(APP_COMPONENT_NAME, "handleImportData", `Importing data from version ${importedData.version}, current app might expect a different version. Proceeding with caution.`);
        }

        if (importedData.tasks && Array.isArray(importedData.tasks)) {
          setTasks(applyTaskTrimming(importedData.tasks as TaskItem[]));
        }
        if (importedData.allContexts && Array.isArray(importedData.allContexts)) {
          setAllContexts(new Map(importedData.allContexts as Array<[string, CognitiveParserOutput]>));
        }
        if (importedData.settings && typeof importedData.settings === 'object') {
          setSettings(prev => ({...prev, ...importedData.settings as AppSettings}));
        }
        if (importedData.externalLLMConfigs && Array.isArray(importedData.externalLLMConfigs)) {
          setExternalLLMConfigs(importedData.externalLLMConfigs as ExternalLLMConfig[]);
        }
        if (importedData.dynamicContextMemory && Array.isArray(importedData.dynamicContextMemory)) {
          setDynamicContextMemory(new Map(importedData.dynamicContextMemory as Array<[string, DynamicContextMemory extends Map<any, infer V> ? V: never]>));
        }
        if (importedData.potentialMainTasks && Array.isArray(importedData.potentialMainTasks)) {
          setPotentialMainTasks(importedData.potentialMainTasks as PotentialMainTask[]);
        }
        // if (importedData.aggregatedFeedback && Array.isArray(importedData.aggregatedFeedback)) {
        //   setAggregatedFeedback(new Map(importedData.aggregatedFeedback));
        // }

        setStatusMessage("Data imported successfully. Please review the imported tasks and settings.");
        logger.info(APP_COMPONENT_NAME, "handleImportData", "Data imported successfully.");

      } catch (e: any) {
        logger.error(APP_COMPONENT_NAME, "handleImportData", "Failed to import data", e);
        setError(`Failed to import data: ${e.message}`);
        setFullErrorDetails(e);
      }
    };
    reader.onerror = (errorEvent) => {
        logger.error(APP_COMPONENT_NAME, "handleImportData", "File reading error", errorEvent);
        setError("Failed to read the selected file.");
        setFullErrorDetails(errorEvent);
    };
    reader.readAsText(file);
  }, [applyTaskTrimming]);


  const filteredTasks = tasks.filter(task => {
    if (!taskSearchTerm.trim()) return true;
    const searchTermLower = taskSearchTerm.toLowerCase();
    return (
      task.description.toLowerCase().includes(searchTermLower) ||
      (task.notes && task.notes.toLowerCase().includes(searchTermLower)) ||
      (task.tags && task.tags.some(tag => tag.toLowerCase().includes(searchTermLower))) ||
      (task.keywords && task.keywords.some(kw => kw.toLowerCase().includes(searchTermLower)))
    );
  });

  const taskColumns: { title: string; status: TaskStatus; items: TaskItem[] }[] = [
    { title: "To-Do", status: "To-Do", items: filteredTasks.filter(t => t.status === 'To-Do') },
    { title: "Doing", status: "Doing", items: filteredTasks.filter(t => t.status === 'Doing') },
    { title: "Done", status: "Done", items: filteredTasks.filter(t => t.status === 'Done') },
  ];
  
  const anyOperationPending = isProcessing || isCapturingFrame || isGeneratingSuggestions || isPlanningProject;
  const currentSuggestionContext = suggestionContextId ? allContexts.get(suggestionContextId) : undefined;
  const currentSuggestionFeedback = currentSuggestionContext?.suggestionsFeedback?.rating;
  const topPMTForDisplay = dynamicContextManager.getHighestWeightedPMTs(potentialMainTasks, 1)[0];
  
  let currentStatusMessage = statusMessage;
  if (isMonitoring && topPMTForDisplay && !anyOperationPending) {
    currentStatusMessage = `AI Focus: ${topPMTForDisplay.description.substring(0,30)}... | ${statusMessage}`;
  } else if (isMonitoring && !anyOperationPending && !topPMTForDisplay) {
    currentStatusMessage = `Monitoring. AI is discerning focus... | ${statusMessage}`;
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 flex flex-col items-center p-2 sm:p-4 md:p-6 selection:bg-sky-400 selection:text-sky-900">
      <div className="w-full max-w-screen-2xl bg-slate-800 shadow-2xl rounded-xl p-3 sm:p-5 md:p-8">
        <header className="text-center mb-4 sm:mb-6">
           <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">
            Contextual Task Weaver
          </h1>
          <p className="text-slate-400 mt-1 sm:mt-2 text-xs sm:text-sm">
            AI-powered task identification, tracking, and contextual assistance from your screen/camera activity.
          </p>
        </header>

        <main className="flex flex-col items-center">
          <MonitoringControls
            isMonitoring={isMonitoring}
            isProcessing={anyOperationPending && isMonitoring}
            isStarting={isProcessing && !isMonitoring && !mediaStreamRef.current}
            // Fix: Pass isCapturingFrame to MonitoringControls
            isCapturingFrame={isCapturingFrame}
            onStart={startMonitoring}
            onStop={() => stopMonitoring(true, "Monitoring stopped by user.")}
            onManualCapture={handleManualCapture}
            onOpenSettings={() => setShowSettingsModal(true)}
            onOpenPlanProjectModal={() => { setPlanningProjectError(null); setShowPlanProjectModal(true); }}
            statusMessage={currentStatusMessage}
            captureInterval={settings.captureIntervalSeconds}
            currentCaptureMode={captureMode}
            onSetCaptureMode={(mode) => { if (!isMonitoring && !anyOperationPending) setCaptureMode(mode);}}
            disabledAllControls={anyOperationPending && !isMonitoring}
            onOpenNudgeModal={handleOpenNudgeModal}
            topPMTDescription={topPMTForDisplay?.description}
          />

          {error && <ErrorMessage message={error} detailsToCopy={fullErrorDetails} className="mt-3 w-full" />}
          
          <ContextualSuggestionsDisplay 
            suggestions={contextualSuggestions} 
            contextTitle={currentSuggestionContext ? `AI suggestions for: ${(currentSuggestionContext.activeInteractionContext?.userActivityGoal || currentSuggestionContext.inferredActivity || 'current activity').substring(0,50)}...` : null}
            isLoading={isGeneratingSuggestions}
            contextIdForFeedback={suggestionContextId}
            onRateSuggestions={handleRateSuggestions}
            currentFeedback={currentSuggestionFeedback}
          />
          
          <div className="mt-4 w-full max-w-xl mx-auto">
            <input
              type="text"
              placeholder="Search tasks (description, notes, tags, keywords)..."
              value={taskSearchTerm}
              onChange={(e) => setTaskSearchTerm(e.target.value)}
              className="w-full p-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-sky-500 focus:border-sky-500 placeholder-slate-400"
            />
          </div>

          <div className="mt-4 w-full grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
            {taskColumns.map(col => (
              <TaskColumn 
                key={col.status} 
                title={col.title} 
                tasks={col.items}
                allContexts={allContexts}
                onUpdateTask={handleUpdateTask}
                onRateTaskAccuracy={handleRateTaskAccuracy}
              />
            ))}
          </div>
          
          {settings.showDebugInfo && (
            <div className="mt-5 p-3 bg-slate-850 rounded-md border border-sky-700/50 w-full max-w-2xl mx-auto">
              <h3 className="text-md font-semibold text-sky-300 mb-2">Debug Info: Dynamic Context & PMTs</h3>
              <div className="text-xs space-y-1 max-h-60 overflow-y-auto custom-scrollbar-xs">
                <p className="font-semibold">Top PMT: {topPMTForDisplay?.description || 'N/A'} (W: {topPMTForDisplay?.weight.toFixed(2)})</p>
                <p className="font-semibold">All PMTs ({potentialMainTasks.length}):</p>
                {dynamicContextManager.getHighestWeightedPMTs(potentialMainTasks, 5).map(pmt => <p key={pmt.id}>- {pmt.description.substring(0,50)}... (W: {pmt.weight.toFixed(2)}, S: {pmt.source})</p>)}
                <p className="font-semibold mt-1">Dynamic Context Memory ({dynamicContextMemory.size} items):</p>
                {Array.from(dynamicContextMemory.entries()).sort(([,a],[,b]) => b.weight - a.weight).slice(0,10).map(([key, item]) => (
                  <p key={key}>- {key} (W: {item.weight.toFixed(2)}, F: {item.frequency}, T: {new Date(item.lastSeenTimestamp).toLocaleTimeString()})</p>
                ))}
              </div>
            </div>
          )}

          {latestPreview && (
            <div className="mt-4 w-full max-w-lg mx-auto">
                 <ScreenPreview imageDataUrl={latestPreview} />
            </div>
           )}
          {!isMonitoring && tasks.length === 0 && !contextualSuggestions.length && !latestPreview && ( 
             <p className="text-slate-500 text-center mt-10">Start monitoring or capture manually to see tasks and context.</p>
           )}
        </main>
      </div>
      
      {showSettingsModal && (
        <SettingsModal
          currentSettings={settings}
          externalLLMConfigs={externalLLMConfigs}
          onSaveAppSettings={handleSaveAppSettings}
          onSaveLLMConfigs={handleSaveLLMConfigs}
          onClose={() => setShowSettingsModal(false)}
          onToggleShowDebugInfo={() => setSettings(s => ({...s, showDebugInfo: !s.showDebugInfo}))}
          // Fix: Pass onExportData and onImportData to SettingsModal
          onExportData={handleExportData}
          onImportData={handleImportData}
        />
      )}

      {showPlanProjectModal && ( 
        <PlanProjectModal
            isOpen={showPlanProjectModal}
            onClose={() => setShowPlanProjectModal(false)}
            onSubmit={handleGenerateTasksFromGoal}
            llmConfigs={externalLLMConfigs}
            isProcessing={isPlanningProject}
            error={planningProjectError}
        />
      )}

      {showNudgeModal && (
        <NudgeModal
          isOpen={showNudgeModal}
          onClose={() => setShowNudgeModal(false)}
          potentialMainTasks={dynamicContextManager.getHighestWeightedPMTs(potentialMainTasks, 3)}
          onApplyNudge={handleApplyNudge}
        />
      )}

       <footer className="text-center mt-6 sm:mt-8 text-slate-500 text-xs">
          <p>&copy; {new Date().getFullYear()} Contextual Task Weaver (ETMS Core). Powered by Gemini.</p>
          <p className="mt-1">Ensure no sensitive information is visible during screen monitoring.</p>
         {!apexDoctrineContent && <p className="text-red-400 text-xs mt-0.5">Warning: Foundational AI Agent Apex Doctrine failed to load. AI operations may not be fully guided.</p>}
      </footer>
    </div>
  );
};

export default App;