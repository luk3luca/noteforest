# M3 design package — span anchors, anchored callouts, reference edges

**Role:** Planner / Architect (scoped specialist)  
**Milestone:** M3  
**Status:** **Approved 5 November 2026.** C1–C9 and OD-1–OD-12 approved as recommended; applied to `docs/spec.md` v0.4.5, `docs/ux.md` v1.3, and ADR-0005. This document is retained as the design record; the body is not rewritten.  
**Base:** `main` after M2f acceptance (`76e0bd1`, 5 November 2026)  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-a2e5cb6f`  
**Branch:** `t3/m3-anchors-references-design`  
**Spec basis:** `docs/spec.md` v0.4.4 at design time; applied at v0.4.5  
**Scope:** one design package for M3. No code, tests, schema changes, or plan edits.

---

## 0. How to read this package

This document turns the ratified M3 product decisions into behavior precise enough for the
Orchestrator to write Builder briefs without guessing. It has four kinds of statements:

| Kind | Meaning | Authority |
|---|---|---|
| **Ratified** | Already decided in `docs/spec.md`, `AGENTS.md`, or an accepted ADR. | Do not change. |
| **Design decision** | An implementation-level choice that follows from a ratified rule. | Builder must follow unless the Orchestrator overrides it. |
| **Proposal (not applied)** | A proposed spec/UX/ADR delta or a new data/command shape. | Needs Orchestrator approval before implementation. |
| **Open decision** | A genuine product or scope choice not settled by the ratified docs. | Product owner / Orchestrator must decide; this package recommends but does not decide. |

Section 14 lists every open decision with options and a recommendation. Section 13 lists every
proposed delta. Nothing in this package is silently applied.

The design deliberately follows the spec where the UX doc disagrees; the conflicts are named in
§1.4 so the Orchestrator can resolve them before writing briefs.

---

## 1. Summary and decisions

### 1.1 What M3 must prove

M3 is the anchored-branch milestone. It must prove four things end to end:

1. A branch can start from a **span** inside a block — text, formula term or whole formula, code
   token/range, image point/region — and survives ordinary editing, move, split, merge, undo/redo,
   and reload without losing the branch or the target.
2. An **anchored callout** appears below its anchor, in deterministic order, and its branch target
   is the same block object as any other branch target (no duplication).
3. A **reference edge** can connect a source block or anchor to an existing block; it is a
   first-class relationship with its own see-also surface, role transitions, deletion rules, and
   cycle handling, and it **never** affects outline order, layout, or pagination.
4. A broken or ambiguous anchor is a **visible, repairable state** — never silent deletion, never
   a second copy of the branch in export.

M3 is editor-first. Page view and PDF are M4. The design keeps the M4 contract explicit so M4 can
consume the same anchor resolution and the same traversal without a second implementation.

### 1.2 Ratified constraints that this design does not reopen

| ID | Constraint | Source |
|---|---|---|
| D2 | A block is a rich body, not a single content node. | `AGENTS.md`, spec §4.3 |
| D3 | Outline order: anchored primary children first, by anchor start position then anchor ID; then direct primary children by branch order. | spec §4.6, §6.2 |
| D4 | Reference by default when the target already has a primary home; add-as-child when it is a top-level block; explicit "make home" and "move here"; never duplicate the block. | spec §4.6, §5.3 |
| D5 | All four anchor kinds in v1; exact unique bindings may auto-resolve; ambiguous reattachment requires explicit confirmation; broken anchors never delete branches; export includes every branch exactly once; formula-term geometry is best-effort, whole-formula precise. | spec §8.10 |
| — | One primary incoming edge per block; reference edges may cycle; reference edges never affect outline, layout, or pagination. | spec §4.5–4.7 |
| — | Pages are derived; pages are not structural containers. | spec §4.2, §7.5 |
| — | One visible undo stack; one user action = one undo entry for multi-step actions. | spec §5.1, UX F11 |
| — | The reader is the primary editor in v1; page view is preview. M3 is editor-first. | spec §6.3, D14 |

### 1.3 Design decisions made in this package

These are not new product decisions. They are the smallest deterministic rules that make the
ratified behavior testable. Each is marked where it appears.

| ID | Decision | Why |
|---|---|---|
| DD-1 | Anchor binding lives in canonical content: text nodes carry an `anchorIds` array; atomic nodes (formula/code/image) carry an `anchorIds` array. The anchor record's selector remains the repair descriptor. | One source of truth; overlapping anchors and multiple regions on one node become representable; no sidecar range that drifts. |
| DD-2 | Resolution has only two auto-resolve outcomes: **exact binding** or **unique fallback**. Any multiple-candidate case is **ambiguous** and requires confirmation. | Matches D5; avoids an untestable "clearly best" heuristic. |
| DD-3 | Anchor order uses a derived content-order key: resolved start position, else `lastKnown` start, else end-of-block, then anchor ID. | Deterministic for broken/ambiguous anchors and shared by outline/reader/page/PDF. |
| DD-4 | Reference edges are never read by layout traversal. The layout-neutrality proof is a differential test: layout(D) deep-equals layout(D + reference edges). | The product invariant needs a test, not a comment. |
| DD-5 | Multi-record actions use composite commands or the existing exact `structure.restore` snapshot pattern, not a chain of separate undo entries. | M2f already proved this for move/delete; M3 extends it to anchor+branch+block, make-home, attach-to-block, split/merge. |
| DD-6 | The editor and the M4 layout engine consume one pure anchor resolver; M3 must not create a second resolver in the renderer. | Avoids the "two layout engines" failure the spec forbids. |
| DD-7 | Anchor state (`resolved`/`ambiguous`/`broken`/`idle`) is always derived, never stored. | Load/undo/reload must recompute from content, never trust stale state. |

### 1.4 Conflicts found across the current docs (blocking or near-blocking)

**Approval (5 November 2026).** The product owner approved **C1–C9 as recommended**. The resolution column is binding; the delta is applied in `docs/spec.md` v0.4.5, `docs/ux.md` v1.3, and ADR-0005. The conflict descriptions below are retained as the design record.

These are not design choices; they are inconsistencies the Orchestrator must resolve before the
relevant Builder brief. The design follows the spec/D3 in each case and flags the UX delta.

| ID | Conflict | Where | Consequence | Recommended resolution |
|---|---|---|---|---|
| **C1** | Outline order: UX says anchored children appear **after** unanchored children; spec/D3/AGENTS say anchored primary children come **first**. | `docs/ux.md` §8.5 line 1201 vs spec §4.6, §6.2, AGENTS D3 | Builder would implement the wrong visible order; AC-10 would be judged against the wrong rule. | **Spec/D3 wins.** Update UX §8.5 to "anchored children first, then direct children." This is a docs fix, not a product change. |
| **C2** | M3 gate includes AC-56 (export exactly once, broken marker) but PDF/page view is M4. | `docs/plan.md` M3 gate vs M4 scope | M3 cannot produce a PDF to verify AC-56 as written. | **Split the evidence:** M3 proves a pure export manifest includes every primary branch exactly once and marks broken anchors; M4 verifies the PDF. Open decision OD-5. |
| **C3** | M3 gate includes AC-18 (split/merge anchor behavior) but M2 has no `block.split` or `block.merge` commands. | `docs/plan.md` M3 gate; `packages/core/src/commands.ts` command list | AC-18 cannot pass unless split/merge are added in M3 or the gate moves. | **Implement anchor-aware `block.split`/`block.merge` in M3f**; if deferred, move AC-18 to M4 and record it. Open decision OD-6. |
| **C4** | Collapse behavior: UX F7 says Reader/Page always show the full layout; spec §4.7/§7.6 says collapse is shared by all views and hides anchored callouts. | `docs/ux.md` F7 vs spec §4.7, §7.6 | M3 callout visibility under collapse is ambiguous. | For M3's continuous editor, follow spec §7.6: collapse hides callouts and descendants. Resolve the Reader/Page wording separately for M4. |
| **C5** | Duplicate branch rule: spec I8 says no duplicate exact source-target branch (role-independent); current validation allows the same source-target with different roles. | spec §4.5/I8 vs `packages/core/src/validation.ts` duplicate key includes role; UX F8 says same source/target/role | "Link as reference" could silently create a redundant edge next to a primary edge. | **Role-independent dedupe** is recommended (spec literal): one edge per source-target; role is a property of that edge. Open decision OD-3. |
| **C6** | Spec says formula/code/image binding uses a "node ID", but the canonical content model has no node IDs. | spec §4.4 anchor table vs `packages/core/src/types.ts` `ContentNode` | Builder cannot implement the stated binding literally. | **Proposal P1:** use a per-node `attrs.anchorIds` array as the stable node binding; no schema break, unknown attrs already preserved. |
| **C7** | "Make home" when the target is already a root is under-specified: spec says "promote it and make it a top-level block in the current chapter," which is already its state. | spec §5.3 "Promote to primary" | UI could offer a no-op command. | Treat "make home" as requiring an existing primary parent; root targets use "move here"/add-as-child. Open decision OD-7. |
| **C8** | I10 says a text anchor mark ID appears at most once in the document content, but a range mark naturally repeats on every text node of the range; a literal reading forbids multi-node text anchors, which AC-16 expects. | spec §4.10 I10 vs §4.4 text anchors and AC-16 | The validator could reject every multi-node text anchor, or the editor could store one ID per range in a way that drifts. | **Interpret I10 as one contiguous binding**, not one text node: the ID may repeat across adjacent text nodes of one range; a second disjoint range is the violation. Proposal P1. |
| **C9** | Deleting a block with anchored primary children: one rule says promote every primary child, another says remove the deleted block's anchors and the branches sourced from them. Both cannot hold; the child would be unreachable. | spec §5.2 "Delete block" vs invariant I5/no unreachable blocks | The target could be orphaned or silently deleted by a promote operation. | **Promote all primary children, including anchored ones**: create a new primary branch from the deleted block's primary parent (new branch ID) or make the child top-level; remove the old anchored branch. Target/block IDs stay; undo restores the old anchored branch. Never leave an unreachable target. |

The most important is **C1**: it directly changes the visible outline. Do not let a Builder
implement from UX §8.5 before it is corrected.

### 1.5 Decisions resolved (summary)

**All twelve were approved on 5 November 2026 as recommended; see §14.** The short list:

1. Fix the C1 outline-order conflict (docs; no product change).
2. Anchor lifetime after the last branch is removed (idle record vs delete).
3. Dedupe key for branches (role-independent vs role-specific).
4. Atomic-node binding shape (`anchorIds` array vs record-only).
5. AC-56 gate split (M3 manifest vs M4 PDF).
6. AC-18 split/merge scope.
7. `makeHome` on a root target.
8. Editor callout placement model (callout lane vs in-card).
9. Reference edge rendering in M3 (dashed edge vs chips only).
10. Health-panel surface (status chip + sheet vs full inspector).
11. Cross-chapter merge (reject vs allow).
12. Text selection containing inline math/image (support vs restrict).

### 1.6 Out of scope for M3

- Page view and PDF visuals, the paginator's page-break geometry, AC-51–AC-53, AC-60–AC-66; M4.
- A second layout engine or a second anchor resolver; M3 exposes the shared contract.
- The External Agent API/MCP and its scopes/dry-run/audit; M5.
- Annotations, iPad/Pencil, collaboration, sync, plugins, spaced repetition.
- A full right-hand inspector; the anchor health sheet is the M3 surface.
- Formula text extraction/search in PDF; best-effort formula text is M4+.
- Cross-chapter merge (OD-11), page-number chips (M4), and any automatic anchor repair/deletion.
- Auto-refreshing anchor quotes or selectors as a side effect of editing; repair is explicit.

---

## 2. Model

### 2.1 Entity and ID map

| Entity | Canonical owner | Identity | Notes |
|---|---|---|---|
| **Document** | `document.json` | `document.id` | `revision` increments once per committed command. |
| **Chapter** | `document.chapters[]` | `chapter.id` | Ordered `topLevelBlockIds`; every root appears exactly once. |
| **Content block** | `document.blocks[id]` | `block.id` | Opaque, immutable, never reused. Rich body. |
| **Anchor** | `document.anchors[id]` | `anchor.id` | Belongs to exactly one block; ID also appears in the content binding. |
| **Branch** | `document.branches[id]` | `branch.id` | Source is a block or an anchor; role primary/reference. |
| **Derived page** | not stored | derived | Paginator output only. |
| **Anchor state** | not stored | derived | `resolved` / `ambiguous` / `broken` / `idle`. |
| **Callout placement** | not stored | derived | Layout/editor geometry only. |

The canonical document has no `state`, `x`, `y`, `page`, `resolved`, or `lastResolvedAt` fields for
anchors. Those are derived. `lastKnown` may exist as a repair hint but is never read by resolution
or layout as truth.

### 2.2 Anchor record

The current `Anchor` shape in `packages/core/src/types.ts` is preserved. M3 adds precise meaning to
`selector`; it does not remove fields.

| Field | Type | Required | M3 meaning |
|---|---|---|---|
| `id` | string | yes | Immutable anchor identity. Also carried in the content binding. |
| `blockId` | string | yes | The block containing the anchor. Updated only by split/merge (the anchor moves with content). |
| `kind` | `"text" \| "formula" \| "code" \| "image"` | yes | Must match `selector.kind`. |
| `selector` | object | yes | Kind-specific durable descriptor; see §2.4. This is the canonical repair descriptor. |
| `quote` | string | conditional | Exact selected text/LaTeX/code text; required for text, formula, code. Optional for image (region label). **Mirror:** must equal `selector.quote` when both exist. |
| `prefix` / `suffix` | string | no | Context for fallback. Mirrors `selector.prefix`/`selector.suffix` when present. |
| `occurrenceHint` | integer | no | 1-based occurrence hint. Mirrors `selector.occurrenceHint`. A hint, not truth. |
| `lastKnown` | object | no | Optional repair hint. **M3 does not write it by default**; if present, it may contain `{ contentOrder?: number, nodePath?: number[], page?: number }`. Never used for auto-resolution or layout. |
| `createdAt` | timestamp | no | Optional. |
| `extensions` | object | no | Unknown fields preserved. |

**Mirror rule (design decision).** The spec's illustrative record has both a `selector` and
top-level `quote`/`prefix`/`suffix`/`occurrenceHint`. To avoid two truths:

- `selector` is canonical.
- Top-level fields are optional compatibility mirrors. On write, M3 writes both from the same
  values. On read, `selector` wins; if a mirror disagrees, the document loads with a warning and
  the anchor is flagged `selector-mismatch` for repair. It is not silently rewritten.
- The anchor ID is never inside `selector`; it is the record `id` and the content binding value.

### 2.3 Binding shapes (P1; approved as OD-4, applied)

A binding is the exact content location of an anchor. It is stored in content, not in a sidecar.

**Text: inline mark with an array.**

```json
{
  "type": "text",
  "text": "eigenvalue",
  "marks": [
    { "type": "anchor", "attrs": { "anchorIds": ["a1"] } }
  ]
}
```

- `anchorIds` is an array because two anchors may overlap the same text run. A single
  `anchorId` string is accepted on read for M2 compatibility and treated as `["a1"]`; if both
  exist, `anchorIds` wins and must include the legacy `anchorId`.
- Exactly one anchor mark exists per text node; it carries the array. Creating an overlapping
  anchor merges its ID into the existing array (splitting text nodes as needed); it never adds a
  second anchor mark of the same type.
- `anchorIds` arrays are stored sorted by anchor ID so serialization, diffs, and undo snapshots are
  deterministic. Empty arrays and anchor marks with no IDs are removed from content; an atomic node
  with no anchors has no `anchorIds` attr.
- The anchor mark is non-inclusive at its end (`inclusive: false`): typing inside the range extends
  it, typing at the right boundary does not silently grow it, and typing before it moves it. This
  keeps the anchor from drifting while preserving AC-16's inside-edit behavior.
- An anchor range is the maximal contiguous run of text/inline content covered by the mark.
  The command splits text nodes at selection boundaries so the mark can start/end inside a text
  node. Overlapping anchors produce multiple IDs on the same text nodes. Intervening inline
  math/image nodes are allowed inside the range; unmarked text between two marked runs means the
  binding is not contiguous and is broken.
- The mark is part of content. Copying content with anchor marks must not duplicate an anchor ID
  (see §5.4, paste/duplicate).
- Anchor creation reuses an existing anchor only when the new selection has exactly the same
  binding (same range/region). A subrange or partial overlap creates a new anchor ID; both IDs
  coexist in `anchorIds`.

**Atomic nodes: `attrs.anchorIds` array.**

```json
{ "type": "mathBlock", "attrs": { "latex": "Av = \\lambda v", "anchorIds": ["a2"] } }
{ "type": "image", "attrs": { "assetId": "sha256-…", "anchorIds": ["a4", "a5"] } }
{ "type": "codeBlock", "attrs": { "language": "python", "anchorIds": ["a3"] }, "children": [] }
```

- One atomic node can host multiple anchors (two regions on one image; two anchors on one
  formula; a code block with several ranges).
- The node kind must match the anchor kind: `mathBlock`/`inlineMath` for formula, `image` for
  image, `codeBlock` for code.
- A whole-formula anchor and an image-region anchor use the node binding as the precise part;
  the rect/term is in the selector.
- Code anchors use the node binding to confirm the node, but the quote/offset selector is the
  durable range; offsets are never the sole match.
- When the node is deleted, the binding disappears; resolution falls back to the selector and
  reports broken if the quote is absent.

**`AnchorBinding` input union (transient, not stored).**

```ts
type AnchorBinding =
  | { kind: 'text'; ranges: Array<{ nodePath: number[]; start: number; end: number }> }
  | { kind: 'formula'; form: 'whole'; nodePath: number[] }
  | { kind: 'formula'; form: 'term'; nodePath: number[]; latex: string; occurrence: number }
  | { kind: 'code'; nodePath: number[]; startOffset: number; endOffset: number }
  | { kind: 'image'; nodePath: number[]; assetId: string; rect: AnchorRect; crop?: AnchorRect; point: boolean };
```

`nodePath` is a path from the block content root to the text/atomic node at command time. Offsets
are Unicode code points. The binding is used only to apply the content change; the durable record is
the selector plus the content `anchorIds`. A binding that does not match the block content is
rejected before mutation.

**No schema version bump.** The content model already preserves unknown attrs and marks. Older M2
readers preserve `anchorIds` but ignore it; new readers accept both `anchorId` and `anchorIds`.
M3 does not add a required canonical field. If the Orchestrator prefers a schema bump, it must be a
no-op migration that adds no data; the recommendation is no bump.

### 2.4 Selector shapes

The selector is the durable repair descriptor. It must be complete enough to find the anchor
again after the binding is lost.

**Text**

```json
{
  "kind": "text",
  "quote": "eigenvalue",
  "prefix": "An ",
  "suffix": " is",
  "occurrenceHint": 1
}
```

- `quote` is the exact plain-text projection of the selection.
- `prefix`/`suffix` are up to 32 Unicode code points of context on each side, truncated at block
  boundaries.
- `occurrenceHint` is the 1-based occurrence of `quote` in the block's text projection at creation
  time.
- A text anchor that spans inline math/image uses the plain-text projection: text contributes its
  text, inline math contributes its LaTeX source, image contributes its alt text or `U+FFFC`, and
  paragraph/list-item boundaries and hard breaks contribute `\n`. This is a repair descriptor only;
  the mark binding is truth.
- A text anchor may span paragraphs/list items but must not cross a **block-level** atomic node
  (display math, image, code block) or a table-cell boundary. A text anchor entirely inside one
  table cell is allowed; an anchor spanning cells is rejected with "Anchors work within one table
  cell." This avoids a text range with an unmarked structural hole and matches the no-cell-span
  rule.

**Formula**

```json
{
  "kind": "formula",
  "form": "whole",
  "latex": "Av = \\lambda v"
}
```

```json
{
  "kind": "formula",
  "form": "term",
  "latex": "\\lambda",
  "latexStart": 5,
  "occurrenceHint": 2,
  "latexPrefix": "Av = ",
  "latexSuffix": " v"
}
```

- `form: "whole"` requires an atomic node binding; `latex` is the saved source for display/repair.
- `form: "term"` stores the exact LaTeX substring and its occurrence within the formula source.
  `latexStart` is an optional Unicode-code-point offset hint for ordering/repair; it is never the
  sole match. `latexPrefix`/`latexSuffix` are optional context. Multiple occurrences are
  **ambiguous** even with a hint (D5, §8.10).
- Invalid LaTeX is preserved as source; the anchor remains associated with the formula node and is
  not rewritten.

**Code**

```json
{
  "kind": "code",
  "quote": "eigvals",
  "prefix": "values = ",
  "suffix": "(",
  "occurrenceHint": 1,
  "startOffset": 128,
  "endOffset": 135,
  "lineStart": 11,
  "lineEnd": 11
}
```

- Offsets are Unicode code points from the start of the code text, not UTF-16 or platform string
  indices. `startOffset` inclusive, `endOffset` exclusive.
- `lineStart`/`lineEnd` are 1-based hints.
- Offsets/lines are hints; `quote` + context is the durable selector. A unique quote resolves even
  if offsets moved. Multiple quote matches are ambiguous even if an offset matches one candidate.
- `quote` is required; `form: "whole"` may be added if the user selects the whole code block, but
  the same quote rule applies.

**Image**

```json
{
  "kind": "image",
  "assetId": "sha256-…",
  "rect": { "x": 0.20, "y": 0.35, "width": 0.18, "height": 0.10 },
  "crop": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
  "point": false,
  "label": "eigenvector diagram"
}
```

- `rect` is normalized to 0–1 relative to the image's intrinsic dimensions; never display pixels.
- A point anchor uses a zero-size rect (`width: 0`, `height: 0`) and `point: true`; the visible
  marker has a UI hit area larger than the point.
- `assetId` is the content-addressed asset ID. If it differs from the current image node's asset,
  the anchor is broken (asset changed/replaced), never silently reattached.
- `crop` is the normalized crop/transform the anchor was created against (full image if omitted).
  Display resize is safe because `rect` is normalized; a changed crop is broken/requires explicit
  confirmation because the old region may no longer mean the same thing. If the editor stores crop
  as a transform derived from node attrs, the selector stores the normalized values, not DOM pixels.
- If two image nodes share the same asset, the node binding (`anchorIds`) disambiguates; if the
  node is missing, the selector alone is ambiguous/broken, not auto-resolved to the other image.

### 2.5 Branch record and roles

The existing `Branch` shape is preserved.

| Field | M3 meaning |
|---|---|
| `id` | Immutable. Survives reorder, relabel, role change, make-home, detach. A deleted branch ID is retired and never reused; undo restores the same ID. |
| `source` | `{ blockId }` or `{ blockId, anchorId }`. An anchored source must belong to `blockId`. |
| `targetBlockId` | Existing block. A missing target is a load error/quarantine, not a silent drop. |
| `role` | `primary` or `reference`. |
| `order` | Fractional key, unique within `(port, role)`. `port` = block or anchor. Primary order drives layout/outline; reference order drives see-also lists. |
| `label` | Optional; shown on the edge and in see-also. |
| `createdAt` | Optional. |
| `extensions` | Preserved. |

**Role rules.**

- A non-root block has exactly one incoming `primary` branch. The primary subgraph is acyclic.
- A block has zero or more incoming `reference` branches. Reference cycles are allowed.
- A branch cannot target its own source block.
- Duplicate exact source-target: one edge per pair (recommended; OD-3). Different anchors in the
  same block are different sources and may target the same block.
- A primary branch's source can be an anchor. Deleting a primary branch makes the target a root and
  a top-level block; it never deletes the target or its subtree unless `targetHandling:
  "delete-subtree"` is explicit.
- A reference branch never changes the target's home, chapter, outline position, geometry, or
  pagination.

**Ports.** A port is the block itself or one anchor. Each port has separate primary and reference
order lists. Moving a branch between ports (attach-to-block, anchor repair that changes the block)
requires re-keying its order in the destination port; the branch ID stays.

### 2.6 Derived values that must never be stored

| Derived value | Derived from | Where used |
|---|---|---|
| Anchor state | content binding + selector + assets | editor markers, outline chips, health panel, export manifest |
| Anchor start/order key | content order + resolved range + anchor ID | callout order, outline order |
| Callout position | block layout + anchor rect + callout gap | editor, page view, PDF |
| Reference edge route | block geometry + edge router | editor, page view, PDF |
| Page number | paginator | M4 views/PDF; M3 shows chapter/label instead |
| Shared-child `Shared · N` | incoming reference count | outline chips/inspector |
| Broken count | resolver | status chip/health panel |

`lastKnown` is the only permitted stored geometry-ish field and is explicitly advisory. M3 writes
it only if a Builder needs it for a repair preview; it is never read by resolution, layout, or
export.

### 2.7 Validation invariants (M3 additions)

The existing invariants I1–I18 remain. M3 adds/clarifies:

| ID | Invariant | On violation |
|---|---|---|
| **A1** | Anchor IDs are globally unique and each anchor belongs to an existing block. | Fatal recovery or quarantine; never silent drop. |
| **A2** | Every `anchorIds` entry in content has an anchor record. If an anchor record has a content binding, that binding lists the anchor ID in the record's declared block. An anchor record with no content binding is valid and resolves by selector (broken if no candidate). | Broken anchor + warning; a mark without a record is inert (no phantom branch). |
| **A3** | An anchor ID identifies at most one contiguous binding in a block. For text, the ID may appear on every text node of one contiguous run; a second disjoint run, or a duplicate entry in one node's array, is a duplicate binding. For atomic nodes, the ID appears in exactly one node's `anchorIds` array. I10 is interpreted as one binding, not one text node. | Broken anchor; repair required; never auto-duplicate. |
| **A4** | Text `anchorIds` appear only on text nodes; formula on `mathBlock`/`inlineMath`; code on `codeBlock`; image on `image`. | Invalid binding; broken/repair. |
| **A5** | `selector.kind` equals `anchor.kind`; required fields per kind are present; image rect and crop are finite and within 0–1; `point` is true exactly when width and height are zero. | Load warning/broken; preserve record. |
| **A6** | A branch source anchor belongs to the source block; target exists; no self-branch. | Fatal recovery/quarantine. |
| **A7** | At most one incoming primary branch per block; primary subgraph acyclic. | Fatal recovery; user chooses. |
| **A8** | No duplicate exact source-target branch (role-independent recommendation). | Reject creation; on load drop duplicate with warning. |
| **A9** | Branch `order` is unique within `(port, role)`. | Warning; tie-break by ID; normalize on save. |
| **A10** | Every root appears exactly once in exactly one chapter; reference-only roots are still roots. | Fatal recovery. |
| **A11** | No reference branch is read by the outline/layout/export traversal. | Test invariant; a defect if violated. |
| **A12** | Unknown anchor kinds, selectors, and content attrs are preserved and flagged, not dropped. | Warning; preserve. |

### 2.8 Compatibility and migration

- **schemaVersion stays 1.** M3 adds optional content attrs and uses existing anchor/branch fields.
- Older documents without `anchorIds` load by falling back to `anchorId` or the selector. No
  migration is required.
- New documents written by M3 are readable by M2 (M2 preserves unknown attrs/marks but does not edit
  anchors). This is a deliberate forward/backward tolerance, not a promise that M2 can author M3
  features.
- If the Orchestrator decides a schema bump is needed, it must be a no-op migration with a
  pre-migration backup and a round-trip test. The recommendation is no bump.

---

## 3. Anchor resolution

### 3.1 Resolution order

Resolution is pure over the canonical document. It never mutates content or the anchor record.
For each anchor, in this order:

1. **Exact binding**
   - Text: the anchor ID appears on a contiguous run of text nodes; the range is that run. If the
     ID appears in more than one disjoint run, broken (A3).
   - Formula whole: exactly one matching `mathBlock`/`inlineMath` node with the ID in
     `anchorIds`; the range is the node.
   - Image: exactly one matching `image` node with the ID in `anchorIds`; asset ID and normalized
     crop must equal the current node's values; rect must be valid; the asset record must exist. If
     the asset or crop differs, broken (`asset-changed` / `crop-changed`), not reattached. If the
     asset is missing, broken (`asset-missing`) with a placeholder; the branch is kept.
   - Code: exactly one matching `codeBlock` node with the ID in `anchorIds`; then resolve the
     quote/range inside that code text. If the quote is absent, broken (`quote-missing`); if
     multiple, ambiguous.
2. **Exact quote with unique context**
   - Text: search the block's text projection (inline text plus inline-math LaTeX and image alt
     text; it excludes code-block text and display-math source). Exactly one occurrence of `quote`
     → resolved. Multiple occurrences: try exact `prefix`+`quote`+`suffix`; exactly one →
     resolved. Otherwise ambiguous.
   - Formula term: search the target formula's LaTeX source (or all formula nodes in the block if
     no node binding) for the exact `latex` substring. Exactly one → resolved. Multiple →
     ambiguous. `latexPrefix`/`latexSuffix` must match exactly to count as context, but do not
     override the multiple-occurrence rule.
   - Code: search the target code node's text (or all code nodes in the block if no node binding)
     for the exact `quote`. Exactly one → resolved. Multiple: exact `prefix`+`quote`+`suffix`
     exactly one → resolved; otherwise ambiguous. Offsets are a hint, never the sole match.
   - Image: no quote fallback; node+asset+rect is the only exact binding. If the node is missing or
     the asset changed, broken; candidates require confirmation.
3. **No match** → broken.

### 3.2 "Exact unique" definition (design decision DD-2)

Auto-resolution is allowed only when exactly one of these is true:

- the binding exists exactly once and passes its kind's validation; or
- the fallback quote/context matches exactly one candidate.

Everything else is **ambiguous**. In particular:

- A formula term with two occurrences is ambiguous even if `occurrenceHint` points at one.
- A code quote with two occurrences is ambiguous even if `startOffset` points at one.
- A text quote with two occurrences is ambiguous unless the exact prefix and suffix select
  exactly one.
- An image asset change is broken, never auto-resolved to the new asset.

This is stricter than spec §8.2's "if one candidate is clearly best, resolve." It is consistent
with D5's "exact unique bindings may auto-resolve; ambiguous reattachment requires explicit
confirmation." If the product owner wants a heuristic, it needs a separate decision.

### 3.3 Ambiguous candidate ranking (UI order only)

Candidates are ranked for display, never auto-selected:

1. exact `prefix`/`suffix` match;
2. `occurrenceHint` match;
3. proximity to `lastKnown` content order (if present);
4. earlier start offset;
5. anchor ID (stable tie-break).

The repair UI shows each candidate with surrounding context: quote plus prefix/suffix for text,
formula LaTeX plus occurrence for formulas, line plus surrounding lines for code, and an image
region preview for images.

### 3.4 State machine

| State | Meaning | Auto-resolve? | Callout origin | Visible treatment |
|---|---|---|---|---|
| **resolved** | Exact binding or unique fallback. | Yes | Anchor rect. | Normal dotted underline/dot; callout below. |
| **ambiguous** | Multiple plausible candidates. | No | Block warning point; candidate preview on hover/selection. | Warning marker + "N matches" chip; repair opens candidate list. |
| **broken** | No candidate. | No | Block warning point. | Warning marker + "Lost anchor" chip; repair opens relink. |
| **idle** | Anchor record exists, no outgoing branch. | n/a | None. | Marker hidden or very subtle; no callout; no health warning. |
| **block-missing** | Anchor's block no longer exists (invalid document). | n/a | None. | Load error/quarantine; listed in health panel; actions limited. |

Idle takes precedence when there are no outgoing branches: the binding/selector may still be broken,
but there is no callout or branch to repair, so the anchor is not listed in the health panel until a
branch exists. Transitions are recomputed, not stored: resolved → ambiguous/broken after edits;
broken → resolved after repair; idle → resolved/broken/ambiguous when a branch is added. Undo/redo
recomputes from the restored content.

### 3.5 Block anchor index and performance

Design a per-block index computed once per content revision:

- plain-text projection with a map from text offset → content path/offset;
- formula nodes with LaTeX source and node paths;
- code nodes with text, line starts, and node paths;
- image nodes with asset IDs and node paths;
- anchor records grouped by block.

Resolve all anchors in a block in one pass. Build a per-block text/code occurrence index once per
revision (quote → positions/contexts) and let each anchor query it; do not run an `indexOf` across
the whole block per anchor. Cache by block content hash or document revision. On a content edit,
invalidate only that block, using `affected.blockIds` from `block.editContent`; on load, compute all
blocks. Target: 1,000 anchors resolved in < 100 ms on load (spec §14.2),
incremental per edited block afterward. Resolution is content-only; DOM range measurement is
separate and only for visible blocks.

### 3.6 Detection triggers

Re-resolve the affected block after:

- text, formula, or code edit;
- block split or merge;
- image replacement, crop, or asset change;
- anchor create/repair/attach/delete;
- undo/redo that changes content or structure;
- document load;
- import/paste that creates or copies anchor content;
- recovery/migration.

Full-document scan on load, after migration, and after recovery. Incremental per block after edits.
UI updates may be debounced (100–200 ms), but the state must be correct before save and export.
Save commits the active edit and awaits resolution for the dirty blocks (or runs a full scan if the
dirty set is unknown) before writing; export runs a full scan and computes the manifest
deterministically. A debounced marker update must never be the only thing standing between a stale
state and a save.

### 3.7 No mutation rule

Resolution never edits content, selectors, quotes, branch sources, or targets. It may produce a
warning list. A resolved edit does **not** auto-refresh `quote`/`prefix`/`suffix`; those remain the
creation/repair intent. If the binding is later lost, repair shows the stored quote and the current
text. This avoids hidden document mutations and hidden undo entries.

**Proposal (not applied):** if the product later wants auto-refreshed quotes, it must be a command
with its own undo entry or part of the text-edit transaction, not a side effect of resolution.

---

## 4. Commands and undo

### 4.1 Command catalogue

M3 adds or extends these commands. All are typed, validate preconditions before mutating, return
`created` IDs, and have an inverse or exact snapshot. The existing `CommandResult` contract is
preserved.

| Command | New/extended | Purpose |
|---|---|---|
| `anchor.create` | new | Create an anchor record and its content binding. |
| `anchor.repair` | new | Replace selector/binding; keep anchor ID. |
| `anchor.attachToBlock` | new | Remove anchor, retarget its branches to the block. |
| `anchor.delete` | new | Delete anchor; branches attach to block or are deleted. |
| `branch.create` | extended | Add `source.anchorId` and `role`. |
| `branch.delete` | extended | Support reference and anchored primary; explicit target handling only for primary. |
| `branch.reorder` | extended | Any port and role, including anchored primary and reference lists. |
| `branch.relabel` | extended | Any role. |
| `branch.makeHome` | new | Promote a reference to primary; demote old primary to reference. |
| `branch.moveHere` | new | Promote a reference to primary; delete old primary edge. |
| `branch.demote` | new | Convert a primary edge to reference; target becomes a root. |
| `block.split` | new (M3f) | Split a block at a text offset; migrate anchors. |
| `block.merge` | new (M3f) | Merge a block into its previous sibling; migrate anchors/branches. |
| `branch.createFromSelection` | new composite (proposal) | Anchor (if needed) + block (if new) + branch, one undo entry; also covers branch-to-existing from a selection. |

**Why a composite command.** The spec says creating an anchored child is one undoable command:
anchor + block + branch. If the UI dispatches three commands, `⌘Z` would need three presses or a
transaction wrapper. M3 should implement one typed command (or one command that internally applies
the three steps and returns one exact inverse). The same applies to "branch from selection to an
existing block" when the anchor is new.

**M2 gaps to lift.** The M2 command layer currently rejects anchored branches in `block.move`,
`branch.delete`, and `branch.reorder`, and validation emits "anchors preserved but not edited in
M2" / "reference branches preserved but not edited in M2." M3 must remove those restrictions and
replace the warnings with real validation (A1–A12). This is a behavior change to existing commands,
not a new product decision; every lifted restriction needs a regression test.

**Subtree traversal gap.** M2's `subtreeBlockIds`/`directChildIds` follows direct primary branches
only, not anchored primary branches. M3 commands that delete, move, duplicate, or snapshot a subtree
— and **every primary-cycle check** — must follow both direct and anchored primary branches;
otherwise an anchored child can be left unreachable when its parent/anchor is deleted, or a move
under an anchored descendant can create a primary cycle that the guard misses. This is a
correctness fix that AC-04/AC-06/AC-07 and the C9 cases depend on.

**Created IDs.** `CreatedIds` currently has block/branch/chapter/document IDs but no `anchorIds`.
M3 adds `created.anchorIds`. The UI must use it for new anchors and never infer a new anchor from a
before/after diff (the M2c/M2f desync lesson). A composite command that reuses an existing anchor
returns no new anchor ID for that anchor.

### 4.2 Command details

#### `anchor.create`

Input:

```ts
{
  type: 'anchor.create';
  anchorId?: string;
  blockId: string;
  kind: 'text' | 'formula' | 'code' | 'image';
  selector: AnchorSelector;       // §2.4
  binding: AnchorBinding;         // exact content location from the selection
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
}
```

Preconditions: block exists; binding is inside that block; kind matches binding; selector valid;
selection is non-empty (image point may be zero-size); text binding does not cross a block; the
binding is not already owned by another anchor (exact duplicates reuse the existing anchor or fail
with `anchor-exists`). Effect: insert the binding into block content (split text nodes as needed;
add the ID to `anchorIds`), create the anchor record, update `block.updatedAt`. Inverse: remove the
binding and record. Failure leaves the document unchanged.

#### `anchor.repair`

Input: `anchorId`, `selector`, `binding`, optional quote/context. Preconditions: anchor exists;
kind is unchanged; new binding is in the same block (repair is same-block in v1); selector valid; the
new binding is not already owned by another anchor (if it is, report `anchor-exists` and focus that
anchor rather than creating a duplicate binding); explicit user confirmation is a UI responsibility. Effect: remove the old binding, apply the new binding, replace
the selector, keep the anchor ID and all branch IDs/targets. Inverse: restore the old selector and
binding exactly (snapshot). Undo/redo recomputes state.

#### `anchor.attachToBlock`

Input: `anchorId`. Preconditions: anchor exists. Effect: remove the binding and anchor record;
change **every** outgoing branch source to `{ blockId }`; append them to the block's primary or
reference order after existing branches of that role, preserving their relative order; keep branch
IDs, labels, targets. If the
block already has a branch to the same target (role-independent dedupe), keep the existing block
branch and remove the duplicate with a warning; the target is still linked once. Inverse: exact
restore of anchor record, binding, branch sources, and order keys. This changes outline order
(anchored rows become direct rows); it is one undo entry.

#### `anchor.delete`

Input: `anchorId`, `branches: 'attach' | 'delete'`. Preconditions: explicit choice when outgoing
branches exist. Effect: `attach` behaves as `anchor.attachToBlock` (which removes the anchor and
binding, and keeps the branches); `delete` removes all outgoing branches and then the anchor/binding.
Deleting an anchored primary
branch through this command promotes its target (never `delete-subtree`); target blocks and their
subtrees are never deleted by anchor deletion. If several primary targets are promoted, insert them
after the source block's top-level ancestor in branch order. Inverse: exact restore. The UI must
confirm the destructive `delete` choice. A user who wants to delete a target subtree deletes the
block separately.

#### `branch.create` (extended)

Input:

```ts
{
  type: 'branch.create';
  branchId?: string;
  source: { blockId: string; anchorId?: string };
  targetBlockId: string;
  role: 'primary' | 'reference';
  atIndex?: number;
  label?: string;
}
```

Field names may keep M2's `sourceBlockId` plus an optional `sourceAnchorId` for compatibility; the
required semantics are the source port (block or anchor) and the explicit role.

Preconditions:

- source block and anchor exist; anchor belongs to source block;
- target exists; source block ≠ target; no self-branch;
- primary: target has no incoming primary; adding it would not create a primary cycle; if the target
  is a root, remove it from its chapter's top-level list (and respect the empty-chapter invariant);
- reference: cycles allowed; target home unchanged; no chapter/top-level mutation;
- duplicate exact source-target: focus existing, return a warning/existing ID, no second edge;
- order unique within `(port, role)`.

Effect: create the branch; for primary, remove the target from its top-level slot if it was a root;
for reference, nothing else. Inverse: for primary with a root target, exact snapshot restores the
chapter slot; for reference, remove only the branch. The command must not mutate block content,
anchors, or unrelated chapter order.

#### `branch.createFromSelection` (composite, proposal)

Input:

```ts
{
  type: 'branch.createFromSelection';
  blockId: string;                 // the block containing the selection
  kind: 'text' | 'formula' | 'code' | 'image';
  selector: AnchorSelector;
  binding: AnchorBinding;
  target: { kind: 'new'; content?: ContentNode } | { kind: 'existing'; blockId: string };
  role: 'primary' | 'reference';
  atIndex?: number;
}
```

Preconditions: the selection is inside one block; the binding/selector are valid; the target is
legal under the role rules; `role: 'reference'` requires an existing target (a new block always
gets a primary branch). Effect: reuse an exactly matching anchor or create one; if the target is
`new`, create a block; create the branch. One command, one inverse. Return `created.anchorIds` only
when the anchor was actually created; an existing reused anchor must not be removed by undo.

This is the command the UI uses for "Branch from selection" and "Link as reference from selection."
It avoids the three-undo-entry failure mode. If the Orchestrator prefers separate commands plus a
transaction wrapper, the same one-entry guarantee is required.

#### `branch.delete` (extended)

Input: `branchId`, optional `targetHandling: { kind: 'promote' } | { kind: 'delete-subtree' }`.
Preconditions:

- reference: `targetHandling` must be absent; delete the edge only; never delete the target.
- primary: `targetHandling` required. `promote`: target becomes a root and a top-level block after
  the source block's top-level ancestor (if the source is an anchor, after the source block's
  top-level ancestor). `delete-subtree`: delete the target and all its primary descendants,
  including anchored primary descendants (follow both direct and anchored branches), remove all
  incoming/outgoing branches and anchors; list external reference parents in the confirmation.

Effect/inverse: exact snapshot for multi-record changes; a simple reference delete can use a typed
inverse. No dangling branch or anchor.

#### `branch.reorder`

Any branch, including anchored primary and reference. Preconditions: branch exists; `toIndex` valid
within its `(port, role)` list. Effect: update fractional order only. Reference reorder never moves
blocks. Inverse: previous order key.

#### `branch.relabel`

Any role. Effect: set/clear `label`; inverse restores. No layout effect.

#### `branch.makeHome`

Input: `branchId`. Preconditions: branch is `reference`; target has an existing primary parent (if
root, see OD-7); source is block or anchor; explicit user action; promoting the edge must not create
a primary cycle (the new source block must not be the target or inside the target's primary
subtree). Effect:

1. The reference branch becomes `primary` (same branch ID, same source, same target).
2. The old primary branch becomes `reference` (same branch ID, same source, same target).
3. The target moves under the new primary source in outline/layout; its subtree moves with it.
4. Re-key the promoted branch's order at the end of its source port's primary list; re-key the
   demoted branch's order at the end of its source port's reference list.
5. Update chapter assignment if the target's root changes; enforce the empty-chapter invariant.
6. Recompute layout/pagination (M4); in M3, re-render the editor.

Inverse: exact snapshot of both branch records, orders, roles, target's chapter/top-level slot, and
the old/new parent chapters. Both relationships are preserved. One undo entry.

#### `branch.moveHere`

Input: `branchId`. Preconditions: branch is `reference`; explicit user action; target may have a
primary parent or be a root; promoting the edge must not create a primary cycle (the new source
block must not be the target or inside the target's primary subtree). Effect: promote the reference
to `primary` (same ID); delete the old primary edge (retired ID) if one exists; if the target is a
root, remove it from the chapter
top-level list; append the branch order at the end of the source port's primary list; update chapter
assignment; enforce empty-chapter. Inverse: exact snapshot restores the old primary edge with its
original ID, order, source, and chapter slot; redo re-applies. One undo entry.

#### `branch.demote`

Input: `branchId`. Preconditions: branch is `primary`; target exists. Effect: convert the edge to
`reference` (same ID); target becomes a root and a top-level block after the former top-level block
**in the source block's chapter**; re-key order in the source port's reference list; keep the link.
Inverse: exact snapshot restores primary role, order, and top-level slot. One undo entry.

#### `block.split` (M3f)

Input: `{ blockId, at: { nodePath: number[]; offset: number } }`. Minimum M3 support: split inside
a text leaf; atomic nodes (formula/code/image) move whole. Preconditions: caret is inside the block;
the split does not separate an atomic node from the text around it except at a node boundary.
Effect:

- content before stays in the original block; content after moves to a new block with a new ID;
- top-level original: new block becomes top-level immediately after it in the same chapter;
- non-root original: new block gets a primary branch from the same parent (if the parent is an
  anchor, from the same anchor), ordered immediately after the original;
- anchors entirely before stay in the original; anchors entirely after move to the new block and
  update `anchor.blockId`; anchor IDs and branch IDs stay;
- an anchor spanning the split keeps its ID, keeps the mark on the original side only, updates
  `lastKnown` if used, and is marked for repair (`split-inside-anchor`); its quote is **not**
  silently rewritten; its branch target stays;
- direct children of the original stay with the original; branches sourced from moved anchors move
  with them and update `branch.source.blockId` with the anchor's new `blockId`; branches sourced
  from the original block stay.

Inverse: exact snapshot restores content, IDs, anchors, branches, order, and chapter placement.

#### `block.merge` (M3f)

Input: `{ blockId, intoBlockId? }`; default previous sibling. Preconditions: same primary parent
**port** (same block or same anchor), or both top-level in the same chapter — cross-anchor and
cross-chapter merge is rejected in M3 (OD-11 covers the chapter case); no duplicate IDs. Effect:

- append the merged block's content to the surviving block;
- anchors from the merged block move to the surviving block and update `anchor.blockId`; anchor IDs
  stay; text marks are preserved by the content move;
- branches targeting the merged block: reference edges retarget to the surviving block; duplicate
  exact source-target branches are removed with a warning, keeping the earlier branch by order then
  ID; the merged block's incoming primary edge is removed (the surviving block already has its own
  primary home, and a second primary parent is invalid);
- branches sourced from the merged block retarget to the surviving block; duplicates are removed
  the same way; anchored sources keep their anchor ID and update `source.blockId`; if retargeting
  produces both a primary and a reference edge for the same source-target, keep the primary and
  drop the reference with a warning; any branch whose source and target become the same block is
  dropped with a warning (self-branch), never created as S→S;
- the merged block is deleted; its top-level slot is removed; its primary children become children
  of the surviving block, ordered after existing children, with their branch IDs preserved where
  possible.

Inverse: exact snapshot restores both blocks, all anchors, branches, orders, and top-level slots.

### 4.3 One user action = one undo entry

| User action | Internal steps | Undo entry |
|---|---|---|
| Create anchored child | `anchor.create` (if new) + `block.create` + `branch.create` primary | One composite command. |
| Branch from selection to existing block | `anchor.create` (if new) + `branch.create` | One composite command. |
| Create reference link | `anchor.create` (if new) + `branch.create` reference | One composite command. |
| Create block-level reference link | `branch.create` reference | One command. |
| Repair / relink anchor | remove old binding + apply new binding + replace selector | One `anchor.repair` command. |
| Attach branches to block | remove anchor/binding + retarget N branches + re-key | One `anchor.attachToBlock` command. |
| Delete anchor with branches | attach or delete N branches + remove anchor | One `anchor.delete` command. |
| Make home | role swap + two order re-keys + chapter/top-level changes | One `branch.makeHome` command. |
| Move here | role promotion + old primary delete + order/chapter changes | One `branch.moveHere` command. |
| Demote primary | role change + order re-key + top-level insertion | One `branch.demote` command. |
| Delete block with references | remove block/subtree + branches + anchors + external refs | One `block.delete` command; confirmation lists refs. |
| Split block | content split + new block/branch + anchor migration | One `block.split` command. |
| Merge blocks | content merge + branch retarget/dedupe + anchor migration | One `block.merge` command. |

If a Builder cannot implement a composite command, it must not ship the action as multiple undo
entries. The stop condition is: "the UI exposes one action; the undo stack shows one entry."

### 4.4 Inverse strategy

**M2 lessons applied.** The M2 review found that `block.move` undo recreated a branch with a new
ID, a cross-chapter `branch.create` inverse restored the target to the wrong chapter, and
delete/detach had no inverse. M2f fixed these with exact `structure.restore` snapshots, preserved
IDs/order/chapter slots, and dropped failed undo entries. M3 uses the same pattern for every
multi-record anchor/reference action and adds explicit ID, order-key, and chapter-slot assertions to
each inverse test.

Reuse the M2f pattern:

- **Typed inverse** for simple, record-preserving commands: `anchor.create` (remove binding/record),
  `branch.create` reference (remove edge), `branch.reorder` (old order), `branch.relabel` (old
  label).
- **Exact `structure.restore` snapshot** for commands that delete/repoint/re-key records:
  `anchor.repair`, `anchor.attachToBlock`, `anchor.delete`, `branch.makeHome`, `branch.moveHere`,
  `branch.demote`, `branch.delete` primary, `block.split`, `block.merge`, and any primary
  `branch.create` that removes a top-level slot or creates an anchored edge with a root target.
- Snapshots include full block records (where content changed), full anchor records, full branch
  records, exact chapter top-level lists, and `remove*` lists. They preserve IDs, timestamps,
  labels, order keys, and roles.
- Redo re-applies the exact command. If a snapshot has no `redoCommand`, the command layer derives
  the inverse by diffing pre/post state, as M2 does for move/branch-create.
- A failed undo/redo is dropped and reported (M2f N1); it must never leave a half-restored
  document or an orphan record.

### 4.5 Undo/redo sequences to test

**Routing guard.** Anchor content-mutating commands (`anchor.create`, `anchor.repair`, split, merge)
are structural entries. The M2f unified routing must undo later text edits first; a structural
snapshot must never silently discard text typed after the command. If the routing cannot guarantee
that, the undo must fail and report, not restore a stale block body.

Undo/redo restores focus to the affected block and, where possible, the anchor selection. If the
anchor no longer exists after undo, focus its former block; never leave focus on a removed node.

1. Type text → create anchored child → `⌘Z` removes the branch/block/anchor in one step → `⌘Z`
   undoes the typing.
2. Create anchored child → `⌘Z` → `⇧⌘Z` restores the same block, anchor, and branch IDs.
3. Repair a broken text anchor → `⌘Z` restores the old selector and binding → `⇧⌘Z` re-applies the
   repair with the same anchor ID.
4. Attach two branches to the block → one `⌘Z` restores the anchor, both sources, and their
   original order keys.
5. Make home → one `⌘Z` restores the old primary and reference roles, orders, and chapter slot.
6. Move here → one `⌘Z` restores the deleted primary branch with its original ID and order.
7. Delete a reference edge → target unchanged; undo restores the same edge ID.
8. Delete a primary edge with a reference parent → target becomes a root; undo restores the target
   under the old parent and the reference parent is still present.
9. Split a block with anchors on both sides and one spanning anchor → undo restores one block and
   all anchor records; the spanning anchor is not duplicated.
10. Merge two blocks with anchors and a duplicate reference → undo restores both blocks and the
    removed duplicate branch with its ID.
11. Save → continue editing → undo works within the session; reload starts a fresh history and
    the saved state is exact (AC-48).

### 4.6 Reload

- All IDs come from JSON; no regeneration.
- Anchor state is recomputed; no `resolved` flag is trusted.
- Undo history is session-only; reload clears it. The UI must not claim an undo is available after
  reload.
- If a load-time anchor is broken/ambiguous, it loads in that state; no modal, no auto-repair.
- If the document was saved while an anchor was broken, the branch/anchor record is still present.
- If an anchor mark has no record, it is inert; no phantom branch. Cleanup is explicit (repair or
  save cleanup) and must not delete content.

### 4.7 Command labels and failure behavior

Human-readable undo labels: "Undo Branch from “λ”", "Undo Link as Reference", "Undo Make Home",
"Undo Move Here", "Undo Repair Anchor", "Undo Attach Branches", "Undo Split Block", "Undo Merge
Blocks". The label names the user action, not the internal command.

On validation failure: no mutation, no partial binding, no new IDs, and a user-facing reason. If a
composite command fails halfway, it must roll back internally before returning; the command layer
must not expose a half-applied document.

---

## 5. Identity

### 5.1 Identity invariants

| ID | Invariant |
|---|---|
| **ID-1** | `block.id`, `anchor.id`, and `branch.id` are opaque, immutable, and never reused after deletion. Undo/redo restores the same IDs. |
| **ID-2** | An anchor ID is bound to exactly one block at a time. Split/merge updates `anchor.blockId`; it does not create a new anchor. |
| **ID-3** | A branch ID is bound to one source (block or anchor) and one target. Reorder/label/role changes keep the ID. A deleted branch ID is retired; undo restores it. |
| **ID-4** | A branch source anchor must belong to the branch's source block. Moving an anchor's block updates both together. |
| **ID-5** | Chapter membership is derived from the primary root: `chapter.id` for the root, and the root's `topLevelBlockIds` index. A block is never in two chapters. |
| **ID-6** | `order` is a fractional key unique within `(port, role)`. Reordering changes only the affected key; role changes re-key only the affected branch. |
| **ID-7** | A block's primary parent is exactly one branch or none. Reference edges never create a second home. |

### 5.2 Identity across operations

| Operation | blockId | anchorId | branchId | chapter slot | order key | Undo |
|---|---|---|---|---|---|---|
| Create anchored child | New, from command | New (or reused if the selection is an existing anchor) | New | Parent's chapter; not top-level | Appended at the anchor port | One composite; removes only records created by the action. |
| Create reference link | Unchanged | New if created from a selection; existing if reused | New | Unchanged | Appended at source port/reference | One; removes edge/anchor if created. |
| Create block-level child | New | n/a | New | Parent's chapter | Appended at block port | Existing M2 behavior. |
| Edit content | Unchanged | Unchanged | Unchanged | Unchanged | Unchanged | Editor-local; resolution recomputed. |
| Move/reparent block | Unchanged | Unchanged (moves with content) | Incoming primary edge may be replaced; outgoing branches unchanged | May change; exact slot restored on undo | New incoming key; outgoing keys unchanged | Exact snapshot (M2f pattern). |
| Move a target with an anchored primary edge | Unchanged | Parent anchor unchanged | Old anchored edge removed; new edge created | New parent's chapter | New key | Exact snapshot restores old anchored edge ID/order. |
| Reorder sibling | Unchanged | Unchanged | Unchanged | Unchanged | Only the moved branch's key | Typed inverse. |
| Repair anchor | Unchanged | Unchanged | Unchanged | Unchanged | Unchanged | Exact snapshot of selector/binding. |
| Attach branches to block | Unchanged | Removed | Unchanged; source changes to block | Unchanged | Re-keyed at block port, appended after existing | Exact snapshot. |
| Delete anchor with branches | Unchanged | Removed | Preserved (attach) or retired (delete) | Unchanged unless a primary branch delete promotes target | Re-keyed or removed | Exact snapshot. |
| Make home | Unchanged | Unchanged | Both branch IDs preserved; roles swap | Target may move chapter | Both re-keyed | Exact snapshot. |
| Move here | Unchanged | Unchanged | Promoted branch ID preserved; old primary ID retired | Target may move chapter | Promoted branch re-keyed | Exact snapshot restores old primary ID. |
| Demote primary | Unchanged | Unchanged | Same ID, role changes | Target becomes root/top-level after the former top-level block in the source chapter | Re-keyed at reference port | Exact snapshot. |
| Delete reference edge | Unchanged | Unchanged | Retired | Unchanged | Removed | Typed inverse/snapshot. |
| Delete primary edge | Unchanged | Unchanged | Retired | Target becomes root/top-level after source root | Removed | Exact snapshot. |
| Delete block | Removed | Removed with block | Removed if touching block/anchor | Removed; children promoted or deleted per choice | Removed | Exact restore of all records. |
| Split block | Original stays; new block ID | Unchanged; `blockId` updates for moved anchors | Outgoing anchored branches follow anchors; direct children stay | Original slot; new block after it | New branch key for the new block | Exact snapshot. |
| Merge blocks | Surviving keeps ID; merged removed | Unchanged; `blockId` updates | Retargeted; duplicate refs removed; IDs preserved where possible | Merged block's slot removed | Re-keyed at surviving block ports | Exact snapshot. |
| Undo/redo | Restored exactly | Restored exactly | Restored exactly | Restored exactly | Restored exactly | n/a |
| Reload | From JSON | From JSON | From JSON | From JSON | From JSON | History cleared. |

### 5.3 Order keys and chapter slots

- `order` values are fractional strings; the existing `fractional-order.ts` rules apply. New keys
  are generated relative to the destination port/role. A role change or port change re-keys only
  the affected branch; unrelated branches keep their keys.
- Anchored primary order is within the anchor port, independent of the block's direct children.
  Attaching branches to the block appends them after existing direct branches of that role, in
  their previous anchor order. This is visible in the outline: anchored rows become direct rows at
  the end.
- Reference order is within `(port, 'reference')`; it drives see-also order only.
- Chapter slot: a root's position is its index in `chapter.topLevelBlockIds`. When a block becomes a
  root, insert it after the former top-level ancestor (or after the former top-level block for a
  primary-edge deletion). When a root becomes a child, remove its slot. Undo restores the exact
  index, not "append".
- Cross-chapter moves update the target's chapter to the new parent's chapter; reference edges
  follow the block, not the chapter.
- The empty-chapter invariant from M2f applies to every M3 command that removes a top-level block:
  reject with an actionable message or require an explicit chapter operation. Reference edge
  creation/deletion never touches chapters, so it is exempt.

### 5.4 ID lifecycle

- **Creation:** command-generated IDs; the UI uses `created.*`, never a before/after diff (M2c/M2f
  desync lesson).
- **Reuse:** never reuse a deleted block/anchor/branch ID, even if the undo/redo stack is cleared.
- **Copy/paste:** pasted content must not duplicate an anchor ID. Two cases:
  - paste **inline/atomic content into an existing block**: strip `anchorIds` and show "Anchors are
    not copied"; the original anchors stay on the source;
  - paste **copied blocks as a new block/subtree**: treat it as duplicate subtree and remap internal
    anchor/branch IDs to new IDs (spec §5.2); external references are not copied.
  A paste that would duplicate an existing anchor ID is rejected before mutation if neither rule can
  apply.
- **Split/merge:** keep IDs; update `blockId`; never duplicate an anchor ID. A spanning anchor is
  clipped on the original side and flagged; the new side gets no second record.
- **Delete:** removing a block removes its anchors and all branches touching them. Removing an
  anchor requires attach/delete for its branches. Removing a branch only retires that branch ID.
- **Undo/redo:** restores the same IDs and order keys. A redo that would collide with an ID is
  rejected and reported; it must not create a second record.

### 5.5 Editor reconciliation

M2f proved that the editor and canonical document must not diverge. M3 anchor actions are structural
commands, not raw ProseMirror mark transactions:

1. The user selects a range/region.
2. The editor adapter converts the selection to a platform-neutral `AnchorBinding` (text node
   paths/offsets, formula node path/form/term, code node path/offsets, image node path/rect).
3. The active edit is committed first (existing M2 flush/commit path). If the commit fails, the
   anchor action aborts with no mutation.
4. The structural command is queued through the serial queue and applies the binding to the
   canonical block content.
5. The command result's `created` IDs and canonical content reconcile the editor. No local mark is
   applied optimistically.
6. If reconciliation fails, the app reports a typed error and does not leave a canvas-only anchor.
7. Reconciliation preserves the caret/selection where possible; if it cannot, it focuses the block
   and selects the new anchor marker. It must not silently move the caret to the end of the block.

For text marks, the adapter must map canonical text offsets to ProseMirror positions after
reconciliation. If the mapping is ambiguous (e.g., the content changed during commit), abort with a
message and keep the selection; do not guess.

---

## 6. Anchored callouts

### 6.1 Creation flows

**Text**

1. Select a non-empty range inside one block.
2. A floating selection toolbar offers **Branch**; the command palette and context menu offer the
   same action. Keyboard: `⌘⇧Return` per UX F5 (pending confirmation against the M2 keymap).
3. If the selection resolves to exactly the same span/region as an existing anchor, reuse that
   anchor; otherwise create a new anchor. A subrange or partial overlap is a new anchor, not a
   reuse of the larger one.
4. Create a new block and a primary branch from the anchor. The child is placed below the anchor,
   the caret is in the child, and the callout shows the quote.
5. One undo entry removes the branch, block, and (only if newly created) the anchor.

**Formula**

1. In the formula editor, select a term substring or the whole formula.
2. **Branch** creates a whole-formula anchor (node binding) or a term anchor (selector).
3. The callout appears below the formula node. A term anchor uses the best-effort term rectangle;
   if unavailable, the formula rectangle with the quoted term in the chip. The branch remains
   semantically anchored to the term.
4. Invalid LaTeX is preserved; the marker stays on the formula node; the callout is still
   associated.

**Code**

1. In a code block, select a token or range (or the whole block).
2. **Branch** creates a code anchor with quote/context/offsets. The range is highlighted with a
   gutter dot; the callout is below the code block.
3. Edits outside the range keep the anchor; removing the quoted code breaks it; repair offers
   candidate lines/tokens or a new selection.

**Creation-time ambiguity.** If a formula term or code quote is not unique in its block at creation,
the anchor is still created (the user selected a specific occurrence), but it is immediately
**ambiguous**: the selected occurrence is a candidate, the callout uses the block warning point, and
the UI warns. The user confirms a candidate or re-anchors; there is no silent auto-resolve. Text
anchors are different because the mark binding is exact even when the quote repeats.

**Image**

1. Select an image node; the toolbar offers **Add Region**.
2. Drag a rectangle (or `⌥`-drag for a point). On release, choose **Branch from region** or
   **Cancel**.
3. The region gets a numbered marker; the callout is below the image block.
4. A second region on the same image is allowed; each anchor has its own ID and `anchorIds` entry.

### 6.2 Placement

**Editor (M3).** The editor uses a **callout lane**:

```text
┌──────────────────────────────────────────────┐
│ parent card                                  │
│   … anchored text … ●                        │
└──────────────────────────────────────────────┘
   ↳ “λ”   ┌──────────────────────────────┐
           │ callout block (child)        │
           └──────────────────────────────┘
   ↳ “Av”  ┌──────────────────────────────┐
           │ second callout               │
           └──────────────────────────────┘
           ┌──────────────────────────────┐
           │ direct child group (right)   │
           └──────────────────────────────┘
```

- The callout lane is below the parent card and before the direct-children group. "Below the
  anchor" means below the anchor's block (the card bottom), with the callout's left edge aligned to
  the anchor; it does not mean inside the card immediately under the span. This matches the layout
  engine's `calloutCursor` and prevents a callout from overlapping its parent block. This is an
  editor projection, not canonical structure: the document still has one block with primary
  children; the adapter separates anchored primary branches from direct primary branches only for
  rendering.
- Each callout row is left-aligned to its anchor's measured left edge where possible; if the
  anchor is too far right to fit the minimum callout width, clamp to the card content left and
  keep the connector dot.
- Multiple callouts from one anchor stack vertically in branch order. Callouts from different
  anchors are ordered by the anchor order key (§2.4/DD-3) and never overlap.
- Direct children start below the callout lane, matching the layout engine's `calloutCursor`
  behavior and avoiding overlap. The primary edge router must account for the lane offset; it keeps
  the parent→child direction and never loops backwards across the parent.
- A callout's own primary subtree is laid out with the normal child rules; nested callouts recurse.
- The callout is a normal block card: editable, collapsible, branchable. Its header shows the quote
  chip and status.
- A dotted leader connects the anchor dot to the callout's top-left; it is decorative and
  `aria-hidden`.

**Page/PDF (M4 contract).** The layout engine already places anchored callouts below their anchors
(`packages/layout/src/layout.ts` anchored-first placement). M4 must consume the M3 resolver and
callout order; it must not add a second anchor model. AC-52's 2 px alignment is an M4 gate.

### 6.3 Geometry contract

| Anchor kind | Editor marker | Callout origin | Fallback |
|---|---|---|---|
| Text | Union of the marked range's line rects; dot at the right edge of the last line. | Anchor rect left/top; below the anchor. | Warning point at block top-right. |
| Formula whole | Formula node rect; dot at the right edge. | Formula right/below. | Formula node rect if the exact anchor is unavailable. |
| Formula term | Best-effort term rect from rendered KaTeX; dot at the term. | Term rect if available; otherwise formula rect. | Formula rect + quote chip. |
| Code | Range rect; gutter dot at the first line. | Code node/range left below. | Code block rect. |
| Image region | Normalized rect scaled to the display; numbered circle at the region corner. | Region left below; point uses a marker. | Image rect / placeholder. |
| Broken/ambiguous | Warning icon at the block warning point. | Block warning point, labeled "anchor lost" / "N matches". | Block itself. |

All geometry is derived at render time and recomputed after content/layout changes. Nothing is
stored in the document. `lastKnown` may be used only for a repair preview.

### 6.4 Marker, selection, and keyboard

- Anchor mark: subtle dotted underline + dot; quieter than a highlight (UX 10.4). Broken:
  amber warning segment + "Lost anchor" chip. Ambiguous: warning dot + "N matches" chip.
- The marker is a real button when the block is selected (not while editing), with
  `aria-label="Anchor: “λ”, 2 branches"`. Click selects the anchor; a second click cycles its
  branches. `Enter` selects the first branch; `⌥Enter` cycles; `Delete` deletes the selected branch
  (with confirmation rules). These keys are proposals for UX confirmation; the gate requirement is
  a keyboard path that is not mouse-only.
- Selecting an anchor highlights the span and its branch. In the outline, selecting an anchor row
  highlights the quote and the target.
- The anchor marker must not create a tab stop during text editing; it is reachable when the block
  is selected or from the block menu/inspector/health panel.
- Every pointer action has a menu/command-palette equivalent (UX D13).

### 6.5 Outline order

The order is ratified (D3) and shared by sidebar, outline, reader, page, and PDF:

1. Emit the block.
2. Emit its **anchored primary children**, ordered by anchor start position, then anchor ID; within
   one anchor, by branch order.
3. Emit its **direct primary children**, ordered by branch order.
4. Never recurse through reference edges.

**Order-key definition.** Use the pre-order index of the block child that contains the anchor start,
then: the inline text offset in Unicode code points for a text anchor; `latexStart` for a formula
term or `startOffset` for a code range (both Unicode code points); the atomic node's pre-order index
for a whole formula/image/whole code block; and for an image region, the normalized rect top-left
(y, then x). Compare lexicographically; tie-break by anchor ID. This is a content-order key, not a
pixel position, so it is stable across views and platforms.

**Broken/ambiguous ordering (DD-3).** Use the resolved start position if available; otherwise
`lastKnown` start if present; otherwise end-of-block; then anchor ID. This puts unresolved callouts
after resolved ones but before direct children, deterministically. It is not a visual guess; it is
the only stable order when there is no span.

**UX conflict C1:** `docs/ux.md` §8.5 currently says the opposite ("after unanchored children").
The spec/D3 order is authoritative; the UX line must be fixed.

**Outline row anatomy.** Anchored rows use the same indentation as direct children, prefixed with
`↳ “quote”`; a thin left rule groups siblings that share an anchor. The row shows the callout's
label/first line, branch count, and status. The source block row shows an anchor-count chip and, if
any, a broken/ambiguous warning chip. Reference edges are chips, not rows.

### 6.6 Multiple, nested, and overlapping anchors

- **Multiple anchors in one block:** allowed; order by start position then ID; callouts stack.
- **Overlapping anchors:** allowed; each anchor keeps its own ID and mark entry. The same text run
  can carry multiple IDs in `anchorIds`. Callout order is deterministic; a callout may share an
  anchor left edge with another and stack vertically.
- **Same start position:** tie-break by anchor ID.
- **Nested callouts:** a callout block can have its own anchored children; layout recurses.
- **Two callouts from one anchor:** allowed; stack in branch order; each has its own branch ID.
- **Callout with a direct child:** the callout is a normal block; its direct children go to the
  right/wrapped as usual, below its own callout lane.

### 6.7 Collapse, focus, and navigation

- Collapsing a block hides its anchored callouts and their subtrees with the rest of its primary
  descendants; the hidden count includes them (spec §7.6). Expanding restores.
- Focus mode dims unrelated blocks; callouts of focused blocks stay visible.
- Navigating to a hidden callout (reference chip, search, anchor health) expands ancestors and
  focuses it. This is view state, not a document edit.
- Clicking a callout focuses the block; clicking its quote chip selects the anchor on the parent.
- Reference edges do not force a collapsed target to expand; the chip reveals on navigation.

### 6.8 Broken and ambiguous callouts

- The callout remains visible and editable; its origin is the block warning point, not a guessed
  span.
- Header shows `Lost anchor` or `N matches`; the connector is dashed amber.
- The target block is never deleted, moved, or duplicated by anchor failure.
- The callout's own children remain under it; a broken anchor does not change the target's primary
  structure.
- Repair moves the connector back to the span; the callout does not change ID or position in the
  outline order except as the new anchor position dictates.

### 6.9 Editor/layout parity

M3 and M4 must agree on:

- anchor order key;
- anchored-first outline order;
- callout lane before direct children;
- broken/ambiguous fallback to the block warning point;
- no callout for reference-only anchored edges;
- no duplicate target placement.

M3 implements the editor's CSS/measurement approximation; M4 consumes the pure layout engine. The
shared contract is the resolver and order key, not the pixel geometry. Any divergence in order or
state is a defect, even if the M3 editor has no page breaks.

---

## 7. Reference edges

### 7.1 Roles

| Role | Structural effect | Layout effect | Cycle | Delete edge |
|---|---|---|---|---|
| **primary** | One home; drives outline, layout, pagination; target is a child/anchored child. | Yes. | Forbidden. | Target becomes root/top-level; subtree intact. |
| **reference** | Associative only; target keeps its home; see-also/referenced-by. | **None.** | Allowed. | Target unchanged. |

A reference branch may be sourced from a block or an anchor. An anchored reference edge does not
create a callout; it shows a dashed edge from the anchor dot (or warning point) and a see-also chip.
A block with reference parents but no primary parent is a **root**: it appears in a chapter's
top-level list and is laid out there. References never create a primary home.

### 7.2 Create from block or anchor; defaults

| Situation | Default | Alternatives | Notes |
|---|---|---|---|
| Branch to a **new** block | Primary | — | "Expand here." |
| Branch to an existing **root** | Add as child (primary), remove from chapter top-level | Link as reference only | D4. Enforce empty-chapter. |
| Branch to the **only root of a chapter** | Add-as-child is rejected by the empty-chapter invariant | Link as reference; add another block first; cancel | No mutation; clear message. |
| Branch to a block with a **primary home** | Reference | Move here; Make home (after a reference exists) | D4. |
| Branch to self | Reject | — | Both roles. |
| Branch to an ancestor (primary) | Reject with "would create a cycle" | Link as reference | Reference is allowed unless self. |
| Duplicate exact source-target | Focus existing edge | — | No second edge (role-independent recommendation). |
| Multi-block selection | Reject with "Anchors work within one block" | Branch from first/last block | AC-15. |

The command takes an explicit `role`; the UI applies the default. The command never silently
converts a requested primary to reference unless the UI explicitly asked for the default rule. A
failed primary (target has a home) returns a typed error so the UI can show the role popover.

### 7.3 See also / Referenced by

- **Source block or anchor:** shows "See also" for each outgoing reference target, with the target
  label/first line and chapter. M4 adds the derived page number when available.
- **Target block:** shows "Referenced by" for each incoming reference source, with the source
  label and chapter; if the source is an anchor, show the quote. A compact `Shared · N` chip in the
  outline row summarizes N incoming reference branches and opens the referenced-by list.
- Chips are visible in the outline row, the block card header/footer, and the block menu. They do
  not create outline rows or cards.
- Clicking a **See also** chip focuses the referenced target and highlights the source; clicking a
  **Referenced by** chip focuses the referring source and highlights the target. Both push
  navigation history; back returns.
- Reference cycles show each direct edge once; no recursive expansion. A→B→A yields one chip on
  each side.
- Labels: if `branch.label` exists, show it after the chip ("See also: Eigenvalue equation ·
  also uses"). No hover-only requirement.
- Page numbers are M4; M3 uses chapter/label. Do not store a page number in the branch.

### 7.4 Make home, move here, demote

| Action | Preconditions | Result | Identity |
|---|---|---|---|
| **Make home** | Reference edge; target has a primary parent. | Reference becomes primary; old primary becomes reference; target moves under the new parent. Both relationships preserved. | Both branch IDs preserved; orders re-keyed. |
| **Move here** | Reference edge; target may have a primary parent or be a root. | Reference becomes primary; old primary edge is deleted; target moves. Old parent loses the link. | Promoted branch ID preserved; old primary ID retired and restored on undo. |
| **Demote** | Primary edge. | Edge becomes reference; target becomes a root/top-level after the former top-level block in the source chapter; link kept. | Same branch ID. |

All three are explicit commands, never drag-only. They are one undo entry and update chapter
assignment and pagination (M4). They are the only reference-related actions that change layout;
pure create/delete/reorder reference edges must not. Both make-home and move-here must reject a
promotion that would create a primary cycle (for example, a reference from a child back to its
ancestor); the reference edge remains and the UI explains why.

**Cycle guard test.** A primary parent A → B, plus a reference B → A. "Move here" on B→A must fail
before mutation because A is an ancestor of B; "make home" likewise. The reference remains; no block
moves; the error is actionable. This is AC-04 under a role transition, not just branch creation.

**Root target (OD-7).** If the target has no primary parent, "make home" is ambiguous (it is
already a root). Recommendation: disable "make home"; offer "Move here" or "Add as child." If the
product owner wants "make home" to mean "attach to this reference source," it is equivalent to
"move here" and should use that label.

### 7.5 Cycles

- Reference cycles are allowed. Example: A → B (reference), B → A (reference).
- Outline/layout/PDF traverse primary edges only; they terminate and never recurse through
  references.
- See-also lists direct edges only; no transitive closure, no infinite list.
- Edge routing draws both dashed edges if both endpoints are visible; no arrowhead recursion.
- A cycle that also contains a primary edge is impossible by the primary acyclicity rule; the
  command rejects it before mutation.
- Deleting one edge in a cycle leaves the other and the blocks intact.

### 7.6 Deletion and shared-child lifecycle

| Event | Required behavior |
|---|---|
| Delete a **reference edge** | Remove only the edge; target content, home, anchors, subtree unchanged. Undo restores the same edge ID. |
| Delete a **primary edge** | Target becomes a root and a top-level block after the source's top-level ancestor; reference parents remain; subtree and anchors intact. |
| Delete a **block** (promote children) | Remove the block, its anchors, outgoing branches, and incoming branches; promote its primary children to its primary parent in the deleted block's sibling position (if the parent is an anchor, they become anchored children from that anchor), or make them top-level blocks after the deleted block if it was top-level. **Promotion includes anchored primary children** whose source anchor is inside the deleted block: reattach their target blocks to the deleted block's parent (or top level) instead of dropping the branch with the anchor. External reference parents are listed in the confirmation and their incoming edges removed. No dangling edges and no unreachable anchored child. |
| Delete a **block** (delete subtree) | Delete the block and **all** primary descendants, including anchored primary children (follow both direct and anchored primary branches); remove all touching branches/anchors; list external reference edges that will be removed; target blocks outside the subtree are not deleted. A subtree walk that ignores anchored branches would leave unreachable children. |
| **Shared child** primary parent deleted | The child becomes a root/top-level after the former top-level block; reference parents remain; the child and subtree are unchanged; it appears once at the new top-level position. |
| **Shared child** deleted | All incoming primary and reference edges are removed; if external reference parents exist, the confirmation lists them. |
| **Collapse** an ancestor of the shared child | The child is hidden at its primary home; reference chips from visible blocks still resolve and can reveal/expand it. No duplicate is created. |
| **Move across chapters** | The target moves with its primary home; reference edges follow by ID; chips update chapter/page context; no edge mutation. |
| **Primary parent reparented** | The shared child moves with the parent's subtree; its own primary edge is unchanged; pagination recomputed. |

### 7.7 Dedupe

- Recommended key: `(source.blockId, source.anchorId ?? '', targetBlockId)` — **role-independent**
  (spec I8). If an edge exists, focus it; do not create a second edge with a different role.
- Different anchors in the same block are different sources and may target the same block.
- The command returns the existing branch ID and a `duplicate-branch` warning; the UI pulses the
  existing edge.
- On load, if both a primary and a reference edge with the same source-target exist (legacy/drift),
  keep the primary edge and drop the reference duplicate with a warning; never create two homes.

### 7.8 Proof that reference edges never affect layout/pagination

**Structural argument.**

1. Layout input is page setup, chapters, top-level order, **primary** branches, block content,
   resolved anchors for primary blocks, and collapse state (spec §7.1).
2. `packages/layout/src/document.ts` builds `primaryParentMap`/`primaryChildrenMap` from branches
   with `role === 'primary'`; reference branches are returned by a separate `referenceBranches`
   helper and are not used by `validateDocument` or the layout traversal.
3. Reference branch creation/deletion/reorder never touches `chapters[].topLevelBlockIds`, block
   records, primary branch records/orders, anchors, or content. Only the `branches` map and
   `revision` change.
4. Reference `order` is in a separate `(port, 'reference')` namespace, so it cannot perturb primary
   order.
5. Anchored reference edges do not create callouts; the callout list is derived from primary
   branches only.
6. The outline/export traversal starts at each chapter's top-level blocks and follows primary
   branches only; it never visits a reference edge.
7. Role-changing commands (`makeHome`, `moveHere`, `demote`) do change layout because they change
   the primary edge. They are not pure reference operations and are tested separately.

**Differential tests.**

- `layout(D)` deep-equals `layout(D + ref)` for blocks, pages, continuations, and primary edges;
  the reference-edge list differs only.
- Add a reference cycle; assert no recursion, same block/page count, same positions.
- Add a reference edge from an anchor; assert no callout, same block positions.
- Add/remove/reorder reference edges; assert `chapters`, top-level lists, and branch primary orders
  are byte-identical.
- `outline(D)` and `exportManifest(D)` are identical with and without reference edges.
- A reference edge to a block on another page/chapter: no layout change; chip only.
- A reference edge whose target is collapsed: no layout change; chip reveals on navigation.

If any of these fail, it is a defect, not a tolerance.

### 7.9 Ordering, labels, and navigation

- Reference order is creation order by default; `branch.reorder` may change it; the see-also list
  sorts by `order`, then branch ID.
- Labels are optional; a label is shown in the chip and on the edge when selected/hovered.
- Navigation: click chip → focus target; highlight source; back returns. If the target is in
  another chapter, switch/scroll to it; if hidden, expand ancestors. No page number in M3.
- Edges: dashed, distinct from primary; routed only after node placement; no layout feedback. If
  both endpoints are visible, draw a dashed orthogonal route; otherwise show the chip only. This is
  an M3 UX proposal (OD-9) because AC-26 is M4.
- Accessibility: chips are real buttons/links with labels; the edge is `aria-hidden`; the
  "Referenced by" list is available in the block menu/inspector equivalent, not only spatially.

---

## 8. Broken, ambiguous, and repair

### 8.1 States and detection

| State | Trigger | Detection |
|---|---|---|
| resolved | Exact binding or unique fallback. | On create/load/edit. |
| ambiguous | Multiple candidates. | On load/edit/repair preview. |
| broken | No candidate. | On load/edit/image asset change. |
| idle | Anchor exists, no branch. | On branch delete/attach. |
| block-missing | Anchor's block missing. | Load validation/recovery. |

Triggers are listed in §3.6. State must be correct before save and export; UI updates may be
debounced.

### 8.2 Visible states

| State | Block | Callout | Outline | Health |
|---|---|---|---|---|
| resolved | Dotted underline/dot. | Normal, quote chip. | `↳ “quote”`. | Not listed. |
| ambiguous | Warning marker + "N matches". | Warning origin at block; dashed amber leader. | `Lost anchor? N matches` chip. | Listed with candidates. |
| broken | Warning marker + "Lost anchor". | Warning origin at block; target visible. | `Lost anchor` chip + Reattach. | Listed. |
| idle | Optional subtle mark or hidden. | None. | No row. | Not listed; optional cleanup. |
| block-missing | No marker possible. | None. | No row. | Listed as load error. |

No color-only meaning: icon + text + line style. Dark and light themes use the same hierarchy
(UX §10.9, spec §6.8).

### 8.3 Whole-block fallback

- A broken/ambiguous anchor's callout attaches to the block's warning point (e.g., top-right), not
  to a guessed span.
- The fallback is a **visual origin change only**: `anchor.blockId`, selector, branch source, and
  target are unchanged. Repair restores the span; the branch and target stay.
- The block's own content is never rewritten to insert a fake mark or placeholder.
- The callout remains editable and retains its children.
- If the block is deleted, the anchor/branches are deleted with it (explicit delete); a broken
  anchor alone never deletes the block.

### 8.4 Anchor health panel

M3 needs a repair surface without building the M2-deferred full inspector. Proposal:

- A status-bar chip: `2 anchors need repair` (broken + ambiguous count). Hidden when zero.
- Clicking opens a sheet/dialog listing every broken/ambiguous anchor:
  - block label, chapter/path (page number when M4);
  - stored quote/context and kind;
  - branch target(s) and roles;
  - reason (`text-deleted`, `quote-missing`, `multiple-matches`, `asset-changed`,
    `node-missing`, `split-inside-anchor`, `selector-mismatch`, `block-missing`);
  - last-known position if available (repair hint only);
  - actions: Relink to selection, Choose candidate, Attach branches to block, Delete branch(es),
    Delete anchor, Keep broken/Close.
- The sheet is keyboard reachable and not a modal on load. Broken anchors do not block saving or
  export.
- The sheet lists broken/ambiguous anchors by default; an **All anchors** filter includes idle
  anchors with a **Remove anchor** action (for OD-2 option A).
- For large counts, the sheet filters by status/kind/block and sorts by block/order; there is no
  bulk auto-delete and no "fix all" that guesses.
- A block's warning marker also opens the sheet focused on that anchor.
- The sheet is not a permanent right inspector (ADR-0004 M2 shell). A later inspector can reuse the
  same data.

This is a UX proposal (OD-10); the gate is AC-22's list/relink behavior, not the surface shape.

### 8.5 Repair flows

**Relink to selection**

1. Choose "Relink to selection"; the sheet closes or docks; the block enters relink mode.
2. Select a new range/region in the same block. Multi-block selection is rejected.
3. The dialog shows before/after: old quote/context vs new quote/context; for formula/code, old/new
   source and occurrence; for image, old/new region on the image.
4. Confirm → `anchor.repair`; cancel → no mutation.
5. The anchor ID, branch IDs, labels, and targets are unchanged. The callout moves to the new span;
   outline order updates by the new anchor position.

**Choose candidate**

1. Ambiguous anchors list candidates with context (quote/prefix/suffix, formula occurrence, code
   line, image preview).
2. Selecting a candidate previews the span; Confirm applies the same `anchor.repair` with the
   candidate selector.
3. No candidate is auto-applied; closing keeps the ambiguous state.

**Attach branches to block**

1. Confirmation lists each branch, role, target, and label.
2. Confirm → `anchor.attachToBlock`; the anchor is removed; branches keep IDs and targets; they
   append after existing direct branches of that role.
3. Undo restores the anchor and anchored sources/order.

**Delete branch / Delete anchor**

- Delete branch: reference edge removed only; primary edge makes the target a root/top-level; large
  subtree confirmation per UX §11.5. Undo restores.
- Delete anchor: requires attach or delete branches; destructive confirmation; target blocks are
  never deleted. One undo entry.
- "Keep broken" dismisses the repair prompt for the session, not the marker; it does not mutate the
  document and does not hide the export marker.

### 8.6 Confirmation policy

| Situation | Confirmation |
|---|---|
| Exact unique binding resolves on load | None; silent. |
| Ambiguous candidate | Explicit; before/after preview. |
| Relink to a new selection/asset | Explicit; before/after preview. |
| Attach branches to block | Explicit; list branches. |
| Delete reference edge | Undo toast; no modal. |
| Delete primary edge | Confirm if the target has a large subtree; otherwise undo toast. |
| Delete anchor with branches | Explicit; choose attach/delete. |
| Delete branch(es) from anchor | Explicit if destructive; undo. |
| Broken anchor on load | No modal; warning + status chip only. |
| Broken anchor on export | No block; marker + optional appendix (M4 PDF). |

### 8.7 No silent data loss

- Repair commands never delete a target block.
- Anchor/branch deletion requires an explicit command and confirmation.
- Load validation never drops a broken anchor or quarantined branch silently; it reports and
  preserves.
- A mark without a record is inert; a record without a mark is broken/repairable; neither creates a
  phantom branch. M3 does not auto-clean orphan marks on save (no hidden content mutation); cleanup
  is an explicit repair/cleanup command.
- Deleting a block removes its anchors/branches, but the confirmation lists external reference
  parents and the undo restores everything.
- A repair failure leaves the previous selector/binding intact and reports why.

### 8.8 Export exactly once (M3 manifest; M4 PDF)

M3 adds a pure export manifest:

```
buildExportPlan(document):
  for each chapter in order:
    for each top-level block in chapter order:
      emit block once
      emit anchored primary children (anchor order, branch order)
      emit direct primary children (branch order)
      recurse
  attach anchor state markers for broken/ambiguous anchors
  ignore reference edges
```

Tests:

- every primary block appears exactly once;
- every shared child appears at its primary home only;
- reference cycles add no entries;
- broken/ambiguous anchors add a marker/annotation record but no duplicate target;
- a reference-only root is included via its chapter;
- the manifest is identical with and without reference edges;
- the manifest is deterministic across repeated runs.

This is the M3 evidence for AC-56's "exactly once." M4 verifies the PDF marker and page count. The
gate split is OD-5.

### 8.9 Load and recovery

- Full anchor scan on load. If an anchor record is invalid (missing block/selector), the document
  opens with a warning/recovery state; the anchor/branch is preserved and listed.
- If the branch target is missing, quarantine the branch and show a load warning; do not silently
  ignore it (I2).
- If the document is newer/read-only, anchor states still resolve for display but no repair command
  is allowed.
- A corrupt document uses the existing M2 recovery surface; anchor data is not discarded by the
  loader.
- Migration/recovery runs a full scan and must not rewrite selectors.

---

## 9. Effects on outline, reader/editor, page view, and PDF

### 9.1 Outline and sidebar

- Outline order is the ratified D3 traversal: block, anchored primary children by anchor order, then
  direct primary children by branch order.
- Anchored rows are visually distinct (`↳ “quote”`), same indentation, grouped by anchor.
- Reference edges are chips ("See also", "Referenced by"), not rows.
- Broken anchors show `Lost anchor`/`N matches` chips; the target row remains.
- A shared child appears once, at its primary home; reference contexts show chips.
- The sidebar topic tree uses the same traversal and order; it is not a second structure. If the
  sidebar is collapsed/limited in M2, M3 still adds anchored rows and chips so canvas/sidebar
  parity holds.
- Collapse hides descendants/callouts and shows a count; the outline always shows the full tree when
  not collapsed.

### 9.2 Editor / continuous reader

- M3's editor is the continuous branch editor (M2 shell). Anchored callouts use the callout lane
  (§6.2). Reference edges are dashed if both endpoints are visible; chips otherwise.
- Anchor markers are overlays/buttons, not content nodes. They never capture text selection except
  when the user clicks the marker.
- Only one active editor. Creating/repairing an anchor commits the active edit first; no second
  editor.
- Collapse hides callouts and their subtrees; focus/navigation reveals.
- The editor's layout is still CSS flow, not the M4 page engine; the callout order and fallback are
  shared, pixel geometry is not guaranteed until M4.

### 9.3 Page view / PDF (M4 contract)

- The paginator consumes the same document, primary branches, and anchor resolution. It already
  places anchored callouts first and ignores reference branches for placement.
- M4 must:
  - use the M3 resolver/order key, not a second resolver;
  - draw anchored callouts below their anchors; continuation markers at safe boundaries;
  - draw primary arrows solid, reference arrows dashed, anchored arrows from the anchor dot;
  - include every primary block exactly once; reference edges never duplicate;
  - show broken/ambiguous markers and the optional appendix;
  - not cut a line/image/formula/code line/table row;
  - keep page count deterministic.
- AC-52 (2 px alignment), AC-26 (reference arrows/routing), AC-28 (safe continuation), and AC-56
  (PDF export) are M4 gates. M3 carries the data and manifests they need.

### 9.4 Selection, focus, and navigation

- One focused block across views; anchor selection is a sub-selection within the focused block.
- Selecting an anchor highlights the span and its branch; the target is not focused until the user
  follows the branch.
- Following a branch focuses the target and highlights the source anchor/edge; following a
  "Referenced by" backlink focuses the source and highlights the target. Back returns.
- Following a broken anchor opens the health panel with repair actions (spec §6.5).
- A hidden target reveals by expanding ancestors; view state only.
- Switching views preserves anchor selection where possible; if the anchor is not visible in the
  target view, focus the block and keep the anchor in the breadcrumb/health.

### 9.5 Accessibility

- Anchor markers are focusable buttons with labels; they are not solely hover-dependent.
- The outline is the accessible structure: anchored rows, reference chips, broken/ambiguous states,
  and branch roles are readable by VoiceOver.
- The callout lane is DOM order: parent, anchored callouts, direct children; screen-reader order
  matches reading order.
- Warning states use icon + text, not color alone.
- The health panel is a dialog with a focus trap and returns focus to the warning marker/status chip.
- Reference chips are links/buttons with an accessible name including the target label and role.
- Keyboard: `⌘⇧Return` branch from selection (proposal to confirm), `⌘⇧L` link reference (UX),
  anchor marker `Enter`, cycle `⌥Enter`, repair via menu/health panel. No core action is mouse-only.

### 9.6 Performance

- Resolution target: 1,000 anchors < 100 ms on load; incremental per block after edit (spec §14.2).
- Editor marker measurement only for visible blocks; debounce 100–200 ms; no per-keystroke full
  document scan.
- Callout lane measurement after layout; avoid measure→position→measure loops; use
  `ResizeObserver`/`requestAnimationFrame`, clamp widths.
- Reference edges add routing work only for visible edges; no layout work.
- 300 blocks remain the guaranteed target; 1,000 usable with collapse/LOD. M3 must not regress the
  M2 numbers.

---

## 10. Acceptance matrix

The M3 gate is AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58 (`docs/plan.md` M3). AC-77 is
included as a related criterion because it is the general broken-anchor fallback; it is not in the
M3 gate list but M3e covers it.

Legend: **M3** = must be demonstrated in M3; **M3 manifest** = M3 proves the data/manifest, M4
proves the visual/PDF; **M4** = design contract only.

**Source check.** The gate list is cross-checked against the spec groups and `docs/plan.md` M3:

| Spec group | ACs | In M3 gate? |
|---|---|---|
| §15.1 Model and structure | AC-03, AC-04, AC-05, AC-06, AC-07 | Yes |
| §15.2 Authoring, outline, views | AC-10, AC-12, AC-15 | Yes |
| §15.3 Anchors | AC-16–AC-22 | Yes |
| §15.10 Anchor policy | AC-54, AC-55, AC-56, AC-57 | Yes (AC-56 split: M3 manifest, M4 PDF) |
| §15.10 related | AC-77 | No; covered by M3e as the general fallback |
| §15.11 Shared-child lifecycle | AC-58 | Yes |

| AC | Concrete behavior | Slice | Test strategy / evidence | Gate |
|---|---|---|---|---|
| **AC-03** | A block never has two primary parents. A second branch to a block with a home is a reference by default; explicit move is the only way to reparent. | M3a/M3d | Core command matrix: primary second parent rejected; reference created; moveHere/makeHome roles; e2e role popover. | M3 |
| **AC-04** | A primary cycle is rejected before mutation with an actionable message; a reference cycle is allowed and outline/PDF do not recurse. | M3a/M3d | Core cycle matrix (branch create and make-home/move-here role transitions); outline/export traversal depth/count; e2e A↔B reference; layout differential. | M3 |
| **AC-05** | Shared child: one instance, one primary home, at least one reference parent; appears once in outline/editor/PDF; see-also; deleting the reference leaves the primary structure unchanged. | M3d | Fixture `shared-child`; outline/manifest count; e2e create ref/delete ref; layout differential. | M3 |
| **AC-06** | Delete a block with children: promote and delete-subtree both work; no dangling branch/anchor; external reference parents are listed. | M3d | Core delete matrix (with refs/anchors); e2e confirmation lists refs; reload validation. | M3 |
| **AC-07** | Reparent, outdent, and reorder preserve subtree, anchors, and outgoing branches; undo restores the prior structure. | M3a/M3f | Core move matrix with anchored child/target and outgoing branches; undo/redo exact IDs/order; e2e move + undo. | M3 |
| **AC-10** | An anchored child appears as a marked callout below its anchor with the quote visible; order is deterministic; adaptive wrap is M4. | M3b/M3c | Editor DOM: callout top below anchor marker, order by anchor position then ID, quote chip; screenshot; outline order. | M3 (editor) / M4 wrap |
| **AC-12** | "See also" and "Referenced by" links are visible and navigable; no duplicated content or outline rows. | M3d | E2e chips, click focus/back; outline row count unchanged; cycle chips; accessibility name. | M3 |
| **AC-15** | A multi-block selection for an anchored branch is rejected with a clear message; no partial anchor. | M3b | Editor selection unit: cross-block selection disabled; e2e error copy; no new anchor/branch in document. | M3 |
| **AC-16** | Text anchor survives edits before, inside, and after the span; highlight tracks the text. | M3a/M3b | Resolution matrix after content mutations; e2e insert before/inside/after; marker rect follows. | M3 |
| **AC-17** | Deleting the anchored text leaves branch/target intact, marks broken, offers repair; no silent deletion. | M3b/M3e | Core delete-span matrix; e2e delete text → warning → repair; target still once. | M3 |
| **AC-18** | Split moves anchors after the split and updates block; a spanning anchor is clipped and flagged; merge moves anchors to the surviving block. | M3f | Core split/merge matrix (before/after/spanning, two anchors, branches); undo exact; one app-level split/merge smoke (command or keyboard). | M3 (requires OD-6) |
| **AC-19** | Code anchor survives edits outside the range; removing the quoted code marks broken/ambiguous; repair works. | M3a/M3c/M3e | Core code matrix (outside/inside/delete/duplicate/language change); e2e code edit + repair. | M3 |
| **AC-20** | Formula anchor stores term/quote; invalid LaTeX shows an error without data loss; branch is visually associated. | M3a/M3c | Core formula matrix (whole/term/edit/invalid); UI error state + marker; e2e formula term. | M3 |
| **AC-21** | Image region uses normalized coordinates, survives display resize, becomes broken on asset replacement; missing image shows a placeholder. | M3a/M3c/M3e | Core image matrix (resize/replace/missing/two images); UI resize + replace; screenshot. | M3 |
| **AC-22** | Anchor health panel lists broken/ambiguous; relinking keeps anchor and branch IDs; repair never deletes the target. | M3e | E2e health sheet, relink, ID assertions; core inverse; target block count unchanged. | M3 |
| **AC-54** | Formula/code/image anchors are resolved/ambiguous/broken after edits and on load; broken never deletes branch/target. | M3a/M3c/M3e | Resolution matrix + load fixtures; broken count; no mutation; target once. | M3 |
| **AC-55** | Ambiguous reattachment requires explicit confirmation with before/after; only exact unique resolves silently; relink keeps IDs and is undoable. | M3e | E2e ambiguous text/formula/image; confirm/cancel; ID assertions; undo/redo. | M3 |
| **AC-56** | Broken/ambiguous anchors still export branch content exactly once with a visible marker; optional appendix. | M3 manifest / M4 PDF | `buildExportPlan` exactly-once tests; M4 PDF marker/page test. | M3 manifest / M4 PDF |
| **AC-57** | Fixture matrix covers formula-term edits, code edits inside/outside, image resize/replacement/missing; preserves branch/target/anchor or repair. | M3f | Fixture suite + table-driven core tests; every fixture validates; expected state per case. | M3 |
| **AC-58** | Shared child has one primary home; deleting primary parent/edge makes it top-level with refs intact; make home/move here change the home without duplicating; outline once; refs never add a row. | M3d | Core lifecycle matrix; e2e make home/move here; outline manifest; reference deletion. | M3 |
| **AC-77** (related) | Broken anchor shows visible marker, falls back to the whole block, opens/offers repair; never drops branch/target/anchor identity; export uses the fallback. | M3e | E2e broken marker/fallback/repair; export manifest marker. | Related (not in M3 list) |
| **AC-24/26/28/52** | Reference edges move nothing; reference arrows distinct; safe pagination; 2 px anchor alignment. | M4 | Layout differential (AC-24/26); paginator tests (AC-28); geometry tests (AC-52). | M4 contract |
| **AC-56 PDF** | PDF page count/geometry/text and broken markers. | M4 | PDF extraction/visual tests. | M4 |

**Coverage check:** all 20 M3 gate IDs are present: AC-03, 04, 05, 06, 07, 10, 12, 15, 16, 17,
18, 19, 20, 21, 22, 54, 55, 56, 57, 58. AC-77 is additional. No AC ID is missing or renumbered.

---

## 11. Fixtures and edge-case matrix

### 11.1 Fixture set

Fixtures are static JSON documents plus tests that apply commands. Names are proposals; the Builder
may place them under `fixtures/m3/`.

| Fixture | Purpose |
|---|---|
| `golden-eigenvalues.json` (extend) | Text anchor a1, whole-formula a2, code a3, anchored callouts, reference e4; the canonical worked example. |
| `m3-text-anchor-edits.json` | Text anchor with before/inside/after edit cases, emphasis, and an inline math inside the selection. |
| `m3-text-ambiguous.json` | Quote repeated 3×, one with exact context; no context case; two anchors overlapping. |
| `m3-formula-terms.json` | Whole formula, unique term, repeated term, invalid LaTeX, term in two formulas. |
| `m3-code-ranges.json` | Unique token, repeated token, offsets shifted, code outside range edited, code language changed, quote removed. |
| `m3-image-regions.json` | Two regions on one image, two images sharing an asset, display resize, asset replacement, missing asset. |
| `m3-two-anchors-one-block.json` | Overlapping anchors, same start, different start; callout order and mark arrays. |
| `m3-shared-child.json` (extend) | Existing shared child plus a reference cycle A↔B, see-also/referenced-by. |
| `m3-reference-transitions.json` | Reference, make home, move here, demote, delete primary with refs; chapter slots. |
| `m3-broken-anchors.json` (extend) | Missing quote, missing node, duplicate mark, selector mismatch, missing block (recovery fixture). |
| `m3-nested-callouts.json` | Callout with anchored child and direct child; recursive order. |
| `m3-export-manifest.json` | Mix of shared child, broken anchors, reference cycle, callout; exactly-once manifest. |
| `m3-legacy-binding.json` | `anchorId` string (M2 compatibility), no `anchorIds`; fallback works; no migration. |
| `m3-paste-duplicate.json` | Content with duplicate anchorIds; paste/duplicate rule; no phantom branch. |

Existing fixtures (`golden-eigenvalues`, `shared-child`, `broken-anchor`) must be aligned with the
selector shapes and validated by `parseDocumentJson` in a fixture-validity test. The M2 review F14
fixture drift is a warning: do not add M3 fixtures that fail the current validator.

### 11.2 Edge-case matrix

| # | Case | Setup | Expected outcome | Layer |
|---:|---|---|---|---|
| 1 | Missing anchor mark | Record exists, quote absent | Broken; callout at block; repair; target once | Core + e2e |
| 2 | Duplicate text | Quote 3×, no context | Ambiguous; candidates; no auto; choose one keeps IDs | Core + e2e |
| 3 | Duplicate text with context | Quote 3×, exact prefix/suffix one | Resolved; no dialog | Core |
| 4 | Formula term edited | Term renamed | Broken/ambiguous; formula rect fallback; branch associated | Core + UI |
| 5 | Formula invalid LaTeX | Source invalid | Source preserved; error state; whole-formula binding still resolves; branch visible | Core + UI |
| 6 | Formula term repeated | Two occurrences | Ambiguous even with hint; confirmation | Core |
| 7 | Code edit outside range | Quote intact, offsets shifted | Resolved by quote/context; marker moves | Core + UI |
| 8 | Code edit inside range | Quote changed | Broken/ambiguous; repair candidates | Core + UI |
| 9 | Code language change | Language attr changes | Resolved; offsets/quote unchanged | Core |
| 10 | Image display resize | Asset same, display size changes | Resolved; normalized rect maps; marker scales | Core + UI |
| 11 | Image asset replaced | New asset ID | Broken; no auto-reattach; confirmation preview | Core + e2e |
| 12 | Image missing asset | Asset not found | Placeholder; broken; branch/target kept | Core + e2e |
| 13 | Image crop | Crop changes asset/rect meaning | Broken/confirmation; never silent | Core |
| 14 | Two regions on one image | `anchorIds` has two IDs | Both resolve; callouts stack; repair one doesn't affect other | Core + UI |
| 15 | Two images share asset | Same asset ID, different nodes | Node binding disambiguates; if node missing, broken not auto | Core |
| 16 | Anchor on deleted block | Block deleted with promote/subtree | Anchor/branches removed with block; undo restores; no dangling | Core + e2e |
| 17 | Anchor block missing on load | Recovery fixture | Load warning/quarantine; no silent drop | Core recovery |
| 18 | Reference cycle | A→B, B→A reference | Allowed; no recursion; chips both; layout identical | Core + e2e |
| 19 | Reference self | A→A | Rejected both roles; no mutation | Core |
| 20 | Duplicate reference | Same source-target | Focus existing; no second edge | Core + UI |
| 21 | Reference create/delete | Add/remove ref | No block move/page break; chapters/primary orders identical | Layout differential |
| 22 | Reference reorder | Reorder ref list | See-also order changes; layout identical | Core + layout |
| 23 | Shared child deletion | Delete target with refs | All edges removed; confirmation lists ref parents; undo restores | Core + e2e |
| 24 | Delete primary edge with refs | Primary parent link removed | Target root/top-level; refs intact; outline once | Core |
| 25 | Make home | Ref parent chosen | Roles swap; target moves; both edges; one undo | Core + e2e |
| 26 | Move here | Ref parent chosen | Old primary deleted; target moves; old parent link gone | Core + e2e |
| 27 | Demote primary | Primary edge chosen | Target root/top-level; reference kept; one undo | Core |
| 28 | Move across chapters | Move target/parent | Target chapter/slot updates; refs follow; undo exact | Core + e2e |
| 29 | Undo after reload | Save, reload, undo | History cleared; saved state exact; no stale undo | E2e |
| 30 | Two anchors in one block | Different spans | Order by start then ID; callouts stack; no overlap | Core + UI |
| 31 | Overlapping anchors | Same/overlapping range | Both marks in `anchorIds`; order deterministic; repair one leaves other | Core + UI |
| 32 | Anchor at block start/end | Boundary selection | Resolved; order 0/end; callout below | Core + UI |
| 33 | Split inside anchor | Spanning split | Clip original side; flag repair; quote not rewritten; branch kept; no duplicate ID | Core + e2e |
| 34 | Split before/after anchor | Anchor wholly one side | Moves with content; `blockId` updates; IDs kept | Core |
| 35 | Merge with anchors on both | Two blocks | Anchors move to survivor; IDs kept; marks preserved | Core |
| 36 | Merge with duplicate refs | Duplicate source-target | Dedupe; earlier ID kept; warning; undo restores | Core |
| 37 | Attach branches to block | Anchor with 2 branches | Branch IDs kept; sources block; order appended; anchor removed; undo | Core + e2e |
| 38 | Delete last branch | One branch | Anchor idle (OD-2 approved); no callout; no warning; explicit Remove anchor | Core + UI |
| 39 | Paste duplicated anchor content | Copy/paste with anchorIds | Strip/remap; no duplicate ID; no phantom branch | Core + UI |
| 40 | Duplicate subtree | Explicit duplicate | New anchor/branch IDs for copy; external refs not copied | Core |
| 41 | Create anchored child with typing pending | Type then branch | Commit first; one undo; no lost text | Runtime/e2e |
| 42 | Collapse parent with callouts | Collapse | Callouts/descendants hidden; count includes; expand restores | UI |
| 43 | Focus/navigate hidden callout | Search/ref chip | Ancestors expand; focus target; no document edit | UI |
| 44 | Reference target on another chapter | Ref cross-chapter | Chip with chapter; no page in M3; navigation works | UI |
| 45 | Reference target collapsed | Ref to hidden block | Chip remains; navigate expands; layout unchanged | UI |
| 46 | Broken anchor with only reference edge | Anchor ref broken | No callout; dashed edge from warning point; target not moved | Core + UI |
| 47 | Selector mismatch | `selector` vs mirror fields differ | Load warning; selector wins; flag repair; no silent rewrite | Core |
| 48 | Unknown anchor kind | New kind in JSON | Preserve; flag unsupported; branch preserved; no crash | Core |
| 49 | Empty block anchors | No content | Text/formula/code/image creation unavailable; no invalid record | UI |
| 50 | Reload/undo/redo with reference cycle | Cycle + undo | No recursion; exact restore; no duplicate edges | Core + e2e |
| 51 | Role transition would create a primary cycle | A primary→B; B→A reference; make home/move here | Reject before mutation; reference remains; no block moves | Core |
| 52 | Text selection crosses a block-level atomic node or table-cell boundary | Text, display math/image/code, text; or cell A → cell B | Reject with a clear message; no partial anchor; use the matching anchor kind or stay in one cell | UI |
| 53 | Split a text node inside another anchor's range | Existing anchor a1 covers "abcdef"; create a2 over "cd" | a1 remains one range across both split nodes; a2 only on "cd"; no duplicate/broken a1 | Core |
| 54 | Delete a block with anchored primary children, promote mode | b1 has anchor a1→b3; delete b1 promote | b3 is promoted to b1's parent (new branch) or top-level; old anchored branch removed; b3 not orphaned; undo restores a1/e2 | Core + e2e |
| 55 | Delete subtree with anchored descendants | b1/a1→b3; b3/a2→b5; delete b1 subtree | b3 and b5 are both in the deleted set; no unreachable child; all touching edges removed; external refs listed | Core + e2e |
| 56 | Move under an anchored descendant | b1/a1→b3; move b1 under b3 | Reject as primary cycle; no mutation; subtree traversal includes anchored branches | Core |
| 57 | Merge would create a self-branch | S→B reference; merge B into S | Edge dropped with a warning; no S→S; target content intact; undo restores the edge | Core |

### 11.3 Test layers and budgets

| Layer | What it proves | Budget |
|---|---|---|
| Core unit (`packages/core/test`) | Selectors, resolution matrix, commands, identity, undo, validation, manifest | Keep `npm test` < 3 s; table-driven; no app. |
| Layout unit (`packages/layout/test`) | Reference-edge differential, callout order, no recursion | Existing layout tests; add differential cases. |
| Runtime unit (`apps/desktop/test`) | Editor adapter, binding mapping, callout order, undo routing | No app launch. |
| Critical e2e (`tests/e2e`) | One end-to-end anchored-child flow, one reference/shared-child flow, repair smoke | Do not blow the < 60 s suite budget (M2f cold-run risk). |
| M3 suite (proposal) | Exhaustive UI/anchor matrix, split/merge, all anchor kinds | Separate `test:m3` run in `verify`; not `verify:fast` if it threatens the budget. |
| Recovery (`tests/recovery`) | Broken anchor/load/quarantine; no silent drop | Add one fixture; keep existing recovery budget. |
| Visual (`tests/visual`) | Callout/marker/reference chips in dark default; before/after for repair | On demand; product owner judges. |

The M2f critical suite is 20 tests at 52.2–53.4 s warm; the cold run was 62.8 s. M3 must not add
many critical tests. Recommended: one new critical test that covers create anchored child → see-also
→ repair, and put the rest in the M3 suite. The Orchestrator decides the final budget.

---

## 12. Builder task breakdown (M3a–M3f)

Slices are ordered, independently testable, and each ends with a report. One Builder works one slice
at a time. Later slices depend on earlier ones; M3c and M3d are independent after M3b and may be
swapped, but not combined.

### M3a — Anchor model, binding, resolution, and core commands

**Goal:** the pure anchor model works without UI.

**Scope:**

- Add selector/binding types and helpers in `packages/core` (content mark/node binding, text
  projection, content-order key, split text nodes, remove binding).
- `resolveAnchor` / `resolveBlockAnchors` / `resolveDocumentAnchors` with
  resolved/ambiguous/broken/idle, candidates, reasons.
- `anchor.create`, `anchor.repair`, `anchor.attachToBlock`, `anchor.delete`.
- Extend `branch.create` with `source.anchorId` and `role`; extend `branch.delete`,
  `branch.reorder`, `branch.relabel` for reference/anchored branches.
- Validation invariants A1–A12; remove the M2 "anchors preserved but not edited" warning.
- Exact snapshots for repair/attach/delete.
- Unit tests only; no UI.

**Non-goals:** reference role transitions (M3d), split/merge (M3f), UI.

**Tests:** selector validation; resolution matrix for all four kinds; duplicate/overlap; no
mutation; command inverse; validation; fixture parse.

**Acceptance:** all core tests pass; no app change; `npm test` within budget.

**Depends on:** none.

**Size note:** M3a is the second-largest slice. If it exceeds ~400 changed lines plus tests, split it
into M3a1 (binding + resolution) and M3a2 (commands + validation) without changing the dependency
order. Do not combine it with M3b.

### M3b — Text anchor authoring and callout UI

**Goal:** a user can select text, create an anchored child, see the callout, and undo it.

**Scope:**

- TipTap anchor mark (`anchorIds` array), adapter to/from `AnchorBinding`, commit-before-command.
- Selection toolbar/context menu/command palette "Branch"; `⌘⇧Return` (confirm against M2 keymap).
- Create anchored child composite command; marker dotted underline/dot; callout lane below parent;
  quote chip; outline anchored row; anchored-first order.
- Anchor selection/cycling, keyboard path, focus/navigation, collapse behavior.
- Undo one entry; reload; broken detection when text is deleted (minimal warning; full repair M3e).

**Non-goals:** formula/code/image anchors; reference edges; repair panel; split/merge.

**Tests:** unit adapter/binding/order; e2e text anchor create/callout/undo/reload; screenshot; no
multi-block partial anchor.

**Acceptance:** AC-10 (text), AC-15, AC-16 (basic), AC-17 (detect/fallback), AC-22 partial;
one new critical e2e at most.

**Depends on:** M3a.

### M3c — Formula, code, and image anchors

**Goal:** all four anchor kinds work end to end.

**Scope:**

- Formula whole/term selection and binding; invalid LaTeX state; best-effort term marker.
- Code token/range selection; quote/context/offset selector; gutter marker; edits outside/inside.
- Image point/region selection; normalized rect; multiple regions; display resize vs asset
  replacement; missing asset placeholder.
- Callout lane for each kind; outline order with multiple anchors; markers/geometry fallback.
- Tests for AC-19/20/21, AC-54 partial.

**Non-goals:** repair dialog (M3e); reference edges.

**Tests:** core resolution matrix per kind; editor UI/e2e per kind; visual screenshots; resize/
replace/missing asset.

**Acceptance:** AC-19, AC-20, AC-21; AC-54 partial; no silent branch loss.

**Depends on:** M3a, M3b (callout lane).

### M3d — Reference edges, shared children, see-also, role transitions

**Goal:** reference edges are first-class and visibly never move content.

**Scope:**

- Reference create from block/anchor; default rule UI; role popover; dedupe.
- See-also/referenced-by chips; dashed edge when both visible; navigation/back.
- `branch.makeHome`, `branch.moveHere`, `branch.demote`; chapter slot/empty-chapter rules.
- Cycles; deletion; shared-child lifecycle; no duplicate outline rows.
- Layout-neutral differential test (core/layout).
- Tests for AC-03/04/05/06/12/58; AC-07 identity is exercised by move/reference cases but is owned
  by M3a/M3f.

**Non-goals:** anchor repair (M3e); split/merge (M3f).

**Tests:** core command/lifecycle matrix; layout differential; e2e shared child + reference cycle +
make home/move here; outline/manifest count.

**Acceptance:** AC-03–AC-06, AC-12, AC-58; AC-07 identity is exercised by move/reference cases but
owned by M3a/M3f. Reference edges move nothing.

**Depends on:** M3a; can run after M3b (not necessarily after M3c).

### M3e — Broken/ambiguous repair and anchor health

**Goal:** every lost anchor has a visible, explicit repair path; no silent deletion.

**Scope:**

- Health chip/sheet; warning markers on block/callout; reasons; candidates.
- Relink selection, choose candidate, attach to block, delete branch/anchor, keep broken.
- Before/after preview; confirmation; ID preservation; undo/redo.
- Detection triggers/debounce; correct-before-save/export; load/recovery.
- Tests for AC-17, AC-22, AC-54, AC-55, AC-77.

**Non-goals:** M4 PDF appendix; full inspector.

**Tests:** core state transitions and inverse; e2e ambiguous text + image replacement + relink;
recovery fixture; no target deletion.

**Acceptance:** AC-17, AC-22, AC-54, AC-55; AC-77; broken count accurate; no silent loss.

**Depends on:** M3b, M3c; M3d for attach/dedupe interactions if reference edges exist.

### M3f — Identity, undo, split/merge, fixtures, export manifest

**Goal:** identity and undo are exact across every operation; the fixture matrix and export manifest
prove it.

**Scope:**

- `block.split`/`block.merge` with anchor migration (AC-18).
- Identity/undo sequences: create/repair/attach/delete/role change/split/merge/reload.
- Paste/duplicate anchor stripping/remapping.
- Fixture suite (M3), fixture-validity test, table-driven edge matrix.
- `buildExportPlan` exactly-once manifest; broken markers; reference neutrality.
- Performance check for resolution at 1,000 anchors; no regression at 300 blocks.

**Non-goals:** M4 page/PDF visuals; M5 API.

**Tests:** core split/merge/identity/undo; fixture matrix; manifest; e2e undo-after-reload; perf
target.

**Acceptance:** AC-18, AC-56 manifest, AC-57; M2 AC-46, AC-47, AC-48 regressions green; all fixtures
valid.

**Depends on:** M3a–M3e.

**Size note:** M3f is the largest slice. If the brief exceeds ~400 changed lines plus tests, split
it into M3f1 (split/merge/identity/undo) and M3f2 (fixtures/export manifest/perf) without changing
the dependencies. Do not combine it with M3e.

### 12.1 Dependency graph

```text
M3a ──▶ M3b ──▶ M3c ──▶ M3e ──▶ M3f
          │                 ▲
          └────▶ M3d ───────┘
```

M3d can run before M3c; M3e needs the anchor UI from M3b/M3c and the role/attach interactions from
M3d. M3f is last.

### 12.2 Gate order

1. M3a: pure model/resolution/commands; no app gate.
2. M3b: text anchor + callout; screenshot; one critical e2e.
3. M3c: all anchor kinds; screenshots; matrix.
4. M3d: reference edges/shared child; layout-neutral proof; e2e.
5. M3e: repair/health; e2e; recovery.
6. M3f: identity/split/merge/fixtures/manifest; full `verify`.

The Orchestrator runs one full `npm run verify` at integration, not per slice. Builders run
targeted tests and one `verify:fast` per slice (per `AGENTS.md`).

---

## 13. Spec, UX, and ADR deltas (applied 5 November 2026)

**Status.** The proposals below were applied to `docs/spec.md` v0.4.5, `docs/ux.md` v1.3, and ADR-0005. The section is retained as the proposal record. §13.3 was written as ADR-0005; §13.4 was not written separately (see ADR-0005, "Why no ADR-0006").

### 13.1 Spec proposals

| ID | Section | Proposal | Why |
|---|---|---|---|
| **P1** | §4.4 Anchor | Define selector shapes exactly as §2.4; add `attrs.anchorIds` array as the content binding for text/atomic nodes; keep `anchorId` as a read-compatible legacy form; state the mirror precedence; clarify I10 as one contiguous binding, not one text node. | The current "node ID" wording cannot be implemented; overlapping anchors/multiple regions need arrays; a mark naturally repeats on every text node of a range. |
| **P2** | §8.2 Resolution | State that only exact binding or unique fallback auto-resolves; all multiple-candidate cases are ambiguous; candidate ranking is UI-only. | Makes D5 testable; removes "clearly best" ambiguity. |
| **P3** | §4.5/§5.3 Branch | Make branch creation take an explicit role and optional anchor source; define role-independent dedupe; define role-change identity/order rules; define make-home/move-here/demote exactly. | Current spec describes behavior but not the command/identity contract. |
| **P4** | §5.4 Anchor ops | Define the composite anchored-child command; attach-to-block order rule; anchor lifetime after the last branch (pending OD-2); repair same-block. | One undo entry and deterministic order. |
| **P5** | §5.2 Split/merge | Add M3 anchor migration rules for mark arrays, spanning anchors, merge dedupe, and cross-chapter restriction (pending OD-11). | AC-18 needs exact behavior; M2 has no split/merge command. |
| **P6** | §4.6/§7.4 | Define the broken/ambiguous anchor order key (resolved start → lastKnown → end-of-block → ID) and the block-warning-point fallback. | Deterministic order when there is no span. |
| **P7** | §7.7/§8.9 | Add the layout-neutral differential test and the export-manifest exactly-once rule; state page numbers are M4. | AC-24/26/56 evidence; avoids a second traversal. |
| **P8** | §15 | Add acceptance notes (not new AC IDs): AC-56 is M3 manifest + M4 PDF; AC-18 requires split/merge commands; AC-10 wrap is M4. | Resolves gate conflicts C2/C3 without renumbering. |
| **P9** | §4.4/§8.3 | Clarify that anchor state is derived and `lastKnown` is advisory; no auto quote refresh. | Prevents stale state and hidden mutations. |

### 13.2 UX proposals

| ID | Section | Proposal | Why |
|---|---|---|---|
| **U1** | §8.5 | Fix the anchored-order line: anchored primary children **before** direct children (D3). | Conflict C1; this is a correctness fix. |
| **U2** | F5 | Clarify last-branch behavior (OD-2); propose keeping the anchor record idle and hiding the marker. | Resolves ambiguity; preserves identity/re-branching. |
| **U3** | F5 / §9 | Confirm `⌘⇧Return` for anchored child vs the M2 `Control+Enter` child key; add the anchor-marker keyboard path. | Builder needs one key; UX D13 requires keyboard. |
| **U4** | New M3 surfaces | Add the callout lane, anchor marker/chips, see-also/referenced-by chips, and the health sheet to `docs/ux-shell.md` (M3 addendum). No right inspector. | Builder needs the visible contract; ADR-0004 defers the inspector. |
| **U5** | F8 | Reference edges in M3: dashed edge when both endpoints are visible, chip otherwise; no page number until M4. | OD-9; keeps M3 scope small. |
| **U6** | §11.3/§11.5 | Add repair copy for ambiguous/broken anchors, attach-to-block, and the health sheet; keep "no modal on load." | AC-22/55 need exact user-visible states. |
| **U7** | F7 | Reconcile collapse: M3 editor hides callouts per spec §7.6; Reader/Page wording can be resolved for M4. | Conflict C4. |

### 13.3 ADR-0005 outline (written as ADR-0005)

**Title:** Anchor binding, resolution, and identity

**Status:** Proposed

**Context:** M3 needs anchors inside rich content, multiple overlapping anchors, multiple regions on
one atomic node, one resolver shared by editor and M4 layout, and exact undo identity. The current
spec says "node ID" but the content model has no node IDs; a sidecar range would drift from content.

**Decision:**

1. Anchor binding lives in canonical content: `anchorIds` arrays on text marks and atomic node
   attrs; selector records are repair descriptors. `anchorId` is read-compatible.
2. One pure resolver in `packages/core`; the editor uses it in M3 and `packages/layout` consumes it
   in M4. No second resolver.
3. Anchor state is derived; `lastKnown` is advisory; resolution never mutates content.
4. Composite commands/exact snapshots guarantee one undo entry for anchored child, repair, attach,
   make-home, move-here, demote, split, and merge.
5. No schema bump; additive attrs; no-op migration only if the Orchestrator requires one.

**Consequences:** ProseMirror mark/node attr work; transform/splitting text nodes; layout package
gains a core dependency or an adapter in M4; existing fixtures need selector alignment; M2 readers
preserve but cannot edit M3 anchors.

**Alternatives rejected:** sidecar ranges (drift), DOM/CSS selectors (platform-specific), one anchor
per atomic node (fails multiple regions/overlaps), auto-refresh quotes (hidden mutations), a second
renderer resolver (divergence).

**Gates:** resolution matrix, identity/undo sequences, layout-neutral differential, fixture
validity, 1,000-anchor resolution < 100 ms.

### 13.4 Optional ADR-0006 outline (not written; see ADR-0005 §9)

**Title:** Reference edge role transitions and layout neutrality

**Status:** Optional; only if the Orchestrator wants the reference lifecycle recorded separately.

**Decision:** reference edges are a separate relation; role transitions preserve branch IDs; pure
reference changes never touch chapters/primary orders; layout-neutrality is a differential gate.

The spec proposals P3/P7 may be enough; do not create a second ADR unless the Orchestrator wants
one.

---

## 14. Product decisions (approved 5 November 2026)

**All OD-1–OD-12 were approved as recommended on 5 November 2026.** The recommendation column is the binding resolution; no M3 product decision remains open. The options are retained as the decision record.

Each decision lists the options and the approved recommendation. No decision was silently made.

| ID | Decision | Options | Recommendation | Owner | Needed before |
|---|---|---|---|---|---|
| **OD-1** | Outline order conflict (C1): anchored first or after direct children? | A. Anchored first (spec/D3). B. Anchored after (UX §8.5). | **A.** Ratified D3; fix UX. | Orchestrator + UX | M3b |
| **OD-2** | Anchor lifetime after the last branch is removed. | A. Keep the anchor record idle, hide the marker (spec §8.3 Idle). B. Delete the anchor with the last branch (UX F5 literal). C. Prompt. | **A.** Preserves identity and re-branching; no orphan warning; add explicit "Remove anchor" cleanup. Update UX F5 to say "marker hidden." | Product owner | M3e |
| **OD-3** | Dedupe key for branches. | A. Source + target, role-independent (spec I8). B. Source + target + role (current validation/UX F8). | **A.** One relationship per pair; role is a property; avoids a redundant reference next to a primary. Update validation/UX. | Product owner + Orchestrator | M3d |
| **OD-4** | Atomic-node binding shape. | A. `attrs.anchorIds` array + selector (P1). B. Record-only selectors, no node attrs. C. Single `attrs.anchorId` per node. | **A.** Supports overlapping anchors and multiple regions; additive; no schema bump. Record it in ADR-0005. | Architect + Orchestrator | M3a |
| **OD-5** | AC-56 evidence split. | A. M3 export manifest + M4 PDF (recommended). B. Implement PDF in M3 (out of scope). C. Move AC-56 to M4. | **A.** M3 proves exactly-once data; M4 proves the PDF marker. Add an acceptance note (P8). | Orchestrator + product owner | M3f |
| **OD-6** | AC-18 split/merge scope. | A. Implement `block.split`/`block.merge` in M3f. B. Defer AC-18 to M4, keep M3 gate smaller. | **A.** AC-18 is anchor identity behavior and belongs in M3; keep the UI minimal (text-leaf split, same-chapter merge). | Orchestrator | M3f |
| **OD-7** | "Make home" when the target is a root. | A. Disable "make home"; offer "Move here"/"Add as child." B. Treat it as move-here (attach to reference source). C. No-op. | **A.** Avoids a confusing no-op; "move here" is the explicit command. | UX + product owner | M3d |
| **OD-8** | Editor callout placement model. | A. Callout lane below the parent card, anchor-aligned (recommended). B. Callout inside the parent card. C. Right-side callout column. | **A.** Matches the layout engine, keeps the block card editable, avoids overlap; pixel alignment is best-effort until M4. | UX + Architect | M3b |
| **OD-9** | Reference edge rendering in M3. | A. Dashed edge when both endpoints visible + chips otherwise. B. Chips only in M3. | **A.** The product is about visible relationships; M3 should show a dashed edge without waiting for M4. Keep routing simple; AC-26 is M4. | UX + Orchestrator | M3d |
| **OD-10** | Health-panel surface. | A. Status chip + sheet/dialog (recommended). B. Full right inspector. C. Modal on load. | **A.** Small, accessible, matches ADR-0004's no-inspector M3 shell; no modal on load. | UX | M3e |
| **OD-11** | Cross-chapter merge. | A. Reject in M3. B. Allow, target chapter wins. C. Prompt. | **A.** Keeps merge identity/slot rules simple; revisit if users need it. | Product owner + UX | M3f |
| **OD-12** | Text selection containing inline math/image. | A. Support via plain-text projection (recommended). B. Restrict text anchors to text-only selections. | **A.** Users select naturally; mark binding remains truth; quote projection is testable. Add a fixture. | UX + Architect | M3b |

The Orchestrator should resolve OD-1/OD-3/OD-4/OD-8/OD-12 before M3b; OD-2/OD-10 before M3e;
OD-7/OD-9 before M3d; OD-5/OD-6/OD-11 before M3f. The rest can be decided during the slice without
blocking the model.

---

## 15. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ProseMirror mark arrays and text splitting are more complex than expected; overlapping anchors cause editor corruption. | High | High | Core binding helpers, table-driven tests, split text nodes at boundaries, reconcile from canonical, one anchor mark type with `anchorIds`, no optimistic local marks. |
| Editor callout lane geometry jitters or overlaps direct children. | Medium | Medium | Callout lane before direct children; measure once per frame; clamp; fallback to card left; no layout engine in M3; geometry test at 100% zoom. |
| Strict resolution marks too many anchors broken, frustrating users. | Medium | Medium | Exact unique auto; clear repair copy; candidates with context; no modal on load; health count; test the edit matrix. |
| Split/merge scope (AC-18) balloons M3f. | High | Medium | Minimal text-leaf split, same-chapter merge; atomic nodes move whole; split M3f1/M3f2 if needed; OD-6. |
| Reference role transitions lose branch IDs/order on undo. | Medium | High | Exact `structure.restore` snapshots; identity tests; M2f pattern; no hand-written partial inverse. |
| M2 command/validation changes regress M2 behavior. | Medium | High | Additive optional fields; keep M2 tests green; run full `verify`; no change to existing primary-only commands except explicit role/source extension. |
| Critical e2e budget (20 tests, 52 s warm, 62.8 s cold) is exceeded. | High | Medium | One new critical smoke; exhaustive M3 suite separate; no fixed sleeps; condition waits; Orchestrator decides budget. |
| Fixture drift (M2 review F14) causes invalid M3 fixtures. | Medium | Medium | Fixture-validity test; align selectors; no invalid anchor shapes. |
| Export manifest and M4 PDF diverge. | Medium | High | One `buildExportPlan`; M4 consumes it; exactly-once tests; no second traversal. |
| Reference edges accidentally affect layout through a shared helper. | Low | High | Differential test; `primaryBranches` filter; no reference read in layout; review checklist item. |
| Sidebar/canvas parity breaks with anchored rows/chips. | Medium | Medium | Both use the same traversal/order; parity e2e; hidden count includes callouts. |
| Anchor IDs duplicated by paste/duplicate. | Medium | High | Strip/remap rule; validation A3; fixture; no phantom branch. |
| Performance regression at 300/1,000 blocks. | Medium | Medium | Per-block index; debounce; visible-only measurement; measure before/after; no full scan per keystroke. |
| Spec/UX conflicts are discovered late. | Medium | High | This package lists C1–C9; resolve before briefs; update docs in one docs task. |

---

## 16. Package acceptance checklist and next steps

### 16.1 Checklist against the task brief

- [x] Every M3 acceptance criterion (AC-03–07, AC-10, AC-12, AC-15–22, AC-54–58) has a concrete
  behavior and a test strategy (§10).
- [x] Anchor and branch identity rules are explicit for create/edit/move/repair/undo/reload
  (§5.2, §4.5).
- [x] Reference edges are proven layout/pagination-neutral in the design (§7.8).
- [x] Broken/ambiguous states enumerate user-visible behavior and repair paths (§8).
- [x] The edge-case matrix names fixtures and expected outcomes (§11).
- [x] The task breakdown is ordered, small, and independently testable (§12).
- [x] Proposed spec/UX/ADR deltas are clearly marked as proposals in §13; the approved delta is applied in spec v0.4.5/UX v1.3/ADR-0005.
- [x] Product decisions OD-1–OD-12 are approved on 5 November 2026 with a recommendation; none silently decided (§14).
- [x] At design time, no code, plan, spec, UX, or ADR file was modified; the approved delta is now applied in spec v0.4.5/UX v1.3/ADR-0005.

### 16.2 Recommended Orchestrator next steps

**Status (5 November 2026):** steps 1–3 are complete. C1–C9 and OD-1–OD-12 are approved, ADR-0005 is written, and the spec/UX delta is applied at spec v0.4.5 / UX v1.3. See `docs/reports/m3-spec-delta.md`. Steps 4–6 remain with the Orchestrator.

1. Review C1–C9 and OD-1–OD-12. Resolve the blockers: C1 (outline order), C8 (I10 reading), C9
   (anchored children on block delete), OD-3 (dedupe), OD-4 (binding shape), and then
   OD-1/OD-5/OD-6 before the relevant slices.
2. Approve or reject ADR-0005 (and optional ADR-0006). If approved, write the ADR from §13.3.
3. Apply the approved spec/UX deltas in one docs task; do not let a Builder implement from the
   conflicting UX line.
4. Write Builder briefs in order M3a → M3b → M3c/M3d → M3e → M3f, with the gate and non-goals from
   §12. Keep each brief ≤300–400 changed lines plus tests where possible.
5. Add the M3 fixture/validity task to M3f or a separate docs/test task; do not add invalid fixtures
   before the validator is aligned.
6. Decide the e2e budget: one critical smoke vs a separate `test:m3` suite in `verify`.

### 16.3 Stop conditions for Builders

Stop and report if:

- a ratified decision conflicts with another doc (C1–C9 are known; new ones are stop conditions);
- the anchor model would require a schema break without a migration path;
- a product decision is missing (OD-2, OD-3, OD-7, OD-11 are the likely ones);
- a command would create a half-applied document or two undo entries for one user action;
- reference edges are found to affect layout or pagination;
- a broken anchor would be deleted or omitted from export;
- the M2 critical e2e budget would be exceeded by the slice's tests.

---

## Appendix A — Worked example (golden eigenvalues)

Document: "Linear algebra — eigenvalues", one chapter, top-level `b1`, `b4`. Page setup A4
portrait, 20 mm margins.

| Block | Role | Content | Anchors |
|---|---|---|---|
| **b1** | Top-level | "An eigenvalue is a scalar λ such that Av = λv for some nonzero vector v." | **a1** text on "eigenvalue"; **a5** text on "scalar" (second anchor). |
| **b2** | Direct child of b1 | "An eigenvector is a nonzero v satisfying Av = λv." | None. |
| **b3** | Anchored child of b1 via a1 | "The eigenvalue equation: Av = λv, with v ≠ 0." | **a2** whole formula on `Av = λv`; **a6** term on `λ`. |
| **b4** | Top-level | "Cayley–Hamilton: every matrix satisfies its characteristic polynomial." | None. |
| **b5** | Anchored child of b3 via a2 | "Computing eigenvalues" with code. | **a3** code range on `eigvals`. |

Branches: e1 b1→b2 primary; e2 b1/a1→b3 primary; e3 b3/a2→b5 primary; e4 b4→b3 reference;
e5 b3→b4 reference (cycle e4/e5); e6 b1/a5→b2 reference (see-also from "scalar"); e7 b3/a6→b2
reference (see-also from the formula term). b2 has one primary (e1) and two reference parents
(e6/e7); b3 has one primary (e2) and one reference parent (e4).

**Outline order.** b1; anchored children of b1 in anchor order: a1→b3 (primary row), a5→b2
(reference, not a row); b3; anchored children of b3: a2→b5 (primary row), a6→b2 (reference, not a
row); direct children of b3: none; b2 direct child of b1 after the anchored rows; b4 top-level.
Reference chips: b1 See also b2 (a5); b2 Referenced by b1/a5 and b3/a6; b3 See also b4 and
Referenced by b4 (cycle e4/e5); b4 See also b3.

The exact chip list depends on the final fixture; the important assertions are:

- b3 appears once, under b1, before b2 (D3).
- b5 appears once, under b3.
- Reference edges e4/e5/e6 add no rows.
- a1 and a5 order by their start positions in b1; a2 and a6 order within b3 by start position, then
  ID.
- A broken a1 leaves b3 under b1 at the warning point; b5 stays under b3; b2/b4 unchanged.
- Make home from e4: b3 moves under b4; e2 becomes reference; outline b1 (see also b3), b4, b3,
  b5; b2 remains under b1. One undo restores.
- Adding/removing e4/e5/e6 changes no block position or page break (M4 differential).

## Appendix B — JSON shapes (illustrative)

**Text anchor**

```json
{
  "id": "a1",
  "blockId": "b1",
  "kind": "text",
  "selector": {
    "kind": "text",
    "quote": "eigenvalue",
    "prefix": "An ",
    "suffix": " is",
    "occurrenceHint": 1
  },
  "quote": "eigenvalue",
  "prefix": "An ",
  "suffix": " is",
  "occurrenceHint": 1
}
```

```json
{
  "type": "text",
  "text": "eigenvalue",
  "marks": [{ "type": "anchor", "attrs": { "anchorIds": ["a1"] } }]
}
```

**Whole formula**

```json
{
  "id": "a2",
  "blockId": "b3",
  "kind": "formula",
  "selector": { "kind": "formula", "form": "whole", "latex": "Av = \\lambda v" },
  "quote": "Av = \\lambda v"
}
```

```json
{ "type": "mathBlock", "attrs": { "latex": "Av = \\lambda v", "anchorIds": ["a2"] } }
```

**Formula term**

```json
{
  "id": "a6",
  "blockId": "b3",
  "kind": "formula",
  "selector": {
    "kind": "formula",
    "form": "term",
    "latex": "\\lambda",
    "occurrenceHint": 1,
    "latexPrefix": "Av = ",
    "latexSuffix": " v"
  },
  "quote": "\\lambda"
}
```

**Code range**

```json
{
  "id": "a3",
  "blockId": "b5",
  "kind": "code",
  "selector": {
    "kind": "code",
    "quote": "eigvals",
    "prefix": "values = ",
    "suffix": "(",
    "occurrenceHint": 1,
    "startOffset": 128,
    "endOffset": 135,
    "lineStart": 11,
    "lineEnd": 11
  },
  "quote": "eigvals"
}
```

**Image region**

```json
{
  "id": "a4",
  "blockId": "b6",
  "kind": "image",
  "selector": {
    "kind": "image",
    "assetId": "sha256-…",
    "rect": { "x": 0.20, "y": 0.35, "width": 0.18, "height": 0.10 },
    "point": false,
    "label": "eigenvector diagram"
  }
}
```

**Reference branch**

```json
{
  "id": "e4",
  "source": { "blockId": "b4" },
  "targetBlockId": "b3",
  "role": "reference",
  "order": "a1",
  "label": "also uses"
}
```

**Anchored primary branch**

```json
{
  "id": "e2",
  "source": { "blockId": "b1", "anchorId": "a1" },
  "targetBlockId": "b3",
  "role": "primary",
  "order": "a1"
}
```

## Appendix C — Glossary

| Term | Meaning |
|---|---|
| **Anchor** | A stable ID bound to a span/region inside one block; source of branches. |
| **Binding** | The content location of an anchor: text mark IDs or atomic node `anchorIds`. |
| **Selector** | The durable repair descriptor: quote/context, LaTeX term, code quote/offsets, image rect. |
| **Resolved** | Exact binding or unique fallback. |
| **Ambiguous** | Multiple plausible candidates; explicit confirmation required. |
| **Broken** | No candidate; branch/target preserved; repair offered. |
| **Idle** | Anchor record with no branch; no callout. |
| **Callout** | The block rendered below an anchor as the branch target; a normal block with an origin marker. |
| **Reference edge** | A non-structural relationship; see-also/referenced-by; never layout. |
| **Shared child** | A block with one primary home and one or more reference parents. |
| **Make home** | Explicit role swap: reference becomes primary; old primary becomes reference. |
| **Move here** | Explicit role move: reference becomes primary; old primary edge deleted. |
| **Demote** | Primary becomes reference; target becomes a root. |
| **Export manifest** | Pure ordered list of blocks/callouts/markers consumed by M4 PDF; every primary block once. |
