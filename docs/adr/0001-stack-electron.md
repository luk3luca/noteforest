# ADR-0001 — v1 stack: Electron + React + TypeScript

- **Status:** Accepted (3 November 2026), ratified by the product owner.
- **Research:** `research/native-stacks.md` (go/no-go), `research/landscape.md` (prior art).

## Context

NoteForest is a paged document product, not a canvas: rich blocks with Markdown, LaTeX, code,
images and tables; anchors inside content; an adaptive A4 layout with derived pages; one paginator
driving screen and PDF; a small TypeScript team; a possible later iPad phase.

The decisive criterion was the **one-engine test**: does the same layout tree drive both the screen
and the PDF? Electron/Chromium is the only candidate where that is true by default. The second was
rich-text maturity: ProseMirror/TipTap is the strongest maintained option and is web-native.

## Decision

**Electron + React + TypeScript.** Current stack:

| Area | Choice |
|---|---|
| Shell / build | Electron, `electron-vite`, TypeScript strict |
| UI | React, Tailwind CSS v4, shadcn components on React Aria (ADR-0004) |
| Rich text | TipTap on ProseMirror; ProseMirror-shaped JSON is canonical |
| Math / code | KaTeX; lowlight for highlighting (CodeMirror is not used in v1) |
| Edges | Custom measured SVG overlay (React Flow was rejected, ADR-0004) |
| Tests | Vitest; Playwright for e2e, visual and PDF extraction |
| PDF | `webContents.printToPDF` (ADR-0002) |
| Persistence | Local JSON package + assets folder; no database |

Rules:

- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, narrow preload,
  restrictive CSP, no remote content.
- Layout and paginator are pure TypeScript packages; DOM measurement is an injected adapter.
- ProseMirror node instances never leak into the model, commands or persistence.
- Pin Electron/Chromium; a major upgrade re-runs the PDF gate.

## Why this stack

1. **One engine.** Chromium computes the text and box layout that `printToPDF` prints; a native
   paginator would be a second engine with screen/PDF drift.
2. **Rich text is the hardest commodity.** ProseMirror has the strongest marks, nested nodes, IME,
   undo and schema story.
3. **Anchor survival.** Inline marks with stable IDs are the credible path.
4. **Agent-team fit.** TypeScript, Vite, Vitest, Playwright keep the loop fast.
5. **A real PDF path.** Selectable text and vectors without a second renderer.
6. **iPad is not blocked.** A future client can share the schema and the TypeScript core.

## Alternatives

| Alternative | Verdict | Why |
|---|---|---|
| GPUI | No-go | Pre-1.0, no PDF/pagination engine, young editor ecosystem, no iPad path. |
| SwiftUI/AppKit + TextKit/PDFKit | Conditional | Best native quality and the iPad path, but Mac-only and ~2.5–4× the effort. Reconsider if iPad becomes co-primary. |
| Qt 6 | Fallback | Mature, but C++/QML, licensing, poor agent fit. |
| Tauri 2 | Not chosen | WKWebView PDF is the known trap; a Chromium sidecar is Electron with extra steps. |
| Flutter | No | The `pdf` package is a second text-layout engine. |
| egui/Iced/Slint/Dioxus/Makepad/Xilem/Floem/Freya/Wails | No | Missing rich text, PDF, accessibility or maturity. |

## Consequences

- Bundle size and memory are accepted; not product requirements in v1.
- Electron security hardening is mandatory, not optional.
- Chromium print behavior can change across majors: re-run the PDF gate.
- Native macOS polish (menus, accessibility) needs explicit work.

## Revisit triggers

- iPad + Pencil becomes co-primary (SwiftUI), or a Rust/Qt team makes native a hard requirement.
- A benchmark proves Electron cannot meet the 300/1,000-block gate.
- Never reopen for bundle size alone. A stack change needs a new ADR with a spike.
