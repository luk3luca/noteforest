# V1-candidate Sentinel — full review before release

**Role:** Reviewer / Sentinel
**Target:** `main` at `a3febfb` (F4a, F4b, B1, B2, P2 merged; full verify green)
**Worktree:** created by the Orchestrator, branch `t3/v1-sentinel`.
**Timebox:** 8 hours.
**Output:** `docs/reviews/v1-candidate-review.md`, one commit, no code changes.

## What this is

The last independent judgement before tagging v1: is this codebase shippable, and what exactly must be true
at the moment of the release? You are not reviewing one batch; you are reviewing the **candidate**, with a
deep dive on the five batches that landed after the last full-codebase review:

- **F4a** find in Page (`docs/reports/find-page.md`) — CSS Custom Highlight paint over the mounted pages.
- **F4b** highlighter (`docs/reports/highlighter.md`) — the `highlight` mark, bubble swatches, `⇧⌘H`, print tones.
- **B1** v1 defects (`docs/reports/b1-defects.md`) — anchor dot, print-free page, the shortcut catalogue.
- **B2** contrast (`docs/reports/b2-contrast.md`) — the code-theme registry with own surfaces, edge contrast.
- **P2** release polish (`docs/reports/p2-polish.md`) — bubble gate, `⌘P`, Edit → Find, rich-cell rows, `⇧Esc`, suite waits.

## Ground truth

- Read `AGENTS.md`, `docs/spec.md`, `docs/ux.md`, `docs/ux-shell.md`, `docs/review-checklist.md`,
  `docs/definition-of-done.md`, `docs/plan.md` (known issues and open decisions).
- The Orchestrator's authoritative run is the one to trust for "does the suite pass": `npm run verify` at UI
  concurrency 4 on an idle machine, **exit 0**, 170 unit files / 1743 tests, e2e 16, recovery 14, UI 69/69
  (353.8 s). **Do not re-run `npm run verify`.** Run targeted probes to confirm specific claims.
- The release itself is not configured yet (no `electron-builder` target, no `.icns`, version `0.0.0-m2.2`):
  that is an Orchestrator item, not a finding against the code. List what must be true before tagging.

## What to judge

### 1. Data safety (S1 candidates)

- Save coordinator + repository: can a write be lost, duplicated, or land on a stale document? Draft →
  materialize → save, conflict/stale-lock, backup rotation, atomic temp→rename.
- Byte-identical guarantees: a document without highlights (F4b) and with a rich table cell (VH1/P2) must not
  be rewritten by open/close; a corrupt/unreadable note or settings file must never be overwritten silently.
- The rich-cell judgement now lives in core and the **loader** still refuses before `repository.open`:
  confirm with the code path, not the report (no lock, no migration, no write).
- Settings: additive `codeTheme` (B2) inside `settingsVersion: 5`, unknown values, corrupt recovery, unknown
  keys preserved. A settings write must not drop a document map.

### 2. The Page/print seam

- Find paint (F4a) never touches the measured DOM, follows the mounted window, and the print model is
  identical with the find open or closed.
- The anchor dot and the print-free page (B1/P2): no `data-page-anchor-warning`, no anchor flag, no marker
  text in the print DOM or the produced PDF, while every other parity record is asserted.
- The highlighter (F4b): background-only marks in Page/print, page count and card box identical, paper tones
  fixed, Page/PDF never read the shell code theme (B2).
- Edge contrast B2: no fade left, Page edges untouched.

### 3. The keyboard and the menus

- One catalogue (`lib/shortcuts.ts`) asked by `App`, `PageView`, `FindBar`, the keymap, the palette hints, the
  tooltips, the menu accelerators and the Settings list; no second chord writer; the menu/catalogue equality
  test is real.
- The recent changes: `⌘P` (no `⇧⌘E` left anywhere user-visible), Edit → Find items gated behind a modal,
  `⇧Esc`, the bracket keys by `event.code`, and the Page `⌘↑/⌘↓` vs `⌥↑/⌥↓` scopes.
- The Settings shortcut list tells the truth: open it and spot-check five rows against the app.

### 4. Editor and content

- The `highlight` mark is additive: an old document opens unchanged; an unknown tone degrades; Page Edit
  keeps the mark; paste across documents keeps the tone; deleting text deletes the mark.
- The find/highlighter precedence, the selection bubble behind a modal, and the Markdown guest-file boundaries
  (no Highlight UI, no Page, no forest commands).
- Tables: inline-only cells, the rich-cell refusal, typed/pasted GFM.

### 5. Library, assets, files

- The vault scan (rich-cell rows now), move/trash reconciliation, `libraries.json` recents, path confinement
  (asset store, library ops, OS Trash), and the Markdown guest-file save/conflict flow.
- The packaged runtime: `pdfjs-dist` included, no Node in the renderer, CSP, preload surface.

### 6. Tests and the harness

- Are the new suites real (assertions that would fail on a regression) or tautological? Spot-check the
  F4a/F4b/B1/B2/P2 tests against their acceptance lists.
- The two intermittents P2 touched: read the new condition waits; do they wait on the effect (yes/no) or
  merely longer? Would they catch the original failure?
- Any `pageErrors` swallowed, retries, or sleeps hiding a product race?

### 7. Docs

- `AGENTS.md`, `docs/plan.md`, `docs/ux.md` §9 and the screen inventory, `docs/ux-shell.md`, the design docs
  B2 touched, and the reports: do they describe the shipped app? Flag contradictions, not style.
- The known issues list: is anything in it actually an S2? Is anything missing from it?

## Out of scope

- Re-running the full verify; re-reviewing accepted historical milestones (M3/M4) beyond their interfaces;
- Fixing anything (you do not edit code, tests, spec, UX, ADR or plan);
- The release mechanics (icon, electron-builder, version, dmg) — list them as gate items only.

## Report format

`docs/reviews/v1-candidate-review.md`:

1. **Verdict** — accept / accept with findings / request changes, and whether anything blocks the tag.
2. **Findings** — S1 (data loss, security, crash), S2 (user-visible defect), S3 (maintainability/drift),
   S4 (nit). Each with `file:line`, the failure scenario, the evidence command or screenshot, and the
   smallest honest fix. No finding without evidence.
3. **Batch acceptance audit** — F4a, F4b, B1, B2, P2: criterion → pass/fail → evidence, where "pass" means
   you checked it, not that the report says so.
4. **Release gate table** — every item that must be true at tag time (code, docs, packaging, version,
   smoke), with Pass / Fail / Not-run / Owner. Be explicit about what you did not verify.
5. **What I would not ship** — if nothing, say so plainly.

You may add a line to `docs/review-checklist.md` or `docs/definition-of-done.md` if the review exposes a
missing gate rule. Nothing else outside `docs/reviews/`.
