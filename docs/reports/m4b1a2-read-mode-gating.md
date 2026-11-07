# M4b1a2 — Read mode global gating

**Role:** Implementer / Builder  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-269801d1`  
**Branch:** `t3/m4b1a2-read-mode-gating`  
**Base:** `b7f5a52` (`docs: launch M4b1a2 read-mode gating`)  
**Implementation commits:** `515bab7545d4` (global gate), `35af3cacb699` (anchor health)  
**Report commit:** branch head after this file  
**Status:** implementation, tests, screenshots, and one `verify:fast` complete; not merged, not pushed

## Summary

Read mode is now globally read-only across the shell. One pure helper decides whether the
active surface is editable; every mutating shell, palette, context-menu, native-menu, and editor
keymap path either uses it directly or is disabled through a narrow navigation whitelist.

```text
editable = active runtime exists
        && runtime.editable
        && layout === 'continuous'
        && interactionMode === 'edit'
```

Page is always false, including a corrupt Page + Edit state. Continuous Edit returns true; Continuous
Read, Page Read, a read-only package, and no open document return false. Navigation, selection,
copy, links, anchors, reference following, zoom/fit/focus, save, document rename, and settings stay
available.

## Helper contract

`apps/desktop/src/renderer/src/lib/editability.ts`:

```ts
editingEnabledFor(runtime: { editable: boolean } | null,
                  view: { layout; interactionMode } | undefined): boolean
```

- false when there is no runtime;
- false when `runtime.editable` is false (read-only package, stale lock, no document);
- false when the layout is `page` (Page Edit is not implemented);
- false when the interaction mode is `read`;
- true only for `continuous` + `edit`;
- a missing view entry falls back to the store default, Continuous + Edit.

`activeEditingEnabled()` in `actions.ts` is the imperative shell wrapper over the active runtime and
its per-document view state. Components subscribe to the same view fields and call the same pure
helper, so a mode switch re-renders disabled states without duplicating the condition.

Shared reasons:

- `READ_MODE_TITLE` — `Read mode — switch to Edit to add content`
- `READ_MODE_SUFFIX` — ` — Read mode` (palette/context-menu labels)
- `READ_MODE_TOAST` — `Read mode — switch to Continuous Edit to make changes.`

## Gated surfaces

### Sidebar

- **Add chapter** and **Add block** are disabled in Continuous Read and Page Read, with the shared
  title/aria-label reason.
- Chapter and block inline rename (double-click and F2) is blocked in Read; an input already open
  when the mode changes discards instead of committing.
- Tree navigation, collapse, search, document open, selection, shared-reference chips, and context
  menus remain available.

### Command palette

These entries are visibly disabled with the ` — Read mode` suffix and no `onSelect`:

- New chapter;
- Add top-level block, add child block, add sibling block;
- Link as reference;
- Block type: Text, Heading 1, Heading 2, Heading 3;
- Undo, Redo;
- Insert table, Insert image, Insert math, Toggle code block.

New document, save, close tab, sidebar, zoom/fit/focus, layout/mode, rename document, reveal,
anchor health (inspection), settings, documents, and block navigation stay enabled.

### Native menu and `runMenuCommand`

- `new-chapter`, `add-block`, `undo`, and `redo` do not mutate in Read, including the native File/Edit
  menu and their keyboard accelerators/shortcuts.
- The native menu item is not dynamically disabled. The guard runs in the action layer
  (`createChapter`, `addTopLevelContextual`, `undoActive`, `redoActive`), and every blocked native
  command shows a short Read-mode toast so it never looks like a silent no-op.
- New document, open, save, close tab, reopen, sidebar, palette, settings, zoom, fit, and focus stay
  enabled.
- `⌘⇧L` also stopped opening the link-reference dialog in Read.

### Context menus

`gateMenuEntries` uses a narrow navigation whitelist: `focus`, `collapse`, `anchor-select-*`,
`anchor-cycle-*`, `reference-open-*`, and `reference-back-*`. Every other entry is disabled with the
Read-mode suffix and has its action removed. This applies to block, reference-chip, image, and
chapter menus. Chapter rename and Add block are therefore disabled. Image region/point, Replace, and
alt-text entries are disabled; anchor/reference following and collapse stay enabled.

### Undo/redo

- `undoActive` and `redoActive` return before touching text or structural history in Read.
- The App-level `⌘Z`/`⇧⌘Z` handler now stops propagation after dispatching history. Without this, the
  hidden continuous ProseMirror buffer could still run its own history while Page Read was active.
- Keyboard, palette, and native-menu undo/redo were verified to leave the revision, canonical
  structure, and editor JSON unchanged in Continuous Read and Page Read.
- Plain text inputs keep their native text undo; the document history is untouched.

### Editor paths

- Mutating branch keymap shortcuts return false unless the editor is editable: Enter/Shift+Enter,
  `⌘⇧Enter`, `⌥Enter`, `⌃Enter`, Tab/Shift+Tab, `⌘Backspace`, Delete, `⌘⇧K`, `⌥↑`, and `⌥↓`.
  Collapse (`⌘.`), focus movement, and selection stay available.
- Paste and drop handlers no-op on a non-editable view.
- Double-clicking a formula in Read no longer opens the mutating math dialog; selection remains.
- Sidebar add buttons, canvas Add chapter, and the empty-document Add first block use the same gate.

### Anchor health

The sheet stays reachable for inspection and navigation, but every repair/removal action is disabled
in Read with a visible note: relink, candidate repair, Confirm repair, attach branches, delete branch,
delete anchor, and remove idle anchor. “Keep broken” is session-only and stays enabled.

### Intentionally available in Read

Save, document rename, settings, tab open/close/reopen, layout and mode switching, zoom/fit/focus,
sidebar toggle, search, selection, copy, links, anchor/reference following, and page navigation.
Document export is not exposed by a command in this slice.

## Tests and timings

| Check | Result |
|---|---|
| `npm run check:boundaries` | pass — 138 files, 654 imports, 16 rules |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| `npx vitest run apps/desktop/test/read-mode-gating.test.ts` | 9/9 pass, 57 ms |
| targeted vitest with `editor-layouts-modes` | 15/15 pass, 154 ms |
| `node --test tests/ui/m4b1a2-read-mode-gating.test.mjs` | 2/2 pass, 4.3 s suite (12.4 s process) |
| `npm test` | 75 files / 762 tests pass, 2.3 s |
| `npm run test:ui` | 21/21 files, 59/59 tests, no `not ok` |
| `npm run test:recovery:run` | 14/14 pass, 17.3 s |
| `npm run e2e:critical` | 16/16 pass, 35.6 s suite (43.7 s process) |
| `npm run verify:fast` | exit 0, 52 s wall — boundaries + typecheck + 762 unit + build + 16 e2e |

New unit truth table: no runtime, read-only document, Continuous Edit, Continuous Read, Page Read,
corrupt Page Edit, missing view default, and read-only missing view.

New UI coverage:

- Continuous Read: sidebar Add chapter/Add block disabled with reason; chapter and block rename
  blocked; palette mutating entries disabled with the suffix; navigation entries enabled; disabled
  Insert table inert; chapter menu rename/add disabled; block menu add child/delete disabled while
  Focus block stays enabled; `⌘⇧L`, keyboard undo, native undo/redo, native new chapter/add block,
  and `⌃Enter`/`⌥Enter` do not change the document; return to Continuous Edit re-enables the sidebar,
  palette, chapter menu, and keymap child creation.
- Page Read: sidebar and palette disabled; keyboard and native undo leave the revision and canonical
  structure unchanged; chapter menu disabled; Page Edit remains disabled; return to Continuous Edit
  re-enables the controls and undo removes the previously created child.
- A mode switch leaves the revision and `canUndoText` unchanged (no undo entry).

## Screenshots

Generated by `tests/ui/m4b1a2-read-mode-gating.test.mjs` (gitignored artifacts):

- `artifacts/m4b1a2/continuous-read-sidebar-1440x900.png`
- `artifacts/m4b1a2/continuous-read-palette-1440x900.png`
- `artifacts/m4b1a2/page-read-sidebar-1440x900.png`

The captures show Continuous Read with the Add chapter/Add block controls dimmed, the palette with
`New chapter — Read mode`, and Page Read with the same sidebar gating and Edit disabled in the status
bar.

## Files

Created:

- `apps/desktop/src/renderer/src/lib/editability.ts` — shared predicate, reasons, and labels.
- `apps/desktop/test/read-mode-gating.test.ts` — helper truth table.
- `tests/ui/m4b1a2-read-mode-gating.test.mjs` — Continuous Read and Page Read gating.
- `docs/reports/m4b1a2-read-mode-gating.md` — this report.

Modified:

- `apps/desktop/src/renderer/src/actions.ts` — active gate, action guards, palette/menu gating.
- `apps/desktop/src/renderer/src/App.tsx` — gate `⌘⇧L`; stop document history propagation.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — empty/canvas add controls, paste/drop,
  formula double-click.
- `apps/desktop/src/renderer/src/editor/keymap.ts` — editable-only branch shortcuts.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — disabled add controls and rename gating.
- `apps/desktop/src/renderer/src/shell/CommandPalette.tsx` — disabled palette entries.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — anchor-health repairs gated in Read.
- `apps/desktop/src/renderer/src/styles.css` — disabled sidebar/palette treatment.
- `package.json` — new UI file in `test:ui` and `verify`.

## Risks and open questions

- **Native menus are guarded, not disabled.** Dynamically disabling native File/Edit items needs a
  main-process menu-state change (an IPC mirror of renderer editability plus item ids). This slice
  uses the brief’s fallback: block in `runMenuCommand`/actions and toast the reason.
- **Dialogs already open when the mode switches.** Entry points are gated, but a move/delete/link/
  math dialog opened in Edit and kept open while switching to Read could still confirm through its
  runtime command. Anchor health and formula double-click were explicitly closed because they are
  reachable from Read. A global runtime-level guard would close the remaining edge.
- **Anchor health inspection is still available in Read**, by design; only its repair actions are
  disabled.
- **`activeEditingEnabled` is imperative.** Components that need live disabled state subscribe to the
  same `viewByDoc` fields and call `editingEnabledFor`; this is the same rule, not a second check.
- **Native command toasts are transient.** The reason is visible, but a native menu item still looks
  enabled; the principal event is not a silent no-op.

## Not verified

- Product-owner visual judgement, VoiceOver/screen-reader pass, or screen recording.
- Native menu items visibly disabled at the OS menu level (not implemented; fallback toast only).
- Anchors/references/link activation specifically while in Read beyond the existing M3 coverage.
- Clipboard copy through the OS clipboard in Read.
- A mutating dialog kept open across a mode switch (see risks).
- 300/1,000-block Continuous Read performance and memory.
- Page Edit, continuous page-break markers, PDF/print compositor (out of scope).
- Page layout geometry parity with the PDF (M4c gate).

## Next suggested step

Sentinel review against the M4b1a2 brief. Then continue the M4b slice with either Continuous
page-break markers or the Page Edit single-block overlay; PDF remains M4c.
