# Research — color palettes for the shell (accents, neutrals, status, optional theme packs)

**Role:** Research / Scout
**Milestone:** UI appearance (post-R3)
**Base:** `main` at the commit that adds this brief (`1a53f80` plus the brief commit)
**Worktree:** created by the delegate from that base; research only, no application code
**Timebox:** 2 hours

## Context

R3 shipped the shell color contract (`docs/design/color-system.md`): canonical semantic roles,
dark/light themes, a four-accent registry (blue, teal, amber, rose), status roles, and an additive
`settingsVersion: 3` appearance model. The light theme values and the four accents were hand-tuned
and pass the current contrast guards, but they were not selected from a researched palette system.

The next appearance work may add accents or full theme packs. The structure is now stable enough that
palette values can be evaluated as **data**, without touching components or the schema. The research
must not change code, settings, UI, Page/PDF paper colors, or the frozen semantic-role contract; it
recommends values and options.

Relevant inputs:

- `docs/design/color-system.md` (approved; the contract and current values)
- `packages/layout/src/appearance.ts` (current `ACCENTS`, theme/scale/font types)
- `apps/desktop/src/renderer/src/styles.css` (dark/light theme blocks, canonical roles)
- `docs/design-tokens.md`, `docs/design-tokens-page.md` (Page/print are a separate fixed light skin)
- `tests` for the current contrast guards (`appearance.test.ts`, `appearance-css-guard.test.ts`)

## Question

Which palette source and exact values should NoteForest use for the shell: dark/light neutrals,
accents, and status colors, and which optional full theme packs are compatible with the frozen token
contract and licensing constraints?

## In scope

1. **Source comparison.** Evaluate accessible palette systems and their licenses for this use:
   Radix Colors, Open Color, Tailwind, GitHub Primer, Catppuccin, Nord, and any other credible
   source. Compare: light/dark completeness, accent scales, neutral scales, status colors,
   accessibility guidance, license, maintenance, and whether values can be copied without a runtime
   dependency.
2. **Current values review.** Assess the shipped dark/light neutrals and the four accents:
   contrast on every shell surface, perceived lightness/hierarchy, color-blind separation, and
   whether the four accents feel consistent in weight. Recommend whether to keep, adjust, or replace
   them.
3. **Accent registry values.** Provide exact `accent`, `strong`, `soft`, `hover`, `contrast` values
   for dark and light for the recommended accents, in the existing `AccentSet` shape. A shortlist of
   four is the default; say whether six or eight is worth adding and why.
4. **Neutral and status scales.** Provide dark/light values for `bg-app`, `bg-canvas`, `bg-sidebar`,
   `surface-1/2/3`, `text-1/2/3`, `border-1/2`, `edge`, `edge-muted`, `overlay`, shadows, and the
   status roles (`danger/success/warning` + soft/border). Note the in-flight `--note-surface` role
   for Continuous cards; recommend light/dark values for it.
5. **Contrast evidence.** A matrix for text roles on every shell surface, text on accent/hover/strong,
   focus/control rings, and non-text borders; state the thresholds (4.5:1 text, 3:1 UI) and any
   exceptions. Include color-blind simulation notes where relevant.
6. **Optional theme packs.** Assess whether full packs (for example Catppuccin/Nord) fit the current
   token contract, what a theme registry would need beyond accent values, licensing, and whether this
   is a realistic later feature. Do not implement it.
7. **Future-proofing.** Confirm that adding an accent remains a registry entry (no component/schema
   change) under the recommended values, and list the steps to add a full pack later.

## Out of scope

- Application code, tests, Settings UI, schema/migration, or any change to `docs/design/color-system.md`.
- Page/print paper colors (they stay a fixed light skin) and any PDF/print change.
- A free color picker, per-document appearance, or a runtime palette dependency.
- Product decisions: recommend, do not decide.

## Files

Read the inputs above. Expected to touch only:

- `research/color-palettes.md` (the deliverable).

No other file. Do not commit product code, tests, or docs outside `research/`.

## Acceptance criteria

- [ ] At least five palette sources compared with license, coverage, and accessibility evidence.
- [ ] Current dark/light neutrals and the four accents reviewed with a measured contrast matrix.
- [ ] Exact recommended values for accents, neutrals, status, and `--note-surface`, in the existing
      shapes, with dark/light variants.
- [ ] A recommendation on four vs more accents, perceived-lightness consistency, and color-blind
      separation.
- [ ] Theme-pack assessment (1–2 candidates) with licensing and token-contract implications.
- [ ] Rejected alternatives and open product questions stated.
- [ ] No code/schema/UI/Page change; the only file is `research/color-palettes.md`.

## Method and evidence

- Use published palette data and cite sources/URLs and licenses.
- Compute contrast ratios with WCAG relative luminance; show the numbers, not adjectives.
- You may run throwaway scripts outside the product to compute colors; do not add dependencies.
- No native dialogs, no app changes, no screen recording.

## Stop and ask

Stop and report when:

- a recommendation would require changing the frozen semantic roles or the `settingsVersion: 3`
  shape;
- a palette license is unclear or incompatible;
- a full theme pack needs a product decision beyond palette data.

## Report format

- Question and method.
- Sources and licenses.
- Comparison table.
- Contrast matrix.
- Recommended accent/neutral/status/note-surface values.
- Theme-pack assessment.
- Rejected alternatives and open questions.
- Recommended next step.

Commit the research note in the worktree; do not merge or push.
