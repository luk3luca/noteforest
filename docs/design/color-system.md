# Color system and document status panel — design

**Status:** approved for R3 implementation, 12 November 2026. R3 scope: Appearance v3 + tab sizing +
page-number paper-center + `DocumentStatusPanel` for stale lock/read-only. Corrupt/missing keeps the
`RecoverySurface`; Page/print alignment is a later no-op.
**Scope:** shell color roles, dark/light themes, accent registry, the Page/print boundary, and the
`DocumentStatusPanel` pattern for stale-lock / read-only / corrupt documents.
**Out of scope:** implementation, palette research beyond the curated accent registry, Page theme packs,
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
| `--text-tertiary` | `#949aa2` | Tertiary text/icons |
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
| `--border-1` | `--border` | Resting hairline (see SC 1.4.11 exception below) |
| `--border-2` | `--border-strong` | Strong/hover/focus control boundary (3:1) |
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
--text-3: #949aa2;
--border-1: #2e3238;
--border-2: #6e737a;
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

### 3.3 Light values

These are the starting values; the contrast test may adjust a step. The light theme is shell-only; the
Page paper stays as it is. The contrast test adjusted the light tertiary text to `#5b6771` so all
three text roles meet 4.5:1 on every shell surface (12 November 2026 review), then the measured
palette tune shifted `--note-surface`/hover and `--border-2`.

```css
--bg-app: #f3f5f7;
--bg-canvas: #ffffff;
--bg-sidebar: #edf1f4;
--surface-1: #ffffff;
--surface-2: #f2f5f7;
--surface-3: #e8edf1;
/* Cards never use --surface-1: in light it is white and equals the canvas. */
--note-surface: #f2f6f9;
--note-surface-hover: #e9f0f5;
--text-1: #1a1f23;
--text-2: #4d5a63;
--text-3: #5b6771;
--border-1: #d7dee4;
--border-2: #82888c;
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
type AccentGroup = 'pastel' | 'vivid';

interface AccentSet {
  id: string;              // stored in settings; unknown -> default
  label: string;           // "Blue"
  group: AccentGroup;      // Appearance list section; display metadata only
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
source for accent values. `ACCENT_GROUPS` and `accentsInGroup()` drive the two labelled Appearance
sections (Pastel, Vivid). The swatch color is the resolved `accent` value, derived at render time;
there is no stored swatch field. `accent` remains a validated id string and the settings schema stays
`settingsVersion: 3`, with no migration.

### 4.2 Accents

All values are approved data (12 November 2026). The contrast tests validate text on accent/hover/
strong ≥ 4.5:1, accent/strong against every shell surface ≥ 3:1, and text-3 on the soft fill ≥ 4.5:1,
in both themes.

**Pastel**

| id | Dark accent / strong / soft / hover / contrast | Light accent / strong / soft / hover / contrast |
|---|---|---|
| blue | `#9bb7d4` / `#b9d0e6` / `#26313c` / `#a9c3dc` / `#101418` | `#2f5f8a` / `#1f4a6d` / `#e2edf6` / `#264d71` / `#ffffff` |
| teal | `#89c0ba` / `#99d1ca` / `#233432` / `#92cac3` / `#101418` | `#1f6f66` / `#15564f` / `#e0f1ee` / `#175c55` / `#ffffff` |
| amber | `#d6b17a` / `#e6c795` / `#382f22` / `#e3c48f` / `#101418` | `#8a5a00` / `#6f4800` / `#fff2d6` / `#714900` / `#ffffff` |
| rose | `#e5a5b3` / `#f6b5c3` / `#3a2830` / `#efaebc` / `#101418` | `#9b3f55` / `#7d2f43` / `#f8e4e9` / `#873348` / `#ffffff` |

**Vivid**

| id | Dark accent / strong / soft / hover / contrast | Light accent / strong / soft / hover / contrast |
|---|---|---|
| violet | `#BE38F3` / `#D26BFF` / `#2A173A` / `#C94DFF` / `#0B0F12` | `#8B2BB8` / `#6F1E96` / `#F3E1FB` / `#7A25A6` / `#FFFFFF` |
| magenta | `#F43F8E` / `#FF6BA8` / `#361524` / `#FF57A0` / `#101418` | `#B0185C` / `#8E124A` / `#FBE0EC` / `#9F1553` / `#FFFFFF` |
| cyan | `#22D3EE` / `#67E8F9` / `#0C242B` / `#3BDDF3` / `#101418` | `#0E7490` / `#0B5F77` / `#DDF5FA` / `#0C6A84` / `#FFFFFF` |
| orange | `#FB923C` / `#FDBA74` / `#2C1E12` / `#FCA55A` / `#101418` | `#C2410C` / `#9A3412` / `#FDE8D7` / `#AD3A0B` / `#FFFFFF` |

Vivid dark sets are light-on-dark fills with a near-black `contrast`; Vivid light sets are dark
saturated fills with white `contrast`. The group field is the only structural addition.

### 4.3 Settings

`AppearanceSettings` (`settingsVersion: 3`): `theme: 'dark' | 'light' | 'system'`,
`accent: string`, `uiScale: 0.9 | 1 | 1.1`, `uiFont: 'system' | 'serif'`,
`codeFont: 'jetbrains' | 'system-mono'`. Missing fields normalize to defaults: dark, blue, 1,
system, jetbrains. Unknown accent id falls back to the default. There is no per-document appearance
override in v1. Adding an accent later is a registry entry; no migration or schema change.

### 4.4 Border roles and the resting exception

`--border-1` is the calm resting hairline: cards, panels, inputs, and secondary buttons at rest. It is
allowed below 3:1 against its surface (documented SC 1.4.11 exception) because the boundary is
decorative separation, not the only means to identify a control: labels, icons, and layout carry the
affordance. `--border-2` is the strong boundary and must reach 3:1 against every shell surface; it is
the hover/focus/active border. Resting buttons and inputs do not switch to `border-2`; only their
hover/focus/selected states do. The CSS guard asserts the 3:1 rule for `border-2` and keeps `border-1`
at rest.

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
| Stale lock (read-only) | Full panel, warning icon, metadata | Take over lock / Cancel | Take over: dismiss, editable; Cancel: collapse to slim bar with Take over lock + Review |
| Read-only (no lock) | Slim bar | Recheck (locked only) / Details | Recheck reopens from disk; a live lock stays read-only, a removed lock becomes editable |
| Corrupt/missing document | Full panel, warning icon, reason | Open recovery / Reveal | Recovery surface or dismiss to slim bar |
| Resolved | Removed | — | Canvas expands with a 120 ms height/opacity animation |

- **Cancel must not remove the only explanation.** It collapses to a 34 px bar: lock icon,
  "Read-only · stale lock", Take over lock, Review. The tab lock icon remains. Generic read-only
  keeps Details (with lock metadata) and, for a live lock, Recheck: reopening from disk cannot
  force-break the lock, so it stays read-only until the other session closes or quits.
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
3. **Contrast.** Text on accent/hover/strong ≥ 4.5:1; text-3 on the soft fill ≥ 4.5:1; `border-2`,
   focus ring, and selection ring ≥ 3:1. `border-1` stays the resting hairline with the documented
   SC 1.4.11 exception.
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
| 4 | More accents/full theme packs | Data-only if the registry holds; the Vivid four are the first data-only group |

Resolved decisions (12 November 2026):

1. **R3 scope:** Appearance v3 + tab sizing + page-number paper-center + `DocumentStatusPanel` for
   stale lock/read-only, in one worktree. Corrupt/missing is excluded and keeps `RecoverySurface`.
2. **Initial accent values:** the four proposals are accepted; the contrast test may adjust a step.
3. **Page/print alignment:** after R3 as a visual no-op with PDF parity; not inside R3.
4. **Naming:** the canonical names in §3 with migration aliases.

No implementation starts until this document is approved.
