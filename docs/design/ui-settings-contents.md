# UI contents — phase 2, slice 3 (Settings, including Appearance)

**Status:** First draft, accepted as a working basis. Contents, IA, and states; not visual design
and not code. Decisions marked “proposal” are provisional until tried hands-on; the product owner
will revisit them after using the app.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Inputs:** `docs/design/ui-shell-map.md` (structure, D-01…D-13),
`docs/design/ui-shell-contents.md` (slice 1), `docs/design/ui-page-contents.md` (slice 2),
`research/ui-surface-map.md` (as-is settings), `docs/reviews/settings-inventory.md` (frozen model),
`docs/design-tokens.md`, `docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`.
**Scope:** the Settings modal, its pages and rows, the new Appearance page (theme/colors/fonts),
scope/override behavior, save model, and states. Page/PDF internal layout is not redesigned.

---

## 0. Principles

- **Settings is app-level and modal** (D-05). It opens with zero documents; app-level pages work,
  document pages are disabled with a reason.
- **One settings model:** draft + **Apply/Cancel** (proposal; D-06). View-state controls
  (Continuous zoom) are the deliberate exception: they apply immediately and are saved per
  document.
- **Scope is explicit:** global default vs this document for Page; Appearance/General/Editor/
  Export/Data are global; Continuous is per document. Switching scope never creates an override.
- **No fake controls:** a field appears only when it exists. Future fields are documented here,
  not shown as disabled “coming soon” rows.
- **Page/PDF stay light:** shell theme/colors/fonts do not change the paper or the PDF. Page
  typography is a Page setting; changing Page font/code font can affect the PDF and needs the gate.
- **No settings dump:** first-class, advanced, hidden. Hidden/engine values are not exposed.

---

## 1. Settings frame

### 1.1 Structure

Large modal, default **840 × 580 px**, max 92vw / 86vh, centered. Three columns on Page (nav,
content, preview); two columns elsewhere (Appearance uses a compact preview strip inside the
content).

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Settings                                                            [×]     │
├──────────────┬───────────────────────────────────────────┬───────────────────┤
│ App          │ Page                                      │ Preview           │
│  General     │ Page size, orientation, margins…          │  page thumbnail   │
│  Appearance  │                                           │                   │
│ Document     │ Typography                                │                   │
│  Page        │  Preset / Density / Advanced               │                   │
│  Continuous  │                                           │                   │
│ Workflow     │ Layout                                    │                   │
│  Editor      │  Advanced geometry                        │                   │
│  Export      │                                           │                   │
│ Data         │                                           │                   │
│  Data & About│                                           │                   │
├──────────────┴───────────────────────────────────────────┴───────────────────┤
│ Saving… / Saved / Couldn't save — Retry          Reset page   Cancel   Apply │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Header: title “Settings”, close `×`.
- Left nav: groups App / Document / Workflow / Data; 7 pages; dirty dots per page.
- Content: page title + one-line description, sections, help text.
- Preview: only Page (page thumbnail); Appearance uses a compact preview strip inside the content.
- Footer: save status left; “Reset page”, “Cancel”, “Apply” right. Apply is primary, disabled when
  clean or invalid.

### 1.2 Navigation

| Group | Page | Purpose |
|---|---|---|
| App | **General** | App-level defaults and autosave information |
| App | **Appearance** | Theme, accent, UI text size/font, code font |
| Document | **Page** | Page Setup, Typography, Layout, Manual breaks; global/document scope |
| Document | **Continuous** | Per-document view controls (zoom, future width) |
| Workflow | **Editor** | Keyboard shortcuts, single-key shortcuts, autosave |
| Workflow | **Export** | Export defaults (target) and current behavior |
| Data | **Data & About** | Paths, settings status, recovery, version |

Nav behavior:

- Click/arrow keys select a page; the draft survives page switches.
- Dirty dot on pages with unsaved changes; the Apply button count reflects all dirty pages.
- `⌘,` opens Settings; `Esc` closes (confirm if dirty); focus is trapped and restored.

### 1.3 Footer and save model (proposal D-06)

- **Apply** writes all changed settings, waits for the main-process write, then closes. On failure,
  stay open, show the error + **Retry**; never show “saved” before the write.
- **Cancel** discards the draft and closes. “Reset page” resets the current page’s draft to its
  last saved values (not to defaults; resets are per section).
- Closing with dirty changes asks “Discard changes?” with **Discard** / **Keep editing**.
- Continuous view-state controls apply immediately (see §5) and do not make the modal dirty.
- The Page Edit overlay is committed before Apply changes Page geometry/density; if the commit
  fails, the error is shown and the apply is blocked.

### 1.4 Responsive

| Width | Behavior |
|---|---|
| ≥900 px | Nav + content + preview (Page) |
| 760–899 px | Preview collapses under the content; nav stays |
| <760 px | Nav becomes a compact dropdown/segmented control at the top; content scrolls |
| Height <620 px | Content scrolls; footer stays visible |

### 1.5 Accessibility

- `role=dialog`, `aria-modal=true`, labelled “Settings”; focus trap; Escape closes.
- Nav is a list of real buttons with `aria-current`; page title is the content heading.
- Form labels are explicit; help text is associated; errors use `role=alert` and `aria-describedby`.
- Apply/Cancel are real buttons; disabled reasons are exposed.
- Page preview has a text label; it is not the only way to understand a change.

### 1.6 Settings states

| State | Behavior |
|---|---|
| No document | App-level pages usable; Page document scope and Continuous disabled with a reason |
| Read-only document | Page/Continuous personal overrides: P1-03; content is never mutated |
| Dirty | Nav dots; Apply enabled; close asks |
| Saving | Apply busy; controls disabled; no false “saved” |
| Saved | Brief confirmation; modal closes on success |
| Save error | Error message + Retry; modal stays open |
| Corrupt/unreadable settings | Warning banner in Data & About and at the top of Settings; backup path; reset/dismiss |
| Newer settings schema | Read + warn; never downgrade; unknown fields preserved |
| Document-settings map corrupt | Warning; writes refused; reset/restore is a design decision (S3-13) |
| Page Edit open | Apply commits the overlay first |
| Invalid margins | Inline error; Apply blocked; no silent fallback |

---

## 2. General

Purpose: app-level defaults and information. This page is intentionally small; it grows when fields
exist.

| Section | Row | Control | Status |
|---|---|---|---|
| Startup | Default layout | Continuous / Page | **DES**; no global field today (view state is per document) |
| Startup | Default mode | Edit / Read | **DES**; per-document view state today |
| Saving | Autosave | Read-only: “Autosave after 800 ms; ⌘S flushes immediately.” | Real information |
| Language | UI language | English (future) | **DES**; no i18n field |
| Updates | Version | Read-only app version | Real; repeated in Data & About |

No fake toggles: if a default field is added later, the row becomes real with a schema migration.

---

## 3. Appearance (new)

Purpose: the shell's look and typography. **Does not change the Page paper or the PDF.**

### 3.1 Theme

| Item | Control | Options | Notes |
|---|---|---|---|
| Theme | Segmented | Dark (default) / Light / System | Shell only; Page/PDF stay light |
| Preview | Preview strip | — | Shows shell surfaces, text, accent, and a code sample |

- Current code is dark-only; light tokens are “reserved”. Light/System ship only when the light
  token set exists; they are not shown as disabled placeholders before that.
- New field: `AppSettings.appearance.theme`; `settingsVersion: 3`; pure migration from v2.
- Copy: “Page and PDF keep the paper light; this changes the app around the document.”

### 3.2 Colors / accent

| Item | Control | Options | Notes |
|---|---|---|---|
| Accent | Swatches/segmented | Blue (default), Teal, Amber, Rose | Focus rings, selection, active tab, primary actions; not Page/PDF |
| Preview | Preview strip | — | Accent used in a button, a focused field, a selected row |

- No free color picker (slop and accessibility risk); a curated set with contrast-checked tokens.
- New field: `AppearanceSettings.accent`.
- “System accent” is a possible future option; it needs OS accent reading and token mapping.

### 3.3 Typography

| Item | Control | Options | Scope / impact |
|---|---|---|---|
| UI text size | Segmented | Compact / Default / Large | Shell chrome only; not Page/PDF; new `uiScale` (0.9 / 1 / 1.1) |
| UI font | Select/segmented | System (default) / Serif (system serif) | Shell only; no new dependency; new `uiFont` |
| Code font | Select | JetBrains Mono (default) / System Mono | Editor code blocks **and** Page code blocks/PDF; new `codeFont`; PDF gate if changed |
| Page font | Link | “Page typography →” | Page font lives in Page > Typography because it affects the paper/PDF |

- UI font candidates use system fonts only; adding a bundled UI font is a dependency decision.
- Code font: JetBrains Mono is already bundled; System Mono is a fallback. Changing it affects
  Page/PDF code rendering, so the PDF text/font gate must run.
- Page font: see §4.3; a reliable PDF embedding needs a bundled font (new dependency), so it is
  deferred until approved.

### 3.4 Preview

A compact preview strip inside the page (not a fake app screenshot):

- Surface + text + accent + focus ring + a small code sample.
- For a Page font preview, link to Page > Typography and use the page thumbnail there.
- Preview updates with the draft; Apply commits.
- “Reset appearance” restores Dark, Blue, Default size, System UI font, JetBrains Mono; it is part
  of the draft and needs Apply.

### 3.5 Appearance schema impact

| Field | Store | Version | PDF impact | Prerequisite |
|---|---|---|---|---|
| `theme` | `settings.json → appearance` | `settingsVersion: 3` | None (shell only) | Light token set for Light/System |
| `accent` | same | 3 | None | Accent tokens + contrast checks |
| `uiScale` | same | 3 | None | Shell sizing tokens |
| `uiFont` | same | 3 | None | System font stack only |
| `codeFont` | same | 3 | Code blocks in Page/PDF | PDF font/text gate |
| Page font | `page.theme.fontFamily` | 3 | Page/PDF | Bundled font + PDF gate; defer |

Unknown fields are preserved; the migration is pure (missing appearance → defaults). No per-document
theme override in v1; Appearance is global.

### 3.6 Open choices

Appearance-specific choices (the Settings-wide list uses `S3-xx`):

| ID | Choice | Options | Proposal |
|---|---|---|---|
| A-01 | Theme scope | Dark only now; design Light/System; implement later | Prepare the page; ship Light/System with tokens |
| A-02 | Accent set | Blue only; 4 curated; system accent | 4 curated; system accent later |
| A-03 | UI text size | 3 steps; 90–120% slider | 3 steps (Compact/Default/Large) |
| A-04 | UI font | System only; System + Serif; bundled font | System + Serif (no dependency) |
| A-05 | Code font | JetBrains Mono only; + System Mono | Both; PDF gate |
| A-06 | Page font | Defer; bundled serif; system serif | Defer until a bundled font + PDF gate are approved |
| A-07 | Appearance scope | Global only; per-document | Global only in v1 |

---

## 4. Page

Purpose: the Page lens. Global default + per-document override; preview on the right.

### 4.1 Scope

- Segmented `Global default | This document` at the top of the page.
- No document: “This document” disabled with “Open a document to override Page settings.”
- Switching scope does not create an override; it only changes which layer is edited.
- In “This document”, fields that differ from global show an override dot; groups have “Use
  global”. In “Global default”, no dots.
- Read-only document: P1-03; proposal allow personal overrides (they do not modify content).

### 4.2 Setup

| Row | Control | Notes |
|---|---|---|
| Page size | Segmented A4 / A5 / Letter | Re-paginates; preview |
| Orientation | Segmented Portrait / Landscape | Re-paginates; preview |
| Margins | Four NumberFields (mm) + “All sides” | 0–100; content area min 20 mm per axis; inline validation |
| Preview | Page thumbnail | Draft values; no separate model |
| Reset | “Use global” (document) / “Reset to default” (global) | No silent fallback |

### 4.3 Typography

| Group | Row | Control | Exposure |
|---|---|---|---|
| Preset | Preset | Segmented Compact / Comfortable / Custom | First-class |
| Density | Page density | Slider 60–120, step 5, value | First-class |
| Font | Page font | System Sans (default) / Serif (future) | First-class when approved; Page/PDF gate |
| Body | Body size / line height | NumberField pt / unitless | Advanced |
| Headings | H1 / H2 / H3 size | NumberField pt | Advanced |
| Code | Code size / line height | NumberField pt / unitless | Advanced |
| Tables | Table size / line height | NumberField pt / unitless | Advanced |
| Labels | Label size | NumberField pt | Advanced |
| Chrome | Chrome / marker size | NumberField pt | Advanced |
| Hidden | `fontScale`, `headingScale` | — | **Hidden** until the floor bug is fixed |
| Help | Density note | “60% fine print · 70% gentle dense · 100% default” | First-class help |

- Preset switch replaces the theme baseline; if advanced values exist, warn before replacing
  (Q-11).
- Density may move callouts between the right lane and below; one help line, no fixed-topology
  promise.
- Page/PDF consume one effective theme; the preview is the same model.

### 4.4 Layout (Advanced)

| Group | Rows | Notes |
|---|---|---|
| Card | Max card width, min content width, card padding, card border | Max card width is first-class; the rest advanced |
| Spacing | Segment gap, sibling gap, callout gap | Advanced |
| Indents | List indent (`wrapIndent`), max wrap indent, child indent | “List indent” label; per-level, not cumulative |
| Hidden | `pagePacking`, `calloutModes`, `wrapPolicy`, subtree-fit internals, `calloutModeMinWidth`, trunk insets, callout card indent, callout right gap, chrome fractions | Never exposed |

### 4.5 Manual breaks

- Model exists (`manualBreakBeforeBlockIds`), cleanup on delete/split/merge does not.
- This rework **defers** the UI until the cleanup rules exist (P1-09); no fake list or disabled
  buttons. The Page page keeps a reserved section in the IA for it.

### 4.6 Preview and apply

- Right-side page thumbnail with the draft setup/typography/layout.
- Apply/Cancel; invalid margins block Apply; Page Edit commits first.
- Preview performance: same options as the PageSetupPopover (live vs small preview); P1-06.

---

## 5. Continuous

Purpose: per-document view controls. No global Continuous settings in v1.

| Row | Control | Behavior |
|---|---|---|
| Zoom | Stepper/slider 50–200%, Fit width, Actual | Writes `DocumentViewState.zoom` immediately; saved per document |
| Canvas width | Number/slider (future) | **Not implemented**; new view-state field, not `settings.json`; hidden until it exists |
| Focus branch | Link/command `⇧⌘F` | A command, not a setting |
| Note | — | “These controls apply to this document; there are no global Continuous settings.” |

- No document: the page is disabled with “Open a document to change Continuous view.”
- Read-only: view state is allowed.
- View-state changes apply immediately and do not make the Settings draft dirty.
- Zoom and width are per document (D-13); width needs a `DocumentViewState` field,
  normalizer/session save/tests — no `settingsVersion` bump.

---

## 6. Editor

| Section | Row | Control | Status |
|---|---|---|---|
| Shortcuts | Keyboard shortcuts | Searchable read-only list by category | Real; can fix Help → Keyboard shortcuts |
| Shortcuts | Single-key shortcuts | Toggle (future) | **DES**; no field today |
| Saving | Autosave | Read-only: “800 ms; ⌘S flushes” | Real |
| Saving | Autosave interval | Number (future) | **DES**; no field today |

- The Help menu item “Keyboard shortcuts” can open Settings → Editor → Shortcuts (fixes AP-22).
- No fake toggles; future rows only appear when fields exist.

---

## 7. Export

Purpose: defaults for export, separate from the Export sheet.

| Section | Row | Control | Status |
|---|---|---|---|
| Current behavior | Save dialog | Read-only: native save dialog; `<title>.pdf`; OS overwrite confirmation | Real |
| Defaults | Folder | Documents / Downloads / Last used / Per document | **DES**; needs `export` settings namespace |
| Defaults | Filename | `<title>.pdf` / `<title> — <date>.pdf` | **DES** |
| Defaults | Metadata | Title / subject / creator / date | **DES** |
| Defaults | Tagged PDF | Toggle | **DES**; PDF accessibility |
| Defaults | Page range | Whole document / selection | **DES**; v1 is whole document |
| Action | Export now… | Opens the ExportSheet | Real |

- Target fields require `settingsVersion: 3` + `export` namespace; no fake controls before that.
- The Export sheet handles per-export options; Settings stores defaults.
- Page/PDF output changes (tagged PDF, metadata) need the PDF gate.

---

## 8. Data & About

| Section | Row | Control | Status |
|---|---|---|---|
| Paths | Library | Read-only path + **Reveal in Finder** | Real |
| Paths | App data | Read-only path + **Reveal in Finder** | Real |
| Settings file | Status | ok / defaults / corrupt / unreadable / newer + version | Real |
| Settings file | Warning | Message, backup path, **Reset settings**, **Dismiss** | Real (corrupt/reset) |
| Document settings | Status | ok / corrupt / unreadable | Real warning |
| Document settings | Recovery | **Reset map** / **Restore backup** | **DES**; no in-app reset today (S3-13) |
| About | Version | App version, build | Real |
| About | Help | Keyboard shortcuts link → Editor | Real |

- Reset settings is destructive but notes-safe; confirm with scope.
- Document-settings map reset/restore must preserve a backup and cannot silently replace the map.
- No telemetry, no cloud.

---

## 9. Cross-page behavior

### 9.1 Scope and overrides

- Global default vs this document; per-field dots; “Use global” per field/group; “Reset page”
  resets the draft to saved values.
- No override created by switching scope; no override equal to global on Apply.
- Read-only documents: personal overrides P1-03; content never mutated.
- The resolved Page settings feed Page Read/Edit, the Page preview, measurement, and PDF; one
  effective theme.

### 9.2 Save and errors

- Draft + Apply (proposal); Apply waits for the write; no false “saved”.
- Error + Retry; the modal stays open; quit flushes pending writes.
- Corrupt global settings: backup, warning, reset/dismiss; newer: read + warn, never downgrade.
- Corrupt document map: warning, writes refused; reset/restore is a design decision.
- Page Edit open: commit first; failure blocks the geometry/density apply.

### 9.3 No document and read-only

- No document: Settings opens; App-level pages work; Page document scope and Continuous disabled
  with a reason; Data & About available.
- Read-only document: settings are personal; content settings do not change note content. Page Edit
  disabled; export allowed.

### 9.4 Keyboard and accessibility

- `⌘,` opens; `Esc` closes/asks; arrow keys move the nav; Tab moves within the page.
- Apply `⌘⏎` (proposal); Cancel `Esc` (with dirty confirmation).
- Labels, help, errors, focus return; no icon-only controls without labels/tooltips.
- Reduced motion: no decorative transitions; page changes immediate.

---

## 10. State matrix

| State | Nav | Content | Footer | Preview |
|---|---|---|---|---|
| No document | App pages enabled; Document pages disabled with reason | Global controls | Apply/Cancel | Page preview disabled |
| Document open | All | All | Apply/Cancel | Live draft |
| Read-only | All | Personal overrides per P1-03; Page Edit off | Apply/Cancel | Live draft |
| Dirty | Dots on changed pages | Draft | Apply enabled; close asks | Draft |
| Saving | Disabled | Disabled | Busy | Last draft |
| Save error | Enabled | Enabled | Error + Retry | Last draft |
| Corrupt settings | Warning banner | Data warning | Apply per policy | — |
| Newer settings | Warning banner | Read + warn | Apply preserves version | — |
| Document map corrupt | Warning | Writes refused | Apply disabled for document scope | — |
| Page Edit open | All | Page | Commit first | Live |
| Invalid margins | All | Inline error | Apply blocked | Error state |
| Page loading | All | Page controls disabled | Apply blocked | Loading |

---

## 11. Schema and implementation order

| Step | Fields | Store/version | PDF impact | Notes |
|---|---|---|---|---|
| 1 | Page Setup + Typography + Layout UI | existing `page` (`settingsVersion: 2`) | Page/PDF consume the same theme | No schema change; the first Settings implementation |
| 2 | Appearance: theme/accent/uiScale/uiFont | `appearance` (`settingsVersion: 3`) | None (shell only) | Light tokens/accent tokens first |
| 3 | Code font | `appearance.codeFont` | Page/PDF code blocks | PDF font/text gate |
| 4 | Page font | `page.theme.fontFamily` | Page/PDF | Bundled font + PDF gate; defer |
| 5 | Export defaults | `export` namespace (`settingsVersion: 3` or later) | Metadata/tagged PDF | Needs a product decision |
| 6 | Continuous width | view state, no settings version | None | `DocumentViewState` field + tests |
| 7 | Manual breaks UI | existing field | Pagination | Cleanup rules first |
| 8 | Document map reset/restore | `document-settings.json` | None | Backup + confirm |

---

## 12. Open choices (Settings)

| ID | Choice | Options | Proposal |
|---|---|---|---|
| S3-01 | Save model | Draft + Apply/Cancel; instant save with status | Draft + Apply/Cancel (D-06) |
| S3-02 | Appearance scope | Shell only; include Page/PDF | Shell only; Page/PDF stay light |
| S3-03 | Theme implementation | Dark only now; Light/System with tokens | Prepare IA; ship with tokens |
| S3-04 | Accent palette | 4 curated; system accent; free picker | 4 curated; system later |
| S3-05 | UI font/scale | System only; + Serif; bundled font; 3 sizes | System + Serif; 3 sizes |
| S3-06 | Code font | JetBrains Mono only; + System Mono | Both; PDF gate |
| S3-07 | Page font | Defer; bundled serif; system serif | Defer until bundled font + gate |
| S3-08 | Nav order | General, Appearance, Page, Continuous, Editor, Export, Data | As above |
| S3-09 | Preview | Live page thumbnail; simplified preview | Live first; fallback |
| S3-10 | Manual breaks | Include now; defer | Defer until cleanup |
| S3-11 | Export defaults | In this rework; later | Later, separate schema decision |
| S3-12 | Read-only overrides | Allow personal Page/Continuous; block | Allow; no content mutation |
| S3-13 | Document map recovery | Reset with backup; restore; both | Reset with backup + restore |
| S3-14 | Appearance per-document | Global only; per-document | Global only in v1 |

---

## 13. Next slice

**Export sheet:** done in `docs/design/ui-export-contents.md` (configure, overwrite, progress,
result, errors, warnings). Next: overlays and keyboard (palette, dialogs, context menus, toasts,
shortcut table), then the A/B lab (TopBar words vs symbols, Page Setup entry). No mockups or
product code until these choices are settled.
