
import { logger } from './logger';

const COMPONENT_NAME = "DocumentFetcher";
const HARMONIA_DIGITALIS_URL = "https://raw.githubusercontent.com/mokafari/Harmonia-Digitalis/main/Harmonia_Digitalis_v5.md";

/**
 * Fetches the Harmonia Digitalis document.
 * @returns {Promise<string | null>} The content of the document as a string, or null if fetching fails.
 */
export async function fetchHarmoniaDigitalisDocument(): Promise<string | null> {
  logger.info(COMPONENT_NAME, "fetchHarmoniaDigitalisDocument", `Attempting to fetch Harmonia Digitalis from ${HARMONIA_DIGITALIS_URL}`);
  try {
    const response = await fetch(HARMONIA_DIGITALIS_URL, {
        method: 'GET',
        headers: {
            'Accept': 'text/plain', // Prefer plain text
        },
        mode: 'cors', // Ensure CORS is handled if run in browser context that needs it
    });

    if (!response.ok) {
      logger.error(COMPONENT_NAME, "fetchHarmoniaDigitalisDocument", `Failed to fetch Harmonia Digitalis. Status: ${response.status} ${response.statusText}`, { url: HARMONIA_DIGITALIS_URL });
      return null;
    }

    const documentText = await response.text();
    if (!documentText || documentText.trim().length < 100) { // Basic sanity check for content length
        logger.warn(COMPONENT_NAME, "fetchHarmoniaDigitalisDocument", `Harmonia Digitalis document fetched but seems too short or empty. Length: ${documentText.length}`, { url: HARMONIA_DIGITALIS_URL });
        // Potentially return null or the short text based on desired strictness
    }
    logger.info(COMPONENT_NAME, "fetchHarmoniaDigitalisDocument", "Successfully fetched Harmonia Digitalis document.");
    return documentText;
  } catch (error: any) {
    logger.error(COMPONENT_NAME, "fetchHarmoniaDigitalisDocument", "Exception occurred while fetching Harmonia Digitalis document", error);
    return null;
  }
}
