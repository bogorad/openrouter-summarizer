# Exact model pricing

For `openrouter-summarizer-3t4.1`, add production-path regressions before repair.
Resolve full model IDs before supported routing fallback. Reject unavailable
input prices and invalidate only the two legacy derived pricing caches on update.
This keeps genuine free prices separate from missing or dynamic prices.

The baseline reproduced paid-price inheritance, invented zero, missing upgrade
invalidation, and a malformed success reply sending one summary request.
Use a shared pure parser/resolver, the existing state secret loader, the existing
policy rejection, and a two-key update reset. Keep normal TTL and retries.
