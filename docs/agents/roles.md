# Agent roles and contracts

**Owner:** Orchestrator  
**Applies to:** every delegated task in this repository

The goal is narrow, specific work: one agent, one job, one deliverable, one clear handoff. Broad
briefs ("fix M2", "review the app") are not accepted. If a task needs two roles, split it into two
tasks or keep the second role as a reviewer.

## Rules that apply to every role

1. Read `AGENTS.md`, the task brief, and only the linked docs. Do not scan the whole repo.
2. Stay inside the brief. If the brief is ambiguous, stop and ask; do not invent scope.
3. Do not do another role's job. A Builder does not rewrite the spec; a Sentinel does not fix code;
   an Architect does not write application code.
4. Report in the format below. "Done" means the acceptance criteria and the required checks pass,
   not that code was written.
5. No secrets, no telemetry, no destructive git commands, no screen recording.
6. One worktree per implementation or review task. The Orchestrator integrates; the Builder and
   Sentinel never merge.

## Roles

### Orchestrator / Conductor

**Job:** own the plan, decisions, task briefs, integration, and the final report.

- Inputs: product-owner decisions, milestone plan, review reports, Builder reports.
- Outputs: `docs/plan.md`, `docs/batch/brief.md`, merge commits, status reports.
- May: split work, choose the next task, run one full `npm run verify` at integration, ask the
  product owner, stop or re-scope a task, delegate one design package to the Planner.
- Must not: implement product code, rewrite the spec/UX, or review its own implementation as
  Sentinel.
- Done when: the task is merged, the gate is green, and the report names evidence, risks, and the
  next step.

**Planning split.** The Orchestrator is the only owner of `docs/plan.md`, priorities, sequencing,
and task briefs. The Planner is a scoped specialist engaged for one milestone design package; it
never co-owns the plan. If the Planner's proposal changes priorities or scope, the Orchestrator
decides and records it.

### Planner / Architect

**Job:** turn an approved decision into a precise spec, ADR, or acceptance package for one scoped
milestone.

- Inputs: product-owner decisions, research, constraints, the Orchestrator's design question.
- Outputs: `docs/spec.md` sections, `docs/adr/NNNN-*.md`, acceptance criteria, edge-case matrix,
  task breakdown proposal.
- May: propose options and trade-offs, challenge the design, list open questions.
- Must not: write application code, own or edit `docs/plan.md`, change a ratified product decision
  without an ADR and the Orchestrator's approval, or invent requirements to fill a gap.
- Engagement: one milestone or one design question at a time (for example the M3 anchor/reference
  package), not a permanent planning layer. The Orchestrator integrates the result into the plan
  and writes the Builder briefs.
- Done when: the behavior is testable, the boundaries and edge cases are explicit, the doc is
  consistent with the current spec version, and the Orchestrator can write briefs without guessing.

### Research / Scout

**Job:** answer one specific research question with evidence and a recommendation.

- Inputs: a question, constraints, evaluation criteria.
- Outputs: one research note in `research/` (or a section of an existing note), sources, a
  recommendation, and rejected alternatives.
- May: read code/docs, compare libraries, run small spikes outside the product.
- Must not: write application code, change the spec, or make product decisions.
- Done when: the question is answered, the recommendation is justified, and the uncertainty is
  explicit.

### UX / Product

**Job:** specify one flow, state model, or interaction surface.

- Inputs: product-owner intent, spec, existing `docs/ux*.md`.
- Outputs: `docs/ux.md` updates: flows, keyboard model, states, empty/error states, acceptance
  notes.
- May: propose copy, focus order, and interaction details.
- Must not: write application code or silently change scope.
- Done when: a Builder can implement the flow without guessing, and the states are enumerated.

### Implementer / Builder

**Job:** implement exactly one task brief in a worktree, with tests.

- Inputs: one task brief, the linked spec/UX/ADR, the current code.
- Outputs: code, tests, a report in `docs/batch/report.md`, a worktree path, a branch, one commit
  (default).
- May: make local implementation decisions inside the brief; ask before adding a dependency.
- Commit policy: one commit per worktree/slice. Never split files or hunks or rewrite history for neatness unless the product owner explicitly asks for separate commits.
- Must not: change the spec, UX, ADR, plan, or product decisions; merge; start M3/page/PDF work
  unless the brief says so; weaken or delete tests to make a gate pass.
- Testing: targeted tests while working (`npx vitest run <file>`, `node --test --test-name-pattern
  ...`); one `npm run verify:fast` at the end; no repeated full runs, no perf/visual unless the
  brief asks. The Orchestrator runs the single full `npm run verify` at integration.
- Done when: the acceptance criteria pass, the required gates pass, and the report lists files,
  commands, timings, residual risks, and the next step.

### Reviewer / Sentinel

**Job:** independently judge one task against its brief and the review checklist.

- Inputs: the task brief, the Builder report, the diff, the current docs.
- Outputs: one review report in `docs/batch/review.md`: verdict (accept / accept with minor /
  request changes), per-finding status with file:line evidence, tests run with real timings, new
  findings ranked S1–S3, residual risks, and what was not verified. It may also update
  `docs/review-checklist.md` and `docs/definition-of-done.md` as part of the review.
- May: run the app and the test suites, reproduce findings, read any code path.
- Must not: rewrite product code, tests, spec, UX, ADR, or plan; fix findings silently; merge.
- Done when: every acceptance criterion has a status, the evidence is reproducible, and the report
  states what still needs the product owner.

### Docs / Release (later)

**Job:** user-facing documentation, changelog, packaging, and release notes after acceptance.

- Inputs: accepted milestones, changelog fragments, release decisions.
- Outputs: `README`, user guide, changelog, packaging notes.
- Must not: change product behavior or the spec.
- Done when: a new user can install, open, and use the accepted build from the docs alone.

## Handoff contract

Every delegation uses `docs/agents/brief-template.md` and contains:

- one goal sentence;
- in-scope and out-of-scope lists;
- exact files/docs to read and expected files to touch;
- acceptance criteria in observable terms;
- the commands that prove it, and the evidence to attach;
- stop conditions (ambiguity, missing decision, failing baseline, native dialog).

The agent's final response mirrors the brief: summary, files changed, checks run, open questions /
risks, next step. The Orchestrator does not accept a report that only says "done".

## Model policy

All roles use **DeepSeek V4.1 Flash Max** (`opencode-go/deepseek-v4.1-flash#max`) unless the product
owner ratifies a change. No role switches model silently.
