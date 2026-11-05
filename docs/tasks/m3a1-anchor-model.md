# M3a1 — Anchor model, binding, resolution, validation

**Role:** Builder  
**Milestone:** M3a1 (first half of M3a; M3a2 adds commands)  
**Base:** current `main` (spec v0.4.5, ADR-0005, M3 design package)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

M3 starts with a pure core model. No UI, no command surface yet. This slice makes anchors real in
`packages/core`: selector/binding types, content binding helpers, resolution states, and the A1–A12
validation invariants. M3a2 then adds `anchor.create`/`repair`/`attachToBlock`/`delete` and extends
the branch commands.

Read:
- `docs/spec.md` v0.4.5 §4.4 (anchor kinds/selectors), §4.10 (I10/I11), §5.4 (anchor ops),
  §8.2 (resolution), §8.9 (export manifest contract).
- `docs/adr/0005-anchor-binding-and-identity.md` — binding shapes, resolution, identity, A1–A12.
- `docs/design/m3-anchors-references.md` §2 (model), §3 (resolution), §11 (fixtures), §12 M3a.
- `packages/core/src/types.ts`, `validation.ts`, `structure.ts`, existing tests.

## Goal

The core can parse, validate, bind, and resolve text/formula/code/image anchors without mutating the
document or involving the editor.

## In scope

1. **Anchor types and selectors**
   - Discriminated selector shapes for text/formula/code/image per spec §4.4 and design §2.4.
   - Keep the existing `Anchor` record compatible; add typed selector helpers, not a schema bump.
   - `attrs.anchorIds` binding helpers for text marks and atomic nodes (`mathBlock`/`inlineMath`,
     `codeBlock`, `image`); one contiguous text binding; sorted arrays; remove empty bindings.
2. **Content helpers**
   - Plain-text projection with offsets for a block; content-order key for anchor start positions.
   - Text-node splitting at selection boundaries; read/merge/remove anchor IDs.
   - Contiguity check: one maximal run; intervening inline math/image allowed; unmarked text between
     marked runs is broken.
3. **Resolution**
   - `resolveAnchor`, `resolveBlockAnchors`, `resolveDocumentAnchors`.
   - States `resolved | ambiguous | broken | idle | block-missing`, candidates, reasons; exact
     binding or unique fallback only; candidate ranking is UI order, not auto-resolution.
   - No mutation; no read of `lastKnown` for resolution/layout/export.
4. **Validation A1–A12**
   - Anchor record shape, kind/selector match, block existence, atomic node kind, text contiguity,
     duplicate ID/binding, selector/quote mirror precedence, mark-without-record inert, and the
     branch-source rules that belong to the model.
   - Remove the M2 `unsupported-m2-feature` warning for anchors once validation is complete.
5. **Fixtures/tests**
   - Unit tests: selector validation, all four kinds, exact/ambiguous/broken/idle/missing-block,
     overlapping text anchors, duplicate text binding, atomic multi-anchor, no mutation, fixture
     parse/validate.
   - Add one valid M3 fixture if useful, but do not corrupt existing M2 fixtures.

## Out of scope

- `anchor.create`/`repair`/`attachToBlock`/`delete` and branch command changes (M3a2).
- UI, TipTap mark, adapter, editor, callout, outline.
- Reference role transitions (M3d), split/merge (M3f), export manifest implementation (M3f).
- Schema version bump or migration.
- Any app/e2e test.

## Files

Read:
- `packages/core/src/types.ts`, `validation.ts`, `structure.ts`, `commands.ts` (read only for shapes)
- `packages/core/test/helpers.ts`, an existing command/validation test for style
- `docs/adr/0005-anchor-binding-and-identity.md`, design §2–§3

Expected to touch:
- `packages/core/src/types.ts` (additive selector types/helpers)
- `packages/core/src/anchors.ts` (new: binding/resolution)
- `packages/core/src/validation.ts` (A1–A12)
- `packages/core/src/index.ts` (exports)
- `packages/core/test/anchors.test.ts` (new) and/or existing validation tests
- `docs/reports/m3a1-anchor-model.md`

## Acceptance criteria

- [ ] A text anchor is one contiguous binding; a second disjoint run is rejected/broken per I10.
- [ ] Formula, code, and image anchors bind through `attrs.anchorIds` on the correct node kind.
- [ ] Resolution returns resolved only for an exact binding or a unique fallback; multiple
      candidates are ambiguous; no candidates are broken; an anchor with no branch is idle.
- [ ] Resolution and validation never mutate the document; `lastKnown` is never authoritative.
- [ ] A1–A12 are enforced with specific errors/warnings and affected IDs.
- [ ] The M2 anchor warning is gone; M2 fixtures still validate.
- [ ] Unit tests cover the matrix and run inside the unit budget.
- [ ] No UI, e2e, command surface, schema bump, or M3b–M3f work.

## Tests and evidence

- `npm run typecheck`
- `npx vitest run packages/core/test/anchors.test.ts` (or the touched files)
- `npm test` (target <3 s)
- Do not run the full `npm run verify`; the Orchestrator runs it at integration.
- Report the resolution matrix, validation codes, and test counts.

## Stop and ask

Stop if a selector shape in spec/ADR cannot be represented without a schema bump, if A1–A12 conflict,
or if the implementation would need command/UI changes to make resolution testable.

## Report format

Summary, files, selector/binding API, resolution states, validation codes, tests/timings, risks,
next step (M3a2).
