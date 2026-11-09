# Targeted Sentinel — M4c2 PDF export orchestration

**Role:** Reviewer / Sentinel (independent judgment; no product-code edits)  
**Milestone:** M4c2 export job; M4c3 full PDF gate follows  
**Base:** `main` at the M4c2 integration (`322d132` plus docs; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 4 hours

## Why this review

M4c2 adds the real PDF export pipeline: a renderer snapshot over IPC, a hidden
BrowserWindow that measures and renders the print compositor, `printToPDF`,
preflight, a cancellable job, atomic output, and PDF validation. It touches the
main process, preload, renderer, and the print surface, and it writes files.
The full verify is green (95 files / 939 tests, 33 UI suites / 114 tests, 16
e2e, 14 recovery, 0 pageErrors) and the UI suite produced real PDFs, but M4c3
will build the 50+ page/raster/font gate on this pipeline. Review it before the
gate.

This is a targeted M4c2 review, not the full-codebase Sentinel and not an
implementation task.

## Scope

Read:

- `docs/tasks/m4c2-export-orchestration.md` — the brief.
- `docs/reports/m4c2-export-orchestration.md` — the implementation report.
- `docs/reviews/m4c1-print-compositor-review.md` — R1/R2 and R3–R10.
- `docs/tasks/m4c-pdf-plan.md`, `docs/adr/0002-pdf-pipeline.md`.
- `apps/desktop/src/shared/export.ts`.
- `apps/desktop/src/main/export-job.ts`, `export-preflight.ts`,
  `export-service.ts`, `export-window.ts`, `index.ts`.
- `apps/desktop/src/preload/index.ts`, `apps/desktop/src/shared/api.ts`,
  `apps/desktop/src/renderer/src/export-snapshot.ts`,
  `apps/desktop/src/renderer/src/App.tsx`.
- `apps/desktop/src/renderer/src/print/entry.tsx`, `PrintDocument.tsx`,
  `print.css`, `print.html`.
- `packages/pdf/src/printModel.ts`, `verifyPdf.ts`, `node.ts`.
- `packages/layout/src/types.ts`, `layout.ts` (`revision`, `layoutOptions`).
- Tests: `apps/desktop/test/export-*.test.ts`, `print-parity.test.ts`,
  `tests/ui/m4c2-pdf-export.test.mjs`, `tests/ui/m4c1-print-compositor.test.mjs`.
- Artifacts: `artifacts/m4c2/export/` PDFs + `export-evidence.json`,
  `artifacts/m4c2/raster/`.

You may read anything else needed for evidence. Do not modify product code,
tests, spec, UX, ADR, or plan.

## Questions

1. **Security and IPC.** Is the snapshot request/reply scoped to the right
   renderer/job/document? Can an untrusted document content break the
   `executeJavaScript` payload or the print window? Is `packagePath` validated
   against the open document? Is the output path handling safe (absolute,
   temp in the output directory, symlink/overwrite race, permissions)?
2. **Hidden window.** Are `show:false`, sandbox, context isolation, no Node,
   no preload, navigation/window-open/permission denial, default session asset
   protocol, CSP, and destroy-after-capture correct? Any network or native
   dialog path? Any window leak on success/failure/cancel/timeout?
3. **Model source/settle.** Does the hidden window truly measure the current
   document (unsaved edits, revision) independently of Page mount? Is the
   `build()` promise/`data-print-ready` handshake robust against fonts, KaTeX,
   images, and slow renders? Can a stale/partial/empty model print?
4. **Identity.** Is the required fingerprint + `ContinuousLayout.layoutOptions`
   + document id/revision check sufficient? Can a fabricated fingerprint or a
   wrong document/theme still pass? Are the M4c1 R1/R5 gaps closed?
5. **Preflight/validation.** Does preflight block all `blockingDefects` and
   page overflow, name the blocks, and surface warnings? Does the produced-PDF
   validation check page count, page size/orientation, text, blank pages, and
   glyphs with sensible tolerances? Can a valid export be rejected
   spuriously?
6. **Job/atomicity.** Are the state machine, progress, cancellation, overwrite
   policy, temp/read-back/inspect/rename sequence, cleanup on every failure,
   and cancellation races correct? Can a partial file, stale job, or zombie
   window remain?
7. **PDF correctness.** Do the produced PDFs match Page Read geometry and page
   count? Are the observed sizes within the ADR tolerance? Is `printToPDF`
   option usage correct for the pinned Electron (numeric margins, pageSize,
   landscape, preferCSSPageSize)? Any blank-page/background/break risk?
8. **M4c3 readiness.** What must M4c3 add or fix for the 50+ page A4 gate,
   raster parity, font embedding/text extraction, Notability import,
   300/1,000-block export performance, packaging `pdfjs-dist`, and the
   product-owner PDF visual check? Separate M4c3 work from M4c2 defects.

## Output

Write `docs/reviews/m4c2-export-orchestration-review.md`:

- Verdict: **accept**, **accept with findings**, or **changes requested**.
- Severity-ranked findings (S1 blocking M4c3, S2 fix before/in M4c3, S3
  follow-up), each with `file:line`, evidence, and the smallest safe fix.
- Answers to the eight questions.
- M4c3 recommendation: ready / add / defer.
- Any checklist/DoD update allowed to the Sentinel.
- Worktree path, branch name, head SHA.

No code, test, spec, UX, ADR, or plan changes. No merge, push, or PR.

## Checks

- Targeted unit/UI commands are allowed; the Orchestrator already ran the full
  verify at `322d132`.
- Do not re-run the full `npm run verify`.
- No fixed sleeps, native dialogs, or screen recordings.
- Stop and report if the baseline is inconsistent or a finding needs a product
  decision.
