# Review — targeted settings-schema freeze re-check

- **Reviewer:** Reviewer / Sentinel (independent)
- **Date:** 9 November 2026
- **Base:** `main` at `ca59fc5` (M4e3 docs; brief commit `ca59fc5`)
- **Worktree:** `a builder worktree`
- **Branch:** `t3/settings-freeze-sentinel-recheck`
- **Head at review:** `ca59fc5` (docs); product code unchanged since `3280422` / integration `4ad695e`
- **Stack/PDF:** Electron + shared paginator + `printToPDF` (ADR-0001, ADR-0002)
- **Baseline:** Orchestrator full `verify` green at `4ad695e`/`3280422`: **102 unit files / 1022 tests**, **38 UI suites / 133 tests**, **16 critical e2e**, **14 recovery**, **0 pageErrors**. I did not re-run the full verify (instructed not to).
- **Verdict:** **Frozen for design.** No S1 or S2 remains. S2-1…S2-6 and S3-1 are closed with code, tests, and UI evidence. The remaining findings are S3/S4 (UI-state polish, future-compat policy, docs sweep); none changes the settings schema, file formats, density model, or token ownership that the UI design needs.

---

## 1. Scope and method

Reviewed:

- `docs/reviews/full-codebase-settings-review.md`, `docs/reviews/settings-inventory.md`.
- The M4e1/M4e2/M4e3 reports and their task briefs.
- `packages/layout/src/page-settings.ts`, `types.ts`, `layout.ts`, `page-chrome.ts`.
- `docs/design-tokens.md`, `docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`.
- `apps/desktop/src/shared/settings-file.ts`, `shared/document-settings.ts`,
  `main/document-settings.ts`, the settings/session sections of `main/library.ts`,
  `state/settings.ts`, `shell/Dialogs.tsx`, `page/measurement.ts`, `styles.css`.
- Settings/density/token/PDF unit and UI suites.
- `docs/review-checklist.md`, `docs/definition-of-done.md`.

Method: read the relevant code and docs end to end, reproduced the key paths with the shipped
tests, inspected the Settings dialog DOM/state, and checked the docs against the source constants.
I made no product-code, test, spec, UX, ADR, or plan changes. I updated the inventory and the
checklist/DoD rules this review is allowed to maintain.

### Checks run (targeted, on this worktree)

| Check | Result |
|---|---|
| `npm ci` + `npm run build` | Pass (clean install from the lockfile; renderer/main build) |
| `npm run check:boundaries` | Pass — 165 files, 811 imports, 16 rules |
| Targeted unit: page settings, density lab, density topology, settings file, document settings, settings store, token guards, print parity, page model | **Pass — 9 files / 101 tests**, 404 ms |
| `node --test tests/ui/m4e1-settings-platform.test.mjs` | **Pass — 4/4**, 17.8 s |
| `node --test tests/ui/m4d1-page-density.test.mjs` | **Pass — 3/3**, 18.1 s (7-step real-DOM lab) |
| `node --test tests/ui/m4c2-pdf-export.test.mjs` | **Pass — 8/8**, 14.9 s (PDF parity at 60/120) |
| Full `npm run verify` | **Not re-run** per brief; baseline above |

No pageErrors in the UI suites (each suite asserts this). No native dialogs, fixed sleeps added, or
screen recordings were used.

---

## 2. Closure table

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| **S2-1** | Settings opens with zero documents; global controls usable; per-document controls disabled with a reason; ⌘, and palette. | **Closed** | `Dialogs.tsx:96-101` puts the `settings` branch before the `runtime === null` gate; `SettingsDialog` (`:1912`) is document-independent. The UI test launches with zero tabs, opens Settings with ⌘,, applies a global 85% density, reopens from the palette, and sees a later document inherit it (`tests/ui/m4e1-settings-platform.test.mjs:129-184`). The document scope is disabled and the reason is rendered (`Dialogs.tsx:2167-2191`). |
| **S2-2** | Durable per-document overrides: close/quit/reopen, id-first/path fallback, migration, rename/move, delete orphan rule. | **Closed** | Durable map in `app-support/document-settings.json` (`shared/document-settings.ts:1-217`, `main/document-settings.ts:1-210`). Identity is id first, then a path-only entry (`findDocumentSettingsEntry`); rename/move re-keys (`adoptDocumentSettingsEntry`, wired in `App.tsx:138-142` and `actions.ts:133-143`). Legacy session overrides are read once and migrated (`main/library.ts:1344-1423, 1467-1481`). Delete leaves an id-keyed orphan that cannot match another document (`shared/document-settings.ts:10-15`; test `apps/desktop/test/document-settings.test.ts:80-102`). The UI test sets an 80% document override, asserts the id-keyed file, closes the tab, quits, relaunches, reopens the package, and sees 80% (`m4e1…:186-284`). |
| **S2-3** | Density 60–120, 7 pt/240/140, floor-anchored curve, 60% densest, Page/PDF parity, 85–95% trade-off recorded, no stale 8 pt row. | **Closed** | Constants `page-settings.ts:246-259`; lens `:404-476`; `normalizePageDensity` snaps to 5% (`:268-272`). Tests: `packages/layout/test/page-settings.test.ts`, `density-lab.test.ts` (strict monotonicity, 60% body 7, 80% body 8, 60% card 252), `density-topology.test.ts`. Real DOM (re-run): scale-300 60% **24** pages / 7 pt / 4.8 px, 80% 27, 90% 27, 100% 27; the full 7-step table matches M4e2. PDF parity at 60/120 passes (`m4c2` 8/8). The 85–95% curve trade-off is recorded in the frozen inventory §7 (90% is 8.5 pt; page counts moved 27/19/32 on scale-300/showcase/stress). |
| **S2-4** | Adaptive A/B2/stacked topology tested/documented; preset remains density-only. | **Closed** | The geometric per-parent mode is unchanged (`layout.ts` mode gate; `page-settings.ts:493-498`). `density-topology.test.ts` records A at 60–100% and B2 at 110–120% and proves the R2j geometry after the flip. Both presets use `beside`; Comfortable is density-only (`page-settings.ts:172-217`). The Page token doc states density may change wrapping/topology and why (`design-tokens-page.md:104-109, 127-147`). I corrected the stale §4.1 checklist rule in this review (see §5). |
| **S2-5** | Serialized/versioned/corrupt-safe writes, visible failure, unknown fields, no fire-and-forget. | **Closed** | `settingsVersion: 2` + pure migration (`shared/settings-file.ts:24-85`); unknown top-level/nested fields preserved on write (`:94-123`); corrupt file copied to `settings.corrupt-<timestamp>.json` before any write (`main/library.ts:1213-1258`); serialized atomic writes in main (`:1282-1312`) and renderer (`state/settings.ts:188-255`); the dialog waits for the write before saying “saved” and shows a retryable error (`Dialogs.tsx:1954-2045`); partial global merges use `updateAppSettings` (`state/settings.ts:288-293`). Tests: `apps/desktop/test/settings.test.ts:39-191` (missing/corrupt/migration/unknown/newer/failure/rapid), `settings-store.test.ts:201-278` (not saved before resolve, failure/retry, serialized), and the UI corrupt/failed-write cases (`m4e1…:286-347`). |
| **S2-6** | Dead Continuous zoom removed; per-document view zoom works. | **Closed** | `AppSettings` is `{ page }`; `ContinuousSettings` and its override/normalizer/session path are gone (`page-settings.ts:118-125`; `page-settings.test.ts:200-209`). The only Continuous zoom is `DocumentViewState.zoom` (`shared/view-state.ts:50-55`) used by the editor. The UI test presses ⌘= in Continuous, asserts zoom 1.1 for the document, and asserts `settings().app.continuous === undefined` (`m4e1…:193-198`). |
| **S3-1** | Page/Continuous token/docs split, legacy literals/fallback removed, measurement cap, guards, behavior unchanged. | **Closed** | `design-tokens.md` is an index; Page and Continuous docs are separate (`design-tokens-page.md`, `design-tokens-continuous.md`). `CALLOUT_ROW_INDENT` is gone; 144/16 are named legacy oracle constants (`layout.ts:156-162`). The compact CSS fallback is deleted; `.nf-measure-card`/`.nf-measure-settle` use `--nf-page-max-card-width` (`styles.css:4679-4707`). `pageCssVariables` emits exactly the 16 consumed keys (`page-settings.ts:513-548`). `maxWrapIndent` is per-level and `childIndent` is a named engine fallback (`types.ts:455-476`). Guards: `apps/desktop/test/page-token-guards.test.ts` 12 tests. Behavior: the re-run 100% real-DOM row is unchanged (27/21/35) and the Page/PDF suites pass. |

No S1, no open S2.

---

## 3. Frozen model (design-ready summary)

The full value catalog is `docs/reviews/settings-inventory.md` (frozen state). The design can rely on
this model without waiting for another schema change:

```text
settings.json (settingsVersion: 2)
  page: PageSettings
    setup: A4 | A5 | Letter, portrait | landscape, 12 mm margins
    theme: PageTheme (compact | comfortable | custom; density 0.6–1.2)
    manualBreakBeforeBlockIds: string[]

document-settings.json (version: 1)
  entries: [{ documentId | null, packagePath, page?: PageSettingsOverride }]
  identity: document id first, path-only fallback; rename/move re-keys
  durable outside the tab/session; close/quit/reopen preserves it

shell-session.json
  view state only (layout, interactionMode, currentPage, pageZoom, pageFit,
  zoom, scrollTop, selectedBlockId, collapsed)
  no pageSettingsOverride / continuousSettingsOverride

document.json (schema v2)
  no pageSetup / manualBreakBeforeBlockIds / viewState
```

- **One resolution path:** `mergePageSettings(app.page, override(doc))` →
  `effectivePageTheme` (density lens, once) → `pageLayoutOptions` / `pageCssVariables` → Page
  Read/Edit, measurement, PDF. The fingerprint includes setup, stored theme, manual breaks, and the
  effective theme (`page-settings.ts:348-356`).
- **Density:** 60–120%, step 5, default 100; body floor 7 pt, `minContentWidth` floor 140,
  card-cap floor 240 (ceiling 560); floor-anchored type curve below 100%; 60% is the densest step;
  above 100% type/boxes scale proportionally. Page and PDF share the same effective theme.
- **Topology:** density may change a parent's A/B2/stacked mode through the geometric rule. This is
  the ratified 9 November 2026 decision; a preset change remains density-only.
- **Continuous:** no separate Continuous settings namespace in v1. Continuous zoom is per-document
  view state (0.5–2). Canvas/type/spacing settings are future work.
- **Tokens:** Page owns `PageTheme`/`PageSetup`/density/topology/chrome/route/CSS; Continuous owns
  its shell tokens and view state; `EDGE_STYLE` and the 4 px card radius are shared primitives.
- **States the design must handle:** no document (Settings usable; document controls disabled with a
  reason), corrupt `settings.json` (warning + backup + reset), unreadable settings (warning, no
  false save), newer settings schema (read + warn, never downgrade), failed write (visible error +
  Retry, no “saved”), corrupt `document-settings.json` (warning; writes refused), Page Edit open
  (commit before applying geometry/density), invalid margins (the current code still silently
  resets — the UI design owns the warning), and manual-break stale/unhonorable warnings.

**What the design owns:** IA/menus, which fields are first-class vs Advanced vs hidden, the
global/document scope control and override indicators, preview/validation, Apply/Cancel semantics,
state copy, button hierarchy, export defaults, manual-break entry, appearance, and the final
settings recovery actions. The frozen inventory marks every value as **F** (frozen),
**FH** (frozen but hidden), **ENG/E** (engine constant), **DES** (design decision), or **X**
(cleanup).

**What can still change after the design starts:** only a new field that the product explicitly
decides to add, which requires a `settingsVersion` bump and a pure migration. The current fields are
stable; the design does not need a placeholder for “maybe density changes”.

---

## 4. Remaining findings

No S1 or S2. The following are S3/S4 and do **not** block the design freeze. They are ordered by
what the UI rework should address first.

### S3-1 — `fontScale`/`headingScale` still bypass the floors (hidden)

`resolveTheme` clamps both to 0.5–2 (`page-settings.ts:620-621`), `effectivePageTheme` floors the
type sizes, and `pageCssVariables` multiplies the already-floored sizes by them
(`:528-542`). At `fontScale: 0.5` the compact body renders 3.5 pt at 60%; at `headingScale: 0.5`
headings can fall below the body. No UI exposes these fields, so the default density path cannot
break the floor. **Action:** keep them **hidden** in the Settings design until the final clamp (or
remove them and keep density as the only type lever). Add down-scale tests before exposing. This is
the old S3-3, still open and explicitly hidden in the frozen inventory.

### S3-2 — The density scope control can still pin an override equal to the global value

In `Dialogs.tsx`, `dirty` treats “no document override” as `-1` (`:1945-1946`), and switching to
“This document” seeds the draft with the global percent (`:2174-2177`). On a document with no
override, the scope switch marks the form dirty and Apply calls `withPageDensityOverride(undefined,
density)`, creating an explicit density override identical to the global value. That stops future
global propagation until the user chooses “Use global density”. “Done” also closes without a dirty
confirmation. This is the known S3-2 remainder, not a schema defect; the final Settings IA must fix
it (no override on scope switch, per-field override tracking, explicit Apply/Cancel). Do not design
around the current dialog as if it were the foundation.

### S3-3 — Corrupt `document-settings.json` has no in-app recovery

`readDocumentSettingsFile` preserves the file and reports `corrupt`/`unreadable`
(`main/document-settings.ts:85-115`), and `saveDocumentSettings` refuses to write so it cannot
silently replace the map (`:156-171`). Settings shows a warning and Dismiss only
(`Dialogs.tsx:2104-2134`); there is no reset/restore action. A user with a damaged map cannot change
per-document settings until the file is repaired outside the app. **Action:** design a recovery
action (reset the map, keep the backup) in the Settings data/recovery state. No note content is at
risk.

### S3-4 — `document-settings.json` drops unknown entry fields and has no migration chain

The global file preserves unknown fields and has a versioned migration (`settings-file.ts`). The
durable map normalizes each entry through `normalizePageSettingsOverride` and serializes only known
fields; `version: 1` is written but never read/migrated (`shared/document-settings.ts:65-115`). A
future field would be dropped by an older build on the next write. This is a future-compat gap, not
a current data-loss defect. **Action:** document the map’s unknown-field policy and add a version
check/migration when the first new field is added (likely a `document-settings` version 2).

### S3-5 — A legacy session override can be lost if the map is corrupt at migration time

`migrateLegacySessionOverrides` returns the migrated entries in memory but refuses to write when the
map is corrupt (`main/document-settings.ts:184-205`). The session is later rewritten without the
legacy field, so a pre-S2-2 override can disappear after the next quit. The override still applies
for the current run and no note content is affected. **Action:** either keep the legacy field in the
session until the map write succeeds, or include this in the recovery design. Narrow (requires a
simultaneously corrupt map).

### S3-6 — ADR-0008 still describes `ContinuousSettings`

The ADR’s model still lists `continuous: ContinuousSettings`, `continuousOverride`, and a
Continuous zoom setting (`docs/adr/0008-personal-page-settings.md:45-57, 83`). M4e1 removed that
field and made Continuous zoom per-document view state. This is docs drift, not a code defect; the
ADR needs an amendment (or a short superseding note) in the R4 docs sweep. I did not edit the ADR
(not allowed by this brief).

### S3-7 — Spec/UX still describe the old page-setup model and defaults

`docs/spec.md:373-384, 514-517` puts page setup and manual breaks in the document, fixes A4, and
uses 20 mm margins; `docs/ux.md:322, 568` says page setup is document-level and comes from the
document. The code is schema v2 + personal settings + 12 mm. AGENTS already records the R4 docs
sweep as pending. The design must not copy the old “20 mm document setting” wording; the frozen
inventory is the current source.

### S3-8 — Help → Keyboard shortcuts still opens Settings

`main/menu.ts:170-177` sends the `settings` command for the “Keyboard shortcuts” item. This is the
known menu/copy mismatch; the final menu design owns it. Not a settings-model issue.

### S3-9 — A fixed 300 ms sleep remains in the new no-document Settings suite

`tests/ui/m4e1-settings-platform.test.mjs:63` waits 300 ms after ⌘K before waiting for the palette.
The DoD forbids fixed sleeps (`definition-of-done.md:70`); a condition wait is sufficient. The suite
is green and not flaky here, but it is the exact pattern the earlier review flagged. Replace with
`waitForSelector('.nf-palette')` only.

### S3-10 — Rename/move is unit-tested but not exercised end to end

The identity rules and adoption are tested (`document-settings.test.ts:37-102`,
`settings-store.test.ts:88-104`), and the wiring is in `App.tsx`/`actions.ts`. The UI test covers
close → quit → reopen at the same path, not a rename/move on disk. Add one E2E rename (move the
package, reopen, assert the override) when the UI suite next changes; not a freeze blocker.

### S3-11 — Cleanup leftovers (documented, not blocking)

- Page zoom clamps are duplicated in `PageView.tsx:82-84` vs `view-state.ts:56-60`; import one
  source.
- `DESIGN_TOKENS.wrapIndent`/`GEOMETRY.wrapIndent` (18) is reserved and has no Continuous consumer
  (`design-tokens-continuous.md:68-71` documents it). Keep it reserved or remove it.
- `pageCssVariables` lives in the pure layout package (`page-settings.ts:513-548`); the Page doc
  documents the contract. Moving it to a presentation adapter is optional.
- `pageSettingsFingerprint` still includes manual-break array order although the paginator treats it
  as a set (`:348-356`); sort it for a stable fingerprint (S4; re-measure only).
- `settings-file.ts:97` has a formatting glitch (function body opening on the same line). Cosmetic.

### S3-12 — Impossible margins still reset silently; zero margins can collapse chrome

`sanitizeSetup` clamps margins 0–100 and, when the content area would be under 20 mm per axis,
returns the default 12 mm without a warning (`page-settings.ts:575-598`). `pageChromeLayout`
positions header/footer/ghost/continues as fractions of the margins (`page-chrome.ts:40-50`), so a
valid 0 mm setting can put chrome on the content edge. This is the old S3-4; M4e1–M4e3 did not
change it. The design owns an inline validation/warning and the minimum-margin or chrome-hide rule.
No content is lost.

### S4 — UI-rework polish already tracked

The density dialog is still the temporary M4d1 thin slice: no Page Setup, presets, typography,
manual breaks, preview, or validation; “Cancel” resets the draft instead of cancelling; “Done”
closes without a dirty check. The export panel is also still the temporary M4d2 slice (folder/date/
metadata, all warnings, focus). These are the original S3-2/S3-5/S3-6/S3-7 items and belong to the
design, not the schema.

---

## 5. Docs updated by this review

- `docs/reviews/settings-inventory.md` — replaced with the frozen-state inventory: `settingsVersion:
  2`, the durable document map, no `ContinuousSettings`, the no-document/write/corrupt contract,
  density 60–120/7/240/140, the floor-anchored curve, adaptive topology, M4e3 token ownership,
  closed duplicate/missing/migration rows, and the remaining design/engine/hidden markers.
- `docs/review-checklist.md`:
  - §4.1 density rule now matches the ratified adaptive topology (a density change may move a
    parent A/B2/stacked; Page Read/Edit/PDF must agree and the behavior must be tested). This
    resolves the contradiction with §7.1.
  - §7.1 floor rule now says the preset/density path is floored at 7 pt and that
    `fontScale`/`headingScale` stay hidden until the final clamp; the old “after every
    scale/override” wording was false for the hidden scales and custom below-floor values.
  - §7 data rule no longer claims 20 mm document-level margins; it uses the resolved personal page
    setup.
  - Added the durable-map rule: a per-document settings store is versioned, corrupt-safe, and has a
    documented unknown-field policy, like the global file.
- `docs/definition-of-done.md` §3.9 now distinguishes the document schema (refuse a newer version)
  from the personal settings schema (read + warn, preserve the version, never downgrade) and
  requires the durable per-document map to follow the same corrupt/serialized policy.

I did not edit product code, tests, spec, UX, ADR, plan, or AGENTS.

---

## 6. Open design decisions (not schema blockers)

1. **Page defaults:** code is A4 landscape / 12 mm; spec/UX say 20 mm and describe document-level
   setup. Confirm 12 mm and the default orientation before the Setup copy is finalized.
2. **Density presentation:** label 60% as the 7 pt dense-print floor and 70% as the gentler dense
   step (the old “90% is safest” advice is not supported); decide whether the UI shows a slider
   only, presets, or both.
3. **Typography exposure:** body/heading/code/table sizes and line heights (Advanced) vs density as
   the single lever; `fontScale`/`headingScale` stay hidden until fixed.
4. **Override semantics:** no override on scope switch; per-field override dots; “Use global” per
   field/group; explicit Apply/Cancel.
5. **Manual breaks:** entry point (Page toolbar, block context menu, or both) and the delete/split/
   merge cleanup that is still missing.
6. **Corrupt settings recovery:** global reset exists; the per-document map needs a reset/restore
   action and copy.
7. **Page chrome:** header/footer/page-number toggles, chapter-start behavior, and the final Page
   toolbar hierarchy.
8. **Export defaults:** default folder, `<title>.pdf` vs date-stamped filename, PDF metadata,
   tagged PDF, page range.
9. **Appearance:** dark-only v1 or light/system in this rework; no `AppSettings` field exists.
10. **Continuous:** no settings namespace in v1; decide whether a future global zoom/canvas default
    is worth a new field and migration.
11. **Shortcuts/autosave:** configurable single-key shortcuts and autosave interval are UX asks with
    no schema fields; decide in/out of this rework.
12. **Callout topology copy:** density may move a callout from the right lane to below; decide
    whether the Settings UI needs a one-line explanation (the model is frozen adaptive).
13. **Menu copy:** Help → Keyboard shortcuts should not open Settings.

---

## 7. What I could not verify / residual risks

- **Full `npm run verify`:** not re-run (brief). The Orchestrator baseline is green; my targeted
  unit/UI/PDF runs also pass.
- **Rename/move end to end:** identity rules and adoption are verified by unit tests and code
  reading; no UI test moves a package on disk (S3-10).
- **VoiceOver/visual judgement of the no-document Settings surface:** not performed; the product
  owner owns the visual/VoiceOver pass. A no-document screenshot exists in the M4e1 artifacts, not
  committed.
- **Settings write failure in a packaged app:** the UI test makes app-support read-only and sees the
  error/retry; I did not repeat it in a packaged build.
- **Newer-schema and corrupt-map warnings in the Settings UI:** the file behavior is unit-tested,
  but the dialog's `newer` and `document-settings` warning branches are not exercised by a UI test.
  Code-read only; add them when the final recovery UI is built.
- **External corruption between a successful read and a write:** `readRawSettingsForWrite` falls
  back to the last parsed object and can overwrite a file corrupted in that window without a new
  backup. Narrow; a code-read observation, not reproduced.
- **Document-settings map compatibility:** the file version is written but not yet migrated; adding
  a field later needs a version 2 policy (S3-4).
- **The 1,000-block performance and product-owner PDF/Notability checks** remain outside this
  freeze (already tracked).

---

## 8. Handback

- **Verdict:** **frozen for design**; no S1/S2; S2-1…S2-6 and S3-1 closed; S3/S4 follow-ups listed
  above.
- **Deliverables:** this review, `docs/reviews/settings-inventory.md` (frozen), and the
  checklist/DoD rule updates.
- **Worktree:** `a builder worktree`
- **Branch:** `t3/settings-freeze-sentinel-recheck`
- **Head at handback:** the commit containing this report and the inventory (base `ca59fc5`).
- **Not done:** no product-code/test/spec/UX/ADR/plan edits, no merge, no push, no PR, no full verify
  re-run.
