# Markdown file view — barebone design

**Status:** approved direction (14 November 2026). No implementation yet.
**Scope:** open a `.md` file in the canvas, render it, edit it, save it. Not a NoteForest
note, not a second canonical format, not a Page/PDF surface.
**Related:** `docs/design/markdown-import-export.md` (future, not this), `AGENTS.md`
(“Agent-friendly authoring”), `docs/plan.md` M5.

## 1. Why

A user keeps Markdown notes in Obsidian or any other editor and wants to open one here, read it,
and copy a paragraph, a table, a formula, or a code snippet into a NoteForest note. The app already
has the renderer, the content schema, KaTeX, lowlight, tables, and images. The missing piece is a
small **flat file surface**, not a full Markdown-native note format.

The inverse is also true: NoteForest is not a Markdown editor. Massive edits, export, plugins, sync,
and attachment management stay in Obsidian or wherever the file already lives.

## 2. What it is

A `.md` file is a **guest file** in the same canvas:

- opens in its own tab, titled by the file name;
- Continuous only, **Edit** and **Read**;
- parsed into the existing content schema and rendered with the same prose styles;
- edits are saved back to the same `.md` file;
- no chapters, blocks, branches, anchors, shared children, DAG;
- no Page, no PDF, no Markdown export;
- no document id, no revision, no package lock, no per-document Page settings.

It is not a NoteForest document. It is a file with a flat content body.

## 3. Non-goals

- Markdown-native notes with anchors/branches/DAG (would need a sidecar; separate ADR).
- Page layout, pagination, PDF, export.
- Markdown import as forest (the future builder/agent path).
- Vault folders (separate library design; a `.md` can live in the root now and in folders later).
- A second editor stack, plugins, sync, wiki links, backlinks, or a Markdown vault.
- Byte-identical round-trip with other editors; the serializer normalizes.

## 4. Parsing subset

Support a declared GFM subset and fail soft on the rest:

| Markdown | Content |
|---|---|
| ATX headings `#`–`######` | `heading` nodes (levels 1–3 in this editor; 4–6 render as paragraphs with a level label or are mapped down) |
| paragraphs, hard/soft breaks | `paragraph`, `hardBreak` |
| bullet/ordered lists, nesting | `bulletList` / `orderedList` / `listItem` |
| blockquotes | `blockquote` |
| fenced code with language, indented code | `codeBlock` with `language` |
| inline code | `code` mark |
| emphasis/strong/strikethrough | `em` / `strong` / `strike` |
| links | `link` mark; external links render, internal links are text |
| images (local relative paths) | `image` with a file URL; remote images show a placeholder |
| GFM tables | table nodes, inline-only cells |
| `$…$` / `$$…$$` | inline/block math |
| horizontal rule | `horizontalRule` |
| task lists | read as list items with a literal checkbox or plain text (v1) |
| raw HTML, footnotes, frontmatter, MDX | shown as plain text / a labeled placeholder; never executed |
| unknown syntax | preserved as text, never dropped silently |

The parser is a **view adapter**: it does not create a `Document`, an id, or a forest App. The
content is a flat ProseMirror document.

## 5. Editor

- A **flat extension set**: StarterKit + link + code block + inline code + math + tables + image +
  anchor-free prose. **No** `ChapterNode`, `BlockNode`, `BlockBodyNode`, `BranchChildrenNode`,
  `CalloutLaneNode`, or anchor decorations.
- Reuse: code block node view/chrome, formula node view, table toolbar, image node view, selection
  toolbar, prose CSS, Edit/Read gating.
- Hide forest chrome: no block labels, no block menus, no Add child/sibling, no anchor menu, no
  outline tree, no Page toggle. A file badge in the tab/header.
- Read mode: `editable: false`, no toolbar; links remain readable; no Page.
- The editor's flat document is the single source for the view; save serializes it to Markdown.

## 6. File lifecycle and save

- **Open**: File → Open Markdown… (and a `.md` row in the flat library root; folders later).
- **Tab**: keyed by absolute path; title = file basename; dirty dot; close does not write an
  unchanged file.
- **Save**: autosave with a short debounce **and** `⌘S`; atomic write (`tmp` → rename); UTF-8.
- **Conflict**: record the base `mtime` and size/hash on open and after each save. Before writing,
  re-stat; if the file changed outside, do not overwrite: show **Reload** / **Overwrite** / **Cancel**.
  Never silently merge.
- **External delete/move**: mark the tab missing; no silent recreate; the user can Save As… (filed
  under a future follow-up) or close.
- **No package lock**: a `.md` is an ordinary file; another editor can open it. The conflict check is
  the safety net.
- **Backups**: one last-write `.md.bak` next to the file is optional; v1 may skip rotating backups and
  document that the OS/Time Machine is the recovery net. If skipped, the save must still be atomic.
- **Size guard**: parse synchronously up to a documented cap (for example 1–2 MB); above it, open
  read-only with a message instead of freezing the window.

## 7. Images and paths

- Local images resolve **relative to the `.md` file**, through a confined file protocol; no path
  traversal outside the file's folder tree.
- Remote images are not fetched (no outbound network); show the alt text/placeholder.
- No copying into `assets/`: the `.md` keeps its own relative layout. A future “Insert into note”
  action can copy the bytes into the destination package.
- The Markdown file's folder is the asset root for that file; hidden files and symlinks are rejected
  or shown as placeholders.

## 8. Copy/paste into a NoteForest note

This is the main use case:

- select a paragraph, table, formula, or code snippet in the Markdown tab, copy, paste into a note;
- ProseMirror's clipboard carries the rich nodes; the paste rules already normalize tables, math, and
  code;
- test explicitly: text with marks, a GFM table, an inline/block formula, a code fence, a local image;
- fallback if a node does not survive: **Copy as Markdown** on the selection, and **Paste as
  Markdown** in the note (a deterministic converter for the same subset);
- copying from a note into the Markdown file is not a goal; read/edit there, not round-trip.

## 9. Library and shell

- Minimal v1: a `.md` at the library root is listed as a file row with a file icon; opening it uses
  the Markdown surface. File → Open Markdown… also works.
- `DocumentSummary` gains an additive `kind: 'note' | 'markdown'` (or the library exposes a separate
  `files` list) so the UI does not fake block/chapter counts for a Markdown file.
- Recents/session store the path; no document id, no `document-settings` entry.
- Rename, reveal, Move to Trash: path-level operations. A missing file shows the recovery surface.
- Vault folders extend the same model later: a `.md` is a leaf in the folder tree.

## 10. Save/conflict and Read-mode rules

- Opening never mutates the file.
- Read mode never writes; Edit mode may autosave.
- A conflict dialog is the only destructive choice; Escape/Cancel keeps the file untouched.
- Closing a dirty tab prompts Save / Don't Save / Cancel (same shell pattern as notes).
- No native dialogs in tests; the test dialog guard records them.

## 11. Tests

Unit:

- parser fixtures for every supported construct; unknown/HTML/frontmatter fallbacks;
- serializer fixtures and a normalized round-trip (`md → content → md`);
- relative image resolution and traversal rejection;
- conflict detection (mtime/size/hash) and atomic write;
- large-file cap.

UI:

- open a `.md` from the library and from File → Open;
- render paragraphs, headings, lists, code, math, table, image;
- Edit → type → autosave/⌘S → reopen and assert the file bytes;
- Read mode does not write; Page/PDF controls are absent;
- external change → Reload/Overwrite/Cancel;
- copy a paragraph/table/formula/code from the Markdown tab and paste into a note; assert rich nodes;
- missing file state; close dirty prompt; no page errors; screenshots.

## 12. Slices

- **M1 — parse/render/open**: parser + flat editor + tab + Read/Edit + library/file open + tests.
- **M2 — save/conflict/copy**: atomic save, conflict dialog, autosave, copy/paste evidence, large-file
  guard, screenshots.
- **M3 (only if real use demands it)**: vault folders, richer task lists, frontmatter display,
  “Insert into note” with asset copy.

Estimate: **1–2 batches** for M1+M2. The parser/serializer is the main risk; the runtime is a file,
not a second document backend.

## 13. Decisions

Dependencies: the product owner approved `markdown-it` + `prosemirror-markdown` (MIT) on
14 November 2026 for the parser/serializer. No runtime network; no second parser stack.

Resolved by the Orchestrator for the barebone (14 November 2026); the product owner can override any
of them before the brief:

1. **Autosave + `⌘S`**, with the conflict check below. A file that is also open in Obsidian must not
   be overwritten silently.
2. **Atomic write + one `.md.bak`** (the previous bytes) next to the file; no rotating history.
3. **Headings 1–6 in the flat editor** (separate configuration from the forest editor, which keeps
   1–3); 4–6 use smaller styles. The canonical note schema is unchanged.
4. **Task lists:** literal `- [ ]` text in v1; a read-only checkbox rendering is a later polish.
5. **Library v1:** a `.md` at the library root is listed and openable; vault folders come later.
6. **Quit flow:** yes, a dirty `.md` tab participates in the same Save / Don't Save / Cancel prompt.

