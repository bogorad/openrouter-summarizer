# Gemini Code Assistant Context

## Project Overview

This project is a Chrome extension called **OpenRouter Summarizer**. It empowers users to select any content on a web page, generate a summary using the OpenRouter.ai API, and engage in a follow-up chat with the context of the summarized content. The extension is built using modern web technologies, including vanilla JavaScript (ES6 modules), and is bundled using Webpack.

**Core Functionality:**

- **Content Selection:** Users can select any DOM element on a page using `Alt+Click`.
- **Summarization:** The selected content's HTML is cleaned, converted to Markdown, and sent to a user-selected LLM via OpenRouter.ai for summarization.
- **Interactive Chat:** A dedicated chat interface allows users to have a conversation with an LLM, with the context of the original content and its summary automatically included.
- **Joplin Integration:** Users can save selected content directly to their Joplin notebooks.
- **NewsBlur Integration:** Users can share summaries and content to NewsBlur.
- **High Configurability:** The extension provides a comprehensive options page to manage API keys, select LLM models, customize prompts, and configure language settings.

**Architecture:**

The extension follows a modular architecture:

- **Content Scripts (`pageInteraction.js`, etc.):** Injected into web pages to handle user interactions like element selection and displaying the summary popup.
- **Background Service Worker (`background.js`):** Manages all communication with external APIs (OpenRouter, Joplin), handles business logic, and manages application state and settings.
- **UI Pages (`options.html`, `chat.html`):** Provide interfaces for configuring the extension and interacting with the chat functionality.
- **Modules:** The codebase is well-organized into modules for specific functionalities like highlighting, popups, API interactions, and settings management.

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

- **Code Style:**
  - Use early returns to improve readability.
  - Employ descriptive names for variables and functions.
  - Event handlers should be prefixed with `handle` (e.g., `handleClick`).
  - Use `const` for function declarations (e.g., `const myFunction = () => {}`).
  - Prioritize readability over performance.
- **Accessibility:** Implement accessibility features on UI elements (e.g., `tabindex`, `aria-label`).
- **Documentation:**
  - Add non-trivial comments to explain complex logic.
  - Maintain a short specification at the top of each file.
  - Comment each function with its purpose, arguments, and call sites.
- **Versioning:** After each code change, the patch version number (`xx.yy.zz`) should be bumped in `manifest.json` and `CHANGELOG.md`.
- **Defensive Programming:** Code should fail early and handle potential errors gracefully.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   # NOTE: `bd sync` exports Beads JSONL; it does NOT stage/commit.
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Export Beads DB to JSONL (no git commit)
```

### Decisions (2026-02-15)

- `.beads/export-state/` is local-only; keep it gitignored and untracked. It stores absolute paths/timestamps and changes frequently.
- `bd sync` exports `.beads/issues.jsonl`. It does not stage, commit, or push.
- When the user says "land the plane" (or explicitly requests push), run: `git pull --rebase` -> `bd sync` -> stage/commit -> `git push` -> `git status`.

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress` and immediately `bd sync --flush-only`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>` and immediately `bd sync --flush-only`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Export Beads JSONL (no git commit)
git commit -m "..."     # Commit code
bd sync                 # Export again if needed
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->
