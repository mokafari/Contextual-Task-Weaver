
# Contextual Task Weaver - Working Memory & Development Plan

**Sprint Goal: Phase 2 Advanced Features - Iterative Learning, Pattern Recognition, Feedback, Proactive Meta-Tasks, & Data Portability**

Implement a suite of interconnected features to significantly enhance the Contextual Task Weaver's intelligence, contextual understanding, proactive assistance, and data management capabilities. This involves establishing a self-iterative learning loop, basic pattern recognition for task similarity, a system for aggregating user feedback, initial proactive meta-task generation, and data export/import functionality. All AI operations will be guided by the AI Agent Apex Doctrine (AAD).

---

**I. Self-Iterative Learning Loop Foundation (Core Logic)**

1.  **Dynamic Context Memory (DCM)**
    *   **Objective:** Create and maintain a short-term working memory of relevant keywords, themes, and entities extracted from recent user activity and contexts.
    *   **Data Structure (`types.ts` -> `DynamicContextItem`, `DynamicContextMemory`):**
        *   `DynamicContextItem`: { keyword: string, weight: number, lastSeenTimestamp: number, frequency: number, sourceContextIds: Set<string> }
        *   `DynamicContextMemory`: `Map<string, DynamicContextItem>`
    *   **Logic (`services/dynamicContextManager.ts` -> `extractKeywordsFromContext`, `updateDynamicContextMemory`):**
        *   Extract salient keywords/phrases from `CognitiveParserOutput`. Use stop-word filtering and basic NLP.
        *   Update weights in DCM based on recency, frequency, and importance.
        *   Prune low-weight or old items. Store `sourceContextIds`.
        *   Return salient keywords from the *current* parse.
    *   **Integration (`App.tsx`):** Maintain DCM state, persist to `localStorage`. Call `updateDynamicContextMemory` after each `cognitiveParseScreenImage`.

2.  **Potential Main Task (PMT) Tracking**
    *   **Objective:** Hypothesize and track the user's overarching goal(s).
    *   **Data Structure (`types.ts` -> `PotentialMainTask`):**
        *   `PotentialMainTask`: { id: string, description: string, source: 'ai_inferred' | 'user_confirmed' | 'user_created', weight: number (0-1), lastReinforcedTimestamp: number, contributingContextIds?: Set<string> }
    *   **Logic (`services/dynamicContextManager.ts` -> `updatePotentialMainTasks`, `getHighestWeightedPMTs`):**
        *   Manage a list of `PotentialMainTask[]`. Infer new PMTs. Update weights (correlation with DCM, recency). Implement decay & pruning. Store `contributingContextIds`.
    *   **Integration (`App.tsx`):** Maintain PMT list state, persist to `localStorage`. Call `updatePotentialMainTasks` after DCM update.

3.  **User Nudging for Main Task**
    *   **Objective:** Allow users to guide the system's understanding of their main task.
    *   **Data Structure (`types.ts` -> `UserNudgeInput`):**
        *   `UserNudgeInput`: { type: 'confirm_pmt' | 'new_goal', pmtId?: string, goalText?: string }
    *   **UI (`components/NudgeModal.tsx` - New):** Modal to confirm PMTs or set a new goal.
    *   **Logic (`services/dynamicContextManager.ts` -> `updatePotentialMainTasks`):** Process `UserNudgeInput` to boost/create PMTs.
    *   **Integration (`App.tsx`, `components/MonitoringControls.tsx`):** State for `showNudgeModal`. Handler `handleApplyNudge`. Button in `MonitoringControls` opens modal and displays top PMT.

4.  **Integration with AI Services (`services/geminiService.ts`)**
    *   Modify `updateTasksWithChronographer` and `generateContextualSuggestions` to accept and use DCM (summary) and top PMT. Update prompts accordingly. Task Chronographer to use `currentKeywords` for `TaskItem.keywords`.

**II. Pattern Recognition & Feedback**

5.  **Keyword/Topic Extraction & Association with Tasks**
    *   **Data Structure (`types.ts` -> `TaskItem`):** Add `keywords?: string[]`.
    *   **Logic (`services/geminiService.ts` -> `TaskChronographer` prompt):** Chronographer populates `TaskItem.keywords` using `currentKeywords`.
    *   **Integration (`App.tsx`):** `currentKeywords` from DCM update passed to `updateTasksWithChronographer`.

6.  **Task Search & Filtering (Basic)**
    *   **UI (`App.tsx`):** Search input above Kanban.
    *   **Logic (`App.tsx`):** Client-side filtering (description, notes, tags, keywords).

7.  **Pattern Recognition (Basic) - Similarity Linking**
    *   **Data Structure (`types.ts` -> `TaskItem`):** Add `relatedTaskSuggestions?: Array<{ taskId: string; description: string; reason: string; confidence: number; }>`.
    *   **Logic (`services/dynamicContextManager.ts` -> `suggestRelatedTasks`):** Compare tasks (keywords, inferredActivity, DCM themes). Return top N suggestions.
    *   **Integration (`App.tsx`):** Call `suggestRelatedTasks` after task updates/creation. Store suggestions in `TaskItem`.
    *   **UI (`components/TaskCard.tsx`):** Display suggestions.

8.  **Feedback-Driven Context Refinement (Initial Implementation - Aggregation)**
    *   **Data Structures (`types.ts` -> `FeedbackStats`, `AggregatedFeedbackPattern`):** Defined.
    *   **State & Logic (`App.tsx` -> `aggregatedFeedback`, `updateAggregatedFeedback`):**
        *   Maintain `aggregatedFeedback: Map<string, AggregatedFeedbackPattern>` state, persist to `localStorage`.
        *   `updateAggregatedFeedback` (called by `handleRateTaskAccuracy`, `handleRateSuggestions`): Identifies pattern criteria from context, updates/creates entry in `aggregatedFeedback`.
    *   **UI (Debug Display in `App.tsx`):** Show summary.

**III. Proactive System Behavior**

9.  **"Meta-Task" Introduction (Simple - System Generated)**
    *   **Logic (`App.tsx`):** `useEffect` with interval. Scans for 'Doing' tasks older than threshold (e.g., 3 days). Prevents duplicate active meta-tasks. If conditions met, creates new `TaskItem` ("System: Review Overdue 'Doing' Tasks (X items)").
    *   **UI Impact:** Appears as a standard task.

**IV. Data Portability**

10. **Export/Import Tasks & Contexts**
    *   **Data Structure (`types.ts` -> `ExportDataV1`):** Versioned structure for `tasks`, `allContexts` (Map as array), `settings`, `externalLLMConfigs`, `dynamicContextMemory` (Map as array), `potentialMainTasks`, `aggregatedFeedback` (Map as array).
    *   **Logic (`App.tsx` -> `handleExportData`, `handleImportData`):**
        *   Export: Gather states, serialize, trigger download (`contextual_weaver_backup_YYYYMMDD_HHMMSS.json`).
        *   Import: Read file, validate version ("1.0.0"), confirm overwrite, replace states (rehydrate Maps).
    *   **UI (`components/SettingsModal.tsx`):** Add "Export All Data" and "Import Data" buttons.
    *   **Error Handling:** Robust error handling for file operations and validation.

**V. Foundational Principles & Performance**

11. **AI Agent Apex Doctrine (AAD) Integration:**
    *   `apexDoctrineContent` fetched and prepended to all core AI prompts in `geminiService.ts` using `<apex_doctrine>` tag. Prompts instruct AI agents to operate according to AAD and self-iterative loop.

12. **Performance Metrics & Debugging:**
    *   `types.ts`: `PerformanceMetrics` interface. `CognitiveParserOutput` includes `aiCallDurationMs`.
    *   `geminiService.ts`: AI functions measure and return call duration.
    *   `App.tsx`: Maintain `performanceMetrics` state (session-only). Log and display metrics in debug info section.

**Persistence:**
*   All key states will be persisted to `localStorage`. Maps correctly serialized/deserialized.

**Roadmap Update:**
*   Mark all implemented Phase 2 features as "[DONE - Initial Implementation]" with appropriate notes.

---
