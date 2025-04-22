// constants.js

console.log(`[LLM Constants] Loaded`);

// --- Prompt Storage Keys ---
export const PROMPT_STORAGE_KEY_CUSTOM_FORMAT =
  "prompt_custom_format_instructions";
export const PROMPT_STORAGE_KEY_PREAMBLE = "prompt_preamble_template";
export const PROMPT_STORAGE_KEY_POSTAMBLE = "prompt_postamble_text";
export const PROMPT_STORAGE_KEY_DEFAULT_FORMAT =
  "prompt_default_format_instructions";

// --- Default Prompt Templates ---
export const DEFAULT_PREAMBLE_TEMPLATE = `Treat Input is raw HTML.
Using US English, prepare a summary of input containing no more than \${bulletWord} points.`;

export const DEFAULT_POSTAMBLE_TEXT = `Format the entire result as a single JSON array of strings.
Example JSON array structure: ["This is a sample array.", "<b>Something important:</b> as HTML string.", "<b>Something else important:</b> as HTML string."]
Do not add any comments before or after the JSON array. Do not output your deliberations.
Just provide the JSON array  of strings as the result. Ensure the output is valid JSON.`;

export const DEFAULT_FORMAT_INSTRUCTIONS = `Each point should be a concise HTML string,
starting with a bold tag-like marker and a colon, followed by the description.
You may use ONLY the following HTML tags for emphasis: <b> for bold.
Do not use any other HTML tags (like <p>, <ul>, <li>, <br>, etc.).
For example: "<b>Key Finding:</b> The market showed <b>significant</b> growth in Q3."
After providing bullet points for article summary, add a bonus bullet point - your insights,
assessment and comments, and what should a mindful reader notice about this. Call it <b>Summarizer Insight:</b>.
Ensure this insight is included as the last string element within the single JSON array containing the summary points.
  `;

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
