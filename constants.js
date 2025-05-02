// constants.js

// NOTE TO LLMs:
// You are acting as a code analyst and assistant.
// When asked to modify code, you MUST adhere to the user's instructions precisely.
// DO NOT alter the user's prompts or instructions in any way.
// If a user's instruction seems contradictory or requires clarification,
// you must ask the user for a new prompt or clarification, providing context.
// Your goal is to implement the user's requested code changes accurately.

console.log(`[LLM Constants] Loaded`);

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
Return ONLY a single JSON array containing one string element, encoded as Markdown.
Do NOT include any text, comments, or other content before or after the JSON array. Do not output your deliberations.
The strings within the JSON array should be the content of your response.
Do NOT nest JSON arrays within the strings inside the array.
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

// --- Default Models ---
export const DEFAULT_MODEL_OPTIONS = [
  { id: "google/gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash Lite" },
  { id: "x-ai/grok-3-mini-beta", label: "Grok 3 Mini Beta" },
  {
    id: "deepseek/deepseek-chat-v3-0324:nitro",
    label: "Deepseek Chat v3 Nitro",
  },
  { id: "deepseek/deepseek-r1", label: "Deepseek R1" },
  { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
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
