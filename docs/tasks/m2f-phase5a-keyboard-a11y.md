# M2f phase 5a — Keyboard/focus and accessibility

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F5/F16; `docs/tasks/m2f-stability-fixes.md` phase 5  
**Out of scope:** dead-code/dependency/docs cleanup (5b), M3/page/PDF

## Problem

`Tab`/`Shift+Tab` are swallowed in ordinary paragraphs, so keyboard focus cannot leave the editor; card `+`/collapse controls and shell controls are unreachable from the editor. `Ctrl+Tab` is dead code. Save-state changes are not announced, the context menu has no focus trap, and the tab close affordance is `aria-hidden` (Delete/⌘W only). Axe does not catch focus traps.

## Scope

- `editor/keymap.ts`: `Tab`/`Shift+Tab` return `false` when no structural action applies, so focus leaves the editor. Keep list/code/table indent behavior; keep selected-block child/outdent.
- Card controls (`+` child, bottom `+` sibling, collapse, branch port, drag handle) are reachable by keyboard from the editor; a visible focus ring; Enter/Space activates. Add a documented focus order: tab strip → sidebar → editor/card controls → status bar.
- Fix/remove the dead `Ctrl+Tab` branch; implement tab cycling only if it does not conflict with focus traversal.
- Save-state changes: `aria-live="polite"` (or status role) so screen readers announce Saved/Saving/Unsaved/Save failed.
- Context menu: focus trap/restore; Escape closes; arrow keys navigate.
- Tab close: expose an accessible close affordance (not only `aria-hidden` + Delete/⌘W); preserve valid tablist ARIA.
- Axe: run best-practice tags as a non-blocking report; keep serious/critical at zero.
- Do not weaken the E2E dialog guard.

## Tests

- Keyboard e2e (extend the existing accessibility test or a dedicated one):
  - Tab from a paragraph exits the editor to the sidebar/tab strip/status; Shift+Tab returns;
  - focus reaches card `+` and collapse, activates them;
  - `Ctrl+Tab` behavior is defined and tested (or absent if removed);
  - save-state live region updates on save/failure;
  - context menu traps/restores focus and Escape closes;
  - tab close is reachable and announces.
- Axe: serious/critical zero; best-practice report recorded.
- Critical e2e currently ~56.8 s. Keep <60 s; if keyboard coverage pushes it over, move the zoom/fit/focus flow to `tests/ui/` with `npm run test:ui` (included in `verify`, not `verify:fast`) and report the move. Do not delete data-safety coverage.
- No fixed sleeps; no native dialogs.

## Acceptance

Tab no longer traps focus; card/shell controls are keyboard reachable; save state is announced; context menu/tab close accessible; axe serious/critical zero; typecheck/test/e2e/verify:fast/verify pass. No 5b/cleanup/M3 work.
