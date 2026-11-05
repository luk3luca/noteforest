# M3c2b — Formula term geometry and visual highlight

**Role:** Builder  
**Milestone:** M3c2b (second half of formula terms)  
**Base:** current `main` (M3c2a merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

M3c2a creates formula-term anchors from a selected LaTeX substring. The callout currently falls back
to the formula rectangle and the marker is on the formula node. This slice adds a **best-effort term
rectangle/highlight**: when the term can be mapped to the rendered KaTeX DOM, the marker/leader uses
the term; otherwise the formula rectangle remains the fallback. No selector or command changes.

Read:
- `docs/adr/0005-anchor-binding-and-identity.md` §3/§4 (best-effort formula term geometry).
- `docs/design/m3-anchors-references.md` §6.3 (formula term geometry), §6.8 (fallback), §12 M3c.
- `apps/desktop/src/renderer/src/editor/extensions.ts` (formula node view), `BlockViews.tsx`
  (marker/quote chip), `lib/anchor-selection.ts`, `state/runtime.ts`, `styles.css`,
  `packages/core/src/anchors.ts` (resolution).

## Goal

A resolved formula-term anchor shows its marker/highlight on the term when a unique rendered match
exists; otherwise it shows the existing formula-node marker and quote chip, with no layout break and
no change to the anchor/selector/branch IDs.

## In scope

1. **Term mapping**
   - From the resolved anchor's formula node and term selector, find the rendered KaTeX range for
     the term:
     - simple text/operator terms may match the `.katex-html` text;
     - a small LaTeX-to-rendered-symbol map may cover common commands (`\lambda`, `\alpha`, …);
     - if the match is missing or not unique, fall back to the formula rectangle.
   - Use DOM rects from the live KaTeX node; no stored coordinates.
   - The mapping must never mutate the formula, selector, or canonical document.
2. **Visuals**
   - Term highlight/underline and marker dot at the term rect; selected state; the callout leader
     starts at the term rect where available.
   - Fallback: formula-node marker/dot and quote chip, exactly as M3c2a.
   - Ambiguous/broken terms keep the amber warning/fallback; candidate chooser is M3e.
3. **Tests/evidence**
   - UI test: formula with a simple term (`x` in `x + y = z`) shows the term marker/highlight near
     the term; a repeated term (`x` twice) falls back to the formula rect and still shows the quote
     chip; resize/zoom keeps no overlap.
   - Screenshot.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Ambiguous candidate chooser/repair dialog/health sheet (M3e).
- Code/image anchors (M3c3), reference edges (M3d), split/merge (M3f).
- Formula editor changes; selector/command changes.
- Pixel-perfect KaTeX source mapping; best-effort + fallback is the contract.
- Page/PDF, schema change, new dependencies.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/editor/extensions.ts` or `BlockViews.tsx` (term marker/leader)
- `apps/desktop/src/renderer/src/lib/anchor-selection.ts` or a new `lib/formula-term-geometry.ts`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/*` unit tests for the mapping
- `tests/ui/m3-formula-term.test.mjs` or a new UI file
- `docs/reports/m3c2b-formula-term-geometry.md`

## Acceptance criteria

- [ ] A unique simple term shows a term-level marker/highlight and the callout leader from the term.
- [ ] A repeated/unmapped term falls back to the formula rectangle without errors or layout break.
- [ ] Ambiguous/broken state remains visible; no auto-resolution.
- [ ] No selector/branch/anchor identity changes; reload keeps the same IDs and visual state.
- [ ] UI test + screenshot; no new critical e2e; no code/image/reference work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted unit/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if term mapping requires changing the formula renderer/LaTeX source, if KaTeX DOM cannot
provide stable rects without a fork, or if the fallback cannot avoid overlap.

## Report format

Summary, files, mapping rules, fallback evidence, UI test/screenshot, timings, risks, next step M3c3.
