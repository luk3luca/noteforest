# M3c2b — Formula term geometry and visual highlight

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-01985af7`  
**Branch:** `t3/m3c2b-formula-term-geometry`  
**Base:** `d416cae` (`main`: docs: merge M3c2a and start M3c2b)  
**Scope:** best-effort formula-term geometry/highlight with the M3c2a formula-rectangle
fallback. No selector, command, schema, formula-editor, candidate-chooser, repair, code/image,
reference-edge, split/merge, page/PDF, or dependency change.

## Summary

A resolved formula-term anchor now maps its exact LaTeX substring to the rendered KaTeX
`.katex-html` text. When the mapping is unique, the card renders a term highlight over the live
glyph rect, the durable dot sits at the term's right edge, the selected-state highlight applies to
the term, the real marker button is positioned on the term, and the callout lane leader starts at
the term's left edge.

The mapping is best-effort by contract:

- plain letters/digits/operators map directly (whitespace is compacted because KaTeX renders math
  spacing as empty `.mspace` elements), with ASCII `-`, `*`, `|` translated to `−`, `∗`, `∣`;
- a small LaTeX-command table maps common Greek letters, operators, arrows, set symbols and
  function names (`\lambda`, `\Delta`, `\cdot`, `\leq`, `\sum`, `\rightarrow`, `\sin`, …);
- any term containing arguments, scripts, braces, unknown commands, or a rendered text that
  appears zero or more than once has no term rect.

When no term rect exists, nothing new is rendered: the existing formula-node marker/dot, formula
rectangle callout origin, and quote chip remain exactly as M3c2a. Ambiguous/broken anchors never
get a guessed term rect. No selector, anchor, branch, or document value is rewritten; no coordinate
is stored. Geometry is recomputed from live DOM rects on resize, CSS zoom, font load, and runtime
version changes.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/formula-term-geometry.ts` | New pure/DOM helper: LaTeX-command map, rendered-text mapping, unique-range search, live KaTeX rect measurement, zoom-relative rect conversion, and the shared `anchorVisualTargets` preference (term overlay first, atomic node fallback). |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Resolves term anchors per block, renders the absolutely-positioned term-highlight layer, positions callout rows/marker buttons from term geometry first, keeps formula fallback, and scopes the selected state to the term when geometry exists. Adds a canvas `data-zoom` observer so overlays and markers recompute on zoom. |
| `apps/desktop/src/renderer/src/styles.css` | Term-highlight layer, soft highlight/underline + dot, selected state, marker-dot handoff while the marker layer is visible. |
| `apps/desktop/test/formula-term-geometry.test.ts` | 7 unit tests: plain/operator/command mapping, unsupported-term rejection, unique vs missing/repeated rendered text, and zoom-relative rect conversion. |
| `tests/ui/m3-formula-term-geometry.test.mjs` | New UI test: unique `x` in `x + y = z`, a second unique `z` for the callout leader, repeated `x` fallback, marker placement, zoom, resize, screenshot, save/reload identity. |
| `package.json` | `test:ui` and `verify` include the new UI file. |
| `docs/reports/m3c2b-formula-term-geometry.md` | This report. |

No change to `packages/core`, the schema, commands, selectors, the formula editor/dialog, or the
canonical document.

## Mapping rules

1. The view takes only anchors that are `kind: "formula"`, `selector.form: "term"`, attached to a
   current outgoing primary branch, and in the resolver's `resolved` state with a
   `formula/term` resolved range.
2. The exact source substring comes from the live block content at `range.nodePath`
   (`codePointSlice(latex, range.latexStart, range.latexEnd)`), not from stale DOM coordinates.
3. The term is translated to the expected rendered text:
   - `\\command` only matches the small table;
   - otherwise the term must be letters/digits/spaces and common math punctuation.
4. Visible `.katex-html` text nodes are collected in DOM order, skipping KaTeX layout-only spans
   (`.katex-strut`, `.mspace`, `.vlist-s`, `.pstrut`, `.frac-line`, `.nulldelimiter`) and
   zero-width-only text. The expected text must occur exactly once.
5. A DOM `Range` over that unique text is measured with `getClientRects`; the union is converted to
   card-relative layout pixels (dividing by the measured CSS-zoom scale).
6. The same `anchorVisualTargets` helper is used by the callout lane, the marker buttons, and the
   selected-state effect: term overlay first, atomic formula node only when no term overlay exists.

## Fallback evidence

- Repeated term: `x + x = 2x` with the term `x` is created as an anchor but the resolver reports
  `ambiguous` (two occurrences); no `.nf-formula-term-highlight` is rendered for that anchor.
- The formula node still carries `data-anchor-ids`/`data-anchor-kind="formula"`; the marker button
  is positioned at the formula rectangle's right edge and the callout quote chip remains
  `data-anchor-state="ambiguous"` with the `Ambiguous` badge and the block warning.
- The UI test asserts the repeated anchor has no term overlay, the formula rectangle positions its
  marker, and the quote chip stays ambiguous. It also asserts the reloaded anchor record is
  byte-for-byte equal to the created record, so fallback never mutates identity.
- Narrow cards keep the approved M3b2a lane clamp: if a term starts too far right for the minimum
  callout width, the row clamps to the card content left. The term highlight/marker remain on the
  term; the clamp is existing below-stack behavior, not a new fallback.

## UI test and screenshot

- Test: `tests/ui/m3-formula-term-geometry.test.mjs` — **1/1 pass**.
- Assertions: term overlay equals the KaTeX `x` rect within 2 px/2.5 px and is much narrower than
  the formula; a second `z` term gets a separate overlay and the callout-row offset shift matches
  the term shift within 2 px; selected `x` shows the marker button at the term's right edge; the
  repeated `x` has no overlay, keeps the formula marker and ambiguous chip; zoom 120 % and window
  1180×760 keep the overlay on the glyph inside the card and above the callout lane; save/reload
  rebuilds both unique overlays and keeps the ambiguous fallback with unchanged anchor records.
- Screenshot: `artifacts/m3c2b/formula-term-geometry-1440x900.png` (1440 × 900, hidden window,
  condition-based waits only, no fixed sleeps, no native dialogs).

## Checks and timings

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| Targeted unit | 7/7 pass, 79 ms |
| `npm test` | 407/407 pass, 34 files, 1.78–1.97 s |
| New UI test | 1/1 pass, test body 1.82–1.86 s, file ~10.0 s (two Electron launches) |
| `npm run test:ui` | 12/12 pass across seven files (M2 view 1, M2 shell 4, M3 callout 3, M3b2b 1, M3c1 1, M3c2a 1, M3c2b 1) |
| `npm run verify:fast` | pass; typecheck + 407 unit + critical e2e 21/21 |
| Critical e2e | 21 tests, 45.3 s test body / 53.4 s file (count unchanged) |
| Full `verify` | not run; Orchestrator runs it at integration. |

## Risks / open questions

- **Best-effort mapping:** multi-token commands with arguments (`\frac`, `\sqrt{…}`), scripts,
  unknown commands, and terms whose rendered symbol appears more than once intentionally fall back
  to the formula rectangle. This is the approved contract, not a defect.
- **Narrow-card clamp:** the callout leader uses the term only when the existing M3b2a minimum-width
  clamp allows it; otherwise the callout row clamps to the card content left while the term
  highlight/marker stay on the term. A wider card (content-driven) shows the leader at the term.
- **Term overlay presented as a DOM overlay:** it is `aria-hidden`, `pointer-events: none`, and
  never part of content or selection; KaTeX markup itself is not wrapped or mutated.
- **Known M3e copy:** the block-level warning for an ambiguous term still says “Lost anchor”; the
  callout badge says `Ambiguous`. Candidate chooser/repair copy remains M3e.
- **No stored coordinates:** reload and zoom prove the overlay is rebuilt from live rects; a future
  M4 layout must not assume this overlay is canonical.

## Next step

**M3c3 — code and image anchors**: code range highlight/gutter marker and image region/point
geometry, reusing the M3c1/M3c2 resolver and callout lane. Candidate chooser/repair/health remains
M3e.
