# OpenRouter Summarizer v2.0

**Summarize any web page content and chat with the context using OpenRouter.ai APIs**  
_Now with Markdown rendering in chat and flexible model/language options!_

---

## ✨ What's New (v2.0)

*   **Interactive Chat:** After getting a summary, click "Chat" to open a dedicated chat tab. Ask follow-up questions using the original page content and summary as context!
*   **Markdown Rendering:** Chat responses from the LLM are now rendered with full Markdown support (bold, italics, lists, code blocks, etc.) for enhanced readability.
*   **Revamped Options:**
    *   Easily manage and edit your list of preferred LLM models.
    *   Configure translation languages with the same flexibility.
    *   Reset options (except API key) to defaults with one click.
*   **Chat Export:** Save your chat conversations!
    *   Copy the entire chat as Markdown.
    *   Download the chat as a Markdown (`.md`) file.
    *   Download the raw chat message data as a JSON (`.json`) file.
*   **Ctrl+Enter Shortcut:** Send messages in the chat window using `Ctrl+Enter` (or `Cmd+Enter` on Mac).
*   **Under the Hood:** Improved context passing using session storage and updated dependencies.

---

## 🚀 Features

*   **Summarize Anything:** `ALT+hover` to highlight, then `ALT+Click` any element on a web page to select and summarize with a single icon click.
*   **Interactive Chat:** Engage in follow-up conversations with the LLM based on the summarized content and the original HTML snippet.
*   **Rich Formatting:**
    *   Initial summaries display with HTML formatting (`<b>`, `<i>`, etc.) as returned by the LLM.
    *   Chat responses render full Markdown formatting.
*   **Flexible Model Selection:** Choose from a default list or add/edit any OpenRouter-compatible model ID in the Options. Your selection syncs across sessions. Supports `:nitro` and `:auto`.
*   **Customizable Translation:** Optionally translate summaries into various languages. Manage your preferred language list in the Options, including adding custom ones.
*   **Chat Export:** Save your chat history as Markdown (copy/download) or JSON (download).
*   **Configurable Summary:** Choose the number of summary bullet points (3–8).
*   **Keyboard Shortcuts:** Use `Ctrl+Enter` / `Cmd+Enter` to send messages in the chat window.
*   **Instant Results:** Summaries appear in a clean popup; chat happens in a dedicated tab.
*   **Secure & Private:** Your API key and options are stored locally in your browser storage. Chat context is stored temporarily in session storage. Nothing is sent anywhere except OpenRouter.ai when you request a summary or chat response.
*   **Debug-Friendly:** Enable debug mode in Options for detailed console logging.

---

## 🛠️ How It Works

1.  **Install & Setup:**
    *   Install the extension from the Chrome Web Store (or load unpacked).
    *   On first install, the Options page opens automatically.
    *   Enter your [OpenRouter.ai API Key](https://openrouter.ai/keys).
    *   Review and adjust the default model list, translation languages, and other settings if desired. Click **Save Options**.
2.  **Select Content:**
    *   On any webpage, hold <kbd>ALT</kbd> and hover your mouse. Elements that can be summarized will be highlighted with a blue dashed outline.
    *   <kbd>ALT</kbd>+Click an element to select it (it will get a red solid outline). A small floating icon (💡) will appear near your click position.
3.  **Summarize:**
    *   Click the floating icon (💡).
    *   *Alternatively*, right-click anywhere and select **Send to LLM** from the context menu.
    *   *Alternatively*, click the extension's toolbar icon.
    *   The extension sends the selected element's HTML content and your settings to the chosen OpenRouter model.
4.  **Review Summary:**
    *   The summary appears in a popup on the page, preserving basic HTML formatting (like `<b>`, `<i>`) returned by the LLM.
    *   Use the **Copy** or **Close** buttons on the popup.
5.  **Chat (Optional):**
    *   Click the **Chat** button on the summary popup.
    *   A new browser tab opens with the chat interface.
    *   The original HTML snippet and the summary are automatically provided as context for your *first* message.
    *   Type follow-up questions. LLM responses will be rendered with Markdown formatting.
    *   Use the export buttons (Copy MD, Download MD, Download JSON) to save the chat.
    *   Use `Ctrl+Enter` / `Cmd+Enter` to send messages.

---

## ⚙️ Options

The Options page allows full customization:

*   **API Key:** (Required) Your OpenRouter.ai key.
*   **Model Selection:**
    *   A list of models presented with radio buttons and editable text fields.
    *   Select your default model using the radio button.
    *   Edit any model ID directly in its text field.
    *   Add new model rows using the "Add Another Model" button.
    *   Remove models using the '✕' button next to each.
    *   Your customized list and selection are saved. Defaults are provided on first use.
*   **Summary Options:**
    *   Choose the desired number of bullet points (3-8) for the initial summary.
*   **Translation Options:**
    *   Similar UI to Model Selection.
    *   Select "No translation needed" (default, non-editable) or choose a target language.
    *   Edit language names (e.g., "Spanish", "Mandarin Chinese") in the text fields.
    *   Add/Remove languages as needed.
    *   The selected language name is passed to the LLM prompt if translation is enabled (i.e., not "No translation needed").
*   **Other Settings:**
    *   **Enable Debug Logging:** Check this to see detailed logs in the browser's DevTools console (useful for troubleshooting).
*   **Actions:**
    *   **Save Options:** Saves all current settings.
    *   **Reset to Defaults:** Resets all settings *except* the API Key back to their original defaults. Requires confirmation.

---

## ✨ Formatting: HTML & Markdown

*   **Initial Summaries:** Display in the popup with basic HTML tags (`<b>`, `<i>`, `<ul>`, `<li>`) as returned by the LLM, enhancing readability.
*   **Chat Responses:** Rendered using **Markdown**. This means you'll see properly formatted bold text (`**bold**`), italics (`*italic*`), lists (`* item`), code blocks (```code```), and more within the chat window.

---

## 🔒 Privacy & Permissions

*   **Permissions Used:**
    *   `activeTab`, `scripting`: To inject the content script for element selection and UI display.
    *   `contextMenus`: To provide the right-click "Send to LLM" option.
    *   `storage`: To save your API key and preferences (`sync` storage) and temporarily store chat context (`session` storage).
    *   `<all_urls>`: To allow selecting content on any website you visit.
*   **Your Data:**
    *   **API Key & Settings:** Stored only in your browser's local `chrome.storage.sync`. Never sent anywhere except directly to OpenRouter.ai when you make a request.
    *   **Selected HTML & Summary:** Sent to OpenRouter.ai only when you request a summary or chat response.
    *   **Chat Context:** The original HTML snippet and summary are temporarily stored in `chrome.storage.session` while the chat tab is open to provide context to the LLM. Session storage is cleared when the browser session ends.
    *   **No Analytics:** The extension includes no tracking, analytics, or ads.
*   **Security:**
    *   The extension renders basic HTML/Markdown formatting returned by the LLM. It does **not** execute scripts or load external resources embedded in LLM responses. Use reputable LLMs.

---

## 📝 How to Use (Quick Steps)

1.  **Install** and **Set API Key** in Options.
2.  **ALT+Hover** & **ALT+Click** an element on any page.
3.  Click the **floating icon** (💡) or use the context menu/toolbar icon to **Summarize**.
4.  Review the summary popup. Click **Chat** for follow-up questions.
5.  In the chat tab, ask questions, use **Export** buttons, and `Ctrl+Enter` to send.
6.  Adjust models, languages, and other settings in **Options** anytime.

---

## 🧑‍💻 Open Source

This extension is open source, MIT licensed.  
[View code or contribute on GitHub](https://github.com/bogorad/openrouter-summarizer) <!-- Update link if needed -->

---

## ❓ FAQ

**Q: Why do I need an API key?**  
A: The extension uses OpenRouter.ai's API to generate summaries and chat responses. You need your own key (free tiers often available).

**Q: Why OpenRouter?**  
A: It provides access to a wide variety of LLMs through a single API, often with competitive pricing and good performance.

**Q: Is my data safe?**  
A: Yes. Your API key and settings stay in your browser storage. Selected text/HTML is sent to OpenRouter only upon your request. Chat context uses temporary session storage. See the Privacy section for details.

**Q: How does the Chat feature work?**  
A: When you click "Chat" on a summary, the original HTML you selected and the summary text are passed to the chat tab. This context is included with your *first* chat message to the LLM, allowing you to ask relevant follow-up questions.

**Q: Can I customize the models and languages in the Options?**  
A: Yes! Version 2.0 introduces editable lists for both models and translation languages. Add any valid OpenRouter model ID or any target language name.

**Q: Is rendering Markdown from the LLM safe?**  
A: We use the `marked` library to convert Markdown to HTML. While generally safe for standard Markdown, it's always wise to be cautious about unexpected or complex outputs from LLMs. The library is configured for standard GFM and breaks, and does not execute embedded scripts by default.

---

## 🏷️ Tags

`Summarizer`, `LLM`, `OpenRouter`, `AI`, `Chat`, `Markdown`, `Chrome Extension`, `Productivity`, `GPT`, `Claude`, `Llama`, `Gemini`, `Article Summarizer`, `Web Clipper`
