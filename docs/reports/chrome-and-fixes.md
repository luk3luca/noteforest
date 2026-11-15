# Chrome and fixes — card row, squared chips, canvas inset, health, Page

**Role:** Builder
**Milestone:** S2.2 chrome pass (post health polish)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-55eeceeb-30940c502d0117d9`
**Base:** `2273444` (docs: card chrome rule and chrome/fixes brief)
**Result:** all four parts delivered, one commit, not merged.

## Summary

1. **Health (A).** The all-clear now renders the same four sections with `0` under “No issues found”
   and the information counts; the open empty group keeps “No issues in this group”. The report
   state is unchanged. `DocumentRuntime.keepAnchorBroken` and the dead `keptBroken` set (it had no
   reader after S2.1 removed “Keep as is”) are gone, with the four `keptBroken.delete` calls it owned
   and the now-pointless `outcome` temporaries.
2. **Page (B).** The fit-sync effect no longer writes its closure's effective zoom back over a newer
   fit. The decision moved to a pure guard (`page/fit-sync.ts`): it returns a zoom only while the
   **live** fit still equals the fit that created the effect, and never while a manual zoom owns the
   value. A `⇧2 → ⌘0` sequence now ends on fit actual at 100 %.
3. **Card chrome (C).** A block's state and its `See also`/`Referenced by` chips are one in-flow row
   inside the card (`data-block-chrome`), state first, wrapping, present only when needed. The
   anchor callout keeps quote + state on top and gets its references at the bottom. Nothing is
   absolutely positioned over the card edge or the next card. The eight text chips are rounded
   rectangles (control radius, 20 px, 1 px border); `.nf-branch-port` stays the only `999px` circle
   and the add ports stay round icon buttons. The Continuous inset is 24/20/16 px so the 16 px
   gutter and the drag handle are fully visible.
4. **Tests and evidence (D).** New UI assertions for the row, the shapes and the gutter; the
   reference/callout/image/health/Page suites were re-pointed, not weakened; a CSS guard forbids
   capsules outside the branch port; six screenshots under `artifacts/chrome/`.

## Files changed

Application code:

- `apps/desktop/src/renderer/src/shell/HealthSection.tsx` — all-clear renders the four `0` sections
  after the “No issues found” block; the search-empty line only when a search is active.
- `apps/desktop/src/renderer/src/state/runtime.ts` — removed `keepAnchorBroken`, `keptBroken`, and
  the dead `.delete()` calls (no behavior change: closing the modal is the no-op path).
- `apps/desktop/src/renderer/src/page/PageView.tsx` — the fit-sync effect calls `fitZoomToSync`.
- `apps/desktop/src/renderer/src/page/fit-sync.ts` — **new**: pure fit-sync guard.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — one `nf-block-chrome` row
  (warning first, then reference chips); the old absolute warning button and `nf-ref-chips` wrapper
  are removed.
- `apps/desktop/src/renderer/src/lib/design-tokens.ts` — `editorPaddingX` 8 → 24, medium 8 → 20,
  compact 6 → 16; comment states the gutter reason.
- `apps/desktop/src/renderer/src/styles.css` — `.nf-block-chrome`; `.nf-anchor-warning` and
  `.nf-ref-chip` are in-flow chips (control radius, 20 px, 10.5 px, 1 px border, See-also dashed /
  Referenced-by solid kept); `.nf-callout-state`, `.nf-image-action`, `.nf-image-draw-hint`,
  `.nf-recovery-pill`, `.nf-tree-shared` lose the capsule (the last four also take the 20 px chip
  height); `.nf-tree-anchor-count` takes the control radius (the only other `999px` text chip);
  `.nf-page-badge` takes the control radius only, its Page/PDF geometry is untouched.

Documentation:

- `docs/design-tokens-continuous.md` — the three canvas-inset rows now read 24/20/16 px (the token
  table is the source-of-values index; keeping 8 px there would be a docs bug).

Tests:

- `apps/desktop/test/card-chrome-css.test.ts` — **new**: capsule guard (only `.nf-branch-port` may
  be `999px`), chip radius/border/height, in-flow row, See-also dashed/Referenced-by solid, gutter
  vs inset.
- `apps/desktop/test/page-fit-sync.test.ts` — **new**: the deterministic guard behind B (stale fit
  never wins, a matching fit still syncs, manual zoom opts out).
- `apps/desktop/test/design-tokens-css.test.ts`, `apps/desktop/test/geometry.test.ts`,
  `apps/desktop/test/placement.test.ts` — 24/20/16 px and the `fitZoom` value that follows from it.
- `tests/ui/document-health.test.mjs` — all-clear asserts the four sections with `0`, the empty
  open group, no rows, and the chrome screenshot.
- `tests/ui/m3-reference.test.mjs` — the old “layout-neutral” differential is replaced by a
  chrome-row differential (a rowed card grows by exactly its row; a plain card keeps its size; the
  left edge never moves; no card intersects another), the cycle step only allows growth, and a new
  test covers state-then-references order, the row inside the card, the next card untouched, the
  callout head/row split, the plain card, the chip shapes, and the circular ports.
- `tests/ui/m2-view.test.mjs`, `tests/ui/ui-batch-a.test.mjs`, `tests/ui/ui-batch-v.test.mjs` —
  canvas inset 24/20/16 and the gutter/handle visibility probe at 1440, medium and compact.
- `tests/ui/m4b1-page-view.test.mjs` — the `⇧2 → ⌘0` regression (same-task synthetic pair plus real
  presses) and the Page fit screenshot.

## Checks with timings

All commands run in this worktree, in this order.

| Check | Result | Time |
|---|---|---|
| `npm install` (fresh worktree) | 210 packages | 2 s |
| `npm run typecheck` (4 workspaces) | pass | 31 s |
| `npx vitest run` (final, after every edit) | 152 files / 1498 tests | 6.3 s |
| `npm run verify:fast` (boundaries + typecheck + vitest + build + e2e) | pass | **58.7 s** |
| — `check:boundaries` | 260 files, 1250 imports, 16 rules | <1 s |
| — `npm test` | 152 / 1498 | 6.3 s |
| — `npm run e2e` | 16 / 16 | 45.8 s |
| `npm run test:ui:shell` | **17 / 17** | 108.2 s |
| `node tests/ui/run.mjs --group anchors` | 14 / 14 | 57.7 s |
| `node tests/ui/run.mjs --group images` | 4 / 4 | 45.1 s |
| `node tests/ui/run.mjs --group page` | 17 / 17 | 90.2 s |
| `node --test tests/ui/m3-reference.test.mjs` | 5 / 5 | 19.9 s |
| `node --test tests/ui/document-health.test.mjs` | 6 / 6 | 18.2 s |
| `node --test tests/ui/m4b1-page-view.test.mjs` | 11 / 11 | 18.2 s |
| `node --test tests/ui/ui-batch-v.test.mjs` | 5 / 5 | 16.6 s |

Zero `pageerror` in every suite (the suites assert it in `after`). No native dialogs, no fixed
sleeps added, no new dependency.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| All-clear shows the four sections with `0` and the empty-group line; the report state is unchanged | **PASS** | UI test: section ids `['anchors','unused','structure','hidden']`, counts `['0','0','0','0']`, `[data-health-group-empty="anchors"]` = “No issues in this group”, zero rows, “No issues found” + info line above. Report-state sections/search assertions unchanged. Screenshot `artifacts/chrome/health-all-clear-1440x900.png`. |
| `keepAnchorBroken` no longer exists and nothing references it | **PASS** | `grep -rn keptBroken\|keepAnchorBroken apps packages` → none; typecheck green; unit suite green. |
| `⇧2 → ⌘0` ends with fit actual / 100 %; the regression proves it | **PASS** | UI regression ends on `pageFit: 'none'` (the “actual” command's value), `data-page-fit="none"`, zoom label `100%`, `pageZoom` 1; a following ⌘+ still starts from 100 %. The guard itself is unit-tested in `page-fit-sync.test.ts`. Screenshot `artifacts/chrome/page-fit-actual-1440x900.png`. |
| One bottom row inside the card for a warning/reference; none on a plain block; nothing absolutely positioned over the edge or the next card; the callout keeps its top quote + state and gets references at the bottom | **PASS** | UI: row is `position: static`, `row.top ≥ card.top`, `row.bottom ≤ card.bottom`, laterally inside; warning chip is the first child, See also second; `row.bottom ≤ nextTopLevel.top`; zero rows on the plain card; callout head has no `.nf-ref-chip`, its state sits inside the head box, and its `Referenced by` chip is in the bottom row below the quote. Screenshots `card-parent-with-chrome.png`, `card-parent-without-chrome.png`, `callout-top-quote-bottom-references.png`, `card-plain-no-chrome.png`. |
| The eight text chips use the control radius and 20 px height; the CSS guard passes and allows only the branch port; the branch port and add ports are unchanged | **PASS** | `card-chrome-css.test.ts`: computed radius `3px`, height `20px`, border `1px` in the UI; capsule rule list = `['.nf-branch-port']`; branch port computed `999px` and square (`width === height`); add ports computed `50%`. Page badge radius only (its 1 px border comes from its variants; height untouched). |
| Canvas padding is 24/20/16; the grab handle is fully visible at 1440 and at the compact width; no horizontal regression | **PASS** | UI: `paddingLeft` 24/20/16 at wide/medium/compact, title and card share the inset, handle box inside the scroller at all three widths, `elementFromPoint` at the handle centre resolves to the handle. `m2-view` and `ui-batch-a` geometry assertions updated to the same values; the 17 Page suites (incl. the 61-page PDF gate) stay green, so the 32 px narrower placement budget changed no page model. Screenshot `canvas-left-edge-gutter-1440x900.png`. |
| `npm run verify:fast` green; `npm run test:ui:shell` green; updated UI suites; screenshots | **PASS** | 58.7 s and 108.2 s, 17/17; see the table. |
| No pageerror; no regression in the editor, library, settings or Page | **PASS** | 17/17 shell (editor, library, settings, lifecycle, vault), 17/17 page, 14/14 anchors, 4/4 images, e2e 16/16; all suites assert zero page errors. |

## Open questions / risks

1. **The Page race is timing-dependent in React 19.** The passive fit-sync effect is flushed inside
   the same discrete task in this build, so the pre-fix code also ended at 100 % in the UI run: the
   UI test is a *sequence* guard (it fails if the sync ever starts writing a stale fit again), while
   the guaranteed regression is the pure guard in `page-fit-sync.test.ts` (stale fit → no write).
   I did not need a store or renderer contract change.
2. **Card widths are content-driven.** A row can widen a card to its chip width (observed 160 →
   165.2 px, 181.3 → 194 px). The differential now asserts “left edge never moves, plain cards keep
   width and height, rowed cards grow by exactly the row, no card intersects another” instead of the
   retired layout-neutral invariant. The design accepts that invariant change (§1, “consistency is
   chosen over that invariant”).
3. **One state chip per block, first warning.** A block with two broken anchors still shows the
   first `Lost anchor`/`Ambiguous anchor` chip, exactly as before (the sidebar report lists both).
   Making the row render one chip per anchor would change the click target and the existing
   `data-anchor-warning` contract, so it is left as-is; say the word if plural chips are wanted.
4. **The add-sibling icon button still straddles the card's bottom edge.** It is an icon control, not
   a chip, so it is out of scope; it sits below the row (the row ends 10 px above the card bottom and
   the button spans −9..+9 px), and a card with references keeps its existing left-corner shift. No
   chip is covered.
5. **`.nf-page-badge` keeps its Page/PDF geometry.** Only the radius changed; its border and height
   come from the Page skin variants, and the Page/PDF gate (A4 61, A5 landscape 134, Letter 62,
   300-block 27) is unchanged.
6. **Token doc touch.** `docs/design-tokens-continuous.md` was updated because it is the value index
   for the token table (24/20/16). No spec/UX/ADR/plan change.

## Next step

Product-owner visual pass over `artifacts/chrome/` (parent row, callout split, plain card, gutter,
all-clear, Page fit), then the orchestrator's full `npm run verify` at integration. If the row should
carry one state chip per broken anchor, or the bibliography chips should move under a divider, both
are single-component changes inside this file.
