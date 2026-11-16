# S1 — Sidebar system: one rhythm, one type scale, one scroll

**Role:** Implementer / Builder
**Date:** 16 November 2026
**Brief:** `docs/tasks/sidebar-system.md`
**Design:** `docs/design/sidebar.md` (approved 16 November 2026), lab `docs/design/sidebar-ui-lab/`
**Base:** `b501759` (`main`: the S1 brief, which is the docs commit on top of the resolved decisions)
**Branch:** `t3/sidebar-system-rhythm-scale-scroll`
**Commit:** one worktree commit; not merged, not pushed

## Summary

The four sidebar sections now read as one surface. Nothing about queries, counts, ordering,
navigation, repairs or the health audit changed; the only behavioural addition is the Search chapter
collapse the brief asks for.

### The scale and the ladder

- `styles.css` gained the `--sb-*` tokens in the non-colour `:root` block, all through
  `calc(px * var(--ui-scale))`: `--sb-title` 13, `--sb-row` 12.5, `--sb-result` 12, `--sb-meta`
  10.5, `--sb-label` 9.5, `--sb-row-height` 28, `--sb-result-height` 40.
- **One token more than the brief's table: `--sb-count` (11 px).** §2 of the brief and §4 of the
  design fix the header count at 11 px, which is not one of the five row roles, and §1 forbids a
  literal `font-size` inside a sidebar selector. A sixth metric token is the only way to satisfy
  both; it is documented in the CSS comment as the header count, not a row role.
- Every sidebar rule now reads a token. The Outline's inherited 13 px is `--sb-row`; the Search
  snippet went 11 → 12 (design decision 1); the Health quote 12/500 → 12/400 on the card.
- One header: `.nf-section-head` (28 px, `padding: 2px 6px 4px`), `.nf-section-title` (13/600,
  `--text-1`), `.nf-section-count` (11 px tabular, `--text-3`). Library's switcher is the title;
  Outline's 9.5 uppercase label became a 13/600 title; Health is `Health` + the summary count only;
  Search keeps `ab` + close after the count.
- **Health's refresh did not move.** It is still the 28 px button next to the filter field in
  `.nf-health-search-row`; a new UI assertion proves it is not inside the header.

### Rows and cards

- Navigation rows (Library document/folder, Outline node) are `--sb-row-height` tall at `--sb-row`,
  radius `--radius-control`, hover `--surface-1` + `--text-1`, selected `--accent-soft` + the 1 px
  inset accent ring (already the product pattern, kept).
- **Outline depth is 12 px per level, capped after three levels** (`lib/sidebar-rows.ts`:
  `sidebarDepthIndent(level)` = 6 + min(level−1, 3) × 12 → 6/18/30/42/42). Level 4 and deeper render
  at the level-3 indent. The Library folder/note step stays 14 px (not in the design).
- One result card: `.nf-result-row` (1 px `--border-1`, `--surface-1`, radius 4, `7px 8px`,
  `--sb-result`/1.45) with exactly two variants, `.nf-result-row[data-current]` (Search: accent
  border + `0 0 0 1px var(--accent)` ring) and `.nf-result-row[data-selected]` (Health: `--surface-2`
  + `--border-2`, no accent). Health's rows are that card with a 40 px floor, two lines (quote, then
  state · block · references), 12 px in from the panel edge like the Search cards; its 3 px radius
  is gone. The old `[aria-selected]` style rule is gone; `aria-selected` stays in the DOM.

### Groups, dividers, collapse, ARIA

- One `.nf-sidebar-group`: `border-top: 1px solid var(--border-1)` + `padding: 8px 0`;
  `:first-child` has no rule and a 2 px top pad. Applied to Search chapters and Health sections.
  No header that follows a group carries a `border-top` any more (the old `.nf-search-chapter-head`
  rule is deleted), so the last card is always 8 px above the next rule.
- Search chapters collapse with the same control as Health: a 28 px row, a 16 px chevron box on the
  left, `--sb-label` name, 10.5 tabular count at the right. Default open; the count stays when
  closed; `findIndex` moving into a closed chapter opens it (via the toolbar `↵`/arrows/`⌘G`/`End`);
  a query change reopens everything. The state is a `Set` of closed keys in `SearchSection` —
  component-local, not in `state/shell.ts`, not persisted, reset when the section unmounts.
- ARIA: the results container is `role="tree"` (`aria-label="Search results"`), a chapter is a
  level-1 `treeitem` button with `aria-expanded`, an occurrence is a level-2 `treeitem`. The input
  keeps `role="combobox"`, `aria-controls` the tree and `aria-activedescendant` the current
  occurrence; when the current occurrence's chapter is closed its rows are gone, so
  `aria-activedescendant` is omitted instead of naming a missing id. Health keeps plain buttons.

### Scroll and the dot

- `.nf-sidebar-scroll` is the only scroll owner: `overflow-y: auto`, `overflow-x: hidden`,
  `scrollbar-gutter: stable`. The 10 px classic scrollbar is reserved from the start; the track is
  transparent and the thumb only exists while the content overflows. The gutter is internal: no
  `shared/shell.ts`, persisted width, or clamp changed.
- The needs-repair counter is a 6 px `--danger` circle at `top/right: 4px`, absent at zero, with the
  count in `aria-label` **and** `title`. `data-health-badge` still carries the number, so the
  existing Health suites keep working. The Health header shows the exact number.

### Behaviour, guard and docs

- No engine, schema, settings, IPC, Page/PDF or palette touch. No new dependency.
- New guard `apps/desktop/test/sidebar-system-css.test.ts` (13 assertions, no app): the token
  values, "no literal `font-size` in a sidebar selector", every token consumed, each row role on its
  own token, the two card variants and nothing else, the group-owned divider, one scroll owner with
  the 10 px gutter, and the dot (and no `.nf-activity-badge` left). Scope: the sidebar class
  prefixes, minus the 560 px Health repair dialog, which shares the prefix but is another surface.
- New UI suite `tests/ui/sidebar-system.test.mjs` (4 tests) carries the acceptance criteria at
  runtime and writes the evidence screenshots.
- `docs/design/find-bar.md` §3 and `docs/design/document-health-sidebar.md` §2 now point at
  `docs/design/sidebar.md` for the row/header/card/divider/scroll rules instead of restating them.

## Files changed

Implementation:

- `apps/desktop/src/renderer/src/styles.css` — `--sb-*` tokens, the shared header/title/count, the
  navigation rows, the result card and its two variants, `.nf-sidebar-group`, the Search group row,
  the Health card and group row, the sidebar shell text sizes, `scrollbar-gutter`, the
  `.nf-activity-dot` (badge block removed).
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — the dot, the Library header (switcher as the
  title, count hidden at zero), the Outline title, the capped depth indent.
- `apps/desktop/src/renderer/src/shell/SearchSection.tsx` — the shared header classes, the tree
  roles, the collapsible chapter rows, the component-local closed set, `data-current`.
- `apps/desktop/src/renderer/src/shell/HealthSection.tsx` — the shared header + always-on summary,
  the group class, the 16 px chevron box, the result card.
- `apps/desktop/src/renderer/src/lib/sidebar-rows.ts` — new: the Outline indent constants and
  `sidebarDepthIndent`.

Tests:

- `apps/desktop/test/sidebar-system-css.test.ts` — new guard (13 tests).
- `tests/ui/sidebar-system.test.mjs` — new suite (4 tests) + registered in `tests/ui/suites.mjs`
  (FILES and the `shell` group).
- `apps/desktop/test/activity-bar.test.ts` — the badge contract became the dot contract.
- `tests/ui/find-bar.test.mjs` — the migrated chapter assertions and a new collapse test.
- `tests/ui/document-health.test.mjs` — the migrated badge, row and all-clear assertions.
- `tests/ui/v0-shell-frame.test.mjs` — the content-box measurement uses the scroll container's
  client box and now asserts the 10 px gutter.

Docs:

- `docs/design/find-bar.md` §3 (+ status line), `docs/design/document-health-sidebar.md` §2
  (+ status line), this report.
- Evidence: `artifacts/sidebar-system/` — `library.png`, `outline.png`, `health.png`, `search.png`,
  `search-cards.png`, `collapsed-chapter.png`, `health-closed-group.png`, `dot-3.png`,
  `dot-3-window.png`, `dot-0.png`, `library-roomy.png`, `long-list-scroll.png`.

## Migrated test assertions (the old contract → the S1 contract)

The brief allows migrating the old `listbox`/`option` and geometry assertions. Every migration:

1. `find-bar.test.mjs` · "shows label-only headings…": the chapter opener was asserted to be a
   `DIV`, not focusable, with a 1 px `border-top` **on the head**, and clicking the label did
   nothing. It is now a `BUTTON` `role="treeitem"` `aria-level="1"` `aria-expanded="true"` with a
   `0px` border-top, the divider on the `[data-search-chapter]` group (`padding-bottom: 8px`,
   first group `0px`), the tree container asserted as `role="tree"` / `aria-label="Search results"`,
   and the click asserted to collapse the group (rows unmount, count stays, `findIndex` unchanged)
   and reopen it. Not weakened: the navigation contract is now asserted directly instead of "the
   control does nothing".
2. `find-bar.test.mjs` · new "collapses Search chapters…": the old suite had no collapse test; this
   adds the six collapse rules (default open, count while closed, 16 px left chevron, 28 px row,
   navigation opens, a new query reopens) plus the cross-group divider.
3. `document-health.test.mjs` · the badge: `border-radius: 2px` + `tabular-nums` + square → `50%`,
   6 × 6, no text, `data-health-badge="3"`, `aria-label` **and** `title` `3 anchors need repair`.
4. `document-health.test.mjs` · the problem row: `height === 40` on a bare button, quote weight
   `500`, `border-radius: 3px`, "no left accent stripe" → the shared `.nf-result-row` card
   (`classList` proves it), 1 px outline on all four sides, radius `4px`, `7px 8px` padding, quote
   `400/12px`, meta `10.5px`, and `height ≥ 40` (the card's action floor).
5. `document-health.test.mjs` · the all-clear: `[data-health-summary]` count `0` → one element
   reading `0 to fix · 0 issues` (design §4: Health always shows the count).
6. `v0-shell-frame.test.mjs` · the content box: `contentRight` was `scrollBox.right − paddingRight`,
   which now includes the reserved 10 px gutter. It is measured from the scroll container's
   `clientWidth`, plus a new assertion that the gutter is 10 px and the content box is 236 px
   (design §7's arithmetic minus the 2 px card borders: 312 − 2 − 48 − 8 − 8 − 10).
7. `activity-bar.test.ts` · "a square tabular badge, not a pill" → "a 6 px dot, not a counter".

No `role="option"` or `listbox` assertion existed in the suites; only the tests above encoded the
old contract.

## Checks (real timings)

| Command | Result |
|---|---|
| `npx vitest run apps/desktop/test/sidebar-system-css.test.ts` | 13/13, 0.07 s |
| `npx vitest run` (all unit files) | 157 files / 1576 tests, 6.0 s |
| `node --test tests/ui/find-bar.test.mjs` | 15/15 (standalone) |
| `node --test tests/ui/document-health.test.mjs` | 6/6 (standalone) |
| `node --test tests/ui/v0-shell-frame.test.mjs` | 8/8 (standalone) |
| `node --test tests/ui/sidebar-system.test.mjs` | 4/4 (standalone) |
| `node tests/ui/run.mjs --group shell,anchors --concurrency 2` | **34/34 suites, 0 failed, 293.8 s** (includes `sidebar-system` 14.1 s, `find-bar` 24.2 s, `document-health` 18.4 s, `v0-shell-frame` 19.8 s, and the two serial suites) |
| `npm run build` after the final CSS edit + `node tests/ui/run.mjs --group shell --concurrency 2` | 20/20 suites, 0 failed, 195.0 s |
| `npm run verify:fast` (boundaries + typecheck + unit + e2e) | **exit 0**, 59.1 s; 16/16 critical e2e |

No renderer `pageError` in any suite (`h.pageErrors` is asserted empty in every file).

## Acceptance criteria

| Criterion | Result |
|---|---|
| One header height/title size/8 px inset in all four sections; Library switcher as title; Health `Health` + count with the refresh beside the filter | **Pass** — measured 28 px headers, 13/600 titles, 11 px counts, 22 px controls; the refresh is asserted outside `.nf-health-head` and on the filter row |
| Outline rows 12.5, depth 12 px, no growth after level 3 | **Pass** — computed indents 6/18/30/42/42 for levels 0..4; 12.5 px on chapter and node rows |
| Search occurrences and Health problems are the same card; Search current = accent ring, Health selected = no accent; no pill | **Pass** — one `.nf-result-row`; `data-current` ring colour equals its border colour; `data-selected` has `box-shadow: none`; radius 4 everywhere |
| The last card of a group is ≥ 8 px from the next divider, every group, 180–640 px | **Pass** — measured on Search and Health at 264, 180 and 640 px |
| Search chapters collapse with a left chevron; count visible when closed; navigating in opens; a new query reopens all | **Pass** — new collapse suite assertions |
| Results are a `tree` with `aria-expanded` chapters and `aria-level` rows; the input keeps `aria-activedescendant`; Esc/↵/arrows/Home/End work | **Pass** — roles, levels and the unchanged keyboard suite |
| No content shift when a section overflows; thumb only when there is something to scroll; no persisted width changed | **Pass** — same content box and right edge with and without overflow, gutter 10 px at rest, no width/clamp change |
| 6 px dot when something needs repair, nothing at zero; count in `aria-label` and `title` | **Pass** — 6 × 6, 50%, `--danger`, top/right 4 px, no text, both labels |
| No other behaviour change (query, counts, ordering, navigation, repairs) | **Pass** — the suite diff is UI-only; the engine, store, schema and settings are untouched |

## Deviations and open questions

1. **`--sb-count` (11 px) is an eighth token**, outside the five row roles. The brief and the design
   fix the header count at 11 px and §1 forbids a literal `font-size`; see the CSS comment and the
   guard's `TOKENS` map. If the Orchestrator prefers the count on an existing step, `--sb-meta`
   (10.5) is the only candidate and it changes the header by 0.5 px.
2. **Health's summary is now always rendered**, `0 to fix · 0 issues` at the all-clear (design §4
   "always shown in Health"). The old test asserted its absence; it is migrated (item 5 above). This
   is the one visible change outside the row/header geometry.
3. **Health's quote weight 500 → 400** follows the card anatomy (`--sb-result` is 400, matching the
   Search snippet). The old test asserted 500; it is migrated.
4. **The design's "238 px content box" is 236 px in practice**: the 264 px content column renders a
   312 px card whose 1 px borders are inside the column, so the scroll box is 262 px and
   262 − 8 − 8 − 10 = 236. The invariant the brief protects (no shift, no persisted width change)
   holds; the absolute number differs from the design's arithmetic by the pre-existing card borders.
   `v0-shell-frame` now documents both numbers.
5. **Chapter toggles are focusable.** The brief does not say; leaving the tree entirely at
   `tabIndex={-1}` would make the new control mouse-only, so the chapter toggle stays in the tab
   order (occurrences stay at `-1`, the input owns `aria-activedescendant`). Tab from the field
   reaches the first chapter, Space/Enter collapses it. No test depended on the old "not focusable".
6. **The Library tree indent stays 14 px.** Design §5 gives the 12 px step to the Outline only; the
   Library folder/note step is not in the brief, and changing it would be an unrequested geometry
   change.
7. **`.nf-empty-line` and `.nf-text-button`** are shared with dialogs and banners. `.nf-empty-line`
   moved to `--sb-result` (same 12 px, one value); `.nf-text-button` stays 11.5 px literal and is
   outside the guard's sidebar scope because it is a dialog/banner control.

## Risks

- The ratio between "group row" and "label" is now one control for two sections; a future Health
  change to the group row must keep the Search row in sync (the guard covers the shared metrics, not
  the shared class).
- The card's 40 px floor is a `min-height`; a three-line Health row grows past it, which the design
  allows (card height is auto).
- `scrollbar-gutter` relies on the global 10 px classic scrollbar. A future overlay-scrollbar change
  would make the reserved gutter 0 and the content box 246; the guard pins the global width.

## Next step

Orchestrator: review the diff and the screenshots, run the full `npm run verify` at UI concurrency 4,
then hand the product-owner visual pass (four sections, a collapsed chapter, a closed Health group,
the dot at 0/3) as one review unit.
