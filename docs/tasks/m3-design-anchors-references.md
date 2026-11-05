# M3 design package — span anchors, anchored callouts, reference edges

**Role:** Planner / Architect (scoped specialist)  
**Milestone:** M3  
**Base:** current `main` after M2f acceptance  
**Worktree:** fresh docs-only worktree from `main`  
**Timebox:** 1–2 days

## Context

M2f is accepted. M3 is the next implementation milestone: branches from a span inside a block
(text, formula term, code token, image region), anchored callouts, and reference/shared children.
The product decisions are ratified in `docs/spec.md` v0.4.4 and `docs/ux.md`; this package turns them
into a precise, testable design and a small-task breakdown.

## Goal

One reviewed design package that lets the Orchestrator write Builder briefs for M3 without guessing:
data model and commands, identity and undo rules, repair states, acceptance criteria, edge cases,
fixtures, and a task sequence.

## In scope

- Anchor kinds: text range, formula term/whole formula, code token/range, image point/region.
  Binding shape, selector requirements, best-effort geometry, exact vs ambiguous resolution.
- Anchored callouts: child placement below the anchor, branch origin, visual marker, selection,
  outline order. Primary children first by anchor position, then direct primary children.
- Reference edges: branch role, create-from-block and create-from-anchor, shared child behavior,
  "see also", make-home / move-here, cycles, deletion, dedupe. Reference edges never affect layout
  or pagination.
- Branch and anchor identity across create, edit, move, reattach, repair, undo/redo, save/reload:
  anchor ID, branch ID, block ID, chapter slot, order key.
- Broken/ambiguous anchors: detection, visible marker, whole-block fallback, repair dialog,
  confirmation rules, no silent branch deletion, export includes every branch exactly once.
- Undo/redo semantics and command inverses for the new commands; one user action = one undo entry
  for multi-step actions (create anchor + branch, repair, make-home).
- Effects on outline, reader, page view, and PDF (reference edges never paginate; primary anchored
  branches do).
- Acceptance criteria mapped to AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58.
- Edge-case/fixture matrix: missing anchor, duplicate text, formula term edit, code edit inside/
  outside range, image replace/resize, anchor on a deleted block, reference cycle, shared child
  deletion, move across chapters, undo after reload, two anchors in one block.
- Builder task breakdown: small vertical slices (for example M3a anchor model/commands, M3b text
  anchor UI, M3c formula/code/image anchors, M3d reference edges/see-also, M3e repair, M3f undo/
  identity/fixtures), each with scope, tests, and dependencies.

## Out of scope

- Application code, tests, schema changes, or migrations.
- Editing `docs/plan.md`, priorities, or task briefs. The Orchestrator owns the plan.
- Rewriting ratified product decisions. If a decision is missing, list it as an open question with
  options and a recommendation; do not invent it.
- M4 page view/PDF visuals, M5 External API implementation, iPad/Pencil, annotations.
- Changing ADR-0004 shell decisions.

## Files

Read (and only these plus the spec sections they link):
- `AGENTS.md`
- `docs/spec.md` — §5 model/commands/undo, §7 branching/anchors, §13 edge cases, §15 acceptance.
- `docs/ux.md` and `docs/ux-shell.md` — selection, branch creation, keyboard, docs/outline behavior.
- `docs/adr/0004-ui-shell-and-branch-editor.md` — editor shell boundaries.
- `docs/plan.md` — M3 goal and gate.
- `docs/reviews/m2-review.md` and `docs/reviews/m2f-phase5c-review.md` — identity/undo lessons.
- `packages/core/src/model.ts`, `schema.ts`, `commands.ts` — current model and command shape (read
  only; do not change code).

Deliverable:
- `docs/design/m3-anchors-references.md` (new): the design package, proposed spec deltas, ADR
  outline if needed, acceptance matrix, edge cases, fixtures, task breakdown, open questions.
- `docs/reports/m3-design.md` (optional short Builder-style report) or a summary in the final
  response.

## Acceptance criteria

- [ ] Every M3 acceptance criterion above has a concrete behavior and a test strategy.
- [ ] Anchor and branch identity rules are explicit for create/edit/move/repair/undo/reload.
- [ ] Reference edges are proven layout/pagination-neutral in the design.
- [ ] Broken/ambiguous states enumerate user-visible behavior and repair paths.
- [ ] The edge-case matrix names fixtures and expected outcomes.
- [ ] The task breakdown has small, ordered, independently testable slices.
- [ ] Proposed spec deltas are clearly marked as proposals, not applied.
- [ ] Open product decisions are listed with options and a recommendation; none are silently decided.
- [ ] No code, plan, spec, UX, or ADR file is modified.

## Tests and evidence

- Documentation review only; no app launch required.
- Cross-check every AC ID against the spec and the plan gate.
- The Orchestrator will review the package and decide the spec/ADR updates and Builder briefs.

## Stop and ask

Stop and report if a ratified decision conflicts with another doc, if the anchor model would require
a schema break without a migration path, or if a product decision (for example default reference vs
move) is genuinely missing.

## Report format

Summary, files, decisions made vs open questions, AC coverage table, task breakdown, risks, next step.
