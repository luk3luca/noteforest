# Review — V1-candidate Sentinel (full review before release)

- **Reviewer:** Reviewer / Sentinel (independent; no product code written)
- **Date:** 17 November 2026
- **Target:** `main` at `6aa8d04` (F4a, F4b, B1, B2, P2 merged; full verify green)
- **Worktree / branch:** `/Users/luca/.t3/worktrees/noteforest/t3-8f7dea3b-098beaef1e7b4f70`, `t3/8f7dea3b`, one commit (this report + two checklist lines)
- **Environment:** macOS (darwin), Electron 45.2.1 runtime, `electron-vite build` at HEAD; UI probes ran against that build. `node_modules` was APFS-cloned (`cp -cR`) from a sibling worktree at the same lockfile state; all `@noteforest/*` workspace symlinks therefore resolve to **this** worktree.
- **Ground truth for the suite:** the Orchestrator's run — `npm run verify` at UI concurrency 4, exit 0, 170 unit files / 1743 tests, e2e 16, recovery 14, UI 69/69 (353.8 s). **Not re-run** (brief). Every suite quoted below was run by me at HEAD, standalone/idle.
- **Brief:** `docs/tasks/v1-sentinel.md`.

---

## 1. Verdict

**Accept with findings. Nothing in the reviewed batches blocks the tag.**

- No S1 and no S2 in the five batches (F4a, F4b, B1, B2, P2) or in the data-safety, Page/print, keyboard, editor, library and test surfaces I probed.
- Four S3 and two S4 findings, all with reproductions. They are drift, one double-action interaction, one hover-contrast regression in a new element, and stale documentation — none of them loses data, changes a document, moves a page, or reaches the PDF.
- The **tag itself is not yet possible for reasons outside the code under review**: release mechanics are not configured (no `electron-builder` target, no `.icns`, version is `0.0.0-m2.2`, no `dist`/`release` script, no packaged build), and the DoD's own "every release" suites (`test:perf`, `test:visual`) plus the packaged smoke and the product-owner visual/VoiceOver/PDF passes have not been run. That is the release-gate table in §4, not a code finding.
- The one item I would not ship *silently* is the owner-deferred empty-child card (§6). It is recorded in `docs/plan.md` known issues and accepted by the product owner; I judge it S2-severity by the checklist's definitions but I do not raise it as an open finding because the decision is explicit and recorded.

In `docs/review-checklist.md` §9.2 terms this is **Approve with nits**: only S3/S4 findings, which the checklist allows as follow-ups. The two "Fail"/"Open" rows in §5 are S3 (docs) and process (perf/visual/package); both are cheap to close in the release commit, and neither changes the code verdict. The S3s should land before tagging because they are one-liners, not because the candidate is unsafe.

---

## 2. Checks run (evidence base)

All at `6aa8d04`, this worktree, after `npm run build` (electron-vite, exit 0).

| Command | Result |
|---|---|
| `npx vitest run apps/desktop/test/{shortcuts,find-page,find-page-ranges,highlight,code-themes,library-rich-cell}.test.ts packages/core/test/highlights.test.ts` | **7 files / 69 tests pass** (0.97 s) |
| `npx vitest run apps/desktop/test/{save-coordinator,asset-confinement,document-lifecycle-main,settings,document-settings,export-contract,flush}.test.ts` | **7 files / 98 tests pass** (2.85 s) |
| `npx vitest run apps/desktop/test/{library-roots,library-roots-main,markdown-save,markdown-files,recovery-library}.test.ts` | **5 files / 43 tests pass** (1.28 s) |
| `node --test tests/ui/m4c1-print-compositor.test.mjs` | **7/7** (17.0 s) |
| `node --test tests/ui/highlighter.test.mjs` | **5/5** (19.8 s) |
| `node --test tests/ui/find-bar.test.mjs` | **19/19** (29.0 s) |
| `node --test tests/ui/page-scroll.test.mjs` | **8/8** (16.0 s) |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` | **10/10** (18.6 s) |
| `node --test tests/ui/b2-contrast.test.mjs` | **3/3** (14.3 s) |
| `node --test tests/ui/ui-editor-shortcuts.test.mjs` | **10/10** (15.1 s) |
| `node --test tests/ui/data-recovery.test.mjs` | **4/4** (16.8 s) |
| `node --test tests/ui/ui-overlay-command-gate.test.mjs` | **7/7** (16.9 s) |

Six inline Playwright runs (two superseded by a fixture/setup mistake) were executed with `node --input-type=module -` against the real built app; **no test file was created**. The four informative transcripts are quoted in the findings, the audit and the appendix. Geometry/contrast numbers were recomputed locally (WCAG relative luminance), not copied from a report.

---

## 3. Findings

### S1 — none

No data loss, corruption, crash, security or privacy finding. Specifically checked: atomic temp→rename writes and corrupt-file refusal (code + `save-coordinator`/`document-lifecycle-main`/`asset-confinement`), draft → materialize → save reconciliation (`materializeLocked`/`materializationSucceeded`, `save-coordinator.test.ts:239`), external modification and stale-lock takeover (`save-coordinator.test.ts:298`, `document-gateway.test.ts:220`), the rich-cell refusal before `repository.open` (`library.ts:1496`), corrupt `settings.json` refusing implicit writes (`library.ts:3747-3758`), and the F4b no-highlight byte-identity (UI, bytes compared).

### S2 — none in the reviewed batches

The known-issue list contains one item of S2 severity (`docs/plan.md` known issue 1, empty child card). It is explicitly deferred by the product owner and is not caused by these batches; see §6.

---

### S3-1 — Page Edit's commit keys are hand-written: the catalogue has a second writer

- **Location:** `apps/desktop/src/renderer/src/page/PageBlockEditor.tsx:243` (`if (event.key === 'Escape')`), `:249` (`event.key === 'Enter' && (event.metaKey || event.ctrlKey)`), `:287` (`aria-keyshortcuts="Escape Meta+Enter"`); the catalogue entry is `apps/desktop/src/renderer/src/lib/shortcuts.ts:638-643` (`page-commit`, `Esc` / `⌘⏎`).
- **Failure scenario:** change `page-commit` in `lib/shortcuts.ts` (a key, a modifier, a glyph, or the row text) and every listed surface changes — the Settings row, the palette hints, the catalogue tests — **except the overlay**, which keeps matching `Escape`/`Meta|Ctrl+Enter`. The Settings list can then advertise a key that does not commit, or the overlay keeps a key the list no longer shows. That is exactly the defect class B1 was created to end.
- **Evidence:** `grep -n "shortcuts\|matches(\|shortcutHint" apps/desktop/src/renderer/src/page/PageBlockEditor.tsx` returns only line 287 (the ARIA string); the file does not import the catalogue at all. The handler at 243/249 compares raw keys. The claim in `docs/reports/b1-defects.md:132-133` ("the Page Edit overlay asks `page-commit`") is not true of the code, and `docs/ux.md:1336-1338` ("the handlers all read it") overstates the same point. Every other asked surface was verified to import it: `App.tsx`, `PageView.tsx:784/791`, `FindBar.tsx`, `editor/keymap.ts`, `actions.ts` (palette/context hints), `SettingsDialog.tsx`, `CanvasHeader`, `ViewControls`, `PagePosition`, `Sidebar`, `TabBar`, `Toolbar`, `Workspace`, `editor-context-menu.ts`.
- **Smallest honest fix:** in `PageBlockEditor.onKeyDown`, start with `if (!matches(event, 'page-commit')) return;` and derive the commit *reason* (not the chord) from the key: `commit(event.key === 'Escape' ? 'escape' : 'shortcut')`. Add one catalogue-driven assertion that fires each chord of `page-commit` at the overlay. If the ARIA string stays literal, pin it in the catalogue test the way the menu accelerators are pinned.

### S3-2 — Escape inside Page Edit also closes an open find (one key, two surfaces)

- **Location:** `apps/desktop/src/renderer/src/App.tsx:441-446` (`close-find` runs in the window-capture handler) vs `:455-462` (the `insidePageEdit` carve-outs for undo/redo/save, which are computed **after** the Escape branch); overlay handler `PageBlockEditor.tsx:243`.
- **Failure scenario:** Page layout, find open with results, Page Edit overlay open; press `Esc`. The app closes the find **and** commits the overlay. Reproduced on the built app:
  ```
  PROBE before   {"findOpen":true,"findTotal":1,"overlay":0}
  PROBE opened   {"findOpen":true,"overlay":1}
  PROBE afterEsc {"findOpen":false,"findQuery":"symmetric","overlay":0,"findBar":0}
  ```
  The commit is the overlay's documented action, so no text is lost and the query survives (`⌘F` restores it). The defect is the double action: the catalogue assigns `Escape` to `close-find` (global, `list:false`) and to `page-commit` (editor), and the overlay is a surface that sees both, so the "one chord, one meaning per surface" rule the catalogue is built on does not hold here.
- **Evidence:** the probe above; code path as cited (`App` does not `stopPropagation`, so React's capture handler on the overlay still runs). No suite covers an open find plus an open overlay; `tests/ui/m4b1b1-page-edit-overlay.test.mjs` has no find case.
- **Smallest honest fix:** compute `insidePageEdit` before the `close-find` branch (or re-check the target there) and return before closing the find when the event originates inside `[data-page-edit-overlay]` — the same guard pattern already used for undo/redo and `⌘S` twenty lines below.

### S3-3 — The new Page anchor dot fades below 3:1 on hover

- **Location:** `apps/desktop/src/renderer/src/styles.css:8610-8612` (`.nf-page-anchor-dot:hover .nf-page-anchor-dot-shape { background: var(--nf-page-warning-line) }`), token at `:7783` (`--nf-page-warning-line: #e2b766`), resting fill at `:8607` (`--nf-page-warning-ink: #7a4b00`).
- **Failure scenario:** hover the 6 px status dot — the moment the tooltip is meant to be discovered — and the indicator drops from **7.41:1** to **1.88:1** against the white paper. That is a state of a meaningful non-text indicator below the 3:1 non-text bar; it contradicts B2's own ratified rule ("every state clears 3:1 at full opacity", `appearance-css-guard.test.ts:464`) and checklist §3.6 ("meaningful graphics").
- **Evidence:** recomputed WCAG ratios: `#7a4b00` on `#ffffff` = **7.41**, `#e2b766` on `#ffffff` = **1.88**. The B1 screenshot (`artifacts/b1-defects/page-anchor-dot.png`, regenerated by my run) shows the resting dot correctly, and the m4c1 suite asserts only geometry/ARIA, not the hover fill.
- **Smallest honest fix:** hover to a darker fill (e.g. reuse the ink and add a 1 px ring, or add a `--nf-page-warning-hover` cleared at ≥ 3:1), one declaration. If the pale hover is intentional, record it as a documented SC 1.4.11 exception next to the `border-1` exception in `docs/design-tokens-page.md`.

### S3-4 — `docs/ux.md` still describes a different keyboard than the shipped app

- **Location and contradiction:**
  - `docs/ux.md:1255` — "All shortcuts appear in the menu bar or the shortcuts sheet and are **remappable**." False on both halves. Several real bindings appear in neither: `tab-previous-bracket`/`tab-next-bracket` (`⇧⌘[`/`⇧⌘]`), `delete-block-selected` (`Delete` on a selected block), `close-find`, and the seven `find-field-*` keys (they are in the field's tooltips). And there is no remap UI at all — MS-9 is explicitly "not shipped" in `docs/plan.md` ("Shortcuts: what exists and what does not").
  - `docs/ux.md:1344` — "`⌥↑`/`⌥↓` move blocks in Continuous and **change pages on the Page canvas**." B1 removed the page duplicate. Probe on a 16-page note: `Alt+ArrowDown` leaves `data-current-page` at 1; `Meta+ArrowDown` moves it to 2. The catalogue has no alt page chord (`page-previous`/`page-next` are Command-only).
  - `docs/ux.md:1349` — "**Not in v1** … `⌘P` quick export" contradicts §9.1 (`⌘P` = Export PDF…) and the shipped app (P2, probe: `⌘P` opens the export sheet in `configure`, `⇧⌘E` is inert).
  - `docs/ux.md:911` and `:1715` — the export flow still names `⇧⌘E` as the sheet key and `⌘P` as "quick export with last settings". P2 made `⌘P` the sheet and removed `⇧⌘E`.
  - `docs/ux.md:1687` ("Page navigation `⌥↑/↓`") and `:1708-1715` (§12.4 keyboard-only paths: `⇧⌥→` branch, `⌘⌥C` chapter, `⌘⌥B` manual break, `⌥↓` next page, `⌘⌥I` reattach) describe the earlier design, not the shipped keys. The revision note at `:14` says §9 and the screen inventory now describe v1.0, so the reader is entitled to treat §9's model as current.
- **Evidence:** the two probes quoted above (Alt vs Command page keys, `⌘P`/`⇧⌘E`); the catalogue (`lib/shortcuts.ts`) for every chord; `docs/plan.md` "Shortcuts" section for MS-9. This is not style: three of these lines are the only place a keyboard-only reader is told how to page, export, or trust the list.
- **Smallest honest fix:** replace the five places with the catalogue's truth, delete the remappability sentence, and add a docs guard in `ui-editor-shortcuts`/`shortcuts.test.ts` that the §9 key tables are a subset of the catalogue (the same class of guard the menu accelerators already have).

### S4-1 — The F4a Page paint colours are not in the Page token doc

- **Location:** `apps/desktop/src/renderer/src/styles.css:7799-7801` (`--nf-page-find-bg`, `--nf-page-find-current-bg`, `--nf-page-find-current-line`); `docs/design-tokens-page.md` has a "Paper colours: stored highlights" section (`:239-255`) but no find row.
- **Evidence:** `grep -rn "nf-page-find" docs/` returns only `docs/reports/find-page.md`. The F4a report itself flagged this as a deliberate docs-role deferral (`find-page.md:134-137`); F4b's docs pass documented the highlight tones and left the find tokens out. The Page token doc is the declared single registry for the fixed Page skin.
- **Fix:** three table rows next to the highlight tones (tint, current tint, underline ink) and one sentence that the paint is transient and page-scoped.

### S4-2 — `takeOverStaleLock` bypasses the rich-cell load guard

- **Location:** `apps/desktop/src/main/library.ts:1563` opens `repository.open` directly; the guard is called only in `openStore` (`:1496`, before `:1499`). `packages/core/src/table-cells.ts:19-21` states the guarantee as "the loader refuses before the package is opened".
- **Failure scenario:** a note that opened read-only (stale lock) is changed on disk by another writer into a rich-cell document; "Take over lock" then opens it into a store without the guard. Not reachable without an external writer (a rich-cell note never opens, so it never shows a lock banner), which is why this is S4 and not higher.
- **Evidence:** the two call sites above; the guard's own doc comment claims the stronger invariant.
- **Fix:** call `refuseUnrepresentableTableCells(resolved)` (or route through `openStore`) before the second `repository.open`, and return the same recovery view.

---

## 4. Batch acceptance audit

"Pass" means I checked the assertion or the code path myself, not that the report says so. Commands are in §2.

### F4a — find in Page (`docs/reports/find-page.md`)

| Criterion | Result | Evidence |
|---|---|---|
| Every mounted match painted; current stronger and follows `↵`, arrows, sidebar row, `ab` | **Pass** | `find-bar` 19/19; assertions at `tests/ui/find-bar.test.mjs:977-1153`; stored-quote/chapter hits correctly register no current range |
| A cross-segment occurrence is N ranges, all current | **Pass** | `find-bar:1155-1230` (`come   qui` → two ranges, both current); unit `find-page-ranges.test.ts` 10 cases; code boundary and code-line cases |
| Closing clears both names; reopening repaints the same covers | **Pass** | `find-bar:1120-1153` |
| Page geometry does not move | **Pass** | `pagePaintGeometry` deep-equal before/during (`data-page-count/model-runs/measurement-calls/fragment-count/mounted-pages/segments/alpha paths/card box`), `find-bar:368-393` |
| No find markup in print; print model identical open vs closed | **Pass** | `find-bar:1290-1345` (no `nf-find`/`data-find`, every range inside `.nf-page-view`, `rangesInPrint` 0, page count + fingerprint identical); `find-page.test.ts` pins the only two `::highlight` rules to `.nf-page-view` and `print.css` to none |
| No Continuous/sidebar/count regression | **Pass** | 19/19 including the pre-existing count/order/tree/Read/narrow-header cases |

Notes (not failures): the registry is document-global with one owner and self-heals on the next repaint (report risk 1 — untested with two Page tabs); `CSS.highlights` is assumed and asserted in the runtime; `unmapped` has no consumer yet; the Page find-over-highlight precedence is not asserted (Continuous is).

### F4b — the highlighter (`docs/reports/highlighter.md`)

| Criterion | Result | Evidence |
|---|---|---|
| Four tones apply/remove from the bubble; `⇧⌘H` applies and toggles; one undo entry | **Pass** | `highlighter` 5/5, case 1 (`highlighter.test.mjs:429-500`); unit `highlight.test.ts` toggle rule |
| Survives reload, undo/redo, copy between blocks and documents | **Pass** | case 1 (quit/relaunch renders the tone), case 2 (`amber` into another block and another document) |
| Deleting the highlighted text deletes the mark | **Pass** | case 2 (`delete-block` has no `highlight` after Backspace; sibling tones kept) |
| Continuous + Page tint; page count and card box identical | **Pass** | case 3: Page paper `rgb(197, 210, 222)`, padding/border 0, page count and card box equal to the plain document within 0.5 px |
| PDF prints the tint; page count unchanged; no find in the PDF | **Pass** | case 4: real `exportPdf`, four paper tones counted in the raster (> 60 px each), `plain.pdf` same page count, print DOM has 0 find nodes |
| Find wins over a stored mark | **Pass (Continuous only)** | case 4 `nested: true`, hit background set; Page precedence is untested (CSS Custom Highlight paints over element backgrounds — low risk) |
| Read mode shows, cannot change | **Pass** | case 5: no bubble, `⇧⌘H` no-op, bytes and in-memory JSON unchanged |
| Byte-unchanged without highlights; `schemaVersion` 2 | **Pass** | case 3 compares the file bytes after open+flush; saved JSON `schemaVersion 2` |
| Page Edit keeps the mark | **Pass** | unit round-trip; **probe:** applied `blue` in Continuous, opened Page Edit (`marks:["blue"]`), typed ` ZZ`, `⌘⏎`; saved `"tone":"blue"` + the typed text |

### B1 — v1 defects (`docs/reports/b1-defects.md`)

| Criterion | Result | Evidence |
|---|---|---|
| 6 px dot top-right, 24 px hit, tooltip, no `⚠ anchor` chip, card box unchanged | **Pass** | `m4c1` case 6: `BUTTON`, `position:absolute`, shape 6×6, hit ≥ 24, label/title sentence, empty text, card = fragment < 0.5 px; screenshot `artifacts/b1-defects/page-anchor-dot.png` |
| Click **and** Enter open Health on that anchor without selecting/opening | **Pass** | same case: `data-health-row="anchor:broken-anchor"`, `selectedBlockId` unchanged; Enter included (the swallowed-Enter fix) |
| Defect chip + dot on one card, no overlap | **Pass** | case 7: `defect.right <= dot.left + 0.5` on a real A5 + 46 mm defect |
| Print DOM **and produced PDF** carry no anchor marker/attribute/text; every other parity record still asserted | **Pass** | case 6: 0 dots, 0 flags, no `anchor`/`⚠`; real `print-markers.pdf` inspected; `assertPrintParity` compares sheets, boxes, edges, trunks, labels, chrome, ghost/continues |
| `⇧1`/`⇧2` gone; Page find field takes `!`, `"`, `@`; both fits reachable | **Pass** | `find-bar` "accepts shifted digit characters" case; code: no `⇧1`/`⇧2` handler, `menu-fit-page` + palette rows; the menu/palette cases are in the Orchestrator's 69/69 (not re-run) |
| **One catalogue; no hand-written chord comparison** | **Fail** | **S3-1**: `PageBlockEditor.tsx` does not import the catalogue |
| Settings list rendered from the catalogue; every row a real binding; groups/rows | **Pass** | `ui-editor-shortcuts` 10/10 (rendered rows deep-equal the live catalogue); **probe**: 34 rows; five spot-checked: `Export PDF… ⌘P`, `Reset zoom ⌘0`, `Highlight ⇧⌘H`, `Previous / next page ⌘↑ / ⌘↓`, `Commit Page Edit Esc / ⌘⏎` — all match the handlers I read |
| Subtractions and retained keys (`⌥↑/⌥↓` page, `⌘1…⌘9`, `⇧1/⇧2`; `⌘2/⌘3`, `⇧⌘0`, `⌃Tab`) | **Pass** | unit `shortcuts.test.ts`; probe: no tab digits or bare-Shift keys in the list |
| Menu accelerators equal the catalogue exactly; a renamed binding fails | **Pass** | `shortcuts.test.ts:245-269` multiset equality; the three Find items and `⌘P` pinned |
| No `⌘⇧` literal; one glyph order; guard in both gates | **Pass** | vitest source guard + `ui-editor-shortcuts` glyph guard (both scan the same tree) |

### B2 — contrast (`docs/reports/b2-contrast.md`)

| Criterion | Result | Evidence |
|---|---|---|
| Four themes verbatim, each with its own surface; worst role computed and shown | **Pass** | `code-themes.test.ts` (registry + CSS equality + recomputed worst); `b2-contrast` 3/3 (four real surfaces: `rgb(30,30,30)/(255,255,255)/(39,40,34)/(250,250,250)`, ink, `hljs-keyword`) |
| `codeTheme` additive in v5, `auto`, unknown → `auto`, no bump, file without key → `auto` | **Pass** | `packages/layout/test/appearance.test.ts`, `apps/desktop/test/settings.test.ts:232-251`, `appearance.test.ts` (`data-code-theme` written with `data-theme`) |
| Continuous code block takes the theme surface; inline/tables/prose do not | **Pass** | CSS selectors scoped to `.nf-continuous-surface`/`.nf-markdown-document`; unit + UI |
| Page/PDF keep One Light and never read the shell code theme | **Pass** | `grep`: no Page rule reads `--code-surface`/`--code-text`; Page code uses `--nf-page-code-*` and `#f5f7f9`; `code-themes.test.ts` "never renders a code theme on the paper"; the PDF raster check is in the Orchestrator's run |
| Continuous resting/reference/muted ≥ 3:1 at full opacity; no fade; widths/arrowhead unchanged | **Pass** | recomputed: dark 11.19 / 4.73 / 3.69, light 9.30 / 4.52 / 3.71; `appearance-css-guard.test.ts:464` asserts no `opacity` and no `opacity` in the transition; widths 1.25/1.75/1 and the 6×3 arrowhead pinned |
| Page edges and the Page/PDF edge model unchanged | **Pass** | guard pins `#3f6f8f`/`#8a6a2f` and the print colours; page group green in the Orchestrator's run |
| Every claim tested or computed; additions stated | **Pass** | `--code-text` and the label ink are stated in the report and included in `worstContrast` |

Same-rule exception: **S3-3** (the new Page dot's hover) is not B2's file, but it is a new indicator that violates B2's ratified 3:1-at-every-state rule. I did not audit every other indicator's hover state; the sweeping check is now a checklist line.

### P2 — release polish (`docs/reports/p2-polish.md`)

| Criterion | Result | Evidence |
|---|---|---|
| Selection bubble leaves the tree behind a modal and returns | **Pass** | `m3-reference` new case (`:957-1035`): 0 nodes while the reference dialog is open, returns on Esc; would fail on the old behaviour (the bubble stayed mounted) |
| Brackets by `event.code`; `⌃Tab` still works; both `list:false` | **Pass** | unit `shortcuts.test.ts:98-125` (also rejects the same character from another code); UI case in the Orchestrator's run; list probe shows `⌃Tab / ⌃⇧Tab` |
| `⌘P` opens Export PDF; `⇧⌘E` does not; menu/header/Settings agree | **Pass** | **probe:** `⇧⌘E` → `exportState.status = "idle"`; `⌘P` → `"configure"` with the active document, `Output …/Documents/Linear algebra.pdf`; Settings row `⌘P`; unit + menu equality |
| `Edit` has Find/Next/Previous, standard accelerators, gated behind a modal | **Pass** | unit `mirrors the Find menu items…` (labels, accelerators, `registerAccelerator:false`, click → command, position); `ui-overlay-command-gate` **7/7** (⌘P and the three Find commands change nothing behind Settings) |
| Rich-cell note lists as unreadable; opening refuses byte-identically; normal/inline unaffected | **Pass** | `library-rich-cell.test.ts` 3 tests: row `unreadable` + short line, recovery view with the raw sentence in details, **no lock file**, no dirty store, byte-identical `document.json`, one read per note per scan; `data-recovery` 4/4 (row + reason + recovery + inline `ok`); code path `library.ts:1496` before `:1499` |
| `⇧Esc` and `Esc` close the find | **Pass** | **probe:** `Shift+Escape` in the find field → `findOpen:false`, bar gone; unit pins the second chord on `close-find` only |
| The two intermittent suites pass 5× standalone with condition waits | **Pass** | builder's five-run logs; I re-ran both once at HEAD: `page-scroll` **8/8** 16.0 s, `m4b1b1` **10/10** 18.6 s. The new waits are conditions on the effect (reported zoom step, landed offset, travelled distance, overlay text), not longer sleeps; a broken PageUp/PageDown or a lost keystroke now fails loudly. No retry wrapper; neither is in `SERIAL_FILES` |
| No behaviour change beyond the items; no schema/page/print change | **Pass** | diff: no `packages/layout`/`packages/pdf`/schema/print file; `settingsVersion` stays 5; the product deltas are the six items plus `⌘P` |

Caveat recorded, not a finding: `m4b1b1`'s 300-block wall-clock bound moved 5 s → 15 s and the hard responsiveness gate is `tests/perf`, which is on-demand — hence it is a release-gate item in §5.

---

## 5. Release gate

**State** is as of this review at `6aa8d04`. "Not-run" means neither I nor the Orchestrator's quoted verify produced evidence; the Owner column says who must.

| # | Must be true at tag time | State | Owner |
|---|---|---|---|
| 1 | Full `npm run verify` at UI concurrency 4 on an idle machine, exit 0, 0 pageErrors, 170/1743 + e2e 16 + recovery 14 + UI 69/69 | **Pass** (Orchestrator's authoritative run; I did not re-run it) | Orchestrator |
| 2 | No S1/S2 finding in the candidate | **Pass** (this review) | Sentinel |
| 3 | Data-safety probes (save coordinator, drafts, conflicts, rich-cell refusal, corrupt settings, no-highlight byte identity) | **Pass** (targeted at HEAD) | Sentinel |
| 4 | The five batch acceptance lists | **Pass except B1's "one catalogue" row** (S3-1) | Orchestrator |
| 5 | S3-1…S3-4 and the two S4s fixed, or explicitly accepted and ticketed in `docs/plan.md` known issues | **Open** | Orchestrator (with the product owner for S3-3) |
| 6 | `docs/ux.md` §9/§12/F12 describe the shipped keys (**S3-4**) | **Fail** | Orchestrator (docs pass) |
| 7 | `npm run test:perf` — DoD: "Performance … every release" (300/1,000-block budgets, no >20 % regression) | **Not-run** | Orchestrator |
| 8 | `npm run test:visual` — DoD: "Visual … every release" | **Not-run** | Orchestrator |
| 9 | Real packaged build: `electron-builder` target, `asarUnpack` for `pdfjs-dist`, `.icns`, `productName`/`appId`, one version across workspaces (today `0.0.0-m2.2` root/desktop, `0.0.0-m2.1` core, `0.0.0-spike.1` layout/pdf), `npm run dist`/`release` | **Not-run** | Orchestrator |
| 10 | Packaged smoke on a clean machine: launch, open, edit, save, Export PDF (the in-repo `m4c3-packaged-export` stages `out/` + `pdfjs-dist`, it is not an asar/signed build) | **Not-run** (staged smoke is in the 69/69; real package not built) | Orchestrator |
| 11 | Code signing / notarization / first-run gatekeeper check (if distributed outside the dev machine) | **Not-run** | Orchestrator |
| 12 | Product-owner visual + VoiceOver pass: R3, shell polish, palette, sidebar, edges, status bars, Page/Settings, the anchor dot (hover/focus/60 % density, S3-3), the four code themes, the Edit menu, the Settings list glyphs | **Not-run** | Product owner |
| 13 | Product-owner PDF visual check | **Not-run** | Product owner |
| 14 | Native guest-file Save / Don't Save prompt manual check (recorded open decision since VH1) | **Not-run** | Product owner |
| 15 | Public-release name clearance or rename (an existing NoteForest app is known) | **Not-run** | Product owner |
| 16 | Decide v1 distribution scope (macOS only) and say so in the Release notes | **Not-run** | Product owner |
| 17 | Manual-break semantics before a mode-A callout (open product decision; no code blocker) | **Open decision** | Product owner |
| 18 | Close Window stays native like Quit (documented, not gated) | **Accepted** (already documented) | Orchestrator |

Release mechanics are the Orchestrator's item, as the brief says; they are listed here and **not** raised as findings.

### What I did not verify

- `npm run verify` itself, `tests/e2e`, `tests/recovery`, `tests/perf`, `tests/visual`, and the M4c3 50-page A4 gate — relied on the Orchestrator's quoted run or excluded as on-demand.
- A real two-process lock conflict and an external file change on disk (unit/in-memory coverage only); backup rotation/restore (recovery suite, not re-run).
- The native macOS menu rendered on screen (OS-rendered; unit JSON + the suite's menu clicks only), VoiceOver announcements, light theme visuals, and any Windows/Linux behaviour (v1 is Mac-first).
- Two Page tabs sharing the find registry; Page find-over-highlight precedence; drag-and-drop and the OS clipboard outside the suites (the clipboard is covered by the serialised suites).
- The product-owner's subjective visual judgement, screen recording, and the actual `.dmg`/notarized artifact.

---

## 6. What I would not ship

- **Nothing in the reviewed code.** The four S3s and two S4s are fix-before-tag *if* the release commit has room, otherwise ticket-and-ship: none of them changes a document, a page, a print record or a save.
- **Without an explicit owner decision:** the empty-child card (known issue 1). An empty child collapses to a handle and ports, so after leaving it the block cannot be found on the canvas (it remains reachable in the Outline). That is S2 severity by `docs/review-checklist.md` §9.1 (a core authoring flow becomes hard to reach), it is recorded and deferred by the product owner, and I am not overriding that decision — but it should ship as a *stated* known limitation, not silently.
- **As an unqualified "v1":** a tag with the §5 rows 7–11 still Not-run. A green `verify` proves the code; it does not prove the product, the package, the performance budgets or the paper on the owner's Mac.
- **With the S3-4 docs as they are** if the docs are read as the v1 keyboard reference: three of the lines are the only instruction a keyboard-only reader gets for paging and export, and they name keys that no longer work.

---

## Appendix — probe transcripts (abridged)

```
# 1. Escape with the find open inside Page Edit (S3-2)
PROBE before   {"findOpen":true,"findTotal":1,"overlay":0}
PROBE opened   {"findOpen":true,"overlay":1}
PROBE afterEsc {"findOpen":false,"findQuery":"symmetric","overlay":0,"findBar":0}

# 2. Settings list rows (B1) + ⌘P / ⇧⌘E + ⇧Esc (P2)
PROBE settings rows [{"id":"export-pdf","label":"Export PDF…","keys":"⌘P"},
 {"id":"tab-cycle","label":"Next / previous tab","keys":"⌃Tab / ⌃⇧Tab"},
 {"id":"reset-zoom","label":"Reset zoom","keys":"⌘0"},
 {"id":"highlight","label":"Highlight","keys":"⇧⌘H"},
 {"id":"page-step","label":"Previous / next page","keys":"⌘↑ / ⌘↓"},
 {"id":"page-commit","label":"Commit Page Edit","keys":"Esc / ⌘⏎"}]
PROBE settings total 34
PROBE shiftE  {"status":"idle", …}
PROBE metaP   {"status":"configure","documentTitle":"Linear algebra","outputPath":"/Users/luca/Documents/Linear algebra.pdf", …}
PROBE shiftEsc {"findOpen":false,"bar":0}

# 3. Page Edit keeps the F4b mark (F4b)
PROBE after toggle {"marks":["blue"]}
PROBE overlay      {"block":"bb3f29f9-…","marks":["blue"]}
PROBE saved highlight true "tone":"blue" typed true

# 4. Page keys (S3-4): 16 pages
PROBE pages {"count":16,"start":1,"afterAlt":1,"afterMeta":2}
```
