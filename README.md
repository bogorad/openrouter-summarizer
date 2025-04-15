# OpenRouter Summarizer v2.1

**Summarize any web page content and chat with the context using OpenRouter.ai APIs**  
_Featuring interactive chat with Markdown support, flexible options, and chat export!_

---

## ✨ What's New Since Version 1

*   **Interactive Chat:** After getting a summary, click "Chat" to open a dedicated chat tab. Ask follow-up questions using the original page content and the LLM's summary as context!
*   **Markdown Support:**
    *   Initial summaries are now requested from the LLM in Markdown format (though rendered simply in the popup).
    *   Chat responses render full Markdown (bold, italics, lists, code blocks, etc.) via the `marked` library for enhanced readability.
*   **Revamped Options UI:**
    *   **Model Management:** Easily manage and edit your list of preferred LLM models using radio buttons and text fields. Add custom models or remove defaults.
    *   **Language Management:** Similarly manage translation languages, with "No translation needed" as the default, non-editable option.
    *   **Prompt Customization (Advanced):** Fine-tune the LLM's formatting instructions via an editable text area within a collapsible "Advanced Options" section. See a dynamic preview of how translation settings affect the prompt.
    *   **Reset Option:** Reset all settings (except API key) back to defaults with a confirmation prompt.
*   **Chat Export:** Save your chat conversations:
    *   Copy the entire chat as Markdown.
    *   Download the chat as a Markdown (`.md`) file.
    *   Download the raw chat message data as a JSON (`.json`) file.
*   **Keyboard Shortcuts:**
    *   Send messages in the chat window using `Ctrl+Enter` (or `Cmd+Enter` on Mac).
*   **Improved Stability:**
    *   Enhanced Alt+Tab handling to prevent "stuck" hover state.
    *   More robust context passing between summary popup and chat tab.

---

## 🚀 Features

*   **Summarize Anything:** `ALT+hover` to highlight, then `ALT+Click` any element on a web page to select and summarize with a single icon click.
*   **Interactive Chat:** Engage in follow-up conversations with the LLM based on the summarized content and the original HTML snippet.
*   **Rich Formatting:**
    *   Initial summaries (requested as Markdown) are rendered in the popup with basic formatting (bold tags, lists).
    *   Chat responses render full Markdown formatting.
*   **Flexible Model Selection:** Choose from a default list or add/edit any OpenRouter-compatible model ID in the Options. Your selection syncs across sessions. Supports `:nitro` and `:auto`.
*   **Customizable Translation:** Optionally translate summaries into various languages. Manage your preferred language list in the Options, including adding custom ones. Select "No translation needed" to disable.
*   **Customizable Prompt:** Modify the core formatting instructions sent to the LLM via the Advanced Options section.
*   **Chat Export:** Save your chat history as Markdown (copy/download) or JSON (download).
*   **Configurable Summary:** Choose the number of summary bullet points (3–8).
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
    *   The extension sends the element's HTML and your configured prompt (based on Options) to the selected OpenRouter model.
4.  **Review Summary:**
    *   The summary (requested as Markdown from the LLM) appears in a popup, rendered with basic formatting (bold, lists).
    *   Use **Copy** or **Close**.
5.  **Chat (Optional):**
    *   Click **Chat** on the summary popup.
    *   A new browser tab opens. An info banner confirms context is available.
    *   The original HTML snippet and the raw summary text (Markdown) are used as context for your *first* message to the LLM.
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
    *   Choose the number of bullet points (3-8) for the initial summary prompt.
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
        *   **You can customize this part (Editable):** Modify the core formatting instructions using the textarea. Defaults provided.
        *   **Language (Dynamic Preview):** Shows the translation instruction block *only* if a language is selected above. Updates automatically.
        *   **Outro (Fixed):** Shows the final instructions.
*   **Actions:**
    *   **Save Options:** Saves all changes.
    *   **Reset to Defaults:** Resets all settings *except* API Key to their original defaults (requires confirmation).

---

## ✨ Formatting: Simple HTML & Full Markdown

*   **Initial Summaries (Popup):** The LLM is asked for Markdown. A simple parser in the extension converts the expected format (`**Tag**: ...`) into basic HTML (`<b>Tag</b>: ...` within `<li>` elements) for display in the popup. Code fences (```) are stripped if present.
*   **Chat Responses (Chat Tab):** Rendered using the `marked` library, supporting full GitHub Flavored Markdown including bold, italics, lists, code blocks, blockquotes, etc.

---

## 🔒 Privacy & Permissions

*   **Permissions Used:**
    *   `activeTab`, `scripting`: To interact with the page for selection and UI.
    *   `contextMenus`: For the right-click menu option.
    *   `storage`: To save API key/preferences (`sync`) and temporary chat context (`session`).
    *   `<all_urls>`: To allow selection on any website.
*   **Your Data:**
    *   **API Key & Settings:** Stored locally in `chrome.storage.sync`. Only sent to OpenRouter.ai upon request.
    *   **Selected HTML & Summary:** Sent to OpenRouter.ai for summary/chat requests.
    *   **Chat Context:** Original HTML and raw summary text stored temporarily in `chrome.storage.session` for the chat tab. Cleared when the browser session ends.
    *   **No Analytics:** No tracking or ads.
*   **Security:**
    *   Renders basic HTML/Markdown. Does **not** execute scripts or load external resources from LLM responses.

---

## 📝 How to Use (Quick Steps)

1.  **Install** & **Set API Key** in Options.
2.  **ALT+Hover** & **ALT+Click** an element.
3.  Click the **floating icon** (💡) (or context menu/toolbar icon) to **Summarize**.
4.  Review popup. Click **Chat** for follow-up.
5.  In chat: Ask questions (`Ctrl+Enter` to send), use **Export** buttons.
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
A: Original selected HTML + raw summary text are sent with your *first* chat message for context.

**Q: Can I mix models?**
A: Yes! The initial summary uses your default model. In the chat tab, you can select a *different* model from the dropdown for each message you send.

**Q: Can I customize models/languages/prompt?**  
A: Yes! Options allow editing model/language lists. Advanced Options let you edit the core formatting part of the prompt.

**Q: Is rendering Markdown safe?**  
A: Chat uses the `marked` library for standard Markdown. The initial summary popup uses a very basic internal parser. While generally safe, be mindful of LLM outputs. No scripts are executed.

---

## 🏷️ Tags

`Summarizer`, `LLM`, `OpenRouter`, `AI`, `Chat`, `Markdown`, `Chrome Extension`, `Productivity`, `GPT`, `Claude`, `Llama`, `Gemini`, `Article Summarizer`, `Web Clipper`, `Prompt Engineering`
