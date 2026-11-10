# UI contents — phase 2, slice 2 (PageToolbar, Page canvas, Page Edit)

**Status:** Draft for product-owner review. Contents and behavior, not visual design and not code.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Inputs:** `docs/design/ui-shell-map.md` (structure, D-01…D-13),
`docs/design/ui-shell-contents.md` (slice 1), `research/ui-surface-map.md` (as-is Page inventory),
`docs/reviews/settings-inventory.md` (frozen Page settings), `docs/design-tokens-page.md`.
**Scope:** the Page chrome and canvas frame. The Page sheet's internal layout, typography, edge
routing, and PDF output are **not** redesigned; only the frame, toolbar, popovers, and states
around the sheet change.

---

## 0. Conventions

- **One command, one home.** Layout/mode/zoom live in TopBar `ViewControls` (slice 1). PageToolbar
  owns page-specific actions only: page navigation, setup, density, export.
- **No duplicate zoom:** Page zoom/fit is the TopBar zoom control targeting the Page layout. It is
  not repeated in PageToolbar or StatusStrip.
- **No fake controls:** no disabled “coming soon” rows. Future fields are documented, not shown.
- **States:** loading, ready, updating, error, empty, defect, Page Edit, read-only, narrow.
- **Page/PDF boundary:** the sheet remains exact. Page setup/density changes re-paginate and must
  keep Page Read/Edit/PDF on one effective theme.

---

## 1. PageToolbar

### 1.1 Structure

A single contextual bar, 36–40 px, directly above the PageStage, visible only in Page. Dark shell
surface, 1 px bottom divider; no floating card, no second row.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  ‹   Page 3 of 12   ›        │        Setup   Density 85%   Export          │
└──────────────────────────────────────────────────────────────────────────────┘
   page navigation (left)                 page actions (right)
```

- Left: page navigation group.
- Right: Setup, Density, Export.
- Spacer between the groups; no center alignment of controls.
- The toolbar is not a document toolbar: layout/mode/zoom are in TopBar.

### 1.2 Slots

| Slot | Presentation | Behavior | States |
|---|---|---|---|
| **PageNav** | `‹` `Page N of M` `›` | Previous/next; disabled at first/last; `PageUp`/`PageDown` when PageStage is focused | Ready, loading, updating |
| **PageIndicator** | “Page N of M”; compact “N/M” on narrow | Reflects the current page; announces changes politely | Ready, updating, error |
| **Setup** | Icon + “Setup” (icon-only on narrow) | Opens `PageSetupPopover`; `aria-haspopup="dialog"` | Enabled/disabled while loading; allowed in Read |
| **Density** | Icon + “85%” (current stored density) | Opens `DensityPopover`; value is `page.theme.density`, not the effective lens | Enabled/disabled while loading; allowed in Read |
| **Export** | Icon + “Export” | Opens `ExportSheet` (`⇧⌘E`); same flow as menu/palette | Enabled when ready; disabled while loading/exporting with a reason |
| **Updating** | Small text/spinner next to the indicator | Shown while re-paginating after setup/density or settings change | Hidden when idle |

- **No “Open in Continuous”** button: the TopBar layout switch owns that.
- **No page zoom/fit** controls: TopBar `ViewControls` owns them.
- Page actions are available in Read and Edit; in Page Edit, applying setup/density/export commits
  the overlay first (see §4).

### 1.3 Behavior details

- Page navigation keeps the current page on re-pagination when possible; if the page count drops
  below the current page, clamp to the last page.
- While updating, the page indicator shows the last stable page and the “Updating…” cue; page nav
  remains usable but disabled actions show a reason.
- Export while updating waits for the page model or disables with “Preparing pages…”; no stale
  snapshot.
- The toolbar does not scroll away: it stays above the PageStage.

### 1.4 Responsive

| Width | Behavior |
|---|---|
| ≥1000 px | Full labels: “Setup”, “Density 85%”, “Export” |
| 800–999 px | Icons + short labels (“85%”); page indicator “3/12” |
| <800 px | Icon-only actions with tooltips/aria; compact page nav; no overflow menu unless space is exhausted |
| Narrow + Read | Same; Setup/Density remain available |

### 1.5 Accessibility

- `role=toolbar`, `aria-label="Page controls"`.
- Page nav buttons labelled “Previous page”/“Next page”; indicator `aria-live="polite"` and
  `aria-atomic` (announce page changes, not every re-render).
- Setup/Density buttons `aria-expanded`; popovers return focus on close.
- Export button `aria-keyshortcuts="Shift+Meta+E"`.
- Disabled buttons keep a tooltip/`aria-describedby` reason.

---

## 2. PageSetupPopover (shared `PageSetupForm`)

Opened from the PageToolbar Setup button. Non-modal popover, anchored below the button; a sheet on
very narrow windows. It edits **this document's override**; the global default lives in Settings >
Page > Setup, using the same form.

### 2.1 Contents

| Group | Control | Behavior |
|---|---|---|
| **Size** | Segmented A4 / A5 / Letter | Re-paginates; preview updates |
| **Orientation** | Segmented Portrait / Landscape | Re-paginates; swaps page dimensions |
| **Margins** | Four `NumberField`s: Top, Right, Bottom, Left, in mm; “All sides” link | 0–100 mm; content area minimum 20 mm per axis; invalid values show inline errors and block Apply |
| **Preview** | Live PageStage behind + small margin diagram | Updates as fields change; no separate stale thumbnail |
| **Scope** | “This document” badge | The popover always edits the document override; “Use global” clears it |
| **Global link** | “Edit global default…” | Opens Settings > Page > Setup with the same form |
| **Actions** | Apply / Cancel | Apply commits the override and re-paginates; Cancel reverts the draft and the preview |
| **Reset** | “Use global” | Clears the document override; no silent copy of global into an equal override |

### 2.2 Validation and states

| State | Behavior |
|---|---|
| Valid | Apply enabled; preview updates; “Updating…” while re-paginating |
| Invalid margins | Inline error under the field/group; Apply disabled; no silent 12 mm fallback |
| Zero margins | Allowed but warned: header/footer/ghost/continues can overlap content; Apply remains possible with the warning |
| Read-only document | Allowed or blocked? Open (P1-03); current proposal: allow view/setup overrides because they do not modify content, with a read-only note |
| Page Edit open | Apply first commits the Page Edit; if the commit fails, keep the editor open and show the error; do not re-paginate |
| Loading/updating | Apply disabled while busy; Cancel remains enabled |
| Outside click | Does not silently discard a dirty draft; keep the popover open or ask. Escape cancels |

### 2.3 Preview performance

- Debounce re-pagination ~150–200 ms while typing; show “Updating…”.
- If live re-pagination is too heavy on large documents, fall back to a small preview sheet inside
  the popover and apply on commit; decide in the lab (P1-06).
- The preview never changes the Page/PDF identity; the effective theme is the same.

---

## 3. DensityPopover

Opened from the PageToolbar Density button. Non-modal popover; edits **this document's density
override**; the global default lives in Settings > Page > Typography.

### 3.1 Contents

| Element | Behavior |
|---|---|
| Slider | 60–120%, step 5%, default 100%; current stored value shown (“85%”) |
| Value | Numeric percent next to the slider; snaps to the 5% step |
| Help | “60% fine print · 70% gentle dense · 100% default”; do not advertise 90% as the dense optimum |
| Preview | Live PageStage behind; page count may change; keep the current page when possible |
| Scope | “This document”; “Use global” clears the override; “Edit global default…” links to Settings |
| Actions | Apply / Cancel; Reset = use global |
| Topology note | Density may move a callout between the right lane and below; one short help line, not a diagram |

### 3.2 States

- Page Edit open: Apply commits the edit first, then applies density; commit failure keeps the
  editor and the old density.
- Invalid/out-of-range input: normalize to the 5% step; show the normalized value.
- Read-only: proposal allow (view/settings do not modify content), open P1-03.
- While updating: “Updating…”; Apply disabled; Cancel enabled.
- Page/PDF parity: the same effective theme feeds Page Read/Edit and print; no separate preview.

---

## 4. Page canvas frame

### 4.1 PageStage

- Dark neutral background; the paper sheet centered with generous padding; one page at a time.
- The sheet keeps a subtle border/shadow; no heavy card stack, no floating panels inside the paper.
- Zoom/fit come from TopBar `ViewControls`; the stage scrolls if the page exceeds the viewport.
- Page changes are immediate: no crossfade, no page-turn, no added delay. If a future transition
  is considered, it must not slow down page navigation; the default is none.
- The stage never re-paginates on scroll; geometry comes from the page model.

### 4.2 PageSheet chrome

- Header: document title and chapter title.
- Footer: chapter and “Page N of M”.
- Ghost list (“continued from page N…”) and continues list (“continues on page N…”).
- Cross-page edge labels/trunks stay as the engine produces them.
- No chrome toggles in this slice (P1-10: future fields); no changes to the sheet's internal
  typography.

### 4.3 PageEditOverlay

- Opens on click/Enter on a fragment when the active mode is Page Edit.
- Overlay exactly over the fragment; header “Editing <block title>”; Done; Esc or `⌘⏎` commits.
- One undo entry per commit; the overlay does not shift the page.
- Commit error keeps the text and shows an inline `role=alert`; retry or copy before closing.
- Setup/Density/Export while open commit the overlay first; if commit fails, the action is
  blocked with the error.
- Read-only documents cannot enter Page Edit.

### 4.4 Placeholders

| State | Content |
|---|---|
| Loading | “Laying out pages…” + “Measuring page typography and paginating.” No fake progress |
| Error | Title, message, **Retry**, **Open in continuous editor** |
| Empty | “Nothing to paginate yet.” + **Open in continuous editor** |
| Defect | Toolbar/badge warning + banner “N blocking layout defects: first message”; Export is blocked by preflight, not hidden |

### 4.5 Banners

- Read-only reason (`role=status`), save failure (`role=alert` with Retry/Restore/Overwrite/Save a
  copy/Reload/Reveal), repair notice (`role=status` + Dismiss).
- Banners sit above the canvas content, full width; they do not cover the PageToolbar or the sheet.
- Export warnings live in the ExportSheet; no duplicate warnings in the canvas.

---

## 5. Continuous canvas frame

- No PageToolbar; no page chrome, markers, or page model in Continuous.
- Banners as above; selection toolbar for text/nodes; canvas footer with “+ Add chapter”.
- Zoom/fit from TopBar `ViewControls` (per-document view state); focus branch from the View
  menu/palette (`⇧⌘F`), not a StatusStrip button.
- Empty document: “This document has no blocks yet.” + **Add first block**.
- The block/card/edge visuals are existing; this slice does not redesign them.

---

## 6. State matrix (Page)

| State | PageToolbar | PageStage | Page Edit | Export |
|---|---|---|---|---|
| No document | Not rendered (empty workspace) | Empty workspace | — | Disabled |
| Loading | Disabled with “Preparing pages…” | Loading placeholder | — | Disabled |
| Ready | Enabled | Sheet | Available | Enabled |
| Updating | “Updating…”; Apply disabled | Last stable page, then new | Commit first if open | Wait/disable |
| Error | Retry state | Error placeholder | — | Disabled |
| Empty | Enabled (setup/density) | Empty placeholder | — | Disabled |
| Defect | Warning badge/banner | Sheet + badges | Available | Preflight blocks |
| Page Edit | Setup/Density/Export commit first | Overlay | Open | Commits first |
| Read-only | Setup/Density per P1-03 | Exact read | Disabled | Enabled |
| Narrow | Icons/compact indicator | Fit width; zoom via TopBar | Same | Icon |

---

## 7. Accessibility and keyboard

- PageToolbar: toolbar label; groups labelled “Page navigation” and “Page actions”.
- PageStage: `role=region`, `aria-label="Page layout"`, `aria-busy` while updating; sheet
  `role=document` with “Page N of M”.
- Page nav: `PageUp`/`PageDown` when the stage has focus; no global shortcut conflicts.
- Setup/Density popovers: focus moves in, Escape cancels, focus returns to the trigger; no focus
  trap if non-modal, but the page behind must not steal focus.
- Page Edit: `role=dialog`, `aria-label="Edit block: title"`, `aria-keyshortcuts="Escape Meta+Enter"`.
- Reduced motion: page changes are immediate; no page-turn animation.

---

## 8. Open choices in this slice

| ID | Choice | Options | Proposal |
|---|---|---|---|
| P1-01 | PageSetup surface | Popover (non-modal, live page), sheet, or modal | Popover with live page; sheet on very narrow |
| P1-02 | Apply model | Apply/Cancel or instant save | Apply/Cancel for setup/density; Settings must match (D-06) |
| P1-03 | Read-only document overrides | Allow setup/density, or block | Allow view/setup overrides; no content mutation; confirm |
| P1-04 | Page Edit across layout switch | Reset to Read (current), or preserve | Preserve the explicit mode per document; decide with Q-01 |
| P1-05 | Density help | Slider + value only, named steps, or presets | Slider + value + one help line; no presets-only |
| P1-06 | Preview performance | Live re-pagination vs small preview | Live first; fallback to small preview if slow |
| P1-07 | Page change motion | None, crossfade, or page turn | None; page changes are immediate (accepted 10 Nov) |
| P1-08 | Page nav keys | PageUp/PageDown vs other | PageUp/PageDown when the stage is focused |
| P1-09 | Manual breaks | Include in this rework or defer | Defer until cleanup rules exist; not in this slice |
| P1-10 | Page chrome toggles | Header/footer/page-number toggles now or later | Later; needs fields + schema bump |

---

## 9. Next slice

**Settings:** done in `docs/design/ui-settings-contents.md` (modal frame, Appearance/theme/
colors/fonts, Page, Continuous, Editor, Export, Data & About, scope, save model, states). Next:
the ExportSheet, overlays/keyboard, and the A/B lab (TopBar words vs symbols).
