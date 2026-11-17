# Code themes — measured, verbatim

**Status:** decision draft, 17 November 2026. Feeds the theme batch; no code yet.
**Inputs:** `docs/design/code-palette.md` (Monokai / One Light shipped), the product-owner decision that
themes are **taken as they are, never recoloured**, `docs/plan.md` batch 6.

## 1. The problem being solved

The shipped palettes fail the 4.5:1 body-text bar: in Monokai only the comment is weak (3.44), in One
Light five of seven roles are weak (comment 2.37, string 2.95, type 2.94, function 3.73, number 4.48).
Recolouring is off the table — a theme that has been adjusted is a theme nobody recognises.

## 2. The candidates, measured

Values read from the **VS Code default themes** (`extensions/theme-defaults/themes/{dark,light}_vs.json`
and `{dark,light}_plus.json`), unmodified. Six roles, the same six the app's syntax map uses.

| Role | Dark+ on `#1E1E1E` | Light+ on `#FFFFFF` |
|---|---|---|
| keyword | `#569CD6` 5.65 | `#0000FF` 8.59 |
| string | `#CE9178` 6.31 | `#A31515` 7.85 |
| number | `#B5CEA8` 9.81 | `#098658` **4.60** |
| comment | `#6A9955` 5.00 | `#008000` 5.14 |
| function | `#DCDCAA` 11.80 | `#795E26` 6.10 |
| type | `#4EC9B0` 8.18 | `#267F99` **4.59** |

**Every role passes 4.5:1 in both themes** on the theme's own background.

## 3. The trap worth knowing

NoteForest does not put code on the editor background: a code block sits on the **note card**, which is
`#1b1d20` in dark and `#f2f6f9` in light. Measured against those:

| Role | Dark+ on our card | Light+ on our card |
|---|---|---|
| number | 9.94 | **4.24** |
| type | 8.29 | **4.22** |

Two light roles fall just under the bar because our paper is slightly tinted. The fix is not a colour
edit — it is what a theme means: **a theme brings its own surface.** The code block takes the theme's
background (`#1E1E1E` / `#FFFFFF`), and every role passes exactly as measured in §2.

## 4. The decision

- **Adopt `Dark+` and `Light+` verbatim**, each with **its own code surface**.
- They become two entries in a small registry; the app theme still chooses the default (dark → Dark+,
  light → Light+), and the user can override per app, not per document.
- The picker shows the **measured worst role** next to each theme (`AA · 4.60`), so the choice is
  informed instead of aesthetic. A theme below 4.5 may still be offered, labelled.
- **The paper keeps `--nf-page-code-*`** (One Light): the printed page is a separate surface and the PDF
  gate must not move.
- Monokai and One Light stay available, labelled with their measured worst role, because they were a
  deliberate product choice and someone may prefer them.

## 5. What the batch still needs

1. The registry (id → six role colours + surface), the picker, and the contrast label — computed from the
   registry, not typed by hand.
2. The code block reads the active theme's surface; the shell palette no longer leaks into code.
3. A guard: every registry entry declares its measured worst ratio, and the test recomputes it.
4. Print unchanged: the Page/PDF code palette stays One Light, asserted by the existing print tests.
