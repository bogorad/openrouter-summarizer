# Gemini Code Assistant Context

## Project Overview

This project is a Chrome extension called **OpenRouter Summarizer**. It empowers users to select any content on a web page, generate a summary using the OpenRouter.ai API, and engage in a follow-up chat with the context of the summarized content. The extension is built using modern web technologies, including vanilla JavaScript (ES6 modules), and is bundled using Webpack.

**Core Functionality:**

*   **Content Selection:** Users can select any DOM element on a page using `Alt+Click`.
*   **Summarization:** The selected content's HTML is cleaned, converted to Markdown, and sent to a user-selected LLM via OpenRouter.ai for summarization.
*   **Interactive Chat:** A dedicated chat interface allows users to have a conversation with an LLM, with the context of the original content and its summary automatically included.
*   **Joplin Integration:** Users can save selected content directly to their Joplin notebooks.
*   **NewsBlur Integration:** Users can share summaries and content to NewsBlur.
*   **High Configurability:** The extension provides a comprehensive options page to manage API keys, select LLM models, customize prompts, and configure language settings.

**Architecture:**

The extension follows a modular architecture:

*   **Content Scripts (`pageInteraction.js`, etc.):** Injected into web pages to handle user interactions like element selection and displaying the summary popup.
*   **Background Service Worker (`background.js`):** Manages all communication with external APIs (OpenRouter, Joplin), handles business logic, and manages application state and settings.
*   **UI Pages (`options.html`, `chat.html`):** Provide interfaces for configuring the extension and interacting with the chat functionality.
*   **Modules:** The codebase is well-organized into modules for specific functionalities like highlighting, popups, API interactions, and settings management.

## Building and Running

**Building the Extension:**

The project uses Webpack to bundle its JavaScript modules. To build the extension, run the following command from the project root:

```sh
npx webpack
```

This will generate the bundled content script in the `dist/` directory.

**Running the Extension:**

1.  Open Google Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** using the toggle in the top-right corner.
3.  Click on the **"Load unpacked"** button.
4.  Select the project's root directory (`openrouter-summarizer`).
5.  The extension should now be loaded and active.

## Development Conventions

The `CONVENTIONS.md` file outlines the development guidelines for this project. Key conventions include:

*   **Code Style:**
    *   Use early returns to improve readability.
    *   Employ descriptive names for variables and functions.
    *   Event handlers should be prefixed with `handle` (e.g., `handleClick`).
    *   Use `const` for function declarations (e.g., `const myFunction = () => {}`).
    *   Prioritize readability over performance.
*   **Accessibility:** Implement accessibility features on UI elements (e.g., `tabindex`, `aria-label`).
*   **Documentation:**
    *   Add non-trivial comments to explain complex logic.
    *   Maintain a short specification at the top of each file.
    *   Comment each function with its purpose, arguments, and call sites.
*   **Versioning:** After each code change, the patch version number (`xx.yy.zz`) should be bumped in `manifest.json` and `CHANGELOG.md`.
*   **Defensive Programming:** Code should fail early and handle potential errors gracefully.
