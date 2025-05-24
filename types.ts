
export type CaptureMode = 'screen' | 'camera';

export type TaskStatus = 'To-Do' | 'Doing' | 'Done';

export interface KeyText {
  text: string;
  role?: string; // e.g., "title", "button_label", "input_placeholder"
  importance?: number; // 0-1
}

export interface UIElement {
  type: string; // e.g., "button", "input", "link", "image"
  label?: string; // text content or aria-label
  role?: string; // aria-role
  state?: string; // e.g., "disabled", "checked"
  importance?: number; // 0-1
}

export interface ActiveInteractionContext {
  userActivityGoal?: string; // e.g., "Writing an email to John about project X"
  focusedElement?: UIElement; // The element the user is likely interacting with
  relevantTextSelection?: string;
}

export type UserEditSource = 'user_manual' | 'chronographer_ai';

export interface UserEdit {
  timestamp: number;
  editedField: 'description' | 'status' | 'notes' | 'tags' | 'general_ai_update';
  oldValue?: string | string[] | TaskStatus;
  newValue: string | string[] | TaskStatus;
  editSource: UserEditSource;
}

export interface CognitiveParserOutput {
  id: string; 
  timestamp: number;
  captureModeUsed: CaptureMode;
  rawImagePreviewDataUrl?: string; 
  inferredActivity: string; 
  activeApplication?: string; 
  windowTitle?: string;
  keyTexts: KeyText[]; 
  uiElements: UIElement[]; 
  sentiment?: 'positive' | 'negative' | 'neutral';
  urgency?: 'high' | 'medium' | 'low';
  category?: string; 
  activeInteractionContext?: ActiveInteractionContext; 
  suggestionsFeedback?: {
    timestamp: number;
    rating: 'useful' | 'not_useful' | 'neutral';
  };
  aiCallDurationMs?: number; // For performance metrics
}

export interface TaskItem {
  id: string;
  description: string; 
  status: TaskStatus;
  firstSeenContextId: string; 
  latestContextId: string; 
  firstSeenTimestamp: number;
  lastUpdatedTimestamp: number;
  confidence?: number; 
  historySnapshots?: string[]; 
  userEditsHistory?: UserEdit[];
  subTasks?: Pick<TaskItem, 'id' | 'description' | 'status'>[];
  notes?: string;
  tags?: string[];
  keywords?: string[]; 
  dueDate?: number;
  priority?: 'high' | 'medium' | 'low';
  aiAccuracyFeedback?: { 
    timestamp: number;
    rating: 'relevant' | 'irrelevant' | 'neutral';
    contextIdWhenRated: string; 
  };
  relatedTaskSuggestions?: Array<{ 
    taskId: string; 
    description: string; 
    reason: string; 
    confidence: number; 
  }>;
}

export interface AppSettings {
  captureIntervalSeconds: number;
  maxTaskListSize: number;
  showDebugInfo: boolean;
}

export interface ExternalLLMConfig {
  id: string;
  name: string; 
  apiUrl: string; 
  apiKey: string; 
  promptInstruction: string; 
}

// Types for Self-Iterative Learning Loop
export interface DynamicContextItem {
  keyword: string;
  weight: number; // Relevance score
  lastSeenTimestamp: number;
  frequency: number;
  sourceContextIds: Set<string>; // Which capture contexts contributed this keyword
}
export type DynamicContextMemory = Map<string, DynamicContextItem>;

export interface PotentialMainTask {
  id: string;
  description: string;
  source: 'ai_inferred' | 'user_confirmed' | 'user_created';
  weight: number; // Confidence or probability score (0-1)
  lastReinforcedTimestamp: number;
  contributingContextIds: Set<string>; // IDs of CognitiveParserOutput that contributed
}

export interface UserNudgeInput {
  type: 'confirm_pmt' | 'new_goal';
  pmtId?: string; // For confirming an existing PMT
  goalText?: string; // For setting a new goal
}

// Types for Feedback Aggregation
export interface FeedbackStats {
  usefulCount: number;
  notUsefulCount: number;
  relevantCount: number;
  irrelevantCount: number;
  totalSamples: number;
}

export interface AggregatedFeedbackPattern {
  id: string; // e.g., hash of pattern criteria or the criteria string itself
  patternType: 'inferredActivity_taskAccuracy' | 'inferredActivity_suggestion' | 'app_suggestion' | 'app_taskAccuracy';
  criteria: string; // e.g., "editing document", "Google Chrome"
  stats: FeedbackStats;
  lastUpdatedTimestamp: number;
}

// For Performance Metrics
export interface PerformanceMetrics {
  cognitiveParserAvgMs: number;
  taskChronographerAvgMs: number;
  suggestionGeneratorAvgMs: number;
  processCaptureAvgMs: number;
  callCounts: {
    cognitiveParser: number;
    taskChronographer: number;
    suggestionGenerator: number;
    processCapture: number;
  };
  lastCognitiveParserMs?: number;
  lastTaskChronographerMs?: number;
  lastSuggestionGeneratorMs?: number;
  lastProcessCaptureMs?: number;
}

// For Data Export/Import
export interface ExportDataV1 {
  version: string; // e.g., "1.0.0"
  exportTimestamp: number;
  tasks: TaskItem[];
  allContexts: Array<[string, CognitiveParserOutput]>; // For Map serialization
  settings: AppSettings;
  externalLLMConfigs: ExternalLLMConfig[];
  dynamicContextMemory: Array<[string, DynamicContextItem]>; // For Map serialization
  potentialMainTasks: PotentialMainTask[];
  aggregatedFeedback: Array<[string, AggregatedFeedbackPattern]>; // For Map serialization
}
