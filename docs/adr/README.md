# Architecture Decision Record: Browser Extension for LLM Summarization

**Title:** A modular, message-passing browser extension architecture for LLM interaction.

**Status:** Accepted

**Context:**
The goal is to build a browser extension that allows users to select arbitrary HTML content from any webpage, summarize it using a Large Language Model (LLM) via the OpenRouter.ai API, and subsequently engage in a chat with the context of the selected content and its summary. The extension must be configurable, allowing users to manage API keys, select LLM models, and set preferences. It also needs to support integrations with third-party services like Joplin and NewsBlur for content sharing.

The architecture must respect the security boundaries of browser extensions, ensure a non-blocking user experience on the host webpage, and be maintainable and extensible.

**Decision:**
We have implemented a modular browser extension architecture based on the standard separation of concerns between a **Background Service Worker**, **Content Scripts**, and dedicated **Extension UI Pages**. Communication between these components is handled via an asynchronous message-passing system.

### Architectural Diagram

```
+-------------------------------------------------------------------------+
|                                  User on a Web Page                     |
+-------------------------------------------------------------------------+
      |                                      ^
      | Alt+Click to Select Element          | Display Summary
      v                                      |
+--------------------------------+      +--------------------------------+
| Content Script                 |      | Summary Popup UI               |
| (pageInteraction.js)           |----->| (summaryPopup.js)              |
| - Manages DOM interaction      |      +--------------------------------+
| - Injects UI components        |      |                                |
| - Sends requests to background |      |                                |
+--------------------------------+      |                                |
      | ^                                |                                |
      | | (sendMessage)                  |                                |
      v | (onMessage)                    |                                |
+--------------------------------+      +--------------------------------+
| Background Service Worker      |      | Extension UI Pages             |
| (background.js)                |      | (chat.html, options.html)      |
| - Manages State & Settings     |<---->| - Provide dedicated interfaces |
| - Handles ALL API Calls        |      | - Communicate with Background  |
| - Orchestrates communication   |      +--------------------------------+
+--------------------------------+
      |
      | (fetch API)
      v
+--------------------------------+
| External APIs                  |
| (OpenRouter, Joplin, NewsBlur) |
+--------------------------------+
```

### Core Components

1.  **Background Service Worker (`background.js`)**:
    - **Role:** The central hub and brain of the extension. It is the only component with the authority to make cross-origin API calls.
    - **Responsibilities:**
      - **API Communication:** Manages all `fetch` requests to OpenRouter for summarization, language detection, and chat, as well as to Joplin and NewsBlur for integration.
      - **State Management:** Handles the lifecycle of API requests (including aborting streams) and manages the context (original HTML, summary) passed to the chat interface via `chrome.storage.session`.
      - **Settings Provider:** Acts as the single source of truth for settings, reading from `chrome.storage.sync` and providing them to other components upon request.
    - **Design:** It is designed modularly, delegating specific tasks to handlers in the `/js` directory (e.g., `summaryHandler.js`, `chatHandler.js`, `settingsManager.js`), which keeps the main service worker file clean and focused on message routing.

2.  **Content Script (`pageInteraction.js`)**:
    - **Role:** The user-facing component injected into web pages. It orchestrates all on-page interactions.
    - **Responsibilities:**
      - **Element Selection:** Uses the `highlighter.js` module to allow users to preview and select a DOM element using `Alt+Click`.
      - **UI Injection:** Injects and manages the lifecycle of the floating action icon (`floatingIcon.js`) and the summary display popup (`summaryPopup.js`).
      - **Data Processing:** Grabs the `outerHTML` of the selected element, sanitizes it using `js/htmlSanitizer.js` to remove clutter, and converts the cleaned HTML to Markdown using the `turndown` library.
      - **Communication:** Initiates requests for summarization by sending the processed Markdown to the background script. It listens for the `summaryResult` response to display it.
    - **Bundling:** This script and its dependencies (like `turndown`) are bundled into `dist/pageInteraction.bundle.js` using Webpack, simplifying injection via the `manifest.json`.

3.  **Extension UI Pages (`options.html`, `chat.html`)**:
    - **Role:** Standalone HTML pages that provide dedicated user interfaces.
    - **`options.html` (`options.js`):** A comprehensive settings panel where users configure API keys, select models, manage language preferences, and customize prompts. It reads and writes directly to `chrome.storage.sync`.
    - **`chat.html` (`chat.js`):** A dedicated chat interface. On load, it requests the summary context from the background script (which retrieves it from `chrome.storage.session`). All chat messages are proxied through the background script to the OpenRouter API.

4.  **Shared Modules (`constants.js`, `utils.js`)**:
    - **`constants.js`:** Centralizes all storage keys, API endpoints, default model lists, and prompt templates. This prevents magic strings and makes the codebase easier to maintain.
    - **`utils.js`:** Contains shared helper functions like `showError` and JSON parsers, promoting code reuse.

### Data Flow and Communication

- **Asynchronous Messaging (`chrome.runtime.sendMessage`):** All communication between components is asynchronous. Content scripts and UI pages send messages with an `action` property to the background script, which routes them to the appropriate handler and sends a response.
- **Settings Persistence (`chrome.storage.sync`):** User settings are stored in `chrome.storage.sync`, making them available across the user's devices. The options page is the primary writer, while the background script is the primary reader.
- **Chat Context Passing (`chrome.storage.session`):** To pass the potentially large HTML snippet and summary from the content script to the separate chat page, the data is temporarily stored in `chrome.storage.session`. This avoids the complexity of passing large data blobs through messages and is ideal for transient, session-only data.

### Consequences

**Positive:**

- **Security:** Adheres to the browser extension security model. API keys are confined to the background service worker and are never exposed to content scripts or the web pages they run on.
- **Modularity & Maintainability:** The clear separation of concerns makes the system easy to understand, debug, and extend. The modularization of the background script's logic into individual handlers is a key strength.
- **User Experience:** The asynchronous nature of API calls ensures that the host webpage remains responsive and is not blocked while the LLM is processing a request. UI elements are injected cleanly without disrupting page content.
- **Robustness:** The use of a dedicated HTML sanitizer (`js/htmlSanitizer.js`) before Markdown conversion significantly improves the quality of the content sent to the LLM, leading to better summaries.

**Negative:**

- **Communication Complexity:** The reliance on message passing can make tracing a full user interaction (e.g., from click to summary) more complex than in a monolithic application.
- **State Management:** State is distributed (in-memory in scripts, sync storage, session storage). Developers must be careful to ensure state consistency, especially when settings are updated.
- **Build Step:** The use of Webpack to bundle the content script introduces a build dependency, adding a layer of complexity to the development workflow compared to directly including scripts.
