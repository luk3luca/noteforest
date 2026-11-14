# Sentinel fixes — Read gating, identity, drafts, special text

**Role:** Implementer / Builder
**Milestone:** Post-delta-Sentinel fixes
**Base:** `main` head at delegation (includes this brief)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Source review:** `docs/reviews/post-settings-library-special-text-review.md` (F1–F9)
**Timebox:** 2 days

## Decision on F2 (S1)

The product owner accepted F2 as a **documented latent limitation**: the app is unpublished, there
are no legacy/imported documents in the library (0 rich cells in all four documents), and the editor
cannot author an image-in-cell table. **Do not add a legacy-table guard and do not touch
`lib/table-cell.ts`/the table projection.** The limitation must be recorded in the report and is
revisited when Markdown import or a real legacy document lands.

## In scope

### F1 — Read mode cannot mutate through the in-place node views (S2)

- Code block node view: when `editor.isEditable` is false, close the fence chrome/source (no editable
  language input, no closing row actions); a language commit or copy cannot run; the view does not
  keep an editing state. On a mode change Edit → Read, the open fence must close.
- Formula node view: when the editor becomes non-editable, close the source editor; the action row
  (Branch/Copy/Inline-Block) must not be able to write; Branch from term must be unavailable;
  Copy may remain read-only only if it does not blur/commit or mutate.
- Inline-code delimiter widgets are hidden when the editor is not editable (also F6).
- Add a UI test in the read-mode gating suite: Edit → Read with the caret inside a code fence and a
  formula source; type/click branch; assert the canonical document is unchanged (blocks, latex,
  language) and the node view is closed/read-only. Reuse the Sentinel repro flow
  (`artifacts/sentinel-delta-2026-11-14/repro4.mjs`–`repro6.mjs`).

### F3 — id-safe settings/session cleanup (S2)

- `document-settings.ts removeDocumentSettingsEntries`: remove by **exact path** first. Use the
  document id only when no other known entry (and no session tab) shares it; on an ambiguous id,
  leave both entries and report.
- `renderer/state/settings.ts forgetDocumentSettings`: same rule.
- `library.ts removeSessionDocument`: drop the exact path's tab; drop id-scoped tabs only when the
  id is unique among known packages/session tabs; ambiguous → leave and report.
- `reconcileMovedDocuments`: a duplicate id must not bind a missing tab to the wrong copy; leave it
  unresolved and report.
- Add unit tests with two packages sharing a `document.id` (trash one → the other's override/tab
  survive; ambiguous reconciliation does not bind wrong), and a UI test: open two copies with the
  same id, give the copy an override, trash the original → the copy keeps the override/tab.
- The product decision "Save a copy mints a new document id" is **out of scope** (ADR later); the
  copy command keeps the current behaviour.

### F4 — immediate per-document Page settings materialize a draft (S2)

- In `usePageSettingsController`, the immediate write path (size, orientation, chrome, preset,
  reset, use-global) must reuse the same draft materialization as `applyPending`: detect
  `isDraft`, `ensureMaterialized()`, retarget the write to the package path, adopt the override.
  No entry may remain keyed by `draft:<id>`.
- Add a UI test: new draft → Settings → Page → Document scope → toggle page number (chrome) and a
  size/preset change; the tab becomes a package, the override is keyed by the package, the document
  persists, and closing no longer leaves orphan `draft:` entries. Keep the existing density test.

### F5 — typed GFM Enter conversion keeps the caret and a writable paragraph (S3)

- `convertTableOnBlankParagraph` must not consume the blank trigger paragraph: exclude it from the
  run, or insert a trailing paragraph and set a text selection like the Mod-Enter path. Typing
  immediately after the conversion must land in the document.
- Add a caret assertion to the typed-conversion test; correct the stale report/comment if needed.

### F6 — inline-code delimiter widgets only in Edit (S3)

- The decoration plugin checks `editor.isEditable`: no widget backticks in Continuous/Page Read.
  Add the read-mode case to the inline-code suite (the Sentinel repro2 shows `READ_DELIMS 2`).

### F7 — encode the verified UI concurrency (S3 test infra)

- `tests/ui/run.mjs`: the default concurrency becomes **4** (the gate verified at 4; the 8-way pool
  times out on this machine). Update the comment; the DoD already names 4. No product code.

### F9 — nits (S4)

- Use the `installLocalTextKeys` cleanup in the code-block and formula node view `destroy`.
- Inline→block conversion inside a table cell: the button must not silently do nothing; show a
  short reason (toast/inline note).
- Add a regression test: a **text anchor in the same paragraph** as a converted formula (inline ↔
  block) still resolves; the formula's own anchors are already covered.
- Docs: `ui-shell-map.md`/`ui-shell-contents.md` sidebar range 208–360 → 180/640/264 (code/frozen
  inventory).
- The Settings pane 536, radii, card padding, table toolbar redesign, anchor health, activity bar
  are **out of scope**.

### F10 — scrollbar corner square (product-owner request)

- The Continuous canvas scrolls on both axes; where the two scrollbars meet, Chromium paints an
  unstyled `::-webkit-scrollbar-corner` in the default light colour, so a white square shows at the
  bottom-right of the editor scroll area (and of any wide inner wrapper). Add
  `::-webkit-scrollbar-corner { background: transparent; }` next to the existing `::-webkit-scrollbar`
  rules in `apps/desktop/src/renderer/src/styles.css`. No layout change; check the canvas and a wide
  table wrapper in dark and light themes. A screenshot goes in `artifacts/sentinel-fixes/`.

## Out of scope

- F2 guard/legacy table projection (accepted limitation).
- F8 table toolbar redesign.
- The copy-id ADR (Save a copy).
- Showcase, settings/Page/PDF, schema, export, anchor health, activity bar.
- Full `npm run verify` (the Orchestrator runs it at UI concurrency 4).

## Files

Read the review and the code it names: `editor/views/code-block-view.ts`,
`editor/views/formula-node-view.ts`, `editor/inline-code.ts`, `editor/code-block-actions.ts`,
`editor/table-commands.ts`, `editor/views/BlockViews.tsx`, `main/document-settings.ts`,
`main/library.ts`, `renderer/state/settings.ts`, `renderer/settings/usePageSettingsController.ts`,
`tests/ui/run.mjs`, the read-mode/table/formula suites.

## Acceptance

- [ ] Read mode cannot write through code/formula node views; delimiters hidden; canonical document
      unchanged; test added.
- [ ] Duplicate-id cleanup is id-safe; two-copy unit/UI tests; no wrong reconciliation.
- [ ] Immediate Page settings on a draft materialize; no `draft:` orphan; UI test.
- [ ] Typed GFM Enter keeps a writable paragraph/caret; test.
- [ ] Delimiter widgets only in Edit; test.
- [ ] UI default concurrency 4 encoded.
- [ ] F9 nits + text-anchor test + docs 180/640/264.
- [ ] F10 scrollbar corner transparent; no white square; screenshot.
- [ ] F2 untouched; no schema/settings/Page/PDF/showcase change; no fixed sleeps/native dialogs;
      existing assertions updated, none weakened.

## Tests and evidence

- Targeted unit/UI per finding; one `npm run verify:fast`; the affected read-mode, settings, library,
  table, formula, special-text suites.
- Screenshots/logs in `artifacts/sentinel-fixes/`: read-mode node view closed, two-copy trash
  survivor, draft materialization, GFM caret, Read delimiters hidden, scrollbar corner.

## Report

- Summary per finding (F1, F3–F7, F9, F10), files, checks with timings, per-criterion pass/fail, the
  F2 limitation note, risks, next step (targeted Sentinel re-check).
- One commit in the worktree; do not merge or push.
