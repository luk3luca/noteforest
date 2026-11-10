# UI shell contents — phase 2, slice 1 (TopBar, Sidebar, StatusStrip)

**Status:** Draft for product-owner review. Contents and behavior, not visual design and not code.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Inputs:** `docs/design/ui-shell-map.md` (structure and decisions D-01…D-13),
`research/ui-surface-map.md` (as-is inventory), `docs/reviews/settings-inventory.md` (frozen
settings), `docs/design-tokens.md`, `docs/design-tokens-page.md`,
`docs/design-tokens-continuous.md`.
**Scope of this slice:** TopBar, Sidebar, StatusStrip. PageToolbar/Canvas, Settings, and Export
follow in the next slices.

> **Shell revision 10 November 2026, after V0:** the product owner revised the shell after using
> the Electron V0 and the browser lab. The target is now a **30 px TitleBar** (traffic lights + app
> name), a **44 px Toolbar in the main column** (tabs start after the Sidebar), a **persistent
> Sidebar column** that collapses to a **48 px rail** (expand + Settings in the rail), rounded
> floating panels with 8 px gaps, and rounded tab chips. The single merged TopBar and the
> hidden + titlebar-reveal sidebar below are superseded. `docs/design/ui-lab` is the visual
> reference; the Electron port is `docs/tasks/v0-shell-visual.md`. Page design remains open.

---

## 0. Conventions

- **One command, one home.** A command may have a shortcut/menu/palette entry, but not two
  unrelated visible buttons with the same effect.
- **Icons:** one set (lucide), 1.5 stroke, 14–16 px in bars, 16–18 px in empty states. Icon-only
  buttons always have a tooltip and an `aria-label`.
- **Labels:** text when the control is primary or ambiguous; icon-only when the meaning is
  unmistakable and space is tight. Shortcuts appear in tooltips/menus, not as permanent noise.
- **States:** default, hover, active, focus-visible, disabled, read-only. Disabled controls keep a
  reason in the tooltip or in the adjacent note.
- **No fake controls:** no static labels that look interactive, no “coming soon” toggles.
- **Responsive thresholds (proposal):** ≥1200 px full labels; 900–1199 icon+text; <900 icon-only
  and overflow; <760 sidebar auto-collapsed; <680 tabs overflow aggressively.

---

## 1. TopBar

### 1.1 Structure

One row, 40–44 px, full width, below the macOS traffic lights. The tab strip is the primary content;
global actions sit at the right. No separate titlebar row.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ● ● ● │ [Doc A ×] [Doc B •] [Doc C !] …  +  │  Continuous Page │ Edit Read │ 100% ▾ │ ⌘K │
└────────────────────────────────────────────────────────────────────────────┘
         └ tab strip (canonical document navigation) ┘  └ view controls ┘  └ palette ┘
```

- **Drag region:** empty TopBar areas. Tabs and buttons are not drag regions.
- **No app name** in the bar: the active tab title is the document identity; the app name is in the
  macOS menu bar.
- **No Settings gear** here. Settings lives in the Sidebar footer (`⌘,`, palette).

### 1.2 Slots

| Slot | Contents | Behavior | States | Responsive |
|---|---|---|---|---|
| **WindowControls** | macOS traffic lights | Native close/minimize/zoom; inset left | Native | Always |
| **TabStrip** | Open documents, active tab, overflow | Activate, close, reorder, overflow; dirty/lock/recovery | Empty, active, inactive, dirty, lock, recovery, missing | Shrinks; overflow menu after a threshold |
| **Tab** | Title, dirty dot, lock/recovery icon, close | Click activates; middle-click closes; `⌘W` closes active; drag reorders | Active, hover, dirty, lock, recovery, missing | Title truncates; min 96 px, max 200 px |
| **TabOverflowMenu** | All tabs, up to N library documents | Select a tab; open a document | — | Appears when tabs overflow |
| **NewTabButton** | `+` icon | New document (`⌘N`) | Enabled; disabled only while a blocking dialog is open | Always visible after tabs |
| **ViewControls** | Layout, mode, zoom/fit (A) or page-contextual (B) | Layout-aware; menu/palette/keyboard target the active layout | Enabled, disabled without document, read-only | Labels → icons → overflow |
| **GlobalActions** | Command palette button (`⌘K`) | Opens the palette | Always enabled | Always visible at far right |

### 1.3 Tabs

- Active tab: elevated surface, title full contrast, close visible.
- Inactive tab: transparent, secondary text, close on hover/focus.
- Dirty dot: small dot before the title; tooltip “Unsaved changes”.
- Lock: read-only document; tooltip reason.
- Recovery/missing: warning icon; tooltip “Recovery”/“Missing”; the tab opens the recovery view.
- Close: `×` on the active/hover tab; `⌘W`; middle-click. If dirty, the existing close dialog
  appears (Save / Don’t Save / Cancel).
- Overflow: chevron/menu listing all open tabs and a few library documents (“Open · title”).
- Keyboard: `role=tablist`, roving tabindex, Arrow/Home/End/Delete, `aria-selected`,
  `aria-controls`; close button is reachable by keyboard (not mouse-only).
- Drag: reorder tabs; no detachable windows in v1.

### 1.4 ViewControls — A/B

**Variant A — TopBar, words (test first).**

| Control | Presentation | Shortcut | Behavior |
|---|---|---|---|
| Layout | Segmented `Continuous | Page` (text; icon+text on narrower) | `⌘2` / `⌘3` | Switches the active document layout; preserves per-layout view state |
| Mode | Segmented `Edit | Read` (text; icon+text) | `⌘E` | Toggles interaction mode for the active layout |
| Zoom | `−  100%  +` + a `▾` menu with Actual / Fit width / Fit page (Page) | `⌘−`, `⌘0`, `⌘+`; `⇧⌘0` fit width | Targets the active layout; menu items not valid for the layout are hidden, not disabled |
| Overflow | `⋯` on narrow widths | — | Layout/mode as icon-only; zoom menu; fit items |

Order: `Layout | Mode | Zoom` with a divider between mode and zoom. On narrow widths the labels
collapse first, then the zoom stepper collapses to the percent button, then the controls move to
the overflow menu.

**Variant B — TopBar, symbols (test second).**

- Same TopBar placement and control order as variant A, but layout/mode are icon-only with
  tooltips/accessible labels; zoom stays a percent button with a menu.
- This tests whether labels are necessary for a first-time user and how much space the TopBar
  saves at 900–1200 px.
- **PageToolbar is only a fallback** if both TopBar variants fail (crowding or discoverability).
  If that happens, PageToolbar takes mode + zoom/fit for Page and Continuous needs a compact
  floating fallback; that is a last resort, not the first test.

**What to measure in the lab:** time to switch layout/mode, whether users find zoom/fit, TopBar
crowding at 900/1000/1200 px, and whether the icon-only variant loses meaning without labels.

### 1.5 TopBar states

| State | TopBar behavior |
|---|---|
| No document | Tabs empty; `+` enabled; ViewControls disabled; palette enabled; tooltip “Open a document to change the view” |
| Document open | Full controls; layout/mode active |
| Read | Mode shows Read; mutating document commands disabled with reason; export still allowed |
| Page Edit | Mode shows Edit; PageToolbar visible (see next slice) |
| Recovery | Tab warning; ViewControls disabled; recovery content in the canvas |
| Export running | No TopBar change; progress lives in the Export sheet/StatusStrip |
| Narrow | Labels collapse to icons; overflow menu; tabs shrink |

### 1.6 TopBar accessibility

- Tabs: `tablist`/`tab`/`tabpanel` relationships, roving tabindex, close button labelled.
- ViewControls: toolbar group labels (“Layout”, “Interaction mode”, “Zoom”); `aria-pressed` on
  segments; current zoom in the button label; menu items with shortcuts.
- Palette button: `aria-label="Command palette"`, `aria-keyshortcuts="Meta+K"`.
- Focus order: traffic lights (native) → tabs → new → layout → mode → zoom → palette.

---

## 2. Sidebar

### 2.1 Structure

Left panel, default 264 px (range 208–360), full height below TopBar. Resizable, collapsible.
The sidebar is content: library and topics stay; only chrome changes.

```text
┌──────────────────────────────┐
│ [ Search…        ⌘K ] [＋] [‹]│  header
├──────────────────────────────┤
│ DOCUMENTS                    │
│ [ Filter documents… ]        │
│  ▸ Note A                    │
│  ▸ Note B  ! recovery        │
│  …                           │
├──────────────────────────────┤
│ TOPICS                       │
│  ▾ Chapter 1                 │
│    • Block title             │
│      ↳ “anchor quote”        │
│  ▸ Chapter 2                 │
├──────────────────────────────┤
│ [⚙ Settings]                 │  footer
└──────────────────────────────┘
```

### 2.2 Header

| Control | Presentation | Behavior | States |
|---|---|---|---|
| **Search** | Button with search icon + “Search” + `⌘K` hint | Opens the command palette (commands, documents, blocks) | Enabled always; tooltip clarifies it is not content search yet |
| **New note** | `+` icon + “New” label (icon-only on narrow) | Creates a new document (`⌘N`); same command as the TopBar `+` | Enabled; disabled only while a blocking dialog is open |
| **SidebarToggle** | Chevron-left, 24 px | Collapses/expands; `⌘\`; persists | Expanded/collapsed; `aria-expanded`, `aria-controls` |

**New note (accepted 10 Nov):** both the TopBar `+` and the sidebar New note are visible. They are
the same command, with the same label, tooltip, and shortcut; the empty state, menu, and palette
remain contextual/shortcut entries. This is a deliberate exception for a frequent action, not two
different commands.

### 2.3 LibraryPanel

| Element | Contents | Behavior |
|---|---|---|
| Section header | “Documents” | Static; optional count only if it stays quiet |
| Filter | Input “Filter documents…” | Local filter by title; no content search; clear button |
| DocumentRow | Icon/status dot, title, recovery/missing label, open indicator | Click opens; row menu; keyboard focus |
| Row menu | Open, Open recovery, Reveal in Finder, Rename (only when openable) | Context menu; Rename opens the document first |
| Empty state | “No documents yet.” + New note action | Contextual empty-state action; not a permanent duplicate |
| No matches | “No matching documents.” | Clear filter action |

- Row height 28–32 px; title truncates; the active document is marked with a subtle indicator, not
  a full accent bar.
- Recovery/missing rows are navigable; open the recovery view.
- Read-only rows still open; rename is disabled with a reason.
- No fake “search all content” promise.

### 2.4 TopicsPanel

| Element | Contents | Behavior |
|---|---|---|
| Section header | “Topics” | Static |
| ChapterRow | Chevron, title, block count | Collapse/expand; double-click/F2 rename; context menu |
| BlockRow | Title, anchor/child counts, warning badge, “Shared · N” chip | Select; focus in canvas; context menu; collapse children |
| AnchorRow | `↳ “quote”`, anchor kind, warning | Focus the source anchor; context menu |
| Empty state | “No chapters yet.” | “Add chapter” action (contextual; not a fake control) |

- Tree roles (`tree`/`treeitem`), single selection, `aria-label="Document topics"`.
- Read mode: rows remain navigable; mutating actions disabled with a reason.
- Context menus: chapter (Rename, Add block), block (the full block menu), anchor (select/repair).
- Manual breaks and stale-hint indicators may land here later; not in this slice.

### 2.5 Footer

| Control | Presentation | Behavior |
|---|---|---|
| **Settings** | Gear icon, 24 px, `aria-label="Settings"` | Opens Settings (`⌘,`); the only visible Settings entry |

- Remove the static “Graphite” label. Appearance, when it exists, lives inside Settings.
- No app version or “Help” here; Data & About owns that.

### 2.6 Collapse, expand, resize

- **Expanded:** toggle in the header; width default 264, range 208–360; double-click the resizer
  resets to 264. If the lab shows long topic rows are cramped, test 272 before changing the
  default.
- **Collapsed (accepted 10 Nov): hidden + reveal.** The sidebar disappears; a `SidebarReveal`
  button appears at the left of the TopBar/canvas; `⌘\` toggles. No icon rail, so there is no
  second icon vocabulary.
- Collapsed state and width persist in the session; narrow windows (<760 px) auto-collapse but do
  not overwrite the user's preference.
- Focus order: TopBar → Sidebar header → Library → Topics → Footer → Canvas.

### 2.7 Sidebar states

| State | Behavior |
|---|---|
| No document | Library shows documents; Topics shows an empty state; Settings available |
| Document open | Library active row; Topics populated |
| Read-only | Rows navigable; rename/add/delete disabled with reason |
| Recovery | The recovery tab is selected; library rows still available |
| Narrow | Auto-collapsed; reveal control visible |
| Filter no match | “No matching documents.” + clear action |

### 2.8 Sidebar accessibility

- `<aside aria-label="Sidebar">`; toggle `aria-expanded`/`aria-controls`; resizer is a separator.
- Tree/tab semantics; rows are real buttons/tree items, not divs.
- Context menus open from keyboard (`Shift+F10`/context menu key) and restore focus.
- Truncated titles keep a `title`/tooltip.

---

## 3. StatusStrip

### 3.1 Structure

Thin bar, 22–24 px, bottom, full width. **Status only: no navigation buttons, no second toolbar.**
It is slot-based so it can grow.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ● Saved   │  1,204 words · 86 blocks                    │  ⚠ 2 anchors      │
└────────────────────────────────────────────────────────────────────────────┘
  save state        counts (center/left)                     anchor health (right)
```

### 3.2 Items

| Slot | Contents | Behavior | Priority |
|---|---|---|---|
| **SaveState** | Dot + “Saved” / “Saving…” / “Unsaved changes” / “Save failed” / “Read-only” | Read-only status; error tooltip includes the message; the save-failure banner owns Retry | P0 |
| **WordCount** | “N words” | Static | P1 |
| **BlockCount** | “N blocks” | Static | P1 |
| **AnchorHealth** | “⚠ N anchors need repair” (only when >0) | Button opens Anchor Health; full `aria-label` | P0 when present |
| **Future slots** | sync, export progress, page count, etc. | Define when the feature exists; no placeholders | P2 |

- Page navigation (`Page N of M`) stays in the PageToolbar, not here.
- Zoom/layout/mode stay in ViewControls, not here.
- No clickable layout/mode/zoom controls.

### 3.3 States and overflow

| State | Behavior |
|---|---|
| No document | “No document open” muted; no counts; Settings still available |
| Recovery | “Recovery · <status>” muted; no counts |
| Read-only | “Read-only” in the save slot; tooltip reason |
| Saving/saved/error | Dot + label; `aria-live=polite` on the save slot |
| Too many items | Drop P2 first, then P1; P0 always visible; optional “Details” popover only if needed |

### 3.4 Accessibility

- `role=status`, `aria-live=polite`, `aria-atomic` for save state.
- Anchor health is a real button with a full label; counts are text.
- Contrast: muted text still meets contrast; the dot is not the only signal.

---

## 4. Cross-cutting: labels and shortcuts in this slice

| Command | Visible entry | Shortcut | Notes |
|---|---|---|---|
| New note | TopBar `+`; sidebar New note; empty state; menu/palette | `⌘N` | Two visible entries, same command |
| Open document | Empty state; menu/palette | `⌘O` | No permanent sidebar button |
| Command palette | TopBar `⌘K`; sidebar Search | `⌘K` | Palette searches commands/documents/blocks; not content |
| Settings | Sidebar footer gear | `⌘,` | One visible entry |
| Toggle sidebar | Sidebar header toggle | `⌘\` | Reveal control when collapsed |
| Layout | ViewControls | `⌘2` / `⌘3` | Targets the active document |
| Mode | ViewControls | `⌘E` | Edit/Read for the active layout |
| Zoom | ViewControls | `⌘−`, `⌘0`, `⌘+`, `⇧⌘0` | Targets the active layout |
| Close tab | Tab × | `⌘W` | Dirty-close dialog |

The full keyboard table is reconciled in the overlays/behavior slice; this table is the shell
contract for the controls in this slice.

---

## 5. Open choices in this slice

| ID | Choice | Options | Proposal | Status 10 Nov |
|---|---|---|---|---|
| S1-01 | New note entry | TopBar `+` only; sidebar “New note” only; both | Both visible, same command/label/shortcut; empty state contextual | **Accepted: both** |
| S1-02 | Sidebar collapsed | Hidden + reveal; 48 px icon rail | Hidden + reveal | **Accepted** |
| S1-03 | Sidebar width | 264 default (current); 240; 280 | 264, range 208–360; test 272 if cramped | **Accepted** |
| S1-04 | Search semantics | Palette only; sidebar filter only; both | Sidebar Search opens palette; library filter stays local | **Open: evaluate in lab** |
| S1-05 | Tab close affordance | Active/hover only; always visible | Active + hover/focus; keyboard reachable | **Open; default proposal** |
| S1-06 | ViewControls A/B | TopBar vs PageToolbar + continuous fallback | TopBar words first; TopBar symbols second; PageToolbar only fallback | **Accepted test order** |
| S1-07 | StatusStrip contents | Save + counts + anchor health; add page count; add export progress | Save/counts/anchor health; page count stays in PageToolbar | **Accepted** |
| S1-08 | Section labels | “Documents” / “Topics” vs “Library” / “Outline” | “Documents” / “Topics” (product language) | **Accepted** |
| S1-09 | Palette wording | “Search” vs “Search or run a command” | “Search or run a command” placeholder; “Search” label is acceptable if tooltip clarifies | **Open** |
| S1-10 | New document copy | “New note” vs “New document” | “New note” in the app UI; keep “Document” for file/library concepts; align the native menu later | **Accepted** |

---

## 6. Next slices

1. **PageToolbar + Canvas** — done in `docs/design/ui-page-contents.md` (page nav, Setup, Density,
   Export, PageStage/PageSheet frame, Page Edit, placeholders, banners).
2. **Settings** — done in `docs/design/ui-settings-contents.md` (modal frame, Appearance, Page,
   Continuous, Editor, Export, Data & About, scope, save model, states).
3. **Export sheet** — done in `docs/design/ui-export-contents.md` (configure, overwrite, progress,
   result, errors, warnings).
4. **Overlays and keyboard** — done in `docs/design/ui-overlays-keyboard.md` (palette, dialogs,
   context menus, toasts, shortcut table, responsive rules, state matrix).
5. **A/B lab:** ViewControls variants (TopBar words vs symbols), sidebar collapse, Page Setup entry.
