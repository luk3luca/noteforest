# ADR-0004 — UI shell and branch editor stack

- **Status:** Accepted (3 November 2026).
- **Depends on:** ADR-0001.

## Context

The shell is a tree, focus, keyboard and overlay problem, not a form problem. The branch editor is
not a freeform canvas: positions are structural, content is live ProseMirror text, and the sidebar
tree is the accessible equivalent of the spatial view. We need one interaction engine, real DOM
text editing, accessible tree navigation and a calm visual system; we do not need a graph SDK, a
canvas SDK or a full UI framework.

## Decision

**shadcn/ui on the React Aria base + Tailwind CSS v4.**

- shadcn is copy-in MIT source: we own and restyle the components.
- React Aria Components (Apache-2.0) provide the tree, menu, dialog, tooltip, popover, autocomplete
  and focus management.
- One accessibility engine; no Radix/React Aria mix.
- Other approved runtime pieces: `react-resizable-panels`, `zustand` (shell state only),
  `lucide-react`, TipTap, KaTeX, lowlight.

**Branch editor: CSS flow tree + measured SVG overlay.**

- Blocks are normal DOM flow; a block with children is a card plus a children group, which wraps
  below with an indent when it does not fit right.
- One ProseMirror document per open document, never one editor per block.
- DOM order is reading order; the sidebar tree is the canonical accessible structure; edges are
  `aria-hidden` and decorative.
- One `ResizeObserver` + `requestAnimationFrame` measures cards; a pure router computes orthogonal
  SVG paths. Arrowhead only at the child; no U-turns.
- Reparenting is menu/keyboard only; drag reorders siblings. No free positioning, minimap or graph
  SDK.

## Rejected

React Flow, tldraw, Excalidraw, react-arborist, cmdk, Radix/Base UI/Ark/Park/Headless, Mantine,
Chakra, MUI, dagre, ELKjs, perfect-arrows, react-xarrows. RareUI is rejected on licence (MIT +
Commons Clause) and look; BoardUI is reference only.

## Consequences

- React Aria wrappers are young: replace one component at a time, keep the tokens.
- CSS flow geometry is less precise than the page engine: cap widths, use gaps, collapse.
- Measurement can jank if the observer writes layout state; only edges update immediately.
- All dependencies are permissive.

## Note on history

The M2c/M2d/M2e addenda (serif typography, depth columns, the early keyboard model) are superseded
and are not repeated here: current behavior is in `docs/spec.md` and `docs/ux.md`, and current
tokens are in `docs/design-tokens*.md`.

## Revisit triggers

- React Aria Tree fails at 300–1,000 nodes after collapse and virtualization.
- CSS flow geometry cannot represent a real fixture without overlap or unreadable rows.
- A component wrapper blocks a React Aria upgrade.
