# Phase 0b — list markers and paren ordered lists

**Role:** Implementer / Builder
**Phase:** 0b (post-A–F editor fixes)
**Base:** current `main` at delegation
**Worktree:** created by the delegate; one commit; no merge or push
**Timebox:** 1 day

## Problem

1. **Bullet and numbered markers are invisible in the Continuous editor.** Tailwind preflight resets
   `ul`/`ol` with `list-style: none`; `.nf-block-prose ul/ol` only sets margin/padding, so the
   markers never render. Indentation (nested lists) works, but there is no dot/square/circle at any
   depth. Page/PDF are not affected: the page renderer emits explicit `nf-li-marker` glyphs.
2. **Typing `1) ` does not create an ordered list.** TipTap's ordered-list input rule matches only
   `^(\d+)\.\s$` (`1. `). The `1)` form is accepted by paste/GFM parsing but not by typing, so Enter
   cannot continue with `2)`.

## Scope

### Markers

- Restore list markers **only inside `.nf-block-prose`**; do not change menus, sidebars, settings,
  dialogs, or the page/print scope.
- Unordered depth cycle: `disc` → `circle` → `square` → `disc` (or the project's established cycle).
- Ordered depth cycle: `decimal` → `lower-alpha` → `lower-roman` → `decimal`.
- `::marker` uses the muted text role; keep the existing padding-left (20 px) and ensure markers are
  not clipped at the card edge.
- Nested lists must show the correct marker at each depth in Continuous Edit and Read.
- Page/PDF must remain unchanged (explicit markers already exist); add a guard/assertion if cheap.

### `1)` ordered list input

- Add an editor input rule matching `^(\d+)\)\s$` that wraps the paragraph in an `orderedList` with
  `start` = the typed number (minimum 1).
- Keep the existing `1. ` behavior intact; no double match, no interference with prose parentheses.
- After `1)` + Enter, the list continues `2)`, `3)` (native ordered-list continuation).
- The input rule should work in Continuous Edit and Page Edit (shared extensions); Read never
  creates a list.
- Any Markdown file-view extension set is out of scope (phase 2).

## Files

`apps/desktop/src/renderer/src/styles.css`, `apps/desktop/src/renderer/src/editor/extensions.ts`
(or a small list extension file), tests under `apps/desktop/test/` and `tests/ui/`. Reuse the
existing editor list fixtures; do not touch the core document schema.

## Acceptance

- [ ] Bullet markers visible at depth 1/2/3+; ordered markers visible at depth 1/2/3+; no marker
      clipped; dark and light themes.
- [ ] `- ` continues to work; `1. ` continues to work; `1) ` creates an ordered list starting at 1;
      Enter continues the numbering; a list started at 3) continues 4).
- [ ] Markers and input rule do not change Page Read/Edit or PDF output.
- [ ] No schema/settingsVersion/Page/PDF/export/showcase change; no fixed sleeps/native dialogs.
- [ ] Existing assertions updated only for the intentional marker/input-rule change; none weakened.

## Evidence and report

- Unit test for the input rule (match/no-match cases), UI test for markers + `1)` continuation.
- Screenshots: Continuous dark/light with nested bullets and ordered list; Page Read unchanged.
- `docs/reports/list-fixes.md`: summary, files, checks with timings, PASS/FAIL, risks, next step.
- One commit; report worktree, branch, head SHA. Do not merge or push.
- Do not run the full `npm run verify`; the Orchestrator runs it at UI concurrency 4.
