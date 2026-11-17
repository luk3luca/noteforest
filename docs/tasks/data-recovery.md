# DR1 — Unused images on Health, and `core` reasons at the boundary

**Role:** Builder
**Milestone:** data & recovery batch
**Base:** `main` at launch (the docs commit that adds this brief).
**Worktree:** created by the Orchestrator, branch `t3/data-recovery`.
**Timebox:** 3 hours.

## Context

Two follow-ups are open on the same surface — "what the app tells you when its own data is messy".

1. **Asset GC.** The planner exists and is tested (`planAssetGc` in `packages/core/src/assets.ts`),
   `asset.remove` already refuses a referenced asset (`asset-in-use`), and a backup scan supplies
   retained ids. Nothing runs it, so unused image bytes accumulate and there is no way to see them.
2. **`core` reasons.** `copy-plan.md` §E records it: a command reason that reaches a user surface still
   shows the raw store sentence (`document.json is not valid JSON` appeared in the recovery `Reason`
   row). The copy sweep fixed every string it owned; these come from `packages/core` at runtime.

## Goal

Health lists unused images and can clean them up explicitly, and no `core` reason string reaches a user
surface unmapped.

## In scope

### 1. The `Unused images` Health section

- **New section `unused-images`**, rendered **only when the plan is non-empty**. The four audit sections
  keep their always-visible `0` rule (design §4 of `docs/design/sidebar.md`); this one is a surprise and
  an empty `0` row would be noise.
- Rows are the standard result card (`docs/design/sidebar.md` §5): first line the asset's
  `originalName` (or its `path` basename when absent), second line `--sb-meta` with the size
  (`bytes` formatted) and the mime. 28 px header with the title and the count in `--sb-count`.
- A footer action row inside the section: `Clean up N unused images…`, opening a confirm dialog on the
  shared `Frame` with the count, the total bytes, the list limit the dialog uses elsewhere, and the
  outlined danger button (`Remove`), Cancel focused.
- On confirm: remove the assets through the existing guarded path, delete the bytes, refresh the
  report. On failure: the error goes through the normal short-line + `Details` pattern.
- **Never listed**: an asset referenced by an image node, by an image anchor, or by **any backup**
  (`retainedAssetIds` from the existing backup scan).
- **No automatic GC and no grace window.** There is no reference history to measure a grace period
  from — an mtime is the age of the file, not of the unreference — so the guarantee is instead: manual,
  previewed, explicit, and never touching a retained id.
- Read mode: the section is visible, the action is disabled.

### 2. `core` reasons at the boundary

- Enumerate the reason strings that can reach a surface: the recovery surface's `Reason` row, the library
  row reason (`summary.reason`), and the command rejections that are shown to the user.
- Map them **at the boundary** (the same shape `runtime.ts` already uses): a short user line in the
  message, the raw reason in `details`.
- Extend the banned-word guard to the new mapping module, with an empty allowlist as today.
- If a reason has no sensible short line, fall back to one generic sentence and keep the raw text in
  `details` — never invent a technical sentence in the renderer.

## Out of scope

- Any change to `planAssetGc`'s semantics, `asset.remove`'s guard, the backup scan, or the asset store.
- Automatic scheduling, settings for the cleanup, retention policy, a grace window.
- S3-5 (guided relink needs a design) and S3-6 (no reachable path) — both stay open, explicitly.
- Copy changes outside the reason mapping; the health card/header design; the paginator; Page/PDF.

## Files

Read: `packages/core/src/assets.ts` (planner, guard), the backup scan used by `asset.remove`,
`apps/desktop/src/renderer/src/shell/HealthSection.tsx`, `lib/document-health*.ts`,
`lib/document-health-sections.ts`, `docs/design/sidebar.md` §5, `docs/design/copy-plan.md` §E,
`docs/design/dialogs.md` §3.

Expected to touch: the health audit/report plumbing for the new section, `HealthSection.tsx`,
a new cleanup confirm dialog, the main-side asset removal path if the bytes are not already removed,
the reason-mapping module and its call sites, `styles.css` (section only), the tests and the guard,
`docs/reports/data-recovery.md`.

## Acceptance criteria

- [ ] Health shows `Unused images` with the count only when the plan is non-empty; at zero the section
      is absent.
- [ ] The confirm lists what will go with the total size; Cancel changes nothing; Remove deletes the
      records **and** the bytes and the section disappears (or shrinks) after a refresh.
- [ ] An asset referenced by a backup is never listed and never deleted; the same for one referenced by
      an image node or an image anchor.
- [ ] In Read the action is disabled and the section still lists.
- [ ] No user-facing string contains a raw `core` reason; the raw text is in `Details`; the banned-word
      guard covers the mapping.
- [ ] No regression: the other four Health sections, the repair modal, the find, Page/PDF, the library.

## Tests and evidence

- Targeted: `npx vitest run` for the planner/report/mapping tests, `node tests/ui/run.mjs --group shell,anchors --concurrency 2`.
- End of task: `npm run verify:fast`.
- Do not run `npm run verify`.
- Screenshots under `artifacts/data-recovery/`: the section with rows, the confirm, the section after
  cleanup, and a recovery surface whose `Reason` row is a short line with `Details` under it.

## Stop and ask

- if removing an asset's bytes is not already implemented on the guarded path;
- if the backup scan cannot be run cheaply enough for the Health report (say what it costs);
- if a `core` reason cannot be mapped without changing a command's public behaviour;
- if the section needs a seventh activity tab or any sidebar change.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, risks, next step. One commit; do
not merge.
