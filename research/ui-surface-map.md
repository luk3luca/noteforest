# NoteForest — as-is UI surface map

**Status:** Research deliverable, read-only. Not a design proposal, not a settings decision.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Author:** Research / Scout.
**Audience:** Product owner review before the UI design phase.

This document maps **what exists in the desktop app today**, surface by surface, command by
command, control by control, and setting by setting. Code is the source of truth for what exists;
`docs/reviews/settings-inventory.md` is the source of truth for the frozen settings model.

**What this document does not do:** it does not choose a Settings information architecture, does not
propose new controls or settings, does not judge visual quality, and does not modify product code,
tests, spec, UX, ADRs, the plan, or existing docs. Candidate homes in §7 are observations, not
decisions.

---

## Table of contents

- [0. Method, evidence legend, and abbreviations](#0-method-evidence-legend-and-abbreviations)
- [1. Coverage summary](#1-coverage-summary)
- [2. Surface register](#2-surface-register)
  - [2.1 App shell and navigation](#21-app-shell-and-navigation)
  - [2.2 Native, menu, and overlay surfaces](#22-native-menu-and-overlay-surfaces)
  - [2.3 Continuous layout](#23-continuous-layout)
  - [2.4 Page layout](#24-page-layout)
  - [2.5 Settings](#25-settings)
  - [2.6 Export](#26-export)
  - [2.7 Documents, recovery, and save state](#27-documents-recovery-and-save-state)
  - [2.8 Dialogs](#28-dialogs)
  - [2.9 Print / PDF surface](#29-print--pdf-surface)
- [3. Command register](#3-command-register)
  - [3.1 Native application menu](#31-native-application-menu)
  - [3.2 Command palette](#32-command-palette)
  - [3.3 Global keyboard commands](#33-global-keyboard-commands)
  - [3.4 Editor keymap](#34-editor-keymap)
  - [3.5 Context menus](#35-context-menus)
  - [3.6 Surface controls and one-shot commands](#36-surface-controls-and-one-shot-commands)
  - [3.7 Duplicates and inconsistencies](#37-duplicates-and-inconsistencies)
  - [3.8 Command icons](#38-command-icons)
- [4. Control register](#4-control-register)
  - [4.1 Inputs, choices, sliders, toggles](#41-inputs-choices-sliders-toggles)
  - [4.2 Button inventory by surface](#42-button-inventory-by-surface)
- [5. Component and style register](#5-component-and-style-register)
  - [5.1 React Aria primitives actually used](#51-react-aria-primitives-actually-used)
  - [5.2 Shell/editor component inventory](#52-shelleditor-component-inventory)
  - [5.3 CSS class families](#53-css-class-families)
  - [5.4 CSS custom properties and token ownership](#54-css-custom-properties-and-token-ownership)
  - [5.5 The 16-key Page CSS map](#55-the-16-key-page-css-map)
  - [5.6 Icons](#56-icons)
  - [5.7 Ad-hoc styles and magic values](#57-ad-hoc-styles-and-magic-values)
  - [5.8 Gaps and duplications relevant to Settings, Page toolbar, and export](#58-gaps-and-duplications-relevant-to-settings-page-toolbar-and-export)
- [6. State matrix](#6-state-matrix)
- [7. Settings placement matrix (candidate, not a decision)](#7-settings-placement-matrix-candidate-not-a-decision)
  - [7.0 Method and legend](#70-method-and-legend)
  - [7.1 File contracts: SF](#71-file-contracts-sf)
  - [7.2 Durable per-document map: DS](#72-durable-per-document-map-ds)
  - [7.3 Page setup: PS](#73-page-setup-ps)
  - [7.4 Typography: TY](#74-typography-ty)
  - [7.5 Boxes, spacing, indents: BX](#75-boxes-spacing-indents-bx)
  - [7.6 Packing and callout topology: PK](#76-packing-and-callout-topology-pk)
  - [7.7 Manual breaks: MB](#77-manual-breaks-mb)
  - [7.8 Continuous: CO](#78-continuous-co)
  - [7.9 App, shell, view state: AP](#79-app-shell-view-state-ap)
  - [7.10 Shared edge primitives: ED](#710-shared-edge-primitives-ed)
  - [7.11 Print / PDF: PR](#711-print--pdf-pr)
  - [7.12 Export UI: EX](#712-export-ui-ex)
  - [7.13 Missing settings / design decisions: MS](#713-missing-settings--design-decisions-ms)
  - [7.14 Migration register: MG](#714-migration-register-mg)
  - [7.15 Duplicate/stale register: DUP](#715-duplicatestale-register-dup)
  - [7.16 Coverage count](#716-coverage-count)
  - [7.17 Rows where placement is a real choice](#717-rows-where-placement-is-a-real-choice)
- [8. Doc reconciliation](#8-doc-reconciliation)
- [9. Open questions, unknowns, and risks](#9-open-questions-unknowns-and-risks)
- [10. What the product owner must decide](#10-what-the-product-owner-must-decide)
- [Appendix A. Source index](#appendix-a-source-index)
- [Appendix B. Surface-to-command index](#appendix-b-surface-to-command-index)

---

## 0. Method, evidence legend, and abbreviations

### 0.1 Method

1. Read `AGENTS.md`, the frozen settings inventory, the settings freeze review, the token docs,
   ADR-0007, ADR-0008, the UX docs, the spec, and the pre-freeze page-settings plan.
2. Read every renderer shell file, the main-process menu/window/dialog wiring, the Page renderer,
   the print compositor, `styles.css` (structure and selected ranges), and the settings store.
3. Walked the command paths from their entry points (native menu → `MenuCommand` → `runMenuCommand`;
   palette → `paletteCommands`; keydown → actions; context menus → `MenuEntry[]`).
4. Cross-checked every settings row from `docs/reviews/settings-inventory.md` against the current UI.
5. Marked anything not determinable from code as `UNKNOWN` with the question; no guessing.

### 0.2 Evidence legend

Paths are abbreviated to keep tables readable. Expand the prefix:

| Prefix | Absolute path |
|---|---|
| `R/` | `apps/desktop/src/renderer/src/` |
| `M/` | `apps/desktop/src/main/` |
| `S/` | `apps/desktop/src/shared/` |
| `L/` | `packages/layout/src/` |
| `C/` | `packages/core/src/` |
| `UI/` | `apps/desktop/test/` |
| `E2E/` | `tests/ui/` |

Example: `R/shell/Dialogs.tsx:1912` = `apps/desktop/src/renderer/src/shell/Dialogs.tsx`, line 1912.

### 0.3 Abbreviations

| Code | Meaning |
|---|---|
| **MENU** | Native application menu item (`M/menu.ts`). |
| **PAL** | Command palette item (`paletteCommands()` in `R/actions.ts`). |
| **KEY** | Keyboard shortcut handled by the renderer or the native menu accelerator. |
| **CLICK** | Pointer activation on a rendered control. |
| **CTX** | Renderer-owned context menu. |
| **NATIVE** | Native OS/Electron dialog or menu. |
| **Rework: IN** | The surface is directly implicated in the Settings/Page-toolbar/export UI design work. |
| **Rework: ADJ** | Adjacent; may need copy, placement, or token alignment because of that work. |
| **Rework: OUT** | Not part of the Settings/Page-toolbar/export design work. |
| **Rework: ABSENT** | Described in docs (or expected by the brief) but not present in code. |
| **G / D / V / E / P** | Global default / per-document override / view state / engine constant / print-only (from the frozen inventory). |
| **U / A / H / E** | First-class control / advanced disclosure / hidden / engine constant (from the frozen inventory). |
| **DES / X** | Design decision still open / cleanup or removal. |

### 0.4 Two conventions used below

- **One command, one row.** A dialog's “Cancel” and “Done” are not separate commands unless they
  have unique semantics (for example “Don’t Save”). The dialog row names its primary action, which
  links to the command row.
- **Buttons are registered twice on purpose.** §3 lists the action semantics; §4.2 lists the
  physical controls and their labels. A button such as “Apply” therefore appears in both, with the
  same command ID.

---

## 1. Coverage summary

| Register | Rows | Notes |
|---|---:|---|
| Surfaces | 88 rows / 84 distinct | 26 shell/native/overlay rows (22 distinct + 4 roll-ups that cross-reference Settings/Export/Recovery/Print), 14 Continuous, 11 Page (including 1 explicitly absent), 6 Settings, 6 Export, 11 documents/recovery, 11 dialogs, 3 print (including 1 dev-only test surface). |
| Commands | 208 rows | 38 native menu, 32 palette, 22 global keyboard, 17 editor keymap, 25 context-menu families, 74 surface-level one-shot commands. Dynamic families (image actions, anchors, references) expand to more actual actions than the row count. |
| Controls | 112 | 46 inputs/choices/toggles + 66 button groups/controls. |
| Settings rows covered | **240 / 240** | 199 settings-bearing rows (SF/DS/PS/TY/BX/PK/MB/CO/AP/ED/PR/EX/MS) + 17 MG + 24 DUP. |
| Doc-drift findings | 24 | See §8. |
| Open questions / UNKNOWNs | 30 | 20 product/design questions + 10 UNKNOWNs; see §9. |

Frozen settings inventory sections and their sizes:

| Section | Prefix | Rows |
|---|---|---:|
| `settings.json` contract | SF | 13 |
| `document-settings.json` contract | DS | 12 |
| Page setup | PS | 14 |
| PageTheme typography | TY | 21 |
| PageTheme boxes/spacing | BX | 20 |
| Packing/callout topology | PK | 7 |
| Manual breaks | MB | 9 |
| Continuous | CO | 14 |
| App/shell/view state | AP | 23 |
| Shared edge primitives | ED | 15 |
| Print/PDF-only | PR | 18 |
| Export UI defaults | EX | 13 |
| Missing settings / design decisions | MS | 20 |
| **Settings-bearing subtotal** | | **199** |
| Migration register | MG | 17 |
| Duplicate/stale register | DUP | 24 |
| **Total** | | **240** |

---

## 2. Surface register

Every rendered screen, panel, bar, dialog, popover, menu, banner, toast, and native surface. The
`Rework` column is my reading of whether the Settings/Page-toolbar/export design work must touch the
surface; it is not a priority decision.

### 2.1 App shell and navigation

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| SH-01 | App window | Native window | App launch | `M/index.ts:250-289` | 1440×900, min 960×640, `hiddenInset` title bar, traffic lights at 16,14, dark background `#17181a`; single window only | Native macOS window controls | `--canvas` (`styles.css:24`) | OUT | `M/index.ts:258-268` |
| SH-02 | Title bar | Shell bar, 38 px | Always visible | `R/shell/TitleBar.tsx:14-55` | “NoteForest” + `/` + current document title button; Command Palette button (`⌘K` glyph) and Settings gear. No title when no document. Long titles clamp to `54vw` | Buttons are real `<button>` with `aria-label`; drag region `-webkit-app-region: drag` | Shell CSS family `.nf-titlebar*` (`styles.css:122-197`) | IN (global Settings entry) | `R/shell/TitleBar.tsx:23-53`; `styles.css:122-197` |
| SH-03 | Tab strip | Shell bar, 36 px | Always visible above the editor column | `R/shell/TabBar.tsx:159-208` | One tab per open document: dirty dot, lock icon, missing/recovery `!`, close button; drag reorder (`@dnd-kit`); middle-click close; overflow button. Empty strip still shows the action cluster | `role=tablist`, roving `tabIndex`, `aria-selected`, `aria-controls`; Arrow/Home/End/Delete; tab close button is `aria-hidden` + `tabIndex=-1` (mouse-only) | Shell CSS `.nf-tabbar*`, `.nf-tab*` (`styles.css:198-361`) | OUT | `R/shell/TabBar.tsx:46-83,128-157,159-208` |
| SH-04 | Tab overflow menu | Context menu (portal) | “All tabs” chevron | `R/shell/TabBar.tsx:105-126` | New document; separator; every open tab; up to 8 library documents (`Open · title`) | React Aria `Menu`, focus trap, Escape | `.nf-menu*` | OUT | `R/shell/TabBar.tsx:105-126`; `R/shell/ContextMenu.tsx:101-156` |
| SH-05 | Sidebar | Resizable panel, default 264 px (208–360) | Always visible unless collapsed/narrow | `R/shell/Sidebar.tsx:606-639`; `R/shell/Workspace.tsx:102-133` | Header, library, topics, footer; independent scroll; collapse via `⌘\`; width persisted in session | `<aside aria-label="Sidebar">`; splitter is a React Aria separator with `aria-label="Resize sidebar"` | `.nf-sidebar*` (`styles.css:450-748`) | OUT (but hosts Settings/theme entries) | `R/state/shell.ts:125-126,211-212`; `R/shell/Workspace.tsx:127` |
| SH-06 | Sidebar header | Button row | Always (sidebar visible) | `R/shell/Sidebar.tsx:611-621` | Search button (opens palette), “New note” button | Buttons, `⌘K` hint | `.nf-sidebar-head`, `.nf-sidebar-search`, `.nf-new-note` | OUT | `R/shell/Sidebar.tsx:611-621` |
| SH-07 | Library section | Panel section | Always (sidebar visible) | `R/shell/Sidebar.tsx:27-140` | Local filter input; document rows (icon, title, reason for non-ok, recovery label, open dot); per-row `⋯` menu; empty copy “No documents yet.” / “No matching documents.” | `role=list`/`listitem`; filter has `aria-label="Filter documents"`; row menu has per-document `aria-label` | `.nf-library-*` (`styles.css:450-748`) | OUT | `R/shell/Sidebar.tsx:44-138` |
| SH-08 | Library row menu | Context menu | Right-click row or `⋯` | `R/actions.ts:1072-1105` | Open / Open recovery; Reveal in Finder; Rename document (only for `ok` entries) | React Aria menu; rename opens document first | `.nf-menu*` | OUT | `R/actions.ts:1072-1105` |
| SH-09 | Topics outline | Tree panel | Always (sidebar visible) | `R/shell/Sidebar.tsx:380-604` | Chapters → blocks → children; anchored rows with `↳ “quote”`; per-row counts, anchor count, warning count, `Shared · N` chip; inline chapter rename; chevron collapse (shared with the canvas collapse state); double-click/F2 rename block label | React Aria `Tree`/`TreeItem`, single selection, `aria-label="Document topics"`; rename input `aria-label="Chapter title"`; rows have context menus | `.nf-tree*` (`styles.css:749-988`) | OUT (manual-break/stale anchor indicators could land here) | `R/shell/Sidebar.tsx:491-586` |
| SH-10 | Chapter / block context menus | Context menu | Right-click chapter row or block row | `R/actions.ts:1010-1035,770-1008` | Chapter: Rename chapter…, Add block. Block: full block menu (§3.5) | React Aria menu; Read-mode entries disabled with suffix | `.nf-menu*` | ADJ (manual-break entry candidate) | `R/actions.ts:1010-1035` |
| SH-11 | Sidebar footer | Footer row | Always (sidebar visible) | `R/shell/Sidebar.tsx:626-637` | Settings gear; static label “Graphite” | Gear `aria-label="Settings"` | `.nf-sidebar-foot*` | IN (appearance entry) | `R/shell/Sidebar.tsx:626-637` |
| SH-12 | Workspace splitter | 1 px visual / hit area | Drag | `R/shell/Workspace.tsx:115-131` | Sidebar/editor split; `onResize` persists width | React Aria `Separator` `aria-label="Resize sidebar"` | `.nf-separator` | OUT | `R/shell/Workspace.tsx:127` |
| SH-13 | Empty state (no document) | Canvas empty state | `tabs.length === 0` | `R/shell/Workspace.tsx:12-33` | “NoteForest”, “No document open.”, **New note**, **Open document**, hint `⌘N new · ⌘K search · ⌘\ sidebar` | Buttons; hint is plain text | `.nf-empty-*` (`styles.css:3142-3195`) | OUT | `R/shell/Workspace.tsx:59` |
| SH-14 | Status bar | Shell bar, 24 px | Always visible | `R/shell/StatusBar.tsx:17-231` | Save state dot + label; word/block counts; anchor-health chip; layout group (Continuous/Page); mode group (Edit/Read); Continuous-only zoom −/%/+/Fit/Focus; document path; “Dark” | `role=status`, `aria-live=polite`, `aria-atomic`; groups labelled; buttons `aria-pressed`; anchor chip has a full `aria-label`; zoom button label includes current percent | `.nf-statusbar*` (`styles.css:2994-3141`) | IN (Page toolbar/mode placement) | `R/shell/StatusBar.tsx:52-66,84-230` |
| SH-15 | Command palette | Modal overlay | `⌘K`, titlebar button, sidebar Search, menu View → Command Palette, palette command | `R/shell/CommandPalette.tsx:104-166` | Search field, grouped results (Commands / Documents / Blocks), first 60 matches, hints (shortcuts), footer key legend | React Aria `Modal`/`Autocomplete`/`SearchField`/`ListBox`; autofocus; `aria-label="Command palette"`, `aria-label="Search commands"`; ↑↓/↵/Esc | `.nf-palette*`, `.nf-overlay` (`styles.css:3241-3556`) | ADJ (Settings/export entries live here) | `R/shell/CommandPalette.tsx:104-166` |
| SH-16 | Native application menu | macOS menu bar | Always | `M/menu.ts:6-181` | NoteForest, File, Edit, View, Window, Help; items listed in §3.1 | Accelerators; Undo/Redo/zoom accelerators visually shown but `registerAccelerator: false` where the renderer is the single path | Native | IN (Settings/export/Page items) | `M/menu.ts:10-178` |
| SH-17 | Native text context menu | Native context menu | Right-click editable text | `M/menu.ts:184-196` | Cut / Copy / Paste / Select All with native enablement | Only when `params.isEditable` | Native | OUT | `M/menu.ts:184-196` |
| SH-18 | Renderer context menu | Portal overlay | Right-click/actions on blocks, refs, images, chapters, tabs, library rows | `R/shell/ContextMenu.tsx:101-156` | List of 28 px rows; optional shortcut; danger variant; viewport clamping; focus trap; restores focus unless an action took it | React Aria `Menu`; `role=presentation` wrapper; Escape/Tab trap; `aria-disabled` | `.nf-menu*` (`styles.css:4210-4269`) | ADJ (Page/export/break actions) | `R/shell/ContextMenu.tsx:24-99,101-156` |
| SH-19 | Native About panel | Native panel | App menu → About | `M/menu.ts:14` (`role: 'about'`) | Electron/OS default | Native | Native | OUT | `M/menu.ts:13-15` |
| SH-20 | Native close/quit prompts | Native modal | `⌘W` window close, quit, dirty documents | `M/index.ts:164-248` | (a) flush failure: “Changes not saved” Retry/Cancel; (b) dirty docs: Save / Don’t Save / Cancel, list of titles; (c) save-all failure: “Could not save your changes.” Cancel | Native buttons; `defaultId` Save, `cancelId` Cancel | Native | OUT | `M/index.ts:164-177,193-236` |

### 2.2 Native, menu, and overlay surfaces

The native menu is mapped in §3.1; the renderer context menu in §3.5; toasts and banners in §2.7.
This subsection exists to keep “menu bar”, “context menu”, and “toast” distinct from document
surfaces. **SH-22, SH-23, SH-24, and SH-26 are roll-up rows**: their detailed section/state rows live
in §2.6, §2.5, §2.7, and §2.9 respectively and are not counted as additional distinct surfaces.
SH-25 is the normal image node; its authoring sub-surface is CN-09.

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| SH-21 | Toast stack | Transient notification | Any action that calls `toast.*` | `R/App.tsx:767` (`<Toaster theme="dark" position="bottom-right" closeButton={false} />`) | Success / info / warning / error; 54 error call sites, 12 success, 11 info, 2 warning, 1 loading; optional `id` for dedupe; no action buttons | Sonner live region; no close button (`closeButton={false}`) | Sonner + `--surface-3` etc. (`.sonner` block `styles.css:4294-4309`) | ADJ (settings/export feedback) | `R/App.tsx:767`; `R/shell/*.tsx`, `R/editor/*.tsx` toast calls |
| SH-22 | Export status panel | Floating panel (fixed, 320 px) | Export flow | `R/export/ExportStatusPanel.tsx:39-220` | Four visible states: running, confirm-overwrite, done, failed; idle hides the panel. See §2.6 | `role=status` / `role=alert` / `role=alertdialog`; progressbar values; live regions | `.nf-export-*` (`styles.css:4310-4393`) | IN (final export surface) | `R/export/ExportStatusPanel.tsx:39-220`; `styles.css:4312-4392` |
| SH-23 | Settings dialog | Modal dialog, 480 px | `⌘,`, menu, titlebar, sidebar, palette, Help → Keyboard shortcuts | `R/shell/Dialogs.tsx:1912-2309` | Page density only + warnings + data paths + actions. See §2.5 | React Aria `Modal`/`Dialog`; `aria-label="Settings"`; one `Done` button; `role=alert` warnings; `role=status` saved note | `.nf-dialog*`, `.nf-settings-*`, `.nf-density-*`, `.nf-range` | IN | `R/shell/Dialogs.tsx:1912-2309` |
| SH-24 | Recovery tab | Tab panel | Open a corrupt/missing/newer package | `R/shell/RecoverySurface.tsx:144-335` | See §2.7 | `role=tabpanel`; headings; details/summary | `.nf-recovery-*` (`styles.css:1252-1530`) | OUT | `R/shell/RecoverySurface.tsx:144-335` |
| SH-25 | Image node | Inline editor node | Paste/drop/insert image | `R/editor/views/ImageNodeView.tsx:438-712` | Normal image with action rail; missing/unavailable placeholder; region/point markers; draw layer; pending draft bar; authoring error | Action buttons with `aria-label`; marker buttons announce kind, number, quote, branch count; draw layer has `aria-label`; pointer capture for drag | `.nf-image-*` (`styles.css:2089-2378`) | OUT (image region follow-ups) | `R/editor/views/ImageNodeView.tsx:438-712` |
| SH-26 | Print test surface | Dev/test-only overlay | `window.__noteforestTest.renderPrint()` | `R/print/test-surface.tsx:1-43` | Mounts a print model in the live renderer for tests | None | Print CSS | OUT | `R/print/test-surface.tsx:1-43` |

### 2.3 Continuous layout

Continuous is the default layout and the primary authoring surface. It mounts one ProseMirror
document; Read mode keeps it mounted and flips `isEditable`.

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| CN-01 | Continuous editor surface | Scroll canvas | Layout = Continuous | `R/editor/DocumentEditor.tsx:742-789` | `.nf-editor-scroll` → `.nf-canvas` (CSS `zoom` from view state) → `.nf-canvas-content`; EditorContent plus SVG edge layer; horizontal + vertical scroll | `role=textbox`, `aria-multiline`, `aria-label="Document body"`; Read mode sets `aria-readonly="true"` and label “Document body, read mode” | Continuous tokens; `.nf-canvas*`, `.nf-editor*` (`styles.css:989-1585`) | OUT | `R/editor/DocumentEditor.tsx:281-366,474-538,742-789` |
| CN-02 | Chapter card | Node view | Every chapter | `R/editor/views/BlockViews.tsx:60-207` | “Chapter” eyebrow; inline-editable title; empty copy “No top-level blocks yet.”; footer “+ Add top-level block”; context menu | Title button/input; Enter commits, Esc cancels; Read mode removes title button from tab order and closes an open input | `.nf-chapter*` (`styles.css:1530-1585`) | OUT | `R/editor/views/BlockViews.tsx:94-205` |
| CN-03 | Block card | Node view | Every block | `R/editor/views/BlockViews.tsx:1053-1443` | Gutter drag handle; prose; optional callout head; reference chips; anchor warning; add-child/add-sibling buttons; branch port with child count; selected/editing/read/collapsed/callout/below-row states via `data-*` | Gutter button `aria-label="Block actions and reorder"`, `aria-haspopup="menu"`; add buttons labelled; branch port `aria-expanded`; callout quote button announces anchor kind/quote/branch count | Continuous tokens; `.nf-block-*`, `.nf-gutter*`, `.nf-add-*`, `.nf-branch-port` (`styles.css:1586-2570`) | OUT | `R/editor/views/BlockViews.tsx:1153-1443` |
| CN-04 | Callout head / anchor quote | Card sub-surface | Anchored child block | `R/editor/views/BlockViews.tsx:1241-1300` | Quote glyph by kind (`“`, `Σ`, `{}`, `▧`); quote text; “Ambiguous” / “Lost anchor” warning with icon | Quote is a button that selects the source anchor; `aria-label` includes formula/code/image point/region | `.nf-callout-head`, `.nf-callout-quote*`, `.nf-callout-state` | OUT | `R/editor/views/BlockViews.tsx:1241-1300` |
| CN-05 | Anchor markers | Marker layer | Selected block with anchors | `R/editor/views/BlockViews.tsx:1192-1222` | One dot button per anchor; state attr (`broken`, `ambiguous`, etc.); hidden when no markers; idle anchors lose underline/dot/marker (DOM view state only) | Buttons with full `aria-label` (“Anchor: ‘quote’, N branches”) | `.nf-anchor-*` (`styles.css:1671-1925`) | OUT | `R/editor/views/BlockViews.tsx:1192-1222`; `R/editor/DocumentEditor.tsx:667-700` |
| CN-06 | Reference chips | Card overlay | Block with incoming/outgoing references | `R/editor/views/BlockViews.tsx:1302-1360` | “See also …” and “Referenced by …” chips with optional quote and target title; click to focus; right-click opens reference menu | `<button>` with `title`; no `aria-label` beyond text (textValue includes all parts) | `.nf-ref-*` (`styles.css:1926-2088`) | OUT | `R/editor/views/BlockViews.tsx:1302-1360` |
| CN-07 | Edge overlay | SVG layer | Always (Continuous) | `R/editor/edges/EdgeLayer.tsx`; `R/editor/DocumentEditor.tsx:755-768` | Primary orthogonal edges, reference dashed edges, trunks; selected path accent; edge click opens block menu; trunk click toggles collapse; reference edge click focuses target | SVG `aria-hidden`; interactions are duplicated on real buttons (branch port) | `--nf-edge-*`, `.nf-edge-*` (`styles.css:2821-2933`) | OUT | `R/editor/DocumentEditor.tsx:755-768` |
| CN-08 | Selection toolbar | Bubble menu | Text/node selection in Continuous Edit | `R/editor/SelectionToolbar.tsx:31-126` | Branch from selection; Bold; Italic; Inline code; Link; Math. Link mode swaps to a URL input + Apply | Buttons use `aria-label` + `aria-pressed`; form input `aria-label="Link URL"`; `onMouseDown` preventDefault keeps selection | `.nf-bubble*` (`styles.css:2934-2993`) | OUT | `R/editor/SelectionToolbar.tsx:31-126` |
| CN-09 | Image authoring overlay | In-image draw layer | Image action menu → Add region/point | `R/editor/views/ImageNodeView.tsx:576-707` | Drawing rectangle or point; draft outline; pending bar “Branch from region/point”; Cancel; Branch; inline notice / error | Draw layer `aria-label`; pending controls are buttons; pointer drag; Alt forces point | `.nf-image-draw*`, `.nf-image-action*` | OUT | `R/editor/views/ImageNodeView.tsx:576-707`; `R/lib/image-authoring.ts:19-70` |
| CN-10 | Canvas footer | Footer row | Always (Continuous) | `R/editor/DocumentEditor.tsx:770-783` | “+ Add chapter” button; disabled in Read mode | Native button with title/aria; disabled | `.nf-canvas-footer`, `.nf-canvas-action` | OUT | `R/editor/DocumentEditor.tsx:770-783` |
| CN-11 | Continuous empty document | Empty state | Document with no blocks | `R/editor/DocumentEditor.tsx:164-191` | “This document has no blocks yet.” + **Add first block** | Button disabled when not editable/Read | `.nf-empty-*`, `.nf-editor-empty` | OUT | `R/editor/DocumentEditor.tsx:213-223` |
| CN-12 | Continuous Read mode | Mode state | `⌘E`, status bar Read | `R/editor/DocumentEditor.tsx:474-538` | Editor mounted but not editable; image authoring cleared; selection toolbar not rendered; mutating gutter/add controls hidden; chapter title not editable; paste/drop/import blocked | `aria-readonly=true`; label changes; selection/links/anchors/copy/focus remain | Same surface, no Read-specific CSS family | ADJ (Read gating parity) | `R/editor/DocumentEditor.tsx:290,493-506,786-788` |
| CN-13 | Focus branch | View filter | `⇧⌘F`, status bar Focus | `R/editor/DocumentEditor.tsx:634-665` | Ancestor chain + full subtree remain; other rows/chapters `display:none`; no document mutation | Status button `aria-pressed`; no dedicated announce | `.nf-status-focus` | OUT | `R/editor/DocumentEditor.tsx:634-665`; `R/actions.ts:465-478` |
| CN-14 | Continuous document banners | Banner stack | Above the editor | `R/editor/DocumentEditor.tsx:140-162` | Read-only reason, Save failure banner, repair notice + Dismiss | `role=status` / `role=alert` inside components | `.nf-readonly-banner`, `.nf-save-failure`, `.nf-repair-banner` | OUT | `R/editor/DocumentEditor.tsx:140-162` |

### 2.4 Page layout

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| PG-01 | Page layout surface | Layout root | Layout = Page (`⌘3`, status bar) | `R/page/PageView.tsx:763-793` | Toolbar, optional banners, scroll stage, one sheet (viewport shows one page at a time), Page Edit overlay; `data-ready/updating/page-count/current-page/density/defect-count/model-runs` diagnostics | `role=region`, `aria-label="Page layout"`, `aria-busy`; root is focusable `tabIndex=0` | Page CSS + inline `pageCssVariables(settings.theme)` | IN (toolbar/setup surface) | `R/page/PageView.tsx:763-793` |
| PG-02 | Page toolbar | Toolbar rail | Layout = Page | `R/page/PageView.tsx:794-905` | Group 1: Previous, “Page N of M”, Next. Group 2: zoom −, %, +, Fit page, Fit width, Actual. Spacer; “Updating…” status; **Export PDF**; **Open in continuous editor** (disabled without selection). `flex-wrap: nowrap` + horizontal overflow | `role=toolbar`, `aria-label="Page layout controls"`; every button labelled; fit buttons `aria-pressed` | `.nf-page-toolbar*` (`styles.css` Page section 4427-5130) | IN | `R/page/PageView.tsx:794-905`; `styles.css` `.nf-page-toolbar` |
| PG-03 | Page sheet + chrome | Fixed-size sheet | Layout = Page | `R/page/PageView.tsx:237-360` | Header (document title, chapter title), ghost list (“continued from page N …”), footer (chapter, “Page N of M”), continues list (“continues on page N …”). Sheets are exact geometry from resolved settings | `role=document`, `aria-label="Page N of M"`; chrome text is plain spans (no reading-order grouping) | Page light skin; `.nf-page-sheet/header/footer/ghost/continues` | ADJ (chrome toggles DES) | `R/page/PageView.tsx:237-297,324-359` |
| PG-04 | Page fragments | Selectable block boxes | Layout = Page | `R/page/PageView.tsx:136-231,938-955` | One absolute box per block fragment; label + static segment HTML; selected ring; defect/anchor badges; keyboard activation | `role=group`, `tabIndex=0`, `aria-label` includes title/page and what Enter does; `aria-keyshortcuts="Enter"`; Enter edits (Page Edit) or opens Continuous; Space selects | `.nf-page-fragment`, `.nf-page-card` | IN (Page Edit affordance) | `R/page/PageView.tsx:136-231` |
| PG-05 | Page edges / trunks / labels | SVG overlay | Layout = Page when edges exist | `R/page/PageEdges.tsx:62-207` | Orthogonal primary/reference routes, group trunks across pages, cross-page labels in the margin (“continues…” / “from…”), blocked-route class | SVG `aria-hidden`; cross-page labels are `<div>`s with `aria-label` and `title`; group `aria-label="Page reference indicators"` | `.nf-page-edge-*`, `.nf-page-trunk-*`; shared `EDGE_STYLE` | OUT | `R/page/PageEdges.tsx:62-207` |
| PG-06 | Page defect badge/banner | Status surfaces | Any blocking layout defect | `R/page/PageView.tsx:95-105,227,357,906-916` | Badge “Layout defect”/“Block defect” with tooltip; banner “N blocking layout defects: first message” | Banner `role=status`; badge is a span with `title` (not focusable) | `.nf-page-badge`, `.nf-page-banner*` | OUT | `R/page/PageView.tsx:95-105,906-916` |
| PG-07 | Page anchor warnings | Badge | Fragment with broken/ambiguous anchor | `R/page/PageView.tsx:107-120,228` | “⚠ anchor” badge; tooltip lists anchor ids/states | Span + `title`; not focusable | `.nf-page-anchor-badge` | OUT | `R/page/PageView.tsx:107-120` |
| PG-08 | Page placeholders | In-sheet state | Loading / error / empty | `R/page/PageView.tsx:720-758` | Loading: “Laying out pages… / Measuring page typography and paginating.” Error: title + message + **Retry** + **Open in continuous editor**. Empty: “Nothing to paginate yet.” + **Open in continuous editor** | Headings, buttons; no live-region wrapper on the placeholder itself | `.nf-page-placeholder*` | ADJ (loading copy) | `R/page/PageView.tsx:720-758` |
| PG-09 | Page Edit overlay | In-sheet editor | Page Edit mode + click/double-click/Enter on a fragment | `R/page/PageBlockEditor.tsx:255-292` | Floating white editor over the exact fragment box; header “Editing <title>”, “Esc or ⌘⏎ commits”, **Done**; internal scroll; spanning-block state; commit error keeps text | `role=dialog`, `aria-modal=false`, `aria-label="Edit block: title"`, `aria-keyshortcuts="Escape Meta+Enter"`; focus starts at block start | `.nf-page-edit-*` (`styles.css:5131-end`) | IN (Page Edit polish; not settings) | `R/page/PageBlockEditor.tsx:255-292` |
| PG-10 | Page Edit commit error | Inline error | Commit rejected | `R/page/PageBlockEditor.tsx:284-288` | Error message + “Your text is still here; retry or copy it before closing.” | `role=alert` | `.nf-page-edit-error` | OUT | `R/page/PageBlockEditor.tsx:284-288` |
| PG-11 | Page setup / density surface | **ABSENT** | — | — | No in-Page setup, margins, size, orientation, or density control. Density exists only inside Settings. Page toolbar has no Settings/Page setup button | — | — | IN (the central missing surface) | `R/page/PageView.tsx:794-905`; `R/shell/Dialogs.tsx:2149-2267` |

### 2.5 Settings

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| ST-01 | Settings dialog frame | Modal, 480 px | `⌘,` (native + renderer), menu, titlebar, sidebar, palette, Help → Keyboard shortcuts | `R/shell/Dialogs.tsx:2056-2307`; frame `:73-88` | Title “Settings”; one body scroll; `Done` action; no section navigation, no tabs, no search, no preview | React Aria Dialog labelled by title; modal overlay dismissable; `Done` or overlay click closes | `.nf-dialog*`, `.nf-overlay` | IN | `R/shell/Dialogs.tsx:73-88,2056-2060` |
| ST-02 | Global settings warning | Alert block | Read status `corrupt` / `unreadable` / `newer` | `R/shell/Dialogs.tsx:2062-2103` | Corrupt/unreadable: “settings.json could not be read…” + message + backup path + **Reset settings** (corrupt only) + **Dismiss**; newer: schema version + “Unknown fields are preserved.” + **Dismiss** | `role=alert`; buttons | `.nf-settings-warning` | IN | `R/shell/Dialogs.tsx:2062-2103` |
| ST-03 | Document settings warning | Alert block | `document-settings.json` corrupt/unreadable | `R/shell/Dialogs.tsx:2104-2134` | “Per-document settings could not be read…” + message + backup path + **Dismiss** (no reset) | `role=alert` | `.nf-settings-warning` | IN | `R/shell/Dialogs.tsx:2104-2134` |
| ST-04 | Page density section | Settings section | Always (global); document scope only with an open document | `R/shell/Dialogs.tsx:2149-2267` | “Page” heading; scope radios **Global default** / **This document** (disabled without document); disabled reason note; “Page density” range 60–120 step 5 + value + **Reset**; explanatory note; **Apply** / **Cancel** / **Use global density**; saved note | Fieldset/legend; native range with `aria-valuetext`; buttons disabled by dirty/busy; saved note `role=status` | `.nf-settings-section`, `.nf-density-*`, `.nf-range` | IN | `R/shell/Dialogs.tsx:2149-2267` |
| ST-05 | Data/About block | Definition list + actions | Always | `R/shell/Dialogs.tsx:2268-2305` | Library path; app data path; “Theme · Graphite · dark (light tokens reserved)”; **Reveal library in Finder**; **Undo last change** (disabled without document); no-document note; footer note “Autosave runs after 800 ms; ⌘S flushes immediately.” | `<dl>`; buttons | `.nf-settings-list`, `.nf-dialog-note` | IN (About/Data home candidate) | `R/shell/Dialogs.tsx:2268-2305` |
| ST-06 | Settings save error / retry | Inline alert | A queued settings write fails | `R/shell/Dialogs.tsx:2140-2147` | Error message or last save error + **Retry** | `role=alert`; button | `.nf-settings-warning` | IN | `R/shell/Dialogs.tsx:2140-2147` |

### 2.6 Export

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| EX-01 | Export flow trigger | Command | File → Export PDF…, `⇧⌘E`, palette, Page toolbar | `M/menu.ts:57-62`; `R/actions.ts:1138-1142`; `R/page/PageView.tsx:880-889` | No document → toast; busy → toast; otherwise native save dialog. Read-only documents may export. A Page Edit overlay is committed before the snapshot | Buttons; menu accelerator | — | IN | `R/export/export-flow.ts:144-198`; `R/App.tsx:253-263` |
| EX-02 | Native export save dialog | Native modal | After export trigger | `M/index.ts:552-589` | Title “Export PDF”, button “Export”, default bare filename `<title>.pdf`, PDF filter, overwrite confirmation; returns chosen path + `exists` | Native | Native; `pdfFileNameForTitle` sanitization | IN (default folder/filename) | `M/index.ts:555-589` |
| EX-03 | Export progress panel | Floating panel | Job running | `R/export/ExportStatusPanel.tsx:89-131` | “Exporting PDF…”, percent, phase label (“Preparing…”, “Reading the document…”, “Building pages…”, “Printing…”, “Checking the PDF…”, “Writing the file…”), progress bar, output path, **Cancel** / “Cancelling…” | `role=status`, `aria-live=polite`, `role=progressbar` with min/max/now | `.nf-export-*` | IN | `R/export/ExportStatusPanel.tsx:18-33,89-131` |
| EX-04 | Replace confirmation | Floating alert dialog | Chosen path already exists | `R/export/ExportStatusPanel.tsx:52-87` | “Replace existing PDF?”, “A file already exists at this path. Replacing it cannot be undone.”, path, **Cancel**, **Replace PDF** | `role=alertdialog`, `aria-label="Replace existing PDF"`; **not** a native dialog | `.nf-export-*` | IN | `R/export/ExportStatusPanel.tsx:52-87`; `R/export/export-flow.ts:181-214` |
| EX-05 | Export success | Floating status | Job done | `R/export/ExportStatusPanel.tsx:133-180` | “PDF exported”, page count, output path, up to 6 warnings, **Done**, **Reveal in Finder** | `role=status`, `aria-live=polite` | `.nf-export-panel-done` | IN | `R/export/ExportStatusPanel.tsx:133-180` |
| EX-06 | Export failure | Floating alert | Preflight/job failure | `R/export/ExportStatusPanel.tsx:182-219` | “Export failed”, error code, message, up to 8 typed details with block title, **Dismiss** | `role=alert`, `aria-live=assertive` | `.nf-export-panel-failed` | IN | `R/export/ExportStatusPanel.tsx:182-219` |

### 2.7 Documents, recovery, and save state

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| DC-01 | Recovery tab | Tab surface | Corrupt / missing / newer package from session or library | `R/shell/RecoverySurface.tsx:144-335` | Eyebrow “Read-only recovery”; headline; title; description; “Read-only · no overwrite” pill; Status/Folder/Reason; validation details; warnings; backups list (newest first, valid/invalid); **Restore newest valid backup**, **Retry** and **Remove tab** (missing only), **Reveal in Finder**, **Close tab**; note/error | Headings; `role=status`/`role=alert`; buttons; `<details>` | `.nf-recovery-*` (`styles.css:1252-1530`) | OUT | `R/shell/RecoverySurface.tsx:144-335` |
| DC-02 | Missing-document tab | Tab state | Session path no longer opens | `R/App.tsx:159-167`; `R/shell/Workspace.tsx:63-81` | Tab title from recent/library or last path segment; `missing: true`; `!` marker; opens `RecoverySurface` with status `missing` | Same recovery surface | `.nf-tab-missing` | OUT | `R/App.tsx:160-166` |
| DC-03 | Restore backup dialog | Modal | Save failure → Restore backup… | `R/shell/Dialogs.tsx:375-551` | Reading backups; error; empty “No usable backups”; radio list of backups (title, metadata, unusable reason); **Restore copy…**; note that the current file is untouched | Fieldset/legend; native radios; busy states | `.nf-backup-*`, `.nf-dialog-*` | OUT | `R/shell/Dialogs.tsx:375-551` |
| DC-04 | Save failure banner | Persistent banner | Any failed save | `R/shell/SaveFailureBanner.tsx:86-160` | Headline and hint per code; message; path; **Retry**, **Restore backup…**, **Overwrite…** (external modification only), **Save a copy…**, **Reload from disk…**, **Reveal in Finder**; “Autosave is paused.” | `role=alert`, `aria-live=assertive`; busy labels | `.nf-save-failure*` (`styles.css:1195-1251`) | OUT | `R/shell/SaveFailureBanner.tsx:86-160` |
| DC-05 | Stale lock banner | Consent banner | Read-only because lock heartbeat is stale | `R/shell/StaleLockBanner.tsx:47-141` | “Read-only · stale lock”; explanation; PID/Host/Session/Heartbeat or corrupt-lock message; **Take over lock**, **Cancel**; after Cancel: “Stayed read-only…” + **Review lock** | `role=region`, `aria-label="Stale document lock"`; `role=alert` on error | `.nf-stale-lock*` (`styles.css:1120-1194`) | OUT | `R/shell/StaleLockBanner.tsx:47-141` |
| DC-06 | Read-only banner | Banner | Document opened read-only (not stale lock) | `R/editor/DocumentEditor.tsx:143-150` | “Read-only document · <reason>. Your file is not being modified.” | `role=status` | `.nf-readonly-banner` | OUT | `R/editor/DocumentEditor.tsx:143-150` |
| DC-07 | Repair notice banner | Banner | Anchor repair / auto-resolve notice | `R/editor/DocumentEditor.tsx:152-159` | Notice text + **Dismiss** | `role=status`; button | `.nf-repair-banner`, `.nf-repair-dismiss` | OUT | `R/editor/DocumentEditor.tsx:152-159` |
| DC-08 | Close-tab unsaved dialog | Modal | Close dirty tab | `R/shell/Dialogs.tsx:234-267` | “Close tab?”, “This tab has changes that have not been saved yet.”, document title, **Cancel**, **Don’t Save**, **Save** | React Aria Dialog; primary Save | `.nf-dialog*` | OUT | `R/shell/Dialogs.tsx:234-267`; `R/actions.ts:279-300` |
| DC-09 | Reload-from-disk dialog | Modal | Save failure → Reload, or external change | `R/shell/Dialogs.tsx:269-300` | “Reload from disk?”, “Unsaved changes in this window will be discarded.”, title/path, **Cancel**, **Reload from disk** (danger) | Dialog; destructive button | `.nf-dialog*` | OUT | `R/shell/Dialogs.tsx:269-300` |
| DC-10 | Overwrite-external dialog | Modal, Cancel-focused | Save failure → Overwrite… | `R/shell/Dialogs.tsx:325-373` | Confirmation title/description from `overwriteConfirmation`; “will replace <path>”; external changes lost; **Cancel**, destructive confirm | Cancel focused explicitly; dialog buttons | `.nf-dialog*` | OUT | `R/shell/Dialogs.tsx:325-373` |
| DC-11 | Native Save a copy dialog | Native modal | Save failure → Save a copy… | `M/index.ts:329-349` | Title “Save a copy”, button “Save copy”, default `<name> copy` in library, create directory + overwrite confirmation | Native | Native | OUT | `M/index.ts:329-349` |

### 2.8 Dialogs

All renderer dialogs use the shared `Frame` (`R/shell/Dialogs.tsx:73-88`): 480 px (or 640 px “wide”),
title, optional description, scrollable body, right-aligned actions, overlay dismiss.

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| DL-01 | No-document fallback | Modal | Any document-only dialog with no runtime | `R/shell/Dialogs.tsx:102-111` | “No document open” / “Open a document before using this command.” / **Close** | Dialog | `.nf-dialog*` | OUT | `R/shell/Dialogs.tsx:96-111` |
| DL-02 | Move to… | Modal, ListBox | Block menu → Move to… | `R/shell/Dialogs.tsx:1423-1491` | “Choose a new primary parent. Cycles and descendant moves are rejected.”; list “Top level (chapter)” + every non-descendant block; **Cancel**, **Move** | React Aria `ListBox` with `aria-label="New parent"`; single selection | `.nf-listbox*` | OUT | `R/shell/Dialogs.tsx:1423-1491` |
| DL-03 | Delete block | Modal | Block menu → Delete block…; `⌘⌫`/Delete when confirmation needed | `R/shell/Dialogs.tsx:1493-1591` | Title “Delete block”, descendant count; radios **Keep descendants as top-level blocks** / **Delete the whole subtree**; external references list; **Cancel**, danger **Delete** | Fieldset/legend, radios; destructive button | `.nf-dialog*` | OUT | `R/shell/Dialogs.tsx:1493-1591` |
| DL-04 | Detach branch | Modal | Block menu → Detach from parent | `R/shell/Dialogs.tsx:162-187` | “Detach branch?”, target becomes top-level, content kept; **Cancel**, **Detach** | Dialog | `.nf-dialog*` | OUT | `R/shell/Dialogs.tsx:162-187` |
| DL-05 | Link as reference | Modal | `⇧⌘L`, block menu, anchor menu, palette | `R/shell/Dialogs.tsx:1285-1421` | Source block/anchor; filter input; list of all other blocks (title + chapter); **Cancel**, **Link** (disabled until target) | `aria-label="Filter blocks"`, `aria-label="Reference target"`; ListBox | `.nf-listbox*` | OUT | `R/shell/Dialogs.tsx:1285-1421` |
| DL-06 | Anchor health | Wide modal | Status chip, anchor warning, block menu, palette | `R/shell/Dialogs.tsx:581-1283` | Summary line; filters All/Broken/Ambiguous with counts; anchor rows (state, kind, branch count, quote, context, block · chapter, reason) with Repair / Remove anchor; detail view; repair candidates; preview; confirm; branch list; read-only note | `role=group` filters with `aria-pressed`; list `aria-label="Anchors"`; buttons labelled; `role=alert` errors | `.nf-health*` (`styles.css:3557-4209`) | OUT | `R/shell/Dialogs.tsx:581-1283` |
| DL-07 | Rename document / chapter / block | Modal (shared) | Titlebar click, palette, tab menu, library menu, chapter double-click/F2 | `R/shell/Dialogs.tsx:1593-1644`; callers `:189-224` | “Rename document/chapter/block”, Name field, **Cancel**, **Save**; Enter saves | Label + React Aria Input; autofocus | `.nf-input` | OUT | `R/shell/Dialogs.tsx:1593-1644` |
| DL-08 | Link | Modal | `⌘⇧K`, selection toolbar Link | `R/shell/Dialogs.tsx:1646-1686` | “Link”, “Add a link to the selected text.”, URL field, **Cancel**, **Apply**; empty URL removes link | Label + Input | `.nf-input` | OUT | `R/shell/Dialogs.tsx:1646-1686` |
| DL-09 | Math | Modal | Insert math (palette, selection toolbar), LaTeX double-click, `nf:edit-math` | `R/shell/Dialogs.tsx:1688-1840` | Insert/Edit title; LaTeX textarea; Inline/Display radios; **Branch from term** when a LaTeX selection exists; **Cancel**, **Apply**; Enter applies, Shift+Enter newline | Textarea; native radios; term selection from textarea selection | `.nf-input`, `.nf-textarea`, `.nf-inline-radios` | OUT | `R/shell/Dialogs.tsx:1688-1840` |
| DL-10 | Image alt text | Modal | Image action menu → Edit image alt text… | `R/shell/Dialogs.tsx:1842-1910` | Description; single-line alt input; **Cancel**, **Save**; Enter saves | `aria-label="Alt text"` | `.nf-input` | OUT | `R/shell/Dialogs.tsx:1842-1910` |
| DL-11 | Native image picker | Native modal | Insert image, Replace image | `M/index.ts:495-514` | Title “Insert image”, button “Insert”, image-extension filter; cancel returns `{canceled:true}` | Native | Native | OUT | `M/index.ts:495-514` |

### 2.9 Print / PDF surface

| ID | Surface | Type | Entry points | Component / file | Contents / states | Keyboard / a11y | Style ownership | Rework | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| PR-01 | Print document root | Hidden BrowserWindow page | Main process export job | `R/print.html:1-16`; `R/print/entry.tsx`; `M/export-window.ts:95-116` | Hidden 1200×900 white window, sandboxed, no preload; loads `print.html`; `window.__noteforestPrint.build(snapshot)` measures and renders; render-settled handshake | Not user-interactive | Print CSS + `pageCssVariables` | IN (PDF output is a design target) | `R/print.html:1-16`; `R/print/entry.tsx:1-14`; `M/export-window.ts:95-116` |
| PR-02 | Print sheets | Fixed pages | Inside print window | `R/print/PrintDocument.tsx:72-300`; `R/print/print.css:28-104` | One fixed sheet per derived page; light skin always; page chrome and labels reused; `.nf-print-fragment`; one owned `break-after` rule | Not user-interactive; text layer is real | `.nf-print-*` + Page skin | IN (visual parity) | `R/print/PrintDocument.tsx:72-300`; `print.css:19-104` |
| PR-03 | Print test surface | Dev/test overlay | Test bridge only | `R/print/test-surface.tsx:1-43` | Mounts a print model in the live renderer | None | Print CSS | OUT | `R/print/test-surface.tsx:1-43` |

---

## 3. Command register

One row per distinct user action. The same action can appear on several surfaces; the duplicates are
counted, not collapsed, because surface parity is part of the review.

### 3.1 Native application menu

`M/menu.ts:6-181`. The menu is installed once at startup (`M/index.ts:646`) and is **not rebuilt or
gated** when the active document, layout, mode, or selection changes. Accelerators marked “renderer”
are shown in the menu but not registered natively (the renderer owns the shortcut so one keypress has
one delivery path).

| ID | Menu item | Menu path | Accelerator | Native enabled state | Renderer handler | Notes |
|---|---|---|---|---|---|---|
| CMD-M01 | New Document | File | `⌘N` | Always enabled | `createNewDocument()` (`runMenuCommand`, `R/actions.ts:1259-1261`) | Creates “Untitled” immediately; no naming dialog. Works with no document. |
| CMD-M02 | Open Document… | File | `⌘O` | Always enabled | Opens palette with `documentsOnly` (`R/actions.ts:1262-1264`) | Not a native open dialog; only library documents are listed. |
| CMD-M03 | New Chapter | File | `⇧⌘N` | Always enabled | `createChapter()` (`:1286-1288`) | No document → silent no-op (`R/actions.ts:175-182`). |
| CMD-M04 | Save | File | `⌘S` | Always enabled | `saveActive()` (`:1265-1267`) | No document → no-op. Commits a Page Edit overlay first. |
| CMD-M05 | Export PDF… | File | `⇧⌘E` | Always enabled | `exportActiveDocument()` (`:1268-1270`) | No document → toast error; no save dialog. Read-only allowed. |
| CMD-M06 | Close Tab | File | `⌘W` | Always enabled | `closeActiveTab()` (`:1271-1273`) | No tab → no-op. Dirty tab → dialog. |
| CMD-M07 | Reopen Closed Tab | File | `⇧⌘T` | Always enabled | `reopenClosedTab()` (`:1274-1276`) | Empty stack → info toast. |
| CMD-M08 | Close Window | File | `⇧⌘W` | Always enabled | `getWindow()?.close()` (`M/menu.ts:74-78`) | Native close guard runs. |
| CMD-M09 | Undo | Edit | `⌘Z` | Always enabled | `undoActive()` (`:1294-1296`) | Native accelerator not registered; renderer keydown is the only path. |
| CMD-M10 | Redo | Edit | `⇧⌘Z` | Always enabled | `redoActive()` (`:1297-1299`) | Same. |
| CMD-M11 | Cut | Edit | `⌘X` | Native role | Electron role | Native |
| CMD-M12 | Copy | Edit | `⌘C` | Native role | Electron role | Native |
| CMD-M13 | Paste | Edit | `⌘V` | Native role | Electron role | Native |
| CMD-M14 | Paste and Match Style | Edit | role default | Native role | Electron role | Native |
| CMD-M15 | Delete | Edit | — | Native role | Electron role | Native |
| CMD-M16 | Select All | Edit | `⌘A` | Native role | Electron role | Native |
| CMD-M17 | Command Palette… | View | `⌘K` | Always enabled | `dispatch('command-palette')` | Toggles palette. |
| CMD-M18 | Toggle Sidebar | View | `⌘\` | Always enabled | `toggleSidebar()` (`:1277-1279`) | Persisted in session. |
| CMD-M19 | Reload | View | `⌘R` | Always enabled | Electron role | Developer/browser reload; not product behavior. |
| CMD-M20 | Force Reload | View | `⇧⌘R` | Always enabled | Electron role | Developer. |
| CMD-M21 | Toggle DevTools | View | `⌥⌘I` | Always enabled | Electron role | Developer. |
| CMD-M22 | Fit Width | View | `⇧⌘0` | Always enabled | `fitActiveWidth()` (`:1309-1311`) | Dispatches `nf:fit-width`; **only the Continuous editor listens** (`R/editor/DocumentEditor.tsx:735-740`). In Page it is a no-op. |
| CMD-M23 | Focus Branch | View | `⇧⌘F` | Always enabled | `toggleFocusBranch()` (`:1312-1314`) | Works in both layouts as view state. |
| CMD-M24 | Actual Size | View | `⌘0` | Always enabled | `resetActiveZoom()` (`:1306-1308`) | Resets **Continuous** zoom; Page zoom untouched. |
| CMD-M25 | Zoom In | View | `⌘+` | Always enabled | `adjustActiveZoom(0.1)` (`:1300-1302`) | Changes **Continuous** zoom even in Page. |
| CMD-M26 | Zoom Out | View | `⌘-` | Always enabled | `adjustActiveZoom(-0.1)` (`:1303-1305`) | Same. |
| CMD-M27 | Toggle Full Screen | View | `⌃⌘F` | Native role | Electron role | Native |
| CMD-M28 | Minimize | Window | `⌘M` | Native role | Electron role | Native |
| CMD-M29 | Zoom | Window | — | Native role | Electron role | Native window zoom, not document zoom |
| CMD-M30 | Bring All to Front | Window | — | Native role | Electron role | Native |
| CMD-M31 | Settings… | NoteForest (app menu) | `⌘,` | Always enabled | `openDialog({kind:'settings'})` (`:1283-1285`) | Duplicated by the renderer `⌘,` fallback, titlebar, sidebar, palette. |
| CMD-M32 | Keyboard shortcuts | Help | — | Always enabled | `send('settings')` (`M/menu.ts:170-177`) | Opens Settings; there is no shortcuts surface. Frozen inventory DUP-19/AP-22 marks this for the final menu design. |
| CMD-M33 | About NoteForest | NoteForest | — | Native role | Electron role | Native About panel; no in-app About. |
| CMD-M34 | Services | NoteForest | — | Native role | Electron role | Native |
| CMD-M35 | Hide NoteForest | NoteForest | `⌘H` | Native role | Electron role | Native |
| CMD-M36 | Hide Others | NoteForest | `⌥⌘H` | Native role | Electron role | Native |
| CMD-M37 | Show All | NoteForest | — | Native role | Electron role | Native |
| CMD-M38 | Quit NoteForest | NoteForest | `⌘Q` | Native role | Electron role, close guard applies | Native |

### 3.2 Command palette

`paletteCommands()` in `R/actions.ts:1118-1255`. Read mode wraps mutating entries with the suffix
“ — Read mode” and `disabled: true` (`:1122-1132`); the label stays searchable. The palette is the only
surface that gates commands this way.

| ID | Command | Label | Shortcut hint | Disabled / gated | Handler | Notes |
|---|---|---|---|---|---|---|
| CMD-P01 | new-document | New document | `⌘N` | Never | `createNewDocument()` | Same as menu |
| CMD-P02 | new-chapter | New chapter | `⇧⌘N` | Read mode | `createChapter()` | |
| CMD-P03 | save | Save now | `⌘S` | Never | `saveActive()` | Label differs from menu “Save”. |
| CMD-P04 | export-pdf | Export PDF… | `⇧⌘E` | Never | `exportActiveDocument` | |
| CMD-P05 | close-tab | Close tab | `⌘W` | Never | `closeActiveTab()` | |
| CMD-P06 | toggle-sidebar | Toggle sidebar | `⌘\` | Never | `toggleSidebar` | |
| CMD-P07 | zoom-in | Zoom in | `⌘+` | Never | `adjustActiveZoom(0.1)` | Continuous zoom only; wrong target in Page. |
| CMD-P08 | zoom-out | Zoom out | `⌘−` | Never | `adjustActiveZoom(-0.1)` | Continuous only. |
| CMD-P09 | zoom-reset | Actual size | `⌘0` | Never | `resetActiveZoom` | Continuous only. |
| CMD-P10 | fit-width | Fit width | `⇧⌘0` | Never | `fitActiveWidth` | Continuous only; no-op in Page. |
| CMD-P11 | continuous-layout | Continuous layout | `⌘2` | Never | `setActiveDocumentLayout('continuous')` | |
| CMD-P12 | page-layout | Page layout | `⌘3` | Never | `setActiveDocumentLayout('page')` | Forces Page Read. |
| CMD-P13 | toggle-interaction-mode | “Read mode” / “Edit mode” (dynamic label) | `⌘E` | Never | `toggleActiveInteractionMode` | Label is the *target* mode. |
| CMD-P14 | focus-branch | Focus branch | `⇧⌘F` | Never | `toggleFocusBranch` | |
| CMD-P15 | rename-document | Rename document… | — | Never (no document → dialog fallback) | Opens `rename-document` | |
| CMD-P16 | reveal | Reveal document in Finder | — | Never | `revealActive` | Silent no-op with no document. |
| CMD-P17 | add-block | Add top-level block | — | Read mode | `addTopLevelContextual` | |
| CMD-P18 | add-child | Add child block | `⌃⏎` | Read mode | `runtime.addChild(selected)` | No selection → no-op. |
| CMD-P19 | add-sibling | Add sibling block | `⌥⏎` | Read mode | `runtime.addSibling(selected)` | |
| CMD-P20 | link-reference | Link as reference… | `⌘⇧L` | Read mode | Opens `link-reference` | |
| CMD-P21 | anchor-health | Anchor health… | — | Never | Opens `anchor-health` | Repair actions inside are gated. |
| CMD-P22 | block-text | Block type: Text | — | Read mode | `applyBlockType(null)` | Requires selected block. |
| CMD-P23 | block-h1 | Block type: Heading 1 | — | Read mode | `applyBlockType(1)` | |
| CMD-P24 | block-h2 | Block type: Heading 2 | — | Read mode | `applyBlockType(2)` | |
| CMD-P25 | block-h3 | Block type: Heading 3 | — | Read mode | `applyBlockType(3)` | |
| CMD-P26 | undo | Undo | `⌘Z` | Read mode | `undoActive` | Text history vs structural routing. |
| CMD-P27 | redo | Redo | `⇧⌘Z` | Read mode | `redoActive` | |
| CMD-P28 | settings | Settings… | `⌘,` | Never | Opens `settings` | |
| CMD-P29 | insert-table | Insert table | — | Read mode | Tiptap `insertTable(3×3, header)` | No table options. |
| CMD-P30 | insert-image | Insert image… | — | Read mode | `insertImageFromDialog` | Requires selected block; otherwise toast. |
| CMD-P31 | insert-math | Insert math… | — | Read mode | Opens `math` (inline, empty) | |
| CMD-P32 | insert-code | Toggle code block | — | Read mode | `toggleCodeBlock()` | |

**Palette composition beyond commands:** document titles (`Documents` group) and every block title
(`Blocks` group) are always appended when not `documentsOnly` (`R/shell/CommandPalette.tsx:59-81`).
There is no block-content search and no chapter-level result.

### 3.3 Global keyboard commands

`R/App.tsx:265-454` plus native menu accelerators. “One delivery path” is intentional for undo/redo
and zoom; the split between keyboard and menu is a source of parity bugs (see §3.7).

| ID | Shortcut | Action | Scope / condition | Handler | Notes |
|---|---|---|---|---|---|
| CMD-K01 | `⌃Tab` / `⌃⇧Tab` | Cycle active tab | ≥2 tabs | `cycleActiveTab` (`R/App.tsx:60-68,271-275`) | Runs before the `mod` check so `ctrlKey` does not block it. |
| CMD-K02 | `⇧1` | Page fit: page | Page layout only | `setActivePageFit('page')` (`:284-288`) | Also handled inside PageView. |
| CMD-K03 | `⇧2` | Page fit: width | Page layout only | `setActivePageFit('width')` (`:289-293`) | Also inside PageView. |
| CMD-K04 | `⌘,` | Open Settings | Always, including zero documents | `dispatch('settings')` (`:312-319`) | Renderer fallback for the native accelerator. |
| CMD-K05 | `⌘2` | Continuous layout | Always | `setActiveDocumentLayout` (`:320-324`) | |
| CMD-K06 | `⌘3` | Page layout | Always | `setActiveDocumentLayout` (`:325-329`) | |
| CMD-K07 | `⌘E` | Toggle Edit/Read | Always (no document → no-op) | `toggleActiveInteractionMode` (`:330-342`) | Command only; Control+E is left to the editor. |
| CMD-K08 | `⌘=` / `⌘+` | Zoom in | Layout-aware | Page zoom or Continuous zoom (`:343-348`) | Menu version is not layout-aware. |
| CMD-K09 | `⌘-` | Zoom out | Layout-aware | `:349-354` | |
| CMD-K10 | `⌘0` / `⇧⌘0` | Reset zoom / fit | Layout-aware | `:355-366` | Continuous: reset / fit width. Page: reset / fit width. |
| CMD-K11 | `⇧⌘F` | Toggle Focus branch | Always | `toggleFocusBranch` (`:367-371`) | |
| CMD-K12 | `⌘1`…`⌘9` | Switch to tab N | Digits except 2/3 | `setActiveTab` (`:372-381`) | `⌘1` is tab 1, not Outline. |
| CMD-K13 | `⌘K` | Toggle palette | Always | `dispatch('command-palette')` (`:383-386`) | |
| CMD-K14 | `⌘W` / `⇧⌘W` | Close tab / close window | Always | `dispatch('close-tab')` / `window.close()` (`:387-391`) | |
| CMD-K15 | `⌘S` | Save | Always | `dispatch('save')` (`:392-395`) | Page Edit overlay intercepts and commits first. |
| CMD-K16 | `⌘N` / `⇧⌘N` | New document / chapter | Always | `dispatch` (`:396-399`) | |
| CMD-K17 | `⌘\` | Toggle sidebar | Always | `dispatch('toggle-sidebar')` (`:400-403`) | |
| CMD-K18 | `⇧⌘T` | Reopen closed tab | Always | `dispatch('reopen-tab')` (`:404-409`) | |
| CMD-K19 | `⇧⌘L` | Link as reference | Read mode → toast; needs selection | `openDialog` (`:410-426`) | Uses `READ_MODE_TOAST`. |
| CMD-K20 | `⌘⇧[` / `⌘⇧]` | Previous / next tab | Always | `cycleActiveTab` (`:427-433`) | |
| CMD-K21 | `⌘Z` / `⇧⌘Z` | Undo / redo | Not inside plain input; Page Edit has own text history | `dispatch` (`:434-447`) | Stops propagation so ProseMirror does not double-handle. |
| CMD-K22 | `⌘S` inside Page Edit | Commit Page Edit, then save | Page Edit overlay focused | Custom event `nf:page-edit-commit` (`:303-311`; `R/page/PageBlockEditor.tsx:204-212`) | |

### 3.4 Editor keymap

`R/editor/keymap.ts:54-282`. Every mutating shortcut checks `editor.isEditable`; navigation stays
available in Read mode. Table/list/code/blockquote contexts keep native Tab/Backspace behavior.

| ID | Shortcut | Action | Condition / context | Handler | Notes |
|---|---|---|---|---|---|
| CMD-E01 | `Enter` | Paragraph split; heading → paragraph at end | Editable, empty selection, not atomic context | `keymap.ts:76-101` | Headings are not sticky. |
| CMD-E02 | `⇧Enter` | Hard line break | Editable | `:104-108` | |
| CMD-E03 | `⌘⇧Enter` | Branch from selection, or add child with no selection | Editable | `:113-136` | Formula/code node selections branch from the node. |
| CMD-E04 | `⌥Enter` | Add sibling | Editable, current block | `:139-146` | |
| CMD-E05 | `⌃Enter` | Add child | Editable, current block | `:149-156` | |
| CMD-E06 | `Tab` | Make selected block a child | Editable, block node selected, not atomic context | `:162-173` | Otherwise returns false so focus leaves the editor. |
| CMD-E07 | `⇧Tab` | Outdent selected block | Same | `:175-186` | |
| CMD-E08 | `Backspace` | Native, or move caret to previous block | Never destructive on a block | `:191-213` | Empty block stays. |
| CMD-E09 | `⌘Backspace` | Delete active block | Editable; confirmation when needed | `:217` | Only keyboard delete path. |
| CMD-E10 | `Delete` | Delete selected block node | Block node selected | `:220-226` | Never while editing text. |
| CMD-E11 | `⌘.` | Toggle collapse | Current block | `:228-234` | |
| CMD-E12 | `⌘⇧K` | Open Link dialog | Editable | `:236-240` | |
| CMD-E13 | `Esc` | Blur editor | Always | `:242-245` | Page Edit uses Esc to commit, not blur. |
| CMD-E14 | `⌘↑` / `⌘↓` | Focus previous/next visible block | Always | `:247-261` | |
| CMD-E15 | `⌥↑` / `⌥↓` | Reorder sibling up/down | Editable | `:263-279` | |
| CMD-E16 | `F2` | Rename block/chapter | Sidebar topic rows | `R/shell/Sidebar.tsx:248-253,530-535` | Not part of the editor keymap. |
| CMD-E17 | `Escape` (Page root) | Clear block selection | Page layout root focused | `R/page/PageView.tsx:695-701` | Page-level, not editor. |

### 3.5 Context menus

Renderer menus are built as `MenuEntry[]` and rendered by `ContextMenu.tsx`. Dynamic entries are
grouped by family; one row per family, with item counts. Read-mode gating disables every entry that
is not in the navigation whitelist (`R/actions.ts:560-588`).

| ID | Menu | Items | Condition / dynamic parts | Handler | Notes |
|---|---|---|---|---|---|
| CMD-C01 | Block menu — navigation | Focus block | Always | `runtime.focusBlock` | |
| CMD-C02 | Block menu — insert image | Insert image… | Disabled if not editable | `insertImageFromDialog` | |
| CMD-C03 | Block menu — per-image actions | 4 × N images: Add image region…, Add image point…, Replace image…, Edit image alt text…; separators between images | Region/point disabled by `imageAnchorAuthoringGate` (missing/changed asset); replace disabled if not editable | `beginImageAnchorAuthoring`, `replaceImageFromDialog`, `image-alt` | Labels prefixed “Image N (alt)” when >1 image. |
| CMD-C04 | Add child block | `⌃⏎` | Always in Edit | `runtime.addChild` | |
| CMD-C05 | Add sibling block | `⌥⏎` | Always in Edit | `runtime.addSibling` | |
| CMD-C06 | Split at caret | — | Enabled only when caret is in this block and split is legal; label explains reason otherwise | `runtime.splitAtCaret` | |
| CMD-C07 | Merge with previous | — | Enabled only when merge is legal; label explains reason | `runtime.mergeBlock` | |
| CMD-C08 | Link as reference… | `⌘⇧L` | Always in Edit | `link-reference` dialog | |
| CMD-C09 | Anchor entries | Select anchor/Select unresolved anchor; Next branch from “quote” (if >1); Link “quote” as reference… | Only anchors with branches; warning state changes label | `selectAnchor`, `cycleAnchor`, `link-reference` | Link action is gated in Read mode even though “select” is not. |
| CMD-C10 | Outgoing reference entries | See also: target; Make home: target; Move here: target; Remove reference to target | Make home disabled for root target or cycle; Move here disabled for cycle | `focusBlock`, `makeHome`, `moveHere`, `deleteReference` | Labels explain disabled reason. |
| CMD-C11 | Incoming reference entries | Referenced by: source; Remove reference from source | Always | `focusBlock`, `deleteReference` | |
| CMD-C12 | Move to… | — | Always in Edit | `move` dialog | |
| CMD-C13 | Move up / Move down | `⌥↑` / `⌥↓` | Always in Edit | `reorderSibling` | |
| CMD-C14 | Outdent | `⇧Tab` | Only if block has a parent | `outdent` | |
| CMD-C15 | Collapse/Expand branch | `⌘.` | Only if block has children | `toggleCollapse` | Label changes with state. |
| CMD-C16 | Demote to reference | — | Only if block has an incoming primary branch | `demoteBranch` | |
| CMD-C17 | Detach from parent | — | Only if block has an incoming branch | `deleteBranch` | Confirmation dialog? No: opens `delete-branch` only from the dialog path; menu calls `deleteBranch` directly. |
| CMD-C18 | Delete block… | — | Always in Edit | `delete-block` dialog | Danger styling. |
| CMD-C19 | Reference chip menu | See also: target; Make home; Move here; Remove reference | Right-click “See also” chip | `openReferenceMenu` | “Referenced by” chips have no context menu. |
| CMD-C20 | Image action menu (inline) | Add image region…, Add image point…, Replace image…, Edit image alt text… | Image action button | `openImageMenu` | Same entries as block menu, scoped to one image. |
| CMD-C21 | Chapter menu | Rename chapter…, Add block | Right-click chapter row/card | `rename-chapter`, `addTopLevel` | |
| CMD-C22 | Tab menu | Open, Rename document…, Reveal in Finder, Close tab | Right-click tab | `setActiveTab`, `rename-document`, `revealDocumentPath`, `closeTab` | |
| CMD-C23 | Library menu | Open / Open recovery, Reveal in Finder, Rename document… | Right-click library row or `⋯` | `openPath`, `revealDocumentPath`, `rename-document` | Rename hidden for non-ok entries. |
| CMD-C24 | Tab overflow menu | New document, open tab list, up to 8 library documents | “All tabs” chevron | Inline `openContextMenu` | No separators when lists are empty. |
| CMD-C25 | Native text menu | Cut, Copy, Paste, Select All | Editable text only | Electron roles | Native enablement from `params.editFlags`. |

### 3.6 Surface controls and one-shot commands

Commands that exist only as a control (not in the native menu or palette). See §4.2 for the physical
control inventory.

| ID | Command | Surface | Trigger | Enabled / disabled | Handler | Notes |
|---|---|---|---|---|---|---|
| CMD-U01 | Rename document (titlebar) | Title bar | Click document title | With document | `rename-document` | |
| CMD-U02 | Open Settings (titlebar) | Title bar | Click gear | Always | `settings` | |
| CMD-U03 | Open palette (titlebar) | Title bar | Click `⌘K` button | Always | `setPaletteOpen(true)` | |
| CMD-U04 | Filter library | Sidebar | Type in filter | Always | Local state | Document title only. |
| CMD-U05 | Open library document | Sidebar | Click row | Always | `openPath` | Non-ok rows open recovery. |
| CMD-U06 | Library row actions | Sidebar | Click `⋯` | Always | `openLibraryMenu` | |
| CMD-U07 | Add chapter | Sidebar Topics header | Click `+` | Edit mode | `createChapter` | |
| CMD-U08 | Add block | Sidebar Topics footer | Click “Add block” | Edit mode | `addTopLevel(lastChapter)` | Adds to the **last** chapter, not the selected one. |
| CMD-U09 | Select/focus topic row | Sidebar tree | Click row | Always | `focusBlock`, and anchor selection for anchored rows | |
| CMD-U10 | Expand/collapse topic | Sidebar tree | Chevron | Always | `onExpandedChange` → runtime collapse + session | Shared with canvas collapse. |
| CMD-U11 | Rename chapter (inline) | Sidebar tree | Double-click / F2 | Edit mode | `renameChapter` | |
| CMD-U12 | Rename block label (inline) | Sidebar tree | Double-click / F2 | Edit mode | `block.rename` | Canvas has no inline label rename. |
| CMD-U13 | Open shared source | Sidebar | Click `Shared · N` | Always | `focusBlock(first source)` | Only the first reference; title lists all. |
| CMD-U14 | Save state / anchor chip | Status bar | Click anchor chip | When warnings > 0 | `anchor-health` | Save state is not clickable. |
| CMD-U15 | Switch layout | Status bar | Continuous / Page | Always | `setActiveDocumentLayout` | Duplicate of `⌘2`/`⌘3`, palette. |
| CMD-U16 | Switch mode | Status bar | Edit / Read | Always | `setActiveInteractionMode` | Duplicate of `⌘E`, palette. |
| CMD-U17 | Continuous zoom out / reset / in | Status bar | `−` / percent / `+` | Always | `adjustActiveZoom`, `resetActiveZoom` | Percent button resets. |
| CMD-U18 | Continuous Fit | Status bar | Fit | Always | `fitActiveWidth` | Only visible in Continuous. |
| CMD-U19 | Focus branch | Status bar | Focus | Always | `toggleFocusBranch` | `aria-pressed`. |
| CMD-U20 | Reveal document | Status bar | Click path | Always | `revealDocumentPath` | |
| CMD-U21 | Previous / next page | Page toolbar | Chevron buttons | At bounds | `goToPage` | Commits Page Edit first. |
| CMD-U22 | Page zoom out / in | Page toolbar | `−` / `+` | Always | `zoomBy` | Sets fit to `none`. |
| CMD-U23 | Page fit page / width / actual | Page toolbar | Buttons | Always | `setFit`, `actualSize` | `aria-pressed` except Actual uses a computed check. |
| CMD-U24 | Export PDF (Page toolbar) | Page toolbar | Button | Always | `exportActiveDocument` | Same flow as menu/palette. |
| CMD-U25 | Open in continuous editor | Page toolbar | Button | Requires selected block | `openBlockInContinuous` | |
| CMD-U26 | Page fragment select / edit / open | Page | Click, Enter, double-click, Space | Always | `selectBlock`, `editBlock`, `openBlockInContinuous` | Enter edits in Page Edit, opens in Page Read. |
| CMD-U27 | Page navigation keys | Page | `⌥↑`/`⌥↓`, PageUp/PageDown | Not inside editable overlay | `goToPage` | |
| CMD-U28 | Clear Page selection | Page | `Esc` | Selection present | `selectBlock(null)` | |
| CMD-U29 | Block actions menu | Continuous | Gutter drag handle click (keyboard) / drag | Edit mode | `openBlockMenu` | Pointer activation is drag; keyboard activation opens menu. |
| CMD-U30 | Add child (card) | Continuous | Right-edge `+` | Edit mode | `runtime.addChild` | |
| CMD-U31 | Add sibling (card) | Continuous | Bottom-edge `+` | Edit mode | `runtime.addSibling` | |
| CMD-U32 | Collapse branch (card) | Continuous | Branch port | Has children | `toggleCollapse` | `aria-expanded`. |
| CMD-U33 | Select anchor (card) | Continuous | Marker dot / callout quote | Always | `activateAnchor` / `selectAnchor` | |
| CMD-U34 | Follow reference chip | Continuous | Click chip | Always | `focusBlock(target)` | |
| CMD-U35 | Branch from selection | Selection toolbar | Branch icon | Edit mode | `branchFromSelection` | Same as `⌘⇧Enter`. |
| CMD-U36 | Bold / Italic / Code | Selection toolbar | Buttons | Edit mode | Tiptap commands | `aria-pressed`. |
| CMD-U37 | Link (selection toolbar) | Selection toolbar | Link icon | Edit mode | Inline URL form | Duplicate of `⌘⇧K` dialog. |
| CMD-U38 | Insert math (selection toolbar) | Selection toolbar | Sigma icon | Edit mode | `math` dialog | |
| CMD-U39 | Add top-level block (chapter footer) | Continuous | “+ Add top-level block” | Edit mode | `addTopLevel` | |
| CMD-U40 | Add chapter (canvas footer) | Continuous | “+ Add chapter” | Edit mode | `createChapter` | |
| CMD-U41 | Chapter title edit | Continuous | Click title | Edit mode | `chapter.rename` | Enter commits, Esc cancels, blur commits. |
| CMD-U42 | Image actions | Continuous | Image action button | Edit mode + selected block; authoring entries gated | `openImageMenu` | Toolbar hidden in Read or when the block is not selected. |
| CMD-U43 | Add image region / point | Continuous | Image action menu or inline buttons | Editable, asset available | `beginImageAnchorAuthoring` | |
| CMD-U44 | Branch from image region/point | Continuous | Pending bar | Valid draft | `branchFromSelection` | |
| CMD-U45 | Cancel image authoring | Continuous | Pending bar / menu | Authoring active | `cancelImageAnchorAuthoring` | |
| CMD-U46 | Settings: scope | Settings | Radio | Document scope needs runtime | Local draft state | See §7.0 for the trap. |
| CMD-U47 | Settings: density | Settings | Range slider | Always | Local draft | 60–120, step 5. |
| CMD-U48 | Settings: reset density | Settings | Reset | Always | Sets draft to 100 | Does not apply. |
| CMD-U49 | Settings: Apply | Settings | Button | `dirty && !busy` | `updateAppSettings` or `setPageSettingsOverride` + flush | Reports saved only after atomic write. |
| CMD-U50 | Settings: Cancel | Settings | Button | `dirty && !busy` | Restore draft from stored value | Does not close dialog. |
| CMD-U51 | Settings: Use global density | Settings | Button | Document override for density exists | `withoutPageDensityOverride` | |
| CMD-U52 | Settings: Reset settings | Settings | Button | Global status `corrupt` | `resetSettingsToDefaults` + flush | Destructive; no confirmation. |
| CMD-U53 | Settings: Dismiss warning | Settings | Button | Warning visible | `dismissSettingsWarning` | In-memory only. |
| CMD-U54 | Settings: Retry write | Settings | Button | Error visible | `retrySettingsWrite` + flush | |
| CMD-U55 | Settings: Reveal library | Settings | Button | Always | `revealLibrary` | |
| CMD-U56 | Settings: Undo last change | Settings | Button | Document open | `undoActive` | Odd home; also Edit → Undo. |
| CMD-U57 | Settings: Done | Settings | Button | Always | `closeDialog` | |
| CMD-U58 | Export: Cancel running job | Export panel | Button | Running, not cancelling | `cancelActiveExport` | |
| CMD-U59 | Export: Replace / Cancel replace | Export panel | Buttons | Confirm-overwrite | `confirmReplaceExport` / `cancelReplaceExport` | |
| CMD-U60 | Export: Done / Dismiss | Export panel | Button | Done/failed | `dismissExportStatus` | Running cannot dismiss. |
| CMD-U61 | Export: Reveal in Finder | Export panel | Button | Done | `revealExportedPdf` | |
| CMD-U62 | Recovery: restore newest | Recovery | Button | ≥1 valid backup | `restoreNewestBackup` | Restores as a new copy. |
| CMD-U63 | Recovery: retry / remove / reveal / close | Recovery | Buttons | Missing status for retry/remove; busy disables all | `openPath`, `closeTab`, `revealDocument` | |
| CMD-U64 | Save failure: Retry | Banner | Button | Not busy | `retrySave` | |
| CMD-U65 | Save failure: Restore backup… | Banner | Button | Not busy | `restore-backup` dialog | |
| CMD-U66 | Save failure: Overwrite… | Banner | Button | External modification only | `overwrite-external` dialog | |
| CMD-U67 | Save failure: Save a copy… | Banner | Button | Not busy | `saveCopy` | Native save dialog. |
| CMD-U68 | Save failure: Reload from disk… | Banner | Button | Not busy | `reload-from-disk` dialog | |
| CMD-U69 | Save failure: Reveal in Finder | Banner | Button | Not busy | `revealDocument` | |
| CMD-U70 | Stale lock: Take over / Cancel / Review | Banner | Buttons | Not busy | `takeOverLock` | Consent is explicit; no auto-break. |
| CMD-U71 | Page Edit: Done / Esc / ⌘⏎ | Overlay | Button / keys | Not committing | `commit` | Commit reasons: outside, escape, shortcut, navigation, layout, mode, block, external. |
| CMD-U72 | Dialog: primary / Cancel | All dialogs | Buttons | Per dialog | See §2.8 | Not repeated per dialog. |
| CMD-U73 | Toast: none | Toasts | — | — | — | Toasts have no actions or dismiss button. |
| CMD-U74 | Palette: choose result | Palette | ↑↓ then ↵ / click | Disabled rows ignored | Per result | Documents open; blocks focus. |

### 3.7 Duplicates and inconsistencies

These are facts observed in code, not design recommendations.

| ID | Observation | Evidence | Consequence |
|---|---|---|---|
| DUP-C1 | “Zoom in/out/actual/fit width” exists in the View menu, palette, status bar, Page toolbar, and keyboard, but the menu and palette call the **Continuous** zoom path unconditionally | `R/actions.ts:1300-1311`; `R/App.tsx:343-366`; `R/page/PageView.tsx:822-876` | In Page, View → Zoom In / Zoom Out / Actual Size / Fit Width changes hidden Continuous view state or no-ops. Keyboard behaves differently from the menu. |
| DUP-C2 | Layout switch has three entry points (status bar, palette, `⌘2`/`⌘3`); mode switch has three (status bar, palette, `⌘E`) | `R/shell/StatusBar.tsx:125-172`; `R/actions.ts:1149-1156`; `R/App.tsx:320-342` | No single canonical control; Page toolbar has neither. |
| DUP-C3 | Settings has six entry points: native menu, renderer `⌘,`, titlebar gear, sidebar gear, palette, Help → Keyboard shortcuts | `M/menu.ts:17-20,170-177`; `R/App.tsx:312-319`; `R/shell/TitleBar.tsx:45-53`; `R/shell/Sidebar.tsx:627-635`; `R/actions.ts:1224` | “Help → Keyboard shortcuts” lands on a dialog with no shortcuts. |
| DUP-C4 | Read-mode gating is implemented twice with different coverage: palette wrappers + context-menu whitelist; native menu is ungated | `R/actions.ts:1122-1132,577-588`; `M/menu.ts` | New Chapter / Export / Close Tab remain enabled in Read mode; the palette disables New Chapter. |
| DUP-C5 | “Add block” exists as palette “Add top-level block”, sidebar footer “Add block”, chapter footer “+ Add top-level block”, and `⌘⇧N` New Chapter creates a chapter plus first block | `R/actions.ts:1168-1175`; `R/shell/Sidebar.tsx:587-601`; `R/editor/views/BlockViews.tsx:193-204`; `R/actions.ts:175-207` | Labels are inconsistent (“Add block” vs “Add top-level block”); sidebar always targets the last chapter. |
| DUP-C6 | Continuous “Fit” and Page “Fit width” have the same label family but different handlers; only Continuous listens to `nf:fit-width` | `R/editor/DocumentEditor.tsx:735-740`; `R/page/PageView.tsx:856-865`; `R/actions.ts:354-359` | Menu/palette fit is dead in Page. |
| DUP-C7 | `zoom-reset` is labeled “Actual size” in the palette and “Actual Size” in the menu; Page has a third “Actual” button | `R/actions.ts:1147`; `M/menu.ts:142-147`; `R/page/PageView.tsx:866-875` | Same concept, three labels and two state targets. |
| DUP-C8 | `toggle-interaction-mode` label is the target mode (“Read mode” while editing), while status bar buttons show both and `aria-pressed` | `R/actions.ts:1151-1156`; `R/shell/StatusBar.tsx:152-171` | Palette label can read as current state. |
| DUP-C9 | “Save” (menu) vs “Save now” (palette); “Close tab” vs “Close Tab”; title case inconsistent | `M/menu.ts:52-55`; `R/actions.ts:1136,1143` | Cosmetic but visible in the palette. |
| DUP-C10 | The native menu is never rebuilt, so export/close/new-chapter enablement cannot follow state; `menu-export-pdf` id exists but is unused for gating | `M/menu.ts:58`; `M/index.ts:646` | Only the palette reflects document/mode state. |
| DUP-C11 | `Delete` key and `⌘Backspace` both route to `requestDelete`, but Delete only works on a NodeSelection; the menu always routes to the dialog | `R/editor/keymap.ts:217-226`; `R/actions.ts:993-998` | Different confirmation behavior by input path. |
| DUP-C12 | “New chapter” contradicts the UX shortcut `⌘⌥C`; code uses `⇧⌘N` everywhere | `M/menu.ts:47-50`; `R/actions.ts:1135`; `docs/ux.md:183` | Docs say one thing, app another. |

### 3.8 Command icons

Every rendered icon is Lucide, 1.5 px stroke. Settings buttons are text-only. “—” means no icon.

| Command / control | Icon | Size | Where |
|---|---|---:|---|
| CMD-U03 Open palette | `Command` | 13 | Title bar |
| CMD-U02 / CMD-M31 Settings | `Settings` | 15 | Title bar, sidebar footer |
| CMD-K13 Search | `Search` | 13–15 | Sidebar header, palette field, empty state |
| CMD-M01 New document | `Plus` / `FilePlus2` | 14 | Library header, sidebar, tab bar, empty state |
| CMD-U06 Library row menu | `MoreHorizontal` | 14 | Library row |
| CMD-C23 / CMD-C22 Reveal | — (text only) | — | Context menus |
| CMD-C22 Close tab / CMD-M06 | `X` | 12–14 | Tab close, tab bar close |
| Tab overflow | `ChevronDown` | 15 | Tab bar |
| Read-only tab | `Lock` | 11 | Tab |
| CMD-U07 Add chapter | `Plus` | 14 | Topics header |
| CMD-U08 Add block | `Plus` | 12 | Topics footer |
| CMD-U10 Expand/collapse | `ChevronRight` | 12 | Topics tree, chapter card, branch port |
| Chapter row | `BookOpen` | 13 | Topics tree |
| Anchor rows / count | `Anchor` | 10 | Topics tree |
| Anchor warning | `TriangleAlert` | 10–12 | Topics tree, card warning, status chip |
| CMD-U13 Shared | — (text “Shared · N”) | — | Topics tree |
| CMD-U14 Anchor health | `TriangleAlert` | 11 | Status bar |
| CMD-U15 Layout | — (text) | — | Status bar |
| CMD-U16 Mode | — (text) | — | Status bar |
| CMD-U17–U19 Zoom/Fit/Focus | `−` / `+` glyphs | — | Status bar |
| CMD-U21 Page prev/next | `ChevronLeft` / `ChevronRight` | 14 | Page toolbar |
| CMD-U22 Page zoom | `Minus` / `Plus` | 13 | Page toolbar |
| CMD-U24 Export | `FileDown` | 13 | Page toolbar |
| CMD-U29 Gutter | `GripVertical` | 14 | Block card |
| CMD-U30/31 Add child/sibling | `Plus` | 12 | Block card |
| CMD-U32 Collapse port | `ChevronRight` + count dot | 12 | Block card |
| CMD-U35 Branch from selection | `GitBranch` | 15 | Selection toolbar |
| CMD-U36 Bold / Italic / Code | `Bold` / `Italic` / `Code` | 15 | Selection toolbar |
| CMD-U37 Link | `Link2` | 15 | Selection toolbar |
| CMD-U38 Math | `Sigma` | 15 | Selection toolbar |
| CMD-U43 Add region/point | — (text buttons) | — | Image action rail |
| Missing image | `ImageOff` | — | Image placeholder |
| CMD-U62 Restore | `RotateCcw` | 13 | Recovery |
| CMD-U63 Retry | `RefreshCw` | 13 | Recovery |
| CMD-U63 Remove/close | `X` | 13 | Recovery |
| CMD-U63 Reveal | `FolderOpen` | 13 | Recovery |
| CMD-U52–U57 Settings actions | — (text buttons) | — | Settings dialog |
| CMD-U58–U61 Export actions | — (text buttons) | — | Export panel |

**Observation:** icon size is per call site (10–15 px), not tokenized; no shared `Icon` wrapper.
A Settings/Page toolbar rework will either normalize this or add a fourth set of sizes.

---

## 4. Control register

### 4.1 Inputs, choices, sliders, toggles

Only controls that hold a value or a mode. One-shot action buttons are in §4.2. “Frozen setting?”
answers whether the control edits a field from the frozen inventory (§7 gives the row).

| ID | Surface | Label / accessible name | Type | Current value / range | Scope | Component / class | Frozen setting? | Notes |
|---|---|---|---|---|---|---|---|---|
| CTL-01 | Sidebar Library | “Filter documents” | Search input (`type=search`) | Empty; substring match on title | Local UI | Native input `.nf-library-search` | No | Not persisted; resets on remount. |
| CTL-02 | Command palette | “Search commands” / “Search documents, blocks, commands…” | Search input | Empty; first 60 results | Local UI | React Aria `SearchField` + `Input` | No | Searches labels/groups, not block content. |
| CTL-03 | Settings | “Apply to” | Radio group (2) | `Global default` or `This document`; default document if an override density exists, else global | G/D selector | Native radios `.nf-radio`, `.nf-density-scope` | Yes — scope selector for TY-2 | Document option disabled without a runtime; copy says “editable document” but read-only runtimes are accepted. |
| CTL-04 | Settings | “Page density” | Range slider | 60–120, step 5, default 100; current draft | G or D (TY-2) | Native `input[type=range]` `.nf-range` | Yes — TY-2 | `aria-valuetext` = “N%”; Reset sets 100 but does not apply. |
| CTL-05 | Settings | Density readout | Static value | “N%” | Draft | `.nf-density-value` | Derived from TY-2 | Not an input. |
| CTL-06 | Settings | Density note | Static text | Dynamic sentence + fixed 60–70% guidance | Informational | `.nf-dialog-note` | No | Copy asserts “60–70% is the densest range”; product guidance baked into UI. |
| CTL-07 | Delete block | “What about its descendants?” | Radio group (2) | `promote` (default) / `delete-subtree` | Per action | Native radios `.nf-radio` | No | Only shown when children exist. |
| CTL-08 | Math | Inline / Display | Radio pair (no group name) | Inline or block | Per action | Native radios `.nf-radio`, `.nf-inline-radios` | No | Radios share no `name`; not a fieldset. |
| CTL-09 | Restore backup | Backup candidate | Radio list | First valid selected | Per action | Native radios in `.nf-backup-row` | No | Invalid rows disabled. |
| CTL-10 | Rename dialogs | Name | Text input | Current title/label | Per action | React Aria `Input` `.nf-input` | No | Enter saves. |
| CTL-11 | Link dialog | URL | Text input | Current href | Per action | React Aria `Input` | No | Empty removes link. |
| CTL-12 | Selection toolbar Link | URL | Text input | Current href | Per action | Native input `.nf-bubble-input` | No | Duplicate of CTL-11 with different component. |
| CTL-13 | Math | LaTeX | Textarea | Current source | Per action | React Aria `TextArea` `.nf-textarea` | No | Term selection feeds “Branch from term”. |
| CTL-14 | Image alt | Alt text | Text input | Current alt | Content | React Aria `Input` | No | |
| CTL-15 | Sidebar topics | Chapter title | Inline text input | Current title | Content | Native input `.nf-tree-rename` | No | Double-click/F2; Enter/Esc/blur. |
| CTL-16 | Continuous chapter | Chapter title | Inline text input | Current title | Content | Native input `.nf-chapter-title-input` | No | Duplicate of CTL-15 in the canvas. |
| CTL-17 | Anchor health | Filter anchors | Segmented buttons (3) | `all` default; All/Broken/Ambiguous with counts | Local UI | Native buttons `.nf-health-filter` + `aria-pressed` | No | |
| CTL-18 | Status bar | Layout | Segmented buttons (2) | Continuous / Page | V (AP-7) | Native buttons `.nf-status-button` | Yes — AP-7 (view state) | Duplicate commands CMD-U15. |
| CTL-19 | Status bar | Interaction mode | Segmented buttons (2) | Edit / Read; default Continuous Edit, Page Read | V (AP-8) | Native buttons | Yes — AP-8 | Page Edit is opt-in but a layout switch forces Read. |
| CTL-20 | Status bar | Continuous zoom | − / reset / + | 50–200%, step 10 in UI; stored 0.5–2 step 0.01 | V (CO-2) | Native buttons | Yes — CO-2 | Percent button resets to 100. |
| CTL-21 | Status bar | Fit / Focus | Toggle buttons | Fit is one-shot; Focus `aria-pressed` | V (CO-13) | Native buttons | Yes — CO-13 | Fit only visible in Continuous. |
| CTL-22 | Page toolbar | Page fit | Segmented buttons (3) | `page` default; page / width / actual | V (AP-11) | Native buttons `.nf-page-button` | Yes — AP-11 | Actual = fit `none` + zoom 1. |
| CTL-23 | Page toolbar | Page zoom | − / value / + | 10–250%, step 10 | V (AP-10) | Native buttons | Yes — AP-10 | Value is static text, not an input. |
| CTL-24 | Page toolbar | Page nav | Prev / counter / next | Clamped 1..pageCount | V (AP-9) | Native buttons | Yes — AP-9 | Counter is static. |
| CTL-25 | Tab strip | Tab selection | Tablist | One active tab; roving tabIndex | V (session; no AP row) | Native buttons `role=tab` | No | Drag reorder persists. |
| CTL-26 | Sidebar | Sidebar width | Drag splitter | 208–360, default 264 | V/G (AP-4) | React Aria `Separator` + panel | Yes — AP-4 | Clamped in store. |
| CTL-27 | Sidebar | Collapse sidebar | Command only (`⌘\`) | Boolean, default false | V (AP-5) | No visible control when expanded | Yes — AP-5 | Collapsed state has no expand affordance except `⌘\`. |
| CTL-28 | Sidebar topics | Tree expansion | Tree disclosure | Per chapter/block | V (AP-6) + runtime collapse | React Aria `Tree` | Yes — AP-6 | Shared with canvas collapse. |
| CTL-29 | Sidebar library | Library row selection | Button list | None/active | V (session; no AP row) | Native buttons | No | No multi-select. |
| CTL-30 | Continuous card | Collapse | Icon button | Expanded/collapsed | V (session `collapsed`, no AP row) | `.nf-branch-port` | No | `aria-expanded`. |
| CTL-31 | Continuous card | Block type | No control | Value set only by palette | Content | — | No (block node type) | No toolbar; headings only via palette. |
| CTL-32 | Selection toolbar | Bold / Italic / Code | Toggle buttons | Per selection | Content | Native buttons `aria-pressed` | No (inline marks) | |
| CTL-33 | Selection toolbar | Link | Mode toggle | Opens inline form | Content | Native button | No | |
| CTL-34 | Export panel | — | No option inputs | Fixed “all pages, current page setup” | — | — | — | No export options, range, metadata, or preview. |
| CTL-35 | Recovery | Backup list | Read-only list (no selection) | Newest first | — | `.nf-recovery-backup` | No | **Restore newest valid backup** always picks the newest; there is no per-backup choice here. |
| CTL-36 | Image authoring | Draw region/point | Pointer drag + Alt modifier | Region default; Alt = point | Content | Pointer handlers on `.nf-image-draw-layer` | No | No keyboard-only draw path. |
| CTL-37 | Settings | Density Reset | Button (value control) | Sets 100 | Draft | `.nf-button` | Yes (TY-2 draft) | Not an Apply. |
| CTL-38 | Settings | Scope reason note | Static text | Visible only with no document | Informational | `.nf-dialog-note` | No | |
| CTL-39 | App | Appearance | **No control** | Dark only | — | — | AP-1 DES | Three static labels: sidebar “Graphite”, status “Dark”, Settings “Graphite · dark (light tokens reserved)”. |
| CTL-40 | App | Page size / orientation / margins | **No control** | A4 landscape, 12 mm all sides | G/D (PS-1..6) | — | Yes — PS-1..6, not exposed | Central missing input set. |
| CTL-41 | App | Manual breaks | **No control** | `[]` | G/D (MB-1) | — | Yes — MB-1, not exposed | No add/remove/list. |
| CTL-42 | App | Typography preset | **No control** | Compact; Comfortable stored but no switch | G/D (TY-1) | — | Yes — TY-1, not exposed | Density only. |
| CTL-43 | App | Advanced typography / boxes | **No control** | Preset values | G/D (TY-4..16, BX-1..15) | — | Yes — not exposed | See §7. |
| CTL-44 | App | Page chrome toggles | **No control** | Fixed chrome | DES (PS-14) | — | No field | |
| CTL-45 | App | Export defaults | **No control** | OS last folder; `<title>.pdf`; no metadata | DES (EX-5, PR-14) | — | No field | |
| CTL-46 | App | Keyboard shortcut configuration | **No control** | Fixed keymap | DES (AP-20) | — | No field | |

### 4.2 Button inventory by surface

Physical buttons and button groups. `Command` links to §3; `Frozen setting?` is “No” for pure
actions.

| ID | Surface | Button(s) | Command | Frozen setting? | Notes |
|---|---|---|---|---|---|
| BTN-01 | Title bar | Document title | CMD-U01 | No | Looks like a label; becomes a rename action. |
| BTN-02 | Title bar | `⌘K` | CMD-U03 | No | |
| BTN-03 | Title bar | Gear | CMD-U02 | No | |
| BTN-04 | Tab strip | Tab | `setActiveTab` (CTL-25) | No | Tab selection. |
| BTN-05 | Tab strip | Close (×) per tab | CMD-M06 | No | `aria-hidden`, mouse-only. |
| BTN-06 | Tab strip | Close current / New / All tabs | CMD-M06, CMD-M01, CMD-C24 | No | `data-close-active-tab`. |
| BTN-07 | Sidebar header | Search | CMD-K13 | No | Opens palette. |
| BTN-08 | Sidebar header | New note | CMD-M01 | No | |
| BTN-09 | Library | Row open | CMD-U05 | No | |
| BTN-10 | Library | `⋯` row menu | CMD-U06 | No | |
| BTN-11 | Library | New document `+` | CMD-M01 | No | Header `+`. |
| BTN-12 | Topics header | `+` Add chapter | CMD-U07 | No | Disabled in Read with title “Read mode”. |
| BTN-13 | Topics footer | Add block | CMD-U08 | No | Targets last chapter. |
| BTN-14 | Topics row | Chevron | CMD-U10 | No | `aria-label` Collapse/Expand. |
| BTN-15 | Topics row | Shared · N | CMD-U13 | No | Navigates to first source. |
| BTN-16 | Sidebar footer | Gear | CMD-U02 | No | |
| BTN-17 | Empty state | New note / Open document | CMD-M01 / CMD-M02 | No | |
| BTN-18 | Status bar | Anchor health chip | CMD-U14 | No | Only when warnings. |
| BTN-19 | Status bar | Continuous / Page | CMD-U15 | No (view state) | |
| BTN-20 | Status bar | Edit / Read | CMD-U16 | No (view state) | |
| BTN-21 | Status bar | − / % / + / Fit / Focus | CMD-U17..U19 | No (view state) | |
| BTN-22 | Status bar | Path | CMD-U20 | No | |
| BTN-23 | Page toolbar | Prev / Next | CMD-U21 | No | |
| BTN-24 | Page toolbar | − / + | CMD-U22 | No (view state) | |
| BTN-25 | Page toolbar | Fit page / Fit width / Actual | CMD-U23 | No (view state) | |
| BTN-26 | Page toolbar | Export PDF | CMD-U24 | No | |
| BTN-27 | Page toolbar | Open in continuous editor | CMD-U25 | No | Disabled without selection. |
| BTN-28 | Page fragment | Fragment box (keyboard) | CMD-U26 | No | Role group, not a button. |
| BTN-29 | Page Edit | Done | CMD-U71 | No | |
| BTN-30 | Continuous card | Gutter handle | CMD-U29 | No | Drag + keyboard menu. |
| BTN-31 | Continuous card | Add child `+` | CMD-U30 | No | |
| BTN-32 | Continuous card | Add sibling `+` | CMD-U31 | No | |
| BTN-33 | Continuous card | Branch port | CMD-U32 | No (collapse) | |
| BTN-34 | Continuous card | Anchor marker dot | CMD-U33 | No | |
| BTN-35 | Continuous callout | Quote chip | CMD-U33 | No | |
| BTN-36 | Continuous card | See also / Referenced by chip | CMD-U34 | No | |
| BTN-37 | Continuous card | Image action button | CMD-U42 | No | |
| BTN-38 | Image | Add region / Add point | CMD-U43 | No | |
| BTN-39 | Image pending bar | Cancel / Branch | CMD-U45 / CMD-U44 | No | |
| BTN-40 | Selection toolbar | Branch / Bold / Italic / Code / Link / Math | CMD-U35..U38 | No | |
| BTN-41 | Chapter footer | Add top-level block | CMD-U39 | No | |
| BTN-42 | Canvas footer | Add chapter | CMD-U40 | No | |
| BTN-43 | Chapter head | Chapter title | CMD-U41 | No | |
| BTN-44 | Settings | Global / This document radios | CMD-U46 | Scope selector | |
| BTN-45 | Settings | Density Reset | CMD-U48 | Draft | |
| BTN-46 | Settings | Apply / Cancel | CMD-U49 / U50 | No | |
| BTN-47 | Settings | Use global density | CMD-U51 | Yes (clears override) | |
| BTN-48 | Settings | Reset settings | CMD-U52 | Yes (global defaults) | No confirmation. |
| BTN-49 | Settings | Dismiss (global/document) | CMD-U53 | No | |
| BTN-50 | Settings | Retry | CMD-U54 | No | |
| BTN-51 | Settings | Reveal library / Undo last change | CMD-U55 / U56 | No | |
| BTN-52 | Settings | Done | CMD-U57 | No | |
| BTN-53 | Export panel | Cancel / Cancelling… | CMD-U58 | No | |
| BTN-54 | Export panel | Cancel / Replace PDF | CMD-U59 | No | |
| BTN-55 | Export panel | Done / Reveal in Finder | CMD-U60 / U61 | No | |
| BTN-56 | Export panel | Dismiss | CMD-U60 | No | |
| BTN-57 | Recovery | Restore newest valid backup | CMD-U62 | No | |
| BTN-58 | Recovery | Retry / Remove tab / Reveal / Close tab | CMD-U63 | No | |
| BTN-59 | Save failure | Retry / Restore backup / Overwrite / Save a copy / Reload / Reveal | CMD-U64..U69 | No | |
| BTN-60 | Stale lock | Take over / Cancel / Review lock | CMD-U70 | No | |
| BTN-61 | Dialogs | Cancel | CMD-U72 | No | Every dialog. |
| BTN-62 | Dialogs | Primary (Save/Move/Delete/Link/Apply/Detach/Reload/Restore) | CMD-U72 | No | Destructive variant for Delete/Reload/Overwrite. |
| BTN-63 | Close tab dialog | Don’t Save / Save | CMD-U72 | No | Unique discard semantics. |
| BTN-64 | Anchor health | Repair / Remove anchor / filters / candidate buttons / confirm | CMD-U72 (dialog-local actions) | No | Many per row; all gated in Read. |
| BTN-65 | Palette | Result rows | CMD-U74 | No | Disabled rows are skipped. |
| BTN-66 | Toasts | None | — | No | `closeButton={false}`, no action. |

---

## 5. Component and style register

### 5.1 React Aria primitives actually used

React Aria Components are imported in **four** files only. Everything else is a native HTML
element or a custom wrapper.

| File | Imports | Used for |
|---|---|---|
| `R/shell/CommandPalette.tsx:2-12` | `Autocomplete`, `Button`, `Dialog`, `Input`, `ListBox`, `ListBoxItem`, `Modal`, `ModalOverlay`, `SearchField` | Palette modal, search, result list, clear button |
| `R/shell/ContextMenu.tsx:1` | `Menu`, `MenuItem`, `Separator` | Renderer context menus |
| `R/shell/Dialogs.tsx:1-10` | `Button`, `Dialog`, `Input`, `ListBox`, `ListBoxItem`, `Modal`, `ModalOverlay`, `TextArea` | All dialogs, move/link lists, text fields |
| `R/shell/Sidebar.tsx:2-8` | `Button`, `Tree`, `TreeItem`, `TreeItemContent`, `type Selection` | Topics outline only |

**Distinct primitives (16):** Autocomplete, Button, Dialog, Input, ListBox, ListBoxItem, Menu,
MenuItem, Modal, ModalOverlay, SearchField, Separator, TextArea, Tree, TreeItem, TreeItemContent.

**Not used:** `Checkbox`, `Switch`, `Radio`/`RadioGroup`, `Slider`, `NumberField`, `Select`,
`ComboBox`, `Tabs`, `Toolbar`, `Disclosure`, `Popover`, `Tooltip`, `Toast` (Sonner is separate).
Settings therefore uses native `input[type=range]` and `input[type=radio]` with hand-written classes,
while dialogs use React Aria `Button`/`Input`. This is the main component-parity gap for a future
Settings surface (§5.8).

`@dnd-kit` is used for tab reorder (`R/shell/TabBar.tsx:1-3`); `react-resizable-panels` for the
sidebar/editor split (`R/shell/Workspace.tsx:1`); TipTap `BubbleMenu` for the selection toolbar
(`R/editor/SelectionToolbar.tsx:2`); Sonner for toasts (`R/App.tsx:2`).

### 5.2 Shell/editor component inventory

| Component | File | Lines | Role |
|---|---|---:|---|
| `App` | `R/App.tsx` | 770 | Bootstrap, global keydown, menu dispatch, flush, test bridge, layout composition |
| `Workspace` | `R/shell/Workspace.tsx` | 134 | Empty state, tabs strip, resizable sidebar/editor |
| `TitleBar` | `R/shell/TitleBar.tsx` | 57 | App/document title, palette, settings |
| `TabBar` | `R/shell/TabBar.tsx` | 210 | Tab strip, drag reorder, overflow menu |
| `Sidebar` | `R/shell/Sidebar.tsx` | 640 | Library + topics outline + footer |
| `StatusBar` | `R/shell/StatusBar.tsx` | 232 | Save state, counts, health, layout/mode/zoom |
| `CommandPalette` | `R/shell/CommandPalette.tsx` | 168 | Palette |
| `ContextMenu` | `R/shell/ContextMenu.tsx` | 156 | Portal menu |
| `Dialogs` | `R/shell/Dialogs.tsx` | 2309 | 15 dialog kinds + Settings |
| `RecoverySurface` | `R/shell/RecoverySurface.tsx` | 337 | Read-only package recovery |
| `SaveFailureBanner` | `R/shell/SaveFailureBanner.tsx` | 162 | Persistent save recovery |
| `StaleLockBanner` | `R/shell/StaleLockBanner.tsx` | 143 | Lock takeover consent |
| `ExportStatusPanel` | `R/export/ExportStatusPanel.tsx` | 220 | Export progress/terminal states |
| `DocumentEditor` | `R/editor/DocumentEditor.tsx` | 791 | Continuous surface, banners, Page mount |
| `ChapterView` | `R/editor/views/BlockViews.tsx` | 60-207 | Chapter card |
| `BlockView` / `BlockBodyView` | `R/editor/views/BlockViews.tsx` | 209-1444 | Block card/callout/chips |
| `SelectionToolbar` | `R/editor/SelectionToolbar.tsx` | 127 | Bubble formatting/branching |
| `ImageNodeView` | `R/editor/views/ImageNodeView.tsx` | 712 | Image node, anchors, authoring |
| `EdgeLayer` | `R/editor/edges/EdgeLayer.tsx` | — | Continuous SVG edges |
| `PageView` | `R/page/PageView.tsx` | 975 | Page toolbar, sheet, fragments, overlay |
| `PageBlockEditor` | `R/page/PageBlockEditor.tsx` | 294 | Page Edit overlay |
| `PageEdges` | `R/page/PageEdges.tsx` | 207 | Page SVG edges/labels |
| `PrintDocument` | `R/print/PrintDocument.tsx` | 300 | Fixed print sheets |

### 5.3 CSS class families

`R/styles.css` is 5,367 lines, 422 unique top-level class names, 788 lines that start a selector with a class, 83 hex color
literals, 27 `rgb()/rgba()` literals. It is one global stylesheet; there are no CSS modules,
no component-scoped styles, and no Tailwind utility usage in the JSX beyond the `@import`.

| Range | Family / section header | Owner | Representative selectors | Notes |
|---|---|---|---|---|
| 1-121 | Base, root colors, app grid | Shell | `:root`, `.nf-app`, `.nf-sr-only`, `:focus-visible` | `--canvas` etc.; geometry applied from TS |
| 122-197 | Title bar | Shell | `.nf-titlebar*`, `.nf-document-title` | 38 px row; `-webkit-app-region: drag` |
| 198-361 | Tabs | Shell | `.nf-tabbar`, `.nf-tab*`, `.nf-tab-dot`, `.nf-tab-lock` | 36 px; drag; close hover |
| 362-449 | Workspace | Shell | `.nf-workspace*`, `.nf-sidebar-panel`, `.nf-separator` | Splitter, collapsed variant |
| 450-748 | Sidebar + library | Shell | `.nf-sidebar*`, `.nf-library-*`, `.nf-open-dot` | Search, rows, footer |
| 749-988 | Topics tree | Shell | `.nf-tree*`, `.nf-section-*`, `.nf-text-button` | Anchored rows, counts, rename |
| 989-1585 | Editor surface/chapters | Continuous | `.nf-editor*`, `.nf-canvas*`, `.nf-chapter*` | Canvas zoom, padding, chapter cards |
| 1586-2570 | Block cards, gutter, anchors, refs, images, add controls | Continuous | `.nf-block-*`, `.nf-gutter*`, `.nf-anchor-*`, `.nf-ref-*`, `.nf-image-*`, `.nf-add-*` | Largest family; callout and image sub-surfaces |
| 2571-2820 | Below stack / callout lane | Continuous | `.nf-branch-children*`, `.nf-callout-lane*`, `.nf-callout-*` | `--nf-right-group-height`, stacking |
| 2821-2933 | Edge overlay | Shared | `.nf-edge-*` | Stroke, arrow, reference, hit areas |
| 2934-2993 | Bubble menu | Continuous | `.nf-bubble*` | Selection toolbar |
| 2994-3141 | Status bar | Shell | `.nf-status*` | 24 px; save states; zoom/focus |
| 3142-3195 | Empty states | Shared | `.nf-empty-*` | Used by shell and editor |
| 3196-3240 | Buttons | Shared | `.nf-button*` | Primary/danger/quiet variants |
| 3241-3556 | Overlays/palette/dialogs/forms | Shared | `.nf-overlay`, `.nf-palette*`, `.nf-dialog*`, `.nf-field*`, `.nf-radio` | Overlay base, palette, dialogs, fields/radios |
| 3557-4131 | Anchor health | Shell dialog | `.nf-health*` | Wide dialog, rows, preview, confirm |
| 4132-4209 | Settings and range input | Settings | `.nf-settings-*`, `.nf-density-*`, `.nf-range` | Settings section, scope, slider, list |
| 4210-4269 | Context menu | Shared | `.nf-menu*` | 224 px menu, items, shortcut |
| 4270-4293 | Scrollbar | Shell | `::-webkit-scrollbar` | |
| 4294-4309 | Sonner overrides | Feedback | `.sonner` | |
| 4310-4393 | Export panel | Export | `.nf-export-*` | Fixed 320 px, bottom-right |
| 4394-4426 | Responsive padding | Continuous | media queries | 1100/900 px steps |
| 4427-5130 | Page layout and print typography | Page | `.nf-page-scope`, `.nf-page-*` | Light skin; 16 var map consumed |
| 5131-end | Page Edit overlay | Page | `.nf-page-edit-*` | White overlay, tables, prose |

**Class-name duplication / overlap relevant to a rework:**

- Two backup-row families: `.nf-backup-*` (RestoreBackupDialog) and `.nf-recovery-backup*`
  (RecoverySurface), sharing only `.nf-backup-title/meta/invalid/empty`
  (`R/shell/Dialogs.tsx:500-535` vs `R/shell/RecoverySurface.tsx:228-259`).
- Two empty-state families: `.nf-empty-*` (shell/editor) and `.nf-page-placeholder*` (Page).
- Two dialog error classes: `.nf-dialog-error` and `.nf-page-error` (`styles.css:3241+`, Page scope).
- `.nf-page-banner`/`.nf-page-badge` vs `.nf-export-panel` vs `.nf-settings-warning` — three
  unrelated “warning strip” treatments.
- `.nf-settings-list` is a one-off `<dl>`; there is no generic “settings row” class.
- `.nf-range` is styled with `accent-color: var(--accent, #7aa2f7)`; the fallback is a second blue
  that never matches `--accent` (`#9bb7d4`). `styles.css` `.nf-range`.

### 5.4 CSS custom properties and token ownership

61 unique `--nf-*` properties are present:

| Group | Count | Examples | Source | Consumed by |
|---|---:|---|---|---|
| Continuous shell tokens | 27 | `--nf-canvas-max`, `--nf-canvas-pad-*`, `--nf-chapter-gap`, `--nf-child-gap`, `--nf-card-padding`, `--nf-card-radius`, `--nf-child-*-width`, `--nf-row-indent`, `--nf-edge-width*`, `--nf-z-*` | `R/lib/design-tokens.ts:124-152`, applied by `R/lib/apply-design-tokens.ts:16-21` | Continuous CSS, Page cards (radius only) |
| Page CSS map | 16 | `--nf-page-body-size`, `--nf-page-heading-1/2/3`, `--nf-page-card-padding` | `pageCssVariables()` in `L/page-settings.ts:526-548` | Page Read/Edit, measurement host, print |
| Page skin colors | 11 | `--nf-page-ink`, `--nf-page-muted`, `--nf-page-rule`, `--nf-page-warning-*`, `--nf-page-missing-*` | `styles.css:4442-4454` | Page and print |
| Continuous runtime variables | 7 | `--nf-lane-width`, `--nf-right-group-height`, `--nf-callout-offset`, `--nf-callout-dot-left`, `--nf-callout-leader-*`, `--nf-sidebar-width` | Components write per block/lane | Continuous only |
| **Total** | **61** | | | |

Root shell colors and radii are **not** in the TS token module: `--canvas`, `--sidebar`,
`--surface-1/2/3`, `--border*`, `--text*`, `--accent*`, `--edge*`, `--danger/success/warning`,
`--focus-ring`, `--ui-font`, `--mono-font`, `--radius-control`, `--radius-overlay`, `--motion`
(`styles.css:23-50`). `docs/design-tokens-continuous.md:189-194` documents this split.

### 5.5 The 16-key Page CSS map

`pageCssVariables(theme)` emits exactly these; Page Read/Edit, measurement, and print write them
inline. There is deliberately no compact fallback in `styles.css` (`styles.css:4435-4441`).

| # | Variable | Source field | Consumer |
|---:|---|---|---|
| 1 | `--nf-page-body-size` | `bodyPt` | Prose/body |
| 2 | `--nf-page-body-line` | `bodyLine` | Prose/body |
| 3 | `--nf-page-label-size` | `labelPt` | Block label |
| 4 | `--nf-page-heading-1` | `heading1Pt` | H1 |
| 5 | `--nf-page-heading-2` | `heading2Pt` | H2 |
| 6 | `--nf-page-heading-3` | `heading3Pt` | H3 |
| 7 | `--nf-page-code-size` | `codePt` | Code |
| 8 | `--nf-page-code-line` | `codeLine` | Code |
| 9 | `--nf-page-table-size` | `tablePt` | Tables |
| 10 | `--nf-page-table-line` | `tableLine` | Tables |
| 11 | `--nf-page-chrome-size` | `chromePt` | Header/footer |
| 12 | `--nf-page-marker-size` | `markerPt` | Continuation chips/edge labels |
| 13 | `--nf-page-card-padding` | `cardPadding` | Card box, list/table, measure |
| 14 | `--nf-page-card-border` | `cardBorder` | Card border, measure |
| 15 | `--nf-page-segment-gap` | `segmentGap` | Segment spacing, list/table |
| 16 | `--nf-page-max-card-width` | `maxCardWidth` | Card cap and measurement host |

Not in the map: `siblingGap`, `wrapIndent`, `maxWrapIndent`, `childIndent`, trunk insets, callout
values, `minContentWidth`, `pagePacking`. Those are engine inputs (`pageLayoutOptions`) and do not
have CSS variables. `--nf-page-max-card-width` has both a CSS cap role and a measurement-host width
role, but only one variable. This matters for a future Page toolbar: some controls would re-measure
but not change CSS variables directly.

### 5.6 Icons

Lucide only. Distinct icons imported in the renderer (29): `Anchor`, `Bold`, `BookOpen`,
`ChevronDown`, `ChevronLeft`, `ChevronRight`, `Code`, `Command`, `FileDown`, `FilePlus2`, `FileText`,
`FileWarning`, `FolderOpen`, `GitBranch`, `GripVertical`, `ImageOff`, `Italic`, `Link2`, `Lock`,
`Minus`, `MoreHorizontal`, `Plus`, `RefreshCw`, `RotateCcw`, `Search`, `Settings`, `Sigma`,
`TriangleAlert`, `X`.

- Sizes found: 10 (4×), 11 (2×), 12 (9×), 13 (14×), 14 (10×), 15 (11×), 20 (1×).
- Stroke widths: 1.5 (46×), 1.6 (5×).
- `strokeWidth={12}` appears only on invisible SVG edge hit areas (`R/editor/edges/EdgeLayer.tsx:219,
  266, 306`), not icons.
- No icon component wrapper: every call site repeats `size`/`strokeWidth`/`aria-hidden`. A future
  Settings/Page toolbar will need a consistent icon size policy.

### 5.7 Ad-hoc styles and magic values

| Item | Value / location | Note |
|---|---|---|
| Inline styles in TSX | 28 occurrences, all geometry data | Page positions/zoom, menu x/y, sidebar width, tree indent (`6 + (level-1)*14`), export bar width, dnd transform. No color literals in TSX. |
| Tree indent | `6 + (level - 1) * 14` in two places | Sidebar chapter and block rows duplicate the formula (`R/shell/Sidebar.tsx:243,526`). Not a token. |
| Dialog widths | 480 px / 640 px wide; max-height 70vh | `styles.css` `.nf-dialog-modal`, `.nf-dialog-modal-wide` |
| Palette width | 560 px, max-height 520 px | `styles.css` `.nf-palette-modal` |
| Menu width | 224 px, row height ≈28 px | `R/shell/ContextMenu.tsx:102-105`; CSS |
| Export panel | 320 px fixed, right 16 / bottom 44, z-index 45 | `styles.css:4312-4329` |
| Overlay z-index | 50 | `styles.css` `.nf-overlay` |
| Page Edit z-index | 8 inside the sheet | `styles.css` `.nf-page-edit-overlay` |
| Page skin colors | 11 literals in `:root` + more inside Page rules | Deliberate Page-only light skin; not in the TS token module |
| `--nf-range` fallback accent | `#7aa2f7` | Does not match `--accent` `#9bb7d4`; dead fallback in practice |
| `styles.css` root | `--text-tertiary: #8b9199` | UX doc says `#7E848C` (`docs/ux-shell.md:166`); drift |

### 5.8 Gaps and duplications relevant to Settings, Page toolbar, and export

| ID | Gap | Evidence | Why it matters |
|---|---|---|---|
| GAP-01 | No Settings section navigation, tabs, search, or preview | `R/shell/Dialogs.tsx:2056-2307` | The frozen model has four Page groups (Setup, Typography, Layout, Breaks) plus Data/Export; one 480 px column cannot hold them without a new IA. |
| GAP-02 | No settings-row, stepper, select, switch, checkbox, or slider component shared with dialogs | `R/shell/Dialogs.tsx:1-10`; native range/radio only | Every future control needs hand-written markup/classes, or new primitives. |
| GAP-03 | No Page toolbar slot for Settings/Setup/density | `R/page/PageView.tsx:794-905` | Page is the surface where page setup is most relevant, but the only route is `⌘,` (titlebar may be off-screen on narrow windows? It is always visible; sidebar may be collapsed). |
| GAP-04 | Density has three representations: 60–120 integer percent (dialog), stored 0.6–1.2, effective `density: 1` | `R/shell/Dialogs.tsx:1930-1941`; `L/page-settings.ts` | Any new surface must use the percent helpers, not the raw field, or it will double-apply. |
| GAP-05 | Settings “saved” is a transient inline note, not a persistent status | `R/shell/Dialogs.tsx:2262-2266` | AP-13/AP-14 exist in the store but there is no global settings save indicator. |
| GAP-06 | Export surface is a temporary floating panel with truncated warnings/details | `R/export/ExportStatusPanel.tsx:153-160,197-207` | Frozen inventory PR-17/EX-9 says the final UI should show all warnings; the current panel slices 6/8. |
| GAP-07 | Export has no preview, options, page range, metadata, or default folder | `R/export/export-flow.ts:144-198`; `M/index.ts:552-589` | UX F12 describes a preview sheet and preflight list; none exists. |
| GAP-08 | Three unrelated “warning strip” styles | `.nf-settings-warning`, `.nf-page-banner`, `.nf-export-panel` | A Settings/Page/Export rework will either unify or multiply them. |
| GAP-09 | Page toolbar is `flex-wrap: nowrap` with horizontal overflow | `styles.css` `.nf-page-toolbar` | Adding setup/density/export controls narrows the sheet viewport and can affect fit-page zoom (the comment says so). |
| GAP-10 | No dark/light token split; Page is always light, shell always dark | `styles.css:23-50,4442-4454`; `print.css:19` | A future appearance setting (AP-1) cannot simply flip `color-scheme`. |
| GAP-11 | `A5`/`Letter` exist in the model and CSS/print, but no UI and no in-app preview | `L/page-settings.ts:282-307`; `R/page/PageView.tsx:399-401` | Page Setup UI is the missing link between the frozen model and the user. |
| GAP-12 | Manual-break model has no UI, no list, no cleanup | §7.7; `L/paginator.ts:100-180` | The Page toolbar/break menu is a blank slot. |

---

## 6. State matrix

| ID | State | Where it appears | Current copy / behavior | Exit / recovery | Gaps |
|---|---|---|---|---|---|
| STM-01 | No document open | Shell | Empty state “NoteForest / No document open.” + **New note**, **Open document**, hint; status “No document open”; tabs strip with actions only | New note, open from palette/library | No recent-documents list on the empty state; no sample document action (UX W1 describes one). |
| STM-02 | No document + Settings | Settings dialog | Opens normally; “This document” disabled; note “Open an editable document to change its settings. Global defaults apply to every document without an override.”; document actions disabled; no-document note at the bottom | Close Settings | Copy says “editable” but only a runtime is required; read-only documents still enable document scope. |
| STM-03 | App bootstrap / loading | Whole shell | The shell renders before data arrives; with zero tabs the “No document open” empty state can flash; no explicit spinner; `toast.error` on bootstrap failure; `ready` gates keydown | Bootstrap resolves | No skeleton/loading state; a slow scan is indistinguishable from a truly empty library. `UNKNOWN`: is there a visible loading feedback in production if bootstrap takes seconds? |
| STM-04 | Document with no blocks | Continuous | “This document has no blocks yet.” + **Add first block** (disabled in Read); chapter cards still visible for named/multi-chapter docs | Add first block | Empty chapter still shows “No top-level blocks yet.” inside the chapter. |
| STM-05 | Document read-only (general) | Continuous banner + status | “Read-only document · <reason>. Your file is not being modified.”; status “Read-only”; tab lock icon; editing controls disabled/hidden | Reopen read-write | No in-banner action; no save-copy path unless a save failure banner is present; reason is a raw enum-ish string. |
| STM-06 | Stale lock | Stale lock banner | “Read-only · stale lock” + metadata + **Take over lock** / **Cancel**; after Cancel, “Stayed read-only. The stale lock was not changed.” + **Review lock** | Take over / cancel | Takeover is destructive and not confirmed a second time. |
| STM-07 | Missing document | Tab + recovery surface | Tab `!` + title from recent/path; recovery “Read-only recovery” + status missing + reason + backups + **Retry**, **Remove tab**, **Reveal**, **Close tab** | Retry, restore, remove | “Missing” and “corrupt” share one surface with different actions. |
| STM-08 | Corrupt / newer package | Recovery surface | Validation details, warnings, backups list; no runtime, no writes | Restore copy / close | No “open anyway” path; correct for safety. |
| STM-09 | Continuous Edit | Continuous | Default; editable ProseMirror; gutter/add controls; selection toolbar | Mode toggle | None |
| STM-10 | Continuous Read | Continuous | Same scroll position; editor `aria-readonly`; no selection toolbar, image authoring, gutter/add controls; the branch port (collapse) remains available; mutating context entries disabled with suffix | `⌘E`, status bar | Read-mode parity differs by surface: palette disables, native menu does not, context menu whitelists. |
| STM-11 | Page Read | Page | Exact sheet, no overlay; fragment Enter opens Continuous; toolbar export available; no editing chrome | `⌘E` or status bar Edit | Page Read is the default on every layout switch, even if the user had Page Edit. |
| STM-12 | Page Edit open | Page overlay | One block overlay; header “Editing <title>”; “Esc or ⌘⏎ commits”; **Done**; clicking outside commits; page navigation commits | Esc/⌘⏎/Done/outside | No explicit dirty indicator inside the overlay; unchanged blocks close silently. |
| STM-13 | Page Edit commit rejected | Page overlay | Error “Could not commit this block.” + “Your text is still here; retry or copy it before closing.” | Retry Done / copy | No Retry button; only the same Done/commit path. |
| STM-14 | Page model loading | Page sheet | “Laying out pages… / Measuring page typography and paginating.” | Model ready | No progress or cancel; the toolbar is already interactive (export can be pressed). |
| STM-15 | Page model error | Page sheet + banner | “Page layout could not be measured” + message + **Retry** + **Open in continuous editor**; banner “Page layout error: …” | Retry / continuous | No error code or support detail. |
| STM-16 | Page empty | Page sheet | “Nothing to paginate yet.” + **Open in continuous editor** | Continuous | No **Add block** action in Page. |
| STM-17 | Page defects | Page | Badge “Layout defect”/“Block defect” + banner “N blocking layout defects: first message”; export preflight also blocks | Fix content | Badge is not focusable; only first message in the banner. |
| STM-18 | Dirty document / autosave | Status bar, tab dot, title dot | “Unsaved changes” / “Saving…” / “Saved”; tab dot; macOS edited dot | Autosave 800 ms, `⌘S` | Settings writes are not part of this state. |
| STM-19 | Save failure — external modification | Banner + status | “This file changed on disk outside NoteForest.” + hint; **Retry**, **Restore backup…**, **Overwrite…**, **Save a copy…**, **Reload from disk…**, **Reveal** | Explicit choice | Overwrite opens a second destructive confirmation. |
| STM-20 | Save failure — other codes | Banner + status | Headline/hint per code (read-only, permission, disk-full, lock-lost, backup-failed, invalid-document, not-found); “Autosave is paused.” | Retry/save copy/reload | No automatic retry indicator in the UI; backoff (2/5/15 s) is invisible. |
| STM-21 | Close dirty tab | Modal | “Close tab?”, “This tab has changes that have not been saved yet.”, title, **Cancel**, **Don’t Save**, **Save** | Choose | Save failure during close → toast and tab stays. |
| STM-22 | Settings draft dirty | Settings | **Apply** / **Cancel** enabled by dirty check; no dirty marker on the section or dialog | Apply/Cancel | Switching scope resets the draft silently; no per-field override dots; **Cancel** restores the draft instead of closing, and **Done** closes without a dirty check. Applying density while a Page Edit overlay is open does not explicitly commit the overlay first; the document-level pointerdown capture may commit on the first click, but Apply can run before an async commit resolves. |
| STM-23 | Settings saving | Settings | `busy` disables Apply/Cancel/Reset/Use global; no spinner or “Saving…” text | Write resolves | Status is invisible except disabled buttons. `AP-13` store has `saving`, UI does not show it. |
| STM-24 | Settings saved | Settings | Inline note “Page density N% saved as the global default.” or “… saved for this document.” or “Settings saved.” (`role=status`) | Next edit clears | Note is transient; there is no persistent “saved” indicator. |
| STM-25 | Settings write error | Settings | Inline alert with message + **Retry**; no false “saved” | Retry | Last failed write only; no details/path. |
| STM-26 | Global settings corrupt/unreadable | Settings warning + startup toast | Warning says “could not be read” for both states; backup path; **Reset settings** (corrupt) and **Dismiss**; defaults for the session | Reset/dismiss | Reset has no confirmation. |
| STM-27 | Global settings newer schema | Settings warning | “written by a newer NoteForest version (schema N). Unknown fields are preserved.” + **Dismiss** | Dismiss | No downgrade; correct. |
| STM-28 | Document settings map corrupt/unreadable | Settings warning + startup toast | “Per-document settings could not be read…” + backup path + **Dismiss**; writes refused | Dismiss | No reset/restore action (AP-23). |
| STM-29 | Invalid page margins | Model | Silent fallback to all 12 mm when margins are impossible (`PS-3`); no UI warning | — | No surface can show the fallback because there is no margins UI. |
| STM-30 | Stale manual break hint | Paginator | `impossible-hint` warning in the model; settings retain the hint; no list to remove it | — | No UI. |
| STM-31 | Export confirm overwrite | Export panel | “Replace existing PDF?”, path, **Cancel**, **Replace PDF**; not a native dialog | Choose | No “remember my choice”; correct. |
| STM-32 | Export running / cancelling | Export panel | Phase label + percent + progress bar; **Cancel** becomes “Cancelling…”; path; export cannot be dismissed | Job ends | No per-phase ETA; no “open in background” (it already is non-modal). |
| STM-33 | Export done with warnings | Export panel | “PDF exported”, page count, path, first 6 warnings, **Done**, **Reveal in Finder** | Dismiss/reveal | Warnings truncated; no “Open PDF” action. |
| STM-34 | Export failed | Export panel | “Export failed”, code, message, first 8 details, **Dismiss** | Dismiss | No retry/change destination from the panel. |
| STM-35 | Broken / ambiguous anchor | Status chip, card warning, outline row, Page badge, health dialog | Counts and “needs repair”; card “Lost anchor”/“Ambiguous anchor”; health dialog filters and repair | Repair / remove idle | Repair is disabled in Read mode with a note. |
| STM-36 | Missing image asset | Image node | Placeholder per reason (“missing”, integrity, unsupported, unavailable) with title/name/hint; action menu gated; Page/print placeholder | Replace/reload | Image anchor authoring disabled until replaced. |
| STM-37 | Palette no results | Palette | Empty list; footer key legend remains; no “No results” copy | Esc/type | No empty-state text. |
| STM-38 | Library empty / filtered empty | Sidebar | “No documents yet.” / “No matching documents.” | New note / clear filter | No “Open folder” action. |
| STM-39 | Document command with no document | Dialog | “No document open” / “Open a document before using this command.” / **Close** | Close | Only reached if a dialog was opened through a stale path; most commands silently no-op or toast. |

---

## 7. Settings placement matrix (candidate, not a decision)

### 7.0 Method and legend

Every row of `docs/reviews/settings-inventory.md` is reproduced below with its ID and item, then
mapped to **what the user can reach today** and to **candidate homes observed in the current UI**.
The candidate home is not a recommendation; where two or three options exist, §7.17 records the
trade-offs.

**Exposure class** follows the frozen inventory: **U** first-class, **A** advanced disclosure,
**H** hidden, **E** engine/print constant, **DES** design decision, **X** cleanup.

**Candidate-home codes** (all except `NONE`/`ENGINE` exist in the current UI as a pattern):

| Code | Meaning |
|---|---|
| `SET-PAGE` | The existing Settings > Page section (`R/shell/Dialogs.tsx:2149-2267`). |
| `SET-PAGE-SETUP` | A candidate subsection under Page (no such subsection today). |
| `SET-PAGE-TYPE` | A candidate typography subsection under Page. |
| `SET-PAGE-LAYOUT` | A candidate layout/geometry subsection under Page. |
| `SET-PAGE-BREAKS` | A candidate manual-break subsection under Page. |
| `SET-DATA` | The existing Settings paths/actions block (`R/shell/Dialogs.tsx:2268-2301`). |
| `SET-EXPORT` | A candidate export subsection under Settings. |
| `SET-GENERAL` | A candidate general/appearance subsection. |
| `PAGE-TOOLBAR` | The existing Page toolbar (`R/page/PageView.tsx:794-905`). |
| `PAGE-SETUP-SHEET` | A candidate dedicated Page setup sheet/dialog. |
| `EXPORT-SHEET` | The existing export panel (`R/export/ExportStatusPanel.tsx`) or a future export sheet. |
| `CTX-BLOCK` | The existing renderer block context menu (`R/actions.ts:770-1008`). |
| `STATUS` | The existing status bar (`R/shell/StatusBar.tsx`). |
| `NONE` | No user control; automatic, diagnostic, or documentation only. |
| `ENGINE` | Engine/print constant; never editable. |

**Control-type vocabulary:** segmented/radio, select, numeric + unit, slider, stepper, switch,
text, read-only text, action button, list + remove, disclosure, none.

**Coverage note.** All 240 rows are present. Rows that describe a file contract, an engine constant,
or a migration are still listed with their exposure and UI relevance so the register is complete.

---

### 7.1 File contracts: SF

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| SF-1 | `settings.json` location | Settings > Data shows app-support path but not this filename | G | H/E | SET-DATA (read-only row) | read-only text | — | Show the exact file path? |
| SF-2 | `settingsVersion: 2` | Not exposed | G | H/E | SET-DATA (diagnostics) | read-only text | Future schema migrations | Show version in About/Data? |
| SF-3 | v1→v2 migration | Automatic; one-time note “Settings were upgraded…” | G | H | NONE | none | — | Keep the note? |
| SF-4 | Unknown fields preserved | Automatic; no UI | G | H/E | NONE | none | Round-trip contract | — |
| SF-5 | Newer schema | Settings warning (ST-02), version number, Dismiss | G | U (warning) | SET-DATA | read-only warning | — | Any action beyond Dismiss? |
| SF-6 | Corrupt file | Settings warning + backup path + **Reset settings** + Dismiss; startup toast | G | U (warning+action) | SET-DATA | action button | Backup file | Confirm before reset? |
| SF-7 | Unreadable file | Settings warning; defaults for the session; no save claimed; Dismiss | G | U (warning) | SET-DATA | read-only warning | — | Same copy as corrupt; distinguish? |
| SF-8 | Missing file | No UI; defaults written on first change | G | H | NONE | none | — | — |
| SF-9 | Read status enum | Drives warnings/toasts | G | U (warning) | SET-DATA | read-only | — | — |
| SF-10 | Write serialization | Engine | G | E | ENGINE | none | — | — |
| SF-11 | Atomic write | Engine | G | E | ENGINE | none | — | — |
| SF-12 | Partial global update | Engine (`updateAppSettings`) | G | E | ENGINE | none | Future UI must use patch API | — |
| SF-13 | Full-replace API | Test bridge only | G | X | NONE | none | — | Remove from final API? |

### 7.2 Durable per-document map: DS

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| DS-1 | `document-settings.json` location | Not shown (app-support path shown) | D | H/E | SET-DATA | read-only text | — | Show per-document file? |
| DS-2 | File `version: 1` | Not exposed | D | H/E | NONE | none | Version-2 policy when fields are added | — |
| DS-3 | Entry shape | Not exposed | D | H/E | NONE | none | — | — |
| DS-4 | Identity id-first/path-fallback | Automatic | D | H/E | NONE | none | Rename/move | — |
| DS-5 | Rename/move re-key | Automatic | D | H/E | NONE | none | — | E2E rename coverage is S3-10 |
| DS-6 | Delete keeps orphan | No delete command; entry inert | D | DES | NONE | none | Future document delete | Clean up on delete? |
| DS-7 | Legacy session migration | Automatic | D | H/E | NONE | none | — | — |
| DS-8 | Corrupt/unreadable map | Settings warning + backup path + Dismiss; writes refused | D | U (warning) | SET-DATA | read-only warning | — | Add reset/restore (AP-23)? |
| DS-9 | Write serialization | Engine | D | E | ENGINE | none | — | — |
| DS-10 | Unknown fields dropped | Not exposed; S3-4 | D | X | NONE | none | Version-2 policy | — |
| DS-11 | Duplicate entries collapse | Engine | D | E | ENGINE | none | — | — |
| DS-12 | Deterministic file | Engine | D | E | ENGINE | none | — | — |

### 7.3 Page setup: PS

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| PS-1 | `setup.size` A4/A5/Letter | Not exposed | G, D | U | SET-PAGE-SETUP; PAGE-SETUP-SHEET | segmented/radio | Re-paginate; margins | Setup in Settings, Page toolbar, or both? |
| PS-2 | `setup.orientation` | Not exposed | G, D | U | SET-PAGE-SETUP; PAGE-SETUP-SHEET | segmented/radio | Re-paginate; size | Same |
| PS-3 | `margins.top` 12 mm, 0–100 | Not exposed; silent fallback | G, D | U | SET-PAGE-SETUP | numeric + mm | Size/orientation; content-area minimum | Inline validation copy? |
| PS-4 | `margins.right` | Not exposed | G, D | U | SET-PAGE-SETUP | numeric + mm | same | Same |
| PS-5 | `margins.bottom` | Not exposed | G, D | U | SET-PAGE-SETUP | numeric + mm | same | Same |
| PS-6 | `margins.left` | Not exposed | G, D | U | SET-PAGE-SETUP | numeric + mm | same | Same |
| PS-7 | Page mm dimensions | Engine | E, P | H | ENGINE | none | Size/orientation | — |
| PS-8 | Page px dimensions | Engine | E, P | H | ENGINE | none | — | — |
| PS-9 | Content width/height px | Engine | E, P | H | ENGINE | none | Margins | — |
| PS-10 | Chrome band fractions | Engine | E, P | H | ENGINE | none | Margins | — |
| PS-11 | Cross-page label insets | Engine | E, P | H | ENGINE | none | Margins | — |
| PS-12 | Default setup A4 landscape 12 mm | Not exposed as a value | G | U (as default) | SET-PAGE-SETUP; SET-DATA | read-only text + reset | — | Confirm 12 mm vs spec/UX 20 mm |
| PS-13 | Spec A4-only | Doc only | C | X | NONE | none | R4 docs sweep | — |
| PS-14 | Header/footer content | Fixed; no toggles | E, P | H/A | SET-PAGE-SETUP (future) | switch ×N | Chrome model + schema bump | Add toggles now or later? |

### 7.4 Typography: TY

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| TY-1 | `preset` Compact/Comfortable/Custom | Not exposed; Compact default | G, D | U | SET-PAGE-TYPE | segmented | Switching preset replaces theme baseline (`R/state/settings.ts:140-143`) | Confirm destructive preset switch? |
| TY-2 | `density` 60–120 | Settings > Page density (CTL-04); Page/PDF consume it | G, D | U | SET-PAGE; PAGE-TOOLBAR | slider + presets | Type/box lens; topology | Slider, presets, or both? |
| TY-3 | `fontScale` 0.5–2 | Not exposed | G, D | H/FH | SET-PAGE-TYPE (Advanced, future) | numeric | Floor bypass bug | Keep hidden until clamped |
| TY-4 | `bodyPt` 6–24 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric + pt | Density floor | Advanced or density-only? |
| TY-5 | `bodyLine` 1–2.5 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric | — | Same |
| TY-6 | `headingScale` 0.5–2 | Not exposed | G, D | H/FH | SET-PAGE-TYPE (future) | numeric | Heading order bug | Keep hidden |
| TY-7 | `heading1Pt` 8–40 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric + pt | Body + 3 floor | Same |
| TY-8 | `heading2Pt` 7–32 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric + pt | Body + 1.5 floor | Same |
| TY-9 | `heading3Pt` 6–28 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric + pt | Body + 1 floor | Same |
| TY-10 | `codePt` 5–20 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric + pt | 7 pt floor | Same |
| TY-11 | `codeLine` 1–2.5 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric | — | Same |
| TY-12 | `tablePt` 5–20 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric + pt | 7 pt floor | Same |
| TY-13 | `tableLine` 1–2.5 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric | — | Same |
| TY-14 | `labelPt` 5–20 | Not exposed | G, D | U (advanced) | SET-PAGE-TYPE (Advanced) | numeric + pt | 7 pt floor | Same |
| TY-15 | `chromePt` 5–16 | Not exposed | G, D | A | SET-PAGE-TYPE (Advanced) | numeric + pt | 6 pt floor; chrome | Same |
| TY-16 | `markerPt` 5–16 | Not exposed | G, D | A | SET-PAGE-TYPE (Advanced) | numeric + pt | 6 pt floor | Same |
| TY-17 | Heading line height 1.25 | CSS constant | E | H | ENGINE | none | Future field + version bump | — |
| TY-18 | Label line height 1.2 | CSS constant | E | H | ENGINE | none | Same | — |
| TY-19 | Inline code 0.86em | CSS constant | E | H | ENGINE | none | — | — |
| TY-20 | Code line min height 1.35em | CSS constant | E | H | ENGINE | none | — | — |
| TY-21 | Table cell padding `cardPadding × 0.75` | Derived | E | A | SET-PAGE-LAYOUT (read-only) | read-only | cardPadding | — |

### 7.5 Boxes, spacing, indents: BX

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| BX-1 | `cardPadding` 0–40 | Not exposed | G, D | U | SET-PAGE-LAYOUT (Advanced) | numeric + px | Density | Advanced or first-class? |
| BX-2 | `cardBorder` 0–8 | Not exposed | G, D | A | SET-PAGE-LAYOUT (Advanced) | numeric + px | Density not scaled | Same |
| BX-3 | `segmentGap` 0–32 | Not exposed | G, D | U | SET-PAGE-LAYOUT (Advanced) | numeric + px | Density | Same |
| BX-4 | `siblingGap` 0–96 | Not exposed | G, D | A | SET-PAGE-LAYOUT (Advanced) | numeric + px | Density; direct-child group | Same |
| BX-5 | `wrapIndent` 0–96 (two roles) | Not exposed | G, D | A / X rename | SET-PAGE-LAYOUT (Advanced) | numeric + px, label “List indent” | Nested-list indent + wrap floor | Rename before exposing |
| BX-6 | `maxWrapIndent` 0–192 | Not exposed | G, D | A | SET-PAGE-LAYOUT (Advanced) | numeric + px | ≥ wrapIndent; per level | Same |
| BX-7 | `childIndent` 0–96 | Not exposed | G, D | A | SET-PAGE-LAYOUT (Advanced) | numeric + px | ≥ childTrunkInset + 12 + 2 | Same |
| BX-8 | `childTrunkInset` 0–96 | Not exposed | G, D | A/H | SET-PAGE-LAYOUT (Advanced) | numeric + px | B2 geometry | Hidden or advanced? |
| BX-9 | `calloutTrunkInset` 0–96 | Not exposed | G, D | A/H | SET-PAGE-LAYOUT (Advanced) | numeric + px | B2 geometry | Same |
| BX-10 | `calloutCardIndent` 0–160 | Not exposed | G, D | A/H | SET-PAGE-LAYOUT (Advanced) | numeric + px | ≥ trunk inset | Same |
| BX-11 | `calloutRightGap` 12–96 | Not exposed | G, D | A/H | SET-PAGE-LAYOUT (Advanced) | numeric + px | Mode A lane | Same |
| BX-12 | `calloutModeMinWidth` 0–800 | Not exposed | G, D | H | NONE (hidden) | none | Mode A gate | Never expose? |
| BX-13 | `calloutGap` 0–96 | Not exposed | G, D | A | SET-PAGE-LAYOUT (Advanced) | numeric + px | Density | Same |
| BX-14 | `maxCardWidth` 120–2000 | Not exposed | G, D | U | SET-PAGE-LAYOUT | numeric + px | Density band 240–560; images | Expose cap or presets? |
| BX-15 | `minContentWidth` 80–800 | Not exposed | G, D | A | SET-PAGE-LAYOUT (Advanced) | numeric + px | Floor 140; defect threshold | Same |
| BX-16 | `chapterGap` 32 | Engine | E | H | ENGINE | none | — | — |
| BX-17 | `cardRadius` 4 | Engine/shared | E | H | ENGINE | none | Shared shell primitive | — |
| BX-18 | List indent (same field as BX-5) | Not exposed | G, D | U | SET-PAGE-LAYOUT | numeric + px | Same field | Expose once, not twice |
| BX-19 | `pagePacking` | Hidden; presets `beside` | G, D | H | NONE | none | Topology | Keep hidden |
| BX-20 | `calloutModes` derived | Hidden | — | H/E | ENGINE | none | pagePacking | — |

### 7.6 Packing and callout topology: PK

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| PK-1 | `pagePacking` | Hidden; presets `beside` | G, D | H | NONE | none | Topology | Never expose in v1 |
| PK-2 | `calloutModes` | Derived; hidden | — | H/E | ENGINE | none | pagePacking | — |
| PK-3 | `wrapPolicy` | Hidden; `group-left-origin` | E | H | ENGINE | none | Layout | — |
| PK-4 | Subtree fit | Hidden; deterministic | E | H | ENGINE | none | R2i | — |
| PK-5 | Mode A/B2/stacked selection | Hidden; geometric | E | H | ENGINE | none | Width, callout width | Explain in UI? |
| PK-6 | Density topology coupling | Hidden; same density → same mode | E | H | ENGINE | none | Density | Copy only |
| PK-7 | Callout mode preference | None | — | DES | NONE | none | — | Keep adaptive (closed) |

### 7.7 Manual breaks: MB

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| MB-1 | `manualBreakBeforeBlockIds` | No UI; setting exists | G, D | U | SET-PAGE-BREAKS; CTX-BLOCK; PAGE-TOOLBAR | list + remove; action | Block ids; paginator | Toolbar, block menu, or both? |
| MB-2 | Honored before a block | No UI explanation | E | U (explain) | SET-PAGE-BREAKS; PAGE-TOOLBAR | read-only | Safe break exists | Explain stale hints where? |
| MB-3 | Cleanup on delete | Not implemented | D | DES | NONE | none | Delete command | Implement before exposing |
| MB-4 | Cleanup on split | Not implemented | D | DES | NONE | none | Split command | Same |
| MB-5 | Cleanup on merge | Not implemented | D | DES | NONE | none | Merge command | Same |
| MB-6 | Stale filtering on load | Paginator warns; settings retain | E | DES | SET-PAGE-BREAKS | list + remove | — | Show stale list? |
| MB-7 | Fingerprint array order | Hidden | E | H | ENGINE | none | — | — |
| MB-8 | UI entry point | None | — | DES | CTX-BLOCK; PAGE-TOOLBAR | action | MB-3..6 | Pick one or both |
| MB-9 | UI list + remove | None | — | DES | SET-PAGE-BREAKS | list + remove | MB-3..6, MB-8 | Needs cleanup first |

### 7.8 Continuous: CO

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| CO-1 | `ContinuousSettings` / zoom | **Removed**; no field | — | X | NONE | none | — | Do not rebuild |
| CO-2 | Per-document Continuous zoom | Status bar −/%/+ (CTL-20) | V | U | STATUS; SET-GENERAL (future default) | stepper/slider | — | Keep view-state only? |
| CO-3 | Page zoom | Page toolbar −/%/+ (CTL-23) | V | U | PAGE-TOOLBAR | stepper | Fit mode | — |
| CO-4 | Canvas logical width 3200 | Engine | E | H | ENGINE | none | — | — |
| CO-5 | Canvas padding 40/40/88 | Engine | E | H | ENGINE | none | Responsive steps | — |
| CO-6 | Chapter gap 28 | Engine | E | H | ENGINE | none | — | — |
| CO-7 | Child gap 24 | Engine | E | H | ENGINE | none | — | — |
| CO-8 | Child row gap 16 | Engine | E | H | ENGINE | none | — | — |
| CO-9 | Card padding/radius 10/4 | Engine | E | H | ENGINE | none | Shared radius | — |
| CO-10 | Block width bounds | Engine | E | H | ENGINE | none | Content-driven | — |
| CO-11 | Row indent 26 | Engine | E | H | ENGINE | none | — | — |
| CO-12 | Reserved wrap indent 18 | Engine, unused | E | H | ENGINE | none | — | Remove or keep reserved? |
| CO-13 | Default zoom/fit | Status bar; Page fit | V | U | STATUS; PAGE-TOOLBAR | buttons | — | — |
| CO-14 | Continuous font/width/spacing | No fields | — | DES | SET-GENERAL (future) | — | New schema + migration | In scope now? |

### 7.9 App, shell, view state: AP

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| AP-1 | Appearance theme | No control; three static labels (“Dark”, “Graphite”, “Graphite · dark (light tokens reserved)”) | G | DES | SET-GENERAL | segmented/radio | Theme token split; Page is always light | Dark-only v1 or light/system? |
| AP-2 | Library path | Settings > Data read-only + **Reveal library in Finder** | E | U (About/Data) | SET-DATA | read-only + action | — | Allow changing folder? |
| AP-3 | App-support path | Settings > Data read-only | E | U (About/Data) | SET-DATA | read-only | — | — |
| AP-4 | Sidebar width | Drag splitter; persisted | V/G | A/shell | NONE (drag) | stepper (none today) | 208–360 | Add a numeric control? |
| AP-5 | Sidebar collapsed | `⌘\`; no visible expand affordance when collapsed | V/G | U | NONE (shortcut) | toggle | — | Add a rail/expand button? |
| AP-6 | Collapsed topics | Chevrons; persisted | V | U | NONE (tree) | disclosure | — | — |
| AP-7 | Default layout | Status bar; per-document only | V | U | STATUS | segmented | No global default | Add a global default? |
| AP-8 | Default mode | Status bar; Page opens Read | V | U | STATUS | segmented | Layout switch resets mode | Preserve explicit Page Edit? |
| AP-9 | Current page | Page toolbar counter | V | U | PAGE-TOOLBAR | read-only/stepper | Page count clamp | — |
| AP-10 | Page zoom | Page toolbar | V | U | PAGE-TOOLBAR | stepper | Fit | — |
| AP-11 | Page fit | Page toolbar | V | U | PAGE-TOOLBAR | segmented | Viewport | — |
| AP-12 | Settings read status | Warnings/toasts | G | U (warning) | SET-DATA | read-only | — | — |
| AP-13 | Settings save status | Only error inside Settings; store has idle/saving/saved/error | G | U (status) | SET-DATA | status text | Settings writes | Add a global indicator? |
| AP-14 | Settings retry | Settings error + **Retry** | G | U | SET-DATA | action | — | — |
| AP-15 | No-document Settings | Disabled document scope + reason | G | U | SET-PAGE; SET-DATA | disabled state | — | — |
| AP-16 | Autosave delay 800 ms | Footer note in Settings only | E | A | SET-GENERAL (advanced) | numeric | Save coordinator | Expose or keep fixed? |
| AP-17 | Session debounce/interval | Engine | E | H | ENGINE | none | — | — |
| AP-18 | Flush timeout | Engine | E | H | ENGINE | none | — | — |
| AP-19 | Window size | Engine | E | H | ENGINE | none | — | — |
| AP-20 | Single-key shortcut disable | No field | — | DES | SET-GENERAL (shortcuts) | switch | Keymap architecture | In scope? |
| AP-21 | Recent/closed tabs | `Reopen Closed Tab` only; no recent list | V | U | NONE | action | Session | Add a recent list? |
| AP-22 | Help → Keyboard shortcuts | Opens Settings | — | X | SET-GENERAL (shortcuts) | action | — | Build a shortcuts surface? |
| AP-23 | Corrupt document-map recovery | Warning + Dismiss only | G | DES | SET-DATA | action | Reset API | Add reset/restore? |

### 7.10 Shared edge primitives: ED

These are engine values consumed by Continuous, Page Read/Edit, and print. No user control is
foreseen in the frozen model. Compact table intentionally omits control-type columns.

| ID | Token | Current exposure | Scope/class | Candidate home | UI relevance |
|---|---|---|---|---|---|
| ED-1 | `gap` 2 | Engine | E/H | ENGINE | None; documented |
| ED-2 | `radius` 2 | Engine | E/H | ENGINE | None |
| ED-3 | `stemMin` 12 | Engine | E/H | ENGINE | Floors childIndent/calloutRightGap |
| ED-4 | `laneMin/Max` 2/14 | Engine | E/H | ENGINE | None |
| ED-5 | `trunkInset` 12 | Engine | E/H | ENGINE | None |
| ED-6 | `trunkGap` 0 | Engine | E/H | ENGINE | None |
| ED-7 | `arrowLength/HalfWidth` 6/3 | Engine | E/H | ENGINE | None |
| ED-8 | `edgeWidth*` 1.25/1.75/1 | Engine | E/H | ENGINE | Stroke; no control |
| ED-9 | `minGap` 4 | Engine | E/H | ENGINE | None |
| ED-10 | `referenceArrow*` 7/0.46 | Engine | E/H | ENGINE | None |
| ED-11 | `pageClearance` 3 | Engine | E/H | ENGINE | Page route |
| ED-12 | `pageLaneStep` 4 | Engine | E/H | ENGINE | Page route |
| ED-13 | `pageTurnPenalty` 60 | Engine | E/H | ENGINE | Search cost |
| ED-14 | `LEGACY_BESIDE_READABLE_WIDTH` 144 | Engine | E/H | ENGINE | Oracle only |
| ED-15 | `LEGACY_BESIDE_ANCHOR_INSET` 16 | Engine | E/H | ENGINE | Oracle only |

### 7.11 Print / PDF: PR

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| PR-1 | Print page size | Fixed from resolved setup; no control | P | P | PAGE-SETUP-SHEET (via PS-1/2) | read-only | PS-1/2 | — |
| PR-2 | Print margins 0 | Engine | P | P | ENGINE | none | PS-3..6 | — |
| PR-3 | Print scale/background | Engine | P | P | ENGINE | none | — | — |
| PR-4 | Tagged PDF false | No control | P | DES | SET-EXPORT | switch (future) | Accessibility decision | Tagged PDF in v1? |
| PR-5 | Print skin colors | Fixed light | P | H/E | ENGINE | none | — | — |
| PR-6 | Chrome text | Fixed | P | P | SET-PAGE-SETUP (future toggles) | read-only | PS-14 | — |
| PR-7 | Chrome fractions | Engine | P | H/E | ENGINE | none | — | — |
| PR-8 | Hidden print window | Engine | P | E | ENGINE | none | — | — |
| PR-9 | Print timeouts | Engine | P | E | ENGINE | none | — | — |
| PR-10 | Snapshot timeout | Engine | P | E | ENGINE | none | — | — |
| PR-11 | Asset/font/frame settles | Engine | P | E | ENGINE | none | — | — |
| PR-12 | Job retention 25 | Engine | P | E | ENGINE | none | — | — |
| PR-13 | PDF size tolerance 0.25 mm | Engine | P | E | ENGINE | none | — | — |
| PR-14 | Export filename | `<title>.pdf`; save dialog can change | P | DES | SET-EXPORT | text/pattern | Title sanitization | Date suffix? |
| PR-15 | PDF metadata | Not set | P | DES | SET-EXPORT | read-only/auto | Schema? | Add title/date metadata? |
| PR-16 | Progress poll 120 ms | Engine | P | E | ENGINE | none | — | — |
| PR-17 | Panel truncation 6/8 | Current panel slices | P | A/DES | EXPORT-SHEET | list | Final UI | Show all? |
| PR-18 | Print model identity | Hidden; stale model fails export | P | H | ENGINE | none | Fingerprint | — |

### 7.12 Export UI: EX

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| EX-1 | Entry points | Menu, palette, Page toolbar, `⇧⌘E` | U | U | Menu/PAL/PAGE-TOOLBAR | action | — | Keep all? |
| EX-2 | No active document | Toast “Open a document before exporting a PDF.” | U | U | — | toast | — | — |
| EX-3 | Read-only document | Allowed | U | U | — | — | Save gate excluded | — |
| EX-4 | Page Edit open | Commits before snapshot | U | U | — | — | Page Edit registry | — |
| EX-5 | Save dialog | Native; filename only; OS folder | DES | DES | SET-EXPORT; EXPORT-SHEET | path picker | OS dialog | Default folder? |
| EX-6 | Overwrite | Explicit panel confirm; engine no-clobber | U | U | EXPORT-SHEET | alert | — | “Never ask” option? |
| EX-7 | Progress/cancel | Phase + percent + cancel | U | U | EXPORT-SHEET | progress | Job API | Final sheet layout |
| EX-8 | Reveal in Finder | Panel button | U | U | EXPORT-SHEET | action | — | E2E not exercised |
| EX-9 | Warnings | 6 shown of N | U/A | U/A | EXPORT-SHEET | list | — | Show all |
| EX-10 | Preflight failure | Typed error + block names | U | U | EXPORT-SHEET | alert | — | — |
| EX-11 | Default export mode | Page PDF only | E | E | — | none | ADR-0002 | — |
| EX-12 | Page range/selection | None | DES | DES | SET-EXPORT; EXPORT-SHEET | radio | Paginator | v1 whole document? |
| EX-13 | PDF metadata/date | Not set | DES | DES | SET-EXPORT | text | — | Same as PR-15 |

### 7.13 Missing settings / design decisions: MS

| ID | Item | Current exposure | Scope | Class | Candidate home(s) | Control type | Dependencies | Open question |
|---|---|---|---|---|---|---|---|---|
| MS-1 | Appearance | No control | G | DES | SET-GENERAL | segmented | Theme tokens | In rework? |
| MS-2 | Full Page Setup UI | No control | G/D | DES | SET-PAGE-SETUP; PAGE-SETUP-SHEET | form | PS-1..6 | Where? |
| MS-3 | Page presets/typography UI | Density only | G/D | DES | SET-PAGE-TYPE | form | TY-1..16 | Advanced or density-only? |
| MS-4 | Manual breaks UI + cleanup | No UI | G/D | DES | SET-PAGE-BREAKS; CTX-BLOCK | list/action | MB-3..9 | Where? |
| MS-5 | Continuous zoom/canvas/type | Zoom yes; canvas/type no | V/G | DES | SET-GENERAL | form | CO-14 | Add fields? |
| MS-6 | Header/footer/page-number toggles | No | G/D | DES | SET-PAGE-SETUP | switch | PS-14 | Now? |
| MS-7 | Chapter-start behavior | Always new page | G/D | DES | SET-PAGE-SETUP | radio | Paginator | Now? |
| MS-8 | Default export folder/date/metadata | No | G | DES | SET-EXPORT | path/text | EX-5, PR-14/15 | Now? |
| MS-9 | Keyboard shortcut disable | No | G | DES | SET-GENERAL | switch/table | AP-20 | Now? |
| MS-10 | Autosave interval | Fixed 800 ms, note only | G | DES | SET-GENERAL (advanced) | numeric | AP-16 | Now? |
| MS-11 | Page default zoom/fit | Per-document only | G | DES | SET-GENERAL | segmented | AP-10/11 | Add global default? |
| MS-12 | Callout mode preference | Closed/deferred | — | DES | NONE | none | — | Keep adaptive |
| MS-13 | Page-owned stem/trunk/row tokens | Closed by docs | — | X | ENGINE | none | — | — |
| MS-14 | Heading/label line heights, radius, chapter gap | Engine | E | DES | NONE | none | Version bump | Future? |
| MS-15 | Tagged PDF/accessibility metadata | No | P | DES | SET-EXPORT | switch | PR-4 | — |
| MS-16 | Corrupt-settings recovery | Global yes; document map no | G | DES | SET-DATA | action | AP-23 | — |
| MS-17 | No-document Settings | Yes | G | — | SET-PAGE | disabled | — | — |
| MS-18 | Durable per-document overrides | Yes, density only | D | — | SET-PAGE | scope | — | — |
| MS-19 | Settings save status/retry | Partial | G | — | SET-DATA | status | — | — |
| MS-20 | Page/Continuous token split | Closed (docs) | — | — | ENGINE | none | — | — |

### 7.14 Migration register: MG

Reduced columns: these rows describe stored-data evolution, not a control. “UI relevance” says
whether a surface must exist for the migration to be visible.

| ID | Item | State | Scope | Class | Candidate home | UI relevance |
|---|---|---|---|---|---|---|
| MG-1 | Settings schema version | Closed | G | E | NONE | None |
| MG-2 | Corrupt global recovery | Closed | G | U | SET-DATA | Warning/reset exists |
| MG-3 | Unknown global fields | Closed | G | E | NONE | None |
| MG-4 | Per-document override lifetime | Closed | D | E | NONE | Scope selector exists |
| MG-5 | Rename/move | Closed | D | E | NONE | No UI |
| MG-6 | Density min 0.6 | Closed | G/D | E | NONE | Slider min |
| MG-7 | Density step 5 | Closed | G/D | E | NONE | Slider step |
| MG-8 | Page setup defaults | Open DES | G | DES | SET-PAGE-SETUP | 12 vs 20 mm decision |
| MG-9 | Manual-break cleanup | Open DES | D | DES | SET-PAGE-BREAKS | Needed before MB UI |
| MG-10 | Legacy v1 page fields | Closed | C | E | NONE | None |
| MG-11 | Continuous zoom duplicate | Closed | V | E | NONE | None |
| MG-12 | Future global fields | Partial | G | E | NONE | Per-field migration |
| MG-13 | Export preferences | Open DES | G | DES | SET-EXPORT | Needs schema |
| MG-14 | Appearance | Open DES | G | DES | SET-GENERAL | Needs schema |
| MG-15 | Newer settings schema | Closed | G | U | SET-DATA | Warning exists |
| MG-16 | Document-settings version policy | Open S3 | D | X | NONE | None until a field is added |
| MG-17 | Corrupt document-map recovery | Open DES/S3 | G | DES | SET-DATA | Dismiss only today |

### 7.15 Duplicate/stale register: DUP

Reduced columns. “UI outcome” is what the user sees today.

| ID | Item | State | Class | UI outcome |
|---|---|---|---|---|
| DUP-1 | Continuous zoom settings vs view state | Closed | X | One zoom (status bar) |
| DUP-2 | Page CSS compact fallback | Closed | X | No fallback |
| DUP-3 | Unused Page CSS variables | Closed | X | 16 keys |
| DUP-4 | `.nf-measure-card` Continuous width | Closed | X | Page max width |
| DUP-5 | Page zoom clamps duplicated | Open | X | `PageView.tsx:82-84` vs `view-state.ts:56-60`; behavior same |
| DUP-6 | `wrapIndent` roles | Documented | X | Page/list vs reserved shell 18 |
| DUP-7 | `childIndent` / row indent 26 | Documented | X | Same number, two surfaces |
| DUP-8 | `calloutGap` 12/20/16/20 | Documented | X | Page vs shell vs engine |
| DUP-9 | Chapter gap 32 vs 28 | Documented | X | Page vs Continuous |
| DUP-10 | Card radius 4 shared | Documented | X | Both surfaces |
| DUP-11 | `pxToMm` / `MM_PER_PX` | Closed | X | Gone |
| DUP-12 | `pageDimensionsMm` | Internal | X | No UI |
| DUP-13 | `maxWrapIndent` wording | Closed | X | Per-level docs |
| DUP-14 | Engine `childIndent` default | Closed | X | Named constant |
| DUP-15 | “compaction for compact” comment | Closed | X | Corrected |
| DUP-16 | `useContinuousSettings` | Removed | X | Gone |
| DUP-17 | Dead store APIs | Removed | X | Gone |
| DUP-18 | `pageCssVariables` in layout package | Documented | X | Pure map |
| DUP-19 | Help → Keyboard shortcuts | Open | X | Opens Settings |
| DUP-20 | Spec/UX page-setup model | Open | X | Docs contradict code |
| DUP-21 | Document-settings unknown fields/version | Open S3 | X | Dropped on write |
| DUP-22 | ADR-0008 `ContinuousSettings` | Open S3 | X | ADR stale |
| DUP-23 | Fixed 300 ms sleep in UI test | Open S3 | X | Test only |
| DUP-24 | `settings-file.ts` formatting | Open S4 | X | Cosmetic |

### 7.16 Coverage count

| Section | Rows in inventory | Rows in §7 | Missing |
|---|---:|---:|---:|
| SF | 13 | 13 | 0 |
| DS | 12 | 12 | 0 |
| PS | 14 | 14 | 0 |
| TY | 21 | 21 | 0 |
| BX | 20 | 20 | 0 |
| PK | 7 | 7 | 0 |
| MB | 9 | 9 | 0 |
| CO | 14 | 14 | 0 |
| AP | 23 | 23 | 0 |
| ED | 15 | 15 | 0 |
| PR | 18 | 18 | 0 |
| EX | 13 | 13 | 0 |
| MS | 20 | 20 | 0 |
| MG | 17 | 17 | 0 |
| DUP | 24 | 24 | 0 |
| **Total** | **240** | **240** | **0** |

Current exposure at a glance:

| Exposure | Count | Rows |
|---|---:|---|
| Exposed as a real control (first-class or view state) | 11 | TY-2, CO-2, CO-3, AP-4, AP-5, AP-6, AP-7, AP-8, AP-9, AP-10, AP-11 |
| Exposed as a warning/status/disabled state only | 8 | SF-5, SF-6, SF-7, SF-9, AP-12, AP-13, AP-14, AP-15 |
| Exposed as read-only data (paths/version) | 2 | AP-2, AP-3 |
| Model exists, no control | 30+ | PS-1..6, TY-1..16, BX-1..18, MB-1, EX-12, etc. |
| Engine/print-only | ~55 | See ED/PR/BX/CO/TY/PS rows |
| Design decision / no field | ~40 | DES rows |
| Cleanup/removal | ~20 | X rows |

The exact split is intentionally not summed to 240 because some rows are both “model exists” and
“design decision” (for example PS-14). The per-section tables are the authoritative count.

### 7.17 Rows where placement is a real choice

Only rows with two or more plausible homes and a material trade-off. These are observations, not
recommendations.

| ID | Choice | Option A | Option B | Option C | Trade-off |
|---|---|---|---|---|---|
| CH-01 | Page setup location (PS-1..6) | **Settings > Page > Setup** | **Page toolbar → setup sheet** | Both (Settings default, toolbar override) | Settings is app-level and works with no document; the toolbar is contextual and visible exactly when the page matters. Both adds a scope question: which one edits the document override? |
| CH-02 | Orientation control (PS-2) | Segmented portrait/landscape | Rotate action | — | A rotate action is one click but hides the current state; segmented is explicit. |
| CH-03 | Margin input (PS-3..6) | Four numeric mm fields | Preset margins (Normal/Wide) | Visual drag on a page thumbnail | Numeric matches the model and range; presets match UX copy; drag needs a new canvas surface. |
| CH-04 | Preset switch (TY-1) | Segmented Compact/Comfortable | Preset menu + “Custom” marker | No preset control; density only | Preset switch currently replaces the whole theme baseline; without an undo/confirm it can wipe advanced values. |
| CH-05 | Density presentation (TY-2) | Slider only | Slider + named steps | Presets only | Slider matches the frozen 5% step; named steps help copy (“dense print”); presets alone lose the 60–120 range. |
| CH-06 | Typography exposure (TY-4..16) | Advanced disclosure with all fields | Density only | A few high-value fields (body, heading 1, card padding) | Full exposure is 13+ numeric fields; density-only is simpler but cannot fix a specific size. |
| CH-07 | Layout/geometry exposure (BX-1..18) | Advanced disclosure grouped by “Card”, “Wrap”, “Callout” | Flat advanced list | Hidden except maxCardWidth/minContentWidth | Callout internals are explicitly hidden in the frozen model; exposing them needs naming and dependency guards. |
| CH-08 | `wrapIndent` naming (BX-5/BX-18) | One control labeled “List indent” | One control labeled “Wrap indent” | Two controls (forbidden by same field) | The field has two Page roles; one label must win. |
| CH-09 | Card width (BX-14) | Numeric maxCardWidth | Named width presets | Hide | Density already moves the cap within 240–560; a manual cap outside the band keeps its own scaling. |
| CH-10 | Manual-break entry (MB-1/MB-8) | Block context menu | Page toolbar | Both + a list in Settings | Context menu is contextual but hidden; toolbar is visible but crowded; a list is needed to remove stale hints. |
| CH-11 | Cleanup timing (MB-3..6) | Implement cleanup before UI | Ship UI with stale warnings | Read-only list first | Without cleanup, the UI can create hints it cannot safely maintain. |
| CH-12 | Appearance (AP-1) | Dark only v1 | Dark/light/system | Theme presets | Page is always light and print is light; a shell theme switch does not change Page/PDF. |
| CH-13 | Default layout/mode (AP-7/AP-8) | Per-document only (today) | Global default in Settings | Remember last used | A global default needs a new field and a migration; “remember last” is a behavior change without a field. |
| CH-14 | Settings save status (AP-13) | Inline note only | Persistent status row in Settings | Global status-bar segment | Inline is local but easy to miss; a global segment competes with document save state. |
| CH-15 | Export options (EX-5/EX-12) | Native save dialog only | In-app export sheet with folder/range/metadata | Settings defaults + native dialog | A sheet enables preview/range/metadata but duplicates the OS folder picker. |
| CH-16 | Settings scope (MS-1/MS-9/MS-10) | Include appearance/shortcuts/autosave now | Defer to a later phase | Only Page/Export now | Each new field needs a schema version bump and migration; the freeze is for design, not implementation. |

---

## 8. Doc reconciliation

Facts only. I did not edit any of these documents. “Code” below means the current `design/ui-map`
tree.

| ID | Document / location | Claim in the document | What the code does | Impact on the UI design |
|---|---|---|---|---|
| DR-01 | `docs/tasks/page-settings-ui-plan.md` (whole file) | Pre-freeze plan: Settings has a **Continuous section** with `ContinuousSettings.zoom` (`:33-40, 105-111`); per-document overrides live in `shell-session.json` (`:38-44, 144`); expose `fontScale` and all typography (`:70-74`); callout mode preference Auto/force A/force B2 (`:86`); live sheet preview (`:62`); left navigation/tabs (`:117-131`); manual-break cleanup (`:98-102`) | No `ContinuousSettings` (CO-1 removed); durable `document-settings.json`; `fontScale`/`headingScale` hidden; callout preference closed/deferred; no preview; no section nav; cleanup not implemented | **The plan is stale.** Do not use it as an IA baseline. Frozen inventory + this map supersede it. |
| DR-02 | `docs/spec.md:373-384, 610-611, 1553, 1651` | Canonical `document.json` contains `pageSetup`; page size/orientation/margins are document settings; 20 mm default; A4 fixed | Schema v2 has no `pageSetup`; settings are global + durable per-document override; default A4 landscape 12 mm; A5/Letter supported | Any design copy based on spec will describe a field that no longer exists. |
| DR-03 | `docs/spec.md:513-516, 1080-1087, 1733-1735` | A4 only, 20 mm margins, `pageSetup` document-wide | A4/A5/Letter, 12 mm, personal lens | Same; also the “Notability wide right margin” story has no implementation. |
| DR-04 | `docs/spec.md:143, 1125` | Manual break hints are document settings | `manualBreakBeforeBlockIds` is a personal Page setting (G/D) | Manual-break copy must say personal, not document. |
| DR-05 | `docs/spec.md:220, 223, 957, 2179` | Page Edit planned/optional; Page Read exact; AC-29 requires Continuous page-break markers | Page Edit is implemented (`PageBlockEditor`); Continuous has **no** page model, markers, or chips | Spec acceptance criteria cannot be used verbatim. |
| DR-06 | `docs/spec.md:171` and `docs/ux.md:31,59,235,251,261,269` | Three surfaces: **Outline**, Continuous, Page; top toolbar switcher; `⌘1` Outline | Two layouts: Continuous, Page; the outline is the sidebar tree; `⌘1` selects tab 1; no top toolbar | A design that assumes a three-way toolbar or an Outline screen would invent a surface. |
| DR-07 | `docs/ux.md:382-404, 414` | Right-hand Inspector with Block/Anchors/Branches/Referenced by/Chapter/Pagination/Selection/Document sections, `⌘⌥I` | No inspector; anchor/reference data lives in chips, the block menu, and the anchor-health dialog | Inspector is a v1 target, not a current surface. |
| DR-08 | `docs/ux.md:310-322, 395, 416, 949-955` | Page Setup panel (`⌘⌥P`): size A4/Letter, orientation, margins Normal/Wide, chapter start, page numbers, running header, live preview, Notability preset | No Page Setup surface or fields; A5 exists in the model but not in the doc; margins are mm 0–100 | Page Setup is a blank page in the design. |
| DR-09 | `docs/ux.md:957-964` | Manual breaks: Insert/Remove/Keep/Why, `⌘⌥B`, Pagination panel list, stale warning | No commands, no list, no UI; cleanup missing | Same. |
| DR-10 | `docs/ux.md:109, 262, 277, 379, 827-828` | Continuous shows derived page-break markers; page indicator in Continuous and Page | No Continuous markers/chips/page indicator; Page has “Page N of M” and edge labels | Continuous marker UI is absent, not just unfinished. |
| DR-11 | `docs/ux.md:369` | Multi-select with Shift/Cmd-click, marquee, “N selected”, bulk actions | Single block selection only | Bulk-edit design would have no model. |
| DR-12 | `docs/ux.md:418, 908-925` | Export sheet with page thumbnails, Page Setup values, preflight, success toast with Open PDF; `⌘P` quick export | Native save dialog → floating progress panel; no preview/options/Open PDF; no `⌘P` | The export rework starts close to zero on the sheet, but the job pipeline exists. |
| DR-13 | `docs/ux.md:938-945` | `⌘F` find bar across block text, code, LaTeX, anchors, labels, chapters; `⌘G` next | No find bar; palette searches command labels, document titles, and block titles only | “Search” currently means palette/library filter. |
| DR-14 | `docs/ux.md:272, 1273` (and repeated at `:12, :26, :31, :265, :270, :586, :709, :746, :1119`) | Page Read exposes Page Setup and Export; `⌘E` disabled in Page until Page Edit ships; Page Edit planned/disabled | Page Read exposes Export only; `⌘E` works and Page Edit exists | Page toolbar/mode copy is stale. |
| DR-15 | `docs/ux.md:183, 1271-1273` | `⌘⌥C` New Chapter; `⌘1` Outline; Page Edit disabled | `⇧⌘N` New Chapter; `⌘1` tab 1; Page Edit enabled | Shortcut tables in UX are not the implementation. |
| DR-16 | `docs/ux.md:560-562` | `⌘⇧S` save a copy; `File > Duplicate`; `File > Show in Finder` | Save a copy exists only in the save-failure banner (native dialog); no Duplicate/Show in Finder menu items | Menu design has no save-copy surface. |
| DR-17 | `docs/adr/0008-personal-page-settings.md:45-57, 83, 124` | `continuous: ContinuousSettings`, `continuousOverride` in the session; Continuous settings section | Removed by M4e1; view-state zoom only; frozen inventory says no Continuous settings section | ADR is stale (already tracked as DUP-22/S3-6). |
| DR-18 | `docs/adr/0007-editor-layouts-and-modes.md:48-50, 63, 75, 98` | Continuous consumes paginator breaks as markers/hints; page size “A4 now; other sizes later” | Continuous never mounts the page model; A5/Letter geometry exists | ADR consequences overstate the marker implementation. |
| DR-19 | `AGENTS.md` current phase | Says M4b1c continuous page-break markers merged, then R2a “remove Continuous page chrome … no page model/markers/chips” | No marker code at all | The code matches R2a, not M4b1c; the paragraph is internally contradictory. |
| DR-20 | `docs/ux-shell.md:50, 78, 58` | Canvas max ~1,600 px; overflow is horizontal scroll with fade, not a dropdown | Canvas 3,200 px logical / 3,120 px content; tab overflow is a dropdown menu | M2 shell doc is a historical direction, not current. |
| DR-21 | `docs/ux-shell.md:87-88` | Slash menu `/` is a SHOULD; empty block placeholder “Type something, or press /” | Placeholder exists; no slash menu handler/extension | The placeholder promises a surface that does not exist. |
| DR-22 | `docs/ux-shell.md:102` | Clicking an arrow selects the edge and shows an inline delete/add-label action | Edge click opens the target block menu; trunk click toggles collapse; no edge selection action | Edge interaction is different from the doc. |
| DR-23 | `docs/ux-shell.md:166` | `--text-tertiary` `#7E848C` | `styles.css:33` uses `#8b9199` | Visual token drift; low impact. |
| DR-24 | `docs/reviews/settings-inventory.md` §§2-14 | Frozen values and current exposure | Matches the code on the paths I checked; S3-2 and S3-12 remain open | Inventory is reliable; its “no UI yet” notes are still accurate. |

**Docs that are accurate and usable as-is:** `docs/reviews/settings-inventory.md` (frozen model),
`docs/reviews/settings-freeze-review.md` (closure/status), `docs/design-tokens.md`,
`docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`, `docs/adr/0007` for the
layout/mode axes (not for marker implementation), and the settings sections of `AGENTS.md` that
describe the frozen pipeline.

---

## 9. Open questions, unknowns, and risks

### 9.1 Facts that need a product/design answer (not UNKNOWNs)

| ID | Question | Why it matters | Evidence |
|---|---|---|---|
| Q-01 | Should Page Edit survive a layout switch? | `normalizeInteractionMode` preserves an explicit Page Edit in session, but every layout switch calls `setDocumentLayout`, which forces Read. A user who toggles Edit → Continuous → Page lands in Read. | `S/view-state.ts:77-89`; `R/state/shell.ts:263-276`; `R/actions.ts:373-380` |
| Q-02 | Should View → Zoom/Fit target the active layout? | In Page, the menu/palette change hidden Continuous zoom or no-op; the keyboard is layout-aware. | `R/actions.ts:1300-1311`; `R/App.tsx:343-366`; `R/page/PageView.tsx:822-876` |
| Q-03 | Where does Page Setup live: Settings, Page toolbar, a setup sheet, or both? | There is no surface today; the model is complete. | CH-01; PS-1..6 |
| Q-04 | Is density the only type lever, or is there an Advanced typography disclosure? | The frozen model has 12 advanced numeric type fields plus two hidden scales; the current UI has one slider. | CH-05/CH-06; TY-1..16 |
| Q-05 | Does the rework include manual breaks? | Model exists, cleanup does not; without cleanup a UI can create stale hints. | §7.7; `docs/adr/0008:95-103` |
| Q-06 | Does Continuous get any settings beyond per-document zoom? | `ContinuousSettings` was removed; only view-state zoom exists. | CO-1, CO-14 |
| Q-07 | Is appearance (dark/light/system) in scope? | No `AppSettings` field; Page and print are always light. | AP-1; `styles.css:4442-4454` |
| Q-08 | What are the export defaults (folder, filename, date, metadata, range, tagged PDF)? | All are DES; current export is native dialog + `<title>.pdf`. | EX-5/12/13; PR-4/14/15 |
| Q-09 | Should settings save status be global or only inside Settings? | The store has idle/saving/saved/error; the dialog only shows errors and a transient saved note. | AP-13; `R/state/settings.ts:48-51`; `R/shell/Dialogs.tsx:2140-2147,2262-2266` |
| Q-10 | Override semantics: per-field dots, “Use global” per field/group, dirty close behavior? | The current scope switch can pin an override equal to global (S3-2) and Done can close dirty. | `docs/reviews/settings-freeze-review.md:141-150`; `R/shell/Dialogs.tsx:1945-1946,2174-2177` |
| Q-11 | Should switching Compact/Comfortable warn that it replaces explicit theme values? | `normalizePatch` replaces the theme baseline when `preset` is present; advanced values are lost. | `R/state/settings.ts:136-155` |
| Q-12 | Should invalid margins warn inline, clamp, or fall back? | Code silently returns 12 mm when the content area is under 20 mm per axis. | `docs/reviews/settings-freeze-review.md:227-234`; PS-3..6 |
| Q-13 | Should Help → Keyboard shortcuts open a real shortcuts surface? | It opens Settings, which has no shortcut list. | AP-22; DUP-19; `M/menu.ts:170-177` |
| Q-14 | Should Read mode gate native menu items (New Chapter, Add Block, Export, Close)? | Native menu is static; palette and context menu gate. | DUP-C4; `M/menu.ts:46-56` |
| Q-15 | Should the PDF filename/metadata be date-stamped? | PR-14/15 are DES; spec says `<title> — <date>.pdf`, code uses `<title>.pdf`. | PR-14; `S/export.ts:75-82` |
| Q-16 | Should `fontScale`/`headingScale` be kept hidden, clamped, or removed? | They can render below the 7 pt floor; no UI exposes them. | TY-3/6; freeze review S3-1 |
| Q-17 | Should a per-document override for a read-only document be allowed? | `documentAvailable` accepts any runtime; the note says “editable document”. | `R/shell/Dialogs.tsx:1917-1919,2183-2191` |
| Q-18 | Should the test bridge `window.__noteforestTest` exist in production? | It is installed unconditionally and exposes document/settings mutation for tests. | `R/App.tsx:487-756` |
| Q-19 | Should the library show all warnings or only the first? | Startup shows only `warnings[0]`. | `R/App.tsx:188-190` |
| Q-20 | Should Continue/Continuous get page-break indicators at all? | Code has none; UX/spec/AGENTS claim they exist. | DR-10/DR-19 |

### 9.2 UNKNOWNs (cannot be determined from code alone)

| ID | Unknown | Question to resolve |
|---|---|---|
| UNK-01 | Production packaging of the test bridge | Is `window.__noteforestTest` stripped by the packaging/build step? I found no env guard in `App.tsx`; the built renderer may still expose it. Confirm with the packaging config, not UI code. |
| UNK-02 | VoiceOver reading order of Page sheets | The sheet is `role=document` with absolutely positioned fragments and chrome spans in DOM order. Whether VoiceOver reads header → fragments → footer correctly was not tested here; the product owner owns the VoiceOver pass. |
| UNK-03 | Focus behavior of the native menu with no document | The menu is always enabled; macOS may gray out role items but custom items stay active. Confirm on a packaged build. |
| UNK-04 | Exact behavior when two windows could open | `createMainWindow` is single-window today; macOS “New Window” is absent. Whether a second window is intended is not in code. |
| UNK-05 | Settings write failure in a packaged app | Freeze review says the UI test makes app-support read-only; packaged behavior not re-verified. |
| UNK-06 | Corrupt/newer warning UI tests | Freeze review §7 says the dialog branches are code-read only, not UI-tested. |
| UNK-07 | Page Edit restore after app restart | Session normalization preserves `edit`, so a Page-layout session could restore Page Edit; I did not find a test for it. Confirm intended. |
| UNK-08 | `A5`/`Letter` visual results in Page/PDF | Geometry exists; no product-owner visual check in this map. |
| UNK-09 | Font fallback for Page PDF | Print uses bundled JetBrains Mono and system UI font; exact fallback for missing glyphs is a print-model concern, not mapped here. |
| UNK-10 | Whether the sidebar tree can represent 1,000 blocks acceptably | Performance gate is 300 guaranteed; virtualization is not implemented in the tree. Not measured here. |

### 9.3 Risks

| ID | Risk | Evidence | Severity (my reading) |
|---|---|---|---|
| R-01 | Menu/palette/keyboard parity bugs (zoom/fit) ship into the rework | DUP-C1/C6 | High for Page users |
| R-02 | The thin density dialog is mistaken for the Settings foundation | Freeze review S4; §2.5 | High |
| R-03 | The scope control pins an override equal to global and blocks future global changes | Freeze review S3-2 | High |
| R-04 | Page toolbar overflow when setup/density/export controls are added | `styles.css` `.nf-page-toolbar` comment | Medium |
| R-05 | Docs drive the design toward absent surfaces (Outline, Inspector, markers, Page Setup, export sheet) | §8 | High |
| R-06 | Export warnings/details are truncated; users miss a preflight problem | `R/export/ExportStatusPanel.tsx:153-160,197-207` | Medium |
| R-07 | No content search despite “Search” labels in sidebar/palette | `R/shell/Sidebar.tsx:612-615`; `R/shell/CommandPalette.tsx:118` | Medium |
| R-08 | Read-only/menu gating asymmetry lets mutating commands appear enabled | DUP-C4 | Medium |
| R-09 | Three warning/status visual languages will grow with Settings/Page/Export | GAP-08 | Medium |
| R-10 | Test bridge mutation surface remains in production | `R/App.tsx:487-756` | Medium (local app, but scope creep) |
| R-11 | Manual breaks can become stale with no removal UI | MB-3..6, MB-9 | Medium once exposed |
| R-12 | Page Edit mode resets on layout switch, contradicting persisted view state | Q-01 | Medium |
| R-13 | Settings “saved” is easy to miss; no persistent status | AP-13 | Low/Medium |
| R-14 | `--nf-range` fallback accent and hard-coded Page skin will resist a theme setting | §5.7 | Low |
| R-15 | Placeholder “press /” has no slash menu | DR-21 | Low but user-visible |
| R-16 | Applying density while Page Edit is open is not explicitly serialized with the overlay commit | `R/shell/Dialogs.tsx:1964-1993`; `R/page/PageBlockEditor.tsx:191-200` | Medium |
| R-17 | The native save dialog requests overwrite confirmation and the app also shows a replace panel; a double prompt is possible | `M/index.ts:565-573`; `R/export/ExportStatusPanel.tsx:52-87` | Low/Medium |

---

## 10. What the product owner must decide

This is a decision list, not a recommendation. Each item is either a frozen-inventory open decision
or a contradiction found in this map.

1. **Page setup placement and scope.** Settings-only, Page-toolbar/sheet, or both; and whether the
   toolbar edits the document override directly.
2. **Page defaults.** Confirm A4 landscape and 12 mm (code) versus 20 mm and A4 (spec/UX); confirm
   A5/Letter exposure.
3. **Density presentation.** Slider, named steps, presets, or a combination; keep 60–120/5%.
4. **Typography exposure.** Density-only, a small curated set, or a full Advanced disclosure;
   `fontScale`/`headingScale` stay hidden until fixed.
5. **Override semantics.** No override on scope switch, per-field/group “Use global”, dirty-close
   behavior, and whether a preset switch may replace explicit values.
6. **Manual breaks.** In or out of this rework; entry point; cleanup rules before any UI.
7. **Page chrome.** Header/footer/page-number toggles and chapter-start behavior: now or later
   (needs fields + schema bump).
8. **Export surface.** Keep the floating panel or build an export sheet; defaults for folder,
   filename/date, metadata, tagged PDF, and page range.
9. **Appearance.** Dark-only v1 or light/system; note Page/PDF are always light.
10. **Continuous settings.** Keep per-document zoom only, or add a future global default
    (new field + migration).
11. **Settings scope.** Include appearance, shortcuts, and autosave now, or defer; each new field is
    a schema version bump.
12. **Read-mode/menu parity.** Should native menu items be gated like the palette/context menus?
13. **Help → Keyboard shortcuts.** Build a shortcuts surface or relabel the menu item.
14. **Page Edit persistence.** Should an explicit Page Edit survive a layout switch?
15. **Export/zoom menu behavior.** Should View → Zoom/Fit follow the active layout?
16. **Test bridge.** Confirm whether `window.__noteforestTest` is stripped in packaged builds.

---

## Appendix A. Source index

| Area | Files |
|---|---|
| App shell | `R/App.tsx`, `R/shell/TitleBar.tsx`, `R/shell/Workspace.tsx`, `R/shell/TabBar.tsx`, `R/shell/Sidebar.tsx`, `R/shell/StatusBar.tsx` |
| Menus / commands | `M/menu.ts`, `R/actions.ts`, `R/App.tsx` (keydown), `R/editor/keymap.ts`, `R/shell/ContextMenu.tsx`, `R/shell/CommandPalette.tsx` |
| Dialogs / settings | `R/shell/Dialogs.tsx`, `R/state/settings.ts`, `S/settings-file.ts`, `S/document-settings.ts`, `M/library.ts`, `M/document-settings.ts` |
| Banners / recovery | `R/shell/RecoverySurface.tsx`, `R/shell/SaveFailureBanner.tsx`, `R/shell/StaleLockBanner.tsx`, `R/editor/DocumentEditor.tsx` |
| Continuous | `R/editor/DocumentEditor.tsx`, `R/editor/views/BlockViews.tsx`, `R/editor/views/ImageNodeView.tsx`, `R/editor/SelectionToolbar.tsx`, `R/editor/edges/EdgeLayer.tsx` |
| Page | `R/page/PageView.tsx`, `R/page/PageBlockEditor.tsx`, `R/page/PageEdges.tsx`, `R/page/segments.ts`, `R/page/projection.ts`, `R/page/model.ts`, `R/page/measurement.ts` |
| Settings model | `L/page-settings.ts`, `L/types.ts`, `L/layout.ts`, `L/page-chrome.ts`, `L/edge-style.ts` |
| Export / print | `R/export/export-flow.ts`, `R/export/ExportStatusPanel.tsx`, `R/print/entry.tsx`, `R/print/PrintDocument.tsx`, `R/print/print.css`, `M/export-job.ts`, `M/export-window.ts`, `M/export-preflight.ts`, `M/export-service.ts` |
| Tokens / styles | `R/styles.css`, `R/lib/design-tokens.ts`, `R/lib/apply-design-tokens.ts`, `docs/design-tokens*.md` |
| View state / session | `S/view-state.ts`, `R/state/shell.ts`, `R/state/session.ts`, `S/api.ts` (`SessionState`, `MenuCommand`) |

## Appendix B. Surface-to-command index

| Surface group | Primary commands | Primary controls |
|---|---|---|
| Title bar | CMD-U01..U03 | BTN-01..03 |
| Tab strip | CMD-M01, M06, M07, CMD-C22, CMD-C24 | BTN-04..06, CTL-25 |
| Sidebar | CMD-U04..U13, CMD-C21..C23 | BTN-07..16, CTL-01, CTL-15, CTL-26..29 |
| Status bar | CMD-U14..U20, CMD-K05..K11 | BTN-18..22, CTL-18..21 |
| Command palette | CMD-P01..P32, CMD-U74 | BTN-65, CTL-02 |
| Native menu | CMD-M01..M38 | — |
| Continuous canvas | CMD-E01..E15, CMD-U29..U45, CMD-C01..C20 | BTN-30..43, CTL-30..33, CTL-36 |
| Page | CMD-U21..U28 | BTN-23..29, CTL-22..24 |
| Settings | CMD-U46..U57 | BTN-44..52, CTL-03..06, CTL-37..38 |
| Export | CMD-U58..U61, CMD-M05, CMD-P04, CMD-U24 | BTN-53..56 |
| Recovery / save | CMD-U62..U70 | BTN-57..60 |
| Dialogs | CMD-U72; opened by CMD-C02/C03/C08/C12/C18/C21..C23 | BTN-61..64 |
| Toasts | — | BTN-66 |

---

**End of document.**

