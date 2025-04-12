# OpenRouter Summarizer

**Summarize any web page content in two clicks using OpenRouter.ai APIs**  
_Now with native LLM-generated HTML formatting in summaries!_

---

## 🚀 Features

- **Summarize Anything:** `ALT+hover` to highlight, then `ALT+Click` any element on a web page to select and summarize with a single icon click.
- **Rich Formatting:** Summaries display with bold, italics, and other HTML formatting as returned by the LLM for clarity and readability.
- **Custom Prompts:** Use your own summarization prompt, or stick with the smart default.
- **Choose Your Model:** Select from popular OpenRouter models, or enter any compatible string. Supports `:nitro` and `:floor` shortcuts.
- **Translation:** Optionally translate summaries into popular languages (English, Spanish, French, Mandarin, Arabic, Hebrew, Russian, and more).
- **Bullet Count:** Choose the number of summary bullet points (3–8).
- **Instant Results:** Summaries appear in a clean popup, with HTML preserved and handy Copy/Close buttons.
- **Secure:** Your API key and options are stored only in your browser, never sent anywhere except OpenRouter.ai.
- **Debug-Friendly:** Enable debug mode in Options for detailed logging.

---

## 🛠️ How It Works

1. **Install the Extension**
2. **Set Up Your API Key:**
    - On first install, the Options page opens.
    - Enter your [OpenRouter.ai](https://openrouter.ai/) API key.
    - Select or input a model (defaults to the cheapest paid option).
    - Optionally, adjust bullet count and translation language.
3. **Select Content:**
    - Hold <kbd>ALT</kbd>, hover to highlight any DOM element (text, article, paragraph, etc.).
    - <kbd>ALT</kbd>+Click to select it (highlighted red) and reveal the action icon.
4. **Summarize:**
    - Click the floating icon,
    - *or* right-click and select **Send to LLM** from the context menu,
    - *or* click the extension’s toolbar icon.
    - The extension uses that element’s HTML (including any tags/formatting), your prompt, and your model for summarization.
    - The summary appears as a popup on the page—with all returned HTML (`<b>`, `<i>`, etc.) preserved.
    - Use Copy or Close as needed.

---

## ⚙️ Options

- **API Key:** Required to access OpenRouter.ai.
- **Prompt:** Customize the LLM’s summarization approach.
- **Model:** Dropdown and manual input for any OpenRouter-compatible model.
- **Bullet Points:** Choose 3–8 summary points.
- **Translation:** Translate the summary output to another language.
- **Debug:** Enable console logging.

---

## ✨ HTML-Formatted Summaries

Summaries now **display with all HTML formatting as returned by your LLM prompts**, so you’ll see bold, italics, and lists for maximum clarity.  
For instance, if the LLM replies:

```json
[
  "<b>Main finding</b>: The science is clear.",
  "<b>Impacts</b>: People everywhere benefit."
]
```

…you will see in the popup:

- **Main finding**: The science is clear.
- **Impacts**: People everywhere benefit.

This makes summaries clearer and visually structured.

---

## 🔒 Privacy & Permissions

- **Permissions Used:**
  - `activeTab`, `contextMenus`, `scripting`, `storage`: for selecting content, showing popups, and saving preferences.
  - `<all_urls>`: so you can summarize content on any site.
- **Your Data:**
  - Your API key and all local settings are stored only in your browser (Chrome sync storage).
  - No data is sent anywhere except OpenRouter.ai, and only when you ask for a summary.
  - No analytics, tracking, or ads.
- **Security:**
  - The summary popup will render basic tags (bold, italics, lists) returned by the LLM.
  - Extension never executes scripts or loads remote code; formatting only.

---

## 📝 How to Use

1. **Hold ALT and hover**, then **ALT+Click** any element to select.
2. **Click the floating icon**, **right-click and “Send to LLM”**, or use the extension icon.
3. **Review your formatted summary** (with bold, italics, and lists) in the popup. Copy or close as needed.
4. **Change settings** anytime from the Options page.

---

## 🧑‍💻 Open Source

This extension is open source, MIT licensed.  
[View code or contribute on GitHub](https://github.com/bogorad/openrouter-summarizer)

---

## ❓ FAQ

**Q: Why do I need an API key?**  
A: The extension uses OpenRouter.ai’s API to generate summaries. Register for your own free/personal key.

**Q: Why OpenRouter?**  
A: It’s fast, reliable, supports many models, and is cost-friendly.

**Q: Is my data safe?**  
A: Yes! Your key and options never leave your device (except for your direct OpenRouter request).

**Q: Can I use my own prompt or model?**  
A: Of course—use any OpenRouter-compatible model or prompt.

**Q: Is it safe to render LLM-provided HTML?**  
A: Only basic tags are expected (bold, italic, lists). Scripts and external resources are never executed or loaded.

---

## 🏷️ Tags

`Summarizer`, `LLM`, `OpenRouter`, `AI`, `Chrome Extension`, `Productivity`, `GPT`, `Article Summarizer`

