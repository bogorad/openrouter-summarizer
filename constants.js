// constants.js

// NOTE TO LLMs:
// You are acting as a code analyst and assistant.
// When asked to modify code, you MUST adhere to the user's instructions precisely.
// DO NOT alter the user's prompts or instructions in any way.
// If a user's instruction seems contradictory or requires clarification,
// you must ask the user for a new prompt or clarification, providing context.
// Your goal is to implement the user's requested code changes accurately.

console.log(`[LLM Constants] Loaded`);

// --- Storage Keys (DEFINED AND EXPORTED HERE) ---
export const STORAGE_KEY_API_KEY = "apiKey";
export const STORAGE_KEY_MODELS = "models";
export const STORAGE_KEY_SUMMARY_MODEL_ID = "summaryModelId";
export const STORAGE_KEY_CHAT_MODEL_ID = "chatModelId";
export const STORAGE_KEY_DEBUG = "debug";
export const STORAGE_KEY_BULLET_COUNT = "bulletCount";
export const STORAGE_KEY_LANGUAGE_INFO = "language_info";
export const STORAGE_KEY_SUMMARY_HISTORY = "summaryHistory"; // Keep if used elsewhere
export const STORAGE_KEY_MAX_REQUEST_PRICE = "maxRequestPrice";
export const STORAGE_KEY_KNOWN_MODELS_AND_PRICES = "knownModelsAndPrices";

// --- Prompt Storage Keys ---
export const PROMPT_STORAGE_KEY_CUSTOM_FORMAT =
  "prompt_custom_format_instructions";
export const PROMPT_STORAGE_KEY_PREAMBLE = "prompt_preamble_template";
export const PROMPT_STORAGE_KEY_POSTAMBLE = "prompt_postamble_text";
export const PROMPT_STORAGE_KEY_DEFAULT_FORMAT =
  "prompt_default_format_instructions";

// --- Default Prompt Templates ---
export const DEFAULT_PREAMBLE_TEMPLATE = `
Treat input is raw HTML.
First, using only the web page content in input, and ignoring any information inside html tags,
determine the language the input is written in.
Second, prepare a summary of input containing no more than \${bulletWord} points
in the language you determined.
Third, use a JSON array of strings to return the summary.
Each JSON array element, which is a string, should represent a single bullet point.
 `;

export const DEFAULT_FORMAT_INSTRUCTIONS = `Each bullet point should be a concise markdown string,
starting with a bold tag-like marker and a colon,
and followed by description.

After providing bullet points for article summary,
add a bonus bullet point - your insights, assessment and comments,
and what should a mindful reader notice about this.
Call it **Summarizer Insight:**
`;

export const DEFAULT_POSTAMBLE_TEXT = `
Ensure the response is ONLY the JSON array.
Do not include any other text or formatting outside the JSON array.
You may use ONLY markdown for emphasis.
For example: "**Some bold text:** The market showed **significant** growth in Q3."
`;

// --- Chat Prompt Templates ---
export const CHAT_SYSTEM_PROMPT_TEMPLATE = `
Be concise and factual. We no longer need bullet points.
Format responses using Markdown where appropriate. Do not use any HTML.
Do NOT include any text, comments, or other content before or after your message. Do not output your deliberations.
IMPORTANT CONTEXT HANDLING:
Your first message in this chat contains an AI-generated summary of the provided HTML snippet.
This summary is a derivative interpretation and should *not* be considered the primary source of truth for answering questions *about the original article content*.
When the user asks about the article, base your answers primarily on the provided 'Context - Original HTML Snippet'.
Only refer to or discuss the initial summary if the user explicitly asks about the summary itself,
its specific points, or any insights it might contain that are not directly present in the original snippet (e.g., summarizer insights).
Do not repeat or update the initial summary unless specifically requested by the user.
Focus on answering the user's current question based on the provided article context.
When the user provides text preceded by "Translate the following text:", focus on translating *only* that provided text to the target language specified in the same message.
`;

export const CHAT_USER_CONTEXT_TEMPLATE = `Context - Original HTML Snippet:\n\`\`\`html\n\${domSnippet}\n\`\`\`\n\nInitial Summary:\n\${summary}`;

// Template for the user message when requesting translation via a flag click
// Now includes a placeholder for the text to be translated
export const CHAT_TRANSLATION_REQUEST_TEMPLATE = `Translate the following text to \${targetLanguage} and let's continue our conversation in that language: \n\n\${textToTranslate}`;

// --- Default Models (Labels Removed) ---
export const DEFAULT_MODEL_OPTIONS = [
  { id: "google/gemini-2.0-flash-lite-001" },
  { id: "anthropic/claude-3.7-sonnet" },
  { id: "deepseek/deepseek-r1" },
  { id: "openai/gpt-4.1-nano" },
  { id: "x-ai/grok-3-mini-beta" },
  { id: "google/gemini-2.5-flash-preview" },
];

// --- Default Languages for Pre-population ---
// These names must match names in languages.json
export const DEFAULT_PREPOPULATE_LANGUAGES = [
  "English",
  "Spanish",
  "Hebrew",
  "French",
];

// --- Paths ---
// These paths are relative to the extension root, used by background.js
export const LANGUAGES_JSON_PATH = "country-flags/languages.json";
export const SVG_PATH_PREFIX = "country-flags/svg/";
export const FALLBACK_SVG_PATH = "country-flags/svg/un.svg"; // Generic placeholder flag

// --- Other Defaults (Confirmed) ---
export const DEFAULT_SELECTED_SUMMARY_MODEL_ID =
  DEFAULT_MODEL_OPTIONS.length > 0 ? DEFAULT_MODEL_OPTIONS[0].id : "";
export const DEFAULT_SELECTED_CHAT_MODEL_ID =
  DEFAULT_MODEL_OPTIONS.length > 0 ? DEFAULT_MODEL_OPTIONS[0].id : "";
export const DEFAULT_BULLET_COUNT_NUM = 5; // As a number
export const DEFAULT_DEBUG_MODE = false;
export const DEFAULT_SUMMARY_HISTORY_COUNT = 20; // Max number of summaries to keep
export const DEFAULT_MAX_REQUEST_PRICE = 0.001; // Default max request price in USD
export const DEFAULT_CACHE_EXPIRY_DAYS = 7; // Default cache expiry for model and pricing data

// --- API & UI Related (Confirmed) ---
export const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions";
export const DEBOUNCE_DELAY = 300; // ms delay for input processing
export const MAX_RETRIES = 2; // Max retries for API calls
export const RETRY_DELAY = 1000; // ms delay between retries
export const REQUEST_TIMEOUT = 45000; // ms timeout for API requests (45 seconds)

// --- Error Messages (Confirmed) ---
export const ERROR_NO_API_KEY =
  "API key is missing. Please set it in the extension options.";
export const ERROR_NO_MODEL =
  "No model selected or specified. Please check extension options.";
export const ERROR_NETWORK =
  "Network error. Please check your connection and OpenRouter status.";
export const ERROR_TIMEOUT =
  "Request timed out. The model might be taking too long.";
export const ERROR_RATE_LIMIT =
  "Rate limit exceeded. Please try again later or check your OpenRouter plan.";
export const ERROR_API_KEY_INVALID =
  "Invalid API key. Please verify your OpenRouter key in the options.";
export const ERROR_UNKNOWN = "An unknown error occurred.";
export const ERROR_CONTENT_FILTERED = "Content filtered by API provider.";
export const ERROR_BAD_REQUEST = "Bad request. Check model ID and parameters."; // 400
export const ERROR_SERVER_ERROR =
  "OpenRouter server error. Please try again later."; // 500+
