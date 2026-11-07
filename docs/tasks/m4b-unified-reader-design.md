**Status: SUPERSEDED (7 November 2026).** The product owner ratified ADR-0007: layouts
Continuous/Page × modes Edit/Read. Do not implement this brief. See
`docs/adr/0007-editor-layouts-and-modes.md` and `docs/tasks/m4b1a-editor-layouts-modes.md`.

# M4b — unified reader/page/PDF layout: design package

**Role:** Planner / Architect
**Milestone:** M4 — reader/page + PDF
**Status:** design only; no application code
**Base:** current `main` after M4b1 and M3c3b5
**Worktree:** isolated designer worktree prepared by orchestrator v2

## Why this design exists

The product owner rejected the current split:

```text
reader    -> ProseMirror + CSS/DOM flow layout
page view -> packages/layout
PDF       -> packages/layout
```

A reader with a different layout and "advisory" page-break markers is not acceptable. The final
structure must have **one geometry** for reader, page view, and PDF. The old M4b2 slice (markers over
the DOM reader) was cancelled; do not build on it.

## Required decision

Produce a design package that makes the **reader a continuous renderer of the same
`ContinuousLayout`/`PaginatedDocument`** as the page view and PDF, while keeping the reader the
primary authoring surface. No CSS re-pagination, no second measurement, no advisory-only final state.

Evaluate at least these implementation options against the current code:

1. **Engine-positioned ProseMirror blocks.**
   - Keep one ProseMirror document; position each block node view at engine `x/y/width`, remove the
     CSS below-stack/right-group/callout-flow placement.
   - Preserves the M3 keyboard model, IME, text/formula/code/image anchor authoring, block actions,
     drag/reorder, edge router inputs.
   - Risks: cross-block selection/arrow navigation, absolute-positioned contenteditable, height/
     measurement feedback, callout/edge routing, accessibility.
2. **Static engine canvas + single-block editor overlay.**
   - Render every block from the shared `segments.ts`/content renderer at engine coordinates; mount
     one TipTap editor for the active block; commit on blur.
   - One block renderer for reader/page/PDF by construction; cleanest parity.
   - Risks: reimplementing M3 editing UX (Tab/Return, split/merge, anchors, image actions, menus,
     selection, drag), higher regression risk, larger migration.
3. Any hybrid only if it keeps one geometry and one measurement and does not preserve a CSS-flow
   fallback.

## Questions the design must answer

1. **Geometry source.** Where does every block/callout get its x/y/width? How are chapters, page
   guides, edges, and callout lanes positioned from the engine? What is removed from
   `useBelowStackPlacement`, `CalloutLaneView`, `BlockViews`, CSS?
2. **Measurement.** One `MeasurementPort` shared by reader/page/PDF. Which typography metrics define
   pagination? Reader screen colors may differ, but the metric box must not. How do we prevent
   measurement drift between the editor DOM and the measurement host? How are fonts, KaTeX, images,
   tables measured at fixed width?
3. **Editor model.** Option 1 vs 2 with evidence from the current editor. How do text editing,
   selection, IME, Tab/Return sibling/child creation, split/merge, anchor authoring, image actions,
   block menus, drag/reorder, and keyboard navigation work? What is the single-active-editor rule?
4. **Collapse.** Collapse currently hides descendants and reflows the reader. Page view always shows
   the full layout; PDF exports full content. Decide the M4 semantics:
   - collapse affects reader and page view (breaks match, page view/PDF may differ);
   - collapse is outline-only in spatial views (reader/page always full);
   - collapse is display-only or filtered layout for both views, and how export behaves.
   This is a product decision if the options change AC-11/AC-29/D11; present the options and a
   recommendation, do not silently choose.
5. **Page-break markers.** Exact engine y in the continuous reader; how are in-block safe breaks
   represented? What is accessible and what happens when collapsed content changes pagination?
6. **View state.** Mode, focus, selection, collapse, scroll, current page, zoom/fit; what is shared
   and what is per renderer. AC-33.
7. **Performance.** 300 blocks guaranteed, 1,000 usable; measurement cost, re-layout on typing,
   incremental/freeze options, virtualization. No 60 fps claim.
8. **Migration.** File ownership, slices, tests, screenshots, rollback. The reader must remain usable
   during migration; no intermediate state may keep two geometries as the final design.
9. **Accessibility.** Outline remains the accessible representation; markers and geometry are not
   color-only; keyboard path to every action.

## Deliverables

- `docs/adr/0007-single-layout-engine-reader.md`: context, decision, alternatives, consequences,
  revisit triggers. Recommend one option with code evidence.
- `docs/tasks/m4b-unified-reader.md`: slice breakdown (implementation order, files, acceptance,
  tests, stop conditions). Keep it inside M4b; do **not** invent a separate M4e or a parallel
  "reader parity" milestone.
- A short risk/edge-case matrix: collapse vs pagination, in-block breaks, editing overlay,
  measurement drift, 300/1,000 blocks, image/anchor geometry, accessibility.
- No application code, no spec/UX/ADR/plan edits outside the two deliverables, no merge/push.

## Stop and ask

Stop and ask the product owner if the only solid option changes a ratified product behavior:
collapse/expand in spatial views, page view/PDF collapsing, reader editing model, or page-break
marker semantics. Do not paper over a product decision with CSS or an advisory label.
