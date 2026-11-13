# Continuous settings — R6 design

**Status:** Approved (13 November 2026); implemented in R6 on schema v5.
**Date:** 13 November 2026.
**Scope:** one **global** Continuous settings page: spacing, arrows, widths, and a live preview.
No per-document overrides and no view-style setting. Page/PDF are untouched.
**Inputs:** R4 settings schema v4, `docs/design-tokens-continuous.md`,
`packages/layout/src/edge-style.ts`, `apps/desktop/src/renderer/src/lib/design-tokens.ts`,
the settings inventory, the product-owner decisions of 12–13 November 2026.

---

## 0. Goal

The Continuous canvas is the primary authoring surface. Today its geometry is a set of engine tokens
with no user control, and the Settings → Continuous page only edits a per-document zoom. R6 gives the
canvas a small, curated set of **global** controls so a user can tune readability and density without
touching Page/PDF, and shows a live sample so the effect is visible before leaving Settings.

## 1. Decisions

| ID | Decision | Choice |
|---|---|---|
| C-01 | Scope | **Global only.** No per-document override, no scope switch. |
| C-02 | Settings page | Replaces the per-document zoom controls with global spacing/arrow/width controls. |
| C-03 | Zoom | Remains per-document **view state** in the toolbar/View menu; no Setting page control and no global zoom default in R6. |
| C-04 | Preview | A live sample with 1 top-level block, 2 direct children, 1 callout; no real document required. |
| C-05 | Page/PDF | Never read Continuous settings. Page/PDF output is unchanged. |
| C-06 | Version | `settingsVersion: 5` with a `continuous` namespace and a pure v4→v5 migration. |
| C-07 | Persistence | Instant save, consistent with R3/R4; no Apply/Cancel draft. |
| C-08 | Defaults | Equal to today's tokens, so migration changes nothing visually. |
| C-09 | Advanced | Widths are in an Advanced section; routing/trunk/lane/stem internals stay hidden. |
| C-10 | View style | No per-document layout/interaction/view-style setting in R6. |

## 2. Settings model

`AppSettings.continuous` (global, `settings.json`):

```ts
interface ContinuousSettings {
  spacing: {
    chapterGap: number;   // px
    siblingGap: number;   // px
    childRowGap: number;  // px
  };
  arrows: {
    width: number;        // resting stroke px
    activeWidth: number;  // selected path px
    mutedWidth: number;   // non-path px
    size: number;         // fixed arrowhead size px (length; half-width = size/2)
  };
  widths: {
    canvasMax: number;    // px
    topLevelMax: number;  // px
    childMax: number;     // px
  };
}
```

- All values are **engine settings**, not per-document. The renderer resolves them into the
  Continuous CSS variables and the Continuous edge style; Page/PDF keep `PAGE_EDGE_STYLE`,
  `PAGE_EDGE_GEOMETRY`, `PageTheme`, and `--paper-*`.
- The existing `DESIGN_TOKENS` remain the defaults; `applyDesignTokens` continues to write the
  fallback values, and the resolved settings override the Continuous-bound variables only.
- The settings are validated/clamped on read and write; unknown fields survive; a corrupt file uses
  the existing recovery behavior. `settingsVersion` is a file concern, not part of `AppSettings`.
- No document schema, package format, or per-document settings map change.

## 3. Controls, ranges, defaults

Values are px; sliders show the numeric value. Ranges are intentionally narrow enough to keep the
tree readable and wide enough to be useful.

### Spacing

| Field | Default | Range | Step | Notes |
|---|---:|---:|---:|---|
| Chapter gap | 28 | 16–48 | 1 | Between chapters. |
| Sibling gap | 24 | 12–40 | 1 | Between a card and its direct-child group. |
| Child row gap | 16 | 8–32 | 1 | Between stacked child rows. |

### Arrows

| Field | Default | Range | Step | Notes |
|---|---:|---:|---:|---|
| Resting width | 1.25 | 0.75–2.5 | 0.25 | Primary edge at rest. |
| Active width | 1.75 | 1.25–3 | 0.25 | Selected path; clamped ≥ resting. |
| Muted width | 1 | 0.5–2 | 0.25 | Non-path branches when something is selected. |
| Arrow size | 6 | 4–10 | 1 | Fixed arrowhead; half-width = size/2, independent of path length. |

Reference edges keep their dashed style and use the resting width; they are not a separate control
in v1. The arrowhead stays fixed-size (never scales with path length), as today.

### Widths (Advanced)

| Field | Default | Range | Step | Notes |
|---|---:|---:|---:|---|
| Canvas max width | 3200 | 2400–4800 | 100 | Horizontal scroll beyond the window. |
| Top-level max width | 480 | 320–640 | 20 | Content-driven inside the bound. |
| Child max width | 420 | 280–560 | 20 | Content-driven inside the bound. |

Min widths remain engine constants. If a max is set below its min, clamp to the min and show the
clamped value. The canvas max must be ≥ the top-level max + child max + the sibling gap + the
minimum edge corridor; otherwise clamp and explain.

### Reset

One **Reset Continuous settings** action restores every field to the defaults above. It is explicit
and confirmed only if the user has changed values (no Apply model).

## 4. Settings page

```text
Continuous
Tune the canvas. These settings are global; Page and PDF do not change.

Spacing
  Chapter gap        [ 28 px ] ——●——
  Sibling gap        [ 24 px ] ——●——
  Child row gap      [ 16 px ] ——●——

Arrows
  Resting width      [ 1.25 px ] ——●——
  Active width       [ 1.75 px ] ——●——
  Muted width        [ 1.00 px ] ——●——
  Arrow size         [ 6 px ]    ——●——

▸ Advanced
  Canvas max width   [ 3200 px ] ——●——
  Top-level max      [ 480 px ]  ——●——
  Child max          [ 420 px ]  ——●——

Preview
  [ sample tree · 1 top-level · 2 children · 1 callout ]

Reset Continuous settings
```

- No document scope control; the page works with no document open.
- Instant save; the footer reports the actual write status; sliders are debounced.
- The preview is a static sample, not the current document; it updates live and uses the same
  Continuous edge style/geometry and note surface as the canvas. It is not a Page preview.
- The existing per-document zoom controls are removed from this page. Zoom stays in the toolbar,
  View menu, and palette as document view state.
- Accessibility: labelled sliders with `aria-valuetext`, live preview described as sample content,
  Reset as a real button; no color-only meaning.

## 5. Preview

- A compact stage inside the page (no document package):
  - one top-level card with sample text;
  - two direct children to the right (or below at narrow width);
  - one callout under the top-level with a short quote.
- Uses the resolved spacing and edge variables, the fixed arrowhead, the current note surface and
  text roles; theme/accent follow Appearance, not a new palette.
- The sample has `aria-label="Continuous preview"`; it is not focusable and does not edit content.
- At the page's narrow width the preview may stack; the settings values still apply. It must not
  affect the real canvas while Settings is open beyond the same global values.

## 6. Persistence and migration

- Bump `SETTINGS_SCHEMA_VERSION` to **5**. v4 → v5 adds `continuous` with the defaults above when
  absent; v5 round-trips; unknown top-level/`continuous` keys are preserved; the version is never
  lowered.
- `settingsDocumentForWrite` writes the normalized `continuous` block and preserves unknown keys;
  corrupt/unreadable recovery is unchanged.
- The v1 → v2 `continuous` removal stays first in the chain; a v1 file passes through it, then
  v4 → v5 adds the new namespace with defaults.
- No settings value is written on read; the next ordinary write stamps v5.
- The app resolves the settings at boot and on change. If the file is read-only/corrupt, the last
  known values or defaults apply and the existing status surface explains the write failure.

## 7. Page/PDF isolation

- Page layout, Page Read/Edit, and the print compositor read only `PAGE_EDGE_STYLE`,
  `PAGE_EDGE_GEOMETRY`, `PageTheme`, `PageChrome`, and `--paper-*`.
- Continuous settings write only the Continuous CSS variables and the Continuous edge style
  resolution; they never mutate `PAGE_EDGE_STYLE`/`PAGE_EDGE_GEOMETRY`.
- Add an isolation test that changes every Continuous field and asserts Page/PDF geometry, page
  count, and print model records are unchanged.
- The Continuous preview is editor chrome only; it never enters the print model.

## 8. Out of scope

- Page size/orientation/margins/density/theme/chrome; Appearance, palette, fonts.
- Per-document overrides, scope switching, view-style settings, manual breaks.
- Exposing routing internals (`laneMin/Max`, `trunkInset`, `stemMin`, `wrapIndent`, callout modes).
- A global zoom default; zoom remains per-document view state.
- PDF/tagged/metadata/page range; R4 export defaults.
- Code-block syntax colors (separate future batch).

## 9. Slices

### R6a — Settings model + page

- `ContinuousSettings` in `AppSettings`, defaults/clamp/normalize, v5 migration/write, settings store
  and page, sliders, Reset, instant save.
- No visual effect yet beyond the resolved defaults; tests for migration/normalize/clamp.

### R6b — Apply to the canvas + preview

- Resolve settings into the Continuous CSS variables and Continuous edge style; live preview; no
  Page/PDF change; isolation test; screenshots.
- Remove the per-document zoom controls from Settings; keep view-state zoom elsewhere.

A single worktree/one commit is acceptable for R6a+R6b if the diff stays coherent; the review unit
is the diff and report.

## 10. Acceptance criteria

- [ ] Settings → Continuous is global-only, works with no document, has spacing/arrow/width
      controls with the ranges/defaults above, an Advanced section, Reset, and a live sample.
- [ ] Defaults equal today's tokens; a v4 file migrates to v5 with no visual change; unknown fields
      survive; no document schema change.
- [ ] Changes apply to every Continuous canvas immediately; Page Read/Edit and PDF are byte/geometry
      unchanged (isolation test).
- [ ] The per-document zoom is no longer a Settings control; toolbar/View zoom still works.
- [ ] No fixed sleeps/native dialogs; tests updated, none weakened.

## 11. Open decisions

| ID | Decision | Proposal |
|---|---|---|
| O-01 | Schema version | **v5** with `continuous` (clean namespace, same policy as v3/v4). Alternative: additive v4. |
| O-02 | Include card padding | **No** in R6; keep the 10 px note inset fixed. |
| O-03 | Arrow controls | **One size** plus three widths; no separate lane/stem controls. |
| O-04 | Preview depth | **1 top-level + 2 children + 1 callout**; no real document. |
| O-05 | Remove Settings zoom | **Yes**; zoom remains view state. |
| O-06 | Top-level/child max width | Expose in Advanced with the ranges above. |

## 12. Risks

- A global spacing change can make a deeply nested document very wide/tall; the canvas cap and
  horizontal scroll bound it. The preview is small and may not show a 300-block document.
- The Continuous edge style is a shared object today; resolving settings must not leak into Page.
  The isolation test is mandatory.
- `settingsVersion` v5 is a schema change; a downgraded build must not erase the `continuous`
  namespace (unknown-key preservation).
- Removing the per-document zoom from Settings could surprise users; the toolbar/View menu remains
  the zoom path, and the page copy explains it.

## 13. Evidence

- Screenshots: Settings → Continuous at 100%/dark/light, preview with default and changed values,
  no-document state, Advanced open, Reset confirmation.
- Tests: migration/normalize/clamp, store/page, preview updates, apply to canvas, Page/PDF
  isolation, no-document Settings, reset.
- Product-owner visual/VoiceOver pass before merge.
