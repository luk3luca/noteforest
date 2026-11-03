# Definition of Done

**Status:** v3 — updated for adaptive layout and derived pagination.
**Owner:** Reviewer / Sentinel.
**Language:** English.
**Companion:** `docs/review-checklist.md` (review procedure, severity, report template).

---

## Phase note

The stack is approved (Electron + React + TypeScript + TipTap/ProseMirror + CodeMirror 6 + KaTeX +
React Flow + `printToPDF`). Until `docs/spec.md` and `docs/ux.md` are approved, this document still
governs **documents, not code**. A docs task is done when:

- factual claims are sourced or labelled opinion;
- decisions are recorded with alternatives and consequences;
- acceptance criteria are testable;
- terminology matches `AGENTS.md`;
- nothing contradicts the approved stack or the layout model (no freeform canvas, pins, fixed
  columns, stored page containers, or separate reader PDF);
- the Reviewer has approved the document.

Code-related sections activate when implementation starts. A change to the approved stack or page
model without an ADR is not done, even if it works.

---

## 1. General Definition of Done

A task is done only when all of the following apply. "Done" is a **reviewer verdict**, not an
implementer claim.

### 1.1 Contract and scope

- [ ] A task brief exists with numbered acceptance criteria, scope, and non-goals.
- [ ] Every acceptance criterion is met and evidenced; no partial "mostly".
- [ ] Only in-scope files changed; unrelated refactors are separate tasks.
- [ ] The spec and UX docs are not changed without an ADR; deviations are recorded.
- [ ] Every new dependency is approved and documented.
- [ ] No product decision was invented; ambiguities were resolved before implementation.

### 1.2 Build and static checks

- [ ] Clean install from the lockfile.
- [ ] Release/production build succeeds.
- [ ] Typecheck is clean; suppressions are justified in the diff.
- [ ] Lint and format are clean; no new warnings.
- [ ] No secrets, credentials, or machine-specific paths.
- [ ] The packaged Electron build launches, not only the dev server.

### 1.3 Tests

- [ ] Unit tests cover new logic; integration tests cover boundaries.
- [ ] Every bug fix has a regression test that fails before the fix.
- [ ] Failure paths are covered: invalid input, missing asset, corrupt file, save failure.
- [ ] The full suite is green locally and in CI.
- [ ] Tests are deterministic: no sleeps, network, real clock, or order dependence.
- [ ] Fixtures are added or updated and named.
- [ ] Property tests cover any layout or model invariant the task touches.
- [ ] Pagination tests cover A4 portrait and landscape, page breaks, continuation markers, and page
      count when the task touches layout or export.
- [ ] Visual, PDF, and performance checks were run when the task touches those areas.

### 1.4 Manual verification and evidence

- [ ] The app was launched from a clean state and every acceptance criterion reproduced end to end.
- [ ] Save, quit, reopen preserves the change and the page count.
- [ ] Undo/redo works for every new mutation.
- [ ] Adjacent flows were spot-checked: outline/reader/page-view sync, anchor behavior, pagination,
      and continuation markers.
- [ ] Reader and page views were checked in A4 portrait and landscape, with the page count recorded.
- [ ] A UI change includes a screenshot or short recording, with before/after when visual.
- [ ] Evidence is attached to the task as paths or links, not "see above".
- [ ] Performance-sensitive work includes measured numbers with machine and method.

### 1.5 Data safety

- [ ] Schema changes include a migration, a fixture, and a backup.
- [ ] Atomic save is preserved; no new write path bypasses it.
- [ ] Destructive actions are undoable or confirmed.
- [ ] No silent deletion of blocks, branches, anchors, manual break hints, or assets.
- [ ] Page settings and manual break hints survive save and reload; derived pages recompute
      deterministically.
- [ ] A failure leaves the document unchanged or recoverable.

### 1.6 Performance

- [ ] Within the budgets in §5 for the task's scale.
- [ ] Measured, not estimated; the method is recorded.
- [ ] No new long task on typing, pan, zoom, or page switch.
- [ ] No unbounded memory or listener growth.

### 1.7 Accessibility and UX

- [ ] New UI has a keyboard path; focus is visible; Esc works.
- [ ] Interactive elements have labels and roles; a screen-reader sanity check was done.
- [ ] Contrast and non-color cues are present.
- [ ] Empty, loading, error, pagination, and continuation states are designed and implemented.
- [ ] Copy is English, consistent, and actionable.
- [ ] Reduced motion is respected.

### 1.8 Security and privacy

- [ ] User content is sanitized at every boundary.
- [ ] No telemetry, analytics, or background network calls.
- [ ] File access is scoped; no path traversal.
- [ ] No secrets in code or logs; note content is not logged by default.
- [ ] The dependency audit is clean or the exception is documented.

### 1.9 Documentation

- [ ] Spec, UX, or ADR updated when behavior or a decision changed.
- [ ] README or run instructions updated when setup changed.
- [ ] Known limitations documented.
- [ ] Changelog entry added for user-facing work (later phase).

### 1.10 Hygiene and reporting

- [ ] No debug code, commented-out code, or TODOs without an issue.
- [ ] No dead files, stray assets, or large binaries.
- [ ] Commits are scoped and named with the task ID.
- [ ] The report follows `AGENTS.md`: summary, files, checks, questions, risks, next step.
- [ ] The task board or plan is updated.

### 1.11 Review

- [ ] Reviewer verdict is Approve or Approve with nits.
- [ ] No open S1 or S2 findings.
- [ ] The review report is attached (template in `docs/review-checklist.md`).
- [ ] The reviewer did not review their own work.

### 1.12 Stack-specific checks (Electron)

- [ ] **Desktop shell:** the packaged Electron app launches; open/save uses shell APIs; file
      association and recent documents work; no dev-only path.
- [ ] **Renderer:** Chromium behavior verified for fonts, zoom, IME, text measurement, and page
      rendering.
- [ ] **Security model:** `contextIsolation` on, `nodeIntegration` off, privileged work through a
      narrow preload API; no remote code.
- [ ] **PDF path:** Electron `printToPDF` renders the shared paginator's page view with CSS `@page`,
      correct A4 size/orientation/margins, continuation markers, a real text layer, and no scaling
      drift.
- [ ] **File system:** atomic rename works on APFS; sandbox permissions or security-scoped bookmarks
      are handled if sandboxed.
- [ ] **Packaging:** the build is reproducible even before signing and notarization exist.
- [ ] **No stack drift:** no Tauri/WKWebView path or alternative renderer is added without an ADR.

---

## 2. Per-task DoD template

Copy this into the task and fill every field:

```text
Task:
Owner:
Reviewer:
Spec refs:
Acceptance criteria:
1.
2.
3.
Non-goals:
Dependencies approved:
Files expected:
Page/layout impact (size, orientation, margins, pagination, manual breaks, page count):
Test plan:
Fixtures:
Evidence (links):
Performance (metric / budget / measured):
Migration and data impact:
Docs updated:
Risks:
Reviewer verdict:
```

Rules:

- Acceptance criteria are copied verbatim from the brief.
- Every criterion has its own evidence; "N/A" needs a reason.
- The task is not done until the reviewer fills the verdict.
- A criterion that cannot be verified is a finding, not a checkbox.

### 2.1 Definition of Ready (precondition)

- A brief with acceptance criteria, scope, and non-goals.
- Spec and UX references.
- A fixture or a reproducible starting state.
- Approved dependencies.
- Page size, orientation, margins, pagination rule, and expected page count.
- No open product decision.
- For UI work, the expected states and keyboard model.

If any is missing, the task is **Blocked**, not started.

---

## 3. Test strategy

### 3.1 Layers

| Layer | Scope | Runs | Gate |
|---|---|---|---|
| **Unit** | Pure model, commands, ordering, serialization, anchor resolution logic | Every commit, under 10 s | Must pass |
| **Property-based** | Invariants over generated documents | Every commit or nightly | No counterexample |
| **Integration** | Model + storage, editor + marks, layout + measurement, commands + undo | Every PR | Must pass |
| **End-to-end** | User flows on the packaged app | Every PR (smoke) and nightly (full) | Must pass |
| **Visual** | Screenshots and geometry snapshots | Every PR on a fixed runner | No unintended diff |
| **PDF** | Page fidelity, text extraction, page count, fonts | Every export change; every release | Must pass |
| **Performance** | Budgets on fixed fixtures | Nightly or weekly; every release | No regression over 20% |
| **Migration / crash / fuzz** | Old files, kill mid-save, malformed input | Every schema change and every release | Must pass |

### 3.2 Unit tests

- Test pure packages only: no DOM, network, or file system.
- Test commands as transactions: success, rejection, and undo.
- Use table-driven cases: empty, one, deep, wide, Unicode, duplicate quote.
- Roundtrip serialization, including unknown fields.

### 3.3 Property-based tests

Generate valid documents and assert:

1. No block, callout, label, or arrow crosses the page content box or its margins in page view.
2. Layout produces no overlapping rectangles after applying the minimum gap.
3. Widths are content-driven: they depend on the block's content and subtree, and the same document
   yields the same widths. No fixed pixel column per depth exists.
4. A child is either to the right of its parent, or below it with a slight indent when horizontal
   room is insufficient. There is no arbitrary placement.
5. Top-level blocks follow chapter order with no overlap.
6. An anchored callout is below its anchor within tolerance; if it reaches the page bottom, it
   continues on the next page and is never split.
7. An anchor rectangle lies inside its block rectangle, or is flagged as orphaned.
8. Layout is idempotent: `layout(layout(doc))` equals `layout(doc)`.
9. Adding or removing a reference edge changes no node position or page break.
10. Layout and pagination are deterministic for the same document and page settings.
11. Fractional order insertion always sorts strictly between its neighbors.
12. Serialization roundtrip preserves page size, orientation, margins, manual break hints, IDs,
    edges, and anchors; derived pages are not serialized.
13. Migration preserves block, edge, and anchor counts and IDs, plus page settings and manual break
    hints.
14. Undo then redo returns to a byte-identical serialized state.
15. No sequence of reparent commands can create a primary cycle.
16. An anchor edit either preserves the anchor or marks it orphaned; it never silently retargets.
17. Pagination breaks only between blocks; no block is split across pages.
18. Pagination is idempotent and deterministic: the same layout and settings give the same breaks
    and page count.
19. Every block appears exactly once in reading order across the derived pages.
20. No page is empty unless the spec allows an explicitly blank page, and there is no empty trailing
    page.
21. A manual break hint, if honored, falls between blocks; an invalid hint resolves deterministically
    and never splits a block.
22. Reader view and page view derive identical page breaks from the same layout and settings.

Log the seed. Save any shrunk failure as a named regression fixture.

### 3.4 Integration tests

- **Storage:** temp directory, atomic save, simulated crash, backup rotation, missing asset.
- **Editor:** transaction mapping of anchor marks, split and merge, paste, IME.
- **Layout:** real measurement in the renderer (jsdom cannot measure text); compare geometry and
  widths; assert no overlap and that every block is inside the page content box in page view.
- **Pagination:** breaks between blocks, continuation markers, manual break hints, orientation and
  margin changes, and page-count transitions.
- **Reader/page parity:** the two views derive the same layout and break positions; switching
  preserves reading position and selection.
- **Undo:** coalescing rules and save boundaries.
- **Outline/reader/page view:** shared IDs, shared order, collapse and navigation synchronization.

### 3.5 End-to-end tests

- Playwright or the shell equivalent, on the target macOS runner.
- Load fixtures through an app API, not through UI setup, to keep tests fast and stable.
- Cover: create, edit, branch, anchor, save/reload, collapse, page navigation, reader/page switch,
  pagination, continuation markers, export PDF, keyboard-only path.
- No arbitrary sleeps; wait for explicit app signals.
- One smoke path on every PR; full matrix nightly.
- Test the packaged Electron app on macOS; no Tauri or WKWebView path.

### 3.6 Visual regression

- Fixed runner, pinned fonts, same OS and browser engine as the target.
- Disable animations, hide the caret, move the mouse away, mask timestamps.
- Prefer geometry snapshots (node positions, edge paths) for layout; pixels only for style.
- Use element screenshots of page-view regions and reader-view page-break markers, not the whole
  window, with `maxDiffPixelRatio` for anti-aliasing.
- Baselines are reviewed like code; intentional updates go in a dedicated commit.
- Check A4 portrait and landscape in reader and page views at fit-page, 100%, and 150%; light and
  dark if supported.

### 3.7 PDF tests

- Generate fixture PDFs and assert every block's sentinel text with `pdftotext`, page by page.
- Use `pdfinfo` for page count, page size, and orientation; `pdffonts` for embedded fonts.
- Assert the PDF page count and page breaks equal the page view and the shared paginator.
- Assert no block is split across PDF pages and continuation markers appear where the page view
  shows them.
- Assert A4 portrait and landscape documents keep their dimensions, orientation, and margins.
- Detect `�`, blank pages, and text rendered as images.
- Visually check formulas, code, arrow vector quality, and that content stays inside the margins.
- Page count, page breaks, size, orientation, and margins must be deterministic across repeated
  exports.
- Manual Notability import every release; record the iPad model and iPadOS version.

### 3.8 Performance tests

- Fixed fixtures at 300 and 1,000 blocks across pages.
- Release build, base M1 with 16 GB, fit-page and 100% zoom, no DevTools.
- Five runs; report median and p95; store commit and fixture hash.
- Instrument layout and edit paths; assert incremental behavior by counting laid-out nodes.
- Measure pagination separately from layout; record the page count for each fixture.
- Measure page switch and page navigation separately from pan and zoom.
- Gate on stable metrics; track noisy ones as trends.
- Performance work ships in separate PRs from features.

### 3.9 Migration, crash, and fuzz tests

- A golden file per schema version; migrate to latest and snapshot the semantic diff.
- Page settings, margins, and manual break hints survive migration; pagination remains deterministic.
- Kill the process during save at several points; reopen; the old or new complete file exists.
- A newer schema is refused with no write.
- Fuzz JSON, Markdown, and JSON Canvas imports; no crash, bounded time and memory.
- Duplicate IDs, primary cycles, orphan edges, invalid page settings, and invalid break hints are
  rejected with specific errors.

### 3.10 Test hygiene and coverage

- Write the regression test before the fix.
- No test-only branches in production code.
- No order dependence; each test owns its fixtures.
- No network; time and randomness are injected.
- Coverage is not a target. Anchors, layout, persistence, and migration must cover failure paths;
  uncovered critical lines are justified in review.

---

## 4. Required fixtures

The location follows the repo ADR; the names below are canonical. Each fixture has a README with
purpose, expected invariants, and owning tests.

| Name | Contents | Must demonstrate |
|---|---|---|
| **formula-two-anchors** | A math block with two anchored terms, each with one branch | Distinct anchors; editing one does not move the other; both paginate correctly if the page ends; both survive reload |
| **shared-child** | A primary→C and B reference→C, plus a normal child; C near a page break | C rendered once from A; outline shows it once with a reference indicator; the reference does not move C or change page breaks; removing it changes nothing |
| **collapsed-subtree** | Three-level branch, middle node collapsed | Space reclaimed; hidden-count badge; expand restores; outline sync; save/reload preserves; page count repaginates deterministically |
| **broken-anchor** | A branch whose anchor text was deleted | Branch kept; orphan UI; quote shown; reattach works; save/reload preserves the orphan; export warns |
| **pagination-break** | A continuous document longer than one A4 page, with a lower-level block continuing at a break; portrait and landscape variants | Breaks occur only between blocks; no block is split; a continuation marker appears on the next page; page count equals the paginator; order preserved; no block duplicated or lost |
| **large-document** | 300 and 1,000 blocks across multiple derived pages, mixed text, math, code, and images | Budgets met; page navigation; reader/page parity; PDF export; no freeze; page count deterministic |
| **malformed-file** | Invalid JSON, invalid schema, newer version, duplicate IDs, primary cycle, two primary parents, missing asset, invalid page settings, invalid manual break hint | Each fails gracefully with a specific error; no overwrite; backup offered |

Recommended additional fixtures:

- **anchor-stress:** repeated edits before, inside, and after an anchor; paragraph split, merge, undo.
- **unicode-ime:** CJK, emoji, combining marks, RTL, IME composition.
- **long-code:** a 2,000-line code block, horizontal scroll, token anchor.
- **image-anchor:** region anchor, crop, replace, missing asset.
- **multi-top-level-pages:** multiple top-level blocks across several pages, deep and wide trees.
- **landscape:** landscape-only document with the same content as the portrait fixture; page count
  may differ deterministically.
- **manual-break-hints:** a hint between blocks, a hint inside a block (invalid), a hint at a
  collapsed boundary, and undo/redo.
- **pagination-boundaries:** a block at the start and end of a page, a very tall block, and a nested
  branch crossing a break.

Fixture rules:

- Small enough for CI. Generate `large-document`; do not commit 1,000 hand-written blocks.
- Include page settings: A4 size, orientation, margins, optional manual break hints, and expected
  page count.
- Keep `pagination-break` small enough to read; generate large variants separately.
- Deterministic IDs and timestamps.
- No real user data.
- Versioned with the schema; update them when the format changes.

---

## 5. Performance budgets

Proposed numbers; ratify them in the page-layout/performance ADR. Target machine: base Apple
silicon Mac (M1, 16 GB), release build, fit-page and 100% zoom, light theme, no DevTools, cold
cache for open.

| Metric | 300 blocks | 1,000 blocks | Method |
|---|---|---|---|
| App cold start to usable window | < 3 s | < 3 s | Trace, five runs |
| Open to interactive | < 2 s | < 5 s | Open mark to first accepted input |
| First content paint | < 1 s | < 2 s | Trace |
| Full layout | < 50 ms p95 | < 250 ms p95 | Instrumented layout call |
| Incremental layout (≤ 20 affected nodes) | < 8 ms p95 | < 8 ms p95 | Same instrumentation |
| Keystroke to paint | < 50 ms p95 | < 50 ms p95 | Input timestamp to frame |
| Pan/zoom frame | p95 ≤ 18 ms on a full A4 page | p95 ≤ 18 ms on a full A4 page | Trace during a 5 s gesture |
| Page switch (next/previous) | < 100 ms p95 | < 150 ms p95 | Trace, 20 switches |
| Jump to page N | < 150 ms p95 | < 250 ms p95 | Trace, 20 jumps |
| Marquee select a full page | < 16 ms | < 16 ms | Instrumented |
| Autosave (off the typing path) | < 150 ms | < 500 ms | Includes fsync |
| Load and validate (excluding assets) | < 300 ms | < 1 s | Instrumented |
| PDF export | < 10 s | < 30 s | Wall clock; record page count |
| App RSS | < 600 MB | < 1.2 GB | Activity Monitor or instrumented |
| Export peak memory | < 1.5 GB | < 1.5 GB | Instrumented |
| Installed size | < 250 MB | — | Track only |

Correctness gates, not performance:

- PDF page count equals canvas page count exactly.
- Every PDF page is A4 with the correct orientation; no scaling drift.
- Every block sits inside the page content box in both portrait and landscape.

Notes:

- **300 blocks is the guaranteed target.** 1,000 blocks across many pages must stay usable; only
  the current page is rendered. Do not claim 60 fps with every page visible.
- Do not promise 5,000+ blocks. If the product needs it, that is a new ADR with virtualization.
- Budgets are release gates. PRs gate on a regression over 20% for stable metrics.
- If a budget is missed: optimize, reduce scope, or write an ADR with a user-visible mitigation.
  Never silently raise the number.
- Re-baseline after the page-layout spec and ADR are approved; record the machine and date.

---

## 6. Release checklist (later)

### Scope and quality

- [ ] Milestone tasks are approved; no S1 or S2 is open.
- [ ] Known limitations are documented.
- [ ] No half-built feature is visible: annotation layer, collaboration, iPad, reader mode, freeform
      canvas, pins.
- [ ] NoteForest name/trademark clearance completed or a rename decided before packaging
      (public-release blocker; an existing NoteForest study app is known).

### Verification

- [ ] Full suite green on clean CI and the target macOS runner.
- [ ] Visual baselines regenerated intentionally and reviewed.
- [ ] Migration matrix covers every shipped schema version; downgrade is blocked.
- [ ] Crash recovery: kill mid-save, reopen, restore from backup.
- [ ] Fresh install, upgrade, uninstall/reinstall; the document package opens in Finder.
- [ ] File association, recent documents, and permissions work.
- [ ] PDF: three representative documents exported and imported into Notability; A4 portrait and
      landscape; page count matches the canvas; text searchable and highlightable; fonts embedded.
- [ ] Page navigation, orientation switch, split, and merge verified on a multi-page document.
- [ ] Large document with 1,000 blocks across pages: open, navigate, edit, export, memory.
- [ ] Performance budgets verified on the minimum-spec Mac.
- [ ] Accessibility: keyboard-only, VoiceOver on core flows, contrast, reduced motion.
- [ ] Security: dependency audit, no telemetry, CSP, sanitization, license notices.
- [ ] Data location, backup, and export instructions documented.

### Packaging and distribution

- [ ] Signing and notarization; Gatekeeper passes.
- [ ] Auto-update channel and rollback plan, if any.
- [ ] Version and build number; changelog.
- [ ] Privacy policy if distributed; no analytics.
- [ ] Support and recovery instructions.
- [ ] Post-release: crash reports opt-in only, local by default.

---

## 7. Exceptions

- A waiver needs an ADR or orchestrator approval, a reason, a user-visible risk, and an expiry or
  milestone.
- Waivers never apply to data loss, security, a missing PDF text layer, or a wrong PDF page count,
  page size, or orientation.
- "Temporary" without an issue is not a waiver.

---

## 8. Not done when

- tests pass but no acceptance criterion is demonstrated;
- the demo works only on the dev build;
- a known S1 or S2 is deferred without approval;
- docs contradict the behavior;
- performance is unmeasured;
- a UI change has no screenshot;
- migration is untested;
- page overflow is clipped, silently reflowed, or split without undo;
- PDF page count, size, or orientation differs from the canvas;
- the reviewer has not approved;
- a normal action can lose data.
