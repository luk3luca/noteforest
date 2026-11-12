# Color system and document status panel — design

**Status:** approved for R3 implementation, 12 November 2026. R3 scope: Appearance v3 + tab sizing +
page-number paper-center + `DocumentStatusPanel` for stale lock/read-only. Corrupt/missing keeps the
`RecoverySurface`; Page/print alignment is a later no-op.
**Scope:** shell color roles, dark/light themes, accent registry, the Page/print boundary, and the
`DocumentStatusPanel` pattern for stale-lock / read-only / corrupt documents.
**Out of scope:** implementation, palette research beyond the four initial accents, Page theme packs,
and any change to the Page/PDF paper.
**Related:** `docs/design/ui-settings-contents.md` §3, `docs/design-tokens.md`,
`docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`, ADR-0007, ADR-0008.

## 1. Principles

1. **One role per meaning.** A component asks for a semantic role (`--text-2`, `--surface-1`,
   `--accent-soft`), never for a literal color.
2. **Color is state or affordance, not decoration.** A colored left stripe on a card is decoration;
   a warning icon plus text is state. Decorative color is removed.
3. **Derived roles use `var()`.** `--edge-active`, `--focus-ring`, and `--accent-ring` derive from the
   accent scale; they never duplicate a hex value.
4. **One shell contract, one paper contract.** Shell tokens are themed (dark/light, accent). Page and
   print tokens are a separate, fixed light skin and never inherit the shell theme.
5. **More roles are acceptable; duplicates are not.** The target grows from 21 to about 30 roles
   because soft/border/overlay/shadow roles are added; each has exactly one meaning.
6. **Adding a palette is data.** An accent is an id plus values for dark and light. Adding one later
   must not touch components, tests except registry coverage, or the settings schema.

## 2. Current inventory (dark only)

### 2.1 Shell roles: 21 roles, 19 distinct hex values

Three roles share one value today (`--accent`, `--edge-active`, `--focus-ring`). The 11 `--color-*`
React Aria variables are aliases, not new colors.

| Current role | Value | Used for |
|---|---|---|
| `--shell` | `#101113` | Window chrome / titlebar |
| `--canvas` | `#17181a` | Canvas/editor background |
| `--sidebar` | `#131416` | Sidebar background |
| `--surface-1` | `#1b1d20` | Panels, cards, buttons, row hover |
| `--surface-2` | `#202329` | Raised control, card/button hover |
| `--surface-3` | `#262a30` | Menus, palette, toasts, close hover |
| `--border` | `#2e3238` | Normal borders |
| `--border-strong` | `#3c4148` | Hover/strong borders |
| `--text` | `#e7e8ea` | Primary text |
| `--text-secondary` | `#a6abb2` | Secondary text |
| `--text-tertiary` | `#8b9199` | Tertiary text/icons |
| `--accent` | `#9bb7d4` | Primary fill, selection, focus |
| `--accent-soft` | `#26313c` | Selected row/card, text selection |
| `--accent-contrast` | `#101418` | Text on accent fill |
| `--edge` | `#5e6670` | Canvas edge/trunk |
| `--edge-active` | `#9bb7d4` | Active edge/arrow |
| `--edge-muted` | `#3a3f46` | Dimmed edge |
| `--danger` | `#d98b8b` | Errors, destructive |
| `--success` | `#8fbf9f` | Success |
| `--warning` | `#d6b17a` | Warning, stale lock |
| `--focus-ring` | `#9bb7d4` | Keyboard focus |

### 2.2 Hardcoded shell debt

- `#a9c3dc`: primary button hover.
- `rgba(155, 183, 212, …)`: four accent ring/selection overlays.
- `rgba(217, 139, 139, …)`: danger soft/hover.
- `#7aa2f7`, `#e08a8a`: fallback values that should not exist.
- `rgb(0 0 0 / 0.4)` overlay and black shadows: no theme tokens.
- Page-only values are listed in §2.4; they are not shell debt.

### 2.3 UI parts that consume the shell roles

| Part | Roles |
|---|---|
| App/titlebar | `--shell`, `--text-1/2` |
| Canvas/editor | `--canvas` |
| Sidebar | `--sidebar`, `--surface-1` hover, `--accent-soft` selection, `--accent` ring |
| Panels/cards | `--surface-1`, `--surface-2` hover, `--border-1` |
| Menus/palette/toasts | `--surface-3`, `--border-1`, status accents |
| Tabs | active `--canvas`/`--border-1`/`--text-1`; inactive `--text-2`; hover `--surface-1` |
| Continuous card | `--note-surface`, `--note-surface-hover`, `--accent` active ring |
| Canvas edges | `--edge`, `--edge-active`, `--edge-muted`, `--warning` defect |
| Anchor marks | `--accent` underline/dot, `--accent-soft` selected |
| Text selection | `--accent-soft`, `--text-1` |
| Buttons | primary `--accent`/`--accent-contrast`, secondary `--surface-1`/`--border-1`/`--text-2`, danger `--danger` |
| Status/toast | `--success`, `--warning`, `--danger`, surfaces |
| Focus | `--focus-ring` |
| Overlays | black 40% backdrop, black shadows |

### 2.4 Page/print: a separate skin

- 11 Page tokens: ink `#1a1f23`, muted `#65737c`, rule `#d9dfe4`, header ink `#3b474e`,
  warning/missing (amber), link `#2f5f8a`.
- About 30 hardcoded Page/content hex values: paper `#ffffff`, table/code rules `#e0e5e9`/`#dfe5e9`,
  heading/quote, inline code, code block, math error, Page edges, defect badge, placeholder buttons.
- 12 print-only colors in `print.css`.
- `styles.css` totals 55 distinct hex values, 86 occurrences, 27 `rgb/rgba` uses. Only the 21 shell
  roles are themeable; the rest is Page/print/fallback.

## 3. Target shell contract

### 3.1 Names and roles

| Target | Replaces | Meaning |
|---|---|---|
| `--bg-app` | `--shell` | Window/app chrome background |
| `--bg-canvas` | `--canvas` | Canvas/editor background |
| `--bg-sidebar` | `--sidebar` | Sidebar background |
| `--surface-1` | same | Panel/card/control surface |
| `--surface-2` | same | Raised/hover surface |
| `--surface-3` | same | Menu/overlay/toast surface |
| `--note-surface` | new | Continuous note-card surface; distinct from the canvas in both themes |
| `--note-surface-hover` | new | Continuous note-card hover |
| `--text-1` | `--text` | Primary text |
| `--text-2` | `--text-secondary` | Secondary text |
| `--text-3` | `--text-tertiary` | Tertiary text/icons |
| `--border-1` | `--border` | Normal border |
| `--border-2` | `--border-strong` | Strong/hover border |
| `--accent` | same | Primary fill |
| `--accent-strong` | new | Ring, focus, active edge; stronger than fill |
| `--accent-soft` | same | Selection/soft fill |
| `--accent-hover` | new | Primary fill hover |
| `--accent-contrast` | same | Text/icon on `--accent` |
| `--accent-ring` | new alias | `var(--accent-strong)`; semantic focus/ring |
| `--edge` | same | Neutral canvas edge/trunk |
| `--edge-active` | new alias | `var(--accent-strong)` |
| `--edge-muted` | same | Dimmed edge |
| `--danger` | same | Destructive/error |
| `--danger-soft` | new | Destructive soft background |
| `--danger-border` | new | Destructive border |
| `--success` | same | Success |
| `--success-soft` | new | Success soft background |
| `--warning` | same | Warning |
| `--warning-soft` | new | Warning soft background |
| `--warning-border` | new | Warning border |
| `--overlay` | new | Modal/palette backdrop |
| `--shadow-panel` | new | Floating panel/menu shadow |
| `--shadow-overlay` | new | Modal shadow |

Aliases kept for migration: `--focus-ring: var(--accent-ring)` and the 11 `--color-*` React Aria
aliases, all mapping to the canonical roles. Components move to canonical names in the R3 commit.

### 3.2 Dark values

Dark values keep the current look except the added roles:

```css
--bg-app: #101113;
--bg-canvas: #17181a;
--bg-sidebar: #131416;
--surface-1: #1b1d20;
--surface-2: #202329;
--surface-3: #262a30;
--note-surface: #1b1d20;
--note-surface-hover: #202329;
--text-1: #e7e8ea;
--text-2: #a6abb2;
--text-3: #8b9199;
--border-1: #2e3238;
--border-2: #3c4148;
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
--shadow-overlay: 0 18px 48px rgb(0 0 0 / 0.45);
```

Accent roles come from the registry (§4), not from the theme block.

### 3.3 Light values (initial proposal)

These are starting values; the contrast test may adjust a step. The light theme is shell-only; the
Page paper stays as it is. The contrast test adjusted the light tertiary text to `#5f6b75` so all
three text roles meet 4.5:1 on every shell surface (12 November 2026 review).

```css
--bg-app: #f3f5f7;
--bg-canvas: #ffffff;
--bg-sidebar: #edf1f4;
--surface-1: #ffffff;
--surface-2: #f2f5f7;
--surface-3: #e8edf1;
/* Cards never use --surface-1: in light it is white and equals the canvas. */
--note-surface: #f6f8fb;
--note-surface-hover: #eef3f7;
--text-1: #1a1f23;
--text-2: #4d5a63;
--text-3: #5f6b75;
--border-1: #d7dee4;
--border-2: #b8c4cd;
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
--shadow-overlay: 0 18px 48px rgb(16 20 24 / 0.18);
```

### 3.4 Theme application

- `html[data-theme="dark"]` and `html[data-theme="light"]` carry the neutral roles.
- `system` follows `prefers-color-scheme` and updates on change; the stored value is still
  `dark | light | system`.
- The accent sets `--accent*` variables on the same root; `--accent-ring` and `--focus-ring` derive
  from `--accent-strong`; `--edge-active` derives from `--accent-strong`.
- No component declares a hex or rgba; a guard test scans `styles.css` and fails outside the theme,
  accent, paper, and print blocks.

## 4. Accent registry

### 4.1 Shape

```ts
interface AccentSet {
  id: string;              // stored in settings; unknown -> default
  label: string;           // "Blue"
  swatch: string;          // UI swatch (the accent fill)
  dark: AccentValues;
  light: AccentValues;
}

interface AccentValues {
  accent: string;          // primary fill
  strong: string;          // ring/focus/active edge
  soft: string;            // selection/soft fill
  hover: string;           // primary fill hover
  contrast: string;        // text/icon on accent
}
```

`accent-ring` = `strong`; `edge-active` = `strong`; `focus-ring` = `strong`. The registry is the single
source for accent values. The Appearance page renders swatches from it.

### 4.2 Initial four accents

Initial proposals; the contrast test validates and may tune a step. Values are not a dependency.

| id | Dark accent / strong / soft | Light accent / strong / soft |
|---|---|---|
| blue | `#9bb7d4` / `#b9d0e6` / `#26313c` | `#2f5f8a` / `#1f4a6d` / `#e2edf6` |
| teal | `#8fc7c0` / `#a9d9d3` / `#233432` | `#1f6f66` / `#15564f` / `#e0f1ee` |
| amber | `#d6b17a` / `#e6c795` / `#3a3124` | `#8a5a00` / `#6f4800` / `#fff2d6` |
| rose | `#d99aa8` / `#e7b3bf` / `#3a2830` | `#9b3f55` / `#7d2f43` / `#f8e4e9` |

Hover and contrast values are part of each set; the table omits them for brevity. Contrast rules:
text on accent ≥ 4.5:1, focus ring vs adjacent surface ≥ 3:1, border vs surface ≥ 3:1 for controls.

### 4.3 Settings

`AppearanceSettings` (`settingsVersion: 3`): `theme: 'dark' | 'light' | 'system'`,
`accent: string`, `uiScale: 0.9 | 1 | 1.1`, `uiFont: 'system' | 'serif'`,
`codeFont: 'jetbrains' | 'system-mono'`. Missing fields normalize to defaults: dark, blue, 1,
system, jetbrains. Unknown accent id falls back to the default. There is no per-document appearance
override in v1. Adding an accent later is a registry entry; no migration.

## 5. `DocumentStatusPanel` pattern

### 5.1 Problem

The stale-lock banner is currently inside the canvas with a colored left stripe. It reads as a
generic alert card, scrolls/zooms with content, and mixes a document state with the document
surface. The screen also shows truncated tab titles because inactive tabs are fixed at 96 px; the tab
sizing change is separate but related.

### 5.2 Placement and structure

```text
[ titlebar / tabs / toolbar ]
[ status panel: icon  title ................ actions ]
[ canvas panel ]
```

- The panel lives in the main column, between the toolbar row and the canvas panel, with the same
  8 px gap as the floating panels. It spans the canvas column, not the sidebar.
- It is not inside the canvas scroll/zoom surface. The canvas reflows when it appears/disappears.
- Surface `--surface-1`, border `--border-1`, radius `--radius-panel` (8), padding 12–14,
  no left stripe.
- Grid: icon (16 px), text column, actions. Body `--text-2`, metadata `--text-3` in a secondary row
  or a `Details` disclosure. Title 12.5/600, body 12/1.45.
- Actions: primary "Take over lock" (`--accent`/`--accent-contrast`), secondary "Cancel"
  (`--surface-1`/`--border-1`/`--text-2`). On narrow widths, actions move below the text.
- Warning color is limited to the icon and the title; the panel itself is neutral.

### 5.3 States and behavior

| State | Panel | Actions | On action |
|---|---|---|---|
| Stale lock (read-only) | Full panel, warning icon, metadata | Take over lock / Cancel | Take over: dismiss, editable; Cancel: collapse to slim bar |
| Read-only (no lock) | Slim bar or full panel once | Details / Dismiss | Slim bar persists while read-only |
| Corrupt/missing document | Full panel, warning icon, reason | Open recovery / Reveal | Recovery surface or dismiss to slim bar |
| Resolved | Removed | — | Canvas expands with a 120 ms height/opacity animation |

- **Cancel must not remove the only explanation.** It collapses to a 34 px bar: lock icon,
  "Read-only · stale lock", "Review". The tab lock icon remains.
- `role="alert"` on appearance; `aria-live="polite"` for the slim bar. Focus goes to the primary
  action only when the state starts blocking an edit; otherwise the panel is announced without
  stealing focus. `Esc` = Cancel. No focus trap; it is not a modal.
- Reduced motion: no height animation.
- One component for lock, read-only, and corrupt/missing; `Open recovery` reuses the recovery
  surface. No per-state one-off banners.

### 5.4 What this removes

- The 3 px colored left stripe.
- The full-width warning card inside the canvas.
- The pale blue primary button sitting inside a warning card without a neutral frame.

## 6. Page/print boundary

- Page/print keep their own light skin; shell theme changes must not alter the paper or the PDF.
- Phase 3 (after R3) aligns the Page tokens into a `--paper-*` namespace with no visual change:
  paper background, ink, muted, rule, header ink, link, warning/missing sets, code/table, quote,
  math error, Page edge primary/reference and labels, defect badge, placeholder buttons.
- Print keeps a separate print stylesheet/skin; it may reuse `--paper-*` values but not shell tokens.
- Guard: a theme switch renders the same Page/PDF; raster parity and PDF text checks.
- A future Page skin/pack is a separate product decision; not in this design.

## 7. Guardrails

1. **No literals outside token blocks.** A test scans `styles.css` and fails on hex/rgba outside
   `:root` theme blocks, the accent block, the Page scope, and print CSS.
2. **Registry completeness.** Every accent has all keys in dark and light; unknown id falls back.
3. **Contrast.** Text on accent ≥ 4.5:1; focus ring and control border ≥ 3:1.
4. **Paper isolation.** Switching theme/accent does not change Page Read, Page Edit, or the PDF.
   The Page arrow skin and stroke width are Page-owned (`PAGE_EDGE_STYLE`,
   `--nf-page-edge-width`); Continuous resting edges (`--edge`, `--edge-muted`) never reach the
   paper.
5. **No decorative color.** A review checklist item: colored stripes/borders must express state, not
   decoration; status uses icon + text + neutral surface.
6. **No component-level palettes.** Components use roles; a new palette is registry data.

## 8. Phases and open decisions

| Phase | Content | Notes |
|---|---|---|
| 0 | This doc | Review and freeze the contract |
| 1 (R3) | Shell token normalization, dark/light, accent registry, Appearance settings | No Page change; one full verify |
| 2 | `DocumentStatusPanel` + slim bar | Could ride in R3 as a companion or follow |
| 3 | Page/print `--paper-*` alignment | Visual no-op, PDF parity |
| 4 | More accents/full theme packs | Data-only if the registry holds |

Resolved decisions (12 November 2026):

1. **R3 scope:** Appearance v3 + tab sizing + page-number paper-center + `DocumentStatusPanel` for
   stale lock/read-only, in one worktree. Corrupt/missing is excluded and keeps `RecoverySurface`.
2. **Initial accent values:** the four proposals are accepted; the contrast test may adjust a step.
3. **Page/print alignment:** after R3 as a visual no-op with PDF parity; not inside R3.
4. **Naming:** the canonical names in §3 with migration aliases.

No implementation starts until this document is approved.
