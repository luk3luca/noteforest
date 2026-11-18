# ADR-0005 — Anchor binding, resolution, and identity

- **Status:** Accepted (5 November 2026) by the product owner.
- **Recording:** the binding and identity contract; reference-edge rules live in the spec.

## Context

Anchors must live inside rich content, allow overlapping anchors in one block and several regions
on one atomic node, and survive undo, split/merge and reload with stable identity.

Three designs failed:

- **Sidecar ranges** drift from content on every edit.
- **DOM/CSS selectors or pixel positions** are platform-specific.
- **A single `anchorId` string** cannot represent overlapping anchors on one text run.

The decisive constraints: the content model has no node IDs, and a literal "one mark appearance"
rule would forbid multi-node text anchors. The resolution: the binding lives in canonical content;
the selector is the repair descriptor.

## Decision

### 1. Binding lives in content

**Text: one mark with an array.**

```json
{ "type": "text", "text": "eigenvalue",
  "marks": [{ "type": "anchor", "attrs": { "anchorIds": ["a1"] } }] }
```

- One anchor mark per text node, carrying `anchorIds`; creating an overlapping anchor merges its ID
  into the existing array (splitting text nodes), never a second mark.
- Arrays are sorted by ID so serialization, diffs and undo are deterministic; empty arrays and marks
  with no IDs are removed.
- The mark is non-inclusive at its end: typing inside extends, typing at the right boundary does not,
  typing before moves it.
- An anchor range is the maximal contiguous run covered by the mark. Unmarked text between two
  marked runs means the binding is not contiguous and is broken.
- Copying content must not duplicate an anchor ID.

**Atomic nodes: `attrs.anchorIds`.**

```json
{ "type": "mathBlock", "attrs": { "latex": "Av = \\lambda v", "anchorIds": ["a2"] } }
{ "type": "image", "attrs": { "assetId": "sha256-…", "anchorIds": ["a4", "a5"] } }
```

One node can host several anchors. The node kind must match the anchor kind. Deleting the node
removes the binding; resolution falls back to the selector and reports broken if the quote is gone.
An atomic node with no anchors has no `anchorIds`.

**Legacy read.** A single `anchorId` string is accepted and treated as `["a1"]`; `anchorIds` wins if
both exist. Only `anchorIds` is written.

**No schema bump.** `schemaVersion` stays 2; attrs and marks are additive and unknown data is
preserved.

### 2. Selector rules

`selector` is canonical; top-level `quote`, `prefix`, `suffix` and `occurrenceHint` are mirrors.
Both are written from the same values; on read `selector` wins, and a disagreement loads with a
warning and a `selector-mismatch` flag. The anchor ID is never inside `selector`.

- **Text:** exact plain-text projection; up to 32 code points of context per side; 1-based
  occurrence. Inline math contributes its LaTeX, an image its alt text or `U+FFFC`, boundaries
  `\n`. The mark is truth. Spans may cross paragraphs and list items, never a display-math node, an
  image, a code block or a table cell.
- **Formula:** `whole` requires the node binding and stores the LaTeX; `term` stores the exact
  substring and its occurrence. `latexStart` is a hint, never the sole match. Invalid LaTeX is
  preserved as source.
- **Code:** offsets are Unicode code points, start inclusive, end exclusive; lines are hints.
  `quote` + context is the durable selector; a unique quote resolves even if offsets moved.
- **Image:** `rect` is 0–1 of intrinsic size; a point is a zero-size rect with `point: true` and a
  larger hit area. `assetId` and `crop` are part of the selector: a changed asset or crop is broken,
  never silently reattached. Display resize is safe.

### 3. Resolution

Pure over the canonical document; never mutates content; state is derived.

| State | Meaning | Auto-resolve |
|---|---|---|
| `resolved` | Exact binding or unique fallback. | Yes |
| `ambiguous` | Several plausible candidates. | No |
| `broken` | No candidate. | No |
| `idle` | Record with no outgoing branch. | n/a |
| `block-missing` | The block no longer exists. | n/a |

**Exact-unique rule.** Auto-resolution requires either a binding that exists exactly once and
validates, or a fallback quote/context that matches exactly one candidate. Everything else is
ambiguous: a formula term with two occurrences, a code quote with two, a text quote with two unless
the full context selects one. An image asset change is broken. Ranking is UI order only, never
auto-selection. `lastKnown` is a repair hint, never read by resolution, layout or export. A mark
without a record is inert; a record without a mark resolves by selector.

One resolver in `packages/core`, shared by the editor and the layout engine; no second resolver in
the renderer or layout package. Index per block, cache by content hash, invalidate only edited
blocks, resolve on load, edit, split/merge, image change, anchor commands, undo and recovery.

### 4. Identity

| ID | Invariant |
|---|---|
| ID-1 | Block, anchor and branch IDs are opaque, immutable, never reused; undo restores the same IDs. |
| ID-2 | An anchor belongs to exactly one block; split/merge updates `blockId`, never creates a new anchor. |
| ID-3 | A branch keeps its ID across reorder, relabel and role change; a deleted ID is retired. |
| ID-4 | A branch's anchor source belongs to its source block. |
| ID-5 | Chapter membership derives from the primary root; a block is never in two chapters. |
| ID-6 | `order` is a fractional key unique within `(port, role)`. |
| ID-7 | A block has exactly one primary parent or none; reference edges never create a second home. |

Dedupe is role-independent: one edge per `(source, target)` pair, with `role` as a property.

### 5. Non-obvious boundaries

- **Delete block.** The default promotes every primary child, **including anchored children**: for
  an anchored child whose anchor is in the deleted block, create a new primary edge from the deleted
  block's parent (or make it top-level), remove the old anchored edge, keep the target and subtree.
  Never leave an unreachable target. Delete-subtree follows both direct and anchored primary edges.
- **Idle.** When the last branch is removed, the anchor stays idle: marker hidden, no callout, no
  health warning until a branch exists. **Remove anchor** deletes it explicitly and is undoable.
- **Split.** Minimal split inside a text leaf; atomic nodes move whole. Anchors before stay, after
  move and update `blockId`; one spanning the split keeps its ID, keeps the mark on the original
  side, is flagged `split-inside-anchor`, and is never duplicated.
- **Merge.** Only same parent port or both top-level in the same chapter; cross-anchor and
  cross-chapter merges are rejected. A branch whose source and target become the same block is
  dropped with a warning.
- **Export.** A pure exactly-once manifest: every primary block and edge once, shared children at
  their primary home, reference edges add no entries, broken anchors add a marker but no duplicate.
- **Reference neutrality.** Adding or removing reference edges never changes chapters, order,
  layout or pagination; a differential test asserts it.

## Alternatives rejected

Sidecar ranges; DOM/pixel positions; one anchor per atomic node; a single ID string; record-only
selectors without a node binding; auto-refreshing quotes; a second resolver; auto-resolving the
"clearly best" candidate; deleting anchored children on block delete; a schema bump for
`anchorIds`.

## Consequences

The editor needs an anchor mark, node attrs, text-node splitting and reconciliation from canonical
content. One structural command per user action, with exact snapshots where records are deleted or
re-keyed. Existing fixtures need selector alignment; M2 readers tolerate but cannot author M3
anchors.

## Revisit triggers

- Two equal structural parents (a real second home) would change the model.
- Repair must cross blocks.
- A platform without ProseMirror-shaped content (native iPad editor) needs a new binding ADR.
