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

## Architecture Schematic

The architecture diagram lives in `docs/schematic.typ` (Typst source).
After editing it, regenerate the outputs:

```bash
typst compile docs/schematic.typ docs/schematic.pdf
typst compile docs/schematic.typ docs/schematic.png --format png --ppi 150 --pages 1
magick docs/schematic.png -trim +repage docs/schematic.png
```

Commit all three files (`schematic.typ`, `schematic.pdf`, `schematic.png`) together.

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
   bd export --no-memories -o .beads/issues.jsonl
   git add .beads/issues.jsonl
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
bd export --no-memories -o .beads/issues.jsonl  # Export Beads DB to JSONL
```

### Decisions (2026-02-15)

- `.beads/export-state/` is local-only; keep it gitignored and untracked. It stores absolute paths/timestamps and changes frequently.
- `bd export --no-memories -o .beads/issues.jsonl` exports the Dolt-backed issues to `.beads/issues.jsonl`.
- `.beads/hooks/pre-commit` runs that export and stages `.beads/issues.jsonl` before each commit.
- When the user says "land the plane" (or explicitly requests push), run: `git pull --rebase` -> `bd export --no-memories -o .beads/issues.jsonl` -> stage/commit -> `git push` -> `git status`.

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress --json`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id> --reason="Completed" --json`
5. **Export**: Run `bd export --no-memories -o .beads/issues.jsonl` before ending the session

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
bd export --no-memories -o .beads/issues.jsonl
git add .beads/issues.jsonl
git commit -m "..."     # Commit code
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always export Beads state with `bd export --no-memories -o .beads/issues.jsonl` before ending session

<!-- end-bv-agent-instructions -->

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Sync

bd writes issue updates locally. Export Beads state to `.beads/issues.jsonl`
and commit that file with the related code changes.

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd export --no-memories -o .beads/issues.jsonl
   git add .beads/issues.jsonl
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

<!-- END BEADS INTEGRATION -->
