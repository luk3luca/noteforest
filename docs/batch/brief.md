# Batch — v0.1.1 input and Page gap

**Role:** Planner (design package, no code). **Branch:** `docs/v0.1.1-plan` in a worktree.
**Base:** the commit that contains this brief. **Plan:** `docs/architecture/v0.1.1-plan.md`.
**ADR:** `docs/adr/0010-page-sibling-gap.md` (next free number; confirm against `docs/adr/`).
**Sentinel:** none unless the product owner explicitly approves one.
**Timebox:** one planning session. Cap the decision count; stop and ask if a product decision is
needed.

## Goal

Ship v0.1.1: the anchor-resolution index is already merged (`fc8fbbc`), plus four editor
input/paste fixes and the Page vertical sibling-gap setting. Two builders work in parallel on
separate worktrees; the orchestrator integrates both, runs one full `verify`, then cuts 0.1.1.

## Decisions (closed)

- **In scope:** heading marker toggle (plan §12), formula `$` selection toggle, table-cell inline
  marks/formulas plus GFM paste/export, HTML math paste normalization (plan §15), Page sibling gap.
- **Out of scope:** long inline formula width (plan §13) and arrow boundary (plan §14). They stay in
  `docs/plan.md`; do not fix them in this batch.
- **Page gap:** vertical gap between sibling cards only. The horizontal parent→right-group corridor
  stays a fixed 18 px engine constant; nothing horizontal is configurable. The vertical gap is fixed
  under density, is a per-document override, and applies to the PDF. Default stays 18; range 0–96.
  No smaller default for new documents.
- One release `0.1.1`; two worktrees/builders; one integration window; one full `verify` after both
  merges. No new dependency. No document-schema change. No Second derivation or layout rewrite.
- The anchor batch's visible rules (callout lane, dots, trunk) are closed; do not reopen them.
- No Sentinel without the product owner's explicit approval.

## Track A — editor input and paste

Reference: `apps/desktop/src/renderer/src/editor/inline-code.ts` is the model for a visible marker
that toggles stored state and never enters the document text.

1. **Heading marker toggle (plan §12).** Typing `# ` still converts to a heading through the current
   input rule. While the caret is in a heading, show the `#`/`##`/`###` marker as an editor
   affordance; adding/removing a `#` changes the level, and removing the last one returns the block
   to a paragraph. The marker is never document text; the heading node remains the only state. Keep
   Enter at the end creating a paragraph. Read mode shows no marker. Cover H1–H3, paragraph→heading,
   heading→paragraph, and an undo that restores the previous level in one step.
2. **Formula `$` selection toggle.** With a non-empty text selection, `$` wraps it in an inline
   formula whose `latex` is the trimmed selection. With an inline-formula `NodeSelection`, `$`
   unwraps it back to the LaTeX source. Empty-caret `$…$` typing keeps the current input rule.
   Invalid LaTeX stays visible with the inline error; do not reject or guess. One undo step. Do not
   intercept a `$` typed with an empty caret in prose.
3. **Table cells: inline marks and formulas (plan §8).** The cell model is one paragraph of inline
   content already; bold/italic/code and inline math are allowed, and Page/PDF already render them.
   Expose the formatting actions in the table context (selection bubble or table toolbar; decide one
   and justify it against the existing table toolbar). GFM paste and typed conversion must parse
   inline marks and `$…$` per cell, and the GFM serializer (Copy as Markdown) must write them back.
   A pasted `$…$` must no longer stay literal until the closing `$` is retyped. Keep block content
   refused (VH1). Test bold + inline formula in a cell across Continuous, Page and PDF, and a
   paste/export round-trip. Do not expand the scope to block content or table layout.
4. **HTML math paste (plan §15).** A dual-format clipboard (plain text plus HTML from a rendered
   Markdown/LaTeX source) currently pastes the LaTeX without `$`. Normalize foreign math spans and
   their TeX annotations to `$…$` or inline formula nodes before the slice is inserted; keep the
   list structure and the other marks. Do not break NoteForest-to-NoteForest paste. Add a regression
   with a synthetic dual-format clipboard (plain text with `$…$`, HTML with `.math` spans) and a
   KaTeX/MathJax annotation variant.

## Track B — Page sibling gap

Write the ADR first; the builder implements only after it is merged. Open questions are closed by
the brief:

- `PageTheme.siblingGap` becomes the vertical gap only, stored 0–96, fixed under density, default
  18, per-document override, used by Page and PDF.
- The horizontal right-group corridor remains `PAGE_EDGE_GEOMETRY.siblingGap` (18) and is not a
  setting. Split the pure layout option so one value cannot silently move both; name the horizontal
  constant explicitly.
- Add `siblingGap` to `ADVANCED_LAYOUT_KEYS` and `PAGE_THEME_FIELD_SPECS` (label "Sibling gap", px,
  1 px step). `effectivePageTheme` must stop hard-wiring the engine value; `pageLayoutOptions` maps
  the effective vertical value and the fixed horizontal corridor separately.
- Update `docs/spec.md` §7.2, `docs/design-tokens-page.md` and the `page-advanced.ts` comment: the
  vertical sibling gap is now a Page setting; the horizontal corridor stays invariant. Continuous is
  untouched.
- Tests: changing the setting moves only vertical sibling spacing; the horizontal corridor stays 18;
  Page and PDF use the per-document value; density does not scale it; default 18; the advanced field
  validates 0–96 and rejects out-of-range drafts.

## Parallel plan

- Planner works in `docs/v0.1.1-plan`; output is the plan and the ADR, committed, no code.
- After the plan merges to main, two builders start from the same main:
  - `t3/v0.1.1-input` — Track A, checkpoints A1 paste (HTML + GFM), A2 toggles (heading + formula),
    A3 table.
  - `t3/v0.1.1-page-gap` — Track B after the ADR is merged.
- Disjoint files: Track A owns `editor/`, `lib/gfm-table.ts`, `lib/formula-*`, the table toolbar and
  their tests. Track B owns `packages/layout/src/page-settings.ts`, `types.ts`, the horizontal
  corridor uses in `layout.ts`, `settings/page-advanced.ts`, `PageAdvancedSettings.tsx` and their
  tests. The plan must list the exact files and any shared test helper before coding.
- Verification is serialized: `verify:fast` per branch; touched UI suites per branch at concurrency
  4, one batch at a time; then merge both and run the single full `verify`. Do not run two Electron
  UI suites at concurrency 4 simultaneously on this machine.

## Acceptance

- Every in-scope item works in Continuous and the relevant Page/PDF surface; no new ambiguity,
  no marker text in the document, no permanent state.
- Heading and formula toggles are one undo step; invalid LaTeX is kept and visible.
- A pasted table with bold and `$…$` becomes real marks/nodes; Copy as Markdown round-trips; block
  content is still refused.
- Dual-format HTML paste keeps the list and restores the formulas; NoteForest copy/paste is
  unchanged.
- Page gap moves only vertical sibling spacing; horizontal corridor is 18; PDF follows the
  per-document value; default 18; density does not scale it.
- Unit tests, typecheck, e2e, touched UI suites and the relevant PDF gate are green. One full
  `verify` is the orchestrator's at integration.
- UI changes have app screenshots in the report; no copy change without owner approval; no new
  dependency; no schema change.

## Stop and report

- A decision needs the product owner (copy, toolbar choice that changes the UX materially, heading
  key semantics beyond the brief).
- A fix needs a schema, ADR, dependency or layout-model change beyond Track B's ADR.
- A step stays red after one fix attempt.
- Two tracks collide on a file not listed in the plan.
- A visible change beyond the brief appears.

## Planner output

`docs/architecture/v0.1.1-plan.md` with: goal, decisions, file map, checkpoints, acceptance criteria
(numbered), test matrix, screenshots/evidence plan, release steps and risks. Plus
`docs/adr/0010-page-sibling-gap.md` with the decision and the consequences. Commit both on the
Planner worktree branch; do not write code, do not merge, do not push.
