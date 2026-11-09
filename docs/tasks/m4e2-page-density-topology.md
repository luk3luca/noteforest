# M4e2 — Page density 60–120 + adaptive topology (S2-3, S2-4)

**Role:** Builder / Implementer  
**Milestone:** pre-UI Page density model fix; the density control placement/IA is designed later  
**Base:** `main` after the full-codebase Sentinel (`4ac9d46` plus this brief; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 1.5 days

## Context

The full-codebase Sentinel verdict is **request changes before Settings/UI
rework**. The density S2s:

- **S2-3** — the 60–120% target is not representable; at 60% the 8 pt body floor
  is identical to 80% while the card cap hits 280 px, so page count is equal or
  worse than 90/100.
- **S2-4** — density can change callout topology (A/B2/stacked); the checklist
  currently says it must not.

Product-owner decisions (9 November 2026):

- Range **60–120%**.
- Body floor **7 pt**, card floor **240 px**, min content **140 px**.
- Topology is **adaptive**: density may change A/B2/stacked; update the rule/test.
- Page-only; Continuous untouched.
- No strict page-count monotonicity promise; document 90% as the recommended
  dense step if the lab confirms it; keep the 60% warning/guidance for the later
  UI.

## In scope

- Widen `PAGE_DENSITY_MIN` to 0.6; keep step/normalization consistent (5% UI
  step); existing 80–120 values stay valid.
- Change the effective-theme floors:
  - body floor 7 pt (headings stay above body; code/table/chrome/marker floors
    checked for consistency);
  - `maxCardWidth` floor 240, readable clamp still applies (suggest 240–560);
  - `minContentWidth` floor 140; keep custom values below the floor scaling if
    the existing policy allows it.
- Ensure 60% is actually more compact than 80% (body 7 vs ~8, card 252 vs 336)
  and document the curve.
- Topology: keep the existing per-parent deterministic A/B2/stacked selection
  (it already adapts). Add a test/probe that density can flip a parent, and make
  the behavior explicit in the report. Do **not** freeze modes.
- Real-DOM lab at 60/70/80/90/100/110/120 on scale-300/showcase/stress; record
  page count, whitespace, body size, card padding, and a readability note.
- Page Read/Edit/PDF parity at 60% and 120%; ensure the export fingerprint/theme
  includes the new floors.
- Targeted tests: normalization/clamp, effective values at 60/80/90/100/120,
  density topology flip, lab invariants, UI read/edit at 60/120.
- Report at `docs/reports/m4e2-page-density-topology.md`.

## File ownership / coordination

Own: `packages/layout/src/page-settings.ts` (density constants/effective theme
only), `layout.ts` only if the mode gate needs the scaled `calloutModeMinWidth`,
density lab/tests, density UI help text if needed.

Do **not** edit settings persistence/store/session/no-document Settings/dead
Continuous zoom; M4e1 owns those. Avoid `Dialogs.tsx` shell changes; if the
density help text must change, keep it localized and note it.

The final density control placement/labels/IA belong to the later redesign.

## Out of scope

- Settings platform S2-1/S2-2/S2-5/S2-6 (M4e1).
- Page/Continuous token split (later).
- Final Settings/UI design, manual breaks, export polish.
- Freezing callout modes; changing the Page callout geometry or R2j rules.
- Spec/UX/ADR/plan changes (report the rule change; the Orchestrator updates
  checklist/docs).
- Merge, push, PR, parent-checkout edits.

## Files to read

- `docs/reviews/full-codebase-settings-review.md` S2-3/S2-4.
- `docs/reviews/settings-inventory.md` §3–§5, §12–§14.
- `packages/layout/src/page-settings.ts`, `layout.ts`, `types.ts`.
- `packages/layout/test/density-lab.ts`, `density-lab.test.ts`,
  `page-settings.test.ts`.
- `tests/ui/m4d1-page-density.test.mjs`, `tests/ui/m4c2-pdf-export.test.mjs`.
- `docs/reports/m4d1-page-density.md`, `docs/reports/m4c3-pdf-gate.md`.

## Acceptance criteria

- [ ] Density 60–120, default 100, step 5, normalized.
- [ ] Body floor 7 pt, card floor 240, minContent 140; 60% is more compact than
      80% and 100%.
- [ ] Page Read/Edit/PDF share the same effective theme; fingerprint stable.
- [ ] Topology adapts and is tested/documented; no frozen modes.
- [ ] Real-DOM lab 60–120 records page count/whitespace/readability.
- [ ] Targeted tests + one `npm run verify:fast` with timings.
- [ ] Report maps criteria and lists risks.

## Stop and ask

Stop and report if:

- 7 pt is too small in the real-DOM/PDF evidence and needs a product call;
- the 60% curve still increases pages on a fixture in a way that needs a
  different floor/curve;
- topology adaptation requires changing the R2j mode rules or geometry;
- M4e1’s settings work conflicts in `page-settings.ts`;
- the baseline has unrelated failures.

## Report format

- Summary and scope.
- Files changed.
- Checks/timings.
- S2-3/S2-4 evidence.
- Acceptance pass/fail.
- Lab table 60–120 and readability note.
- Open questions/risks.
- Worktree path, branch head SHA.
