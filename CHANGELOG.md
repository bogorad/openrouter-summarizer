- **Version 3.9.37:** Fixed floating icon Joplin button visibility by reading encrypted Joplin token from local storage when sync token is unavailable.
- **Version 3.9.36:** Fixed leftover summary popup and floating icon staying on screen after cancelling selection.
- **Version 3.9.35:** Fixed Chrome console noise by replacing the content-script `unload` cleanup handler (blocked by Permissions Policy on some documents) with `pagehide` + bfcache-safe `pageshow` re-init.

- **Version 3.9.34:** Options: increased max price input debounce so values don't snap/reset mid-entry, and normalized the editable `<user_formatting>` section to trim leading/trailing blank lines on load/save.

- **Version 3.9.33:** Updated default model list. Increased Options model limit to 10 and auto-refreshes model/pricing cache when you finish editing a model ID so autocomplete/validation and Max KiB stay current.

- **Version 3.9.32:** Compacted Options > Models > Model Selection layout (tighter row spacing, reduced padding, smaller radio cluster) so more configured models fit on screen.

- **Version 3.9.31:** Fixed Alt+Click scroll-to-top regression by preventing scroll jumps on floating icon auto-focus. Loaded DOMPurify in content scripts and improved HTML list detection so the summary popup renders HTML (e.g., <ul>/<ol>) instead of showing raw tags.

- **Version 3.9.30:** Improved Joplin notebook selection popup accessibility: added dialog ARIA semantics, focus trapping/restoration, Escape-to-close, and listbox/option semantics for autocomplete.

- **Version 3.9.29:** Fixed Webpack warnings by adding missing `cleanup()` exports to FloatingIcon and SummaryPopup modules.

- **Version 3.9.28:** Fixed OpenRouter model variant suffix handling (`:online`, `:nitro`, `:free`) in Options validation and pricing lookups so chat/summary model selections persist.

- **Version 3.9.27:** Implemented centralized Logger utility in js/logger.js with debug, info, warn, and error methods for consistent log levels and prefixes across the codebase. Updated background.js, settingsManager.js, chatHandler.js, summaryHandler.js, chatContextManager.js, uiActions.js, pricingService.js, errorHandler.js, htmlSanitizer.js, encryption.js, and utils.js to use Logger. Fixed duplicate handleUpdateKnownModelsAndPricing function in pricingService.js.

- **Version 3.9.26:** Fixed error tracking to check chrome.runtime.lastError in storage callbacks: added checks after get() and set() operations, using console.warn to log failures without recursion

- **Version 3.9.25:** Replaced magic numbers with named constants: added SNIPPET_TRUNCATION_LIMIT, MAX_ERROR_LOG_ENTRIES, and notification timeout constants (NOTIFICATION_TIMEOUT_MINOR_MS, NOTIFICATION_TIMEOUT_SUCCESS_MS, NOTIFICATION_TIMEOUT_CRITICAL_MS) to constants.js, updated all files to use these imports instead of hardcoded values

- **Version 3.9.24:** Fixed insufficient URL validation in Joplin API calls: added token format validation with regex, replaced string concatenation with URL API for safe URL construction

- **Version 3.9.23:** Fixed memory leak in activeControllers Map: added MAX_ACTIVE_CONTROLLERS limit (100), eviction of oldest 20% when limit reached, periodic cleanup interval every 30 seconds as backup, and wrapped abort() calls in try/catch to prevent cleanup failures

- **Version 3.9.22:** Refactored decryptSensitiveData to return a result object { success, data, error } instead of empty string on failure, enabling callers to distinguish between missing data and decryption failures for better error handling and security

- **Version 3.9.21:** Fixed insecure token migration: added encryption validation, read-back verification after storage write, and try/catch rollback to prevent permanent token loss if migration fails

- **Version 3.9.20:** Added explicit Content Security Policy to manifest.json restricting scripts to 'self', blocking object embeds, and limiting network requests to approved API endpoints (OpenRouter, NewsBlur, localhost for Joplin)

- **Version 3.9.19:** Fixed XSS vulnerability in HTML rendering pipeline: removed anchor tags from DOMPurify allowlist in utils.js to prevent javascript: URL injection, and added DOMPurify sanitization to summaryPopup.js innerHTML assignments

- **Version 3.9.18:** Removed unused numToWord object from pageInteraction.js (dead code cleanup)

- **Version 3.9.17:** Added fallback models for language detection to improve reliability when primary model is unavailable

- **Version 3.9.16:** Added accessibility attributes to dynamic elements including ARIA roles, labels, and keyboard navigation support

- **Version 3.9.15:** Replaced LLM-specific comment artifact with standard JSDoc documentation in constants.js

- **Version 3.9.14:** Changed 'let' to 'const' for constants in background.js per CONVENTIONS.md

- **Version 3.9.13:** Added data redaction for DEBUG logging to prevent leaking sensitive information like API keys and tokens

- **Version 3.9.12:** Fixed HTML sanitizer to use word-boundary CSS selectors instead of partial XPath matching, preventing removal of legitimate content

- **Version 3.9.11:** Added language code validation with ISO 639-2 whitelist to prevent injection from malformed LLM responses

- **Version 3.9.10:** Fixed message handler return patterns to always return true, preventing 'disconnected port object' errors

- **Version 3.9.9:** Fixed memory leak in highlighter.js by implementing proper event listener cleanup on content script unload

- **Version 3.9.8:** Refactored error handling: created centralized ErrorHandler class for consistent error processing across all modules

- **Version 3.9.7:** Fixed race condition in chat abort handling by using in-memory Map for AbortController storage instead of chrome.storage.session

- **Version 3.9.6:** Added input validation to prevent DoS attacks - limits on content size (1MB), nesting depth (100), and element count (10000)

- **Version 3.9.5:** Reduced host permissions to follow least privilege principle - removed `<all_urls>` from required permissions, relying on activeTab for on-demand access.

- **Version 3.9.4:** Secured API token storage: moved from chrome.storage.sync to encrypted chrome.storage.local using AES-GCM encryption. This prevents API keys from being synchronized to Google servers and protects against account compromise, browser forensic analysis, and malicious extensions with storage permissions.

- **Version 3.9.3:** Fixed critical XSS vulnerability in chat message rendering by implementing DOMPurify sanitization. The deprecated `marked.parse()` sanitize option was replaced with proper DOMPurify sanitization to prevent arbitrary JavaScript execution from malicious LLM responses.

- **Version 3.9.2:** Display model name in summary popup header (e.g., "Summary (google/gemini-2.0-flash-001)") to show which LLM generated the summary.

- **Version 3.9.0:** Shadow DOM Migration (Robustness)
  - **Complete UI Isolation:** Migrated `summaryPopup.js` and `floatingIcon.js` to use Shadow DOM.
  - **CSS Independence:** Extension UI is now immune to external CSS (Bootstrap, Tailwind, site resets).
  - **No More Style Conflicts:** Floating icons and popups render consistently on all websites.
  - **Fixed Interactions:** Resolved issues where clicking the floating icon would deselect the element.
  - **Fixed Clipboard:** Ensured bold formatting is preserved when copying summaries.

- **Version 3.8.8:** 📚 **Web-Enabled Chat Documentation**
  - **Comprehensive `:online` Documentation:** Added detailed documentation for OpenRouter's `:online` model variant
  - **Web Search in Chat:** Explains how to enable real-time web search for chat conversations requiring current information
  - **xAI Special Feature:** Highlighted that xAI models (Grok) get both web search AND X/Twitter search with `:online`
  - **Model Examples:** Updated all examples to use current models (e.g., `openai/gpt-5.1-codex-mini`)
  - **Variant Stacking:** Documented how to combine `:online` with other variants like `:floor`
  - **Updated Options Page:** Enhanced helper text in Options to mention `:online` for web search
  - **Cost Transparency:** Added note about web search costs (~$0.02/request) without overemphasis

- **Version 3.8.0:** 🎯 **Major Architecture Update - Native HTML Summary Format**
  - **Native HTML Summaries:** LLM now returns properly formatted HTML bullet lists directly, eliminating JSON parsing errors and improving reliability
  - **Dynamic Bullet Count:** The bullet count setting (3-8) now actually works! Uses `$$$bulletCount$$$` placeholder in prompt templates
  - **Enhanced Copy Functionality:** Preserves bold formatting in both rich text (HTML) and plain text (markdown) when copying summaries
  - **Fixed Chat Integration:** Chat window now properly handles HTML summaries without parsing errors
  - **Fixed NewsBlur Sharing:** Sharing to NewsBlur now works correctly with the new HTML format
  - **Fixed Notification System:** "Sending note to Joplin..." messages now properly clear and don't persist indefinitely
  - **Comprehensive Debug Logging:** Added extensive debug logging throughout the codebase, especially for language detection and summary processing
  - **Improved Language Detection:** Enhanced logging shows exactly when and how language detection occurs
  - **Streamlined Architecture:** Simplified data flow eliminates unnecessary JSON parsing and HTML rebuilding

- **Version 3.7.17:** Added keyboard shortcuts for summary popup (Y/C/N/Escape) and new Copy HTML icon in floating menu for copying complete element HTML to clipboard. Enhanced Joplin dialog with Enter/Escape hotkeys. Improved error handling robustness.
- **Version 3.7.10:** Added max_tokens=4096 to OR call in `chat` so that more expensive models don't fail.
- **Version 3.7.9:** Force popup window to use fonts from CSS.
- **Version 3.7.8:** Remember the last used Joplin notbook.
- **Version 3.7.7:** Fixed masking of API keys in console debug.
- **Version 3.7.6:** Implemented Escape key functionality to close the summary popup, mirroring the behavior of the "Close" button for improved usability.

* **Version 3.7.5:** Implemented the dual-sharing workflow. When sharing to NewsBlur, if the corresponding option is checked, the same content is now also sent to Joplin.
* **Version 3.7.4:** Added a checkbox in Options > API to automatically send content to Joplin when sharing to NewsBlur. This option is enabled and auto-checked when a NewsBlur token is present.
* **Version 3.7.3:** Refactored NewsBlur sharing to send a combined HTML block containing both the summary and the original content in the `content` field, with an empty `comments` field.
* **Version 3.5:** Updated to version 3.5. (v3.5)
