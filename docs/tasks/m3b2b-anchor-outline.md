# M3b2b — Anchored outline rows and marker navigation

**Role:** Builder  
**Milestone:** M3b2b (second half of M3b2)  
**Base:** current `main` (M3b2a callout lane merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

M3b2a renders anchored children in a callout lane below the parent. This slice makes the same
anchored structure legible and navigable in the sidebar/outline: quote-prefixed rows, the source
block's anchor count, marker click/cycling, and collapse behavior that includes callouts. It uses
the shared `anchoredChildBranches` order and the existing lane projection; no new layout engine.

Read:
- `docs/spec.md` v0.4.5 §4.6/§6.4/§6.5/§7.4; `docs/ux.md` v1.3 F5, §8.5, §10.4; ADR-0005.
- `docs/design/m3-anchors-references.md` §6.4 (marker/keyboard), §6.5 (outline), §6.7 (collapse),
  §12 M3b.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx`, `lib/tree.ts`, `editor/views/BlockViews.tsx`,
  `lib/adapter.ts`, `state/runtime.ts`, `styles.css`, `tests/ui`.

## Goal

A user sees anchored children in the outline as `↳ “quote”` rows in the same order as the callout
lane, can click the marker/quote to select the anchor and cycle its branches, and collapsing a parent
hides the callouts with the rest of its primary descendants.

## In scope

1. **Outline rows**
   - Anchored primary children appear under the parent as `↳ “quote”` rows, same indentation as
     direct children, grouped by anchor with a thin left rule; order matches
     `anchoredChildBranches` (anchor start, anchor ID, branch order).
   - The row shows the callout label/first line, branch count, and status when available.
   - The source block row shows an anchor-count chip and a warning chip for broken/ambiguous anchors.
   - Selecting an outline row selects/focuses the target and highlights the quote/anchor.
2. **Marker navigation**
   - When the block is selected (not while editing), the anchor marker is a real button with
     `aria-label`; clicking selects the anchor, a second click cycles its branches.
   - Provide a keyboard/menu path through the existing block actions menu or command palette; do not
     add unconfirmed global keybindings beyond the current M2/M3 map.
   - Clicking a callout's quote chip selects the anchor on the parent.
   - Every pointer action has a menu/command-palette equivalent (UX D13).
3. **Collapse**
   - Collapsing a block hides its anchored callouts and their subtrees with the rest of its primary
     descendants; the hidden count includes them; expanding restores.
   - Navigating to a hidden callout (outline row/quote chip) expands ancestors and focuses it.
4. **Tests/evidence**
   - New/extended UI test: outline anchored rows and order, quote prefix, anchor-count chip,
     marker click/cycle, collapse hidden count, quote-chip selection.
   - No new critical e2e; critical suite stays 21 tests.
   - Screenshot evidence.

## Out of scope

- Callout lane geometry/edges (M3b2a, already merged).
- Health sheet/repair dialog/ambiguous candidate chooser (M3e); only minimal warning chips here.
- Formula/code/image anchors (M3c); reference edges/see-also chips (M3d).
- Split/merge (M3f), page/PDF, schema bump, new dependencies.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx`
- `apps/desktop/src/renderer/src/lib/tree.ts` (outline projection if needed)
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/lib/adapter.ts` / `state/runtime.ts` (selection/collapse plumbing)
- `apps/desktop/src/renderer/src/styles.css`
- `tests/ui/m3-anchor-callout.test.mjs` or a new `tests/ui/m3-anchor-outline.test.mjs`
- `package.json` only if a new UI file is added
- `docs/reports/m3b2b-anchor-outline.md`

## Acceptance criteria

- [ ] Anchored rows appear as `↳ “quote”` in the same order as the callout lane, before direct
      children, with a visible grouping rule.
- [ ] The source row shows the anchor-count chip and a warning chip when an anchor is broken/ambiguous.
- [ ] Marker click selects the anchor; a second click cycles branches; the quote chip selects the
      parent anchor; a menu/command-palette path exists.
- [ ] Collapsing the parent hides callouts and their subtrees; the hidden count includes them;
      expanding restores; navigating from the outline expands ancestors.
- [ ] Existing direct-child rows, selection, keyboard, and lane rendering stay unchanged.
- [ ] UI test + screenshot; no new critical e2e; critical suite stays 21/<60 s.
- [ ] No health/repair panel, reference chips, or formula/code/image work.

## Tests and evidence

- `npm run typecheck`
- New/extended UI test and `npm run test:ui`
- `npm run verify:fast` at the end (critical e2e unchanged)
- Screenshot path and row/marker/collapse assertions.
- Do not run the full `npm run verify`; the Orchestrator runs it at integration.

## Stop and ask

Stop if the marker button or row selection conflicts with the M2 focus model, if collapse cannot
include callouts without changing the canonical state, or if a new global keybinding would be needed.

## Report format

Summary, files, outline/marker/collapse behavior, UI test/screenshot, timings, risks, next step M3c.
