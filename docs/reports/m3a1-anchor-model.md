# M3a1 — Anchor model, binding, resolution, validation

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-da994266`  
**Branch:** `t3/m3a1-anchor-model-binding`  
**Base:** `390ad63` (`main`: docs: align spec v0.4.5 and start M3a1)  
**Scope:** pure `packages/core` anchor model only. No commands, UI, TipTap, adapter, e2e, page/PDF, reference
transitions, split/merge, export manifest, or schema bump.

## Summary

M3a1 makes anchors parseable, bindable, inspectable, and resolvable in the pure core:

- typed text/formula/code/image selector shapes and a `validateAnchorSelector` helper;
- `attrs.anchorIds` / text-mark binding helpers with sorted arrays, one anchor mark per text node,
  legacy `anchorId` reads, and empty-binding cleanup;
- plain-text projection with code-point offsets, inline math/image content, block/table barriers,
  text-node splitting, read/merge/remove binding helpers, and content-order keys;
- pure `resolveAnchor` / `resolveBlockAnchors` / `resolveDocumentAnchors` with the five states,
  candidates, reasons, and exact-binding or exact-unique fallback only;
- A1–A12 validation, with the M2 `unsupported-m2-feature` anchor warning removed;
- unit tests for selectors, all four kinds, overlapping/duplicate bindings, atomic multi-anchor,
  idle/block-missing, no mutation, fixture parsing, and the validation rules.

No document mutation: resolution and validation were exercised against deep-frozen documents. No
function reads `lastKnown`; it remains a repair hint only.

## Files

| File | Change |
|---|---|
| `packages/core/src/anchors.ts` | New pure anchor selector, binding, projection, index, resolution, and validation helpers. |
| `packages/core/src/errors.ts` | New anchor-specific `ValidationCode` values. |
| `packages/core/src/validation.ts` | A1–A12 checks, role-independent A8 duplicate detection, A5 selector/mirror warnings, removed the M2 anchor warning. |
| `packages/core/src/index.ts` | Exports `./anchors.js`. |
| `packages/core/test/anchors.test.ts` | New 58-test unit suite. |
| `docs/reports/m3a1-anchor-model.md` | This report. |

No fixture, app, dependency, schema, or command file changed.

## Selector and binding API

Selector types: `TextAnchorSelector`, `FormulaWholeAnchorSelector`, `FormulaTermAnchorSelector`,
`CodeAnchorSelector`, `ImageAnchorSelector`, `UnknownAnchorSelector`, `AnchorRect`,
`AnchorSelector`, `validateAnchorSelector`, `anchorSelectorMirrorIssues`.

Binding helpers:

- `readAnchorIds`, `readAnchorIdsRaw`, `normalizeAnchorIds`, `hasAnchorId`;
- `withTextAnchorIds`, `withAtomicAnchorIds`, `withAnchorMarkIds`, `withAnchorIds`;
- `addAnchorId`, `removeAnchorId`;
- `readContentAnchorBinding`, `mergeAnchorBinding`, `removeAnchorBinding`;
- `splitTextNode`, `splitTextNodeAt`, `getNodeAtPath`, `withNodeAtPath`;
- `plainTextProjection`, `projectionContext`, `textRangesForProjectionRange`;
- `contentOrderKey`, `compareNodePaths`, `nodePathKey`;
- `buildBlockAnchorIndex`, `inspectAnchorBinding`, `checkAnchorBindingKind`.

Binding rules implemented:

- text: exactly one anchor mark per text node, sorted `anchorIds`, overlapping anchors share the
  array, empty marks removed;
- formula/code/image: sorted `attrs.anchorIds`, empty attr removed;
- legacy `anchorId` is read as `["a1"]`; `anchorIds` wins and a conflict is flagged;
- M3 writes `anchorIds` and removes the legacy attr;
- text ranges are split at Unicode-code-point boundaries so a mark starts/ends inside a node.

## Resolution matrix

`resolveAnchor` order: block-missing → idle (no outgoing branch) → binding/selector inspection. The
resolved result is `resolved | ambiguous | broken | idle | block-missing`; candidates and issues are
always derived and never stored.

| Kind | Exact binding | No binding fallback | Ambiguous | Broken |
|---|---|---|---|---|
| Text | One contiguous marked run, inline math/image allowed | unique quote, or exact prefix+suffix selecting exactly one of repeated quotes | repeated quote without unique context | no quote, unmarked gap, duplicate mark entry, block-atomic/table-cell crossing, wrong node kind |
| Formula whole | One formula node with the ID | unique formula `latex` match | multiple matching formula nodes | no match, invalid selector, wrong node kind |
| Formula term | Query inside the bound formula node | unique term occurrence across the block | two or more occurrences even with `occurrenceHint` | term absent, wrong node kind |
| Code | Query inside the bound code block | unique quote across code blocks | repeated quote even with offsets; exact context can select one | quote absent, invalid selector, wrong node kind |
| Image | Node + asset record + unchanged normalized crop + valid rect | none (candidates require confirmation) | one or more image candidates without a node binding | asset changed/missing, crop changed, invalid rect, node missing |

`lastKnown` is never consulted. `orderKey` is a deterministic content-order key for resolved anchors.
Document resolution builds each block index once and only for blocks that contain anchors.

## Validation A1–A12

| Rule | Severity / code |
|---|---|
| A1 unique IDs / existing block | `duplicate-id`, `dangling-anchor` (errors) |
| A2 every content entry has a record; record without binding valid | `anchor-without-record`, `anchor-binding-wrong-block`, `anchor-legacy-conflict` (warnings) |
| A3 one contiguous binding | `duplicate-anchor-binding`, `anchor-not-contiguous`, `anchor-crosses-barrier` (warnings) |
| A4 node kind matches anchor kind | `anchor-kind-mismatch` (warning) |
| A5 selector kind/fields/image geometry/mirror precedence | `invalid-anchor-selector`, `anchor-selector-mismatch` (warnings) |
| A6 branch source anchor / target / self | existing `dangling-anchor`, `dangling-target`, `self-branch` (errors) |
| A7 one primary parent / acyclic | existing `multiple-primary-parents`, `primary-cycle` (errors) |
| A8 role-independent duplicate source-target | `duplicate-branch` (warning; validation reports, load normalization remains M3d/M3f) |
| A9 order unique in `(port, role)` | existing `duplicate-branch-order` (warning) |
| A10 roots in exactly one chapter | existing `unassigned-block`, `block-in-two-chapters` (errors) |
| A11 reference branches not traversed | core test invariant via `directChildIds` / `subtreeBlockIds` |
| A12 unknown kinds/selectors/attrs preserved | `unsupported-anchor-kind` (warning); records/content untouched |

M2 fixtures still parse and validate. The golden formula anchor keeps its legacy selector shape, so A5
emits a warning, not an error; its exact content binding still resolves as a whole formula. Fixture
selector alignment belongs to the M3f fixture pass.

## Tests and timing

| Check | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npx vitest run packages/core/test/anchors.test.ts` | **58/58** pass, **259 ms** |
| `npm test` | **310/310** pass (30 files), **2.00 s** |
| `npm run verify` | Not run, per brief; Orchestrator runs it at integration |

Test coverage includes selector validation, mirror precedence, all four kinds, exact/ambiguous/
broken/idle/block-missing, overlapping text anchors, duplicate text binding, atomic multi-anchor,
code point splitting, projection/barriers, image asset/crop/missing-asset cases, no mutation under
deep freeze, A1–A12, and `golden-eigenvalues` / `broken-anchor` / `shared-child` fixture parsing.
An ad hoc 1,000-anchor document check passed a `< 100 ms` resolution assertion; it was not committed
because M3f owns the performance gate.

## Risks / open questions

- A5 is a warning even when an exact binding resolves, so a malformed selector does not hide a valid
  span. A malformed selector without a binding is `broken`. This is the chosen reading of ADR-0005
  §A5; confirm with the Sentinel if a stricter “selector invalid ⇒ broken even with a binding” rule is
  wanted.
- A8 role-independent duplicates are reported as warnings, not dropped during load. Load-time
  `keep-primary/drop-reference` normalization still needs an owner (M3d or M3f).
- The golden M2 formula selector is not yet aligned to the M3 selector shape; it validates with a
  warning and resolves by exact binding. Do not add M3 fixtures that depend on the old shape.
- `mergeAnchorBinding` trusts its ranges; the command layer (M3a2) must reject empty, inverted,
  cross-block, or multi-cell selections before applying it.
- Image fallback with one candidate returns `ambiguous` (`candidate-requires-confirmation`) rather than
  auto-resolving; this follows “image has no quote fallback” but should be confirmed in the M3e repair
  UX.
- No schema bump and no migration were added, per ADR-0005.

## Next step

M3a2: add `anchor.create`, `anchor.repair`, `anchor.attachToBlock`, and `anchor.delete` as pure typed
commands with inverses, and extend `branch.create` / `block.delete` for anchored sources. Consume
`mergeAnchorBinding`, `removeAnchorBinding`, `inspectAnchorBinding`, and the resolution/order-key API
from this slice; do not add a second resolver.
