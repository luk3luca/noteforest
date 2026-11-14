# Sentinel fixes — targeted re-check

**Role:** Reviewer / Sentinel
**Milestone:** Post-delta-Sentinel fixes (targeted re-check, not a full review)
**Base:** `0917965` (brief) → code head `4257154` (fix commit)
**Deliverable:** `docs/reviews/sentinel-fixes-recheck.md` (docs only; no code changes)
**Worktree:** created by the delegate; one commit, no merge or push
**Source review:** `docs/reviews/post-settings-library-special-text-review.md` (F1–F10)
**Builder report:** `docs/reports/sentinel-fixes.md`
**Brief:** `docs/tasks/sentinel-fixes.md`

## Why

The delta Sentinel requested changes (one S1, three S2). The product owner accepted **F2 as a
documented latent limitation** (unpublished app, no legacy/imported documents, editor cannot author
an image-in-cell table) and scoped the fix batch to F1, F3, F4, F5, F6, F7, F9 and the added F10
(scrollbar corner). The builder commit is `4257154`; the Orchestrator's full `verify` at the encoded
UI concurrency 4 is the integration evidence. This re-check judges whether those findings are
actually closed and whether the fixes introduced new S1/S2 regressions.

## What to verify, finding by finding

### F1 — Read mode cannot mutate through the node views

- Open a code fence and a formula source in Edit, switch to Read, then force the old repro paths:
  language commit/blur, close row, typing, branch from term, Inline/Block.
- Assert the canonical document (blocks, anchors, branches), the runtime revision, the code
  `language`, and the formula `latex` are unchanged, and the node view chrome is closed.
- Confirm the mode mirror (`subscribeEditorUi`) cannot miss a switch that `DocumentEditor` performs,
  and that a node view mounted while already in Read never opens an editor.
- Check the discarded formula language/source draft does not reappear after returning to Edit.

### F3 — id-safe cleanup and reconciliation

- Two packages with the same `document.id`: trash one; the other's durable override, in-memory
  override, session tab, and open tab must survive.
- Ambiguous id: cleanup keeps the other entries and reports (`keptAmbiguous`, main warning). Judge
  whether a warning-only report is acceptable or an S3.
- `reconcileMovedDocuments` must never bind a missing tab/recent to one of two same-id copies.
- The new tab key `${documentId}:${packagePath}` must not break draft materialization (the draft
  keeps the document id), session restore, recovery tabs, or two tabs of the same package path.
- The durable map still stores one override per document id (`upsertDocumentSettingsEntry` matches
  by id). Confirm that this is only the out-of-scope Save-a-copy ADR and does not silently corrupt
  the tested two-copy case.

### F4 — immediate Page settings materialize a draft

- New draft → Settings → Page → Document scope → chrome toggle, size, orientation, preset, reset,
  use-global: the tab must become a package, no `draft:` key may remain in memory or on disk, and
  the override must be keyed by the package path.
- Check `lastImmediate`/Retry after a materialization, `packagePathRef` sync, and closing a draft
  after a failed materialization (no orphan entry, clear error).
- The existing density/margins/theme debounced path must still work.

### F5 — typed GFM Enter keeps the caret

- Type the GFM table, press Enter on the blank paragraph: the table appears, the blank paragraph
  survives below it, the caret is inside it, typing lands in the document, one undo reverts it.
- Check the boundary case where the table lines are the first block content or the blank paragraph
  is the last child; the `backwardsOnly` run must not swallow the trigger paragraph.

### F6 — inline-code delimiters only in Edit

- Continuous Edit with the caret inside an inline-code span shows widgets; Read shows none and no
  backticks in the prose; returning to Edit with the same caret restores them.
- Confirm the stored `code` mark is untouched and Page Read/Edit are unaffected.

### F7 — encoded UI concurrency

- `tests/ui/run.mjs` default is 4, `NOTEFOREST_UI_CONCURRENCY` still overrides, the 8 cap is
  unchanged, DoD/plan wording matches.

### F9 — nits

- `installLocalTextKeys` cleanup stored and called (code block destroy, formula per source/destroy).
- Inline → block in a cell shows a visible reason, keeps the formula inline; no dead click.
- Text anchor in the same paragraph as a converted formula still resolves (regression test).
- Shell docs 180/640/264; note remaining stale 208–360 docs only if they are in scope of this fix.

### F10 — scrollbar corner

- `::-webkit-scrollbar-corner { background: transparent; }`; dark and light canvas plus a wide
  table wrapper show no white square. CSS guard test present.

## Invariants

- F2 untouched: `lib/table-cell.ts` and the table projection unchanged, no legacy guard; the
  limitation is documented in the report.
- No schema/settingsVersion/Page/PDF/export/showcase change.
- No fixed sleeps, no native dialogs, no weakened assertions (list any updated assertion and judge
  whether the update is a contract change or a weakening).
- Read-mode gating still blocks menu/palette/sidebar/keymap/paste/drop elsewhere.

## Evidence to use

- `docs/reports/sentinel-fixes.md` and `artifacts/sentinel-fixes/` (builder screenshots/logs; the
  artifacts are git-ignored and may need re-running).
- The Orchestrator's full `npm run verify` at UI concurrency 4 (unit/e2e/recovery/UI counts and
  timings) — do not duplicate a green full run; run only the affected suites if you need more.
- Your own targeted repros for F1, F3, F4, F5, F6 where the builder evidence is not enough.

## Verdict

- **accept**, **accept with findings**, or **request changes**, with S1–S4 findings. Every finding
  needs file:line, a reproducible description, evidence, and the smallest credible fix. New
  findings are allowed only if they are regressions in this diff or S1/S2 in touched code.
- Do not edit product code, tests, spec, UX, ADR, or plan. `docs/review-checklist.md` /
  `docs/definition-of-done.md` updates are allowed only if the checklist is stale.
- One worktree, one commit (the review), no merge or push. Report worktree, branch, head, checks
  with timings, verdict, findings, and the next step.
