// js/backgroundUtils.js
import {
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_POSTAMBLE_TEXT,
} from "../constants.js";

const numToWord = {
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

export function isTabClosedError(error) {
  if (!error || !error.message) return false;
  return (
    error.message.includes("Receiving end does not exist") ||
    error.message.includes("message channel closed")
  );
}

export function extractStringsFromMalformedJson(rawText, DEBUG = false) {
  if (!rawText || typeof rawText !== 'string') {
    if (DEBUG) console.log("[LLM Background Utils] Invalid input for extraction, returning empty array.");
    return [];
  }

  const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const extracted = [];

  for (let line of lines) {
    if (line.startsWith('"') || line.startsWith('*') || line.startsWith('-') || line.startsWith('**')) {
      line = line.replace(/^"|"$/g, '').replace(/,$/, '').trim();
      if (line.length > 0) {
        extracted.push(line);
      }
    }
  }

  if (DEBUG && extracted.length === 0) {
    console.log("[LLM Background Utils] No valid strings extracted from response.");
  }
  return extracted;
}

export function normalizeMarkdownInStrings(strings, DEBUG = false) {
  if (!Array.isArray(strings)) {
    if (DEBUG) console.log("[LLM Background Utils] Invalid input for markdown normalization, returning empty array.");
    return [];
  }

  const normalized = strings.map((str, index) => {
    if (typeof str !== 'string' || str.trim() === '') {
      return str; 
    }

    let normalizedStr = str.trim();
    
    if (normalizedStr.match(/^(\*|\*{3})([A-Za-z\s][^:]*:)/)) {
      normalizedStr = normalizedStr.replace(/^(\*|\*{3})/, '**');
      if (DEBUG) console.log(`[LLM Background Utils] Normalized markdown bold at start for string ${index}: "${normalizedStr.substring(0, 50)}..."`);
    } else if (normalizedStr.match(/^(\*|\*{3})(Summarizer\s+Insight:)/i)) {
      normalizedStr = normalizedStr.replace(/^(\*|\*{3})/, '**');
      if (DEBUG) console.log(`[LLM Background Utils] Normalized markdown bold for Summarizer Insight in string ${index}: "${normalizedStr.substring(0, 50)}..."`);
    }

    if (!normalizedStr.startsWith('**') && !normalizedStr.startsWith('- ') && !normalizedStr.startsWith('* ')) {
      if (normalizedStr.includes(':')) {
        const parts = normalizedStr.split(':', 2);
        if (parts[0].trim().length > 0 && parts[0].trim().length < 50) { 
          normalizedStr = `**${parts[0].trim()}:** ${parts[1].trim()}`;
          if (DEBUG) console.log(`[LLM Background Utils] Added default bold markdown for header in string ${index}: "${normalizedStr.substring(0, 50)}..."`);
        }
      }
    }
    return normalizedStr;
  });

  return normalized;
}

export function getSystemPrompt(
  bulletCount,
  customFormatInstructions,
  preambleTemplate,
  postambleText,
  defaultFormatInstructions,
) {
  const bcNum = Number(bulletCount) || 5;
  const word = numToWord[bcNum] || "five";
  const finalPreamble = (
    preambleTemplate?.trim() ? preambleTemplate : DEFAULT_PREAMBLE_TEMPLATE
  ).replace("${bulletWord}", word);
  const finalFormatInstructions = customFormatInstructions?.trim()
    ? customFormatInstructions
    : defaultFormatInstructions?.trim()
      ? defaultFormatInstructions
      : DEFAULT_FORMAT_INSTRUCTIONS;
  const finalPostamble = postambleText?.trim()
    ? postambleText
    : DEFAULT_POSTAMBLE_TEXT;
  return `${finalPreamble}\n${finalFormatInstructions}\n${finalPostamble}`;
}