# Task brief template

Use one template per delegated task. Keep it specific: an agent must be able to finish without
guessing. Delete sections that do not apply; never leave a section as "TBD".

```markdown
# <Task ID> — <specific deliverable>

**Role:** Orchestrator / Scout / Architect / UX / Builder / Sentinel / Docs  
**Milestone:** M<x>  
**Base:** `<commit>`  
**Worktree:** `<path>` (Builder/Sentinel only)  
**Timebox:** <hours>

## Context

Two or three sentences: what problem this solves and why now. Link only the docs the agent needs.

- `docs/...`
- `docs/...`

## Goal

One sentence. The deliverable, not the activity. Example: "One `⌘Z` after New chapter removes the
chapter and its first block."

## In scope

- Observable behavior 1.
- Observable behavior 2.
- Tests that prove it.
- Docs that must change.

## Out of scope

- M3 / page view / PDF unless this brief is explicitly that milestone.
- Other findings, refactors, or polish not listed above.
- Spec/UX/ADR changes unless the Architect owns this task.

## Files

Read:
- `path/to/file.ts` — why.
- `path/to/test.ts` — why.

Expected to touch:
- `path/to/file.ts`
- `path/to/test.ts`
- `docs/reports/<task>.md`

## Acceptance criteria

- [ ] Observable criterion 1, with the exact user path.
- [ ] Observable criterion 2, including the failure/empty/read-only state.
- [ ] No regression in <specific flow>.
- [ ] Gate: <commands> pass with real timings.

## Tests and evidence

- Targeted during work: `<command>`.
- End of task: `npm run verify:fast`.
- Integration (Orchestrator only): `npm run verify`.
- App evidence: screenshot/PDF path, or "manual product-owner check".
- No native OS dialog may block a test; no fixed sleeps; do not weaken existing assertions.

## Stop and ask

Stop and report instead of inventing a decision when:

- the brief conflicts with the spec/UX/ADR;
- a product decision is missing;
- a baseline test fails for an unrelated reason;
- a native dialog would be needed;
- the fix would require changing a public command, schema, or scope.

## Report format

- Summary: what changed and why.
- Files changed.
- Checks run, with real timings.
- Acceptance criteria: pass/fail per item.
- Open questions / risks.
- Next suggested step.

The Orchestrator rejects a report that does not map back to the acceptance criteria.
```

## Specificity checklist (Orchestrator, before sending)

- [ ] One deliverable, not a theme.
- [ ] Exact user path or command that must work.
- [ ] Exact files to read/touch; no "explore the repo".
- [ ] Non-goals listed.
- [ ] Acceptance criteria observable and testable.
- [ ] Tests named, with the budget.
- [ ] Stop conditions listed.
- [ ] Worktree/branch and base commit named.
- [ ] Report format included.
- [ ] If the task needs two roles, split it.
