# Definition of Done

**Status:** v7 — M2f phase 5c re-review; spec v0.4.4.
**Owner:** Reviewer / Sentinel.
**Language:** English.
**Companion:** `docs/review-checklist.md` (review procedure, severity, report template).

---

## Phase note

The v1 stack and PDF pipeline are decided (ADR-0001, ADR-0002); the External Agent API defaults are
decided (ADR-0003). The spec v0.4.4 is approved. **Current gate:** M2f phase 5c re-review is complete
with **accept with minor**; `npm run verify` (typecheck, unit, critical e2e, recovery, view UI) is the
task gate. N1 (undo of a new chapter's first block) and N2 (close/quit on non-document failures) are
closed; N3/N5/N6 are closed. The remaining risks are recorded in
`docs/reviews/m2f-phase5c-review.md`: the DoD/checklist phase headers were stale (fixed), and the
first cold-cache critical e2e run measured 62.8 s against the 60 s suite-time budget while three warm
runs measured 52.2–53.4 s. Measured on 5 November 2026: unit 252/2.3 s, critical e2e 20/52.2–53.4 s
(one cold run 62.8 s), recovery 14/21.7 s, UI 5/22.6 s, `npm run verify` 115.3 s. M2 is not accepted
and M3/PDF remain blocked until the product owner accepts. Until a milestone is approved, this
document governs **documents and the approved implementation**, not general application code. A docs
task is done when:

- factual claims are sourced or labelled opinion;
- decisions are recorded with alternatives and consequences;
- acceptance criteria are testable;
- terminology matches `AGENTS.md`;
- nothing contradicts the locked layout model (no freeform canvas, pins, fixed columns, stored page
  containers, or separate reader PDF);
- stack, PDF, and API behavior match the ADRs; a deviation is an ADR, not a doc edit;
- the in-app chat/agent panel is treated as a v1 non-goal; the agent surface is the External Agent
  API;
- the Reviewer has approved the document.

Code-related sections activate when implementation starts. A change to the chosen stack, PDF
pipeline, or layout/pagination model without an ADR is not done, even if it works.

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
- [ ] The packaged desktop build launches on Electron, not only the dev server.

### 1.3 Tests

- [ ] Unit tests cover new logic; integration tests cover boundaries.
- [ ] Every bug fix has a regression test that fails before the fix.
- [ ] Failure paths are covered: invalid input, missing asset, corrupt file, save failure.
- [ ] The full suite is green locally and in CI.
- [ ] Tests are deterministic: no sleeps, network, real clock, or order dependence.
- [ ] Fixtures are added or updated and named.
- [ ] Property tests cover any layout or model invariant the task touches.
- [ ] Pagination tests cover A4 portrait and landscape, page breaks, long-block safe boundaries,
      continuation markers, and page count when the task touches layout or export.
- [ ] Visual, PDF, and performance checks were run when the task touches those areas.

### 1.4 Manual verification and evidence

- [ ] The app was launched from a clean state and every acceptance criterion reproduced end to end.
- [ ] Save, quit, reopen preserves the change and the page count.
- [ ] Undo/redo works for every new mutation.
- [ ] Adjacent flows were spot-checked: outline/reader/page-view sync, anchor behavior, pagination,
      and continuation markers.
- [ ] Reader and page views were checked in A4 portrait and landscape, with the page count recorded.
- [ ] Dark mode (default) and light mode were checked; the PDF stays light in both.
- [ ] Freeze mode is read-only; exit offers incremental or full reflow; selection and page survive.
- [ ] External Agent API work verified token scopes, the dry-run diff, apply, undo, audit entry, and
      document lock.
- [ ] A UI change includes an app screenshot, with before/after when visual. A screen recording is
      optional and only when the product owner asks for it; agents do not record the screen.
- [ ] Evidence is attached to the task as paths or links, not "see above".
- [ ] Performance-sensitive work includes measured numbers with machine and method.

### 1.5 Data safety

- [ ] Schema changes include a migration, a fixture, and a backup.
- [ ] Atomic save is preserved; no new write path bypasses it.
- [ ] Destructive actions are undoable or confirmed.
- [ ] No silent deletion of blocks, branches, anchors, manual break hints, or assets.
- [ ] Page settings and manual break hints survive save and reload; derived pages recompute
      deterministically.
- [ ] View state (mode, page, scroll, zoom, selection, collapse) is not written as document data,
      and stale references are dropped on load.
- [ ] A failure leaves the document unchanged or recoverable.

### 1.6 Performance

- [ ] Within the budgets in §5 for the task's scale.
- [ ] Measured, not estimated; the method is recorded.
- [ ] No new long task on typing, pan, zoom, page switch, or repagination.
- [ ] No unbounded memory or listener growth.

### 1.7 Accessibility and UX

- [ ] First run defaults to dark mode; light mode is available and the choice persists.
- [ ] New UI has a keyboard path; focus is visible; Esc works.
- [ ] Interactive elements have labels and roles; a screen-reader sanity check was done.
- [ ] Contrast and non-color cues are present in dark mode (default) and light mode.
- [ ] Visual language is clean and minimal, with consistent spacing and typography across views.
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

### 1.12 Stack and PDF pipeline checks (decided)

The stack is Electron + React + TypeScript (ADR-0001); the PDF pipeline is the shared paginator plus
`printToPDF` (ADR-0002). These checks apply from Spike 1 onward.

- [ ] The code matches the stack ADR; a deviation is flagged, not hidden behind a local helper.
- [ ] **Desktop shell:** the packaged app launches; open/save uses shell APIs; file association and
      recent documents work; no dev-only path.
- [ ] **Renderer:** behavior verified on Chromium for fonts, zoom, IME, text measurement, and page
      rendering.
- [ ] **Security model:** renderer least privilege; `contextIsolation` on, `nodeIntegration` off,
      `sandbox` on, narrow preload API, restrictive CSP, no remote code.
- [ ] **PDF pipeline:** the print compositor consumes the paginator's derived pages and never
      re-paginates; page geometry, ghost/continuation markers, real text layer, embedded fonts, and
      table-row atomicity are verified.
- [ ] **PDF gate:** the 50+ page A4 spike (or the real-app equivalent after M6) passes with real
      text, no cut line/image/formula/code line/table row, and page count equal to the paginator.
- [ ] **File system:** atomic rename works on APFS; sandbox permissions or security-scoped bookmarks
      are handled if sandboxed.
- [ ] **Packaging:** the build is reproducible even before signing and notarization exist.
- [ ] A stack or PDF-pipeline change requires an ADR and reopens this section.

### 1.13 External Agent API

The in-app chat/agent panel is a v1 non-goal. The agent surface is a local API.

- [ ] The API is off by default; the user enables it, chooses a port, and issues or revokes tokens.
- [ ] API mutations use the shared typed command API; there is no API-only store, file, or model
      mutation.
- [ ] The HTTP JSON API and the MCP adapter map to the same command catalog; there is no second
      command surface.
- [ ] The server binds loopback or a Unix socket only.
- [ ] Bearer tokens are shown once, stored hashed, compared in constant time, and revocable; scopes
      are `read`, `write`, `export`, `destructive`, and `audit`, and a token cannot self-escalate.
- [ ] Token secrets never appear in the document package, git, PDF metadata, logs, errors, or the
      audit log.
- [ ] Tokens are document-scoped in v1; a token cannot read another document by path or ID. Library
      scope is not available without a new ADR.
- [ ] Dry-run returns a structured diff; commands validate `baseRevision`; apply is atomic;
      destructive actions require explicit confirmation naming the affected IDs; a stale revision is
      refused.
- [ ] Responses return created/updated IDs, diff, new revision, undo token, and audit ID; API undo
      names a transaction ID, succeeds only while it is the top undoable entry, and reverts one entry
      on the shared stack.
- [ ] One writer lock per document (OS advisory lock + lock file); concurrent readers are allowed;
      a second writer conflicts instead of corrupting; lock recovery is explicit.
- [ ] Every request (read, write, dry-run, export, failure) is audit-logged with token/client,
      command, document, base revision, result, affected IDs, and duration; no note body by default.
- [ ] No write is silent: every mutation returns a command ID and audit entry, and the UI reflects it.
- [ ] Note content is untrusted; malicious content cannot trigger a command without an explicit API
      call.
- [ ] Auth, scope, validation, conflict, lock, and rate-limit errors are structured; no partial
      mutation; retries are idempotent; no outbound network.
- [ ] Auth/scope, MCP mapping, audit, dry-run/apply/undo, lock/concurrency, malicious-content, and
      no-network tests pass.

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
External API impact (commands, scopes, audit, lock):
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
- External Agent API scope and permissions, when the task touches the API.
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
| **Visual** | T3 internal browser for manual/visual checks; Playwright screenshots and geometry snapshots | Every PR on a fixed runner | No unintended diff |
| **PDF** | Page fidelity, text extraction, page count, fonts; Playwright plus `pdftotext` | Every export change; every release | Must pass |
| **External API** | Auth/scopes, dry-run, apply/undo, audit, locking, malicious content | Every API change; every release | Must pass |
| **Performance** | Budgets on fixed fixtures | Nightly or weekly; every release | No regression over 20% |
| **Migration / crash / fuzz** | Old files, kill mid-save, malformed input | Every schema change and every release | Must pass |

### 3.2 Unit tests

- Test pure packages only: no DOM, network, or file system.
- Test commands as transactions: success, rejection, and undo.
- Use table-driven cases: empty, one, deep, wide, Unicode, duplicate quote.
- Roundtrip serialization, including unknown fields.

### 3.3 Property-based tests

Generate valid documents and assert:

1. A block either fits inside the page content box or is reported as a layout defect; nothing
   silently crosses a margin or is clipped.
2. Layout produces no overlapping rectangles after applying the minimum gap.
3. Widths are content-driven: they depend on the block's content and subtree, and the same document
   yields the same widths. No fixed pixel column per depth exists.
4. A child is either to the right of its parent, or below it with a slight indent when horizontal
   room is insufficient. There is no arbitrary placement.
5. Top-level blocks follow chapter order with no overlap.
6. An anchored callout is below its anchor within tolerance; if it reaches the page bottom, the
   branch continues on the next page with continuity markers and no text line, image, formula, table row, or code line is cut.
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
17. Normal blocks are atomic. A long block continues only at a safe internal boundary (paragraph,
    list item, blockquote paragraph, or between code lines), never through a text line, image,
    formula, table row, or code line, and the block exists once.
18. Pagination is idempotent and deterministic: the same layout and settings give the same breaks
    and page count.
19. Every block appears exactly once in reading order across the derived pages.
20. No page is empty unless the spec allows an explicitly blank page, and there is no empty trailing
    page.
21. A manual break hint, if honored, falls between blocks; an invalid hint resolves deterministically
    and never splits a block.
22. Reader view and page view derive identical page breaks from the same layout and settings.
23. Every top-level block belongs to exactly one chapter and is itself a content block; chapter
    order is deterministic and introduces no synthetic super-root or page container.
24. A block that is too wide, or too tall with no safe internal boundary, is reported as a layout
    defect; it is never clipped, auto-scaled, or cut through a line, and export is blocked until
    resolved.
25. Each chapter starts at the top of a new derived page, and top-level blocks stack in chapter
    order.
26. Page geometry uses A4 210 × 297 mm portrait or 297 × 210 mm landscape with the configured
    margins (20 mm default); orientation is document-wide and mixed orientation is absent in v1.
27. Freeze mode is read-only and freezes the layout/pagination snapshot; exiting offers incremental
    or full reflow, and full reflow on request or after the configured idle period converges to the
    same deterministic layout and pagination.
28. Every External Agent API mutation maps to shared commands; dry-run is non-mutating; apply is
    all-or-none and undoable as one entry.

Stability suite gates: adding one block keeps at least 95% of pre-existing blocks within 2 px in
continuous coordinates; deleting one moves survivors outside the affected parent subtree and
sibling group by no more than 1 px; unrelated chapters do not move. Page breaks may change.

Log the seed. Save any shrunk failure as a named regression fixture.

### 3.4 Integration tests

- **Storage:** temp directory, atomic save, simulated crash, backup rotation, missing asset.
- **Editor:** transaction mapping of anchor marks, paragraph split and merge, paste, IME.
- **Layout:** real measurement in the renderer (jsdom cannot measure text); compare geometry and
  widths; assert no overlap and that every block is inside the page content box in page view.
- **Pagination:** chapter boundaries start new pages; breaks fall between blocks; automatic and
  manual markers; ghost-parent and continuation labels at both ends; a block too wide, or too tall
  with no safe boundary, becomes a reported defect; manual hints are best-effort and report when
  ignored; pagination waits for fonts and image dimensions.
- **Long blocks:** continuation only at paragraph or list-item boundaries; no line, image, or code
  line is cut; the block exists once.
- **Freeze mode:** read-only freeze, freeze badge, exit to incremental or full reflow, selection/page
  preserved, and full reflow converging to the same deterministic layout and pagination.
- **External API:** token auth and scopes, dry-run, apply/undo, audit, stale proposal, concurrent
  writers, file locking, atomic failure, and malicious-content isolation.
- **Reader/page parity:** the two views derive the same layout and break positions; switching
  preserves reading position and selection.
- **Undo:** coalescing rules and save boundaries.
- **Outline/reader/page view:** shared IDs, shared order, collapse and navigation synchronization.

### 3.5 End-to-end tests

- Playwright or the shell equivalent, on the target macOS runner.
- Load fixtures through an app API, not through UI setup, to keep tests fast and stable.
- Cover: create, edit, branch, anchor, save/reload, collapse, page navigation, reader/page switch,
  page-break marker actions, pagination, continuation markers, long-block continuation, freeze and
  reflow, dark/light switch, External API dry-run/apply/undo with scopes, export preflight, export
  PDF, keyboard-only path.
- No arbitrary sleeps; wait for explicit app signals.
- One smoke path on every PR; full matrix nightly.
- Test the packaged app on Electron. Do not assume a browser-only path is enough; verify the
  Electron renderer and the PDF export from the packaged build.

**M2 suite split and run policy.** The critical suite is `tests/e2e/`; it covers lifecycle,
tabs/desync parity, arrows/collapse/trunk, keyboard/heading/chapter, and undo/save/quit recovery.
Session-restore evidence, the command palette/tree/dialog axe pass,
parent-relative layout/scroll, and zoom/fit/focus-rich view flows live in `tests/ui/` and are part
of `verify`, but not `verify:fast`, so the critical suite stays under its budget. Damaged/missing/
newer package recovery lives in `tests/recovery/` and is part of `verify`, but not `verify:fast`.
Performance (`tests/perf/`) and screenshot evidence (`tests/visual/`) are separate on-demand suites
and are not part of the critical gate. Artifact roots honour `NOTEFOREST_ARTIFACTS` (default
`artifacts/`).

E2E windows run **hidden** by default (`NOTEFOREST_E2E_HIDDEN=1`): no visible window, no
`bringToFront`, no dock icon, so a test run never steals keyboard focus or interferes with the
machine. The visual screenshot suite opts into a visible window (`NOTEFOREST_E2E_HIDDEN=0`);
Playwright still drives hidden windows through CDP, and `backgroundThrottling` stays disabled.

- `npm run e2e` builds and runs the critical suite. Budget: **critical-suite `node --test` time
  < 60 s, excluding the build**. Measured on 5 November 2026: 20 tests, 52.3 s suite time
  standalone and 53.8 s in `verify`; `npm run e2e` wall time is ~61 s including the build. The
  budget is suite time, not command wall time.
- `npm test` is the unit suite; target **< 3 s**.
- `npm run test:recovery` builds and runs the corrupt/missing/newer recovery suite.
- `npm run test:ui` builds and runs the view suite plus the shell/session/a11y/layout suite.
- `npm run verify:fast` = typecheck + unit + critical e2e.
- `npm run verify` = `verify:fast` + recovery integration + view-ui suite; run once on integration.
- `npm run test:perf` and `npm run test:visual` run on demand or nightly.
- Builder: targeted tests while fixing, then `verify:fast` once at handoff. Orchestrator: `verify`
  once on integration. Do not re-run the full suite after every small fix.

### 3.6 Visual regression

- Fixed runner, pinned fonts, same OS and browser engine as the target.
- Manual visual checks run in the T3 Code internal browser; Playwright owns the automated baselines.
- Disable animations, hide the caret, move the mouse away, mask timestamps.
- Prefer geometry snapshots (node positions, edge paths) for layout; pixels only for style.
- Use element screenshots of page-view regions and reader-view page-break markers, not the whole
  window, with `maxDiffPixelRatio` for anti-aliasing.
- Baselines are reviewed like code; intentional updates go in a dedicated commit.
- Dark mode is the default baseline; light mode baselines are included; PDF output stays light.
- Check A4 portrait and landscape in reader and page views at fit-page, 100%, and 150%.

### 3.7 PDF tests

- Generate fixture PDFs and assert every block's sentinel text with `pdftotext`, page by page.
- Use `pdfinfo` for page count, page size, and orientation; `pdffonts` for embedded fonts.
- Assert the PDF page count and page breaks equal the page view and the shared paginator.
- Assert no text line, image, formula, table row, or code line is cut across PDF pages; long blocks continue only at safe
  internal boundaries; tables break only between rows; ghost-parent and continuation markers match the page view.
- Assert the PDF is light in both app themes.
- Assert A4 portrait and landscape pages are exactly 210 × 297 mm or 297 × 210 mm with the
  configured margins.
- Assert export is blocked when a block is too wide or unbreakably too tall and the affected block is
  named.
- Assert unhonored manual break hints are reported and the PDF uses the paginator's actual breaks.
- Detect `�`, blank pages, and text rendered as images.
- Visually check formulas, code, arrow vector quality, and that content stays inside the margins.
- Page count, page breaks, size, orientation, and margins must be deterministic across repeated
  exports.
- Human check (product owner, optional): visual review of the PDF on the Mac. No Notability import or
  screen recording is required; a correct standard PDF is the acceptance. The Builder supplies the
  PDF and screenshots; it does not open, automate, or record another app.

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
- Coverage is not a target. Anchors, layout, pagination, persistence, migration, and External API
  commands must cover failure paths; uncovered critical lines are justified in review.

### 3.11 External Agent API tests

- Command/schema unit tests: valid arguments, unknown fields, missing fields, oversized payloads.
- Auth tests: missing, invalid, and revoked tokens; constant-time comparison; token rotation. Expiry
  tests are added only if token expiry is implemented (not in v1).
- Scope tests: read-only token cannot write; document/folder scope cannot reach another file; scope
  is checked per command.
- Dry-run tests: structured diff, no mutation, no audit write beyond the read/dry-run event.
- Apply/undo tests: atomic apply, one-entry undo, stale document version returns a conflict, retry
  with the same idempotency key does not duplicate.
- MCP adapter tests: every MCP tool maps to the same command catalog and validates scopes/revisions.
- Audit tests: every request including read, dry-run, export, and failure gets an entry with
  token/client, command, base revision, result, and duration; no secrets or note body by default;
  append-only and survives restart.
- Concurrency tests: two writers, one lock, second gets a conflict; stale lock TTL recovers; no
  interleaved or corrupt save.
- Malicious-content fixtures: instructions in note text, fake command JSON, hidden text, malicious
  links, huge content; none triggers a command without an explicit call.
- No-network default test; token never logged; rate limits and timeouts bounded.

---

## 4. Required fixtures

The location follows the repo ADR; the names below are canonical. Each fixture has a README with
purpose, expected invariants, and owning tests.

| Name | Contents | Must demonstrate |
|---|---|---|
| **formula-two-anchors** | A math block with two anchored terms, each with one branch | Distinct anchors; editing one does not move the other; both paginate correctly if the page ends; both survive reload |
| **shared-child** | A primary→C and B reference→C, plus a normal child; C near a page break | C rendered once from A; outline shows it once with a reference indicator; the reference does not move C or change page breaks; removing it changes nothing |
| **collapsed-subtree** | Three-level branch, middle node collapsed | Space reclaimed; hidden-count badge; expand restores; outline sync; save/reload preserves; page count repaginates deterministically |
| **broken-anchor** | A branch whose anchor text was deleted | Branch kept and falls back to the whole block; repair dialog offers relink/attach/delete; quote shown; save/reload preserves the state; export warns |
| **long-block-continuation** | A text/list block longer than one page with safe internal break points, plus a single unbreakable code line/image taller than a page | Break only at a paragraph, list-item, blockquote-paragraph, or between-code-lines boundary; no text line/image/formula/table row/code line cut; ghost parent and both continuation labels; the unbreakable case is a reported defect with export blocked |
| **pagination-break** | A continuous document longer than one A4 page, with a lower-level branch continuing at a break; portrait and landscape variants | Normal blocks are atomic; long-block continuation uses safe boundaries; ghost parent and both labels; the block exists once; page count equals the paginator |
| **layout-defects** | A block wider than the page (long code/table/image), an unbreakable tall image/code line, and an impossible manual break | Each is a reported layout defect with a warning and resolution actions; export is blocked; nothing is clipped, auto-scaled, or cut |
| **large-document** | 300 and 1,000 blocks across multiple derived pages, mixed text, math, code, and images | 300 guaranteed; 1,000 usable with virtualization/collapse/focus; page navigation; reader/page parity; PDF; app stays responsive |
| **external-agent-malicious-content** | Notes containing prompt injection, fake command JSON, hidden instructions, malicious links, and very large text | No command is triggered without an explicit API call; content is treated as data; no token or note content leaks |
| **external-agent-conflict** | A dry-run built against a document that then changes; a destructive command; a read-only token; a second writer | Stale `baseRevision` returns a conflict; destructive action requires confirmation; scope denial changes nothing; the second writer gets a lock conflict |
| **malformed-file** | Invalid JSON, invalid schema, newer version, duplicate IDs, primary cycle, two primary parents, missing asset, invalid page settings, invalid manual break hint | Each fails gracefully with a specific error; no overwrite; backup offered |

Recommended additional fixtures:

- **anchor-stress:** repeated edits before, inside, and after an anchor; paragraph split, merge, undo.
- **unicode-ime:** CJK, emoji, combining marks, RTL, IME composition.
- **long-code:** a 2,000-line code block, horizontal scroll, token anchor.
- **image-anchor:** region anchor, crop, replace, missing asset.
- **multi-top-level-pages:** multiple top-level blocks across several pages, deep and wide trees.
- **chapter-boundaries:** three chapters with several top-level blocks; each chapter starts a new
  page; chapter reorder/delete changes page numbers but not internal chapter layout.
- **landscape:** landscape-only document with the same content as the portrait fixture; page count
  may differ deterministically.
- **manual-break-hints:** a hint between blocks, a hint inside a block (invalid), a hint at a
  collapsed boundary, and undo/redo.
- **freeze-mode:** read-only freeze, blocked edit attempt, exit to incremental and full reflow,
  selection/page preserved.
- **dark-light:** the same document in dark (default) and light, including code, math, images, and a
  light PDF.
- **pagination-boundaries:** a block at the start and end of a page, a long block at a safe boundary,
  and a nested branch crossing a break.

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

Proposed numbers; ratify them in the pagination/performance ADR. Target machine: base Apple silicon
Mac (M1, 16 GB), release build, fit-page and 100% zoom, dark theme (default), no DevTools, cold
cache for open.

| Metric | 300 blocks | 1,000 blocks | Method |
|---|---|---|---|
| App cold start to usable window | < 3 s | < 3 s | Trace, five runs |
| Open to interactive | < 2 s | < 5 s | Open mark to first accepted input |
| First content paint | < 1 s | < 2 s | Trace |
| Full layout | < 50 ms p95 | < 250 ms p95 | Instrumented layout call |
| Pagination (layout to breaks) | < 30 ms p95 | < 150 ms p95 | Instrumented paginator |
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

- PDF page count and page breaks equal the page view and the shared paginator exactly.
- Every PDF page is A4 with the correct orientation and margins; no scaling drift.
- No text line, image, formula, table row, or code line is cut across pages; long-block continuation uses safe boundaries;
  ghost-parent and continuation markers match the page view.
- Every block either fits inside the page content box in page view or is reported as a layout defect;
  it is never silently clipped or auto-scaled.

Notes:

- **300 blocks is the guaranteed target.** 1,000 blocks across derived pages must stay usable with
  virtualization, collapse, and focus; only the visible pages are rendered, and pagination is
  cached. Do not claim 60 fps with every page visible.
- Do not promise 5,000+ blocks. If the product needs it, that is a new ADR with virtualization.
- Budgets are release gates. PRs gate on a regression over 20% for stable metrics.
- If a budget is missed: optimize, reduce scope, or write an ADR with a user-visible mitigation.
  Never silently raise the number.
- Re-baseline after the pagination spec and ADR are approved; record the machine and date.

---

## 6. Release checklist (later)

### Scope and quality

- [ ] Stack and PDF pipeline ADRs approved (ADR-0001, ADR-0002); no placeholder engine remains.
- [ ] External Agent API ADR approved (ADR-0003); tokens are document-scoped, shown once, hashed,
      revocable; single-writer lock and audit are in place.
- [ ] Milestone tasks are approved; no S1 or S2 is open.
- [ ] Known limitations are documented.
- [ ] No half-built feature is visible: annotation layer, collaboration, iPad, in-app chat/agent
      panel, separate reader PDF, freeform canvas, pins, fixed columns, stored page containers.
- [ ] NoteForest name/trademark clearance completed or a rename decided before packaging
      (public-release blocker; an existing NoteForest study app is known).

### Verification

- [ ] Full suite green on clean CI and the target macOS runner.
- [ ] Visual baselines regenerated intentionally and reviewed.
- [ ] Migration matrix covers every shipped schema version; downgrade is blocked.
- [ ] Crash recovery: kill mid-save, reopen, restore from backup.
- [ ] Fresh install, upgrade, uninstall/reinstall; the document package opens in Finder.
- [ ] File association, recent documents, and permissions work.
- [ ] PDF: three representative documents exported by the Builder and visually checked on the Mac by
      the reviewer; Notability or other annotation-app import is not a gate. One document-wide
      A4 orientation (portrait or landscape); page count and breaks match the page view; no line,
      image, or code line cut; long-block safe continuation; ghost-parent and continuation markers;
      text searchable and highlightable; fonts embedded; PDF light.
- [ ] Page navigation, reader/page parity, pagination, and manual break hints verified on a
      multi-page document.
- [ ] Page-break marker actions (remove manual break, keep this break, explain) work in outline and
      reader; markers are skipped by arrow navigation.
- [ ] Export preflight blocks a block that is too wide or unbreakably too tall, and reports unhonored
      manual hints, lost anchors, missing assets, and formula errors.
- [ ] Freeze mode verified as read-only; exit to incremental/full reflow preserves selection and
      page and is deterministic.
- [ ] Dark mode (default) and light mode verified across reader, page, code, math, and images.
- [ ] Broken anchors show the whole-block fallback and repair dialog; no branch is silently lost.
- [ ] External Agent API: off by default, loopback-only, token shown once with read/write/export/
      destructive/audit scopes, dry-run and baseRevision, atomic apply/undo, audit of every request,
      lock/concurrency, MCP mapping, and no outbound network.
- [ ] T3 Code internal browser manual checks completed; Playwright e2e, visual, and PDF text
      extraction green.
- [ ] Large document with 1,000 blocks across derived pages: usable with virtualization, collapse,
      and focus; open, navigate, edit, export, memory.
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
- Waivers never apply to data loss, security, a missing PDF text layer, a wrong PDF page count, page
  size or orientation, or a line/image/code line cut across pages.
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
- layout defects are clipped, auto-scaled, or cut through a line instead of blocked;
- pagination cuts a text line, image, formula, table row, or code line, uses an unsafe boundary, or
  omits ghost/continuation markers;
- PDF page count or page breaks differ from the page view, or content is cut across PDF pages;
- pages are stored as containers or fixed columns are reintroduced without an ADR;
- an External Agent API write bypasses auth/scope/audit, applies without confirmation, or exposes
  the token;
- the reviewer has not approved;
- a normal action can lose data.
