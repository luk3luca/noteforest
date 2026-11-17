# B2 — contrast: the code-theme registry and the Continuous edge states

**Role:** Builder
**Milestone:** appearance (pre-release)
**Base:** `main` at launch (B1 merged).
**Worktree:** created by the Orchestrator, branch `t3/b2-contrast`.
**Timebox:** 8 hours.

Two colour problems, one batch because they answer the same question — *which colour passes 3:1 / 4.5:1 on
which surface* — and are proven by one measured table per polarity and one visual pass.

---

# Part A — code themes

## A0. Context

Monokai and One Light are shipped as fixed CSS variables (`--code-*` on `html` and
`html[data-theme="light"]`). Both fail 4.5:1 on some roles: Monokai's comment is 3.44; in One Light five of
seven roles are weak (comment 2.37, string 2.95, type 2.94, function 3.73, number 4.48). Recolouring is off
the table.

`docs/design/code-themes.md` measured the VS Code defaults **verbatim**: Dark+ and Light+ pass every role on
their **own** surface (`#1E1E1E`, `#FFFFFF`), and two light roles fail on our tinted note card (number 4.24,
type 4.22) — which is why a theme must bring its own surface.

**Decision (design doc):** adopt Dark+ and Light+ verbatim, each with its own code surface; they become
entries in a registry; the app theme chooses the default (dark → Dark+, light → Light+); Monokai and One
Light stay available and labelled with their measured worst role; the picker is app-level, never per
document; **the paper and the PDF keep One Light** and must not move.

## A1. The registry

A pure module `apps/desktop/src/renderer/src/lib/code-themes.ts`:

```ts
export type CodeThemeId = 'monokai' | 'one-light' | 'dark-plus' | 'light-plus';
export interface CodeTheme {
  id: CodeThemeId;
  label: string;              // 'Dark+'
  polarity: 'dark' | 'light';
  surface: string;            // the theme's own code background
  roles: Record<Role, string> // keyword, string, number, comment, function, type, tag, meta
}
```

- Four entries, values **verbatim** from the theme. The six roles measured in `code-themes.md` are fixed;
  `tag` and `meta` follow the same theme where its documented values exist (Dark+ tag/meta are the keyword
  blue `#569CD6`; Light+ tag `#800000`, meta `#0000FF`), otherwise reuse the keyword role and **say so in
  the report** — never invent a colour.
- `worstContrast(theme)` computes the WCAG ratio of every role against the theme's own surface and returns
  the minimum; the UI label is `AA · 4.60` (two decimals). Nothing is typed by hand.
- The registry is the product source; the CSS below is the rendering. A unit test asserts they are equal.

## A2. The setting

`appearance.codeTheme: 'auto' | CodeThemeId`, default `auto`. It lives in the existing `appearance`
namespace (`@noteforest/layout` types, `shared/settings-file.ts` normalization) and is **additive**: no
`settingsVersion` bump, an unknown value normalizes to `auto`, an unknown future key is still preserved.
A settings file without the key loads as `auto` (test).

`auto` resolves by the **app theme**: dark → `dark-plus`, light → `light-plus`.

## A3. Rendering

- `shell/useAppearanceSync` sets `data-code-theme="<resolved id>"` on the root next to `data-theme`.
- `styles.css` gains one block per theme (`html[data-code-theme="dark-plus"] { --code-…; --code-surface: … }`,
  and the same for the other three) with the eight roles plus `--code-surface`. The old
  `html[data-theme="light"] { --code-* }` block is removed; the attribute always resolves.
- The Continuous code block reads the surface:
  `.nf-continuous-surface .nf-code-block { background: var(--code-surface); }` (the border stays). The
  Markdown guest editor's code block uses the same class — it follows; inline code, tables and prose never
  receive it.
- **Page/PDF unchanged**: `--nf-page-code-*` and the print path keep One Light, and no page rule may match
  `[data-code-theme]`.

## A4. The picker

Appearance → **Code theme**, app-level, one control in the existing Settings geometry:
`Match app theme` (auto) plus the four themes, each labelled with its computed worst role
(`Dark+ · AA 4.60`, `Monokai · 3.44`, …). Show the polarity when the list mixes both (`Monokai (dark)`), or
filter the list by the resolved app theme — whichever reads cleaner on the page; either way `auto` is first
and the current value is preselected. A caption states that the page and the PDF keep One Light.
The Appearance preview rail is unchanged unless a code sample already exists there.

---

# Part B — Continuous edge states

## B0. Context

Measured against the canvas (`--bg-canvas`: `#17181a` dark, `#ffffff` light):

| State | Dark | Light |
|---|---|---|
| resting (`accent-strong`) | 11.19 | 9.30 |
| reference (`--edge-reference` + opacity .78) | 4.73 | **2.51** |
| muted (`--edge-muted` + opacity .35) | **1.35** | **1.33** |

The fade is the problem, not the hue. R6 owns the **widths** (resting/active/muted) and the **fixed
arrowhead size** — both are user settings and must not be touched or scaled here.

## B1. The fix

- Remove the `opacity` from `.nf-edge-muted`, `.nf-edge-arrow.nf-edge-muted`, `.nf-edge-reference` and
  `.nf-edge-reference-arrow` (no state is carried by fading).
- Retune `--edge-muted` and `--edge-reference` per polarity so every state clears **3:1** against
  `--bg-canvas` at full opacity. Keep the language: reference is the neutral **dashed** edge, muted a solid
  quieter grey, resting the accent; distinction by hue temperature and the user's widths, never by fade.
- The arrowhead inherits the same token and full opacity; its geometry stays fixed (R6).
- Page edges are untouched: the Page scope keeps its own `--nf-page-edge-*` values and the existing
  isolation test must still prove the Page/PDF edge model unchanged.

## B2. The proof

A unit test that reads the tokens from `styles.css` (the pattern of `apps/desktop/test/code-palette.test.ts`)
and computes WCAG contrast against `--bg-canvas` for both polarities: resting (default accent), reference
and muted all **≥ 3.0**; no `opacity: 0.35` remains on an edge class; the reference keeps `dasharray`.
A before/after screenshot of one canvas with the three states, at 100 % and 60 % density.

---

## Out of scope

- Page/PDF colours, the highlighter tones, the find colours, the accent registry, density, fonts, any
  layout or pagination; `⌘P` / `Edit → Find` (still open product decisions).

## Files

Read: `docs/design/code-themes.md`, `docs/design/code-palette.md`, `docs/design-tokens-continuous.md`,
`styles.css` (`--code-*`, `--edge-*`, `.nf-edge-*`, `.nf-page-edge-*`), `shell/useAppearanceSync.ts`,
`settings/AppearanceSettings.tsx`, `shared/settings-file.ts`, the `AppearanceSettings` type in
`@noteforest/layout`, `apps/desktop/test/code-palette.test.ts`, `appearance.test.ts`,
`appearance-css-guard.test.ts`, `tests/ui/m4b1-page-view.test.mjs` (Page edge isolation).

Expected to touch: the new registry + tests, `styles.css`, `useAppearanceSync.ts`,
`AppearanceSettings.tsx`, the settings type + normalizer + migration tests, the palette test, the report
`docs/reports/b2-contrast.md`.

## Acceptance criteria

- [ ] Four code themes in one registry, values verbatim, each with its own surface; the worst role is
      computed, never typed, and the picker shows it.
- [ ] `appearance.codeTheme` persists app-level, `auto` follows the app theme, unknown → `auto`, no
      `settingsVersion` bump; a file without the key loads as `auto`.
- [ ] The Continuous code block takes the active theme's surface; inline code, tables and prose do not.
- [ ] Page and print keep One Light; the produced PDF is unchanged (page count, colours, fingerprint).
- [ ] Continuous resting, reference and muted are all ≥ 3:1 on the canvas in dark and light at full
      opacity; no edge state relies on a fade; widths and the fixed arrowhead unchanged.
- [ ] Page edges and the Page/PDF edge model are unchanged (isolation test).
- [ ] Every claim has a test or a computed number; no colour is invented without the report saying so.

## Tests and evidence

- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group shell --concurrency 2`, `--group page`,
  `node --test tests/ui/m4b1-page-view.test.mjs`.
- End of task: `npm run verify:fast`. Do not run `npm run verify`.
- Screenshots in `artifacts/b2-contrast/`: the Appearance picker, a code block in each of the four themes,
  the Continuous canvas with the three edge states at 100 % and 60 % density, and the before/after of the
  muted edge.
- Report: the computed contrast tables (code themes per polarity, edges per polarity) and the before/after
  of the default look.

## Stop and ask

- if a VS Code theme has no documented `tag`/`meta` value (say which role and what you propose);
- if the code-surface change can reach Page or the print model in any way;
- if `auto` defaulting to Dark+/Light+ needs the product owner's explicit approval — **do not block the
  batch**: implement it, and put the before/after screenshots at the top of the report so it can be vetoed
  in one line.

## Report format

Summary, **two separate evidence sections (code themes, edges)**, files changed, checks with timings,
pass/fail per criterion, risks, next step. One commit; do not merge.
