---
description: Prep the web app for execution
agent: build
---

run lint, autofix errors if needed
run typecheck
run build
run npx webpack
run @scripts/bump-patch.cjs
