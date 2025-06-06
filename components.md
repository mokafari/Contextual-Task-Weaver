# Project Components Documentation

This document provides an overview of the React components used in the Contextual Task Weaver application.

## Core UI Components

### 1. `MonitoringControls.tsx`

*   **Purpose:** Provides the main user interface for controlling the application's monitoring and capture features. It includes buttons for starting/stopping monitoring, manual capture, opening settings, planning projects, and nudging the AI. It also displays the current status message.
*   **How it Works:**
    *   Renders buttons and radio inputs for capture mode selection (Screen/Camera).
    *   Button appearance and disabled states change based on application state (`isMonitoring`, `isProcessing`, etc.).
    *   Displays a `LoadingSpinner` during processing.
    *   Status message updates to reflect current actions and shows capture interval.
*   **Key Props:**
    *   `isMonitoring: boolean`: True if continuous monitoring is active.
    *   `isProcessing: boolean`: True if a general background AI process is running.
    *   `isStarting: boolean`: True if monitoring is starting up.
    *   `isCapturingFrame: boolean`: True when a frame is being captured.
    *   `onStart: () => void`: Callback to start monitoring.
    *   `onStop: () => void`: Callback to stop monitoring.
    *   `onManualCapture: () => void`: Callback for manual capture.
    *   `onOpenSettings: () => void`: Callback to open settings modal.
    *   `onOpenPlanProjectModal: () => void`: Callback to open project planning modal.
    *   `statusMessage: string`: Message to display.
    *   `captureInterval: number`: Current capture interval.
    *   `currentCaptureMode: CaptureMode`: Selected capture mode.
    *   `onSetCaptureMode: (mode: CaptureMode) => void`: Callback to change capture mode.
    *   `disabledAllControls?: boolean`: If true, most controls are disabled.
    *   `onOpenNudgeModal: () => void`: Callback to open AI Nudge modal.
*   **LLM Prompts Involved:** None directly. Invokes callbacks in `App.tsx` which trigger LLM interactions.

### 2. `ContextualSuggestionsDisplay.tsx`

*   **Purpose:** Displays AI-generated contextual suggestions to the user. Allows users to provide feedback (useful/not useful) on the set of suggestions.
*   **How it Works:**
    *   Shows a loading state if `isLoading` is true.
    *   Renders nothing if no suggestions or `contextTitle`.
    *   Displays a list of suggestions; clicking a suggestion copies it to the clipboard.
    *   Feedback buttons (👍/👎) invoke `onRateSuggestions` callback.
*   **Key Props:**
    *   `suggestions: string[]`: Array of suggestion strings.
    *   `contextTitle: string | null`: Title for the suggestions block.
    *   `isLoading: boolean`: True if suggestions are being generated.
    *   `contextIdForFeedback: string | null`: ID of the context for feedback.
    *   `onRateSuggestions: (contextId: string, rating: 'useful' | 'not_useful') => void`: Callback to submit feedback.
    *   `currentFeedback?: 'useful' | 'not_useful' | 'neutral'`: Current feedback state for styling.
*   **LLM Prompts Involved:** None directly. Displays suggestions generated by `services/geminiService.ts`.

### 3. `ErrorMessage.tsx`

*   **Purpose:** Reusable component to display error messages consistently, providing context-specific hints and a way to copy error details.
*   **How it Works:**
    *   Renders nothing if `message` is null.
    *   Displays error `title` and `message`.
    *   Provides `userGuidance` based on keywords in the error message.
    *   "Copy Details" button copies error information to clipboard.
*   **Key Props:**
    *   `message: string | null`: Error message to display.
    *   `className?: string`: Optional additional CSS classes.
    *   `title?: string`: Optional error title (defaults to "Error").
    *   `detailsToCopy?: string | object`: Detailed error info for copying.
*   **LLM Prompts Involved:** None.

### 4. `LoadingSpinner.tsx`

*   **Purpose:** Simple, reusable SVG-based loading spinner animation.
*   **How it Works:** SVG image with CSS animations (`animate-spin`) for a spinning effect.
*   **Key Props:**
    *   `size?: 'sm' | 'md' | 'lg'`: Size of the spinner.
    *   `color?: string`: Tailwind CSS color class for the spinner.
    *   `className?: string`: Additional CSS classes.
*   **LLM Prompts Involved:** None.

### 5. `NudgeModal.tsx`

*   **Purpose:** Allows the user to "nudge" the AI by confirming an AI's hypothesized main task or by setting a new main goal.
*   **How it Works:**
    *   Modal dialog.
    *   Lists `potentialMainTasks`; clicking "Confirm This" calls `onApplyNudge`.
    *   Textarea for user to set a new main goal; submitting calls `onApplyNudge`.
*   **Key Props:**
    *   `isOpen: boolean`: Controls modal visibility.
    *   `onClose: () => void`: Callback to close the modal.
    *   `potentialMainTasks: PotentialMainTask[]`: Array of AI-inferred potential main tasks.
    *   `onApplyNudge: (nudge: UserNudgeInput) => void`: Callback to send user's nudge to `App.tsx`.
*   **LLM Prompts Involved:** None directly. User input influences `potentialMainTasks` state in `App.tsx`, which then guides LLM prompts in `services/geminiService.ts`.

### 6. `PlanProjectModal.tsx`

*   **Purpose:** Allows users to describe a project goal and select a pre-configured external LLM to generate tasks for that goal.
*   **How it Works:**
    *   Modal dialog.
    *   User enters project goal and selects an LLM connector.
    *   On submission, calls `onSubmit` prop with goal and LLM config ID.
    *   Displays loading state and error messages.
*   **Key Props:**
    *   `isOpen: boolean`: Controls modal visibility.
    *   `onClose: () => void`: Callback to close modal.
    *   `onSubmit: (goal: string, llmConfigId: string) => Promise<void>`: Callback to handle communication with external LLM.
    *   `llmConfigs: ExternalLLMConfig[]`: Array of external LLM configurations.
    *   `isProcessing: boolean`: True if request is processing.
    *   `error: string | null`: Error message from planning attempt.
*   **LLM Prompts Involved:** Indirectly. The selected `ExternalLLMConfig` contains a `customPromptInstruction` used by `App.tsx` for the external LLM call.

### 7. `ScreenPreview.tsx`

*   **Purpose:** Displays the latest image captured from the screen or camera.
*   **How it Works:**
    *   Shows placeholder if `imageDataUrl` is null.
    *   Otherwise, displays an `<img>` tag with the `imageDataUrl`.
*   **Key Props:**
    *   `imageDataUrl: string | null`: Base64 data URL of the image.
*   **LLM Prompts Involved:** None.

### 8. `SettingsModal.tsx`

*   **Purpose:** Comprehensive interface for managing application settings (capture interval, max tasks), debug info display, External LLM configurations, and data export/import.
*   **How it Works:**
    *   Modal dialog.
    *   Manages app settings, LLM connectors (add, edit, delete via `LLMConfigInput` sub-component), and data operations.
    *   "Save All & Close" consolidates saving settings.
*   **Key Props:**
    *   `currentSettings: AppSettings`: Current application settings.
    *   `externalLLMConfigs: ExternalLLMConfig[]`: Current LLM configurations.
    *   `onSaveAppSettings`: Callback to save app settings.
    *   `onSaveLLMConfigs`: Callback to save LLM configurations.
    *   `onClose`: Callback to close modal.
    *   `onToggleShowDebugInfo`: Callback to toggle debug info.
    *   `onExportData`: Callback for data export.
    *   `onImportData`: Callback for data import.
*   **LLM Prompts Involved:** Indirectly via the `promptInstruction` field for `ExternalLLMConfig`, allowing user definition of part of the system prompt for the "Plan with AI" feature.

### 9. `TaskCard.tsx`

*   **Purpose:** Represents a single task on the Kanban board. Displays task info, allows inline editing, status changes, tag management, shows contextual details when expanded, and allows rating task relevance.
*   **How it Works:**
    *   Displays task `description` (editable), `status` (editable when details expanded), `lastUpdatedTimestamp`, optional `priority` and `confidence`.
    *   "More..." / "Less" button toggles display of details including `firstSeenContext` and `latestContext` (via `ContextDetailsDisplay` sub-component), `historySnapshots`, notes editing, tag management, and feedback buttons.
*   **Key Props:**
    *   `task: TaskItem`: Task object to display/edit.
    *   `allContexts: Map<string, CognitiveParserOutput>`: Map of all captured contexts.
    *   `onUpdateTask: (taskId: string, updates: Partial<TaskItem>, editLog?: UserEdit) => void`: Callback to update task.
    *   `onRateTaskAccuracy: (taskId: string, rating: 'relevant' | 'irrelevant') => void`: Callback for task relevance feedback.
*   **LLM Prompts Involved:** None directly. Displays data derived from LLM outputs and user edits which can feed back into future LLM prompts.

### 10. `TaskColumn.tsx`

*   **Purpose:** Represents a single column in the Kanban board (e.g., "To-Do", "Doing", "Done"). Displays a list of tasks for that status.
*   **How it Works:**
    *   Takes `title` and array of `tasks`.
    *   Renders title with task count.
    *   Maps over `tasks` (sorted by `lastUpdatedTimestamp` descending) and renders a `TaskCard` for each.
    *   Fixed height with vertical scrolling.
*   **Key Props:**
    *   `title: string`: Column title.
    *   `tasks: TaskItem[]`: Array of task objects for this column.
    *   `allContexts: Map<string, CognitiveParserOutput>`: Passed to `TaskCard`.
    *   `onUpdateTask`: Passed to `TaskCard`.
    *   `onRateTaskAccuracy`: Passed to `TaskCard`.
*   **LLM Prompts Involved:** None directly. Container for `TaskCard` components.

## Placeholder/Empty Components

The following components were found but appear to be placeholders or empty stubs with minimal content (1KB, 1 line). They are not detailed further:

*   `CaptureButton.tsx`
*   `ContextDisplay.tsx`
*   `TaskHistory.tsx`
*   `TaskItem.tsx` 