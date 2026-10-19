# Summary priced model

For `openrouter-summarizer-3t4.3`, carry the exact model from pricing to summary
generation. Add production caller and handler regressions before repair.
Reject missing or removed request models before API calls. Preserve request IDs,
the current acknowledgement/result flow, stale-result checks, and error cleanup.

The baseline priced the free model, changed only the saved default, then sent
the paid model to generation. It also accepted missing and unconfigured models.
Pass the captured full ID in the existing message. The handler checks exact
configured membership before API access and uses existing state/secret loaders.
