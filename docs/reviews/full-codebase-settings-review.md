# Review — full-codebase Sentinel + settings inventory

- **Reviewer:** Reviewer / Sentinel (independent)
- **Date:** 9 November 2026
- **Base:** `main` at M4d1/M4d2 integration (`53c7e49`; brief commit `1a83f2f`)
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-e621b03c-7f3e61e4c89ae052`
- **Branch:** `t3/e621b03c`
- **Head at review:** `1a83f2f` (docs brief); product code unchanged through `53c7e49`
- **Stack/PDF:** Electron + shared paginator + `printToPDF` (ADR-0001, ADR-0002)
- **Baseline:** full `verify` green at integration (`a4d142d`/`53c7e49`): 99 files / 982 unit tests, 37 UI suites / 129 tests, 16 critical e2e, 14 recovery, 0 pageErrors. I did not re-run the full verify (instructed not to).
- **Verdict:** **Request changes before the Settings/UI rework.** No S1. The merged PDF/density/export slice is accepted as shipped evidence; the S2s below are settings-model and app-surface defects that would be baked into the rework if it started now.

---

## 1. Scope and method

Reviewed:

- `packages/core`: schema v2, migrations, commands, persistence boundaries.
- `packages/layout`: Continuous layout, Page layout, `PageSettings`/`PageTheme`, density lens, packing/callout modes, paginator, page chrome, page edges/routing, print model inputs.
- `packages/pdf`: print model identity, page records, PDF inspection.
- `apps/desktop`: main (settings/session/library, export job/window/preflight, menu), preload, renderer (settings store/dialog, Page Read/Edit, Continuous editor, export flow/panel, design tokens, view state), shared contracts.
- Docs: AGENTS, spec v0.5, UX v1.5, ADRs 0001–0008, design tokens, settings/UI plans, post-page roadmap, M4c/M4d reports and reviews.
- Tests: unit settings/layout/print, UI density/export/Page suites, fixtures/labs.

Outside scope: `packages/api`/M5, external API implementation, UI rework implementation, and product-owner visual/VoiceOver judgement.

Method: read the full relevant code and docs, ran `npm run check:boundaries`, ran the layout `page-settings` unit suite on the current source, and ran two disposable layout probes under `artifacts/review-probe/` for density topology and the 60% projection. The probes use the layout package's estimator; real-DOM numbers in the review are the M4d1 suite numbers from the brief/report. No product code, tests, spec, UX, ADR, or plan were modified.

---

## 2. Findings

### 2.1 Summary

| ID | Severity | Area | Finding |
|---|---|---|---|
| S2-1 | S2 | App settings shell | Settings cannot open when no document is open. |
| S2-2 | S2 | Settings persistence | Per-document overrides are tied to open tabs and are lost after close/restart; key is a path. |
| S2-3 | S2 | Density | The 60–120% target is not representable; the 8 pt/150/280 floors make 60% non-proportional and page-count non-monotonic. |
| S2-4 | S2 | Density/topology | Density can change callout topology (A/B2/stacked), violating the stated density-only invariant. |
| S2-5 | S2 | Settings persistence | Settings writes are fire-and-forget with swallowed errors; corrupt settings silently reset and are overwritten; no schema version or backup. |
| S2-6 | S2 | Continuous settings | `ContinuousSettings.zoom` is dead and duplicated by the real view-state zoom, with different ranges. |
| S3-1 | S3 (P0) | Tokens/docs | Page/Continuous token ownership is mixed in code and docs; F7/F8/F9 remain; duplicated CSS fallback and a Continuous token leak into Page measurement. |
| S3-2 | S3 | Settings UI | The density dialog is a thin slice with no Page setup/preset/Continuous/manual breaks; the scope radio can pin an override; no preview/validation. |
| S3-3 | S3 | Typography | `fontScale`/`headingScale` multiply after the 8 pt floor and can break heading order. |
| S3-4 | S3 | Page setup | Impossible margins silently reset to 12 mm; zero margins collapse chrome over content; no warning. |
| S3-5 | S3 | Manual breaks | No UI and no delete/split/merge cleanup; stale hints only warn. |
| S3-6 | S3 | Export UI | Temporary panel/defaults: no default folder, no date filename, warning/detail truncation, raw codes, focus/overlap polish. |
| S3-7 | S3 | PDF metadata | PDF metadata is not set; default filename differs from spec. |
| S3-8 | S3 | Tests/evidence | Missing settings durability/no-doc tests; fixed sleeps in some UI suites; machine-local labs; M4c crash/redirect and 1,000-block gaps. |
| S3-9 | S3 | Docs | Spec v0.5/UX v1.5/design tokens/checklist still describe document page setup and old defaults. |
| S3-10 | S3/S4 | Dead code | Unused Continuous settings, Page CSS variables, `pxToMm`/`MM_PER_PX`, duplicated Page zoom clamps, stale comments. |

No S1 data-loss, corruption, security, or content-loss defect was found. Page Read/Edit/PDF identity and the produced-PDF checks are strong; no current path loses note content.

---

### S2-1 — Settings cannot be opened without an open document

**Evidence:** `apps/desktop/src/renderer/src/shell/Dialogs.tsx:94-104` returns a “No document open” frame for **every** dialog when `runtime === null`, before the `dialog.kind === 'settings'` branch at `:315-317`. The menu sends `settings` (`app/desktop/src/main/menu.ts:16-20`, `:174-177`) and the palette has a Settings entry (`actions.ts:1218`).

**Reproduction:** close all tabs, press `⌘,` or choose NoteForest → Settings…; the app shows “No document open”. Settings is a global surface (density defaults, library/app-data paths, future appearance/export defaults).

**Expected:** Settings opens with zero documents and applies to future documents.

**Actual:** core flow inaccessible; only an open document allows Settings.

**Direction:** move the settings branch ahead of the runtime gate, render a document-independent Settings section, and add a no-document UI test. If a subpage needs a document (per-document override), show it disabled with a reason.

---

### S2-2 — Per-document overrides die with the tab

**Evidence:** overrides live only in `SessionTabState` (`shared/api.ts:130-150`); the session writer serializes only open tabs (`state/session.ts:22-48`); the main process reads only tabs (`main/library.ts:1200-1239`); closing a tab removes it (`actions.ts:273-305`, `state/shell.ts:164-173`); the in-memory map is never persisted outside tabs (`state/settings.ts:118-127`).

**Reproduction:** open a document, set a per-document density (e.g. 80%), close the tab, quit, relaunch, reopen the document. The override is gone; the global default applies. Reopening in the same session still works, which hides the bug in casual testing.

**Expected:** a per-document personal override survives close/reopen and restart.

**Actual:** lifetime is the tab, not the document; a rename/move also loses the path key.

**Direction:** persist a document-settings map outside `SessionTabState` (keyed by canonical document id, with path fallback), migrate existing session tab overrides, define rename/move/delete behavior, and test close → quit → reopen.

---

### S2-3 — The 60–120% target is not representable; floors make 60% non-proportional and non-monotonic

**Evidence:**

- Current constants: `PAGE_DENSITY_MIN = 0.8`, `MAX = 1.2`, `STEP = 0.05` (`packages/layout/src/page-settings.ts:248-251`). The slider uses them (`Dialogs.tsx:2010-2012`); `normalizePageDensity` clamps to 0.8 (`:267-269`). A 0.6 value is silently raised to 0.8.
- Floors: body 8 pt, `minContentWidth` 150 px, `maxCardWidth` 280–560 (`:253-258`). At 60%, compact body is `max(8, 5.4) = 8` (same as 80%), while `maxCardWidth` is `max(280, 252) = 280` (vs 336 at 80%). The type does not shrink from 80% to 60%, but the card gets 16% narrower, so lines wrap more.
- Projected 60% (current floors, disposable probe): body 8, h1 11, code 7, card padding 4.8, max card 280, min content 150, child indent 21.2.
- Estimator pages at 60 vs 80/90/100: scale-300 36 / 33 / 36 / 36; showcase 24 / 23 / 23 / 23; stress 47 / 45 / 44 / 46. 60% is equal to or worse than 90/100 on all three and worse than 80 on showcase/stress.
- Real-DOM 80/90/100 from the M4d1 evidence: scale-300 **27/25/27**, showcase **18/19/21**, stress **30/30/35**. 90% is the safest dense step; 80% can be worse than 100% on width-capped single-line stacks.
- M4d1 itself listed the 80% behavior as a product decision (`docs/reports/m4d1-page-density.md:181-187`).

**Expected (product owner, 9 Nov 2026):** slider 60–120%.

**Actual:** 80–120 only; no 60% behavior exists. With the current floors, a pure range widening would produce a low end that is not proportionally smaller and can increase page count.

**Direction:** treat this as a density-model change, not a constant change:

1. Widen the range to 0.6–1.2 (normalize/step/UI/tests).
2. Decide the floor model at 60%: lower the body floor (e.g. 7–7.5 pt), lower the card-cap floor (e.g. 220–240), or accept “same 8 pt type, narrower cards”.
3. Re-run a **real-DOM** lab at 60/70/80/90/100/110/120 on scale-300/showcase/stress and record page count, whitespace, and line length.
4. Publish either a monotonicity promise or a guidance note (“90% is the safest dense step”; 60% may not reduce pages).
5. Keep Page/PDF parity and the 8 pt readability floor explicit in the UI.

This needs a product decision; do not change the slider alone.

---

### S2-4 — Density changes callout topology

**Evidence:** per-parent mode selection uses the placed parent width, the free right lane, and the mode min width (`packages/layout/src/layout.ts:544-577`); `calloutModes` is enabled whenever `pagePacking === 'beside'` (`page-settings.ts:471`); density scales the parent width/type but `calloutModeMinWidth` is not scaled, so the A/B2/stacked choice can flip. Probe on `fixtures/scale-300.json` / local showcase / local stress: stress at 110% is `mode A 5 / B2 0`; at 120% it is `mode A 4 / B2 1` (one parent flips A→B2). Scale-300 and showcase stay A/stacked in this probe.

**Expected:** review checklist §4.1 says a Page density change never changes callout topology (A/B2/stacked); only typography/spacing changes.

**Actual:** density can change callout placement/topology deterministically. No data loss and no crash; the page remains valid and Page/PDF agree.

**Direction:** product decision. Either:

- freeze/plan the callout mode from a stable 100% geometry and scale offsets, or
- accept that density may change placement, update the checklist/spec, label it in Settings, and add a test that records the allowed behavior.

Do not leave the invariant false while the UI exposes density.

---

### S2-5 — Settings persistence is not durable

**Evidence:**

- `persistAppSettings` calls `void bridge.saveSettings(settings).catch(() => undefined)` (`state/settings.ts:86-91`). The dialog immediately shows a success note (`Dialogs.tsx:1936-1950`, `:2069-2073`). A failed IPC/disk write is never surfaced.
- Main `writeSettings` clamps and writes atomically (`main/library.ts:1183-1189`), but there is no settings schema version, backup, or warning path.
- `readSettings` catches **every** error and returns defaults (`:1168-1176`). A corrupt `settings.json` silently resets preferences; the next Apply overwrites the corrupt file with defaults. Unknown fields are dropped by `normalizeAppSettings` + full rewrite.
- `setAppSettings` is a full-object replace (`state/settings.ts:109-116`). A partial caller resets unrelated globals to defaults.
- Two rapid writes are not serialized; an older `saveSettings` promise can land after a newer one and restore stale values.

**Reproduction:** make the app-support directory read-only or fill the disk, Apply a density change; the UI says saved, but relaunch returns the old value. Corrupt `settings.json`; Settings opens on defaults with no warning; the next Apply overwrites it.

**Expected:** a visible save failure, a preserved corrupt file + warning, a versioned migration path, and last-write-wins serialization.

**Actual:** silent loss/misleading success.

**Direction:** add a settings-write coordinator (serialized, error state), a `.corrupt` backup + user-visible warning, `settingsVersion` with pure migrations, and an explicit unknown-field policy. Test write failure, corrupt file, and unknown fields.

---

### S2-6 — Continuous settings are dead and duplicated

**Evidence:** `ContinuousSettings.zoom` is `1`, range `0.25–4` (`page-settings.ts:114-117, 709-723`); `continuousOverrides`/`setContinuousSettingsOverride`/`useContinuousSettings` have no app consumer (grep finds only the store, session serialization, and tests); the real editor uses `DocumentViewState.zoom` (`editor/DocumentEditor.tsx:610`) with range `0.5–2` (`shared/view-state.ts:50-60`). The session persists both (`state/session.ts:29-47`).

**Reproduction:** set `continuous.zoom: 4` in `settings.json`; the editor is unchanged. `⌘+` changes the per-document view zoom, not the global setting.

**Expected:** one continuous zoom source, with a clear global default vs per-document behavior.

**Actual:** two models with different ranges; one is dead. A future Settings control built on `ContinuousSettings.zoom` would do nothing.

**Direction:** choose one:

- keep per-document `DocumentViewState.zoom` and remove `ContinuousSettings` (and its overrides/serialization), or
- make `ContinuousSettings.zoom` the global default and seed view state only when a document has no stored zoom.

Do this before exposing Continuous settings. Add a test that a global default actually changes a new document.

---

### S3-1 — P0 token/document split is not done (F7/F8/F9 remain)

**Evidence:**

- `docs/design-tokens.md` is still one document for shell + layout engine. It lists Page-only values (`childIndent`, `childTrunkInset`, `calloutTrunkInset`, `calloutCardIndent`, `calloutRightGap`, `calloutModeMinWidth`, `minContentWidth`, `maxContentWidth`) beside Continuous values (`canvasMaxWidth`, `siblingGap`, `cardPadding`, etc.) and never documents `PageTheme` as a whole. Line 106 calls `maxWrapIndent` “cumulative”; the implementation is per-level (`layout.ts:355-370`). Line 107 says Continuous does not read `childIndent`, but `DEFAULT_LAYOUT_OPTIONS.childIndent = 26` (`types.ts:452-474`) makes the engine default read it. Line 114’s packing row and line 268–273’s “M6 token override” future model are stale vs ADR-0008.
- Legacy literals: `CALLOUT_ROW_INDENT = 26` (`layout.ts:149`), the 144 px readability floor and 16 px fallback in the legacy below-stack lane (`:1432-1435`).
- Duplicate compact fallback: `styles.css:4441-4468` repeats the `COMPACT_THEME` values; there is no guard.
- Cross-surface leak: `.nf-measure-card` uses the Continuous `--nf-child-max-width` 420 (`styles.css:4704-4706`), not the Page cap; Page layout reads the shell `--nf-card-radius` and uses `GEOMETRY.editorPaddingXMedium` for stage padding.
- Many `--nf-page-*` geometry variables are emitted (`page-settings.ts:495-528`) but never consumed by CSS or JS (max/min card width, sibling gap, indent/trunk/callout values); the CSS fallback block keeps a second copy.
- Stale type comment: `types.ts:467` still says “compaction for compact”; compact is `beside`.

**Expected:** Page tokens (PageTheme/Page setup), Continuous tokens (DESIGN_TOKENS/view state), and shared engine primitives (EDGE_STYLE) have separate namespaces and docs; no Page-only literal outside the Page token layer; docs match implementation.

**Actual:** ownership is mixed and docs would mislabel Settings controls (especially “maximum wrap indent” and “wrap vs child indent”). No current visual defect is proven; this is a P0 refactor before the UI.

**Direction:** split `docs/design-tokens.md` into Page tokens, Continuous tokens, and shared edge/chrome primitives; add a `PageTheme` table; rename or split `wrapIndent` (list indent vs wrapped child indent); fix the `maxWrapIndent` wording; move the measurement fallback to a Page cap; remove/generate the CSS fallback; replace `CALLOUT_ROW_INDENT`/144/16 with tokens or document them as legacy; add a guard test for the split. Make `DEFAULT_LAYOUT_OPTIONS.childIndent` equal `wrapIndent` (or explicitly document 26 as an engine default).

---

### S3-2 — The Settings UI is a thin slice with a scope trap

**Evidence:** `Dialogs.tsx:1909-2106` exposes only the density slider, scope radios, Reset/Apply/Cancel/Use-global, and library/app-data/theme info. There is no Page setup, preset, typography, margins, manual breaks, or Continuous section. `dirty` is computed from the scope-specific value (`:1929-1934`); switching to **This document** on a document with no override sets the draft to the global percent and marks `dirty` true (`:1985-1999`), so Apply creates an override identical to the global value and stops future global propagation. “Cancel” resets the draft but does not close the dialog (`:2051-2058`); “Done” closes without a dirty confirmation.

**Expected:** a document override exists only when the user changes a value; switching scope alone does not pin it. The UI plan (`docs/tasks/page-settings-ui-plan.md`) asks for separate Page/Continuous sections, presets, Page setup, preview, and per-group reset.

**Actual:** only density is editable; the scope trap is a real user footgun; the final structure is absent.

**Direction:** build the IA in inventory §15; track per-field overrides; do not create an override on scope switch; add preview and validation; keep explicit Apply/Cancel. This is UI rework, not a Sentinel code change.

---

### S3-3 — `fontScale`/`headingScale` bypass the floors

**Evidence:** `resolveTheme` clamps `fontScale` 0.5–2 and `headingScale` 0.5–2 (`page-settings.ts:600-601`). `effectivePageTheme` applies the 8 pt floor and heading-order floors (`:396-452`), but `pageCssVariables` multiplies the already-floored values by `fontScale`/`headingScale` (`:497-511`). With `fontScale: 0.5`, the compact body CSS is 4.5 pt; with `headingScale: 0.5`, H1 is 7 pt, below the 9 pt body. No test covers the down-scale path; tests use 1.1/1.2 up-scales.

**Expected:** the 8 pt/heading-order invariants hold end-to-end, or the scales are not exposed.

**Actual:** an advanced/custom value can violate the claimed readability floors; this is hidden today because no UI exposes the fields.

**Direction:** either clamp the final CSS sizes and heading order after scaling, or hide/remove `fontScale`/`headingScale` and keep density as the only type lever. Add tests at 0.5 and 2.0. If exposed, label them advanced and show effective values.

---

### S3-4 — Impossible margins silently reset; zero margins collapse chrome

**Evidence:** `sanitizeSetup` clamps margins 0–100 and, when the content area would be < 20 mm per axis, returns the default 12 mm margins without a warning (`page-settings.ts:555-578`). `pageChromeLayout` positions header/footer/ghost/continues as fractions of the margins (`page-chrome.ts:40-50`); with 0 margins the chrome sits at the content edge and can overlap the first/last content. There is no UI validation message.

**Expected:** invalid margins are explained and the user’s values are not silently replaced; valid 0 margins either hide chrome or are disallowed.

**Actual:** silent replacement or overlapping chrome depending on the input.

**Direction:** define a minimum margin that keeps the chrome band readable (or hide chrome below a threshold), return a validation result from setup normalization, show it in the UI, and test 0/2/20/100 mm and A5/Letter.

---

### S3-5 — Manual breaks have no UI or cleanup

**Evidence:** `manualBreakBeforeBlockIds` is stored per global/document (`page-settings.ts:110-112`), honored by the paginator with stale/unhonorable warnings (`paginator.ts:100-180`), and carried into the print fingerprint. ADR-0008 requires cleanup on delete/split/merge (`docs/adr/0008-personal-page-settings.md:95-103`), but no cleanup code or UI exists (grep finds only settings, paginator, and tests). There is no action to add/remove a hint.

**Expected (R3):** a user can add/remove a break, see stale/unhonorable warnings, and the settings layer cleans hints on delete/split/merge.

**Actual:** model + paginator only; feature not user-reachable.

**Direction:** R3/implementer brief; keep the ADR semantics, add stale filtering on load, tests for delete/split/merge, and a Page toolbar/context-menu entry. Do not make it canonical.

---

### S3-6 — Export UI is a temporary slice with product defaults still open

**Evidence:** `export-flow.ts:144-355` has one flow, save dialog, explicit overwrite, 120 ms polling, cancel, and typed failures; `ExportStatusPanel.tsx:39-220` is a fixed bottom-right non-modal panel. The save dialog suggests only `title.pdf` (`main/index.ts:532-540`); no default folder or date. The panel truncates warnings to 6 and error details to 8 with no “show all” (`:153-160, 197-207`), displays the raw error code in the header (`:192`), and has no focus management/Esc. The Page toolbar is six equal buttons on one rail (`PageView.tsx:878-904`); the export button caused the 960 px fit-page oscillation fixed temporarily by `flex-wrap: nowrap` (`styles.css:4762-4774`). The panel may overlap a sonner toast (M4d2 report risk).

**Expected:** final export surface with destination/filename, overwrite, progress, cancel, success/failure, all warnings, accessible focus; Page toolbar hierarchy that works at 960 px.

**Actual:** functional and well-tested temporary UI; product defaults and polish remain.

**Direction:** inventory §15.4/§11; decide default folder, date filename, overwrite policy, metadata, and final button hierarchy. Keep the engine untouched.

---

### S3-7 — PDF metadata and default filename differ from spec

**Evidence:** `pdfFileNameForTitle` returns `<title>.pdf` (`shared/export.ts:75-82`); spec §11.9 says `<document title> — <YYYY-MM-DD>.pdf` and metadata title/subject/creator/page size/date (`docs/spec.md:1800-1801`). The hidden print HTML title is “NoteForest print” (`apps/desktop/src/renderer/print.html:10`); `printToPDF` options do not set metadata (`export-preflight.ts:253-264`); `generateTaggedPDF` is false. M4c3 validated text/glyphs/fonts/page geometry, not metadata.

**Expected:** decide whether the spec metadata/filename is v1 or a docs sweep item; if v1, set the PDF title/creator and date-stamped default filename.

**Actual:** title-based filename, no explicit metadata. Not a correctness blocker for the PDF content gate.

**Direction:** product decision; add metadata/filename tests if required; otherwise update the spec in the R4 sweep.

---

### S3-8 — Test/evidence gaps and fixed sleeps

**Evidence:**

- No test opens Settings with no documents (S2-1), no test closes/reopens a document and checks a per-document override (S2-2), no test for settings save failure/corrupt backup/unknown fields (S2-5), and no test for the density topology invariant or 60% range (S2-3/S2-4).
- Fixed sleeps remain in several UI suites: `tests/ui/m4d1-page-density.test.mjs:168` (300 ms), `m4b1a2-read-mode-gating.test.mjs` 14 waits of 120 ms, `m4b1-page-view.test.mjs` 8 waits, `r2a-page-arrows-cleanup.test.mjs` 6 waits. They are “focus/settle” waits, but they are the exact kind of timing evidence the DoD forbids (`docs/definition-of-done.md:70, 376`).
- Labs depend on local machine paths (`density-lab.ts:38-39`, `layout-lab.ts:21`); the showcase/stress rows are skipped when absent.
- M4c3 closed S3-1…S3-8, but S3-4’s Electron crash/redirect path has no dedicated test and R9’s 1,000-block timing is a manual probe (`docs/reports/m4c3-pdf-gate.md:213-225`).

**Expected:** deterministic condition waits; settings durability tests; a committed 60% real-DOM lab; a reproducible fixture for showcase/stress or an explicit optional marker.

**Actual:** strong suite overall (99/982, 37/129, 16 e2e, 14 recovery; M4c3 61-page gate), but the new settings surface is under-tested and some waits can flake on slow CI.

**Direction:** add tests with the P0 fixes; replace sleeps with condition waits; commit a small showcase fixture or mark the lab rows optional; add the M4c S3-4 crash/redirect test when feasible; keep 1,000-block timing as a documented manual check.

---

### S3-9 — Docs are stale against ADR-0008 and the merged settings model

**Evidence:**

- `docs/spec.md:373-384` still puts `pageSetup` and `manualBreakBeforeBlockIds` in the document and says A4 fixed/20 mm defaults; `:514-516` says page setup and breaks are document settings. ADR-0008 makes them personal and code uses A4/A5/Letter + 12 mm.
- `docs/ux.md:322, 947-968` describes a document-level Page Setup and undoable page-setup changes; the current model is personal and not undoable.
- `docs/design-tokens.md` mixes Page/Continuous and still promises an M6 token-override settings model (`:268-273`).
- `docs/review-checklist.md`/`docs/definition-of-done.md` still cite spec v0.4.5/UX v1.4; AGENTS already records the pending docs sweep.
- The Help → Keyboard shortcuts menu opens Settings, not shortcuts (`menu.ts:174-177`); UX copy mismatch.

**Expected:** spec/UX v0.6/v1.6 and design-tokens reflect ADR-0008 before the Settings UI labels/defaults are built.

**Actual:** docs describe the old model; a Settings UI built from them would be wrong. AGENTS marks R4 as pending, so this is a known docs debt, not an unknown code regression.

**Direction:** R4 docs sweep after the P0 decisions; update the version headers, page setup model, defaults, and token doc. This review does not change spec/UX/ADR/plan.

---

### S3-10 — Dead/duplicated values and CSS surface

**Evidence:** see inventory §12. Highlights:

- `ContinuousSettings`/`useContinuousSettings`/`resolvedContinuousSettings` mostly unused (S2-6).
- Unused exports `pxToMm`, `MM_PER_PX`, `PX_PER_MM` (`page-settings.ts:307-316`).
- `--nf-page-*` geometry variables emitted but unused; `:root` fallback duplicates `COMPACT_THEME`.
- `PageView.tsx:81-84` duplicates `view-state.ts:56-60` zoom clamps.
- `DUP-13/14/15`: `maxWrapIndent` wording, engine `childIndent` default, “compaction for compact” comment.
- `DESIGN_TOKENS.wrapIndent` 18 is only re-exported into `GEOMETRY` and asserted in tests; no renderer consumer.

**Direction:** remove dead values, or wire them deliberately; add small guard tests (no dead page vars, no CSS fallback duplicate, one zoom clamp source).

---

### 2.2 S4 nits

- `pageSettingsFingerprint` includes manual-break array order although the paginator uses a set; sort it for a stable fingerprint (re-measure only today).
- Settings “Cancel” resets the draft rather than cancelling the dialog; “Done” closes without a dirty check.
- Help → Keyboard shortcuts opens Settings (also in S3-9).
- Export failure header shows the raw error code as the right-hand value.
- Page toolbar “Actual” is a text button beside “Fit page/Fit width”; final hierarchy belongs to the UI rework.
- `types.ts:467` still says “compaction for compact”; compact is `beside`.

---

## 3. Answers to the eight brief questions

### Q1 — Architecture and boundaries

**Pass with findings.** Core/layout/pdf are pure and have no reverse dependencies; `check:boundaries` reports 162 files / 798 imports / 16 rules. Core schema v2 correctly strips page/print fields (`migrations.ts:45-52`) and the renderer never writes page settings into `document.json`. The page model, measurement, Page Read/Edit, and print use one resolved settings object and one fingerprint; print-model identity is enforced before rendering (`printModel.ts:220-263`).

Findings: the settings subsystem has a dead Continuous branch (S2-6), the app-level Settings dialog is behind a document gate (S2-1), settings durability is weak (S2-5), and `packages/layout` now owns a CSS-variable/theme presentation map (`pageCssVariables`) in a pure engine package. The latter is a boundary smell, not a defect; document it or move the CSS map to a presentation adapter. `PrintModel` re-runs `paginate` for validation (not a second paginator); this is deterministic and accepted, with export-time cost.

### Q2 — Page/Continuous separation

**Request changes (P0).** Page and Continuous have separate objects (`PageSettings` vs `DESIGN_TOKENS`/view state) and Continuous never calls `layoutDocument`. But one `design-tokens.md` mixes both, Page measurement reads the Continuous `--nf-child-max-width`, Page cards read the shell radius, and three related indent values (26) have three owners. `maxWrapIndent` is documented as cumulative but implemented per level; `childIndent` is documented as Page-only but is the engine default. The split is the first UI-rework prerequisite (S3-1). Equal numbers across the namespaces are coincidental unless documented as shared primitives.

### Q3 — Settings correctness, persistence, merge, fingerprints, migration

**Model resolution: pass.** Normalization, preset switching, partial override retention, clamping, density range, and fingerprint inclusion are well tested (`page-settings.test.ts` 27 tests; `settings-store.test.ts`; `settings.test.ts`). Per-document overrides remain partial, so later global changes propagate. `effectivePageTheme` is single-path and idempotent; print requires the exact measured-run fingerprint.

**Persistence: request changes.** No settings schema version/migration/backup; corrupt settings silently reset and are overwritten; write errors are swallowed and success is claimed; writes are not serialized; per-document overrides are tab-scoped and path-keyed; `setAppSettings` replaces rather than merges. Migration needs are in inventory §14.

### Q4 — Density (M4d1)

**Core design: pass.** One density lens; Page Read/Edit, measurement, CSS, and print consume it; Page/PDF parity is tested at 80/120; body floor 8 pt, min content 150, card clamp 280–560 are explicit; no page-setup change; Continuous untouched.

**Product behavior: request changes.** (a) 60–120 target not supported; (b) 60% is non-proportional and projected to be equal/worse than 90/100; (c) 80% is real-DOM non-monotonic (27/25/27, 18/19/21, 30/30/35); (d) density can change callout topology (stress 110→120 A→B2); (e) `fontScale`/`headingScale` can bypass floors. The density slider is a tuning/product decision, not a crash; it must be decided before the Settings UI exposes presets/scale.

### Q5 — Export UI (M4d2)

**Pass for the temporary slice.** File menu (`⌘⇧E`), palette, and Page toolbar call one flow; no-document is a clear toast with no dialog; save cancel is safe; overwrite is explicit and engine-protected; progress/phase/cancel/error/preflight details work; it exports from Continuous without a mounted Page view; Page Edit commits before the snapshot (`App.tsx:217-231`); tests are condition-based (no sleeps) and use the dialog guard, not native dialogs. The panel is deliberately temporary and non-modal.

**Open:** default folder, date-stamped filename, final button hierarchy, warning/detail full list, focus/Esc/accessibility, panel/toast overlap, raw error codes. Product defaults are in inventory §11/§15.

### Q6 — PDF/print pipeline and leftovers

**Pass; no S1/S2.** M4c1's print model is complete and identity-bound; M4c2/M4c3 closed R1/R2, S2-1/S2-2/S2-3, R3–R10 and S3-1…S3-8 (folded or explicit); the 61-page A4 gate, text/glyphs/fonts, raster parity, A5/Letter smoke, packaged export, and 300-block timing pass. The main process validates summary shape/finite geometry, sender/package, required fingerprint, page size, blank pages, and model/segment coverage; output is temp→validate→atomic link/rename with source-package protection.

**Residual:** no dedicated Electron crash/redirect test for S3-4; 1,000-block timing is manual; PDF metadata/default filename differ from spec (S3-7); `layoutOptions` is still optional in the type though runtime rejects `undefined` (type-level hardening, S4); print re-paginates to validate (deterministic, accepted). No new PDF content defect found.

### Q7 — Tests/evidence/docs

**Strong overall, gaps concentrated in settings.** 99 files / 982 unit, 37 UI suites / 129 tests, 16 critical e2e, 14 recovery, 0 pageErrors at baseline. Unit coverage for settings normalization/merge/preset/density and print identity is good; M4d1/M4d2 UI suites are meaningful; M4c3 gate is strong. Missing: no-document Settings, per-document override lifetime, settings write failure/corrupt backup/schema migration, 60% density, density-topology invariant, fontScale down-scale. Fixed sleeps remain in some UI suites. Labs are machine-local for showcase/stress. Docs are stale (S3-9). The version headers in the checklist/DoD still cite older spec/UX.

### Q8 — UI rework input

**Summary:** build Settings as an app-level window that opens with zero documents; Page and Continuous sections; Page setup/typography/layout/breaks; explicit global vs document scope with partial overrides and override indicators; advanced disclosure for topology/engine values; explicit Apply/Cancel; live sheet preview; export sheet with destination/filename/date/overwrite/metadata; final Page toolbar hierarchy (nav / zoom-fit / setup / density / export / overflow); full state matrix (no doc, read-only, Page Edit open, invalid margins, corrupt settings, save failure, export states). Details: inventory §15. The current density dialog is not a foundation to extend; it is a probe.

---

## 4. Prioritized refactor/fixer brief for the Orchestrator

No implementation is part of this review. Suggested order, one brief per implementer.

### P0-1 — Settings durability + app-level reachability

**Covers:** S2-1, S2-2, S2-5.

- Move the Settings branch before the document gate; add a no-document Settings test.
- Add `settingsVersion` with pure migrations, unknown-field policy, corrupt-file backup + user warning, and a serialized write coordinator with a visible failure state.
- Persist per-document overrides outside `SessionTabState` (document id + path), migrate existing session overrides, define rename/move/delete behavior.
- Add tests: no doc, close→quit→reopen, write failure, corrupt file, unknown fields, partial update merge.

**Acceptance:** Settings opens with no document; a per-document density survives restart; a failed save is visible and does not claim success; a corrupt settings file is preserved and warned about; unknown fields follow the documented policy.

### P0-2 — Page/Continuous token split (docs + code)

**Covers:** S3-1, parts of S3-10.

- Split the token documentation into Page, Continuous, and shared primitives; add the full PageTheme table; remove the “M6 token override” text.
- Fix F7 (`DEFAULT_LAYOUT_OPTIONS.childIndent`), F8 (`maxWrapIndent` wording), F9 (legacy 26/144/16; Page-owned stem/trunk-gap/row-indent decision).
- Remove or generate the `styles.css` compact fallback; stop Page measurement from reading `--nf-child-max-width`; audit unused `--nf-page-*` variables.
- Rename/split `wrapIndent` (list indent vs child wrap); fix stale comments.
- Add a guard test for the Page/Continuous boundary.

**Acceptance:** no Page-only literal outside the Page token layer; docs and code agree on `maxWrapIndent`/`childIndent`; no duplicate compact fallback; the measurement host and page cards do not depend on Continuous tokens.

### P0-3 — Density 60–120 model and topology decision

**Covers:** S2-3, S2-4, S3-3 (if scales stay).

- Product decision on the 60% floor model and monotonicity promise.
- Widen the range to 0.6–1.2 (normalize, step, UI, tests).
- Re-run a real-DOM density lab at 60/70/80/90/100/110/120 on scale-300/showcase/stress; record page count, whitespace, line length.
- Freeze or explicitly allow density-driven topology changes; update the checklist/spec if allowed.
- Clamp or hide `fontScale`/`headingScale` after the final CSS multiplication.
- Add tests for the 60% floor, a topology invariant, and the fontScale down-scale.

**Acceptance:** 60% is representable and actually usable; the published page-count behavior matches the measurement; density never silently changes topology (or the change is labeled and tested); 8 pt is true in the rendered CSS.

### P0-4 — Single Continuous zoom source

**Covers:** S2-6.

- Keep per-document view zoom, or make `ContinuousSettings.zoom` the global default and seed new documents; remove the loser and its session/IPC path.
- Add a test that the global choice affects a new document and that a per-document zoom survives.

**Acceptance:** one zoom source; no dead settings field; UI can expose it honestly.

### P1-1 — Settings UI foundation (after P0)

**Covers:** S3-2, S3-4, UI input.

- Implement the inventory §15 IA; start with Page Setup + Typography + scope/override model; then Continuous; then Appearance/Export/Data.
- Fix the scope-radio trap; partial overrides; override indicators; per-group reset; live preview; inline validation; no-doc/read-only/Page-Edit states.
- Do not expose topology/engine internals without an Advanced decision.

**Acceptance:** all controls have a real consumer; global vs document is unambiguous; settings can be reached with no document; Apply/Cancel behaves; keyboard/VoiceOver pass; screenshots supplied.

### P1-2 — Manual breaks (R3)

**Covers:** S3-5.

- Add/remove/list hints in Page; honor/ignore explanation; delete/split/merge cleanup; stale filtering; tests.
- Keep hints personal, never canonical.

### P1-3 — Export UI final + PDF metadata/defaults

**Covers:** S3-6, S3-7.

- Final export sheet: default folder, filename/date decision, overwrite policy, all warnings, accessible focus, no raw codes.
- Decide PDF metadata/tagged output; implement or update spec.
- Keep the engine and the `printToPDF` contract unchanged unless a product decision requires it.

### P2-1 — Test and docs cleanup

**Covers:** S3-8, S3-9, S3-10, S4.

- Replace remaining fixed sleeps with condition waits.
- Commit a showcase/stress lab fixture or mark optional; add the 1,000-block timing note.
- Add the M4c S3-4 crash/redirect test if Electron allows it.
- R4 docs sweep: spec v0.6, UX v1.6, design-tokens split, checklist/DoD versions; fix Help → Keyboard shortcuts.
- Remove dead exports/CSS vars/comments; sort manual-break fingerprints (optional).

---

## 5. UI rework input (condensed)

The full control catalog is `docs/reviews/settings-inventory.md` §15. The essential decisions:

1. **Settings must be app-level.** A zero-document Settings window is the first acceptance test; per-document pages show disabled reasons instead of blocking the whole surface.
2. **Two sections, not one form.** Page (Setup, Typography, Layout/Advanced, Breaks) and Continuous (Zoom, future canvas/type). Do not share a preset, token list, or UI page.
3. **Scope at the top.** “All documents” / “This document”; partial overrides; override dots; per-group “Use global”; switching scope must not create an override.
4. **First-class vs advanced.** Size/orientation/margins, preset, density 60–120, body/heading size/line height, card width, spacing, export destination. Advanced: code/table/label/chrome sizes, min content width, max wrap, callout gap, card border, header/footer. Hidden: packing/callout modes, trunk/stem, `fontScale`/`headingScale` until fixed, timeouts, skin colors.
5. **Buttons.** Apply primary, Cancel secondary, Reset destructive with confirmation, Use global as a link, Done only on info pages. Stop using six equal buttons on the Page rail; use grouped icon/text controls with tooltips and an overflow at 960 px.
6. **States.** No document, read-only, Page Edit open (commit before settings/apply; keyboard path currently misses this), invalid margins, corrupt settings, save failure, density low-end warning, export running/cancelled/failed/done.
7. **Naming.** Page density, Page setup, Typography, Layout, Manual breaks, Continuous canvas, Export PDF; no internal token names.
8. **Cleanup before/while reworking:** dead Continuous zoom, duplicate CSS fallback, `wrapIndent` naming, `maxWrapIndent` wording, Page card radius/chapter gap ownership, unused Page CSS vars, raw export codes, Help menu label.

---

## 6. Checks run and evidence

| Check | Result |
|---|---|
| `npm run check:boundaries` | **Pass** — 162 files, 798 imports, 16 rules |
| Layout settings unit suite (`packages/layout/test/page-settings.test.ts`) | **Pass** — 27/27, current source |
| Density/topology probe (`artifacts/review-probe/density-probe.test.ts`) | Pass; scale-300/showcase/stress rows; stress 110→120 flips one callout A→B2 |
| 60% projection probe (`artifacts/review-probe/density-60-probe.test.ts`) | Pass; projected values and page counts (estimator; not real DOM) |
| Full `npm run verify` | **Not re-run** per brief; baseline from Orchestrator at `a4d142d`/`53c7e49` is 99/982, 37/129, 16 e2e, 14 recovery, 0 pageErrors |
| Native dialogs / screen recording | None used; no product UI was launched for this review |

**What I could not verify**

- Real-DOM density at 60%: the shipped code clamps at 0.8, so 60% numbers are an estimator projection from the current floor formulas. A real lab must follow the range change.
- The real Page toolbar/settings interaction at 960 px and VoiceOver: no product-UI change was made; product-owner visual/VoiceOver pass remains.
- Settings write failure/corrupt recovery in a packaged app: code-read only; tests are missing.
- Electron crash/redirect behavior for the hidden print window: no dedicated test at this base.
- 1,000-block export timing on target hardware: manual only in M4c3.

---

## 7. Open questions / risks

1. **Density 60%:** lower the type floor, lower the card floor, or accept “same type, narrower cards”? Is page-count monotonicity a product promise? This needs a product decision before P0-3.
2. **Density topology:** must callout mode stay fixed across density? If yes, freeze planning; if no, update the checklist/spec and label it.
3. **Page defaults:** 12 mm (code) vs 20 mm (spec/UX); A4 landscape default; header/footer behavior; chapter start.
4. **Per-document override identity:** document id vs path; rename/move/delete policy; persistence outside open tabs.
5. **Continuous zoom:** per-document view state only, or a global default? Remove the dead field either way.
6. **Appearance/light mode:** UX says available; no model. Scope it or update UX.
7. **Export:** filename date, default folder, metadata, tagged PDF, page range.
8. **Font/heading scale:** expose after final clamping, or hide.
9. **Docs:** spec/UX/design-tokens/checklist/DoD sweep must land before the UI copy is finalized; otherwise labels/defaults will be built on the old document-level model.
10. **Risk of starting UI now:** without P0-1/P0-2/P0-3, the UI will expose a dead Continuous zoom, a 60% control that cannot meet its promise, a scope trap, and a token model that labels the wrap cap incorrectly. The rework would likely be reworked again.

---

## 8. Handback

- **Verdict:** Request changes before the Settings/UI rework; no S1. The merged PDF/density/export slice is accepted as shipped evidence.
- **Deliverables:** this review and `docs/reviews/settings-inventory.md`.
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-e621b03c-7f3e61e4c89ae052`
- **Branch:** `t3/e621b03c`
- **Head at handback:** the commit containing these two docs (base `1a83f2f`; product code at `53c7e49`).
- **Not done:** no product-code/test/spec/UX/ADR/plan edits, no merge/push, no UI rework, no full verify re-run.
