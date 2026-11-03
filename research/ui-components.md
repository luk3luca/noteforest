# NoteForest — M2 shell and branch editor: component, interaction, and visual survey

**Prepared:** 3 November 2026  
**Scope:** the M2 desktop shell (library sidebar, document tabs, command palette) and the first barebone branch editor: top-level blocks stack, primary children sit to the right or wrap below, and SVG arrows connect parent to child. Span anchors, reference/shared edges, page view, and PDF are explicitly out of scope.  
**Method:** public documentation, source repositories, npm registry metadata, GitHub activity, and inspection of the existing `packages/layout` code. No packages were installed and no runtime benchmark was run. Versions, licences, and activity are point-in-time facts as of 3 Nov 2026; fit judgements are opinions based on those facts.

**Evidence labels.** *Fact* means a source directly supports it. *Opinion* means it is my judgement. Tables without labels are factual where they state licences/versions, and evaluative where they say “fit” or “look”.

---

## 0. Verdict up front

### 0.1 The stack

**Use shadcn/ui with the React Aria base, not the default Base UI base, and not Radix.**

```bash
npx shadcn@latest init --base aria
```

Once initialized, `shadcn add` installs the React Aria implementation for each component. shadcn/ui has supported React Aria as a first-class component base since July 2026, with the same copy-in model, Tailwind v4 support, and all eight styles. This gives us one accessibility engine for the shell and the branch editor instead of mixing Radix overlays with a React Aria tree. *(Fact: shadcn changelog, July 2026.)*

On top of that:

| Layer | Choice | Licence |
|---|---|---|
| Styling / copy-in components | **shadcn/ui, `--base aria`**, Tailwind CSS v4 | MIT |
| Behaviour primitives | **React Aria Components 1.22** (via shadcn + direct Tree) | Apache-2.0 |
| Shell frame / split | **Custom CSS grid + `react-resizable-panels` v4** | MIT |
| Document tabs | **Custom tab strip** (ARIA tabs pattern) | own code |
| Library and topic tree | **React Aria `Tree`** + `Collection`; custom row rendering | Apache-2.0 |
| Command palette | **shadcn `Command`** (React Aria Autocomplete) | MIT / Apache-2.0 |
| Menus, context menus, dialogs, tooltips | **shadcn React Aria components** | MIT / Apache-2.0 |
| Toasts | **Sonner** via shadcn (the old shadcn Toast is deprecated) | MIT |
| Editor | **TipTap 3** + custom block node views | MIT |
| Block drag handle | **`@tiptap/extension-drag-handle-react`** | MIT |
| Text/block floating UI | **TipTap `BubbleMenu`** + React Aria `Toolbar` | MIT / Apache-2.0 |
| Tab reorder | **`@dnd-kit/core` + `@dnd-kit/sortable`** | MIT |
| Shell state | **Zustand 5** for tabs, sidebar, palette, layout only | MIT |
| Icons | **lucide-react**, curated subset, 16 px / 1.5 px stroke | ISC |
| Branch edges | **Custom SVG overlay with measured DOM rects** | own code |

### 0.2 The branch editor decision

**Do not use React Flow, tldraw, or Excalidraw as the editor foundation.** Render a **CSS flow tree** (top-level blocks stack; each block is a flex row of card + children; children wrap below with an indent) and measure the rendered cards with `ResizeObserver`, then draw **orthogonal SVG connectors in an absolutely positioned overlay** that scrolls with the content. Edges are `aria-hidden`, thin, neutral, and always point from parent to child.

React Flow is the best freeform graph library, but it is the wrong model: it owns absolute node positions, a viewport, selection, and edges. Our positions are structural, our nodes are live ProseMirror content, and our keyboard model is a tree, not a canvas. React Flow would add 59 KB gzip and a second interaction model to fight. *(Fact: React Flow 12.12.1 MIT, 58.6 KB gzip; it has keyboard/a11y support for its node graph, but that is not a substitute for a semantic block tree.)*

**Reuse the existing `packages/layout` rules, not its page engine, for M2.** Spike 1 already encodes the exact placement vocabulary we need: `minContentWidth: 160`, `maxContentWidth: 420`, `siblingGap: 24`, `wrapIndent: 18`, `chapterGap: 32`, `cardPadding: 12`, `cardBorder: 1`. Share those constants and the `EdgeLayout` conventions; keep the live editor on a CSS-flow geometry adapter. When the reader/page slice lands, the computed layout engine can become the second renderer behind the same `BranchGeometry` interface. *(Opinion; the existing code is a fact.)*

### 0.3 Visual direction

**Graphite** — a cool neutral dark theme, system UI for chrome, Source Serif 4 for the editor, hairline borders, 3–6 px radii, no shadows on chrome, muted slate-blue accent, orthogonal edges. It is Obsidian-calm without copying Obsidian's purple, and it does not look like a dashboard, a chat app, or a node-graph demo.

### 0.4 The five non-negotiables

1. **One interaction engine.** React Aria for tree, menus, dialogs, tooltips, palette; no second headless framework.
2. **No free positioning.** The tree is computed from structure; users never drag cards to coordinates.
3. **Edges are annotations, not decoration.** 1.25 px neutral lines, arrowhead only at the child, no glow, no gradient, no animated dash.
4. **The sidebar tree is the accessible structural equivalent of the canvas.** Every spatial relationship has a DOM-order, keyboard, and screen-reader path.
5. **No AI slop.** No gradients, glass, glow, emoji, purple default, oversized rounded cards, sparkle icons, or dashboard chrome.

---

## 1. What “fit” means here

Every candidate was judged on the following, in this order:

1. **Electron/React 19 correctness.** No peer-dependency hacks; no legacy React class patterns; no DOM assumptions that break in a `file://`/custom-protocol renderer.
2. **Accessibility.** Keyboard completeness, focus management, ARIA correctness, screen-reader behaviour under macOS VoiceOver. This is a hard requirement, not a nice-to-have.
3. **Editing fit.** Can the component host live ProseMirror content and text selection without stealing focus or remounting the editor?
4. **Tailwind v4 fit.** Semantic CSS variables and data attributes; no parallel CSS-in-JS theme system.
5. **Copy-in vs runtime.** Prefer source we own; accept small headless runtime primitives where behaviour is hard to reproduce.
6. **Visual adaptability.** Can it be de-slopped with tokens, or does it bring a strong look?
7. **Weight and maintenance.** Bundle cost, release cadence, open-issue load, licence compatibility.

**Hard rejects:** non-permissive production licences, unmaintained React 17-era packages, and component sets whose default look is the thing the product owner explicitly asked to avoid.

---

## 2. Component sources: comparison

### 2.1 Shell/component frameworks

| Source | Kind | Licence | Latest / activity (3 Nov 2026) | React 19 | Tailwind v4 | Copy-in? | A11y | Default look | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **shadcn/ui** | Copy-in components over a headless base (Base UI default, React Aria and Radix selectable) | MIT | `shadcn@4.23.0`, 27 Oct 2026; very active | Yes | First-class (`@theme inline`) | Yes, source in repo | Strong; depends on base | Neutral “new-york”; can look generic if untuned | **Choose, with `--base aria`** |
| **Radix UI** | Headless primitives | MIT | `radix-ui@1.8.1`, 12 Oct 2026; active, still supported by shadcn; the same team now leads Base UI | Yes | Unstyled, works | Runtime | Strong, mature | Unstyled | Not chosen; fallback only |
| **React Aria Components** | Headless components + hooks | Apache-2.0 | `1.22.1`, 9 Oct 2026; Adobe, very active | Yes | Unstyled, data attributes; Tailwind starter exists | Runtime | Strongest: keyboard, focus, DnD, tree, typeahead | Unstyled | **Choose for behaviour, especially Tree** |
| **Base UI** | Headless primitives | MIT | `@base-ui/react@1.9.0`; active; 6M+ weekly downloads cited by shadcn | Yes | Unstyled, works | Runtime | Strong | Unstyled | Not chosen: no tree component in its docs; shadcn default if we ever leave Aria |
| **Ark UI** | Headless primitives (Zag state machines) | MIT | `@ark-ui/react@5.40.0`, 29 Oct 2026; very active | Yes | Data attributes, works | Runtime | Strong | Unstyled | Not chosen: adds a third primitive system with no tree advantage |
| **Park UI** | Styled recipes over Ark UI + Panda CSS | MIT | Park UI site; React recipes exist, but the system is Panda CSS-first | Yes | **No** (Panda CSS) | Copy-in recipes + runtime Ark | Good (Ark) | Clean, designed | Reject: wrong styling system, extra runtime |
| **Headless UI** | Headless primitives | MIT | `2.2.10`, 7 Apr 2026; slower cadence | Yes | Native | Runtime | Good | Unstyled | Reject: no tree, no context menu, no toast; too little for the shell |
| **Mantine** | Full component framework | MIT | `9.7.4`, 25 Oct 2026; active | Yes, requires `^19.2` | Poor: CSS Modules, own theme | Runtime | Good | Polished Mantine/dashboard | Reject: framework lock-in, heavy, wrong look |
| **Chakra UI** | Full component framework | MIT | `3.38.0`, 3 Nov 2026; active | Yes | Poor: Emotion CSS-in-JS | Runtime | Good | Generic SaaS | Reject: runtime CSS, generic look |
| **MUI** | Full Material framework | MIT | `9.5.0`, 9 Oct 2026; active | Yes | Poor: Emotion | Runtime | Good | Material | Reject: Material is the opposite of calm Mac-native |
| **Origin UI / coss ui** | shadcn-style copy-in | MIT | Origin acquired by coss.com; Origin is a legacy snapshot with limited support; coss ui is active on Base UI | Yes | Yes | Yes | Good | Clean, editorial | Reference only; do not build on the legacy snapshot |
| **Cult UI** | shadcn registry of animated components | MIT | 154 components; active | Yes | Yes | Yes | Mixed | Glass, fluted glass, device mockups, AI agent cards | Reject: the visual language is the anti-slop target |
| **Kibo UI** | shadcn registry of product components | MIT | 41 components; repo last push May 2026, slower | Yes | Yes | Yes | Good | Mixed: clean components, marketing blocks | Reference only: Tree, Code Block, Editor are useful reading |
| **RareUI** | shadcn registry of animated components | **MIT + Commons Clause + attribution** | `rareui.com`; direct `/components` returned HTTP 429; `llms.txt` and repo inspected | Yes | Yes | Yes | Mixed; decorative motion | Frosted glass, springy, WebGL orb | **Reject**: wrong look and not OSI-open |
| **BoardUI** | Copy-in design system over React Aria + Tailwind v4 | Free source MIT; Pro paid | 96 components; RAC underneath; active | Yes | Yes | Yes | Strong (RAC) | Dashboard/agentic: gradients, glow, glass, skeuomorphic switch | **Reference only**; do not adopt the theme |

**The named sources, specifically.**

- **RareUI** is not a shell library. It is a collection of “rare animated” components: a folder that fans out, a bounce sidebar, a fluid WebGL orb, a scroll-progress pill, a paper-plane table of contents. Its own `llms.txt` describes “frosted-glass, springy, Apple-flavored UI” built with Motion, and its licence is MIT **with the Commons Clause and a visible attribution requirement** — source-available, not OSI open source, and not something to build a product chrome on. *(Fact: RareUI `llms.txt`; the public `/components` page was rate-limited during this survey.)* It is useful as a negative reference: it shows exactly the motion and surface language to avoid. There is a separate `rareui.in` project; this report evaluates `rareui.com` only.
- **BoardUI** is much more relevant structurally. Free components are MIT and built on React Aria Components + Tailwind v4; it includes a `tree-view`, `command-palette`, `context-menu`, `toast`, `tabs`, `tooltip`, and `modal`. Its visual language, however, is a dashboard/agent product: gradient buttons, glowing spinners, glass panels, a skeuomorphic switch, stat cards. **Read the free tree/command/context-menu recipes; do not copy the theme, and do not copy Pro source.** Pro is a one-time per-developer licence, not needed for M2.

### 2.2 Focused libraries

| Library | Use | Licence | Latest / activity | React 19 | Weight (min+gzip) | Fit / verdict |
|---|---|---|---|---|---|---|
| **react-arborist** | Tree with virtualisation, inline rename, drag sort | MIT | `4.0.1`, 11 Oct 2026; active again; requires `react-dnd@16` | React >=18 | ~16 KB + react-dnd | Good fallback. Built-in virtualisation and rename; a11y is decent (ARIA, keyboard) but not Adobe-grade; drag uses HTML5 backend. **Do not choose unless RAC Tree fails the 1,000-node test.** |
| **TanStack Virtual** | Virtualisation only | MIT | `3.14.26`, 3 Nov 2026; very active | Yes | ~10 KB | Choose only if RAC Virtualizer cannot virtualize Tree; a flattened custom tree plus TanStack is the fallback. |
| **react-resizable-panels** | Sidebar/editor split, keyboard separator, collapse | MIT | `4.17.0`, 3 Nov 2026; active | Yes | ~32 KB | **Choose.** v4 API is `Group`/`Panel`/`Separator`, not v3's `PanelGroup`/`PanelResizeHandle`; old examples will not compile. `Workspace` exists but is IDE-style overkill for one tab strip. |
| **react-tabs** | Tabs | MIT | `6.1.1`, 25 Mar 2026 | Yes | Small (51 KB unpacked) | Reject: no dirty state, close, overflow, or reorder. |
| **cmdk** | Command palette | MIT | `1.1.1`, 14 Mar 2025; repo slowed, 80 open issues | Yes | ~16 KB | Reject for this app: shadcn's React Aria Command already covers the palette with better a11y and no extra dependency. |
| **lucide-react** | Icons | ISC | `1.67.0`, 3 Nov 2026; very active | Yes | ~1 KB per icon; full set ~203 KB gzip | **Choose**, curated subset only. 16 px, 1.5 px stroke; no filled or multicolour icons. |
| **@dnd-kit/core** + **sortable** | Tab reorder, later block drag | MIT | `6.3.1`, 5 Dec 2024; repo active Oct 2026; new `@dnd-kit/react@0.5.3` is still 0.x | Yes | ~14 KB + sortable | **Choose for tabs only.** Do not mix dnd-kit and React Aria DnD inside the tree; the tree uses RAC's `useDragAndDrop`. |
| **Zustand** | Shell/session state | MIT | `5.0.16`, 22 Oct 2026; active | Yes | ~0.5 KB | **Choose**, but only for tabs, sidebar, palette, expanded nodes, layout. Never mirror the ProseMirror document into it on every keystroke. |
| **TipTap** | Rich-text editor | MIT (core; some Pro extensions paid) | `3.32.2`, 30 Oct 2026; very active | Yes | ~9 KB core React + extensions | **Choose.** DragHandle, BubbleMenu, Mathematics, Table, Image, CodeBlockLowlight are MIT. Verify any Pro extension before use. |
| **Sonner** | Toasts | MIT | `2.0.8`, 9 Aug 2026 | Yes | ~9 KB | **Choose**, restyled flat; shadcn's old Toast is deprecated. |
| **React Flow (`@xyflow/react`)** | Freeform node graph | MIT | `12.12.1`, 2 Nov 2026; very active | Yes | ~59 KB | **Reject for the editor.** Good path/marker utilities and a11y work, wrong structural model. |
| **tldraw** | Canvas SDK | **Production licence required; not OSI** | `5.6.0`, 28 Oct 2026 | Yes | Large | **Reject.** Licence forbids production use without a commercial key; canvas text/a11y is wrong for the editor. |
| **Excalidraw** | Canvas whiteboard | MIT | `0.18.1`, 20 Apr 2026 | Yes | ~344 KB gzip | **Reject.** Canvas rendering, freeform elements, not a DOM text editor. |
| **d3-hierarchy / d3-shape** | Tree layout / path math | ISC | `3.1.3` / `3.2.1`, 3 Nov 2026 | n/a | Small | Optional later if computed layout needs tidy-tree helpers. Not needed for M2. |
| **react-xarrows / perfect-arrows** | DOM-measured arrows / bezier math | MIT | `2.2.1` (active) / `0.3.7` (2021, stale) | Yes / n/a | Tiny | Reference only. Our edge router is ~100 lines and easier to test than adopting a stale abstraction. |
| **ELKjs** | Graph layout | EPL-2.0 or GPL | `0.12.1` | n/a | Large | Reject: licence and weight; our tree is not a general DAG. |
| **dagre** | Graph layout | MIT | `0.8.5`, 2019 | n/a | Small | Reject: stale, wrong model. |

### 2.3 What the comparison actually says

- The shell is not a “component library” problem. It is a **layout, focus, and keyboard** problem. shadcn + React Aria gives us the smallest credible base that covers tree, menus, dialogs, palette, and tooltips without a second design language.
- The named “rare” libraries are not neutral foundations; they are looks. RareUI is a hard no. BoardUI is a useful RAC reference wrapped in a look we do not want.
- Every full framework (Mantine, Chakra, MUI) would force a parallel theme and CSS system, and none of them gives us a better tree than React Aria. The cost is not worth it.
- The only genuinely close alternative is **shadcn + Radix**, which is more familiar and has a larger copy-in ecosystem. It loses because Radix has no tree and the ecosystem's energy has moved to Base UI; mixing Radix overlays with a RAC tree means two focus/DnD models. React Aria wins on the one component that matters most for the sidebar.
- **cmdk loses to shadcn's React Aria Command.** This is a change from the usual 2024-era stack; it is the right call now.
- **Bundle note:** React Aria Components' published package is ~273 KB gzip for the entire library (bundlephobia), but the shell uses roughly ten components and tree-shaking applies; measure the real chunk. React Flow is ~59 KB gzip, `react-resizable-panels` ~32 KB, TanStack Virtual ~10 KB, cmdk ~16 KB, Sonner ~9 KB. In an Electron renderer, bundle size is not the deciding constraint; editing and accessibility are.

---

## 3. Desktop shell patterns to copy and avoid

### 3.1 Pattern table

| App | What to copy | What to avoid |
|---|---|---|
| **Obsidian** | Tabs with drag reorder, pinning, splitting; file explorer with auto-reveal, sort, expand/collapse all, inline rename, context menus; command palette; keyboard-first operation; sidebars collapse to icons. | Infinite canvas/graph as the primary surface; plugin chrome density; theme-transparent panels; too many panes. |
| **JupyterLab** | Left file browser + main tabbed work area + right inspector; breadcrumbs; a visible current-tab marker (coloured top border); tab list/overflow; context menus on files and tabs. | Dense top menu; kernel/status chrome; many sidebar tabs; toolbar icons for everything. |
| **VS Code** | Activity bar/sidebar/editor/panel separation; tabs with drag reorder, preview tabs (italic), pinned tabs, overflow via “Open Editors”; `Cmd+P` quick open and `Cmd+Shift+P` palette; `Cmd+1..9`; “Open Editors” as a tab list. | Minimap; status-bar noise; marketplace/extension chrome; a wall of activity-bar icons; the “IDE” density. |
| **Notion** | Sidebar sections that collapse, hover `+`, drag-to-nest, resize; block handles; slash menu; inline page title. | Emoji page icons everywhere; covers; AI promotional blocks; oversized empty states; “workspace” dashboard framing. |
| **Logseq** | Block-first editing; block selection and collapse; right sidebar for references; keyboard block operations; journals as a calm default. | Bullet-only visual structure; keyboard-only discoverability; graph view as the main surface. |
| **Obsidian Canvas / Heptabase** | Explicit edge side anchors; arrow ends; card focus/open affordance; connections as a secondary layer; text cards remain real text. | Freeform positions as the document model; manual layout work; card sprawl; infinite canvas as the only view. |

### 3.2 What this means for NoteForest

**Copy the desktop conventions, not the chrome.** The shell should feel like a Mac app that happens to be built with web technology:

- A hidden-inset title bar with real traffic lights, a draggable empty region, and no fake window controls.
- A 36 px tab strip, not a browser toolbar.
- A 264 px sidebar with two clearly labelled sections, not a dashboard navigation rail.
- A quiet editor with a readable measure, not a card wall.
- Native macOS menus and a real dirty dot in the traffic lights via `BrowserWindow.setDocumentEdited`.

**Avoid the “productivity dashboard” instinct.** No “Good morning”, no stats row, no AI assistant card, no gradient hero, no command palette with a glowing border. The app is a notebook with a structure view.

### 3.3 Shell anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ● ● ●   NoteForest             Linear algebra — eigenvalues      ⌘K   ⚙    │ 38 px
├──────────────────────────────────────────────────────────────────────────────┤
│  [◧]  Linear algebra ×  │  Eigenvalues ×  │  +                    ⌄        │ 36 px
├───────────────────┬──────────────────────────────────────────────────────────┤
│ LIBRARY        +  │  Chapter 2 · Eigenvalues                                 │
│   Linear alg   ●  │                                                          │
│   Topology        │   ┌──────────────────────┐      ┌──────────────────────┐   │
│   Analysis        │   │ A scalar λ is an     │─────▶│ Characteristic       │   │
│                   │   │ eigenvalue of A ...  │      │ polynomial           │   │
│ TOPICS         +  │   └──────────────────────┘      └──────────┬───────────┘   │
│   ▾ Ch. 2         │            │                               │               │
│     ▾ 2.1 Def     │            ▼                               ▼               │
│       · Matrix    │   ┌──────────────────────┐      ┌──────────────────────┐   │
│     · 2.2 ...     │   │ Multiplicity         │      │ Worked example       │   │
│                   │   └──────────────────────┘      └──────────────────────┘   │
│                   │                                                          │
└───────────────────┴──────────────────────────────────────────────────────────┘
```

Dimensions: title bar 38 px; tab strip 36 px; sidebar 264 px default (208–360, collapsible); splitter 1 px visual / 8 px hit area; editor min 480 px; canvas max 1,100 px with 40–56 px padding. The tab strip starts after ~80 px to clear the traffic lights.

---

## 4. Branch editor: rendering options

### 4.1 The four real options

| Option | How it works | Editing fit | Reflow | Zoom | A11y | Bundle | Complexity | Verdict |
|---|---|---|---|---|---|---|---|---|
| **CSS flow tree + measured SVG overlay** | Blocks in normal DOM flow (flex rows); SVG absolutely positioned over the content; measure card rects with `ResizeObserver`; path from parent rect to child rect | **Best.** Real DOM text, native selection, ProseMirror node views, browser find, caret, IME | Browser reflows; edges re-measured in a frame | CSS transform if added; use non-scaling stroke | Good if DOM order = reading order; edges hidden | 0 | Medium | **Choose for M2** |
| **Computed absolute layout + SVG** | Measure offscreen/after render, compute x/y/w/h, absolutely position every card | Good but harder: selection rectangles, scroll anchoring, drop cursors | Requires explicit stable-reflow pass | Good | Good if DOM order preserved | 0 | High | Phase 2, when page constraints arrive |
| **React Flow** | Nodes are React components at x/y; edges are SVG; built-in viewport, selection, drag, minimap | Poor fit: contentEditable inside a freeform node; graph keyboard model conflicts with text editing | Manual layout plugin; nodes stay put | Built-in | Partial; node graph semantics, not a document tree | ~59 KB | Medium | **Reject for M2**; reference for path/marker ideas |
| **Canvas/WebGL (tldraw/Excalidraw style)** | Draw everything to canvas; text as shapes or overlays | Poor: text editing, selection, accessibility, browser find are all custom | Custom | Built-in | Poor | Large | High | Reject |

**Why the DOM-flow option is not a compromise.** The branch tree is not a freeform diagram. Its geometry is a pure function of structure and measured content. CSS flex already does “to the right, or wrap below” well; the only thing CSS cannot draw is the connector. Measuring the result and painting an SVG overlay is the smallest correct solution, and it keeps the editor a real document.

**Why not use the existing page layout engine directly.** `packages/layout` already has the right placement vocabulary and `EdgeLayout` endpoints, but it is built around a page geometry and an offscreen `MeasurementPort`. Driving live ProseMirror node views from that engine would require measuring every block through a hidden probe and re-running placement on every edit. That is the right architecture for the reader/page/PDF renderer, not for the M2 editing surface. Keep the geometry interface and the constants shared; converge in the page-view slice.

### 4.2 Recommended M2 geometry

- **Top-level blocks** stack vertically in a single column, max width `34rem` (544 px), with `32 px` between chapters and `24 px` between blocks.
- **A block with children** is a flex row: the card is `flex: 0 1 34rem`; the children group is `flex: 1 1 20rem`, `display: flex; flex-wrap: wrap; gap: 16px 24px; padding-inline-start: 18px`.
- **If the children group does not fit to the right**, the flex row wraps the whole group below the card. The 18 px inline padding becomes the “slight indent” from the spec.
- **Child cards** are content-driven with `min-width: 10rem` (160 px) and `max-width: 26.25rem` (420 px), matching `packages/layout`. Long text wraps; code/tables may take the full available width.
- **No absolute positioning in M2.** Cards remain in normal flow. This preserves text selection, caret movement, browser find, IME, and screen-reader order. Only the SVG overlay is absolute.
- **Depth:** support arbitrary depth structurally, but cap the M2 fixture at 4 levels. Deep trees wrap rather than shrink text. Collapse is the primary density tool.
- **Chapter headings** are full-width section headers, not cards: 11 px uppercase label, 1 px hairline rule, `32 px` above, `16 px` below. They are not part of the branch graph.

This is a deliberate “good barebone” geometry: it proves the branch interaction and looks like the final tree, but it does not pretend to solve A4 pagination.

### 4.3 Measurement and edge overlay

The edge layer lives inside the scrolled content, not in a fixed viewport overlay:

```tsx
<div className="branch-canvas" ref={canvasRef}>
  <svg className="branch-edges" aria-hidden="true" focusable="false">
    <defs>{/* one marker per state */}</defs>
    {edges.map((edge) => <path key={edge.id} d={edge.d} markerEnd={...} />)}
  </svg>
  <div className="branch-tree">{/* normal-flow cards */}</div>
</div>
```

Rules:

- The SVG is `position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible;` inside the content wrapper, behind cards (`z-index: 0`; cards `z-index: 1`).
- Measure with a **single `ResizeObserver`** observing the wrapper and every `[data-block-id]` card. Batch in `requestAnimationFrame`. Do not set state that changes card size from the observer; only edge paths change, so there is no measurement loop.
- Convert to content coordinates: `x = rect.left - canvasRect.left + canvas.scrollLeft`, `y = rect.top - canvasRect.top + canvas.scrollTop`. The SVG lives in content coordinates, so scrolling does not invalidate paths.
- Recompute an edge only when either endpoint moves more than `0.5 px`; memoize the edge component by `d` and state.
- Use `vector-effect="non-scaling-stroke"` so a future zoom does not fatten lines.
- One `<defs>` marker per colour/state (`default`, `active`, `muted`); `markerUnits="userSpaceOnUse"`, `orient="auto"`, `refX` at the tip. Do not rely on `context-stroke` for Chromium consistency.
- Hide edges when either endpoint is outside the viewport only if profiling demands it; 300 edges are cheap. Do not virtualize edges before cards.
- **Stable reflow:** while typing, the browser reflows the card immediately; update its incident edges in the same frame. Do not recompute the whole tree or animate positions. On blur/idle, run a full pass. This matches the spec's hybrid stable reflow without a layout engine.
- **Scroll anchor:** when a card above the caret grows, preserve the edited card's viewport position by adjusting `scrollTop` by the delta once per frame. Do not let the canvas jump under the caret.

### 4.4 Performance budget

| Scenario | Budget | Notes |
|---|---|---|
| 300 blocks, 300 primary edges, initial render | < 1.5 s to interactive on an M-series Mac | Render all; no virtualisation |
| 300 blocks, edge recompute after one edit | < 8 ms | Only incident edges; full pass debounced 250 ms |
| 1,000 blocks | < 50 ms full reflow; collapse/virtualize if exceeded | Collapse is the first tool; virtualisation is the fallback |
| Scroll | 60 fps | No per-scroll state updates; SVG scrolls with content |
| Memory | No per-edge React state; paths as strings | Memoize |

Do not use `content-visibility: auto` on blocks in M2: it can skip layout and break measurement and caret behaviour. Collapse or virtualize explicitly instead.

### 4.5 Accessibility of a spatial editor

The canvas must not become an inaccessible “picture of a tree”.

- **DOM order = depth-first reading order.** Parent, then each child subtree, in branch order. Spatial placement must not reorder the DOM.
- **The sidebar Topic tree is the canonical structural navigation.** It uses the WAI-ARIA tree pattern: `role="tree"`, `treeitem`, `aria-expanded`, `aria-level`, arrow keys, type-ahead, Home/End.
- **Block wrappers** expose a visually hidden line: “Level 2, child of Eigenvalues, 3 children.” Use `aria-describedby` rather than putting `role="treeitem"` on a contentEditable wrapper.
- **Edges are decorative:** `aria-hidden="true"` and `focusable="false"`. They are never tabbable and never the only signal of hierarchy.
- **Keyboard model in the canvas:** when a block is selected (not editing), `↑/↓` move through visible blocks in depth-first order, `←` goes to parent, `→` goes to first child or expands, `Enter` edits, `Esc` selects, `Cmd+Enter` adds a child, `Cmd+Shift+Enter` adds a sibling. While editing, arrows are text navigation.
- **Focus visible:** 2 px accent ring with 1 px offset, inset inside the card so it is not clipped. Do not remove focus outlines.
- **Zoom/reflow:** at 200% browser zoom, the layout must wrap, not clip. Test with text-only zoom.
- **Contrast:** edges are graphical objects; keep them at least 3:1 against the canvas. `#5E6670` on `#17181A` is 3.05:1; the active edge `#9BB7D4` is 8.56:1.
- **Reduced motion:** no edge draw animation, no position transitions; `prefers-reduced-motion: reduce` removes the 120 ms fades.
- **Do not use `role="application"`.** Keep browse mode; let screen readers read the document.

### 4.6 Editing interactions

- **Click text → edit.** Click the card padding/gutter → select the block. Do not make the whole card a button.
- **Selection model:** `selectedBlockId` (single for M2) + `editingBlockId`. `NodeSelection` in ProseMirror drives the visual selected state; a custom decoration can add the class. Avoid duplicating selection state in Zustand.
- **Block gutter:** 20 px wide on the left, visible on hover/selection. Contains a six-dot drag handle and a `+` (add child). The gutter is outside the text measure so it never shifts text.
- **Floating toolbar:** for text selection, TipTap `BubbleMenu` above the selection, 30 px high, 6 px offset, flip/shift. For block selection, a compact toolbar at the card's top-right with `+ child`, `+ sibling`, `⋯`. No permanent toolbar.
- **Drag handle:** use `@tiptap/extension-drag-handle-react` with `nested: false` so it targets top-level block nodes. For M2, allow **reorder among siblings** only; reparent via the context menu (“Move to…”). Free drag-to-reparent is a later slice. If the extension's HTML5 drag conflicts with the block model, fall back to a custom gutter handle and dnd-kit.
- **Collapse:** a 12 px chevron at the card's top-right, plus a plain child count (“3”). Clicking hides the subtree and its edges; the count remains. Persist expanded state in session UI state, not in the document. Do not animate height.
- **Context menu:** Add child, Add sibling, Duplicate, Collapse/Expand, Move to chapter, Delete. Destructive item is text-only red, separated.
- **No free positioning, no marquee selection, no minimap, no zoom controls in M2.** Scroll is the navigation. Fit-to-width can come later.

### 4.7 Edge routing rules

The visual convention is simple: **the arrow is the direction of descent.** It starts at the parent, ends at the child, and the arrowhead is only at the child.

```
OK      [ parent ] ─────────────▶ [ child ]
BAD     [ parent ] ◀───────────── [ child ]      (arrowhead at parent)
```

**Side selection.**

1. If the child's left edge is to the right of the parent's right edge + gap → exit **right**, enter **left**.
2. Else if the child's top edge is below the parent's bottom edge + gap → exit **bottom**, enter **top**.
3. Else if the child is to the left (RTL) → exit **left**, enter **right**.
4. Else the layout is invalid (child overlaps or sits above-left); log a dev invariant and reflow. Never draw a U-turn to hide a layout bug.

**Path shapes.**

- Horizontal: a rounded orthogonal elbow, not a bezier. `M parentRight,parentMidY H midX V childMidY H childLeft` with 6 px corner radius. The elbow reads as structure; a bezier reads as a flow diagram.
- Wrapped/below: a trunk-and-bus. One trunk leaves the parent's bottom at `parent.left + 18 px` (the wrap indent), drops to a bus `12 px` above the first child row, runs horizontally, then drops into each child's top centre. This avoids a spider of diagonals and keeps sibling order visible.
- Multiple children to the right: use ports spaced `10–12 px` on the parent's right edge, ordered top-to-bottom by branch order. If more than four children, fan out from a short vertical trunk rather than stacking ports indefinitely.
- Endpoints: stop 1–2 px outside the card border so the arrowhead touches the card, not the text. `refX` must account for the marker tip.
- Corners: `stroke-linejoin="round"`, `stroke-linecap="round"`, radius 6 px.
- Crossing: edges render behind cards. Prefer routing in the 24 px sibling gutter; if a line would cross a card, let it pass behind rather than adding loops. A hidden segment is better than spaghetti.
- Selection: when a block is selected, highlight only the path from the chapter root to that block; dim the rest to ~35% opacity. The selected edge is 1.75 px accent; default is 1.25 px `#5E6670`.
- Reference edges (later): dashed `4 3`, tertiary colour, open arrowhead at the target, routed from the nearest side; they never affect layout. Do not reuse the primary edge component's colour tokens.

**Wrapped-below diagram.**

```
[ parent ]
   │
   ├──────────────────────▶ [ child 1 ]
   │
   └──────────────┐
                  ▼
               [ child 2 ]     (18 px indent; arrow enters the top)
```

The trunk exits the parent's bottom-left, not its right edge. That is what stops a wrapped child from looking “backwards”: the arrow never travels up or left into the child, and the child is never placed to the left of the parent.

**Multi-child right-side diagram.**

```
                 ┌──▶ [ child 1 ]
[ parent ] ──────┼──▶ [ child 2 ]
                 └──▶ [ child 3 ]
```

Ports are ordered; the short shared trunk is optional and only appears when ports would be closer than 8 px.

### 4.8 What to borrow from canvas apps

| Source | Borrow | Do not borrow |
|---|---|---|
| **Obsidian Canvas / JSON Canvas** | Explicit `fromSide`/`toSide`, `fromEnd`/`toEnd`, default arrow at the target; text cards are real Markdown; edges are first-class records. | Freeform x/y as the document model; infinite canvas as the only view; manual layout. |
| **Heptabase** | Card focus/open affordance; connections as a secondary layer; a calm reading surface. | Card sprawl; proprietary canvas as the product model. |
| **tldraw** | Camera/hit-testing/selection ideas; shape bounds; performance thinking. | Licence (production requires a commercial key); canvas-only text; SDK lock-in. |
| **Excalidraw** | Arrow binding affordance; elbow vs curve choice; arrowhead conventions. | Canvas element model; rough hand-drawn aesthetic; bundle. |
| **React Flow** | `getSmoothStepPath`/marker concepts; custom edge components; viewport math if we ever add zoom. | Node graph as the editor; absolute node positions; freeform drag. |
| **Notion / Logseq** | Block gutter handle; slash menu; block selection; collapse. | Bullet-only structure; emoji/AI chrome; dense keyboard-only discovery. |
| **Obsidian Outline** | Outline as a first-class navigation surface; drag headings to rearrange. | Treating the outline as a separate document. |

**The minimal spatial editor is not a library.** It is: a recursive DOM tree + a measured SVG layer + a pure router + a selection model. Every canvas SDK we evaluated would replace at least one of those with a less accessible model.

### 4.9 Component sources for the branch surface

| Need | Source | Licence | Decision |
|---|---|---|---|
| Block card surface | **Custom** `BlockCard` using tokens | own | Do not use shadcn `Card`; its padding/radius/shadow are dashboard-shaped. |
| Block gutter + drag handle | **TipTap DragHandle** (`@tiptap/extension-drag-handle-react` 3.32.2) + custom 20 px gutter | MIT | Use for top-level block nodes; reorder only in M2. |
| Block selection | ProseMirror `NodeSelection` + custom decoration | MIT | Build custom; no library needed. |
| Text floating toolbar | **TipTap `BubbleMenu`** | MIT | Use; restyle flat. |
| Block toolbar | **React Aria `Toolbar`** + icon buttons | Apache-2.0 | Build composition; no library look. |
| Context menu | **shadcn React Aria `ContextMenu`** | MIT / Apache-2.0 | Use. |
| Edge layer | **Custom SVG** + pure router | own | Build; unit-test. |
| Edge path math | Copy a 20-line orthogonal router | own | Do not add `perfect-arrows`; stale. |
| Icons | **lucide-react** | ISC | Curated set. |
| Collapse/expand | **React Aria `Disclosure`** or custom button with `aria-expanded` | Apache-2.0 | Use RAC for the button semantics; custom layout. |
| Popover for “Move to…” | **shadcn React Aria `Popover` + `Command`** | MIT / Apache-2.0 | Use. |
| Toasts | **Sonner** | MIT | Use. |

---

## 5. Recommended component map

### 5.1 Shell

| Surface | Use | Why | Licence |
|---|---|---|---|
| Window frame | Electron `BrowserWindow` with `titleBarStyle: 'hiddenInset'`, opaque background, `trafficLightPosition` | Mac-native; no fake chrome | Electron MIT |
| App layout | Custom CSS grid + `react-resizable-panels` v4 `Group`/`Panel`/`Separator` | Exact desktop proportions; keyboard separator; no dashboard sidebar component | MIT |
| Sidebar | Custom `<aside>` with two sections, sticky headers, independent scroll | Two different data shapes (documents vs topic tree), not one nav | own |
| Library list | Custom listbox + `aria-activedescendant` or React Aria `ListBox` | Documents are flat; not a tree | Apache-2.0 if RAC |
| Topic tree | **React Aria `Tree`** + `Collection`; custom rows | Keyboard, type-ahead, `aria-expanded`, drag hooks, inline rename pattern | Apache-2.0 |
| Tree virtualisation | RAC `Virtualizer` if it proves compatible with `Tree`; otherwise collapse first, then TanStack Virtual | 300 guaranteed; 1,000 usable | Apache-2.0 / MIT |
| Tab strip | **Custom** `role="tablist"` with roving tabindex; `@dnd-kit/sortable` for reorder | Dirty dot, close, overflow, reopen, drag; no off-the-shelf tab fits | MIT |
| Tab overflow | Horizontal scroll + chevron menu listing all open docs | VS Code/Obsidian pattern; no wrapped tabs in M2 | own |
| Command palette | **shadcn `Command`** (React Aria Autocomplete) inside RAC `Dialog` | A11y, fuzzy filtering, groups, shortcuts; no cmdk | MIT / Apache-2.0 |
| Menus / context menus | **shadcn React Aria `DropdownMenu` / `ContextMenu`** | Submenus, checkable items, type-ahead, keyboard | MIT / Apache-2.0 |
| Tooltips | **shadcn React Aria `Tooltip`** | Delay, focus, Escape, aria-describedby | MIT / Apache-2.0 |
| Dialogs | **shadcn React Aria `Dialog` / `AlertDialog`** | Focus trap, Escape, scroll lock, destructive confirm | MIT / Apache-2.0 |
| Toasts | **Sonner** via shadcn | Small, accessible, restyle flat | MIT |
| Icons | **lucide-react**, curated | Consistent 1.5 px stroke | ISC |
| Shell state | **Zustand 5** with selectors | Tabs, sidebar width/collapse, expanded topic IDs, palette open, recent commands | MIT |
| Persistence | `localStorage`/JSON for UI state; document files via main process | UI state is not document state | own |

**Tab strip behaviour (M2).**

- One row, 36 px high; tabs 120–200 px; label ellipsis; 2 px accent top border on the active tab.
- **Dirty state:** a 6 px dot replaces the close button until hover; the native macOS close button also shows the document-edited dot via `setDocumentEdited`.
- **Close:** `×` on hover/focus, middle-click, `Cmd+W`; if unsaved changes exist and autosave has not flushed, prompt Save / Don't Save / Cancel. Closing the last tab leaves the empty state, not a new window.
- **Reorder:** drag with dnd-kit; keyboard reorder via `Ctrl+Shift+PageUp/PageDown` or the tab context menu (“Move left/right”).
- **Overflow:** horizontal scroll with a 2 px scrollbar; a chevron at the right opens a menu of all open tabs with dirty dots and shortcuts. No wrapped tabs in M2.
- **Reopen:** `Cmd+Shift+T` restores the last closed tab, including scroll and selection; keep a per-window stack of 20.
- **Persistence:** restore open tabs and the active tab on launch; if a file is missing, show a quiet “Could not open” row with Remove/Retry.
- **No preview tabs in M2.** Single-click opens a persistent tab; add VS Code-style preview tabs later only if tab clutter becomes a measured problem.

**Sidebar behaviour (M2).**

- Two stacked sections: **Library** (documents, flat) and **Topics** (active document: chapters → top-level blocks → descendants). Each has a sticky 28 px header, a `+` action, and a collapse chevron.
- Library rows: title, dirty/open indicator, hover `⋯`; single-click opens; double-click opens; `F2` or the context menu renames.
- Topic rows: 26 px; 14 px indent; chevron only when children; inline rename; context menu; selected row uses `--accent-soft` plus a 2 px inset accent bar.
- Clicking a topic row selects and scrolls the block into view; clicking a block in the canvas selects and reveals the sidebar row. Do not auto-expand ancestors on every scroll; only on explicit navigation or “Reveal active block”.
- The sidebar has its own scroll; the editor has its own. The splitter is keyboard-resizable and double-click resets to 264 px.
- Empty states: Library “No documents yet” + New document; Topics “No blocks yet” + Add block. Both are one line of secondary text, not an illustration.

**M2 boundary.**

| In | Out |
|---|---|
| Hidden-inset window, tabs, resizable sidebar | Page view, A4 pagination, PDF |
| Library list + chapter/block topic tree | Span anchors, reference/shared edges |
| Continuous block editor with primary branches | Free drag positioning, minimap, zoom |
| SVG arrows for primary edges | Reference-edge styling/UI |
| Command palette, context menus, dialogs, toasts | In-app agent panel, collaboration |
| Dark theme + light tokens | Final theme picker, custom themes |

### 5.2 Branch editor

| Surface | Decision | Notes |
|---|---|---|
| Document editor | **TipTap 3** with one ProseMirror document per open document | Do not create one editor per block; undo, selection, and focus would fragment. |
| Block node | Custom TipTap node `block` with `id`, `role`/`depth` derivable, `content: 'block+'` | One node per content block; node view renders card chrome. |
| Card rendering | Custom `BlockCard` with `NodeViewWrapper` + `NodeViewContent` | Transparent surface; hover; selected ring; optional border. |
| Children placement | Recursive `BlockNode` flex row: card + children group; `flex-wrap` for below | DOM order = depth-first; no absolute positions. |
| Edge layer | Custom `EdgeLayer` + `edge-routing.ts` | Pure functions; unit tests; SVG behind cards. |
| Measurement | `useBlockRects` with one `ResizeObserver` + rAF | Content coordinates; epsilon; no loop. |
| Selection | ProseMirror `NodeSelection` + `selectedBlockId` for shell/sidebar sync | Single selection in M2. |
| Drag handle | TipTap `DragHandle` + custom gutter | Reorder siblings only; reparent via menu. |
| Text toolbar | TipTap `BubbleMenu` | Bold, italic, code, link, math; no colour picker in M2. |
| Block toolbar | RAC `Toolbar` popover | Add child/sibling, duplicate, collapse, delete. |
| Slash menu | RAC `Menu` + TipTap `Suggestion` plugin | Paragraph, heading, list, code, math, image, table; no AI commands. |
| Chapter headers | Custom `<section>` with `aria-labelledby` + hairline rule | Not cards; collapse state. |
| Empty block placeholder | Custom text, not a dashed card everywhere | Only when the block is empty and focused. |
| Branch count | Plain text `3` next to chevron | Not a badge/pill. |
| Accessibility mirror | Sidebar tree + hidden `aria-describedby` on blocks | Edges do not carry meaning alone. |

### 5.3 Build custom vs use

**Build custom:**

- App shell, sidebar sections, tab strip, tab overflow, empty states, save/dirty indicator.
- Block card, block gutter, block selection, block toolbar, chapter headers, collapse, branch count.
- Edge layer, orthogonal router, measurement hook, layout invariants.
- Command registry, keyboard shortcut registry, focus restoration.
- Slash menu composition (using RAC Menu + TipTap Suggestion).

**Do not build custom:**

- Tree keyboard/ARIA behaviour (React Aria).
- Menu/dialog/tooltip/popover focus management (React Aria).
- Command palette filtering + keyboard (shadcn Command/RAC Autocomplete).
- Splitter keyboard/resize behaviour (`react-resizable-panels`).
- Tab reorder sensors (`@dnd-kit`), though the tab strip itself is custom.
- Toast queue/announcements (Sonner).
- Editor schema/undo/IME (TipTap/ProseMirror).

### 5.4 Suggested module boundaries

```
apps/desktop/src/renderer/
  shell/
    AppShell.tsx            # window grid, sidebar/editor split
    TitleBar.tsx            # drag region, traffic-light inset, palette button
    TabBar.tsx              # custom tablist, dirty, close, overflow, dnd
    Sidebar.tsx             # Library + Topics sections
    LibraryList.tsx
    TopicTree.tsx           # React Aria Tree
    CommandPalette.tsx      # shadcn Command
  editor/
    DocumentEditor.tsx      # TipTap instance, doc lifecycle
    BlockNode.tsx           # recursive flex tree
    BlockCard.tsx           # NodeViewWrapper, gutter, chrome
    edges/
      EdgeLayer.tsx
      edge-routing.ts       # pure, tested
      useBlockRects.ts
      geometry.ts           # shared constants from packages/layout
    block-commands.ts       # add child/sibling, move, delete, collapse
    selection.ts
  ui/                       # shadcn React Aria copies
```

Keep `edge-routing.ts` and `geometry.ts` free of React and DOM types so they can be unit-tested and later shared with the page renderer.

### 5.5 Keyboard map for M2

| Shortcut | Action | Notes |
|---|---|---|
| `Cmd+K` | Command palette | The product owner's required binding. TipTap's default link shortcut must move. |
| `Cmd+Shift+K` | Insert link | Replaces TipTap's default `Cmd+K`; document in the shortcut sheet. |
| `Cmd+\` | Toggle sidebar | **Not `Cmd+B`**: `Cmd+B` is bold in the editor. |
| `Cmd+N` | New document | Override Electron's new-window default. |
| `Cmd+O` | Open document | Native file dialog via main process. |
| `Cmd+S` | Save now | Flush autosave; no success toast. |
| `Cmd+W` | Close active tab | Must not close the window; intercept before the native menu. |
| `Cmd+Shift+W` | Close window | Native macOS convention. |
| `Cmd+Shift+T` | Reopen closed tab | Per-window stack. |
| `Cmd+1..9` | Select tab 1–9 | VS Code/Obsidian convention. |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle tabs | Also `Cmd+Shift+[` / `]`. |
| `Cmd+,` | Settings | Native app menu. |
| `F2` / double-click | Rename tree row | Inline input. |
| `Shift+F10` / context-menu key | Context menu | RAC handles. |
| `Esc` | Close overlay / exit editing to block selection | Layered: palette → dialog → editing → selection. |
| `Cmd+Enter` | Add child block | In editor, when a block is selected/editing. |
| `Cmd+Shift+Enter` | Add sibling block | In editor. |
| `↑/↓` | Previous/next visible block | Only when not editing. |
| `←/→` | Parent / first child | Only when not editing; `→` expands if collapsed. |
| `Enter` | Edit selected block | When not editing. |
| `Space` | Toggle collapse | When a block is selected, not editing. |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo/redo | Editor when focused; app-level otherwise. |

**Mac menu integration.** Build a real `Menu` with File/Edit/View/Window/Help. “Close Tab” must be a custom menu item with `Cmd+W`; “Close Window” gets `Cmd+Shift+W`. `Cmd+Q` stays Quit. `Cmd+,` opens Settings. “Services”, “Hide”, “Hide Others”, “Show All” use native roles. Add the document path with `win.setRepresentedFilename` and the dirty state with `win.setDocumentEdited`.

### 5.6 Electron and macOS details

- **Security:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP, deny `window.open`, validate all IPC. The renderer is a normal browser; no Node APIs.
- **Context menus:** a custom React Aria context menu for tree/tab/block actions; a native Electron `Menu` for editable text (Cut/Copy/Paste/Look Up/Spelling). Do not replace the native text menu with a custom one.
- **File drops:** Electron 32+ removed `File.path`; use `webUtils.getPathForFile` in the preload bridge when image/file import lands.
- **Accessibility:** call `app.setAccessibilitySupportEnabled(true)` on macOS and test with VoiceOver. Listen for `accessibility-support-changed` if we need to adjust expensive animations.
- **Theme:** default `nativeTheme.themeSource = 'dark'` for M2, but ship light tokens and a setting. Do not use vibrancy/transparency; it fights the calm opaque look and is a glassmorphism trap.
- **Window state:** persist size, sidebar width, open tabs, active tab, and scroll per document. macOS `window-all-closed` should not quit; `activate` reopens.
- **Dirty state:** `win.setDocumentEdited(true)` gives the native dot in the close button; also show a 6 px dot in the tab. On quit/close with unsaved changes, a native `dialog.showMessageBox` with Save / Don't Save / Cancel.

---

## 6. Visual direction

### 6.1 Three directions

| Direction | Canvas / surface | Text | Accent | Type | Edge character | Risk | Verdict |
|---|---|---|---|---|---|---|---|
| **A. Graphite** | Cool near-black `#17181A`; sidebar `#131416`; raised `#1E2024`; hairline `#2E3238` | Warm off-white `#E7E8EA`; secondary `#A6ABB2` | Dusty slate blue `#9BB7D4` | SF Pro/system UI + Source Serif 4 editor | 1.25 px neutral orthogonal, accent on active path | Can feel generic if accent is overused | **Recommend** |
| **B. Parchment** | Warm charcoal `#1C1916`; surface `#24201B`; border `#3A332A` | Parchment `#EFE7DA`; secondary `#B8AC9A` | Muted ochre `#C49A6C` | System UI + Source Serif 4; slightly larger measure | Sepia-neutral orthogonal | Cosy/sepia cliché; lower contrast for code | Light-mode variant of A; not the primary dark look |
| **C. Basalt** | Near-black `#0F1011`; surface `#181A1C`; border `#2A2D30` | `#F2F2F2`; secondary `#A0A4A8` | Monochrome `#C7C7C7` | System UI + SF Mono labels | Thin white/grey orthogonal | Sterile, tool-like; hard for long study | Focus mode experiment only |

**Recommend A, Graphite.** It is neutral enough for mathematics, code, and images; it is Mac-native through SF; it avoids Obsidian's purple and the AI-dashboard blue-purple gradient. Use B's warm values for the light theme rather than inventing a second structure.

### 6.2 Colour tokens

Dark (default):

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#17181A` | Editor background |
| `--sidebar` | `#131416` | Sidebar background |
| `--surface-1` | `#1B1D20` | Child block surface, hover base |
| `--surface-2` | `#202329` | Hover, selected row base |
| `--surface-3` | `#262A30` | Popover/dialog surface |
| `--border` | `#2E3238` | Hairline borders, separators |
| `--border-strong` | `#3C4148` | Focused input, dragged-over row |
| `--text` | `#E7E8EA` | Primary text (14.5:1) |
| `--text-secondary` | `#A6ABB2` | Metadata, secondary labels (7.7:1) |
| `--text-tertiary` | `#7E848C` | Hints, chapter labels (4.7:1) |
| `--accent` | `#9BB7D4` | Selection, focus, active edge (8.6:1) |
| `--accent-soft` | `#26313C` | Selected row background |
| `--accent-contrast` | `#101418` | Text on accent fills |
| `--edge` | `#5E6670` | Default branch edge (3.05:1) |
| `--edge-active` | `#9BB7D4` | Selected path |
| `--edge-muted` | `#3A3F46` | Dimmed non-selected edges |
| `--danger` | `#D98B8B` | Destructive text/icons |
| `--success` | `#8FBF9F` | Saved/OK status |
| `--warning` | `#D6B17A` | Unsaved/attention |
| `--focus-ring` | `#9BB7D4` | 2 px ring, 1 px offset |

Light (Parchment variant):

| Token | Value |
|---|---|
| `--canvas` | `#F7F5F0` |
| `--sidebar` | `#EFECE5` |
| `--surface-1` | `#FFFDF8` |
| `--surface-2` | `#F1EDE4` |
| `--surface-3` | `#FFFFFF` |
| `--border` | `#DCD7CC` |
| `--text` | `#23211D` |
| `--text-secondary` | `#5F5A52` |
| `--text-tertiary` | `#6B655C` |
| `--accent` | `#3F6383` |
| `--accent-soft` | `#DFE8F0` |
| `--edge` | `#9A9488` (only 2.8:1 on canvas; use `#7A7468` for graphical 3:1) |
| `--danger` | `#A34A4A` |

CSS sketch:

```css
:root[data-theme="dark"] {
  --canvas: #17181a;
  --sidebar: #131416;
  --surface-1: #1b1d20;
  --surface-2: #202329;
  --surface-3: #262a30;
  --border: #2e3238;
  --text: #e7e8ea;
  --text-secondary: #a6abb2;
  --text-tertiary: #7e848c;
  --accent: #9bb7d4;
  --accent-soft: #26313c;
  --edge: #5e6670;
  --edge-active: #9bb7d4;
  --radius-control: 3px;
  --radius-block: 4px;
  --radius-overlay: 6px;
}
```

Map these through Tailwind v4 `@theme inline` so utilities use semantic names (`bg-canvas`, `text-secondary`, `border-subtle`), not raw hex values in components.

### 6.3 Typography

| Role | Family | Size / line height | Weight | Notes |
|---|---|---|---|---|
| UI chrome | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif` | 13 / 1.45 | 400/500 | Native Mac; no bundled UI font needed. |
| Sidebar rows | same | 12.5 / 1.4 | 400/500 | Row height 26 px. |
| Tab labels | same | 12.5 / 1 | 400/500 | Ellipsis; no uppercase. |
| Section labels | same | 11 / 1.2 | 500 | Uppercase, `0.02em`; only “LIBRARY”/“TOPICS”. |
| Chapter label | same | 11 / 1.2 | 500 | Uppercase, tertiary; hairline rule. |
| Editor body | `"Source Serif 4", Georgia, serif` | 17 / 1.65 | 400 | 66–72 ch measure; bundle 2 woff2 subsets (OFL). |
| Editor headings | same | 22/1.25, 19/1.3, 17/1.4 | 600 | H1/H2/H3; no display sizes inside blocks. |
| Code | `"JetBrains Mono", ui-monospace, SFMono-Regular, monospace` | 13.5 / 1.55 | 400/500 | OFL; code block surface `--surface-1`. |
| Math | KaTeX | inherit 17 | — | Display math may exceed the text measure; allow wider block. |
| Kbd | UI font | 11 / 1 | 500 | 1 px border, 3 px radius, no pill. |

No third UI font. No all-caps editor text. No letter-spacing on body copy.

### 6.4 Spacing, radius, border, shadow

| Property | Rule |
|---|---|
| Base spacing | 4 px; use 4/8/12/16/24/32/48 only. |
| Sidebar | 264 px default; 208 min; 360 max; 16 px horizontal padding; 26 px rows; 14 px indent per level. |
| Tab strip | 36 px high; tab 120–200 px; 12 px horizontal padding; 0 radius; 2 px accent top border on active. |
| Title bar | 38 px; traffic-light inset 80 px; drag region; no fake buttons. |
| Editor padding | 40 px top, 56 px horizontal at ≥1,200 px; 24/32 px at narrow widths. |
| Block measure | Top-level max 34 rem (544 px); child 10–26.25 rem (160–420 px); 12 px padding; 4 px radius. |
| Block gap | 24 px sibling; 18 px wrap indent; 16 px child row gap; 32 px chapter gap. |
| Borders | 1 px `--border`; no double borders; selected uses inset box-shadow ring, not a thicker border. |
| Radius | 3 px controls, 4 px blocks, 6 px overlays; 0 tabs; never > 6 px. |
| Shadows | None on chrome, cards, tabs, sidebar. Overlays only: `0 8px 24px rgb(0 0 0 / .35)` popover; `0 24px 64px rgb(0 0 0 / .55)` dialog. No glow. |
| Focus | 2 px `--focus-ring`, 1 px offset; inset inside blocks; always visible. |
| Motion | 120 ms hover, 160 ms overlay, 180 ms sidebar; `cubic-bezier(.2,.7,.2,1)`; no spring, no bounce; 0 ms under `prefers-reduced-motion`. |

### 6.5 Icons and motion

- **Icons:** lucide, 16 px, 1.5 px stroke, currentColor. 12 px chevrons. 14 px six-dot grip. No filled icons, no multicolour icons, no emoji. Do not use `Sparkles`, `Bot`, `Brain`, `Wand`, `Zap`, or `Stars`.
- **Motion:** only state changes. Hover background 120 ms; popover fade/scale 0.98→1 160 ms; sidebar width 180 ms; collapse instant (no height animation); tab switch instant. No page transitions, no parallax, no animated gradients.
- **Selection highlight:** a quiet background and a 1 px accent ring. No glow, no lift, no scale.
- **Edges:** no draw-on animation; no dash movement; no gradient stroke. Active path colour change only.

### 6.6 Branch-specific visual rules

- **Default edge:** 1.25 px `--edge`; arrowhead 6 × 6; 2 px clear of the card border.
- **Active edge:** 1.75 px `--edge-active`; only on the path from chapter root to selected block.
- **Muted edge:** 1 px `--edge-muted` at 35% opacity; only when a path is active.
- **Parent port:** no dot by default; a 3 px dot appears on hover/selection, then fades.
- **Child block:** `--surface-1` background, no border by default; hover `--surface-2`; selected inset 1 px accent ring. Top-level blocks are transparent, so the page does not become a card grid.
- **Chapter label:** 11 px uppercase tertiary, hairline `--border` rule; 32 px above, 16 px below.
- **Collapse:** 12 px chevron, 16 px hit target (24 px on touch), rotates 90° in 120 ms; child count as plain tertiary text.
- **Gutter:** 20 px; 14 px six-dot handle; opacity 0 until row hover/focus/selection; `+` appears below the handle. Never overlaps text.
- **Empty block:** show a 12 px tertiary “Type / for commands” only while focused; no dashed placeholder boxes across the canvas.
- **No dot grid, no graph paper, no minimap, no zoom controls, no “fit view” button in M2.**

### 6.7 ASCII wireframes

**Shell (dark, 1,440 × 900).**

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  ● ● ●   NoteForest                Linear algebra — eigenvalues      ⌘K   ⚙   │ 38
├────────────────────────────────────────────────────────────────────────────────┤
│  [◧]  Linear algebra ×   Eigenvalues ×   +                          ⌄         │ 36
├────────────────────┬───────────────────────────────────────────────────────────┤
│ LIBRARY         +  │  CHAPTER 2 · EIGENVALUES                                  │
│   Linear algebra ● │  ─────────────────────────────────────────────────────    │
│   Topology         │                                                           │
│   Analysis         │   ┌────────────────────────┐     ┌───────────────────────┐  │
│                    │   │ A scalar λ is an       │────▶│ Characteristic        │  │
│ TOPICS          +  │   │ eigenvalue of A if ... │     │ polynomial            │  │
│   ▾ Chapter 2      │   └────────────────────────┘     └───────────┬───────────┘  │
│     ▾ 2.1 Defs     │              │                               │              │
│       · Matrix     │              ▼                               ▼              │
│     · 2.2 Poly     │   ┌────────────────────────┐     ┌───────────────────────┐  │
│     · 2.3 Example  │   │ Multiplicity           │     │ Worked example        │  │
│                    │   └────────────────────────┘     └───────────────────────┘  │
│                    │                                                           │
│                    │   ┌────────────────────────┐                              │
│                    │   │ 2.3 · Example          │  (top-level stack continues) │
│                    │   └────────────────────────┘                              │
└────────────────────┴───────────────────────────────────────────────────────────┘
```

**Branch route: right, then wrapped below.**

```
[ parent ] ──────────────▶ [ child 1 ]
     │
     ├───────────────────▶ [ child 2 ]
     │
     └────────────┐
                  ▼
               [ child 3 ]       18 px indent, arrow enters the top
```

**Selected path.**

```
[ chapter root ] ─────▶ [ parent ] ─────▶ [ selected child ]
       dim                  dim                 accent 1.75 px
```

**Command palette.**

```
                    ┌──────────────────────────────────────────┐
                    │  Search documents, blocks, commands…      │
                    ├──────────────────────────────────────────┤
                    │  DOCUMENTS                               │
                    │   Linear algebra — eigenvalues       ⌘1  │
                    │   Topology                           ⌘2  │
                    │  BLOCKS                                  │
                    │   Characteristic polynomial              │
                    │  COMMANDS                                │
                    │   New document                       ⌘N  │
                    │   Toggle sidebar                     ⌘\  │
                    ├──────────────────────────────────────────┤
                    │  ↑↓ navigate   ↵ open   esc close         │
                    └──────────────────────────────────────────┘
```

### 6.8 Anti-slop checklist

Use this as a review gate. Any “yes” is a defect.

- [ ] Decorative gradients anywhere (backgrounds, buttons, edges, text).
- [ ] Glassmorphism, backdrop blur, translucent chrome, or vibrancy.
- [ ] Glow, neon, coloured box-shadows, or “AI” aurora effects.
- [ ] Purple/indigo as the default accent or selection colour.
- [ ] Emoji in navigation, menus, or empty states.
- [ ] Sparkle, wand, bot, brain, or “magic” iconography.
- [ ] Oversized rounded cards (radius > 6 px) or a card for every block.
- [ ] Floating pill navigation, floating sidebar cards, or overlapping panels.
- [ ] Shadows on tabs, cards, the sidebar, or the title bar.
- [ ] Animated gradients, shimmering placeholders, or infinite marquees.
- [ ] Hover lift, scale, tilt, or spring/bounce on tabs/cards.
- [ ] A dot-grid/graph-paper canvas background.
- [ ] Glowing or animated branch edges; dashed “data flow” motion.
- [ ] A minimap, zoom toolbar, or “fit view” in the editor.
- [ ] Free-positioned cards or drag-to-coordinate interaction.
- [ ] A persistent status bar full of counts and badges.
- [ ] A “Welcome back, Luca” hero or a stats dashboard.
- [ ] A chat-style composer or an in-app agent panel.
- [ ] Oversized empty-state illustrations or marketing copy.
- [ ] Uppercase + wide tracking on every label.
- [ ] An icon in every menu row or every tab.
- [ ] A coloured badge/pill for a child count.
- [ ] More than two font families (UI + editor; code is a third, purposeful).
- [ ] Auto-playing motion that ignores `prefers-reduced-motion`.
- [ ] Edges whose arrowhead points at the parent, or that loop backwards to hide a layout bug.

**What to do instead:** neutral surfaces, one accent, hairline borders, 3–6 px radii, real typography, 1.25 px orthogonal edges, quiet hover states, and whitespace. The structure should be legible before the decoration.

---

## 7. Risks, open questions, and approvals

### 7.1 Risks

1. **shadcn's React Aria base is young.** It shipped in July 2026, so the wrappers are ~4 months old. Mitigation: the styling layer is copy-in; if one wrapper misbehaves, replace that single component with a direct React Aria composition without changing the design tokens. Do not migrate the whole base.
2. **Two interaction systems could creep in.** RAC for tree/menus, dnd-kit for tabs, TipTap for editor. Keep boundaries explicit: dnd-kit never enters the tree; RAC DnD never enters the tab strip; ProseMirror owns editor drag.
3. **CSS flex-wrap geometry may look less “designed” than a computed layout.** It can produce uneven rows and a wide tree. Mitigation: cap child width, use `24 px` gaps, collapse subtrees, and treat full adaptive geometry as the page-view milestone. Do not add a layout engine to M2 to chase pixel perfection.
4. **Arrow routing can become spaghetti at 5+ children.** Mitigation: ordered ports, a shared trunk, and a hard limit on visible fan-out; collapse is a feature, not a failure.
5. **Live measurement can jank while typing.** Mitigation: only incident edges update immediately; full pass debounced; no position animation; preserve the edited block's viewport anchor.
6. **Accessibility of a spatial canvas is easy to lose.** Mitigation: sidebar tree is canonical; DOM order is depth-first; edges are hidden; test VoiceOver and keyboard-only before calling M2 done.
7. **Visual divergence from the future page view.** Mitigation: share the `packages/layout` constants now, keep `edge-routing.ts` pure, and add a golden geometry fixture. Decide in the page-view slice whether the editor adopts computed absolute positions.
8. **macOS keyboard conflicts.** `Cmd+B`, `Cmd+K`, `Cmd+W`, `Cmd+N` all have native/editor meanings. The map above resolves them; the native menu must match, or the app will feel broken.
9. **Electron accessibility is opt-in.** Without `setAccessibilitySupportEnabled(true)`, VoiceOver may not see the app correctly.
10. **Licence traps.** RareUI is MIT + Commons Clause + attribution; tldraw requires a production licence; BoardUI Pro is paid; TipTap Pro extensions are paid. Do not copy source without checking the specific component.

### 7.2 Open questions for the product owner

1. **Top-level width:** fixed readable measure (34 rem) with children to the right, or full-width top-level blocks? Recommendation: fixed 34 rem; it keeps the tree readable and prevents “wide dashboard” blocks.
2. **Wrap indent:** 18 px (matches `packages/layout`) or 24 px? Recommendation: 18 px.
3. **Edge shape:** orthogonal elbows (recommended) or soft bezier? This is a visual identity decision; orthogonal reads more like a study outline, bezier more like a mind map.
4. **Selected path:** highlight the root→selected path (recommended) or only the selected block? The path helps orientation in a deep tree.
5. **Block borders:** child blocks with a subtle surface only (recommended) or a 1 px border by default? The spec says optional border; default off keeps it calm.
6. **Drag-to-reparent in M2:** menu commands only (recommended for the first barebone), or drag reparent now? Drag reparent is a large correctness surface (cycles, anchors, undo).
7. **Zoom/pan in M2:** scroll only (recommended) or fit-to-width? Zoom adds text blur and pointer-mapping complexity.
8. **Reference/shared edges:** confirmed out of M2. Should the edge layer still reserve a dashed style token so it does not need a redesign later? Recommendation: yes, token only, no UI.
9. **Collapse persistence:** per document in `viewState` or per window in UI state? Recommendation: per document view state, but not part of the document content hash.
10. **Preview tabs:** single-click opens a preview (italic, reuses tab) like VS Code, or always a persistent tab? Recommendation: always persistent in M2; preview is a later refinement.

### 7.3 Dependencies needing Orchestrator approval

**Approve for M2:**

| Dependency | Licence | Why |
|---|---|---|
| `react-aria-components` (direct, beyond shadcn copies) | Apache-2.0 | Tree, Collection, Virtualizer, DnD; the core of the sidebar. |
| `react-resizable-panels@4` | MIT | Sidebar/editor split with keyboard separator. |
| `@dnd-kit/core` + `@dnd-kit/sortable` | MIT | Tab reorder only. New `@dnd-kit/react` is 0.x; stay on stable core. |
| `sonner` | MIT | Toasts; shadcn Toast deprecated. |
| `zustand` | MIT | Shell/session state. |
| `lucide-react` | ISC | Icons. |
| `@tiptap/extension-drag-handle` + `-react` | MIT | Block gutter drag. |
| `@tiptap/extension-bubble-menu` (or `@tiptap/react/menus`) | MIT | Text toolbar. |
| `@tiptap/extension-mathematics` | MIT | KaTeX math. |
| `@tiptap/extension-table`, `-image`, `-code-block-lowlight`, `-placeholder` | MIT | Block content types; verify each is needed for M2. |
| **Source Serif 4** and **JetBrains Mono** woff2 subsets | OFL | Editor/code typography; bundle as assets, not a runtime dependency. |

**Rejected, no approval needed:** React Flow, tldraw, Excalidraw, react-arborist, cmdk, Radix UI, Base UI, Ark UI, Park UI, Headless UI, Mantine, Chakra, MUI, Origin/coss, Cult UI, Kibo UI, RareUI, BoardUI, d3-hierarchy, ELKjs, dagre, perfect-arrows, react-xarrows.

**Tooling, not runtime:** `shadcn` CLI is a dev-time code generator; it does not ship to the renderer. Tailwind v4 is already part of the stack decision.

### 7.4 Test plan for M2

- **Unit:** `edge-routing.ts` for right, below, RTL, multiple children, endpoint clipping, arrow direction, and the “no backwards” invariant. `geometry.ts` for top-level stack, right-fit, wrap-below, indent, and deterministic branch order.
- **Component:** tab strip keyboard (roving tabindex, Delete, Cmd+1..9), tree rename/expand/collapse, palette open/close/focus restore, block selection vs editing.
- **Visual:** Playwright screenshots at 1,440×900 and 1,024×768, dark/light, default/hover/selected/editing, palette open, two tabs with dirty state. Compare against the wireframes, not against a generic component demo.
- **Accessibility:** axe on shell, tree, palette, dialog; keyboard-only run; VoiceOver manual pass; 200% zoom.
- **Performance:** fixture with 300 blocks / depth 4 / 3 children per block; measure initial render, one-edit edge recompute, full reflow, scroll FPS. Repeat at 1,000 blocks with collapse.
- **Electron smoke:** Cmd+K, Cmd+W (tab, not window), Cmd+Shift+W (window), Cmd+\, Cmd+1..9, dirty dot in traffic lights, native text context menu, quit-with-unsaved prompt.
- **PDF later:** unchanged; the M2 editor is not a renderer for the page pipeline.

---

## 8. Sources

All URLs accessed 3 November 2026. Versions from the npm registry unless noted.

### Named component sources

- RareUI — `https://www.rareui.com/llms.txt` (direct `/components` returned HTTP 429; `llms.txt` and repo used) and `https://github.com/swamimalode07/rare-ui`
- BoardUI — `https://www.boardui.com/components`, `https://www.boardui.com/license`, `https://www.boardui.com/docs/introduction`
- shadcn/ui — `https://ui.shadcn.com/docs/changelog/2026-07-react-aria`, `https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default`, `https://ui.shadcn.com/docs/tailwind-v4`, `https://ui.shadcn.com/docs/components/aria/command`, `https://ui.shadcn.com/docs/components/aria/tabs`, `https://ui.shadcn.com/docs/components/aria/toast`
- React Aria — `https://react-spectrum.adobe.com/react-aria/Tree.html`, `https://react-spectrum.adobe.com/react-aria/Virtualizer.html`
- Base UI — `https://base-ui.com/react/overview/quick-start`
- Ark UI — `https://ark-ui.com/`
- Park UI — `https://park-ui.com/`
- Headless UI — `https://headlessui.com/`
- Mantine — `https://mantine.dev/`
- Chakra UI — `https://chakra-ui.com/`
- MUI — `https://mui.com/material-ui/`
- Origin UI / coss ui — `https://github.com/cosscom/ui` (Origin UI acquisition and legacy status)
- Cult UI — `https://www.cult-ui.com/`
- Kibo UI — `https://www.kibo-ui.com/components/tree`
- react-arborist — `https://github.com/jameskerr/react-arborist`
- TanStack Virtual — `https://github.com/TanStack/virtual`
- react-resizable-panels — `https://github.com/bvaughn/react-resizable-panels`
- cmdk — `https://github.com/pacocoursey/cmdk`
- lucide — `https://lucide.dev/`
- dnd-kit — `https://github.com/clauderic/dnd-kit`
- Zustand — `https://github.com/pmndrs/zustand`
- TipTap DragHandle — `https://tiptap.dev/docs/editor/extensions/functionality/drag-handle`
- TipTap BubbleMenu — `https://tiptap.dev/docs/editor/extensions/functionality/bubble-menu`
- Sonner — `https://github.com/emilkowalski/sonner`

### Spatial editing and graph references

- JSON Canvas 1.0 spec — `https://jsoncanvas.org/spec/1.0/`
- Obsidian Canvas — `https://help.obsidian.md/plugins/canvas`
- React Flow accessibility — `https://reactflow.dev/learn/advanced-use/accessibility`
- React Flow custom edges — `https://reactflow.dev/learn/customization/custom-edges`
- tldraw licence — `https://github.com/tldraw/tldraw/blob/main/LICENSE.md`
- Excalidraw — `https://github.com/excalidraw/excalidraw`
- Heptabase — `https://wiki.heptabase.com/`
- WAI-ARIA Authoring Practices, Tree View — `https://www.w3.org/WAI/ARIA/apg/patterns/treeview/`
- MDN `marker-end` — `https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/marker-end`
- MDN `vector-effect` — `https://developer.mozilla.org/en-US/docs/Web/CSS/vector-effect`

### Desktop shell patterns

- Obsidian tabs — `https://help.obsidian.md/tabs`
- Obsidian file explorer — `https://help.obsidian.md/plugins/file-explorer`
- Obsidian sidebar — `https://help.obsidian.md/sidebar`
- VS Code user interface — `https://code.visualstudio.com/docs/getstarted/userinterface`
- JupyterLab interface — `https://jupyterlab.readthedocs.io/en/stable/user/interface.html`
- Notion sidebar — `https://www.notion.com/help/navigate-with-the-sidebar`
- Notion desktop — `https://www.notion.com/help/notion-for-desktop`
- Logseq shortcuts/demo — `https://demo.logseq.com/`, `https://github.com/logseq/logseq`

### Electron and platform

- Electron app API (accessibility, recent documents, lifecycle) — `https://www.electronjs.org/docs/latest/api/app`
- Electron security — `https://www.electronjs.org/docs/latest/tutorial/security`
- Electron `webUtils.getPathForFile` — `https://www.electronjs.org/docs/latest/api/web-utils`

### Internal repo references

- `packages/layout/src/types.ts` — `LayoutOptions` defaults (`minContentWidth 160`, `maxContentWidth 420`, `siblingGap 24`, `wrapIndent 18`, `chapterGap 32`, `cardPadding 12`, `cardBorder 1`), `LayoutBlock`, `EdgeLayout`.
- `packages/layout/src/layout.ts` — existing right/wrap placement rules and edge endpoints.
- `docs/spec.md`, `docs/ux.md`, `docs/adr/0001-stack-electron.md`, `docs/adr/0002-pdf-pipeline.md` — product constraints; not modified.

---

## 9. Ten-line summary

1. Use **shadcn/ui with the React Aria base** (`init --base aria`) + Tailwind v4; one accessibility engine for shell and editor.
2. Use **React Aria Tree** for the topic tree, **RAC menus/dialogs/tooltips**, and **shadcn Command** for Cmd+K; skip cmdk.
3. Build the **tab strip custom**; use `react-resizable-panels` v4 for the sidebar split and dnd-kit only for tab reorder.
4. Reject RareUI (animated/frosted, non-OSI licence) and BoardUI as a design system (dashboard/agentic look); BoardUI is only a RAC recipe reference.
5. Reject React Flow, tldraw, and Excalidraw for the editor; render a **CSS-flow block tree with a measured SVG edge overlay**.
6. Arrows always run **parent → child**, arrowhead only at the child; right-side elbows, bottom trunk-and-bus for wrapped children; no backwards U-turns.
7. Keep **DOM order depth-first**, hide edges from assistive tech, and make the sidebar tree the canonical accessible structure.
8. Use **Graphite**: cool near-black, system UI + Source Serif 4, 1 px borders, 3–6 px radii, no chrome shadows, slate-blue accent.
9. Target **300 blocks comfortably, 1,000 with collapse/virtualisation**; budget < 8 ms edge recompute for one edit at 300 blocks.
10. Approve the short dependency list, then build the shell and the branch barebone in that order; do not add free positioning, zoom, or reference edges to M2.
