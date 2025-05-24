# Contextual Task Weaver (ETMS Core) - Project Roadmap

This document outlines the potential future development path for the Contextual Task Weaver (ETMS Core) project, aiming to progressively integrate the principles of the Emergent Task Management System (ETMS) framework.

## Guiding Principles (from ETMS Framework & AI Agent Apex Doctrine)

*   **Recursive Processing & Emergent Intelligence:** The system should learn and adapt from each interaction, with the LLM agent at the core of this recursive loop.
*   **Evolving Knowledge Store (KS):** The KS is central, growing richer and more interconnected over time, informing the agent's actions and learning.
*   **Simplicity to Complexity:** Start with core, simple functionalities and build complexity emergently.
*   **Feedback Loops:** Explicit and implicit feedback are crucial for learning and system adaptation.
*   **Proactive Assistance:** The system should eventually anticipate needs and provide relevant information proactively.
*   **Principled Operation:** All AI operations must be guided by foundational ethical and operational principles (e.g., the AI Agent Apex Doctrine - AAD).

## Phase 1: Foundation & Enhanced Task Management (Current - Short Term)

*   **Goal:** Solidify current task capture and Kanban management, improve user interaction, and introduce basic feedback mechanisms.
*   **LLM Agent Evolution & Learning Cycle (Initial):**
    *   The LLM agent (Cognitive Parser, Task Chronographer, Suggestion Generator) primarily parses input, stores structured data in the KS (tasks, contexts), and retrieves information for display.
    *   The recursive loop is basic: `Capture -> Parse (Agent) -> Store in KS -> Update UI`.
    *   Learning is primarily through the accumulation of data in the KS. Simple feedback is logged. AI operations are guided by the AI Agent Apex Doctrine.
*   **Features:**
    *   **[DONE] Core Capture & History (Single Shot):** Capture screen/camera, generate context, store as tasks, display history.
    *   **[DONE] Continuous Capture Mode & Kanban Task Management:**
        *   Implement continuous frame capture from screen or camera at configurable intervals.
        *   Real-time AI analysis of each captured frame using Cognitive Parser.
        *   Task Chronographer updates a Kanban-style board (To-Do, Doing, Done) with evolving tasks.
        *   Live updates to the screen/camera preview.
        *   Contextual AI suggestions based on current activity.
        *   Clear start/stop controls for continuous monitoring.
        *   Graceful handling of individual frame analysis errors.
    *   **[DONE] Advanced Task Attributes:** `TaskItem` structure includes ID, description, status, context IDs, timestamps, confidence, history snapshots.
    *   **[DONE] UI/UX Refinements for Task Management:**
        *   Kanban board for task visualization and status changes.
        *   Detailed view for `TaskCard` showing context history.
    *   **[DONE] Manual Task Editing:** Allow users to rename tasks, edit descriptions, manually change status, or add notes/tags.
    *   **[DONE] Explicit Feedback (Simple):**
        *   Add "Useful" / "Not Useful" buttons or a simple rating (1-5 stars) for the generated `outputContext`, task relevance, or suggestions.
        *   Store this feedback within the `TaskItem` or associated `CognitiveParserOutput` in the KS.
    *   **[DONE] Enhanced Error Handling & Reporting:** Implemented more specific error messages in UI, structured logging, and copy error details.
    *   **[DONE] Configuration Options:**
        *   Settings modal for capture interval, max task list size, debug info toggle.
        *   Configuration for external LLMs for "Plan with AI" feature.
    *   **[DONE] Integration of AI Agent Apex Doctrine (AAD):** Fetched AAD document and prepended its content to all core internal LLM system prompts.

## Phase 2: Knowledge Store Evolution & Initial Learning (Medium Term)

*   **Goal:** Enhance the Knowledge Store capabilities and introduce initial learning mechanisms based on feedback, dynamic context, and task patterns.
*   **LLM Agent Evolution & Learning Cycle (Developing):**
    *   The agent actively builds and utilizes a `DynamicContextMemory` (working memory with weighted keywords/themes) and tracks `PotentialMainTasks` (PMTs) with confidence scores. User nudging refines PMT understanding.
    *   The recursive loop becomes more interactive: `Capture -> Parse (Agent) -> Update DynamicContextMemory & PMTs -> Query KS & DynamicContext -> Store/Update in KS -> Update UI -> Collect Feedback -> Store Feedback in KS & Update DynamicContext/PMTs`.
    *   The agent starts to identify problematic or successful generation patterns by analyzing aggregated feedback associated with `CognitiveParserOutput` characteristics. All reasoning is guided by the AAD.
*   **Features:**
    *   **[DONE - Initial Implementation] Dynamic Context Memory (Working Memory):** System extracts key themes, entities, and keywords from inputs into a weighted, decaying "Dynamic Context Memory." This memory is used to enrich subsequent internal LLM calls. Manages weighted keywords/themes from activity, decays over time.
    *   **[DONE - Initial Implementation] Potential Main Task (PMT) Tracking & User Nudging:** System maintains a list of weighted PMTs. Weights adjusted by context correlation & new inputs. Users can nudge via modal to confirm/set main goal, impacting PMT weights.
    *   **[DONE - Initial Implementation] Keyword/Topic Extraction from `CognitiveParserOutput` & Association with Tasks:** Relevant keywords are extracted from context and stored with `TaskItem`s by the Task Chronographer.
    *   **[DONE - Initial Implementation] Task Search & Filtering (Basic):** Client-side search implemented for tasks based on description, notes, tags, and keywords.
    *   **Knowledge Store (KS) - `allContexts` and `tasks` in LocalStorage:**
        *   Currently uses `localStorage`. Scalability monitored. Periodic cleanup of unreferenced contexts implemented.
        *   Consider IndexedDB for more robust client-side storage if `localStorage` limits are hit, as a precursor to potential backend solutions.
    *   **[DONE - Initial Implementation] Pattern Recognition (Basic) - Similarity Linking:** System now suggests related tasks based on keyword overlap, context similarity, and dynamic context themes. Suggestions are stored with tasks and displayed.
    *   **[DONE - Initial Implementation] Feedback-Driven Context Refinement (Initial Implementation):** Aggregates user feedback on AI task generation/suggestions based on context (e.g., inferred activity, app). Data is stored and viewable in debug for future adaptive prompting.
    *   **[DONE - Initial Implementation] "Meta-Task" Introduction (Simple - System Generated):** System now periodically checks for 'Doing' tasks active for an extended period (e.g., >3 days) and generates a 'System: Review Overdue...' meta-task if no similar active one exists. This task appears on the Kanban board.
    *   **[DONE - Initial Implementation] Export/Import Tasks & Contexts:** Users can now export all key application data (tasks, contexts, dynamic memory, PMTs, aggregated feedback, settings, LLM configs) to a versioned JSON file and import data from such a file, overwriting current data after confirmation.

## Phase 2.5: Deepening Contextual Understanding & User Guidance (Medium Term - Next Steps)

*   **Goal:** Significantly improve the AI's ability to understand user intent by analyzing active text inputs and inferring meta-goals from sequences of actions. Introduce more direct user control over the AI's focus.
*   **LLM Agent Evolution & Learning Cycle (Refining Intent):**
    *   The `CognitiveParser` will be enhanced to specifically identify and prioritize text being actively typed or focused on by the user (e.g., in chat boxes, document editors, search fields). This active text becomes a primary signal for intent.
    *   The `TaskChronographer` and `PotentialMainTask` manager will begin to correlate sequences of `CognitiveParserOutput` and changes in `DynamicContextMemory` over short windows to infer higher-level "meta-intents" or project-related activities.
    *   The "Promptable Current Directive" (see below) will heavily influence all AI reasoning.
*   **Features:**
    *   **[TO DO] Enhanced Text Input Analysis for Intent:**
        *   Modify `CognitiveParser` to better identify and extract text from active input fields (chat boxes, document editors, IDEs, search bars).
        *   Add a field to `CognitiveParserOutput` like `activeUserTextEntry: string | null` to store this.
        *   Update AI prompts to weigh this `activeUserTextEntry` heavily when inferring activity and goals.
    *   **[TO DO] Initial Meta-Intent Stitching (Sequential Context Analysis):**
        *   Develop logic (likely within `dynamicContextManager` or by enhancing `TaskChronographer`'s context) to look for patterns or thematic links in the last N (e.g., 3-5) `CognitiveParserOutput` contexts or significant shifts in `DynamicContextMemory`.
        *   This will help in forming more robust `PotentialMainTask` hypotheses that span multiple micro-actions.
    *   **[TO DO] Promptable Current Directive:**
        *   Implement a UI element (e.g., a dedicated text input field) allowing the user to set an explicit "Current Directive" (e.g., "Focus on writing the project proposal").
        *   This directive will be passed to all core AI services (`CognitiveParser`, `TaskChronographer`, `SuggestionGenerator`).
        *   AI prompts will be updated to instruct the LLMs to heavily prioritize this user-set directive in their analysis, task generation/updating, and suggestion formulation. This directive can temporarily override or strongly bias PMTs.
    *   **[TO DO] UI/UX Refinements for Task Flow & Stability (Iterative):**
        *   Begin exploring UI adjustments based on user feedback regarding Kanban clarity and task volatility.
        *   Review and tune `TaskChronographer` prompts to be more conservative with task renaming/merging unless confidence is high or changes align strongly with the Current Directive or confirmed PMTs.
        *   Consider mechanisms for user review of major AI-suggested task changes.
        *   Research alternative UI paradigms (e.g., activity-centric feed, focus view driven by directive) as part of ongoing UX improvement.

## Phase 3: Emergent Intelligence & Proactive Assistance (Long Term)

*   **Goal:** Enable the system to demonstrate more emergent intelligence by learning from patterns, adapting its behavior, and proactively assisting the user, guided by AAD principles.
*   **LLM Agent Evolution & Learning Cycle (Adaptive):**
    *   The agent actively consults learned "Pattern Nodes" (heuristics, successful/failed patterns from aggregated feedback and KS analysis) to inform its actions, such as adaptive prompting or proactive suggestions. All actions and reasoning are aligned with AAD principles.
    *   The learning cycle becomes more about refining these heuristics: `Input -> Agent Acts (informed by KS/Patterns/AAD) -> System Output -> User Feedback -> Agent Updates KS/Patterns (aligned with AAD)`.
    *   The agent starts to adapt its internal prompting strategies for the Cognitive Parser/Task Chronographer based on aggregated feedback patterns and AAD guidelines.
*   **Features:**
    *   **[TO DO] Adaptive Prompting (Initial):**
        *   Based on accumulated feedback (from `aggregatedFeedback`) and successful task patterns, the system suggests or autonomously makes slight modifications to internal prompts for `TaskChronographer` or `CognitiveParser`, ensuring changes align with AAD.
    *   **[TO DO] Proactive Information Supply:**
        *   When starting/viewing a task, if similar past tasks (especially successful ones or those with rich `CognitiveParserOutput` history) are found in the KS, the agent proactively displays links or summaries.
    *   **[TO DO] Learning Heuristics (Stored as "Pattern Nodes" in KS):**
        *   Formalize learned `SuccessPattern` or `FailurePattern` nodes based on task outcomes and associated contexts. These nodes are derived from the aggregated feedback and KS analysis.
    *   **[TO DO] Contextual Reminders/Follow-ups (Simple):**
        *   If a task description or context implies a date/time, offer to create a simple reminder (internal, or link to system calendar).
    *   **[TO DO] Task Decomposition (Assisted):**
        *   For a complex task (e.g., from "Plan with AI" or a broad `CognitiveParserOutput`), allow users to identify sub-goals. The agent, referencing the KS for similar decomposition patterns if available, helps create linked sub-tasks on the Kanban.
    *   **"Plan with AI" Evolution:** This feature starts to leverage the internal KS and `DynamicContextMemory` more significantly. For instance, when planning, the agent might reference similar past projects or successful task sequences from the KS to inform the suggestions from the external LLM or even generate some initial steps itself.
    *   **Clarifying Emergence & Metrics:**
        *   **Anticipated Emergent Behaviors:** System demonstrates improved task decomposition for familiar task types without new explicit rules, shows increased accuracy in proactive suggestions based on learned contextual cues from the KS, and begins to adapt its internal prompting strategies for Cognitive Parser/Task Chronographer.
        *   **Metrics for Emergence (Tracked Internally):** Ability to handle novel task types with increasing success, improved planning efficiency (e.g., fewer manual edits needed for AI-generated plans), reduced need for explicit user instruction for common workflows, and increasing complexity of problems successfully managed/decomposed.

## Phase 4: Advanced ETMS Features & Sophistication (Very Long Term / Visionary)

*   **Goal:** Fully realize the ETMS vision with advanced planning, automated learning, sophisticated internal reasoning by the LLM agent, and potential for controlled external interactions, all strictly governed by the AAD.
*   **LLM Agent Evolution & Learning Cycle (Autonomous & Self-Improving):**
    *   The agent autonomously uses the rich KS and advanced internal prompting (e.g., CoT/ToT emulation) for complex planning and problem-solving. It orchestrates automated tasks by interacting with the Action Execution Module, performs advanced CoT/ToT-style reasoning for decision-making and planning, and, where delegated and safe, interacts with external systems/LLMs. All its reasoning and actions are fundamentally guided by its comprehensive understanding derived from the KS and the foundational principles appended from the AAD.
    *   The recursive loop involves self-reflection and meta-learning: `Problem -> Agent Formulates Plan (using KS/CoT/AAD Principles) -> Agent Executes/Simulates -> Agent Evaluates Outcome (against KS & AAD Principles) -> Agent Updates KS/Internal Models -> Agent Refines Plan/Heuristics`.
    *   The agent actively pursues `MetaTask`s to improve its own performance, understanding, and alignment with AAD.
*   **Features:**
    *   **[TO DO] Automated Task Decomposition & Planning (Advanced):**
        *   The LLM agent, using its learned heuristics and the KS, attempts to automatically break down high-level user goals (input via text or complex `CognitiveParserOutput`) into a sequence of `TaskItem`s with suggested statuses and dependencies. The 'Plan with AI' feature evolves into a core internal capability. The ETMS agent, deeply leveraging its internal KS and learned heuristics (informed by AAD), will perform most of the planning. External LLMs might be orchestrated as specialized 'consultants' for novel domains or specific sub-problems.
    *   **[TO DO] Autonomous Task Execution (Initial Framework):**
        *   **Goal:** Enable the LLM agent to perform predefined, simple automated actions based on task context, user delegation, or explicit triggers from the KS. This includes the capability for **AI Agent Supervision via UI Emulation**: an advanced form of autonomous action where the Weaver monitors and controls other AI tools (e.g., coding agents, web-based LLMs) using keyboard and mouse emulation.
        *   **Mechanism:** Develop an 'Action Execution Module' with robust UI automation capabilities (e.g., screen reading for state detection, keyboard/mouse control).
            *   For AI Supervision: This module will need to interpret the state of external AI tools (e.g., detect errors, operational limits like "X tries") and execute control actions (e.g., restart, re-prompt).
        *   **KS Role:** Store 'Actionable Patterns', 'Automated Workflow Triggers', and 'Supervision Protocols' for specific external AI tools. The KS would also store the necessary context/prompts for re-initializing supervised agents.
        *   **User Control & AAD:** Strong emphasis on user consent, clear logging of emulated actions, user override capabilities, and strict adherence to AAD (e.g., preventing unauthorized actions, ensuring transparency).
    *   **[TO DO] Advanced Internal Prompting (CoT/ToT Emulation):**
        *   For complex analysis, the system internally queries the KS, analyzes patterns using CoT/ToT-like reasoning, and generates hypotheses or solutions.
    *   **[TO DO] Self-Improving System (Meta-Learning Loops):**
        *   The ETMS actively generates and pursues `MetaTask`s to improve its own performance.
    *   **[TO DO] Dependency Management:** Introduce explicit `dependsOn` relationships between `TaskItem`s.
    *   **[TO DO] Predictive Task Generation:** Based on project goals or recurring workflows learned from the KS, suggest future tasks.
    *   **[TO DO - R&D] External Systems & Agent Interaction (Advanced R&D):**
        *   **Goal:** Research controlled, secure interaction with external systems, tools, and specialized AI agents. This includes both API-level integration and **UI Emulation-based interaction** for tools that don't offer APIs (complementing the Autonomous Task Execution feature).
        *   **Mechanism:**
            *   API-based: Secure API layers, auth protocols, sandboxing.
        *   **Goal:** Research controlled, secure interaction with external systems, tools, and specialized AI agents (e.g., coding agents).
        *   **Mechanism:** Secure API layers, auth protocols, sandboxing.
        *   **Safety & Control:** Robust safety protocols, user permissions, logging, user oversight.
        *   **AAD Guidance:** All interactions must strictly adhere to AAD.

## Cross-Cutting Concerns (Applicable to all phases)

*   **UI/UX Evolution:** Continuously refine for clarity, efficiency, intuitive interaction.
*   **Performance Optimization:** Ensure responsiveness as KS grows. Initial performance metrics for AI calls and core processing loop implemented.
*   **Security & Privacy:** Prioritize user privacy. Transparent data usage. Secure API key management.
*   **Prompt Engineering:** Continuously refine prompts for all AI calls and internal reasoning, integrating AAD and self-iterative learning loop principles.
*   **Strategic LLM Context Window Management:** Research and implement strategies for effective context window use (summarization, prioritization, coherence), especially with AAD integration.
*   **Knowledge Store (KS) Architecture Planning:** Continuously evaluate and plan for potential migration to a robust server-side KS (e.g., graph database) for advanced AI, complex reasoning, automation, and deep longitudinal learning. This will be a key focus for enabling Phase 3 and 4 capabilities.
*   **Architectural Evolution for Advanced Capabilities:**
    *   **Action Execution & Automation Layer:** Dedicated module for automated actions, with error handling, logging, and AAD verification.
    *   **Permissions & Security Framework:** Granular permissions for autonomous actions and external interactions.
    *   **External API Integration & Orchestration Module:** For interacting with external LLMs/tools, handling API calls, data transformation, auth.
    *   **Safety Protocols, Auditing & AAD Alignment Engine:** Rigorous safety checks, sandboxing, audit trails. Potential 'AAD Alignment Engine'.
*   **Testing:** Comprehensive unit, integration, and e2e tests.
*   **Accessibility (A11y):** Adherence to WCAG guidelines.
*   **Ethical Considerations & AAD Adherence:** Regularly review ethical implications. All system design and AI behavior must strive for strict adherence to AAD.

This roadmap provides a flexible guide. Priorities and specific features can be adjusted based on user feedback and development progress.
