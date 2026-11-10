# UI contents — phase 2, slice 5 (overlays, commands, keyboard)

**Status:** First draft. Contents, command/keyboard map, and states; not visual design and not code.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Inputs:** `docs/design/ui-shell-map.md` (D-01…D-13), the four previous content slices,
`research/ui-surface-map.md` (command register, context menus, dialogs, toasts), `docs/ux.md`,
`docs/ux-shell.md` (flows; stale shortcut tables flagged).
**Scope:** command palette, dialogs, context menus, toasts, the unified shortcut table, responsive
rules, and the cross-surface state matrix. No product code.

---

## 0. Principles

- **One command registry.** Every action has one id, one label, one shortcut, one enabled rule.
  Menu, palette, toolbar, context menu, and keyboard all read the same command. No surface invents
  a second behavior.
- **State-aware menus.** The native menu is rebuilt/updated when the active document, layout, mode,
  selection, or job changes. Items are disabled with a reason in the palette/tooltip; the menu does
  not silently no-op.
- **Read mode is one gate.** A single whitelist of allowed commands; the native menu, palette,
  context menus, toolbar, and shortcuts agree.
- **Overlays match weight.** Settings and Export are modal surfaces; confirmations are dialogs;
  transient feedback is a toast/banner; no native message box for app decisions.
- **No duplicate labels.** “Save” vs “Save now”, “Close tab” vs “Close Tab”, “Actual size” vs
  “Actual” are unified. The command id is the source.
- **Keyboard-first, not keyboard-only.** Every command has a visible entry or palette entry; every
  visible control has a keyboard path.

---

## 1. Command palette

### 1.1 Structure

Modal overlay, centered near the top, 560 px wide (full width on narrow), max 60vh.

```text
┌──────────────────────────────────────────────────────────────┐
│ [ Search or run a command…                            ⌘K ]   │
├──────────────────────────────────────────────────────────────┤
│ COMMANDS                                                     │
│  New note                                            ⌘N      │
│  Save now                                            ⌘S      │
│  Export PDF…                                         ⇧⌘E     │
│  Toggle sidebar                                      ⌘\      │
│  …                                                           │
│ DOCUMENTS                                                    │
│  Note title · chapter count                                  │
│ BLOCKS                                                       │
│  Block title · chapter                                       │
├──────────────────────────────────────────────────────────────┤
│ ↑↓ move   ↵ open   esc close                                 │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Contents and groups

| Group | Contents | Behavior |
|---|---|---|
| **Commands** | Registry commands available in the current state | Labels match the menu/toolbar; shortcuts shown; disabled rows include a reason |
| **Documents** | Library + open documents | Opens the document; recovery rows open recovery |
| **Blocks** | Block titles (not content) | Focuses the block; no content search yet |
| **Recent** (optional) | Last commands/documents | Only if it stays small; no fake “AI” suggestions |

- Search matches command labels, document titles, block titles. **No content search** until a real
  find feature exists; the placeholder says “Search or run a command…”, not “Search notes”.
- Max results with scroll; groups keep their order; no result → empty state “No commands or
  documents match.”
- Read mode: mutating commands are disabled with “— Read mode” (or a reason) but remain searchable.
- Current-state toggles (layout/mode) show a checkmark or “current” suffix; the action label says
  what will happen (“Switch to Page layout”).
- Settings and Export entries are commands; Export opens the sheet, Settings opens the modal.
- No duplicate entries for the same command id; no dead entries.

### 1.3 Keyboard and states

- `⌘K` opens/closes; `↑/↓` move; `↵` runs; `Esc` closes; focus returns to the trigger.
- Disabled rows are skipped by Enter but remain visible with a reason.
- Loading: none (local data); empty and no-match states.
- Page Edit open: palette commands that would change the document commit the edit first (same
  policy as the toolbar/menu).

---

## 2. Dialogs

### 2.1 Shared frame

One `Dialog` primitive: title, optional description, body, footer with secondary/primary actions;
sizes **small** (400), **medium** (480), **wide** (640); max 92vw/86vh; scrollable body; focus trap;
Escape cancels; focus returns to the trigger. Destructive buttons are explicit and not the default
focus.

### 2.2 Inventory

| Dialog | Purpose | Fields / actions | Notes |
|---|---|---|---|
| **Rename document/chapter/block** | Rename | Name field; Cancel / Save; Enter saves | Shared frame; validates non-empty |
| **Link** | Add/remove a link | URL field; Cancel / Apply | Empty URL removes |
| **Math** | Insert/edit LaTeX | Textarea; Inline/Display; Branch from term; Cancel / Apply | Enter applies, Shift+Enter newline |
| **Image alt text** | Describe an image | Alt field; Cancel / Save | Enter saves |
| **Delete block** | Delete with disclosure | Keep descendants / Delete subtree; external refs list; Cancel / Delete | Danger; one policy for all delete paths |
| **Detach branch** | Detach from parent | Explanation; Cancel / Detach | Content stays |
| **Move to…** | Change primary parent | List of valid parents; Cancel / Move | Cycles/descendants excluded |
| **Link as reference** | Create a reference | Filter; target list; Cancel / Link | Target required |
| **Close tab unsaved** | Close with changes | Cancel / Don’t Save / Save | Save is primary |
| **Reload from disk** | Discard local changes | Cancel / Reload | Danger |
| **Overwrite external** | Replace an externally changed file | Cancel / Overwrite | Cancel focused |
| **No document fallback** | Document-only command | Close | Not a settings/export path |
| **Anchor health** | Repair anchors | Filters; rows; repair/remove; detail | Wide; read-only note |
| **Restore backup** | Restore a copy | Backup list; Restore copy… | Wide; busy/empty states |

- Settings and Export are **not** dialogs: Settings is a modal, Export is a sheet.
- Native dialogs remain only for OS surfaces: folder picker, image picker, save-a-copy, close/quit
  prompts. No native message boxes for app decisions; no native dialogs in tests.
- One delete policy: `⌘Backspace`, Delete, context menu, and palette all call the same command;
  the dialog appears when descendants/external references require disclosure, otherwise the delete
  is undoable without a modal. No path-specific confirmation.

### 2.3 Dialog states

- Primary disabled until valid; loading/busy disables both; errors inline `role=alert`; Enter
  primary; Escape cancel; destructive actions are not focused by default.
- Page Edit open: dialogs that navigate away commit the edit first; a failed commit keeps the dialog
  closed and shows the error.

---

## 3. Context menus

One `ContextMenu` primitive (portal, viewport-clamped, focus trap, Escape, restores focus).

| Menu | Items | Gating |
|---|---|---|
| **Block** | Focus; Insert image…; per-image actions; Add child (`⌃⏎`); Add sibling (`⌥⏎`); Split; Merge; Link as reference…; anchor entries; outgoing/incoming references; Move to…; Move up/down; Outdent; Collapse/Expand; Demote to reference; Detach; Delete… | Read mode disables all mutations; image actions also gate on asset availability |
| **Chapter** | Rename chapter…; Add block | Read mode disables |
| **Reference chip** | See also target; Make home; Move here; Remove reference | Make home/move here disabled for cycles |
| **Image** | Add region; Add point; Replace; Edit alt text | Asset/editable gates |
| **Tab** | Close; Close others; Reopen closed? | Dirty close dialog when needed |
| **Library row** | Open; Open recovery; Reveal in Finder; Rename | Rename only for openable docs |

- Labels/shortcuts match the command registry; destructive items are at the end with a danger
  style; no confirmation for reversible actions, dialog for destructive/disclosing ones.
- Keyboard: `Shift+F10`/context-menu key opens at the focused item; arrows/Enter/Escape.
- Read mode: mutations disabled with a reason; navigation/copy/focus allowed.

---

## 4. Toasts and banners

### 4.1 Toasts

- Use for transient success/info/warning feedback; not for decisions or blocking errors.
- Variants: success, info, warning, error; max 3 visible; dedupe by id; bottom-right; 4–6 s;
  optional **one** action (Undo, Retry, Open) — no action by default.
- No toast for Export success/failure (the sheet owns it), Settings save (footer status), or
  blocking save errors (banner).
- Errors that need a decision use a banner/dialog; a toast alone is not enough.
- Accessibility: live region, no focus steal; dismissible if persistent.

### 4.2 Banners

- Persistent, in-context, with actions: read-only reason, save failure, stale lock, repair notice,
  Page defects.
- Save failure banner owns Retry/Restore/Overwrite/Save a copy/Reload/Reveal; no toast duplicate.
- Banners do not cover the TopBar/PageToolbar; dismiss only when safe.

---

## 5. Unified shortcut table

### 5.1 Global shell

| Command | Shortcut | Menu | Palette | Visible control | Status |
|---|---|---|---|---|---|
| New note | `⌘N` | File → New Note | ✓ | TopBar `+`, sidebar New | Keep |
| Open document | `⌘O` | File → Open… | ✓ | Empty state | Keep |
| New chapter | `⇧⌘N` | File → New Chapter | ✓ | Sidebar/canvas + | Keep; UX doc says `⌘⌥C` (stale) |
| Save | `⌘S` | File → Save | ✓ | — | Keep; Page Edit commits first |
| Export PDF… | `⇧⌘E` | File → Export PDF… | ✓ | PageToolbar Export | Keep |
| Close tab | `⌘W` | File → Close Tab | ✓ | Tab × | Keep |
| Reopen closed tab | `⇧⌘T` | File | ✓ | — | Keep |
| Close window | `⇧⌘W` | File | — | Native | Keep |
| Command palette | `⌘K` | View → Command Palette… | — | TopBar ⌘K, sidebar Search | Keep |
| Settings | `⌘,` | App → Settings… | ✓ | Sidebar footer gear | Keep; one visible entry |
| Toggle sidebar | `⌘\` | View | ✓ | Sidebar toggle | Keep |
| Continuous layout | `⌘2` | View | ✓ | TopBar ViewControls | Keep |
| Page layout | `⌘3` | View | ✓ | TopBar ViewControls | Keep |
| Toggle mode | `⌘E` | View | ✓ | TopBar ViewControls | Keep; label action, not current state |
| Zoom in / out | `⌘=`/`⌘+`, `⌘-` | View | ✓ | TopBar ViewControls | Keep; **layout-aware** |
| Actual size / Fit width | `⌘0`, `⇧⌘0` | View | ✓ | TopBar ViewControls | Keep; **layout-aware** |
| Fit page | `⇧1` (Page) | View? | ✓ | TopBar zoom menu | Keep as alias; Page only |
| Focus branch | `⇧⌘F` | View | ✓ | — | Keep |
| Previous/next tab | `⌃Tab` / `⌃⇧Tab`, `⌘⇧[` / `⌘⇧]` | — | — | — | Keep |
| Tab N | `⌘1…⌘9` (2/3 reserved) | — | — | — | Open: remap or document |
| Undo / redo | `⌘Z` / `⇧⌘Z` | Edit | ✓ | — | Keep; one delivery path |
| Cut/copy/paste/select all | `⌘X/C/V/A` | Edit | — | — | Native |
| Help → Keyboard shortcuts | — | Help | — | — | Opens Settings → Editor → Shortcuts |

### 5.2 Editor (Continuous)

| Command | Shortcut | Notes |
|---|---|---|
| Split paragraph / hard break | `Enter` / `⇧Enter` | Heading → paragraph at end |
| Branch from selection / add child | `⌘⇧Enter` | Node selections branch from the node |
| Add child | `⌃⏎` | Current block |
| Add sibling | `⌥⏎` | Current block |
| Indent / outdent | `Tab` / `⇧Tab` | Block node selected |
| Delete block | `⌘⌫` | Same command as Delete/context menu |
| Collapse | `⌘.` | Current block |
| Link | `⌘⇧K` | Dialog |
| Reference | `⌘⇧L` | Read mode → toast |
| Focus previous/next block | `⌘↑` / `⌘↓` | Navigation |
| Reorder sibling | `⌥↑` / `⌥↓` | Editable |
| Rename block/chapter | `F2` | Sidebar rows |
| Blur editor | `Esc` | Page Edit uses Esc to commit |
| Undo/redo | `⌘Z` / `⇧⌘Z` | Text vs structural routing preserved |

### 5.3 Page

| Command | Shortcut | Notes |
|---|---|---|
| Previous/next page | `PageUp` / `PageDown`, `⌥↑` / `⌥↓` | When PageStage is focused; not inside editor |
| Fit page / fit width | `⇧1` / `⇧2` | Page only; also in zoom menu |
| Actual size | `⌘0` | Layout-aware |
| Page Edit commit | `Esc`, `⌘⏎`, `⌘S` | One commit path |
| Clear page selection | `Esc` | When selection present |
| Export | `⇧⌘E` | Same sheet |

### 5.4 Overlays

| Context | Keys |
|---|---|
| Palette | `⌘K`, `↑↓`, `↵`, `Esc` |
| Dialog | `Enter` primary, `Esc` cancel, focus trap |
| Settings | `⌘,` open, arrows nav, `⌘⏎` Apply, `Esc` cancel |
| Export | `⇧⌘E` open, `Enter` export, `Esc` cancel/close |
| Page Edit | `Esc`/`⌘⏎`/`⌘S` commit |

### 5.5 Read-mode whitelist

- **Allowed:** open/close/reopen tabs, save, export, settings, palette, layout/mode, zoom/fit,
  focus branch, page navigation, sidebar navigation, copy/select, anchor health (view), image
  viewing, context-menu focus/select.
- **Disabled:** new chapter, add block/child/sibling, block types, insert image/math/table/code,
  link/reference, delete, rename, move, reorder, split/merge, detach/demote, image authoring,
  paste/drop/import.
- The same whitelist feeds the native menu, palette, context menus, toolbar, and shortcuts; a
  disabled item shows a reason where the surface allows text.

### 5.6 Command registry contract

| Field | Meaning |
|---|---|
| `id` | Stable command id (one behavior) |
| `label` | One label for menu/palette/toolbar; dynamic labels are actions (“Switch to Page”) |
| `icon` | Optional Lucide icon, one size/stroke per surface |
| `shortcut` | One accelerator; shown in menu/palette, handled once |
| `enabled(state)` | Document/mode/selection/job state; no silent no-op |
| `run(state)` | Same handler from every surface |
| `reason(state)` | Why disabled, for palette/tooltip |
| `checked(state)` | Toggle/current state for layout/mode/collapse |

Menu items update `enabled`/`checked` on state changes; palette rows show `reason`; the menu cannot
show a reason, so it simply disables. Developer items (Reload, DevTools) stay out of production
menus.

---

## 6. Responsive rules

| Surface | ≥1200 | 900–1199 | <900 | <760 |
|---|---|---|---|---|
| TopBar | Full labels | Icon+text | Icon-only | Overflow; tabs shrink |
| Sidebar | 264 px | 264 | 240 | Auto-collapsed + reveal |
| PageToolbar | Full labels | Icons + compact page | Icons | Compact page; icons |
| Settings | 840×580 | 90vw | Nav dropdown | Full-width modal |
| Export | 560 | 560 | 90vw | Full width |
| Palette | 560 | 560 | 90vw | Full width |
| Dialogs | Fixed size | 92vw | 92vw | 92vw, scroll |
| StatusStrip | All slots | Drop P2 | Drop P1 | P0 only |

- No horizontal page scroll on the shell; PageStage scrolls the sheet.
- At narrow widths, labels move to tooltips/aria; nothing becomes icon-only without a label path.

---

## 7. Cross-surface state matrix

| State | TopBar | Sidebar | PageToolbar | StatusStrip | Palette | Menu | Dialogs |
|---|---|---|---|---|---|---|---|
| No document | Tabs empty; view disabled | Library works; topics empty | Not rendered | “No document” | Commands limited | Document items disabled | No-document fallback |
| Document open | Full | Full | Page only | Full | All valid | All valid | — |
| Read-only | Full | Rows navigable; mutations off | Setup/Density/Export | “Read-only” | Mutations off | Mutations off | — |
| Recovery | Warning tab; view off | Library works | Not rendered | “Recovery” | Recovery/close | Close/export disabled | — |
| Dirty | Dot | — | — | Save state | Save | Save | Close-tab dialog |
| Saving | — | — | — | “Saving…” | — | — | — |
| Save error | — | — | — | “Save failed” | Retry | Save | Banner |
| Page Edit | Mode Edit | — | Setup/Density/Export commit first | — | Commands commit first | Same | Commit first |
| Export running | — | — | Export disabled/focus sheet | Optional slot | Export focuses sheet | Export disabled | Sheet owns |
| Corrupt settings | — | — | — | — | Settings warning | Settings | Settings warning |
| Narrow | Icons/overflow | Auto-collapse | Icons | P0 | Full width | Native | 92vw |

---

## 8. Accessibility and focus

- Focus order: TopBar → Sidebar → Canvas → StatusStrip → overlays (palette/settings/export/dialog).
- Overlays trap focus, restore it to the trigger, and close on Escape with the state rules.
- Menus: real roles, arrow keys, type-ahead optional, `Shift+F10` from focused items.
- Toasts: live region, no focus steal; errors that need action use banners.
- Icon-only controls have `aria-label`/tooltip; disabled reasons are exposed via
  `aria-describedby`/palette suffix.
- VoiceOver: page sheet reading order (header → fragments → footer) is owned by the Page pass; the
  rework must not add decorative wrappers that change it.
- Reduced motion: page changes immediate; toast/modal transitions are minimal and respect the OS
  setting.
- No keyboard-only traps: every shortcut has a visible/palette path; every pointer action has a
  keyboard path.

---

## 9. Open choices

| ID | Choice | Options | Proposal |
|---|---|---|---|
| K-01 | Tab vs layout shortcuts | Keep `⌘1` tab / `⌘2-3` layout; remap tabs to `⌃1…9` | Keep current; document the exception |
| K-02 | New chapter shortcut | `⇧⌘N` (code) vs `⌘⌥C` (UX doc) | `⇧⌘N`; update UX docs |
| K-03 | Page fit keys | Keep `⇧1`/`⇧2`; move to zoom menu only | Keep as aliases; menu is canonical |
| K-04 | Delete confirmation | Always dialog; only when needed | Only when descendants/external refs |
| K-05 | Menu gating | Rebuild menu; update enabled items | Update enabled/checked from the registry |
| K-06 | Palette search | Titles only; content search later | Titles only; label “Search or run a command” |
| K-07 | Toast actions | None; one action | One optional action (Undo/Retry/Open) |
| K-08 | Native dialogs | Folder/image/save-copy/close only | Keep these; no app message boxes |
| K-09 | Help shortcuts | Settings root; Editor > Shortcuts | Editor > Shortcuts |
| K-10 | Page nav keys | PageUp/PageDown; `⌥↑/↓`; both | Both when PageStage focused |
| K-11 | Zoom keys | `⌘+` vs `⌘=`; both | Both; layout-aware |
| K-12 | Command labels | Keep current mixed case; unify sentence case | Sentence case everywhere |
| K-13 | Destructive context items | Always confirm; confirm only when needed | Confirm only when needed |
| K-14 | Error feedback | Toast; banner; dialog | Banner/dialog for decisions, toast for transient |

---

## 10. Phase 2 status

| Slice | Document | Status |
|---|---|---|
| 1 | `docs/design/ui-shell-contents.md` | TopBar, Sidebar, StatusStrip |
| 2 | `docs/design/ui-page-contents.md` | PageToolbar, Page canvas, Page Edit |
| 3 | `docs/design/ui-settings-contents.md` | Settings + Appearance |
| 4 | `docs/design/ui-export-contents.md` | Export sheet |
| 5 | this file | Overlays, commands, keyboard |

**Next:** the A/B lab (TopBar words vs symbols, Page Setup entry) and the settings placement
matrix (`research/ui-surface-map.md` §7.17, CH-01…CH-16). The lab is dev-only code; no product code
until the placement choices are settled.
