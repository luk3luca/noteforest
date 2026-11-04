# M2c — Interaction polish + desync fix

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Depends on:** M2b merged; `packages/core`; ADR-0004; `docs/ux-shell.md`; `docs/spec.md` v0.4.2  
**Out of scope:** span anchors, reference edges, page view, PDF, external API, light theme, font/size settings UI (M6)

## Goal

Fix the M2b defects the product owner found and tighten the editor interaction. The first two items are blockers: a phantom block that exists only in the canvas, and missing arrows after creation. The rest are UX corrections.

## 1. Phantom block / desync fix (blocker)

**Symptom:** create a child block; sometimes it loses its parent, appears in the canvas but not in the sidebar, and cannot be deleted because the canonical document does not contain it. Sometimes a child/sibling is created but no arrow appears.

**Likely causes in M2b:**
- structural commands are not serialized; two quick `addChild`/`addSibling` calls can overlap;
- the created block ID is inferred by a `before/after` diff (`newestBlockId`) instead of the command result;
- targeted ProseMirror insertions are added to text history;
- no reconciliation between the editor buffer and the canonical document after a structural command.

**Required fix:**
- Serialize all structural commands through one queue; `applyStructural` and `createBlock` must not run concurrently.
- Expose the created block ID from the core command result (add `affected` and/or an explicit `createdBlockId` through IPC). Do not infer it from a diff.
- Mark structural ProseMirror transactions `addToHistory: false`; keep text history separate.
- After every structural command, reconcile: every `branchBlock` in the editor must exist in the canonical document, and every canonical block in the active chapter must be in the editor. On mismatch, rebuild from canonical and log a dev warning; never leave a canvas-only block.
- If the core command fails, no editor node is inserted. If the editor insertion fails, rebuild; never leave a half state.
- Add a visible recovery for an existing orphan if one is found: drop it or attach it via an explicit repair prompt; do not silently keep it.

**Regression tests:**
- e2e: rapidly create 3 children (Tab/Control+Enter) without waiting; sidebar count = canvas count = arrow count; each block is deletable.
- e2e: create child + sibling in quick succession; switch tabs; return; no phantom.
- unit: command queue serializes; created ID comes from the result; failed command inserts nothing.
- e2e: create, delete, undo/redo; no orphan.

## 2. Arrow grouping (UX)

- One child: simple orthogonal elbow.
- **Two or more right-placed children in one sibling group: one shared vertical trunk** from the parent's right edge; a short arrow from the trunk to each child at its center. Do not start a separate line at a different parent port per child.
- Wrapped children: one bottom trunk at `parent.left + 18 px`, a horizontal bus 12 px above the first child row, then short arrows into each child top.
- Arrowhead only at the child; no U-turn; 1.25 px neutral, selected path 1.75 px accent.
- Multiple groups: each parent gets its own trunk; trunks may run parallel in the gutter.
- Unit tests: 1 child, 2 children, 5 children, wrapped, mixed; assert one trunk for 2+, arrow direction, endpoint clipping, no backward segment.
- Screenshot: 3 children on the right with one trunk.

## 3. Chapter title inline editing (UX)

- Chapter title is editable directly in the canvas: click the title, edit, `Enter`/`Esc` commits, blur commits; sidebar updates.
- Empty title falls back to “Untitled chapter”.
- Add “+ Add chapter” at the end of the canvas, using the existing `chapter.create` command.
- Keep sidebar rename working and in sync.

## 4. Shell layout (UX)

- Title bar spans the window.
- Sidebar reaches the full content height on the left.
- Tab strip lives only in the editor column, to the right of the sidebar; no tabs above the sidebar.
- Status bar remains at the bottom, full width.
- Keep the splitter and 200% zoom behavior.

## 5. Markdown heading escape (bug/UX)

- Typing `# ` converts the current paragraph to a heading; `## ` and `### ` similarly.
- `Enter` at the end of a heading creates a **normal paragraph** in the same block, not another heading.
- Add a block-type control (H1/H2/H3/Text) in the block toolbar/palette so the user can always escape a heading.
- Do not change the block's identity when changing heading level.

## 6. Editor font and density (visual)

- Editor body uses the same system UI sans as the chrome: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`.
- Body 15.5 px / 1.55; headings 20/18/16 px; code stays JetBrains Mono 13.5 px.
- Block padding 12 → 10 px; block vertical gap 24 → 16 px; editor padding 40 → 28–40 px; canvas max 1,100 → ~1,400 px.
- Remove Source Serif 4 from the renderer CSS and `@fontsource/source-serif-4` from the desktop dependencies (keep JetBrains Mono).
- Update the visual tokens/research reference only if needed; no Settings UI. Font family/size settings are M6.
- Screenshots at 1440×900 and 1024×768.

## 7. Child/sibling affordances (UX)

- Left gutter: six-dot drag handle only.
- **Right edge `+`**: add child; tooltip “Add child”.
- **Bottom edge `+`**: add sibling; tooltip “Add sibling”; appears on hover/selection, does not shift layout.
- Every successful creation shows its arrow (see #1).
- Context menu keeps Add child / Add sibling / Move to… / Detach / Delete.

## 8. Top-level and chapter authoring from the canvas (UX)

- End-of-canvas row: “+ Add top-level block” (current chapter) and “+ Add chapter”.
- These use `addTopLevel`/`createChapter`; focus the new block/title.
- Sidebar actions remain.

## 9. Default landscape + canvas width (product decision)

- New documents default to A4 landscape; existing documents keep their stored orientation.
- Update `packages/core` default page setup, types comment, and tests; update spec v0.4.2 references.
- Editor canvas max ~1,400 px; top-level measure 34 rem remains; the extra width is for children/wide content.
- Page view/PDF consume the orientation in M4; no page renderer in M2c.
- Add a test: new doc `pageSetup.orientation === 'landscape'`; an existing portrait doc stays portrait.

## 10. Keyboard model (product decision)

- `Enter`: new paragraph inside the block.
- `Shift+Enter`: hard line break.
- `Option+Enter` (`Alt-Enter`): new sibling block.
- `Control+Enter`: new child block.
- `Tab`: while editing in a list/code/table, native/list indent; on a selected block (NodeSelection), make child; do not create a child while typing a normal paragraph.
- `Shift+Tab`: outdent on a selected block.
- Remove `Mod-Enter` and `Mod-Shift-Enter` as creation shortcuts (they conflict with platform expectations); keep them out of the palette hints.
- Update the command palette, menus, and any onboarding text.
- e2e: Enter at end of heading/paragraph does not create a block; Option+Enter creates one sibling; Control+Enter creates one child; Tab in a list doesn't create a block.

## 11. Settings deferral

- Do not build a font/size picker in M2c.
- Keep typography in CSS tokens so M6 can expose a Settings panel without refactoring.
- Add a one-line note in the plan/report: font family/size settings are M6.

## Tests and gates

- `npm run typecheck`, `npm test`, `npm run e2e` all pass.
- New e2e regressions: rapid creation/no phantom; sidebar/canvas/arrow parity; chapter inline rename; canvas add top-level/chapter; heading escape; new-document landscape; keyboard map.
- Unit: edge trunk routing; structural command queue/created ID.
- Screenshots: 3-child trunk, denser editor, new layout (sidebar full height/tabs in main column), chapter inline edit, 1024×768.
- axe: no serious/critical regressions.
- 300-block performance must not regress beyond the M2b numbers by more than 20%.
- No screen recording, no Notability.

## Deliverables

- Implemented in `apps/desktop` (+ `packages/core` only for the landscape default and command-result ID if needed).
- Tests and screenshots under `artifacts/m2c/`.
- `docs/reports/m2c-interaction-polish.md` with gate table, measurements, before/after screenshots, known gaps.
- Worktree path, branch, commits, commands.

## Acceptance

The product owner can create child/sibling blocks rapidly without ever seeing a phantom block or a missing arrow; multiple children show one trunk; chapter titles edit in the canvas; Enter stays a line break; the editor uses the UI sans at the new density; new documents are landscape; and the shell has the sidebar full-height with tabs only in the editor column.
