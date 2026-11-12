# Shell color palettes — source, exact values, and optional theme packs

**Status:** Research note (Scout), 12 November 2026. Answers
[`docs/tasks/research-color-palettes.md`](../docs/tasks/research-color-palettes.md).
**Base:** `main` at `54e21bb` (R3 merged; the Continuous/shell polish brief is in flight, not merged).
**Scope:** shell colors only. No code, tests, settings UI, schema, Page/print, or design-doc changes.
**Worktree:** `t3/research-color-palettes`; the only file is this note.

## Verdict

Use **Radix Colors (MIT)** as the reference palette system — for its documented 12-step semantics,
its neutral hue family, and its status ramps — but **do not import Radix steps 1:1**. Ship a
NoteForest-owned mapping, because the frozen contract needs three text roles and pastel dark accent
fills that Radix does not provide.

The exact recommended values are the shipped NoteForest ladder with these measured adjustments:

1. dark `--text-3` `#8b9199` → `#949aa2` (4.54 → 5.08 on `surface-3`);
2. light `--text-3` `#5f6b75` → `#5b6771` (4.63 → 4.92 on `surface-3`);
3. dark `--border-2` `#3c4148` → `#6e737a` (1.40 → 3.02, a 3:1 control/hover boundary);
4. light `--border-2` `#b8c4cd` → `#82888c` (1.51 → 3.05);
5. dark teal and rose accents harmonised to the same perceived lightness as blue and amber, plus
   the dark amber `soft` and light rose `hover` consistency fixes in §5.1.

Adopt the in-flight `--edge`, `--edge-muted`, `--note-surface`, and `--note-surface-hover` values
from the Continuous/shell polish brief. Keep the status roles. Keep four accents; six is optional
and eight is not worth it. A **full theme pack is not a data-only change** under `settingsVersion: 3`:
it needs a new settings field, a pack registry for the neutral/status/shadow roles, and a product
decision. Catppuccin and Nord are not drop-in packs; Nord also has a license discrepancy.

No recommendation here changes a semantic role name or the `settingsVersion: 3` shape.

---

## 1. Question and method

**Question.** Which palette source and exact values should NoteForest use for the shell — dark/light
neutrals, accents, and status colors — and which optional full theme packs are compatible with the
frozen token contract and licensing constraints?

**Method.**

- Read the contract and current implementation: `docs/design/color-system.md`,
  `packages/layout/src/appearance.ts`, `apps/desktop/src/renderer/src/styles.css`,
  `packages/layout/test/appearance.test.ts`, `apps/desktop/test/appearance-css-guard.test.ts`,
  `docs/design-tokens.md`, `docs/design-tokens-page.md`, and the in-flight
  `docs/tasks/ui-continuous-shell-polish.md`.
- Collected published palette data and license files from the sources in §2 (unpkg/raw GitHub, read
  on 12 November 2026). No package was added to the product.
- Computed WCAG 2.x relative luminance and contrast with the same formula as
  `appearance.test.ts`; computed CIE L\*C\*h and ΔE76; simulated protanopia, deuteranopia, and
  tritanopia with the Machado–Oliveira–Fernandes (2009) matrices at severity 1.0. Throwaway Node
  scripts in `/tmp/nf-colors`; no dependencies. The numbers in this note are those outputs.
- **Thresholds:** 4.5:1 for normal text (WCAG 2.2 SC 1.4.3; all shell text is below 18 pt / 14 pt
  bold, so 4.5 applies), 3:1 for UI component boundaries, states, focus indicators, and graphical
  objects required to understand content (SC 1.4.11 and 2.4.13), and 3:1 for large text. Disabled
  controls and purely decorative separators are exempt.
- **Limitations:** WCAG 2.x contrast is luminance-only and does not measure hue/chroma; CVD is a
  simulation, not a user study; ΔE76 is coarse; 1 px borders antialias and can lose effective
  contrast; alpha overlays are evaluated as their intended composite, not per-pixel. Subjective
  visual judgement remains the product owner's.

---

## 2. Sources and licenses

| Source | License (verified) | Data shape | Light / dark | Status coverage | Accessibility guidance | Maintenance (npm) | Copy without runtime dependency |
|---|---|---|---|---|---|---|---|
| **Radix Colors** | MIT (`@radix-ui/colors` LICENSE) | 31 scales × 12 steps + alpha; 6 neutral families (gray, mauve, slate, sage, olive, sand), 25 chromatic | Both, first-class; step 1–12 semantics documented | Red, amber, green, plus 22 other hues | Explicit step use cases; steps 11/12 guaranteed APCA Lc 60/90 on step 2; step 7 interactive border, step 8 stronger; warns that step 9 is designed for white text (except amber/yellow/lime/mint/sky) | 3.0.0 (Oct 2023); stable/frozen package, docs active | Yes — copy hex/P3 values into the registry |
| **GitHub Primer** | MIT (`@primer/primitives` LICENSE) | Light/dark inverted neutral scales 0–13; semantic fg/bg/border tokens; 9 themes incl. high-contrast, colorblind, tritanopia | Both, plus 9 themes | accent, success, attention, danger, open/closed/done, sponsors | Step 8 is the minimum interactive-control border; steps 9/10 are the minimum text against backgrounds; contrast calculated against `bgColor-muted`; high-contrast targets 7:1 | 11.10.0 (Jul 2026); active | Yes, but the functional-token set is large and GitHub-specific |
| **IBM Carbon** | Apache-2.0 (`@carbon/colors` LICENSE) | 10-step hue grades + 10-step neutral; 4 themes (White, Gray 10, Gray 90, Gray 100) | Both (two light, two dark) | support-error/success/warning/info | Explicit WCAG table (4.5/3), focus 3:1, layering model, disabled exempt | 11.62.0 (Nov 2026); active | Yes with Apache NOTICE/attribution; values are IBM-branded |
| **Tailwind CSS** | MIT (tailwindlabs/tailwindcss LICENSE) | 26 hues × 11 steps (50–950), OKLCH in v4; no semantic roles | One value set used in both modes; no paired dark scale | None | No formal palette guidance; contrast is left to the user | 4.3.5 (Nov 2026); very active | Yes; already a build dependency |
| **Open Color** | MIT (`open-color` LICENSE) | 13 hues × 10 steps + white/black | Light only; no dark scale | None | None | 1.9.1 (Aug 2021); low activity | Yes |
| **Catppuccin** | MIT (catppuccin/palette LICENSE) | 4 flavors (Latte light; Frappé, Macchiato, Mocha dark) × 26 named colors | Both, as named roles | red, peach, yellow, green as named colors | Community style guide; no formal WCAG role matrix | 1.8.0 (Mar 2026); active | Yes |
| **Nord** | Repo LICENSE says MIT; npm metadata says `Apache-2.0 AND CC-BY-SA-4.0` | 16 colors: 4 Polar Night, 3 Snow Storm, 4 Frost, 5 Aurora | Dark only; no official light palette | Aurora red/orange/yellow/green/purple | No formal contrast guidance; designed for eye comfort | 0.2.1 (Nov 2016); package stale | Yes, but resolve the license discrepancy first |

**License notes.**

- MIT sources (Radix, Primer, Tailwind, Open Color, Catppuccin, Nord repo) may be copied into a
  proprietary app if the copyright/permission notice is retained. A bundled pack should add the
  notice to the app's licenses/credits file. No runtime package is required: the values are data.
- Apache-2.0 (Carbon) requires the NOTICE/attribution terms if the work is redistributed. Copying
  individual color values as facts is low-risk, but a shipped Carbon-derived pack should include
  the notice.
- **Nord is the one unclear case.** The repository `license` file is MIT, while the published npm
  package declares `Apache-2.0 AND CC-BY-SA-4.0`. CC-BY-SA is a share-alike license; do not ship a
  Nord pack until the product owner/legal resolves which terms apply. This note does not rely on
  Nord values.
- Radix's published values include Display-P3 variants under `@supports (color: display-p3)`. The
  shell currently uses sRGB hex. P3 is a separate wide-gamut decision; the sRGB values are the ones
  quoted here.

**URLs.** <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>,
<https://primer.style/foundations/color/overview>,
<https://carbondesignsystem.com/elements/color/overview/>,
<https://tailwindcss.com/docs/colors>, <https://yeun.github.io/open-color/>,
<https://catppuccin.com/palette/>, <https://www.nordtheme.com/docs/colors-and-palettes>,
<https://www.w3.org/TR/WCAG22/#contrast-minimum>,
<https://www.w3.org/TR/WCAG22/#non-text-contrast>.

---

## 3. Comparison for this contract

### 3.1 What the contract actually needs

| Requirement | Count | Consequence |
|---|---:|---|
| Backgrounds | 3 (`bg-app`, `bg-canvas`, `bg-sidebar`) | A 2-step background model is not enough |
| Surfaces | 3 (`surface-1/2/3`) + `note-surface` | A 2-step component model is not enough |
| Text roles | 3 (`text-1/2/3`), all ≥ 4.5:1 on six surfaces | Radix has 2 text steps (11/12); Primer has enough functional roles |
| Borders | 2 (`border-1/2`) | One subtle separator + one 3:1 control/hover boundary |
| Edges | 2 (`edge`, `edge-muted`) | Connectors, not text; 3:1 is desirable but not a text rule |
| Accents | 4 sets × 5 values × 2 themes | Dark pastel fill + dark text; light deep fill + white text |
| Status | 3 roles + soft/border | Text ≥ 4.5 on surfaces and soft; borders are decorative unless they alone identify the state |
| Overlay/shadows | 1 overlay + 3 shadows | Alpha values, no WCAG ratio |
| Constraint | — | Values are data; no runtime palette dependency; `settingsVersion: 3` unchanged |

### 3.2 Fit verdicts

- **Radix — best reference, not a literal import.** Its 12-step model is the clearest published
  mapping to our roles (1 app bg, 2 subtle bg, 3 component, 4 hover, 5 active, 6 subtle border,
  7 interactive border, 8 strong border, 9 solid, 10 solid hover, 11 low text, 12 high text). But it
  has only two text steps, its steps 1/2 are explicitly interchangeable backgrounds, and most
  step 9 colors are designed for white foreground text (Radix's own docs say so, except
  amber/yellow/lime/mint/sky). Our dark accents are the inverse: pastel fills with near-black text.
  It is therefore a **reference and ramp source**, not a drop-in.
- **Primer — best role model, wrong brand.** Its neutral scale is inverted between modes and its
  functional token set is built around GitHub. Adopting it would be a restyle, not a palette
  selection. Useful as a second opinion on thresholds: its step 8 (interactive border) and steps
  9/10 (text) match the numbers in §6.
- **Carbon — strongest formal accessibility documentation, wrong brand and license overhead.**
  Apache-2.0 and IBM-specific themes. A full theme, not a palette.
- **Tailwind — raw ramp.** No light/dark pairing, no semantic roles, no contrast guidance. It is
  already a build dependency, but binding shell roles to `slate-*` would couple tokens to utility
  classes and still require a mapping. Copying individual values is possible; it offers no
  advantage over Radix for this contract.
- **Open Color — light-only and stale.** No dark scale, no status semantics, 2021 package. Good for
  tints in a lab, not a shell system.
- **Catppuccin — plausible later pack, not a base.** Both modes, MIT, 26 named roles, active. But
  its low-contrast text roles fail 4.5:1 on its own surfaces, and its Latte accents fail 3:1 on
  white (§7.1). A pack needs a curated role map, not a copy.
- **Nord — dark-only, license unclear.** No light counterpart, stale package, MIT/CC-BY-SA
  discrepancy. Reject as a base and as a pack for now.

**Recommendation:** Radix as the reference; NoteForest owns the role map and the measured values.
The rest of this note uses that map.

---

## 4. Review of the shipped values

### 4.1 Neutral ladder (perceived lightness, CIE L\*)

| Role | Dark | L\* | Light | L\* |
|---|---|---:|---|---:|
| `bg-app` | `#101113` | 5.0 | `#f3f5f7` | 96.4 |
| `bg-canvas` | `#17181a` | 8.2 | `#ffffff` | 100.0 |
| `bg-sidebar` | `#131416` | 6.3 | `#edf1f4` | 94.9 |
| `surface-1` | `#1b1d20` | 10.7 | `#ffffff` | 100.0 |
| `surface-2` | `#202329` | 13.6 | `#f2f5f7` | 96.4 |
| `surface-3` | `#262a30` | 16.9 | `#e8edf1` | 93.5 |
| `text-1` | `#e7e8ea` | 92.0 | `#1a1f23` | 11.4 |
| `text-2` | `#a6abb2` | 69.8 | `#4d5a63` | 37.5 |
| `text-3` | `#8b9199` | 59.9 | `#5f6b75` | 44.6 |

**Observations.**

- The dark ladder is monotonic and compressed: ~3 L\* between surface steps, ~22 L\* from text-1 to
  text-2, ~10 L\* from text-2 to text-3. That is a calm, Obsidian-like hierarchy.
- The light ladder is deliberately inverted for surfaces: app 96.4 → sidebar 94.9 → canvas 100 →
  surface-1 100 → surface-2 96.4 → surface-3 93.5. Surface-3 (menus/palette/toasts) is the darkest
  surface; it reads as recessed, and only works because it carries `--shadow-panel`. This is a
  valid overlay pattern, not an elevation bug; keep it.
- The light text ladder is compressed by the 4.5 floor: text-2 and text-3 differ by only 5.3 L\*
  (ΔE 7.1). It is still readable; if a stronger hierarchy is wanted, darken text-2 rather than
  lighten text-3.
- **The shipped neutral values are essentially a compressed Radix `slate` ramp.** Nearest-step
  ΔE76: dark `bg-app`/`bg-canvas` 0.4/0.5; surfaces 2.1–2.3; light surfaces 1.1–2.2. This is the
  strongest evidence that the current look already belongs to the Radix neutral family and does
  not need a wholesale replacement.

### 4.2 Text contrast (shipped)

| Text | Dark app | Dark canvas | Dark sidebar | Dark s1 | Dark s2 | Dark s3 | Light app | Light canvas | Light sidebar | Light s1 | Light s2 | Light s3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `text-1` | 15.41 | 14.49 | 15.03 | 13.78 | 12.84 | 11.76 | 15.20 | 16.61 | 14.63 | 16.61 | 15.17 | 14.09 |
| `text-2` | 8.18 | 7.69 | 7.98 | 7.31 | 6.81 | 6.24 | 6.50 | 7.10 | 6.25 | 7.10 | 6.48 | 6.02 |
| `text-3` | 5.94 | 5.59 | 5.80 | 5.32 | 4.95 | **4.54** | 5.00 | 5.46 | 4.81 | 5.46 | 4.99 | **4.63** |

All pass 4.5:1 today, but both text-3 values sit within 0.15 of the floor on `surface-3`. A token
tune or a new surface step could silently break them; add margin.

### 4.3 Borders and edges (shipped)

| Role | Dark | Dark min–max on 6 surfaces | Light | Light min–max |
|---|---|---:|---|---:|
| `border-1` | `#2e3238` | 1.12–1.47 | `#d7dee4` | 1.15–1.36 |
| `border-2` | `#3c4148` | 1.40–1.84 | `#b8c4cd` | 1.51–1.78 |
| `edge` | `#5e6670` | 2.48–3.25 | `#8b959d` | 2.59–3.05 |
| `edge-muted` | `#3a3f46` | 1.36–1.78 | `#c3ccd2` | 1.38–1.63 |

- `border-1` is a separator; 1.1–1.5 is acceptable for a purely decorative rule. It is **not** a
  valid 3:1 control boundary.
- `border-2` is used as the hover/focus border and on a few resting controls (rename field, branch
  port, swatch outline). At 1.4–1.8 it fails SC 1.4.11 where it is the only boundary.
- `edge` is a connector, not a control, but at 2.48–3.25 (dark) / 2.59–3.05 (light) it is faint on
  `surface-3`. The in-flight polish brief raises it; that is the right direction.
- `edge-muted` is intentionally dim. It is decorative; 1.4–1.8 is acceptable only if it never
  carries meaning alone. Raising it to ~2.1–2.9 (in-flight values) improves the reading of
  inactive branches without competing with active edges.

### 4.4 Status (shipped)

| Role | Dark | Dark on app | Dark on s3 | Dark on soft | Light | Light on app | Light on s3 | Light on soft |
|---|---|---:|---:|---:|---|---:|---:|---:|
| `danger` | `#d98b8b` | 7.21 | 5.50 | 5.85 | `#a23b32` | 5.99 | 5.55 | 5.62 |
| `success` | `#8fbf9f` | 9.10 | 6.95 | 6.79 | `#2f6b4f` | 5.76 | 5.34 | 5.47 |
| `warning` | `#d6b17a` | 9.38 | 7.16 | 6.81 | `#8a5a00` | 5.42 | 5.03 | 5.43 |

All pass 4.5:1 on every surface and on their soft fills. `danger-border`/`warning-border` are
decorative (3.5–3.7 against the status text, 1.36–2.67 against surfaces); the status is carried by
icon + text, so that is acceptable. **Keep** the status roles.

### 4.5 Accents (shipped)

| Accent | Theme | Fill | L\* | C\* | Min fill contrast on 6 surfaces | Text on fill | Text on strong | Strong on min surface |
|---|---|---|---:|---:|---:|---:|---:|---:|
| blue | dark | `#9bb7d4` | 73.3 | 18.0 | 6.95 | 8.91 | 11.65 | 9.08 |
| teal | dark | `#8fc7c0` | **76.4** | 19.7 | 7.62 | 9.78 | 11.94 | 9.31 |
| amber | dark | `#d6b17a` | 74.3 | 33.7 | 7.16 | 9.19 | 11.42 | 8.90 |
| rose | dark | `#d99aa8` | **70.0** | 25.6 | 6.27 | 8.05 | 10.22 | 7.96 |
| blue | light | `#2f5f8a` | 38.9 | 28.7 | 5.70 | 6.72 | 9.30 | 7.89 |
| teal | light | `#1f6f66` | 42.2 | 26.0 | 5.06 | 5.96 | 8.48 | 7.20 |
| amber | light | `#8a5a00` | 42.3 | 52.3 | 5.03 | 5.93 | 8.07 | 6.84 |
| rose | light | `#9b3f55` | 39.9 | 41.0 | 5.51 | 6.49 | 8.90 | 7.55 |

All accents pass the existing contract: text on accent/hover/strong ≥ 4.5, and the fill/strong ≥ 3
against every surface. The issues are perceptual, not threshold failures:

- **Dark teal is 6.4 L\* lighter than dark rose.** Side by side in Settings, teal reads as a lighter
  weight. The dark fill spread is 6.4 L\*; a good target is ≤ 2 L\*.
- **Light teal/amber are 3.3–3.4 L\* lighter than blue.** Within a perceptible band, but the light
  set is tighter than the dark set.
- **Amber is the chroma outlier**: C\* 33.7 dark / 52.3 light vs 18–29 for blue and 26–41 for rose.
  Part of that is the hue (gold is naturally more chromatic); do not flatten it to blue's chroma or
  it turns brown.
- **Light rose `hover` equals `strong`** (`#7d2f43` for both). Values may coincide, but hover and
  ring are different roles; a distinct hover makes the interaction ladder clearer.
- **The color-blind cost of equalising lightness:** under protanopia, equal-L\* teal and rose
  converge (ΔE76 2.4). The shipped 6.4 L\* difference helps protanopes separate them (ΔE 5.9), but
  at the cost of inconsistent weight. Because accents are chosen from **labelled** swatches with a
  selection ring (`AppearanceSettings.tsx`), never as the sole carrier of meaning, harmonising
  lightness is the better default. If accents ever become a data channel (per-branch colors), this
  trade-off must be revisited.

### 4.6 Verdict on the shipped values

| Group | Verdict | Why |
|---|---|---|
| Dark neutrals | **Keep** | Monotonic, calm, essentially compressed Radix slate (ΔE 0.4–2.3) |
| Light neutrals | **Keep** | Correct hierarchy; surface-3 is a deliberate overlay surface |
| `text-3` (both) | **Adjust** | 4.54 / 4.63 is too close to the 4.5 floor |
| `border-1` | **Keep** | Decorative separator; 3:1 does not apply |
| `border-2` | **Adjust** | 1.4–1.8 where it bounds a control; raise to 3:1 |
| `edge` / `edge-muted` | **Adjust** | Already fixed by the in-flight brief; adopt its values |
| Status | **Keep** | All pass 4.5 on surfaces and soft; icon + text carries state |
| Dark accents | **Adjust teal/rose** | 6.4 L\* spread; blue/amber pass and match the approved look |
| Light accents | **Keep** (minor rose hover) | 3.4 L\* spread is acceptable; fix the hover=strong duplicate |
| `note-surface` | **Add (in-flight)** | Distinct card role; light needs a visible tint |

---

## 5. Recommended values

### 5.1 Accent registry (existing `AccentSet` shape)

Changes are marked **bold**. Everything not marked is shipped and approved.

| id | Theme | `accent` | `strong` | `soft` | `hover` | `contrast` |
|---|---|---|---|---|---|---|
| blue | dark | `#9bb7d4` | `#b9d0e6` | `#26313c` | `#a9c3dc` | `#101418` |
| teal | dark | **`#89c0ba`** | **`#99d1ca`** | `#233432` | **`#92cac3`** | `#101418` |
| amber | dark | `#d6b17a` | `#e6c795` | **`#382f22`** | `#e3c48f` | `#101418` |
| rose | dark | **`#e5a5b3`** | **`#f6b5c3`** | `#3a2830` | **`#efaebc`** | `#101418` |
| blue | light | `#2f5f8a` | `#1f4a6d` | `#e2edf6` | `#264d71` | `#ffffff` |
| teal | light | `#1f6f66` | `#15564f` | `#e0f1ee` | `#175c55` | `#ffffff` |
| amber | light | `#8a5a00` | `#6f4800` | `#fff2d6` | `#714900` | `#ffffff` |
| rose | light | `#9b3f55` | `#7d2f43` | `#f8e4e9` | **`#873348`** | `#ffffff` |

**Why these values.**

- Dark teal `#8fc7c0` (L\* 76.4) → `#89c0ba` (73.9), and dark rose `#d99aa8` (70.0) →
  `#e5a5b3` (74.1): all four dark fills now sit at L\* 73.3–74.3 (spread 1.0). The teal/rose
  strong/hover values move with the fill to keep a consistent step pattern (hover ≈ +3.5 L\*,
  strong ≈ +6 L\*); blue and amber keep their approved values. Visual deltas: teal accent ΔE 2.5,
  strong 4.3, hover 4.7; rose accent ΔE 4.1, strong 5.4, hover 3.9. These are tunes, not a
  restyle.
- Dark amber `soft` `#3a3124` → `#382f22` (ΔE 0.9): the old soft gave `text-3` only **4.43** on a
  selected amber row. The new value gives 4.63 and is imperceptible as a fill change.
- Light rose `hover` `#7d2f43` → `#873348`: removes the hover=strong duplicate and keeps the
  light-mode pattern (hover is darker than the fill, lighter than the ring). Text on hover stays
  8.09.
- **Light accents are otherwise kept** at L\* 38.9–42.3 (spread 3.4). Tightening them to 40 would
  require making teal darker/more saturated and amber browner; the gain is small and it would
  depart from the approved light look. The amber light chroma (52.3) is intentionally the loudest;
  reducing it to ~42 (optional `#7f5618`) turns the gold into brown — not recommended.

**Four vs six vs eight accents.**

- **Four is the right default.** It covers cool (blue), cool-green (teal), warm (amber), and
  red-pink (rose), and each is a labelled identity, not a data encoding.
- **Six is defensible** if there is user demand: the best addition is **violet** (hue ~300), which
  is distinct from teal/amber/rose in normal vision but converges with blue under
  deuteranopia/protanopia (ΔE76 1.5–4.8), so it relies on the labelled swatch and selection ring.
  **Green is the risky sixth**: it collides with `--success`, and a green accent would make success
  states less legible. If a sixth is added, add violet only, or add green with an explicit warning
  in the Appearance copy.
- **Eight is not worth it.** Beyond six the choice is novelty; each entry adds two themes, six
  surfaces, four status pairings, and a CVD review to the QA matrix. The Appearance help text
  already promises "curated sets with checked contrast"; eight makes that promise expensive to
  keep. The registry can hold eight; the product should ship four.

### 5.2 Neutrals (dark and light)

| Role | Dark (recommended) | Light (recommended) | Change |
|---|---|---|---|
| `bg-app` | `#101113` | `#f3f5f7` | keep |
| `bg-canvas` | `#17181a` | `#ffffff` | keep |
| `bg-sidebar` | `#131416` | `#edf1f4` | keep |
| `surface-1` | `#1b1d20` | `#ffffff` | keep |
| `surface-2` | `#202329` | `#f2f5f7` | keep |
| `surface-3` | `#262a30` | `#e8edf1` | keep |
| `text-1` | `#e7e8ea` | `#1a1f23` | keep |
| `text-2` | `#a6abb2` | `#4d5a63` | keep |
| `text-3` | **`#949aa2`** | **`#5b6771`** | adjust (margin) |
| `border-1` | `#2e3238` | `#d7dee4` | keep (separator) |
| `border-2` | **`#6e737a`** | **`#82888c`** | adjust (3:1 control/hover boundary) |
| `edge` | **`#7b858f`** | **`#6c7882`** | in-flight brief |
| `edge-muted` | **`#565f68`** | **`#9aa5ad`** | in-flight brief |
| `note-surface` | **`#1b1d20`** | **`#f6f8fb`** | in-flight brief |
| `note-surface-hover` | **`#202329`** | **`#eef3f7`** | in-flight brief |

**Border-2 rationale.** The recommended values are neutral values that reach 3:1 against the
**worst** shell surface (`surface-3`): dark `#6e737a` 3.02–3.95, light `#82888c` 3.05–3.59. They
make the existing "strong/hover border" role usable as a control boundary without adding a role. Visual cost: hover/focus borders become clearly visible (that is the point). The
resting `.nf-button`/`.nf-input` still use `border-1`; to claim SC 1.4.11 for those controls, a
small component follow-up must switch them to `border-2` (or the product owner accepts the
documented exception). In that case hover would rely on the `surface-2` background change and the
text-1 shift, not on a border-color jump. This is a component change, not a palette change.

**Alternative if the heavier border is rejected:** keep `#3c4148`/`#b8c4cd` and record `border-2`
as a strong hover border, not a control boundary. Then SC 1.4.11 is not claimed for neutral control
outlines; focus rings and labels remain the affordances. Do not silently mix the two.

**Edges and note surface.** The values above are the ones already specified in
`docs/tasks/ui-continuous-shell-polish.md` (commit 1). They are not merged at `54e21bb`; adopt them
when that batch lands, and keep Page/PDF edge colors out of this change. The note-surface values make
the light card a tint (ΔE 3.0 from white) rather than a boundary; it relies on the card radius and,
if the product owner wants a stronger edge, a `border-1` outline. If a borderless card must be
visible on its own, use `#f2f6f9` (ΔE 3.9) instead; the in-flight `#f6f8fb` is the calmer choice.

### 5.3 Status (keep)

| Role | Dark | Light |
|---|---|---|
| `danger` | `#d98b8b` | `#a23b32` |
| `danger-soft` | `#351f22` | `#fbeae7` |
| `danger-border` | `#6a3a3d` | `#e0b3ac` |
| `success` | `#8fbf9f` | `#2f6b4f` |
| `success-soft` | `#1e2f26` | `#e6f2eb` |
| `warning` | `#d6b17a` | `#8a5a00` |
| `warning-soft` | `#352c1e` | `#fff4dc` |
| `warning-border` | `#6a5536` | `#e6c98a` |

**Why not Radix status values.** Radix's light step 11 status text fails 4.5:1 on our worst surface:
red `#ce2c31` 4.42, green `#218358` 4.00, amber `#ab6400` 3.91. Radix's dark step 11 values pass
(6.84–9.42) but are much more saturated than the shipped pastel status set and would break the
weight match with the accents. The shipped status values pass everywhere and match the accent
weight; **keep** them. If a new status hue is ever added (info/open/closed), use Radix's step 11
for text, step 3 for soft, step 7 for border, and re-run the matrix — do not assume the steps pass
on our surfaces.

### 5.4 Overlay and shadows (keep the shipped values)

| Role | Dark | Light |
|---|---|---|
| `overlay` | `rgb(0 0 0 / 0.4)` | `rgb(16 20 24 / 0.38)` |
| `shadow-panel` | `0 8px 24px rgb(0 0 0 / 0.35)` | `0 8px 24px rgb(16 20 24 / 0.12)` |
| `shadow-overlay` | `0 24px 64px rgb(0 0 0 / 0.55)` | `0 24px 64px rgb(16 20 24 / 0.2)` |
| `shadow-toast` | `0 12px 32px rgb(0 0 0 / 0.45)` | `0 12px 32px rgb(16 20 24 / 0.18)` |

Shadows are depth cues, not identification cues; there is no WCAG ratio. Dark elevation is carried
by surface lightness and borders, not by black shadows on a near-black app. No change recommended.

### 5.5 Doc/code drift found

These are not palette values, but they affect the contract and should be fixed in the next docs
sweep; this research does not edit them.

- `docs/design/color-system.md` §3.2/§3.3 specifies `--shadow-overlay: 0 18px 48px` with alpha
  0.45/0.18; `styles.css:74`/`:105` ships `0 24px 64px` with alpha 0.55/0.2. The code is the
  accepted visual; the doc is stale.
- `--shadow-toast` is shipped (`styles.css:77`/`:106`) but is not in the contract role list.
- `--note-surface`/`--note-surface-hover` are in the in-flight polish brief but not in the base code
  or the contract doc.
- `docs/design/color-system.md` §4.1 lists a `swatch` field on `AccentSet`; the code interface
  (`appearance.ts:41`) has no `swatch`, and `AppearanceSettings.tsx` derives the swatch from the
  resolved `accent`. The code shape is the source of truth; the doc line is stale.
- The contract doc's light `text-3` is `#5f6b75`; this note recommends `#5b6771` for margin.

---

## 6. Contrast matrix (recommended values)

Surfaces: `bg-app`, `bg-canvas`, `bg-sidebar`, `surface-1`, `surface-2`, `surface-3`,
`note-surface`. `note-surface` equals `surface-1` in dark, so the dark column is repeated there.

### 6.1 Text on surfaces

**Dark**

| Text | app | canvas | sidebar | s1 | s2 | s3 | note |
|---|---:|---:|---:|---:|---:|---:|---:|
| `text-1` `#e7e8ea` | 15.41 | 14.49 | 15.03 | 13.78 | 12.84 | 11.76 | 13.78 |
| `text-2` `#a6abb2` | 8.18 | 7.69 | 7.98 | 7.31 | 6.81 | 6.24 | 7.31 |
| `text-3` `#949aa2` | 6.66 | 6.26 | 6.50 | 5.95 | 5.55 | 5.08 | 5.95 |

**Light**

| Text | app | canvas | sidebar | s1 | s2 | s3 | note |
|---|---:|---:|---:|---:|---:|---:|---:|
| `text-1` `#1a1f23` | 15.20 | 16.61 | 14.63 | 16.61 | 15.17 | 14.09 | 15.61 |
| `text-2` `#4d5a63` | 6.50 | 7.10 | 6.25 | 7.10 | 6.48 | 6.02 | 6.67 |
| `text-3` `#5b6771` | 5.30 | 5.80 | 5.10 | 5.80 | 5.29 | 4.92 | 5.45 |

All ≥ 4.5. Minimum: 4.92 (light text-3 on surface-3); dark minimum 5.08.

### 6.2 Non-text roles on surfaces

**Dark**

| Role | app | canvas | sidebar | s1 | s2 | s3 | note |
|---|---:|---:|---:|---:|---:|---:|---:|
| `border-1` `#2e3238` | 1.47 | 1.38 | 1.43 | 1.31 | 1.22 | 1.12 | 1.31 |
| `border-2` `#6e737a` | 3.95 | 3.72 | 3.86 | 3.54 | 3.30 | 3.02 | 3.54 |
| `edge` `#7b858f` | 5.03 | 4.73 | 4.91 | 4.50 | 4.19 | 3.84 | 4.50 |
| `edge-muted` `#565f68` | 2.91 | 2.73 | 2.84 | 2.60 | 2.42 | 2.22 | 2.60 |

**Light**

| Role | app | canvas | sidebar | s1 | s2 | s3 | note |
|---|---:|---:|---:|---:|---:|---:|---:|
| `border-1` `#d7dee4` | 1.24 | 1.36 | 1.20 | 1.36 | 1.24 | 1.15 | 1.28 |
| `border-2` `#82888c` | 3.28 | 3.59 | 3.16 | 3.59 | 3.28 | 3.05 | 3.37 |
| `edge` `#6c7882` | 4.14 | 4.52 | 3.98 | 4.52 | 4.13 | 3.83 | 4.25 |
| `edge-muted` `#9aa5ad` | 2.30 | 2.51 | 2.21 | 2.51 | 2.29 | 2.13 | 2.36 |

- `border-2` ≥ 3.0 on every surface: the intended control/hover boundary.
- `border-1` is a separator; 1.15–1.47. It is exempt from 1.4.11 **only** when it is not the sole
  boundary of a control. See §5.2 for the component follow-up.
- `edge` ≥ 3.83 on every surface; `edge-muted` is intentionally below 3 (decorative inactive
  connectors). Both are canvas graphics, not text or control boundaries.

### 6.3 Accent matrix

**Dark**

| Accent | Fill L\* | C\* | Fill min surface | Text/fill | Text/hover | Text/strong | Strong min surface | Fill/soft |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| blue | 73.3 | 18.0 | 6.95 | 8.91 | 10.15 | 11.65 | 9.08 | 6.38 |
| teal | 73.9 | 19.3 | 7.08 | 9.08 | 10.09 | 10.86 | 8.47 | 6.41 |
| amber | 74.3 | 33.7 | 7.16 | 9.19 | 11.06 | 11.42 | 8.90 | 6.34 |
| rose | 74.1 | 25.7 | 7.12 | 9.13 | 10.09 | 10.85 | 8.46 | 6.79 |

**Light**

| Accent | Fill L\* | C\* | Fill min surface | Text/fill | Text/hover | Text/strong | Strong min surface | Fill/soft |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| blue | 38.9 | 28.7 | 5.70 | 6.72 | 8.81 | 9.30 | 7.89 | 5.66 |
| teal | 42.2 | 26.0 | 5.06 | 5.96 | 7.78 | 8.48 | 7.20 | 5.10 |
| amber | 42.3 | 52.3 | 5.03 | 5.93 | 7.91 | 8.07 | 6.84 | 5.34 |
| rose | 39.9 | 41.0 | 5.51 | 6.49 | 8.09 | 8.90 | 7.55 | 5.34 |

All text-on-accent pairings ≥ 5.9 (far above 4.5); all fill/strong rings ≥ 6.84 (far above 3).
The tightest number in the accent system is the light amber fill against `surface-3` (5.03), not
the text on the fill.

Selection rows: `text-1` on every `soft` is 10.4–11.2 (dark) and 13.7–15.0 (light); `text-2` on
`soft` is 5.5–6.0 (dark) and 5.8–6.4 (light); `text-3` on `soft` is 4.60–4.84 (dark) and 4.76–5.22
(light). The dark amber `soft` fix is what keeps `text-3` above 4.5.

### 6.4 Status matrix

**Dark**

| Role | app | canvas | sidebar | s1 | s2 | s3 | note | on soft | on border |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `danger` | 7.21 | 6.78 | 7.04 | 6.45 | 6.01 | 5.50 | 6.45 | 5.85 | 3.51 |
| `success` | 9.10 | 8.56 | 8.88 | 8.14 | 7.59 | 6.95 | 8.14 | 6.79 | — |
| `warning` | 9.38 | 8.82 | 9.15 | 8.39 | 7.82 | 7.16 | 8.39 | 6.81 | 3.52 |

**Light**

| Role | app | canvas | sidebar | s1 | s2 | s3 | note | on soft | on border |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `danger` | 5.99 | 6.55 | 5.76 | 6.55 | 5.98 | 5.55 | 6.15 | 5.62 | 3.50 |
| `success` | 5.76 | 6.29 | 5.54 | 6.29 | 5.75 | 5.34 | 5.92 | 5.47 | — |
| `warning` | 5.42 | 5.93 | 5.22 | 5.93 | 5.41 | 5.03 | 5.57 | 5.43 | 3.69 |

All status text ≥ 5.03 on every surface and soft. Borders are 3.5–3.7 against the status text but
1.5–2.0 against surfaces; treat them as decorative. The status pattern (icon + text + neutral
surface) is what makes this acceptable; a bare colored border would not be.

### 6.5 Thresholds and exceptions

| Item | Threshold | Shipped/recommended | Status |
|---|---:|---|---|
| `text-1/2/3` on 7 surfaces | 4.5:1 | 4.92 minimum | Pass |
| Status text on surfaces/soft | 4.5:1 | 5.03 minimum | Pass |
| Accent text on fill/hover/strong | 4.5:1 | 5.93 minimum | Pass |
| Accent fill/strong vs surfaces | 3:1 | 5.03 minimum | Pass |
| Focus ring (`accent-strong`) vs surfaces | 3:1 | 6.84 minimum | Pass |
| `border-2` control/hover boundary | 3:1 | 3.02/3.05 minimum | Pass with recommended values |
| `border-1` separator | no ratio (decorative) | 1.12–1.47 | Exempt; not a sole control boundary |
| `edge-muted` inactive connector | no ratio (decorative) | 2.13–2.91 | Exempt; never sole meaning |
| Status soft border | no ratio (decorative) | 1.36–2.67 vs surface | Exempt; icon + text carries state |
| Disabled controls | exempt (SC 1.4.3/1.4.11) | — | Exempt |
| Large text | 3:1 | not used in the shell | 4.5 applies to all shell text |

**Focus appearance.** The global ring is `2px solid var(--accent-ring)` with `outline-offset: 1px`.
Every accent strong is ≥ 6.84 against every surface, so the ring is visible. The ring is also the
active-edge color; that is a deliberate reuse, not a duplicate role.

### 6.6 Color-blind notes

Machado 2009, severity 1.0; ΔE76 after simulation. `normal / protan / deutan / tritan`.

**Accents (dark)**

| Pair | normal | protan | deutan | tritan |
|---|---:|---:|---:|---:|
| blue/teal | 22.0 | 8.0 | 6.9 | 5.5 |
| blue/amber | 51.7 | 27.2 | 29.2 | 22.5 |
| blue/rose | 34.9 | 7.1 | 11.8 | 24.7 |
| teal/amber | 43.9 | 19.3 | 22.3 | 27.5 |
| teal/rose | 45.0 | **2.4** | 5.0 | 29.9 |
| amber/rose | 36.5 | 20.3 | 17.5 | **4.2** |

**Accents (light)**

| Pair | normal | protan | deutan | tritan |
|---|---:|---:|---:|---:|
| blue/teal | 36.1 | 17.6 | 14.9 | 9.9 |
| blue/amber | 80.7 | 86.0 | 87.6 | 52.8 |
| blue/rose | 55.1 | 14.6 | 25.0 | 59.4 |
| teal/amber | 65.6 | 68.6 | 72.7 | 60.7 |
| teal/rose | 67.0 | 8.6 | 10.1 | 68.2 |
| amber/rose | 51.6 | 72.7 | 62.7 | 12.2 |

**Status**

| Pair | Theme | normal | protan | deutan | tritan |
|---|---|---:|---:|---:|---:|
| danger/success | dark | 52.7 | 8.3 | **4.3** | 33.2 |
| danger/success | light | 71.2 | 9.2 | 16.3 | 65.2 |
| danger/warning | dark | 32.5 | 16.4 | 12.9 | 10.5 |
| danger/warning | light | 36.4 | 56.1 | 45.8 | 16.9 |
| success/warning | dark | 36.1 | 11.3 | 15.4 | 23.9 |
| success/warning | light | 57.2 | 59.2 | 62.0 | 49.9 |

**Interpretation.** Three cool accents (blue, teal, rose) inevitably converge under protanopia;
equal lightness makes teal/rose worse (2.4) than the shipped unequal values (5.9). This is
acceptable **only because** accents are never the sole carrier of meaning: the Settings swatches
have `aria-label`, `title`, `aria-pressed`, a visible selection ring, and the accent is a global
preference, not a per-branch category. Do not introduce per-branch accent colors without a
non-color channel. Status danger/success under deuteranopia (4.3) is the classic red/green
confusion; the contract's icon + text rule is what keeps it compliant. Amber is the warning hue;
an amber accent can make warnings less distinctive, so the warning must keep its icon and text.

---

## 7. Optional full theme packs

### 7.1 Catppuccin

**License:** MIT; safe to copy with the notice. **Coverage:** Latte (light) + Frappé, Macchiato,
Mocha (dark), 26 named colors each; active (1.8.0, March 2026). **Fit:** the named roles map
intuitively (base/mantle/crust, surface0/1/2, overlay0/1/2, subtext0/1, text, red/green/yellow/
peach, blue/teal/mauve/pink), but a naive mapping fails the contract:

| Role map | Mocha contrast | Latte contrast |
|---|---|---|
| `text-1` on `surface-1` | 8.69 | 5.17 |
| `text-1` on `surface-3` | 4.62 | **3.69** |
| `text-2` on `surface-3` | **3.77** | **2.89** |
| `text-3` on `surface-3` | **3.00** | **2.28** |
| `border-1` on `surface-1` | 1.38 | 1.18 |
| `border-2` on `surface-1` | 1.88 | 1.40 |

- **Mocha:** `text-2`/`text-3` fail on `surface-2`/`surface-3` (4.10/3.00). You would need to use
  `subtext1` for text-2 and `text` for text-3 (collapsing hierarchy) or lighten the upper surfaces.
- **Latte:** `text-1` itself fails on `surface-3` (3.69); `text-2`/`text-3` fail almost everywhere.
  The Latte surfaces are too dark for its text under a 4.5 floor.
- **Latte accents** fail 3:1 on white: yellow `#df8e1d` 2.31, green `#40a02b` 2.96, peach `#fe640b`
  2.64, pink `#ea76cb` 2.34. A pack would need custom dark accent fills.
- **Verdict:** a plausible **later** pack, but it needs a curated NoteForest role map and measured
  overrides, not a 1:1 copy. It is not a data-only registry entry.

### 7.2 Nord

**License:** repo LICENSE MIT; npm metadata `Apache-2.0 AND CC-BY-SA-4.0` (unresolved). **Coverage:**
one dark palette, 16 colors, no official light counterpart; package 0.2.1 from 2016.
**Fit:** the dark text roles pass comfortably (`nord6` 10.84 on `nord0`; `nord4` 5.46 on `nord3`),
but all borders/edges are `nord3` and collapse to 1.36 on `nord1` and 1.00 on `nord3`. There is no
light theme, so a full pack would require inventing one — a design/product decision, not a registry
entry. **Verdict:** reject for now; the license discrepancy alone is a stop condition for shipping.

### 7.3 What a theme-pack registry would need

A pack changes the neutral roles, status roles, overlay/shadows, and possibly the default accent —
not just the accent values. Under the frozen shape, the neutral roles are static CSS in
`html[data-theme]`; a pack cannot be applied without moving them into data.

1. **Settings shape:** add `pack: string` (or a `themePack` object) to `AppearanceSettings` and bump
   to `settingsVersion: 4` with a migration. Unknown pack → default. This is the only schema change;
   there is no per-document appearance.
2. **Pack registry:** a `ThemePack` with `id`, `label`, `dark`/`light` maps for `bg-*`, `surface-*`,
   `text-*`, `border-*`, `edge*`, status + soft/border, `overlay`, shadows, and an optional default
   accent. Derived roles (`accent-ring`, `focus-ring`, `edge-active`) still derive.
3. **Application path:** write the neutral values as root custom properties, like
   `appearanceCssVariables` writes the accent scale. Today the theme blocks are static; this is a
   renderer code change, not a registry-only change.
4. **Tests:** per-pack contrast matrix (text on every surface, status on soft, rings), registry
   completeness, unknown-pack fallback, and a pack-switch test. The existing guards are theme-block
   based and would need a pack-aware path.
5. **Page/PDF isolation:** packs must not touch `--paper-*`/print. The code font remains the only
   appearance value that reaches the paper; add a pack-switch raster/PDF parity test.
6. **Licensing:** MIT notice for Catppuccin/Radix; Apache NOTICE for Carbon; resolve Nord before
   any use. A pack picker that downloads packs at runtime would violate the no-runtime-dependency
   constraint; ship packs as bundled data.
7. **UI:** a pack picker with preview swatches, a default accent per pack, and copy that explains
   packs vs accents. This is a UX/product design pass, not a palette entry.
8. **Product decision:** does a pack replace the accent choice, coexist with it, or allow pack-level
   accent overrides? Does `system` still select dark/light inside the pack? These are not research
   calls.

**Verdict:** a full pack is a realistic later feature, but it is **not** compatible with the frozen
`settingsVersion: 3` shape and needs a product decision. Do not schedule it in the same batch as the
palette tune.

---

## 8. Future-proofing

### 8.1 Adding an accent remains a registry entry

Confirmed by the code path:

1. Append one `AccentSet` to `ACCENTS` in `packages/layout/src/appearance.ts` with `id`, `label`,
   and complete `dark`/`light` `AccentValues`.
2. `normalizeAppearance` accepts any id present in `ACCENTS`; an unknown stored id falls back to
   blue. No migration.
3. `appearanceCssVariables` writes `--accent`, `--accent-strong`, `--accent-soft`,
   `--accent-hover`, `--accent-contrast`; `--accent-ring`, `--focus-ring`, and `--edge-active`
   derive from `strong`. No CSS change.
4. `AppearanceSettings.tsx` maps `ACCENTS` and uses `entry[resolvedTheme].accent` for the swatch,
   with `aria-label`/`title`/`aria-pressed`. No component change.
5. The only test change is the `ACCENTS` id/label list in
   `packages/layout/test/appearance.test.ts`; the existing contrast loop automatically covers the
   new set. That is explicitly allowed by the contract.

**No schema, component, or settings change.** The four new colors still need a contrast and CVD
review in both themes.

### 8.2 Adding a full pack later

1. Product/UX decision on pack vs accent, and on per-pack accent overrides.
2. Planner/Architect package: `settingsVersion: 4`, `ThemePack` shape, migration, fallback.
3. Implementer: move neutral/status/shadow values into the pack registry and the root-variable
   application path; add the pack picker.
4. Measured pack maps, not copies: every pack must pass the §6 matrix on its own surfaces.
5. Licensing/credits and a Page/PDF isolation test.
6. One full verify, then a visual pass by the product owner.

---

## 9. Rejected alternatives

- **Open Color as the base.** Light-only, 10 steps, no dark mode or status semantics, last release
  2021. Fine for tints in a design lab; not a shell system.
- **Tailwind's palette as the source.** 26 × 11 raw OKLCH ramps, no light/dark pairing, no semantic
  guidance. Tailwind is already a build dependency, but binding shell roles to `slate-*` would add
  a mapping and couple tokens to utility classes for no gain.
- **Primer as the source.** The best role model and a real light/dark system, but its neutral scale
  is inverted per mode and its functional token set is GitHub-specific. Adopting it would be a
  restyle. Its thresholds were used as a cross-check.
- **Carbon as the source.** The strongest formal accessibility documentation, but IBM-branded,
  Apache-2.0 notice overhead, and four fixed themes. A full theme, not a palette.
- **Catppuccin now.** MIT and both modes, but its low-contrast roles fail 4.5 on its own surfaces
  and its Latte accents fail 3:1. A later pack only with a curated map.
- **Nord now.** Dark-only and a license discrepancy (MIT repo vs Apache/CC-BY-SA npm metadata).
- **Solarized.** MIT, 16 colors, but low contrast and no neutral ladder for six surfaces; rejected.
- **Material 3 tonal palettes.** Apache-2.0 and complete, but designed around Material components
  and tonal steps; a large mapping for no visual gain. Not evaluated further.
- **A free color picker.** Unbounded contrast/CVD risk; out of scope.
- **Per-document appearance.** Out of scope; conflicts with the personal-settings model (ADR-0008)
  and the Page/PDF isolation.
- **A runtime palette package.** The values are data; a dependency would add supply-chain surface
  and a versioning problem for zero benefit.

---

## 10. Open questions

1. **Is SC 1.4.11 control-boundary compliance a hard gate?** If yes, the `border-2` raise above is
   required, and `.nf-button`/`.nf-input` should switch from `border-1` to `border-2` at rest. If
   no, keep the shipped borders and document the exception. The palette values are ready either
   way; the component switch is a separate brief.
2. **Does the product owner accept the dark teal/rose tune?** It is a measured change (ΔE 2.5–5.4),
   not a restyle, but the R3 values were explicitly approved. The four fills become equally light.
3. **Four, six, or eight accents?** Recommendation: ship four; add violet only if there is demand;
   do not add green without accepting the success collision; do not go to eight.
4. **Is `#f6f8fb` enough of a light note surface?** It is ΔE 3.0 from white and relies on the card
   radius/outline. If the card is borderless and must read as a distinct surface, use `#f2f6f9`
   (ΔE 3.9) or add `border-1`.
5. **Do we want a full theme pack at all?** If yes, plan `settingsVersion: 4` and a pack registry;
   if no, drop the idea and keep the accent registry as the only appearance data.
6. **Docs sweep:** fix the shadow drift, add `--shadow-toast`, add the note-surface roles when the
   polish batch lands, and remove the unused `swatch` line from the design doc.
7. **APCA:** the project tests WCAG 2.x; Radix publishes APCA guidance. Should a future contrast
   check add APCA as a secondary signal? Not required now; WCAG 2.2 is the normative target.
8. **Wide gamut:** Radix ships P3 variants; the shell uses sRGB hex. P3 is a separate decision.

---

## 11. Recommended next step

1. Orchestrator: confirm the value adjustments and the `border-2`/component decision.
2. One Implementer brief (palette tune, data only): update `ACCENTS` (dark teal/rose/amber-soft,
   light rose hover), the dark/light `text-3` and `border-2` values, the in-flight edges/note
   surface if that batch has not landed, and the registry/contrast tests. No component, schema,
   settings, Page, or PDF change. Targeted tests plus one `verify:fast`.
3. A separate accessibility brief only if SC 1.4.11 for resting controls is in scope: switch
   `.nf-button`/`.nf-input` to `border-2` (or add a role), with screenshots in both themes.
4. Full packs: keep out of scope until the product decision; then a Planner/UX package first.

---

## Appendix A — exact values in the existing shapes

### A.1 Theme blocks (dark)

```css
--bg-app: #101113;
--bg-canvas: #17181a;
--bg-sidebar: #131416;
--surface-1: #1b1d20;
--surface-2: #202329;
--surface-3: #262a30;
--note-surface: #1b1d20;        /* in-flight */
--note-surface-hover: #202329;  /* in-flight */
--text-1: #e7e8ea;
--text-2: #a6abb2;
--text-3: #949aa2;              /* was #8b9199 */
--border-1: #2e3238;
--border-2: #6e737a;            /* was #3c4148 */
--edge: #7b858f;                /* in-flight, was #5e6670 */
--edge-muted: #565f68;          /* in-flight, was #3a3f46 */
--danger: #d98b8b;
--danger-soft: #351f22;
--danger-border: #6a3a3d;
--success: #8fbf9f;
--success-soft: #1e2f26;
--warning: #d6b17a;
--warning-soft: #352c1e;
--warning-border: #6a5536;
--overlay: rgb(0 0 0 / 0.4);
--shadow-panel: 0 8px 24px rgb(0 0 0 / 0.35);
--shadow-overlay: 0 24px 64px rgb(0 0 0 / 0.55);
--shadow-toast: 0 12px 32px rgb(0 0 0 / 0.45);
```

### A.2 Theme blocks (light)

```css
--bg-app: #f3f5f7;
--bg-canvas: #ffffff;
--bg-sidebar: #edf1f4;
--surface-1: #ffffff;
--surface-2: #f2f5f7;
--surface-3: #e8edf1;
--note-surface: #f6f8fb;        /* in-flight */
--note-surface-hover: #eef3f7;  /* in-flight */
--text-1: #1a1f23;
--text-2: #4d5a63;
--text-3: #5b6771;              /* was #5f6b75 */
--border-1: #d7dee4;
--border-2: #82888c;            /* was #b8c4cd */
--edge: #6c7882;                /* in-flight, was #8b959d */
--edge-muted: #9aa5ad;          /* in-flight, was #c3ccd2 */
--danger: #a23b32;
--danger-soft: #fbeae7;
--danger-border: #e0b3ac;
--success: #2f6b4f;
--success-soft: #e6f2eb;
--warning: #8a5a00;
--warning-soft: #fff4dc;
--warning-border: #e6c98a;
--overlay: rgb(16 20 24 / 0.38);
--shadow-panel: 0 8px 24px rgb(16 20 24 / 0.12);
--shadow-overlay: 0 24px 64px rgb(16 20 24 / 0.2);
--shadow-toast: 0 12px 32px rgb(16 20 24 / 0.18);
```

### A.3 Accent registry (changes marked)

```ts
// dark
blue:  { accent: '#9bb7d4', strong: '#b9d0e6', soft: '#26313c', hover: '#a9c3dc', contrast: '#101418' }
teal:  { accent: '#89c0ba', strong: '#99d1ca', soft: '#233432', hover: '#92cac3', contrast: '#101418' } // changed
amber: { accent: '#d6b17a', strong: '#e6c795', soft: '#382f22', hover: '#e3c48f', contrast: '#101418' } // soft changed
rose:  { accent: '#e5a5b3', strong: '#f6b5c3', soft: '#3a2830', hover: '#efaebc', contrast: '#101418' } // changed

// light
blue:  { accent: '#2f5f8a', strong: '#1f4a6d', soft: '#e2edf6', hover: '#264d71', contrast: '#ffffff' }
teal:  { accent: '#1f6f66', strong: '#15564f', soft: '#e0f1ee', hover: '#175c55', contrast: '#ffffff' }
amber: { accent: '#8a5a00', strong: '#6f4800', soft: '#fff2d6', hover: '#714900', contrast: '#ffffff' }
rose:  { accent: '#9b3f55', strong: '#7d2f43', soft: '#f8e4e9', hover: '#873348', contrast: '#ffffff' } // hover changed
```

## Appendix B — reproduction

- Scripts: `/tmp/nf-colors/color.mjs` (WCAG, Lab/LCh, ΔE76, Machado CVD), `current.mjs`,
  `final.mjs`, `neutrals.mjs`, `packs.mjs`, `mapping.mjs`, `changes.mjs`, `soft.mjs`.
- Palette inputs: `@radix-ui/colors@3.0.0` CSS, `@primer/primitives@11.10.0` CSS,
  `@carbon/colors@11.62.0` tokens, `tailwindcss@3.4.17` source palette (v4 is the same palette in
  OKLCH), `open-color@1.9.1` JSON, `@catppuccin/palette@1.8.0` `palette.json`, Nord `nord.scss`
  and the published color page.
- Contrast formula matches `packages/layout/test/appearance.test.ts` (sRGB relative luminance,
  0.2126/0.7152/0.0722). L\* and ΔE76 use D65.
- No package was added to the product; the scripts are throwaway and outside the repo.

---

**Summary of files read:** `AGENTS.md`, `docs/tasks/research-color-palettes.md`,
`docs/design/color-system.md`, `packages/layout/src/appearance.ts`,
`apps/desktop/src/renderer/src/styles.css`, `docs/design-tokens.md`,
`docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`,
`docs/tasks/ui-continuous-shell-polish.md`, `packages/layout/test/appearance.test.ts`,
`apps/desktop/test/appearance-css-guard.test.ts`,
`apps/desktop/src/renderer/src/settings/AppearanceSettings.tsx`.

**No product code, tests, settings, schema, Page/PDF, or design docs were changed.**
