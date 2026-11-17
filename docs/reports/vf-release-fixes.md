# VF — release fixes: the Sentinel's S3s and the owner's visual pass

- **Role:** Builder / Implementer
- **Brief:** `docs/tasks/vf-release-fixes.md` (review: `docs/reviews/v1-candidate-review.md`)
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-ac6c28f5-90d59894bb1e377e`, branch `t3/vf-release-fixes`
- **Date:** 17 November 2026
- **Scope:** seven small items, one commit. No paginator, page-model, print-model, document-schema or
  settings-schema change; `settingsVersion` stays 5 and `schemaVersion` stays 2.

---

## 1. Summary

| # | Item | Result |
|---|---|---|
| 1 | S3-1 — Page Edit commit keys from the catalogue | Done: two catalogue ids + a pure reason resolver; the overlay has no `event.key` left |
| 2 | S3-2 — Esc inside Page Edit must not close the find | Done: the `insidePageEdit` guard runs before the find-close branch |
| 3 | S3-3 — anchor-dot hover contrast | Done: dedicated `--nf-page-anchor-dot-hover` `#a86a00`, **4.44:1** on paper |
| 4 | The arrowhead band in Page Read/PDF | Done: the primary shaft stops at the arrow base; Page/print parity still exact |
| 5 | Library rows on the sidebar ladder | Done: folder 6 / document 18, deep folders step 12 px uncapped |
| 6 | Page → Continuous (owner decision A+B) | Done: card-menu item, `⌘2`/segment/palette verb carries the selected block |
| 7 | S4-2 — stale-lock takeover vs the rich-cell guard | Done: the guard runs before the lock is broken; tested |

Every item has a regression test. The three "before" screenshots were captured from a temporary build
with only the two visual changes reverted (documented in §6), so the before/after pairs are the same
fixture, window size, zoom and crop.

## 2. Files changed

**Product code**

- `apps/desktop/src/renderer/src/lib/shortcuts.ts` — `page-commit` split into `page-commit-escape`
  (`Esc`) and `page-commit-shortcut` (`⌘⏎`), both on the one `page-commit` Settings row; new
  `ariaKeyshortcuts(ids)` so the overlay's ARIA chord string is catalogue-derived.
- `apps/desktop/src/renderer/src/page/page-edit-state.ts` — `PAGE_COMMIT_SHORTCUT_IDS` and
  `pageCommitReason(event)`: the only key decision the overlay makes, returning `escape` / `shortcut`
  / `null`.
- `apps/desktop/src/renderer/src/page/PageBlockEditor.tsx` — the key handler asks
  `pageCommitReason`; `aria-keyshortcuts` and the "Esc or ⌘⏎ commits" hint read the catalogue.
- `apps/desktop/src/renderer/src/App.tsx` — `insidePageEdit` computed before the `close-find` branch
  and returns there; `⌘2` calls the new `goToContinuous()`.
- `apps/desktop/src/renderer/src/actions.ts` — `goToContinuous()` (the one Continuous verb) and the
  Page card menu's `Open in Continuous` entry; the palette row uses the same verb.
- `apps/desktop/src/renderer/src/shell/ViewControls.tsx` — the Continuous segment calls
  `goToContinuous()`.
- `apps/desktop/src/renderer/src/styles.css` — `--nf-page-anchor-dot-hover: #a86a00`; the dot's hover
  paints it.
- `apps/desktop/src/renderer/src/page/PageEdges.tsx` — the primary shaft renders through
  `shortenPathEnd(route.points, PAGE_EDGE_STYLE.arrowLength)`; `data-page-edge-route` still carries the
  full model route; the reference chevron keeps its line to the tip.
- `packages/layout/src/edge-path.ts` — new pure `shortenPathEnd(points, distance)`.
- `apps/desktop/src/renderer/src/lib/sidebar-rows.ts` — new `sidebarTreeIndent(level)` (same ladder,
  no three-level cap).
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — both library rows use `sidebarTreeIndent(depth)`.
- `apps/desktop/src/main/library.ts` — `takeOverStaleLock` runs `refuseUnrepresentableTableCells`
  before `breakStaleLock` and returns the same recovery line as `openStore`.

**Docs**

- `docs/design-tokens-page.md` — new "Paper colours: the anchor status dot" table (resting 7.41:1,
  hover 4.44:1, the pale line token is a tint, never a foreground).

**Tests**

- `apps/desktop/test/page-edit-commit-keys.test.ts` (new) — reasons per chord, near misses, a rebind
  in the catalogue followed by the handler, the ARIA string, and the source guard (no `event.key`, no
  modifier flags, no `'Escape'` literal in the overlay).
- `apps/desktop/test/shortcuts.test.ts` — the two commit ids, one Settings row `Esc / ⌘⏎`,
  `ariaKeyshortcuts` = `Escape Meta+Enter`.
- `apps/desktop/test/page-token-guards.test.ts` — the dot's two states recomputed from `styles.css`
  (WCAG), the hover rule wiring, and no dot in `print.css`.
- `apps/desktop/test/sidebar-system-css.test.ts` — the uncapped ladder, equality with the Outline at
  the same level, the two call sites.
- `apps/desktop/test/library-rich-cell.test.ts` — a stale-lock takeover of a rich-cell package is
  refused, with the lock and the bytes untouched.
- `packages/layout/test/page-routing.test.ts` — `shortenPathEnd` cases (base at the tip minus the arrow
  length, eating into the previous segment, a path shorter than the head).
- `tests/ui/m4b1b1-page-edit-overlay.test.mjs` — S3-2 (find stays open, the second Esc closes it) and
  item 6 (card menu, `⌘2` in Read and Edit, segment, no-selection, rejected commit).
- `tests/ui/r2d-page-edge-style.test.mjs` — every primary shaft ends at the arrow base, the reference
  route still reaches its chevron, the 200 % Page Read crop.
- `tests/ui/m4c1-print-compositor.test.mjs` — the dot's rendered colours and ratios at rest and hover,
  plus the 200 % hover crop.
- `tests/ui/m4c2-pdf-export.test.mjs` — the exported PDF's head carries no darker band (pixel probe at
  400 dpi), plus the PDF crop.
- `tests/ui/vault-library.test.mjs` — measured library indents 6/18/30/42/54 and equality with the
  Outline.
- `scripts/lib/pdf-raster.mjs` (new) — in-process `pdfjs-dist` + `@napi-rs/canvas` page render with a
  patch sampler (`pixelsPerMm`, the only safe mm→canvas factor) and a crop writer, so the asserted
  pixels and the saved evidence are the same raster.

## 3. Checks run (timings on this machine, idle)

| Command | Result |
|---|---|
| `npm run verify:fast` (boundaries + typecheck + unit + e2e) | **exit 0**, 61 s. Boundaries: 290 files / 1409 imports / 16 rules. Typecheck: all four workspaces. Unit: **171 files / 1756 tests** (was 170 / 1743). e2e: **16/16**, 45.9 s |
| `node tests/ui/run.mjs --group page --concurrency 2` | **20/20**, 185.1 s, 0 failures |
| `node tests/ui/run.mjs --group shell --concurrency 2` | **24/24**, 236.5 s, 0 failures |
| `node --test tests/ui/m4c1-print-compositor.test.mjs tests/ui/m4b1b1-page-edit-overlay.test.mjs tests/ui/find-bar.test.mjs` | **38 tests, 38 pass**, 29.8 s |
| `node --test tests/ui/m4c2-pdf-export.test.mjs` | **11/11**, 20.1 s |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` (final tree) | **12/12**, 25.4 s |

No `npm run verify` (the Orchestrator's). No sleeps or retry wrappers in the new tests: every wait is a
condition on the effect.

## 4. Acceptance criteria

- [x] **Page Edit commit keys come from the catalogue; a unit/source guard proves it; behaviour
      unchanged.** `pageCommitReason` asks `page-commit-escape` / `page-commit-shortcut`; the handler has
      no `event.key`/`metaKey`/`'Escape'` at all. `page-edit-commit-keys.test.ts` fires every catalogue
      chord, rejects the near misses (⇧Esc, plain ↵, ⌘Esc, ⌥↵), **rebinds the catalogue chord in the test
      and shows the handler follows** (`Control+E`), and pins
      `aria-keyshortcuts="Escape Meta+Enter"`. Escape commits with `escape`, `⌘⏎` with `shortcut`,
      `⌘S` still commits first (unchanged path, `nf:page-edit-commit`).
- [x] **Esc inside Page Edit commits only; the find stays open; Esc from the page still closes it.**
      `App.tsx` computes `insidePageEdit` before `close-find` and returns there. UI case: find open with
      the query `symmetric` and results, overlay open, `Esc` → one structural commit, `findOpen` true,
      the query and results intact; the next `Esc` from the focused page fragment closes the find. The
      m4c1 print/Page parity and every other find case stay green.
- [x] **The anchor dot's hover clears 3:1 on paper (computed), resting unchanged.** Rest
      `--nf-page-warning-ink` `#7a4b00` = 7.41:1 (unchanged), hover `--nf-page-anchor-dot-hover`
      `#a86a00` = **4.44:1**; the old pale `#e2b766` (1.88:1) no longer paints any dot state and the
      test asserts it stays below 3:1 so it can never come back as a foreground. The unit test parses
      `styles.css` and recomputes both ratios; the UI case reads the rendered `background-color` at rest
      and on hover (`rgb(122, 75, 0)` → `rgb(168, 106, 0)`); `print.css` has no dot rule.
- [x] **The primary arrowhead shows no darker band; Page and print identical; widths/size/colours
      unchanged.** The rendered shaft ends at `tip − direction × arrowLength` (6 px); the model route,
      `data-page-edge-route`, the router, the arrow polygon, the widths and every colour token are
      untouched. m4c1's `assertPrintParity` (path `d` deep-equal between Page Read and the print host,
      box/card/edge/trunk/label/chrome records) is green, so Page and paper are still byte-identical.
      The 200 % Page Read crop and the 400 dpi PDF crop are in §6; the PDF pixel probe proves no ink
      darker than the head fill appears inside the head.
- [x] **Library folder 6 px / document 18 px, equal to the Outline at the same level; deep folders keep
      stepping.** Measured `padding-inline-start`: root folder 6, root document 6, depth-2 folder 18,
      depth-2 document 18, depth-3 folder 30, depth-4 42, depth-5 54; the Outline's chapter row is 6 and
      its top-level block row is 18. Row height (28 px) and the 17..253 grid are unchanged.
- [x] **The Page card menu has `Open in Continuous`; `⌘2` from Page carries the selected block; the
      segment does the same; no selection → unchanged.** The card menu is exactly
      `[open-in-continuous, manual-break]` (the settings item keeps its Read-mode state). The item
      switches to Continuous Edit on that block with the caret in it; `⌘2` from Page Read keeps Read and
      reveals the selected block; `⌘2` and the segment run the same verb; with no selection both are the
      plain layout switch. A pending Page Edit commit wins (`⌘2` commits first, then carries), and a
      rejected commit keeps the overlay **and** the Page layout.
- [x] **No page count, card box, print model, schema or settings change.** No `packages/layout` layout,
      pagination or print-model file changed except the pure render helper `shortenPathEnd`; no schema
      file, no settings file; `settingsVersion` 5 / `schemaVersion` 2; the 61-page + density gates stay
      green (`m4c3-pdf-gate`, `m4d1` in the page group).

## 5. The two behaviour consequences worth naming

1. **`⇧Esc` inside the Page Edit overlay is now inert.** Before this batch `⇧Esc` both committed the
   overlay (the old handler compared `event.key` only) and closed the find (`close-find`'s second chord).
   The catalogue gives the overlay `Esc` and `⌘⏎` only, and the find must not react to an overlay key, so
   `⇧Esc` now does nothing there. This is the S3-2 rule applied consistently, not a lost action: the
   overlay's own commit keys are `Esc` / `⌘⏎` and both still work.
2. **`⌘2` with a Page selection keeps the Edit/Read mode.** The ratified rule is "the layout switch
   preserves Edit/Read" (`docs/plan.md`, `m4b1-page-view` asserts it), so the carry is navigation, not a
   mode change: Page Read + selection → Continuous **Read** with the block revealed; the card-menu item
   and double-click/`↵` remain the "open it for editing" paths (they enter Continuous Edit), exactly as
   before.

## 6. Arrow before/after evidence

- `artifacts/vf-release-fixes/arrow-page-read-200-before.png` — Page Read at **200 %**, crop around one
  primary head: the shaft runs through the head to the tip, so the tip reads as a second, darker arrow.
- `artifacts/vf-release-fixes/arrow-page-read-200.png` — the same crop after: one flat filled head.
- `artifacts/vf-release-fixes/page-read-200-context.png` — the same 200 % surface in context.
- `artifacts/vf-release-fixes/arrow-pdf-200-before.png` / `arrow-pdf-200.png` — the exported PDF,
  rasterized at **400 dpi** and cropped around the same head (before / after).
- `artifacts/vf-release-fixes/before-arrow.pdf` — the "before" export itself.

Measured, same fixture/zoom/crop:

| | Rendered primary shaft `d` | Pixels darker than the head fill inside the head box (400 dpi) |
|---|---|---|
| Before | ends at the tip (`… L 26 95.99`, tip `26`) | **78**, from the arrow base to **0.8 content px** before the tip (the band) |
| After | ends at the base (`… L 20 95.99`, tip `26`) | **10**, all at **6.1 content px** before the tip — the 0.625 px round cap at the base, never a line inside the head |

The "before" images were captured from a temporary build with only `PageEdges.routePath` (full route) and
the two `Sidebar` indents (the old `6 + depth * 14`) reverted; the build was restored and rebuilt before
the final runs, and the committed tree is the "after" one.

Other evidence in `artifacts/vf-release-fixes/`: `library-indent-before.png` (20/34) and
`library-indent-after.png` (6/18/30/42/54), `page-card-menu.png`, `command-2-jump.png`,
`anchor-dot-hover.png` (200 % crop).

## 7. Risks and observations

1. **A Page Edit commit can be accompanied by a second structural entry.** While writing the S3-2 test I
   saw `revision` go `0 → 2` for one committed overlay in the demo fixture: the demo's code/table block
   is normalised by the continuous editor's first buffer commit, which `DocumentSession.execute()` runs
   (`commitEditor`) **before** the `block.editContent` command. It is pre-existing, unrelated to this
   batch (it reproduces with the find closed and with the old Escape branch), and it does not touch the
   Page Edit block. The S3-2 test therefore asserts the structural op and the committed content instead
   of the revision delta; the "one structural entry" claim stays evidenced by the existing
   `m4b1b1` bold/list case (one global undo restores the block after leaving Page).
2. **The PDF pixel probe is palette-derived, not palette-bound.** It takes the head fill level from the
   histogram of the head box and looks for pixels at least 6 levels darker, so a print-palette change
   keeps the test meaningful; it fails loudly if the mapped point lands on paper (no ink).
3. **Page Read reveal in `⌘2` depends on the continuous editor being mounted in Read** (it is, and the
   selection lands in the block's card). If a future change unmounts the continuous editor in Read, the
   verb needs another reveal path; the test asserts the block's card is inside the viewport, so that
   change would fail here.
4. **The library ladder is uncapped by design.** A pathological 60-level folder chain would push rows
   past the 264 px panel; the Outline's cap exists for reading depth, the vault's does not (a hidden
   folder is worse than a narrow one). No guard was broken: `sidebar-system`'s Outline cap assertions
   are untouched and green.
5. **Screenshots are gitignored** (`/artifacts/`); they are evidence on this machine, not part of the
   commit.

## 8. Next step

- Orchestrator: one full `npm run verify` on an idle machine after the merge, then the product owner's
  visual pass on the 100 %/200 % arrow (Page Read and a real PDF), the library tree in a deep vault, the
  anchor-dot hover at 60 % density, the card menu, and `⌘2` on a selection.
- Out of scope here and unchanged: the empty child floor, the 1,000-block frame, mixed-polarity chrome,
  rich-cell move reconciliation, release mechanics.
