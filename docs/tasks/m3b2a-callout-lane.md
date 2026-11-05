# M3b2a — Anchored callout lane in the editor

**Role:** Builder  
**Milestone:** M3b2a (first half of M3b2; M3b2b adds the outline row and marker navigation)  
**Base:** current `main` (M3b1 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1–1.5 days

## Context

M3b1 creates text-anchored children and renders them as normal nested cards. This slice adds the
editor's callout lane: anchored children sit below the parent card, aligned to the anchor, before
the direct-children group, with a quote chip and a decorative connector. It is an editor projection,
not canonical structure.

Read:
- `docs/spec.md` v0.4.5 §4.6/§6.2/§7.4; `docs/ux.md` v1.3 §8.5/§10.3; ADR-0005.
- `docs/design/m3-anchors-references.md` §6.2 (placement), §6.3 (geometry), §6.9 (parity), §12 M3b.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`, `lib/adapter.ts`, `styles.css`,
  `editor/edges`, `DocumentEditor.tsx`.

## Goal

With one or more anchored children, the editor shows a callout lane below the parent card and before
direct children; each callout is left-aligned to its anchor where possible, shows its quote, and the
primary edge still runs forward without looping across the parent. The canonical document and
outline order are unchanged.

## In scope

1. **Projection split**
   - Separate anchored primary children from direct primary children for rendering only; the
     canonical document still has one primary branch list.
   - Multiple callouts from one anchor stack in branch order; different anchors order by the shared
     anchor order key; deterministic, no overlap.
2. **Callout lane**
   - Render the lane below the parent card, before the direct-children group.
   - Clamp a callout that would exceed the card/content edge to the content-left; keep the marker
     dot and a dotted leader (decorative, `aria-hidden`).
   - Direct children remain the normal nested group; callout subtrees recurse normally.
   - The callout card stays editable, collapsible, and branchable; no new block type.
3. **Quote chip and marker**
   - Each callout header shows a small quote chip (the anchor quote/first line, truncated) and status
     only if already available; no full health sheet.
   - Keep the M3b1 dotted marker/underline; add the connector dot at the anchor's last line.
4. **Edges**
   - Parent→callout edges start at the parent/anchor side and run forward; no U-turn or edge crossing
     through the parent card. Direct-child edges keep the existing V4 routing.
   - Geometry is derived at render time; no stored coordinates.
5. **Tests/evidence**
   - New `tests/ui/m3-anchor-callout.test.mjs`: parent with one anchored child and one direct child;
     assert callout top is below the parent card bottom, callout left is near the anchor/card content
     left, direct child sits after the callout, no overlap, edge direction/arrow is valid.
   - Multiple callouts stack without overlap; a clamped far-right anchor does not overflow.
   - Screenshot for the product owner.
   - Update `test:ui` and `verify` to run the new UI file; **do not add a critical e2e test**.

## Out of scope

- Outline anchored row, anchor count chip, marker click/cycling, keyboard selection (M3b2b).
- Health sheet, repair dialog, ambiguous candidate UI (M3e).
- Formula/code/image anchors (M3c); reference edges/chips (M3d).
- Collapse hidden-count changes (M3b2b), split/merge (M3f), page/PDF, schema bump.
- New critical e2e; the critical suite is 21 tests / 58.6 s and must not grow.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/lib/adapter.ts` (anchored/direct split for rendering)
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` (measurement/edge wiring if needed)
- `apps/desktop/src/renderer/src/editor/edges/*` (lane offset/edge routing)
- `apps/desktop/src/renderer/src/styles.css`
- `tests/ui/m3-anchor-callout.test.mjs` (new)
- `package.json` (`test:ui`/`verify` run the new file)
- `docs/reports/m3b2a-callout-lane.md`

## Acceptance criteria

- [ ] One anchored child renders in a lane below the parent, before the direct child; both remain
      editable and keep their canonical identity.
- [ ] Callout left aligns to the anchor when it fits; otherwise clamps without overflowing the card.
- [ ] Multiple callouts from one or more anchors stack deterministically without overlap.
- [ ] Parent→callout and parent→direct-child edges run forward, with no loop across the parent.
- [ ] The quote chip shows the anchor quote/first line; the marker/connector is visible but quiet.
- [ ] Direct children still render and reorder normally; no change to canonical structure/outline
      order.
- [ ] UI geometry test + screenshot; `test:ui` and `verify` include the new file.
- [ ] Critical e2e stays at 21 tests and under 60 s; no fixed sleeps/native dialogs.

## Tests and evidence

- `npm run typecheck`
- `node --test tests/ui/m3-anchor-callout.test.mjs`
- `npm run test:ui`
- `npm run verify:fast` (critical e2e unchanged; no new critical test)
- Screenshot path and geometry numbers.
- Do not run the full `npm run verify`; the Orchestrator runs it at integration.

## Stop and ask

Stop if the lane requires a block-type/schema change, if the edge router cannot keep a forward route
without a new layout engine, or if the critical e2e budget would be exceeded.

## Report format

Summary, files, projection/geometry rules, edge evidence, UI test/screenshot, timings, risks, next
step M3b2b.
