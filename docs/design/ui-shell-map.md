# UI shell map — target structure (draft for product-owner review)

**Status:** Draft. This is a screen/component map, not a visual design and not code.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Inputs:** `research/ui-surface-map.md` (as-is inventory), `docs/reviews/settings-inventory.md`
(frozen settings model), `docs/design-tokens.md`, `docs/design-tokens-page.md`,
`docs/design-tokens-continuous.md`, `AGENTS.md`.
**Scope:** the desktop shell. The Page sheet's internal layout and the PDF output are not
redesigned here; only the frame around the Page changes.

---

## 0. How to read this map

**Must stay as content** (product owner, 10 November 2026): the **Sidebar**, the **TabStrip**
(row of open documents), and the **Canvas** (Continuous and Page).

**Chrome** is everything around that content: the title row, the status row, the Page toolbar,
the Settings surface, the export surface, dialogs, menus. “Chrome is sacrificable” means we may
merge, remove, move, or redesign it; it does **not** mean it will be deleted. The must-keep list
is about content, not about the current bars.

**Page/PDF boundary:** the Page sheet is the paper and its content; its geometry and typography
come from `PageTheme` + the paginator and must stay print-accurate. This map redesigns the frame
around the sheet (toolbar, background, navigation), not the sheet's internal layout. A later
PageTheme/PDF change is a separate decision, not part of the shell rework.

**Names** below are target names. “Current” maps them to the as-is inventory in
`research/ui-surface-map.md` (SH/CN/PG/ST/EX/DC/DL/PR ids).

---

## 1. Principles

1. **Three regions + overlays.** Workspace = TopBar + Sidebar + Canvas. Everything else is an
   overlay (Settings, Export, Palette, Dialogs, Toasts) or a contextual bar (PageToolbar).
2. **One command, one canonical home.** Other appearances are shortcuts. Duplicate entry points
   are removed, not restyled.
3. **Place by scope.** Global app settings → Settings; per-document Page settings → Page context
   with an explicit “This document” scope; view state (zoom, fit, current page) → view controls,
   not Settings; engine/print constants → never exposed.
4. **Contextual proximity.** Page setup, density, breaks, and export live near the Page;
   appearance, data, and recovery live in Settings.
5. **Progressive disclosure.** First-class, advanced, hidden. No settings dump.
6. **States first.** No document, read-only, dirty, corrupt, save error, export phases are part
   of the structure, not an afterthought.
7. **Anti-slop is a guideline, not a law.** Avoid the classic AI patterns: accent-left cards used
   as generic containers, rounded colored status pills, decoration without function, fake
   controls, duplicated entries, mixed component vocabularies. Use a dot, a tag, or a thin rule
   when it encodes a real state; keep one component vocabulary. The rule is consistency and
   function, not prohibition.

---

## 2. Screen inventory

| ID | Screen | Type | Position | Contents | States |
|---|---|---|---|---|---|
| SC-01 | **Workspace** | Primary window | Full window | TopBar, Sidebar, Canvas, optional StatusStrip, overlays | No document, document open, recovery, read-only, save failure, Page Edit, export running |
| SC-02 | **Settings** | Overlay (dialog or window) | Centered / separate | SettingsNav, SettingsPane, optional PreviewPane, SettingsActions | No document, dirty, saving/saved/error, corrupt/unreadable/newer, per-document override, read-only |
| SC-03 | **Export** | Overlay (sheet) | Right/center over Workspace | ExportOptions, ExportProgress, ExportResult, actions | Configuring, running, cancelling, overwrite confirm, done, failed |
| SC-04 | **Recovery** | Tab view | Inside Workspace canvas | Status, details, backups, restore, retry, reveal, close | Corrupt, missing, newer, unreadable, restore success/failure |
| SC-05 | **Page Edit** | Mode/overlay | Inside PageSheet | PageBlockEditor overlay | Editing, spanning block, commit error, saving |
| SC-06 | **Empty workspace** | State | Canvas | App name, New note, Open document, hints | No tabs |
| SC-07 | **Print** | Hidden surface | Hidden BrowserWindow | PrintDocument | Not user-interactive; not redesigned |

**Overlays** (not screens): CommandPalette, DialogHost, ContextMenuHost, ToastStack.

---

## 3. Component tree

```text
AppShell
├─ TopBar
│  ├─ WindowControls          (macOS traffic lights; drag region)
│  ├─ TabStrip
│  │  ├─ Tab                  (title, dirty dot, lock, recovery, close)
│  │  └─ TabOverflowMenu
│  ├─ NewTabButton
│  ├─ ViewControls            (layout Continuous/Page; mode Edit/Read; zoom/fit)
│  └─ GlobalActions           (CommandPaletteButton; no Settings gear)
├─ WorkspaceBody
│  ├─ Sidebar                 (collapsible, resizable)
│  │  ├─ SidebarHeader        (Search, NewNote, SidebarToggle)
│  │  ├─ LibraryPanel         (filter, DocumentRow, row menu)
│  │  ├─ TopicsPanel          (ChapterRow, BlockRow, AnchorRow)
│  │  └─ SidebarFooter        (SettingsButton; single entry)
│  ├─ SidebarResizer
│  └─ Canvas
│     ├─ CanvasBanners        (read-only, save failure, repair)
│     ├─ ContinuousCanvas     (ChapterCard, BlockCard, EdgeLayer, SelectionToolbar, CanvasFooter)
│     ├─ PageCanvas
│     │  ├─ PageToolbar       (PageNav, SetupButton, DensityButton, ExportButton)
│     │  ├─ PageStage
│     │  │  ├─ PageSheet      (PageChrome, PageFragments, PageEdges)
│     │  │  └─ PageEditOverlay
│     │  └─ PagePlaceholder   (loading/error/empty)
│     └─ CanvasFooter         (Continuous only: Add chapter)
├─ StatusStrip                (optional/minimal: SaveState, WordCount, BlockCount, AnchorHealth)
└─ OverlayHost
   ├─ SettingsDialog          (SettingsNav, SettingsPane, PreviewPane, SettingsActions)
   ├─ ExportSheet             (ExportOptions, ExportProgress, ExportResult)
   ├─ CommandPalette
   ├─ DialogHost
   ├─ ContextMenuHost
   └─ ToastStack
```

### 3.1 Region table

| Name | Type | Position | Parent | Main children | Status | Behavior |
|---|---|---|---|---|---|---|
| **AppShell** | Root layout | Full window | — | TopBar, WorkspaceBody, StatusStrip, OverlayHost | Exists (rename from app root) | Single window; dark shell; focus order top → sidebar → canvas |
| **TopBar** | Bar, 40–44 px | Top, full width | AppShell | WindowControls, TabStrip, NewTabButton, ViewControls, GlobalActions | **Merge** TitleBar + TabBar (proposal) | Window drag region; tabs; view controls; palette |
| **WindowControls** | Native chrome | Top-left | TopBar | Traffic lights | Exists (native) | macOS close/minimize/zoom; leave inset |
| **TabStrip** | Bar | Top, after traffic lights | TopBar | Tab, TabOverflowMenu | Move from TabBar | Reorder, overflow, keyboard arrows/Home/End/Delete |
| **Tab** | Tab item | In TabStrip | TabStrip | Title, dirty dot, lock, recovery, close | Exists | Activate, close, middle-click, dirty/lock/recovery states |
| **NewTabButton** | Icon button | TopBar, after tabs | TopBar | — | Exists (new note) | Create/open document; `⌘N` |
| **ViewControls** | Segmented controls | TopBar, right of tabs | TopBar | Layout, Mode, Zoom/Fit | **Add** (consolidates StatusBar + PageToolbar) | Layout-aware; keyboard/menu parity; collapses to overflow on narrow |
| **GlobalActions** | Icon buttons | TopBar, far right | TopBar | CommandPaletteButton | Exists | `⌘K`; no Settings gear here |
| **Sidebar** | Panel, 240–280 px | Left, full height below TopBar | WorkspaceBody | SidebarHeader, LibraryPanel, TopicsPanel, SidebarFooter | Exists | Collapse/expand, resize, persist; narrow auto-collapse |
| **SidebarHeader** | Row | Top of Sidebar | Sidebar | Search, NewNote, SidebarToggle | Exists + **add toggle** | Search opens palette; new note; toggle `⌘\` |
| **LibraryPanel** | Scroll section | Sidebar | Sidebar | Filter, DocumentRow | Exists | Filter, open, row menu, recovery label |
| **TopicsPanel** | Scroll section | Sidebar | Sidebar | ChapterRow, BlockRow, AnchorRow | Exists | Tree selection, rename, collapse, context menu |
| **SidebarFooter** | Row | Bottom of Sidebar | Sidebar | SettingsButton | Exists | **Single Settings entry**; `⌘,`; remove fake “Graphite” label |
| **SidebarResizer** | Separator | Right edge of Sidebar | WorkspaceBody | — | Exists | Drag 208–360; double-click reset |
| **Canvas** | Main region | Center | WorkspaceBody | ContinuousCanvas or PageCanvas | Exists | Layout switch; focus; banners |
| **ContinuousCanvas** | Canvas mode | Center | Canvas | Chapters, blocks, edges, selection toolbar, footer | Exists | Edit/Read; zoom/fit; focus branch |
| **PageCanvas** | Canvas mode | Center | Canvas | PageToolbar, PageStage, PagePlaceholder | Exists | Page Read/Edit; page nav; setup/density/export |
| **PageToolbar** | Contextual bar, 36–40 px | Top of PageCanvas | PageCanvas | PageNav, SetupButton, DensityButton, ExportButton | Exists + **add setup/density** | Page-specific only; no duplicate layout/mode/zoom |
| **PageStage** | Scroll/zoom container | Center | PageCanvas | PageSheet, PageEditOverlay | Exists | Page zoom/fit; one page at a time |
| **PageSheet** | Paper sheet | Center | PageStage | PageChrome, PageFragments, PageEdges | Exists | **Exact** geometry/typography; frame only is redesigned |
| **PageEditOverlay** | In-sheet editor | Over PageSheet | PageStage | PageBlockEditor | Exists | Edit one block; commit/cancel; error keeps text |
| **StatusStrip** | Thin bar, 22–24 px | Bottom, full width | AppShell | SaveState, WordCount, BlockCount, AnchorHealth | **Reshape or remove** (proposal) | Status only, no second toolbar; optional |
| **SettingsDialog** | Overlay, ~760×560 | Centered | OverlayHost | SettingsNav, SettingsPane, PreviewPane, SettingsActions | **Replace** the 480 px density-only dialog | Pages; scope; apply/cancel; warnings; no document |
| **ExportSheet** | Overlay | Right/center | OverlayHost | ExportOptions, ExportProgress, ExportResult | **Replace** floating panel | Configure, run, cancel, result, reveal |
| **CommandPalette** | Modal overlay | Center top | OverlayHost | Search, groups, hints | Exists | `⌘K`; commands/documents/blocks; no duplicates |
| **DialogHost** | Overlay host | Center | OverlayHost | Shared dialogs | Exists | Rename, link, math, delete, detach, reload, overwrite, alt |
| **ContextMenuHost** | Portal overlay | At pointer | OverlayHost | Menu entries | Exists | Block/chapter/image/reference/tab/library menus |
| **ToastStack** | Transient | Bottom-right | OverlayHost | Toast | Exists | Success/info/warning/error; dedupe |

### 3.2 Primitive vocabulary

Use one set of primitives across the shell and Settings:

| Primitive | Use |
|---|---|
| `Button` / `IconButton` | One visual hierarchy: primary, secondary, ghost, danger. No ad-hoc button classes. |
| `SegmentedControl` | Layout, mode, scope, size/orientation, presets. |
| `Field` / `NumberField` | Label + value + unit + help; mm, pt, px. |
| `Slider` | Density, zoom (where a slider is better than stepper). |
| `Switch` | Binary settings. |
| `Select` | Larger option sets (font, size). |
| `Section` / `Row` | Settings grouping; label, control, help, override indicator. |
| `Disclosure` | Advanced groups. |
| `PreviewPane` | Page sheet preview in Settings and Page setup. |
| `Banner` / `Badge` / `Tooltip` | State and help, used sparingly; no colored pills for decoration. |
| `EmptyState` | No document, no results, empty page. |

---

## 4. Layout diagrams

### 4.1 Workspace

```text
┌──────────────────────────────────────────────────────────────┐
│ TopBar: ● ● ● │ tabs … │ + │ Continuous Page │ Edit Read │ ⌘K │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ PageToolbar (Page only)                      │
│  Search  New  ├──────────────────────────────────────────────┤
│  Library      │ Canvas                                       │
│  Topics       │   Continuous: chapters/blocks/edges          │
│               │   Page: PageStage → PageSheet                │
│  ⚙ Settings   │                                              │
├───────────────┴──────────────────────────────────────────────┤
│ StatusStrip (optional, minimal: Saved · 1,204 words · ⚠ 2)   │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Page mode

```text
TopBar (window, tabs, layout/mode, zoom/fit, palette)
Sidebar │ PageToolbar: ‹ Page 3 of 12 › │ Setup │ Density │ Export
        │ PageStage: centered A4/A5/Letter sheet
        │ PageSheet: header, fragments, edges, footer
StatusStrip (optional)
```

### 4.3 Settings

```text
┌─────────────────────────────────────────────────────┐
│ Settings                                            │
├──────────────┬──────────────────────────────────────┤
│ General      │ SettingsPane                         │
│ Page         │  section title                       │
│ Continuous   │  rows / controls / help              │
│ Editor       │  advanced disclosure                 │
│ Export       │  preview (Page only)                 │
│ Data & About │                                      │
│              │  Apply / Cancel / Reset              │
└──────────────┴──────────────────────────────────────┘
```

---

## 5. Settings IA

The Settings surface has pages, one per area of effect. The left nav is stable; the content pane
scrolls. The **global vs this document** scope is a control inside Page, not a top-level page.

| Page | Purpose | Contents (target) | Model status |
|---|---|---|---|
| **General** | App-level defaults | Appearance (dark/light/system), language if added, default layout/mode if added, autosave info | Mostly **DES**; no fields today except data paths |
| **Page** | Page lens | Page Setup (size, orientation, margins, preview); Typography (preset, density, advanced sizes); Layout (card width, indents/gaps); Manual Breaks | Frozen fields exist; UI absent |
| **Continuous** | Continuous view | Zoom/fit per document; future canvas/type settings | **No settings namespace in v1**; only per-document view state. Do not invent fields. |
| **Editor** | Editing behavior | Shortcuts, single-key shortcuts, autosave interval | **DES**; no fields today |
| **Export** | Export defaults | Folder, filename/date, metadata, tagged PDF, page range | **DES**; no fields today |
| **Data & About** | Data and recovery | Library path, app-support path, settings file status, backup/reset, document-settings map recovery, version | Paths exist; recovery for the map is **DES** |

**Page scope model:** `Global default | This document`. Per-field override indicators; “Use
global” per field/group; no override created by switching scope alone; explicit Apply/Cancel or a
visible save status (open decision). Read-only documents cannot create a document override.

**Frozen-model caveat:** `AppSettings` is `{ page }`. There is no `ContinuousSettings`. A
“Continuous” page may show view-state controls (zoom/fit per document) and future notes, but a
persisted Continuous settings namespace requires a product decision and a `settingsVersion` bump.

---

## 6. Behaviors

### 6.1 Sidebar

- **Collapse/expand:** `SidebarToggle` in the header, `⌘\`, and a reveal control when collapsed.
  Collapsed state and width persist in the session; narrow windows auto-collapse.
- **Resize:** right-edge separator, 208–360 px, double-click resets to 264.
- **Focus:** toggle and rows are real buttons/tree items; focus order TopBar → Sidebar → Canvas.
- **Single Settings entry:** gear in the footer only. The titlebar gear is removed. The static
  “Graphite” label is removed or becomes a real appearance entry inside Settings.

### 6.2 TopBar and tabs

- **Window drag:** the empty TopBar area is a drag region; traffic lights stay inset.
- **Tabs:** activate, close, middle-click, reorder, overflow menu; dirty dot, lock, recovery.
- **ViewControls:** layout (Continuous/Page), mode (Edit/Read), zoom/fit; layout-aware; menu,
  palette, and keyboard target the active layout. Collapses to an overflow menu on narrow widths.
- **GlobalActions:** command palette only; no second Settings gear.

### 6.3 Canvas and Page

- **Layout/mode:** one control in TopBar; no duplicate in StatusStrip or PageToolbar.
- **PageToolbar:** previous/next, “Page N of M”, Setup, Density, Export. Page-specific only.
- **PageStage:** page zoom/fit, one page at a time; Page Edit overlay on the sheet.
- **Continuous:** chapters/blocks/edges, selection toolbar, focus branch, add chapter.
- **Read gating:** all mutating controls (sidebar, palette, menu, context menus, Page problems)
  disabled in Read/Page Read with a visible reason.

### 6.4 Settings

- **Entry:** sidebar footer gear, `⌘,`, palette. One canonical visible entry.
- **Navigation:** left nav pages; content pane; optional preview pane for Page.
- **Scope:** global/document; per-field override; use global; reset; dirty/apply/cancel.
- **States:** no document (document scope disabled with reason), read-only, corrupt/unreadable/
  newer settings, save failure/retry, invalid margins, Page Edit open.
- **Save:** no false “saved”; visible saving/saved/error; retry; quit flush.

### 6.5 Export

- **Entry:** File menu, `⌘⇧E`, palette, PageToolbar. All call one flow.
- **Sheet:** destination/filename/date/metadata/range (DES), progress, cancel, overwrite, result,
  warnings, reveal.
- **No document:** disabled with a reason; read-only documents may export.

### 6.6 Overlays

- **Command palette:** `⌘K`; commands, documents, blocks; no duplicate labels.
- **Dialogs:** one shared frame; destructive actions explicit; Escape cancels; focus restored.
- **Context menus:** one menu component; Read-mode entries disabled.
- **Toasts:** success/info/warning/error; dedupe; no action buttons unless necessary.

### 6.7 Keyboard and accessibility

- One shortcut table shared by menu, palette, and visible hints.
- Focus visible; icon-only buttons have labels; tree/tab roles; overlays trap focus and restore it.
- Reduced motion respected; state changes do not shift the layout.

---

## 7. Current → target mapping

| Current (Scout id) | Target | Action |
|---|---|---|
| SH-01 App window | AppShell | Keep, rename |
| SH-02 TitleBar | TopBar (window controls + drag) | **Merge** (proposal) |
| SH-03 Tab strip | TopBar.TabStrip | **Move** |
| SH-04 Tab overflow | TopBar.TabOverflowMenu | Keep |
| SH-05 Sidebar | Sidebar | Keep |
| SH-06 Sidebar header | SidebarHeader | Keep; add toggle |
| SH-07 Library | LibraryPanel | Keep |
| SH-08 Library row menu | ContextMenuHost | Keep |
| SH-09 Topics | TopicsPanel | Keep |
| SH-10 Chapter/block menus | ContextMenuHost | Keep |
| SH-11 Sidebar footer | SidebarFooter | Keep; **single** Settings entry |
| SH-12 Splitter | SidebarResizer | Keep |
| SH-13 Empty state | EmptyWorkspace | Keep |
| SH-14 Status bar | StatusStrip + TopBar.ViewControls | **Reshape/split**; no second toolbar |
| SH-15 Command palette | CommandPalette | Keep, restyle |
| SH-16 Native menu | NativeMenu | Keep; gate items |
| SH-18 Renderer context menu | ContextMenuHost | Keep |
| SH-21 Toast stack | ToastStack | Keep |
| SH-22 Export panel | ExportSheet | **Replace** |
| SH-23 Settings dialog | SettingsDialog + SettingsNav/SettingsPane | **Replace** |
| SH-24 Recovery | RecoveryView | Keep, restyle |
| CN-01…14 | ContinuousCanvas | Keep; restyle shell, keep layout/edges |
| PG-01…10 | PageCanvas/PageToolbar/PageStage/PageSheet/PageEditOverlay | Keep; add setup/density; dedupe |
| ST-01…06 | SettingsDialog pages | **Rebuild IA** |
| EX-01…06 | ExportSheet | **Rebuild surface** |
| DC-01…11 | RecoveryView / DialogHost | Keep |
| DL-01…11 | DialogHost | Keep |
| PR-01…03 | PrintDocument | Keep exact; out of scope |

---

## 8. Open decisions for the product owner

| ID | Decision | Options | Current proposal |
|---|---|---|---|
| D-01 | TopBar | Merge titlebar + tab strip, or keep two rows | Merge; traffic lights in the tab row |
| D-02 | StatusStrip | Keep minimal, or remove | Keep a thin status line; no buttons except anchor health |
| D-03 | ViewControls placement | TopBar, PageToolbar, or split | TopBar, layout-aware; PageToolbar page-specific only |
| D-04 | PageToolbar contents | Zoom here or in TopBar; setup sheet vs popover | PageToolbar: nav, setup, density, export; zoom in TopBar |
| D-05 | Settings surface | Large modal, separate window, or modeless panel | Large modal with left nav; separate window is possible |
| D-06 | Settings save model | Instant save + status, or Apply/Cancel | Decide in Settings IA; no mixed model |
| D-07 | Continuous page | View-state only, or new settings fields | View-state only; no schema change in this rework |
| D-08 | Page Setup placement | Settings only, Page sheet, or both | Both: global default in Settings, document override in Page sheet |
| D-09 | Export surface | Sheet with options, or keep panel | Sheet; defaults in Settings > Export |
| D-10 | Sidebar collapsed | Icon rail or fully hidden | Rail with reveal; width/collapsed persisted |
| D-11 | Appearance | General page, separate page, or defer | General; dark-only until a field exists |
| D-12 | Settings pages with no fields | Show as future/disabled, or hide | Hide until fields exist, except a short “future” note |

---

## 9. Next step

Phase 2 (after this map is agreed): define the **contents of each bar and pane per screen** —
TopBar actions, Sidebar header/footer, PageToolbar controls, Settings pages/rows, Export sheet
fields — then resolve the settings placement matrix (`research/ui-surface-map.md` §7.17,
CH-01…CH-16). No mockups or product code until those choices are made.
