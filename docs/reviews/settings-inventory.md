# Settings inventory — full-codebase review (pre-UI rework)

**Status:** Inventory for the Settings/UI rework; no product-code changes.
**Reviewer:** Reviewer / Sentinel (independent).
**Date:** 9 November 2026.
**Base:** `main` at the M4d1/M4d2 integration (`53c7e49`; brief commit `1a83f2f`).
**Source of truth for values:** `packages/layout/src/page-settings.ts`,
`packages/layout/src/types.ts`, `packages/layout/src/edge-style.ts`,
`apps/desktop/src/renderer/src/lib/design-tokens.ts`,
`apps/desktop/src/shared/view-state.ts`, `apps/desktop/src/shared/export.ts`,
`apps/desktop/src/main/export-*.ts`.

This catalog covers every numeric/geometric/typographic value a future Settings UI
might expose or that the engine owns. It records the current default, range/clamp,
owner (Page / Continuous / shared / print / app), UI decision, consumers, and
duplication/migration status.

**Legend**

| Code | Meaning |
|---|---|
| **U** | Expose as a first-class user control |
| **A** | Advanced disclosure; not in the default view |
| **H** | Hide / do not expose (internal, risky, or unresolved) |
| **E** | Engine constant; document but never edit from Settings |
| **P** | Print-only fixed value |
| **M** | Missing setting the UI rework will need (product decision) |
| **X** | Remove, merge, rename, or deprecate before exposing |
| **G / D / V / C / P** | Global default / per-document override / view state / canonical document (never settings) / print-only |

> **Product-owner update (9 Nov 2026).** The density slider target is
> **60–120%**, not 80–120%. The shipped code clamps at 80%. This inventory records
> the target and the consequences; no code change is part of this review.

---

## 0. Executive summary

- **One real settings pipeline exists and is well factored:** global
  `settings.json` → per-document override in `shell-session.json` →
  `normalize/merge` → `effectivePageTheme` → `pageLayoutOptions` /
  `pageCssVariables` → layout, measurement, Page Read/Edit, print/PDF. Density is
  applied once through that lens (M4d1).
- **The model is not yet safe to expose:** no settings schema version or
  migration; settings writes are fire-and-forget with swallowed errors; corrupt
  settings silently reset and are overwritten; per-document overrides live only
  while a tab is open; the Continuous zoom setting is dead and duplicated by the
  real view-state zoom.
- **Page and Continuous are not fully separated in docs or code.** Page and
  Continuous numeric namespaces are separate objects, but one `design-tokens.md`
  document mixes them, the Page measurement host reads a Continuous CSS token,
  and Page geometry still has legacy literals (`CALLOUT_ROW_INDENT` 26,
  144/16 fallbacks) and no Page-owned stem/trunk-gap tokens.
- **Density target 60–120 needs a model decision, not just a slider range
  change.** At 60% the current 8 pt body floor is identical to 80%, while the
  card cap hits the 280 px floor; projected page counts are equal to or worse
  than 90/100% on all three fixtures. The 80% non-monotonic finding (real DOM
  27/25/27 pages on scale-300) is stronger at 60%.
- **Density can change callout topology.** The probe shows one stress-fixture
  parent flipping A→B2 at 120%, because the mode gate depends on the placed
  width and the lane. The checklist currently promises density never changes
  topology; that promise is false today.
- **M4d2 export UI is a solid temporary slice:** one flow, three entries, explicit
  overwrite, real progress/cancel/error states, and no Page view required. The
  remaining work is product defaults (folder, date-stamped filename, metadata)
  and final UI polish, not pipeline correctness.

---

## 1. Ownership and resolution map

```text
Canonical document (document.json, schema v2)
  identity, chapters, blocks, content, branches, anchors, assets,
  schemaVersion, revision
  — no pageSetup, manualBreakBeforeBlockIds, viewState, PageTheme

Global personal settings (app-support/settings.json)
  AppSettings
    page: PageSettings
      setup: PageSetup
      theme: PageTheme
      manualBreakBeforeBlockIds: string[]
    continuous: ContinuousSettings
      zoom: number                     (currently dead; see §9)

Per-document personal state (shell-session.json, SessionTabState)
  pageSettingsOverride?: PageSettingsOverride
  continuousSettingsOverride?: ContinuousSettingsOverride
  view: layout / interactionMode / currentPage / pageZoom / pageFit / zoom

Resolved for one document
  PageSettings(doc)       = mergePageSettings(app.page, pageOverride)
  ContinuousSettings(doc) = mergeContinuousSettings(app.continuous, override)
  effectivePageTheme(theme) = density lens over stored theme
```

Pipeline (single resolution path):

1. `normalizeAppSettings` / `normalizePageSettingsOverride` clamp untrusted input
   (`packages/layout/src/page-settings.ts:703-843`).
2. `mergePageSettings` resolves presets, explicit values, margins, manual breaks
   (`:679-701`).
3. `effectivePageTheme` applies density and floors exactly once (`:396-452`);
   the output carries `density: 1`, so the lens is idempotent.
4. `pageLayoutOptions` maps the effective theme to `LayoutOptions` (`:455-480`).
5. `pageCssVariables` maps it to CSS custom properties (`:495-528`).
6. `pageSettingsFingerprint` includes setup, theme, and manual breaks (`:348-356`).
7. Page Read/Edit, measurement, and print all consume the same resolved object;
   print additionally requires the measured-run fingerprint (`packages/pdf/src/printModel.ts:220-263`).

Evidence: `state/settings.ts:1-184`, `page/model.ts:39-64`, `page/measurement.ts:163-176`,
`page/PageView.tsx:362-374`, `print/entry.tsx:420-468`, `print/PrintDocument.tsx:269-298`.

**Known gap:** `setAppSettings` is a full-object replace, not a merge
(`state/settings.ts:109-116`). A future Settings UI must build the whole object or
add an explicit `updateAppSettings`; a partial call resets unrelated globals to
defaults.

---

## 2. Page setup

Source: `packages/layout/src/page-settings.ts:17-38, 227-235, 280-338, 555-578`.

| ID | Setting / field | Default | Range / clamp | Owner | UI | Consumers | Status / notes |
|---|---|---|---|---|---|---|---|
| PS-1 | `setup.size` | `A4` | `A4` / `A5` / `Letter` | G, D | **U** | `pageDimensionsMm`, geometry, PageView, paginator, print | Missing UI; no document storage. |
| PS-2 | `setup.orientation` | `landscape` | `portrait` / `landscape` | G, D | **U** | same | Missing UI; document-wide by design. |
| PS-3 | `setup.margins.top` | `12` mm | `0–100`; total content must leave ≥ 20 mm on each axis | G, D | **U** | geometry, chrome, content box, print | Silent fallback to all 12 mm when impossible (`:570-577`); no warning. |
| PS-4 | `setup.margins.right` | `12` mm | same | G, D | **U** | same | same. |
| PS-5 | `setup.margins.bottom` | `12` mm | same | G, D | **U** | same | same. |
| PS-6 | `setup.margins.left` | `12` mm | same | G, D | **U** | same | same. |
| PS-7 | Page width/height mm | A4 210 × 297, A5 148 × 210, Letter 215.9 × 279.4; swapped for landscape | fixed by size/orientation | E/P | H | `pageGeometry` | `pageDimensionsMm` (`:280-305`). |
| PS-8 | Page width/height px | `mm × 96/25.4` | derived | E/P | H | PageView/print | `PX_PER_MM` 3.7795… (`:307-316`). |
| PS-9 | Content width/height px | page minus margins | derived | E/P | H | layout/paginator | `pageGeometry` (`:319-338`). |
| PS-10 | Page chrome band fractions | header `0.30 × top`, ghost `0.62 × top`, footer `0.30 × bottom`, continues `0.60 × bottom` | fixed fractions | E/P | H (A if exposure) | `pageChromeLayout` | `page-chrome.ts:40-50`; at 0 margins chrome overlaps content. |
| PS-11 | Cross-page label insets | `-margin + 2`, `maxWidth = max(18, margin − 4)` | fixed | E/P | H | edge labels | `page-chrome.ts:198-213`. |
| PS-12 | Default setup | A4 landscape, 12 mm all sides | — | G | U (as default) | all Page/PDF | Code 12 mm; spec v0.5/UX still say 20 mm (doc drift). |
| PS-13 | Page size fixed to A4 in spec | — | — | C | X (doc) | — | Spec §pageSetup still says A4 fixed; ADR-0008 supports A5/Letter. |

**Missing page-setup decisions:** minimum margins that keep header/footer/ghost
markers readable; custom page size (not in v1); portrait/landscape default;
header/footer on/off and content; chapter-start behavior; page-number format.

---

## 3. PageTheme typography

Source: `page-settings.ts:49-105, 141-218, 580-659`; CSS consumption
`styles.css:4441-4702`.

Defaults are **Compact** (product default) / **Comfortable**. Ranges are the
`resolveTheme` clamps. “Lens” describes what density does in
`effectivePageTheme`.

| ID | Field | Compact | Comfortable | Range / clamp | Lens | UI | Consumers / notes |
|---|---|---:|---:|---|---|---|---|
| TY-1 | `preset` | `compact` | `comfortable` | `compact`/`comfortable`/`custom` | not scaled | **U** | Preset switch starts from that preset, then explicit overrides. `custom` has no preset object; it is a marker. |
| TY-2 | `density` | `1` | `1` | current `0.8–1.2`, step 0.05, normalize 0.01; **target 0.6–1.2** | applies once, output 1 | **U** | Page only. See §7. |
| TY-3 | `fontScale` | `1` | `1` | `0.5–2` | not scaled | **H / X until floor fix** | Multiplies every CSS type size after the 8 pt floor; can violate the floor (`pageCssVariables:500-511`). |
| TY-4 | `bodyPt` | `9` | `10.5` | `6–24` | ×density, floor 8 | **U** (advanced raw) | Body + prose. |
| TY-5 | `bodyLine` | `1.3` | `1.45` | `1–2.5` | not scaled | **U** (advanced) | Body line height. |
| TY-6 | `headingScale` | `1` | `1` | `0.5–2` | not scaled | **H / X until order fix** | Applied after heading floors; can make headings smaller than body. |
| TY-7 | `heading1Pt` | `14` | `16` | `8–40` | ×density, ≥ body + 3 | **U** (advanced) | H1. |
| TY-8 | `heading2Pt` | `12` | `13.5` | `7–32` | ×density, ≥ body + 1.5 | **U** (advanced) | H2. |
| TY-9 | `heading3Pt` | `10.5` | `12` | `6–28` | ×density, ≥ body + 1 | **U** (advanced) | H3. |
| TY-10 | `codePt` | `8` | `8.75` | `5–20` | ×density, floor 7 | **U** (advanced) | Code block. |
| TY-11 | `codeLine` | `1.3` | `1.45` | `1–2.5` | not scaled | **U** (advanced) | Code line height. |
| TY-12 | `tablePt` | `8.5` | `9.5` | `5–20` | ×density, floor 7 | **U** (advanced) | Tables. |
| TY-13 | `tableLine` | `1.25` | `1.35` | `1–2.5` | not scaled | **U** (advanced) | Table line height. |
| TY-14 | `labelPt` | `9` | `11` | `5–20` | ×density, floor 8 | **U** (advanced) | Block label. |
| TY-15 | `chromePt` | `7.5` | `8` | `5–16` | ×density, floor 6 | **A** | Header/footer. |
| TY-16 | `markerPt` | `7` | `7.5` | `5–16` | ×density, floor 6 | **A** | Continuation chips, edge labels. |
| TY-17 | Heading line height | `1.25` (hard-coded) | same | fixed CSS | not scaled | **M / E** | No `headingLine` field; UI plan says heading line heights. |
| TY-18 | Label line height | `1.2` (hard-coded) | same | fixed CSS | not scaled | **M / E** | No `labelLine` field. |
| TY-19 | Inline code size | `0.86em` (hard-coded) | same | fixed CSS | not scaled | **E** | `styles.css:4566-4573`. |
| TY-20 | Code line min height | `1.35em` (hard-coded) | same | fixed CSS | not scaled | **E** | `styles.css:4593-4599`. |
| TY-21 | Table cell padding | `cardPadding × 0.75` vertical | same | derived | follows cardPadding | **A** | `styles.css:4612-4619`. |

**PageTheme values with no UI field:** heading/label line heights; code/table
line-height exists; list marker width `1.2em`; quote border `3px`; inline-code
radius uses shell `--nf-card-radius` 4. These are engine/CSS constants today.

**Density floors (current lens):**

| Floor | Value | Source |
|---|---:|---|
| Body / label minimum | 8 pt | `PAGE_BODY_PT_FLOOR` (`:253`) |
| Code / table minimum | 7 pt | `effectivePageTheme` (`:433-434`) |
| Chrome / marker minimum | 6 pt | `:436-437` |
| Headings above body | H1 +3, H2 +1.5, H3 +1 pt | `:404-406` |
| Minimum content width (preset range) | 150 px | `PAGE_MIN_CONTENT_WIDTH_FLOOR` (`:255`) |
| Scaled max card width band | 280–560 px | `PAGE_MAX_CARD_WIDTH_MIN/MAX` (`:257-258`) |
| Wrapped child stem clearance | `childTrunkInset + stemMin + 2` | `:411-415` |
| Callout A leader floor | `stemMin` 12 px | `:447`; `EDGE_STYLE.stemMin` |
| `maxCardWidth` ≥ `minContentWidth` | yes | `:421-424` |
| `maxWrapIndent` ≥ `wrapIndent` | yes | `:407-408` |

**Known floor bug (advanced values only):** `effectivePageTheme` floors before
`pageCssVariables` multiplies by `fontScale`/`headingScale`. At
`fontScale: 0.5` the compact body renders `4.5 pt`; at `headingScale: 0.5` H1
renders `7 pt`, below the 9 pt body. The 8 pt floor and heading-order invariants
are not true end-to-end. Fix or hide both scales before exposing them.

---

## 4. Page boxes, spacing, and indents

Source: `page-settings.ts:73-104, 141-218, 396-452`; consumed by
`pageLayoutOptions` and `pageCssVariables`.

| ID | Field | Compact | Comfortable | Range | Lens | UI | Consumers / notes |
|---|---|---:|---:|---|---|---|---|
| BX-1 | `cardPadding` | `8` | `12` | `0–40` | ×density | **U** | Card geometry, measurement chrome, code/list/table CSS. |
| BX-2 | `cardBorder` | `1` | `1` | `0–8` | not scaled | **A** | Card box; measurement chrome. |
| BX-3 | `segmentGap` | `4` | `8` | `0–32` | ×density | **U** | Segment spacing, list/table. |
| BX-4 | `siblingGap` | `16` | `24` | `0–96` | ×density | **A** | Direct-child group gap; Page only. |
| BX-5 | `wrapIndent` | `12` | `18` | `0–96` | ×density | **A / X rename** | Two roles: nested-list indent (`projection.ts:182`) and a floor in `wrapOriginX` (`layout.ts:355-370`). Recommend separate `listIndent`; do not label it “wrap” in Settings. |
| BX-6 | `maxWrapIndent` | `36` | `54` | `0–192`, ≥ wrapIndent | ×density | **A** | Applied **per level**, not cumulative; docs/types say cumulative. |
| BX-7 | `childIndent` | `26` | `26` | `0–96` | ×density, ≥ childTrunkInset + 12 + 2 | **A** | R2i wrapped direct-child origin; Page only. |
| BX-8 | `childTrunkInset` | `12` | `12` | `0–96` | ×density | **A / H** | B2 outer/child below trunk. |
| BX-9 | `calloutTrunkInset` | `24` | `24` | `0–96` | ×density | **A / H** | B2 inner/callout below trunk. |
| BX-10 | `calloutCardIndent` | `38` | `38` | `0–160`, ≥ trunk inset | ×density | **A / H** | B2 callout card left offset. |
| BX-11 | `calloutRightGap` | `24` | `24` | `stemMin–96` | ×density, floor 12 | **A / H** | Mode A lane gap; F6 fixed. |
| BX-12 | `calloutModeMinWidth` | `240` | `240` | `0–800` | **not scaled** | **H** | Mode A gate. Not scaled intentionally? It contributes to density topology flips. |
| BX-13 | `calloutGap` | `12` | `20` | `0–96` | ×density | **A** | Callout vertical gap. |
| BX-14 | `maxCardWidth` | `420` | `420` | `120–2000`; density clamp 280–560 only for caps inside the band | ×density | **U** | Page card cap and image cap. |
| BX-15 | `minContentWidth` | `160` | `160` | `80–800`; density floor 150 for preset-range values | ×density | **A** | Readability floor; `content-too-wide` defect threshold. |
| BX-16 | `chapterGap` | `32` (engine default) | `32` | fixed in `pageLayoutOptions` | not scaled | **M / E** | `page-settings.ts:475` uses `DEFAULT_LAYOUT_OPTIONS.chapterGap`; not a PageTheme field. Shell chapterGap is 28. |
| BX-17 | `cardRadius` | `4` (shell token) | same | fixed | not scaled | **M / E** | Page cards read `--nf-card-radius`; not a PageTheme field. |
| BX-18 | List indent | `wrapIndent` | `wrapIndent` | same as BX-5 | ×density | **U?** | `projection.ts:182`; label “List indent” if exposed. |

**Page packing / topology**

| ID | Field | Default | Values | UI | Notes |
|---|---|---|---|---|---|
| PK-1 | `pagePacking` | `beside` | `beside` / `stacked` / `compaction` | **H** | `compaction` is a lab oracle only; `stacked` is legacy geometry. Presets use `beside`. |
| PK-2 | `calloutModes` | true when `pagePacking === 'beside'` | boolean | **H / E** | Derived (`page-settings.ts:471`); not a separate setting. |
| PK-3 | `wrapPolicy` | `group-left-origin` | `group-left-origin` / `right-first-per-child` / `subtree-aware` | **H / E** | Lab oracles. |
| PK-4 | Subtree-fit behavior | atomic direct-child group | derived | **H / E** | R2i; product rule. |
| PK-5 | Callout mode preference | none (A/B2/stacked deterministic) | — | **M** | UI plan suggested Auto/force A/force B2; not implemented. |
| PK-6 | Page density topology coupling | density can flip A/B2/stacked | derived | **H / product decision** | Probe evidence in the review; either freeze or label. |

---

## 5. Density (M4d1) and the 60–120 target

Source: `page-settings.ts:241-273, 384-452`; UI `Dialogs.tsx:1967-2074`;
lab `packages/layout/test/density-lab.ts`; UI evidence
`tests/ui/m4d1-page-density.test.mjs`.

| Item | Current | Target / decision |
|---|---|---|
| Slider range | **80–120%** (`PAGE_DENSITY_MIN=0.8`, `MAX=1.2`) | **60–120%** per product owner; code change required. |
| Step | 5% | keep 5% (13 steps at 60–120). |
| Default | 100% | keep. |
| Normalization | clamp 0.8–1.2, round 0.01 | widen to 0.6; consider rounding to 0.05 to match the slider. |
| Stored representation | raw `PageTheme.density`; resolved theme carries `density:1` | keep; `effectivePageTheme` is the only lens. |
| Body floor | 8 pt | At 60%, 9 × 0.6 = 5.4 → 8 pt, **same as 80%**. Decide: lower floor (7 pt?) or accept 60% as “compact type + narrower cards”. |
| Label floor | 8 pt | same question. |
| Code/table floor | 7 pt | at 60% both clamp at 7. |
| Card cap | 420 × 0.6 = 252 → floored to **280** | 80% is 336; 60% is only 16% narrower at the same type size. Decide a lower floor or a non-linear cap. |
| `minContentWidth` | 150 px at both 60/80% | The width floor dominates at 60%; consider scaling the floor with a lower bound. |
| Page count / monotonicity | 80% non-monotonic; 90% safest dense step | Product decision; publish guidance or change the model. |
| Page/PDF parity | one effective theme; parity tested at 80/120 | keep; re-run at 60. |

**Projected 60% values (current floors, simulated in
`artifacts/review-probe/density-60-probe.test.ts`; not shipped):**

`bodyPt 8`, `h1 11`, `code 7`, `cardPadding 4.8`, `maxCardWidth 280`,
`minContentWidth 150`, `childIndent 21.2`.

**Estimator page counts (same DOM-free lab method; not real-DOM):**

| Fixture | 60% (projected) | 80% | 90% | 100% | 110% | 120% |
|---|---:|---:|---:|---:|---:|---:|
| scale-300 | 36 | 33 | 36 | 36 | 36 | 53 |
| showcase | 24 | 23 | 23 | 23 | 25 | 26 |
| stress | 47 | 45 | 44 | 46 | 51 | 60 |

At 60% the projected page count is equal to or worse than 90/100% on all three
fixtures, and worse than 80% on showcase/stress. This is exactly the
non-monotonic effect, amplified by the 8 pt body floor and the 280 px card floor.

**Real-DOM page counts (M4d1 UI lab; 80/90/100 from the brief/report):**

| Fixture | 80% | 90% | 100% | 110% | 120% |
|---|---:|---:|---:|---:|---:|
| scale-300 | 27 | **25** | 27 | 30 | 37 |
| showcase | **18** | 19 | 21 | 21 | 22 |
| stress | 30 | **30** | 35 | 38 | 48 |

**Recommendation for the UI rework brief:** implement 60–120 only with a
re-tuned lens and a real-DOM lab at 60/70/80/90/100/110/120. Decide explicitly
whether the slider is (a) a page-density control that may change wrapping and
page count non-monotonically, or (b) a type/spacing control with a fixed card
cap. Publish “90% is the safest dense step” if the data keeps this shape.

---

## 6. Manual breaks

| ID | Item | Default | Range | Owner | UI | Notes |
|---|---|---|---|---|---|---|
| MB-1 | `manualBreakBeforeBlockIds` | `[]` | deduped non-empty block IDs; unknown IDs warned | G, D | **U** | `page-settings.ts:110-112, 661-671`; never canonical. |
| MB-2 | Where honored | before a block only when a safe break exists; chapter start y=0 is a no-op | — | E | **U (explain)** | `paginator.ts:100-180`; stale/unhonorable hints produce `impossible-hint` warnings. |
| MB-3 | Cleanup on delete | drop hint | — | D | **M** | ADR-0008 `:95-103`; **not implemented**. |
| MB-4 | Cleanup on split | keep on original | — | D | **M** | same. |
| MB-5 | Cleanup on merge | keep if either source had one | — | D | **M** | same. |
| MB-6 | Stale filtering on load | paginator warns; settings retain | — | E | **M** | No UI list to remove stale hints. |
| MB-7 | Fingerprint identity | array order included | — | E | H | Same set in a different order yields a different fingerprint (re-measure only; no correctness bug). |
| MB-8 | Manual-break UI entry | none | — | — | **M** | Page toolbar/context menu/list; post-page-roadmap recommends both toolbar and context menu. |

---

## 7. Continuous settings (real and dead)

Source: `page-settings.ts:114-117, 237-239, 709-723`; `state/settings.ts:129-184`;
`shared/view-state.ts:40-60`; `editor/DocumentEditor.tsx:610`.

| ID | Item | Default | Range | Owner | UI | Status |
|---|---|---|---|---|---|---|
| CO-1 | `ContinuousSettings.zoom` | `1` | `0.25–4` | G, D | **H until fixed** | **Dead.** No app consumer; only store/tests. |
| CO-2 | `continuousSettingsOverride` | absent | zoom | D | **H** | Persisted in session, never applied. |
| CO-3 | Real continuous zoom | `1` | `0.5–2`, step 0.01 | V (per document) | **U** | `DocumentViewState.zoom`; `DocumentEditor` uses this. |
| CO-4 | Canvas logical width | 3200 px; content 3120 px | fixed | E | **A / future** | `DESIGN_TOKENS.canvasMaxWidth`; horizontal scroll. |
| CO-5 | Canvas padding X/top/bottom | 40/40/88 px | responsive 32/32/72 and 28/28/64 | E | **H** | `DESIGN_TOKENS`; ratified. |
| CO-6 | Continuous chapter gap | 28 px | fixed | E | **H** | Shell token. |
| CO-7 | Continuous child gap | 24 px | fixed | E | **H** | Shell token. |
| CO-8 | Continuous child row gap | 16 px | fixed | E | **H** | Shell token. |
| CO-9 | Continuous card padding/radius | 10 / 4 px | fixed | E | **H** | Shell token. |
| CO-10 | Continuous block width bounds | top-level 160–480; child 144–420 | fixed | E | **H** | Shell token; content-driven. |
| CO-11 | Continuous row indent | 26 px | fixed | E | **H** | Shared with Page `childIndent` numerically, different semantics. |
| CO-12 | Continuous wrap indent | 18 px | fixed | E | **H** | `DESIGN_TOKENS.wrapIndent`; currently unused outside `GEOMETRY`/tests. |
| CO-13 | Canvas default zoom/fit | 1, fit width via menu | view state | V | **U** | Existing view controls; not a Settings item yet. |
| CO-14 | Continuous font/width/spacing | — | — | — | **M** | ADR-0008 future; no fields. |

**Recommendation:** delete `ContinuousSettings.zoom` or make it the single
source and seed the per-document view state from it. Do not ship a Settings
control backed by the dead field. Keep view-state zoom per document; if a global
default is required, add `ContinuousSettings.defaultZoom` and apply it only when
a document has no view-state zoom.

---

## 8. App / shell / view state

| ID | Item | Current | Range | Owner | UI | Notes |
|---|---|---|---|---|---|---|
| AP-1 | Appearance theme | dark only; “Graphite · dark (light tokens reserved)” | — | G | **M** | No AppSettings field; UX says light mode available. |
| AP-2 | Library path | `~/Documents/NoteForest` | override via env in tests | E | **U (About/Data)** | `library.ts:94-98`; not a preference today. |
| AP-3 | App-support path | OS app-support | fixed | E | **U (About/Data)** | `library.ts:100-102`. |
| AP-4 | Sidebar width | 264 px | 208–360 | V/G | **A / shell** | Session state; not Page settings. |
| AP-5 | Sidebar collapsed | false | bool | V/G | **U** | Session state. |
| AP-6 | Collapsed topics | `{}` | per document | V | **U** | Session state; not settings. |
| AP-7 | Default layout | Continuous | continuous/page | V | **U** | View state; no global default. |
| AP-8 | Default interaction mode | Edit (Continuous), Read (Page) | edit/read | V | **U** | `view-state.ts:77-89`. |
| AP-9 | Current page | 1 | clamped | V | **U** | View state. |
| AP-10 | Page zoom | 1 | 0.1–2.5, step 0.01 | V | **U** | `PageView` duplicates min/max constants. |
| AP-11 | Page fit | `page` | page/width/none | V | **U** | View state. |
| AP-12 | Autosave delay | 800 ms | fixed | E | **A?** | `save-coordinator.ts:33`; no setting. |
| AP-13 | Session save debounce/interval | 600 ms / 5 s | fixed | E | **H** | `App.tsx:425-449`. |
| AP-14 | Flush timeout | 2500 ms | env override | E | **H** | `main/index.ts:130-136`. |
| AP-15 | Window default/min size | 1440×900 / 960×640 | fixed | E | **H** | `main/index.ts:258-261`. |
| AP-16 | Single-key shortcut disable | — | — | G | **M** | UX says configurable; no field. |
| AP-17 | Recent/closed tabs | session | in memory | V | **U** | Session state; not settings. |

---

## 9. Shared edge primitives (`EDGE_STYLE`) and Page edge values

Source: `packages/layout/src/edge-style.ts:27-64`; consumed by Continuous,
Page Read/Edit, print.

| ID | Token | Value | Owner | UI | Notes |
|---|---|---:|---|---|---|
| ED-1 | `gap` | 2 px | Shared/E | H | Arrow-tip gap. |
| ED-2 | `radius` | 2 px | Shared/E | H | Near-right corner. |
| ED-3 | `stemMin` | 12 px | Shared/E | H | Final stem; Page `childIndent`/`calloutRightGap` floors. |
| ED-4 | `laneMin` / `laneMax` | 2 / 14 px | Shared/E | H | Shared trunk lane. |
| ED-5 | `trunkInset` | 12 px | Shared/E | H | Below trunk. |
| ED-6 | `trunkGap` | 0 px | Shared/E | H | Attached below trunk. |
| ED-7 | `arrowLength` / `arrowHalfWidth` | 6 / 3 px | Shared/P | H | Fixed primary head. |
| ED-8 | `edgeWidth` / `active` / `muted` | 1.25 / 1.75 / 1 | Shared/E | H | Stroke widths. |
| ED-9 | `minGap` | 4 px | Shared/E | H | Routed segment gap. |
| ED-10 | `referenceArrowLength` / `spread` | 7 px / 0.46 | Shared/E | H | Open chevron. |
| ED-11 | `pageClearance` | 3 px | Page router/E | H | Obstacle clearance. |
| ED-12 | `pageLaneStep` | 4 px | Page router/E | H | Parallel duplicate edges. |
| ED-13 | `pageTurnPenalty` | 60 px | Page router/E | H | Search cost only. |
| ED-14 | Legacy `CALLOUT_ROW_INDENT` | 26 px | Page legacy/E | X | `layout.ts:149, 1432-1435`; should be `rowIndent`/Page token. |
| ED-15 | Legacy readability floor | 144 px | Page legacy/E | X | `layout.ts:1432-1435`; Page `minContentWidth` is 160. |
| ED-16 | Legacy fallback gap | 16 px | Page legacy/E | X | In legacy beside lane; not a token. |

**Missing Page-owned tokens (F9):** `stemMin`, `trunkGap`, `rowIndent` are
shared/engine values today. Page layout and print cannot tune them independently
from Continuous. Decide whether they are intentionally shared primitives or
PageTheme fields; document either way.

---

## 10. Print / PDF-only values

Source: `print/print.css`, `print/entry.tsx`, `main/export-window.ts`,
`main/export-job.ts`, `main/export-preflight.ts`, `shared/export.ts`,
`packages/pdf/src/printModel.ts`.

| ID | Item | Value | UI | Notes |
|---|---|---|---|---|
| PR-1 | Print page size | resolved PageSetup | **P** | One fixed sheet per derived page; `@page` size = geometry. |
| PR-2 | Print margins | 0 in `printToPDF`; page margins are internal content padding | **P** | `export-preflight.ts:253-264`. |
| PR-3 | Print scale/background | scale 1, `printBackground: true`, `preferCSSPageSize: true`, no header/footer | **P** | `pdfOptionsFor`. |
| PR-4 | Tagged PDF | `generateTaggedPDF: false` | **P** | Accessibility metadata decision. |
| PR-5 | Print skin colors | white background; ink `#1a1f23`; edge `#2b2b2b`; reference `#4d4d4d`; warnings `#7a4b00` etc. | **P/H** | `print.css:20-104`; always light. |
| PR-6 | Page chrome text | document title, chapter title, `Page N of M`, ghost/continues labels | **P** | Shared Page Read/print; no header/footer toggle. |
| PR-7 | Page chrome fractions | 0.30/0.62/0.30/0.60 × margins | **H/E** | `page-chrome.ts:40-50`. |
| PR-8 | Hidden print window | 1200×900, white, `backgroundThrottling:false`, sandbox, no preload | **P** | `export-window.ts:95-116`. |
| PR-9 | Load/measure/print timeouts | 30 s / 180 s / 180 s | **E** | `export-window.ts:29-31`. |
| PR-10 | Snapshot timeout | 20 s | **E** | `export-service.ts:28`. |
| PR-11 | Image/font/frame settles | 5 s / 5 s / 500 ms (print); 4 s / 150 ms (measurement) | **E** | `print/entry.tsx:71-74`; `page/measurement.ts:38-39`. |
| PR-12 | Completed job retention | 25 | **E** | `export-job.ts:276`; stale partial 1 h (`:172`). |
| PR-13 | PDF size tolerance | 0.25 mm | **E** | `shared/export.ts:292`. |
| PR-14 | Export filename | `<title>.pdf` (sanitized; empty → `Untitled.pdf`) | **U** | `shared/export.ts:75-82`; spec says `<title> — <date>.pdf`; no default folder. |
| PR-15 | PDF metadata | **not set** (print HTML title is “NoteForest print”) | **U/M** | Spec §11.9 asks title/subject/creator/page size/date. |
| PR-16 | Export progress poll | 120 ms | **E** | `export-flow.ts:292`. |
| PR-17 | Export panel truncation | 6 warnings / 8 error details | **A** | `ExportStatusPanel.tsx:153-160, 197-207`; no “show all”. |

---

## 11. Export UI settings/defaults (M4d2)

| ID | Item | Current | UI | Notes |
|---|---|---|---|---|
| EX-1 | Entry points | File → Export PDF… (`⌘⇧E`), palette, Page toolbar | **U** | All call one flow (`actions.ts:1131-1136`, `PageView.tsx:878-889`). |
| EX-2 | No active document | toast error; no save dialog | **U** | Correct; test `m4d2` no-document. |
| EX-3 | Read-only document | export allowed | **U** | Read-only gate does not block export; intentional. |
| EX-4 | Page Edit open | commits before snapshot | **U** | `App.tsx:217-231`; verified strength. |
| EX-5 | Save dialog | filename only; OS folder | **M** | Decide Documents/Downloads/last-used/per-document. |
| EX-6 | Overwrite | explicit renderer prompt; engine no-clobber | **U** | No setting; product decision if a “replace without asking” preference exists. |
| EX-7 | Progress/cancel | phase-based progress, cancel, terminal states | **U** | Temporary panel; final sheet in UI rework. |
| EX-8 | Reveal in Finder | main-process `shell.showItemInFolder` | **U** | Not E2E exercised (avoids opening Finder). |
| EX-9 | Warnings | manual break/anchor/asset/frames/images/fonts/console | **U/A** | Final UI should show “all warnings” without truncation. |
| EX-10 | Preflight failure | names affected block; typed error | **U** | Good. |
| EX-11 | Default export mode | Page PDF only | **E** | No reader PDF; ADR-0002. |
| EX-12 | Export page range/selection | none | **M** | Product decision; v1 is whole document. |
| EX-13 | PDF metadata/filename date | not set / no date | **M** | Spec vs implementation gap. |

---

## 12. Duplicated / hardcoded / dead / stale register

| ID | Item | Where | Status / action |
|---|---|---|---|
| DUP-1 | Continuous zoom settings vs view-state zoom | `page-settings.ts:114-117`; `state/settings.ts:129-184`; `shared/view-state.ts:50-60`; `DocumentEditor.tsx:610` | **Dead duplicate.** Pick one; ranges disagree (0.25–4 vs 0.5–2). |
| DUP-2 | Page CSS fallback block | `styles.css:4441-4468` duplicates `COMPACT_THEME` (`page-settings.ts:141-178`) | Hand-maintained duplicate; no guard. Remove or generate from TS. |
| DUP-3 | Page `max-card-width`/geometry CSS vars | `pageCssVariables` emits 12+ vars with no CSS/JS consumer | Dead CSS surface; remove or wire. |
| DUP-4 | `.nf-measure-card` width | `styles.css:4704-4706` uses Continuous `--nf-child-max-width` 420 | Page measurement host reads a Continuous token; use Page cap or a dedicated measurement width. |
| DUP-5 | Page zoom clamps | `PageView.tsx:81-84` vs `view-state.ts:56-60` | Same 0.1/2.5 duplicated; import one source. |
| DUP-6 | `wrapIndent` roles | PageTheme, `projection.ts:182`, `layout.ts:355-370`; shell `DESIGN_TOKENS.wrapIndent` 18; engine default 18 | Three meanings/values; rename list indent vs page wrap; remove unused shell token. |
| DUP-7 | `childIndent` / `rowIndent` / `CALLOUT_ROW_INDENT` | PageTheme 26; shell 26; layout 26 | Same number, three owners; consolidate or document semantics. |
| DUP-8 | `calloutGap` values | Page 12/20; shell 16; `DEFAULT_LAYOUT_OPTIONS` 20 | Three values; Page vs Continuous intentional, engine default must match one. |
| DUP-9 | Page chapter gap | `pageLayoutOptions` 32 vs shell 28 | Page has no token; decide. |
| DUP-10 | Page card radius | shell 4 used by Page | Move to PageTheme or document as shared primitive. |
| DUP-11 | `pxToMm` / `MM_PER_PX` / `PX_PER_MM` | `page-settings.ts:307-316` | Exported but unused outside module/tests; remove or use. |
| DUP-12 | `pageDimensionsMm` | only tests/geometry | Fine internal; not a setting. |
| DUP-13 | `maxWrapIndent` wording | `types.ts:410`, `docs/design-tokens.md:106` | Says cumulative; implementation is per level. Fix text or engine. |
| DUP-14 | `DEFAULT_LAYOUT_OPTIONS.childIndent` | `types.ts:452-474`; `layout.ts:355-370` | Engine default reads a Page-only field (F7). Make it `wrapIndent` or document 26 as engine default. |
| DUP-15 | `types.ts:467` “compaction for compact” | `types.ts:467-468` | Stale; compact is `beside`. |
| DUP-16 | `useContinuousSettings` | `state/settings.ts:169-184` | Unused. |
| DUP-17 | `resolvedContinuousSettings`/`setContinuousSettingsOverride` | store | Tests only; no app consumer. |
| DUP-18 | `pageCssVariables` in `packages/layout` | `page-settings.ts:495-528` | UI/CSS naming in a pure engine package; consider moving to a presentation adapter or documenting the contract. |
| DUP-19 | Help → Keyboard shortcuts | `menu.ts:174-177` sends `settings` | Mislabeled; opens Settings, not shortcuts. |
| DUP-20 | Spec/UX page-setup model | `spec.md:373-384, 514-516`; `ux.md:322, 947-968` | Stale vs ADR-0008; R4 docs sweep. |

---

## 13. Missing settings / decisions for the UI rework

| ID | Missing item | Why it matters | Candidate owner |
|---|---|---|---|
| MS-1 | Appearance (dark / light / system) | UX says light mode available; app is dark only | Global AppSettings |
| MS-2 | Full Page Setup UI | Size/orientation/margins are only editable via settings.json/test bridge | Page section |
| MS-3 | Page presets / typography UI | Only density exposed; `compact`/`comfortable`/`custom` not selectable | Page → Typography |
| MS-4 | Manual breaks UI + cleanup | Array is stored/honored but no user path; no delete/split/merge cleanup | Page → Breaks |
| MS-5 | Continuous zoom/canvas/type | Continuous settings are dead; no UI | Continuous section |
| MS-6 | Header/footer/page-number toggles | Page chrome always on; no setting | Page → Setup (advanced) |
| MS-7 | Chapter-start behavior | Always new page; UX mentions a toggle | Page → Layout |
| MS-8 | Default export folder / date filename / metadata | Save dialog uses only title; spec differs | Export section |
| MS-9 | Keyboard shortcut disable / single-key settings | UX says configurable; no field | Editor/Shortcuts |
| MS-10 | Autosave interval / save-on-quit behavior | Fixed 800 ms; no setting | Editor (advanced) |
| MS-11 | Page default zoom/fit | Per-document view state only; no global default | Page/Continuous |
| MS-12 | Callout mode preference (Auto/force A/force B2) | Current A/B2/stacked is geometric; product decision | Page → Advanced |
| MS-13 | Page-owned stem/trunk-gap/row-indent tokens | Needed if Page appearance should be tunable | PageTheme |
| MS-14 | Heading/label line heights, card radius, chapter gap | CSS/engine constants; UI plan mentions line heights | PageTheme |
| MS-15 | PDF tagged output / accessibility metadata | `generateTaggedPDF:false`; no metadata | Export (product decision) |
| MS-16 | Corrupt-settings recovery UI | Silent reset today | Global Settings/Data |

Values that **must not be exposed** (at least not without an Advanced disclosure
and a product decision): `pagePacking`, `calloutModes`, `wrapPolicy`, subtree-fit
internals, `calloutModeMinWidth`, trunk insets, stem/trunk-gap, exact page chrome
fractions, print skin colors, hidden-window timeouts, internal paths,
fingerprints, and `fontScale`/`headingScale` until the floor bug is fixed.

---

## 14. Migration and backward-compatibility needs

| ID | Need | Current state | Required work |
|---|---|---|---|
| MG-1 | Settings schema version | No version in `AppSettings` (`page-settings.ts:119-122`) | Add `settingsVersion`; pure migration chain; tests from prior shaped files. |
| MG-2 | Corrupt settings recovery | `readSettings` catch-all → defaults; next write overwrites | Keep a `.corrupt-<timestamp>` copy, warn in UI, offer reset/restore; test. |
| MG-3 | Unknown settings fields | Dropped on normalize/write | Preserve or explicitly drop with a version bump; roundtrip test. |
| MG-4 | Per-document override lifetime | Only `SessionTabState` for open tabs | Persistent map keyed by document id + path; migrate existing session tabs; cleanup on delete. |
| MG-5 | Document rename/move | Path key | Match by document id first, path fallback; decide orphan/merge behavior. |
| MG-6 | Density min 0.6 | Current clamp 0.8 | Widen `PAGE_DENSITY_MIN`; keep 0.8–1.2 values valid; re-tune floors; no stored-data migration. |
| MG-7 | Density step/rounding | normalize 0.01; slider 0.05 | Decide one canonical step; normalize to it. |
| MG-8 | Page setup defaults | Code 12 mm; spec/UX 20 mm | Product decision; document; no user documents to migrate. |
| MG-9 | Manual-break cleanup | Not implemented | Filter stale hints on load; delete/split/merge rules from ADR-0008; tests. |
| MG-10 | Legacy v1 page fields | Schema v2 migration strips `pageSetup`/`manualBreakBeforeBlockIds`/`viewState` (`migrations.ts:45-52`) | Accepted; no seeding. Keep test `core/test/fixtures/schema/v1.json`. |
| MG-11 | Continuous zoom duplicate | Settings + view state | Choose one; migrate stored `continuous.zoom` or remove it. |
| MG-12 | Future fields/default changes | No version; explicit values inherit old defaults | With MG-1, migrate defaults only where the product decides. |
| MG-13 | Export preferences (folder/date/metadata) | Not stored | Decide global vs per-document; schema migration. |
| MG-14 | Appearance/theme | Not stored | Add field; default dark; no migration needed. |

---

## 15. UI rework input — proposed structure and behavior

### 15.1 Contexts / pages

```text
Settings (app-level; must open with zero documents)
  Page
    Setup        size / orientation / margins / live sheet preview / reset
    Typography   Preset (Compact, Comfortable, Custom), Page density 60–120%,
                 body/heading/code/table sizes, line heights, advanced
    Layout       (Advanced disclosure) packing, callout mode preference,
                 child/callout indents, max/min card width, wrap/list indent
    Manual breaks list + add/remove + stale warnings
  Continuous
    Zoom (one real source), canvas width (future), type/spacing (future)
  Appearance
    Dark / Light / System (missing today)
  Editor
    Autosave interval, shortcut/single-key options (missing today)
  Export
    Default folder, filename/date, overwrite policy, PDF metadata, reveal
  Data / About
    Library path, app-data path, backups, version, corrupt-settings recovery
```

Page-specific surfaces:

- **Page toolbar** (one rail at ≥960): left page nav; center zoom/fit; right
  Page setup, Density, Export, overflow (Open in Continuous).
- **Page Setup sheet** opened from the Page toolbar and Settings; same controls,
  same preview; explicit Apply/Cancel.
- **Export sheet/panel**: destination + filename, overwrite, progress, cancel,
  done/failed/warnings, Reveal; final focus management.

### 15.2 Scope model (global vs document)

- A segmented control at the top of Page/Continuous: **All documents** /
  **This document**.
- Show an override dot on every field/group that differs from the global value;
  a group-level “Use global” action.
- The per-document override must be partial (only fields the user changed), so a
  later global change still propagates to untouched fields.
- Do **not** mark a document dirty or create an override merely by switching the
  scope radio (current density dialog has this trap: `Dialogs.tsx:1929-1999`).
- Explicit Apply/Cancel (already resolved in `page-settings-ui-plan.md`);
  do not mix instant-save and Apply.

### 15.3 Grouping and disclosure

- **First-class:** Page size/orientation/margins; preset; density; body/heading
  size; line height; card width; spacing; export destination.
- **Advanced:** code/table/label/chrome/marker sizes; `minContentWidth`;
  `maxWrapIndent`; callout gap; card border; page chrome toggles.
- **Hidden:** packing policy, callout modes, trunk/stem values, `fontScale`,
  `headingScale` until fixed, engine timeouts, skin colors, print heuristics.
- **Read-only:** computed page count, effective type values, fingerprint/debug
  information (developer panel only).

### 15.4 Buttons and states

- Primary **Apply**, secondary **Cancel**, destructive **Reset** (confirm),
  link-style **Use global**, **Done** only on info-only pages.
- No six equal buttons in one row (current Page toolbar). Group controls with
  separators; icon+label only for Export; icon-only for nav/zoom with tooltips.
- States to design and test:
  - no document open (Settings still usable; Export disabled with reason);
  - read-only document (settings allowed, export allowed);
  - Page Edit overlay open (commit before opening Settings or applying a
    geometry/density change; current pointer path commits, keyboard path does
    not);
  - invalid margins (inline error, not silent reset);
  - corrupt settings (warning + recovery);
  - settings write failure (visible banner/retry; no “saved” claim);
  - density low-end warning (“60% keeps 8 pt type; page count may not drop”);
  - export running/cancelled/failed/done, preflight block names, warnings.
- Naming: “Page density”, “Page setup”, “Typography”, “Layout”, “Manual breaks”,
  “Continuous canvas”, “Export PDF”; avoid internal terms (`PageTheme`, packing,
  B2, trunk, fingerprint).

### 15.5 Cleanup priorities visible to the user

1. Remove the dead Continuous zoom path before exposing zoom.
2. Remove the hand-maintained CSS fallback or generate it from the preset.
3. Rename Page `wrapIndent` to “List indent” or split the token.
4. Fix `maxWrapIndent` wording (per level, not cumulative).
5. Decide card radius/chapter gap ownership (Page vs shared).
6. Remove unused Page CSS variables or wire them.
7. Replace raw export error codes and truncation with human copy and “show all”.
8. Fix Help → Keyboard shortcuts to open a shortcuts sheet, not Settings.

---

## 16. Open product decisions (not code defects)

1. **Density semantics at 60%:** lower the body floor, lower the card floor, or
   accept “same type, narrower cards”? Is page-count monotonicity a promise?
2. **Density topology:** must callout mode stay fixed across density? If yes,
   plan modes at 100% and scale offsets; if no, update the checklist and label.
3. **Page defaults:** 12 mm (code) vs 20 mm (spec/UX); default size/orientation.
4. **Header/footer/page numbers:** always on, or user setting? chapter start
   always new page, or toggle?
5. **Export naming:** `<title>.pdf` vs spec `<title> — <date>.pdf`; default
   folder; PDF metadata title/creator; tagged PDF.
6. **Per-document override lifetime:** persist by document id across close,
   restart, rename, move; what happens on delete?
7. **Continuous zoom:** keep per-document view state only, or add a global
   default? Remove `ContinuousSettings.zoom` either way.
8. **Font scale/heading scale:** expose only after clamping final CSS values, or
   hide them and keep density as the single type lever?
9. **Appearance:** dark-only v1 or light/system in the UI rework?
10. **Manual-break entry point:** Page toolbar, block context menu, or both
    (post-page-roadmap recommends both).

---

## 17. Source index

| Area | Files |
|---|---|
| Page settings model / presets / lens | `packages/layout/src/page-settings.ts` |
| Layout options/types | `packages/layout/src/types.ts` |
| Page layout / callout modes | `packages/layout/src/layout.ts` |
| Page chrome / labels | `packages/layout/src/page-chrome.ts` |
| Page edges / trunks | `packages/layout/src/page-edges.ts` |
| Shared edge style | `packages/layout/src/edge-style.ts` |
| Renderer settings store | `apps/desktop/src/renderer/src/state/settings.ts` |
| Settings dialog | `apps/desktop/src/renderer/src/shell/Dialogs.tsx` |
| Page view/toolbar | `apps/desktop/src/renderer/src/page/PageView.tsx` |
| Page measurement/model | `page/measurement.ts`, `page/model.ts`, `page/usePageModel.ts`, `page/projection.ts` |
| Page Edit overlay | `page/PageBlockEditor.tsx`, `page/page-edit-state.ts` |
| Continuous tokens | `lib/design-tokens.ts`, `lib/geometry.ts`, `styles.css` |
| View state | `shared/view-state.ts`, `state/shell.ts` |
| Settings persistence | `main/library.ts`, `state/session.ts`, `App.tsx` |
| Export UI | `export/export-flow.ts`, `export/ExportStatusPanel.tsx`, `main/menu.ts`, `actions.ts` |
| Print/PDF | `print/entry.tsx`, `print/PrintDocument.tsx`, `print/print.css`, `packages/pdf/src/printModel.ts`, `main/export-*.ts` |
| Labs/tests | `packages/layout/test/density-lab.ts`, `tests/ui/m4d1-page-density.test.mjs`, `tests/ui/r1b-page-settings.test.mjs`, `tests/ui/m4d2-export-ui.test.mjs` |

**Reviewer note:** no product code, tests, spec, UX, ADR, or plan were modified
for this inventory. Values were read from the base commit and, for the 60%
projection, from a disposable probe under `artifacts/review-probe/` (gitignored).
