# Free-model pricing repair plan

Recorded: 2026-10-19 17:39 UTC.

Created Beads epic `openrouter-summarizer-3t4` and four open, unassigned
children: exact model pricing (`.1`), options selection and display (`.2`),
model consistency during summary requests (`.3`), and final verification
(`.4`). Beads holds the detailed scope, evidence, acceptance, and dependencies.

The operator stated that output cost is negligible. The plan keeps the existing
input-price estimate and excludes output-cost accounting and budget redesign.
Each code task includes its own regression tests. The plan adds no package,
cache system, pricing service, or UI framework.

The plan addresses the reproduced loss of `:free` during pricing lookup and
related selection, validation, and request-consistency defects. No code change
or implementation was started.
