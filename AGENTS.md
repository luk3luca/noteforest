# AGENTS.md — NoteForest

NoteForest is a Mac-first spatial note-taking app for studying. A note is a document of content
blocks connected by arrows; a branch starts from a whole block or from an anchor inside it (word,
phrase, formula term, code token, image region). The outline edits structure, Continuous is the
authoring surface, Page is the exact paginated result, and PDF export carries real text.

Stack: Electron + React + TypeScript, TipTap/ProseMirror, Tailwind v4, KaTeX, lowlight, Playwright,
Vitest (ADR-0001). PDF: the shared paginator plus `printToPDF` (ADR-0002).

The product owner is **Luca**. The orchestrator is the main thread.

## Invariants

Ratified. Changing one needs an ADR and the product owner.

- **Structure:** Document → Chapters → top-level blocks → descendants. A chapter groups top-level
  blocks only and adds no layout node. Pages are derived by the paginator, never stored.
- **Edges:** one primary incoming edge per block, acyclic. Reference edges may cycle and never
  affect layout or pagination.
- **Geometry:** adaptive, content-driven widths; a child goes right of its parent or wraps below it
  with a slight indent. Only sibling, top-level and chapter order change. No free positioning,
  pins, nudges or fixed pixel columns.
- **Anchors:** text, formula, code, image region. An anchored branch starts at its anchor. A broken
  anchor falls back to the whole block, is visibly marked, and never deletes the branch.
- **Content:** ProseMirror JSON is canonical (`schemaVersion` 2); assets live in the package;
  Markdown import/export; a `.md` file opens as a flat guest view, not a forest.
- **Pagination:** normal blocks are atomic; a long block continues only at a safe internal boundary
  (paragraph, list item, blockquote paragraph, between code lines, between table rows). A line,
  image, formula, code line or table row is never cut. Tables break only between rows.
- **PDF:** one Page PDF, produced from the same paginator, with a real text layer. No reader or map
  PDF.
- **Page settings** (size, orientation, margins, theme, density, chrome) are personal: a global
  default plus a per-document override. They are not part of `document.json`. Orientation is one
  document-wide setting.
- **Layouts and modes:** Continuous | Page × Edit | Read (ADR-0007). Continuous + Edit is the
  default, Page Read is the exact print proof, and switching layout preserves the mode.
- **v1 non-goals:** iPad/Pencil, annotations, collaboration, plugins, spaced repetition, in-app
  agent chat, a local HTTP/MCP API, a forest builder. External agents write `.md` files.

## Commands

```bash
npm run dev          # dev app, isolated data ("NoteForest Dev")
npm test             # unit
npm run e2e          # critical e2e (builds first)
npm run test:recovery
npm run test:ui      # UI suites, default concurrency 4
npm run verify:fast  # typecheck + unit + critical e2e
npm run verify       # verify:fast + recovery + UI; once, on integration
npm run test:perf    # on demand
npm run test:visual  # on demand
npm run dist         # packaged dmg
```

`verify` is the gate: run it once per integration at UI concurrency 4 on this machine. Higher
values time out. Do not duplicate full runs.

## How work is done

One batch = one surface. The owner and the orchestrator decide scope; a planner turns it into a
plan when the work needs one; a builder implements it; a sentinel judges it independently; the
orchestrator integrates and runs one full verify. The current batch's `brief.md`, `plan.md`,
`report.md` and `review.md` live in `docs/batch/` and are replaced by the next batch; git keeps the
history.

**Always a branch.** Use a worktree when the work is long, touches more than one surface, changes
dependencies or build, needs parallel builders, or when the main checkout must stay usable. A small
fix in one or two files can work in place on a branch. Remove the worktree in the same step as the
merge: a worktree that outlives its batch is a defect.

- **Orchestrator:** scope, briefs, integration, final report. Never writes product code.
- **Planner (conditional):** a plan package for new surfaces, schema changes, or an ADR. Never
  writes code, priorities or product decisions.
- **Builder:** one brief, with tests. The plan is the contract; its criteria are the floor. Never
  merges, never edits spec, UX, ADR or plan.
- **Sentinel:** independent review against `docs/review-checklist.md`. Never rewrites code.
- **Scout (on demand):** one research question, with sources.
- **Product owner:** product decisions and the manual visual/VoiceOver/PDF checks.

Role contracts and the handoff format: `docs/agents/roles.md`; per-role prompts:
`docs/agents/roles/`.

Rules:

- Every code change has tests; a bug fix has a regression test that fails before the fix.
- UI changes need an app screenshot. Screen recordings belong to the product owner.
- No new dependency without approval; prefer permissive, maintained libraries.
- No secrets, no telemetry, no destructive git commands.
- Ambiguity is a stop condition: ask, do not invent the requirement.
- A change to the stack, the PDF pipeline, or the layout/pagination model needs an ADR.

## Where to look

`docs/README.md` is the index. The short version:

- `docs/spec.md` — product model and behavior.
- `docs/ux.md` — interaction, keyboard, states.
- `docs/adr/` — the reason behind the architecture.
- `docs/design/` — current UI specs; `docs/design-tokens*.md` — tokens.
- `docs/status.md` — what shipped; `docs/plan.md` — next work and known issues.
- `docs/agents/roles.md` — role contracts and the brief template.
- `docs/definition-of-done.md`, `docs/review-checklist.md` — the gates.

Briefs, reports and reviews from before 2026-11-18 were removed in the docs reset and live in git
history. History is evidence, not a source of truth: the documents above are.

## Language

English: code, comments, documentation, commits, test names, UI copy.
Italian: chat with the product owner.

## Reporting

Summary, files changed, checks run, open questions and risks, next step.
