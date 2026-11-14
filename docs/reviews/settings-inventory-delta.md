# Settings inventory — post-freeze delta

**Status:** Post-freeze delta to `docs/reviews/settings-inventory.md` (frozen 9 November 2026,
base `ca59fc5`). The frozen catalog stays the reference for every value it already contains; this
document records **only** what the R2/R3/R4/R6, library/lifecycle, and special-text blocks added
after it. Do not read this as a new freeze review.
**Owner:** Reviewer / Sentinel.
**Date:** 14 November 2026.
**Base:** `main` at `58a9b6a` → code head `2988d2b` (`settingsVersion: 5`).
**Companion:** `docs/reviews/post-settings-library-special-text-review.md`.

**Legend (same as the frozen inventory):** **U** first-class control; **A** advanced; **H** hidden;
**E/ENG** engine constant; **P** print-only; **DES** design decision; **G** global; **D** per-document
override; **V** view state; **C** canonical document; **F** frozen schema/value; **FH** frozen but
hidden. A post-freeze value is marked **Implemented** when the field is stored and schema-bearing
(a field rename/removal or a semantic change needs a `settingsVersion` bump and a pure migration) and
**DES** when the value is still a product/visual decision.

---

## 0. Summary

- `settingsVersion` moved **2 → 5**: v3 added `appearance`, v4 added `export`, v5 added the global
  `continuous` canvas namespace. The v1→v2 removal of the dead `continuous.zoom` stays first in the
  chain. No canonical document schema change: `document.json` stays **schema v2**.
- Four new global namespaces are now stored: **Page chrome** (also a per-document partial override),
  **Appearance**, **Export**, **Continuous**. All are additive; a missing block normalizes to the
  product defaults; unknown keys are preserved on write at every level; the version is never lowered.
- The per-document map (`document-settings.json`, version **1**) gained the partial `page.chrome`
  override. No new per-document namespace: appearance, export, and continuous are global only.
- The **settings shell** (1180 × 820, nav 184, pane 536 max, rail `clamp(320px, 34%, 400px)`) is UI
  chrome, not a setting. The value audit's radius/pane/card-padding work remains a visual pass.
- The biggest post-freeze *engine* changes are not settings: the fixed Page edge corridor
  (18 px: lead 4 + stem 14, sibling gap 18, child indent 26, callout card indent 38, callout gap 16,
  callout right gap 24, trunk insets 12/24), the paper-centered page number, and the code-font/print
  identity. They are recorded in §3 because a future Settings page must not expose them as knobs.

---

## 1. Schema history (post-freeze)

| Version | Added | Migration | Notes |
|---|---|---|---|
| 2 | (frozen baseline) | — | `page` setup/theme/density/manual breaks; the frozen 9 Nov inventory. |
| 3 | `appearance` (R3) | Pure v2→v3: defaults when absent; unknown top-level/page/appearance keys survive | The shell-only values; the code font later joins the print identity. |
| 4 | `export` (R4) | Pure v3→v4: `export.folder: null` when absent; unknown keys survive | Global only. |
| 5 | `continuous` (R6) | Pure v4→v5: the R6 defaults when absent; legacy v1 `continuous.zoom` removed first; unknown keys at `continuous`/`spacing`/`arrows`/`widths` survive | Defaults equal the pre-R6 canvas tokens, so a migrated file draws the same canvas. |

File contract (unchanged otherwise): `settings.json` + `document-settings.json`; corrupt/unreadable
files are copied aside and warned about, never silently reset; an explicit reset/restore is the only
path that replaces a corrupt map; writes are serialized and atomic; the UI never reports saved before
the main-process write. See the frozen inventory §2–§3 and the Wave 1 recovery report.

---

## 2. New namespaces and values

### 2.1 Page chrome (R2)

Model: `packages/layout/src/page-settings.ts:131-195`, `280-293` (`PageChrome`, `DEFAULT_PAGE_CHROME`,
`PageSettings.chrome`, `PageSettingsOverride.chrome`).

| Field | Stored at | Scope | Values / default | Status |
|---|---|---|---|---|
| `page.chrome.header` | `settings.json` (global) and `document-settings.json` `page.chrome` (per-document partial) | **G + D** | `none` / `document` / `chapter`; default **`document`** | Implemented; default ratified by R2. |
| `page.chrome.footer` | same | **G + D** | `none` / `document` / `chapter`; default **`chapter`** | Implemented; default ratified by R2. |
| `page.chrome.pageNumber` | same | **G + D** | boolean; default **`true`** | Implemented; R2. |

- The header/footer text is **generated** from the canonical document/chapter titles; there is no
  free text, no page-1 suppression, and no font/color setting.
- `pageNumber` renders `Page N of M` at the bottom center; the footer text stays left.
- A document value equal to the global value **removes** the override instead of storing a no-op; the
  per-field "Use global" commands remove one field, the group command removes the group.
- Print identity: `pageSettingsFingerprint` includes `chrome`; a chrome change re-runs measurement,
  Page Read/Edit, the Settings preview, and the print model from the same records
  (`pageChromeContent`/`PageChromeView`).
- No `settingsVersion` bump for R2 (additive inside `page`); the map version stays 1.

### 2.2 Appearance (R3)

Model: `packages/layout/src/appearance.ts` (`AppearanceSettings`, `DEFAULT_APPEARANCE`,
`ACCENTS`, `normalizeAppearance`, `appearanceCssVariables`).

| Field | Scope | Values / default | Status |
|---|---|---|---|
| `appearance.theme` | **G** | `dark` / `light` / `system`; default **`dark`**; `system` resolves against the OS at runtime and is not stored resolved | Implemented; R3. |
| `appearance.accent` | **G** | Registry id; default **`blue`**; eight ids in two display groups: pastel `blue`, `teal`, `amber`, `rose`; vivid `violet`, `magenta`, `cyan`, `orange`; unknown id → `blue` | Implemented; the palette set is **data** (a new id needs no schema bump); the id is a validated string. |
| `appearance.uiScale` | **G** | `0.9` / `1` / `1.1`; default **`1`** | Implemented; enum change is schema-bearing. |
| `appearance.uiFont` | **G** | `system` / `serif`; default **`system`** | Implemented; shell only. |
| `appearance.codeFont` | **G** | `jetbrains` / `system-mono`; default **`jetbrains`** | Implemented; **the only appearance value that reaches Page/PDF**; part of `pageSettingsFingerprint` and the export identity. |

- Theme, accent, UI scale, and UI font never reach the paper; the paper font is fixed
  (`--nf-page-font`), the Page/PDF light skin is fixed, and the PDF stays light in both themes.
- The accent registry holds complete dark/light values (accent, strong, soft, hover, contrast); the
  stylesheet never declares an accent literal. Contrast is a registry/test concern, not a setting.

### 2.3 Export (R4)

Model: `packages/layout/src/page-settings.ts` (`ExportSettings`), `shared/export.ts`
(`resolveExportDefaultFolder`, `pdfBaseNameForTitle`, `exportFileName`).

| Field | Scope | Values / default | Status |
|---|---|---|---|
| `export.folder` | **G** | `string \| null`; default **`null` = the OS Documents folder**; a trimmed non-empty path is a custom default; `Use Documents` resets it | Implemented; R4. Global only, no per-document export namespace. |

- The export sheet starts at the setting; **Choose…** changes only the current export (the old
  session `lastExportFolder` is gone). A missing folder fails with the existing write error and
  creates nothing.
- Filename is `<title>.pdf` (`Untitled.pdf` when empty), no date suffix, no metadata/tagged/page-range
  UI. The filename pattern is a **product decision** (R4); changing it does not need a schema bump.
- The PDF job stays atomic (temp → inspect → rename/link), validates produced page count/size, and
  binds the measured run (settings fingerprint + document identity) as before.

### 2.4 Continuous (R6)

Model: `packages/layout/src/continuous-settings.ts` (`ContinuousSettings`, ranges, steps,
`normalizeContinuousSettings`, `continuousCanvasFloor`, `continuousCssVariables`,
`continuousEdgeStyle`).

| Field | Default | Range | Step | Status |
|---|---|---|---|---|
| `continuous.spacing.chapterGap` | 28 | 16–48 | 1 | Implemented; R6. |
| `continuous.spacing.siblingGap` | 24 | 12–40 | 1 | Implemented; R6. |
| `continuous.spacing.childRowGap` | 16 | 8–32 | 1 | Implemented; R6. |
| `continuous.arrows.width` | 1.25 | 0.75–2.5 | 0.25 | Implemented; R6. |
| `continuous.arrows.activeWidth` | 1.75 | 1.25–3 | 0.25 | Implemented; always raised to ≥ `width`. |
| `continuous.arrows.mutedWidth` | 1 | 0.5–2 | 0.25 | Implemented; R6. |
| `continuous.arrows.size` | 6 | 4–10 | 1 | Implemented; fixed arrowhead length, half-width derived. |
| `continuous.widths.canvasMax` | 3200 | 2400–4800 | 100 | Implemented; raised to the fitted-row floor. |
| `continuous.widths.topLevelMax` | 480 | 320–640 | 20 | Implemented; content-driven top-level cap. |
| `continuous.widths.childMax` | 420 | 280–560 | 20 | Implemented; content-driven child cap. |

- **Scope:** global only; no per-document Continuous layer. There is no global zoom setting; zoom
  stays per-document view state in the toolbar/View menu.
- **Defaults equal the pre-R6 tokens** (chapter 28, sibling 24, row 16, widths 1.25/1.75/1, head 6,
  canvas 3200, caps 480/420), so a v4 file migrates with no visual change.
- **Canvas floor:** `topLevelMax + siblingGap + childMax + CONTINUOUS_MIN_CORRIDOR`, where the
  corridor is `laneMin + stemMin + gap` from the shared edge contract. With the approved ranges the
  floor (≤ 1,256 px) is below the 2,400 px minimum cap, so it protects corrupt/future files rather
  than changing a valid slider value.
- **Consumers:** the `.nf-continuous-surface` CSS variables (`--nf-chapter-gap`, `--nf-child-gap`,
  `--nf-child-row-gap`, `--nf-canvas-max`, `--nf-top-level-max-width`, `--nf-child-max-width`,
  `--nf-edge-width`, `--nf-edge-width-active`, `--nf-edge-width-muted`) and the resolved Continuous
  edge style (arrowhead + three strokes). Card widths are content-driven; the Settings preview uses a
  documented **0.35** card-width factor and one uniform scale-to-fit transform (presentation only).
- **Page/PDF isolation:** Page Read/Edit, measurement, and print read `PAGE_EDGE_STYLE`,
  `PAGE_EDGE_GEOMETRY`, `PageTheme`, `PageChrome`, and `--paper-*`/`--nf-page-*` only. A unit test
  changes every Continuous field and compares the serialized Page layout, page count, Page edge
  model, print model, CSS variables, and fingerprint; the Page edge width is
  `--nf-page-edge-width`, not `--nf-edge-width`.

---

## 3. Post-freeze non-setting values (engine / chrome)

These are recorded so a future Settings page does not expose them as knobs. They are **E/ENG** or
**DES**, not stored settings.

### 3.1 Page edge corridor (engine invariant, post-freeze)

| Value | Fixed at | Note |
|---|---|---|
| Lane lead + stem | 4 + 14 = 18 px | `PAGE_EDGE_GEOMETRY` / the Page corridor. |
| Sibling gap | 18 px | Fixed; density no longer scales it. |
| Child indent | 26 px | 12 px trunk + 12 px stem + arrow. |
| Callout card indent | 38 px | 24 + 14. |
| Callout gap | 16 px | Between stacked callouts. |
| Callout right gap | 24 px | Mode A right lane. |
| Trunk insets | 12 px child / 24 px callout | Wrapped children keep ≥ 26 px indent. |

The Page theme keeps the corresponding stored fields for compatibility but the engine ignores them
and resolves the fixed corridor, so 60/70/100/120 % density draw the same arrows. The Page/PDF gate
was re-run when this changed (A4 61, A5 landscape 134, Letter 62, 300-block 27).

### 3.2 Chrome geometry and paper identity

| Value | Where | Class |
|---|---|---|
| Header top = 0.3 × top margin; ghost top = 0.62 × top; footer bottom = 0.3 × bottom; continues bottom = 0.6 × bottom | `packages/layout/src/page-chrome.ts` | E (shared by Page Read/Edit/Settings/print). |
| Page number paper-center shift = `(right − left) / 2` | `pageChromeLayout` | E; symmetric margins give 0. |
| Page number paper-center text, footer text left, header text left | `PageChromeView` + Page CSS | P/E. |
| Code font stack | `appearance.codeFont` → `--mono-font` for the editor, Page code, and print; `codeFontStack` in the print model | The only appearance value that reaches the paper; in `pageSettingsFingerprint` and the export identity. |
| Paper font (`--nf-page-font`), light paper skin, Page edge width (`--nf-page-edge-width`) | Page/print CSS + `PAGE_EDGE_STYLE` | E/P; never follows the shell theme or UI font. |
| Settings shell 1180 × 820 (`min(820px, calc(100vh − 132px))`), top 108, nav 184, pane 536 max, rail `clamp(320px, 34%, 400px)`, Page preview 2 stacked sheets from one model, Continuous preview scale-to-fit, Appearance one column | `styles.css`, `SettingsDialog`, preview components | **UI chrome, not a setting.** The value audit's 536/radius/card-padding pass is DES. |
| Sidebar 180 min / 264 default / 640 max, 28 px rows, 30 px gear slot, 44 px header, 48 px rail | `design-tokens.ts`, shell CSS | Already in the frozen inventory (180/264/640); the shell design docs still say 208–360 (docs fix). |

### 3.3 Library / lifecycle values (not settings)

| Value | Where | Note |
|---|---|---|
| `libraries.json` version 1, max 8 recents, atomic writes, corrupt side-copy | `apps/desktop/src/main/library-roots.ts` | Personal app data, not a Settings control. |
| `document-settings.json` version 1, id-first/path-fallback identity, serialized atomic writes, corrupt backup/reset/restore | `shared/document-settings.ts`, `main/document-settings.ts` | Holds only page overrides; no content. |
| First-run library `~/Documents/NoteForest` (or `NOTEFOREST_LIBRARY`), one active library per window, drafts not in the session, Move to Trash = OS Trash | `main/library.ts`, renderer actions | Product behavior, not settings. |
| Snap/release sidebar widths 180/640/264, 8 px inset, double-click reset 264 | shell CSS/tokens | Frozen shell values; keep. |

---

## 4. Frozen vs still design

| Item | Status after this delta | If it changes |
|---|---|---|
| `page.setup`, `page.theme`, `page.density` (60–120), manual-break hints | **Frozen** (9 Nov inventory) | `settingsVersion` bump + pure migration; density range/floor is a product decision. |
| `page.chrome` fields and semantics | **Implemented, schema-bearing** (R2) | Rename/remove/semantic change → version bump + migration; the three defaults are a product choice. |
| `appearance` fields and enums | **Implemented, schema-bearing** (R3) | Enum/field change → version bump; the accent palette set is data (no bump); the default values are R3. |
| `export.folder` | **Implemented, schema-bearing** (R4) | Field shape change → version bump; the filename pattern and the no-metadata UI are product decisions. |
| `continuous` fields, ranges, defaults | **Implemented, schema-bearing** (R6) | Namespace shape → version bump; range/default changes are product decisions and need tests; the canvas floor is an engine invariant. |
| Page edge corridor, chrome geometry, paper font, Page edge width | **E / frozen engine invariants** | A change is an engine/ADR decision, not a Settings control; the Page/PDF gate must re-run. |
| Settings shell 1180 × 820, rail, pane 536, radii 3/4/6/7/8/9, Continuous card padding 10 | **DES** (visual token pass) | Visual-only except card padding (measurement); no settings schema change. |
| Manual-break UI, library/backup, search, Data recovery pages | **Not built / planned** | No settings schema until designed. |
| Anchor health panel, shell activity bar | **Proposal** (`docs/design/anchor-health.md`, `shell-activity-bar.md`) | No settings schema. |
| Table toolbar redesign | **Deferred** (special-text brief) | No settings schema. |
| Accent palette set | **Data** (8 ids in pastel/vivid) | Add an `AccentSet`; no schema bump; contrast tests. |

**Unknown-field policy (unchanged and extended):** unknown top-level keys and unknown keys inside
`page`, `page.setup`, `page.theme`, `page.chrome`, `appearance`, `export`, `continuous`, `spacing`,
`arrows`, and `widths` are preserved on write; a newer `settingsVersion` is read with a warning, its
version is never lowered, and its unknown fields survive. A corrupt/unreadable `settings.json` or
`document-settings.json` is side-copied and warned about; the only replacement path is the explicit
reset/restore.

---

## 5. Open decisions / follow-ups (not schema changes)

1. **Settings pane 536 and the radius scale** — document 536 as a readable choice (or move to ~592)
   and normalize radii to 4/8 in the visual token pass; Continuous card padding 10 needs the
   Continuous geometry check. (`docs/design/value-audit.md` §4–§5.)
2. **Sidebar docs drift** — align `ui-shell-map`/`ui-shell-contents` (208–360) to the code/inventory
   (180/640/264).
3. **Copy identity** — `Save a copy` currently keeps the document id; decide whether a copy mints a
   new id (affects per-document setting sharing and move reconciliation). This review's F3 is the
   cleanup/reconciliation half; the product/ADR decision is separate.
4. **Draft immediate settings** — the immediate per-document path must join the materialization path;
   until then a draft can carry a `draft:` override entry (review F4).
5. **Continuous `mutedWidth` vs `width`** — `mutedWidth` may exceed the resting width; it is only
   used when a selection mutes the tree. Keep unless the product wants a strict order.
6. **Code font** — the code font is JetBrains Mono (bundled) or the system monospace; the UI font
   is system or serif. Adding a new bundled UI font (or a third code font) is a dependency decision.
   The PDF code font is part of the print identity.

---

## 6. Verification pointers

- Model/defaults: `packages/layout/src/page-settings.ts`, `appearance.ts`, `continuous-settings.ts`,
  `page-chrome.ts`; `packages/pdf/src/printModel.ts`.
- Migration/write: `apps/desktop/src/shared/settings-file.ts`; `settings.test.ts`,
  `settings-store.test.ts`, `ui-settings-recovery`.
- Page/PDF isolation: `apps/desktop/test/continuous-settings-isolation.test.ts`,
  `edge-style-isolation.test.ts`, `page-token-guards.test.ts`, `print-parity.test.ts`.
- UI: `ui-batch-b`, `ui-appearance-v3`, `m4d2-export-ui`, `r6-continuous-settings`,
  `settings-shell-layout`, `m4e1-settings-platform`, `m4d1-page-density`.
- The frozen 9 Nov inventory (`docs/reviews/settings-inventory.md`) remains the source for the values
  it already lists; this delta does not rewrite it for history.
