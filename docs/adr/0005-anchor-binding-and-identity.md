# ADR-0005 — Anchor binding, resolution, and identity

- **Status:** Accepted
- **Date:** 5 November 2026
- **Decision owner:** Product owner (approved C1, C8, C9, OD-1–OD-12 on 5 November 2026); recorded by the Planner / Architect
- **Depends on:** `docs/spec.md` v0.4.5, `docs/design/m3-anchors-references.md`, ADR-0004
- **Changes:** spec §4.4/§4.10/§5.2/§5.4/§8; adds the `anchorIds` content binding; no schema bump
- **Scope:** M3 only. No M4 page/PDF visuals, no M5 External Agent API, no annotations, no iPad.

## Context

M3 is the anchored-branch milestone. It needs anchors inside rich content, multiple overlapping
anchors in one block, multiple regions on one atomic node, one resolver shared by the editor and the
M4 layout engine, and exact identity across undo/redo, split/merge, and reload.

The spec at v0.4.4 described the formula/code/image binding as a "node ID", but the canonical
content model has no node IDs. A sidecar range would drift from content on every edit. A literal
reading of I10 ("a text anchor mark ID appears at most once") would forbid a multi-node text anchor,
which AC-16 expects. Deleting a block with anchored primary children had two incompatible rules
(promote every primary child vs remove the anchors and their branches), which could leave a target
unreachable. The product owner approved the design package's resolutions as C1, C8, C9, and
OD-1–OD-12.

This ADR records the binding and identity contract that makes those decisions implementable and
testable. It is the single M3 ADR: the reference-edge decisions that do not change binding or
identity are recorded in the spec/UX, and the reason no separate ADR-0006 is needed is in
[§9](#9-reference-edge-boundary-and-why-no-adr-0006).

## Decision

### 1. Binding lives in canonical content

The exact content location of an anchor is stored in the block content, not in a sidecar.

**Text: one anchor mark with an array.**

```json
{
  "type": "text",
  "text": "eigenvalue",
  "marks": [
    { "type": "anchor", "attrs": { "anchorIds": ["a1"] } }
  ]
}
```

- `anchorIds` is an array because two anchors may overlap the same text run.
- Exactly one anchor mark exists per text node; it carries the array. Creating an overlapping anchor
  merges its ID into the existing array (splitting text nodes as needed); it never adds a second
  anchor mark of the same type.
- `anchorIds` arrays are stored sorted by anchor ID so serialization, diffs, and undo snapshots are
  deterministic. Empty arrays and anchor marks with no IDs are removed from content.
- The anchor mark is non-inclusive at its end (`inclusive: false`): typing inside the range extends
  it, typing at the right boundary does not silently grow it, and typing before it moves it.
- An anchor range is the maximal contiguous run of text/inline content covered by the mark. The
  command splits text nodes at selection boundaries so the mark can start/end inside a text node.
  Intervening inline math/image nodes are allowed inside the range; unmarked text between two marked
  runs means the binding is not contiguous and is broken.
- The mark is part of content. Copying content with anchor marks must not duplicate an anchor ID
  (see §7 and the paste/duplicate rule in the design package §5.4).

**Atomic nodes: `attrs.anchorIds` array.**

```json
{ "type": "mathBlock", "attrs": { "latex": "Av = \\lambda v", "anchorIds": ["a2"] } }
{ "type": "image", "attrs": { "assetId": "sha256-…", "anchorIds": ["a4", "a5"] } }
{ "type": "codeBlock", "attrs": { "language": "python", "anchorIds": ["a3"] }, "children": [] }
```

- One atomic node can host multiple anchors (two regions on one image; two anchors on one formula;
  a code block with several ranges).
- The node kind must match the anchor kind: `mathBlock`/`inlineMath` for formula, `image` for
  image, `codeBlock` for code.
- A whole-formula anchor and an image-region anchor use the node binding as the precise part; the
  rect/term is in the selector.
- Code anchors use the node binding to confirm the node, but the quote/offset selector is the
  durable range; offsets are never the sole match.
- When the node is deleted, the binding disappears; resolution falls back to the selector and
  reports broken if the quote is absent.
- An atomic node with no anchors has no `anchorIds` attribute.

**Legacy read compatibility.** A single `anchorId` string is accepted on read for M2 compatibility
and treated as `["a1"]`. If both exist, `anchorIds` wins and must include the legacy `anchorId`. M3
writes `anchorIds`; it does not write the legacy form.

**No schema bump.** `schemaVersion` stays 1. The content model already preserves unknown attrs and
marks; older M2 readers preserve `anchorIds` but ignore it. M3 adds no required canonical field and
no migration. If a schema bump is later required, it must be a no-op migration with a pre-migration
backup and a round-trip test.

### 2. Selector and quote rules

The selector is the durable repair descriptor. It must be complete enough to find the anchor again
after the binding is lost.

**Mirror rule.** `selector` is canonical. The top-level `quote`, `prefix`, `suffix`, and
`occurrenceHint` fields are optional compatibility mirrors: on write both are written from the same
values; on read `selector` wins, and a disagreement loads with a warning and a `selector-mismatch`
repair flag. It is not silently rewritten. The anchor ID is never inside `selector`; it is the
record `id` and the content binding value.

**Text.** `quote` is the exact plain-text projection of the selection; `prefix`/`suffix` are up to
32 Unicode code points of context on each side, truncated at block boundaries; `occurrenceHint` is
the 1-based occurrence of `quote` in the block's text projection at creation time. A text anchor
that spans inline math/image uses the plain-text projection: text contributes its text, inline math
contributes its LaTeX source, an image contributes its alt text or `U+FFFC`, and paragraph/list-item
boundaries and hard breaks contribute `\n`. This is a repair descriptor only; the mark binding is
truth. A text anchor may span paragraphs/list items but must not cross a block-level atomic node
(display math, image, code block) or a table-cell boundary. A text anchor entirely inside one table
cell is allowed; an anchor spanning cells is rejected with "Anchors work within one table cell."

**Formula.** `form: "whole"` requires an atomic node binding; `latex` is the saved source for
display/repair. `form: "term"` stores the exact LaTeX substring and its occurrence within the
formula source. `latexStart` is an optional Unicode-code-point offset hint for ordering/repair; it
is never the sole match. `latexPrefix`/`latexSuffix` are optional context. Multiple occurrences are
ambiguous even with a hint (D5). Invalid LaTeX is preserved as source; the anchor remains
associated with the formula node and is not rewritten.

**Code.** Offsets are Unicode code points from the start of the code text, not UTF-16 or platform
string indices. `startOffset` is inclusive, `endOffset` exclusive. `lineStart`/`lineEnd` are 1-based
hints. Offsets/lines are hints; `quote` + context is the durable selector. A unique quote resolves
even if offsets moved. Multiple quote matches are ambiguous even if an offset matches one candidate.
`quote` is required; a whole-code-block anchor may use `form: "whole"`, but the same quote rule
applies.

**Image.** `rect` is normalized to 0–1 relative to the image's intrinsic dimensions, never display
pixels. A point anchor uses a zero-size rect (`width: 0`, `height: 0`) and `point: true`; the
visible marker has a UI hit area larger than the point. `assetId` is the content-addressed asset ID.
If it differs from the current image node's asset, the anchor is broken (asset changed/replaced),
never silently reattached. `crop` is the normalized crop/transform the anchor was created against
(full image if omitted). Display resize is safe because `rect` is normalized; a changed crop is
broken or requires explicit confirmation because the old region may no longer mean the same thing.
If two image nodes share the same asset, the node binding (`anchorIds`) disambiguates; if the node is
missing, the selector alone is ambiguous/broken, not auto-resolved to the other image.

### 3. One contiguous binding (C8/I10)

A text anchor is **one contiguous binding**, not one text node:

- the anchor ID may appear on every text node of one contiguous run;
- a second disjoint run is a violation;
- a duplicate entry in one node's `anchorIds` array is a violation;
- an atomic anchor ID appears in exactly one node's `anchorIds` array;
- text `anchorIds` appear only on text nodes; formula on `mathBlock`/`inlineMath`; code on
  `codeBlock`; image on `image`.

A violation is a broken anchor that requires repair; it is never auto-duplicated. This is I10 and
validation rule A3. Creating an overlapping anchor or splitting a text node inside another anchor's
range must preserve the outer anchor as one range; it must not break or duplicate it.

**M3 validation rules (A1–A12).** These extend spec I1–I18 and are the rules a Builder validates.

| ID | Rule | On violation |
|---|---|---|
| **A1** | Anchor IDs are globally unique and each anchor belongs to an existing block. | Fatal recovery or quarantine; never silent drop. |
| **A2** | Every `anchorIds` entry in content has an anchor record. An anchor record with no content binding is valid and resolves by selector (broken if no candidate). | Broken anchor + warning; a mark without a record is inert (no phantom branch). |
| **A3** | An anchor ID identifies at most one contiguous binding in a block. For text, the ID may appear on every text node of one contiguous run; a second disjoint run, or a duplicate entry in one node's array, is a duplicate binding. For atomic nodes, the ID appears in exactly one node's `anchorIds` array. | Broken anchor; repair required; never auto-duplicate. |
| **A4** | Text `anchorIds` appear only on text nodes; formula on `mathBlock`/`inlineMath`; code on `codeBlock`; image on `image`. | Invalid binding; broken/repair. |
| **A5** | `selector.kind` equals `anchor.kind`; required fields per kind are present; image rect and crop are finite and within 0–1; `point` is true exactly when width and height are zero. | Load warning/broken; preserve record. |
| **A6** | A branch source anchor belongs to the source block; the target exists; no self-branch. | Fatal recovery/quarantine. |
| **A7** | At most one incoming primary branch per block; the primary subgraph is acyclic. | Fatal recovery; user chooses. |
| **A8** | No duplicate exact source-target branch, regardless of role. | Reject creation; on load keep the primary edge and drop the duplicate with a warning. |
| **A9** | Branch `order` is unique within `(port, role)`. | Warning; tie-break by ID; normalize on save. |
| **A10** | Every root appears exactly once in exactly one chapter; reference-only roots are still roots. | Fatal recovery. |
| **A11** | No reference branch is read by the outline/layout/export traversal. | Test invariant; a defect if violated. |
| **A12** | Unknown anchor kinds, selectors, and content attrs are preserved and flagged, not dropped. | Warning; preserve. |

### 4. Resolution states and the exact-unique rule

Resolution is pure over the canonical document. It never mutates content or the anchor record. The
state is always derived, never stored.

| State | Meaning | Auto-resolve? | Visible treatment |
|---|---|---|---|
| **resolved** | Exact binding or unique fallback. | Yes | Normal dotted underline/dot; callout below. |
| **ambiguous** | Multiple plausible candidates. | No | Warning marker + "N matches"; candidate list. |
| **broken** | No candidate. | No | Warning marker + "Lost anchor"; repair. |
| **idle** | Anchor record exists, no outgoing branch. | n/a | Marker hidden; no callout; no health warning. |
| **block-missing** | Anchor's block no longer exists. | n/a | Load error/quarantine; listed in health; actions limited. |

Auto-resolution is allowed only when exactly one of these is true:

- the binding exists exactly once and passes its kind's validation; or
- the fallback quote/context matches exactly one candidate.

Everything else is **ambiguous**. In particular: a formula term with two occurrences is ambiguous
even if `occurrenceHint` points at one; a code quote with two occurrences is ambiguous even if
`startOffset` points at one; a text quote with two occurrences is ambiguous unless the exact prefix
and suffix select exactly one; an image asset change is broken, never auto-resolved to the new
asset. Candidate ranking (exact context, occurrence hint, proximity to `lastKnown`, earlier start,
anchor ID) is UI order only, never auto-selection.

This is stricter than the old spec §8.2 "if one candidate is clearly best, resolve" wording. It is
consistent with D5 ("exact unique bindings may auto-resolve; ambiguous reattachment requires
explicit confirmation") and AC-55. Spec v0.4.5 applies the exact-unique rule.

`lastKnown` is an advisory repair hint. It is never read by resolution, layout, or export. An
anchor record with no content binding is valid and resolves by selector (broken if there is no
candidate). A mark with no record is inert and never creates a phantom branch. Idle takes precedence
when there are no outgoing branches: the binding/selector may still be broken, but there is no
callout or branch to repair, so the anchor is not listed in the health panel until a branch exists.

### 5. One resolver, shared with M4

There is one pure anchor resolver in `packages/core`. The M3 editor consumes it; the M4 layout
engine consumes the same contract. M3 must not create a second resolver in the renderer, and M4 must
not add a second anchor model.

- Resolution is content-only; DOM range measurement is separate and only for visible blocks.
- Build a per-block index once per content revision: plain-text projection with an offset map,
  formula nodes with LaTeX and node paths, code nodes with text/line starts/node paths, image nodes
  with asset IDs/node paths, and anchor records grouped by block. Resolve all anchors in a block in
  one pass and cache by block content hash or document revision.
- On a content edit, invalidate only that block using `affected.blockIds`; on load, compute all
  blocks. Target: 1,000 anchors resolved in < 100 ms on load (spec §14.2), incremental per edited
  block afterward.
- The state must be correct before save and export. UI marker updates may be debounced (100–200 ms),
  but a debounced update must never be the only thing standing between a stale state and a save.
- Detection triggers: text/formula/code edit; block split/merge; image replacement/crop/asset
  change; anchor create/repair/attach/delete; undo/redo that changes content or structure; load;
  import/paste that creates or copies anchor content; recovery/migration.

### 6. Identity invariants

| ID | Invariant |
|---|---|
| **ID-1** | `block.id`, `anchor.id`, and `branch.id` are opaque, immutable, and never reused after deletion. Undo/redo restores the same IDs. |
| **ID-2** | An anchor ID is bound to exactly one block at a time. Split/merge updates `anchor.blockId`; it does not create a new anchor. |
| **ID-3** | A branch ID is bound to one source (block or anchor) and one target. Reorder/label/role changes keep the ID. A deleted branch ID is retired; undo restores it. |
| **ID-4** | A branch source anchor must belong to the branch's source block. Moving an anchor's block updates both together. |
| **ID-5** | Chapter membership is derived from the primary root: `chapter.id` for the root, and the root's `topLevelBlockIds` index. A block is never in two chapters. |
| **ID-6** | `order` is a fractional key unique within `(port, role)`. Reordering changes only the affected key; role changes re-key only the affected branch. |
| **ID-7** | A block's primary parent is exactly one branch or none. Reference edges never create a second home. |

Role-independent dedupe (OD-3) is part of identity: one edge per `(source, target)` pair regardless
of role; `role` is a property of that edge. Different anchors in the same block are different
sources and may target the same block. On load, if a legacy document has both a primary and a
reference edge for the same source-target, keep the primary and drop the reference duplicate with a
warning.

### 7. Undo, composite commands, and repair boundaries

**One user action = one undo entry.** A multi-record action is one typed composite command or one
exact `structure.restore` snapshot, never a chain of separate undo entries. The command layer
validates preconditions before mutating and returns `created` IDs, including `created.anchorIds`.

| User action | Command shape | Undo |
|---|---|---|
| Create anchored child | anchor (if new) + block + primary branch | One composite; removes only records created by the action |
| Branch from selection to an existing block | anchor (if new) + branch | One composite; a reused anchor is not removed |
| Create reference link | anchor (if new) + reference branch | One composite |
| Repair/relink anchor | remove old binding + apply new binding + replace selector | One `anchor.repair`; exact snapshot |
| Attach branches to block | remove anchor/binding + retarget N branches + re-key | One `anchor.attachToBlock`; exact snapshot |
| Delete anchor with branches | attach or delete N branches + remove anchor | One `anchor.delete`; exact snapshot |
| Make home | role swap + two order re-keys + chapter/top-level changes | One `branch.makeHome`; exact snapshot |
| Move here | role promotion + old primary delete + order/chapter changes | One `branch.moveHere`; exact snapshot |
| Split block | content split + new block/branch + anchor migration | One `block.split`; exact snapshot |
| Merge blocks | content merge + branch retarget/dedupe + anchor migration | One `block.merge`; exact snapshot |

- **Typed inverse** for simple record-preserving commands: `anchor.create` (remove binding/record),
  reference `branch.create` (remove edge), `branch.reorder` (old order), `branch.relabel` (old
  label).
- **Exact snapshot** for commands that delete/repoint/re-key records: `anchor.repair`,
  `anchor.attachToBlock`, `anchor.delete`, `branch.makeHome`, `branch.moveHere`, `branch.demote`,
  primary `branch.delete`, `block.split`, `block.merge`, and any primary `branch.create` that removes
  a top-level slot or creates an anchored edge with a root target. Snapshots include full block,
  anchor, and branch records, exact chapter top-level lists, and `remove*` lists; they preserve IDs,
  timestamps, labels, order keys, and roles.
- A failed undo/redo is dropped and reported. It must never leave a half-restored document or an
  orphan record. A structural snapshot must not silently discard text typed after the command; if
  the routing cannot guarantee that, the undo must fail and report.

**Repair boundaries.** Repair is same-block in v1. It keeps the anchor ID, branch IDs, labels, and
targets. It is one undoable command. A resolved edit does not auto-refresh `quote`/`prefix`/`suffix`;
those remain the creation/repair intent. If the binding is later lost, repair shows the stored quote
and the current text. No automatic anchor repair, no automatic quote refresh, and no hidden document
mutation.

**Attach order.** `anchor.attachToBlock` changes every outgoing branch source to `{ blockId }`,
appends them after the block's existing direct branches of that role in their previous anchor order,
and keeps branch IDs/labels/targets. It changes outline order (anchored rows become direct rows) and
is one undo entry.

### 8. Delete, idle, split/merge, and export boundaries

**Delete block (C9).** Default "promote children" promotes every primary child, **including
anchored primary children**. For an anchored primary child whose source anchor is inside the
deleted block, create a new primary branch from the deleted block's primary parent (or make the
child top-level if the deleted block was top-level), remove the old anchored branch, and keep the
target block ID and its subtree. The deleted block's anchors and bindings are removed; reference
branches sourced from those anchors are removed with the block (targets unchanged). Undo restores
the deleted block, its anchors/bindings, and the old anchored primary branches with their original
IDs and order. Never leave an unreachable target.

"Delete subtree" deletes the block and all primary descendants, including anchored primary
descendants; the subtree walk must follow both direct and anchored primary branches. All touching
branches/anchors are removed, external reference parents are listed, and undo restores everything.

**Idle anchor (OD-2).** After the last outgoing branch is removed, the anchor record stays idle: the
marker is hidden, no callout is shown, and the anchor is not listed as broken or in the health panel
until a branch exists. An explicit **Remove anchor** command deletes the idle record and its binding;
it is undoable. An idle anchor is a valid record, not an error.

**Split (OD-6).** M3f implements the minimal split: inside a text leaf; atomic nodes (formula/code/
image) move whole; a split that would separate an atomic node from its surrounding text is rejected
except at a node boundary. Content before the caret stays in the original block; content after moves
to a new block with a new ID. Anchors entirely before stay; anchors entirely after move and update
`blockId`; an anchor spanning the split keeps its ID, keeps the mark on the original side only, is
flagged `split-inside-anchor`, and is not duplicated; its quote is not silently rewritten. Branches
sourced from moved anchors update `source.blockId` and keep their IDs.

**Merge (OD-6/OD-11).** M3f implements the minimal merge: same primary parent port (same block or
same anchor), or both blocks top-level in the same chapter. Cross-anchor merge and cross-chapter
merge are rejected in M3. Anchors move to the surviving block and update `blockId`; branch
retargeting dedupes role-independently; a branch whose source and target become the same block is
dropped with a warning (self-branch); undo restores both blocks and all mappings.

**Export evidence (OD-5).** M3 proves a pure exactly-once export manifest: every primary block/branch
appears exactly once, every shared child appears at its primary home only, reference edges add no
entries, broken/ambiguous anchors add a marker/annotation record but no duplicate target, and the
manifest is deterministic. M4 proves the PDF marker, page count, and rendering. M3 does not need a
PDF to pass AC-56.

### 9. Reference-edge boundary and why no ADR-0006

The M3 reference-edge decisions are binding but do not change the anchor binding/identity contract:

- **OD-3:** branch dedupe is source + target, role-independent; one edge per pair; role is a
  property of that edge.
- **OD-7:** "Make home" requires the target to have a primary parent; a root target disables it and
  offers "Move here" or "Add as child."
- **OD-9:** reference edges render dashed when both endpoints are visible and as "See also"/
  "Referenced by" chips otherwise; M3 shows chapter/label, M4 adds the page number.
- **OD-11:** cross-chapter merge is rejected in M3.
- Reference edges are never read by the outline/layout/export traversal. Layout neutrality is a
  differential gate: `layout(D)` deep-equals `layout(D + reference edges)` for blocks, pages,
  continuations, and primary edges; only the reference-edge list differs.

These are recorded in spec §4.5/§5.3/§7.7 and UX F8. The design package §13.4 marks a separate
ADR-0006 as optional and says the spec proposals may be enough. They are: the reference lifecycle
is a relation/role rule, not a second binding or identity model, and it is fully specified in the
canonical spec. Adding ADR-0006 would duplicate that text without a new decision. If a future
milestone changes reference-edge semantics (for example, two equal structural parents), that
requires a new ADR. This ADR records the boundary so the absence is deliberate, not an omission.

### 10. Consequences

- ProseMirror work: an anchor mark with an `anchorIds` array, node attrs on formula/code/image
  nodes, text-node splitting at selection boundaries, and reconciliation from canonical content.
- The editor adapter converts a selection to a platform-neutral `AnchorBinding` (text node
  paths/offsets, formula node path/form/term, code node path/offsets, image node path/rect), commits
  the active edit first, sends one structural command, and reconciles from `created` IDs. No
  optimistic local mark and no canvas-only anchor.
- The layout package gains a core dependency or a thin adapter in M4; it must consume the same
  resolver and order key, not a second implementation.
- Existing fixtures need selector alignment; M3 fixtures must validate with `parseDocumentJson`.
  M2 readers preserve but cannot edit M3 anchors; this is forward/backward tolerance, not a promise
  that M2 can author M3 features.
- The editor needs the callout lane, anchor markers/chips, see-also/referenced-by chips, and the
  status-chip health sheet. The M3 shell has no permanent right inspector (ADR-0004).

### 11. Alternatives rejected

- **Sidecar ranges:** drift from content on every edit; two sources of truth.
- **DOM/CSS selectors or pixel positions:** platform-specific and not portable to a future iPad.
- **One anchor per atomic node:** fails multiple image regions, multiple formula anchors, and
  overlapping text anchors.
- **A single `anchorId` string only:** cannot represent overlapping anchors on one text run.
- **Record-only selectors with no node binding:** cannot disambiguate two images sharing an asset or
  multiple regions on one node.
- **Auto-refreshing quotes/selectors:** hidden mutations and hidden undo entries.
- **A second resolver in the renderer or layout package:** the "two layout engines" failure the spec
  forbids.
- **Auto-resolving the "clearly best" candidate:** untestable and contradicts D5/AC-55; ranking is
  UI-only.
- **Deleting anchored primary children on block delete:** leaves an unreachable target or silently
  loses a branch; C9 promotes them instead.
- **A schema bump for `anchorIds`:** unnecessary; additive attrs/marks already preserve unknown
  data, and a bump would force a migration for no user-visible gain.

### 12. Gates

- Resolution matrix for all four anchor kinds, including overlapping anchors, duplicate text,
  formula-term repetition, code-offset shifts, image resize/replacement/missing asset, and
  selector-mirror mismatch.
- I10/A3 contiguous-binding tests: multi-node range resolves; a second disjoint run is broken; a
  duplicate array entry is broken; splitting a text node inside another anchor preserves it.
- Identity/undo sequences: create/repair/attach/delete/role change/split/merge/reload; one undo
  entry per user action; exact IDs, order keys, and chapter slots; failed undo is dropped.
- Delete-block C9: promote mode promotes anchored primary children; delete-subtree follows anchored
  branches; no unreachable target; undo restores the old anchored branch.
- Idle anchor: last branch removed → idle, marker hidden, no health listing; Remove anchor is
  undoable.
- Split/merge: spanning anchor clipped/flagged, no duplicate; same-chapter merge; cross-chapter
  merge rejected; duplicate reference edges deduped; self-branch dropped.
- Reference neutrality: layout differential; add/remove/reorder reference edges leaves chapters,
  top-level lists, and primary orders unchanged.
- Export manifest: exactly once; shared child at its primary home only; broken marker but no
  duplicate; deterministic.
- Performance: 1,000 anchors resolved in < 100 ms on load; incremental per edited block; no
  per-keystroke full scan.
- Fixture validity: every M3 fixture parses and validates; no invalid anchor shape.

## Compliance

The binding, selector, resolution, identity, undo, delete, idle, split/merge, and export rules above
are applied in `docs/spec.md` v0.4.5 (§4.4, §4.10, §5.2–§5.4, §7.4, §7.7, §8.2–§8.10, §15.3,
§15.10) and `docs/ux.md` v1.3 (F5, F7, F8, §8.5, §10.3–§10.4, §11.3, §11.5). The design record is
`docs/design/m3-anchors-references.md`. If a Builder finds a conflict with this ADR, the ADR wins
until it is amended; the Builder stops and reports rather than inventing a rule.
