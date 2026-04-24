# Rebuild Branch Checkpoint Policy

This policy defines how rebuild work lands safely on the `v3-10` branch.
It applies to Beads issues under the rebuild epic and should be used with the
module ownership boundaries in `docs/rebuild/target-module-layout.md`.

## Checkpoint Goals

- Keep every pushed checkpoint reviewable, buildable, and traceable to a
  Beads issue.
- Preserve parallel worker safety by limiting each checkpoint to a declared
  write scope.
- Commit generated outputs only when they are part of the changed source
  contract.
- Keep `.beads/issues.jsonl` synchronized with the Beads database before any
  branch push.

## Commit Size

Each checkpoint should be the smallest complete unit that satisfies one Beads
issue or one explicit slice of an issue.

Use these limits:

- Prefer one Beads issue per commit.
- Keep a commit inside one rebuild lane when possible, such as `js/state`,
  `js/messaging`, `js/content`, `js/ui`, `js/integrations`, `js/chat`,
  `js/options`, or `test`.
- Do not combine unrelated lanes in one checkpoint.
- Do not mix mechanical moves with behavior changes unless the behavior change
  depends on the move.
- Split a large migration into compatibility commit, caller migration commit,
  and cleanup commit.
- Include docs or tests in the same commit when they verify or explain the
  changed behavior.

A checkpoint is too large when reviewers cannot name the changed contract from
the commit title and Beads issue alone.

## Beads Status Workflow

Use Beads as the single source of task status.

1. Before editing, inspect the issue with `bd show <id> --json`.
2. Claim the issue with `bd update <id> --claim --json`.
3. Work only inside the issue's declared write scope. If the scope is missing,
   add a clear scope in the issue notes before editing shared files.
4. If new work is discovered, create a linked Beads issue with a
   `discovered-from:<id>` dependency instead of adding markdown task lists.
5. After implementation and verification, close the issue with
   `bd close <id> --reason "Completed" --json`.
6. Export Beads state with
   `bd export --no-memories -o .beads/issues.jsonl`.

Do not close an issue until the required quality gates for its changed files
have passed.

## Quality Gates Before Pushing

Run the strongest gate that applies to the checkpoint before pushing to
`v3-10`.

Required baseline:

```bash
npm test
```

Focused gates:

- For unit-only or pure-module work, run `npm run test:unit` during iteration
  and `npm test` before push.
- For extension bundle or entrypoint changes, run `npm test` before push.
- For documentation-only changes, verify the affected file exists, check the
  required headings or terms with `rg`, and run
  `git diff --check <changed-docs>`.
- For architecture schematic edits, regenerate and commit all related outputs:
  `docs/schematic.typ`, `docs/schematic.pdf`, and `docs/schematic.png`.

Manual smoke checks are required when a checkpoint changes browser-only flows
that automated tests do not cover, such as selection, summary display, chat
handoff, options save/load, Joplin notebook selection, or NewsBlur sharing.
Record the smoke check in the issue or handoff notes.

## Beads Export Timing

Export `.beads/issues.jsonl` at these points:

- After claiming an issue when the claim will be committed.
- After creating, updating, or closing any issue.
- Immediately before the final commit for a checkpoint.
- Immediately before pushing `v3-10`.

Commit `.beads/issues.jsonl` with the code or docs that complete the related
issue. Do not commit `.beads/export-state/`; it is local-only state.

## Parallel Write Safety

Parallel workers must avoid shared write targets.

Safe rules:

- Each worker owns one Beads issue and one declared file or directory scope.
- A worker may read any project file needed for context.
- A worker writes only files named by the issue or agreed in coordination.
- Shared entrypoints such as `background.js`, `pageInteraction.js`,
  `options.js`, and `chat.js` require exclusive ownership for the checkpoint.
- Workers do not rewrite files outside their scope to resolve style, lint, or
  formatting differences.
- Workers do not revert changes they did not make.

Conflict avoidance:

- Before editing, check `git status --short -- <path>` for the intended files.
- If another worker has changed a target file, coordinate or switch to a
  non-overlapping issue before writing.
- Keep exported Beads state as the only expected shared metadata write.
- When multiple workers update Beads in parallel, export after each worker's
  final Beads update and review `.beads/issues.jsonl` for unrelated issue
  churn before staging.

## Generated Artifacts

Commit generated artifacts only when the source change requires them.

Commit these generated outputs with their source:

- `dist/pageInteraction.bundle.js` when the extension bundle output changes
  as part of the checkpoint.
- `docs/schematic.pdf` and `docs/schematic.png` when
  `docs/schematic.typ` changes.
- `.beads/issues.jsonl` when Beads issue state changes.

Do not commit local caches, temporary exports, browser profiles, logs, or
`.beads/export-state/`.

## Push Checklist

Before pushing a checkpoint to `v3-10`:

1. Confirm `git status --short` contains only intended files.
2. Run the required quality gate.
3. Close or update the Beads issue.
4. Export `.beads/issues.jsonl`.
5. Stage only the intended files.
6. Commit one reviewable checkpoint.
7. Rebase on the current remote branch before push.
8. Push and verify the branch is up to date with origin.
