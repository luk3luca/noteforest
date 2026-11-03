# Native stacks for Spatial Notes — can we leave Electron?

**Prepared:** 3 November 2026  
**Scope:** a focused, non-Electron evaluation for the current product model: Mac-first; Document → Chapters → content blocks; explicit branches from whole blocks or anchored spans; primary + reference edges (DAG); adaptive A4 page layout with content-driven widths and page breaks; reader view as primary editor; page view preview; real-text PDF; Markdown/LaTeX/code/images; dark UI; small agent-driven team.  
**Method:** public docs, source repos, issue trackers, crate/package registries, GitHub metadata. No hands-on prototype was built. Star counts and release dates are point-in-time (3 Nov 2026). Claims are labelled **Fact** where a source directly supports them; **Opinion** where they are my judgement.

---

## Verdict up front

**Electron remains the pragmatic baseline for v1.** No non-Electron stack I evaluated can meet all of the hard requirements with lower risk for a small TypeScript/web team. The gap is not raw rendering performance; it is the combination of:

1. mature rich-text editing with Markdown/LaTeX/code,
2. a single adaptive layout engine that also drives PDF,
3. real-text PDF with math/code/images,
4. a credible iPad/Pencil path,
5. a stable API and an ecosystem an agent team can work in.

The best non-Electron candidates are:

1. **SwiftUI/AppKit + TextKit 2 + PDFKit** — best native quality and the only strong iPad/Pencil path; but Mac/iPad-only and a large language/team switch. Relative effort: **~2.5–4×** Electron.
2. **GPUI + GPUI Kit + Zorite's MIT crates** — the only credible Rust-native path, and more viable than expected; but pre-1.0, no PDF/pagination engine, young editor components, no production iPad path. Relative effort: **~2.5–4×**, with higher technical risk than SwiftUI.
3. **Qt 6 Widgets/QML + QTextDocument/QGraphicsScene/QPdfWriter** — mature single-engine option with strong rich text and PDF; but C++/QML, LGPL/commercial licensing, large app, weaker agent fit. Relative effort: **~2–3×**.

**GPUI verdict: no-go for v1 as the primary stack; conditional go for a 1–2 week spike only.** GPUI can render and edit rich Markdown/LaTeX/code surprisingly well *with the right crates*, but it does not give you the two hardest things: a block-level anchored DAG editor and an adaptive A4 paginator that shares one layout tree with the PDF. Those are custom in every native stack; in GPUI they are custom *and* on a pre-1.0 framework.

**Ranking (opinion):**

1. **Electron** — v1 baseline; lowest product risk.
2. **SwiftUI/AppKit** — best non-Electron if Apple-only/iPad is strategic; stable native text/PDF/Pencil.
3. **GPUI** — best Rust-native option; promising ecosystem, but pre-1.0 and no shared PDF/pagination engine.
4. **Qt 6** — mature single-engine fallback; C++/licensing/agent-fit costs.
5. **Flutter** — capable cross-platform UI, but a second PDF layout engine and weaker math/text.
6. **Tauri** — conditional webview alternative; only after a PDF spike.

**Tauri is not a native escape.** It is a webview shell. It is the cheapest migration from Electron if the only goal is bundle size, but its WKWebView PDF path is the same weakness as before; adding a Chromium sidecar reproduces Electron's architecture. It only becomes interesting if a PDF spike proves `NSPrintOperation` + CSS works for A4 pages.

---

## 1. Hard requirements and the one-engine test

| Requirement | Why it is hard | What "good" looks like |
|---|---|---|
| **Block rich text** | Markdown + LaTeX + code + images + tables + lists in one editable surface | One schema, one selection model, undo, IME, accessibility |
| **Anchored spans** | A word/formula/code token/image region must survive edits and map to a branch | Stable IDs in the content model, not raw offsets |
| **Primary + reference edges** | One primary parent drives outline/layout; references may cycle | Acyclic primary forest, reference edges rendered as cross-links |
| **Adaptive widths** | Content-driven widths; children right or wrapped below with indent | Intrinsic measurement + a custom placement algorithm |
| **A4 pages derived from continuous layout** | Never split a block; continuation markers; page size/orientation/margins | A paginator that consumes measured layout boxes |
| **PDF with real text** | Math/code/images/fonts; selectable/searchable in Notability | Same layout tree or a faithful second renderer |
| **Dark UI / native feel** | Not a differentiator by itself | Good typography, 60/120 Hz, native menus |
| **iPad later** | PencilKit, Apple Pencil latency/palm rejection | Native bridge, not a web canvas |
| **Small agent team** | Fewer novel subsystems, good docs, fast iteration | TypeScript/web or a very mature native stack |

**The one-engine test (opinion, but the central criterion):** Does the same layout tree drive both the screen and the PDF?

**External agent API:** This is orthogonal to the UI stack. Every candidate can expose a local HTTP/JSON or file-based API; Electron/Node and Rust/GPUI are both straightforward. It should not drive the UI framework choice.

- **Electron:** CSS/Chromium layout → `printToPDF` uses the same engine. Mostly **yes**, with print CSS caveats.
- **SwiftUI/AppKit:** TextKit/AppKit layout → PDFKit/`NSPrintOperation` draws the same attributed text. **Mostly yes**, but block layout/pagination is custom.
- **Qt:** `QTextDocument`/`QGraphicsScene` → `QPdfWriter` paints the same scene. **Mostly yes**.
- **GPUI:** GPUI layout → a separate Rust PDF writer walking Markdown AST. **No**; two engines.
- **egui/Iced/Slint:** custom layout → a separate PDF writer. **No**.
- **Flutter:** Flutter layout → the `pdf` package's own text layout. **No**, unless you use a widget-to-PDF path that preserves text.
- **Tauri:** WKWebView layout → `createPDF`/`NSPrintOperation` or a Rust PDF writer. **Maybe**, but WKWebView pagination is weak; a Rust writer is a second engine.

This is why Electron remains strong: the product is fundamentally a **paged document layout** problem, and the web stack already has the best-tested intrinsic layout + print pipeline. A native stack only wins if it can keep one engine and still provide the editor/canvas.

---

## 2. Shortlist matrix

Scores are 1–5. **Risk: 5 = low risk, 1 = high risk.** "Content fit" = Markdown/LaTeX/code/rich text. "One-engine PDF" = same layout tree drives screen and PDF. "Ecosystem/agent fit" = docs, examples, community, dependency maturity, and iteration speed for an LLM-assisted team. These are estimates, not measurements.

| Stack | Dev speed | Content fit | One-engine PDF | Real-text PDF | iPad/Pencil | Performance/size | Ecosystem/agent fit | Risk | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **Electron + React + ProseMirror/TipTap + React Flow** | 5 | 5 | 4 | 5 | 2 | 3 | 5 | 4 | **Baseline** |
| **SwiftUI/AppKit + TextKit 2 + PDFKit** | 2 | 3 | 4 | 5 | 5 | 5 | 2 | 4 | **Best native, if Apple-only** |
| **GPUI + GPUI Kit + Zorite crates** | 2 | 4 | 2 | 3 | 2 | 5 | 3 | 2 | **Conditional spike only** |
| **Qt 6 + QTextDocument/QGraphicsScene/QPdfWriter** | 3 | 4 | 4 | 4 | 2 | 4 | 2 | 3 | **Mature fallback** |
| **Flutter + appflowy_editor/CustomPainter/pdf** | 3 | 3 | 2 | 3 | 4 | 4 | 4 | 3 | Honourable mention |
| **Tauri 2 + web UI** | 4 | 5 | 2 | 2 | 4 | 4 | 4 | 3 | Only after PDF spike |
| **egui** | 3 | 2 | 1 | 2 | 1 | 4 | 4 | 2 | No |
| **Iced** | 2 | 2 | 1 | 2 | 1 | 4 | 3 | 2 | No |
| **Slint** | 3 | 2 | 1 | 2 | 3 | 5 | 3 | 3 | No (license + text) |
| **Dioxus / Blitz** | 3 | 2 | 1 | 2 | 2 | 4 | 4 | 2 | No (native renderer beta) |
| **Leptos** | 4 | 3 | 1 | 2 | 2 | 4 | 4 | 2 | No (web only) |
| **Makepad** | 2 | 1 | 1 | 1 | 3 | 5 | 2 | 2 | No |
| **Xilem** | 1 | 2 | 1 | 1 | 1 | 4 | 1 | 1 | No (experimental) |
| **Floem** | 2 | 2 | 1 | 2 | 1 | 4 | 2 | 2 | No |
| **Freya** | 2 | 3 | 1 | 2 | 2 | 4 | 2 | 2 | No |
| **Wails** | 3 | 4 | 2 | 2 | 2 | 4 | 3 | 3 | No (webview/PDF) |

**Reading the matrix:** only Electron, SwiftUI/AppKit, Qt, and (with caveats) Tauri have a plausible path to a paged document product. GPUI is the best Rust option but loses on one-engine PDF and maturity. Flutter is a decent cross-platform option but its PDF path is a second layout engine unless carefully engineered.

**Licenses (summary):** Electron MIT; GPUI Apache-2.0 (Zed editor GPL-3.0); SwiftUI/AppKit Apple SDK terms; Qt LGPLv3 or commercial; Flutter BSD-3-Clause; Tauri MIT/Apache-2.0; egui MIT/Apache-2.0; Iced MIT; Slint GPLv3/royalty-free-with-attribution/commercial; Dioxus MIT/Apache-2.0; Leptos MIT; Makepad MIT/Apache-2.0; Xilem Apache-2.0; Floem MIT; Freya MIT; Wails MIT. Verify each dependency; "permissive" is not the same as "no obligations."

**Rough app-size reference (release builds, not promises):** Electron 100–200 MB; Tauri/Dioxus/Wails 3–10 MB; GPUI Kit hello-world ~12 MB; egui ~5 MB; Iced ~11 MB; Qt 20 MB+ before plugins; SwiftUI typically 5–20 MB depending on assets; Flutter 20–50 MB depending on engine/assets. These are order-of-magnitude numbers; measure the real app.

**Accessibility:** web/Electron and AppKit are the strongest (ARIA/HTML semantics and native AppKit); Qt is strong; Flutter has a Semantics tree; egui/Slint/Freya have AccessKit at varying maturity; GPUI's AccessKit is early and custom controls need explicit roles; Iced 0.14 has no AccessKit. For a study app that may be used with screen readers, this is a real differentiator, not a checkbox.

---

## 3. GPUI deep dive

### 3.1 What GPUI is now

**Fact:** GPUI is Zed's GPU-accelerated, hybrid immediate/retained UI framework. It is Apache-2.0; the Zed editor itself is GPL-3.0, with Apache-2.0 components where marked. GPUI is pre-1.0 and the docs explicitly warn of breaking changes between versions. ([Zed licensing](https://zed.dev/software-overview), [GPUI docs](https://docs.rs/gpui/latest/gpui/))

**Fact:** The published `gpui` crate is at 0.2.2; the newer `gpui-pre` snapshots are at 0.3.x. GPUI Kit pins `gpui-pre = 0.3.10`; every `gpui-pre` release is a different Zed snapshot. Crates that depend on it (Zorite, GPUI Kit) must resolve to the same snapshot; otherwise you get two GPUI graphs. Docs.rs reports ~95% of GPUI items documented but only 16 of 61 items with examples; the README says the best way to learn the API is to read the Zed source. ([gpui-pre docs](https://docs.rs/crate/gpui-pre/latest/source/README.md), [GPUI Kit installation](https://gpui-kit.com/docs/installation/), [Zorite docs](https://packetthrower.github.io/zorite/reference/crates/zorite-editor/))

**Fact:** The GPUI ecosystem is larger than "just Zed" in late 2026:

- **GPUI Kit / gpui-component:** 18.9k GitHub stars, Apache-2.0, 75+ components, Markdown/HTML rendering, code editor, data tables, docking, AccessKit, headless UI tests, WebAssembly. Minimum hello-world binary ~12 MB. Used by Longbridge Pro. It targets 120 Hz when the frame workload fits ~8.3 ms. ([GPUI Kit](https://gpui-kit.com/docs), [GitHub](https://github.com/longbridge/gpui-kit), [component comparison](https://github.com/longbridge/gpui-component))
- **Zorite:** a 81-star, GPL-3.0 notes app built with Rust + GPUI + SQLite; its reusable crates are MIT. It has WYSIWYG Markdown, tables, images, LaTeX math, PDF viewing/annotation, whiteboards, wiki links, backlinks, search, RTL, and PDF export. Active (909 commits; pushed 3 Nov 2026). It reports ~86–138 MB RSS from 1k to 50k pages, with fast SQLite/FTS search. ([Zorite](https://github.com/packetThrower/zorite), [docs](https://packetthrower.github.io/zorite/))
- **Zorite crates:** `zorite-editor` (MIT, WYSIWYG Markdown editor with tables/images/math), `zorite-markdown` (MIT, GFM renderer with tables/images/math hooks/RTL), `gpui-pdf` (MIT, page-virtualized PDF viewer), `gpui-whiteboard` (MIT), `ratex-gpui` (MIT, LaTeX rendering + MathQuill-style editor), `os-spellcheck` (MIT), `gpui-bidi` (MIT).
- **Cditor:** 33-star GPL-3.0 native block rich-text editor with paragraphs, headings, quotes, callouts, lists, todos, toggles, code blocks, tables, images, Mermaid, whiteboards, SQLite/Postgres, Mac/Windows. A useful reference, but GPL prevents proprietary reuse. ([Cditor](https://github.com/JYChen-8866/Cditor))
- **bezel:** 194-star MIT GPUI component library with a Notion-style block editor over a Markdown document model. Uses a forked `bezel-gpui`; APIs evolve quickly. ([bezel editor docs](https://bezel.gallery/docs/editor.md), [bezel](https://github.com/crabtalk/bezel))
- **Markion:** 27-star MIT GPUI Markdown editor with source editing, visual edit, live preview, and export. ([Markion](https://github.com/willmove/markion))

**Opinion:** This is enough to say GPUI is *technically capable* of a notes app. It is not enough to say GPUI is a *stable platform* for this product. Zorite is one app, one primary maintainer, 81 stars; its crates are 0.x; Cditor is GPL and early; bezel uses a GPUI fork. The ecosystem is promising but young.

**Agent fit:** GPUI Kit explicitly ships skills for AI coding agents and docs for Claude/Cursor/Codex; Zorite includes `AGENTS.md`/`CLAUDE.md`, which is helpful. Against that: the API is pre-1.0, examples drift between releases, compile times are long, and the Rust/GPUI corpus in model training data is much smaller than React/Electron. An agent team can work in it, but it will need more source reading and more compile/debug cycles. This is a real, not cosmetic, cost.

### 3.2 Can GPUI render rich Markdown/LaTeX/code blocks?

**Fact:** Yes, with the ecosystem crates:

- `zorite-markdown` renders GFM headings, paragraphs, bold/italic/strikethrough, inline code, links, images, ordered/unordered/nested/task lists, blockquotes, fenced code blocks, tables, footnotes, GitHub alerts, wiki links, tags, and RTL text. Math is host-supplied via a closure; the reader supports inline `$…$` and display `$$…$$`. ([zorite-markdown](https://github.com/packetThrower/zorite/tree/main/crates/zorite-markdown))
- `zorite-editor` is a WYSIWYG Markdown editor with live styling, tables edited cell by cell, images (including inline thumbnails), code blocks, math editing, IME, selection, undo, RTL, and Markdown source round-trip. ([zorite-editor](https://packetthrower.github.io/zorite/reference/crates/zorite-editor/))
- `ratex-gpui` renders LaTeX via RaTeX, a pure-Rust KaTeX port with ~660 commands; it produces `RenderImage`, PNG, or self-contained SVG. The structural editor covers fractions, roots, super/subscripts, matrices, delimiters, and ~100 symbols; unsupported constructs still render but degrade to raw LaTeX editing. ([ratex-gpui](https://crates.io/crates/ratex-gpui), [Zorite math](https://packetthrower.github.io/zorite/usage/math/))
- GPUI Kit has native Markdown/HTML rendering, syntax highlighting, and a code editor with Tree-sitter. ([GPUI Kit](https://gpui-kit.com/docs))
- `gpui-pdf` is a page-virtualized PDF viewer with text search, highlights, and form filling — useful for source PDFs, not for exporting. ([gpui-pdf](https://packetthrower.github.io/zorite/reference/crates/gpui-pdf/))

**Gaps:**

- There is no full HTML/CSS engine. GPUI Kit has basic HTML rendering inside text, but layout is GPUI flex/absolute layout + custom elements. Tables, floats, inline images, and mixed-direction text are possible but custom.
- Math is a rendered image/SVG object, not inline text. That is fine on screen; it complicates PDF text and selection.
- A block-level editor with per-block schemas, anchors, and DAG edges is not provided. `zorite-editor` is a document editor over Markdown source, not a block graph.
- Code blocks are syntax-highlighted text; a full code-editing experience (multiple cursors, language services, diagnostics) would need `gpui-kit`'s code editor or a custom CodeMirror-like component.

### 3.3 Can GPUI edit text well enough?

**Fact:** GPUI has text input primitives, IME integration, selection, shaped text, and custom elements; Zorite demonstrates a WYSIWYG Markdown editor with tables, images, math, RTL, IME, and undo. GPUI Kit provides a code editor and headless UI testing. ([GPUI docs](https://docs.rs/gpui/latest/gpui/), [Zorite editor](https://packetthrower.github.io/zorite/reference/crates/zorite-editor/))

**Opinion:** "Well enough" depends on scope:

- For **one block at a time**, yes: a GPUI text element can handle selection, IME, caret, and styled runs. Zorite proves a document-level version.
- For **a block DAG with anchors**, no existing component gives you:
  - a stable anchor mark that survives edits and serializes,
  - per-block rich-text schemas with embedded math/code/image nodes,
  - cross-block selection/undo,
  - a block command model (split/merge/move/indent).
  You would build these on top of GPUI text primitives.
- For **accessibility**, GPUI's AccessKit support landed in 2026 (PR #56065), and GPUI Kit exposes roles/names/states. But Zed's own rollout is still experimental/gated, and custom controls need explicit accessible roles. It is not at AppKit/web maturity. ([Zed a11y issue](https://github.com/zed-industries/zed/issues/41138), [GPUI Kit accessibility](https://gpui-kit.com/docs))

**What you'd still build for editing:** block model, anchor model, command/undo, selection across blocks, block-level keymap (Enter/Tab/Backspace), math/code/image node views, table editing, find/replace, spellcheck (Zorite has `os-spellcheck`), and accessibility roles.

**Zed's own editor is not a shortcut:** it is a code editor under GPL-3.0, not a reusable rich-text component; embedding it in a proprietary app would be a licensing and architecture problem. Use GPUI (Apache-2.0) and the MIT Zorite/GPUI Kit components instead.

### 3.4 GPUI and PDF: the decisive gap

**Fact:** GPUI has no PDF writer. Zorite's PDF export is a custom layout over `oxidize-pdf` (MIT at 5.x; 1.x was GPL-3.0, so pin/audit the version): it walks the Markdown AST block by block, wraps inline runs greedily with font metrics, owns page breaks, and uses US Letter with 0.75" margins. Its own comments say:

- standard PDF fonts (Helvetica/Courier) keep the file embed-free; emoji and CJK degrade;
- inline `$…$` math stays as source; only block math rasterizes through RaTeX;
- font ligatures are not shaped, so `->`/`=>` and `fi` render as individual characters in the PDF. ([Zorite export.rs](https://github.com/packetThrower/zorite/blob/main/src/export.rs), [Zorite PDF docs](https://packetthrower.github.io/zorite/usage/pdf/))

**Fact:** `gpui-pdf` is a **viewer**, not a writer. `ratex-pdf` can produce vector PDF for a formula with embedded CID fonts, but its CLI writes one formula per PDF and it is not a page-layout engine; integrating formulas into a page layout is custom. ([gpui-pdf](https://packetthrower.github.io/zorite/reference/crates/gpui-pdf/), [ratex-pdf](https://github.com/erweixin/RaTeX))

**Opinion:** This is the central problem. The product needs:

- adaptive A4 layout with content-driven widths,
- children wrapping below with indent,
- block-level page breaks and continuation markers,
- the same paginator driving reader view, page view, and PDF,
- real text for Markdown/code/math.

Zorite's export is a second renderer over Markdown, not a PDF backend for GPUI's layout tree. It proves a GPUI app can emit a PDF, but it does not prove a WYSIWYG page layout can be reproduced faithfully. To match the screen, you would need to either:

1. build a PDF renderer that consumes the same measured layout boxes as GPUI (hard; fonts, shaping, tables, math, images), or
2. build a separate print layout and accept visual drift (Zorite's approach; not acceptable for a WYSIWYG page product).

**A4 vs Letter:** Zorite hardcodes US Letter; our product needs A4 portrait/landscape. That is a small change, but it shows the PDF path is app-specific, not a reusable engine.

### 3.5 GPUI and iPad

**Fact:** GPUI's primary target is desktop. GPUI Kit's mobile docs say mobile is **experimental and platform-dependent**; GPUI Kit does not plan to be a full mobile framework. There is a community `gpui-mobile` fork (47 stars, AGPL-3.0) with iOS/Android; an iOS simulator example exists, but other components/layouts are not validated. ([GPUI Kit mobile](https://gpui-kit.com/docs/mobile), [gpui-mobile](https://github.com/longbridge/gpui-mobile))

**Opinion:** GPUI is not a credible iPad/Pencil path for this product. Even if the view renders, PencilKit integration, palm rejection, safe areas, keyboard, and App Store packaging are all custom. If iPad is a real phase, SwiftUI/AppKit is the sane route.

### 3.6 GPUI: what a 2-week spike must prove

Do not run a vague "looks nice" spike. Use these kill criteria:

1. **One real chapter:** 30–50 blocks with headings, paragraphs, lists, a table, a code block, an image, inline math, and display math. Render at 100% and at 50% zoom; no clipping/overlap.
2. **Editing:** IME (e.g. Japanese/Chinese), selection, undo/redo, copy/paste, spellcheck, RTL if needed. Anchor a phrase, edit before/inside/after it, reload, and verify the anchor still resolves.
3. **Layout:** implement the adaptive rule (content-driven widths; children right or wrapped below with indent) for a 3-level tree. Measure 200 blocks; page breaks must never split a block. Target < 50 ms layout for 200 blocks.
4. **PDF:** produce A4 with real text, code, images, and math. Extract text with `pdftotext`; compare to source. Check fonts/glyphs. Measure page count and visual diff vs screen.
5. **Build/run:** clean build time, incremental build time, binary size, memory, crash/debug workflow. Is the agent loop tolerable?

**Kill if:** PDF cannot share the layout model, math/code text is not faithful, anchor mapping requires raw offsets, build/iteration is painful, or the editor can't handle 50 blocks in one chapter without custom virtualization.

**Opinion:** Run this only if the team is seriously considering a Rust-native future. It is not on the critical path to shipping v1.

### 3.7 What GPUI would still need

Even with GPUI Kit + Zorite's MIT crates, you would build:

1. **Block/DAG model:** blocks, chapters, primary vs reference edges, order, anchors, schema/migrations. No GPUI note app has this exact model.
2. **Anchored spans:** a stable inline anchor mark/ID that survives edits, plus code/formula/image-region anchors and orphan handling. Zorite has block IDs/wiki links, not span branches.
3. **Block editor/commands:** per-block editing, Enter/Tab/Backspace block commands, cross-block selection, command/undo, table/code/image/math node views.
4. **Adaptive A4 layout:** content-driven widths, right-or-wrapped-below placement, page break rules, continuation markers. GPUI's flex layout helps, but the algorithm is custom.
5. **Paginator + PDF backend:** the same measured layout tree must drive reader, page view, and PDF. Zorite's PDF is a separate Markdown walk; that is not enough for WYSIWYG pages.
6. **PDF fidelity:** fonts, shaping/ligatures, code, tables, images, math vector/text, headers/footers. RaTeX can help with formulas, but page integration is custom.
7. **Accessibility:** roles/labels/actions for every custom block and canvas element; GPUI AccessKit is early.
8. **iPad:** PencilKit bridge, safe areas, keyboard, packaging; GPUI mobile is experimental.
9. **Product infrastructure:** search index, file format/backup, crash recovery, updates/notarization, performance tests.

That is most of the product. GPUI gives you rendering, components, and a promising editor; it does not give you the document/pagination core.

---

## 4. Other Rust/native frameworks

### 4.1 egui

**Facts:** egui 0.37 (Oct 2026) is an immediate-mode Rust UI library, MIT/Apache-2.0, with AccessKit, text editing, layout jobs, `egui_kittest` screenshot testing, and an `egui_mcp` inspection server. It runs native and web via eframe. Text editing is plain text with a custom `layouter` for styling/syntax highlighting; it is not a WYSIWYG rich-text editor. There is no PDF writer. ([egui](https://github.com/emilk/egui), [egui 0.37 release](https://github.com/emilk/egui/releases/tag/0.37.0), [egui accessibility](https://docs.rs/crate/egui/docs/accessibility.md))

**Assessment:** Good for tools/debug UIs and fast prototypes; poor fit for a polished paged notes editor. You would build rich text, tables, math, block layout, anchors, and PDF yourself. `egui_mcp` is interesting for agent-driven UI inspection, but it does not close the product gaps. **No.**

### 4.2 Iced

**Facts:** Iced 0.14 (Dec 2025) is MIT, Elm-inspired, wgpu-based. It has a plain-text `text_editor`, read-only `rich_text`/`markdown` widgets, a `canvas` widget, IME support, and headless/E2E testing. It does **not** ship AccessKit in 0.14, and it does not support mobile. ([Iced 0.14 release](https://github.com/iced-rs/iced/releases/tag/0.14.0), [text_editor docs](https://docs.rs/iced/latest/iced/widget/fn.text_editor.html), [AccessKit survey](https://github.com/intendednull/buiy/blob/main/docs/prior-art/accesskit/ecosystem.md))

**Assessment:** A clean architecture, but the text editor is plain, the rich-text widget is read-only, and there is no PDF. You would build the editor and PDF. Accessibility is a real gap for a document app. **No.**

### 4.3 Slint

**Facts:** Slint 1.17.x is a declarative Rust/C++/JS/Python UI toolkit with AccessKit, desktop/mobile/web targets, and a small runtime. It is triple-licensed: GPLv3, a royalty-free desktop/mobile/web license with attribution, or commercial. Its text input is a line/multiline editor, not a rich-text document editor; there is no PDF writer. ([Slint](https://slint.dev), [licensing](https://github.com/slint-ui/slint/blob/master/LICENSE.md), [pricing](https://slint.dev/pricing))

**Assessment:** Good for crisp native UIs, but rich text/document layout is not its problem space, and the license adds a decision. AccessKit support exists but does not solve the document/PDF gap. **No.** ([AccessKit survey](https://github.com/intendednull/buiy/blob/main/docs/prior-art/accesskit/ecosystem.md))

### 4.4 Dioxus / Blitz

**Facts:** Dioxus 0.7 desktop uses the system webview (wry), like Tauri; its native renderer uses Blitz, an experimental WGPU HTML/CSS engine. Dioxus itself calls Dioxus Native "nascent"; Blitz is beta. ([Dioxus 0.7 desktop](https://dioxuslabs.com/learn/0.7/guides/platforms/desktop), [Dioxus 0.7 release](https://dioxuslabs.com/blog/release-070/), [Blitz](https://github.com/DioxusLabs/blitz))

**Assessment:** Dioxus desktop is a webview app — same PDF weaknesses as Tauri. Dioxus Native/Blitz is not mature enough for a document product. Promising for 2027, not v1. **No.**

### 4.5 Leptos

**Facts:** Leptos is a Rust web framework; it does not provide a native desktop renderer. A desktop app would use Tauri or a webview. ([Leptos](https://leptos.dev))

**Assessment:** Not a native stack; no advantage over Tauri + React for this product. **No.**

### 4.6 Makepad

**Facts:** Makepad 1.0 (May 2025) is a GPU/shader-oriented Rust UI framework with a live DSL, macOS/Windows/Linux/iOS/Android/WASM targets, and a code editor. Its docs coverage is low (crates.io reports ~5.9% of items documented for `makepad-widgets`). It has no rich-text document model or PDF writer. ([Makepad 1.0](https://news.ycombinator.com/item?id=43971829), [Makepad book](https://makepad.rs/guide/start/introduction), [makepad-widgets](https://docs.rs/crate/makepad-widgets/latest))

**Assessment:** Impressive rendering tech, wrong maturity/document stack. **No.**

### 4.7 Xilem

**Facts:** Xilem is an experimental Rust native UI framework from Linebender, Apache-2.0. It is not a shipping application framework. ([Xilem](https://github.com/linebender/xilem))

**Assessment:** No. Revisit only if it reaches 1.0 and gains a text/document ecosystem.

### 4.8 Floem

**Facts:** Floem 0.2 is MIT, with fine-grained reactivity, a virtual list, and a code-oriented text editor extracted from Lapce. It has no AccessKit integration and no PDF. ([Floem](https://github.com/lapce/floem), [text_editor docs](https://lapce.dev/floem/floem/views/text_editor/fn.text_editor.html), [AccessKit survey](https://github.com/intendednull/buiy/blob/main/docs/prior-art/accesskit/ecosystem.md))

**Assessment:** Good for Lapce-like code editors, not a rich-text notes app. **No.**

### 4.9 Freya

**Facts:** Freya 0.4 (Jul 2026), 0.5 RC, is MIT, Skia-based, with its own reactive core, rich text editing hooks, a code editor with Tree-sitter, and basic accessibility. It is still work-in-progress and has no PDF. ([Freya 0.4](https://freyaui.dev/posts/0.4), [Freya](https://github.com/marc2332/freya))

**Assessment:** The most interesting Rust UI for custom text after GPUI, but not mature enough for a paged document app. **No.**

### 4.10 Tauri and Wails

**Facts:** Tauri 2 and Wails are webview shells (WKWebView/WebView2/WebKitGTK). Tauri has mobile targets and Swift/Kotlin plugin support; Wails is Go + webview. Neither provides a native rich-text editor or a PDF engine. ([Tauri](https://tauri.app), [Wails](https://wails.io))

**Assessment:** Tauri is the cheapest non-Electron *shell* migration, but it does not solve the document/PDF problem. Wails is similar with a smaller ecosystem. **Tauri: conditional after a PDF spike. Wails: no.**

---

## 5. SwiftUI/AppKit: the best native alternative

### 5.1 Why it is strong

**Facts:**

- TextKit 2 is Apple's text engine; `NSTextView`/`UITextView`/SwiftUI `TextEditor` use it. WWDC26 added new APIs for custom text rendering, viewport layout, and inline attachments; AppKit `NSTextView` is the recommended base for a rich-text editor. ([WWDC26 TextKit](https://developer.apple.com/videos/play/wwdc2026/370/), [TextEditor](https://developer.apple.com/documentation/swiftui/texteditor))
- PDFKit + `NSPrintOperation` provide native PDF creation/printing; PDFKit handles pages, annotations, and text. ([PDFKit](https://developer.apple.com/documentation/pdfkit))
- PencilKit provides the only production-grade Apple Pencil experience (low latency, palm rejection, tool picker). ([PencilKit](https://developer.apple.com/documentation/pencilkit))
- SwiftMath is an MIT Swift port of iosMath; it draws LaTeX with Core Text, can export vector text to PDF, and is fast (~0.5–2 ms/formula). Coverage is limited (e.g. `\operatorname` may fail). ([SwiftMath](https://github.com/mgriebling/SwiftMath), [ADR](https://github.com/humanitas-labs/paper/blob/master/docs/decisions/005-swiftmath-typesetting.md))
- `MarkdownExtendedView` / `SwiftMarkdownView` show native SwiftUI Markdown + LaTeX rendering is feasible; both are young. ([MarkdownExtendedView](https://github.com/ChrisGVE/MarkdownExtendedView), [SwiftMarkdownView](https://github.com/SilverMarcs/SwiftMarkdownView))

### 5.2 Why it is still a large bet

**Opinion:**

- You must build the block model, adaptive A4 layout, paginator, anchors, DAG edge model, canvas/reader renderer, and block editor. TextKit gives you text editing, not a Notion-style block editor.
- Markdown/LaTeX/code coverage is weaker than the web: SwiftMath is not KaTeX-complete; code highlighting needs Highlightr/CodeEditor; tables/Mermaid need custom.
- The team is TypeScript/web; Swift/Xcode is a hiring and iteration-speed risk.
- Mac/iPad-only is fine for this product, but it forecloses Windows/Linux.

**Assessment:** If iPad/Pencil becomes co-primary, SwiftUI/AppKit is the right long-term stack. It has the best native PDF/Pencil story and stable APIs. For a Mac-first v1 with a small TS team, it is a **2.5–4×** effort and a language switch. **Conditional GO, not v1 default.**

---

## 6. Qt 6: the mature single-engine fallback

**Facts:**

- `QTextDocument` supports structured rich text, lists, tables, frames, images, undo/redo, and Markdown (GitHub dialect) via `setMarkdown`. ([QTextDocument](https://doc.qt.io/qt-6/qtextdocument.html))
- `QGraphicsScene`/`QGraphicsView` provide a mature scene graph for custom canvas items, hit testing, zoom/pan, and embedded widgets. ([QGraphicsScene](https://doc.qt.io/qt-6/qgraphicsscene.html))
- `QPdfWriter` produces PDF from a `QPainter`; text remains vector/text if drawn as text. ([QPdfWriter](https://doc.qt.io/qt-6/qpdfwriter.html))
- Qt is available under LGPLv3 or commercial; static linking/embedded may require commercial. ([Qt licensing](https://www.qt.io/licensing))
- Qt has no built-in LaTeX math; you would render formulas via KaTeX/SwiftMath-like images or a custom MathML/LaTeX engine. Markdown is supported but not identical to your GFM+math needs.

**Assessment:** Qt is the most mature "single layout engine" native option: rich text, scene graph, and PDF are all first-party. But it is C++/QML, large, and less agent-friendly; math and Markdown extensions are custom; licensing needs review. **Conditional GO if the team has Qt experience; otherwise no.**

---

## 7. Flutter: capable, but a second PDF engine

**Facts:**

- Flutter is mature, BSD-3, with macOS/iOS/desktop support and a strong custom-rendering model (`CustomPainter`, `TextPainter`).
- `appflowy_editor` is a highly customizable block rich-text editor (MPL-2.0/AGPL-3.0 dual; commercial use allowed under MPL with obligations). 683 stars, last push Aug 2026. ([appflowy_editor](https://pub.dev/packages/appflowy_editor), [GitHub](https://github.com/AppFlowy-IO/appflowy-editor))
- `pdf` is a mature Dart PDF generation library with text, fonts, images, tables; `flutter_math_fork` renders LaTeX (Apache-2.0) but has no line breaking and is not a PDF text engine. ([pdf](https://pub.dev/packages/pdf), [flutter_math_fork](https://pub.dev/packages/flutter_math_fork))

**Assessment:** Flutter can build the UI and canvas, and `appflowy_editor` saves editor work. But the PDF package is a separate layout engine; math would likely rasterize; adaptive A4 block layout is custom. iPad is viable, PencilKit via platform channel. **Honourable mention; not better than Electron for v1.**

---

## 8. Rendering, canvas, and layout per family

### 8.1 Canvas, graph, and adaptive layout

| Stack | Text measurement | Hit testing / selection | Zoom/pan | Arrows | Adaptive A4 |
|---|---|---|---|---|---|
| **Electron** | DOM `Range`, `getBoundingClientRect`, `ResizeObserver` | DOM events/selection | React Flow viewport | SVG/custom edge | CSS flex/intrinsic + custom paginator; **best starting point** |
| **GPUI** | GPUI `TextLayout`/`shape_line`; custom Element | element hitboxes | custom transform | custom `Path` | custom; no paginator |
| **egui** | `Galley` | `Response` | `Scene` | `Painter` | custom |
| **Iced** | renderer `measure` | canvas `Program` | `canvas` | custom | custom |
| **Slint** | layout engine | `TouchArea` | custom | `Path` | custom |
| **SwiftUI/AppKit** | TextKit / `sizeThatFits` | gestures / `NSView` | custom | `Canvas`/`Path` | TextKit + custom paginator; strong |
| **Qt** | `QFontMetrics`/`QTextLayout` | `QGraphicsScene` | `QGraphicsView` | `QGraphicsPathItem` | QTextDocument + custom paginator; strong |
| **Flutter** | `TextPainter` | `GestureDetector` | `InteractiveViewer` | `CustomPainter` | custom |

**Facts/opinion:**

- **No framework gives block-level A4 pagination out of the box.** Every stack needs a paginator that measures blocks, applies page size/margins, breaks between blocks, and emits continuation markers. Electron's CSS fragmentation (`break-inside`, `@page`) is the closest built-in starting point; Qt's `QTextDocument` and Apple's TextKit are next; GPUI/egui/Iced/Flutter are fully custom.
- **Zoom/pan/hit testing are strongest in React Flow, Qt, SwiftUI/AppKit, and Flutter.** GPUI has the primitives but requires custom element/hitbox work; egui/Iced/Slint require custom interaction.
- **No existing canvas library does the adaptive DAG layout.** React Flow, Excalidraw, tldraw, `gpui-whiteboard`, `egui_graphs`, Qt's scene graph, and Flutter's `CustomPainter` give you canvas interaction, not primary-tree layout + anchored callouts + page wrapping. You still need the custom tidy-tree/callout algorithm.
- **Graph algorithms:** `petgraph` (Rust) is useful for DAG validation/traversal; `d3-hierarchy`/`elkjs` are JS-only. There is no Rust equivalent of d3-hierarchy with the same maturity for this specific layout.
- **Algorithm note:** the stack choice does not change the layout algorithm. Use a tidy tree (Reingold–Tilford/Buchheim; `d3-hierarchy` in JS) for the primary tree, custom anchored-callout placement, and `petgraph` for DAG validation. Use ELK/d3-dag only for an explicit global reflow. See `research/landscape.md` §3 for the detailed argument.

### 8.2 Markdown, math, and code per family

| Family | Markdown parser | Text layout | Code highlighting | Math | Images/tables | PDF |
|---|---|---|---|---|---|---|
| **Electron** | remark / ProseMirror Markdown | Chromium CSS/DOM | CodeMirror 6 / Shiki | KaTeX (HTML/CSS) | DOM | `printToPDF` (same engine) |
| **GPUI** | `markdown` / comrak / pulldown-cmark | GPUI text + custom elements | syntect / tree-sitter / GPUI Kit | RaTeX (`ratex-gpui`, image/SVG) | custom | `oxidize-pdf` / custom; RaTeX vector per formula |
| **SwiftUI/AppKit** | swift-markdown | TextKit 2 | Highlightr / CodeEditor | SwiftMath / iosMath | TextKit attachments / custom | PDFKit / `NSPrintOperation` |
| **Qt** | `QTextDocument::setMarkdown` | QTextDocument | QSyntaxHighlighter | KaTeX image / custom | QTextDocument / QGraphicsScene | QPdfWriter |
| **Flutter** | `markdown` | TextPainter | flutter_highlight / re_editor | flutter_math_fork | custom | `pdf` package (separate) |
| **egui/Iced** | pulldown-cmark / comrak | custom | syntect | image/SVG | custom | printpdf / oxidize-pdf |

**Facts:**

- `pulldown-cmark` is a fast CommonMark parser with GFM extensions; `comrak` is a CommonMark + GFM parser/renderer; `markdown-rs` is a CommonMark parser with AST and extensions. All are Rust, permissively licensed. ([pulldown-cmark](https://github.com/pulldown-cmark/pulldown-cmark), [comrak](https://github.com/kivikakk/comrak), [markdown-rs](https://github.com/wooorm/markdown-rs))
- `syntect` (MIT) and `tree-sitter` (MIT) are the main Rust syntax-highlighting options.
- `KaTeX` (MIT) and `MathJax` (Apache-2.0) are the most complete web math renderers; RaTeX is a pure-Rust KaTeX port (~99.5% coverage, MIT); SwiftMath/iosMath are native Apple math renderers (MIT) with less coverage; `flutter_math_fork` is a Dart/Flutter renderer with no line breaking.
- `Typst` has its own high-quality math mode and paged PDF output, but it is a separate typesetting engine; it is not an inline math widget for a GPUI/SwiftUI canvas.
- `MathML` is not a reliable primary path: browser support is reasonable, but native support is limited; most native apps render math to an image, SVG, or PDF primitive.
- `Shiki` is accurate but heavier; `Prism` is lighter and widely used; CodeMirror's Lezer is the best in-editor highlighter.
- There is no mature embeddable HTML/CSS engine in Rust except Blitz (beta) / Servo (not a drop-in UI toolkit). Freya/Blitz are promising but not document-grade.

**Opinion:** For Markdown + LaTeX + code, the web stack is still the most complete and the easiest to keep visually consistent. GPUI is second because of Zorite, but its math is image-based in the editor and its PDF math integration is custom. SwiftUI is third for native, with weaker LaTeX coverage. Qt is strong for text but weak for LaTeX.

### 8.3 PDF paths

| Path | Real text | Math | Pagination | Effort | Verdict |
|---|---|---|---|---|---|
| **Electron `printToPDF`** | Yes, vector text | KaTeX HTML text/vector | CSS paged media + manual rules | Low | **Best v1** |
| **WKWebView `createPDF`** | Yes | KaTeX HTML | Reported single long page; manual pagination | Medium | Trap |
| **WKWebView `NSPrintOperation`** | Yes | KaTeX HTML | Native print, scaling issues reported | Medium–high | Spike only |
| **PDFKit / `NSPrintOperation`** | Yes | SwiftMath/attributed text | Native print, custom block pagination | Medium | **Best native** |
| **Qt `QPdfWriter`** | Yes | Raster/custom | Manual | Medium | Good if Qt |
| **Rust `printpdf`** | Yes | Image/custom | Manual | High | Viable, not turnkey |
| **Rust `oxidize-pdf`** | Yes | Image/custom | Manual | High | Zorite uses it |
| **Rust `pdf-writer`** | Yes | Custom | Manual | High | Low-level |
| **Typst** | Yes, accessible | Typst math | Excellent paged media | High (separate layout) | Good for document-only export |
| **`ratex-pdf`** | Yes, vector formulas | Yes | Per formula; no page layout | High integration | Math component |
| **Flutter `pdf`** | Yes | Raster/custom | Manual | Medium | Separate engine |

**Key finding:** PDF is an engineering project in every stack. No library gives you "adaptive block layout + page breaks + real text + math/code/images" out of the box. Electron is the only stack where the screen layout and PDF are *the same engine by default*; SwiftUI/PDFKit and Qt are the next closest because their text/paint engines are shared.

---

## 9. Rich-text editing components and reusable projects

| Project | License | Stars / activity | What it gives you | Fit / caveat |
|---|---|---:|---|---|
| **GPUI Kit / gpui-component** | Apache-2.0 | 18.9k, active | 75+ components, Markdown/HTML, code editor, tables, dock, AccessKit, headless tests | Best GPUI application base; still pre-1.0 via GPUI snapshots |
| **Zorite** | GPL-3.0 app; **MIT crates** | 81 stars, 909 commits, active | GPUI notes app: WYSIWYG Markdown, tables, images, math, PDF viewer, whiteboard, SQLite, search | Use MIT crates as reference/dependency; app code GPL |
| **zorite-editor** | MIT | 0.x | WYSIWYG Markdown editor with tables, images, math, RTL, IME | Document-level, not block DAG; young |
| **zorite-markdown** | MIT | 0.x | GFM renderer with tables/images/math hooks/RTL | Good reader renderer; no editor |
| **gpui-pdf** | MIT | 0.x | PDF viewer with text search/highlights/forms | Viewer only, not writer |
| **ratex-gpui** | MIT | 0.x | LaTeX render + MathQuill-style editor | Image/SVG rendering; math PDF integration custom |
| **Cditor** | GPL-3.0 | 33 stars, active | Native block rich-text editor with tables/images/Mermaid/whiteboards | GPL; reference only for a proprietary app |
| **bezel** | MIT | 194 stars, active | Notion-style block editor over Markdown, GPUI components | Forked GPUI (`bezel-gpui`); APIs evolving |
| **Markion** | MIT | 27 stars, active | GPUI Markdown editor with visual edit/export | Small; useful reference |
| **ProseMirror / TipTap** | MIT | mature | Schema-based rich text, decorations, node views | Web only; baseline if Electron/Tauri |
| **CodeMirror 6** | MIT | mature | Code editing, decorations, Lezer | Web only; baseline |
| **appflowy_editor** | MPL-2.0 / AGPL-3.0 | 683 stars, active | Flutter block rich-text editor | MPL obligations; Flutter only |
| **super_editor** | MIT | small/uncertain | Flutter document editor toolkit | Verify maintenance before use |
| **NSTextView / TextKit 2** | Apple SDK | mature | Native rich text, IME, accessibility, undo | Apple-only; build block layer |
| **QTextEdit / QTextDocument** | LGPL/commercial | mature | Rich text, tables, Markdown, undo | Qt only; math custom |

**What to reuse if Electron:** ProseMirror/TipTap, CodeMirror 6, KaTeX, remark, React Flow, `fractional-indexing`, `zod`. These are mature and permissively licensed.

**What to reuse if GPUI:** `gpui-kit`, `zorite-editor`, `zorite-markdown`, `ratex-gpui`, `gpui-pdf` (viewer), `gpui-whiteboard` (reference), `os-spellcheck`, `gpui-bidi`. Pin the exact `gpui-pre` snapshot. Do not copy Zorite app code unless you accept GPL.

**What to reuse if SwiftUI:** TextKit 2/NSTextView, PDFKit, PencilKit, SwiftMath/iosMath, swift-markdown, Highlightr. Build the block/paginator layer.

**What to reuse if Qt:** QTextDocument, QGraphicsScene/QGraphicsView, QPdfWriter, QSyntaxHighlighter. Build Markdown/math extensions.

---

## 10. Open-source notes/canvas projects to learn from

| Project | License | Stars | Why look |
|---|---|---:|---|
| **AFFiNE** | MIT/other (check) | 74k | Blocks in page + edgeless, Yjs, Electron; closest "same blocks two views" architecture |
| **Logseq** | AGPL-3.0 | 45k | Block refs, outliner, Markdown/SQLite transition |
| **Joplin** | AGPL-3.0 | 57k | Markdown notes, sync, plugins, Electron |
| **AppFlowy** | AGPL-3.0 | 78k | Flutter block editor/databases; editor crate |
| **Anytype** | AGPL/other (check) | 9k | Objects/relations, local-first, graph |
| **Zettlr** | GPL-3.0 | 14k | Markdown/LaTeX writing, Electron |
| **Standard Notes** | AGPL-3.0 | 6.7k | Local-first encrypted notes |
| **Excalidraw** | MIT | 135k | Canvas interaction, freeform reference |
| **tldraw** | Source-available | 51k | Infinite canvas SDK; production license |
| **React Flow** | MIT | 39k | Node/edge canvas baseline |
| **Konva** | MIT | 15k | Canvas scene graph |
| **Typst** | Apache-2.0 | 57k | Paged PDF/typesetting reference; math |
| **oxidize-pdf** | MIT (5.x; older GPL) | 193 | Pure-Rust PDF generation; Zorite uses it |
| **printpdf** | MIT | 1.2k | Rust PDF generation with text shaping/HTML-ish layout |
| **pdf-writer** | Apache-2.0 | 746 | Low-level PDF writing |
| **RaTeX** | MIT | 1.6k | Pure-Rust KaTeX-compatible math to PNG/SVG/PDF |
| **SwiftMath** | MIT | 407 | Native Swift LaTeX rendering |
| **iosMath** | MIT | 1.5k | Native iOS/macOS LaTeX rendering |
| **comrak** | BSD-2-Clause (verify) | 1.7k | GFM parser/renderer in Rust |
| **pulldown-cmark** | MIT | mature | Fast CommonMark parser |
| **markdown-rs** | MIT | 1.6k | CommonMark AST in Rust |
| **syntect** | MIT | 2.5k | Rust syntax highlighting |
| **tree-sitter** | MIT | 27k | Incremental parsing/highlighting |
| **d3-hierarchy** | ISC | 1.3k | Tidy tree layout reference |
| **dagre / elkjs** | MIT / EPL | 5.8k / 2.9k | DAG layout references; not native |
| **petgraph** | Apache-2.0 | 4k | Rust graph structure/algorithms |

**Caveat:** star counts and licenses are point-in-time and must be rechecked before adding a dependency. "MIT/other" means the repository has mixed or unclear licensing; inspect before use.

---

## 11. Migration cost and risk

These are **opinionated estimates** for a small agent team, relative to the current Electron baseline. They exclude product design and UX work.

| Stack | Relative effort | Calendar estimate | Main new work | Biggest risk |
|---|---:|---|---|---|
| **Electron + React (baseline)** | 1.0× | 0 | None; existing plan | DOM performance at 1,000+ nodes; PDF print CSS |
| **Tauri + React + web UI** | 1.3–1.8× | +2–4 weeks | Rust shell, IPC, permissions, packaging; PDF spike | WKWebView PDF/pagination; two engines if Rust PDF |
| **Tauri + Chromium sidecar** | 1.8–2.2× | +4–8 weeks | Sidecar lifecycle, signing, updates, IPC | Reproduces Electron architecture with more moving parts |
| **GPUI + GPUI Kit + Zorite crates** | 2.5–4× | +3–6 months | Rust app, block model, anchors, adaptive paginator, PDF renderer, iPad later | Pre-1.0 API; PDF/pagination; editor maturity |
| **SwiftUI/AppKit + TextKit 2 + PDFKit** | 2.5–4× | +3–6 months | Swift app, block model, adaptive paginator, custom canvas, Markdown/math/code | Language switch; LaTeX/code coverage; no Windows |
| **Qt 6** | 2–3× | +2–5 months | C++/QML app, Markdown/math extensions, adaptive paginator | C++/Qt hiring; license; math |
| **Flutter** | 2–3× | +2–4 months | Flutter app, custom layout/paginator, PDF engine, editor integration | Two-engine PDF; math; desktop polish |
| **egui/Iced/Slint/Freya** | 3–4× | +4–6 months | Almost everything | Maturity; rich text; PDF |
| **Dioxus/Leptos/Wails** | 2–3× | +2–4 months | Web UI + shell; PDF | Same webview/PDF issues |

**Interpretation:** A non-Electron rewrite is not a "swap the shell" task. The shell is maybe 10–20% of the work; the editor, layout, paginator, PDF, and iPad are the rest. That is why Electron remains the baseline: it is not that Electron is technically superior; it is that the product's hardest problems are orthogonal to the shell.

---

## 12. Go/no-go verdict

### GO: Electron remains the v1 baseline

**Opinion:** Keep Electron + React + TypeScript + ProseMirror/TipTap + CodeMirror 6 + KaTeX + React Flow + `printToPDF`. The current plan already chooses the best tool for the hard parts. Spend the saved time on:

- anchor survival and block editing,
- adaptive A4 layout/paginator,
- PDF fidelity and Notability testing,
- performance at 300–500 blocks.

Do not switch shells to chase bundle size. Bundle size is not the product risk.

### NO-GO: GPUI as the v1 primary stack

**Opinion:** GPUI is technically interesting and the ecosystem is better than expected, but it fails the "small team, reasonable timeline, one layout engine, iPad later" test. It would require a Rust rewrite, a custom paginator/PDF engine, a block/anchors layer, and a young editor stack. The 81-star Zorite app and 0.x crates are proof of concept, not a foundation.

**Conditional:** run the 2-week spike in §3.6 only if the team wants a Rust-native future. Do not put it on the critical path.

### CONDITIONAL GO: SwiftUI/AppKit

**Opinion:** If iPad + Apple Pencil becomes co-primary, or if native macOS quality is a hard requirement, SwiftUI/AppKit is the best non-Electron choice. It has stable text/PDF/Pencil APIs and the best long-term Apple path. It is still a 2.5–4× rewrite and a language switch; do not choose it for v1 unless those constraints are real.

### CONDITIONAL GO: Qt 6

**Opinion:** If the team has Qt/C++ experience and wants a single mature engine for rich text + scene graph + PDF, Qt is credible. For a TypeScript/web agent team, it is a poor fit. Licensing must be reviewed.

### NO-GO: egui, Iced, Slint, Dioxus Native, Leptos, Makepad, Xilem, Floem, Freya, Wails

These are either immature, missing rich text/PDF, missing accessibility, webview-only, or require you to build the entire document stack. They are not better than Electron for this product.

### Tauri: only after a PDF spike

**Opinion:** Tauri is a good shell, but it is not a native escape. The only reason to choose it is bundle size/security. If a 1-week spike proves `NSPrintOperation` + CSS paged media produces correct A4 text PDFs (including math/code), Tauri becomes a reasonable alternative. If not, Tauri + Chromium sidecar is Electron with extra steps.

### Decision triggers to revisit

- **iPad/Pencil becomes co-primary:** SwiftUI/AppKit.
- **Bundle size/battery becomes a hard product requirement:** SwiftUI/AppKit (Mac/iPad) or Tauri (if PDF spike passes).
- **Team gains Rust expertise and wants cross-platform native:** GPUI spike.
- **Team gains Qt/C++ expertise:** Qt.
- **Electron DOM fails at 1,000+ visible blocks:** first optimize (LOD/virtualization); then consider a native canvas, not a full rewrite.
- **PDF remains the blocker after 3 weeks:** reassess the PDF architecture before changing UI stacks.

---

## 13. Sources

### GPUI / Zed / GPUI ecosystem

- GPUI docs: https://docs.rs/gpui/latest/gpui/
- GPUI pre-release docs: https://docs.rs/crate/gpui-pre/latest/source/README.md
- Zed software licensing: https://zed.dev/software-overview
- Zed GPUI announcement: https://zed.dev/blog/zed-is-now-open-source
- GPUI examples issue (API drift): https://github.com/zed-industries/zed/issues/46183
- GPUI accessibility issue: https://github.com/zed-industries/zed/issues/41138
- GPUI AccessKit PR: https://github.com/zed-industries/zed/pull/56065
- GPUI Kit: https://gpui-kit.com/docs
- GPUI Kit GitHub: https://github.com/longbridge/gpui-kit
- GPUI Component: https://github.com/longbridge/gpui-component
- GPUI Kit mobile: https://gpui-kit.com/docs/mobile
- gpui-mobile: https://github.com/longbridge/gpui-mobile
- Zorite: https://github.com/packetThrower/zorite
- Zorite docs: https://packetthrower.github.io/zorite/
- Zorite editor: https://packetthrower.github.io/zorite/reference/crates/zorite-editor/
- Zorite Markdown: https://github.com/packetThrower/zorite/tree/main/crates/zorite-markdown
- Zorite PDF viewer: https://packetthrower.github.io/zorite/reference/crates/gpui-pdf/
- Zorite PDF export: https://packetthrower.github.io/zorite/usage/pdf/
- Zorite export source: https://github.com/packetThrower/zorite/blob/main/src/export.rs
- Zorite math: https://packetthrower.github.io/zorite/usage/math/
- ratex-gpui: https://crates.io/crates/ratex-gpui
- RaTeX: https://github.com/erweixin/RaTeX
- ratex-pdf: https://github.com/erweixin/RaTeX/tree/main/crates/ratex-pdf
- Cditor: https://github.com/JYChen-8866/Cditor
- bezel: https://github.com/crabtalk/bezel
- bezel editor docs: https://bezel.gallery/docs/editor.md
- Markion: https://github.com/willmove/markion

### Other Rust UI frameworks

- egui: https://github.com/emilk/egui
- egui 0.37: https://github.com/emilk/egui/releases/tag/0.37.0
- egui accessibility: https://docs.rs/crate/egui/docs/accessibility.md
- Iced: https://github.com/iced-rs/iced
- Iced 0.14: https://github.com/iced-rs/iced/releases/tag/0.14.0
- Iced text editor: https://docs.rs/iced/latest/iced/widget/fn.text_editor.html
- Slint: https://slint.dev
- Slint license: https://github.com/slint-ui/slint/blob/master/LICENSE.md
- Slint pricing: https://slint.dev/pricing
- Dioxus: https://dioxuslabs.com
- Dioxus 0.7 desktop: https://dioxuslabs.com/learn/0.7/guides/platforms/desktop
- Dioxus 0.7 release: https://dioxuslabs.com/blog/release-070/
- Blitz: https://github.com/DioxusLabs/blitz
- Leptos: https://leptos.dev
- Makepad: https://github.com/makepad/makepad
- Makepad 1.0: https://news.ycombinator.com/item?id=43971829
- Makepad book: https://makepad.rs/guide/start/introduction
- Xilem: https://github.com/linebender/xilem
- Floem: https://github.com/lapce/floem
- Floem text editor: https://lapce.dev/floem/floem/views/text_editor/fn.text_editor.html
- Lapce: https://github.com/lapce/lapce
- Freya: https://github.com/marc2332/freya
- Freya 0.4: https://freyaui.dev/posts/0.4
- Tauri: https://tauri.app
- Wails: https://wails.io
- Electron printToPDF: https://www.electronjs.org/docs/latest/api/structures/print-to-pdf-options
- WKWebView createPDF (no pagination): https://stackoverflow.com/questions/70337689/create-pdf-with-wkwebview-pdfconfiguration
- WebKit long-PDF cap report: https://github.com/kashioka/Rendu/issues/57
- Previous Electron/Tauri research: ./landscape.md

### Swift / Qt / Flutter

- WWDC26 TextKit: https://developer.apple.com/videos/play/wwdc2026/370/
- SwiftUI TextEditor: https://developer.apple.com/documentation/swiftui/texteditor
- PDFKit: https://developer.apple.com/documentation/pdfkit
- PencilKit: https://developer.apple.com/documentation/pencilkit
- SwiftMath: https://github.com/mgriebling/SwiftMath
- SwiftMath ADR: https://github.com/humanitas-labs/paper/blob/master/docs/decisions/005-swiftmath-typesetting.md
- iosMath: https://github.com/kostub/iosMath
- MarkdownExtendedView: https://github.com/ChrisGVE/MarkdownExtendedView
- SwiftMarkdownView: https://github.com/SilverMarcs/SwiftMarkdownView
- Qt QTextDocument: https://doc.qt.io/qt-6/qtextdocument.html
- Qt QGraphicsScene: https://doc.qt.io/qt-6/qgraphicsscene.html
- Qt QPdfWriter: https://doc.qt.io/qt-6/qpdfwriter.html
- Qt licensing: https://www.qt.io/licensing
- Flutter: https://flutter.dev
- Flutter appflowy_editor: https://pub.dev/packages/appflowy_editor
- AppFlowy editor GitHub: https://github.com/AppFlowy-IO/appflowy-editor
- Flutter pdf: https://pub.dev/packages/pdf
- flutter_math_fork: https://pub.dev/packages/flutter_math_fork

### Markdown / math / code / PDF libraries

- pulldown-cmark: https://github.com/pulldown-cmark/pulldown-cmark
- comrak: https://github.com/kivikakk/comrak
- markdown-rs: https://github.com/wooorm/markdown-rs
- syntect: https://github.com/trishume/syntect
- tree-sitter: https://github.com/tree-sitter/tree-sitter
- KaTeX: https://katex.org
- MathJax: https://www.mathjax.org
- Typst: https://typst.app
- Typst PDF: https://typst.app/docs/reference/pdf
- oxidize-pdf: https://github.com/bzsanti/oxidizePdf
- printpdf: https://github.com/fschutt/printpdf
- pdf-writer: https://github.com/typst/pdf-writer
- lopdf: https://github.com/J-F-Liu/lopdf
- d3-hierarchy: https://d3js.org/d3-hierarchy
- dagre: https://github.com/dagrejs/dagre
- elkjs: https://github.com/kieler/elkjs
- petgraph: https://github.com/petgraph/petgraph

### Notes/canvas projects

- AFFiNE: https://github.com/toeverything/AFFiNE
- Logseq: https://github.com/logseq/logseq
- Joplin: https://github.com/laurent22/joplin
- AppFlowy: https://github.com/AppFlowy-IO/AppFlowy
- Anytype: https://github.com/anyproto/anytype-ts
- Zettlr: https://github.com/Zettlr/Zettlr
- Standard Notes: https://github.com/standardnotes/app
- Excalidraw: https://github.com/excalidraw/excalidraw
- tldraw: https://github.com/tldraw/tldraw
- React Flow: https://github.com/xyflow/xyflow
- Konva: https://github.com/konvajs/konva
