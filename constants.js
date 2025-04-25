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
export const DEFAULT_PREAMBLE_TEMPLATE = `Treat input is raw HTML.
First, determine the language the input is written in.
Second, using the language you determined, prepare a summary of input containing no more than \${bulletWord} points.`; // Updated template

// --- Chat Prompt Templates ---
export const CHAT_SYSTEM_PROMPT_TEMPLATE = `Be concise and factual. We no longer need bullet points.
Format responses using Markdown where appropriate, do not use any HTML.
Return a single JSON array containing a single string element.
Do not add any comments before or after the JSON array. Do not output your deliberations.`;

export const CHAT_USER_CONTEXT_TEMPLATE = `Context - Original HTML Snippet:\n\`\`\`html\n\${domSnippet}\n\`\`\`\n\nInitial Summary:\n\${summary}`;

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
