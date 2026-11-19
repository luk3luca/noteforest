# Batch — v0.1.1 input and Page vertical gaps

**Roles:** two Builders, one per track, separate worktrees.
**Base:** the commit that contains this brief, `docs/batch/plan.md` and
`docs/adr/0010-page-vertical-gaps.md`.
**Plan:** `docs/batch/plan.md` (the contract; read it before touching code).
**ADR:** `docs/adr/0010-page-vertical-gaps.md` (accepted).
**Sentinel:** none unless the product owner explicitly approves one.
**Timebox:** one builder session per track; stop and report if a checkpoint stays red after one fix
attempt.

## Goal

Ship v0.1.1: the anchor-resolution index is already merged (`fc8fbbc`), plus four editor input/paste
fixes and three vertical Page gap settings. Two builders work in parallel on disjoint files; the
orchestrator integrates both, runs one full `verify`, then cuts 0.1.1.

## Closed decisions

- **Track A:** heading marker toggle (plan §12), formula `$` selection toggle, table-cell inline
  marks/formulas with GFM paste/export, HTML math paste normalization (plan §15).
- **Track B:** three independent Page vertical settings. **Child gap** 18, **Top-level gap** 32,
  **Callout gap** 16; each 0–96, fixed under density, per-document override, Page and PDF. The
  horizontal parent→right-group corridor stays a fixed 18 px engine constant. Default Page output
  must stay byte-compatible at 18/32/16.
- **Out of scope:** long inline formula width (plan §13) and arrow boundary (plan §14). They stay in
  `docs/plan.md`.
- One release `0.1.1`; one integration window; one full `verify` after both merges. No new dependency.
  No document-schema change. No second derivation or layout rewrite.
- No Sentinel without the product owner's explicit approval.

## Track A — editor input and paste

Build checkpoints A0–A3 in plan §4.2, only the files in plan §5.1.

1. **Heading marker toggle.** Typing `# ` still converts to a heading. While the caret is in a
   heading, show the `#`/`##`/`###` marker as an editor affordance; `#` at the start raises the level,
   Backspace at the start lowers it, H1 → paragraph; a fourth `#` at H3 is consumed as a no-op;
   guest `.md` follows 1–6. Never write marker text; undo restores the previous level in one step.
2. **Formula `$` toggle.** A non-empty selection inside one textblock wraps into an inline formula
   with the trimmed selection as `latex`; an inline-formula `NodeSelection` unwraps to its LaTeX.
   Empty-caret `$…$` typing is unchanged; invalid LaTeX stays visible; one undo. Barriers and anchor
   behavior are in plan §6 A2 and §8.2 — follow them exactly.
3. **Table cells.** Put Bold, Italic, Inline code and Inline formula in the existing `TableToolbar`
   (the selection bubble stays suppressed). GFM paste/typed conversion parses bold, italic, strike,
   inline code, inline math and hard break per cell; Copy as Markdown serializes them back. A pasted
   `$…$` becomes a node immediately. Block content stays refused (VH1). Page/PDF render marks/math;
   Page Edit stays render-only.
4. **HTML math paste.** Normalize foreign `.math`/KaTeX/MathJax containers and their TeX annotations
   to the editor's own inline-math shape before the slice is inserted; keep lists and marks; leave
   NoteForest's own rich paste untouched. Cover a synthetic dual-format clipboard.

## Track B — Page vertical gaps

Build checkpoints B0–B3 in plan §4.3, only the files in plan §5.2.

1. `PageTheme.siblingGap` = **Child gap** 18; add `PageTheme.chapterGap` = **Top-level gap** 32;
   `PageTheme.calloutGap` = **Callout gap** 16. All 0–96, fixed under density, per-document override,
   Page/PDF. `chapterGap` must join **both** numeric key lists (plan P7).
2. Split the pure layout: `LayoutOptions.siblingGap`/`chapterGap`/`calloutGap` are vertical,
   `LayoutOptions.rightGroupGap` is the fixed horizontal corridor. `effectivePageTheme` stops
   overwriting the three stored values; `pageLayoutOptions` maps all four. Audit every horizontal read
   in `layout.ts`; split the compaction row gap into horizontal and vertical.
3. Put the three fields in Page → Advanced layout, labels/order/help exactly as plan P6 and AC-22.
4. Update spec/design tokens/comments; prove Page/PDF parity, density non-scaling, per-document
   persistence, independent axes, fixed horizontal corridor, and the unchanged 18/32/16 default
   baseline. Do not update a geometry fixture to make a default-coordinate failure pass.

## Parallel rules

- Track A owns `t3/v0.1.1-input`; Track B owns `t3/v0.1.1-page-gap` (use the branch the harness
  creates and report its actual name).
- Plan §5 is exhaustive. A file not listed there is a stop condition. Do not edit `docs/batch/plan.md`,
  the ADR, the brief, `docs/plan.md`, `tests/ui/suites.mjs`, the version files or the lockfile.
- Each builder writes `docs/batch/report-input.md` or `docs/batch/report-page-gap.md`; the
  orchestrator writes `docs/batch/report.md` after both merges.
- **Electron lane:** builders run focused unit tests, `npm run typecheck` and any build they need;
  they do **not** run `npm run verify:fast` or an Electron UI suite. The orchestrator runs the one
  serialized `verify:fast`/UI lane per branch after each merge, then the single full `verify`.
  This keeps the measured one-lane rule and avoids two Electron runs at once.
- Both branches start from the same `main` commit. Neither rebases onto the other; merge order is
  Page-gap first, then input.
- Commit on the worktree branch. Do not merge, push, tag or open a PR.

## Acceptance

The plan's AC-01–AC-23. In particular:

- markers/toggles are editor affordances, never document text; one undo; invalid LaTeX visible;
- pasted table cells and foreign HTML math become real nodes/marks; GFM round-trip stable; block
  content still refused;
- the three Page gaps move independently, Page/PDF use the same resolved values, density does not
  scale them, the horizontal corridor stays 18, and the 18/32/16 default baseline is unchanged;
- typecheck + focused unit tests green; UI screenshots/evidence in the track report; no new
  dependency; no schema change.

## Stop and report

- A checkpoint stays red after one fix attempt.
- A file outside plan §5 is needed, or the tracks collide.
- A schema, dependency, ADR or layout-model change beyond ADR-0010 is needed.
- A visible change or copy outside the brief appears.
- The horizontal corridor moves when a vertical gap changes, or the default baseline drifts.

## Report

Summary, files changed, checks with timings, acceptance criteria pass/fail, screenshots/evidence
paths, risks, next step. One commit per track; no merge, no push.
