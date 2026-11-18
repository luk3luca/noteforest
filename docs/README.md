# Docs

Living documentation only. Per-batch briefs, reports and reviews from before 2026-11-18 were
removed in the docs reset and remain in git history:

```bash
git log --diff-filter=D --oneline -- docs/tasks docs/reports docs/reviews
```

## Product and interaction

| File | What it is |
|---|---|
| `spec.md` | Product model, data model, operations, layout, anchors, persistence, PDF |
| `ux.md` | Interaction model, flows, keyboard, states, accessibility |
| `design-tokens.md` | Index of the token docs |
| `design-tokens-page.md` | Page and print tokens |
| `design-tokens-continuous.md` | Continuous tokens |

## Decisions

| File | What it is |
|---|---|
| `adr/` | Architecture decision records, 0001–0009 |
| `design/` | Current UI specs (shell, sidebar, dialogs, shortcuts, page, find, anchors, health) |

## Process

| File | What it is |
|---|---|
| `status.md` | What shipped, the current release, open gates |
| `plan.md` | Next work, known issues, open decisions |
| `definition-of-done.md` | What "done" means, test strategy, budgets |
| `review-checklist.md` | How to review, severity, verdicts, report template |
| `agents/roles.md` | Role contracts and handoff rules |
| `agents/brief-template.md` | The brief format used for every delegated task |
| `batch/` | The current batch only: `brief.md`, `report.md`, `review.md` |

## Rule

A document is either **living** (a source of truth) or **history** (evidence). History never
overrides a living document. If a decision is not in `spec.md`, `ux.md` or an ADR, it is not
decided.
