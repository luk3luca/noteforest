# Agent roles and handoffs

**Owner:** Orchestrator.
**Applies to:** every delegated task.
**Per-role prompts:** `docs/agents/roles/<role>.md`.

The goal is narrow work: one agent, one job, one artifact, one handoff. Broad briefs ("fix the
app", "review everything") are split. If a task needs two roles, it becomes two tasks.

## The five roles

| Role | When | Artifact | Writes |
|---|---|---|---|
| **Orchestrator** | every batch | brief, merge, final report | `docs/batch/brief.md`, `docs/plan.md`, merge |
| **Planner** | conditional (see triggers) | plan package, ADR proposal | `docs/batch/plan.md`, `docs/adr/` |
| **Builder** | an approved brief exists | diff, tests, report | code, tests, `docs/batch/report.md` |
| **Sentinel** | implementation ready | review with severity | `docs/batch/review.md`, checklist/DoD |
| **Scout** | one research question | research note | `research/` |

UX is a Planner specialization; docs and release work are a Builder specialization. Do not create
a role per adjective.

## Pipeline

| Step | Who | Artifact |
|---|---|---|
| Scope | product owner + orchestrator | the decision, recorded in the brief |
| Plan | Planner, if triggered | `docs/batch/plan.md` |
| Check the plan | Orchestrator | approved plan, or sent back (max 2 rounds) |
| Build | Builder | branch, commit, `docs/batch/report.md` |
| Judge | Sentinel | `docs/batch/review.md` |
| Integrate | Orchestrator | merge, `npm run verify`, final report |

The orchestrator checks four things on a plan, and no more: scope matches the decision; every
criterion is testable; no product decision was invented; nothing contradicts the spec or an ADR.
Minor clarity fixes are allowed; a design change goes back to the Planner. After two rounds the
question is scope, and the product owner decides.

## Planner triggers

Trigger the Planner when any of these holds:

- a new surface, or a change whose effects cross surfaces (and the batches are split);
- a schema, format, migration or contract change;
- an ADR is required;
- more than one product decision is open;
- the brief cannot be written without inventing a rule.

A bug fix, a copy change, a test or a one-file change does not need a Planner.

## Rules for every role

1. Read `AGENTS.md`, the brief, and only the linked docs. Do not scan the repository.
2. Stay inside the brief. Ambiguity is a stop condition; do not invent scope.
3. Do not do another role's job. The Planner does not code; the Builder does not redesign; the
   Sentinel does not fix; the Orchestrator does not implement.
4. Hand over an artifact, not a conversation. State that must survive a context boundary goes in a
   file (brief, plan, report, review).
5. Always work on a branch. Use a worktree per the policy in `AGENTS.md`, and remove it at merge.
6. No secrets, no telemetry, no destructive git commands, no screen recording.
7. Report in the agreed format; "done" means the criteria and checks pass, not that code exists.
8. All roles use `opencode-go/deepseek-v4.1-flash#max` unless the product owner ratifies a change.

## Conflict rules

When two sources disagree:

1. The current task instruction beats every file.
2. A role file beats a scope file on **behavior** (the Sentinel's read-only wins over a folder's
   "always fix lint").
3. A scope file beats the root on **conventions** for that folder.
4. The root wins on **safety and secrets**, always; no lower file may loosen it.

If a conflict remains, stop and ask the orchestrator. Do not resolve it by preference.

## Handoff contract

Every delegated task answers four questions in writing:

- **Done means:** the observable end state (a green command, a diff, a review with severities).
- **Return format:** the artifact path and its headings.
- **Never touch:** the files or decisions outside the role's authority.
- **Stop and report:** the conditions that end the task early (missing decision, failing baseline,
  unapproved dependency, native dialog, scope growth).

A role without a stop condition keeps going. The stop condition is the safety line.

## Reporting

Summary, files changed, checks run, open questions and risks, next step.
