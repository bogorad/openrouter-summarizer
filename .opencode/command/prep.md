---
description: Prep the web app for execution
agent: build
---

run lint, autofix errors if needed
run typecheck
run @scripts/bump-patch.cjs
run build
run npx webpack
