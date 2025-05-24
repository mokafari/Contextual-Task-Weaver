# Data Structures and Context Management

This document outlines the core data structures defined in `types.ts` and the mechanisms for managing dynamic context and potential main tasks as implemented in `services/dynamicContextManager.ts`.

## Core Data Structures (`types.ts`)

The application relies on a set of well-defined TypeScript types to manage its state and data flow.

### Key Information Units:

*   **`CognitiveParserOutput`**: This is the structured output from the AI after analyzing a screen or camera capture. It forms a fundamental part of the Evolving Knowledge Store (KS).
    *   **Fields:** `id` (UUID), `timestamp`, `captureModeUsed`, `inferredActivity`, `activeApplication`, `windowTitle`, `keyTexts` (array of `KeyText`), `uiElements` (array of `UIElement`), `activeInteractionContext`, `suggestionsFeedback`, `aiCallDurationMs`.
    *   `KeyText`: `{ text: string, role?: string, importance?: number }`
    *   `UIElement`: `{ type: string, label?: string, role?: string, state?: string, importance?: number }`
    *   `ActiveInteractionContext`: `{ userActivityGoal?: string, focusedElement?: UIElement, relevantTextSelection?: string }`

*   **`TaskItem`**: Represents a single task on the Kanban board. This is a central data structure.
    *   **Fields:** `id` (UUID), `description`, `status` (`TaskStatus`), `firstSeenContextId` (links to `CognitiveParserOutput`), `latestContextId` (links to `CognitiveParserOutput`), `firstSeenTimestamp`, `lastUpdatedTimestamp`, `confidence` (AI confidence), `historySnapshots` (array of strings), `userEditsHistory` (array of `UserEdit`), `notes`, `tags`, `keywords`, `priority`, `aiAccuracyFeedback`, `relatedTaskSuggestions`.
    *   `UserEdit`: `{ timestamp, editedField, oldValue?, newValue, editSource ('user_manual' | 'chronographer_ai') }`

### Application State & Configuration:

*   **`AppSettings`**: User-configurable settings like `captureIntervalSeconds`, `maxTaskListSize`, `showDebugInfo`.
*   **`ExternalLLMConfig`**: Configuration for external LLMs used in project planning, including `id`, `name`, `apiUrl`, `apiKey`, and `promptInstruction` (crucial for guiding the external LLM).

### Self-Iterative Learning Loop & Context Types:

*   **`DynamicContextItem`**: An item in the application's working memory.
    *   **Fields:** `keyword`, `weight` (relevance), `lastSeenTimestamp`, `frequency`, `sourceContextIds` (links to `CognitiveParserOutput`).
*   **`DynamicContextMemory`**: Defined as `Map<string, DynamicContextItem>`. This represents the evolving understanding of the current context through weighted keywords.
*   **`PotentialMainTask` (PMT)**: Represents an AI's hypothesis or a user-defined main goal.
    *   **Fields:** `id`, `description`, `source` (`ai_inferred`, `user_confirmed`, `user_created`), `weight` (confidence), `lastReinforcedTimestamp`, `contributingContextIds` (links to `CognitiveParserOutput`).
*   **`UserNudgeInput`**: Structure for user input from the Nudge Modal to confirm a PMT or set a new goal.

### Other Important Types:

*   **`CaptureMode`**: `'screen' | 'camera'`
*   **`TaskStatus`**: `'To-Do' | 'Doing' | 'Done'`
*   **`ExportDataV1`**: Defines the comprehensive structure for data export/import, including tasks, contexts, settings, LLM configs, dynamic memory, PMTs, and aggregated feedback. `Map` types are serialized as arrays of key-value pairs.

## Dynamic Context & Task Management (`services/dynamicContextManager.ts`)

This service is responsible for the core logic behind the application's contextual understanding and learning capabilities. It manages the `DynamicContextMemory` and `PotentialMainTasks`.

### Key Functionalities:

1.  **Keyword Extraction (`extractKeywordsFromContext`)**:
    *   **Input:** `CognitiveParserOutput`.
    *   **Process:** Extracts meaningful keywords by processing text from various fields (`inferredActivity`, `userActivityGoal`, `windowTitle`, `keyTexts`, `uiElements`, etc.).
    *   **Techniques:** Lowercasing, punctuation removal, stop word filtering (uses an extensive predefined list), filtering by word length, filtering numbers. Also includes simple verb/noun extraction from activity descriptions and identification of file names/URLs.
    *   **Output:** An array of unique, filtered keywords.

2.  **Dynamic Context Memory Management (`updateDynamicContextMemory`)**:
    *   **Input:** Current `CognitiveParserOutput`, current `DynamicContextMemory`.
    *   **Process:**
        *   Extracts keywords from the new context using `extractKeywordsFromContext`.
        *   Updates weights of keywords: new keywords get an initial weight, boosted if present in goal/activity/key texts. Existing keywords are reinforced.
        *   Manages `lastSeenTimestamp`, `frequency`, and `sourceContextIds` for each keyword.
        *   Applies time-based decay to keyword weights (using a halflife, e.g., 5 minutes) for items not seen in the current update.
        *   Prunes keywords whose weight falls below a minimum threshold.
    *   **Output:** The updated `DynamicContextMemory` and the list of keywords extracted from the current context.

3.  **Potential Main Task Management (`updatePotentialMainTasks`)**:
    *   **Input:** Current `CognitiveParserOutput` (optional), current `DynamicContextMemory`, current `PotentialMainTask[]`, and optional `UserNudgeInput`.
    *   **Process:**
        *   **Nudge Application:** If a user nudge is provided, it either boosts the weight of a confirmed PMT (and reduces others) or creates a new user-defined PMT with high weight (reducing existing ones).
        *   **AI Inference:** If new context is provided, it forms a candidate PMT description. If this is sufficiently novel compared to existing PMTs, a new 'ai_inferred' PMT is created with an initial weight. If similar to an existing AI-inferred PMT, that PMT is reinforced.
        *   **Decay & Pruning:** Applies time-based decay to PMT weights (halflife e.g., 15 mins), especially for AI-inferred ones not recently reinforced. User-confirmed/created PMTs have slower/conditional decay. PMTs below a minimum weight threshold are pruned (with logic to keep at least one user-defined goal if present).
    *   **Output:** The updated list of `PotentialMainTask` objects, sorted by weight.

4.  **Utility Functions:**
    *   `getHighestWeightedPMTs`: Returns the top N PMTs.
    *   `getHighestWeightedDCMItems`: Returns the top N items from the Dynamic Context Memory.

5.  **Related Task Suggestion (`suggestRelatedTasks`)**:
    *   **Input:** Current task, all tasks, all contexts, dynamic context memory.
    *   **Process:** Extracts keywords for the current task (from its description, notes, associated contexts). For other tasks, it does the same. Calculates Jaccard similarity between keyword sets and also considers overlap with the current `DynamicContextMemory`.
    *   **Output:** A list of suggested related tasks with a confidence score and a generic reason.

### Constants & Configuration:

The service uses several constants to control decay rates, weight thresholds, boost values for keyword relevance, and an extensive list of stop words for keyword extraction. These constants fine-tune the behavior of the context management system.

This manager embodies key aspects of the Phase 2 roadmap items, aiming to create a more adaptive and contextually aware system by maintaining and evolving a working understanding of user activities and goals over time. 