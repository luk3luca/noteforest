# ADR-0001 — v1 stack: Electron + React + TypeScript

- **Status:** Accepted
- **Date:** 3 November 2026
- **Decision owner:** Orchestrator, ratified by the product owner
- **Supersedes:** the "stack under review" state in `AGENTS.md` v0.3 and `docs/spec.md` v0.3
- **Research:** `research/native-stacks.md` (go/no-go), `research/landscape.md` (prior art and components)

## Context

NoteForest is a paged document product, not a canvas product. The hard requirements are:

- block rich text with Markdown, LaTeX, code, images, and tables;
- stable anchors inside content and anchored branches;
- an adaptive A4 layout with content-driven widths, wrap-below children, and derived pages;
- one paginator that drives the reader, the page view, and a real-text PDF;
- a small TypeScript/web agent team and a short path to a working prototype;
- a possible later iPad + Pencil phase, without building it in v1.

Scout evaluated GPUI, egui, Iced, Slint, Dioxus/Leptos, Makepad, Xilem, Floem, Freya/Blitz, Tauri, Wails, Flutter, SwiftUI/AppKit, and Qt 6 against those requirements. The decisive criterion was the **one-engine test**: does the same layout tree drive both the screen and the PDF? Electron/Chromium is the only candidate where that is true by default. The second criterion was rich-text maturity for a small team; ProseMirror/TipTap is the strongest maintained option and is web-native.

The product owner ratified Electron for v1 on 3 November 2026.

## Decision

Use **Electron + React + TypeScript** for the v1 desktop app.

Approved dependency set for the spike and the first milestones:

| Area | Choice |
|---|---|
| Shell | Electron, current stable major, pinned in `package.json` and CI; Node.js in the main process only |
| Build | Vite + `electron-vite` (or `vite-plugin-electron` if the spike shows a blocker); TypeScript strict mode |
| UI | React 19+, function components, no global state library until a measured need |
| Rich text | TipTap on ProseMirror, with a narrow content adapter; ProseMirror JSON is the canonical block content |
| Code | CodeMirror 6 for code blocks and source editing |
| Math | KaTeX (render + fonts); unsupported LaTeX becomes a visible error, never a crash |
| Graph | React Flow (`@xyflow/react`) for edges and node interaction; the adaptive geometry stays in `packages/layout` |
| Tests | Vitest for unit/geometry; Playwright for e2e, visual regression, and PDF text extraction |
| PDF | Electron `webContents.printToPDF` (ADR-0002) |
| Persistence | Local JSON package + assets folder; no database in v1 |

Rules:

- The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a narrow preload bridge, and a restrictive CSP. No remote content is loaded into the app.
- The layout engine and paginator are pure TypeScript packages with no React or DOM dependency at their core; DOM measurement is an injected adapter.
- TipTap/ProseMirror is behind the content adapter defined in the spec. Do not leak editor node instances into the document model, commands, or persistence.
- React Flow renders edges and handles interaction; it does not own layout. No dagre, no force-directed placement.
- Pin Electron/Chromium versions for deterministic PDF output. Upgrading a major requires re-running the PDF gate.

## Why this stack

1. **One engine.** Chromium computes the same text and box layout that `printToPDF` prints. A custom native paginator would be a second layout engine, with drift between screen and PDF.
2. **Rich text is the hardest commodity.** ProseMirror has the strongest model for marks, nested nodes, IME, undo, and schema migration; TipTap gives a productive React surface without hiding the schema.
3. **Anchor survival.** Inline marks with stable IDs and a document schema are the most credible path to anchors that survive edits. A plain-text/Markdown editor cannot carry that identity safely.
4. **Agent-team fit.** TypeScript, Vite, Vitest, and Playwright keep the loop fast and the test surface approachable for LLM-assisted work.
5. **A real PDF path.** `printToPDF` is the only candidate that is also a production browser print pipeline; it produces selectable text and vector content without a second renderer.
6. **iPad is not blocked.** A future iPad app can share the document schema and the TypeScript core, or be a SwiftUI/PencilKit client over the same files/API. v1 does not claim iPad support.

## Alternatives considered

| Alternative | Verdict | Why |
|---|---|---|
| **GPUI (Zed)** | No-go for v1 | Pre-1.0; no PDF/pagination engine; editor ecosystem is young; anchors and adaptive pagination would be custom; no credible iPad path. Revisit only with a benchmark-backed ADR and a Rust team. |
| **SwiftUI/AppKit + TextKit 2 + PDFKit** | Conditional | Best native quality and the only strong iPad/Pencil path, but Mac/iPad-only, a language switch, and roughly 2.5–4× the effort for this team. Reconsider if iPad becomes co-primary. |
| **Qt 6** | Fallback | Mature single-engine rich text + PDF, but C++/QML, LGPL/commercial licensing, a large app, and poor agent-team fit. |
| **Tauri 2** | Not chosen | The WKWebView PDF path is the known trap; `NSPrintOperation` needs a serious spike; a Chromium sidecar reproduces Electron's architecture with extra steps. |
| **Flutter** | No | The `pdf` package is a second text-layout engine; math and selectable text are weaker. |
| **egui, Iced, Slint, Dioxus Native, Leptos, Makepad, Xilem, Floem, Freya, Wails** | No | Missing rich text, PDF, accessibility, or maturity; each would require building the document stack from scratch. |

## Consequences

Positive:

- The spike can start from a known-good editor/PDF toolchain instead of building one.
- One layout tree, one paginator, two renderers, one PDF pipeline.
- The external API is orthogonal: Node's HTTP server and an MCP adapter are straightforward.

Negative:

- Bundle size 100–200 MB and Electron memory overhead are accepted. Bundle size is not a product requirement in v1.
- Electron security hardening is mandatory, not optional: preload bridge, CSP, no remote content, signed/notarized builds later.
- Chromium print behavior can change across majors; the PDF gate must re-run on upgrade.
- The app is Mac-first but Electron makes Windows/Linux cheap later; do not spend v1 effort on them.
- Native macOS polish (menus, services, accessibility) needs explicit work; it does not come free.

## Gates and revisit triggers

- **Spike 1 gate:** the adaptive layout + paginator + `printToPDF` must pass the 50+ page A4 gate in `docs/spike-01-layout-paginator-pdf.md` before PDF commitment.
- **Performance gate:** 300 blocks under 50 ms warm layout; 60 fps at 300 visible blocks; 1,000 blocks usable with virtualization/collapse/LOD. If Electron DOM fails at 1,000 blocks, optimize first (LOD/virtualization); a native canvas is a later option, not a full stack rewrite.
- **Revisit the stack only if:** iPad + Pencil becomes co-primary (SwiftUI), the team gains a Rust/Qt team and native is a hard requirement, or a benchmark proves Electron cannot meet the scale gate. A stack change requires a new ADR with a spike, not a preference.
- **Do not** reopen the stack for bundle size alone.
