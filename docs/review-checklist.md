# Review checklist

**Status:** v10 — M3h re-review (accept with minor); spec v0.4.5.
**Owner:** Reviewer / Sentinel.
**Language:** English.
**Companion:** `docs/definition-of-done.md` (budgets, fixtures, test strategy).

**Current gate:** M2f is accepted; the M3 Sentinel re-review is **accept with minor**
(`docs/reviews/m3h-review.md`). All four M3 request-changes S2 findings are closed for their
specified paths; S3-8 leaf-delete disclosure and S3-3 token single-source are closed by M3h4/M3h5.
AC-21/image AC-57 are deferred to M3c3b; S3-5/S3-6/S3-7 are tracked follow-ups. The product-owner
VoiceOver/visual gate remains. M4/PDF remain blocked until M3 is accepted. Spec
v0.4.5 is the source of truth.

---

## Why this exists

NoteForest (working title) has four unusually coupled risks: anchored branches, a primary-tree plus
reference-edge DAG, an adaptive tree layout whose pages are derived by a paginator, and a PDF that
must reproduce those pages with real text. A change that looks local can silently break one of
them. This checklist makes the review repeatable and evidence-based, so approval means
"I reproduced the claim", not "the summary sounded confident".

## 0. Reviewer stance

- **Independent and fresh.** The reviewer never reviews their own work and does not inherit the
  implementer's assumptions. Read the brief and the diff, not the commit message alone.
- **Skeptical, not hostile.** Assume the change is wrong until the evidence shows it is right.
  Ask what would falsify each claim.
- **Evidence over assertion.** A green test, a screenshot, or a benchmark is evidence only if it
  would change when the behavior changes. Verify the artifact, not the description of it.
- **Does not rewrite code.** The reviewer writes findings; the implementer fixes them. A reviewer
  may demonstrate a reproduction, never push a "small fix" that bypasses review.
- **One task at a time.** A diff that spans unrelated work is sent back to be split.
- **Ambiguity is a finding.** If the brief or spec does not define expected behavior, stop and
  escalate; do not invent requirements to keep the review moving.
- **Never a rubber stamp.** "Approved" is a claim of verification and is recorded as such.

---

## 1. How to review

### 1.1 Preconditions (definition of ready)

A task is reviewable only when it has:

- a task brief with numbered acceptance criteria, scope, and non-goals;
- links to the relevant `docs/spec.md`, `docs/ux.md`, and ADR sections;
- a fixture or a reproducible starting state;
- page size, orientation, margins, pagination rule, and expected page count;
- approved dependencies (if any);
- for UI work, the expected states and the keyboard path.

If any of these is missing, the verdict is **Blocked**, not "approved with caveats". Return it
to the orchestrator.

### 1.2 Read the contract

1. Read `AGENTS.md`, the task brief, and the linked spec/UX/ADR sections.
2. Write down the three to seven claims the task must prove.
3. For each claim, write what would falsify it.
4. Check that every acceptance criterion is testable. "Works well" is not testable; "adding a
   reference edge does not move any node" is.

### 1.3 Read the diff

- Read the full diff, not the summary. List the files and classify them: model, layout, UI,
  storage, tests, docs, config.
- Check scope first: unrelated refactors, schema edits, new dependencies, generated files, large
  binaries.
- Read the risky parts first: ID generation, anchor mapping, layout mutation, save path,
  migration, undo registration.
- Ask what the change **should** have touched and did not: migration, export, undo, fixture,
  error state, accessibility label.

### 1.4 Run it

- Use a clean checkout or worktree; install from the lockfile.
- Build in production/release mode; run typecheck, lint, and the full test suite.
- Launch the packaged or production-mode app, not only the dev server.
- Reproduce every acceptance criterion from a cold start using the named fixture.
- Save, quit, reopen. Persistence is part of "works".
- For UI work, capture an app screenshot at the claimed state; include fit-page,
  100%, and 150% zoom when layout is involved.
- For page work, check both A4 orientations, the reader and page views, and record the page count.
- For visual and PDF work, run the manual check in the T3 Code internal browser and capture the
  result; Playwright covers the repeatable e2e, visual-regression, and PDF text-extraction subset.
- For External Agent API work, use a local token with read and write scopes, exercise dry-run →
  apply → undo, and check the audit entry and lock behavior.

### 1.5 Probe beyond the happy path

Always try:

- undo/redo after every mutation the task introduces;
- delete the block, branch, anchor, or page that was just created;
- reload the document and reopen the app;
- resize the window, zoom in and out, pan away and back (navigation only);
- move between pages, change orientation, and force pagination across a page boundary;
- the keyboard-only path;
- the malformed or missing input that the task did not mention;
- the largest fixture the task claims to support.

Reviewer's standing goal: **try to lose data**. If a normal action loses a block, a branch, an
anchor, or content at a page break, it is S1 regardless of how rare it looks.

### 1.6 Judge the evidence

- **Tests:** a test is evidence only if it fails when the behavior is removed. Inspect the
  assertion, or ask for a red-green demonstration. Snapshot tests updated in the same commit as
  the code are not evidence until the diff is read.
- **Screenshots:** must show the actual acceptance state, produced by the build under review.
  Mocks, storybook-only states, and cropped views that hide the failure are not evidence.
- **Performance:** needs machine, build type, fixture, method, and p95—not a single warm number.
- **Coverage:** a percentage is not evidence of correctness.
- **Summaries:** verify the file, not the sentence. A confident summary is a lead, not a proof.
- **Absence of errors:** no console error does not prove the positive state; check the output.
- **External API evidence:** require the token scope, structured dry-run diff, audit entry, command
  ID, and post-apply undo state; a transcript is not evidence.

### 1.7 Verdict and report

- Use the verdicts and severities in §9.
- Every finding gets: severity, location, reproduction, expected vs actual, and a direction
  (not a patch).
- Record what you could not verify. An honest gap is better than a false approval.
- Do not approve with open S1 or S2 findings.

### 1.8 Re-reviews

- Re-run the failing check, plus the full suite if the change touches model, layout, persistence,
  or migrations.
- Review the diff since the last review, not the whole task from scratch.
- A rebase that touches risky files invalidates prior approval for those files.

### 1.9 Reviewing docs and specs

Spec v0.4.5 is approved; this section applies to doc changes during M2f and later. The stack and PDF
pipeline are decided (ADR-0001, ADR-0002), as are the External Agent API defaults (ADR-0003). A doc
review checks that the document matches the ADRs, that deviations are explicit, and that the chosen
stack is not silently re-opened. A doc review checks:

- every MUST is testable and every acceptance criterion has a pass/fail condition;
- states are covered: empty, loading, error, partial, large, offline;
- data invariants are stated, not implied;
- decisions name alternatives and consequences (ADR), not just the chosen option;
- no freeform-canvas, pin, fixed-depth-column, page-as-container, or separate-reader-export
  assumption has crept back in;
- no unresolved TBD inside must-have scope;
- terminology matches `AGENTS.md`: block, branch, anchor, outline, chapter, level, reader view,
  page view, paginator, page break, continuation marker, primary/reference edge;
- page size, orientation, and margins are document settings; pages are derived by the paginator,
  not stored;
- pagination rules are defined: normal blocks atomic, long blocks only at safe internal boundaries,
  continuation markers, optional manual break hints, tables break only between rows;
- the in-app agent panel/chat is a non-goal; external agent access is an API with local binding,
  token scopes, audit, and explicit confirmation;
- adaptive geometry is stated: content-driven widths, wrap below the parent with a slight indent,
  sibling-only reordering;
- anchored branch placement below the anchor and how it paginates are defined;
- factual claims are sourced or explicitly labelled opinion;
- file-format changes address migration and back-compatibility;
- keyboard flows, accessibility, and scope boundaries are present (annotations, collaboration, iPad
  are out of v1);
- there is no contradiction with an existing ADR or spec section.

A well-written document with untestable acceptance criteria is not done.

### 1.10 Timebox and escalation

- First pass within one working session.
- Diff larger than roughly 600 changed lines or touching more than three subsystems: ask to split.
- Product-behavior disagreement: orchestrator decides. Architecture disagreement: ADR.
- A reviewer who cannot run the app or the tests marks the review **Blocked** and says why.

---

## 2. Code review checklist

### 2.1 Correctness

- [ ] Logic matches the spec, including ordering, defaults, and edge direction.
- [ ] Boundary cases handled: empty document, one block, one top-level block, deep nesting, many
      top-level blocks, zero edges, 1,000 blocks.
- [ ] IDs generated once and stable; never derived from content, array index, or a colliding
      timestamp.
- [ ] No array index used as identity or persisted as a reference.
- [ ] No raw character offset as the only anchor identity.
- [ ] Time and randomness injectable; production behavior still correct.
- [ ] Layout math produces no `NaN`, `Infinity`, negative sizes, or inconsistent rounding.
- [ ] Unicode handled: CJK, emoji, combining marks, RTL; no offset corruption.
- [ ] `null`/`undefined` handled at boundaries; no non-null assertion hiding a real case.
- [ ] Numeric tolerances are explicit, not "close enough" comparisons in production code.

### 2.2 Architecture and boundaries

- [ ] Core model is pure and UI-free; layout is pure and deterministic; storage is separate.
- [ ] One source of truth; derived state is computed, not stored twice.
- [ ] Commands are the only mutation path; the UI does not mutate the model directly.
- [ ] Editor, model, layout, and storage communicate through explicit interfaces.
- [ ] No circular dependency or god module; feature code is not prematurely promoted to shared
      utilities.
- [ ] New abstraction is justified by at least two uses or a real boundary.
- [ ] Implementation matches the stack ADR; deviations are flagged, not hidden.

### 2.3 State and undo

- [ ] Selection, focus, zoom, current page, scroll, and hover are view state, not document state
      (unless the spec says otherwise).
- [ ] Undo/redo covers block edits, edge create/delete/reparent, anchor create/remove, sibling and
      top-level reorder, chapter operations, manual break hint insertion/removal, and page setup
      changes. Collapse, view switches, and navigation are not undoable.
- [ ] Undo restores selection and focus at the affected block; the typing-versus-command undo
      routing is tested at boundaries.
- [ ] Multi-step actions such as create anchored child are one undo entry, not several.
- [ ] Undo history is session-only in v1; reopening a document starts a fresh stack.
- [ ] Autosave does not clear undo or interrupt an in-flight edit.
- [ ] Async work (measurement, save, export) cannot interleave into a corrupt state; stale results
      are discarded.
- [ ] Outline, reader view, and page view share IDs and order; collapse and selection are not
      stored twice.

### 2.4 Data model and DAG invariants

Verify these at the command layer **and** on load (a hostile file must not hang the app):

- [ ] IDs are unique across blocks, edges, and anchors.
- [ ] At most one incoming primary edge per non-top-level block.
- [ ] The primary subgraph is acyclic; self-loops are rejected.
- [ ] Reference edges may form cycles; they are allowed.
- [ ] Reparenting a node under its own descendant is rejected atomically with a clear message.
- [ ] Every edge endpoint resolves; every anchor belongs to its declared block.
- [ ] Sibling order is unique per parent, sorts lexicographically, and supports insertion between
      neighbors; reordering updates one edge.
- [ ] Deleting a block or edge has defined semantics (reparent, promote to top level, or cascade),
      is undoable, and leaves no dangling reference.
- [ ] Sibling order is the only spatial degree of freedom; no arbitrary block position, nudge, or
      pin is persisted.
- [ ] Pages are derived by the paginator, not stored as containers; page size, orientation,
      margins, and optional manual break hints are document state.
- [ ] No synthetic super-root or page container is introduced in the model or serialized data.
- [ ] Chapter hierarchy is consistent: every top-level block belongs to exactly one chapter, and
      chapter order is defined.
- [ ] A top-level block is itself a content block, not a chapter-only placeholder; chapters group
      top-level blocks and add no layout node.
- [ ] Normal blocks are atomic. A long block may continue only at a safe internal boundary
      (paragraph, list item, blockquote paragraph, or between code lines), never through a text line,
      image, formula, table row, or code line; continuation is derived, marked on both sides, and
      never creates a second block.
- [ ] A block's horizontal position and width are content-driven and derived, not stored as fixed
      pixel columns.
- [ ] Pagination is deterministic and idempotent for the same document and page settings.
- [ ] Asset references resolve or are flagged; no absolute paths.
- [ ] Unknown-field policy is explicit: preserve or drop with a schema version change.
- [ ] Validation failures are specific (which ID, which edge) and do not partially mutate.

### 2.5 Error handling and failure modes

- [ ] No empty `catch`; errors carry context and produce actionable copy.
- [ ] Corrupt file, newer schema, missing asset, failed save, and failed export each have a defined
      state.
- [ ] A failed operation leaves the model unchanged or fully rolled back.
- [ ] Save failure is visible; the app never claims a save that did not happen.
- [ ] Editor render failures (KaTeX, image decode, code highlighter) degrade locally and do not
      crash the document.
- [ ] Logs do not contain note content by default.

### 2.6 Performance

- [ ] No O(n²) behavior in layout, pagination, anchor resolution, or edge routing at 1,000 blocks.
- [ ] Layout touches only the dirty subtree and the affected pagination; no full-document reflow per
      keystroke.
- [ ] No full document re-render on selection, hover, zoom, or page navigation.
- [ ] Page navigation does not relayout or repaginate the whole document; pagination is cached and
      invalidated only by dirty content.
- [ ] Measurement is cached and invalidated correctly on content, width, or font change.
- [ ] Numbers are measured against the DoD budgets, not estimated.
- [ ] Memory is bounded: caches capped, listeners removed, observers disconnected.

### 2.7 Security and privacy

- [ ] Markdown/HTML paste is sanitized: no script, iframe, or event handlers.
- [ ] Links open externally with confirmation; no arbitrary `file://` navigation.
- [ ] LaTeX is limited to KaTeX-safe commands; no `javascript:` links.
- [ ] Images are validated; SVG is treated as untrusted or rasterized.
- [ ] File access is confined to the document folder; asset paths cannot traverse.
- [ ] For Electron, the renderer runs with least privilege; context isolation
      is on and Node integration is off, with privileged work behind a narrow preload API.
- [ ] CSP where applicable; no remote code; no remote fonts by default.
- [ ] No telemetry, analytics, or background network calls; no secrets in the repo or logs.
- [ ] PDF export fetches no remote resources and executes no script.

### 2.8 Dependencies

- [ ] Addition is approved in the brief or ADR, with purpose and alternative stated.
- [ ] License is permissive (MIT, ISC, Apache-2.0, BSD); copyleft needs explicit approval.
- [ ] Maintained: recent release, responsive issues, no deprecation notice (dagre is the cautionary
      example).
- [ ] Size and transitive weight are acceptable; no duplicate functionality.
- [ ] Native modules: packaging and notarization implications checked.
- [ ] Lockfile committed; versions locked; no surprising postinstall.
- [ ] Removed dependencies are cleaned up.

### 2.9 Tests

- [ ] New behavior has tests at the lowest useful layer.
- [ ] Every bug fix has a regression test that fails before the fix.
- [ ] Tests assert behavior, not private implementation details.
- [ ] Failure paths are tested, not only the happy path.
- [ ] Deterministic: no sleeps, network, real clock, randomness, or order dependence.
- [ ] Fixtures are named and reused; no giant inline JSON.
- [ ] No test-only branches in production code.
- [ ] Spot-check that the test fails for the right reason when the feature is disabled.
- [ ] Snapshot diffs are reviewable and not blindly accepted.
- [ ] Visual and PDF tests run on the fixed target environment, not a developer machine.

### 2.10 Docs and diff hygiene

- [ ] Spec, UX, or ADR updated when behavior or a decision changed; no doc drift.
- [ ] Commands and public interfaces documented where a future agent will look.
- [ ] Comments explain why, not what; no commented-out code.
- [ ] No debug logs, TODOs without an issue, dead code, or stray files.
- [ ] No unrelated formatting or refactor noise.
- [ ] No secrets, large binaries, or generated artifacts committed without approval.
- [ ] Commit messages state the change and the task ID.

---

## 3. UI/UX review

Run with a fresh profile and a named fixture; record the session.

### 3.1 Reader and page view interaction

- [ ] Pan works with trackpad, space+drag, and middle-drag where supported; it is navigation only,
      with no drift and a consistent cursor.
- [ ] Zoom works with pinch, Cmd+scroll, buttons, fit-page, and actual size; limits are enforced;
      zoom is anchored at the pointer.
- [ ] The page view does not jump after zoom, pan, page switch, or reload.
- [ ] Page view navigation works: next/previous page, page indicator or picker, and go-to-page;
      reader view scrolls continuously and shows page-break markers. The current page survives
      reload.
- [ ] Reader view and page view can be switched; both show the same content and page breaks, and the
      switch preserves reading position and selection.
- [ ] Editing works in the primary authoring view defined by the UX spec; the other view reflects
      the edit and pagination without a manual refresh.
- [ ] Page settings (A4 size, document-wide orientation, margins) update both views; portrait and
      landscape render without clipping; mixed orientation is absent in v1.
- [ ] There is no drag-to-position. Dragging a block is disabled, or reorders siblings only if the
      UX spec says so; the affordance makes the difference clear.
- [ ] Creating and deleting a branch works with pointer and keyboard; the target is highlighted;
      Esc cancels.
- [ ] Marquee selection, Shift/Cmd add/remove, select-all, and clear work within a view.
- [ ] Toolbar and context-menu actions match the selection; disabled states explain why.
- [ ] Double-click or Enter opens the editor in the right place; Esc returns to the active view.
- [ ] Panning does not select text; dragging does not start an edit.
- [ ] Page margins and page-break markers are visible in the reader view; no content is clipped at a
      page boundary.
- [ ] Page-break markers are not blocks, are skipped by arrow navigation, and expose the marker menu
      (remove manual break, keep this break, explain).

### 3.2 Keyboard, focus, selection

- [ ] Every reader/page-view action has a keyboard path or a documented exception.
- [ ] Focus ring is visible on blocks, ports, anchors, page controls, and toolbar; focus is not lost
      after an action.
- [ ] Tab order follows visual order; no focus traps; Esc closes overlays.
- [ ] Shortcuts do not fire while typing in text, code, or math; Cmd+Z scope is unambiguous.
- [ ] Single-key shortcuts do not conflict with typing or IME.
- [ ] Sibling reorder via keyboard works, is announced, and does not conflict with editor
      navigation.
- [ ] Page navigation via keyboard (PageUp/PageDown or the UX-defined keys) preserves focus context.
- [ ] Switching between reader and page view by keyboard preserves focus and reading position.
- [ ] Selection survives reflow, repagination, and view switches because it is stored by ID, not
      coordinates.
- [ ] Arrow-key navigation between blocks and in the outline matches the UX doc.
- [ ] Navigating to a hidden block (search, reference follow, reveal) expands the necessary ancestors
      and lands on its derived page without a document edit.
- [ ] Screen reader announces block role, selection, branch, anchor, page number, and page change;
      edges have text alternatives where feasible.

### 3.3 Layout stability and feedback

- [ ] Typing does not shift the block being edited or move the page viewport.
- [ ] Adding or removing a block moves only the affected branch; pagination after the edit may
      shift, but block order and content are preserved.
- [ ] Reordering siblings changes only that sibling set; unrelated branches keep their positions
      unless the page break shifts.
- [ ] Page breaks are visible and deterministic; content is never clipped at a page boundary.
- [ ] Manual break hint insertion/removal, if offered, is undoable and never splits a block.
- [ ] A lower-level branch that continues on the next page shows a ghost parent and continuation
      labels at both ends.
- [ ] An anchored branch may wrap or paginate; its blocks follow the normal atomic/long-block rule,
      no text line, image, formula, table row, or code line is cut, and it is never clipped or overlapped with the footer.
- [ ] Reader and page views agree on break positions after every edit.
- [ ] Hybrid reflow: incremental stable reflow during authoring, with a freeze control that enters a
      read-only study mode with layout and pagination frozen.
- [ ] Freeze state is visible; editing is disabled; exiting offers incremental reflow or a full
      reflow, and both are deterministic.
- [ ] Switching freeze on or off preserves selection, current page, and reading position.
- [ ] Full reflow runs on request or after the configured idle period; it preserves the logical tree
      and shows a notice when page breaks change.
- [ ] Collapse shows the hidden count; expand restores a predictable state.
- [ ] Collapse state is shared by outline, reader, and page views; collapse is view state, not an
      undoable document command.
- [ ] When content moves page breaks, page numbers update and a "Pages updated" status is shown.
- [ ] Animations are 120–200 ms, disabled for keyboard edits and reduced motion.
- [ ] No flicker on page switch, load, save, or theme change.

### 3.4 Anchors in the UI

- [ ] An anchored span has a visible, non-intrusive marker; hover reveals the branch or a preview.
- [ ] Clicking or keyboard-activating the marker focuses the target; back navigation works.
- [ ] The branch is placed below the anchor; if it reaches the page bottom it continues on the next
      page with a ghost parent and continuation labels. No content block in the branch is split
      through a text line, image, formula, table row, or code line.
- [ ] Reader and page views show the branch under the same anchor and with the same page breaks.
- [ ] A broken anchor is visibly distinct, falls back to the whole block, and opens a repair dialog;
      it is not merely missing.
- [ ] Reattach shows the stored quote and context and requires confirmation when ambiguous.
- [ ] Creating an anchor does not alter the text or the Markdown export unexpectedly.
- [ ] Deleting anchored text warns or preserves the branch; no silent cascade.

### 3.5 States and content

- [ ] First run defaults to dark mode; light mode is available; the choice persists.
- [ ] Empty document and empty page view give guidance; neither is a dead end.
- [ ] Loading shows progress; content arrival does not jump the layout.
- [ ] Errors are actionable: missing asset, corrupt file, export failure, save failure; no stack
      traces in the UI.
- [ ] Pagination limits, manual-break conflicts, and pagination failures have defined states.
- [ ] Page size, orientation, and margin changes have a clear state; no content is lost.
- [ ] Documents with many pages show page count and navigation and stay responsive.
- [ ] Reader/page view switch has a defined state and preserves position.
- [ ] Long words, URLs, and code lines wrap or scroll without breaking the page content box.
- [ ] Images have alt text, a broken-image placeholder, and the correct aspect ratio.
- [ ] Math errors render inline, not blank and not a crash.
- [ ] Copy is English and consistent; no placeholder text; terminology matches the spec.

### 3.6 Accessibility and visual quality

- [ ] Contrast meets WCAG AA for text and meaningful graphics in dark mode (default) and light mode.
- [ ] Dark mode keeps images, math, and code readable without inversion artifacts; PDF output stays
      light.
- [ ] Information is not conveyed by color alone (edge role, selection, error).
- [ ] Ports and anchor markers have adequate hit targets independent of zoom.
- [ ] Reduced motion is respected.
- [ ] Works at fit-page, 100%, and 150% zoom, narrow window, and in dark (default) and light themes.
- [ ] Visual language is clean and minimal: restrained color, no decorative shadows or noise,
      consistent spacing and typography across views.
- [ ] Screenshots match the baseline; the diff is understood, not accepted.
- [ ] No clipped text, overlapping toolbars, or off-screen dialogs.

---

## 4. Layout-specific checks

Use a fixture with mixed blocks, anchored branches, a shared child, multiple top-level blocks,
content-driven widths, and enough content to paginate across at least three pages. Check A4 portrait
and landscape in reader and page views at fit-page and 150% zoom.

### 4.1 Adaptive geometry and pagination

- [ ] In page view, every block either fits inside the A4 content box (210 × 297 mm portrait,
      297 × 210 mm landscape, default 20 mm margins) or is a reported layout defect; nothing
      silently crosses a margin.
- [ ] Each chapter starts on a new derived page; top-level blocks stack vertically in chapter order.
- [ ] No node–node overlap when rectangles are inflated by the minimum clear gap (16 logical px at
      100%).
- [ ] No block–callout, callout–callout, or label–node overlap.
- [ ] An anchored callout starts below its anchor, aligns to the anchor's left within 2 px at 100%,
      and paginates by the normal rule if it reaches the page bottom. **Page mode A exception
      (R2j):** an anchored callout may sit in the parent card's right lane at the parent's top; its
      leader leaves the parent's right port, and the anchor mark identifies the branch. This is
      Page-only and Read/Edit/PDF must agree; Continuous keeps the below-anchor rule.
- [ ] A Page density preset changes only typography/spacing; it never changes callout topology
      (A/B2/stacked). A topology change is a separate product decision, labelled in Settings,
      never a silent preset side effect.
- [ ] Widths are content-driven and adaptive: a large subtree may take more horizontal space, a leaf
      sibling may be narrow, and there is no fixed pixel column per depth.
- [ ] Siblings stack vertically in branch order; sibling subtrees do not overlap.
- [ ] Siblings may have different widths and still share the available width without overlap.
- [ ] A child is placed to the right of its parent when there is room; otherwise it is placed below
      the parent with a slight indent. The choice is deterministic, never an arbitrary x/y.
- [ ] Only sibling order, top-level order, and chapter order change the layout; there is no nudge,
      pin, or free drag.
- [ ] Page breaks fall between blocks; a long block may continue only at a safe internal boundary
      (paragraph, list item, blockquote paragraph, or between code lines), never through a text line,
      image, formula, table row, or code line.
- [ ] A page never overflows: the paginator adds pages instead of clipping.
- [ ] A block that is too wide, or too tall with no safe internal boundary, is a layout defect: it
      gets a warning, export is blocked, and the UI offers shorten/split or page-setup actions. It is
      never clipped, auto-scaled, or cut through a text line, image, formula, table row, or code line.
- [ ] A lower-level branch that continues on the next page shows a ghost parent and "continued from
      page M" at the top of the next page, and "continues on page N" at the bottom of the previous
      page; the block exists once.
- [ ] The continuation label names the nearest top-level block or chapter and matches the UX copy.
- [ ] Automatic page-break markers are dashed and manual markers are solid and labeled; the marker
      menu offers the UX-defined actions (remove manual break, keep this break, explain).
- [ ] Page count is derived, with no empty trailing page.
- [ ] Changing page size, document-wide orientation, or margins re-paginates without clipping; the
      page count may change and the logical tree does not.
- [ ] Reader and page views produce identical break positions for the same document and settings.

### 4.2 Edges and ports

- [ ] A primary edge starts at the block's out-port or at the anchor rectangle, never accidentally
      at the block center.
- [ ] The edge ends at the target's in-port; the arrowhead points at the target, not empty space.
- [ ] No edge passes through a node; if it must, it is routed around.
- [ ] Reference edges are visually distinct and do not change any position or page break.
- [ ] A reference to a block on another page ends at a page-edge indicator with the target page
      number; no line runs off the page.
- [ ] An edge that crosses a page break uses the continuation marker, not a line drawn across the
      page boundary.
- [ ] Labels are readable, unclipped, and attached to the correct edge.
- [ ] Primary self-loops are impossible; a reference self-loop is handled if allowed.
- [ ] Arrowheads and labels do not cross the margin or overlap a page number, if shown.
- [ ] Edges do not occlude the anchor marker or the editor caret.

### 4.3 Anchored branches

- [ ] The branch begins at the anchor, not at the block edge. Page mode A is the exception: the
      primary group leader leaves the parent's right port and the anchor mark identifies the anchor.
- [ ] The callout is placed below the anchor; it may wrap or paginate like any other branch. Page
      mode A is the exception defined in §4.1: the callout sits in the parent's right lane at the
      parent's top and the anchor mark identifies the branch.
- [ ] Multiple callouts from one anchor stack in branch order; callouts from different anchors follow
      anchor order and do not overlap.
- [ ] A callout that cannot fit the page width after wrapping is reported as a layout defect, not
      clipped or auto-scaled.
- [ ] When the anchor is near the bottom of the page, the branch continues on the next page with a
      continuation marker; there is no unsafe block split, overlap, or clipping.
- [ ] Page zoom and pan keep the edge attached to the live anchor rectangle.
- [ ] Editing text above the anchor moves the edge, not the callout content.
- [ ] When pagination moves part of the branch, ghost parent and continuation markers are shown; no
      text line, image, formula, table row, or code line is cut.
- [ ] Reader and page views show the branch under the same anchor and with the same page breaks.
- [ ] Deleting the anchor does not leave an edge pointing at a stale rectangle.

### 4.4 Shared children and DAG behavior

- [ ] A shared block is rendered exactly once: one layout node, one DOM node, across all pages.
- [ ] Its position and page breaks are determined only by the primary parent and the paginator;
      reference edges do not move it.
- [ ] The outline shows it once under the primary parent, with a visible "also referenced by"
      affordance.
- [ ] The outline, reader/page view, and PDF use the same reading order: anchored children first,
      then direct children, per the spec.
- [ ] Adding a second parent creates a reference edge, not a duplicate block.
- [ ] Changing the primary parent moves the block once, updates the outline and pagination, and
      re-routes reference edges.
- [ ] Deleting the primary parent triggers the defined policy (promote to top level, reparent, or
      cascade) with no orphan or duplicate.
- [ ] A reference cycle (A references B, B references A) renders without infinite traversal.
- [ ] Cross-page reference edges use the defined affordance; no line crosses a page boundary.

### 4.5 Collapse, pagination, and stability

- [ ] Collapse hides descendants, including anchored callouts, reclaims space, shows the hidden
      count, and keeps an edge stub.
- [ ] Expand restores positions if content and settings are unchanged; otherwise reflow is
      deterministic.
- [ ] A selection inside a collapsed subtree is cleared or preserved with a visible indication.
- [ ] Collapse state survives save/reload and matches the outline.
- [ ] A manual break hint, if offered, is honored only between blocks; inserting or removing it
      repaginates deterministically and is undoable.
- [ ] Adding a sibling changes that sibling set; later page breaks may shift, but block order and
      content are preserved.
- [ ] Deleting a block closes the gap; subsequent pages may repaginate; no block is lost or
      duplicated.
- [ ] Changing orientation or margins preserves reading order and loses no blocks; the page count
      changes deterministically.
- [ ] **Add stability:** across the stability fixture suite, at least 95% of pre-existing blocks keep
      continuous x and y within 2 px after adding one block; unrelated chapters do not move. Page
      breaks may change.
- [ ] **Delete stability:** outside the deleted block's former parent subtree and sibling group,
      every surviving block moves no more than 1 px; unrelated chapters do not move. Page breaks may
      change.
- [ ] **Chapter operations:** insert, delete, and reorder keep existing chapters' internal continuous
      layout; only chapter order and page numbers change.
- [ ] **Rename or longer content:** only the affected subtree reflows; downstream page breaks may
      shift; content is never clipped.
- [ ] **Undo:** restores the exact previous positions, page count, and manual break hints.
- [ ] Pagination is idempotent: paginating the same layout twice gives the same breaks and page
      count.
- [ ] Layout and pagination are deterministic for the same document, page settings, and viewport.
- [ ] The same document and settings give identical positions and breaks on two runs.
- [ ] Freeze mode is read-only: no edit, layout, or pagination change occurs while active; exiting
      offers incremental or full reflow, and the full reflow matches a deterministic layout.
- [ ] Pagination waits for fonts and image dimensions; late-loading assets do not silently change
      page breaks.
- [ ] Editing and then undoing returns to the previous page breaks without oscillation.

### 4.6 Layout performance

- [ ] Meets the DoD budgets: 300 blocks guaranteed; 1,000 usable with virtualization, collapse, and
      focus.
- [ ] An incremental edit does not trigger a full-document layout or full repagination; verify with
      instrumentation, not by watching the screen.
- [ ] No long task over 50 ms during pan, zoom, or page switch.
- [ ] Page switch renders only the target page and does not relayout or repaginate the whole
      document.
- [ ] Measuring 1,000 blocks does not block first interaction beyond the budget.

---

## 5. Anchor-specific checks

### 5.1 Text anchors

- [ ] Create an anchor on a word and on a phrase; reload; it still points at the same text.
- [ ] Edit before, inside, and at both boundaries of the anchor: it holds or becomes visibly
      orphaned; it never silently retargets.
- [ ] Split a paragraph, merge paragraphs, paste over, cut, and undo/redo.
- [ ] IME composition and dead keys do not break the anchor mark.
- [ ] With duplicate quote occurrences, the anchor stays on its occurrence.
- [ ] The anchor mark serializes to JSON; there is no DOM-only or zero-width-element trick.
- [ ] Save/load preserves it; Markdown export preserves it or explicitly warns about loss.
- [ ] Deleting the anchored text keeps the branch as an orphan with the stored quote.

### 5.2 Formula anchors

- [ ] Anchor a term in inline and in display math.
- [ ] Editing a different part of the formula leaves the anchor intact.
- [ ] Editing the anchored term orphans it or offers a confirmed reattach; never a silent switch to
      another term.
- [ ] A KaTeX render error does not break anchor resolution.
- [ ] Duplicating a formula does not make one anchor point at both copies.
- [ ] Display math resize/reflow keeps the anchor rectangle correct.

### 5.3 Code anchors

- [ ] Anchor a token and a range; edit before and after it; reindent; reformat; change language.
- [ ] Quote plus prefix/suffix re-anchors correctly; an ambiguous match requires confirmation.
- [ ] Tabs versus spaces, CRLF, long lines, and horizontal scroll are handled.
- [ ] Splitting or merging a code block, or switching language, does not lose the anchor.
- [ ] Copy/paste of code containing anchors does not duplicate anchor IDs.

### 5.4 Image anchors

- [ ] The region is normalized 0–1 and does not move when the window resizes or the page zooms.
- [ ] Cropping or replacing the image remaps by asset hash or orphans the anchor; no silent wrong
      region.
- [ ] A missing asset shows a placeholder and the anchor remains recoverable.
- [ ] Alt text and the region have an accessible description.
- [ ] Very small and very large images, and EXIF orientation, are handled.

### 5.5 Cross-cutting anchor rules

- [ ] Multi-block anchor selection is rejected with a clear message; no partial anchor is created.
- [ ] Deleting a block has defined anchor and edge semantics and is undoable.
- [ ] The orphan panel lists every broken anchor with quote, source block, and available actions.
- [ ] A broken anchor falls back to the whole block and opens a repair dialog (relink, attach to
      block, or delete) without losing the branch.
- [ ] Orphan state persists across save/reload; export warns about it.
- [ ] No action silently deletes a branch or an anchor; destructive actions confirm or are
      undoable.
- [ ] Anchor creation and removal are in the undo history.
- [ ] An anchored branch is placed below its anchor and paginates like any other branch; long-block
      continuation uses safe boundaries and never cuts a text line, image, formula, table row, or code line.
- [ ] Manual break hints, page settings, and pagination have defined semantics for anchors and
      branches; no branch is silently lost.
- [ ] Markdown and PDF export represent anchored branches without claiming false fidelity.

---

## 6. PDF-specific checks

### 6.1 Text layer

- [ ] `pdftotext` or PDFKit extracts every block's text; use a unique sentinel phrase per block.
- [ ] Extracted text order matches page order and on-page reading order, allowing line-break
      normalization; page order matches the outline per the spec.
- [ ] No `�`, no missing glyphs, no text rendered only as outlines or images.
- [ ] Math text is present or the formula is visually correct; no clipped exponents or fractions.
- [ ] Code keeps monospace and indentation; no ligature corruption.
- [ ] Search a phrase in a PDF viewer; the product owner reviews the PDF visually on the Mac. No app-specific import is required.

### 6.2 Page fidelity

- [ ] The PDF is produced by the same paginator as the page view; the page count matches exactly.
- [ ] There is no separate reader PDF export in v1. Reader view is an editor view; the PDF is the
      paginated page view with real text.
- [ ] Every PDF page uses the document's A4 size, orientation, and margins.
- [ ] Content sits at the same position within the same margins as the page view, within a small
      tolerance; there is no reflow at export.
- [ ] Anchored branches appear at their laid-out position; continuation markers appear where the
      page view shows them.
- [ ] Reference cross-links use the on-page affordance; no invented footnotes.
- [ ] If the page shows a title, page numbers, or headers/footers, the PDF matches them and they do
      not collide with content.
- [ ] No block is clipped at a page boundary; content that continues is marked.

### 6.3 Page breaks and pagination

- [ ] PDF page breaks equal the paginator's breaks and the page view's breaks; export does not
      repaginate.
- [ ] No text line, image, formula, table row, or code line is cut across PDF pages; a long block
      continues only at a safe internal boundary (paragraph, list item, blockquote paragraph, or
      between code lines) with matching continuity markers.
- [ ] Ghost-parent and continuation markers match the page view exactly; the block exists once.
- [ ] No blank pages and no empty trailing page.
- [ ] A4 portrait or landscape export uses the document-wide orientation with the correct dimensions
      and margins.
- [ ] Page count is deterministic for the same document and settings.
- [ ] Manual break hints follow the page view: a hint that is honored starts the same page in the PDF;
      an ignored hint is reported and both views use the paginator's actual break.

### 6.4 Graphics, fonts, assets

- [ ] Arrows are vector; zooming to 800% shows no pixelation.
- [ ] Arrowheads are correct; no arrow is clipped at a page edge or margin.
- [ ] Fonts are embedded (`pdffonts`); no Type3 bitmap text; math and code fonts included.
- [ ] Images have adequate DPI, correct aspect ratio, and no upscaling blur; missing assets show a
      placeholder.
- [ ] Links work if emitted; otherwise no dead links are emitted.
- [ ] The PDF is light regardless of the app's dark/light appearance; no dark background is printed.
- [ ] The PDF opens in Preview and Chrome without warnings; no app-specific import is required.

### 6.5 Scale and failure

- [ ] 300 blocks export in under 10 s; 1,000 in under 30 s; progress is shown; cancel works.
- [ ] A cancelled or failed export leaves no partial file and no locked document.
- [ ] Preflight blocks export when a block is too wide or unbreakably too tall, naming the affected
      blocks and offering resolution actions.
- [ ] Unhonored manual break hints, lost anchors, missing assets, and formula errors are reported;
      the export still uses the paginator's actual breaks where the UX allows it.
- [ ] Memory stays under 1.5 GB for 1,000 blocks.
- [ ] Export does not mutate the document or the autosave state.
- [ ] A document with broken anchors still exports and marks them.
- [ ] Exporting a landscape document preserves orientation, A4 page size, and margins.
- [ ] Page count, page size, orientation, and margins are validated against the page view and
      paginator before the file is written; a mismatch is an export failure, not a warning.
- [ ] Product owner visual check (optional): the PDF looks correct on the Mac; page size is comfortable. Notability or another annotation app is out of scope.
      (manual check each release).
- [ ] Annotations: v1 scope excludes the study layer. If a toggle exists, test both modes; a
      visible toggle is a scope violation unless an ADR approved it.

### 6.6 PDF pipeline checks (decided)

The stack is Electron (ADR-0001) and the PDF pipeline is the shared paginator + `printToPDF`
(ADR-0002). The paginator remains the single source of page breaks.

- [ ] The print compositor consumes the shared paginator's derived pages; it does not compute a
      second pagination or let CSS paged media decide breaks.
- [ ] The print model/compositor is built from the same real `layoutDocument` + `paginate` output
      as Page Read/Edit (a hand-built page/layout fixture is not seam evidence), and carries the
      resolved PageTheme/CSS variables, block measurements/table columns, anchor and missing-asset
      diagnostics, and page-chrome geometry. A parity test compares Page Read's fragment/edge/trunk
      data to the print model, including A/B2/stacked trunks and cross-page segments.
- [ ] The print model is tied to the exact measured run: the caller passes the resolved settings
      fingerprint (theme included) and the document identity, and the build rejects a missing or
      different fingerprint, a different page setup/manual-break set, and a different document id
      before rendering.
- [ ] Print metric parity is asserted by computed style or raster comparison, not only by inline
      attributes/snapshot HTML; a `print.css` metric drift fails a test.
- [ ] The export job validates the produced PDF page count and page size against the paginator and
      writes atomically; a blank page or a count/size mismatch is an export failure, not a warning.
- [ ] A produced blank page is classified from the model (no fragments, edges/trunks, or images on
      that page) or from raster ink, not from text absence alone; a page that contains only an
      image is not blank. The failure is tested.
- [ ] Print-time image/font/KaTeX decode failures are surfaced on the job. An image with declared
      width/height whose bytes disappear or fail after measurement prints the app placeholder and
      reports an asset warning, not a browser broken-image glyph.
- [ ] The main process validates the hidden-window summary shape and finite geometry, binds the
      snapshot to the requested package and sending window, and does not trust an unchecked cast.
- [ ] Each print page is a fixed container at the resolved page size (A4/A5/Letter, portrait or
      landscape); `@page` supplies size and zero margins; the renderer waits for layout, pagination,
      fonts, images, and KaTeX.
- [ ] Text remains real text (not outlines or screenshots) and fonts are embedded.
- [ ] The export suite includes a real present image and a dimensioned missing/failed image, not
      only a placeholder fixture without dimensions.
- [ ] Page size, orientation, margins, breaks, and ghost/continuation markers match the page view.
- [ ] Vector arrows and images print correctly.
- [ ] Tables break only between rows; a row and its cells are never split; a too-tall row blocks
      export with a clear error.
- [ ] The print DOM mirrors the page view's geometry and is not screenshotted.
- [ ] The chosen pipeline exports from the packaged app, not only the dev server.
- [ ] The packaged app ships the PDF inspector (`pdfjs-dist`) and its worker as runtime
      dependencies (unpacked from asar if needed); a packaged export smoke proves the inspector
      loads and the produced PDF is validated.
- [ ] The automated 50+ page A4 gate is re-run on Electron upgrades by the Builder; no app-specific import check is required.
- [ ] A pipeline change requires an ADR and reopens this section.

---

## 7. Data and persistence checks

- [ ] `schemaVersion` is written on every save.
- [ ] The loader handles current, older (migrate), and newer (refuse, read-only, clear message)
      versions.
- [ ] A golden fixture per schema version migrates; page size, orientation, margins, manual break
      hints, IDs, anchors, and edges are preserved.
- [ ] Document page settings (A4, orientation, 20 mm default margins) persist; pages themselves are
      recomputed deterministically, and reopening gives the same page count for the same settings.
- [ ] View state (mode, page, scroll, zoom, selection, collapse) is non-canonical; stale references
      to deleted blocks or pages are dropped on load.
- [ ] Manual break hint insertion/removal is atomic and undoable; no derived page container is
      written to disk.
- [ ] Migration backs up first; a failed migration leaves the original intact.
- [ ] Atomic save: temp file, fsync, rename. Killing the process mid-save leaves the old or the new
      complete file, never a truncated one.
- [ ] Autosave is debounced, does not run during migration or export, and save-on-quit is reliable.
- [ ] Backup rotation works; restore is tested; the next autosave does not overwrite the only good
      backup.
- [ ] Missing asset: placeholder plus warning; the document opens; saving does not silently drop
      the reference.
- [ ] Corrupt JSON, invalid schema, duplicate IDs, and a primary cycle each produce a specific
      error, no overwrite, and an offered backup.
- [ ] Unknown fields are preserved or explicitly dropped per policy; a roundtrip test proves it.
- [ ] Asset garbage collection never deletes a referenced asset; deduplication is by hash; paths
      are relative.
- [ ] External file changes are detected or explicitly unsupported; no silent overwrite.
- [ ] Export/import: Markdown loss is documented; JSON Canvas interchange, if still offered, is
      valid; semantic roundtrip is tested where claimed.
- [ ] No secrets or personal data in the document, logs, or crash reports; the data location is
      documented.
- [ ] Unsupported files open read-only; no background write.

---

## 8. External Agent API checks

No in-app chat or agent panel ships in v1; that is a non-goal. External agents use a local API over
the same typed commands as the UI.

### 8.1 Shared command surface

- [ ] Every API mutation maps to a public typed command also used by the UI; there is no API-only
      store, file, or model mutation path.
- [ ] Commands validate preconditions (primary cycle, anchor validity, safe continuation boundary,
      document lock) before mutating; a rejected command changes nothing.
- [ ] Schemas are typed and versioned; unknown fields and oversized payloads are rejected with
      structured errors.
- [ ] API commands are undoable with the same labels and grouping as UI commands, and return a
      command ID.
- [ ] The local HTTP JSON API and the MCP adapter map to the same command catalog; there is no second
      command surface.
- [ ] No API-only bypass of validation, confirmation, scope, or audit.

### 8.2 Local-only binding, auth, and scopes

- [ ] The API is off by default; the user enables it, chooses a port, and issues or revokes tokens.
- [ ] The server binds loopback or a Unix socket only; it is not reachable from the LAN or a remote
      tunnel by default.
- [ ] Every request requires a bearer token; the secret is shown once, stored hashed, compared in
      constant time, and revocable.
- [ ] The token secret never appears in the document package, git, PDF metadata, logs, errors, or the
      audit log (only a token ID).
- [ ] Scopes are `read`, `write`, `export`, `destructive`, and `audit`; read and write are separate,
      and a write token cannot grant itself destructive scope.
- [ ] A token can be limited to one document or library; path traversal and arbitrary filesystem
      access are rejected.
- [ ] Rate limits and timeouts bound malformed or abusive requests.

### 8.3 Dry run, confirmation, apply, and undo

- [ ] A dry-run/proposal endpoint returns a structured diff (blocks, branches, anchors, page
      settings, manual breaks) without mutating.
- [ ] Destructive actions (delete, overwrite, chapter reorder, page setup, manual break removal)
      require explicit confirmation or a scoped confirmation token; no silent apply.
- [ ] Apply is atomic: all commands apply or none; partial apply is impossible.
- [ ] A stale `baseRevision` or document-version conflict returns a structured conflict and is never
      applied silently.
- [ ] The response is typed: created/updated IDs, human-readable diff, new revision, undo token, and
      audit ID.
- [ ] Undo/redo through the API uses the shared command stack; apply then undo reverts as one entry
      and the UI sees the result.
- [ ] An idempotency key prevents duplicate apply on retry.
- [ ] The API does not change view state (page, zoom, selection) by default.

### 8.4 Concurrency, locking, and audit

- [ ] One writer lock per document; API and UI serialize through it; commands validate `baseRevision`;
      a second writer gets a conflict, not a corrupt file.
- [ ] The lock is released on disconnect or crash with a TTL; a stale lock is recoverable.
- [ ] Open/save respects the lock and atomic save; no interleaved writes.
- [ ] Every request (read, write, dry-run, export, failure) gets an audit entry with timestamp,
      token/client ID, command, document, base revision, result, affected IDs, and duration; note
      content is omitted by default.
- [ ] The audit log is local and append-only; it does not leak into the document package, git, or PDF
      metadata.
- [ ] No write is silent: every successful mutation returns a command ID and an audit entry, and the
      UI reflects the change.
- [ ] Every write is attributable; there are no anonymous mutations.
- [ ] The audit log survives restart and can be exported or cleared per policy.

### 8.5 Content trust, errors, and tests

- [ ] Note content is treated as data, not instructions; API responses label it as such.
- [ ] Malicious note content cannot cause a command unless the agent explicitly calls one; nothing is
      auto-executed.
- [ ] Auth, scope, validation, conflict, lock, and rate-limit errors are structured and actionable,
      with no partial mutation.
- [ ] Retries are idempotent; timeouts cancel; no duplicate commands.
- [ ] No background autonomy or web access; the API is local and makes no outbound network call.
- [ ] Tests cover auth/scopes, audit, dry-run/apply/undo, lock/concurrency, malicious content, and
      the no-network default.

---

## 9. Severity and verdicts

### 9.1 Severity

| Level | Definition | Examples | Gate |
|---|---|---|---|
| **S1 Blocker** | Data loss or corruption, crash on a core path, security/privacy breach, silent anchor detachment, PDF without a text layer, content loss at a page break, unauthorized External Agent API write, token exposure, primary cycle accepted on load | Typing before an anchor breaks it after reload; deleting a block silently deletes its subtree; pagination drops or duplicates a block; autosave truncates the file; the PDF has no selectable text or the wrong page count; an API request writes without a token or scope | Never merge or release |
| **S2 Major** | Acceptance criterion unmet, common-case adaptive-layout overlap, broken undo, budget missed on target hardware, unsafe block split, missing continuation marker, core flow inaccessible, misleading save/export state | A reference edge changes pagination; adaptive widths overlap a sibling; a text line, image, formula, table row, or code line is cut at a page boundary; a ghost-parent marker is missing; a keyboard-only user cannot create a branch; save fails silently | Blocks task done |
| **S3 Minor** | Edge-case visual defect, copy inconsistency, missing tooltip, non-blocking performance | Arrow endpoint 2 px off at 150% zoom; a landscape margin differs slightly from portrait; "link" vs "branch" in a tooltip; a label overlaps only with an unusually long title | Follow-up issue allowed |
| **S4 Nit** | Style, naming, comment, formatting | Variable name, comment wording, import order | Optional |

Rules:

- Severity is user impact times likelihood, not fix effort.
- Any data loss is S1, even if rare.
- Security and privacy are S1 until proven otherwise.
- "Ugly but correct" is at most S3.
- Do not inflate severity to win an argument; do not downgrade it to ship.
- State confidence and evidence. If unsure, say so and mark the item for investigation.

### 9.2 Verdicts

- **Approve:** every acceptance criterion is evidenced, no S1/S2, no material unverified risk.
- **Approve with nits:** only S3/S4; list them; follow-up is allowed.
- **Request changes:** S2, missing evidence, or an unmet acceptance criterion.
- **Blocked:** missing brief, acceptance criteria, fixture, or access; contradictory spec; a design
  flaw that needs an ADR or the orchestrator.

---

## 10. Review report template

```text
# Review — <task ID> <title>

- Reviewer:
- Date:
- Commit / branch:
- Environment: macOS version, build type, display scale
- Stack/PDF: Electron + shared paginator + printToPDF (ADR-0001, ADR-0002)
- Theme: dark (default) or light
- Page settings / views: size, orientation, margins, page count and breaks, reader/page parity
- External API: token scope, command ID, audit ID (when relevant)
- Verdict: Approve | Approve with nits | Request changes | Blocked

## Scope reviewed
<files and areas; what was intentionally out of scope>

## Acceptance criteria
| # | Criterion | Evidence | Result |
|---|---|---|---|
| 1 | ... | test / screenshot / manual steps | Pass / Fail / Not verified |

## Findings
| ID | Severity | Area | Location | Reproduction | Expected | Actual | Direction |
|---|---|---|---|---|---|---|---|
| F1 | S2 | Layout | packages/layout/... | ... | ... | ... | ... |

## Checks run
- Build / typecheck / lint:
- Unit / integration / e2e:
- Manual scenarios:
- Fixtures used:

## Performance
| Metric | Budget | Measured | Method / machine |
|---|---|---|---|

## What I could not verify
<...>

## Open questions / risks
<...>

## Follow-ups
<...>
```

---

## 11. Approval gate

Before approving, answer each question:

1. Do I know which acceptance criterion this proves, and did I reproduce every one?
2. Would the tests fail if the behavior were removed?
3. Did I try to lose data, and failed?
4. Did I check save, quit, and reopen?
5. Did I check undo after every new mutation?
6. Did I check the broken-anchor and deleted-anchor path?
7. Did I check adaptive geometry, pagination, and stability, not only the new feature?
8. Did I verify shared-child and reference-edge behavior, including cross-page references?
9. Did I check PDF page fidelity, continuation markers, and text extraction if the task touches
   export?
10. Did I verify External Agent API auth/scopes, dry-run, audit, locking, and undo?
11. Can I state what I could not verify?

Any "no" means the task is not approved.
