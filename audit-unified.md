# Unified Audit Findings

Scope: merged and checked `audit-gemini.md`, `audit-deepseek.md`, and the third audit file present in the repo as `adit-claude.md`. This report includes only findings that still match the current code.

## 1. High: token encryption key is stored beside encrypted tokens

Evidence:
- `js/encryption.js:53-77` loads or creates `encryptionKey_v1` in `chrome.storage.local`.
- `js/state/secretStore.js:192-218` stores encrypted API, NewsBlur, and Joplin tokens in the same `chrome.storage.local` area.

Why this is valid:
The encrypted token values and the raw AES-GCM key needed to decrypt them are protected by the same storage boundary. This does not provide meaningful encryption-at-rest against any attacker or bug with read access to `chrome.storage.local`. It is better than plaintext for accidental display, but it should not be described or treated as strong secret storage.

Recommendation:
Use a platform-backed secret mechanism if available, or clearly downgrade this to obfuscation. At minimum, keep token handling in the background service worker and avoid exposing decrypted values outside privileged flows.

## 2. High: summary requests have no timeout or abort path

Evidence:
- `constants.js:261` defines `REQUEST_TIMEOUT = 45000`.
- `js/summaryHandler.js:203-215` calls `fetch()` for summaries without `AbortController`, `AbortSignal.timeout()`, or any use of `REQUEST_TIMEOUT`.
- `js/summaryHandler.js:222` waits for `response.json()` with no timeout.

Why this is valid:
A hung OpenRouter request can leave the popup in the "Thinking..." state indefinitely. It also leaves the content script waiting for a background result with no deterministic recovery path.

Recommendation:
Apply `REQUEST_TIMEOUT` to summary fetches with an abort signal, return a timeout error to the content script, and clear the popup state.

## 3. High: background trusts summary payload size and shape from runtime messages

Evidence:
- `pageInteraction.js:93-162` validates selected DOM size, depth, and element count in the content script.
- `pageInteraction.js:498-504` sends `selectedHtml` to the background.
- `js/summaryHandler.js:176` calls `request.selectedHtml.substring(...)`.
- `js/summaryHandler.js:191-197` forwards `request.selectedHtml` into the OpenRouter payload.

Why this is valid:
The size and type checks exist only before the runtime message is sent. The background handler does not verify that `selectedHtml` is a string or enforce the same size limit before using it. A malformed internal message can throw, and an oversized one can bypass the client-side cost and complexity checks.

Recommendation:
Validate `request.selectedHtml` inside `handleRequestSummary` before language detection and payload creation. Reject non-strings and content over the configured limit.

## 4. High: concurrent summary results can update the wrong popup and chat context

Evidence:
- `pageInteraction.js:272` creates a `requestId`.
- `pageInteraction.js:498-504` sends the `requestId` to the background.
- `pageInteraction.js:954-1038` renders any `summaryResult` without checking whether `response.requestId` is still active.
- `pageInteraction.js:47-51` keeps summary, model, selected DOM, processed Markdown, and artifacts in module-level singletons.

Why this is valid:
The background echoes `requestId`, but the content script does not gate stale responses. If two summaries are started before the first completes, an older response can overwrite the popup and singleton chat/share context for the newer selection.

Recommendation:
Store the active summary request id in content state, ignore stale `summaryResult` messages, and keep per-request artifacts until the matching response is handled.

## 5. Medium: debug mode logs and forwards full request/response content

Evidence:
- `js/summaryHandler.js:199-201` logs the full OpenRouter summary payload, including selected content.
- `js/summaryHandler.js:224-226` logs the raw OpenRouter response.
- `js/summaryHandler.js:269-277` includes `fullResponse: DEBUG ? responseData : ...` in the message sent to the content script.
- `js/summaryHandler.js:279-281` logs the full response object sent back to the content script.

Why this is valid:
Debug mode exposes selected page content and raw model responses in extension logs and sends unnecessary raw API data into the content script. This increases the impact of debugging being left on and makes private page content easier to leak during troubleshooting.

Recommendation:
Log metadata only: request id, model id, status, content lengths, and sanitized error summaries. Do not include `fullResponse` in content-script messages unless a dedicated developer export path needs it.

## 6. Medium: chat UI claims a stream lifecycle but uses non-streaming API responses

Evidence:
- `js/chatHandler.js:79` exposes `handleLlmChatStream`.
- `js/chatHandler.js:132-136` builds a normal chat completion payload without `stream: true`.
- `js/chatHandler.js:177-185` waits for `response.json()`.
- `js/chatHandler.js:196-197` logs that a non-streaming response was received.
- `js/chat/chatStreamController.js:119-140` shows a streaming placeholder until the whole response returns.

Why this is valid:
The UI and handler names present this as streaming, but no incremental tokens are read. Users get a blocking pending placeholder, and the stop button only aborts the whole fetch before completion.

Recommendation:
Either implement real OpenRouter streaming with `stream: true` and `ReadableStream` parsing, or rename the lifecycle and UI to a non-streaming request model.

## 7. Medium: chat abort state is global across chat windows

Evidence:
- `js/chatHandler.js:164` writes a single `currentChatRequestId` to `chrome.storage.session`.
- `js/chatHandler.js:246-253` aborts whichever controller matches that single session value.
- `js/chat/chatStreamController.js:149-169` sends abort requests without a request id.

Why this is valid:
Two chat tabs share one abort pointer. Starting a request in a second chat tab overwrites the first tab's request id, so pressing Stop in the first tab aborts the newest tracked request rather than its own request.

Recommendation:
Return a request id to the chat page when a request starts, pass that id on abort, and track controllers per chat instance.

## 8. Medium: token migration can leave duplicated legacy tokens after a partial failure

Evidence:
- `background.js:135-151` migrates each sync token one by one.
- `background.js:147-150` returns immediately on the first failed save.
- `background.js:153-154` removes legacy sync tokens only after every migration succeeds.

Why this is valid:
If one token saves successfully and a later token fails, the successful token remains in encrypted local storage while all legacy sync tokens remain in sync storage. The next install/update retries from a mixed state and keeps sensitive legacy tokens in sync longer than necessary.

Recommendation:
Track per-token migration success, remove only legacy keys that were saved successfully, and report failed keys separately.

## 9. Medium: token decryption failures are logged but treated as empty tokens

Evidence:
- `js/options/tokenSection.js:176-205` logs decryption failures, then writes `apiKeyResult.data`, `newsblurResult.data`, and `joplinResult.data` into the UI state.
- `background.js:311-316`, `background.js:325-335`, and `background.js:342-350` log token load failures but continue with empty token data.
- `js/summaryHandler.js:103-107` logs API key decrypt failure and then proceeds to missing-key handling.

Why this is valid:
Corrupt or undecryptable secret storage is collapsed into "missing token" behavior. The user receives misleading configuration errors, and opening the options page can display empty fields even though encrypted data still exists.

Recommendation:
Return a distinct "stored token could not be decrypted" error to the UI. Do not silently replace token fields with empty strings on decrypt failure.

## 10. Medium: extension CSP allows all localhost ports for extension pages

Evidence:
- `manifest.json:68-70` sets `connect-src https://openrouter.ai https://*.newsblur.com http://localhost:*;`.
- `constants.js:124-127` defines Joplin API use as `http://localhost:41184`.

Why this is valid:
The extension pages only need the Joplin port, but the CSP permits connections to any local HTTP port. If an extension page XSS or unexpected script execution is introduced later, this policy gives it broad local network reach.

Recommendation:
Restrict `connect-src` to `http://localhost:41184` or the minimal configured Joplin endpoint.

## 11. Medium: user chat messages are rendered through Markdown/HTML mode selection

Evidence:
- `chat.js:302` stores user input directly as a user message.
- `js/chat/chatRenderer.js:44-49` chooses HTML mode for any string starting with `<`.
- `js/chat/chatRenderer.js:126-131` renders user messages through the same `renderMessageContent` path as assistant messages.
- `js/ui/renderTarget.js:147-149` renders HTML mode as sanitized HTML.

Why this is valid:
User-authored chat text should be rendered as inert text. The sanitizer reduces XSS risk, but a user message that starts with markup is still interpreted as HTML instead of shown exactly as typed. That is unnecessary attack surface and a correctness bug.

Recommendation:
Render `role: "user"` messages with `RENDER_TARGET_MODES.TEXT`. Keep Markdown/HTML rendering limited to assistant/system content where it is explicitly intended.

## 12. Low: rich-copy has an unsafe legacy Markdown-array branch

Evidence:
- `summaryPopup.js:211` keeps `currentOriginalMarkdownArray` module state.
- `summaryPopup.js:244-250` builds clipboard HTML with `marked.parseInline(item)` and string concatenation.
- `summaryPopup.js:306-314` writes that HTML to the clipboard.
- Current main flow passes `null` for this parameter at `pageInteraction.js:1010-1018`, so this is legacy or dormant code.

Why this is valid:
The active summary path does not use this branch, but the exported popup API still accepts an array and converts it to HTML without passing through the shared sanitizer. If the path is revived, unsafe links or markup can be copied as rich HTML.

Recommendation:
Delete the unused array path or sanitize `marked.parseInline()` output through the shared render/sanitize layer before writing clipboard HTML.

## 13. Low: large encrypted tokens can throw during base64 conversion

Evidence:
- `js/encryption.js:100-105` creates a `Uint8Array` containing IV plus ciphertext and passes it to `String.fromCharCode(...combined)`.

Why this is valid:
Spreading a large typed array into function arguments can exceed the JavaScript engine's argument limit. Tokens are normally small, but this helper accepts arbitrary plaintext and can fail for large inputs.

Recommendation:
Encode in chunks or use a safer byte-to-base64 helper that does not spread the whole array.

## 14. Low: options loading couples language asset failure to token display reset

Evidence:
- `options.js:263-268` fetches `country-flags/languages.json` inside the main settings load `try`.
- `options.js:273-277` loads settings and tokens only after that fetch succeeds.
- `options.js:397-405` catches any error from the combined block and clears `apiKeyInput`.

Why this is valid:
A missing or invalid language asset prevents token loading and clears the visible API key field even when token storage is intact. That creates a misleading options-page state from an unrelated asset failure.

Recommendation:
Load language metadata independently from settings and tokens. If language loading fails, show a language-specific fallback without touching token inputs.

## 15. Low: error tracking stores raw stack traces in local storage

Evidence:
- `js/errorHandler.js:35-42` includes `message` and `stack` in `errorInfo`.
- `js/errorHandler.js:93-110` appends those entries to `chrome.storage.local.errorLog`.
- `constants.js:275` keeps up to 50 entries.

Why this is valid:
Stack traces and error messages can include URLs, selected content fragments, request details, or other contextual data. Persisting them in extension storage increases privacy exposure beyond the live console.

Recommendation:
Store redacted error summaries by default. Keep raw stacks only behind an explicit debug export action with user consent.
