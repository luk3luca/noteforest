# Anchor health — design proposal

**Status:** Proposal for product-owner review. No implementation yet.
**Date:** 14 November 2026.
**Scope:** a document-level audit that finds broken, hidden, and lost anchors, plus the repair surface.
**Builds on:** M3e anchor health (`apps/desktop/src/renderer/src/lib/anchor-health.ts`,
`src/shell/Dialogs.tsx`), the M3 anchor resolver, the status-bar chip, the block warning.
**Not in scope:** shell activity bar (separate design), library-wide scan (v3), automatic repair.

---

## 1. Problem

The M3e sheet already lists **broken** and **ambiguous** anchors and, under “All”, the **idle**
records (valid anchors with no branch). It cannot find:

- **hidden** anchors: an anchor whose marker is not drawn because it has no live branch (`linkedAnchorIds`
  excludes idle), an anchor in a block that is unreachable from any chapter/branch, or an anchor whose
  ancestors are collapsed;
- **lost** anchors: a branch whose target block no longer exists; an `anchorIds` reference in content
  with no `anchors` record; a record no longer referenced by content; a drifted binding that still
  resolves by quote/context but is no longer exact;
- **duplicates** and anchors inside cells after the inline-only table normalization.

The concrete example: a formula-term anchor on “ciao” exists (record + `anchorIds`), has no branch, so
it is **idle**; the status bar does not count it and the block warning ignores it. The sheet would list
it under “All”, but nothing points to it.

## 2. Categories and detection

| Category | Definition | Detection |
|---|---|---|
| Broken | binding no longer resolves | resolver reason: quote/term/token/region missing, kind mismatch, invalid selector, node missing |
| Ambiguous | more than one candidate | resolver: multiple-candidates / candidate-requires-confirmation |
| Missing target | branch target block missing | `branch.targetBlockId ∉ blocks` |
| Idle | valid anchor, no branch | `branches(source.anchorId) = 0` |
| Orphan reference | `anchorIds` in content with no record | content ids − `anchors` keys |
| Orphan record | record not referenced by content | `anchors` − content ids (formula/code/image attrs; text marks) |
| Hidden — collapsed | marker not visible until expand | view state `collapsed` contains an ancestor |
| Hidden — unreachable | block not in a chapter and not under a primary/reference path | graph reachability from chapters |
| Drift | resolves, but not exact | resolver reason `unique-quote` / `unique-context` instead of `exact-binding` |
| Duplicate | two anchors on the same range/term, or one id in several places | normalized binding equality |
| Asset | image anchor with missing/changed asset or crop | `assetAvailability` + hash/crop |
| Cell | anchor inside a table cell after inline-only normalization | block content path through `tableCell` |
| Branch | source/target missing, duplicate primary home, cycle, bad role/order | branch graph audit |

Severity: **S1** data-loss risk (missing target, missing record, duplicate primary home, cycle);
**S2** needs repair (broken, ambiguous, orphan); **S3** cleanup/information (idle, drift, hidden by
collapse, duplicate anchors, cell geometry).

## 3. Audit model

A pure function (core or shared lib):

```ts
auditAnchors(document, {
  assetAvailability?: AssetAvailabilityIndex;
  collapsedBlockIds?: ReadonlySet<string>; // view state, optional
}): AnchorAuditReport;
```

`AnchorAuditReport`:
- `rows`: one per anchor (every record, not only problematic): id, blockId, kind, state (healthy /
  exact / weak / broken / ambiguous / idle / orphan / hidden / missing-target), reasons, severity,
  quote, context, block/chapter titles, branches, target existence, reachable, collapsed, drift,
  duplicate group, cell path.
- `orphanReferences`: `{ anchorId, blockId, nodePath }` from content attrs/marks without a record.
- `orphanRecords`: anchors whose id is not present in content.
- `missingTargets`: `{ branchId, anchorId, targetBlockId }`.
- `duplicateGroups`: arrays of anchor ids.
- `counts`: healthy / broken / ambiguous / idle / orphans / hidden / needsRepair.

Rules:
- Start from **all anchors and all content references**, not only the resolver list, so orphan
  references are visible.
- Reuse `resolveDocumentAnchors` for state/reason and candidate data; do not duplicate the resolver.
- Reachability: a block is reachable if it is a chapter top-level id or the target of a branch whose
  source is reachable (primary or reference); compute a closure.
- Collapsed: only when `collapsedBlockIds` is passed; the UI passes the active document's collapsed
  set. Collapsed is information, not an error.
- The audit is read-only; no repair is applied.

## 4. UI

Extend the existing **Anchor health** sheet (modal), not a new surface.

- Header: `N anchors · X broken · Y ambiguous · Z idle · W orphan · H hidden` + **Check again**.
- Filters: **All / Needs repair / Broken / Ambiguous / Idle / Orphans / Hidden**, with counts; search
  by block, chapter, quote, kind.
- Rows: state badge, kind, block + chapter, quote, branch count, reason; click = **Locate**
  (expand ancestors, select the block/term, scroll). Idle and hidden rows are visually quieter.
- Actions:
  - Broken: Repair (candidates) / Attach to block / Delete branch / Keep.
  - Ambiguous: choose candidate / Rerun from selection.
  - Idle: **Branch from anchor…** / **Remove anchor** (record + branches + `anchorIds`; one undo;
    confirm when branches exist).
  - Orphan reference: **Strip id** / **Recreate anchor** from the current selection.
  - Orphan record: **Delete record**.
  - Missing target: **Relink…** / **Remove branch**.
  - Drift: **Update binding** (repair) / Keep.
  - Hidden — collapsed: **Expand & locate**.
  - Hidden — unreachable: **Move block to chapter…** / **Delete block…** (destructive, confirmed).
  - Duplicate: choose the keeper / delete the other.
- Empty state: “No anchors need repair” + idle/orphan counts when present.
- Status bar: keep the existing **needs repair** chip for broken/ambiguous; add a **secondary muted
  indicator** for idle/orphans (e.g., “2 idle”), clickable to the sheet filtered on Idle. No alarm
  for idle.
- Palette: **Check anchors…** opens the sheet.
- The sheet is read-only until an action; every action is a typed command with undo; no auto-fix.
- Performance: synchronous audit on open; a manual Check again; 300/1,000 blocks. No scan per
  keystroke. A worker only if the 1,000-block audit measures above ~50 ms.

## 5. Slices

- **v1**: Idle filter + counts, orphan references/records, missing targets, Locate/expand, status-bar
  secondary indicator, palette entry, Remove anchor / Branch from anchor / Delete record / Remove
  branch. This finds the formula-term idle anchor.
- **v2**: drift, duplicates, hidden/unreachable, asset and cell checks, relink, move block, search.
- **v3**: library-wide scan (closed documents, read-only, report per document).

## 6. Tests

- Pure audit fixtures: healthy, broken, ambiguous, idle, orphan reference, orphan record, missing
  target, drift, duplicate, collapsed, unreachable, image missing, anchor in a cell.
- UI: sheet filters/counts, Locate, idle remove/branch, orphan strip, missing-target remove, status
  bar secondary indicator, palette entry, no mutation on open.
- Regression: the M3e sheet actions still work; the status bar needs-repair count unchanged.

## 7. Open decisions

1. Name: **Anchor health** or **Document health** (if v2 includes orphan blocks and branch issues)?
2. Idle: informational (not “needs repair”) — recommended.
3. Collapsed: “hidden” information with Expand & locate — recommended.
4. Audit on open or only on Check again — recommended: on open.
5. Include reference edges and branchless branches in v1 or v2 — recommended v2.
6. Should the Health view live in the future activity bar (compact summary) with this sheet as the
   repair surface? Recommended yes, but the sheet ships first.
