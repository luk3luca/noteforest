# Markdown file view — M1 implementation report

**Task:** `docs/tasks/markdown-file-view.md`, slice **M1 — parse, render, open**
**Design:** `docs/design/markdown-file-view.md` (approved 14 November 2026)
**Role:** Implementer / Builder
**Worktree:** `a builder worktree`
**Branch:** `t3/markdown-file-view-m1`
**Base:** `560c47b` (`main` head at delegation)
**Head:** one commit on this branch; the SHA is reported in the handoff message (a report cannot contain the hash of the commit that introduces it)
**Verdict:** **PASS** for M1 acceptance; M2 is not part of this report.

---

## 1. Summary

A `.md` file now opens as a **guest file** in the same shell, not as a NoteForest note:

- flat Markdown parser/serializer for the declared GFM subset, built on the approved
  `markdown-it` + `prosemirror-markdown` dependencies;
- flat TipTap editor (StarterKit + link + code/inline code + math + tables + image) with the
  existing code/formula/table node views, selection and table toolbars, and prose CSS;
- Continuous-only **Edit/Read**, tab titled by the file basename, a **Markdown file** badge, and
  **no** chapters, blocks, branches, anchors, outline tree, Page, PDF, export, document settings,
  lock, revision, recent-package entry, or canonical schema change;
- open from a `.md` row in the flat library root and from **File → Open Markdown…**;
- local images resolve relative to the `.md` through a confined `noteforest-md://` protocol
  (registered roots, relative paths only, no traversal/symlinks/hidden files, image MIME
  allowlist, 100 MB cap); remote images show a labelled placeholder and are never fetched;
- raw HTML, frontmatter, footnotes, and MDX stay visible as text or a YAML-labelled code block
  and are never executed; unknown syntax is preserved;
- in-memory editing for M1 with an explicit dirty flag (tab dot, status bar, window edited state);
  M2 owns atomic save, `.md.bak`, conflict detection, and the dirty-quit save flow.

The M1 parser/serializer is unit-tested; the flat surface and the file lifecycle are covered by a
new UI suite with screenshots.

## 2. Files changed

### New — main process

- `apps/desktop/src/main/markdown-file.ts` — read a `.md` by absolute path (canonical real path,
  2 MB open guard, UTF-8), register its folder as the image root, resolve relative images to the
  confined URL, serve only image files inside that root (no symlinks, traversal, hidden files,
  absolute paths, or remote URLs).
- `apps/desktop/src/main/markdown-protocol.ts` — `noteforest-md:` scheme registration and handler.
- `apps/desktop/src/main/markdown-protocol-response.ts` — pure URL parser/response builder
  (typed 404, MIME allowlist, `nosniff`, `no-store`, CSP sandbox).
- `apps/desktop/src/shared/markdown.ts` — shared path rules, size cap, image-source classification.
- `apps/desktop/src/shared/api.ts` (modified) — additive `DocumentSummary.kind`, `MarkdownFileView`,
  `MarkdownOpenResult`, `MarkdownImageResolution`, `BootstrapResult.markdownFiles`,
  `open-markdown` menu command, and the four Markdown IPC methods.
- `apps/desktop/src/main/index.ts` (modified) — scheme registration/install, Markdown IPC,
  bootstrap `markdownFiles`.
- `apps/desktop/src/main/library.ts` (modified) — root `.md` rows in `scanLibrary` (never package
  validation, never a recent entry), session restore by path with a type-safe read error.
- `apps/desktop/src/main/menu.ts` (modified) — File → **Open Markdown…** (⇧⌘O).
- `apps/desktop/src/preload/index.ts` (modified) — narrow preload methods.
- `apps/desktop/src/renderer/index.html` (modified) — `noteforest-md:` in `img-src`.

### New — renderer

- `apps/desktop/src/renderer/src/markdown/flat-schema.ts` — the approved flat extension set and the
  one schema used by parser, serializer, and editor; no forest nodes/keymap/anchor decorations.
- `apps/desktop/src/renderer/src/markdown/markdown-parse.ts` — Markdown → flat ProseMirror JSON
  (headings 1–6, paragraphs/breaks, lists, blockquotes, fenced/indented code, inline code,
  emphasis/strong/strike, external links, images, GFM tables with alignment, `$…$`/`$$…$$`, HR;
  raw HTML/frontmatter/footnotes/MDX fallbacks; schema-validated with whole-source fallback).
- `apps/desktop/src/renderer/src/markdown/markdown-serialize.ts` — normalized Markdown serializer
  for the same subset (`prosemirror-markdown`).
- `apps/desktop/src/renderer/src/markdown/MarkdownImageView.tsx` — inline image + confined URL
  resolution + remote/missing/unsafe placeholders.
- `apps/desktop/src/renderer/src/markdown/MarkdownFileEditor.tsx` — the flat Edit/Read surface,
  history, badge, path, error surface.
- `apps/desktop/src/renderer/src/markdown/markdown-editor-registry.ts` — routes global
  `⌘Z`/`⇧⌘Z` and header undo/redo to the flat editor.
- `apps/desktop/src/renderer/src/state/markdown.ts` — parsed file content, explicit dirty flag,
  open/close/re-open without discarding in-memory edits.

### Modified — renderer shell

- `App.tsx` — Markdown tab bootstrap/session restore, continuous-only view restoration, dirty
  window state, Markdown tab state probe, `⌘⇧L` guard.
- `actions.ts` — `openMarkdownPath`, `openMarkdownDialog`, active-Markdown guards for layout,
  zoom, focus, export, save, undo/redo, library/tab menus, palette, `open-markdown` command.
- `shell/Workspace.tsx` — mounts the flat editor for Markdown tabs (kept alive across tab switches).
- `shell/TabBar.tsx` — file icon, Markdown title, dirty dot from the Markdown store.
- `shell/Toolbar.tsx` — hides the inoperative canvas zoom stepper for Markdown.
- `shell/StatusBar.tsx` — Markdown file/unsaved state; no note block counts.
- `shell/Sidebar.tsx` — Markdown row kind, no outline tree, no false note counts.
- `shell/Dialogs.tsx` — dirty Markdown tab discard confirmation.
- `shell/CommandPalette.tsx` — Markdown hint/action and a Markdown-specific command set.
- `editor/SelectionToolbar.tsx` — optional Markdown variant hides branch-from-selection and the
  forest math dialog; formatting/link controls are shared.
- `state/shell.ts` — additive `TabInfo.kind`, `markdown-discard` dialog state.
- `state/session.ts` — Markdown tabs persist by path; layout forced continuous.
- `styles.css` — Markdown surface, badge, h4–h6, table wrapper, image/placeholder, error styles.
- `apps/desktop/package.json`, `package-lock.json` — approved `markdown-it@14.3.3`,
  `prosemirror-markdown@1.13.9`, `@types/markdown-it@14.2.0` (MIT, no runtime network).

### Tests / suites

- `apps/desktop/test/markdown-parse.test.ts` — 7 tests.
- `apps/desktop/test/markdown-serialize.test.ts` — 8 tests (normalized round-trip, backtick/space edge cases).
- `apps/desktop/test/markdown-files.test.ts` — 9 tests (read, path rules, image classification, traversal,
  symlink, MIME/protocol, URL shape).
- `tests/ui/markdown-file-view.test.mjs` — open from the library and File → Open, full subset render,
  no forest/Page/PDF chrome, local image + remote placeholder, raw HTML/frontmatter text, Edit
  dirty/undo/redo, Read non-editable/no toolbar, bytes unchanged, dirty-close discard prompt,
  document-settings absence, session restore by path, screenshots.
- `tests/ui/suites.mjs`, `tests/ui/run.mjs` — registered the suite and the `markdown` group.

## 3. Checks run

| Check | Command | Result |
|---|---|---|
| Boundaries | `npm run check:boundaries` (inside `verify:fast`) | PASS — 244 files, 1,163 imports, 16 rules |
| Typecheck | `npm run typecheck` | PASS — desktop, core, layout, pdf |
| Unit | `npm test` | PASS — **142 files / 1,401 tests**, 4.87 s |
| Critical e2e | `npm run e2e` (inside `verify:fast`) | PASS — 16/16, suite 35.1 s, total 43.2 s |
| Fast gate | `npm run verify:fast` | **exit 0** |
| Markdown UI | `node tests/ui/run.mjs --group markdown --concurrency 2` | PASS — 1/1, 9.7 s |
| Library UI | `node --test tests/ui/library-surface.test.mjs` | PASS — 7/7, 16.3 s |
| Shell UI | `node --test tests/ui/m2-shell.test.mjs` | PASS — 4/4, 11.6 s |
| Adjacent UI (2 workers) | `node --test --test-concurrency=2` on `v0-shell-frame`, `ui-batch-a`, `document-lifecycle`, `special-text` | PASS — 32/32, 38.0 s |

No full `verify` was run; the Orchestrator owns the integration run.

### Evidence screenshots

Visible-window run at 1440×900; artifacts are disposable test output under `artifacts/`:

- `artifacts/markdown-file/edit-top.png` — Edit, document start: frontmatter block, h1/h2/h6,
  bold/italic/strike/inline code/link, nested lists, ordered list, blockquote, code block, table,
  math start; Markdown badge, Edit/Read, Library/Outline sidebar.
- `artifacts/markdown-file/edit-bottom.png` — rendered table, inline + block math, horizontal rule,
  local image, remote placeholder, raw HTML/MDX text; dirty dot and "Unsaved changes".
- `artifacts/markdown-file/read-top.png` — Read mode selected, same content, no formatting toolbar.
- `artifacts/markdown-file/read-bottom.png` — Read mode table/math/image/placeholder.
- `artifacts/markdown-file/tab.png` — `fixture.md` tab with file icon and no zoom stepper.

## 4. Acceptance criteria (M1)

| Criterion | Status | Evidence |
|---|---|---|
| `.md` opens in a tab and renders the declared subset | **PASS** | UI suite: headings 1/2/6, marks, nested/ordered lists, blockquote, code, table alignment, inline/block KaTeX, HR, local image (naturalWidth 320), remote placeholder; parser unit tests cover indented code, hard break, task list, footnotes, MDX |
| Raw HTML/frontmatter/footnotes/MDX = plain text/placeholder, never executed | **PASS** | parser/UI tests: visible text, YAML code block, no `script/iframe/style` nodes |
| Flat editor set, no forest/Page/PDF chrome | **PASS** | `.nf-markdown-editor` has 0 block cards/chapters/edges, 0 page counter/export/layout controls; outline says "A Markdown file has no outline." |
| File → Open Markdown… and library `.md` row | **PASS** | native File menu includes "Open Markdown…"; UI opens from the library and mocks the picker for an outside path |
| Tab keyed by absolute path, basename title, dirty dot, no document settings | **PASS** | tab kind/path asserted; dirty dot/status; `documentSettings` has no Markdown entry |
| Library `kind` additive; not a broken package | **PASS** | `DocumentSummary.kind = 'markdown'`, status `ok`, no reason row, no block/chapter counts shown |
| Recents/session use the path | **PASS (session)** | session JSON stores both Markdown paths and restores both on relaunch; no fake document id. The package recent manifest intentionally stays note-only (see risk 4) |
| In-memory M1 editing with explicit dirty state; no writes | **PASS** | file bytes unchanged after Edit/Read; dirty flag + status; undo/redo routed; no autosave/write path exists |
| Local images relative, confined; remote placeholder | **PASS** | unit tests for traversal/symlink/absolute/remote/hidden/MIME; UI local image loads and remote placeholder renders; no fetch |
| No schema/settingsVersion/Page/PDF/export/showcase change; no fixed sleeps/native dialogs | **PASS** | `git diff` contains no schema/settings/Page/PDF/showcase change; UI test has no sleeps and mocks the picker; protocol tests are pure |
| Targeted tests + one `verify:fast`; no full verify | **PASS** | table above |

## 5. Risks and known limitations

1. **M1 in-memory edits are lost on quit/window close.** There is no save path by design; a dirty
   tab close asks before discarding, but quitting the app does not prompt. M2 owns autosave,
   `⌘S`, atomic write, dirty-quit Save/Don't Save/Cancel, and `.md.bak`; this is a known M1
   limitation, not a silent write.
2. **Frontmatter is shown as a YAML-labeled code block.** It is never executed and the bytes stay
   visible, but the M2 serializer would write it as a fenced YAML block rather than re-emitting
   `---` frontmatter. A follow-up can add a raw frontmatter placeholder node or a serializer
   special case.
3. **A Markdown file whose images live in a subfolder inside the library root** (for example
   `assets/pic.png`) resolves and renders correctly, but the existing library scan still lists that
   folder as a package folder without `document.json` (a missing-package row). The `.md` itself is
   never a broken package. Vault folders (`docs/design/library-and-documents.md`) are the proper
   fix; the UI evidence uses a root-level image.
4. **Recents manifest stays note-only.** Markdown tabs persist by absolute path in the session and
   the flat library row is always available; no synthetic document id was added to the package
   recent manifest.
5. **Dirty is conservative**: undoing back to the original content does not clear it. M2 can compare
   a content hash when save exists.
6. **Remote images are placeholders only**, and a 2 MB open cap refuses a large `.md` with a clear
   error (M2 plans a read-only large-file mode).
7. **Reused forest node views:** the formula source editor still shows a disabled "Branch from term"
   action because the shared node view always renders it; there are no block anchors or branches in
   a Markdown file. This is editor chrome inside the formula source, not a forest surface.
8. **Serializer is not wired to a save command in M1** (correct for the slice); it is unit-tested and
   ready for M2.
9. **Screenshot artifacts are gitignored** (standard for this repo); the paths above are the
   evidence for the reviewer and remain in the worktree.

## 6. Open questions / next step

- Product-owner decision for **frontmatter preservation on save** (risk 2) before M2 is accepted.
- M2: atomic save + `⌘S`/autosave, `.md.bak`, base mtime/size/hash and Reload/Overwrite/Cancel,
  external delete/move tab state, large-file read-only mode, dirty quit flow, copy/paste evidence
  into a note.
- Then the targeted M1 Sentinel review and integration.

No product decision, spec, UX, ADR, plan, schema, settings version, Page/PDF/export, or showcase
file was changed.
