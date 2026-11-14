# Phase 1 — editor appearance: code palette, Page/PDF colours, table toolbar

**Role:** Implementer / Builder
**Phase:** 1 (post-A–F)
**Base:** `main` at delegation
**Worktree:** created by the delegate; one commit; no merge or push
**Timebox:** 2 days

## Part A — Code palette and Page/PDF syntax colours

Design: `docs/design/code-palette.md` (approved 14 November 2026).

### Palette

- Replace the muted pastel `--code-*` values with **Monokai** for dark and **One Light** for light,
  exactly as in the design table. Keep the token names.
- Verify contrast on `surface-2` (dark) and the Page code surface `#f5f7f9` (light); comments stay
  quieter than code but readable.
- Do not change the code block background, border, typography, font size, or spacing.

### Page Read/Edit and PDF

The current contract “syntax colours editor-only; Page/PDF neutral” is replaced:

- Page Read segments render highlighted code. `segments.ts` must run the same language grammar per
  line and preserve **anchor spans** (code-token anchors and whole-code anchors). Do not duplicate
  the highlighter; reuse the editor's lowlight setup.
- Page Edit already uses the editor; ensure its code colours match Page Read and Continuous.
- The print compositor consumes the same segment HTML; PDF text remains real and selectable.
  Page count and pagination must not change (colour only).
- Scope the hljs selectors so Continuous, Page Read/Edit and the print page all use the palette;
  do not leak code colours into tables, inline code, or non-code prose.
- Light theme uses One Light; dark uses Monokai.

### Not in scope

- The gap between two consecutive code blocks inside one block (recorded follow-up; no measurement
  change in this batch).
- A per-user syntax-theme picker; a code-block background theme; text colour/highlighter/block tint
  (content features, future schema v3).

## Part B — Table toolbar silhouette (F8)

Current: one tall BubbleMenu above the caret cell; with a header cell it can cover the header row.

- Keep the same commands (rows, columns, delete, alignment, Copy as Markdown, source/cell actions)
  but reduce the silhouette: one primary row, secondary actions in an overflow menu or a second
  compact row; no floating panel taller than the header row.
- When the caret is in the **header row**, position the toolbar **below** the header/table so it
  never covers the active cell; otherwise keep it above the caret. It must stay inside the viewport.
- All existing keyboard/ARIA behavior and command semantics stay; no new table behavior.
- The table cell context menu from A+D remains the alternative path.

## Files

`apps/desktop/src/renderer/src/styles.css`, `page/segments.ts`, the highlighter helper (reuse
`editor/code-block.ts`/lowlight), `editor/TableToolbar.tsx`, `editor/tables.ts` if needed, tests and
fixtures under `apps/desktop/test/` and `tests/ui/`. Print model only if the segment HTML contract
needs a type adjustment.

## Acceptance

- [ ] Dark Continuous code uses the Monokai tokens; light uses One Light; no pastel values remain.
- [ ] Page Read and Page Edit show the same token colours; PDF pages show colours; text is real and
      selectable; page count and pagination unchanged.
- [ ] Code anchors still wrap the right token/whole block in Page Read/PDF; anchor suites green.
- [ ] Table toolbar never covers the header/active cell; every current command remains reachable;
      viewport-clamped; keyboard/ARIA intact.
- [ ] No schema/settingsVersion/Page layout/showcase change beyond syntax markup; no fixed
      sleeps/native dialogs; existing assertions updated only for the colour contract.

## Evidence and report

- Targeted unit/UI: palette values, segment HTML, Page Read/Edit colour, PDF page count/text,
  table toolbar placement. Run affected suites at concurrency ≤ 3; one `npm run verify:fast`.
- Screenshots: Continuous dark/light, Page Read, PDF page 1, table toolbar in a header cell.
- `docs/reports/editor-appearance.md`: summary, files, checks with timings, PASS/FAIL, risks, next.
- One commit; worktree/branch/head. Do not run the full verify; the Orchestrator does it at 4.
