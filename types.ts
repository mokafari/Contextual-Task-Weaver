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
  activeUserTextEntry?: string | null; // Text being actively entered by the user
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
  lockedKeywords?: LockedKeyword[];
  geminiApiKey?: string;
  selectedModel?: string;
  aiCommandParserModel?: string;
  promptEnhancerModel?: string;
}

// For EKS v1.5: Locked Keywords
export interface LockedKeyword {
  id: string; // uuid
  phrase: string; // The keyword/phrase itself
  meaning?: string; // User-defined meaning or expansion
  context?: string; // User-defined context where this keyword is especially relevant
  priority: number; // e.g., 1-5, with 5 being highest. Default to 3 if not set.
  createdAt: number; // timestamp
  lastUsedTimestamp?: number; // For potential future decay or sorting
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
  id: string; // uuid, added
  keyword: string;
  weight: number;
  lastSeenTimestamp: number;
  firstSeenTimestamp: number; // added
  sources: string[]; // e.g., ["context:id1", "native:appName", "locked"], added
  type: 'extracted_keyword' | 'native_hook_keyword' | 'locked_keyword'; // added
  associatedData?: { // Optional, added
    lockedMeaning?: string;
    lockedContext?: string;
    isLocked?: boolean;
    relatedToLocked?: string; // If this keyword was boosted due to relation to a locked one
    // other relevant data, e.g., from UI elements if this keyword came from one
  };
  // Deprecating frequency and sourceContextIds in favor of more detailed sources and timestamps
  // frequency: number; 
  // sourceContextIds: Set<string>; 
}
export type DynamicContextMemory = Map<string, DynamicContextItem>;

// Added in dynamicContextManager.ts, needs to be in types.ts and exported
export interface MetaIntentAnalysis {
    metaIntentDescription: string | null;
    confidence: number;
    contributingKeywords: string[];
    sourceContextIds: string[];
}

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

// Types for Native Hook communication (v2.8+)
export interface MacOSActiveApplicationInfo {
  application_name: string;
  window_title: string;
  bundle_id: string;
  pid?: number;
  error_message?: string;
}

export interface ScreenCaptureResponsePayload {
  imageData: string;
  format: "png" | "jpeg"; // Or other relevant formats
}

export interface KeystrokePayload {
  text: string;
  pressEnter?: boolean;
  command: string;
}

export interface FocusedInputTextPayload {
  focusedText: string | null;
}

// Payloads for Shell Command Feature
export interface ShellCommandPayload {
  command: string;
}

export interface ShellCommandResponsePayload {
  success: boolean;
  stdout: string | null;
  stderr: string | null;
  error_message?: string; // For errors in the hook itself, not the command
}

// Payloads for File System Monitoring
export interface StartFSMonitoringPayload {
  paths: string[];
  recursive?: boolean;
  alias?: string; // Optional alias for a path or group of paths
}

export interface StopFSMonitoringPayload {
  paths?: string[]; // If empty or undefined, stop all monitoring
}

export interface FileSystemEventPayload {
  event_type: "created" | "deleted" | "modified" | "moved";
  src_path: string;
  dest_path?: string; // For 'moved' events
  is_directory: boolean;
  timestamp: number; // Unix timestamp
}

// Payload for Terminal App Control
export interface TerminalRunInNewTabPayload {
  command: string;
  tab_name?: string;
  activate_terminal?: boolean;
}

export interface QuitApplicationPayload {
  bundle_id: string;
  app_name?: string; // Optional, for more informative messages/logging
}

// Payloads for Hook Context History
export interface AppHistoryEntry {
  item: MacOSActiveApplicationInfo; // Reusing existing type
  timestamp: number;
}
export interface FileEventHistoryEntry {
  item: FileSystemEventPayload; // Reusing existing type
  timestamp: number;
}
export interface CommandHistoryEntry {
  item: {
    command_type: string; // e.g., 'shell_sync', 'applescript_terminal_new_tab'
    command_details: any; // Could be a string or an object with more details
  };
  timestamp: number;
}
export interface HookContextHistoryPayload {
  active_app_history: AppHistoryEntry[];
  file_event_history: FileEventHistoryEntry[];
  hook_executed_command_history: CommandHistoryEntry[];
}

// Generic message structure from the hook, can be expanded
export type HookStatus = 'INITIALIZING' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR' | 'CLOSING';

export interface HookMessage {
  id: string; // Unique message ID, should correlate with sent message if it's a response
  type: string; // e.g., "pong", "active_application_info_response", "error"
  original_command?: string; // The command that triggered this response
  status?: 'success' | 'error'; // Status of the operation for responses
  payload?: any; // Can be more specific based on 'type'
  error_message?: string; // If status is "error"
  received_payload?: any; // Echo back the payload sent by client for context
}

export interface MouseMovePayload {
  x: number;
  y: number;
}

export interface MouseClickPayload {
  x: number;
  y: number;
  button: "left" | "right";
  click_type: "click" | "double_click";
}

export interface MoveMouseResponsePayload {
    x: number;
    y: number;
}

export interface MouseClickResponsePayload {
    x: number;
    y: number;
    button: "left" | "right";
    click_type: "click" | "double_click";
}

// Payloads for new targeted interaction commands
export interface TypeInTargetInputPayload {
  command: "type_in_target_input"; // Command name for type safety if used directly
  text: string;
  target_app_bundle_id?: string; // Optional: for future specific targeting
  // pressEnter?: boolean; // Decided against for this command for now, focus on typing text
}

export interface ClickButtonInTargetPayload {
  command: "click_button_in_target"; // Command name for type safety
  button_identifier: string; // e.g., "Send", "Submit", or an accessibility identifier
  target_app_bundle_id?: string; // Optional
}

// Response payloads for these can be generic success/error messages for now
// Or specific if they return data, e.g. ClickButtonInTargetResponsePayload if it confirms something.

// For AI Action Proposer
export interface AIProposedHookCommand {
  id: string; // Unique ID for this proposed command
  naturalLanguageCommand: string; // The original user input
  command: string; // The specific hook command to execute (e.g., type_in_target_input, execute_shell_command)
  target_app_bundle_id?: string; // Specific bundle ID, if resolved/needed
  params?: any; // Parsed parameters for the command
  confidence?: number; // AI's confidence in this parsing (0.0 to 1.0)
  reasoning?: string; // AI's reasoning for this command proposal
  error?: string; // If parsing failed, this contains the error message
  // Fields like hookPayload and targetApplicationName can be derived or part of params if needed
}

export interface DefaultResponsePayload {
  message?: string;
  details?: any; // For any other details
}
