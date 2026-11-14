# Markdown file view — M2 implementation report

**Task:** `docs/tasks/markdown-file-view.md`, slice **M2 — save, conflict, copy/paste**
**Design:** `docs/design/markdown-file-view.md` (approved 14 November 2026)
**Frontmatter decision:** product owner, 14 November 2026 (verbatim, read-only prefix)
**Role:** Implementer / Builder
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-f0222b39-63352c0e9dcee0f9`
**Branch:** `t3/markdown-file-view-m2-save-conflict`
**Base:** `b5f306e` (`main` head at delegation; M1 is in this base)
**Head:** the single commit on this branch; its SHA is reported in the handoff message (a report cannot contain the hash of the commit that introduces it)
**Verdict:** **PASS** for M2 acceptance, with the risks below.

---

## 1. Summary

A Markdown guest file is now safe to edit:

- **Save**: 700 ms debounced autosave plus `⌘S`; serialization with the existing deterministic
  Markdown serializer; the main process writes UTF-8 atomically (temp file → fsync → rename,
  preserving the file mode) and keeps exactly one `<name>.md.bak` with the previous bytes. There is
  no rotating history.
- **Conflict**: open and every successful save record `mtime` + size + SHA-256. Before a write the
  main process re-stats, reads the current bytes, and compares the fingerprint; it re-checks once
  more after the temp file is durable and before the rename. A changed base is never overwritten:
  **Reload / Overwrite / Cancel** is the only choice. Reload discards local edits and re-renders the
  disk version; Overwrite is the only destructive path and backs up the external bytes; Cancel
  writes nothing and pauses autosave (`External change` in the status bar).
- **External delete/move**: the tab is marked missing (tab `!`, banner, status), further edits are
  blocked, and no save ever recreates the path.
- **Dirty quit**: the renderer flush reports dirty guest files; the main close/quit flow adds them to
  the exact same Save / Don't Save / Cancel prompt as notes; Save asks the renderer for the atomic
  writes before the window closes.
- **Large-file cap (documented)**: `MAX_MARKDOWN_BYTES = 2 MB`. Above it the file is **not read or
  parsed**: the tab opens a read-only “Markdown file is too large” panel with the size, reason, and
  path. Nothing is written, and the window cannot freeze on a 50 MB file.
- **Frontmatter**: the parser keeps the exact `---…---` prefix (BOM/CRLF/trailing newline included)
  as an atomic read-only `frontmatter` node; the editor renders it as a labelled **Frontmatter**
  block, not an editable YAML fence; a transaction guard prevents a user edit from deleting or
  changing it; the serializer re-emits the raw bytes byte-for-byte before the normalized body. A
  file without frontmatter is unchanged. Reload is the only path allowed to replace the prefix.
- **Copy/paste into a note**: real platform `⌘C` / `⌘V` carries a paragraph with every mark, a GFM
  table, an inline formula, a block formula, and a code block into a NoteForest note. All five
  survive as rich nodes; **no “Copy as Markdown”/“Paste as Markdown” fallback was needed** for the
  required subset.
- **Formula action row**: in a flat guest editor the shared formula source row hides
  **Branch from term** (no block anchors/branches exist). Copy formula and Inline/Block remain. The
  row carries `data-formula-no-branch="true"` and an explanatory title; no dead control is shown.

No NoteForest note schema, `settingsVersion`, Page/PDF/export, settings, or showcase file changed.
A `.md` still creates no document runtime, lock, revision, document-settings entry, or recent-package
entry.

## 2. Files changed

### Main / shared / bridge

- `apps/desktop/src/shared/markdown.ts` — documented 2 MB editable cap, fingerprint type and
  `markdownFingerprintChanged`.
- `apps/desktop/src/shared/api.ts` — additive `MarkdownFileView.base/readOnly/readOnlyReason/
  tooLarge`, `MarkdownPendingFile`, save input/result types, `MarkdownFlushResult`,
  `FlushResult.pendingMarkdown`, `saveMarkdownFile`, `onRequestMarkdownSave`.
- `apps/desktop/src/shared/flush.ts` — validates the pending-Markdown list in a flush and adds
  `normalizeMarkdownFlushResult`.
- `apps/desktop/src/main/markdown-file.ts` — full re-read rules: 2 MB read-only panel, open
  fingerprint, atomic save, backup, conflict detection (before backup and before rename), missing
  handling, error mapping, mode preservation.
- `apps/desktop/src/main/index.ts` — `markdown:save` IPC, `app:request-markdown-save` /
  `app:markdown-save-done`, and the guest files in the existing close/quit prompt (E2E save branch
  included).
- `apps/desktop/src/main/library.ts` — the restore-failure view carries the new required fields.
- `apps/desktop/src/preload/index.ts` — `saveMarkdownFile` and `onRequestMarkdownSave`.

### Renderer

- `apps/desktop/src/renderer/src/markdown/frontmatter.ts` — exact prefix split (BOM/CRLF aware).
- `apps/desktop/src/renderer/src/markdown/frontmatter-node.ts` — atomic read-only node, labelled DOM
  node view, transaction guard, reload escape hatch.
- `apps/desktop/src/renderer/src/markdown/flat-schema.ts` — adds the frontmatter node (guest schema
  only).
- `apps/desktop/src/renderer/src/markdown/markdown-parse.ts` — frontmatter split on the original
  bytes, body normalization only.
- `apps/desktop/src/renderer/src/markdown/markdown-serialize.ts` — byte-identical prefix before the
  normalized body.
- `apps/desktop/src/renderer/src/markdown/markdown-save.ts` — per-path save queue, 700 ms autosave,
  conflict/missing handling, explicit reload/overwrite, dirty flush for quit.
- `apps/desktop/src/renderer/src/markdown/markdown-editor-registry.ts` — flat-editor marker (for the
  formula row) and the existing editor lookup.
- `apps/desktop/src/renderer/src/markdown/MarkdownFileEditor.tsx` — autosave hook, flat marker,
  read-only/missing banner, too-large panel, Edit gating.
- `apps/desktop/src/renderer/src/markdown/MarkdownImageView.tsx` — guest HTML serialization is a
  placeholder (no raw remote/local `src` fetch); `data-src` is still parsed back.
- `apps/desktop/src/renderer/src/state/markdown.ts` — base/read-only/missing/saving/conflict/last-save
  state and save actions.
- `apps/desktop/src/renderer/src/actions.ts` — `⌘S` for guest files, Save/Don’t Save/Cancel close
  path, autosave pause when the close dialog opens.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — Markdown close prompt and the
  Reload/Overwrite/Cancel conflict dialog.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — Saved / Saving / Unsaved / External change /
  Save failed / Read-only / File missing, with a reason.
- `apps/desktop/src/renderer/src/state/shell.ts` — `markdown-close` / `markdown-conflict` dialogs.
- `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts` — guest editors hide Branch from
  term; the forest row is unchanged.
- `apps/desktop/src/renderer/src/App.tsx` — pending guest files in the flush, `onRequestMarkdownSave`,
  read-only session restore, test probes (`saveNow`, `markdownSelect`), status fields.
- `apps/desktop/src/renderer/src/global.d.ts` — the two test probes.
- `apps/desktop/src/renderer/src/styles.css` — frontmatter block, banner, and code-block positioning
  in the flat surface.

### Tests / evidence

- `apps/desktop/test/markdown-save.test.ts` — new: fingerprint, 2 MB read-only (no read/parse),
  atomic UTF-8 save, `.bak` previous bytes, conflict, explicit overwrite, missing never recreated,
  no-op save, invalid paths.
- `apps/desktop/test/markdown-parse.test.ts` — frontmatter node exact prefix (colons, quotes,
  comments, CRLF), unterminated/later `---` not frontmatter.
- `apps/desktop/test/markdown-serialize.test.ts` — YAML round-trip byte-identical prefix, no YAML
  fence, frontmatter-only file.
- `apps/desktop/test/lifecycle.test.ts` — pending guest files survive flush normalization;
  Markdown flush normalization.
- `tests/ui/markdown-file-view.test.mjs` — rewritten for M1+M2: open/render/frontmatter/read-only
  formula row (including the File → Open Markdown… outside-path regression); autosave + `⌘S` +
  `.bak` + Read no-write + close prompt + dirty quit; conflict Cancel/Reload/Overwrite + missing;
  2 MB read-only; rich paragraph/table/inline/block formula/code copy into a note.
- `artifacts/markdown-file/*.png` — screenshots (disposable, gitignored; remain in the worktree).

## 3. Checks run

| Check | Command | Result |
|---|---|---|
| Boundaries | `npm run check:boundaries` | PASS — 247 files, 1,185 imports, 16 rules |
| Typecheck | `npm run typecheck` | PASS — desktop, core, layout, pdf |
| Unit | `npm test` | PASS — **143 files / 1,414 tests**, 4.98 s |
| Critical e2e | `npm run e2e` | PASS — 16/16, suite 35.1 s, total 43.3 s |
| **Fast gate** | `npm run verify:fast` | **exit 0** |
| Markdown UI | `node tests/ui/run.mjs --group markdown --concurrency 1` | PASS — 1/1 suite, **5/5 tests**, 17.6 s |
| Adjacent UI (2 workers) | `node --test --test-concurrency=2` on `m2-shell` + `library-surface` | PASS — 11/11, 16.5 s |
| Adjacent UI (2 workers) | `node --test --test-concurrency=2` on `special-text` + `ui-overlay-command-gate` | PASS — 16/16, 19.8 s |
| Lifecycle UI (serial) | `node --test tests/ui/document-lifecycle.test.mjs` | PASS — 9/9, 17.2 s |

No full `npm run verify` was run; the Orchestrator owns the integration run. No fixed sleeps and no
native dialogs were used; the UI suites ran at concurrency ≤ 3.

### Evidence

Visible-window runs at 1440 × 900; paths are repo-relative and gitignored:

- `artifacts/markdown-file/frontmatter-readonly.png` — labelled Frontmatter block with the exact YAML
  (colons/quotes/comment), followed by the rendered subset; code-block chrome is now inside its own
  block.
- `artifacts/markdown-file/save-state.png` — after autosave: status **Saved / Saved to disk**, edited
  body, local image, remote placeholder.
- `artifacts/markdown-file/conflict.png` — external change dialog: **Cancel / Reload / Overwrite**,
  status `External change`, file bytes unchanged.
- `artifacts/markdown-file/large-readonly.png` — 2 MB file: read-only “too large” panel, lock tab,
  Edit disabled, status Read-only.
- `artifacts/markdown-file/copy-paste-note.png` — pasted block formula and code block (plus the
  paragraph/table/inline formula asserted by the suite) in a NoteForest note.
- `artifacts/markdown-file/tab.png` — `fixture.md` tab with the Markdown badge and no Page control.
- `artifacts/markdown-file-temp/markdown-save-library/fixture.md.bak` — the backup asserted equal to
  the previous bytes by the UI test; no rotating history exists.

## 4. Acceptance criteria (M2)

| Criterion | Status | Evidence |
|---|---|---|
| Autosave with a short debounce + `⌘S` | **PASS** | 700 ms debounce; UI types then waits for the file, and `⌘S` writes immediately; status Saved |
| Atomic write (`tmp` → rename), UTF-8 | **PASS** | unit: temp/fsync/rename, Unicode bytes, no `.tmp` left; UI save/reopen |
| One `.md.bak` with the previous bytes; no rotation | **PASS** | unit + UI: first save backup = original, second save backup = first save; exactly one `.bak` path |
| Base mtime + size/hash on open/after save; re-stat before write | **PASS** | unit fingerprint/conflict; main re-checks before backup and before rename; UI conflict |
| Changed outside → Reload / Overwrite / Cancel, no silent write | **PASS** | UI Cancel leaves external bytes; Reload shows external content; Overwrite writes local content and backs up external bytes |
| External delete/move marks the tab missing; no recreate | **PASS** | UI missing banner/tab marker; `save` returns `missing`; `stat` still rejects |
| Dirty `.md` participates in the Save / Don’t Save / Cancel flow | **PASS** | renderer close prompt tested; flush reports pending guest files (unit + main wiring); E2E quit branch saves the dirty file and a relaunch reads it |
| Large-file cap documented (1–2 MB): read-only with a message | **PASS** | 2 MB documented in `shared/markdown.ts`; above it no read/parse; unit + UI panel |
| Frontmatter preserved verbatim and read-only; exact prefix on save | **PASS** | schema guard, exact CRLF/BOM split, YAML colons/quotes/comments round-trip, frontmatter-only file, UI label/no editing |
| Copy/paste paragraph/table/formula/code into a note, rich nodes | **PASS** | UI: bold/italic/strike/code/link marks, `table`, `inlineMath`, `mathBlock`, `codeBlock` in canonical note content |
| Fallback Copy/Paste as Markdown only if a node fails | **PASS** | not needed: all required nodes survived the real platform clipboard path |
| Hide “Branch from term” in a guest formula, no dead control | **PASS** | UI: 0 `branch-from-term` buttons; `data-formula-no-branch` + reason; Copy/Inline/Block remain |
| Read mode never writes; no forest/Page/PDF chrome | **PASS** | UI Read + save command leaves bytes and mtime; 0 block cards, Page/PDF/export controls |
| No note schema/settingsVersion/Page/PDF/export/showcase change | **PASS** | `git status` contains only the guest-file, shared contract, tests, and styles; no schema/settings/showcase diff |
| No fixed sleeps/native dialogs; targeted UI ≤ 3 | **PASS** | condition waits only; native close prompt is bypassed by the E2E branch; UI concurrency 1–2 |

## 5. Risks and known limitations

1. **Large files above 2 MB are not rendered.** The product decision is “read-only with a message”,
   so the tab shows a size/reason panel, not a truncated preview. A virtualized reader for very large
   `.md` files is future work; the current behavior protects the window and never writes.
2. **The non-E2E native Save / Don’t Save / Cancel dialog for guest files is not exercised by an
   automated UI test.** UI tests run with `NOTEFOREST_E2E=1`, where the existing close branch
   auto-saves instead of opening a native dialog (native dialogs are forbidden in tests). The
   renderer close prompt is fully tested; the pending-guest-file list and its normalization are
   unit-tested; the main flow is the existing note prompt extended with the renderer save request.
   The product-owner manual check can cover the native prompt.
3. **Conflict detection is save-time.** A clean file deleted outside the app is detected on the next
   save/restore, not by a watcher. Marking the tab missing is therefore tied to a write attempt (or
   a session restore), which matches the design’s “re-stat before writing” rule.
4. **After canceling the close dialog, autosave does not restart by itself.** The file stays dirty
   until the next edit or `⌘S` (the conflict dialog intentionally pauses autosave to avoid repeated
   prompts). This is safe but slightly conservative.
5. **A `.bak` is written before the new file is renamed.** If the final rename fails, the backup is
   still the pre-save version; the target is unchanged. No rotating history is created.
6. **Images copied from a guest file into a note are not asset copies.** The note’s existing
   cross-document guard turns an unbacked image into a placeholder/text. The required copy subset
   (paragraph/table/formula/code) is tested; an “Insert into note” asset-copy action remains a
   future feature.
7. **Canonical note content names block formulas `mathBlock`** while the flat editor uses
   `blockMath`. The UI test asserts the formula survives under the note’s canonical name; no schema
   change was made.
8. **Frontmatter is intentionally not editable.** The `---…---` bytes can only change in another
   editor and be brought in through Reload. The editor shows the exact delimiters and YAML verbatim.
9. **The M1 UI suite was updated, not merely extended.** Its “M1 never writes” assertion is now the
   M2 autosave/`⌘S` assertion; the rest of the M1 open/render/chrome coverage is preserved.
10. **Screenshots are disposable test artifacts** (gitignored); they remain in this worktree for the
    reviewer.

## 6. Open questions / next step

- Product-owner choice (future): should a file above 2 MB show a truncated preview or stay a
  size/reason panel? M2 implements the safe panel and documents it.
- Next: targeted **M2 Sentinel review**, then integration. M3 (vault folders, richer task lists,
  “Insert into note” with asset copy) stays deferred unless real use demands it.
- No product decision, spec, UX, ADR, plan, schema, settings version, Page/PDF/export, or showcase
  file was changed.
