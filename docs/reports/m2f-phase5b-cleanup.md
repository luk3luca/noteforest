# M2f phase 5b — Cleanup report

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-df577bef`  
**Branch:** `t3/m2f-phase5b-cleanup`  
**Base:** `2b0671a` (`main`: docs: start M2f phase 5b cleanup)  
**Scope:** F12–F15/F19 cleanup only. No behavior change, no M3/page/PDF, no new native dialogs.

## Commits

- `368598b` refactor: remove dead exports and share core structural helpers
- `97dd9bc` chore: prune unused dependencies and pin one katex
- `9e4ffe0` fix(fixtures): restore anchor selectors and validate every fixture
- `c7d08d2` test: move backup restore flows out of the critical editor suite
- `88c6cab` docs: align M2f cleanup status, stack, fixtures and gates
- docs commit (this follow-up): README/plan/report timings

## Verdict

The reviewed dead code, unused dependencies, fixture validity, Spike tooling separation, and doc
drift are cleaned up. The backup-restore e2e flows moved to the recovery suite so the critical
editor suite is back under its 60 s budget. `npm run verify` passes: typecheck, 241/241 unit tests
(27 files), 23/23 critical e2e, 13/13 recovery/backup, 1/1 view UI. No product behavior or test
coverage was removed.

## 1. Dead code and duplication

Removed (verified with `grep -rn` across `apps`, `packages`, `tests`, `scripts`):

- `useContentReady` (`useBlockRects.ts`) — no caller; also removed the now-unused `useEffect` import.
- `EDGE_CONSTANTS` (`EdgeLayer.tsx`) — alias of `GEOMETRY` with no reader.
- `recordActiveScroll` / `applyDocumentCommand` (`actions.ts`) — unreachable; the runtime command
  layer is used directly.
- `openBlockActions` — duplicate of `openBlockMenu` in the editor bindings and its only assignment.
- `removeTab` in the shell store — separate from `closeTab`, never called.
- `ConfirmChoice` type — no reference.
- `onRequestFocusBlock` preload bridge and API type — no main-process sender or renderer listener.
- Write-only `selectedBlockByDoc` / `setSelectedBlock` — no reader; `runtime.selectedBlockId` remains
  the selection source. Removed the four writes in actions, palette, and editor selection sync.
- `ContextMenu` dead `const item`/`void item` pair.
- `positionInSiblings`, `cardMaxWidth`, `cardMinWidth`, `compareOrder`, `placementOf` — no callers.
- `packages/pdf/src/atomicFile.ts` — duplicate unused atomic writer; the core node writer stays the
  only atomic implementation. Removed its export from `packages/pdf/src/node.ts`.
- `packages/core/src/history.ts` — decision: **remove**. Phase 3a/3b adopted renderer-level routed
  undo (text stack + structural inverse stack); the core snapshot class was used only by two core
  tests. Removed the export, the two tests, and updated the core README/M2a report.
- `currentWordCount` now uses `countWords`/`blockCount`; the private duplicate `collect` helper is
  gone.

Renderer/core duplication collapsed: `apps/desktop/src/renderer/src/lib/tree.ts` now imports
`directChildBranches`, `directChildIds`, `primaryParentBranch`, `subtreeBlockIds`, and
`chapterIdForBlock` from `@noteforest/core/structure.ts`. It keeps only renderer projections
(chapter trees, titles, collapse-aware order, edge descriptors) and is documented as such.

Kept on purpose: M4 layout/paginator/router code and tests, fixtures, Spike evidence, validation,
security, accessibility, and data-safety paths. `routeBranchEdge`/`pathMovesForward` remain
test-exercised pure routing helpers rather than app imports; they do not change runtime behavior.

## 2. Dependencies

Removed direct dependencies (all verified unused):

`@tiptap/extension-bubble-menu`, `class-variance-authority`, `clsx`, `highlight.js`,
`tailwind-merge`, `tw-animate-css`, `@types/katex`.

- `highlight.js` remains transitively through `lowlight`/`@tiptap/extension-code-block-lowlight`;
  nothing imports it directly.
- **KaTeX:** pinned `0.18.10` → `0.18.11`, matching the TipTap math peer range. `0.19.0` is not in
  the peer range (`^0.16 || ^0.17 || ^0.18`), so it was not adopted. `npm ls katex` now shows one
  copy at `node_modules/katex@0.18.11`; inline/display math is covered by the existing editor/e2e
  tests and the fixture math.
- **pdfjs-dist:** both declarations are pinned to `6.5.438`; `npm ls` shows one installed copy
  (`@noteforest/pdf` deduped to the root). The root dev dependency serves Spike scripts, the package
  dependency serves `verifyPdf`; the version is single.
- **lowlight:** kept `common` (37 languages) and accepted its bundle cost. The editor has no
  language picker; new code blocks are `plaintext`, while imported documents may carry any language
  attribute, so pruning would silently change highlighting. Recorded below.
- Added `engines.node >= 22.0.0`; added a root `dev` script so the documented `npm run dev` exists.
- No lint/CI added (explicitly optional in the brief); recorded as a gap.

### Bundle (renderer)

| Artifact | Before | After | Delta |
|---|---:|---:|---:|
| JS | 3,560,880 B (3.49 MiB) | 3,561,774 B | +894 B (+0.03%) |
| CSS | 106,958 B | 106,958 B | 0 |
| Assets directory | 4.9 MB | 4.9 MB | 0 (fonts/glyphs) |

The JS delta is the KaTeX patch; dead-code removal is tree-shaken. `MODULE_LEVEL_DIRECTIVE`
warnings from bundled dependencies (`sonner`, TipTap, `react-resizable-panels`, `lucide-react`)
remain and are accepted as dependency noise, not app code.

## 3. Fixtures and Spike tooling

- `scripts/generate-fixtures.mjs` now emits a kind-specific `selector` object for every anchor
  (quote/prefix/suffix, formula quote, code token/line) and `mime: image/png` for assets.
- Regenerated all ten fixtures; only the selector/mime fields changed (assets byte-identical).
- Added `packages/core/test/fixtures.test.ts`: every `fixtures/*.json` is parsed with
  `parseDocumentJson` and must validate. 10/10 pass.
- `gates`/`gates:summary`/`pdf:verify`/`pdf:raster` renamed to `spike:gates`,
  `spike:gates:summary`, `spike:pdf:verify`, `spike:pdf:raster`; script headers and the Spike report
  now say they are Spike-only and not M2/M3 gates.
- `docs/spikes/artifacts` and the M4 paginator/router tests are untouched.

## 4. Docs consistency

- **README:** root `npm run dev` now exists; commands include `test:ui`; M2f 5a/5b report links;
  current stack (React Aria/Tailwind/KaTeX/lowlight; CodeMirror later, React Flow not used); Spike
  harness status and `spike:*` names.
- **AGENTS:** current phase is 5b awaiting re-review; stack line matches ADR-0004; docs map includes
  `docs/reviews/` and `docs/reports/`; repo layout says `apps/desktop` is the editor shell,
  `packages/core` exists, `packages/api` is not scaffolded.
- **plan:** stale `(current)` labels removed; M2/M2f status and gate updated; M0 spec v0.4.4; phase
  5b summary recorded.
- **ux-shell:** leftover depth-column language replaced with parent-relative placement/horizontal
  scroll.
- **ADR-0004:** body note says later addenda supersede Source Serif, Cmd+Enter/Tab-create, and
  flex-wrap columns (M2c/M2d/M2e).
- **DoD + review checklist:** spec v0.4.4, current gate M2f 5b re-review, M2 acceptance pending.
- **M2d report:** superseded-by-M2e/D23 banner.
- Core README and M2a report note the removed `DocumentHistory`.

## 5. Gates

The critical suite keeps one test per lifecycle/data-safety flow. The three backup-restore flows
moved to `tests/recovery/m2f-backup-restore.test.mjs`; `npm run test:recovery` runs both recovery
files and `verify` includes them, while `verify:fast` keeps only the critical e2e suite.

| Command | Result |
|---|---|
| `npm run typecheck` | Pass — desktop node/web, core, layout, pdf |
| `npm test` | Pass — 241/241, 27 files, 1.85 s |
| `npm run e2e` | Pass — 23/23 critical; suite 48.66 s (wall 56.80 s incl. build); no fixed sleeps |
| `npm run test:ui` | Pass — 1/1, 9.13–9.41 s |
| `npm run test:recovery` | Pass — 13/13 (10 recovery + 3 backup); backup suite 9.97 s; total 19.08 s |
| `npm run verify` | Pass — exit 0, 91.55 s wall |
| Fixture validity | Pass — 10/10 fixtures |
| Native dialogs / screen recording | None added, none used |

### Follow-up: critical e2e budget

| Phase | Critical tests | Critical suite | Recovery/backup |
|---|---:|---:|---:|
| Before this follow-up | 26 | 64.72 s (`e2e`), 66.29 s (warm), 57.98 s (`verify`) | 10 tests, 19.05 s |
| After the split | 23 | **48.66 s** (`e2e`), **48.68 s** (`verify`) | 13 tests, 19.08 s |

Moved with every assertion intact:

- valid backup list, newest-first ordering, and restore as a new copy;
- no-valid-backup empty state (including invalid-only backups);
- existing, outside-library, read-only, and native-Cancel restore destinations.

The failed-save quit guard and the core save/undo tests stay in the critical suite. The new file
uses the same Electron harness and the existing native-dialog mocks; no product behavior or fixed
sleep changed.

The lifecycle test was reviewed for a redundant relaunch. It performs one relaunch because the
restore-after-relaunch assertion *is* its coverage; the scroll/focus test uses a different document
and environment. Merging them would entangle two flows without removing an app launch, so the test
is left unchanged (7.24 s in the final run).

## 6. Known gaps

- Lowlight `common` remains a large part of the 3.56 MB JS bundle; accepted rather than pruned.
- Build still emits dependency `MODULE_LEVEL_DIRECTIVE` warnings.
- No lint/format script or CI config; explicitly out of scope for this cleanup.
- `routeBranchEdge`/`pathMovesForward` are exported test helpers in the routing module; they are not
  imported by the app.
- KaTeX 0.19.0 should be revisited when `@tiptap/extension-mathematics` widens its peer range.
- pdfjs is declared by both root scripts and `packages/pdf` at the same pinned version; this is one
  installed copy, not a duplicate install.

## Next step

Sentinel re-review of phase 5b, then the product-owner VoiceOver/visual pass and M2 acceptance.
M3 and PDF/page work remain blocked until M2f is accepted.
