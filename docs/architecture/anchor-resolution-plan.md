# Anchor resolution index — plan draft

**Status:** draft for the product owner and the orchestrator. Not an approved batch, not a build
commitment.
**Scope:** candidate 2 of `docs/architecture/survey-2026-11.md`, restricted to one thing: make
anchor resolution one indexed module over the core resolver, shared by the renderer and the layout,
completing ADR-0005.
**Baseline:** shipped 0.1.0, read-only on 18 November 2026. I did not build the app or run any
suite (the survey's caveat still holds). File and line numbers are evidence from this revision;
timings below are budgets and test designs, not measurements.

---

## 1. Goal

One anchor-resolution index, over the one core resolver, owned by the canonical document session
and read by every renderer surface and by the layout, so a block's anchors are indexed once per
content change and every surface reports the same state.

---

## 2. Current state

### 2.1 One resolver, many indexes, no shared cache

`packages/core/src/anchors.ts` is the only resolver. `resolveAnchor` builds a fresh
`BlockAnchorIndex` on every call (`anchors.ts:3017`), `resolveBlockAnchors` builds one per call
(`anchors.ts:3067`), and `resolveDocumentAnchors` builds one per anchor-bearing block per call
(`anchors.ts:3097-3104`). Nothing survives the call. Every consumer below either calls
`resolveAnchor` per anchor or rebuilds a block index per block.

| Consumer | Where | What it calls | What it caches today |
|---|---|---|---|
| Continuous block markers, callout live state | `editor/views/BlockViews.tsx:619`, `:787`; `lib/adapter.ts:367` | `tree.anchorState` → `resolveAnchor` per branch anchor | component `useMemo` keyed by the runtime version; no block index survives the memo |
| Block warning chip | `BlockViews.tsx:1164` | `resolveAnchor` per branch source | same |
| Formula term overlay | `BlockViews.tsx:653` | `resolveAnchor` | same |
| Code anchor overlay | `BlockViews.tsx:683` | `resolveAnchor` | same |
| Image region markers | `editor/views/ImageNodeView.tsx:288` | `resolveAnchor` | same |
| Sidebar anchor groups, block menu | `shell/Sidebar.tsx:774`; `actions.ts:2075` | `tree.anchorState` | none |
| Find outline order | `lib/find.ts:539-546`, `:568-570` | `resolveAnchor` per anchor | local `Map` for one scan only |
| Find highlight ranges | `find.ts:669` | `buildBlockAnchorIndex` per scanned block | none; the inspection `WeakMap` (`find.ts:500-519`) is per freshly built index |
| Document Health | `lib/document-health.ts:538` | `resolveDocumentAnchors` whole document | one report per `runtime.version` (`shell/useDocumentHealth.ts:22-49`), and `version` also advances on selection and collapse, so view-only changes re-audit the whole document |
| Health content references | `document-health.ts:370` | `buildBlockAnchorIndex` per anchor block | none |
| Anchor health rows (test-facing) | `lib/anchor-health.ts:233` | `resolveDocumentAnchors` whole document | none |
| Page find ranges | `page/find-page-ranges.ts:273` | `buildBlockAnchorIndex` per result | none |
| Editor find decorations | `editor/find-decorations.ts:115` | `buildBlockAnchorIndex` per block per rebuild | none; this one reads the live editor buffer and must stay independent |
| Page/PDF layout | `packages/layout/src/layout.ts:1534-1611` | **second derivation** from measured rects and `occurrenceHint` | measurement only |
| Export plan (core, tests only) | `packages/core/src/export-plan.ts:166` | `resolveDocumentAnchors` | none |

The renderer also passes session asset availability on some paths and not others: `BlockViews`
and `ImageNodeView` pass it, while `find.ts` resolves without it (and `buildExportPlan` accepts it
but has no app caller). Image state can therefore differ between the canvas and the find outline
today.

### 2.2 The layout's second derivation, exactly

For every anchor record whose `blockId` is the block being placed (`layout.ts:1544-1545`):

1. Collect the measured anchors with that ID, sorted by measured occurrence (`layout.ts:1546-1548`).
2. Zero rects → `broken` (`:1551-1552`).
3. More than one → read `record.occurrenceHint`; if a rect has `occurrence === hint - 1`, pick it
   and call the anchor `resolved`; otherwise `ambiguous` (`:1553-1561`).
4. Exactly one → `resolved` (`:1562-1564`).
5. Emit `broken-anchor` / `ambiguous-anchor` defects, or a warning point (`:1590-1608`).

Why it can disagree with core:

- **Two different numbering spaces.** `occurrenceHint` is the 1-based occurrence of the quote in
  the block projection (`anchors.ts:1795-1806`) or of the code token in the code text
  (`anchors.ts:1840-1857`). `MeasuredAnchor.occurrence` is the 0-based order of measured wrappers
  for that anchor (`apps/desktop/src/renderer/src/page/measurement.ts:377-378`; the estimate port
  re-sorts by y/x and renumbers, `packages/layout/src/estimate.ts:513-518`). A text run split over
  several text nodes produces several wrappers for one quote; `hint - 1` then selects the hint-th
  **wrapper**, not the hint-th **quote**.
- **Different hint sources.** Layout reads the top-level mirror `record.occurrenceHint`
  (`layout.ts:1554`; mirror at `packages/layout/src/types.ts:41`). Core prefers
  `selector.occurrenceHint` (`anchors.ts:2083-2111`). A mirror disagreement is allowed and flagged
  (`selector-mismatch`), so the two derivations can read different numbers.
- **Rects come from bindings, not from resolution.** The page markup wraps `anchorIds` from
  content (`page/segments.ts:124-167`), and the measurement pass collects those wrappers
  (`measurement.ts:371-387`). A record with no binding but a unique quote is **resolved** in core
  and has zero rects in layout, so layout calls it **broken**. A record with two plausible
  candidates can still have one wrapper — a formula term repeated inside one formula — and be
  called resolved. This is the selector-fallback vs measured-marks disagreement the survey named.
- **Layout cannot see the rest of the contract.** It never reads asset availability, crop, node
  kind, duplicate or disjoint bindings, barrier crossings, selector validity, or repair flags. All
  of those change core state without changing rect count.

### 2.3 The layout's test path cannot see M3 anchors

`estimate.ts:178-186` reads only `mark.attrs.anchorId`, and `:200-209`, `:453`, `:485`, `:498` read
only `attrs.anchorId`. The M3 fixtures write `anchorIds` arrays (`fixtures/m3-anchor-kinds.json`,
`m3-image-regions.json`, `m3-split-merge.json`). So the estimate port (unit tests, labs) sees zero
rects for every M3 anchor. Shipping Page/PDF uses the DOM adapter, which does read `anchorIds`
(`page/segments.ts`); this blindness is a test-fixture risk, not a shipping bug, but it must be
fixed before layout tests can prove anything about M3 states.

### 2.4 Cost (inferred from code, not measured)

- Per-anchor callers rebuild a block index per anchor (`anchors.ts:3017`).
- `resolveAnchors` scans every anchor record for every placed block: O(blocks × anchors) per layout
  run, with an `Object.values` allocation each time (`layout.ts:1544`). `buildEdges` does a linear
  `find` per branch (`layout.ts:1657-1660`).
- Health, find and export each run their own full or per-block pass. The status bar's health audit
  re-resolves the whole document whenever `runtime.version` advances
  (`shell/useDocumentHealth.ts:29-49`), and `version` also advances on selection and collapse, so a
  click can re-run a full resolution today. None of these numbers is measured; §5.4 says how to
  measure them.

---

## 3. Target module

### 3.1 Where it lives

`packages/core/src/anchor-index.ts`, exported from `@noteforest/core`.

It composes, and does not reimplement, the resolver:

- `resolveDocumentAnchorsWithIndexes(document, indexes, options)` — new export, extracted from
  today's `resolveDocumentAnchors` with no behaviour change. It owns the state precedence
  (`block-missing` → `idle` → binding/fallback), `withRepairFlags`, grouping and ordering. The
  private `resolveAnchorWithIndex` stays private; the document-level function is the only new
  resolver entry.
- `buildBlockAnchorIndex` — the per-block cache unit (already public).

No resolution rule is copied into the new module. If the builder finds itself re-implementing
`idle`, `block-missing`, duplicate-binding or barrier checks, the seam is wrong: stop.

**Ownership.** `DocumentSession` owns exactly one index per open document, because it is the single
canonical commit point (`state/document-session.ts`). It exposes `anchorIndex`; `DocumentRuntime`
forwards it. Layout does not own it and does not import core; it receives a plain projection at its
seam (§3.3).

### 3.2 Types (core)

```ts
export interface AnchorIndex {
  readonly identity: { readonly documentId: string; readonly revision?: number };
  readonly stats: AnchorIndexStats;

  entry(anchorId: string): AnchorResolution | null;
  /** Every resolution in anchor-ID order (the resolver's `anchorIds` order). */
  all(): readonly AnchorResolution[];
  /** The cached block index; builds and remembers it on first use. */
  blockIndex(blockId: string): BlockAnchorIndex | null;

  /** The layout-facing projection; built once per index instance. */
  view(): AnchorResolutionView;

  update(document: Document, change?: AnchorIndexUpdate): AnchorIndex;
}

export type AnchorIndexUpdate =
  | { blockKeys: ReadonlyMap<string, string>; editedBlockIds?: readonly string[] }
  | { blockKeys?: undefined; editedBlockIds?: undefined };

export interface AnchorIndexStats {
  /** Per-block indexes built by the last update. */
  blocksIndexed: number;
  /** Cached per-block indexes reused by the last update. */
  blocksReused: number;
  /** Anchors resolved by the last update. */
  anchorsResolved: number;
}

export interface AnchorViewEntry {
  anchorId: string;
  state: AnchorState;
  /** `resolution.resolved?.range`, never a candidate. */
  range: AnchorResolvedRange | null;
}

export interface AnchorResolutionView {
  documentId: string;
  revision?: number;
  /** Every anchor, including idle and block-missing, under its declared blockId; entries in content order. */
  byBlock: Readonly<Record<string, readonly AnchorViewEntry[]>>;
}

export function buildAnchorIndex(
  document: Document,
  options?: AnchorResolutionOptions & { blockKeys?: ReadonlyMap<string, string> },
): AnchorIndex;
```

The entry value is the existing `AnchorResolution`, not a new shape. Health needs `candidates` and
`repairFlags`; the warning chips need `state` and `reason`; the layout needs `state` and `range`.
One value, one derivation, no translation table to drift.

Naming: `buildAnchorIndex` rather than a second `resolveDocument` keeps the vocabulary honest —
`resolveAnchor*` is the resolver, `AnchorIndex` is the cache. `blockIndex(blockId)` is the
`indexForBlock` read; `update` is the invalidation entry point.

### 3.3 The layout seam

```ts
// packages/layout/src/types.ts (structural mirror; no core import)
export type AnchorViewState = 'resolved' | 'ambiguous' | 'broken' | 'idle' | 'block-missing';
export interface AnchorViewRange { kind: 'text' | 'formula' | 'code' | 'image'; nodePath?: readonly number[] }
export interface AnchorViewEntry { anchorId: string; state: AnchorViewState; range: AnchorViewRange | null }
export interface AnchorResolutionView {
  documentId: string;
  revision?: number;
  byBlock: Readonly<Record<string, readonly AnchorViewEntry[]>>;
}

export function layoutDocument(
  document: NoteDocument,
  port: MeasurementPort,
  options: Partial<LayoutOptions>,
  pageSetup: PageSetup,
  anchorView?: AnchorResolutionView,   // required when the document has anchor records
): ContinuousLayout;
```

Rules at the seam:

- If `Object.keys(document.anchors).length > 0` and `anchorView` is missing, throw. No silent
  fallback to rect counting.
- If supplied, verify `documentId` and, when both are defined, `revision`; mismatch throws, the same
  way `assertDocumentIdentity` does for print (`packages/pdf/src/printModel.ts:283-304`).
- Layout keeps its own `AnchorState` subset for attachments (`types.ts:186`) and maps
  `idle`/`block-missing` to "no attachment".
- `computePageModel` forwards the view (`page/model.ts:41-69`); the Page hook passes
  `runtime.anchorIndex.view()`. `ExportSnapshot` carries it
  (`apps/desktop/src/shared/export.ts:143-156`), the validator accepts it
  (`main/export-service.ts:51-63`), and the print entry passes it
  (`apps/desktop/src/renderer/src/print/entry.tsx:445` heals the second measured run).
- An integration test assigns the core `AnchorResolutionView` to the layout type. If the mirror
  drifts, the test does not compile.
- The picker reads `state` and `range.kind` today; the full range travels so code-line and
  formula-term geometry can use it later without reopening the seam.

### 3.4 Why this shape

- **Depth.** Seven read/write members hide index building, key comparison, lazy block indexes,
  grouping, ordering, projection, identity and stats.
- **Locality.** Invalidation lives in one module and one owner: one build plus five refresh points
  in `DocumentSession`. A future rule (a new anchor kind) lands once.
- **Leverage.** Every read path in §2.1 and the layout derive from one resolution pass.
- **Deletion test.** Delete the module and the local resolution strategies, the layout's second
  derivation and the full-document passes reappear across callers. It earns its keep.
- **Seam.** The layout seam is a data projection, so the layout stays core-free. The session is the
  one adapter that produces it; the print snapshot is a transport of the same data, not a second
  adapter.
- **The interface is the test surface.** Cache, invalidation, parity and projection are testable
  without React, DOM, Electron or layout.

### 3.5 Interface rules

- Resolution stays pure; the index never mutates the document, content, selector or record.
- `entry`, `all`, `view` are reads. Only `update` changes the index, and it returns a new instance.
- An index describes exactly one document snapshot. `update` receives the next snapshot; an index
  is never shared across documents or runtimes.
- The view is derived state only. Nothing resolved is written to `document.json`, the session, or
  the editor.

---

## 4. Semantic state vs geometry

| Layer | Owns | Does not own |
|---|---|---|
| Core index | `resolved` / `ambiguous` / `broken` / `idle` / `block-missing`, the reason, candidates, the resolved range (node paths, code-point offsets, normalized image rect, crop, point), binding kind, `orderKey`, issues, repair flags | rectangles, DOM, pages |
| Layout | The rectangle picker over `BlockMeasurement.anchors`, the union/attach points, warning points, `broken-anchor`/`ambiguous-anchor` defects, callout and edge points | any state of its own |
| Renderer | DOM overlays (formula term rect, code highlight, image region scaled to display), markers, chips, Page dot, Health rows | state derivation |

### 4.1 The picker

Input: one `AnchorViewEntry` and the block's measured anchors (`MeasuredAnchor[]`,
`types.ts:113-122`). Output: `{ rect, attachPoint, warningPoint }`.

| Entry | Picker result |
|---|---|
| `resolved`, ≥ 1 measured rect | `rect` = union of that anchor's measured rects; `attachPoint` = right-centre of the rect with the highest measured occurrence (the range's last line, spec §8.7); no warning |
| `resolved`, 0 measured rects | `rect` = the block's content rect; `attachPoint` = its right-centre; anchor ID recorded in a new `ContinuousLayout.anchorGeometryFallbacks` diagnostic; no defect, no dot (see §6.1, item 4) |
| `ambiguous` | `rect` = null; `warningPoint` as today; `ambiguous-anchor` defect |
| `broken` | `rect` = null; `warningPoint` as today; `broken-anchor` defect |
| `idle` | no attachment, no defect, no dot |
| `block-missing` | no attachment (the block is not laid out); Health only |

The union rule is sound because a resolved binding is contiguous by definition: every measured
wrapper for that anchor belongs to its range. A resolved range with several rects and a resolved
range with one rect take the same path.

`AnchorAttachment` (`packages/layout/src/types.ts:280-288`) gains `attachPoint`. `buildEdges`
(`layout.ts:1662-1668`) and the Page same-page edge start (`packages/layout/src/page-edges.ts:234-259`)
use it instead of the rect's right-centre. Callout x still uses `rect.x` (`layout.ts:923-928`), so a
callout aligns to the anchor's left edge.

### 4.2 What the layout deletes

- The rect-count state derivation and the `occurrenceHint` branch (`layout.ts:1549-1564`).
- The `occurrenceHint` field of the layout mirror and its copy in `page/adapter.ts:126-129`, once
  nothing reads it.
- The unused `anchorStates` map (`layout.ts:189`; no reader in the repo).
- The per-block scan of every anchor record (`layout.ts:1544`) — replaced by
  `view.byBlock[block.id]`, O(anchors per block) instead of O(blocks × anchors).
- The linear attachment lookup per branch (`layout.ts:1657-1660`) — replaced by one
  `Map<anchorId, AnchorAttachment>` per run. Same behaviour, no quadratic scan.
- No fallback derivation remains. The 5th parameter is optional only so anchor-free documents
  (most layout tests and pdf fixtures) need no view; an anchor-bearing document without a view
  throws.

### 4.3 What the layout keeps

Measurement (`MeasurementPort`, DOM adapter, estimate adapter), measured rects, union math, warning
points, defect codes and copy, callout stacking, pagination inputs, and the Page/print geometry.

### 4.4 What the renderer deletes

`tree.anchorState` stops resolving and reads `runtime.anchorIndex.entry(id)`. `BlockViews`,
`ImageNodeView`, `adapter.toCallout`, `Sidebar`, `actions`, `find`, `document-health` and
`anchor-health` read entries, `all()` or `blockIndex()`. The Continuous DOM geometry (term overlay,
code highlight, image region) stays exactly as it is: it is geometry over the live editor, not
state.

### 4.5 Edge cases and their behaviour

| Case | Behaviour |
|---|---|
| Resolved range, no measured rect | Block content rect; `anchorGeometryFallbacks` entry; state stays `resolved`; no dot |
| Resolved text range spanning a page break | Union rect for callout x; attach point from the last rect; `resolveAnchorLocal` keeps its fragment check and falls back to the fragment centre when the point is outside |
| `ambiguous` / `broken` anchor with no branch | Core says `idle` (idle wins); no attachment, no defect, no dot |
| Anchor record on a missing block | `block-missing`; Health only; layout never iterates it |
| Anchor with only a reference branch | Not idle; attachment and state shared; no primary callout; the reference edge starts at the attach point |
| Duplicate ID in one block | Core `broken` (`duplicate-binding`); measured rects unused; warning point |
| Duplicate ID in two blocks | One record; resolution uses its declared block; layout attaches only the declared block; the second binding never becomes a second anchor |
| Image anchor, asset or crop changed | `broken` (or `idle` if branchless); Page dot; no arrow at the region |
| Two image regions on one node | One measured rect for both; each callout attaches to the node; region precision stays in the renderer and print overlay |
| Code anchor, unique quote | One measured rect; callout at the token or line |
| Code anchor, repeated quote | `ambiguous` (even with offsets or context); no rect; dot |
| Formula term, one occurrence | Formula node rect; the term overlay is Continuous-only |
| Formula term, repeated | `ambiguous`; dot |
| Selector-resolved anchor, binding gone | `resolved`; block rect fallback; no dot |
| Anchor mark without a record | Inert; Health orphan reference; not in the index (there is no anchor), so no attachment |
| Idle anchor with a stale mark | `idle`; no attachment, no defect |
| Anchor on an orphan block | Health lists it; no Page/PDF placement (the block is not laid out) |
| Block deleted | Its anchors become `block-missing`; the cached block index is dropped |
| Failed content commit after an accepted change | Index reflects the accepted prefix; the failing block is unchanged; state coherent before `recordFailure` |
| External reload | `reset` rebuilds; no entry survives |
| Two documents open | One index per session; no sharing |
| Guest `.md` view | No core document or session; the index is not involved |
| Read-only document | Index built and read; no writes |

---

## 5. Cache and invalidation

### 5.1 Unit and key

The cached unit is the **per-block `BlockAnchorIndex`** (anchor occurrences, projection, segment and
formula/code/image indexes, `anchors.ts:1215-1227`). The key is the exact JSON text of the block's
canonical content, the same string `DocumentSession` already keeps (`document-session.ts:313-318`).
No digest, so no collision and no new dependency.

The session supplies `blockKeys` for comparison (a new `blockContentKeys()` read of the map it
already keeps). The index stores the key of the content it **actually indexed** (it re-serialises
the block it builds); a supplied key only decides whether to rebuild. A stale or partial key map
therefore causes an extra rebuild, never a silently stale index.

Resolution itself is re-run for every anchor on every update. That is deliberate: an anchor's state
also depends on its record, on branches (`idle`), on document assets and on session availability, so
a per-block resolution cache would need those in the key. Resolution is O(anchors) and the expensive
part is the projection walk; if profiling shows otherwise, caching entries per block is a later,
local change.

A block with no anchor record and no cached block index is not indexed on update; `blockIndex()`
builds it on demand for find, and the key check keeps it fresh afterwards.

### 5.2 Event matrix

| Event | Where it happens | Index update | What is rebuilt |
|---|---|---|---|
| Load / open | `DocumentSession` constructor, after `recomputeHashes` | `buildAnchorIndex(document, { blockKeys, assetAvailability })` | every anchor-bearing block |
| Text/atomic content edit | `commitContent` (`document-session.ts:249-283`) | `update(document, { blockKeys, editedBlockIds: accepted })` | only the edited blocks; also on the accepted prefix when a later change fails |
| Structural command (split, merge, anchor create/repair/remove, branch add/remove) | `acceptStructural` (`:175-188`) | `update(document, { blockKeys })` after `recomputeHashes` | only blocks whose content key changed; all anchors re-resolved |
| Undo / redo (structural) | `acceptUndo` (`:205-217`), `acceptRedo` (`:220-232`) | same as structural | same |
| Text undo / redo | editor buffer → next `commitContent` | edited-block update | the edited block |
| Image replacement / crop | structural command (`block.editContent` on the image block) | structural update | the image block; availability read at update time |
| Asset availability changed by a command | `DocumentRuntime.mergeAvailability` before `acceptStructural` (`runtime.ts:772-777`) | structural update reads `ports.assetAvailability()` | no block index rebuild; image states flip |
| Reload / recovery / external change | `reset` (`document-session.ts:296-302`) | full build | everything |
| Benchmark reflow | `replaceDocument` (diagnostic) | no update | nothing; it changes chapter order only, and anchor state does not depend on chapters |

Ordering rule: canonical caches become coherent **before** any port callback. The session will move
`recomputeHashes()` and the index update ahead of `bumpVersion()` in the four accept methods; today
`acceptUndo`/`acceptRedo` recompute after `bumpVersion` (`:213-216`, `:228-231`). The same rule
covers the failure path: the accepted prefix of `commitContent` is reflected in the index before
`recordFailure` runs. The session test asserts the order.

### 5.3 The 1,000-anchor target

ADR-0005 does not state a number; the existing guard is the number: a valid 1,000-anchor document
resolves in under 100 ms (`packages/core/test/anchor-performance.test.ts:187-219`). The index must:

- keep that guard for the **cold build** (index construction, not just resolution);
- make every later read O(1) per anchor and O(anchors per block) per layout block;
- update a one-block edit in under 16 ms (one 60 Hz frame), protecting the keystroke-to-paint
  budget of 50 ms (`docs/definition-of-done.md:274-288`, spec §14.2);
- keep open-to-interactive inside the DoD budget (300 blocks < 2 s, 1,000 blocks < 5 s). The index
  moves work rather than adding it: today the status bar's health audit resolves the whole document
  at mount and again on every `runtime.version` advance, including selection and collapse; after the
  change those reads are lookups.

### 5.4 `test:perf` before/after plan

1. **Before** (on the untouched baseline): run `npm run test:perf`, keep
   `artifacts/perf/performance.json`, and record machine, date and fixture hashes (spec §14.4).
   The current seeds have **no anchors** (`apps/desktop/src/main/library.ts:4190-4229`), so add an
   anchored variant before the "before" run if the orchestrator wants app-level numbers: every
   tenth block gets a text anchor and a primary branch to another block, plus a few code and formula
   anchors. Without it, only the unit benchmark measures the index, and the plan must say the app
   budget is unmeasured.
2. **After**: same machine, same fixtures, 5 runs, median and p95. Compare open-to-interactive,
   keystroke-to-paint and `perf.reflow.p95`; record the index's own numbers
   (`stats.blocksIndexed`, cold build, warm update) from the core benchmark.
3. **Acceptance:** no DoD budget regresses; the warm update is under 16 ms p95 and indexes exactly
   one block; Page/Health reads after a commit index zero blocks.
4. Record the numbers in the builder's report, not in this plan.

---

## 6. The visible behaviour change (owner review, not a decision)

ADR-0005 already forbids auto-resolution: "exactly once" or ambiguous (`adr/0005:90-95`). Aligning
the layout with core is therefore **sanctioned** behaviour, but it changes what the Page and the PDF
show. It is owner-visible and this plan does not decide it.

Continuous is unchanged: it already reads core. The changes are Page Read, the PDF, and the PDF
preflight summary (`anchorWarningBlockIds`, `packages/pdf/src/printModel.ts:306-317`).

### 6.1 What changes

1. **Multi-node text anchors.** A text anchor whose mark covers several text nodes (a run across
   inline math, a hard break or a paragraph) is `resolved` in core by exact binding. Today the Page
   either shows an ambiguous dot or, when the hint happens to match, draws the callout on one
   hint-picked line. After: no dot, and the callout aligns to the union box with its arrow leaving
   from the range's last line.
2. **Ambiguous callouts.** A repeated formula term has one measured rect (the math node), and a
   repeated code token can be picked by a matching hint, so the Page draws a callout; core says
   `ambiguous`. After: the Page shows the ambiguous dot and the branch is drawn from the warning
   point. This is the exact case ADR-0005 forbids auto-resolving.
3. **Image anchors whose asset or crop changed.** Core says `broken` (spec §8.6, §13.2). Today the
   Page still draws the anchor on the image node because the rect exists. After: the Page shows the
   lost-anchor dot instead of pointing at the wrong region. The PDF carries no anchor marks (paper
   rule B1); the export preflight reports the same anchor state.
4. **Selector-resolved anchors with no binding.** Core resolves by a unique quote; the Page has no
   measured wrapper, so today it calls them broken. After: no dot; the callout attaches to the whole
   block. That is a geometry fallback for a range measurement cannot locate (spec §8.7 defines text
   geometry from the resolved range, which has no wrapper here). Recorded in
   `anchorGeometryFallbacks`, no new user-facing copy.
5. **Idle anchors.** Core says `idle` (hidden, no health warning). Today an idle anchor with no
   rect can produce a `broken-anchor` layout defect and a dot. After: no attachment, no defect.

### 6.2 Scope

Page Read, the exported PDF, and the print preflight summary. No copy changes, no new UI, no change
to Continuous, Health, Find or the editor. No schema change.

### 6.3 What the product owner must see

A review document with one case per row above, compared in three places: Continuous (unchanged),
Page Read, and the exported PDF. The two judgements asked for are visual, not architectural:

- Is it acceptable that a multi-line text anchor's callout aligns to the range's left edge and its
  arrow leaves from the range's last line (one box for the whole range), instead of the single
  hint-picked line it uses today?
- Is a Page ambiguous dot acceptable where a callout used to be drawn (the ADR-required reading),
  or does Page need a display rule for ambiguous anchors before this ships?

If the owner rejects the display, the answer is a UX decision about how ambiguous anchors are drawn,
**not** keeping the second derivation: keeping it would keep the ADR-0005 violation. That is the
orchestrator's call to frame.

---

## 7. Migration steps (each leaves the suite green)

Each step is a separate commit on the batch branch; steps 1–2, 3–4 and 5 can be separate batches.

**Step 0 — baseline evidence (no code).** `npm test`; `npm run test:perf` on the untouched
baseline; Page/PDF screenshots for the review fixture. Record machine, date, numbers.

**Step 1 — core index, no callers.** Extract `resolveDocumentAnchorsWithIndexes` from `anchors.ts`
with no behaviour change. Add `anchor-index.ts` and its tests. Export from
`packages/core/src/index.ts`. Nothing consumes it yet. Green: all existing tests unchanged, new
parity/cache tests pass.

**Step 2 — the session owns it.** Add the optional `assetAvailability()` port, `anchorIndex` and
`blockContentKeys()`, refresh in constructor/`commitContent`/`acceptStructural`/`acceptUndo`/`acceptRedo`/`reset`, move
the cache refresh before `bumpVersion`, add `DocumentRuntime.anchorIndex`. Add session tests for
cache updates and ordering. No consumer changes. Green. Measure open cost here; if it misses the
open-to-interactive budget, stop and report before continuing.

**Step 3 — layout can see M3.** Fix `estimate.ts` to read `anchorIds` (marks and atomic attrs) with
the legacy fallback; add a test that an M3 fixture produces measured rects. No state change yet.
Green: legacy fixtures unchanged, M3 layout geometry now exists.

**Step 4 — the layout consumes the view.** Three commits:
`4a` add the optional 5th parameter, identity guard and picker; keep the old derivation for callers
without a view; `4b` thread the view through `computePageModel`, the Page hook, the print snapshot,
`ExportSnapshot` and its validator; give layout tests a small view helper; add picker and parity
tests; `4c` delete the old derivation, the `occurrenceHint` reads and the dead `anchorStates` map;
make the view required for anchor-bearing documents. Green at each commit.

**Step 5 — the renderer reads the index.** In this order, each green: `tree.anchorState` and its
callers; `BlockViews` (markers, term/code targets, warnings, live callout); `ImageNodeView`;
`adapter.toCallout`; `find` (order plus block indexes); `document-health` and `anchor-health`.
Then remove the now-unused resolution imports. Green; the UI is where dots appear/disappear (§6).

**Step 6 — owner review and UI evidence.** Add the review UI fixtures and screenshots for §6.3.
No copy changes. The product owner compares Continuous / Page / PDF. If a case is rejected, stop and
ask; do not ship a half-aligned surface.

**Step 7 — perf and integration.** Add the warm-update perf guard and the anchored `test:perf`
scenario; run the before/after protocol; one full `npm run verify` at integration.

---

## 8. Tests and evidence

| Area | Test | What it proves |
|---|---|---|
| Resolution matrix per kind | `packages/core/test/anchor-index.test.ts`: every fixture (M2 + M3 + `broken-anchor`, `golden-eigenvalues`) plus a generated 1,000-anchor document | `entry(id)` deep-equals `resolveAnchor(document, id)` for every anchor, all five states, all four kinds |
| Cache | same file: build, `stats`; update with one `editedBlockId` | `blocksIndexed === 1`, `blocksReused === n-1`, untouched `blockIndex()` objects identical, rebuilt values equal to a fresh build |
| Invalidation | same file: add/remove a branch; edit an anchor record; change content in a clone; change `assetAvailability`; reload `reset`; pass a stale key | idle ↔ resolved and image states flip with `blocksIndexed === 0`; content change reindexes only that block; a stale key causes a rebuild, never a stale reuse; no cross-document reuse |
| View | same file: identity, grouping, idle/block-missing inclusion, range null for ambiguous | the layout projection has exactly the semantic data and no candidates |
| Session ownership | `apps/desktop/test/document-session.test.ts` | index updated before `bumpVersion`/`notify` on commit, structural, undo, redo, reset; accepted prefix on a failed commit; availability read |
| Layout picker | `packages/layout/test/anchor-view.test.ts` | union of several rects; attach point at the last rect; zero-rect resolved → block rect + diagnostic; ambiguous/broken warning point; idle skipped; identity mismatch throws |
| Core ↔ layout parity | `apps/desktop/test/anchor-index-parity.test.ts` on real fixtures + estimate port | every placed anchor's layout state equals the index entry; `broken-anchor`/`ambiguous-anchor` exactly on non-resolved placed anchors; the core view type assigns to the layout mirror |
| Health vs canvas | extend `apps/desktop/test/document-health.test.ts` | `auditDocumentHealth` rows and the index agree for every fixture; the audit does no block-index rebuild after a commit |
| Split / merge | extend `anchor-index.test.ts` and the parity test with `m3-split-merge` | split anchors keep their state and block ownership; merge drops/keeps exactly as core does |
| Image replacement | parity test with `m3-image-regions` (`m3i-a-replaced`) and an availability change | core broken → Page dot; no arrow drawn at a wrong region |
| UI / Page | extend `tests/ui/m4c1-print-compositor.test.mjs` or add one suite | Page dot ⇔ core `broken`/`ambiguous` on the review fixture; a multi-node text anchor has no dot and its callout sits below the union; the PDF preflight block list matches |
| Perf | extend `packages/core/test/anchor-performance.test.ts` + `tests/perf/m2-performance.test.mjs` with the anchored seed | cold < 100 ms; warm < 16 ms and one block; app budgets recorded before/after |
| Contract | `apps/desktop/test/export-snapshot.test.ts` / export-service tests | the snapshot carries and validates the view; a stale revision is refused |

Commands: `npm test` per step; `npm run e2e` for the critical path; `npm run test:ui` for the Page/UI
suites touched in steps 5–6; `npm run test:perf` for step 7; `npm run verify` once at integration.

---

## 9. Non-goals

- No schema, selector or binding change; `schemaVersion` stays 2; no migration.
- No auto-resolution, no new repair flow, no new user-facing copy.
- No change to Continuous callout placement, editor decorations or term/highlight geometry.
- No code-anchor line geometry, formula-term rectangle, or image-region precision work; the picker
  consumes what measurement provides. The one geometry change is the text union box and its
  last-line attach point, required to render a resolved multi-node range (spec §8.7).
- No change to the live editor find-decoration path (it must read the editor buffer).
- No main-process index; `buildExportPlan` keeps calling the pure resolver.
- No new dependency; no crypto hashing.
- No caching of DOM measurement or of the Page layout.
- No performance claim without the before/after numbers.

---

## 10. Rejected alternatives

- **A second resolver in the layout or renderer** — the ADR forbids it and it is the current bug.
- **Per-surface recompute (today)** — no cache, one strategy per surface, no shared test surface.
- **Store resolved state in the document or session** — derived state is never stored (spec §4.4, §8.3).
- **Cache by document revision only** — every keystroke invalidates everything; also over-invalidates on unrelated revisions.
- **Cache by anchor ID** — the same ID changes state whenever content moves.
- **A 32-bit content hash instead of the JSON key** — collision could skip a rebuild; the session already has the exact string.
- **Make `packages/layout` import `@noteforest/core`** — collapses the mirror but is a package-boundary change of its own; the projection seam is smaller.
- **Pass full `AnchorResolution` objects to layout** — gives layout semantics it must not interpret; the `{state, range}` view is the seam.
- **Build the index lazily in every surface getter** — hidden work during render; the session owns the update.
- **Wrap page measurement by resolved range instead of by binding** — bigger pipeline change; union of binding rects is already the correct box for a resolved range.
- **Keep the hint-based layout derivation behind a flag** — a second derivation left alive will drift; delete it.
- **Put the index in the runtime instead of the session** — the runtime would have to observe five session mutations from outside; worse locality.

---

## 11. Risks and stop conditions

**Risks**

- **Owner-visible Page/PDF changes** (§6). Mitigation: the review fixture and a stop before merge.
- **Open cost** from eager resolution. Measured in step 2; if it misses the DoD open budget, the
  fallback is a lazy first read (still one module), which is an orchestrator/owner decision.
- **Wide signature change** (`layoutDocument`, `computePageModel`, `ExportSnapshot`). Mechanical but
  touches many tests; the Sentinel checks that no fallback path survives.
- **Session responsibility creep.** Keep it to one getter, one private update helper and the five
  refresh call sites; the index logic stays in core.
- **Resident memory.** Per-block indexes stay alive; at 1,000 anchor-bearing blocks this is more
  than the current build-and-discard passes. Measure RSS in step 7; if it hurts, the cache can drop
  non-visible blocks without changing the interface.
- **Print snapshot size** grows with the view (ranges included). Measure IPC time and RSS; if it
  hurts, send only `{ state, range.kind }` per anchor.
- **Stale-by-one commit** in the Continuous canvas: the index reflects canonical content, the
  editor buffer may be one commit ahead. This is existing behaviour for warnings; do not "fix" it
  by indexing the buffer.

**Stop conditions**

- The owner rejects a visible Page/PDF change after the review; do not merge a partial alignment.
- The cold build exceeds the 100 ms guard at 1,000 anchors, or open-to-interactive misses the DoD
  budget, and the lazy fallback is not approved.
- The layout seam turns out to need the editor's asset availability, crop or node kind inside
  `packages/layout`; that is a boundary change, ask first.
- Any step requires changing an anchor resolution rule, the schema or the ADR; stop.
- The suite is not green at the end of a step; fix forward inside the step or revert it, never carry
  a red step.

---

## 12. Acceptance criteria

1. `@noteforest/core` exports one anchor-index module; no code in `packages/layout` or the renderer
   derives `resolved`/`ambiguous`/`broken` from rect counts or `occurrenceHint` (grep plus review).
2. For every anchor in every fixture and in a generated 1,000-anchor document, `entry(id)`
   deep-equals `resolveAnchor(document, id)`.
3. `update(document, { blockKeys, editedBlockIds: [b] })` indexes exactly one block
   (`stats.blocksIndexed === 1`), reuses the rest, and the new state equals a fresh build.
4. A branch or asset-availability change flips `idle` ↔ `resolved` and image states with
   `stats.blocksIndexed === 0`.
5. The session's index is updated before `bumpVersion`/`notify` on commit, structural, undo, redo
   and reset, including the accepted prefix of a failed multi-block commit.
6. Every placed anchor's `AnchorAttachment.state` equals the view entry; `broken-anchor` and
   `ambiguous-anchor` defects exist exactly for non-resolved placed anchors; idle anchors produce
   neither attachment nor defect.
7. A resolved text anchor with several measured rects gets the union rect and the last-line attach
   point; a resolved anchor with none gets the block rect plus one `anchorGeometryFallbacks` entry
   and no state change.
8. On the review fixture, for blocks that are laid out, a Page dot exists exactly when at least one
   placed anchor in that block is `broken` or `ambiguous`; the PDF preflight block list matches;
   Continuous is unchanged.
9. Page Read and the exported PDF show the same anchor state for the same document revision; a
   mismatched view revision throws instead of rendering stale states.
10. Split/merge and image replacement fixtures match core states in layout and Health.
11. Cold index build for 1,000 anchors is under 100 ms; warm single-block update p95 is under 16 ms;
    Page/Health reads after a commit index zero blocks; the app-level before/after numbers are
    recorded, and no DoD budget regresses.
12. `document.json` for every fixture is byte-identical before and after; no schema or version
    change.
13. `npm run typecheck`, `npm test`, `npm run e2e` and the touched UI suites are green at every
    step; one full `npm run verify` at integration.
14. The product owner has seen the review screenshots and the PDF for §6.3, and the outcome is
    recorded in the batch report.

---

## Open questions

**For the product owner (visible, not architectural):**

- For a multi-line text anchor on Page/PDF: accept the union-box callout (aligned to the range's left
  edge, arrow from the last line), or ask for a different display?
- Is the ambiguous dot acceptable where a hint-picked callout used to draw (the ADR-0005 reading),
  or does Page need a display rule for ambiguous anchors before merge?

**For the orchestrator:**

- Build candidate 2 now, and in how many batches (proposed: core + session, layout + Page/print,
  renderer + review)?
- Is the anchored `test:perf` seed in scope? Without it the app budget is unmeasured.
- Does the print IPC snapshot carry the view, or should the print renderer rebuild the index from
  the document plus availability? This plan carries it.
- Is a lazy first build acceptable as the fallback if eager build misses the open budget? The plan
  proposes eager, per ADR-0005's "resolve on load".
