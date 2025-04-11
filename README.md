# OpenRouter Summarizer

**Summarize any web page content in one click using OpenRouter.ai APIs**

---

## 🚀 Features

- **Summarize Anything:** ALT+hover to highlight, then ALT+Click any element on a web page to select it, then summarize with just one click on the icon.
- **Custom Prompts:** Use your own prompt for the LLM, or stick with the smart default.
- **Choose Your Model:** Select from popular OpenRouter models or enter your own. You can use `:nitro` or `:floor` shortcuts.
- **Instant Results:** See the summary in a beautiful popup, with easy Copy and Close buttons.
- **Secure:** Your API key is stored only in your browser, never sent anywhere except OpenRouter.ai.

---

## 🛠️ How It Works

[Watch the Video](media/or-summ-video-11.mp4)

1. **Install the Extension.**
2. **Set Up Your API Key:**
   - On first install, the Options page opens automatically.
   - Enter your [OpenRouter.ai](https://openrouter.ai/) API key.
   - By default, che cheapest paid model is selected (so you never get rate-limited).
   - Optionally, customize the prompt and model.
3. **Select Content:**
   - Hold **ALT** and hover, chrome will highlight DOM elements. Then click any element (text, article, paragraph, etc.) to select it. The element will be highlighted, and the extension icon will be shown.
4. **Summarize:**
   - Click on the floating icon, or right-click and choose **"Send to LLM"** from the context menu, or click the extension’s toolbar icon.
   - The extension sends the selected text (with your prompt) to OpenRouter.ai.
   - The summary appears in a popup on the page. Copy or close as needed!

---

## ⚙️ Options

- **API Key:** Required for OpenRouter.ai access.
- **Prompt:** Customize how the LLM summarizes content.
- **Model:** Choose from a dropdown or enter any OpenRouter-compatible model.
- **Debug:** Enable console logging.

---

## 🔒 Privacy & Permissions

- **Permissions Used:**
  - `activeTab`, `contextMenus`, `scripting`, `storage` – for selecting content, showing popups, and saving your settings.
  - `<all_urls>` – so you can summarize content on any site.
- **Your Data:**  
  - Your API key and settings are stored only in your browser (Chrome sync storage).
  - No data is sent anywhere except OpenRouter.ai when you request a summary.
  - No analytics, tracking, or ads.

---

## 📝 How to Use

1. **Hold ALt and hover**, **ALT+Click** to select an element (highlighted in red).
2. **Click on the floating icon**, or **Right-click** and choose **"Send to LLM"** or click the extension icon.
3. **View the summary** in the popup. Copy or close as needed.
4. **Change settings** anytime via the Options page.

---

## 🧑‍💻 Open Source

This extension is open source, MIT licensed.
View the code or contribute at: [https://github.com/bogorad/openrouter-summarizer]

---

## ❓ FAQ

**Q: Why do I need an API key?**  
A: The extension uses OpenRouter.ai’s API to generate summaries. You need your own key for access.

**Q: Why not some other provider?**
A: I love OpenRouter, they are fast, reliable, and allow to use any model. Why would I want anything else? :)

**Q: Is my data safe?**  
A: Yes! Your API key is stored only in your browser and never leaves your device except when making requests to OpenRouter.ai.

**Q: Can I use my own prompt or model?**  
A: Absolutely! Customize both in the Options page.

---

## 🏷️ Tags

Summarizer, LLM, OpenRouter, AI, Chrome Extension, Productivity, GPT, Article Summarizer


