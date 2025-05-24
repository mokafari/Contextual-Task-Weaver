# Contextual Task Weaver (ETMS Core)

**Version:** 1.0 (Post-Merge)

## Overview

Contextual Task Weaver is an AI-powered Emergent Task Management System (ETMS) designed to seamlessly integrate contextual understanding from your screen or camera activity into an evolving Kanban-style task board. The system aims to embody principles of emergent intelligence. This is envisioned to develop through continuous learning from user interactions and explicit feedback, guided by an Evolving Knowledge Store that enriches the LLM agent's contextual understanding. The system aims to transition from reactive task management to offering increasingly sophisticated proactive and automated assistance. It learns from your interactions, offers proactive assistance through contextual suggestions, and helps you plan projects using external Large Language Models (LLMs). This application is built with React, TypeScript, TailwindCSS, and leverages the Google Gemini API for its core AI capabilities.

## Core Features

*   **Contextual Capture (Screen & Camera):**
    *   Monitor your screen or use your camera as input.
    *   Selectable capture modes (Screen/Camera).
    *   Periodic, configurable capture intervals or manual capture on demand.
    *   Visual preview of the latest capture.

*   **AI-Powered Analysis & Task Evolution:**
    *   **Cognitive Parser (Gemini):** Analyzes captured images to infer current activity, active application, window titles, key texts, and UI elements.
    *   **Task Chronographer (Gemini):** Updates a Kanban board (To-Do, Doing, Done) by:
        *   Identifying new tasks from the parsed context.
        *   Updating existing tasks based on ongoing activity.
        *   Marking tasks as complete.
    *   **Contextual Suggestions (Gemini):** Provides actionable suggestions based on your inferred activity and goals (e.g., next steps, related searches).
    *   **Enhanced LLM Orchestration (Future Vision):** Architectural planning for potentially leveraging diverse, specialized LLMs for various internal cognitive tasks as the system's complexity and capabilities expand, allowing for more nuanced analysis and decision-making.

*   **Kanban Task Management:**
    *   Tasks are organized into "To-Do," "Doing," and "Done" columns.
    *   Task cards display descriptions, status, timestamps, confidence scores, and activity history.
    *   Expandable task cards show detailed context information from when the task was first seen and last updated.

*   **Project Planning with External LLMs:**
    *   Describe a project goal.
    *   Select a configured external LLM (e.g., OpenAI, other Gemini instances, custom endpoints).
    *   The system sends your goal and a prompt instruction to the LLM to generate a list of tasks, which are then added to your "To-Do" column.

*   **Settings and Configuration:**
    *   **App Settings:** Adjust capture interval and maximum task list size.
    *   **External LLM Connectors:** Add, edit, or delete configurations for external LLMs, including API endpoint, API key, and a custom prompt instruction for task generation.

*   **Local Storage Persistence:**
    *   Tasks, detailed context history (`allContexts`), application settings, and LLM configurations are saved in your browser's local storage, so your data persists across sessions.

## Tech Stack

*   **Frontend:** React 19 (using `react@^19.1.0` via esm.sh)
*   **Language:** TypeScript
*   **Styling:** TailwindCSS
*   **AI:** Google Gemini API (`@google/genai`)
*   **State Management:** React Hooks (`useState`, `useEffect`, `useCallback`, `useRef`)
*   **Utilities:** `uuid` for generating unique IDs.

## Setup and Running

1.  **API Key:**
    *   This application requires a Google Gemini API key.
    *   The API key **must** be provided as an environment variable named `API_KEY`.
    *   **Important:** `process.env.API_KEY` is accessed directly in the code (`services/geminiService.ts`). Ensure this environment variable is correctly set up in the environment where you serve or build the application. The application **will not** prompt you for an API key.

2.  **Dependencies:**
    *   Dependencies are managed via an `importmap` in `index.html`, fetching them from `esm.sh`. No explicit `npm install` or `package.json` is used in this setup.

3.  **Running the Application:**
    *   Serve the `index.html` file using a simple HTTP server. For example, using Node.js `http-server`:
        ```bash
        npx http-server .
        ```
    *   Open the provided URL in a modern web browser that supports ES modules, screen capture, and camera access.

## Key Files and Folder Structure

*   `index.html`: Main entry point, loads TailwindCSS, defines importmap, and mounts the React app.
*   `index.tsx`: Initializes and renders the main `App` component.
*   `styles.css`: Global styles, TailwindCSS imports, and custom scrollbar styles.
*   `App.tsx`: The core application component, managing state, logic, and orchestrating UI components.
*   `roadmap.md`: Outlines the future development path and vision for the project.
*   `metadata.json`: Contains application metadata, including permissions for camera and display capture.
*   **`components/`**: Contains all React UI components:
    *   `MonitoringControls.tsx`: Buttons and controls for starting/stopping monitoring, manual capture, settings, capture mode selection.
    *   `TaskColumn.tsx`: Represents a column (To-Do, Doing, Done) in the Kanban board.
    *   `TaskCard.tsx`: Displays individual task details.
    *   `SettingsModal.tsx`: Modal for configuring app settings and external LLM connectors.
    *   `PlanProjectModal.tsx`: Modal for generating tasks from a goal using an external LLM.
    *   `ContextualSuggestionsDisplay.tsx`: Shows AI-generated suggestions.
    *   `ScreenPreview.tsx`: Displays the latest captured screen/camera image.
    *   `LoadingSpinner.tsx`, `ErrorMessage.tsx`: Utility UI components.
*   **`services/`**:
    *   `geminiService.ts`: Handles all interactions with the Google Gemini API (Cognitive Parser, Task Chronographer, Contextual Suggestions).
    *   `logger.ts`: Basic structured logging utility.
    *   `documentFetcher.ts`: Utility for fetching external documents like Harmonia Digitalis.
*   **`types/`**:
    *   `types.ts`: Defines all TypeScript types and interfaces used throughout the application.

## Important Considerations

*   **API Quotas & Billing:** Frequent use, especially with short capture intervals, can lead to hitting Gemini API rate limits or incurring costs. Monitor your usage and ensure your billing is set up correctly with Google Cloud. The application handles `429 RESOURCE_EXHAUSTED` errors by displaying a message.
*   **Privacy:** Be mindful of the information visible on your screen or captured by your camera when monitoring is active. The application processes this data to provide its features. API keys for external LLMs are stored in local storage for development convenience; for production, consider a backend proxy.
*   **Browser Permissions:** You will need to grant permissions for screen capture and/or camera access when prompted by your browser.

## Future Development

The long-term vision for Contextual Task Weaver extends significantly beyond current capabilities, aiming for a highly intelligent and autonomous task management partner. Future development, as detailed in the `roadmap.md`, will focus on:

*   **Advanced Autonomous Task Capabilities:** Progressing towards enabling the system to autonomously execute certain delegated tasks based on learned patterns and contextual triggers from its Evolving Knowledge Store.
*   **Sophisticated Proactive Assistance:** Moving beyond simple suggestions to offer deeply contextualized, predictive support and information based on a rich understanding of user workflows and goals.
*   **Complex System Integrations & Agent Interaction (Research & Development):** Exploring controlled and secure interactions with external tools, APIs, and specialized AI agents (e.g., coding assistants, research tools). This R&D area will prioritize robust safety protocols, user permissions, and auditable interactions.
*   **Deep Knowledge Store Evolution:** Transitioning towards a more powerful backend Knowledge Store (e.g., graph database) to support advanced reasoning, longitudinal learning, and complex pattern analysis necessary for true emergent intelligence.
*   **Principled AI Operation:** Ensuring all AI operations are guided by foundational ethical and operational principles, such as those outlined in the "Harmonia Digitalis Document," which will be integrated into the core reasoning processes of its LLM agents.

Refer to the `roadmap.md` file for a more granular, phased outline of planned features.
