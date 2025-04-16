# OpenRouter Summarizer v2.2.1

**Summarize any web page content and chat with the context using OpenRouter.ai APIs**
_Featuring interactive chat, reliable HTML summaries, flexible options, and chat export!_

---

## ✨ What's New Since Version 2.1

*   **JSON/HTML Summary Format:** Initial summaries are now requested as a **JSON array of simple HTML strings** (using only `<b>` and `<i>` tags by default) for more reliable parsing and rendering in the popup as an HTML list.
*   **Improved Chat Context Persistence:** The original HTML snippet is now consistently passed along with chat history in the background, ensuring the LLM retains context for follow-up questions about the source material throughout the conversation.
*   **Markdown Chat Responses:** Chat responses continue to render full Markdown (bold, italics, lists, code blocks, etc.) via the `marked` library for enhanced readability.
*   **Centralized Prompt Management:** Prompt templates are now managed internally for better consistency (developer-facing change).
*   **Options Validation:** The extension now checks for essential settings (like API Key, selected Model, and core prompt components) before attempting a summary. If issues are found, it prompts the user to open the Options page. *(New)*

*(Previous updates from v2.1 still included):*
*   **Interactive Chat:** After getting a summary, click "Chat" to open a dedicated chat tab.
*   **Revamped Options UI:** Model/Language Management, Advanced Prompt Customization with preview, Reset Option.
*   **Chat Export:** Copy/Download as Markdown (`.md`), Download raw data as JSON (`.json`).
*   **Keyboard Shortcuts:** `Ctrl+Enter` / `Cmd+Enter` to send chat messages.
*   **Improved Stability:** Better Alt+Tab handling.
*   **Refined Chat Context Handling:** Optimized context passing to avoid potential token limits and improve reliability with various models on follow-up questions.

---

## 🚀 Features

*   **Summarize Anything:** `ALT+hover` to highlight, then `ALT+Click` any element on a web page to select and summarize with a single icon click.
*   **Interactive Chat:** Engage in follow-up conversations with the LLM based on the summarized content and the original HTML snippet (context is now persistent!).
*   **Rich Formatting:**
    *   Initial summaries (requested as JSON array of HTML strings) are rendered in the popup as a clean HTML list (`<ul><li>...</li></ul>`).
    *   Chat responses render full Markdown formatting via `marked`.
*   **Flexible Model Selection:** Choose from a default list or add/edit any OpenRouter-compatible model ID in the Options. Your selection syncs across sessions. Supports `:nitro` and `:auto`.
*   **Customizable Translation:** Optionally translate summaries into various languages. Manage your preferred language list in the Options, including adding custom ones. Select "No translation needed" to disable.
*   **Customizable Prompt:** Modify the core formatting instructions sent to the LLM via the Advanced Options section (default now requests JSON/HTML).
*   **Chat Export:** Save your chat history as Markdown (copy/download) or JSON (download).
*   **Configurable Summary:** Choose the approximate number of summary points (3-8) for the initial summary prompt.
*   **Keyboard Shortcuts:** Use `Ctrl+Enter` / `Cmd+Enter` to send messages in the chat window.
*   **Instant Results:** Summaries appear in a clean popup; chat happens in a dedicated tab.
*   **Secure & Private:** Your API key and options are stored locally in your browser storage. Chat context is stored temporarily in session storage. Nothing is sent anywhere except OpenRouter.ai when you request a summary or chat response.
*   **Debug-Friendly:** Enable debug mode in Options for detailed console logging.

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
    *   Click the floating icon (💡), *or* right-click and choose "Send to LLM", *or* click the extension toolbar icon.
    *   The extension sends the element's HTML and your configured prompt (requesting a JSON array of HTML strings) to the selected OpenRouter model.
4.  **Review Summary:**
    *   The summary (received as a JSON string) is parsed and appears in the popup, rendered as a simple HTML list (`<ul><li>...</li></ul>`). Code fences (```json ... ```) around the JSON are automatically stripped.
    *   Use **Copy** or **Close**.
5.  **Chat (Optional):**
    *   Click **Chat** on the summary popup.
    *   A new browser tab opens. An info banner confirms context is available.
    *   The original HTML snippet and the raw summary JSON string are stored. For *every* message you send, the original HTML snippet is prepended to the history sent to the LLM for context.
    *   Type follow-up questions. Use `Ctrl+Enter` / `Cmd+Enter` to send.
    *   LLM responses are rendered with full Markdown.
    *   Use **Copy MD**, **Download MD**, or **Download JSON** to save the chat.

---

## ⚙️ Options

Customize the extension's behavior:

*   **API Key:** (Required) Your OpenRouter.ai key.
*   **Model Selection:**
    *   Manage your list of preferred models (radio buttons + editable text fields).
    *   Select your default model. Add/Edit/Remove models freely.
*   **Summary Options:**
    *   Choose the approximate number of points (3-8) for the initial summary prompt.
*   **Translation Options:**
    *   Manage your list of target languages (radio buttons + editable text fields).
    *   Select "No translation needed" (default) or a specific language. Add/Edit/Remove languages.
    *   Selection dynamically updates the prompt preview in Advanced Options.
*   **Other Settings:**
    *   **Enable Debug Logging:** Check for detailed console output.
*   **Advanced Options (Collapsible):**
    *   Click the header to expand/collapse.
    *   **Prompt Customization:** View the structure of the system prompt sent to the LLM.
        *   **Intro (Fixed):** Shows the initial instructions.
        *   **You can customize this part (Editable):** Modify the core formatting instructions using the textarea. Default now requests JSON array of HTML strings (e.g., `"<b>Key Finding:</b> The market showed <i>significant</i> growth in Q3."`) and includes a "Summarizer Insight" point.
        *   **Language (Dynamic Preview):** Shows the translation instruction block *only* if a language is selected above. Updates automatically.
        *   **Outro (Fixed):** Shows the final instructions (requesting valid JSON output).
*   **Actions:**
    *   **Save Options:** Saves all changes (including prompt templates to storage).
    *   **Reset to Defaults:** Resets all settings *except* API Key to their original defaults (requires confirmation).

---

## ✨ Formatting: JSON/HTML Summaries & Markdown Chat

*   **Initial Summaries (Popup):** The LLM is asked for a **JSON array** where each element is an HTML string. The prompt instructs the LLM to only use `<b>` and `<i>` tags by default. The extension parses this JSON and renders the array items as an HTML list (`<ul><li>...</li></ul>`) in the popup. Potential code fences around the JSON are stripped automatically.
*   **Chat Responses (Chat Tab):** Rendered using the `marked` library, supporting full GitHub Flavored Markdown including bold, italics, lists, code blocks, blockquotes, etc. The LLM may still use Markdown or simple HTML in its responses.

---

## 🔒 Privacy & Permissions

*   **Permissions Used:**
    *   `activeTab`, `scripting`: To interact with the page for selection and UI.
    *   `contextMenus`: For the right-click menu option.
    *   `storage`: To save API key/preferences (`sync`) and temporary chat context (`session`).
    *   `<all_urls>`: To allow selection on any website.
*   **Your Data:**
    *   **API Key & Settings:** Stored locally in `chrome.storage.sync`. Only sent to OpenRouter.ai upon request. Prompt templates are also stored here.
    *   **Selected HTML & Summary:** Sent to OpenRouter.ai for summary/chat requests.
    *   **Chat Context:** Original HTML snippet and raw summary JSON string stored temporarily in `chrome.storage.session` for the chat tab. Cleared when the browser session ends. The HTML snippet is re-sent with subsequent chat messages for context.
    *   **No Analytics:** No tracking or ads.
*   **Security:**
    *   Renders HTML list/Markdown. Does **not** execute scripts or load external resources from LLM responses. Relies on `marked` for chat rendering.

---

## 📝 How to Use (Quick Steps)

1.  **Install** & **Set API Key** in Options.
2.  **ALT+Hover** & **ALT+Click** an element.
3.  Click the **floating icon** (💡) (or context menu/toolbar icon) to **Summarize**.
4.  Review popup (now an HTML list). Click **Chat** for follow-up.
5.  In chat: Ask questions (`Ctrl+Enter` to send), use **Export** buttons. Context should persist.
6.  Adjust settings in **Options** (including Advanced Prompt) anytime.

---

## 🧑‍💻 Open Source

This extension is open source, MIT licensed.
[View code or contribute on GitHub](https://github.com/bogorad/openrouter-summarizer) <!-- Update link if needed -->

---

## ❓ FAQ

**Q: Why API key?**
A: Uses OpenRouter.ai API for summaries/chat. Get your own key.

**Q: Why OpenRouter?**
A: Access to many LLMs, good pricing/performance.

**Q: Data safe?**
A: Yes. Key/settings local. Text sent to OpenRouter on request. Chat context uses temporary session storage. See Privacy section.

**Q: How does Chat context work?**
A: The original selected HTML snippet and the raw JSON summary string are stored when chat starts. For the *first* chat message, both are sent. For *subsequent* messages, the original HTML snippet is automatically prepended to the recent chat history before sending to the LLM to help maintain context.

**Q: Can I mix models?**
A: Yes! The initial summary uses your default model. In the chat tab, you can select a *different* model from the dropdown for each message you send.

**Q: Can I customize models/languages/prompt?**
A: Yes! Options allow editing model/language lists. Advanced Options let you edit the core formatting part of the prompt (default asks for JSON/HTML).

**Q: Is rendering HTML/Markdown safe?**
A: The initial summary popup renders a basic HTML list based on the JSON array received (LLM is instructed to only use `<b>`/`<i>`). Chat uses the `marked` library for standard Markdown, which can include HTML. While generally safe, be mindful of LLM outputs. No scripts are executed.

---

## 🏷️ Tags

`Summarizer`, `LLM`, `OpenRouter`, `AI`, `Chat`, `JSON`, `HTML`, `Markdown`, `Chrome Extension`, `Productivity`, `GPT`, `Claude`, `Llama`, `Gemini`, `Article Summarizer`, `Web Clipper`, `Prompt Engineering`
