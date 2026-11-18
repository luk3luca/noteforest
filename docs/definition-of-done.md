# Definition of Done

**Owner:** Reviewer / Sentinel.
**Language:** English.
**Companion:** `docs/review-checklist.md` (review procedure, severity, template).

---

## 1. General Definition of Done

"Done" is a reviewer verdict, not an implementer claim.

### 1.1 Contract and scope

- [ ] A brief exists with numbered acceptance criteria, scope and non-goals.
- [ ] Every criterion is met and evidenced; no "mostly".
- [ ] Only in-scope files changed; unrelated refactors are separate tasks.
- [ ] Spec and UX are not changed without an ADR; deviations are recorded.
- [ ] Every new dependency is approved.
- [ ] No product decision was invented; ambiguities were resolved before implementation.

### 1.2 Build and static checks

- [ ] Clean install from the lockfile.
- [ ] Production build succeeds.
- [ ] Typecheck clean; suppressions justified.
- [ ] Lint and format clean; no new warnings.
- [ ] No secrets, credentials or machine-specific paths.
- [ ] The packaged app launches, not only the dev server.

### 1.3 Tests

- [ ] Unit tests cover new logic; integration tests cover boundaries.
- [ ] Every bug fix has a regression test that fails before the fix.
- [ ] Failure paths covered: invalid input, missing asset, corrupt file, save failure.
- [ ] The suite is green and deterministic (no sleeps, network, real clock or order dependence).
- [ ] Fixtures added or updated and named.
- [ ] Pagination tests cover both orientations, breaks, long-block boundaries and page count when
      the task touches layout.
- [ ] Visual, PDF and performance checks run when the task touches those areas.

### 1.4 Manual evidence

- [ ] The app was launched from a clean state and every criterion reproduced end to end.
- [ ] Save, quit, reopen preserves the change and the page count.
- [ ] Undo/redo works for every new mutation.
- [ ] Adjacent flows spot-checked: outline/Continuous/Page sync, anchors, pagination, markers.
- [ ] Both orientations checked when layout is involved, with the page count recorded.
- [ ] Dark and light checked; the PDF stays light.
- [ ] A UI change includes an app screenshot, with before/after when visual.
- [ ] Evidence is attached as paths or links, not "see above".
- [ ] Performance work includes measured numbers with machine and method.

### 1.5 Data safety

- [ ] Schema changes include a migration, a fixture and a backup.
- [ ] Atomic save preserved; no write path bypasses it.
- [ ] Destructive actions undoable or confirmed.
- [ ] No silent deletion of blocks, branches, anchors, manual breaks or assets.
- [ ] Page settings and manual breaks survive save/reload; derived pages recompute deterministically.
- [ ] View state is not written as document data; stale references dropped on load.
- [ ] A failure leaves the document unchanged or recoverable.

### 1.6 Performance

- [ ] Within the budgets in §4 for the task's scale.
- [ ] Measured, not estimated; the method recorded.
- [ ] No new long task on typing, pan, zoom, page switch or repagination.
- [ ] No unbounded memory or listener growth.

### 1.7 Accessibility and UX

- [ ] Dark default, light available, choice persists.
- [ ] New UI has a keyboard path; focus visible; Esc works.
- [ ] Interactive elements have labels and roles; a screen-reader sanity check done.
- [ ] Contrast and non-colour cues present in both themes.
- [ ] Empty, loading, error, pagination and continuation states designed and implemented.
- [ ] Copy is English, consistent and actionable.
- [ ] Reduced motion respected.

### 1.8 Security and privacy

- [ ] User content sanitized at every boundary.
- [ ] No telemetry, analytics or background network calls.
- [ ] File access scoped; no path traversal.
- [ ] No secrets in code or logs; note content not logged by default.
- [ ] Dependency audit clean or the exception documented.

### 1.9 Documentation

- [ ] Spec, UX or ADR updated when behavior or a decision changed.
- [ ] README or run instructions updated when setup changed.
- [ ] Known limitations documented.
- [ ] Changelog entry for user-facing work.

### 1.10 Hygiene

- [ ] No debug code, commented-out code or TODOs without an issue.
- [ ] No dead files, stray assets or large binaries.
- [ ] Commits scoped and named with the task ID.
- [ ] The report follows `AGENTS.md`.
- [ ] The plan is updated.

### 1.11 Review

- [ ] Verdict is Approve or Approve with nits.
- [ ] No open S1 or S2.
- [ ] The review report is attached.
- [ ] The reviewer did not review their own work.

### 1.12 Stack and PDF

- [ ] The code matches ADR-0001; a deviation is flagged, not hidden behind a local helper.
- [ ] The packaged app launches; open/save uses shell APIs; no dev-only path.
- [ ] Renderer verified for fonts, zoom, IME, measurement and page rendering.
- [ ] `contextIsolation` on, `nodeIntegration` off, `sandbox` on, narrow preload, restrictive CSP.
- [ ] The print compositor consumes the paginator's pages and never re-paginates.
- [ ] Export identity: the print model and job consume the same measured run and fingerprint; a
      stale theme, settings or document fails the export instead of printing a different result.
- [ ] The 50+ page A4 gate passes with real text, no cut content and the paginator's page count.
- [ ] Atomic rename works on APFS.
- [ ] A stack or PDF change requires an ADR and reopens this section.

## 2. Per-task template

```text
Task / owner / reviewer:
Spec refs:
Acceptance criteria:
Non-goals:
Dependencies approved:
Files expected:
Page impact (size, orientation, margins, pagination, breaks, page count):
Test plan:
Fixtures:
Evidence:
Performance (metric / budget / measured):
Migration and data impact:
Docs updated:
Risks:
Reviewer verdict:
```

Rules: criteria copied verbatim; each has its own evidence; "N/A" needs a reason; a criterion that
cannot be verified is a finding.

**Definition of ready:** brief with criteria, scope and non-goals; spec/UX references; a fixture or
reproducible state; approved dependencies; page setup and expected page count; no open product
decision; for UI work, states and keyboard model. Missing any of these means **Blocked**, not
started.

---

## 3. Test strategy

### 3.1 Layers

| Layer | Scope | Gate |
|---|---|---|
| **Unit** | Pure model, commands, ordering, serialization, anchor resolution | Every commit, < 10 s |
| **Integration** | Model + storage, editor + marks, layout + measurement, commands + undo | Every PR |
| **End-to-end** | User flows on the packaged app | Critical suite every PR |
| **Visual** | Playwright screenshots and geometry snapshots | On demand |
| **PDF** | Fidelity, text extraction, page count, fonts | Every export change and release |
| **Performance** | Budgets on fixed fixtures | On demand and every release |
| **Migration / crash / fuzz** | Old files, kill mid-save, malformed input | Every schema change and release |

### 3.2 Unit and integration

- Test pure packages only: no DOM, network or file system.
- Test commands as transactions: success, rejection, undo.
- Table-driven cases: empty, one, deep, wide, Unicode, duplicate quote.
- Roundtrip serialization, including unknown fields.
- Storage: temp directory, atomic save, simulated crash, backup rotation, missing asset.
- Editor: anchor marks, split/merge, paste, IME.
- Layout: real measurement in the renderer (jsdom cannot measure text); assert no overlap and that
  every block is inside the content box.
- Pagination: chapter starts, breaks between blocks, markers, ghost parents, defects, fonts and
  images settled before pagination.
- Reader/Page parity: same breaks and positions from the same layout and settings.

### 3.3 End-to-end

- Playwright on the target macOS runner.
- Load fixtures through an app API, not UI setup.
- Cover create, edit, branch, anchor, save/reload, collapse, page navigation, layout switch,
  markers, pagination, continuation, long blocks, themes, Markdown guest round-trip, export
  preflight, PDF, keyboard-only path.
- No arbitrary sleeps; wait on explicit signals.
- Test the packaged app, not only the browser path.
- Suites: `tests/e2e/` critical, `tests/recovery/`, `tests/ui/`, plus on-demand `tests/perf/` and
  `tests/visual/`. Artifact roots honour `NOTEFOREST_ARTIFACTS`.

**Runner rules.** UI suites run one `node --test` process per file with a default pool of **4**
workers (`NOTEFOREST_UI_CONCURRENCY`, capped at 8). Each suite owns its app-support, library and
artifact roots and never deletes another suite's evidence. A failing suite prints TAP and fails the
gate; a timeout also fails. Integration runs use the concurrency that was fully green on this
machine (**4**); a higher value times out here, and a local-only timeout is not an accepted
limitation.

**Hidden windows.** E2E runs hidden by default (`NOTEFOREST_E2E_HIDDEN=1`): no visible window, no
dock icon, no focus stealing. The visual suite opts into a visible window; Playwright still drives
hidden windows through CDP, and background throttling stays disabled. Performance runs hidden: the
hidden and visible 300-block render measured 1,017 vs 1,019 ms.

**Commands.** `npm test` unit; `npm run e2e` critical (builds first, suite budget < 60 s);
`npm run test:recovery`; `npm run test:ui`; `npm run verify:fast` = typecheck + unit + critical;
`npm run verify` = `verify:fast` + recovery + UI, once on integration. Builders run targeted tests
then one `verify:fast`; the orchestrator runs one `verify`.

### 3.4 Visual

Fixed runner, pinned fonts, same OS and engine. Disable animations, hide the caret, move the mouse,
mask timestamps. Prefer geometry snapshots for layout; pixels for style. Element screenshots, not
the whole window, with `maxDiffPixelRatio` for anti-aliasing. Baselines are reviewed like code.
Dark is the default baseline; light included; the PDF stays light. Check both orientations at fit,
100 % and 150 %.

### 3.5 PDF

- Extract every block's sentinel text with `pdftotext` or `pdfjs-dist`; assert order.
- Page count, size and orientation via `pdfinfo`; embedded fonts via `pdffonts`.
- Breaks equal Page and the paginator; no cut line, image, formula, table row or code line.
- Tables break only between rows; a too-tall row blocks export.
- The PDF is light in both themes.
- Export is blocked for an impossible block, naming it.
- Unhonoured manual hints are reported.
- A blank produced page fails, classified from the model or raster ink; a page with only an image is
  not blank.
- A dimensioned asset that fails at print time prints the app placeholder and reports a warning.
- Run from the packaged app; `pdfjs-dist` is a runtime dependency.
- Metric parity by computed style or raster, not only inline attributes.
- Detect `�`, blank pages and text-as-image.
- Page count, size and orientation deterministic across repeated exports.

### 3.6 Performance

- Fixtures at 300 and 1,000 blocks, release build, base Apple silicon Mac, fit and 100 %, no
  DevTools.
- Five runs; median and p95; store commit and fixture hash.
- Instrument layout and edit paths; count laid-out nodes.
- Measure pagination separately; record page count.
- Measure page switch and navigation separately from pan and zoom.
- Gate on stable metrics; track noisy ones as trends.
- Performance work ships separately from features.

### 3.7 Migration, crash and fuzz

- A golden file per schema version; migrate and snapshot the semantic diff.
- Page settings and manual breaks survive migration; pagination deterministic.
- Settings files have a schema version, a corrupt backup/warning, a serialized writer and an
  unknown-field policy.
- Kill during save at several points; reopen; old or new complete file exists.
- A newer document schema is refused with no write; a newer settings schema is read with a warning
  and preserved.
- Fuzz JSON and Markdown imports: no crash, bounded time and memory.
- Duplicate IDs, cycles, orphan edges and invalid settings are rejected with specific errors.

### 3.8 Test hygiene

- Write the regression test before the fix.
- No test-only branches in production.
- No order dependence; each test owns its fixtures.
- The UI runner's suite list is checked against the files, so a new suite cannot be skipped.
- No network; time and randomness injected.
- Coverage is not a target; critical failure paths must be covered or justified.

---

## 4. Performance budgets

Base Apple silicon Mac (M1, 16 GB), release build, dark theme, no DevTools, cold cache.

| Metric | 300 blocks | 1,000 blocks |
|---|---|---|
| Cold start to usable window | < 3 s | < 3 s |
| Open to interactive | < 2 s | < 5 s |
| First content paint | < 1 s | < 2 s |
| Full layout p95 | < 50 ms | < 250 ms |
| Pagination p95 | < 30 ms | < 150 ms |
| Incremental layout (≤ 20 nodes) p95 | < 8 ms | < 8 ms |
| Keystroke to paint p95 | < 50 ms | < 50 ms |
| Pan/zoom frame p95 | ≤ 18 ms | ≤ 18 ms |
| Page switch p95 | < 100 ms | < 150 ms |
| Jump to page p95 | < 150 ms | < 250 ms |
| Autosave | < 150 ms | < 500 ms |
| PDF export | < 10 s | < 30 s |
| App RSS | < 600 MB | < 1.2 GB |

300 blocks is guaranteed; 1,000 is usable with virtualization, collapse and focus. Do not promise
5,000. A missed budget is fixed, scoped down, or recorded in an ADR with a user-visible mitigation;
never silently raised. Re-baseline with the machine and date recorded.

---

## 5. Release gate

- [ ] No open S1 or S2; known limitations documented.
- [ ] Full verify green on a clean checkout; visual baselines reviewed.
- [ ] Migration matrix covers every shipped schema version; downgrade blocked.
- [ ] Crash recovery: kill mid-save, reopen, restore.
- [ ] Fresh install, upgrade, uninstall/reinstall; package opens in Finder.
- [ ] PDF representative documents checked: count, breaks, text, fonts, light paper.
- [ ] Performance budgets verified on the target Mac.
- [ ] Accessibility: keyboard-only, contrast, reduced motion.
- [ ] Security: dependency audit, no telemetry, CSP, sanitization.
- [ ] Version, build number and changelog.

---

## 6. Not done when

- Tests pass but no acceptance criterion is demonstrated.
- The demo works only on the dev build.
- A known S1 or S2 is deferred without approval.
- Docs contradict the behavior.
- Performance is unmeasured.
- A UI change has no screenshot.
- Migration is untested.
- Layout defects are clipped, scaled or cut instead of blocked.
- Pagination cuts content, uses an unsafe boundary, or omits markers.
- PDF count or breaks differ from Page.
- Pages are stored as containers or fixed columns return without an ADR.
- The reviewer has not approved.
- A normal action can lose data.
