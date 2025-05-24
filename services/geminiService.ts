import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import type { TaskItem, CognitiveParserOutput, ActiveInteractionContext, UserEdit, CaptureMode, DynamicContextMemory, PotentialMainTask, MetaIntentAnalysis } from '../types';
import { logger } from './logger';

const API_KEY = import.meta.env.VITE_API_KEY;
const COMPONENT_NAME = "GeminiService";

if (!API_KEY) {
  logger.error(COMPONENT_NAME, "Initialization", "API_KEY is not configured. Please ensure the API_KEY environment variable is set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });
const TEXT_MODEL_NAME = 'gemini-2.5-flash-preview-04-17';

const COGNITIVE_PARSER_PROMPT_TEMPLATE = (captureMode: CaptureMode, currentDirective: string | null) => `
CRITICAL INSTRUCTION: Your entire response MUST BE a single, valid JSON object. Adhere EXACTLY to the schema defined below.
Do NOT include any explanations, comments, or any text outside of this JSON object.
All property names (keys) in the JSON MUST be enclosed in double quotes.
String values within the JSON must be properly escaped if they contain special characters (e.g., newlines, quotes).
Ensure that NO non-JSON characters, words, or commentary are inserted *between* valid JSON elements, keys, values, or *within* arrays and objects. The JSON structure must be pure and uninterrupted internally.

Analyze this ${captureMode} capture thoroughly. Your goal is to understand the user's current activity and the context.
Pay special attention to any text the user might be actively typing or editing, such as in a focused input field, a chat message being composed, a search query, or content within a document editor. This active text is a strong indicator of current intent.
${currentDirective ? `\\nIMPORTANT: The user has set a CURRENT DIRECTIVE: "${currentDirective}". This directive should be your PRIMARY LENS for interpreting the scene. Ensure your inferred activity, user activity goal, and all other interpretations strongly align with or directly reflect this directive.` : ''}

Respond in JSON format with the following structure:
{
  "id": "string (generate a new UUID for this parse event)",
  "timestamp": "number (current epoch milliseconds)",
  "captureModeUsed": "${captureMode}",
  "inferredActivity": "string (e.g., 'Editing a document named 'Project Proposal.docx'', 'Debugging Python code in script.py', 'Browsing LinkedIn feed', 'Watching a YouTube video titled 'Learn React'') - this should be a descriptive sentence of user's action. Prioritize information from 'activeUserTextEntry' if available AND the CURRENT DIRECTIVE (if provided) when forming this activity.",
  "activeApplication": "string (e.g., 'Microsoft Word', 'VSCode', 'Google Chrome', 'YouTube App') or null if not determinable",
  "windowTitle": "string (full window title if available/applicable) or null",
  "keyTexts": [ 
    { 
      "text": "string (verbatim extracted text snippet, like a header or button label. Ensure this is ONLY the text string and valid JSON string content.)", 
      "role": "string (e.g., 'header', 'button_label', 'paragraph_snippet', 'code_comment')", 
      "importance": "number (0-1, estimate)" 
    } 
  ],
  "uiElements": [ 
    { 
      "type": "string (e.g., 'button', 'input_field', 'link', 'image_thumbnail')", 
      "label": "string (text on button, placeholder in input, alt text. Ensure this is ONLY the label string and valid JSON string content.)", 
      "role": "string (aria-role if inferable)", 
      "state": "string (e.g., 'active', 'disabled', 'checked')", 
      "importance": "number (0-1, estimate)" 
    } 
  ],
  "activeUserTextEntry": "string or null (Extract any text the user is actively typing or editing, e.g., in a focused input field, chat box, document editor, or search bar. This is a high-priority field for understanding intent.)",
  "activeInteractionContext": { 
    "userActivityGoal": "string (infer a specific short-term goal, e.g., 'Replying to an email from Jane Doe', 'Searching for 'best pizza near me'', 'Writing a function to calculate fibonacci') or null. Strongly consider 'activeUserTextEntry' AND the CURRENT DIRECTIVE (if provided) for this inference.",
    "focusedElement": { 
      "type": "string (type of the focused UI element)", 
      "label": "string (label of the focused UI element)" 
    },
    "relevantTextSelection": "string or null (any text currently selected by the user)"
  }
}
Extract up to 5 most important key texts and 5 most salient UI elements.
The "keyTexts.text" and "uiElements.label" fields should contain only the actual string content observed. Do NOT insert any other kind of data or code into these string fields.
If specific details like windowTitle or activeApplication are not clearly determinable from the ${captureMode} image, set their respective JSON values to null.
The 'inferredActivity' should be a concise sentence describing what the user is doing.
The 'userActivityGoal' in 'activeInteractionContext' should be more specific about the immediate objective if inferable.
If active text input by the user is identified, the 'activeUserTextEntry' field should contain this text. Otherwise, it should be null.
${currentDirective ? `\\nREMEMBER THE CURRENT DIRECTIVE: "${currentDirective}". All interpretations must align with it.` : ''}
Generate a new UUID for the 'id' field for each call. Use the current epoch milliseconds for 'timestamp'.
FINAL REMINDER: Your entire response MUST BE ONLY the JSON object specified above. No extra text. Ensure all JSON syntax is correct, especially for strings, commas, and brackets/braces.
`;

export async function cognitiveParseScreenImage(
  base64ImageData: string,
  apexDoctrineContent: string | null,
  captureMode: CaptureMode = 'screen',
  currentDirective: string | null = null
): Promise<CognitiveParserOutput> {
  if (!API_KEY) {
    logger.error(COMPONENT_NAME, "cognitiveParseScreenImage", "Gemini API Key is not configured.");
    throw new Error("Gemini API Key is not configured.");
  }
  const startTime = Date.now();
  const imagePart = { inlineData: { mimeType: 'image/png', data: base64ImageData } };
  let systemPrompt = COGNITIVE_PARSER_PROMPT_TEMPLATE(captureMode, currentDirective);
  
  if (apexDoctrineContent) {
    systemPrompt = `<apex_doctrine source="AI Agent Apex Doctrine (AAD) - v5.0">\\n${apexDoctrineContent}\\n</apex_doctrine>\\n\\n${systemPrompt}\\nCRITICAL REMINDER: Your analysis, interpretations, and generated JSON output MUST strictly adhere to and align with the principles outlined in the <apex_doctrine> section above.`;
  }
  
  const textPart = { text: "Describe the provided image according to the JSON schema in the system instructions. Output only the JSON object." };
  let jsonStr = ""; 

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: TEXT_MODEL_NAME,
      contents: { parts: [imagePart, textPart] },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        // Add thinkingConfig: { thinkingBudget: 0 } if low latency is paramount and quality can be slightly traded
      }
    });

    jsonStr = response.text ? response.text.trim() : "";
    const fenceRegex = /^```(?:json)?\\s*\\n?(.*?)\\n?\\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[1]) {
      jsonStr = match[1].trim();
    }
    
    const parsedOutput = JSON.parse(jsonStr) as Partial<CognitiveParserOutput>;
    const durationMs = Date.now() - startTime;

    if (!parsedOutput.id) parsedOutput.id = uuidv4();
    if (!parsedOutput.timestamp) parsedOutput.timestamp = Date.now();
    parsedOutput.captureModeUsed = captureMode;
    if (!parsedOutput.inferredActivity) parsedOutput.inferredActivity = "Activity could not be determined";
    if (!parsedOutput.keyTexts) parsedOutput.keyTexts = [];
    if (!parsedOutput.uiElements) parsedOutput.uiElements = [];
    parsedOutput.aiCallDurationMs = durationMs;
    
    logger.debug(COMPONENT_NAME, "cognitiveParseScreenImage", `Successfully parsed screen image in ${durationMs}ms.`, {id: parsedOutput.id, activity: parsedOutput.inferredActivity, directiveUsed: currentDirective});
    return parsedOutput as CognitiveParserOutput;

  } catch (error: any) {
    const problematicJsonSnippet = jsonStr ? jsonStr.substring(0, 500) : "N/A (jsonStr not populated before error or empty)";
    logger.error(COMPONENT_NAME, "cognitiveParseScreenImage", `Error parsing screen image with Gemini. Problematic JSON string (first 500 chars): '${problematicJsonSnippet}'`, error);
    
    let errorMessage = "Failed to parse screen context with AI.";
    if (error.message) errorMessage += ` Details: ${error.message}`;
    if (error.toString().includes("quota") || error.toString().includes("rate limit") || error.toString().includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "AI request failed (Cognitive Parser) due to rate limits or quota. Please try again later.";
    } else if (error.message && (error.message.toLowerCase().includes("json") || error.message.toLowerCase().includes("unexpected token") || error.message.toLowerCase().includes("property name"))) {
        errorMessage = "AI (Cognitive Parser) produced invalid JSON output. Retrying might help.";
    }
    throw new Error(errorMessage);
  }
}

const TASK_CHRONOGRAPHER_PROMPT_TEMPLATE = (
    dynamicContextSummary: string, 
    mainTaskHypothesisText: string, 
    metaIntentDescription?: string | null, 
    metaIntentConfidence?: number | null,
    currentDirective?: string | null
) => `
You are a Task Chronographer. Your role is to analyze the current Cognitive Screen Parser output, the user's dynamic context, their main task hypothesis, any identified meta-intent, and any active user-set directive to update a list of ongoing tasks.
Adhere to the self-iterative learning loop principles: use the evolving dynamic context, main task hypothesis, meta-intent, and current directive to guide your decisions, aiming for emergent understanding.

Current User State:
Dynamic Context (Top Keywords/Themes): ${dynamicContextSummary || 'Not available.'}
Main Task Hypothesis: ${mainTaskHypothesisText || 'Not yet determined.'}
Meta-Intent (from recent activity sequence): ${metaIntentDescription && metaIntentConfidence ? `${metaIntentDescription} (Confidence: ${metaIntentConfidence.toFixed(2)})` : 'Not available or not confident.'}
${currentDirective ? `Current User Directive: "${currentDirective}"` : ''}

Current Cognitive Context from screen/camera:
{ /* JSON details of current context (inferredActivity, activeApplication, windowTitle, keyTexts, uiElements, activeInteractionContext) will be inserted here by the system */ }

Current Context Keywords (to be associated with new/updated tasks if relevant):
[ /* Array of strings: current relevant keywords will be inserted here by the system */ ]

Existing tasks list (summary):
[
  { "id": "...", "description": "...", "status": "To-Do" | "Doing" | "Done", "keywords": ["keyword1", "keyword2"], "userEditsHistory": [{ "timestamp": ..., "editedField": "...", "editSource": "user_manual" | "chronographer_ai" ... }], "historySnapshots": ["...", "..."] },
  ...
]

Based on ALL the above information (Apex Doctrine, User State including Current Directive, Cognitive Context, Current Keywords, Existing Tasks):
1. Task Identification & Updates:
   - If a Current User Directive is active, all task identifications and updates should be STRONGLY BIASED towards fulfilling or aligning with this directive.
   - If the current activity directly relates to an existing task, update its 'latestContextId', 'lastUpdatedTimestamp'. Add a brief, distinct note to 'historySnapshots' describing the change or progress observed in the current context. Ensure this aligns with the Current User Directive if one is set.
   - If the 'Current Context Keywords' are relevant and not already present, append them to the task's 'keywords' field (ensure unique, max 10 total keywords per task).
   - If a task was recently manually edited by the user (check 'userEditsHistory' for 'editSource: "user_manual"' entries, especially the latest one), PRIORITIZE these user changes for 'description' or 'status'. Do NOT revert them unless new context unequivocally signals task completion or a fundamental shift strongly aligned with the Main Task Hypothesis AND the Current User Directive.
   - If the current activity seems to start an existing 'To-Do' task (and it wasn't manually set to 'To-Do' recently), change its status to 'Doing'. Consider the Main Task Hypothesis and Current User Directive for relevance.
2. Task Completion: If a 'Doing' task appears completed based on the current activity and strongly aligns with the Main Task Hypothesis AND the Current User Directive (if set), change its status to 'Done'. Be conservative; prefer keeping tasks 'Doing' if completion isn't crystal clear.
3. New Task Creation: If the current activity represents a new, distinct initiative:
   - If a Current User Directive is active, any new task MUST directly contribute to or align with this directive. The directive should heavily influence the new task's description.
   - STRONGLY CONSIDER the Meta-Intent. If a high-confidence Meta-Intent is present and aligns with the current activity (and the Current User Directive, if set), use its description as a basis for the new task, or ensure the new task clearly contributes to it.
   - If no strong Meta-Intent, or it doesn't align, then consider if the activity is relevant to the Main Task Hypothesis (or if no strong PMT, is a clear new activity of significance).
   - Generate a concise, actionable 'description' (max 15-20 words), heavily influenced by the Current User Directive if present.
   - Set status to 'Doing' (if activity is ongoing) or 'To-Do' (if it seems like a plan for immediate future action).
   - Set 'confidence' (e.g., 0.7-0.9 based on clarity of intent, potentially higher if strongly aligned with a directive).
   - Initialize 'historySnapshots' with a brief creation note (e.g., "Task identified from context: [brief context activity]").
   - Populate the 'keywords' field with the provided 'Current Context Keywords'.
4. Avoid duplicate tasks. If unsure, try to relate to the closest existing task or update an existing one if the new activity is a direct continuation or refinement.
5. Maintain timestamps. For new tasks, 'firstSeenTimestamp' and 'lastUpdatedTimestamp' are current. For updates, only 'lastUpdatedTimestamp' changes.
6. 'historySnapshots' should be brief entries reflecting key context changes or task milestones, keeping the array concise (max 3-5 total, newest entries).
7. Add 'userEditsHistory' with 'editSource: "chronographer_ai"' for significant AI-driven changes to description or status.
${currentDirective ? `\\nREMEMBER THE CURRENT USER DIRECTIVE: "${currentDirective}". All task changes must align with it.` : ''}

Respond with ONLY the updated JSON list of tasks. Ensure valid JSON. All JSON keys MUST be in double quotes.
'id' for existing tasks must be unchanged. New tasks get a new UUID.
If no changes are absolutely necessary based on the new context, return the original task list (or an empty array [] if no tasks existed).
`;

export async function updateTasksWithChronographer(
  currentTasks: TaskItem[],
  newContext: CognitiveParserOutput,
  apexDoctrineContent: string | null,
  dynamicContext: DynamicContextMemory,
  mainTaskHypothesis: PotentialMainTask | null,
  currentKeywords: string[],
  metaIntentAnalysis?: MetaIntentAnalysis | null,
  currentDirective?: string | null
): Promise<{ result: TaskItem[]; durationMs: number }> {
  if (!API_KEY) {
    logger.error(COMPONENT_NAME, "updateTasksWithChronographer", "Gemini API Key is not configured.");
    return { result: currentTasks, durationMs: 0 }; 
  }
  const startTime = Date.now();
  
  const simplifiedTasksForPrompt = currentTasks.map(task => ({
    id: task.id,
    description: task.description,
    status: task.status,
    keywords: task.keywords?.slice(0,5) || [],
    userEditsHistory: task.userEditsHistory?.filter(h => h.editSource === 'user_manual').slice(-2) || [], 
    historySnapshots: task.historySnapshots?.slice(-2) || [] 
  }));

  const dynamicContextSummary = Array.from(dynamicContext.entries())
    .sort(([,a],[,b]) => b.weight - a.weight)
    .slice(0, 7) 
    .map(([kw, item]) => `${kw} (W: ${item.weight.toFixed(2)})`)
    .join('; ') || "No strong dynamic context themes yet.";
  
  const mainTaskHypothesisText = mainTaskHypothesis ? `${mainTaskHypothesis.description} (Confidence: ${mainTaskHypothesis.weight.toFixed(2)}, Source: ${mainTaskHypothesis.source})` : "Not yet determined.";

  let systemInstruction = TASK_CHRONOGRAPHER_PROMPT_TEMPLATE(
    dynamicContextSummary, 
    mainTaskHypothesisText,
    metaIntentAnalysis?.metaIntentDescription,
    metaIntentAnalysis?.confidence,
    currentDirective
  );
  if (apexDoctrineContent) {
    systemInstruction = `<apex_doctrine source="AI Agent Apex Doctrine (AAD) - v5.0">\\n${apexDoctrineContent}\\n</apex_doctrine>\\n\\n${systemInstruction}\\nCRITICAL REMINDER: Your task updates MUST strictly adhere to and align with the principles outlined in the <apex_doctrine> section and the self-iterative learning loop principles. Prioritize user intent, the main task hypothesis, and the CURRENT USER DIRECTIVE (if set).`;
  }

  const promptContent = `
Cognitive Context (ID: ${newContext.id}):
${JSON.stringify({ 
    inferredActivity: newContext.inferredActivity, 
    activeApplication: newContext.activeApplication, 
    windowTitle: newContext.windowTitle,
    keyTexts: newContext.keyTexts.slice(0,3).map(kt=> ({text: kt.text, role: kt.role})), 
    uiElements: newContext.uiElements.slice(0,3).map(ui=>({type: ui.type, label: ui.label})), 
    activeInteractionContext: newContext.activeInteractionContext 
}, null, 2)}

Current Context Keywords (to be associated with new/updated tasks if relevant): ${JSON.stringify(currentKeywords)}

Existing Tasks (summary):
${JSON.stringify(simplifiedTasksForPrompt, null, 2)}

Analyze and return the updated task list as JSON, following all rules from the system instruction.
Important: For any new task you create, ensure its 'id' is a newly generated UUID and associate the 'Current Context Keywords' (provided above) with its 'keywords' field.
Do NOT change the 'id' of existing tasks.
When updating a task, if you change its description or status, add an entry to its 'userEditsHistory' with 'editSource: "chronographer_ai"'.
`;
  let jsonStrChronographer = "";
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: TEXT_MODEL_NAME,
      contents: [{role: "user", parts: [{text: promptContent}]}],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });
    
    jsonStrChronographer = response.text ? response.text.trim() : "";
    const fenceRegex = /^```(?:json)?\\s*\\n?(.*?)\\n?\\s*```$/s;
    const match = jsonStrChronographer.match(fenceRegex);
    if (match && match[1]) {
      jsonStrChronographer = match[1].trim();
    }

    const updatedTasksFromLLM = JSON.parse(jsonStrChronographer) as Partial<TaskItem>[];
    
    const processedTasks = updatedTasksFromLLM.map(llmTask => {
      let existingTask = currentTasks.find(t => t.id === llmTask.id);
      const now = Date.now();
      
      let finalKeywords = llmTask.keywords || []; 
      if (!llmTask.keywords && !existingTask) { 
        finalKeywords = currentKeywords.slice(0,10);
      }


      if (existingTask) { 
          const aiEditHistory: UserEdit[] = [];
          if (llmTask.description && llmTask.description !== existingTask.description) {
              aiEditHistory.push({ timestamp: now, editedField: 'description', oldValue: existingTask.description, newValue: llmTask.description, editSource: 'chronographer_ai'});
          }
          if (llmTask.status && llmTask.status !== existingTask.status) {
              aiEditHistory.push({ timestamp: now, editedField: 'status', oldValue: existingTask.status, newValue: llmTask.status, editSource: 'chronographer_ai'});
          }
          
          const baseKeywords = (llmTask.status === existingTask.status && llmTask.description === existingTask.description) ? 
                                (existingTask.keywords || []) : 
                                []; 
          
          const mergedKeywords = new Set([...baseKeywords, ...finalKeywords, ...(aiEditHistory.length > 0 ? currentKeywords : [])]);


          return {
            ...existingTask,
            description: llmTask.description || existingTask.description,
            status: llmTask.status || existingTask.status,
            keywords: Array.from(mergedKeywords).slice(0, 10),
            lastUpdatedTimestamp: now,
            latestContextId: newContext.id,
            historySnapshots: llmTask.historySnapshots ? 
                [...(existingTask.historySnapshots || []).filter(s => !llmTask.historySnapshots?.includes(s)), ...llmTask.historySnapshots].slice(-5) : 
                [...(existingTask.historySnapshots || []), `Context: ${newContext.inferredActivity.substring(0,30)}...`].slice(-5),
            userEditsHistory: [...(existingTask.userEditsHistory || []), ...aiEditHistory].filter(Boolean).slice(-10),
            confidence: llmTask.confidence !== undefined ? llmTask.confidence : existingTask.confidence,
            notes: llmTask.notes !== undefined ? llmTask.notes : existingTask.notes,
            tags: llmTask.tags !== undefined ? llmTask.tags : existingTask.tags,
            priority: llmTask.priority !== undefined ? llmTask.priority : existingTask.priority,
          } as TaskItem;
      } else { 
          return {
            id: llmTask.id || uuidv4(),
            description: llmTask.description || "Untitled Task from Chronographer",
            status: llmTask.status || 'To-Do',
            keywords: finalKeywords.length > 0 ? finalKeywords.slice(0,10) : currentKeywords.slice(0,10),
            firstSeenContextId: newContext.id, 
            latestContextId: newContext.id,    
            firstSeenTimestamp: llmTask.firstSeenTimestamp || now,
            lastUpdatedTimestamp: llmTask.lastUpdatedTimestamp || now,
            historySnapshots: llmTask.historySnapshots ? llmTask.historySnapshots.slice(-5) : [`Task created from context: ${newContext.inferredActivity.substring(0,30)}...`],
            userEditsHistory: llmTask.userEditsHistory ? llmTask.userEditsHistory.slice(-10) : [],
            confidence: llmTask.confidence || 0.7,
            notes: llmTask.notes || "",
            tags: llmTask.tags || [],
            priority: llmTask.priority || 'medium',
          } as TaskItem; 
      }
    });
    const durationMs = Date.now() - startTime;
    logger.debug(COMPONENT_NAME, "updateTasksWithChronographer", `Chronographer updated tasks in ${durationMs}ms. Output count: ${processedTasks.length}. Directive: ${currentDirective}`);
    return { result: processedTasks, durationMs };

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const problematicJsonSnippet = jsonStrChronographer ? jsonStrChronographer.substring(0, 500) : "N/A";
    logger.error(COMPONENT_NAME, "updateTasksWithChronographer", `Error. Problematic JSON: '${problematicJsonSnippet}'`, error);
    let errorMessage = "Failed to update tasks with AI Chronographer.";
    if (error.message) errorMessage += ` Details: ${error.message}`;
     if (error.toString().includes("quota") || error.toString().includes("rate limit") || error.toString().includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "AI request failed (Chronographer) due to rate limits or quota.";
    } else if (error.message && (error.message.toLowerCase().includes("json") || error.message.toLowerCase().includes("unexpected token") || error.message.toLowerCase().includes("property name"))) {
        errorMessage = "AI (Chronographer) produced invalid JSON output.";
    }
    logger.warn(COMPONENT_NAME, "updateTasksWithChronographer", "Chronographer failed, returning original tasks with context update.");
    const now = Date.now();
    return { result: currentTasks.map(task => ({...task, latestContextId: newContext.id, lastUpdatedTimestamp: now })), durationMs}; 
  }
}

const SUGGESTION_GENERATOR_PROMPT_TEMPLATE = (
    dynamicContextSummary: string, 
    mainTaskHypothesisText: string,
    currentDirective: string | null
) => `
You are an AI assistant providing contextual suggestions, guided by self-iterative learning loop principles and the AI Agent Apex Doctrine.
Based on the user's current activity, inferred goal, dynamic context, main task hypothesis, and any current user-set directive, provide 3-5 concise, actionable suggestions.
These suggestions should be next steps, related information to look up, relevant tools, or efficiency tips, all aligned with the user's primary focus.

User State:
Dynamic Context (Top Keywords/Themes): ${dynamicContextSummary || 'Not available.'}
Main Task Hypothesis: ${mainTaskHypothesisText || 'Not yet determined.'}
${currentDirective ? `Current User Directive: "${currentDirective}"` : ''}

Current User Activity Details:
Activity Description: {ACTIVITY_DESCRIPTION}
User's Inferred Goal for this Activity: {INTERACTION_GOAL}

Respond with a JSON array of strings, where each string is a suggestion (max 15 words per suggestion). Example: ["Search for 'Gemini API pricing'", "Open Slack and message your team lead about the deadline", "Save the current document as 'final_report_v2.docx'", "Consider using a mind map for brainstorming"].
Ensure your suggestions are highly relevant to the Main Task Hypothesis, current activity, AND THE CURRENT USER DIRECTIVE (if set). Be specific and actionable. Avoid generic suggestions.
If the Current User Directive is set, suggestions MUST align with or support this directive above other factors.
If no directive, and the main task hypothesis is clear, tailor suggestions directly to it. 
If neither is strong, provide suggestions that help clarify or advance the current inferred activity.
${currentDirective ? `\\nREMEMBER THE CURRENT USER DIRECTIVE: "${currentDirective}". All suggestions must align with it.` : ''}
`;

export async function generateContextualSuggestions(
  apexDoctrineContent: string | null,
  dynamicContext: DynamicContextMemory,
  mainTaskHypothesis: PotentialMainTask | null,
  interactionContext?: ActiveInteractionContext,
  activityDescription?: string,
  currentDirective?: string | null
): Promise<{result: string[]; durationMs: number}> {
  if (!API_KEY) {
    logger.error(COMPONENT_NAME, "generateContextualSuggestions", "Gemini API Key is not configured.");
    return { result: [], durationMs: 0 };
  }
  if (!interactionContext && !activityDescription) { 
      logger.debug(COMPONENT_NAME, "generateContextualSuggestions", "Insufficient context for suggestions.");
      return { result: [], durationMs: 0 };
  }

  const startTime = Date.now();
  const activity = activityDescription || "User activity context not specifically detailed.";
  const goal = interactionContext?.userActivityGoal || "User's immediate goal not explicitly stated.";

  const dynamicContextSummary = Array.from(dynamicContext.entries())
    .sort(([,a],[,b]) => b.weight - a.weight)
    .slice(0, 7)
    .map(([kw, item]) => `${kw} (W: ${item.weight.toFixed(2)})`)
    .join('; ') || "No strong dynamic context themes yet.";
  
  const mainTaskHypothesisText = mainTaskHypothesis ? `${mainTaskHypothesis.description} (Confidence: ${mainTaskHypothesis.weight.toFixed(2)}, Source: ${mainTaskHypothesis.source})` : "Not yet determined.";


  let systemInstruction = SUGGESTION_GENERATOR_PROMPT_TEMPLATE(
      dynamicContextSummary, 
      mainTaskHypothesisText,
      currentDirective !== undefined ? currentDirective : null
    )
    .replace("{ACTIVITY_DESCRIPTION}", activity.substring(0, 200)) 
    .replace("{INTERACTION_GOAL}", goal.substring(0, 150)); 

  if (apexDoctrineContent) {
    systemInstruction = `<apex_doctrine source="AI Agent Apex Doctrine (AAD) - v5.0">\\n${apexDoctrineContent}\\n</apex_doctrine>\\n\\n${systemInstruction}\\nCRITICAL REMINDER: Your suggestions MUST strictly adhere to and align with the principles outlined in the <apex_doctrine> section, the self-iterative learning loop principles, and the CURRENT USER DIRECTIVE (if set). Focus on helpful, relevant, and ethical suggestions.`;
  }
  
  let jsonStrSuggestions = "";
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: TEXT_MODEL_NAME,
      contents: [{role: "user", parts: [{text: "Please provide suggestions based on the system instruction and the context provided."}]}],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });

    jsonStrSuggestions = response.text ? response.text.trim() : "";
    const fenceRegex = /^```(?:json)?\\s*\\n?(.*?)\\n?\\s*```$/s;
    const match = jsonStrSuggestions.match(fenceRegex);
    if (match && match[1]) {
      jsonStrSuggestions = match[1].trim();
    }
    
    const suggestions = JSON.parse(jsonStrSuggestions) as string[];
    if (!Array.isArray(suggestions) || !suggestions.every(s => typeof s === 'string')) {
        logger.warn(COMPONENT_NAME, "generateContextualSuggestions", "Suggestions from AI were not an array of strings", suggestions);
        return {result: [], durationMs: Date.now() - startTime};
    }
    const durationMs = Date.now() - startTime;
    logger.debug(COMPONENT_NAME, "generateContextualSuggestions", `Successfully generated ${suggestions.length} suggestions in ${durationMs}ms. Directive: ${currentDirective}`, suggestions);
    return {result: suggestions.slice(0, 5), durationMs};

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const problematicJsonSnippet = jsonStrSuggestions ? jsonStrSuggestions.substring(0, 500) : "N/A";
    logger.error(COMPONENT_NAME, "generateContextualSuggestions", `Error generating suggestions. Problematic JSON: '${problematicJsonSnippet}'`, error);
    return {result: [], durationMs};
  }
}
