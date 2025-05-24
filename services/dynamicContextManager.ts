import { v4 as uuidv4 } from 'uuid';
import type { CognitiveParserOutput, DynamicContextMemory, DynamicContextItem, PotentialMainTask, UserNudgeInput, TaskItem } from '../types';
import { logger } from './logger';

const COMPONENT_NAME = "DynamicContextManager";

const KEYWORD_WEIGHT_DECAY_HALFLIFE_MS = 5 * 60 * 1000; // 5 minutes for keywords
const PMT_WEIGHT_DECAY_HALFLIFE_MS = 15 * 60 * 1000; // 15 minutes for PMTs
const MIN_KEYWORD_WEIGHT_TO_KEEP = 0.05;
const MIN_PMT_WEIGHT_TO_KEEP = 0.1;
// MAX_PMTS_TO_TRACK is now used by consumers like getHighestWeightedPMTs to determine how many top items to retrieve, not for pruning the list itself.
const MAX_PMTS_TO_TRACK = 7; 
// MAX_KEYWORDS_IN_DCM is similarly now a guideline for consumers, not for pruning the memory itself.
const MAX_KEYWORDS_IN_DCM = 75; // Consumers can use this default for how many top keywords to consider.
const PMT_REINFORCEMENT_THRESHOLD = 0.30; // Min score to consider a task related
const PMT_NEW_INFERENCE_WEIGHT = 0.25;
const PMT_USER_CONFIRM_BOOST = 0.85; // How much to boost a confirmed PMT and reduce others
const PMT_USER_CREATED_WEIGHT = 0.98;
const KEYWORD_INITIAL_WEIGHT = 0.3;
const KEYWORD_GOAL_BOOST = 0.3;
const KEYWORD_ACTIVITY_BOOST = 0.15;
const KEYWORD_KEYTEXT_BOOST = 0.1;
const RELATED_TASK_SUGGESTION_COUNT = 3;

const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose', 'this', 'that', 'these', 'those', 'in', 'on', 'at', 'by', 'from', 'to', 'with', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'any', 'as', 'because', 'before', 'below', 'between', 'both', 'com', 'cannot', 'down', 'during', 'each', 'few', 'further', 'here', 'http', 'https', 'i', 'into', 'it', 'its', 'itself', 'just', 'like', 'me', 'more', 'most', 'my', 'myself', 'no', 'not', 'now', 'of', 'off', 'once', 'only', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', "s", "t", 'some', 'such', 'than', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'therefore', 'they', 'through', 'too', 'under', 'until', 'up', 'very', 'we', 'were', 'www', 'you', 'your', 'yours', 'yourself', 'yourselves', 'user', 'using', 'screen', 'capture', 'image', 'window', 'title', 'text', 'button', 'label', 'element', 'type', 'file', 'document', 'page', 'untitled', 'new', 'app', 'click', 'select', 'open', 'close', 'save', 'edit', 'view', 'manage', 'list', 'item', 'items', 'data', 'field', 'value', 'main', 'menu', 'tab', 'section', 'option', 'setting', 'config', 'form', 'input', 'output', 'log', 'error', 'message', 'details', 'overview', 'summary', 'report', 'analysis', 'test', 'dev', 'build', 'run', 'start', 'stop', 'process', 'update', 'create', 'delete', 'remove', 'add', 'get', 'set', 'send', 'receive', 'request', 'response', 'api', 'key', 'url', 'link', 'content', 'context', 'task', 'tasks', 'project', 'goal', 'plan', 'step', 'action', 'activity', 'mode', 'status', 'current', 'previous', 'next', 'first', 'last', 'number', 'string', 'object', 'array', 'null', 'undefined', 'true', 'false', 'system', 'chrome', 'google', 'microsoft', 'word', 'excel', 'vscode', 'code', 'script', 'python', 'javascript', 'typescript', 'react', 'node']);

function calculateDecayFactor(lastSeenTimestamp: number, halflife: number): number {
    const ageMs = Date.now() - lastSeenTimestamp;
    if (ageMs <= 0) return 1.0;
    return Math.pow(0.5, ageMs / halflife);
}

export function extractKeywordsFromContext(context: CognitiveParserOutput): string[] {
    const keywords = new Set<string>();
    
    const processText = (text: string | undefined | null, _importanceFactor: number = 1) => { // importanceFactor currently not used but could be
        if (!text) return;
        text.toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]'"“”?<>|]/g, " ") 
            .split(/\s+/)
            .map(w => w.trim())
            .filter(w => w.length > 2 && w.length < 25 && !STOP_WORDS.has(w) && isNaN(Number(w)))
            .forEach(k => keywords.add(k));
    };

    processText(context.inferredActivity, 1.5);
    processText(context.activeInteractionContext?.userActivityGoal, 2.0);
    processText(context.windowTitle, 0.8);
    processText(context.activeApplication, 0.7);
    context.keyTexts.forEach(kt => processText(kt.text, (kt.importance || 0.5) * 0.7));
    context.uiElements.forEach(ui => processText(ui.label, (ui.importance || 0.3) * 0.5));
    processText(context.activeInteractionContext?.relevantTextSelection, 1.2);

    const mainActivityText = context.activeInteractionContext?.userActivityGoal || context.inferredActivity;
    if (mainActivityText) {
        const commonVerbs = ['editing', 'writing', 'reading', 'developing', 'debugging', 'testing', 'managing', 'planning', 'researching', 'browsing', 'searching', 'watching', 'learning', 'organizing', 'reviewing', 'creating', 'designing', 'building', 'coding', 'typing', 'navigating', 'communicating', 'discussing', 'presenting', 'analyzing', 'reporting', 'monitoring', 'configuring', 'installing', 'deploying', 'fixing', 'troubleshooting', 'refactoring', 'optimizing', 'querying', 'visualizing', 'modeling', 'simulating', 'calculating', 'generating', 'exporting', 'importing', 'uploading', 'downloading'];
        const words = mainActivityText.toLowerCase().split(/\s+/);
        const verb = words.find(word => commonVerbs.includes(word.replace(/[^a-z]/gi, '')));
        if(verb) keywords.add(verb);

        // Try to extract nouns after common verbs or prepositions
        const prepositions = ['on', 'in', 'for', 'about', 'with', 'to', 'of'];
        for(let i=0; i < words.length -1; i++){
            if(commonVerbs.includes(words[i]) || prepositions.includes(words[i])){
                const potentialNoun = words[i+1].replace(/[^a-z0-9-]/gi, ''); // Allow hyphens in nouns
                if(potentialNoun.length > 2 && potentialNoun.length < 25 && !STOP_WORDS.has(potentialNoun) && isNaN(Number(potentialNoun))){
                    keywords.add(potentialNoun);
                }
            }
        }
    }
    
    // Extract specific file names or identifiers from longer strings
    const extractIdentifier = (text: string | undefined | null) => {
        if (!text) return;
        // Regex for common file names (e.g., name.ext), URLs, or specific identifiers
        const fileRegex = /(\b[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{2,5}\b)/g; // e.g. component.tsx, document.pdf
        const urlRegex = /\b(?:[a-zA-Z]+:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)(?:\/[^\s]*)?/g; // domain part
        
        let match;
        while((match = fileRegex.exec(text)) !== null) {
            const m = match[1].toLowerCase();
            if (m.length > 3 && m.length < 30 && !STOP_WORDS.has(m.split('.')[0])) keywords.add(m);
        }
        while((match = urlRegex.exec(text)) !== null) {
            const m = match[1].toLowerCase();
            if (m.length > 3 && m.length < 30 && !STOP_WORDS.has(m.split('.')[0])) keywords.add(m);
        }
    };
    extractIdentifier(context.inferredActivity);
    extractIdentifier(context.windowTitle);
    extractIdentifier(context.activeInteractionContext?.userActivityGoal);
    context.keyTexts.forEach(kt => extractIdentifier(kt.text));

    // Clean up keywords if some are substrings of others (e.g., "react" and "react-component", keep "react-component") - simple version
    const finalKeywords = Array.from(keywords);
    const toRemove = new Set<string>();
    for(const kw1 of finalKeywords) {
        for(const kw2 of finalKeywords) {
            if(kw1 !== kw2 && kw2.includes(kw1) && kw1.length < kw2.length * 0.75) { // kw1 is a shorter substring of kw2
                toRemove.add(kw1);
            }
        }
    }
    
    return finalKeywords.filter(kw => !toRemove.has(kw)).slice(0, 15); // Limit initial extraction
}

export interface MetaIntentAnalysis {
    metaIntentDescription: string | null;
    confidence: number;
    contributingKeywords: string[];
    sourceContextIds: string[];
}

export function analyzeSequentialContextForMetaIntent(
    recentContexts: CognitiveParserOutput[], // Expects recent contexts, e.g., last 3-5, ordered oldest to newest
    sequenceLengthThreshold: number = 3 // Minimum number of contexts to consider for a sequence
): MetaIntentAnalysis {
    const analysisOutput: MetaIntentAnalysis = {
        metaIntentDescription: null,
        confidence: 0,
        contributingKeywords: [],
        sourceContextIds: []
    };

    if (recentContexts.length < sequenceLengthThreshold) {
        logger.debug(COMPONENT_NAME, "analyzeSequentialContextForMetaIntent", `Not enough recent contexts (${recentContexts.length}) to analyze. Threshold: ${sequenceLengthThreshold}`);
        return analysisOutput;
    }

    const allKeywordsAcrossSequence: string[] = [];
    const keywordFrequency = new Map<string, number>();
    const activeTextEntries: Array<string | null | undefined> = [];
    const sourceContextIds = recentContexts.map(ctx => ctx.id);

    recentContexts.forEach(context => {
        const keywords = extractKeywordsFromContext(context);
        keywords.forEach(kw => {
            allKeywordsAcrossSequence.push(kw);
            keywordFrequency.set(kw, (keywordFrequency.get(kw) || 0) + 1);
        });
        if(context.activeUserTextEntry && context.activeUserTextEntry.trim().length > 3) { // Consider non-empty, meaningful entries
            activeTextEntries.push(context.activeUserTextEntry.trim().toLowerCase());
        }
    });

    const frequentKeywords = Array.from(keywordFrequency.entries())
        .filter(([, count]) => count >= Math.max(1, Math.floor(recentContexts.length * 0.5))) // Appears in at least 50% of contexts (min 1)
        .sort(([, countA], [, countB]) => countB - countA)
        .map(([kw]) => kw);

    analysisOutput.contributingKeywords = frequentKeywords.slice(0, 5); // Top 5 frequent keywords
    analysisOutput.sourceContextIds = sourceContextIds;

    // Initial simple strategy: If there are frequent keywords, form a basic description
    // More sophisticated analysis can be added later (e.g., using an LLM to summarize themes)
    if (analysisOutput.contributingKeywords.length > 0) {
        // Check for consistent activeUserTextEntry
        if (activeTextEntries.length >= Math.floor(recentContexts.length * 0.6)) { // Present in most contexts
            const mostCommonActiveText = activeTextEntries
                .reduce((acc, text) => {
                    if(text) acc.set(text, (acc.get(text) || 0) + 1);
                    return acc;
                }, new Map<string, number>());
            
            let dominantText: string | null = null;
            let maxCount = 0;
            mostCommonActiveText.forEach((count, text) => {
                if (count > maxCount) {
                    maxCount = count;
                    dominantText = text;
                }
            });

            if (dominantText && maxCount >= Math.floor(activeTextEntries.length * 0.75)) { // A single text entry is highly dominant
                analysisOutput.metaIntentDescription = `User focused on: "${dominantText}" (related to: ${analysisOutput.contributingKeywords.join(", ")})`;
                analysisOutput.confidence = 0.7;
            } else if (analysisOutput.contributingKeywords.length > 1 ) {
                 analysisOutput.metaIntentDescription = `User activity related to: ${analysisOutput.contributingKeywords.join(", ")}`;
                 analysisOutput.confidence = 0.5;
            }
        } else if (analysisOutput.contributingKeywords.length > 1) {
            analysisOutput.metaIntentDescription = `User activity involves themes: ${analysisOutput.contributingKeywords.join(", ")}`;
            analysisOutput.confidence = 0.4;
        }
    }
    
    if(analysisOutput.metaIntentDescription) {
        logger.info(COMPONENT_NAME, "analyzeSequentialContextForMetaIntent", `Meta-intent identified: '${analysisOutput.metaIntentDescription}'. Confidence: ${analysisOutput.confidence.toFixed(2)}`, { keywords: analysisOutput.contributingKeywords });
    } else {
        logger.debug(COMPONENT_NAME, "analyzeSequentialContextForMetaIntent", "No clear meta-intent identified from sequential context.");
    }

    return analysisOutput;
}

export function updateDynamicContextMemory(
    context: CognitiveParserOutput,
    currentMemory: DynamicContextMemory
): { updatedMemory: DynamicContextMemory; extractedKeywords: string[] } {
    const newMemory: DynamicContextMemory = new Map(currentMemory);
    const now = Date.now();

    const extractedKeywords = extractKeywordsFromContext(context);

    extractedKeywords.forEach(keyword => {
        const existingItem = newMemory.get(keyword);
        let newWeight = KEYWORD_INITIAL_WEIGHT;
        if (context.activeInteractionContext?.userActivityGoal?.toLowerCase().includes(keyword)) newWeight += KEYWORD_GOAL_BOOST;
        if (context.inferredActivity?.toLowerCase().includes(keyword)) newWeight += KEYWORD_ACTIVITY_BOOST;
        if (context.keyTexts.some(kt => kt.text.toLowerCase().includes(keyword))) newWeight += KEYWORD_KEYTEXT_BOOST;


        if (existingItem) {
            existingItem.weight = Math.min(1, existingItem.weight + newWeight * 0.5); // Reinforce, cap at 1
            existingItem.lastSeenTimestamp = now;
            existingItem.frequency += 1;
            existingItem.sourceContextIds.add(context.id);
        } else {
            newMemory.set(keyword, {
                keyword,
                weight: Math.min(1, newWeight), // Cap initial weight
                lastSeenTimestamp: now,
                frequency: 1,
                sourceContextIds: new Set([context.id])
            });
        }
    });

    // Decay, prune by minimum weight
    const memoryArray = Array.from(newMemory.values())
        .map(item => {
            // Don't decay items just updated in this cycle. Only decay if lastSeenTimestamp is older.
            const decay = (item.lastSeenTimestamp === now && extractedKeywords.includes(item.keyword)) ? 1.0 : calculateDecayFactor(item.lastSeenTimestamp, KEYWORD_WEIGHT_DECAY_HALFLIFE_MS);
            return {
                ...item,
                weight: item.weight * decay
            };
        })
        .filter(item => item.weight >= MIN_KEYWORD_WEIGHT_TO_KEEP);
    // Removed: Pruning by MAX_KEYWORDS_IN_DCM. This constant is now for consumers.
    // The list is sorted when consumers (like getHighestWeightedDCMItems or display logic) fetch data.

    // Rebuild map
    const finalMemory: DynamicContextMemory = new Map();
    memoryArray.forEach(item => finalMemory.set(item.keyword, item));
    
    logger.debug(COMPONENT_NAME, "updateDynamicContextMemory", `DCM updated. Size: ${finalMemory.size}. Extracted keywords: ${extractedKeywords.length}`, {keywords: extractedKeywords.slice(0,5)});
    return { updatedMemory: finalMemory, extractedKeywords };
}


export function updatePotentialMainTasks(
    context: CognitiveParserOutput | null, // Null if only applying nudge
    currentMemory: DynamicContextMemory,
    currentPmts: PotentialMainTask[],
    nudge?: UserNudgeInput | null,
    metaIntent?: MetaIntentAnalysis | null // New parameter for meta-intent analysis
): PotentialMainTask[] {
    const now = Date.now();
    let updatedPmts = [...currentPmts];

    // 1. Apply Nudge if provided
    if (nudge) {
        if (nudge.type === 'confirm_pmt' && nudge.pmtId) {
            const pmtToConfirm = updatedPmts.find(p => p.id === nudge.pmtId);
            if (pmtToConfirm) {
                pmtToConfirm.weight = Math.min(1, pmtToConfirm.weight + PMT_USER_CONFIRM_BOOST * (1 - pmtToConfirm.weight)); // Increase weight towards 1
                pmtToConfirm.source = 'user_confirmed';
                pmtToConfirm.lastReinforcedTimestamp = now;
                // Reduce weight of other PMTs
                updatedPmts.forEach(pmt => {
                    if (pmt.id !== nudge.pmtId) {
                        pmt.weight *= (1 - PMT_USER_CONFIRM_BOOST * 0.5); 
                    }
                });
                logger.info(COMPONENT_NAME, "updatePotentialMainTasks", `User confirmed PMT: ${pmtToConfirm.description.substring(0,30)}... New weight: ${pmtToConfirm.weight.toFixed(2)}`);
            }
        } else if (nudge.type === 'new_goal' && nudge.goalText) {
            // Reduce weight of all existing PMTs before adding a new user-defined one
            updatedPmts.forEach(pmt => pmt.weight *= (1 - PMT_USER_CONFIRM_BOOST * 0.75)); 
            const newPmt: PotentialMainTask = {
                id: uuidv4(),
                description: nudge.goalText,
                source: 'user_created',
                weight: PMT_USER_CREATED_WEIGHT,
                lastReinforcedTimestamp: now,
                contributingContextIds: context ? new Set([context.id]) : new Set()
            };
            updatedPmts.push(newPmt);
            logger.info(COMPONENT_NAME, "updatePotentialMainTasks", `User created new PMT: ${newPmt.description.substring(0,30)}... Weight: ${newPmt.weight.toFixed(2)}`);
        }
    }

    // 2. Decay weights of existing PMTs and filter out very low weight ones
    updatedPmts = updatedPmts
        .map(pmt => {
             // Don't decay PMTs just confirmed or created by user in this cycle
            const isJustNudged = (nudge && ((nudge.type === 'confirm_pmt' && pmt.id === nudge.pmtId) || (nudge.type === 'new_goal' && pmt.description === nudge.goalText && pmt.source === 'user_created')));
            const decay = isJustNudged ? 1.0 : calculateDecayFactor(pmt.lastReinforcedTimestamp, PMT_WEIGHT_DECAY_HALFLIFE_MS);
            return {
                ...pmt,
                weight: pmt.weight * decay
            };
        })
        .filter(pmt => pmt.weight >= MIN_PMT_WEIGHT_TO_KEEP);


    // 3. Reinforce or Infer PMTs based on current context (if context is provided)
    if (context) {
        const contextGoal = context.activeInteractionContext?.userActivityGoal;
        const contextActivity = context.inferredActivity;
        // Prioritize meta-intent description if available and confident
        let relevantTextForPmt = (metaIntent && metaIntent.metaIntentDescription && metaIntent.confidence >= 0.5) 
            ? metaIntent.metaIntentDescription 
            : (contextGoal || contextActivity);

        if (relevantTextForPmt && relevantTextForPmt.length > 10) { // Min length for a meaningful PMT description
            let reinforcedExisting = false;
            const pmtDescriptionForComparison = relevantTextForPmt.toLowerCase();

            for (const pmt of updatedPmts) {
                const pmtDescLower = pmt.description.toLowerCase();
                let similarity = 0;
                if (pmtDescLower.includes(pmtDescriptionForComparison) || pmtDescriptionForComparison.includes(pmtDescLower)) {
                    similarity = 0.7; 
                } else { 
                    const pmtKeywords = new Set(extractKeywordsFromContext({ inferredActivity: pmt.description, activeUserTextEntry: pmt.description } as CognitiveParserOutput));
                    // Use metaIntent keywords if available and relevant, otherwise use current context keywords
                    const comparisonKeywords = (metaIntent && metaIntent.confidence >= 0.4 && metaIntent.contributingKeywords.length > 0) 
                        ? new Set(metaIntent.contributingKeywords) 
                        : new Set(extractKeywordsFromContext(context));
                    
                    const intersection = new Set([...pmtKeywords].filter(x => comparisonKeywords.has(x)));
                    if (pmtKeywords.size > 0 && comparisonKeywords.size > 0) {
                        similarity = intersection.size / Math.min(pmtKeywords.size, comparisonKeywords.size);
                    }
                }

                if (similarity > PMT_REINFORCEMENT_THRESHOLD) {
                    let reinforcementFactor = PMT_NEW_INFERENCE_WEIGHT * 0.5 * similarity;
                    if (metaIntent && metaIntent.confidence > 0.5 && similarity > 0.5) { // Stronger reinforcement if meta-intent aligns
                        reinforcementFactor *= (1 + metaIntent.confidence); // Boost by meta-intent confidence
                    }
                    pmt.weight = Math.min(1, pmt.weight + reinforcementFactor * (pmt.source === 'user_confirmed' || pmt.source === 'user_created' ? 0.5 : 1)); 
                    pmt.lastReinforcedTimestamp = now;
                    pmt.contributingContextIds.add(context.id);
                    if (metaIntent && metaIntent.sourceContextIds) metaIntent.sourceContextIds.forEach(id => pmt.contributingContextIds.add(id));
                    reinforcedExisting = true;
                    logger.debug(COMPONENT_NAME, "updatePotentialMainTasks", `Reinforced PMT '${pmt.description.substring(0,20)}...' (similarity: ${similarity.toFixed(2)}, meta-intent factor: ${metaIntent ? metaIntent.confidence.toFixed(2) : 'N/A'}). New weight: ${pmt.weight.toFixed(2)}`);
                }
            }

            // If no existing PMT was strongly reinforced and the (meta)intent seems new and clear
            if (!reinforcedExisting && relevantTextForPmt) {
                // Check if a very similar PMT already exists, even if not reinforced above
                const alreadyExists = updatedPmts.some(pmt => 
                    pmt.description.toLowerCase().includes(pmtDescriptionForComparison.substring(0, Math.max(15, pmtDescriptionForComparison.length * 0.7))) ||
                    pmtDescriptionForComparison.includes(pmt.description.toLowerCase().substring(0, Math.max(15, pmt.description.length * 0.7)))
                );

                let newPmtWeight = PMT_NEW_INFERENCE_WEIGHT;
                if (metaIntent && metaIntent.metaIntentDescription && metaIntent.confidence >= 0.5 && relevantTextForPmt === metaIntent.metaIntentDescription) {
                    newPmtWeight = Math.min(0.9, PMT_NEW_INFERENCE_WEIGHT + metaIntent.confidence * 0.5); // Higher initial weight if from strong meta-intent
                    logger.info(COMPONENT_NAME, "updatePotentialMainTasks", `Creating new PMT from meta-intent: '${relevantTextForPmt.substring(0,30)}...'`, { weight: newPmtWeight });
                } else {
                    logger.info(COMPONENT_NAME, "updatePotentialMainTasks", `Creating new PMT from context: '${relevantTextForPmt.substring(0,30)}...'`, { weight: newPmtWeight });
                }

                if (!alreadyExists && newPmtWeight > 0.2) { // Threshold for creating new PMT
                    const newPmt: PotentialMainTask = {
                        id: uuidv4(),
                        description: relevantTextForPmt, 
                        source: 'ai_inferred',
                        weight: newPmtWeight,
                        lastReinforcedTimestamp: now,
                        contributingContextIds: new Set([context.id])
                    };
                    if (metaIntent && metaIntent.sourceContextIds) metaIntent.sourceContextIds.forEach(id => newPmt.contributingContextIds.add(id));
                    updatedPmts.push(newPmt);
                }
            }
        }
    }
    
    // Sort by weight. Pruning by MAX_PMTS_TO_TRACK is removed here. Consumers will select top N.
    updatedPmts.sort((a, b) => b.weight - a.weight);
    
    logger.debug(COMPONENT_NAME, "updatePotentialMainTasks", `PMT list updated. Count: ${updatedPmts.length}. Top PMT: ${updatedPmts[0]?.description.substring(0,30)}... (W: ${updatedPmts[0]?.weight.toFixed(2)})`);
    return updatedPmts;
}

export function getHighestWeightedPMTs(pmts: PotentialMainTask[], maxItems: number = MAX_PMTS_TO_TRACK): PotentialMainTask[] {
    if (!pmts || pmts.length === 0) return [];
    // Create a copy before sorting to avoid mutating the original array if it's passed by reference from state
    // Already sorted by updatePotentialMainTasks, but re-sorting here ensures consistency if the input isn't guaranteed sorted.
    return [...pmts]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, maxItems);
}

export function getHighestWeightedDCMItems(dcm: DynamicContextMemory, maxItems: number = MAX_KEYWORDS_IN_DCM): DynamicContextItem[] {
    if (!dcm || dcm.size === 0) return [];
    return Array.from(dcm.values())
        .sort((a,b) => b.weight - a.weight)
        .slice(0, maxItems);
}


// Helper to calculate Jaccard similarity for keywords
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (!set1 || !set2 || set1.size === 0 || set2.size === 0) return 0;
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

// Suggest related tasks based on keyword overlap and context similarity
export function suggestRelatedTasks(
    currentTask: TaskItem,
    allTasks: TaskItem[],
    allContexts: Map<string, CognitiveParserOutput>,
    dynamicContextMemory: DynamicContextMemory,
    count: number = RELATED_TASK_SUGGESTION_COUNT
): Array<{ taskId: string; description: string; reason: string; confidence: number }> {
    if (!currentTask || allTasks.length < 2) return [];

    const suggestions: Array<{ task: TaskItem; score: number; reason: string }> = [];
    const currentTaskKeywords = new Set(currentTask.keywords || []);
    const currentTaskContext = allContexts.get(currentTask.latestContextId);
    const dcmKeywords = new Set(getHighestWeightedDCMItems(dynamicContextMemory, 15).map(item => item.keyword));

    for (const otherTask of allTasks) {
        if (otherTask.id === currentTask.id || otherTask.status === 'Done') continue; // Don't suggest self or done tasks

        let score = 0;
        let reasons: string[] = [];

        // 1. Keyword Overlap
        const otherTaskKeywords = new Set(otherTask.keywords || []);
        const keywordSimilarity = jaccardSimilarity(currentTaskKeywords, otherTaskKeywords);
        if (keywordSimilarity > 0.1) {
            score += keywordSimilarity * 0.4;
            reasons.push(`Shared keywords (${(keywordSimilarity*100).toFixed(0)}%)`);
        }

        // 2. Context Similarity (based on inferred activity and app)
        const otherTaskContext = allContexts.get(otherTask.latestContextId);
        if (currentTaskContext && otherTaskContext) {
            if (currentTaskContext.activeApplication && currentTaskContext.activeApplication === otherTaskContext.activeApplication) {
                score += 0.15;
                reasons.push(`Same app (${currentTaskContext.activeApplication.substring(0,15)})`);
            }
            // Basic inferred activity similarity (could be improved with embedding later)
            const act1Words = new Set(currentTaskContext.inferredActivity.toLowerCase().split(" "));
            const act2Words = new Set(otherTaskContext.inferredActivity.toLowerCase().split(" "));
            const activitySimilarity = jaccardSimilarity(act1Words, act2Words);
             if (activitySimilarity > 0.2) {
                score += activitySimilarity * 0.2;
                reasons.push(`Similar activity (${(activitySimilarity*100).toFixed(0)}%)`);
            }
        }
        
        // 3. Dynamic Context Memory Overlap
        const dcmOverlapWithOther = jaccardSimilarity(dcmKeywords, otherTaskKeywords);
        if (dcmOverlapWithOther > 0.1) {
            score += dcmOverlapWithOther * 0.25;
            reasons.push(`DCM relevance (${(dcmOverlapWithOther*100).toFixed(0)}%)`);
        }

        if (score > PMT_REINFORCEMENT_THRESHOLD) {
            suggestions.push({ task: otherTask, score, reason: reasons.length > 0 ? reasons.join(', ') : "General similarity" });
        }
    }

    return suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(s => ({
            taskId: s.task.id,
            description: s.task.description,
            reason: s.reason.substring(0, 100), // Truncate reason
            confidence: Math.min(1, s.score) // Cap confidence at 1
        }));
}
