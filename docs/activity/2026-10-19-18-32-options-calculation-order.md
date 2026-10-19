# Options pricing calculation order

For reopened `openrouter-summarizer-3t4.2`, prevent a delayed A reply from
overwriting a newer cached A result after an A to B to A selection change.
Add production-controller regressions for old error/success replies and latest
same-model results. Use one local calculation counter, including cache hits.

The counter now advances for every calculation. Network/storage continuations
and error handling discard a result unless it belongs to the latest calculation.
This closes the A to B to A gap without changing cache expiry or refresh behavior.
