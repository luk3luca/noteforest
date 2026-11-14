# Settings inventory — frozen state (settings-schema freeze, 9 November 2026)

**Status:** **Frozen for the Settings/UI design** — this supersedes the pre-freeze inventory in the
full-codebase settings review. No product code is changed by this document.
**Owner:** Reviewer / Sentinel.
**Date:** 9 November 2026.
**Base:** `main` at `ca59fc5` (M4e3 docs; product code from `3280422` / integration `4ad695e`).
**Companion:** `docs/reviews/settings-freeze-review.md`.
**Source of truth for values:** `packages/layout/src/page-settings.ts`,
`packages/layout/src/types.ts`, `packages/layout/src/edge-style.ts`,
`apps/desktop/src/renderer/src/lib/design-tokens.ts`, `apps/desktop/src/shared/settings-file.ts`,
`apps/desktop/src/shared/document-settings.ts`, `apps/desktop/src/shared/view-state.ts`,
`apps/desktop/src/shared/export.ts`, and the print/export modules under `apps/desktop/src/main/`.

This catalog is the reference the UI design can build against: every numeric or geometric value a
future Settings surface might expose, the current default and clamp, the owner, whether it is
first-class, advanced, hidden, or engine-only, and whether it is frozen, a design decision, or a
cleanup item. Values marked **F**/**FH** are frozen; changing a frozen stored field needs a
`settingsVersion` bump and a pure migration. **ENG/E** values are engine constants that are
documented but never edited from Settings; **DES** values are still a design decision; **X** is
cleanup.

**Legend**

| Code | Meaning |
|---|---|
| **U** | Expose as a first-class user control. |
| **A** | Advanced disclosure; not in the default view. |
| **H** | Hidden / do not expose (internal, risky, or unresolved). |
| **E** | Engine constant; document but never edit from Settings. |
| **P** | Print-only fixed value. |
| **DES** | Design/rework decision; not part of the frozen schema today. |
| **X** | Remove, merge, rename, or deprecate before exposing. |
| **G / D / V / C / P** | Global default / per-document override / view state / canonical document (never settings) / print-only. |
| **F** | Frozen schema/value. |
| **FH** | Frozen but hidden until a named condition is met. |
| **ENG** | Engine constant (same as **E** in the UI column; kept for sortability). |

---

## 0. Executive summary

- **One settings pipeline is now durable and single-source:** global `settings.json`
  (`settingsVersion: 2`) → partial per-document override in `app-support/document-settings.json`
  (`version: 1`) → `mergePageSettings` → `effectivePageTheme` → `pageLayoutOptions` /
  `pageCssVariables` → Page Read/Edit, measurement, PDF.
- **Settings is app-level.** It opens with zero documents; the document scope is disabled with a
  reason; ⌘, and the palette reach the same surface.
- **Per-document overrides are durable.** They are keyed by canonical document id first with a
  path-only fallback, survive close/quit/reopen, re-key on rename/move, and leave an id-keyed
  orphan on delete that cannot match another document.
- **Writes are safe.** Both stores are serialized and atomic; the UI only says “saved” after the
  main-process write; failures are visible and retryable; a corrupt `settings.json` is copied to
  `settings.corrupt-<timestamp>.json` before any overwrite; unknown fields in the global file are
  preserved; a newer schema is read and warned about, never downgraded.
- **Continuous settings are gone.** `AppSettings` is `{ page }`; the only Continuous zoom is the
  per-document `DocumentViewState.zoom`. There is no dead settings control to build.
- **Density is 60–120%** with a floor-anchored type curve: body floor **7 pt**, `minContentWidth`
  floor **140**, card-cap floor **240** (ceiling 560). 60% is denser than 80/100 in type and boxes;
  Page and PDF consume one effective theme.
- **Topology is adaptive.** Density may move a parent from mode A to B2/stacked through the same
  geometric rule; a preset change remains density-only. The behavior is tested and the checklist is
  corrected to match.
- **Page and Continuous tokens are split.** `design-tokens.md` is an index; Page and Continuous
  values live in separate docs; `pageCssVariables` emits only the 16 variables the Page stylesheet
  consumes; the measurement host uses the Page cap, not a Continuous token.
- **Not frozen / remaining design work:** appearance, export defaults, manual-break UI/cleanup,
  Page chrome toggles, typography exposure, `fontScale`/`headingScale` (hidden until clamped),
  corrupt-map recovery, rename/move E2E, and the docs sweep.

---

## 1. Frozen ownership and resolution map

```text
Canonical document (document.json, schema v2)
  identity, chapters, blocks, content, branches, anchors, assets,
  schemaVersion, revision
  — no pageSetup, manualBreakBeforeBlockIds, viewState, PageTheme

Global personal settings (app-support/settings.json, settingsVersion: 2)
  AppSettings
    page: PageSettings
      setup: PageSetup
      theme: PageTheme
      manualBreakBeforeBlockIds: string[]

Per-document personal settings (app-support/document-settings.json, version: 1)
  entries: DocumentSettingsEntry[]
    documentId: string | null
    packagePath: string
    page?: PageSettingsOverride

Session (shell-session.json; view state only)
  tabs: packagePath, scrollTop, selectedBlockId, collapsed,
        layout, interactionMode, currentPage, pageZoom, pageFit, zoom
  — no pageSettingsOverride / continuousSettingsOverride

Resolved for one document
  PageSettings(doc) = mergePageSettings(app.page, override(doc))
  override(doc)     = find(entries, { documentId, packagePath })  // id first, path-only fallback
  effectivePageTheme(theme) = density lens applied once
```

Pipeline:

1. `migrateSettingsDocument` / `normalizeAppSettings` validate the file
   (`shared/settings-file.ts:65-85`, `page-settings.ts:826-833`).
2. `mergePageSettings` resolves presets, explicit values, margins, manual breaks
   (`page-settings.ts:699-721`).
3. `effectivePageTheme` applies density and floors exactly once; the output carries `density: 1`
   (`:404-476`).
4. `pageLayoutOptions` maps the effective theme to `LayoutOptions` (`:479-506`).
5. `pageCssVariables` maps it to the 16 Page CSS custom properties (`:526-548`).
6. `pageSettingsFingerprint` includes setup, stored theme, manual breaks, and the effective theme
   (`:348-356`).
7. Page Read/Edit, measurement, and print consume the same resolved object; print additionally
   requires the measured-run fingerprint (`packages/pdf/src/printModel.ts:220-263`).

**Write contract.** The renderer has one queue (`state/settings.ts:188-255`); the main process has
one queue per file (`main/library.ts:1282-1312`, `main/document-settings.ts:117-177`). A write is
reported saved only after `writeFileAtomic` (temp + fsync + rename + directory fsync) succeeds. The
Settings dialog awaits `flushSettingsWrites()` before showing “saved” and shows a retryable error
otherwise (`Dialogs.tsx:1954-2045`). Quit flushes the queue (`App.tsx:91-100`).

---

## 2. `settings.json` — frozen file contract

| ID | Item | Current | Notes |
|---|---|---|---|
| SF-1 | File location | `app-support/settings.json` | `main/library.ts:126-127`. Global personal settings, never in the document package. |
| SF-2 | Schema version | `settingsVersion: 2` | `shared/settings-file.ts:24`. A file without a version is v1 when it has `page`/`continuous`, v0 when empty; next write stamps 2. |
| SF-3 | v1 → v2 migration | Drop the dead `continuous` block; keep `page` | Pure (`shared/settings-file.ts:65-85`). Legacy 80–120 density values are valid at v2; no other stored-data migration. |
| SF-4 | Unknown fields | Preserved on write, including unknown keys inside `page`, `page.setup`, `page.margins`, `page.theme` | `settingsDocumentForWrite` merges known paths onto the previous raw object (`shared/settings-file.ts:94-123`). |
| SF-5 | Newer schema | Read and normalize for this session, warn, **never lower the version**, keep unknown fields | `main/library.ts:1244-1257`; `settingsDocumentForWrite` keeps a higher `storedVersion`. |
| SF-6 | Corrupt file | Parse failure → copy to `settings.corrupt-<timestamp>.json`, report `corrupt` + backup path, never overwrite on read | `main/library.ts:1229-1243`; `preserveCorruptFile` in `main/document-settings.ts:39-55`. |
| SF-7 | Unreadable file | Report `unreadable` + message; defaults for the session; no false save | `main/library.ts:1213-1227`. |
| SF-8 | Missing file | Normal `defaults`; defaults are written on the first user change | `main/library.ts:1219-1222`. |
| SF-9 | Read status | `ok`, `defaults`, `corrupt`, `unreadable`, `newer`; optional `message`, `backupPath`, `version`, `migrated` | `shared/api.ts:141-153`. |
| SF-10 | Write serialization | Last write wins; each write reads the previous raw file immediately before merging, so unknown fields are not lost | `main/library.ts:1265-1307`. |
| SF-11 | Atomicity | Temp file, `fsync`, rename, directory `fsync` | `packages/core/src/node/atomic.ts:38-80`. |
| SF-12 | Partial global update | `updateAppSettings` merges a patch; a density-only patch leaves setup/preset/breaks intact | `state/settings.ts:132-156, 288-293`. |
| SF-13 | Full-replace API | `setAppSettings` still replaces the whole object; it is used by the test bridge, not the Settings dialog | `state/settings.ts:279-286`. The future UI must use `updateAppSettings` or an explicit patch. |

**Unknown-field caveat.** The global file preserves unknown fields; the per-document map does not
(§3, S3-4 in the review). This is a future-compat gap, not a current data-loss defect.

---

## 3. `document-settings.json` — frozen file contract

| ID | Item | Current | Notes |
|---|---|---|---|
| DS-1 | File location | `app-support/document-settings.json` | `main/document-settings.ts:28-37`. Outside the session and the document package. |
| DS-2 | File version | `version: 1` | `shared/document-settings.ts:23, 105-115`. The version is written but not yet read/migrated (a new field needs a version 2 policy). |
| DS-3 | Entry | `{ documentId: string \| null, packagePath: string, page?: PageSettingsOverride }` | `shared/document-settings.ts:25-36`. |
| DS-4 | Identity | Canonical document id first; a path-only entry is the fallback; an id-keyed entry never matches a different id | `findDocumentSettingsEntry` (`:123-138`). |
| DS-5 | Rename/move | The id-keyed entry is re-keyed to the new path on open/bootstrap | `adoptDocumentSettingsEntry` (`:172-188`); wiring `App.tsx:138-142`, `actions.ts:133-143`. |
| DS-6 | Delete | No document-delete command in v1; the entry remains as an id-keyed orphan and cannot match another document | Documented `shared/document-settings.ts:10-15`; tested `apps/desktop/test/document-settings.test.ts:80-102`. |
| DS-7 | Legacy migration | Pre-S2-2 session overrides are read once, mapped to the document id when the package opens, and written to the map; an existing durable entry wins | `main/library.ts:1344-1423, 1467-1481`; `migrateSessionOverrides` (`shared/document-settings.ts:197-217`). |
| DS-8 | Corrupt/unreadable map | Preserved and reported; per-document overrides are empty for the run; **writes are refused** rather than silently replacing the damaged map | `main/document-settings.ts:85-115, 156-171`; warning `Dialogs.tsx:2104-2134`. |
| DS-9 | Write serialization | One process-wide read-modify-write queue; last command wins; atomic temp→rename | `main/document-settings.ts:117-177`. |
| DS-10 | Unknown fields | Dropped on normalize/serialize; the map is re-serialized from known fields | `normalizeDocumentSettingsEntry` (`shared/document-settings.ts:65-80`); see S3-4. |
| DS-11 | Duplicates | Duplicate id/path entries collapse to one (last write wins) | `normalizeDocumentSettingsFile` (`:86-103`), `upsertDocumentSettingsEntry` (`:145-166`). |
| DS-12 | Determinism | Entries are sorted by path; the file ends with a newline | `serializeDocumentSettingsFile` (`:105-115`). |

---

## 4. Page setup

Source: `packages/layout/src/page-settings.ts:15-38, 282-338, 575-598`.

| ID | Setting / field | Default | Range / clamp | Scope | UI | Freeze | Notes |
|---|---|---|---|---|---|---|---|
| PS-1 | `setup.size` | `A4` | `A4` / `A5` / `Letter` | G, D | **U** | F | No UI yet; document override supported. |
| PS-2 | `setup.orientation` | `landscape` | `portrait` / `landscape` | G, D | **U** | F | Document-wide by design; no mixed orientation. |
| PS-3 | `setup.margins.top` | `12` mm | `0–100`; impossible margins fall back to all 12 mm | G, D | **U** | F | Silent fallback today; the design owns an inline validation/warning. |
| PS-4 | `setup.margins.right` | `12` mm | same | G, D | **U** | F | same. |
| PS-5 | `setup.margins.bottom` | `12` mm | same | G, D | **U** | F | same. |
| PS-6 | `setup.margins.left` | `12` mm | same | G, D | **U** | F | same. |
| PS-7 | Page width/height mm | A4 210 × 297; A5 148 × 210; Letter 215.9 × 279.4; swapped for landscape | fixed by size/orientation | E/P | **H** | ENG | `pageDimensionsMm` (`:282-307`). |
| PS-8 | Page width/height px | `mm × 96/25.4` | derived | E/P | **H** | ENG | `PX_PER_MM`, `mmToPx` (`:309-313`). |
| PS-9 | Content width/height px | page minus margins | derived | E/P | **H** | ENG | `pageGeometry` (`:315-335`). |
| PS-10 | Chrome band fractions | header `0.30 × top`, ghost `0.62 × top`, footer `0.30 × bottom`, continues `0.60 × bottom` | fixed fractions | E/P | **H** | ENG | `page-chrome.ts:40-50`; at 0 margins chrome overlaps content. |
| PS-11 | Cross-page label insets | `-margin + 2`, `maxWidth = max(18, margin − 4)` | fixed | E/P | **H** | ENG | `page-chrome.ts:198-213`. |
| PS-12 | Default setup | A4 landscape, 12 mm all sides | — | G | **U** (as a default) | F | Code 12 mm; spec v0.5/UX still say 20 mm — a design decision, not a code defect (§20). |
| PS-13 | Page size fixed to A4 in spec | — | — | C | **X** (doc) | X | Spec §pageSetup is stale; ADR-0008 supports A5/Letter. R4 docs sweep. |
| PS-14 | Header/footer content | document title, chapter title, `Page N of M`, ghost/continues labels | fixed | E/P | **H/A** | **DES** | No on/off or content setting; the design may add toggles (DES, version bump). |

**Frozen behavior:** the page setup is personal (global default + per-document override), never in
`document.json`. A size/orientation/margin change re-paginates; pages are derived.

---

## 5. PageTheme typography

Source: `page-settings.ts:49-109, 139-224, 600-679`; CSS consumption `styles.css:4458-4707`.

Defaults are **Compact** (product default) / **Comfortable**. Ranges are the `resolveTheme` clamps.
The density column describes `effectivePageTheme`.

| ID | Field | Compact | Comfortable | Range / clamp | Density lens | UI | Freeze | Consumers / notes |
|---|---|---:|---:|---|---|---|---|---|
| TY-1 | `preset` | `compact` | `comfortable` | `compact` / `comfortable` / `custom` | not scaled | **U** | F | Preset switch starts from that preset, then explicit overrides. `custom` is a marker; no preset object. |
| TY-2 | `density` | `1` | `1` | `0.6–1.2`, step `0.05`, default `1` | applies once, output `1` | **U** | F | Page only; the one user-facing type/box lever. §7. |
| TY-3 | `fontScale` | `1` | `1` | `0.5–2` | not scaled by density | **H** | FH | Multiplies every CSS type size **after** the floor (`pageCssVariables`), so `0.5` can render below 7 pt. Keep hidden until the final clamp (review S3-1; original S3-3). |
| TY-4 | `bodyPt` | `9` | `10.5` | `6–24` | floor-anchored curve | **U** (advanced raw) | F | Body + prose. |
| TY-5 | `bodyLine` | `1.3` | `1.45` | `1–2.5` | not scaled | **U** (advanced) | F | Body line height. |
| TY-6 | `headingScale` | `1` | `1` | `0.5–2` | not scaled by density | **H** | FH | Applied after heading floors; can make headings smaller than body. Keep hidden until fixed (review S3-1; original S3-3). |
| TY-7 | `heading1Pt` | `14` | `16` | `8–40` | × density, ≥ body + 3 | **U** (advanced) | F | H1. |
| TY-8 | `heading2Pt` | `12` | `13.5` | `7–32` | × density, ≥ body + 1.5 | **U** (advanced) | F | H2. |
| TY-9 | `heading3Pt` | `10.5` | `12` | `6–28` | × density, ≥ body + 1 | **U** (advanced) | F | H3. |
| TY-10 | `codePt` | `8` | `8.75` | `5–20` | × density, floor 7 | **U** (advanced) | F | Code block. |
| TY-11 | `codeLine` | `1.3` | `1.45` | `1–2.5` | not scaled | **U** (advanced) | F | Code line height. |
| TY-12 | `tablePt` | `8.5` | `9.5` | `5–20` | × density, floor 7 | **U** (advanced) | F | Tables. |
| TY-13 | `tableLine` | `1.25` | `1.35` | `1–2.5` | not scaled | **U** (advanced) | F | Table line height. |
| TY-14 | `labelPt` | `9` | `11` | `5–20` | × density, floor 7 | **U** (advanced) | F | Block label. |
| TY-15 | `chromePt` | `7.5` | `8` | `5–16` | × density, floor 6 | **A** | F | Header/footer. |
| TY-16 | `markerPt` | `7` | `7.5` | `5–16` | × density, floor 6 | **A** | F | Continuation chips, edge labels. |
| TY-17 | Heading line height | `1.25` (hard-coded) | same | fixed CSS | not scaled | **H** | ENG | No `headingLine` field. |
| TY-18 | Label line height | `1.2` (hard-coded) | same | fixed CSS | not scaled | **H** | ENG | No `labelLine` field. |
| TY-19 | Inline code size | `0.86em` | same | fixed CSS | not scaled | **H** | ENG | `styles.css:4566-4573`. |
| TY-20 | Code line min height | `1.35em` | same | fixed CSS | not scaled | **H** | ENG | `styles.css:4593-4599`. |
| TY-21 | Table cell padding | `cardPadding × 0.75` vertical | same | derived | follows `cardPadding` | **A** | ENG | `styles.css:4612-4619`. |

## 6. PageTheme boxes, spacing, and indents

| ID | Field | Compact | Comfortable | Range / clamp | Density lens | UI | Freeze | Notes |
|---|---|---:|---:|---|---|---|---|---|
| BX-1 | `cardPadding` | `8` | `12` | `0–40` | × density | **U** | F | Card geometry, measurement chrome, code/list/table CSS. |
| BX-2 | `cardBorder` | `1` | `1` | `0–8` | not scaled | **A** | F | Card box; measurement chrome. |
| BX-3 | `segmentGap` | `4` | `8` | `0–32` | × density | **U** | F | Segment spacing, list/table. |
| BX-4 | `siblingGap` | `16` | `24` | `0–96` | × density | **A** | F | Direct-child group gap; Page only. |
| BX-5 | `wrapIndent` | `12` | `18` | `0–96` | × density | **A / X rename** | F | Two Page roles: nested-list indent (`projection.ts:182`) and a floor in `wrapOriginX` (`layout.ts:355-370`). Label “List indent” if exposed; do not call it “wrap”. |
| BX-6 | `maxWrapIndent` | `36` | `54` | `0–192`, ≥ `wrapIndent` | × density | **A** | F | Applied **per level**, not cumulative. |
| BX-7 | `childIndent` | `26` | `26` | `0–96`; effective ≥ `childTrunkInset + 12 + 2` | × density | **A** | F | R2i wrapped direct-child origin; Page only. |
| BX-8 | `childTrunkInset` | `12` | `12` | `0–96` | × density | **A / H** | F | B2 outer/child below trunk. |
| BX-9 | `calloutTrunkInset` | `24` | `24` | `0–96` | × density | **A / H** | F | B2 inner/callout below trunk. |
| BX-10 | `calloutCardIndent` | `38` | `38` | `0–160`, ≥ trunk inset | × density | **A / H** | F | B2 callout card left offset. |
| BX-11 | `calloutRightGap` | `24` | `24` | `stemMin` 12–96 | × density, floor 12 | **A / H** | F | Mode A lane gap. |
| BX-12 | `calloutModeMinWidth` | `240` | `240` | `0–800` | **not scaled** | **H** | F | Mode A gate. Contributing to adaptive density topology (§8). |
| BX-13 | `calloutGap` | `12` | `20` | `0–96` | × density | **A** | F | Callout vertical gap. |
| BX-14 | `maxCardWidth` | `420` | `420` | `120–2000`; density band 240–560 for preset-range values | × density | **U** | F | Page card cap and image cap. A custom cap outside the band keeps its own scaling. |
| BX-15 | `minContentWidth` | `160` | `160` | `80–800`; density floor 140 for preset-range values | × density | **A** | F | Readability floor; `content-too-wide` defect threshold. |
| BX-16 | `chapterGap` | `32` (engine default) | `32` | fixed in `pageLayoutOptions` | not scaled | **H** | ENG | `page-settings.ts:499-501`; the Continuous shell gap is 28. |
| BX-17 | `cardRadius` | `4` (shell token) | same | fixed | not scaled | **H** | ENG | Page cards read `--nf-card-radius`; documented shared primitive. |
| BX-18 | List indent | `wrapIndent` | `wrapIndent` | same as BX-5 | × density | **U** | F | Same field as BX-5; `projection.ts:182`, `measurement.ts:195`; label “List indent” only once renamed. |
| BX-19 | `pagePacking` | `beside` | `beside` | `beside` / `stacked` / `compaction` | not scaled | **H** | F | `compaction` is a lab oracle only; `stacked` is legacy geometry. Presets use `beside`; Comfortable is density-only. |
| BX-20 | `calloutModes` | true when `pagePacking === 'beside'` | same | boolean | not scaled | **H** | ENG | Derived (`page-settings.ts:493-498`); not a setting. |

---

## 7. Density (frozen)

Source: `page-settings.ts:237-476`; UI `Dialogs.tsx:2149-2267`; lab
`packages/layout/test/density-lab.ts`; real-DOM evidence `tests/ui/m4d1-page-density.test.mjs`.

| Item | Frozen value |
|---|---|
| Slider range | **60–120%** (`PAGE_DENSITY_MIN` 0.6, `MAX` 1.2) |
| Step | **5%** (`PAGE_DENSITY_STEP` 0.05) |
| Default | **100%** |
| Normalization | clamp 0.6–1.2, snap to the 5% step, round to 2 decimals (`0.62 → 0.60`, `0.63 → 0.65`) |
| Stored representation | raw `PageTheme.density`; the effective theme carries `density: 1` |
| Body/label floor | **7 pt** (`PAGE_BODY_PT_FLOOR`) |
| Code/table floor | **7 pt** |
| Chrome/marker floor | **6 pt** |
| `minContentWidth` floor | **140 px** for preset-range values |
| `maxCardWidth` band | **240–560 px** for preset-range values; 60% preset lands at 252 |
| Heading floors | H1 body + 3, H2 body + 1.5, H3 body + 1 |
| Low-band curve | `lowBand = (density − 0.6) / 0.4`; `type(base, floor) = floor + (base − floor) × lowBand`; a custom base below its floor scales proportionally instead of being enlarged |
| Above 100% | type and boxes scale proportionally |
| Boxes/indents | scale proportionally all the way down, with their own floors/guards |
| Identity | the fingerprint includes the stored theme **and** the effective theme, so floors are part of the model identity |

**Compact at the slider ends (effective values):**

| Step | body | H1 | code | table | label | chrome | marker | padding | card cap | min content | child indent |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 60% | 7 | 10 | 7 | 7 | 7 | 6 | 6 | 4.8 | 252 | 140 | 21.2 |
| 70% | 7.5 | 11 | 7.25 | 7.38 | 7.5 | 6.38 | 6.25 | 5.6 | 294 | 140 | 22.4 |
| 80% | 8 | 12 | 7.5 | 7.75 | 8 | 6.75 | 6.5 | 6.4 | 336 | 140 | 23.6 |
| 90% | 8.5 | 13 | 7.75 | 8.13 | 8.5 | 7.13 | 6.75 | 7.2 | 378 | 144 | 24.8 |
| 100% | 9 | 14 | 8 | 8.5 | 9 | 7.5 | 7 | 8 | 420 | 160 | 26 |
| 110% | 9.9 | 15.4 | 8.8 | 9.35 | 9.9 | 8.25 | 7.7 | 8.8 | 462 | 176 | 28.6 |
| 120% | 10.8 | 16.8 | 9.6 | 10.2 | 10.8 | 9 | 8.4 | 9.6 | 504 | 192 | 31.2 |

The exact values are asserted in `density-lab.test.ts` and `page-settings.test.ts`; the table rounds
where the lens rounds. At 65/75/85/95% the curve interpolates; there is no plateau where 60% and 80%
share a type size. One subtlety: `tablePt`/`codePt` interpolate from 7 pt at 60%, so the table has
more precision than the compact preset's whole-point starting value; that is expected.

**Real-DOM density lab (M4e2, re-run in this review):**

| Fixture | 60% | 70% | 80% | 90% | 100% | 110% | 120% |
|---|---:|---:|---:|---:|---:|---:|---:|
| scale-300 | **24** | 25 | 27 | 27 | 27 | 30 | 37 |
| showcase | **16** | 18 | 18 | 19 | 21 | 21 | 22 |
| stress | **27** | 27 | 30 | 32 | 35 | 38 | 48 |

**85–95% trade-off (recorded):** to keep the low band monotone, 90% body is **8.5 pt** (was 8.1 pt
with the old clamp) and the real-DOM page counts moved 25→27 / 19→19 / 30→32 on
scale-300/showcase/stress. 80% is unchanged (8 pt, 6.4 px, 336 px card). 60–70% is the dense
optimum; the old “90% is the safest dense step” advice is not supported by the new curve.
**No page-count monotonicity above 100%:** 110/120% can add pages. Density is a lens, not a
page-count promise; the lab records it.

**Page/PDF parity:** `m4c2-pdf-export.test.mjs` exports at 60/120, checks the produced PDF page
counts, text, and preflight effective-type metrics; `print-parity.test.ts` checks the 90% CSS
identity. One `effectivePageTheme` feeds Page Read/Edit, measurement, and print.

---

## 8. Page packing and callout topology (frozen, hidden)

| ID | Item | Frozen behavior | UI | Freeze |
|---|---|---|---|---|
| PK-1 | `pagePacking` | Presets use `beside`; `stacked` is the historical R2a geometry; `compaction` is a lab oracle | **H** | F |
| PK-2 | `calloutModes` | Enabled when `pagePacking === 'beside'`; derived, not a separate setting | **H** | ENG |
| PK-3 | `wrapPolicy` | `group-left-origin` product default; other values are lab oracles | **H** | ENG |
| PK-4 | Subtree fit | R2i: the whole primary subtree decides right/below; a failing subtree moves the atomic direct-child group below at `childIndent` | **H** | F |
| PK-5 | Mode selection | Per parent and deterministic: **A** when the free right lane fits `calloutModeMinWidth` (240, **not** density-scaled) and the callouts; otherwise **B2** when the two below offsets keep a readable card and stem; otherwise **stacked** | **H** | F |
| PK-6 | Density topology coupling | Density may flip a parent A→B2/stacked through the geometric rule; the same density always resolves the same mode; Page Read/Edit/PDF agree | **H** | F |
| PK-7 | Callout mode preference | No user preference in v1; the product decision is adaptive geometry | **DES** | **DES** |

Evidence: `packages/layout/test/density-topology.test.ts` records A at 60–100% and B2 at 110–120%
on a synthetic parent, proves the R2j two-trunk geometry after the flip, and asserts no blocking
defect at either end. The checklist §4.1/§7.1 now matches this decision.

---

## 9. Manual breaks

| ID | Item | Current | Owner | UI | Freeze | Notes |
|---|---|---|---|---|---|---|
| MB-1 | `manualBreakBeforeBlockIds` | `[]`; deduped non-empty block IDs; unknown IDs warned | G, D | **U** | F | `page-settings.ts:110-116, 681-691`. Never canonical. |
| MB-2 | Where honored | Before a block only when a safe break exists; chapter start y=0 is a no-op | E | **U (explain)** | F | `paginator.ts:100-180`; stale/unhonorable hints produce `impossible-hint` warnings. |
| MB-3 | Cleanup on delete | Drop the hint | D | **DES** | **DES** | ADR-0008 `:95-103`; **not implemented**. |
| MB-4 | Cleanup on split | Keep on the original | D | **DES** | **DES** | same. |
| MB-5 | Cleanup on merge | Keep if either source had one | D | **DES** | **DES** | same. |
| MB-6 | Stale filtering on load | Paginator warns; settings retain | E | **DES** | **DES** | No UI list to remove stale hints. |
| MB-7 | Fingerprint identity | Array order included | E | **H** | F | Same set in a different order changes the fingerprint (re-measure only; S4). |
| MB-8 | Manual-break UI entry | None | — | **DES** | **DES** | Page toolbar, block context menu, or both; the post-page roadmap recommends both. |
| MB-9 | UI list + remove | None | — | **DES** | **DES** | Needs the cleanup rules above. |

The array, paginator semantics, and persistence are frozen. The feature is not user-reachable in
v1; the design owns the entry point and the cleanup work.

---

## 10. Continuous (no settings namespace)

Source: `shared/view-state.ts:40-60`; `editor/DocumentEditor.tsx`; `design-tokens.ts`;
`design-tokens-continuous.md`.

| ID | Item | Default | Range | Owner | UI | Freeze | Status |
|---|---|---|---|---|---|---|---|
| CO-1 | `ContinuousSettings` / `ContinuousSettings.zoom` | — | — | — | — | **X** | **Removed** by M4e1 (S2-6). `AppSettings` is `{ page }`; no session override, no normalizer. A legacy `continuous` block is dropped by the v1→v2 settings migration. |
| CO-2 | Per-document Continuous zoom | `1` | `0.5–2`, step 0.01 | V (per document) | **U** | F | `DocumentViewState.zoom`; `DocumentEditor` uses this. |
| CO-3 | Page zoom | `1` | `0.1–2.5`, step 0.01 | V (per document) | **U** | F | `clampPageZoom`; `PageView.tsx:82-84` duplicates the clamps (S3-11). |
| CO-4 | Canvas logical width | 3200 px; content 3120 px | fixed | E | **H** | ENG | `DESIGN_TOKENS.canvasMaxWidth`; horizontal scroll. |
| CO-5 | Canvas padding X/top/bottom | 40/40/88 px | responsive 32/32/72 and 28/28/64 | E | **H** | ENG | Ratified shell token. |
| CO-6 | Continuous chapter gap | 28 px | fixed | E | **H** | ENG | Shell token; Page is 32. |
| CO-7 | Continuous child gap | 24 px | fixed | E | **H** | ENG | Shell token. |
| CO-8 | Continuous child row gap | 16 px | fixed | E | **H** | ENG | Shell token. |
| CO-9 | Continuous card padding/radius | 10 / 4 px | fixed | E | **H** | ENG | 4 px radius is the documented shared primitive. |
| CO-10 | Continuous block width bounds | top-level 160–480; child 144–420 | fixed | E | **H** | ENG | Content-driven. |
| CO-11 | Continuous row indent | 26 px | fixed | E | **H** | ENG | Same number as Page `childIndent`, different semantics; documented. |
| CO-12 | Continuous wrap indent (reserved) | 18 px | fixed | E | **H** | ENG | `DESIGN_TOKENS.wrapIndent`/`GEOMETRY.wrapIndent`; no current consumer; documented as reserved in `design-tokens-continuous.md:68-71`. |
| CO-13 | Default zoom/fit | 1 / fit width via menu | view state | V | **U** | F | Existing view controls; not a Settings item yet. |
| CO-14 | Continuous font/width/spacing | — | — | — | **DES** | **DES** | ADR-0008 future; no fields. A future global Continuous namespace needs a migration. |

No Settings control should be built on a Continuous zoom/type field: there is no such field.

---

## 11. App / shell / view state

| ID | Item | Current | Range | Owner | UI | Freeze | Notes |
|---|---|---|---|---|---|---|---|
| AP-1 | Appearance theme | dark only; “Graphite · dark (light tokens reserved)” | — | G | **DES** | **DES** | No `AppSettings` field; UX says light mode available. |
| AP-2 | Library path | `~/Documents/NoteForest` | env override in tests | E | **U (About/Data)** | ENG | `library.ts:94-98`; not a preference today. |
| AP-3 | App-support path | OS app-support | fixed | E | **U (About/Data)** | ENG | `library.ts:100-102`. |
| AP-4 | Sidebar width | 264 px | 180–640 | V/G | **A / shell** | F | Session state; not Page settings. Code/inventory use 180/264/640; the old 208–360 was the M2 range. |
| AP-5 | Sidebar collapsed | false | bool | V/G | **U** | F | Session state. |
| AP-6 | Collapsed topics | `{}` | per document | V | **U** | F | Session state; not settings. |
| AP-7 | Default layout | Continuous | continuous/page | V | **U** | F | View state; no global default. |
| AP-8 | Interaction mode | Edit (default); switching layout preserves it | edit/read | V | **U** | F | `view-state.ts`; Page Edit is opt-in and never auto-opens. |
| AP-9 | Current page | 1 | clamped | V | **U** | F | View state. |
| AP-10 | Page zoom | 1 | 0.1–2.5, step 0.01 | V | **U** | F | `PageView` duplicates the clamp constants (S3-11). |
| AP-11 | Page fit | `page` | page/width/none | V | **U** | F | View state. |
| AP-12 | Settings read status | `ok` / `defaults` / `corrupt` / `unreadable` / `newer` | — | G | **U (warning)** | F | §2; the Settings dialog shows warning/backup/reset/dismiss. |
| AP-13 | Settings save status | `idle` / `saving` / `saved` / `error` | — | G | **U (status)** | F | `state/settings.ts:48-51`; no success before the write. |
| AP-14 | Settings retry | one retry of the last failed write | — | G | **U** | F | `state/settings.ts:358-362`; the dialog shows Retry. |
| AP-15 | No-document Settings | usable; document controls disabled with reason | — | G | **U** | F | `Dialogs.tsx:96-101, 2167-2191`; tested. |
| AP-16 | Autosave delay | 800 ms | fixed | E | **A?** | ENG | `save-coordinator.ts:33`; no setting. |
| AP-17 | Session save debounce/interval | 600 ms / 5 s | fixed | E | **H** | ENG | `App.tsx:425-449`. |
| AP-18 | Flush timeout | 2500 ms | env override | E | **H** | ENG | `main/index.ts:130-136`. |
| AP-19 | Window default/min size | 1440×900 / 960×640 | fixed | E | **H** | ENG | `main/index.ts:258-261`. |
| AP-20 | Single-key shortcut disable | — | — | G | **DES** | **DES** | UX says configurable; no field. |
| AP-21 | Recent/closed tabs | session | in memory | V | **U** | F | Session state; not settings. |
| AP-22 | Help → Keyboard shortcuts | opens Settings | — | — | **X** | X | `menu.ts:170-177`; final menu design owns it. |
| AP-23 | Recovery action for a corrupt document map | warning + Dismiss only | — | G | **DES** | **DES** | No reset/restore for `document-settings.json` (S3-3). |

---

## 12. Shared edge primitives (`EDGE_STYLE`) and Page edge values

Source: `packages/layout/src/edge-style.ts:27-64`; consumed by Continuous, Page Read/Edit, print.

| ID | Token | Value | Owner | UI | Freeze | Notes |
|---|---|---:|---|---|---|---|
| ED-1 | `gap` | 2 px | Shared/E | **H** | ENG | Arrow-tip gap. |
| ED-2 | `radius` | 2 px | Shared/E | **H** | ENG | Near-right corner. |
| ED-3 | `stemMin` | 12 px | Shared/E | **H** | ENG | Final stem; Page `childIndent`/`calloutRightGap` floors. |
| ED-4 | `laneMin` / `laneMax` | 2 / 14 px | Shared/E | **H** | ENG | Shared trunk lane. |
| ED-5 | `trunkInset` | 12 px | Shared/E | **H** | ENG | Below trunk. |
| ED-6 | `trunkGap` | 0 px | Shared/E | **H** | ENG | Attached below trunk. |
| ED-7 | `arrowLength` / `arrowHalfWidth` | 6 / 3 px | Shared/P | **H** | ENG | Fixed primary head. |
| ED-8 | `edgeWidth` / `active` / `muted` | 1.25 / 1.75 / 1 | Shared/E | **H** | ENG | Stroke widths. |
| ED-9 | `minGap` | 4 px | Shared/E | **H** | ENG | Routed segment gap. |
| ED-10 | `referenceArrowLength` / `spread` | 7 px / 0.46 | Shared/E | **H** | ENG | Open chevron. |
| ED-11 | `pageClearance` | 3 px | Page router/E | **H** | ENG | Obstacle clearance. |
| ED-12 | `pageLaneStep` | 4 px | Page router/E | **H** | ENG | Parallel duplicate edges. |
| ED-13 | `pageTurnPenalty` | 60 px | Page router/E | **H** | ENG | Search cost only. |
| ED-14 | `LEGACY_BESIDE_READABLE_WIDTH` | 144 px | Page legacy/E | **H** | ENG | Only the `calloutModes: false` regression oracle (`layout.ts:156, 1455`). |
| ED-15 | `LEGACY_BESIDE_ANCHOR_INSET` | 16 px | Page legacy/E | **H** | ENG | Same oracle (`layout.ts:162, 1443`). |

`CALLOUT_ROW_INDENT` is removed (M4e3). The legacy beside lane uses `LayoutOptions.childIndent`.
Page `stemMin`/`trunkGap`/`rowIndent` ownership is documented: stem/trunk-gap are shared engine
primitives; Page child/callout indents are PageTheme fields; Continuous row indent is a shell token.

---

## 13. Print / PDF-only values

| ID | Item | Value | UI | Freeze | Notes |
|---|---|---|---|---|---|
| PR-1 | Print page size | resolved PageSetup | **P** | F | One fixed sheet per derived page; `@page` size = geometry. |
| PR-2 | Print margins | 0 in `printToPDF`; page margins are internal content padding | **P** | F | `export-preflight.ts:253-264`. |
| PR-3 | Print scale/background | scale 1, `printBackground: true`, `preferCSSPageSize: true`, no header/footer | **P** | F | `pdfOptionsFor`. |
| PR-4 | Tagged PDF | `generateTaggedPDF: false` | **P/DES** | **DES** | Accessibility metadata decision. |
| PR-5 | Print skin colors | white background; ink `#1a1f23`; edge `#2b2b2b`; reference `#4d4d4d`; warnings `#7a4b00` etc. | **P/H** | ENG | `print.css:20-104`; always light. |
| PR-6 | Page chrome text | document title, chapter title, `Page N of M`, ghost/continues labels | **P** | F | Shared Page Read/print; no header/footer toggle. |
| PR-7 | Page chrome fractions | 0.30/0.62/0.30/0.60 × margins | **H/E** | ENG | `page-chrome.ts:40-50`. |
| PR-8 | Hidden print window | 1200×900, white, `backgroundThrottling:false`, sandbox, no preload | **P** | ENG | `export-window.ts:95-116`. |
| PR-9 | Load/measure/print timeouts | 30 s / 180 s / 180 s | **E** | ENG | `export-window.ts:29-31`. |
| PR-10 | Snapshot timeout | 20 s | **E** | ENG | `export-service.ts:28`. |
| PR-11 | Image/font/frame settles | 5 s / 5 s / 500 ms (print); 4 s / 150 ms (measurement) | **E** | ENG | `print/entry.tsx:71-74`; `page/measurement.ts:38-39`. |
| PR-12 | Completed job retention | 25 | **E** | ENG | `export-job.ts:276`; stale partial 1 h (`:172`). |
| PR-13 | PDF size tolerance | 0.25 mm | **E** | ENG | `shared/export.ts:292`. |
| PR-14 | Export filename | `<title>.pdf` (sanitized; empty → `Untitled.pdf`) | **DES** | **DES** | `shared/export.ts:75-82`; spec says `<title> — <date>.pdf`; no default folder. |
| PR-15 | PDF metadata | not set (print HTML title is “NoteForest print”) | **DES** | **DES** | Spec §11.9 asks title/subject/creator/page size/date. |
| PR-16 | Export progress poll | 120 ms | **E** | ENG | `export-flow.ts:292`. |
| PR-17 | Export panel truncation | 6 warnings / 8 error details | **A** | **DES** | `ExportStatusPanel.tsx:153-160, 197-207`; final UI shows all. |
| PR-18 | Print model identity | resolved setup + stored theme + manual breaks + effective theme | **H** | F | `pageSettingsFingerprint`; a stale model fails the export. |

---

## 14. Export UI defaults (M4d2, design-owned)

| ID | Item | Current | UI | Freeze | Notes |
|---|---|---|---|---|---|
| EX-1 | Entry points | File → Export PDF… (`⌘⇧E`), palette, Page toolbar | **U** | F | All call one flow. |
| EX-2 | No active document | toast error; no save dialog | **U** | F | Correct; tested. |
| EX-3 | Read-only document | export allowed | **U** | F | Read-only gate does not block export. |
| EX-4 | Page Edit open | commits before snapshot | **U** | F | `App.tsx:217-231`; verified. |
| EX-5 | Save dialog | filename only; OS folder | **DES** | **DES** | Decide Documents/Downloads/last-used/per-document. |
| EX-6 | Overwrite | explicit renderer prompt; engine no-clobber | **U** | F | No setting; product decision if “replace without asking” exists. |
| EX-7 | Progress/cancel | phase-based progress, cancel, terminal states | **U** | F | Temporary panel; final sheet in the UI rework. |
| EX-8 | Reveal in Finder | main-process `shell.showItemInFolder` | **U** | F | Not E2E exercised (avoids opening Finder). |
| EX-9 | Warnings | manual break/anchor/asset/frames/images/fonts/console | **U/A** | F | Final UI should show all warnings without truncation. |
| EX-10 | Preflight failure | names affected block; typed error | **U** | F | Good. |
| EX-11 | Default export mode | Page PDF only | **E** | F | No reader PDF; ADR-0002. |
| EX-12 | Export page range/selection | none | **DES** | **DES** | v1 is whole document; product decision. |
| EX-13 | PDF metadata/filename date | not set / no date | **DES** | **DES** | Spec vs implementation gap. |

---

## 15. Token ownership after M4e3 (frozen)

**Documents**

- `docs/design-tokens.md` is an ownership index only; it links the two surface docs and records the
  shared primitives. It does not mix Page/Continuous values.
- `docs/design-tokens-page.md` owns `PageSetup`, `PageTheme`, density, wrap/indent semantics,
  packing/callout topology, chrome/labels, Page route values, the Page CSS map, engine defaults,
  print constraints, and removed legacy values.
- `docs/design-tokens-continuous.md` owns Continuous zoom/view state, shell tokens/CSS variables,
  router-only tokens, runtime variables, callout lane/safe zone, shared edge primitives, stacking,
  and future resize tokens.

**Page CSS map (exactly 16 keys):**

`--nf-page-body-size`, `--nf-page-body-line`, `--nf-page-label-size`,
`--nf-page-heading-1/2/3`, `--nf-page-code-size`, `--nf-page-code-line`,
`--nf-page-table-size`, `--nf-page-table-line`, `--nf-page-chrome-size`,
`--nf-page-marker-size`, `--nf-page-card-padding`, `--nf-page-card-border`,
`--nf-page-segment-gap`, `--nf-page-max-card-width`.

The last one is the Page measurement host width/cap; Page measurement never reads the Continuous
`--nf-child-max-width`. There is no compact PageTheme fallback in `styles.css`; a missing map is a
runtime bug, not a styling fallback. Page cards read the shared 4 px `--nf-card-radius`; Page
chapter gap is the 32 px engine constant.

**Removed/legacy:**

- `CALLOUT_ROW_INDENT` (26) removed; the legacy lane uses `LayoutOptions.childIndent`.
- `pxToMm` / `MM_PER_PX` removed; `mmToPx` / `PX_PER_MM` remain.
- 12 unused `--nf-page-*` geometry variables removed.
- `LEGACY_BESIDE_READABLE_WIDTH` 144 / `LEGACY_BESIDE_ANCHOR_INSET` 16 remain named, documented
  engine constants for the `calloutModes: false` oracle only.

**Guards:** `apps/desktop/test/page-token-guards.test.ts` (12 tests), `design-tokens-css.test.ts`,
`packages/layout/test/page-settings.test.ts` CSS-map contract, and `group-wrap.test.ts`.

---

## 16. Duplicate / hardcoded / dead / stale register (frozen state)

### Closed by M4e1/M4e2/M4e3

| ID | Item | Was | Closed by |
|---|---|---|---|
| DUP-1 | Continuous zoom settings vs view-state zoom | Dead duplicate, ranges 0.25–4 vs 0.5–2 | M4e1: removed `ContinuousSettings`; view state is the only zoom. |
| DUP-2 | Page CSS compact fallback | Hand-maintained `styles.css` copy of `COMPACT_THEME` | M4e3: deleted; guard asserts no fallback. |
| DUP-3 | Unused Page CSS geometry variables | 12+ emitted, no consumer | M4e3: pruned to 16 consumed keys. |
| DUP-4 | `.nf-measure-card` width | Read Continuous `--nf-child-max-width` 420 | M4e3: uses `--nf-page-max-card-width`; guard asserts no Continuous token in the Page scope. |
| DUP-11 | `pxToMm` / `MM_PER_PX` | Exported, unused | M4e3: removed. |
| DUP-13 | `maxWrapIndent` wording | “Cumulative” in types/docs | M4e3: per-level wording in `types.ts` and both docs. |
| DUP-14 | `DEFAULT_LAYOUT_OPTIONS.childIndent` | Page-only field as an unnamed engine default | M4e3: `ENGINE_DEFAULT_CHILD_INDENT` + contract. |
| DUP-15 | “compaction for compact” comment | Stale | M4e3: corrected. |
| DUP-16/17 | `useContinuousSettings` / dead store APIs | Unused | M4e1: removed with the namespace. |

### Open / documented (not freeze blockers)

| ID | Item | Where | Status / action |
|---|---|---|---|
| DUP-5 | Page zoom clamps | `PageView.tsx:82-84` vs `view-state.ts:56-60` | Cleanup: import one source. |
| DUP-6 | `wrapIndent` roles | PageTheme (list/wrap), shell reserved 18, engine default 18 | Documented as separate semantics; the shell 18 is reserved and unused. |
| DUP-7 | `childIndent` / Continuous `rowIndent` 26 | PageTheme 26, shell 26, engine default 26 | Same number, different semantics; documented. `CALLOUT_ROW_INDENT` is gone. |
| DUP-8 | `calloutGap` values | Page 12/20, shell 16, engine 20 | Page vs Continuous intentional; engine default documented. |
| DUP-9 | Chapter gap | Page 32 vs shell 28 | Documented separate surfaces. |
| DUP-10 | Card radius | Shell 4 used by Page | Documented shared primitive. |
| DUP-12 | `pageDimensionsMm` | Internal, tests/geometry | Fine internal; not a setting. |
| DUP-18 | `pageCssVariables` in `packages/layout` | Pure engine package owns a CSS map | Documented contract; moving to a presentation adapter is optional. |
| DUP-19 | Help → Keyboard shortcuts | `menu.ts:170-177` sends `settings` | Final menu design. |
| DUP-20 | Spec/UX page-setup model | `spec.md:373-384, 514-517`; `ux.md:322, 568` | R4 docs sweep. |
| DUP-21 | Document-settings unknown fields/version | `shared/document-settings.ts:65-115` | S3-4: policy + version 2 when a field is added. |
| DUP-22 | ADR-0008 `ContinuousSettings` | `docs/adr/0008-personal-page-settings.md:45-57, 83` | S3-6: ADR amendment/superseding note. |
| DUP-23 | Fixed 300 ms sleep | `tests/ui/m4e1-settings-platform.test.mjs:63` | S3-9: condition wait. |
| DUP-24 | `settings-file.ts:97` formatting | Function body opens on the same line | Cosmetic (S4). |

---

## 17. Missing settings / decisions for the UI design

| ID | Item | Status | Owner |
|---|---|---|---|
| MS-1 | Appearance (dark / light / system) | **DES**; no schema field | Global AppSettings |
| MS-2 | Full Page Setup UI | **DES**; schema exists (PS-1…6) | Page section |
| MS-3 | Page presets / typography UI | **DES**; schema exists; `fontScale`/`headingScale` hidden | Page → Typography |
| MS-4 | Manual breaks UI + cleanup | **DES**; model exists, cleanup not implemented | Page → Breaks |
| MS-5 | Continuous zoom/canvas/type | **Closed for zoom:** per-document view state; no settings namespace. Canvas/type are future **DES**. | Continuous section |
| MS-6 | Header/footer/page-number toggles | **DES**; chrome is fixed | Page → Setup (advanced) |
| MS-7 | Chapter-start behavior | **DES**; always a new page today | Page → Layout |
| MS-8 | Default export folder / date filename / metadata | **DES**; current `<title>.pdf` | Export section |
| MS-9 | Keyboard shortcut disable / single-key settings | **DES**; no field | Editor/Shortcuts |
| MS-10 | Autosave interval / save-on-quit behavior | **DES**; fixed 800 ms | Editor (advanced) |
| MS-11 | Page default zoom/fit | **DES**; per-document view state only | Page/Continuous |
| MS-12 | Callout mode preference (Auto/force A/force B2) | **Closed/deferred:** adaptive geometry is the product decision; no preference field. | Page → Advanced |
| MS-13 | Page-owned stem/trunk-gap/row-indent tokens | **Closed by documentation:** child/callout indents are PageTheme; stem/trunk-gap are shared; row indent is Continuous. | Token docs |
| MS-14 | Heading/label line heights, card radius, chapter gap | **E** engine constants; adding fields is a future **DES** + version bump | PageTheme |
| MS-15 | PDF tagged output / accessibility metadata | **DES** | Export |
| MS-16 | Corrupt-settings recovery UI | Global **closed** (backup/warn/reset); document map **DES** (no reset) | Global Settings/Data |
| MS-17 | No-document Settings | **Closed** | Global Settings |
| MS-18 | Durable per-document overrides | **Closed** | Global Settings/Data |
| MS-19 | Settings save status/retry | **Closed** | Global Settings |
| MS-20 | Page/Continuous token split | **Closed** (M4e3) | Token docs |

**Values that must not be exposed** without an Advanced disclosure and a product decision:
`pagePacking`, `calloutModes`, `wrapPolicy`, subtree-fit internals, `calloutModeMinWidth`, trunk
insets, stem/trunk-gap, exact page chrome fractions, print skin colors, hidden-window timeouts,
internal paths, fingerprints, `compaction`, and `fontScale`/`headingScale` until the floor bug is
fixed.

---

## 18. Migration and backward-compatibility register (frozen state)

| ID | Need | State | Remaining work |
|---|---|---|---|
| MG-1 | Settings schema version | **Closed:** `settingsVersion: 2`; pure v0/v1→v2 chain | Future versions append a case. |
| MG-2 | Corrupt global settings recovery | **Closed:** backup + warning + reset/dismiss | None for global. |
| MG-3 | Unknown global settings fields | **Closed:** preserved on write, including nested `page` fields | Roundtrip test exists. |
| MG-4 | Per-document override lifetime | **Closed:** durable map outside the session | None. |
| MG-5 | Document rename/move | **Closed:** id first, path fallback, adopt on open | E2E rename test is S3-10. |
| MG-6 | Density min 0.6 | **Closed:** 0.6 accepted/snapped; 0.8–1.2 values remain valid | No stored-data migration. |
| MG-7 | Density step/rounding | **Closed:** 5% canonical step | None. |
| MG-8 | Page setup defaults | **Open DES:** code 12 mm/A4 landscape; spec says 20 mm/A4 | Product/design decides; no user documents to migrate. |
| MG-9 | Manual-break cleanup | **Open DES:** not implemented | Delete/split/merge rules from ADR-0008; tests. |
| MG-10 | Legacy v1 page fields | **Closed:** schema v2 strips `pageSetup`/`manualBreakBeforeBlockIds`/`viewState` | Golden v1 fixture remains. |
| MG-11 | Continuous zoom duplicate | **Closed:** field removed; view state is the only zoom | None. |
| MG-12 | Future global fields/default changes | **Partially closed:** v2 chain; default changes need explicit migration | Add a case per new default. |
| MG-13 | Export preferences (folder/date/metadata) | **Open DES:** not stored | Design + schema version bump. |
| MG-14 | Appearance/theme | **Open DES:** not stored | Design + schema version bump. |
| MG-15 | Newer global settings schema | **Closed:** read + warn, keep version/unknown fields, never downgrade | Documented in `settings-file.ts:87-105`. |
| MG-16 | Document-settings file version policy | **Open S3:** `version: 1` written, not migrated; unknown fields dropped | Version 2 policy when the first field is added (S3-4). |
| MG-17 | Corrupt document-settings recovery | **Open DES/S3:** backup + warning, writes refused, no reset | Design a reset/restore action (S3-3). |

---

## 19. Design-ready summary

The UI design can build against this without a schema change:

1. **Settings is app-level.** A zero-document Settings window is the first acceptance state; the
   document scope is disabled with a reason; ⌘, and the palette reach the same surface.
2. **One Page model.** Page Setup (size/orientation/margins), Typography (preset/density and the
   advanced sizes), Layout (the Page-owned indents/caps), and Manual Breaks are one Page settings
   object, global default + partial per-document override.
3. **Density is the single type/box lever.** 60–120%, step 5, default 100; 60% is the 7 pt floor and
   the densest step; 70% is the gentle dense step; 80% keeps the old 8 pt evidence; 90–95% changed
   with the monotone curve; above 100% scales proportionally. Page and PDF agree.
4. **Topology is adaptive.** A density change may move a parent A→B2/stacked; the design may label
   this, but it cannot promise a fixed topology.
5. **Continuous has no Settings section in v1.** Zoom is per-document view state; canvas/type
   settings are future. Do not build a control on a removed field.
6. **Writes and states are explicit.** Saving/saved/error, Retry, corrupt backup/reset, newer-schema
   warning, no false success, quit flush; a per-document override survives close/quit/reopen.
7. **Tokens are split.** Page values in the Page doc, Continuous values in the Continuous doc,
   shared edge/radius primitives explicitly shared. The Page CSS map is 16 keys; no CSS fallback.
8. **Not ready to expose:** `fontScale`/`headingScale` (floor bypass), `pagePacking`/`calloutModes`/
   `wrapPolicy`/trunk internals (hidden), `compaction` (oracle), exact chrome fractions, print
   internals, fingerprints.

**Design must still solve:** the scope-switch override trap (S3-2), corrupt map recovery (S3-3),
manual-break UI/cleanup (S3/D), fontScale/headingScale clamping or removal (S3-1), rename/move E2E
coverage (S3-10), and the docs sweep (ADR-0008/spec/UX, S3-6/S3-7).

---

## 20. Open product/design decisions (not schema blockers)

1. **Page defaults:** 12 mm (code) vs 20 mm (spec/UX); default A4 landscape; confirm before the
   Setup copy is final.
2. **Density presentation:** slider only, presets, or both; copy for 60% (7 pt dense-print floor) and
   70% (gentle dense step); do not advertise 90% as the dense optimum.
3. **Typography exposure:** advanced body/heading/code/table sizes and line heights vs density as
   the single lever; `fontScale`/`headingScale` hidden until clamped.
4. **Override semantics:** no override on scope switch; per-field dots; “Use global” per field/group;
   explicit Apply/Cancel; decide the dirty-close behavior.
5. **Manual breaks:** toolbar, block context menu, or both; delete/split/merge cleanup; stale list.
6. **Corrupt settings recovery:** global reset exists; decide the per-document map reset/restore.
7. **Page chrome:** header/footer/page-number toggles; chapter-start behavior; final Page toolbar
   hierarchy.
8. **Export defaults:** folder, filename/date, metadata, tagged PDF, page range.
9. **Appearance:** dark-only v1 or light/system in the rework.
10. **Continuous:** keep per-document zoom only (current) or add a future global default; adding a
    field needs a migration.
11. **Shortcuts/autosave:** configurable single-key shortcuts and autosave interval are UX asks with
    no fields; decide in/out of this rework.
12. **Callout topology copy:** whether the UI explains the adaptive A/B2/stacked behavior.
13. **Menu copy:** Help → Keyboard shortcuts should not open Settings.

---

## 21. Source index

| Area | Files |
|---|---|
| Page settings model / presets / lens | `packages/layout/src/page-settings.ts` |
| Layout options/types | `packages/layout/src/types.ts` |
| Page layout / callout modes | `packages/layout/src/layout.ts` |
| Page chrome / labels | `packages/layout/src/page-chrome.ts` |
| Page edges / trunks | `packages/layout/src/page-edges.ts` |
| Shared edge style | `packages/layout/src/edge-style.ts` |
| Global settings file | `apps/desktop/src/shared/settings-file.ts`, `main/library.ts` |
| Durable per-document map | `apps/desktop/src/shared/document-settings.ts`, `main/document-settings.ts` |
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
| Token docs | `docs/design-tokens.md`, `docs/design-tokens-page.md`, `docs/design-tokens-continuous.md` |
| Labs/tests | `packages/layout/test/density-lab.ts`, `apps/desktop/test/page-token-guards.test.ts`, `tests/ui/m4d1-page-density.test.mjs`, `tests/ui/m4e1-settings-platform.test.mjs`, `tests/ui/m4c2-pdf-export.test.mjs` |

**Reviewer note:** no product code, tests, spec, UX, ADR, or plan were modified for this frozen
inventory. Values were read from the base commit and verified with the targeted suites listed in
`docs/reviews/settings-freeze-review.md`. Historical pre-fix rows are closed by M4e1/M4e2/M4e3; the
remaining rows are marked **DES** (design decision), **ENG/E** (engine constant), or **H** (hidden).
