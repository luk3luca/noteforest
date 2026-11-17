# P1 — the Page anchor dot, and no anchor marker on paper

**Role:** Builder
**Milestone:** Page chrome
**Base:** `main` at launch, after F4b has merged.
**Worktree:** created by the Orchestrator, branch `t3/page-anchor-dot`.
**Timebox:** 2.5 hours.

## Context

Looking at the F4a screenshot the product owner asked why the anchor warning covers the card text. It does:
`AnchorWarningBadge` (`page/PageView.tsx`) is a full `⚠ anchor` text chip, absolutely positioned at the card's
**bottom-right** (`styles.css` `.nf-page-badge` / `.nf-page-anchor-badge`), outside the flow so it cannot change
the measured card. On a one-line card the bottom-right corner **is** the text line. It also has
`pointer-events: none`, so its `title` can never open, and it is not focusable — the marker covers the text and
explains nothing to mouse or VoiceOver. The same element is rendered by the print compositor, so the chip is
in the PDF too.

**Product decisions (17 November 2026):** option **B** — a 6 px status dot in the card's top-right corner, with
a real tooltip and a click that opens Document health on that anchor — and **nothing about broken anchors may
appear in the PDF**. Everything else about page↔print parity stays as it is (a missing image still shows its
placeholder on paper).

## Goal

In Page Read a card with a broken or ambiguous anchor carries a small dot that explains itself and opens the
repair, without covering a single word; the exported page carries no trace of it.

## In scope

1. **The dot in Page Read.** Replace `AnchorWarningBadge` with a `<button type="button">`:
   - visual: a **6 px circle** in the existing `--nf-page-warning-*` family, the same shape as the sidebar
     activity bar's needs-repair dot (`.nf-activity-dot`, `styles.css`); no text, no border;
   - position: centred 4 px from the card's top-right corner, inside a **24 × 24 hit area** (the hit box may
     overflow the card by ~5 px into the 18 px gap; the card box itself must not move);
   - `aria-label` and `title`: `Lost anchor. Open document health to repair.` or
     `Ambiguous anchor. Open document health to repair.` (state from the first warning);
   - click (and Enter/Space, it is a button): `stopPropagation`, then
     `openDocumentHealth({ anchorId: warnings[0].anchorId })`, which opens Health on that anchor's row/modal.
     Stop the double-click propagation too, so the card does not open its editor behind the dialog;
   - keep `data-page-anchor-warning` on the dot and `data-fragment-anchor-warning` on the fragment (tests and
     the Page suite use them).
2. **Coexistence with the defect badge.** A card can have both. `.nf-page-defect-badge` is a text chip at
   `top: 2px; right: 2px`; when the fragment carries `data-fragment-anchor-warning="true"`, shift the defect
   chip left so the dot has the corner (a CSS rule on the fragment selector; no measurement change).
3. **Print carries nothing.** Remove `AnchorWarningBadge` and the `data-fragment-anchor-warning` attribute from
   `print/PrintDocument.tsx`. Nothing else in the print model changes; do not touch the image missing-asset
   placeholder, the defect badge or any other parity.
4. **Tests.** Update `tests/ui/m4c1-print-compositor.test.mjs`: its fragment snapshots compare the anchor field
   and the `data-fragment-` attributes, so the parity contract becomes "print equals Page Read on everything
   except the anchor flag and the dot". Update the case title (`prints the page without the anchor dot, Page
   Read keeps it`) and add:
   - Page Read renders one dot per warned fragment; the dot's box is 6 px inside a ≥ 24 px hit area; its
     accessible name is the short sentence; no `⚠ anchor` text anywhere in the page;
   - clicking the dot opens Document health on that anchor's issue (the existing `health-issue` dialog), and the
     Page selection does not change behind it;
   - the print host contains no `[data-page-anchor-warning]`, no `data-fragment-anchor-warning` and no marker
     text; the produced PDF text contains neither `anchor` marker string;
   - everything else in `assertPrintParity` still passes unchanged.
5. **Geometry.** Assert the page is unchanged: page count, segment count, fragment box and card box identical
   with and without a warned block, and no measurement re-run from the dot.

## Out of scope

- Document health itself (rows, modal, repairs), Continuous's chrome-row chip, the defect badge's own copy,
  the print model contents beyond this attribute/element, the find and the highlighter.
- A page-margin lane, a hover card or a multi-anchor list: one dot, first warning, click to Health.

## Files

Read: `page/PageView.tsx` (`AnchorWarningBadge`, `PageFragmentView`), `styles.css` (`.nf-page-badge`,
`.nf-page-anchor-badge`, `.nf-activity-dot`), `print/PrintDocument.tsx`, `actions.ts` (`openDocumentHealth`),
`tests/ui/m4c1-print-compositor.test.mjs`, `docs/design/page-scroll.md` (§print parity).

Expected to touch: `page/PageView.tsx`, `styles.css`, `print/PrintDocument.tsx`, the m4c1 suite, the report
`docs/reports/page-anchor-dot.md`.

## Acceptance criteria

- [ ] Page Read shows a 6 px dot at the card's top-right for every warned fragment; no text is covered and no
      `⚠ anchor` chip exists.
- [ ] The tooltip opens, the accessible name is the short sentence, and a click (or Enter) opens Document health
      on that anchor without selecting/opening the block behind it.
- [ ] A card with both a defect and an anchor warning shows both, without overlap.
- [ ] The print DOM and the produced PDF contain no anchor marker, no anchor attribute and no marker text.
- [ ] Page geometry is identical: page count, segments, fragment box and card box.
- [ ] No regression in the rest of the parity suite, in Page Read/Edit or in Document health.

## Tests and evidence

- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group page --concurrency 2`,
  `node --test tests/ui/m4c1-print-compositor.test.mjs`.
- End of task: `npm run verify:fast`. Do not run `npm run verify`.
- Screenshots in `artifacts/page-anchor-dot/`: the dot on a card, a card with defect + dot, and a printed sheet
  with no marker.

## Stop and ask

- if any other suite asserts the `⚠ anchor` text or the print attribute (record which, do not bend the rule);
- if the 24 px hit area cannot fit without moving the card or stealing clicks from a neighbouring card;
- if removing the print marker changes the print model identity or the PDF validation in a way that needs a
  product decision.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, risks, next step. One commit; do not merge.
