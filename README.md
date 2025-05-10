# OpenRouter Summarizer v3.2.14

**Summarize any web page content and chat with the context using OpenRouter.ai APIs**
_Featuring interactive chat, reliable HTML summaries, flexible options, and chat export!_

---

## ✨ What's New

*   **Separate default prompts for popup/chat:** by popular demand, check options!
*   **Simplified LLM interactions in chat:** more models can be reliably used now. Beware of context window limitations though.
*   **Removed toolbar icon action:** use the floating icon (💡) instead.
*   **Optimized COPY button for sharing:** now it returns proper Markdown and the current URL at the end.

---

## 🚀 Features

*   **Summarize Anything:** `ALT+hover` to highlight, then `ALT+Click` any element on a web page to select and summarize it.
*   **Interactive Chat:** Engage in follow-up conversations with the LLM based on the summarized content or the original HTML snippet.
*   **Rich Formatting:** Markdown FTW!
*   **Flexible Model Selection:** Choose from a default list or add/edit any OpenRouter-compatible model ID in the Options. Your selection syncs across sessions. Supports `:nitro`, `:floor` and `:auto`.
*   **Configurable Languages for Chat Flags:** Manage a list of preferred languages in the Options. Corresponding flag icons will appear on the chat popup. Clicking a flag initiates a request to translate the last message.
*   **Languages can now be reordered** by dragging them in the Options list.
*   **Customizable Prompt:** Modify the core formatting instructions sent to the LLM via the Advanced Options section.
*   **Configurable Summary:** Choose the approximate number of summary points (3-8) for the initial summary prompt.
*   **Keyboard Shortcuts:** Use `Ctrl/Cmd+Enter` to send messages in the chat window.
*   **Instant Results:** Summaries appear in a clean popup; chat happens in a dedicated tab.
*   **Secure & Private:** Your API key and options are stored locally in your browser storage. Chat context is stored temporarily in session storage. Nothing is sent anywhere except OpenRouter.ai when you request a summary or chat response.
*   **Debug-Friendly:** Enable debug mode in Options for detailed console logging. The API key is filtered from the debug console messages.

---

## Screenshots

![Summary](media/summary.png)
***
![Chat](media/chat.png)
***
![Models](media/models.png)
---

## 🛠️ How It Works

1.  **Install & Setup:**
    *   Install the extension.
    *   The Options page opens on first install. Enter your [OpenRouter.ai API Key](https://openrouter.ai/keys).
    *   Review default models/languages/settings. **Save Options**.
2.  **Select Content:**
    *   On any webpage, hold <kbd>ALT</kbd> + Hover to preview highlightable elements (blue dashed outline).
    *   <kbd>ALT</kbd>+Click an element to select it (red solid outline). A floating icon (💡) appears.
3.  **Summarize:**
    *   Click the floating icon (💡), *or* right-click and choose "Send to LLM".
    *   The extension sends the element's HTML and your configured prompt (requesting a JSON array of HTML strings) to the selected OpenRouter model. The prompt now instructs the LLM to determine the language of the input text and summarize in that language.
4.  **Review Summary:**
    *   The summary (received as a JSON array of strings) is parsed and appears in the popup, rendered as a clean HTML list (`<ul><li>...</ul>`). Potential code fences (``````json ... ``````) around the JSON are automatically stripped. LLM responses containing multiple JSON arrays or trailing text are handled more robustly.
    *   **Click the "Chat" button to open the chat tab.**
    *   Use **Copy** or **Close**.
5.  **Chat (Optional):**
    *   Click **Chat** on the summary popup to chat about the summary.
    *   A new browser tab opens. An info banner confirms context is available.
    *   The original HTML snippet and the raw/processed JSON string are stored. For *every* message you send, the original HTML snippet is automatically prepended to the recent chat history before sending to the LLM for context.
    *   **Language flags are now available in the chat interface.** Click a flag to request a translation of the *last assistant message* into that language. **While the LLM is processing a request, these flags will be visually dimmed and show a "busy" tooltip.**
    *   Type follow-up questions. Use `Ctrl+Enter` / `Cmd+Enter` to send.
    *   LLM responses are rendered with via basic HTML (`<b>`/`<i>`) but full markdown is recognized via the `marked` library.
    *   Use **Copy MD**, **Download MD**, or **Download JSON** to save the chat.

---

## 🔒 Privacy & Permissions

*   **Permissions Used:**
    *   `activeTab`, `scripting`: To interact with the page for selection and UI.
    *   `contextMenus`: For the right-click menu option.
    *   `storage`: To save API key/preferences (`sync`) and temporary chat context (`session`).
    *   `<all_urls>`: To allow selection on any website.
    *   **`web_accessible_resources`**: Used for accessing static assets (icons, flags, JS libraries like `marked.min.js`) and dynamically imported content script modules (`highlighter.js`, `floatingIcon.js`, `summaryPopup.js`, `constants.js`) from content scripts/pages.
*   **Your Data:**
    *   **API Key & Settings:** Stored locally in `chrome.storage.sync`. Only sent to OpenRouter.ai upon request. Prompt templates and your configured language list are also stored here.
    *   **Selected HTML & Summary:** Sent to OpenRouter.ai for summary/chat requests.
    *   **Chat Context:** Original HTML snippet and raw/processed JSON string stored temporarily in `chrome.storage.session` for the chat tab. Cleared when the browser session ends. The HTML snippet is re-sent with subsequent chat messages for context.
    *   **No Analytics:** No tracking or ads.
*   **Security:**
    *   Renders HTML list/Markdown. Does **not** execute scripts or load external resources from LLM responses. Relies on `marked` for chat rendering. Static assets like SVGs and dynamically imported JS modules are loaded securely from within the extension bundle via `chrome.runtime.getURL`.

**Q: Why aren't all my configured flags showing in the popup?**
A: The flags have been moved to the chat interface for better organization and to avoid cluttering the summary popup.

**Q: How are flags chosen for languages?**
A: The extension attempts to use an SVG flag file (`[language_code].svg`) from the `country-flags/svg/` directory based on the <a href="https://en.wikipedia.org/wiki/ISO_639-1" target="_blank">ISO 639-1</a> code associated with that language in the `languages.json` file. If a flag file for a specific language code is not available in the extension bundle, a generic placeholder flag will be displayed.

---

## Technical updates

*   **Fixed Reference Error for Max Request Price:** Defined `STORAGE_KEY_MAX_REQUEST_PRICE` in `constants.js` to resolve a reference error, ensuring proper handling of max request price settings with a default value of $0.001. (v3.2.14)
*   **Enhanced Price Limits with Unicode Detection:** Improved cost estimation by detecting Unicode content in the first 1024 bytes of selected HTML, adjusting token estimates to prevent exceeding the max request price. (v3.2.13)
*   **Implemented Price Limits:** Added cost estimation and validation against user-defined max request price before sending summary requests, with Unicode detection for accurate token estimation. (v3.2.12)
*   **Corrected Default Price:** Updated the default Max Request Price to $0.001 to match the enforced minimum for finer cost control. (v3.2.11)
*   **Enforced Minimum Price:** Set a minimum value of $0.001 for Max Request Price to prevent disabling requests with paid models. (v3.2.10)
*   **Increased Price Precision:** Changed max request price precision to three decimal places, allowing a minimum price of $0.001 for finer cost control. (v3.2.9)
*   **Fixed Reference Error in Options:** Removed residual reference to `maxRequestPriceInput` in `calculateKbLimitForSummary` to prevent initialization errors. (v3.2.8)
*   **Zero Price Handling for KB Limit:** Updated logic to treat a max request price of zero as valid, setting KB limit to zero for paid models (no budget) and "No limit" for free models. (v3.2.7)
*   **Extended Pricing Cache Expiry:** Increased the pricing data cache expiration from 24 hours to 7 days for better performance and reduced API calls. (v3.2.6)
*   **Efficient Model Pricing Update:** Implemented a new mechanism to update pricing data for all configured models using a single API call to `/api/v1/models`, improving performance over individual model requests. (v3.2.5)
*   **Price Limit for Summary Requests:** Added an advanced option to set a maximum price (in USD) for summary requests, displaying an approximate KB limit based on the selected summary model's pricing. (v3.2.4)
*   **Smarter Summaries:**
    *   Initial summaries are now requested in the original text's language.
    *   Fixed a bug preventing the correct summary model from being passed to and shown in the chat context.
*   **Robust Summary/Chat Parsing:**
    *   Improved logic to reliably parse LLM responses, correctly handling summaries or chat messages containing multiple or embedded JSON arrays, even without code fences.
    *   Structured JSON array output (5 items) is now requested from the LLM.
*   **Enhanced Chat Functionality:**
    *   Implemented a "Stop" button to cancel ongoing chat requests.
    *   Fixed issues with the Stop button remaining visible or error messages persisting incorrectly.
    *   Resolved bugs related to chat submission (Send button and Ctrl+Enter).
    *   Ensured clicking language flags correctly initiates translation requests in the chat.
    *   Improved chat UI rendering for better message display and consistency.
    *   Assistant responses containing JSON arrays are now rendered as structured HTML lists.
    *   Fixed parsing of the initial summary context when opening the chat.
*   **Removed Health Check:** The explicit health check message from the content script has been removed. Configuration validation is now handled directly within the summary request processing in the background script.
*   **Flag Busy State:** Language flags in the chat interface are now visually dimmed and show a "busy" tooltip while the LLM is processing a request. (v3.0.15)
*   **Temporary Error Messages:** Temporary error messages (like "Chat is busy") now automatically disappear after a short duration. (v3.0.16)

## Core Improvements & Fixes

*   **Centralized Settings:**
    *   Settings management is now handled centrally by `background.js`, improving consistency and simplifying access for other components.
*   **Enhanced Debugging:**
    *   Added more detailed debug logging (e.g., for API key retrieval, full LLM responses, health checks) while removing debug info from the user-facing popup UI.
    *   Improved log consistency and API key sanitization.
*   **Options Page Improvements:**
    *   Ensured the UI updates correctly after resetting options to default.
    *   Added post-save verification to check data integrity.
    *   Prevented settings from being saved prematurely during language selection.
    *   Fixed issues related to language data loading.
*   **Language Handling:**
    *   Standardized internal property naming (`language_info`), simplified language data structures, and fixed issues with language data availability during initialization.

---

## 🏷️ Tags

`Summarizer`, `LLM`, `OpenRouter`, `AI`, `Chat`, `JSON`, `HTML`, `Markdown`, `Chrome Extension`, `Productivity`, `GPT`, `Claude`, `Llama`, `Gemini`, `Article Summarizer`, `Web Clipper`, `Prompt Engineering`, `Translation`, `Language Flags`
