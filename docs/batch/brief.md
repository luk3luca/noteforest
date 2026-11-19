# Batch — v0.1.3 polish: code-theme polarity and palette reason

**Role:** one Builder, separate worktree.
**Base:** the commit that contains this brief.
**Contract:** `docs/plan.md` #3 (mixed-polarity code-theme chrome) and #7 (clipped Read reason in the
palette).
**Sentinel:** none unless the product owner explicitly approves one.
**Timebox:** one builder session; stop after one failed fix attempt and report.

## Goal

Ship the two remaining small UI fixes from the shortlist. One branch, one integration, one full
`verify`; cut 0.1.3 if green.

## Scope

### #3 — mixed-polarity code-theme chrome

- When the selected code theme's polarity differs from the app theme (`Light+` on a dark app,
  `Monokai`/`Dark+` on a light app), the code fence row and the copy chip must use the code theme's
  own surface and ink, not the app-theme `--surface-*`/`--text-*` chrome. The code block surface
  already follows `--code-surface`.
- Keep all four code themes selectable; do not filter the picker, do not add a new preference.
- Same-polarity combinations (`Dark+`/`Monokai` on dark, `Light+`/`One Light` on light) keep their
  current chrome exactly.
- The language label already follows `--code-text`; do not regress it. The fence separator/border
  stays visible against the code surface.
- Add a CSS/unit guard for the four polarity combinations and one UI screenshot per mixed case
  (`editor-appearance` is the owning suite). No new design token unless the existing
  `--code-surface`/`--code-text` cannot express the shade; prefer `color-mix` or the existing
  tokens.

### #7 — clipped Read reason in the palette

- The palette reason span (`.nf-palette-reason`) is ellipsized at 190 px and has no tooltip of its
  own; the full string is already in `data-palette-reason` and the key/menu toast. Add a tooltip on
  the reason span (native `title` is acceptable; a custom tooltip only if it already exists in the
  palette) so hovering the clipped text shows the full reason.
- Do not wrap the row or change its height; do not change the copy, the label, the data attribute or
  the disabled behaviour.
- Add a UI assertion in the owning palette suite: the reason span's tooltip equals the full reason
  and the row still renders the short label. One screenshot is enough; no new suite file.

## Out of scope

- Filtering the code-theme picker, new theme tokens, changes to the Page/PDF code colours.
- #5 (Page Edit second undo), #8 (read-only sentence copy), #9 (Fit page), #1/#2/#4/#6, and every
  v2 feature.
- No new dependency, no document-schema change, no copy change, no new UI suite file.

## Likely files

- `apps/desktop/src/renderer/src/styles.css` — the polarity rule (fence + copy chip).
- `apps/desktop/src/renderer/src/shell/CommandPalette.tsx` — reason span tooltip.
- `apps/desktop/test/` or the existing CSS guard for the polarity combinations;
  `tests/ui/editor-appearance.test.mjs` and `tests/ui/command-surface.test.mjs` (extend, do not add a
  suite). Screenshots under the existing artifact folders.
- `docs/batch/report-polish.md` — builder report.

## Checks

- Focused unit/CSS guard tests and `npm run typecheck`; `npm test` if the builder wants the full unit
  pass.
- Do **not** run `npm run verify:fast`, e2e or any Electron UI suite: the orchestrator runs the
  single serialized lane (`editor-appearance`, `command-surface`) after the merge.
- One commit; no merge, push, tag, PR, `docs/plan.md`/brief edits, `tests/ui/suites.mjs`, version or
  lockfile changes.

## Acceptance

- Light+ in a dark app and Monokai/One Light in a light app: fence and copy chip sit on the code
  surface with readable code ink; same-polarity combinations unchanged; the border/separator is
  visible.
- The palette reason span exposes the full reason in a tooltip; the row height and copy are
  unchanged; `data-palette-reason` stays.
- Unit/CSS guard and typecheck green; one serialized UI lane; one full `verify` at integration; no
  dependency, schema or copy change.

## Stop and report

- A fix needs a new token/preference, a copy change or a file outside the listed areas.
- A step stays red after one fix attempt.
- A visible change beyond the brief appears.

## Report

Summary, files, checks with timings, acceptance pass/fail, screenshot paths, risks, next step. One
commit; no merge, push, tag or PR.
