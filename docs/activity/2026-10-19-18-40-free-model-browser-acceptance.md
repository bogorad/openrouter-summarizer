# Free-model repair acceptance

Recorded: 2026-10-19 18:40 UTC.

Verified epic `openrouter-summarizer-3t4` at source commit
`bd80fbb05db35bef795963106cd3018de6c60d81`, version **3.10.11**. Manifest, package, and lockfile
versions match. Output-cost accounting remains unchanged.

The final `npm test` passed the Webpack build and **168 tests**. Regression
tests first reproduced the original pricing/default failures, the model race,
and the later A-to-B-to-A stale-response failure. They now cover exact free
IDs, unavailable prices, the real content caller, upgrade cache reset, options
persistence, documented routing modifiers, and summary model consistency.

Browser checks used headless Chromium **155.0.8059.79**, a disposable profile,
and a clean copy of the committed tracked files. The content bundle matched
SHA-256 `6f5da6a30ddebbdec921c8a58e0ae3274609eaf7e36f915cfe24f445a9bcc129`.
Alt-click selected a local 470-character article; Enter activated the actual
summary control. The rendered free-summary popup was visually inspected.

| Browser case | Catalog fetches | Generation calls | Result |
| --- | ---: | ---: | --- |
| MiniMax free, fresh cache | 0 | 1 | HTTP 200, exact free ID, rendered summary, cost 0 |
| MiniMax free, cold cache | 1 | 1 | HTTP 200, exact free ID, rendered summary, cost 0 |
| Gemini paid control | 0 | 1 | HTTP 200, correct ID, rendered summary, cost 0.0001115 USD |
| Dynamic price for openrouter/auto | 0 | 0 | Clear unavailable-pricing error |
| Free request while default changes to paid during delayed pricing | 1 | 1 | HTTP 200, original free ID, rendered summary, cost 0 |
| Next action after the default change | 0 | 1 | HTTP 200, new paid ID, rendered summary, cost 0.0001051 USD |

The models were `minimax/minimax-m3.1-flash:free` and
`google/gemini-2.5-flash-lite`. Request and reported model IDs matched.
The options page retained both free defaults through load, blur, refresh,
Save, and reload, and showed **No limit**. The browser upgrade check removed
both seeded derived caches after the asynchronous update hook settled and
preserved the configured defaults and unrelated marker.

No normal browser settings were changed. The test key was removed through the
secret store; the owned browser, local fixture server, temporary profile,
tracked-file artifact, and screenshot were removed. No credentials were
written to issue records or evidence files.
