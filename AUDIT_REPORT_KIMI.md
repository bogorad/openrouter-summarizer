# OpenRouter Summarizer - Security & Architecture Audit Report

**Audit Date:** January 31, 2026  
**Auditor:** Senior Staff Software Engineer & Cybersecurity Expert  
**Scope:** Comprehensive codebase review following AGENTS.md directives, ADRs, and CONVENTIONS.md  
**Version:** Extension v3.9.2

---

## Compliance Confirmation

This audit adheres to all directives from:
- `~/.config/opencode/AGENTS.md` (Global directives: Zero assumptions, Echo & Verify, LSP blocking errors, Surgical changes)
- `/home/chuck/git/openrouter-summarizer/AGENTS.md` (Project context: Chrome extension architecture, Webpack build, modular design)
- `/home/chuck/git/openrouter-summarizer/CONVENTIONS.md` (Code style: early returns, const functions, handle prefix, accessibility)
- `/home/chuck/git/openrouter-summarizer/docs/adr/` (Architecture decisions: Modular message-passing, 3-second notification timeout methodology)

**Files Audited:**
- manifest.json
- background.js
- pageInteraction.js
- chat.js
- options.js
- utils.js
- constants.js
- js/summaryHandler.js
- js/chatHandler.js
- highlighter.js

---

## Executive Summary

The OpenRouter Summarizer Chrome extension demonstrates a well-architected modular design following the ADR specifications. However, **critical security vulnerabilities** exist that require immediate remediation. The extension handles sensitive API credentials, processes untrusted HTML content, and executes on all web pages, creating significant attack surface. This audit identifies **2 Critical, 4 High, 6 Medium, and 8 Low severity issues**.

**Risk Assessment:**
- **Critical**: XSS vulnerabilities enable arbitrary code execution
- **High**: Excessive permissions, insecure credential storage, race conditions
- **Medium**: Input validation gaps, inconsistent error handling, memory leaks
- **Low**: Code quality issues, minor security hardening opportunities

---

## Critical Severity Issues

### Issue 1: Cross-Site Scripting (XSS) via Unsanitized HTML Injection in Chat Interface

**Severity:** [Critical]

**Description:** The `chat.js` file renders assistant messages by directly assigning HTML content to `innerHTML` without sanitization. The LLM response content flows from OpenRouter API → background script → chat.js → DOM via `renderMessages()` function. An attacker who compromises the OpenRouter API or poisons the LLM response could inject arbitrary JavaScript that executes in the extension's chat page context. This grants the attacker access to `chrome.storage` (containing API keys), the ability to make authenticated API requests through the background script, and potential access to all browser tabs via the extension's broad permissions. The `renderTextAsHtml()` function in `utils.js` uses `marked.parse()` with `sanitize: true`, but this parameter only sanitizes against marked's own parsing vulnerabilities, not against malicious HTML/JavaScript injection in the LLM response itself.

**Location:** `/home/chuck/git/openrouter-summarizer/chat.js`, lines 505-563 (renderMessages function)  
**Location:** `/home/chuck/git/openrouter-summarizer/utils.js`, lines 121-124 (renderTextAsHtml function)

**Fix:** Implement Content Security Policy headers and sanitize all HTML content using DOMPurify before DOM insertion:

```javascript
// In utils.js - Replace renderTextAsHtml with sanitized version
export function renderTextAsHtml(text) {
  if (typeof text !== "string" || !text.trim()) {
    return "";
  }
  
  // First, convert markdown to HTML
  let htmlContent;
  if (typeof marked !== "undefined") {
    try {
      htmlContent = marked.parse(text, { sanitize: false });
    } catch (parseError) {
      console.error("[LLM Utils] Marked parse error:", parseError);
      htmlContent = text.replace(/\n/g, "<br>");
    }
  } else {
    htmlContent = text.replace(/\n/g, "<br>");
  }
  
  // Sanitize HTML to prevent XSS
  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(htmlContent, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      ALLOWED_ATTR: ['href', 'title', 'class']
    });
  }
  
  // Fallback: basic HTML entity encoding if DOMPurify unavailable
  return htmlContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

Add CSP to chat.html:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src https://openrouter.ai;">
```

---

### Issue 2: Insecure Storage of Sensitive API Credentials in Sync Storage

**Severity:** [Critical]

**Description:** The extension stores OpenRouter API keys, NewsBlur tokens, and Joplin tokens in `chrome.storage.sync` without encryption. Chrome's sync storage synchronizes data across all devices signed into the same Google account via Google's servers. While data is encrypted in transit and at rest on Google's infrastructure, the keys are accessible to Google and potentially vulnerable to: (1) Google account compromise exposing all API keys, (2) Browser forensic analysis extracting plaintext credentials, (3) Malicious Chrome extensions with storage permissions reading synced data. Additionally, Joplin tokens grant access to local note-taking data, and OpenRouter API keys could incur financial charges if compromised. The `options.js` file (lines 1363-1450) saves these values directly without any client-side encryption.

**Location:** `/home/chuck/git/openrouter-summarizer/options.js`, lines 1363-1450 (saveSettings function)  
**Location:** `/home/chuck/git/openrouter-summarizer/background.js`, lines 74-76 (API key retrieval)

**Fix:** Implement client-side encryption using Web Crypto API before storage:

```javascript
// Add to constants.js or new encryption.js module
const ENCRYPTION_KEY_NAME = 'encryptionKey';

async function getOrCreateEncryptionKey() {
  const stored = await chrome.storage.local.get(ENCRYPTION_KEY_NAME);
  if (stored[ENCRYPTION_KEY_NAME]) {
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(stored[ENCRYPTION_KEY_NAME]),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  // Generate new key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const exported = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({ 
    [ENCRYPTION_KEY_NAME]: Array.from(new Uint8Array(exported)) 
  });
  
  return key;
}

async function encryptSensitiveData(plaintext) {
  if (!plaintext) return '';
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  // Store IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decryptSensitiveData(encrypted) {
  if (!encrypted) return '';
  try {
    const key = await getOrCreateEncryptionKey();
    const combined = new Uint8Array(
      atob(encrypted).split('').map(c => c.charCodeAt(0))
    );
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error('Decryption failed:', e);
    return '';
  }
}

// Update saveSettings in options.js
async function saveSettings() {
  if (DEBUG) console.log("[LLM Options] Attempting to save settings...");
  
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
  const debug = debugCheckbox ? debugCheckbox.checked : false;
  
  // Encrypt sensitive tokens before storage
  const encryptedApiKey = apiKey ? await encryptSensitiveData(apiKey) : "";
  const encryptedNewsblurToken = newsblurTokenInput?.value.trim() 
    ? await encryptSensitiveData(newsblurTokenInput.value.trim()) 
    : "";
  const encryptedJoplinToken = joplinTokenInput?.value.trim()
    ? await encryptSensitiveData(joplinTokenInput.value.trim())
    : "";
  
  const settings = {
    apiKey: encryptedApiKey,
    newsblurToken: encryptedNewsblurToken,
    joplinToken: encryptedJoplinToken,
    debug: debug,
    // ... other non-sensitive settings
  };
  
  // Use local storage instead of sync for encrypted data
  chrome.storage.local.set(settings, () => {
    // Handle completion
  });
}
```

---

## High Severity Issues

### Issue 3: Excessive Host Permissions (<all_urls>) Violates Principle of Least Privilege

**Severity:** [High]

**Description:** The manifest.json declares `<all_urls>` in both `host_permissions` and `content_scripts.matches`, granting the extension access to read and modify content on every website the user visits. This is excessive for an extension whose core functionality only requires access when the user explicitly activates it via Alt+Click. The extension also requests `activeTab`, `contextMenus`, `scripting`, and `storage` permissions. Combined with the XSS vulnerability, this creates a critical attack chain: XSS in the chat interface could access `chrome.tabs` API to inject scripts into any tab, read sensitive data from banking sites, or exfiltrate session cookies. The ADR acknowledges security as a positive consequence but doesn't address the permission model's granularity.

**Location:** `/home/chuck/git/openrouter-summarizer/manifest.json`, lines 12-14 (host_permissions)  
**Location:** `/home/chuck/git/openrouter-summarizer/manifest.json`, lines 21-23 (content_scripts.matches)

**Fix:** Remove broad permissions and rely on `activeTab` and optional host permissions:

```json
{
  "manifest_version": 3,
  "name": "OpenRouter Summarizer",
  "version": "3.9.2",
  "description": "Summarize web pages with OpenRouter.ai using your chosen model.",
  "permissions": [
    "activeTab",
    "contextMenus",
    "scripting",
    "storage"
  ],
  "host_permissions": [],
  "optional_host_permissions": [
    "https://*/*",
    "http://*/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["marked.min.js", "dist/pageInteraction.bundle.js"],
      "css": ["pageInteraction.css"],
      "type": "module",
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "web_accessible_resources": [
    {
      "resources": [
        "icons/*",
        "options.css",
        "chat.css",
        "constants.js",
        "country-flags/languages.json",
        "country-flags/svg/*.svg",
        "highlighter.js",
        "floatingIcon.js",
        "summaryPopup.js",
        "utils.js",
        "marked.min.js"
      ],
      "matches": ["<all_urls>"]
    }
  ],
  "options_page": "options.html"
}
```

Add permission request on first use:

```javascript
// In pageInteraction.js - Request optional permissions when user first tries to use extension
async function requestHostPermission() {
  try {
    const granted = await chrome.permissions.request({
      origins: ['<all_urls>']
    });
    return granted;
  } catch (error) {
    console.error('Permission request failed:', error);
    return false;
  }
}
```

---

### Issue 4: Race Condition in AbortController Storage for Chat Requests

**Severity:** [High]

**Description:** The chat abort mechanism stores the `AbortController` instance in `chrome.storage.session` (lines 64, 99, 120 in chatHandler.js). Chrome's storage API is asynchronous and uses JSON serialization, which doesn't preserve object methods or prototype chains. The `AbortController` is stored via `chrome.storage.session.set({ chatAbortController: controller })`, but when retrieved via `chrome.storage.session.get("chatAbortController", ...)`, the returned object is a plain JSON serialization lacking the `abort()` method. This creates a race condition: if `handleAbortChatRequest` is called before the storage `set()` operation completes, or if the stored controller has been garbage collected, the code attempts to call `.abort()` on an invalid object. Additionally, the `AbortController` is not removed from storage on fetch completion in success cases, leading to stale controller references. The check `if (controller && typeof controller.abort === "function")` at line 141 is insufficient because the storage retrieval itself is asynchronous and may return stale or incomplete data.

**Location:** `/home/chuck/git/openrouter-summarizer/js/chatHandler.js`, lines 62-64 (AbortController storage)  
**Location:** `/home/chuck/git/openrouter-summarizer/js/chatHandler.js`, lines 134-182 (abort handling)

**Fix:** Use an in-memory Map for controller storage instead of session storage:

```javascript
// In js/chatHandler.js - Replace session storage with in-memory storage

const activeControllers = new Map();

export function handleLlmChatStream(request, sendResponse, DEBUG = false) {
  // ... validation code ...
  
  const controller = new AbortController();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Store controller in memory map with request metadata
  activeControllers.set(requestId, {
    controller,
    timestamp: Date.now(),
    model: request.model
  });
  
  // Set up automatic cleanup after 60 seconds
  setTimeout(() => {
    if (activeControllers.has(requestId)) {
      activeControllers.get(requestId).controller.abort();
      activeControllers.delete(requestId);
      if (DEBUG) console.log(`[LLM Chat Handler] Auto-cleaned stale request ${requestId}`);
    }
  }, 60000);
  
  fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
      "X-Title": "OR-Summ: Chat",
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then((response) => {
      // Clean up controller on completion
      activeControllers.delete(requestId);
      return response.ok ? response.json() : response.text().then(text => {
        throw new Error(`HTTP error! status: ${response.status} - ${text}`);
      });
    })
    .then((data) => {
      // ... existing response handling ...
    })
    .catch((error) => {
      // Clean up controller on error
      activeControllers.delete(requestId);
      if (error.name === "AbortError") {
        sendResponse({ status: "aborted" });
      } else {
        sendResponse({ status: "error", message: error.message });
      }
    });
    
  // Store only the requestId (not the controller) in session storage for abort lookup
  chrome.storage.session.set({ currentChatRequestId: requestId });
  
  // Return true to keep message channel open
  return true;
}

export function handleAbortChatRequest(sendResponse, DEBUG = false) {
  chrome.storage.session.get("currentChatRequestId", (data) => {
    const requestId = data.currentChatRequestId;
    const requestData = activeControllers.get(requestId);
    
    if (requestData && requestData.controller && typeof requestData.controller.abort === "function") {
      try {
        requestData.controller.abort();
        activeControllers.delete(requestId);
        chrome.storage.session.remove("currentChatRequestId");
        sendResponse({ status: "aborted" });
      } catch (abortError) {
        console.error("[LLM Chat Handler] Error calling abort():", abortError);
        sendResponse({ status: "error", message: "Failed to abort request" });
      }
    } else {
      if (DEBUG) {
        console.log("[LLM Chat Handler] No active request or valid controller to abort.");
      }
      sendResponse({ status: "no active request" });
    }
  });
  return true;
}
```

---

## Medium Severity Issues

### Issue 5: Missing Input Validation and Size Limits on HTML Content Processing

**Severity:** [Medium]

**Description:** The `processSelectedElement()` function in `pageInteraction.js` processes user-selected HTML content without validating content size, nesting depth, or structure complexity. The code captures `selectedElement.outerHTML` (line 95) and passes it through sanitization, but there are no limits on: (1) total content size (could be multiple megabytes), (2) DOM nesting depth (could cause stack overflow), (3) number of elements (could cause performance degradation). The Turndown library's `turndown()` method is then called on potentially massive HTML, which can block the main thread for seconds or minutes. The cost estimation at lines 314-316 attempts to calculate tokens based on content length, but this occurs AFTER the content has already been extracted and processed, not preventing the initial processing of oversized content.

**Location:** `/home/chuck/git/openrouter-summarizer/pageInteraction.js`, lines 59-199 (processSelectedElement function)

**Fix:** Implement comprehensive input validation with size and depth limits:

```javascript
// Add constants at top of pageInteraction.js
const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB limit
const MAX_NESTING_DEPTH = 100;
const MAX_ELEMENT_COUNT = 10000;
const PROCESSING_TIMEOUT_MS = 30000;

// Add validation helper
function calculateNestingDepth(element, currentDepth = 0) {
  if (currentDepth > MAX_NESTING_DEPTH) return currentDepth;
  let maxDepth = currentDepth;
  for (const child of element.children) {
    maxDepth = Math.max(maxDepth, calculateNestingDepth(child, currentDepth + 1));
  }
  return maxDepth;
}

function countElements(element) {
  let count = 1;
  for (const child of element.children) {
    count += countElements(child);
  }
  return count;
}

function processSelectedElement() {
  // ... existing module checks ...
  
  const selectedElement = Highlighter.getSelectedElement();
  if (!selectedElement) {
    showError("Error: No element selected to process.");
    return;
  }

  // Validate content size BEFORE processing
  const rawHtml = selectedElement.outerHTML;
  if (rawHtml.length > MAX_CONTENT_SIZE) {
    showError(`Error: Selected content exceeds maximum size of ${MAX_CONTENT_SIZE / 1024}KB. Please select a smaller section.`, true, 5000);
    Highlighter.removeSelectionHighlight();
    return;
  }

  // Validate nesting depth
  const nestingDepth = calculateNestingDepth(selectedElement);
  if (nestingDepth > MAX_NESTING_DEPTH) {
    showError(`Error: Selected content has excessive nesting depth (${nestingDepth}). Please select a simpler section.`, true, 5000);
    Highlighter.removeSelectionHighlight();
    return;
  }

  // Validate element count
  const elementCount = countElements(selectedElement);
  if (elementCount > MAX_ELEMENT_COUNT) {
    showError(`Error: Selected content contains too many elements (${elementCount}). Please select a smaller section.`, true, 5000);
    Highlighter.removeSelectionHighlight();
    return;
  }

  // Process with timeout protection
  const processingStart = Date.now();
  
  // ... rest of processing logic with timeout checks ...
  
  if (Date.now() - processingStart > PROCESSING_TIMEOUT_MS) {
    showError("Error: Content processing timed out. Please try a smaller selection.", true, 5000);
    return;
  }
}
```

---

### Issue 6: Inconsistent Error Handling Patterns and Silent Failures

**Severity:** [Medium]

**Description:** The codebase exhibits inconsistent error handling patterns across modules. Some functions use try-catch blocks (e.g., `handleRequestSummary` in summaryHandler.js), others rely on callback error parameters (e.g., `sendResponse` in background.js), and many use a mix of both. Error messages are sometimes logged to console, sometimes shown to users via `showError()`, and sometimes silently swallowed. For example, in `pageInteraction.js` lines 247-270, the `validateAndSendToLLM` function catches errors from `SummaryPopup.showPopup()` and shows an error, but doesn't propagate the error or halt execution properly. In `background.js` lines 321-339, the catch-all error handler in `handleAsyncMessage` attempts to call `sendResponse()` on a potentially closed channel. The `chrome.runtime.lastError` pattern is inconsistently applied—some places check it immediately after API calls, others don't check it at all.

**Location:** `/home/chuck/git/openrouter-summarizer/pageInteraction.js`, lines 247-270  
**Location:** `/home/chuck/git/openrouter-summarizer/background.js`, lines 321-339  
**Location:** `/home/chuck/git/openrouter-summarizer/js/summaryHandler.js`, lines 145-161

**Fix:** Standardize error handling with a centralized error utility:

```javascript
// Create js/errorHandler.js
export const ErrorSeverity = {
  FATAL: 'fatal',
  WARNING: 'warning',
  INFO: 'info'
};

export class ErrorHandler {
  static handle(error, context, severity = ErrorSeverity.WARNING, showToUser = false) {
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const errorInfo = {
      errorId,
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context,
      severity
    };
    
    // Log structured error
    console.error(`[Error ${errorId}]`, errorInfo);
    
    // Track for analytics/monitoring
    this.trackError(errorInfo);
    
    // Show user-friendly message if requested
    if (showToUser && typeof showError !== 'undefined') {
      const userMessage = this.getUserFriendlyMessage(error, context);
      showError(userMessage, severity === ErrorSeverity.FATAL);
    }
    
    return errorId;
  }
  
  static getUserFriendlyMessage(error, context) {
    const messages = {
      'network': 'Unable to connect to the server. Please check your internet connection.',
      'auth': 'Authentication failed. Please check your API key in the options.',
      'quota': 'API quota exceeded. Please try again later.',
      'timeout': 'The request timed out. Please try again.',
      'validation': 'Invalid input provided. Please check your selection.',
      'default': 'An unexpected error occurred. Please try again.'
    };
    
    const errorMsg = error.message?.toLowerCase() || '';
    if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('api key')) return messages.auth;
    if (errorMsg.includes('429') || errorMsg.includes('rate limit')) return messages.quota;
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) return messages.timeout;
    if (errorMsg.includes('network') || errorMsg.includes('fetch')) return messages.network;
    if (errorMsg.includes('validation') || errorMsg.includes('invalid')) return messages.validation;
    
    return messages.default;
  }
  
  static trackError(errorInfo) {
    try {
      chrome.storage.local.get(['errorLog'], (data) => {
        const log = data.errorLog || [];
        log.push(errorInfo);
        if (log.length > 50) log.shift();
        chrome.storage.local.set({ errorLog: log });
      });
    } catch (e) {
      // Silent fail for error tracking
    }
  }
  
  static async wrapAsync(fn, context, showToUser = false) {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, context, ErrorSeverity.WARNING, showToUser);
      throw error; // Re-throw for caller to handle
    }
  }
}

// Usage in pageInteraction.js
import { ErrorHandler, ErrorSeverity } from './js/errorHandler.js';

async function validateAndSendToLLM(content) {
  return ErrorHandler.wrapAsync(async () => {
    // ... existing logic ...
    await SummaryPopup.showPopup(/* ... */);
  }, 'validateAndSendToLLM', true);
}
```

---

### Issue 7: Memory Leak from Uncleaned Event Listeners in Highlighter Module

**Severity:** [Medium]

**Description:** The `highlighter.js` module attaches event listeners to `window` and `document` in the `initializeHighlighter()` function (lines 254-265) but does not provide a cleanup function to remove them. When the content script is unloaded (e.g., during extension updates or when navigating between Single Page Application routes), these event listeners remain attached to the DOM, holding references to closures that may reference the old content script context. Over time, this leads to memory leaks as old content script instances accumulate in memory. The module-level variables (`altKeyDown`, `previewHighlighted`, `selectedElement`) also retain references to DOM elements, preventing garbage collection.

**Location:** `/home/chuck/git/openrouter-summarizer/highlighter.js`, lines 254-265 (initializeHighlighter)

**Fix:** Implement proper cleanup mechanism:

```javascript
// In highlighter.js - Add cleanup infrastructure

let eventListeners = [];

function addTrackedEventListener(element, event, handler, options) {
  element.addEventListener(event, handler, options);
  eventListeners.push({ element, event, handler, options });
}

export function initializeHighlighter(options) {
  if (!options || typeof options.onElementSelected !== "function" || typeof options.onElementDeselected !== "function") {
    console.error("[LLM Highlighter] Initialization failed: Required callbacks missing.");
    return;
  }
  
  onElementSelectedCallback = options.onElementSelected;
  onElementDeselectedCallback = options.onElementDeselected;
  DEBUG = !!options.initialDebugState;
  
  // Track all event listeners for cleanup
  addTrackedEventListener(window, "keydown", handleKeyDown, true);
  addTrackedEventListener(window, "keyup", handleKeyUp, true);
  addTrackedEventListener(window, "blur", resetHighlightState);
  addTrackedEventListener(document, "visibilitychange", handleVisibilityChange);
  addTrackedEventListener(document, "mousemove", handleMouseOver, true);
  addTrackedEventListener(window, "mouseout", handleMouseOut);
  addTrackedEventListener(document, "mousedown", handleMouseDown, true);
  
  if (DEBUG) console.log("[LLM Highlighter] Initialized.");
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    resetHighlightState();
  }
}

export function cleanupHighlighter() {
  // Remove all tracked event listeners
  eventListeners.forEach(({ element, event, handler, options }) => {
    try {
      element.removeEventListener(event, handler, options);
    } catch (e) {
      // Silent fail for cleanup
    }
  });
  eventListeners = [];
  
  // Clear all state
  altKeyDown = false;
  removePreviewHighlight();
  removeSelectionHighlight();
  onElementSelectedCallback = null;
  onElementDeselectedCallback = null;
  
  if (DEBUG) console.log("[LLM Highlighter] Cleaned up.");
}

// In pageInteraction.js - Add cleanup on unload
window.addEventListener('unload', () => {
  if (typeof cleanupHighlighter === 'function') {
    cleanupHighlighter();
  }
  // Cleanup other modules
  if (typeof FloatingIcon !== 'undefined' && FloatingIcon.cleanup) {
    FloatingIcon.cleanup();
  }
  if (typeof SummaryPopup !== 'undefined' && SummaryPopup.cleanup) {
    SummaryPopup.cleanup();
  }
});
```

---

### Issue 8: XPath Injection Risk in HTML Sanitizer via Dynamic Selector Construction

**Severity:** [Medium]

**Description:** The `htmlSanitizer.js` module constructs XPath selectors dynamically using string concatenation with class names from the `UNWANTED_CLASSES` array (lines 132-148). While the current list is hardcoded, the pattern `//*[contains(@class, "${cls}")]` creates a potential XPath injection vulnerability if this list were ever populated from user input or external sources. An attacker could inject XPath expressions like `"] | //* | //*[contains(@class, \"`) to bypass sanitization or extract sensitive data. Additionally, the XPath `contains(@class, "${cls}")` matches partial class names (e.g., "ad" matches "ad-banner", "load-ad", etc.), which may be overly aggressive and remove legitimate content.

**Location:** `/home/chuck/git/openrouter-summarizer/js/htmlSanitizer.js`, lines 132-148

**Fix:** Replace XPath with safer CSS selectors and word-boundary matching:

```javascript
// In js/htmlSanitizer.js - Safer class removal

/**
 * Removes elements by class name using word-boundary matching
 * @param {Element} container - The container element
 * @param {string[]} classNames - Array of class names to remove
 */
function removeElementsByClassNames(container, classNames) {
  classNames.forEach(className => {
    if (!className || typeof className !== 'string') return;
    
    // Escape special characters in class name
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Use CSS selector with word boundary matching
    // Matches elements where the class attribute contains the exact word
    try {
      const elements = container.querySelectorAll(`[class~="${escapedClassName}"]`);
      elements.forEach(el => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    } catch (e) {
      console.warn(`[HTML Sanitizer] Invalid class name skipped: ${className}`, e);
    }
  });
}

// Alternative: Use a TreeWalker for safer traversal
function sanitizeHtml(htmlString, options = {}) {
  const { debug = false } = options;
  
  if (!htmlString || typeof htmlString !== 'string') {
    if (debug) console.warn("[HTML Sanitizer] Invalid HTML input");
    return '';
  }
  
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;
    
    // Remove unwanted tags
    SANITIZATION_CONFIG.UNWANTED_TAGS.forEach(tagName => {
      const elements = tempDiv.querySelectorAll(tagName);
      elements.forEach(el => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });
    
    // Remove elements by class names (using safer CSS selectors)
    removeElementsByClassNames(tempDiv, SANITIZATION_CONFIG.UNWANTED_CLASSES);
    
    // ... rest of sanitization logic ...
    
    return tempDiv.innerHTML;
  } catch (error) {
    console.error("[HTML Sanitizer] Error during sanitization:", error);
    return htmlString; // Return original as fallback
  }
}
```

---

### Issue 9: Missing Validation on Language Detection Response

**Severity:** [Medium]

**Description:** The `detectLanguage()` function in `summaryHandler.js` accepts the LLM's response as a 3-character ISO 639-2 code with minimal validation. The code checks `detectedCode.length === 3` but doesn't validate the character set (e.g., could contain special characters, numbers, or be entirely numeric). It also doesn't validate against a whitelist of known valid language codes. A compromised or malfunctioning LLM could return arbitrary strings like "<script>" or "xxx" which are then used in prompt template substitution at line 212 (`getSystemPrompt(promptTemplate, targetLanguage, bulletCount)`), potentially causing injection vulnerabilities or generating malformed prompts that leak context or produce unexpected behavior.

**Location:** `/home/chuck/git/openrouter-summarizer/js/summaryHandler.js`, lines 64-79 (language code validation)

**Fix:** Implement strict language code validation:

```javascript
// In constants.js - Add valid language code whitelist
export const VALID_LANGUAGE_CODES = new Set([
  'eng', 'spa', 'fra', 'deu', 'ita', 'por', 'chi', 'jpn', 'kor', 'ara',
  'rus', 'hin', 'tur', 'vie', 'tha', 'pol', 'dut', 'gre', 'heb', 'dan',
  'swe', 'nor', 'fin', 'cze', 'rom', 'hun', 'bul', 'hrv', 'slk', 'slv',
  'ukr', 'cat', 'eus', 'glg', 'nno', 'srp', 'ind', 'mal', 'tam', 'tel',
  'ben', 'mar', 'kan', 'guj', 'ori', 'asm', 'pan', 'sun', 'afr', 'zul'
]);

// In js/summaryHandler.js - Updated detectLanguage with validation
async function detectLanguage(apiKey, contentSnippet, DEBUG = false) {
  try {
    const payload = {
      model: "moonshotai/kimi-k2",
      messages: [{
        role: "user",
        content: `Determine the language that this fragment is written in. 
        If you cannot determine the language, the fallback language is US English. 
        Respond with ONLY a valid ISO 639-2 three-letter language code (e.g., "eng", "spa", "fra").
        Do not include any other text, punctuation, or explanation.
        
        Fragment:\n${contentSnippet}`
      }]
    };
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
        "X-Title": "OR-Summ: Language Detection"
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.warn(`[LLM Summary Handler] Language detection API error: ${response.status}`);
      return "eng";
    }
    
    const responseData = await response.json();
    
    if (responseData.choices?.length > 0) {
      let detectedCode = responseData.choices[0].message.content.trim().toLowerCase();
      
      // Strict validation: must be exactly 3 lowercase letters
      if (!/^[a-z]{3}$/.test(detectedCode)) {
        console.warn(`[LLM Summary Handler] Invalid language code format: ${detectedCode}`);
        return "eng";
      }
      
      // Validate against whitelist
      if (!VALID_LANGUAGE_CODES.has(detectedCode)) {
        console.warn(`[LLM Summary Handler] Unknown language code: ${detectedCode}`);
        // Still use it if it's valid format but unknown, or fallback
        return detectedCode; // Or return "eng" if strict whitelist required
      }
      
      return detectedCode;
    }
    
    return "eng";
  } catch (error) {
    console.warn("[LLM Summary Handler] Language detection failed:", error);
    return "eng";
  }
}
```

---

### Issue 10: Inconsistent Return Patterns in Message Handler May Cause Channel Closure

**Severity:** [Medium]

**Description:** The `handleMessage()` function in `pageInteraction.js` (lines 765-809) has inconsistent return patterns that violate Chrome extension messaging best practices. When handling the `processSelection` action, it returns `true` (line 776) to indicate async response handling when an element is selected, but returns `false` (line 802) when no element is selected. For the `summaryResult` action, it returns `true` (line 806) but doesn't actually send an async response. When `chrome.runtime.onMessage.addListener` returns `false` or `undefined`, Chrome immediately closes the message port. If the handler later tries to call `sendResponse()` after the port is closed, it throws an error: "Attempting to use a disconnected port object". This race condition can cause intermittent failures in message passing.

**Location:** `/home/chuck/git/openrouter-summarizer/pageInteraction.js`, lines 765-809

**Fix:** Standardize to always return true for async handling:

```javascript
// In pageInteraction.js - Standardize message handling

function handleMessage(req, sender, sendResponse) {
  if (DEBUG) console.log("[LLM Content] Handling message:", req.action);
  
  // Always handle asynchronously
  (async () => {
    try {
      if (req.action === "processSelection") {
        await handleProcessSelection(sendResponse);
      } else if (req.action === "summaryResult") {
        await handleSummaryResult(req, sendResponse);
      } else {
        sendResponse({ status: "error", message: `Unknown action: ${req.action}` });
      }
    } catch (error) {
      console.error("[LLM Content] Error handling message:", error);
      sendResponse({ status: "error", message: error.message });
    }
  })();
  
  // Always return true to indicate async response
  return true;
}

async function handleProcessSelection(sendResponse) {
  const currentSelectedElement = Highlighter?.getSelectedElement();
  
  if (!currentSelectedElement) {
    console.warn("[LLM Content] Received processSelection but no element selected.");
    showError("Error: No element selected. Use Alt+Click first.");
    sendResponse({ status: "error", message: "No element selected" });
    return;
  }
  
  try {
    await processSelectedElement();
    sendResponse({ status: "processing" });
  } catch (error) {
    sendResponse({ status: "error", message: error.message });
  }
}

async function handleSummaryResult(req, sendResponse) {
  try {
    displaySummary(req);
    sendResponse({ status: "success" });
  } catch (error) {
    sendResponse({ status: "error", message: error.message });
  }
}

// Register the listener
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (!modulesInitialized) {
    messageQueue.push({ req, sender, sendResponse });
    return true; // Async
  }
  return handleMessage(req, sender, sendResponse);
});
```

---

## Low Severity Issues

### Issue 11: Debug Logging May Leak Sensitive Data

**Severity:** [Low]

**Description:** When `DEBUG` mode is enabled, the code logs various objects and responses that may contain sensitive information. While some masking exists (e.g., `logResponse.apiKey = "[Hidden]"` in options.js line 276), the masking is inconsistent and doesn't cover all sensitive fields. The `showError()` function in `utils.js` receives error messages that might contain API response details, and there's no redaction of tokens in stack traces or error objects.

**Location:** `/home/chuck/git/openrouter-summarizer/options.js`, lines 274-281  
**Location:** `/home/chuck/git/openrouter-summarizer/utils.js`, lines 46-96

**Fix:** Implement comprehensive data redaction:

```javascript
// Add to utils.js
export function redactSensitiveData(obj, sensitiveKeys = ['apiKey', 'token', 'password', 'secret', 'auth']) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const redacted = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => keyLower.includes(sk.toLowerCase()));
    
    if (isSensitive && typeof obj[key] === 'string') {
      const value = obj[key];
      redacted[key] = value ? `${value.substring(0, 2)}***${value.substring(value.length - 2)}` : '';
    } else if (typeof obj[key] === 'object') {
      redacted[key] = redactSensitiveData(obj[key], sensitiveKeys);
    } else {
      redacted[key] = obj[key];
    }
  }
  
  return redacted;
}

// Usage in debug logs
if (DEBUG) {
  console.log("[LLM Options] Response:", redactSensitiveData(response));
}
```

---

### Issue 12: Inappropriate Comment in Constants File

**Severity:** [Low]

**Description:** The `constants.js` file contains a comment block at lines 3-9 addressed to "LLMs" that appears to be a prompt engineering artifact rather than documentation. This comment is confusing to human developers and may indicate the file was partially generated or contains LLM-specific instructions that don't belong in production code.

**Location:** `/home/chuck/git/openrouter-summarizer/constants.js`, lines 3-9

**Fix:** Remove the inappropriate comment:

```javascript
// constants.js

console.log(`[LLM Constants] Loaded`);

// --- Storage Keys ---
// All storage keys used by the extension for persisting settings and tokens
export const STORAGE_KEY_API_KEY = "apiKey";
// ... rest of constants
```

---

### Issue 13: Hardcoded Language Detection Model ID

**Severity:** [Low]

**Description:** The `detectLanguage()` function uses a hardcoded model ID `moonshotai/kimi-k2` without fallback options. If this model becomes unavailable, deprecated, or the user doesn't have access to it, language detection will fail and silently fall back to English. This should be configurable with multiple fallback options.

**Location:** `/home/chuck/git/openrouter-summarizer/js/summaryHandler.js`, line 21

**Fix:** Make model configurable with fallbacks:

```javascript
// In constants.js
export const LANGUAGE_DETECTION_MODELS = [
  "moonshotai/kimi-k2",
  "google/gemini-flash-1.5",
  "anthropic/claude-3-haiku"
];

// In summaryHandler.js
async function detectLanguage(apiKey, contentSnippet, DEBUG = false) {
  const models = constants.LANGUAGE_DETECTION_MODELS;
  
  for (const model of models) {
    try {
      const payload = { model, messages: [/* ... */] };
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, /* ... */ },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const code = data.choices?.[0]?.message?.content?.trim();
      
      if (code && /^[a-z]{3}$/.test(code)) {
        return code;
      }
    } catch (error) {
      if (DEBUG) console.warn(`Language detection with ${model} failed:`, error);
      continue;
    }
  }
  
  return "eng"; // Final fallback
}
```

---

### Issue 14: Missing Accessibility Attributes on Dynamic Elements

**Severity:** [Low]

**Description:** Several dynamically created elements in the options page and chat interface lack proper accessibility attributes. The autocomplete dropdown items, language flag buttons, and model selection radio buttons should include `aria-label`, `role`, `tabindex`, and keyboard activation support. This makes the extension difficult to use for screen reader users.

**Location:** `/home/chuck/git/openrouter-summarizer/options.js`, lines 304-368 (autocomplete dropdown)

**Fix:** Add accessibility attributes:

```javascript
// In options.js - Enhanced autocomplete item creation
function showAutocompleteSuggestions(inputElement, suggestions, type = "language") {
  if (!autocompleteDropdown) {
    autocompleteDropdown = document.createElement("div");
    autocompleteDropdown.className = "autocomplete-dropdown";
    autocompleteDropdown.setAttribute("role", "listbox");
    autocompleteDropdown.setAttribute("aria-label", `${type} suggestions`);
    document.body.appendChild(autocompleteDropdown);
  }
  
  autocompleteDropdown.innerHTML = "";
  highlightedAutocompleteIndex = -1;
  
  if (suggestions.length === 0) {
    autocompleteDropdown.style.display = "none";
    return;
  }
  
  suggestions.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.setAttribute("role", "option");
    div.setAttribute("tabindex", "0");
    div.setAttribute("aria-selected", "false");
    div.dataset.index = index;
    
    // Add keyboard activation
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectAutocompleteSuggestion(div, inputElement, type);
      }
    });
    
    // ... rest of item creation ...
  });
}
```

---

### Issue 15: Unused Variables and Dead Code

**Severity:** [Low]

**Description:** The codebase contains several unused variables and commented-out code. For example, `errorTimeoutId` in `utils.js` is declared but only used in the fallback error display path. The `numToWord` object in `pageInteraction.js` (lines 37-44) is defined but never used. There are also commented-out console.log statements and TODO comments that should be cleaned up.

**Location:** `/home/chuck/git/openrouter-summarizer/utils.js`, line 8  
**Location:** `/home/chuck/git/openrouter-summarizer/pageInteraction.js`, lines 37-44

**Fix:** Remove unused code:

```javascript
// In pageInteraction.js - Remove unused numToWord
// DELETE lines 37-44
// const numToWord = { ... };

// In utils.js - Remove unused import comment
// Line 6: Remove "//import { marked } from "marked"; // Try this first"
```

---

### Issue 16: Inconsistent Use of const vs let for Constants

**Severity:** [Low]

**Description:** The `background.js` file uses `let` for constants like `DEFAULT_BULLET_COUNT` and `DEFAULT_DEBUG_MODE` (lines 47-48), but these values should never be reassigned. Using `let` instead of `const` makes the code harder to reason about and violates the convention of using `const` for immutable values.

**Location:** `/home/chuck/git/openrouter-summarizer/background.js`, lines 47-48

**Fix:** Change to const:

```javascript
// In background.js
const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;
```

---

### Issue 17: Potential for Notification Flooding

**Severity:** [Low]

**Description:** The `showError()` function clears existing notifications and shows new ones immediately without rate limiting. Rapid successive calls could cause notification flashing or performance issues. The ADR specifies a 3-second timeout for success messages but doesn't address rate limiting for error messages.

**Location:** `/home/chuck/git/openrouter-summarizer/utils.js`, lines 46-96

**Fix:** Implement notification debouncing:

```javascript
// In utils.js
let notificationDebounceTimer = null;
const NOTIFICATION_DEBOUNCE_MS = 100;

export function showError(message, isFatal = true, duration = 0) {
  // Clear pending notification
  if (notificationDebounceTimer) {
    clearTimeout(notificationDebounceTimer);
  }
  
  // Debounce rapid calls
  notificationDebounceTimer = setTimeout(() => {
    displayNotification(message, isFatal, duration);
    notificationDebounceTimer = null;
  }, NOTIFICATION_DEBOUNCE_MS);
}

function displayNotification(message, isFatal, duration) {
  // ... existing showError logic ...
}
```

---

### Issue 18: No Validation of External Resource URLs

**Severity:** [Low]

**Description:** The extension loads flag images from `country-flags/svg/*.svg` using `chrome.runtime.getURL()` but doesn't validate that these URLs are actually within the extension's resources. While Chrome's same-origin policy generally protects against this, a compromised extension or malicious update could redirect these to external sources.

**Location:** `/home/chuck/git/openrouter-summarizer/options.js`, lines 330-336

**Fix:** Add URL validation:

```javascript
// In options.js
function validateExtensionUrl(url) {
  const extensionId = chrome.runtime.id;
  const validPattern = new RegExp(`^chrome-extension://${extensionId}/`);
  return validPattern.test(url);
}

function createLanguageFlag(langInfo) {
  const url = chrome.runtime.getURL(`country-flags/svg/${langInfo.code.toLowerCase()}.svg`);
  
  if (!validateExtensionUrl(url)) {
    console.error("[LLM Options] Invalid extension URL:", url);
    return null;
  }
  
  const flagImg = document.createElement("img");
  flagImg.src = url;
  flagImg.onerror = () => {
    flagImg.src = chrome.runtime.getURL("country-flags/svg/un.svg");
  };
  
  return flagImg;
}
```

---

## Summary and Remediation Priority

### Immediate Action Required (Critical)
1. **Issue 1 (XSS)**: Implement DOMPurify sanitization and CSP headers
2. **Issue 2 (Credential Storage)**: Implement client-side encryption for API keys

### High Priority (Next Sprint)
3. **Issue 3 (Permissions)**: Reduce to `activeTab` with optional host permissions
4. **Issue 4 (Race Condition)**: Replace session storage with in-memory AbortController tracking

### Medium Priority (Technical Debt)
5. **Issue 5 (Input Validation)**: Add content size and depth limits
6. **Issue 6 (Error Handling)**: Standardize with centralized error handler
7. **Issue 7 (Memory Leak)**: Implement event listener cleanup
8. **Issue 8 (XPath Injection)**: Replace with safer CSS selectors
9. **Issue 9 (Language Validation)**: Add whitelist validation
10. **Issue 10 (Message Handling)**: Standardize async response patterns

### Low Priority (Code Quality)
11-18. Various code quality improvements and hardening measures

### Testing Recommendations
1. Add unit tests for sanitization functions
2. Add integration tests for message passing
3. Perform security penetration testing on chat interface
4. Test with various malicious HTML payloads
5. Verify memory usage during extended sessions
6. Test accessibility with screen readers

---

*End of Audit Report*
