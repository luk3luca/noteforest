# Copy C+D — errors, banners, editor, menus

**Role:** Implementer / Builder
**Date:** 16 November 2026
**Brief:** `docs/tasks/copy-c-d.md`
**Design:** `docs/design/copy-plan.md` rows C and D, `docs/design/dialogs.md` §3/§6,
`docs/design/copy-audit.md` §2/§5
**Base:** `9d40dc2` (`main` after A+B, find v3, and the C+D base addendum)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-8104ab5b-38262862e1cda1d6`
**Commit:** one worktree commit on top of `9d40dc2`; not merged, not pushed

## Summary

### C · Errors, toasts, banners, recovery, status — done

- Every C row is applied verbatim: `lib/editability.ts` (C-01), `lib/save-failure.ts` (C-02),
  `SaveFailureBanner` (C-03), `lib/recovery.ts` (C-04), `StatusBar` (C-05), `DraftMaterializeBanner`
  (C-06, via the main-process short line), `RecoverySurface` (C-07), `DocumentStatusPanel` (C-08),
  `markdown-save.ts` (C-09), `export-flow.ts` (C-10), `App.tsx` (C-11), `actions.ts` (C-12),
  `state/runtime.ts` (C-13), `main/library.ts` (C-14), `main/index.ts` (C-15),
  `main/export-preflight.ts` (C-16), `main/markdown-file.ts` (C-17), `main/backup-restore.ts`
  (C-18), `main/document-settings.ts` + `main/markdown-backup.ts` (C-19),
  `MarkdownFileEditor.tsx` (C-20). `DELETE` rows are removed, `KEEP` rows untouched.
- **Details data path finished, additively.** `details?: string` is on the failure envelopes:
  `LibraryActionFailure`, `VaultActionFailure`, `DocumentSettingsRecoveryFailure`,
  `CreateDocumentFailure`, `CreateDraftResult`, `MaterializeDraftResult`, `DraftLibraryResult`,
  `TrashDocumentResult`, `RemoveMissingDocumentResult`, `OpenDocumentFailure`,
  `TakeOverLockResult` (failure), `ApplyResult`, `SaveCopyFailure`, `ReloadDocumentFailure`,
  `RevealResult`, `ImportImageFailure`, `MarkdownSaveFailure`, `MarkdownOpenResult`,
  `SettingsSaveResult`/`DocumentSettingsSaveResult`, `RestoreBackupFailure` (already in A+B) and
  the draft-materialize failure. No schema, settings-file, IPC-channel, or `settingsVersion`
  change; `shared/api.ts` types only.
- **Where a message interpolated an error/path, the message keeps the short outcome and the value
  moves to `details`** (C-14.1/2/7/8/10/11/12/13/17/20/22/24/25/27/30/32/33/34/35/36,
  C-15.2, C-17, C-19). The renderer never composes a technical sentence.
- **Hosts:** the shared `Details` component (`shell/Details.tsx`, unchanged markup) is now hosted by
  the save-failure banner (one value: `{failure.message} · {packagePath}`) and the recovery surface
  (one value per error: `Still unavailable.` + the reason, or the raw backup-listing error). The
  `Reason` row, `Validation details`/`Warnings` disclosures and `Lock details` stay as the plan
  keeps them; one Details per surface.
- **Toast → D25:** new `lib/toast-details.ts` adds exactly one `Details` action to a toast when a
  technical value exists (`withDetailsOptions`) and opens D25 (the A+B dialog) on click. Wired into
  every toast that comes from a result carrying `details` (`actions.ts`, `markdown-save.ts`,
  `SaveFailureBanner`, `Dialogs.tsx`, the bootstrap settings/library warnings). A toast with no
  technical value gets no action. The action is styled as a quiet text button (`styles.css`), never
  a filled pill, and a toast has no inline disclosure.
- **Preflight/export technical strings** (C-16) are rewritten so no engine word reaches a warning
  row or Details; block/asset ids and the defect label leave the message (the warning record still
  carries `blockTitle`/`blockId`).

### D · Editor, menus, palette, headers, sidebar — done

- D-01.1: the anchor-warning tooltip is `Open document health to repair.` (reason and "the branch
  and target stay" dropped); the aria labels are kept.
- D-02.1/D-02.2: the block menu no longer glues `— {reason}` onto `Split at caret`; both items keep a
  fixed label and show a fixed disabled description (`Place the caret in a text block.`,
  `The previous block must be in the same chapter.` — see "Deviations").
- D-03: the native menu is sentence case (`New note`, `Open note…`, `New chapter`, `Close tab`,
  `Reopen closed tab`, `Command palette…`, `Toggle sidebar`, `Fit width`, `Focus branch`,
  `Actual size`, `Zoom in`, `Zoom out`). Ids and accelerators are unchanged. The template moved to
  the pure `main/menu-template.ts` so the labels have a real unit test without an Electron process;
  `main/menu.ts` only installs it.
- D-05.1 / D-06.1: `Export to PDF (⇧⌘E)`, `Open a note to change the view`.
- D-07: `Open folder as library…`, `New library…`, `Remove from recents`, `Open a note to see its
  outline.`, `Note unavailable.`, `This note couldn’t be read.` (row reason fallback).
  The palette is untouched (D-04 is `KEEP`).
- **Item 6 (find v2 labels only):** the sidebar Search count reads `No results` at zero and the
  duplicate empty line is gone; `No results` / `1 of 4` / `Refine the search` and the one-line empty
  states are unchanged. The sidebar header palette button is now icon + `⌘K` with
  `aria-label`/`title` `Command palette (⌘K)`; the `Search` word is gone. The find v3 hierarchy
  (chapter rule, per-chapter counts, `.nf-result-row` cards, label-only headings), the `ab` toggle,
  the engine and the shared state are untouched — proven by a guard test.

### Guard and tests

- The A+B banned-word guard (`apps/desktop/test/dialog-copy.test.ts`) now scans 24 more C/D copy
  modules with an empty banned-word allowlist (`lib/recovery.ts`, `lib/editability.ts`,
  `lib/toast-details.ts`, `export-flow.ts`, `markdown-save.ts`, `MarkdownFileEditor.tsx`,
  `MarkdownImageView.tsx`, `StatusBar.tsx`, `SaveFailureBanner.tsx`, `DraftMaterializeBanner.tsx`,
  `RecoverySurface.tsx`, `DocumentStatusPanel.tsx`, `SearchSection.tsx`, `Sidebar.tsx`,
  `CanvasHeader.tsx`, `ViewControls.tsx`, `Toolbar.tsx`, `CommandPalette.tsx`, `BlockViews.tsx`,
  `state/save-coordinator.ts`, `state/document-session.ts`, `lib/image-insert.ts`,
  `lib/image-authoring.ts`, `main/menu-template.ts`).
- New `apps/desktop/test/copy-cd.test.ts`: every C/D applied row verbatim, every replaced row absent,
  a sentence-level banned-word scan over the 10 large modules that also carry internal diagnostics,
  the native-menu labels/ids/accelerators, the toast `Details` action → D25, the find v3 guards, and
  the sidebar palette-button guard.
- New/updated UI coverage: toast `Details` action and D25 (`ui-dialog-frame`), the save-failure
  banner with Details open (`ui-document-status`), the recovery surface's new copy and Details host
  (`m2f-recovery`), the find sidebar count (`find-bar`), menu labels (`library-surface`,
  `ui-dialog-frame`), the split/merge disabled description (`m3f1`), the export short lines
  (`m4c2`, `m4c3`, `m4d2`), the settings refusal lines (`m4e1`, `ui-settings-recovery`), the E2E
  close dialog and save-failure banner (`m2-editor`).

## Files changed

Product code:

- `apps/desktop/src/shared/api.ts` — additive `details?: string` on the failure envelopes.
- `apps/desktop/src/main/library.ts` — C-14 splits, short lines, `details` on the returns; the
  trash/preflight reasons; the settings-write refusals.
- `apps/desktop/src/main/index.ts` — C-15 native close/quit dialog copy and order.
- `apps/desktop/src/main/export-preflight.ts` — C-16 messages (no engine word, no id).
- `apps/desktop/src/main/markdown-file.ts` — C-17 short lines + `details`.
- `apps/desktop/src/main/backup-restore.ts` — C-18.
- `apps/desktop/src/main/document-settings.ts`, `apps/desktop/src/main/markdown-backup.ts` — C-19.
- `apps/desktop/src/main/menu-template.ts` (new) / `apps/desktop/src/main/menu.ts` — sentence-case
  menu, extracted template.
- `apps/desktop/src/renderer/src/lib/save-failure.ts`, `lib/recovery.ts`, `lib/editability.ts` —
  C-01/C-02/C-04.
- `apps/desktop/src/renderer/src/lib/toast-details.ts` (new) — the toast `Details` action.
- `apps/desktop/src/renderer/src/shell/SaveFailureBanner.tsx` — C-03 + shared Details host.
- `apps/desktop/src/renderer/src/shell/RecoverySurface.tsx` — C-07 + Details host for errors.
- `apps/desktop/src/renderer/src/shell/DocumentStatusPanel.tsx` — C-08.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — C-05.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — toast `details` wiring, one duplicate sentence.
- `apps/desktop/src/renderer/src/shell/SearchSection.tsx`, `Sidebar.tsx`,
  `CanvasHeader.tsx`, `ViewControls.tsx` — D rows and item 6.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — D-01.1.
- `apps/desktop/src/renderer/src/markdown/markdown-save.ts`,
  `markdown/MarkdownFileEditor.tsx` — C-09/C-20.
- `apps/desktop/src/renderer/src/export/export-flow.ts` — C-10.
- `apps/desktop/src/renderer/src/state/runtime.ts` — C-13 + `details` propagation.
- `apps/desktop/src/renderer/src/state/save-coordinator.ts`,
  `state/document-session.ts`, `lib/image-insert.ts`, `lib/image-authoring.ts` — the C-13.6 sentence
  (`This note is open read-only.`) in the modules that carried the same string; `actions.ts`'s
  read-only rename toast uses it too.
- `apps/desktop/src/renderer/src/actions.ts` — C-12 + D-02.
- `apps/desktop/src/renderer/src/App.tsx`, `global.d.ts` — C-11, toast `details` probe.
- `apps/desktop/src/renderer/src/styles.css` — banner/recovery Details hosts, the toast action,
  the palette-button spacer; the retired save-failure path/message rules removed.

Tests: `apps/desktop/test/copy-cd.test.ts` (new), `dialog-copy.test.ts`, `save-failure.test.ts`,
`read-mode-gating.test.ts`, `document-health-actions.test.ts`, `document-lifecycle-main.test.ts`,
`document-settings.test.ts`, `export-job.test.ts`, `export-preflight.test.ts`,
`library-roots-main.test.ts`, `recovery-library.test.ts`, `settings.test.ts`,
`save-coordinator.test.ts`, `document-session.test.ts`;
`tests/ui/ui-dialog-frame.test.mjs`, `ui-document-status.test.mjs`, `library-surface.test.mjs`,
`find-bar.test.mjs`, `m4b1a2-read-mode-gating.test.mjs`, `editor-surfaces.test.mjs`,
`ui-settings-recovery.test.mjs`, `m4e1-settings-platform.test.mjs`, `document-lifecycle.test.mjs`,
`m3f1-split-merge.test.mjs`, `m4c2-pdf-export.test.mjs`, `m4c3-pdf-gate.test.mjs`,
`m4d2-export-ui.test.mjs`, `ui-batch-a.test.mjs` (evidence screenshot only);
`tests/recovery/m2f-recovery.test.mjs`; `tests/e2e/m2-editor.test.mjs`.

Docs: `docs/reports/copy-cd.md` (this report).

## Checks run

| Check | Result | Timing |
|---|---|---|
| `npm run verify:fast` (boundaries, typecheck, unit, e2e) | **exit 0** | **59.17 s** wall |
| — `check:boundaries` | 270 files / 1315 imports / 16 rules | — |
| — unit (`vitest run`) | **156 files / 1563 tests** | 11.3 s |
| — e2e (`m2-editor`, build + run, measured separately) | 16/16 | 46.28 s |
| `npm run build && node tests/ui/run.mjs` (every UI suite, final build) | **62/62 suites, 0 failed, 0 page errors** | **291.9 s** suites (4:52 wall) |
| — `shell` group alone | 19/19 | 128.0 s |
| — `settings,markdown` groups alone | 13/13 | 68.2 s |
| — `core,page,anchors,images` groups alone | 60/62 in one pass, then both failures 13/13 alone | 324.1 s / 42.6 s |
| `node --test tests/recovery/m2f-recovery.test.mjs` | 11/11 | 20.52 s |
| `node --test tests/ui/m4c2,m4d2,m4c3` | 24/24 | 24.66 s |
| `ui-dialog-frame` alone (toast → D25) | 5/5 | 22.18 s |
| `node --test tests/ui/ui-overlay-command-gate,ui-appearance-v3` (re-check) | 13/13 | 42.6 s |

The one 60/62 pass happened while a second UI run was active; both failures were an `artifacts/`
directory `ENOENT` (each suite's `before` hook removes its own evidence dir), not assertions, and
both pass when run alone. The final clean full-UI run above was done with nothing else running.

No fixed sleeps (the toast screenshot is taken from the element, not the animated viewport), no
native dialogs (the E2E dialog guard is unchanged and asserted), no weakened assertions: each
updated assertion is replaced by the new verbatim line or by the details/warning-record check.

## Acceptance criteria

- [x] **Every C row applied exactly**: short message in place, technical value in `details`,
      `DELETE` removed, `KEEP` untouched; the envelopes are additive (types only, no migration).
- [x] **Details works in a dialog, a banner/panel and the toast action → D25** (Copy, Close,
      `Copied`); one Details per surface; no banned word in a user-facing string (guard: empty
      allowlist).
- [x] **Every D row applied**; the native menu is sentence case with unchanged ids/accelerators;
      the palette is unchanged; the sidebar header palette button is icon + `⌘K` with the new
      aria/title.
- [x] **Find v2 labels aligned**: `No results` and `1 of 4` exact, zero shows `No results` (no
      duplicate empty line), the empty states are one sentence, `Refine the search` stays; the v3
      hierarchy and the `ab` toggle are guarded as untouched.
- [x] **The guard covers the C/D modules**; the updated suites pass; `verify:fast` and
      `test:ui:shell` green; screenshots under `artifacts/copy-cd/`.
- [x] **No pageerror** in the UI runs; no schema/settings/Page/PDF/health/find-engine change.

### Test assertions updated because they encoded the old copy

Unit: `read-mode-gating` (3 constants), `document-health-actions` (2), `document-lifecycle-main`
(5: two reserved-folder rows, outside-library, live-lock reason, trash failure message + new
`details`), `document-settings` (1), `export-job` (1), `export-preflight` (4), `library-roots-main`
(1), `recovery-library` (1), `settings` (2), `save-coordinator`/`document-session` (the read-only
sentence), `dialog-copy` (module list, `Heartbeat` KEEP label,
selector-shaped identifiers), `save-failure` (new C-02 verbatim test).

UI/E2E: `ui-document-status` (save-failure title/hint/paused/Details, slim reason, slim guidance,
draft live lock), `m4b1a2-read-mode-gating` (title constant), `library-surface` (menu labels,
outline empty state, nested-library line), `ui-dialog-frame` (`New library…`, D25 assertions, the
new toast flow), `find-bar` (3 count assertions `0` → `No results`), `editor-surfaces`
(`Kept as a reference from`), `ui-settings-recovery`, `m4e1-settings-platform`,
`document-lifecycle` (live-lock toast), `m3f1-split-merge` (split disabled description),
`m4c2-pdf-export`, `m4c3-pdf-gate` (asset id leaves the warning line), `m4d2-export-ui` (blocked
message, Details line, no-document toast), `m2f-recovery` (unreadable headline, newer-schema
description), `m2-editor` (close/quit dialog message ×2, save-failure banner).

## Screenshots (`artifacts/copy-cd/`)

- `save-failure-banner.png` — the banner in the shell chrome.
- `save-failure-details.png` — the banner with the shared Details open (raw error · path, Copy).
- `toast-details-action.png` — a one-line toast with the `Details` action.
- `details-dialog-480.png` — D25 opened from that action (`Details`, one code line, `Copy`, `Close`).
- `recovery.png` — the read-only recovery surface (new headline/description/backup copy, Details host).
- `status-panel.png`, `status-slim.png` — the stale-lock panel and the slim read-only bar.
- `palette.png` — the palette (unchanged).
- `sidebar-search.png` — the sidebar Search with the `1 of N` count, the chapter rule, the cards,
  the `ab` toggle and the icon + `⌘K` palette button.
- `native-menu.txt` — the extracted native-menu template (labels, accelerators, ids). The macOS menu
  bar is an OS surface that Playwright cannot capture; the label evidence is this file plus the
  `copy-cd › native menu labels` unit test.

## Deviations, open questions, risks

1. **D-02.2 label.** The plan's row renames the merge item to `Merge with next block`. The command
   merges the block **into its previous sibling** (`runtime.mergeBlock` → `planBlockMerge`), and an
   existing UI test drives it as `Merge with previous`. Applying the plan verbatim would invert the
   meaning, so the row is applied in intent: the `— {reason}` glue is gone, the label stays
   `Merge with previous`, and the fixed disabled description is
   `The previous block must be in the same chapter.` (the plan's sentence with the same correction).
   This is the one place a row's wording was adjusted; it needs a product-owner nod.
2. **C-16 drops the block/asset name from the message.** Rows C-16.5/9/10 replace
   `Block {label}: …` / `Asset {id} …` with a short sentence; the warning record keeps
   `blockId`/`blockTitle`, and the export sheet row still shows `{blockTitle} · {group label}`. Two
   suites that asserted the title/id inside the raw message now assert the short line plus the
   structured record. C-16's trailing note ("the block title is enough") reads as if the title
   should stay in the message; the row text was treated as authoritative.
3. **Duplicate sentences harmonised outside their row's file.** The same sentence appeared in more
   than one module: `This file is no longer on disk. Nothing was written.` (also `actions.ts`,
   `Dialogs.tsx`), `Page Edit wasn’t saved before the export.` (also `App.tsx`'s snapshot request),
   `Note settings weren’t saved.` for the invalid settings payload in `main/index.ts`, and
   `This note is open read-only.` (C-13.6, also in `save-coordinator.ts`, `document-session.ts`,
   `image-insert.ts`, `image-authoring.ts` and the read-only rename toast). Each uses the row's own
   new wording, never a new sentence.
4. **Recovery `Reason` row keeps the raw core message.** C-07.15 keeps the row, but the value comes
   from the store (`document.json is not valid JSON`), so a file/format word can still appear there
   (visible in `artifacts/copy-cd/recovery.png`). Mapping core command/store reasons at the boundary
   is the explicit follow-up in `copy-plan.md` §E, not this batch; rewriting it here would invent a
   message mapping for a surface the plan freezes.
5. **Two explicit `KEEP` labels are excluded from the banned-word scan**: B-01.31 `Schema version`
   (A+B) and C-08.15 `Heartbeat` (inside `Lock details`). They are the plan's own kept strings, not
   copy added by C/D; the allowlist for *new* copy stays empty.
6. **Toast Details is a text button.** The action needed a tokenized rule so it is not a filled
   white pill (sonner's default). It is a quiet accent text button at 11.5 px, matching `Copy` in
   the disclosure.
7. **`showToast` test hook gained an optional `details` argument.** It routes through the product
   `withDetailsOptions`, like the existing visual probe, so the UI suite can drive toast → D25
   without a test-only second implementation.
8. **`m3f1-split-merge` was flaky once** on caret focus (`moveCaretRight` timeout) and passed on the
   re-run; the failure was in the caret wait, not in the split label. Worth watching.
9. **Native menu evidence is textual** (see Screenshots); the menu itself is verified by unit test on
   the template.

## Next suggested step

The Orchestrator runs the full `npm run verify` (all 62 UI suites + recovery + e2e) as the
integration gate, then a targeted Sentinel over this diff: the Details envelopes, the toast → D25
path, the C-16 message rewrite, and the D-02.2 label decision (item 1 above). After acceptance the
copy sweep is complete and the next planned blocks (the unblocked settings pages) can start.
