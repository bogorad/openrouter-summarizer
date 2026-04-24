# Architecture Inventory

This document records the current extension architecture before the rebuild work. It is an inventory only; it does not prescribe a refactor.

## Entrypoints

### `manifest.json`

- Declares a Manifest V3 Chrome extension at `manifest.json:1`.
- Registers `background.js` as the module service worker at `manifest.json:17`.
- Injects the content script stack into all URLs: `purify.min.js`, `marked.min.js`, and `dist/pageInteraction.bundle.js` at `manifest.json:21`.
- Exposes `options.html` as the options page at `manifest.json:67`.
- Allows extension-page network access to OpenRouter, NewsBlur, and local Joplin through the CSP `connect-src` at `manifest.json:68`.

### `background.js`

- Owns install-time migration and default setting initialization at `background.js:62` and `background.js:117`.
- Registers the context-menu action and sends `{ action: "processSelection" }` to the active tab at `background.js:243`.
- Registers the main runtime message listener at `background.js:250`.
- Dispatches background actions through a string-keyed `messageHandlers` object at `background.js:270`.
- Contains direct NewsBlur and Joplin fetch clients at `background.js:429`, `background.js:526`, and `background.js:567`.

### `pageInteraction.js`

- Is bundled into `dist/pageInteraction.bundle.js` and injected into pages by the manifest.
- Imports the selection, popup, floating icon, Joplin popup, utility, constants, sanitizer, and error modules at `pageInteraction.js:7`.
- Owns content selection processing, markdown conversion, request price gating, summary popup orchestration, chat context creation, NewsBlur sharing, and Joplin entry actions.
- Sends summary requests to the background with `{ action: "requestSummary", requestId, selectedHtml, hasNewsblurToken }` at `pageInteraction.js:498`.
- Receives content-script messages through `chrome.runtime.onMessage` at `pageInteraction.js:1065`.

### `chat.js`

- Is loaded by `chat.html`.
- Owns the chat screen DOM lifecycle, message list, model selection, language flags, quick prompts, copy/download buttons, and stop-request handling at `chat.js:54`.
- Loads settings with `{ action: "getSettings" }` at `chat.js:133`.
- Loads session context with `{ action: "getChatContext" }` at `chat.js:177`.
- Sends chat requests with `{ action: "llmChatStream", messages, model }` at `chat.js:452`.
- Sends abort requests with `{ action: "abortChatRequest" }` at `chat.js:757`.

### `options.js`

- Is loaded by `options.html`.
- Owns the full options page lifecycle under one `DOMContentLoaded` closure at `options.js:27`.
- Manages API keys, NewsBlur token, Joplin token, model list, default summary/chat models, prompt template, language list, max price controls, quick prompts, pricing refresh, and tab state.
- Loads settings from `chrome.storage.sync` and encrypted tokens/pricing caches from `chrome.storage.local` at `options.js:1340`.
- Saves non-sensitive settings to sync storage and encrypted tokens to local storage at `options.js:1606`.

## Runtime Message Actions

### Background actions

All background actions are dispatched by `handleAsyncMessage` in `background.js:258` through `messageHandlers` at `background.js:270`.

| Action | Caller | Request shape | Response shape | Owner |
| --- | --- | --- | --- | --- |
| `getSettings` | `pageInteraction.js:351`, `chat.js:133` | `{ action }` | settings object, or `{ status: "error", message, errorDetails }` | `js/settingsManager.js:49` |
| `getChatContext` | `chat.js:177` | `{ action }` | `{ domSnippet, summary, chatTargetLanguage, modelUsedForSummary, models, language_info, debug }` | `js/chatContextManager.js:9` |
| `getModelPricing` | `pageInteraction.js:413`, `options.js:300` | `{ action, modelId }` | `{ status: "success", pricePerToken }` or `{ status: "error", message }` | `js/pricingService.js:85` |
| `updateKnownModelsAndPricing` | `options.js:1225` | `{ action }` | `{ status: "success", updated }` or `{ status: "error", message }` | `js/pricingService.js:210` |
| `llmChatStream` | `chat.js:452` | `{ action, messages, model }` | `{ status: "success", content }`, `{ status: "error", message }`, or `{ status: "aborted" }` | `js/chatHandler.js:79` |
| `abortChatRequest` | `chat.js:757` | `{ action }` | `{ status: "aborted" }`, `{ status: "error", message }`, or `{ status: "no active request" }` | `js/chatHandler.js:244` |
| `setChatContext` | `pageInteraction.js:833` | `{ action, domSnippet, summary, chatTargetLanguage, modelUsedForSummary, processedMarkdown }` | `{ status: "ok" }` | `js/chatContextManager.js:63` |
| `openChatTab` | `pageInteraction.js:850` | `{ action }` | `{ status: "opened", tabId }` | `js/uiActions.js:4` |
| `openOptionsPage` | `pageInteraction.js:775` | `{ action }` | `{ status: "options page opened" }` | `js/uiActions.js:23` |
| `requestSummary` | `pageInteraction.js:498` | `{ action, requestId, selectedHtml, hasNewsblurToken }` | immediate `{ status: "processing" }` or `{ status: "error", message }`; final tab message uses `summaryResult` | `js/summaryHandler.js:76` |
| `fetchJoplinNotebooks` | `joplinManager.js:619` | `{ action, joplinToken }` | `{ status: "success", folders }` or `{ status: "error", message }` | `background.js:305` |
| `createJoplinNote` | `joplinManager.js:813` | `{ action, joplinToken, title, source_url, parent_id, body_html }` | `{ status: "success", result }` or `{ status: "error", message }` | `background.js:315` |
| `getNewsblurToken` | no current caller found | `{ action }` | `{ status: "success", token }` or `{ status: "error", message }` | `background.js:332` |
| `getJoplinToken` | `pageInteraction.js:45` | `{ action }` | `{ status: "success", token }` or `{ status: "error", message }` | `background.js:352` |
| `shareToNewsblur` | `pageInteraction.js:1176` | `{ action, options: { title, story_url, content, comments } }` | `{ status: "success", result }` or `{ status: "error", message, error }` | `background.js:381` |

Unknown background actions return `{ status: "error", message: "Unhandled action: ..." }` at `background.js:406`.

### Content-script actions

These are received by `pageInteraction.js` through `chrome.runtime.onMessage` at `pageInteraction.js:1065`.

| Action | Caller | Request shape | Response shape | Owner |
| --- | --- | --- | --- | --- |
| `processSelection` | context menu in `background.js:245` | `{ action }` | `{ status: "processing" }` or `{ status: "error", message }` | `pageInteraction.js:891` |
| `summaryResult` | `js/summaryHandler.js:137`, `js/summaryHandler.js:158`, `js/summaryHandler.js:232`, `js/summaryHandler.js:284` | `{ action, requestId, summary?, error?, model?, language_info, hasNewsblurToken, fullResponse? }` | `{ status: "success" }` or `{ status: "error", message }` | `pageInteraction.js:934` |

Unknown content-script actions return `{ status: "error", message: "Unknown action: ..." }` at `pageInteraction.js:961`.

## Storage Ownership

### `chrome.storage.sync`

Sync storage holds user-visible, non-secret configuration. The canonical exported key constants live in `constants.js:12`.

| Key | Owner/writers | Readers | Notes |
| --- | --- | --- | --- |
| `models` | `options.js:1708`, install defaults in `background.js:153` | settings, chat context, chat handler, summary handler, options | Array of `{ id }`; used to validate selected model IDs. |
| `summaryModelId` | `options.js:1709`, install defaults in `background.js:153` | settings, summary handler, options | Default model for summaries. |
| `chatModelId` | `options.js:1710`, install defaults in `background.js:157` | settings, chat UI, options | Default model for chat. |
| `debug` | `options.js:1711` | background, content, settings, options | Debug flag read frequently at runtime. |
| `bulletCount` | `options.js:1712`, install defaults in `background.js:161` | summary handler, settings, options | Stored as a string. |
| `language_info` | `options.js:1713` | settings, chat context, options | Array of language display objects with flag paths. |
| `promptTemplate` | `options.js:1714`, install/update reset in `background.js:170` | summary handler, options | XML-style summary prompt template. |
| `alwaysUseUsEnglish` | `options.js:1715` | summary handler, options | Defaults to true in options and summary handler. |
| `maxRequestPrice` | `options.js:1716`, install defaults in `background.js:165` | settings, page interaction, options | Used before summary requests. |
| `maxPriceBehavior` | `options.js:1717` | settings, page interaction, options | Current values are `truncate` or `fail`. |
| `chatQuickPrompts` | `options.js:1718` | settings, chat UI, options | List of chat quick prompt buttons. |
| `alsoSendToJoplin` | `options.js:1719` | page interaction, options | Controls NewsBlur-plus-Joplin follow-up behavior. |
| legacy `apiKey`, `newsblurToken`, `joplinToken` | migration source in `background.js:66`; Joplin fallback read in `background.js:354` and `pageInteraction.js:1239` | migration/fallback only | Secrets are migrated out of sync storage by `migrateTokensToEncryptedStorage`. |

### `chrome.storage.local`

Local storage holds encrypted secrets, caches, local UI state, and error logs.

| Key | Owner/writers | Readers | Notes |
| --- | --- | --- | --- |
| `apiKeyLocal` | `options.js:1726`, migration in `background.js:94` | settings, summary, chat, pricing, options | Encrypted with `js/encryption.js`. |
| `newsblurTokenLocal` | `options.js:1727`, migration in `background.js:94` | settings, NewsBlur share, options | Encrypted token. |
| `joplinTokenLocal` | `options.js:1728`, migration in `background.js:94` | background Joplin token action, options | Encrypted token. |
| `knownModelsAndPrices` | pricing refresh in `js/pricingService.js:60` | pricing lookup and options | OpenRouter model/pricing cache. |
| `modelPricingCache` | options price-limit UI at `options.js:1524` | options | Local options-only cache. |
| `lastActiveTab` | `options.js:2167` | `options.js:2150` | Options page tab persistence. |
| `lastUsedJoplinNotebookId` | `joplinManager.js:836` | `joplinManager.js:534` | Last notebook selection. |
| `lastUsedJoplinNotebookName` | `joplinManager.js:836` | `joplinManager.js:534` | Last notebook display name. |
| `errorLog` | `js/errorHandler.js:95` | error handler only | Bounded local diagnostic log. |
| `openrouter_summarizer_encryption_key` | `js/encryption.js:54` and `js/encryption.js:75` | encryption helper | AES-GCM key material stored locally. |

### `chrome.storage.session`

Session storage holds transient cross-page state.

| Key | Owner/writers | Readers | Notes |
| --- | --- | --- | --- |
| `chatContext` | `js/chatContextManager.js:71` | `js/chatContextManager.js:17` | Carries selected DOM snippet, summary, target language, and summary model into `chat.html`. |
| `currentChatRequestId` | `js/chatHandler.js:164` | `js/chatHandler.js:246` | Maps the visible chat request to an in-memory `AbortController`. Removed on completion/error/abort. |

### In-memory state

- `pageInteraction.js` stores the current selection, summary, processed markdown, model, and Joplin token in module variables at `pageInteraction.js:32`.
- `chat.js` stores current chat messages, UI state, active model, language info, quick prompts, and active placeholder nodes at `chat.js:23`.
- `js/chatHandler.js` stores active `AbortController` objects in an in-memory `Map` at `js/chatHandler.js:17`.
- `summaryPopup.js`, `floatingIcon.js`, `highlighter.js`, and `joplinManager.js` each keep DOM element references and callbacks in module state.

## UI Surfaces and Current Owners

| Surface | Current owner | Notes |
| --- | --- | --- |
| Element hover/selection highlight | `highlighter.js:254` | Listens for Alt/mouse events, tracks selected element, owns highlight classes. |
| Floating selected-element action icon | `floatingIcon.js:48` | Shadow DOM host with summarize, Joplin, and copy-HTML actions. |
| Summary popup | `summaryPopup.js:350` | Shadow DOM popup with content, copy, chat, NewsBlur, and close buttons. |
| Content-script notifications | `utils.js:78` | Uses `#llm-notification-container` when present; falls back to `#errorDisplay`. |
| Joplin notebook modal | `joplinManager.js:589` | Owns modal DOM, focus trap, notebook autocomplete, save/cancel flow. |
| Chat page | `chat.js:54` | Owns messages, quick prompts, language flags, model selector, copy/download, and stop button. |
| Options page | `options.js:27` | Owns all options form controls, tabs, drag/drop model/language/quick-prompt lists, pricing notices, encryption save/load. |
| Shared Markdown/render helpers | `utils.js:137` | Renders Markdown through `marked` and sanitizes through global `DOMPurify`. |

## External Service and Fetch Boundaries

| Boundary | File | Endpoint | Purpose | Token source |
| --- | --- | --- | --- | --- |
| OpenRouter summary | `js/summaryHandler.js:203` | `https://openrouter.ai/api/v1/chat/completions` | Sends selected content and summary prompt. | decrypted `apiKeyLocal` |
| OpenRouter language detection | `js/summaryHandler.js:42` | `OPENROUTER_API_URL` | Detects selected content language when not forcing English. | decrypted `apiKeyLocal` |
| OpenRouter chat | `js/chatHandler.js:166` | `https://openrouter.ai/api/v1/chat/completions` | Sends chat conversation and receives direct assistant content. | decrypted `apiKeyLocal` |
| OpenRouter models/pricing | `js/pricingService.js:25` | `https://openrouter.ai/api/v1/models` | Refreshes known models and prompt-token pricing. | decrypted `apiKeyLocal` |
| Joplin folders | `background.js:539` | `http://localhost:41184/folders?token=...` | Loads notebooks for the Joplin modal. | request token or decrypted `joplinTokenLocal` |
| Joplin notes | `background.js:587` | `http://localhost:41184/notes?token=...` | Creates a Joplin note with HTML content. | request token |
| NewsBlur share | `background.js:453` | `https://{domain}/api/share_story/{token}` | Shares combined summary and cleaned content. | request token or decrypted `newsblurTokenLocal` |
| Languages fixture | `options.js:1355` | extension URL `country-flags/languages.json` | Loads options-page language autocomplete data. | none |

Network fetches are currently split between background-only service clients and the options page local fixture load. OpenRouter calls are split across summary, chat, and pricing modules rather than one client.

## Current Coupling Notes

- `pageInteraction.js` is both content pipeline and UI orchestrator: it validates DOM complexity, sanitizes, converts to Markdown, gates price, requests summary, shares to NewsBlur, opens chat, and launches Joplin.
- `options.js` keeps storage schema, validation, rendering, autocomplete, pricing cache handling, encryption calls, tab state, and save/load behavior in one file.
- Settings defaults are split between `constants.js`, `background.js`, `options.js`, and `js/settingsManager.js`.
- Message contracts are implicit string literals across callers and handlers.
- UI primitives are duplicated across summary popup, floating icon, Joplin modal, chat, options, and `utils.js`.
