# Review checklist

**Owner:** Sentinel.
**Language:** English.
**Companion:** `docs/definition-of-done.md` (budgets, test strategy, gates).

---

## Why this exists

Four risks are unusually coupled: anchored branches, a primary tree plus reference edges, an
adaptive layout whose pages are derived, and a PDF that must reproduce those pages with real text.
A change that looks local can break one of them. This checklist makes the review repeatable and
evidence-based, so approval means "I reproduced the claim", not "the summary sounded confident".

## 0. Reviewer stance

- **Independent and fresh.** Never review your own work; read the brief and the diff, not the
  commit message alone.
- **Skeptical, not hostile.** Assume the change is wrong until evidence shows it is right; ask what
  would falsify each claim.
- **Evidence over assertion.** A green test, a screenshot or a benchmark counts only if it would
  change when the behavior changes.
- **Does not rewrite code.** The reviewer writes findings; the implementer fixes them.
- **One task at a time.** A diff spanning unrelated work is sent back to be split.
- **Ambiguity is a finding.** Do not invent requirements to keep the review moving.
- **Never a rubber stamp.** "Approved" is a claim of verification.

## 1. How to review

### 1.1 Preconditions

The task is reviewable only with: a brief with numbered acceptance criteria, scope and non-goals;
links to the relevant spec, UX and ADR sections; a fixture or reproducible state; page size,
orientation, margins and expected page count; approved dependencies; for UI work, the expected
states and keyboard path. If anything is missing, the verdict is **Blocked**.

### 1.2 Read the contract

1. Read `AGENTS.md`, the brief and the linked docs.
2. Write the three to seven claims the task must prove.
3. For each claim, write what would falsify it.
4. Check that every criterion is testable. "Works well" is not; "adding a reference edge moves no
   node" is.

### 1.3 Read the diff

Read the full diff, not the summary. Classify files (model, layout, UI, storage, tests, docs,
config). Check scope first: unrelated refactors, schema edits, new dependencies, generated files,
binaries. Read the risky parts first: ID generation, anchor mapping, layout mutation, save path,
migration, undo. Ask what the change should have touched and did not.

### 1.4 Run it

Clean checkout or worktree, install from the lockfile, production build, typecheck, lint, full
suite. Launch the packaged or production app, not only the dev server. Reproduce every criterion
from a cold start with the named fixture. Save, quit, reopen. For UI work, capture the claimed
state; include fit, 100 % and 150 % zoom when layout is involved. For page work, check both A4
orientations, both layouts and the page count.

### 1.5 Probe beyond the happy path

Try: undo/redo after every new mutation; delete what was just created; reload and reopen; resize,
zoom, pan, change orientation, force a page boundary; the keyboard-only path; the malformed or
missing input the task did not mention; the largest fixture it claims to support.

Standing goal: **try to lose data**. If a normal action loses a block, a branch, an anchor or
content at a page break, it is S1.

### 1.6 Judge the evidence

- **Tests** are evidence only if they fail when the behavior is removed. Inspect the assertion or
  ask for a red-green demonstration.
- **Screenshots** must show the actual state, produced by the build under review.
- **Performance** needs machine, build type, fixture, method and p95.
- **Coverage** is not correctness.
- **Summaries** are leads, not proof; verify the file, not the sentence.

### 1.7 Verdict and report

Use §8. Every finding gets severity, location, reproduction, expected vs actual and a direction,
not a patch. Record what you could not verify. Never approve with open S1 or S2.

### 1.8 Re-reviews

Re-run the failing check; run the full suite if the change touches model, layout, persistence or
migrations. Review the diff since the last review. A rebase touching risky files invalidates prior
approval for those files.

### 1.9 Docs

Check that the document matches the ADRs, that deviations are explicit, and that accepted decisions
are not silently reopened. Every MUST is testable; states are covered; data invariants are stated;
decisions name alternatives; terminology matches `AGENTS.md`; no page-container or free-canvas
assumption has crept back in.

### 1.10 Timebox

First pass within one working session. A diff over ~600 changed lines or touching more than three
subsystems is split. Product disagreement: the orchestrator decides. Architecture disagreement:
ADR. A reviewer who cannot run the app or the tests is **Blocked**.

---

## 2. Code

### 2.1 Correctness

- [ ] Logic matches the spec: ordering, defaults, edge direction.
- [ ] Boundary cases: empty document, one block, deep nesting, many top-level blocks, zero edges,
      1,000 blocks.
- [ ] IDs generated once, stable, never from content, index or a colliding timestamp.
- [ ] No array index as identity or persisted reference.
- [ ] Time and randomness injectable; production behavior correct.
- [ ] No `NaN`, `Infinity`, negative sizes or inconsistent rounding in layout math.
- [ ] Unicode (CJK, emoji, combining marks, RTL) does not corrupt offsets.
- [ ] `null`/`undefined` handled at boundaries; no assertion hiding a real case.
- [ ] Numeric tolerances explicit.

### 2.2 Architecture

- [ ] Core model pure and UI-free; layout pure and deterministic; storage separate.
- [ ] One source of truth; derived state computed, not stored twice.
- [ ] Commands are the only mutation path.
- [ ] Explicit interfaces between editor, model, layout and storage.
- [ ] No circular dependency or god module; new abstraction justified by two uses or a real boundary.
- [ ] Implementation matches the ADRs; deviations are flagged.

### 2.3 State and undo

- [ ] Selection, focus, zoom, page, scroll and hover are view state.
- [ ] Undo covers content, edges, anchors, reorder, chapters, manual breaks, page settings.
- [ ] Collapse, view switches and navigation are not undoable.
- [ ] Undo restores selection and focus; typing vs command routing tested at boundaries.
- [ ] Multi-step actions are one entry.
- [ ] Async work cannot interleave into a corrupt state; stale results are discarded.

### 2.4 Model invariants

Verify at the command layer **and** on load:

- [ ] IDs unique across blocks, edges, anchors, assets.
- [ ] At most one incoming primary edge per non-root block.
- [ ] Primary subgraph acyclic; self-loops rejected.
- [ ] Reference cycles allowed.
- [ ] Reparent under own descendant rejected atomically.
- [ ] Every endpoint resolves; every anchor belongs to its block.
- [ ] Sibling order unique per parent, sortable, insertable between neighbours.
- [ ] Delete semantics defined (promote, reparent, cascade), undoable, no dangling reference.
- [ ] Pages derived; no page container or synthetic super-root.
- [ ] Chapter membership consistent; a top-level block is a content block.
- [ ] Long blocks continue only at safe boundaries; one block with markers.
- [ ] Widths and positions derived, never stored as fixed columns.
- [ ] Pagination deterministic and idempotent.
- [ ] Asset references resolve or are flagged; no absolute paths.
- [ ] Unknown-field policy explicit.
- [ ] Validation failures are specific and do not partially mutate.

### 2.5 Errors

- [ ] No empty `catch`; errors carry context and actionable copy.
- [ ] Corrupt file, newer schema, missing asset, failed save and failed export each have a state.
- [ ] A failed operation leaves the model unchanged or rolled back.
- [ ] Save failure is visible; the app never claims a save that did not happen.
- [ ] Editor failures (KaTeX, image decode, highlighter) degrade locally.
- [ ] A lossy load projection refuses or preserves; never writes back silently.
- [ ] Logs contain no note content by default.

### 2.6 Performance

- [ ] No O(n²) in layout, pagination, anchor resolution or edge routing at 1,000 blocks.
- [ ] Layout touches only the dirty subtree; no full reflow per keystroke.
- [ ] No full document render on selection, hover, zoom or page navigation.
- [ ] Page navigation does not relayout or repaginate the document.
- [ ] Measurement cached and invalidated on content, width or font change.
- [ ] Numbers measured against the budgets.
- [ ] Memory bounded: caches capped, listeners removed.

### 2.7 Security

- [ ] Markdown/HTML paste sanitized; no script, iframe or handlers.
- [ ] Links open externally with confirmation; no arbitrary `file://`.
- [ ] LaTeX limited to KaTeX-safe commands; no `javascript:` links.
- [ ] Images validated; SVG untrusted or rasterized.
- [ ] File access confined to the package; no traversal.
- [ ] Electron least privilege: context isolation on, Node off, narrow preload.
- [ ] CSP; no remote code or fonts; no telemetry; no secrets.
- [ ] PDF export fetches nothing and executes no script.

### 2.8 Dependencies

- [ ] Approved in the brief or ADR, with purpose and alternative.
- [ ] Permissive licence (copyleft needs approval).
- [ ] Maintained; no deprecation notice.
- [ ] Size and transitive weight acceptable.
- [ ] Native modules checked for packaging.
- [ ] Lockfile committed; no surprising postinstall.
- [ ] Removed dependencies cleaned up.

### 2.9 Tests

- [ ] New behavior tested at the lowest useful layer.
- [ ] Every bug fix has a regression test that fails before the fix.
- [ ] Tests assert behavior, not private details.
- [ ] Failure paths tested.
- [ ] Deterministic: no sleeps, network, real clock or order dependence.
- [ ] Fixtures named and reused.
- [ ] No test-only branches in production code.
- [ ] Snapshot diffs reviewable and understood.
- [ ] Visual and PDF tests on the fixed environment.

### 2.10 Docs and hygiene

- [ ] Spec, UX or ADR updated when behavior or a decision changed.
- [ ] Comments explain why, not what; no commented-out code.
- [ ] No debug logs, TODOs without an issue, dead code or stray files.
- [ ] No unrelated formatting noise.
- [ ] No secrets, large binaries or generated artifacts.
- [ ] Commit message states the change and the task ID.

---

## 3. UI/UX

### 3.1 Interaction

- [ ] Pan, zoom and page navigation are navigation only; no drift, no jump after zoom or reload.
- [ ] Reader and page views show the same content and breaks; switching preserves position and
      selection.
- [ ] Editing works in Continuous Edit and in the Page Edit overlay; the other view reflects it.
- [ ] Page setup updates both views; no clipping in either orientation.
- [ ] No drag-to-position; drag reorders siblings only.
- [ ] Creating and deleting a branch works with pointer and keyboard; Esc cancels.
- [ ] Selection, marquee, add/remove and select-all work within a view.
- [ ] Toolbar and context actions match the selection; disabled states explain why.
- [ ] Page starts are visible, skipped by arrow navigation, and expose their menu.

### 3.2 Keyboard, focus and selection

- [ ] Every action has a keyboard path or a documented exception.
- [ ] Focus visible on blocks, ports, anchors, page controls, toolbar; not lost after an action.
- [ ] Tab order follows visual order; no traps; Esc closes overlays.
- [ ] While a modal, sheet or palette is open, global shortcuts and native-menu commands cannot
      switch tabs, change layout or run authoring commands behind it.
- [ ] Shortcuts do not fire while typing; one chord has one meaning on one surface.
- [ ] Every application chord goes through `lib/shortcuts.ts`; a raw comparison is a finding.
- [ ] Read mode blocks every mutation, including in-place node-view controls.
- [ ] Single-key shortcuts do not conflict with typing or IME.
- [ ] Selection survives reflow and view switches by block ID.
- [ ] Navigating to a hidden block expands ancestors and lands on its page without an edit.
- [ ] Screen readers announce block role, selection, branch, anchor, page number and page change.

### 3.3 Stability

- [ ] Typing does not shift the edited block or the viewport.
- [ ] Adding or removing a block moves only the affected branch; page breaks may shift.
- [ ] Reordering siblings changes only that set.
- [ ] A continued branch shows a ghost parent and both labels.
- [ ] No content is cut at a page boundary; no overlap with the footer.
- [ ] Collapse shows the hidden count; expand restores a predictable state.
- [ ] Collapse is shared by outline and Continuous and is not undoable.
- [ ] No flicker on page switch, load, save or theme change.

### 3.4 Anchors in the UI

- [ ] An anchored span has a visible, non-intrusive marker.
- [ ] The branch appears at the anchor and paginates with markers.
- [ ] A broken anchor is visibly distinct, falls back to the block and opens repair.
- [ ] Reattach shows the stored quote and requires confirmation when ambiguous.
- [ ] Creating an anchor does not alter the text or the Markdown export unexpectedly.
- [ ] Deleting anchored text warns or preserves the branch.

### 3.5 States and content

- [ ] Dark default, light available, choice persists.
- [ ] Empty document and empty page give guidance.
- [ ] Loading shows progress; content arrival does not jump the layout.
- [ ] Errors are actionable; no stack traces.
- [ ] Page setup, manual breaks and pagination limits have defined states.
- [ ] Long words, URLs and code wrap or scroll without breaking the box.
- [ ] Images have alt text, a placeholder and the correct aspect ratio.
- [ ] Math errors render inline.
- [ ] Copy is English and consistent.

### 3.6 Accessibility and visual quality

- [ ] WCAG AA for text, 3:1 for meaningful non-text states, in every state.
- [ ] A new indicator clears 3:1 at rest, hover, focus and selected.
- [ ] Images, math and code readable in both themes; the PDF stays light.
- [ ] No meaning by colour alone.
- [ ] Hit targets adequate at every zoom.
- [ ] Reduced motion respected.
- [ ] Works at fit, 100 %, 150 %, narrow window, both themes.
- [ ] No clipped text, overlapping toolbars or off-screen dialogs.

---

## 4. Layout

### 4.1 Geometry and pagination

Use a fixture with mixed blocks, anchored branches, a shared child, several top-level blocks and
at least three pages. Check A4 portrait and landscape, both views, fit and 150 %.

- [ ] Every page block fits the content box or is a reported defect.
- [ ] Each chapter starts on a new page; top-level blocks stack in chapter order.
- [ ] No node-node, node-callout, callout-callout or label-node overlap.
- [ ] An anchored callout starts at its anchor; mode A sits in the right lane and Read/Edit/PDF
      agree.
- [ ] Widths content-driven; a subtree may be wider; no fixed column per depth.
- [ ] A child goes right when it fits, otherwise the group wraps below with an indent.
- [ ] Only order changes the layout; no nudge, pin or free drag.
- [ ] Breaks fall between blocks; long blocks continue only at safe boundaries.
- [ ] A page never overflows; the paginator adds pages.
- [ ] An impossible block is a defect with a warning and blocked export.
- [ ] Continuation shows a ghost parent and both labels; the block exists once.
- [ ] Automatic markers dashed, manual solid and labelled.
- [ ] Page count derived; no empty trailing page.
- [ ] Changing page setup re-paginates without clipping; the tree does not change.
- [ ] Reader and page views produce identical breaks.

### 4.2 Edges and ports

- [ ] A primary edge starts at the out-port or the anchor, never the centre.
- [ ] It ends at the in-port; the arrowhead points at the target.
- [ ] No edge passes through a node; otherwise routed around.
- [ ] Reference edges distinct and layout-neutral.
- [ ] A cross-page reference ends at a page-edge indicator with the target page.
- [ ] No line drawn across a page break.
- [ ] Labels readable and attached to the right edge.
- [ ] No primary self-loop; reference cycles handled.
- [ ] Arrowheads and labels do not cross margins.
- [ ] Edges do not occlude the anchor marker or caret.

### 4.3 Anchored branches

- [ ] The branch starts at the anchor (mode A is the documented exception).
- [ ] Multiple callouts from one anchor stack in order; different anchors do not overlap.
- [ ] A callout that cannot fit is a defect, not clipped.
- [ ] Near the page bottom it continues with markers.
- [ ] Zoom and pan keep the edge attached to the live anchor.
- [ ] Editing above the anchor moves the edge, not the callout content.
- [ ] Read and Page agree on anchor and breaks.
- [ ] Deleting the anchor leaves no stale rectangle.

### 4.4 Shared children

- [ ] A shared block renders once, one layout node, one DOM node.
- [ ] Position and breaks depend only on the primary parent.
- [ ] The outline shows it once with a "referenced by" affordance.
- [ ] Adding a second parent creates a reference edge, not a duplicate.
- [ ] Changing the primary parent moves it once and reroutes references.
- [ ] Deleting the primary parent applies the defined policy.
- [ ] Reference cycles render without infinite traversal.
- [ ] Cross-page references use the chip, not a line.

### 4.5 Stability

- [ ] Adding a block: ≥ 95 % of pre-existing blocks within 2 px; unrelated chapters do not move.
- [ ] Deleting a block: survivors outside the affected subtree move ≤ 1 px.
- [ ] Chapter operations keep internal layout; only order and page numbers change.
- [ ] Rename or longer content reflows only the affected subtree.
- [ ] Undo restores exact positions, page count and manual breaks.
- [ ] Pagination idempotent and deterministic across runs.
- [ ] Fonts and image dimensions are settled before pagination.

### 4.6 Layout performance

- [ ] Budgets: 300 guaranteed, 1,000 usable with virtualization and collapse.
- [ ] An incremental edit does not trigger a full layout or full repagination.
- [ ] No long task over 50 ms during pan, zoom or page switch.
- [ ] Page switch renders only the target page.
- [ ] Measuring 1,000 blocks does not block first interaction beyond budget.

---

## 5. Anchors

### 5.1 Text

- [ ] Anchor a word and a phrase; reload; both point at the same text.
- [ ] Edit before, inside and at both boundaries; it holds or becomes visibly broken.
- [ ] Split, merge, paste over, cut and undo do not silently retarget.
- [ ] IME and dead keys do not break the mark.
- [ ] Duplicate occurrences keep the right one.
- [ ] The mark serializes to JSON; no DOM-only trick.
- [ ] Save/load preserves it; export warns about loss.
- [ ] Deleting the text keeps the branch and the quote.

### 5.2 Formula

- [ ] Anchor a term inline and in display math.
- [ ] Editing another part leaves it intact; editing the term breaks or offers confirmed reattach.
- [ ] A KaTeX error does not break resolution.
- [ ] Duplicating a formula does not make one anchor point at both.
- [ ] Resize/reflow keeps the rectangle correct.

### 5.3 Code

- [ ] Anchor a token and a range; edit before and after; reindent; reformat; change language.
- [ ] Quote plus context re-anchors; an ambiguous match needs confirmation.
- [ ] Tabs/spaces, CRLF, long lines and horizontal scroll handled.
- [ ] Split/merge or language change does not lose the anchor.
- [ ] Copy/paste does not duplicate IDs.

### 5.4 Image

- [ ] Region normalized 0–1; resizing and zoom do not move it.
- [ ] Crop or replace remaps by asset hash or breaks; never a wrong region.
- [ ] Missing asset shows a placeholder; the anchor stays recoverable.
- [ ] Alt text and the region have an accessible description.
- [ ] Small and large images, EXIF orientation handled.

### 5.5 Cross-cutting

- [ ] Multi-block selection rejected with a message.
- [ ] Deleting a block has defined anchor and edge semantics.
- [ ] Health lists every broken anchor with quote, source and actions.
- [ ] Broken falls back to the block and opens repair without losing the branch.
- [ ] Orphan state persists; export warns.
- [ ] No action silently deletes a branch or anchor.
- [ ] Anchor create/remove is in undo.
- [ ] Export represents anchored branches without claiming false fidelity.

---

## 6. PDF

### 6.1 Text layer

- [ ] `pdftotext` extracts every block's sentinel text.
- [ ] Order matches page and reading order.
- [ ] No `�`, no missing glyphs, no text as outlines or images.
- [ ] Math present or visually correct; no clipped exponents.
- [ ] Code keeps monospace and indentation.
- [ ] A phrase is searchable in a viewer.

### 6.2 Fidelity

- [ ] Same paginator; page count matches exactly.
- [ ] No separate reader PDF.
- [ ] Page size, orientation and margins match the settings.
- [ ] Content sits at the same position within tolerance; no reflow at export.
- [ ] Anchored branches and markers match Page.
- [ ] Cross-links use the on-page affordance.
- [ ] Chrome does not collide with content.
- [ ] No block clipped at a boundary.

### 6.3 Breaks

- [ ] PDF breaks equal the paginator's and Page's.
- [ ] No cut line, image, formula, code line or table row.
- [ ] Ghost parents and continuation markers match.
- [ ] No blank or empty trailing page.
- [ ] Orientation and dimensions deterministic.
- [ ] Honoured manual hints match Page; ignored ones are reported.

### 6.4 Graphics, fonts, assets

- [ ] Arrows vector; no pixelation at 800 %.
- [ ] Arrowheads correct; none clipped at a page edge.
- [ ] Fonts embedded; no Type3 bitmaps.
- [ ] Images adequate DPI, correct aspect ratio; placeholder for missing.
- [ ] The PDF is light in both themes.
- [ ] Opens in Preview and Chrome without warnings.

### 6.5 Scale and failure

- [ ] 300 blocks under 10 s; 1,000 under 30 s; progress and cancel.
- [ ] Cancelled or failed export leaves no partial file and no lock.
- [ ] Preflight blocks impossible blocks and names them.
- [ ] Unhonoured hints, lost anchors, missing assets and formula errors are reported.
- [ ] Memory under 1.5 GB at 1,000 blocks.
- [ ] Export does not mutate the document or autosave.
- [ ] Count, size and orientation validated before the atomic rename.
- [ ] A blank produced page fails the export.

### 6.6 Pipeline

- [ ] The compositor consumes the real `layoutDocument` + `paginate` output.
- [ ] The print model carries the resolved theme, measurements, anchors and chrome.
- [ ] The fingerprint binds the measured run, settings and document identity.
- [ ] Metric parity is asserted by computed style or raster, not only inline attributes.
- [ ] Print containers are direct children of the print root (0.14 mm/page drift otherwise).
- [ ] Each page is a fixed container at the resolved size; margins are internal padding.
- [ ] Text stays real; fonts embedded.
- [ ] Tables break only between rows; a too-tall row blocks export.
- [ ] The packaged app ships `pdfjs-dist` and validates the produced PDF.

---

## 7. Data and persistence

- [ ] `schemaVersion` written on every save.
- [ ] Current, older (migrate) and newer (refuse, read-only) handled.
- [ ] A golden fixture per version migrates; IDs, anchors, edges and settings preserved.
- [ ] Personal page settings and manual breaks persist per document; pages recompute.
- [ ] View state is non-canonical; stale references dropped on load.
- [ ] Migration backs up first; a failed migration leaves the original.
- [ ] Atomic save: temp, fsync, rename; a kill leaves old or new complete.
- [ ] Autosave debounced; not during migration or export; save on quit reliable.
- [ ] Backup rotation and restore tested.
- [ ] Missing asset: placeholder plus warning; the reference is not dropped.
- [ ] Corrupt JSON, invalid schema, duplicate IDs and cycles produce specific errors, no overwrite.

---

## 8. Severity and verdicts

| Level | Definition | Gate |
|---|---|---|
| **S1** | Data loss, crash on a core path, security breach, silent anchor loss, PDF without text, content lost at a break, accepted primary cycle | Never merge or release |
| **S2** | Acceptance criterion unmet, common-case overlap, broken undo, budget missed, unsafe split, missing continuation, inaccessible core flow, misleading save state | Blocks done |
| **S3** | Edge-case visual defect, copy inconsistency, missing tooltip, non-blocking perf | Follow-up allowed |
| **S4** | Style, naming, comment | Optional |

Severity is user impact × likelihood, not effort. Any data loss is S1. Security and privacy are S1
until proven otherwise. Do not inflate or downgrade. State confidence and evidence.

**Verdicts.** Approve: every criterion evidenced, no S1/S2, no material unverified risk. Approve
with nits: S3/S4 only. Request changes: S2, missing evidence or unmet criterion. Blocked: missing
brief, criteria, fixture or access; contradictory spec; a design flaw needing an ADR.

---

## 9. Report template

```text
# Review — <task ID> <title>

- Reviewer / date / commit:
- Environment: macOS, build type, display scale, theme
- Page settings and page count:
- Verdict: Approve | Approve with nits | Request changes | Blocked

## Acceptance criteria
| # | Criterion | Evidence | Result |

## Findings
| ID | Severity | Area | Location | Reproduction | Expected | Actual | Direction |

## Checks run
## Performance (metric, budget, measured, method)
## What I could not verify
## Risks and follow-ups
```

## 10. Approval gate

1. Did I reproduce every acceptance criterion?
2. Would the tests fail if the behavior were removed?
3. Did I try to lose data, and failed?
4. Did I check save, quit and reopen?
5. Did I check undo after every new mutation?
6. Did I check the broken-anchor and deleted-anchor path?
7. Did I check geometry, pagination and stability, not only the new feature?
8. Did I check shared children, reference edges and cross-page references?
9. Did I check PDF fidelity and text extraction if the task touches export?
10. Can I state what I could not verify?

Any "no" means not approved.
