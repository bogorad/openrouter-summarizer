# Target Module Layout and Migration Sequence

This document defines the target module layout for the rebuild. It is a
planning document for `openrouter-summarizer-b1p.10`; it does not change
runtime behavior.

The rebuild should keep each step buildable. Move behavior behind small
modules first, then update entrypoints to delegate to those modules.

## Target Directories

### `js/messaging`

Owns runtime message contracts and Chrome message transport.

Target files:

- `js/messaging/actions.js`: action names and request/response shape notes.
- `js/messaging/runtimeClient.js`: typed wrappers around
  `chrome.runtime.sendMessage` and tab messages.
- `js/messaging/router.js`: background-side action registration and dispatch.
- `js/messaging/contentRouter.js`: content-script message registration and
  dispatch for actions received by `pageInteraction.js`.

Dependencies:

- May depend on `js/logger.js`.
- Must not depend on UI modules, screen entrypoints, or integration clients.
- Background action handlers may import state, content, chat, and integration
  modules, but message constants must remain leaf-safe.

### `js/state`

Owns settings schema, storage access, and secret access.

Target files:

- `js/state/settingsSchema.js`: defaults, key names, validation, and migration
  helpers for non-secret settings.
- `js/state/settingsStore.js`: `chrome.storage.sync` reads and writes for
  user-visible settings.
- `js/state/secretStore.js`: encrypted local secret reads and writes for
  OpenRouter, NewsBlur, and Joplin tokens.
- `js/state/chatSessionStore.js`: `chrome.storage.session` access for chat
  context and active chat request metadata.

Dependencies:

- May depend on `constants.js`, `js/encryption.js`, and `js/logger.js`.
- Must not depend on UI modules or entrypoints.
- Must not expose decrypted secrets through general settings reads.

### `js/content`

Owns page content extraction, normalization, sanitization, and request
artifacts.

Target files:

- `js/content/contentArtifacts.js`: data objects for selected HTML, sanitized
  HTML, markdown, title, URL, language hints, and cost estimates.
- `js/content/extractionPipeline.js`: selected-element extraction,
  complexity checks, sanitization, markdown conversion, and truncation
  decisions.
- `js/content/priceGate.js`: max-price policy calculation used before summary
  requests.

Dependencies:

- May depend on `js/htmlSanitizer.js`, `utils.js` markdown helpers, constants,
  and pricing response data.
- Must not call OpenRouter, Joplin, NewsBlur, or Chrome tab APIs directly.
- Must return plain artifacts for the caller to pass to messaging or UI code.

### `js/ui`

Owns reusable DOM primitives and shared UI behavior.

Target files:

- `js/ui/dom.js`: element creation, text-safe updates, attributes, and event
  helper utilities.
- `js/ui/buttons.js`: icon/text button factories and disabled/loading states.
- `js/ui/formRows.js`: labeled inputs, selects, checkboxes, numeric controls,
  and validation messages.
- `js/ui/autocomplete.js`: model, language, and notebook autocomplete behavior.
- `js/ui/popup.js`: popup shell, focus handling, close behavior, and status
  body updates.
- `js/ui/notifications.js`: page and extension-page notification display.

Dependencies:

- May depend on `js/logger.js`.
- Must not depend on settings, messaging, integrations, or entrypoint files.
- All user-provided text must enter the DOM through text nodes or sanitized
  HTML helpers.

### `js/integrations`

Owns external service clients and workflow adapters.

Target files:

- `js/integrations/openrouterClient.js`: shared OpenRouter chat completion
  request helper.
- `js/integrations/openrouterModels.js`: model/pricing refresh and lookup.
- `js/integrations/joplinClient.js`: notebook listing and note creation.
- `js/integrations/newsblurClient.js`: NewsBlur share API.
- `js/integrations/sharePayloads.js`: construction of NewsBlur and Joplin
  payloads from content artifacts.

Dependencies:

- May depend on `js/state/secretStore.js`, `constants.js`, and `js/logger.js`.
- Must not render UI.
- Must accept explicit payloads and return normalized success/error results.

### `js/chat`

Owns chat workflow and chat-page screen modules.

Target files:

- `js/chat/chatController.js`: screen orchestration for loading context,
  sending prompts, stopping requests, and storing message state.
- `js/chat/chatRenderer.js`: message list rendering, quick prompt rendering,
  copy/download buttons, and empty/loading states.
- `js/chat/chatRequestBuilder.js`: construction of OpenRouter chat messages
  from session context, selected model, language, and user prompt.
- `js/chat/chatStreamState.js`: active request and placeholder lifecycle.

Dependencies:

- May depend on `js/messaging/runtimeClient.js`, `js/state/chatSessionStore.js`,
  `js/state/settingsStore.js`, `js/ui/*`, and markdown rendering helpers.
- Must not directly read `chrome.storage` or call `chrome.runtime.sendMessage`
  outside the messaging wrapper.

### `js/options`

Owns options-page sections and form orchestration.

Target files:

- `js/options/optionsController.js`: page boot, section wiring, load/save flow,
  and tab persistence.
- `js/options/modelSettingsSection.js`: model list, default models, pricing
  refresh, and price display.
- `js/options/languageSettingsSection.js`: language list and autocomplete.
- `js/options/promptSettingsSection.js`: summary prompt and bullet settings.
- `js/options/integrationSettingsSection.js`: OpenRouter, NewsBlur, and Joplin
  token controls.
- `js/options/quickPromptsSection.js`: chat quick prompt list controls.
- `js/options/optionsValidation.js`: form validation and error mapping.

Dependencies:

- May depend on `js/state/settingsStore.js`, `js/state/secretStore.js`,
  `js/messaging/runtimeClient.js`, `js/ui/*`, and constants.
- Must not own storage schema or encryption details.
- Must keep section modules independent enough to test without a full options
  page.

### `test`

Owns executable regression coverage and fixtures.

Target files:

- `test/helpers/chromeMock.js`: minimal Chrome API mock for unit tests.
- `test/helpers/dom.js`: DOM setup helpers if a DOM runner is added later.
- `test/fixtures/`: HTML, settings, message, and integration payload fixtures.
- `test/unit/`: unit tests for state, messaging, content, UI primitives, and
  integration payload builders.

Dependencies:

- Tests may import production modules.
- Production code must not import test helpers.
- Tests should run with `npm run test:unit`.

## Entrypoint End State

### `background.js`

After rebuild, `background.js` remains the Manifest V3 service worker entrypoint.
It should contain only:

- install/update bootstrapping;
- context menu registration;
- router construction with action-to-handler registrations;
- service-worker logging setup.

It should delegate settings reads, OpenRouter calls, Joplin calls, NewsBlur
calls, chat context storage, and UI page opening to modules under `js/state`,
`js/integrations`, `js/chat`, and `js/messaging`.

### `pageInteraction.js`

After rebuild, `pageInteraction.js` remains the content-script entrypoint. It
should contain only:

- bootstrapping for selection listeners and content-script message routing;
- wiring between highlighter, floating icon, summary popup, Joplin UI, and
  messaging;
- short orchestration functions that pass selected DOM nodes through
  `js/content` and send typed messages through `js/messaging`.

It should not own markdown conversion, sanitizer policy, price policy,
NewsBlur payload construction, Joplin payload construction, or message string
literals.

### `options.js`

After rebuild, `options.js` remains the options-page script entrypoint. It
should contain only:

- `DOMContentLoaded` boot;
- creation of `optionsController`;
- top-level error handling for failed page initialization.

All section rendering, validation, storage reads/writes, encryption calls,
pricing refresh, language autocomplete, and tab persistence should live under
`js/options`, `js/state`, `js/integrations`, and `js/ui`.

### `chat.js`

After rebuild, `chat.js` remains the chat-page script entrypoint. It should
contain only:

- `DOMContentLoaded` boot;
- creation of `chatController`;
- top-level error handling for failed page initialization.

All message rendering, request building, stop handling, model selection,
language display, quick prompt behavior, copy/download behavior, and active
placeholder state should live under `js/chat` and `js/ui`.

### `joplinManager.js`

After rebuild, `joplinManager.js` should either become a thin compatibility
module or be replaced by modules under `js/integrations` and `js/ui`.

If retained temporarily, it should contain only:

- public functions used by `pageInteraction.js`;
- delegation to `js/integrations/joplinClient.js` for API calls;
- delegation to `js/ui/popup.js` and `js/ui/autocomplete.js` for modal UI.

It should not construct unsafe HTML strings or directly own notebook API
fetching once the integration module exists.

## File-Level Ownership

| Area | Owns | Does not own | Primary dependents |
| --- | --- | --- | --- |
| `js/messaging` | action names, runtime send helpers, routers | business logic, UI rendering | all entrypoints |
| `js/state` | settings schema, storage, encrypted secrets, session state | DOM, service clients | background, options, chat, page interaction |
| `js/content` | selected content artifacts, sanitization flow, price decisions | network calls, UI | page interaction, integrations payload builders |
| `js/ui` | DOM factories, controls, popups, notifications | storage, network, message routing | options, chat, summary/Joplin UI |
| `js/integrations` | OpenRouter, Joplin, NewsBlur clients and payloads | DOM, screen state | background, page interaction workflows |
| `js/chat` | chat page workflow and rendering | raw storage and raw messaging APIs | `chat.js` |
| `js/options` | options page workflow and sections | storage schema and encryption details | `options.js` |
| `test` | test helpers, fixtures, unit coverage | production behavior | CI and local quality gates |

## Dependency Order

The dependency direction should be:

1. `constants.js`, third-party globals, and browser APIs.
2. `js/logger.js`, `js/encryption.js`, and low-level helpers.
3. `js/state`, `js/ui`, and `js/messaging/actions.js`.
4. `js/content` and `js/integrations`.
5. `js/messaging/router.js` and `js/messaging/runtimeClient.js`.
6. `js/chat` and `js/options`.
7. Entrypoints: `background.js`, `pageInteraction.js`, `options.js`,
   `chat.js`, and temporary compatibility modules such as `joplinManager.js`.

Rules:

- Lower layers must not import higher layers.
- Entrypoints may import controllers, routers, and compatibility adapters.
- Screen modules may import UI primitives and state stores, but not background
  internals.
- Integration modules may import secret access, but UI modules must not.

## Migration Sequence

Each step must leave `npm test` buildable.

1. Add test harness scaffolding and one smoke test for importable pure modules.
   Verify with `npm run test:unit` and `npm test`.
2. Extract message action constants into `js/messaging/actions.js` while
   keeping existing string values. Replace call sites one group at a time.
   Verify with `npm test`.
3. Add `js/state/settingsSchema.js` and move defaults/key names into it without
   changing storage behavior. Keep old exports as compatibility aliases until
   callers move. Verify settings load/save manually and with unit tests.
4. Add `js/state/secretStore.js` and move encrypted token reads/writes behind
   explicit functions. Verify no general settings response contains decrypted
   secrets.
5. Add `js/state/settingsStore.js` and migrate `options.js`,
   `js/settingsManager.js`, and install defaults to the store. Verify options
   load/save and background settings responses.
6. Add `js/ui/dom.js`, then migrate repeated text-safe DOM creation in
   Joplin, summary popup, chat, and options. Verify no behavior change with
   `npm test` and focused manual smoke checks.
7. Add `js/ui/buttons.js`, `js/ui/formRows.js`, `js/ui/autocomplete.js`, and
   `js/ui/popup.js`. Migrate one UI surface at a time. Verify each migrated
   surface before moving to the next.
8. Add `js/content/contentArtifacts.js` and
   `js/content/extractionPipeline.js`. Move selected-element cleaning,
   markdown conversion, and price truncation out of `pageInteraction.js`.
   Verify summary requests still receive the same artifact fields.
9. Add `js/integrations/openrouterClient.js` and move shared OpenRouter fetch
   behavior from summary, chat, and pricing modules behind one client. Verify
   summary, chat, and pricing refresh paths.
10. Add `js/integrations/joplinClient.js` and
    `js/integrations/newsblurClient.js`. Move service fetches out of
    `background.js` while preserving existing message responses. Verify Joplin
    notebook listing, Joplin note creation, and NewsBlur share.
11. Add `js/messaging/router.js` and `js/messaging/runtimeClient.js`. Move
    background dispatch and content-script dispatch behind routers while
    preserving action names and response shapes. Verify unknown-action errors
    and all known actions.
12. Add `js/chat/*` modules and reduce `chat.js` to page boot plus controller
    creation. Verify chat load, send, stop, quick prompts, model selection,
    copy, and download.
13. Add `js/options/*` modules and reduce `options.js` to page boot plus
    controller creation. Migrate one options section at a time. Verify each
    section's load, edit, validation, save, and reset behavior.
14. Reduce `pageInteraction.js` to orchestration only. Move remaining payload
    construction and workflow helpers into `js/content`, `js/integrations`,
    `js/ui`, and messaging modules. Verify selection, summary, chat handoff,
    Joplin, NewsBlur, and options opening.
15. Retire compatibility aliases and unused functions after all callers move.
    Verify with import checks, `npm test`, and a final manual extension smoke
    test.

## Parallel Work Boundaries

Parallel work is safe when each worker owns one directory and no shared
entrypoint is edited in the same pass.

Safe early parallel lanes:

- `test` scaffolding and fixtures.
- `js/messaging/actions.js` constants only.
- `js/state/settingsSchema.js` schema only.
- `js/ui/dom.js` primitives only.
- `js/content/contentArtifacts.js` artifact definitions only.

Unsafe parallel edits:

- Multiple workers editing `options.js`.
- Multiple workers editing `pageInteraction.js`.
- A worker changing message action names while another migrates call sites.
- A worker changing storage key names while another migrates settings callers.
- A worker changing UI primitive signatures while another consumes them.

When a shared entrypoint must change, claim the related Beads task and keep the
write scope to that entrypoint plus the module being adopted.
