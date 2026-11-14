# Code palette and Page syntax colours

**Status:** approved direction (14 November 2026). Implementation is batch B.
**Related:** `docs/design-tokens-continuous.md`, `docs/reviews/post-settings-library-special-text-review.md`.
**Decision:** classic coding themes, not pastel. **Monokai** for dark, **One Light** for light.
Page Read/Edit and PDF now render syntax colours too; the WYSIWYG page is exact.

## 1. Palette

### Dark — Monokai

| Role | Token | Value |
|---|---|---|
| keyword | `--code-keyword` | `#f92672` |
| string | `--code-string` | `#e6db74` |
| number | `--code-number` | `#ae81ff` |
| comment | `--code-comment` | `#75715e` |
| function | `--code-function` | `#a6e22e` |
| type/built-in | `--code-type` | `#66d9ef` |
| tag/name | `--code-tag` | `#f92672` |
| meta/attr | `--code-meta` | `#fd971f` |

### Light — One Light

| Role | Token | Value |
|---|---|---|
| keyword | `--code-keyword` | `#a626a4` |
| string | `--code-string` | `#50a14f` |
| number | `--code-number` | `#986801` |
| comment | `--code-comment` | `#a0a1a7` |
| function | `--code-function` | `#4078f2` |
| type/built-in | `--code-type` | `#c18401` |
| tag/name | `--code-tag` | `#e45649` |
| meta/attr | `--code-meta` | `#986801` |

Contrast is checked against the code surface: dark `surface-2` and the light Page code surface
`#f5f7f9`. Comments stay readable but quieter than code. The light Page/PDF palette uses One Light
on white paper; the dark editor uses Monokai.

## 2. Page and PDF

The current contract (“syntax colours editor-only; Page/PDF neutral”) is replaced:

- Page Read and Page Edit render the same syntax colours as Continuous.
- PDF uses the Page render and therefore prints the colours; text stays real text.
- Page segments are generated per code line; highlighting runs per line with the code block's
  language, and anchor spans are preserved. No pagination or measurement change.
- Page code block backgrounds/line borders stay as they are; only token colours are added.
- The print compositor consumes the same segment HTML, so no second highlighter.

## 3. Not in this batch

- User-authored **text colour**, **highlighter**, and **block tint** are **content**, not a view
  theme: they need schema marks/attrs and Page/PDF segment rendering. Separate schema v3 design.
- A per-document syntax theme switcher; the palette follows the app theme.
- Code block background themes (Monokai background, etc.).

## 4. Tests

- Unit: the palette tokens exist for dark and light; token values match this table.
- UI: Continuous code has Monokai colours in dark; Page Read has the same token classes/colours;
  Page Edit and PDF print model carry the highlighted segment HTML; light theme uses One Light.
- Screenshots: dark Continuous, light Continuous, Page Read, PDF page 1.
