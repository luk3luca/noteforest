# Phase 2 — Markdown file view (barebone)

**Role:** Implementer / Builder
**Phase:** 2 (post-A–F)
**Base:** `main` at delegation
**Worktree:** created by the delegate; one commit per slice or one commit total per the brief
**Design:** `docs/design/markdown-file-view.md` (approved 14 November 2026)
**Timebox:** 2 days per slice (M1, then M2)

## Product model

A `.md` file is a **guest file**, not a NoteForest note:

- opens in a tab titled by the file name, Continuous only, Edit/Read;
- no document id, revision, package lock, anchors, branches, DAG, Page/PDF, export;
- parsed into the existing content schema and rendered with the same prose styles;
- edits save back to the same file; no per-document Page settings.

## Slice M1 — parse, render, open

### Parser/serializer

- Declared GFM subset from the design: headings, paragraphs/breaks, lists (bullet/ordered/nested),
  blockquotes, fenced/indented code with language, inline code, emphasis/strong/strikethrough, links,
  local images, GFM tables, inline/block math, horizontal rule.
- Raw HTML, frontmatter, footnotes, MDX: plain text/placeholder, never executed or silently dropped.
- A deterministic serializer for the same subset; output is normalized Markdown, not byte-identical.
- Local image paths resolve relative to the `.md`; a confined file protocol is used; remote images
  are not fetched. No path traversal outside the file's folder tree.
- Dependency gate: a Markdown parser/serializer is **new**. Proposed: `markdown-it` +
  `prosemirror-markdown` (both MIT, no runtime network). Ask the Orchestrator/product owner before
  adding; if not approved, stop and report. Do not vendor a parser.

### Flat editor

- Add a **flat extension set**: StarterKit + link + code block + inline code + math + tables + image
  + selection toolbar; **no** `ChapterNode`, `BlockNode`, `BlockBodyNode`, `BranchChildrenNode`,
  `CalloutLaneNode`, anchor decorations, or forest keymap.
- Reuse the code/formula/table/image node views and prose CSS.
- Hide forest chrome: no block labels/menus, no outline tree, no Page toggle; a clear “Markdown file”
  badge in the tab/header.
- Read mode is `editable: false`; no toolbar; no Page control.

### Open and tab

- File → Open Markdown… and a `.md` row in the flat library root.
- Tab keyed by absolute path; title = basename; dirty dot; no document settings.
- Library: `DocumentSummary` gets an additive `kind: 'note' | 'markdown'` or a separate `files`
  list; do not fake block/chapter counts for a Markdown file.
- Recents/session store the path; no `document-settings` entry.

## Slice M2 — save, conflict, copy/paste

- Autosave with a short debounce + `⌘S`; atomic write (`tmp` → rename); UTF-8; one `.md.bak` with
  the previous bytes; no rotating history.
- Base `mtime` + size/hash on open/after save; before writing, re-stat; if changed outside, show
  **Reload / Overwrite / Cancel**; never silently merge.
- External delete/move: mark the tab missing; no silent recreate.
- Dirty tab participates in the same Save / Don't Save / Cancel quit flow.
- Size guard: above a documented cap, open read-only with a message instead of freezing.
- Copy/paste: select paragraph/table/formula/code in the Markdown tab, paste into a NoteForest note;
  assert rich nodes. Fallback if a node does not survive: “Copy as Markdown” on the selection and
  “Paste as Markdown” in the note.
- No Page/PDF/export.

## Tests

Unit: parser fixtures for every supported construct and fallback; serializer/round-trip; relative
image resolution/traversal; conflict detection; atomic write; size cap; input-rule list cases if
touched.

UI: open from library and File → Open; render all supported nodes; Edit → type → autosave/⌘S →
reopen and assert bytes; Read does not write; no Page/PDF controls; external change
Reload/Overwrite/Cancel; copy paragraph/table/formula/code into a note; missing file; dirty quit
prompt; screenshots; no pageErrors.

## Acceptance

- [ ] `.md` opens in a tab and renders the declared subset.
- [ ] Editing + autosave/⌘S writes the file atomically; `.md.bak`; conflict dialog; no silent
      overwrite.
- [ ] Read mode never writes; no forest/Page/PDF chrome.
- [ ] Copy/paste into a note preserves text/marks/table/formula/code.
- [ ] No note schema/settingsVersion/Page/PDF/export/showcase change; no fixed sleeps/native dialogs.
- [ ] Library does not treat a `.md` as a broken package.

## Out of scope

- Vault folders (phase 5), Markdown-native forest, anchors/branches in `.md`, Page/PDF/export,
  Markdown import as forest/builder, remote images, sync/plugins/wikilinks, frontmatter editing.

## Report

- `docs/reports/markdown-file-view.md`: per-slice summary, files, checks with timings, PASS/FAIL,
  risks, next step. One commit per slice; worktree/branch/head. No full verify.
