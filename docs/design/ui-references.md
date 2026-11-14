# UI references and design line

**Status:** Reference analysis for the UI rework. Links, choices, and design constraints; not code.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Use:** read with `docs/design/ui-shell-map.md`, the content slices, and
`research/ui-surface-map.md`. The references inform structure and behavior; they do not define
NoteForest's skin.

---

## 0. How to use these references

- **Take structure, behavior, and states.** Do not copy the visual skin of a library. The
  references come from different design languages; NoteForest must land on **one line**.
- **No new dependencies.** NoteForest stays on React Aria + its CSS tokens. BoardUI, shadcn, Coss,
  Base UI, and Tailwind references are patterns, not packages to install.
- **The design docs are the spec.** This file is the inspiration catalog; the target IA and
  behavior are in the five content slices.
- **When a reference conflicts with NoteForest**, the product decision wins: Page/PDF stay light,
  page changes are immediate, one command has one home, no fake controls.

---

## 1. The single design line

The raw references pull in different directions: shadcn/BoardUI are rounded and card-like, Coss is
airy with pill inputs, beui/transitions are motion-first, 21st is mixed, beautifului is AI-product.
The unifying line for NoteForest is:

**A calm, dense, keyboard-first Mac study tool.** The document is the hero; the shell recedes.

| Dimension | Line |
|---|---|
| Surfaces | Flat; 1 px dividers; no floating cards, no glass, no gradients, no glow |
| Palette | Neutral graphite shell; one accent (blue default); Page/PDF paper stays light |
| Radii | 4 px cards, 4–6 px controls; no 999 px pills for inputs/buttons |
| Spacing | 4/8 px grid; compact rows 28–32; settings rows 40–48; bar heights 44 top / 24 status |
| Type | System UI; 13 px base, 11–12 px metadata, 15–16 px section titles; JetBrains Mono for code; Page type from PageTheme |
| Icons | Lucide, 1.5 stroke, 13–16 px; no emoji, no mixed sets |
| Borders/shadows | One quiet elevation level for overlays; no card-in-card, no decorative shadow |
| Motion | Functional only, 120–160 ms; no bounce, no page-turn, no shimmer; reduced motion respected |
| Density | Compact, legible, keyboard-first; no giant marketing whitespace |
| States | Hover, focus-visible, pressed, disabled, read-only, error, saving; one status language |
| Page | The sheet is paper/print; no glossy UI inside it; shell chrome stays outside |

**Component vocabulary:** one `Button`, one `IconButton`, one `Field`, one `NumberField`, one
`SegmentedControl`, one `Slider`, one `Switch`, one `Select`, one `Section`/`Row`, one `Dialog`,
one `Sheet`, one `Menu`, one `Toast`. No per-screen ad-hoc variants.

**The anti-slop line:** if it looks like a SaaS landing page, an AI chat product, or a dashboard,
it is wrong. If removing the logo makes it look like a serious writing tool, it is right.

---

## 2. Primary references

| Reference | Link | Why it is primary | Take | Avoid |
|---|---|---|---|---|
| **BoardUI — Settings Modal** | [boardui.com/components/settings-modal](https://www.boardui.com/components/settings-modal) | Closest IA: app-level settings dialog, grouped left nav, content pane, label + description + control rows, contextual default page; built on React Aria | Page navigation, row anatomy, grouped sections, controlled open state | Plan/upgrade card, large-radius floating shell, card-in-card look |
| **BoardUI — Sidebar** | [boardui.com/components/sidebar](https://www.boardui.com/components/sidebar) | 260 px navigation, quick search + `⌘K`, nav items, collapse | Width, search row + Kbd hint, row hierarchy | Floating panel, 3xl radius, elevation shadow, announcement card |
| **Coss UI — controls** | [Fieldset](https://coss.com/ui/docs/components/fieldset) · [Number Field](https://coss.com/ui/docs/components/number-field) · [Segmented Control](https://coss.com/ui/docs/components/segmented-control) · [Toolbar](https://coss.com/ui/docs/components/toolbar) | Clean anatomy for settings rows, steppers with scrub, segmented indicator, toolbar groups | Label + description, stepper/scrub, segmented indicator, group separators | Oversized pill radii; airy marketing spacing |
| **shadcn/ui — patterns** | [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) · [Command](https://ui.shadcn.com/docs/components/base/command) · [Field](https://ui.shadcn.com/docs/components/base/field) · [Sheet](https://ui.shadcn.com/docs/components/base/sheet) · [Progress](https://ui.shadcn.com/docs/components/base/progress) · [Tabs](https://ui.shadcn.com/docs/components/base/tabs) | Widely understood anatomy for sidebar/command/field/sheet/progress | Provider/trigger/header/footer anatomy, command groups, field states, sheet layout | Default dashboard look, shadcn dependency, pill inputs |
| **React Aria — behavior** | [NumberField](https://react-aria.adobe.com/NumberField) · [Toolbar](https://react-aria.adobe.com/Toolbar) · [Tabs](https://react-aria.adobe.com/Tabs) · [Tree](https://react-aria.adobe.com/Tree) · [Dialog](https://react-aria.adobe.com/Dialog) · [Menu](https://react-aria.adobe.com/Menu) · [Slider](https://react-aria.adobe.com/Slider) | The app's actual primitive layer; keyboard/ARIA source of truth | Roles, keyboard, focus, disabled state, value semantics | None; this is behavior, not skin |
| **transitions.dev — motion** | [Library](https://transitions.dev/library.html) · [panel-reveal](https://transitions.dev/studio.html?lib=panel-reveal) · [modal-open-close](https://transitions.dev/studio.html?lib=modal-open-close) · [menu-dropdown](https://transitions.dev/studio.html?lib=menu-dropdown) · [tabs-sliding](https://transitions.dev/studio.html?lib=tabs-sliding) · [tooltip-open-close](https://transitions.dev/studio.html?lib=tooltip-open-close) · [toast-open-close](https://transitions.dev/studio.html?lib=toast-open-close) | Best crafted motion vocabulary; use only a few recipes | Panel/modal/menu/tabs/tooltip/toast transitions; 120–160 ms; origin-aware menus | Bounce, spring overuse, shimmer, 3D tilt, confetti, page-turn |

---

## 3. Per-surface choices

### 3.1 Shell, TopBar, tabs

**Choices**
- [BoardUI Sidebar](https://www.boardui.com/components/sidebar) for the 260 px navigation density and
  search/Kbd row.
- [shadcn Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) for provider/trigger/header/
  footer anatomy and the keyboard shortcut.
- [React Aria Tabs](https://react-aria.adobe.com/Tabs) for the tab roles and keyboard model.
- [beui Tabs](https://beui.dev/components/motion/tabs) and
  [transitions tabs-sliding](https://transitions.dev/studio.html?lib=tabs-sliding) for the active
  indicator idea.

**Take:** one 44 px TopBar; traffic lights; document tabs; `+`; view controls; palette. The active
tab is the document identity. The tab strip is the primary content of the bar.

**Avoid:** a separate title row with the app name and a second Settings gear; floating rounded tab
containers; oversized tab pills; page-turn animation.

**Custom:** document tabs with dirty dot, lock, recovery, close, overflow, drag; no library has
this exact component.

### 3.2 Sidebar

**Choices**
- [BoardUI Sidebar](https://www.boardui.com/components/sidebar): 260 px, quick search, Kbd hint.
- [shadcn Sidebar](https://ui.shadcn.com/docs/components/base/sidebar): collapse/trigger anatomy.
- [beui Animated Sidebar](https://beui.dev/components/motion/animated-sidebar): only the transition
  idea; no bounce.
- [beui File Tree](https://beui.dev/components/motion/file-tree) and
  [BoardUI Tree View](https://www.boardui.com/components/tree-view) for the Topics tree: indent
  guides, collapse, keyboard.

**Take:** header Search/New/Toggle; library + topics; footer Settings; width 264, range 180–640
(the original 208–360 research range was widened in the shell); hidden + reveal collapse; `⌘\`;
persisted width/collapsed.

**Avoid:** floating card sidebar, announcement card, user menu, badge noise, 3xl radius, permanent
icon rail (we chose hidden + reveal).

**Custom:** document library rows, topic/anchor tree, shared/reference chips.

### 3.3 Command palette

**Choices**
- [BoardUI Command Palette](https://www.boardui.com/components/command-palette): search row, sections,
  item icon/description/shortcut, footer hints, contains match.
- [shadcn Command](https://ui.shadcn.com/docs/components/base/command) and
  [Coss Command](https://coss.com/ui/docs/components/command): grouping and keyboard patterns.

**Take:** search row over a scrolling list; sections Commands/Documents/Blocks; footer key legend;
disabled rows with a reason; `⌘K`, ↑↓, ↵, Esc.

**Avoid:** blur/lift panel, AI suggestions, “search everything” copy before content search exists.

**Custom:** command registry, document/block results, read-mode gating.

### 3.4 Settings

**Choices**
- [BoardUI Settings Modal](https://www.boardui.com/components/settings-modal): the closest IA.
- [Coss Fieldset](https://coss.com/ui/docs/components/fieldset) and
  [shadcn Field](https://ui.shadcn.com/docs/components/base/field) for row anatomy.
- [Coss Number Field](https://coss.com/ui/docs/components/number-field) for margins/zoom.
- [shadcn Slider](https://ui.shadcn.com/docs/components/base/slider) and
  [beui Range Slider](https://beui.dev/components/motion/range-slider) for density.
- [shadcn Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group) and
  [Coss Segmented Control](https://coss.com/ui/docs/components/segmented-control) for
  layout/mode/scope.

**Take:** large modal; grouped left nav (General, Appearance, Page, Continuous, Editor, Export,
Data & About); content pane; Page preview; label + description + control rows; section headings;
Apply/Cancel model; global/document scope inside Page.

**Avoid:** plan/upgrade cards, rounded-card nesting, pill inputs, a single endless settings scroll,
fake “coming soon” rows.

**Custom:** Page Setup/Typography/Layout/Breaks rows with override dots; Appearance
theme/colors/fonts; export defaults; data/recovery.

### 3.5 Form controls and settings rows

**Choices**
- [Coss Number Field](https://coss.com/ui/docs/components/number-field): stepper + scrub area.
- [Coss Fieldset](https://coss.com/ui/docs/components/fieldset): label + description.
- [shadcn Field](https://ui.shadcn.com/docs/components/base/field): label/description/error.
- [React Aria NumberField](https://react-aria.adobe.com/NumberField) and
  [React Aria Slider](https://react-aria.adobe.com/Slider): behavior.
- [shadcn Slider](https://ui.shadcn.com/docs/components/base/slider): visual density control.

**Take:** one row anatomy: label, control, help/description, error, override indicator. One unit
suffix (mm/pt/px). Numeric values are editable, not slider-only. 4–6 px control radius.

**Avoid:** pill inputs, floating labels, giant touch targets, unlabeled sliders, hidden units.

### 3.6 PageToolbar

**Choices**
- [Coss Toolbar](https://coss.com/ui/docs/components/toolbar): groups + separators.
- [Coss Segmented Control](https://coss.com/ui/docs/components/segmented-control): layout/mode.
- [shadcn Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group): alternative.
- [React Aria Toolbar](https://react-aria.adobe.com/Toolbar): keyboard/roving focus.

**Take:** one flat 36–40 px contextual bar: page nav left; Setup/Density/Export right; grouped
controls; separators; no duplicate zoom/mode/layout.

**Avoid:** floating rounded toolbar, double rows, duplicate zoom in status + toolbar + menu.

### 3.7 Theme, colors, fonts

**Choices**
- [shadcn Theming](https://ui.shadcn.com/docs/theming): semantic tokens (`background`, `foreground`,
  `primary`, `border`, `ring`), not scattered colors.
- [tweakcn](https://tweakcn.com/): inspiration for an Appearance/theme editor; preview colors,
  radius, fonts.
- [beui Theme Toggle](https://beui.dev/components/motion/theme-toggle): only the toggle idea.

**Take:** Appearance with a curated set: Theme Dark/Light/System; 4 accents; UI text size
Compact/Default/Large; UI font System/Serif; code font JetBrains Mono/System Mono; Page font link
to Page > Typography. Page/PDF stay light.

**Avoid:** a free color picker, a full design-system editor, 20 themes, gradient accents, per-document
theme in v1, changing the Page paper to dark.

**Custom:** the `appearance` settings namespace and its schema/migration; no fields exist today.

### 3.8 Export

**Choices**
- [shadcn Sheet](https://ui.shadcn.com/docs/components/base/sheet) +
  [Progress](https://ui.shadcn.com/docs/components/base/progress).
- [Coss Sheet](https://coss.com/ui/docs/components/sheet) +
  [Progress](https://coss.com/ui/docs/components/progress).
- [BoardUI Modal](https://www.boardui.com/components/modal) +
  [Progress](https://www.boardui.com/components/progress).

**Take:** one sheet for Configure → Overwrite → Progress → Done/Failed; folder picker + filename;
summary of what will be exported; all warnings; Open PDF + Reveal.

**Avoid:** a wizard, a floating panel plus a native save dialog (double prompt), blur, truncated
warnings.

### 3.9 Dialogs and context menus

**Choices**
- [shadcn Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog) /
  [Dialog](https://ui.shadcn.com/docs/components/base/dialog) /
  [Context Menu](https://ui.shadcn.com/docs/components/base/context-menu).
- [Coss Dialog](https://coss.com/ui/docs/components/dialog) /
  [Context Menu](https://coss.com/ui/docs/components/context-menu).
- [React Aria Dialog](https://react-aria.adobe.com/Dialog) /
  [Menu](https://react-aria.adobe.com/Menu).

**Take:** one shared dialog frame; title/description/body/actions; destructive explicit; focus trap;
Escape; one delete policy; context menus with keyboard access.

**Avoid:** native message boxes for app decisions, multiple dialog styles, destructive actions as
the default focus, context menus as the only path to a core command.

### 3.10 Toasts

**Choices**
- [Coss Toast](https://coss.com/ui/docs/components/toast).
- [BoardUI Toast](https://www.boardui.com/components/toast).
- [beui Animated Toast Stack](https://beui.dev/components/motion/animated-toast-stack): stacking
  idea only.

**Take:** transient success/info/warning; max 3; optional one action (Undo/Retry/Open); dedupe;
bottom-right; live region; no focus steal.

**Avoid:** blur/spring, toast for blocking errors, toast for Export/Settings outcomes (their
surfaces own them), action spam.

### 3.11 Tree / outline

**Choices**
- [React Aria Tree](https://react-aria.adobe.com/Tree): roles/keyboard/selection.
- [BoardUI Tree View](https://www.boardui.com/components/tree-view): expandable branches, keyboard.
- [beui File Tree](https://beui.dev/components/motion/file-tree): indent/guide idea.

**Take:** indent guides, chevrons, single selection, keyboard navigation, collapse persistence,
context menu; chapter/block/anchor rows.

**Avoid:** blurred folders, floating tree panel, badges on every row, drag-and-drop decoration
without a model.

### 3.12 Motion

**Choices**
- [transitions.dev library](https://transitions.dev/library.html): panel, modal, menu, tabs,
  tooltip, toast.
- [beui Switch](https://beui.dev/components/motion/switch) and
  [beui Range Slider](https://beui.dev/components/motion/range-slider): only the state-change idea.

**Take:** 120–160 ms ease-out; origin-aware menus; panel/modal enter/exit; tab indicator; tooltip
delay; toast stack. Page changes are **immediate**.

**Avoid:** bounce, spring overuse, 3D tilt, glare, shimmer, confetti, page-turn, animated numbers
on every value, motion that delays work.

---

## 4. Source verdicts

| Source | Verdict | Use for |
|---|---|---|
| [shadcn/ui](https://ui.shadcn.com/) | Strong pattern library; default look is dashboard-adjacent | Sidebar/Command/Field/Sheet/Progress/Tabs anatomy |
| [BoardUI](https://www.boardui.com/) | Strongest IA reference for Settings, Sidebar, Command Palette, Tree; React Aria-based | Settings modal, sidebar, palette, tree, number field |
| [Coss UI](https://coss.com/ui) | Clean, accessible Base UI library; useful control anatomy | Fieldset, Number Field, Segmented Control, Toolbar, Sheet, Toast |
| [React Aria](https://react-aria.adobe.com/) | The app's primitive layer; behavior source of truth | NumberField, Toolbar, Tabs, Tree, Dialog, Menu, Slider |
| [transitions.dev](https://transitions.dev/) | Best crafted motion vocabulary; use a few recipes | Panel/modal/menu/tabs/tooltip/toast |
| [beui.dev](https://beui.dev/) | Motion-first; high bounce/slop risk | Tabs/Switch/Toast/Range Slider ideas only |
| [beautifului.dev](https://www.beautifului.dev/) | AI-native chat/agent components; wrong product language | Nothing primary; maybe sidebar/search/table micro-ideas |
| [rareui.com](https://www.rareui.com/) | Experimental folder/orb/gravity/OTP; low relevance | Nothing primary; curiosity only |
| [21st.dev](https://21st.dev/) | Huge, mixed quality; lots of AI-generated slop | Broad search with heavy filtering; not a primary reference |
| [Kokonut UI](https://kokonutui.com/) | Marketing/motion showcase; not a dense desktop tool | Micro-interaction ideas only |
| [tweakcn](https://tweakcn.com/) | Theme editor for shadcn; visual token preview | Appearance/theme-editor inspiration; curated only |

**Not recommended as a visual direction:** beautifului, rareui, Kokonut, and the majority of 21st.
They are useful only as a reminder of patterns to avoid.

---

## 5. Anti-slop register

### Do not

- Gradient text, glassmorphism, glow, neon, floating blobs, decorative grid backgrounds.
- Hero/bento/marketing layouts inside the app.
- Cards inside cards; accent-left cards used as generic containers.
- Rounded colored status pills; badges on every row; status shown only by color.
- Oversized radii (16–32 px) on inputs/buttons; pill inputs; giant shadows.
- Emoji icons, mixed icon sets, inconsistent stroke widths.
- Fake metrics, dashboards, “insights”, plan/upgrade cards.
- Decorative motion: bounce, spring, shimmer, 3D tilt, confetti, page-turn.
- Generic copy (“Seamlessly…”, “Supercharge…”, “Your new home for…”).
- Duplicate controls, fake controls, dead labels, “coming soon” toggles.
- A settings dump with every field in one scroll.
- Native message boxes for app decisions.

### Do

- Flat surfaces, 1 px dividers, neutral graphite, one accent.
- 4/8 px spacing; 4–6 px control radii; 1 quiet elevation for overlays.
- One component vocabulary; one label per command; one shortcut per command.
- Real content as the hero; chrome recedes.
- Compact rows, clear hierarchy, visible focus, keyboard hints.
- Functional motion only; page changes immediate.
- Terse, specific copy; no marketing voice.
- Page sheet stays paper-like; PDF stays text-real.

---

## 6. What no library provides

These are NoteForest-specific and must be built with the existing tokens:

- Document tabs with dirty dot, lock, recovery, close, overflow, drag.
- Page sheet, print chrome, cross-page edge labels/trunks.
- Anchor/callout UI and the note tree with branches/references.
- Settings with global vs document overrides and per-field override dots.
- Page Setup/Density popovers with a live page preview.
- Export flow with preflight, phases, warnings, atomic output.
- Read-mode gating that is identical across menu, palette, context menu, toolbar, and shortcuts.

---

## 7. Implementation constraints

- No new dependency; React Aria + existing CSS tokens.
- Do not copy BoardUI/shadcn/Coss component code or Tailwind classes; reproduce the anatomy in the
  existing component/style system.
- Keep the Page/PDF boundary: the sheet's internal layout and print output are unchanged.
- Keep Page changes immediate; no page-turn/crossfade delay.
- Keep the frozen settings model; `Appearance`/`Export` fields are future schema work.
- The references are inspiration; the content slices and product decisions are the contract.

---

## 8. Open choices to validate with use

- Final accent palette (Blue default; Teal/Amber/Rose candidates).
- UI font: System + Serif (no dependency) vs a bundled font later.
- Page font: deferred until a bundled font + PDF gate.
- Light/System theme: ship when light tokens exist; not a disabled placeholder.
- Whether the Appearance page needs a preview beyond the compact strip.
- Export defaults (folder/filename/date/metadata) and their schema.
- Settings save model (draft + Apply vs instant) once tried in the app.

---

## 9. Link index

**Primary**
- [BoardUI Settings Modal](https://www.boardui.com/components/settings-modal)
- [BoardUI Sidebar](https://www.boardui.com/components/sidebar)
- [BoardUI Command Palette](https://www.boardui.com/components/command-palette)
- [BoardUI Tree View](https://www.boardui.com/components/tree-view)
- [BoardUI Number Field](https://www.boardui.com/components/number-field)
- [BoardUI Segmented Control](https://www.boardui.com/components/segmented-control)
- [BoardUI Modal](https://www.boardui.com/components/modal)
- [BoardUI Progress](https://www.boardui.com/components/progress)
- [BoardUI Toast](https://www.boardui.com/components/toast)

**shadcn / Coss**
- [shadcn Sidebar](https://ui.shadcn.com/docs/components/base/sidebar)
- [shadcn Command](https://ui.shadcn.com/docs/components/base/command)
- [shadcn Field](https://ui.shadcn.com/docs/components/base/field)
- [shadcn Sheet](https://ui.shadcn.com/docs/components/base/sheet)
- [shadcn Progress](https://ui.shadcn.com/docs/components/base/progress)
- [shadcn Dialog](https://ui.shadcn.com/docs/components/base/dialog)
- [shadcn Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog)
- [shadcn Context Menu](https://ui.shadcn.com/docs/components/base/context-menu)
- [shadcn Slider](https://ui.shadcn.com/docs/components/base/slider)
- [shadcn Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group)
- [shadcn Theming](https://ui.shadcn.com/docs/theming)
- [Coss Fieldset](https://coss.com/ui/docs/components/fieldset)
- [Coss Number Field](https://coss.com/ui/docs/components/number-field)
- [Coss Segmented Control](https://coss.com/ui/docs/components/segmented-control)
- [Coss Toolbar](https://coss.com/ui/docs/components/toolbar)
- [Coss Command](https://coss.com/ui/docs/components/command)
- [Coss Sheet](https://coss.com/ui/docs/components/sheet)
- [Coss Progress](https://coss.com/ui/docs/components/progress)
- [Coss Toast](https://coss.com/ui/docs/components/toast)
- [Coss Dialog](https://coss.com/ui/docs/components/dialog)
- [Coss Context Menu](https://coss.com/ui/docs/components/context-menu)

**React Aria**
- [NumberField](https://react-aria.adobe.com/NumberField)
- [Toolbar](https://react-aria.adobe.com/Toolbar)
- [Tabs](https://react-aria.adobe.com/Tabs)
- [Tree](https://react-aria.adobe.com/Tree)
- [Dialog](https://react-aria.adobe.com/Dialog)
- [Menu](https://react-aria.adobe.com/Menu)
- [Slider](https://react-aria.adobe.com/Slider)

**Motion**
- [transitions.dev](https://transitions.dev/library.html)
- [panel-reveal](https://transitions.dev/studio.html?lib=panel-reveal)
- [modal-open-close](https://transitions.dev/studio.html?lib=modal-open-close)
- [menu-dropdown](https://transitions.dev/studio.html?lib=menu-dropdown)
- [tabs-sliding](https://transitions.dev/studio.html?lib=tabs-sliding)
- [tooltip-open-close](https://transitions.dev/studio.html?lib=tooltip-open-close)
- [toast-open-close](https://transitions.dev/studio.html?lib=toast-open-close)
- [beui Tabs](https://beui.dev/components/motion/tabs)
- [beui Switch](https://beui.dev/components/motion/switch)
- [beui Range Slider](https://beui.dev/components/motion/range-slider)
- [beui Animated Toast Stack](https://beui.dev/components/motion/animated-toast-stack)

**Inspiration only**
- [tweakcn](https://tweakcn.com/)
- [21st.dev](https://21st.dev/)
- [Kokonut UI](https://kokonutui.com/)
- [beautifului.dev](https://www.beautifului.dev/)
- [rareui.com](https://www.rareui.com/)
