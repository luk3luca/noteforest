# Shortcut audit — inventory, conflicts and proposal

**Role:** Reviewer / UX-research (docs only; no product code)
**Phase:** 0c (runs beside phase 0, before more shortcut work)
**Base:** `main` at delegation
**Deliverable:** `docs/design/shortcuts.md` (canonical map) + `docs/reviews/shortcut-audit.md` (findings)
**Worktree:** created by the delegate; one commit; no merge or push
**Timebox:** 1 day

## Why

The app has grown many shortcuts across native menus, editor keymaps, palette actions, table/list
keys, and shell commands. The product owner reports that `Tab`/`Shift+Tab` structural Indent does not
behave as expected, and asks for an audit of duplicates, wrong bindings, and undocumented keys before
adding more.

## Scope

Inventory every binding from the source:

- `apps/desktop/src/main/menu.ts` (native menu accelerators);
- `apps/desktop/src/renderer/src/editor/bindings.ts`, `keymap.ts`, `DocumentEditor`/`BlockViews`
  (editor, block selection, Tab/Shift+Tab, arrows, Backspace, Enter, table/list keys);
- `actions.ts` palette entries and their `shortcut` labels;
- `shell/*` global listeners (layout/mode, sidebar, find/palette, tabs, zoom, export);
- `SettingsDialog` Help → Editor shortcut list;
- browser/Electron defaults that still apply (Tab focus, ⌘A/C/V/X, ⌘F, ⌘G, ⌘Space, ⌘Tab, ⌥arrows).

For each binding record: keys, scope (global/editor/block/text/table/list/input/Read/Page), action,
source, whether it is documented in Help → Editor, and whether it collides.

## Required checks

1. **Duplicates in the same scope** (two actions on one key) and **cross-scope ambiguity** (same key
   does different things depending on focus, documented or not).
2. **OS/browser conflicts**: ⌘Space, ⌘Tab, ⌘W/⌘Q, ⌥arrows, ⌘F/⌘G, Tab focus traversal, text editing.
3. **Tab/Shift+Tab**: structural Indent requires a selected block; inside text/list/table it must
   stay native. Verify the gutter click actually focuses the editor (the A+D UI test needed an
   explicit focus; if the real app does not, that is a bug, not a shortcut choice).
4. **Missing bindings** for common actions and **undocumented bindings**.
5. **Read/Page gating**: a shortcut that is disabled must say why; no silent no-op.
6. **Discoverability**: Help → Editor and the docs list match the real map.
7. **Consistency**: choose one modifier family for structural move/indent (for example `⌘]`/`⌘[`
   as a caret-friendly alias, with Tab/Shift+Tab only on block selection) and justify it.

## Deliverables

- `docs/design/shortcuts.md`: the canonical table by scope, with reserved keys and aliases.
- `docs/reviews/shortcut-audit.md`: verdict, S1–S4 findings, duplicates/conflicts, missing/undocumented
  rows, the Tab/Shift+Tab repro result, and the smallest credible fix (not an implementation).
- If a fix is needed, propose one scoped brief; do not change code/tests/spec/UX/plan.

## Rules

- Docs only, one commit, no merge/push.
- No fixed sleeps or native dialogs; no product code changes.
- If the Tab behavior needs a product decision (Tab alias vs `⌘]`/`⌘[`), state the options and a
  recommendation; the product owner decides.
