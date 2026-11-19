# Report — T3: Page selection ink (#7) and Library refresh (#8)

## Summary

T3 of the v0.1.2 batch. Page text selection is scoped to the fixed-light paper skin in both shell
themes, and the Library section header carries a 28 px refresh button that calls the existing
`refreshLibrary()`.

- **#7:** the global `::selection` is unchanged. A new `.nf-page-view .nf-page-scope ::selection`
  rule paints the paper ink (`--nf-page-ink`) on a paper accent tint
  (`--nf-page-selection-bg`, `rgba(47, 95, 138, 0.2)`) for Page Read and the Page Edit overlay (both
  carry `nf-page-scope`). The selector is the paper scope inside `.nf-page-view`, not the whole
  view: the canvas header also lives inside `.nf-page-view` and its page-position and find fields
  are shell chrome; a whole-view rule would paint near-black ink on their selection in the dark
  theme. The old `.nf-page-edit-prose ::selection` literal is folded into the one scoped rule.
- **#8:** a `RefreshCw` icon button (`data-library-refresh`, `aria-label` and `title`
  "Refresh library") sits in the Library header tail, before New folder and New note. It calls the
  same `refreshLibrary()` as the switcher menu's Refresh; the menu entry is unchanged. Styling
  matches `.nf-health-refresh` (28 × 28, `border-1`, `surface-1`, `text-2`), with negative block
  margins sized to the shared header's 2/4 px padding so the header stays 28 px tall.

**Branch:** `t3/4a6ee376` (the worktree branch the harness created; the brief's suggested name was
not used).
**Commit:** one commit, `fix: scope page selection ink and add the library refresh`. The hash is not
embedded here because this file is amended into that same commit; `git log -1 --format=%H` on the
branch is authoritative.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/styles.css` | Page selection token and scoped rule; `.nf-library-refresh` (28 px, Health parity); removed the old Page Edit `::selection` literal. |
| `apps/desktop/src/renderer/src/shell/Sidebar.tsx` | `RefreshCw` import; header refresh button wired to `refreshLibrary()`. |
| `apps/desktop/test/page-token-guards.test.ts` | CSS guard for #7: global unchanged, paper scope, ink/tint, no shell roles, contrast, Page Edit coverage. |
| `apps/desktop/test/sidebar-system-css.test.ts` | CSS guard for #8: `.nf-library-refresh` matches `.nf-health-refresh` and is 28 × 28. |
| `tests/ui/b2-contrast.test.mjs` | UI test: Page Read text selection uses the paper ink/tint in dark and light, with both-theme screenshots. |
| `tests/ui/library-surface.test.mjs` | UI test: button presence, 28 px size, accessible name, menu Refresh kept, click refreshes an externally added package, screenshot. |

No change to global selection, library data, refresh semantics, schema, dependencies, version
files, lockfile, `tests/ui/suites.mjs`, the brief or `docs/plan.md`.

## Checks run (this worktree, macOS)

| Check | Result | Timing |
|---|---|---|
| `npx vitest run` on the three CSS guard files | 3 files, 54 tests passed | 0.38 s wall (116 ms vitest) |
| `npm test` (full unit) | 183 files, 1,913 tests passed | 8.8 s |
| `npm run typecheck` (all workspaces) | passed | 5.8 s wall |
| `node --check` on both edited UI suites | passed | — |
| `git diff --check` | clean | — |

Not run, per the brief: `npm run verify:fast`, e2e, recovery, any Electron UI suite, visual tests.
The UI lane is the orchestrator's single serialized run after the three merges.

## T3 acceptance

| Criterion | Verdict | Evidence |
|---|---|---|
| Page selection readable in both themes | Pass in code and CSS guard; app screenshots pending the UI lane | `page-token-guards.test.ts` proves ink/tint values, a 12.3:1 contrast of the ink on the tint over white, and that both themes read the same fixed skin. `b2-contrast.test.mjs` asserts the computed `::selection` colours in dark and light. |
| Scoped CSS test | Pass | `page-token-guards.test.ts` — global `::selection` still `var(--accent-soft)` / `var(--text-1)`; paper rule is `var(--nf-page-selection-bg)` / `var(--nf-page-ink)`; no shell role in the rule; `.nf-page-view ::selection` is asserted absent. |
| Library header refresh exists | Pass | `Sidebar.tsx`; `library-surface.test.mjs` counts one `[data-library-refresh]`. |
| Is 28 px | Pass | CSS guard compares every visual property to `.nf-health-refresh`; UI test asserts a 28 × 28 bounding box. |
| Accessible name | Pass | `aria-label`/`title` "Refresh library"; UI test checks the attribute and `getByRole('button', { name })`. |
| Calls `refreshLibrary()` | Pass | `onClick={() => void refreshLibrary()}`; UI test adds an external package and waits for it to appear in library state only after the click. |
| Does not duplicate the menu path | Pass | The switcher menu keeps its one Refresh entry (asserted open); both call the same action; no control was added to the tree or activity bar. |

## Evidence paths

Produced by the orchestrator's serialized UI lane (not on disk yet — this builder was told not to
run Electron suites):

- `artifacts/b2-contrast/page-selection-dark.png`
- `artifacts/b2-contrast/page-selection-light.png`
- `artifacts/library-surface/library-refresh-header.png`

## Risks and open questions

1. **UI suites are unexecuted here.** The two specs were syntax-checked only. The selection
   computed-style API and the negative-margin header layout were verified in a throwaway Electron
   45 / Chromium 156 probe (blank page, not the app) — `getComputedStyle(el, '::selection')`
   returned the expected `rgb(26, 31, 35)` / `rgba(47, 95, 138, 0.2)`, and a 28 px control with
   `margin-top: -2px; margin-bottom: -4px` in the shared header measured a 28 px header with no
   overflow. Watch the first UI-lane run for flake in the menu-Escape step and the visible-window
   screenshot.
2. **Header control count vs design.** The Library header now carries three controls (refresh,
   new folder, new note); `docs/design/sidebar.md` §4 says "up to 2 controls". The brief requires
   the button, so the brief wins; the design doc was not edited. The owner may want that documented
   in a later design pass.
3. **Selection scope wording.** `docs/plan.md` #7 says "inside `.nf-page-view`". The implemented
   selector adds the paper scope (`.nf-page-view .nf-page-scope ::selection`) so the shell chrome
   inside the view — page-position field, find field, zoom label — keeps the global selection in
   the dark theme. This is a correctness refinement, not a scope expansion; the Sentinel should
   confirm the reading.
4. **On-demand visual baselines.** `npm run test:visual` may drift wherever the Library header is
   captured, because a 28 px control is now present. Visual tests are not part of `verify`; no
   baseline was regenerated here.
5. **Header height guard.** The header stays 28 px via negative margins matched to the shared
   padding. The existing `tests/ui/sidebar-system.test.mjs` assertions (28 px header, 2/4 px
   padding, 22 px add buttons) are intentionally preserved; if the owner prefers a taller header,
   that assertion and the design doc must change together.

## Next step

Merge T3 first (smallest blast radius), run `verify:fast`, then let the single serialized UI lane
produce the three screenshots above and confirm the two extended suites. No Sentinel unless the
product owner approves one.
