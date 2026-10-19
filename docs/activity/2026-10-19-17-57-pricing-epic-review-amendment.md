# Pricing epic amended after review

Recorded: 2026-10-19 17:57 UTC.

The operator accepted the adversarial review of `openrouter-summarizer-3t4`.
Updated the epic and its four existing children to permit a narrow upgrade
reset of derived pricing caches, preserve the documented `:auto` pricing
fallback, and remove the content caller's invalid-price-to-zero bypass.

Child `.1` now owns the cache reset, content price validation, and their
regressions. Child `.3` depends on `.1` because both edit `pageInteraction.js`.
Children `.2` and `.3` wait for `.1`; `.4` waits for `.2` and `.3`.

Stored issue text, parent links, and dependencies were verified. All issues
remain open and unassigned; only `.1` is ready. Output-cost accounting remains
excluded. No implementation was started.
