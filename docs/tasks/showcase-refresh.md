# Showcase refresh — plan (post special-text)

**Role:** Orchestrator (data edit; not product code)
**Target:** `~/Documents/NoteForest/note-forest-showcase/document.json`
**Run after:** the special-text batch is merged and verified (the tutorial must describe the shipped
behaviour, not the design).
**Constraint:** user data, schema v2, no new document features; back up first; validate before writing.

## Goal

Turn the showcase into a **self-tutorial**: every chapter that introduces a feature has a tree of
children/grandchildren that the reader can open, and the new features (R4 export, R5 editor
shortcuts, R6 Continuous settings, settings/shell, Backspace, library/drafts/trash) are demonstrated
with a table, a code block, or a formula where they belong.

## Current state (measured)

- 10 chapters, 83 blocks, 48 branches, 18 anchors; 7 tables, 3 code blocks, 2 inline + 2 block
  formulas, 2 images.
- The deep chapter already has 5 levels (`show-deep-t1 → c1 → g1 → gg1 → ggg1`), plus anchor
  callouts. The rest of the document is mostly flat (top-level blocks with no children).
- Stale: `show-t9` shortcuts, `show-t15` code, `show-t16` tables, `show-t14` formulas, `show-t25`
  tokens, `show-t27` roadmap, `show-t28` backlog, `show-t24` limits.
- Missing: library/drafts/trash, settings pages, export PDF, the two-page preview, Backspace.
- Image blocks (`show-img-*`) have no `label` field.

## Chapter map

| # | Chapter | Change |
|---|---|---|
| 00 | Prova rapida | update the checklist; child “Come usare questa nota” with a chapter → try table |
| 01 | Benvenuto | unchanged |
| 02 | La struttura | add grandchildren under `show-d7`/`show-d8` |
| 03 | La foresta profonda | unchanged (already 5 levels) |
| 04 | Layout e modalità | update; add the Settings rail/two-page preview block |
| 05 | L’editor | update shortcuts (Backspace), autosave/drafts; children per group |
| 06 | Contenuto ricco | formulas/code/tables tutorials; images become children of `show-t17` |
| 07 | Anchor e reference | update limits |
| 08 | Libreria e documenti | **new** |
| 09 | Impostazioni | **new** |
| 10 | Export PDF | **new** |
| 11 | Design e roadmap | update tokens/roadmap/backlog |

## Tree additions (arrows)

- `show-d7 → show-d7a → show-d7a1` (new grandchild) and `show-d8 → show-d8a`.
- `show-t9` (keyboard) → `show-key-nav` (navigation) and `show-key-edit` (editing, Backspace).
- `show-t14` (formulas) → `show-f-inline`, `show-f-block`.
- `show-t15` (code) → `show-c-states` (idle/hover/editing fences), `show-c-lang` (language label).
- `show-t16` (tables) → `show-tb-create` (N×M, typed, paste), `show-tb-edit` (toolbar, Tab, Enter,
  copy, scroll).
- `show-set-t1` (settings map) → `show-set-c1..c6` (Appearance, Continuous, Page, Editor, Export,
  Data & About).
- `show-lib-t1..t3` → one child each (files, drafts, trash).
- `show-exp-t1` → `show-exp-d1` (what it exports), `show-exp-d2` (where/how).
- `show-test-checklist` → `show-guide` (how to use the showcase).

Orders use `orderBetween` from `@noteforest/core`, appended after the last sibling of the same
source/anchor/role.

## New and updated blocks

| Block | Kind | Content |
|---|---|---|
| `show-test-checklist` | update + child | 10-step checklist with the new features |
| `show-guide` | new (child) | table: chapter, what to try |
| `show-d7a1`, `show-d8a` | new | short grandchild texts |
| `show-layout-t4` | new | “La preview in Impostazioni”: rail, two stacked pages, 1180×820 |
| `show-t8` | update | sidebar tabs, library/outline, settings rail |
| `show-t9` | update | full shortcut table |
| `show-key-nav`, `show-key-edit` | new | navigation shortcuts; Backspace stays in the block, ⌘Backspace deletes |
| `show-t10` | update | drafts materialize on first edit, banners |
| `show-t12` | update | 300/1,000 targets and the measured gate |
| `show-t14` | update | `$…$` / `$$…$$`, click selects, double-click inline source |
| `show-f-inline`, `show-f-block` | new | inline and block examples + how to edit |
| `show-t15` | update | fence states, language label, colours, PDF neutral; keep the anchored code block untouched |
| `show-c-states`, `show-c-lang` | new | idle/hover/editing; language in the fence |
| `show-t16` | update | table tutorial overview; keep the existing table |
| `show-tb-create`, `show-tb-edit` | new | N×M / typed / paste; toolbar, Tab, Enter, copy, inner scroll; a demo table with alignment |
| `show-t17` | update + children | images move under t17 (`show-img-t1..t3`), labels added |
| `show-t24` | update | current limits: table inner scroll, cell inline-only, neutral PDF code |
| `show-lib-t1..t4` | new | active library, recents/switch, drafts, rename/trash/session |
| `show-set-t1` | new | settings map table |
| `show-set-t2` | new | instant save, footer status, no Apply |
| `show-set-c1..c6` | new | Appearance, Continuous, Page, Editor, Export, Data & About |
| `show-exp-t1..d2` | new | export PDF: Page Read, real text, neutral code, default folder |
| `show-t25` | update | current token docs split (Page/Continuous/shared) |
| `show-t27` | update | R4, R6, settings/shell done; special text next |
| `show-t28` | update | remove the formula input-rule backlog item (shipped) |
| `show-t30` | update | “questa nota è una demo” with the new tree |

Anchored blocks (`show-t1`, `show-t3`, `show-t5`, `show-t6`, `show-t7`, `show-t14`, `show-t15`,
`show-deep-t1`, `show-deep-g3`, `show-img-t1`, `show-layout-t1`) keep their anchored words and
ranges; updates append paragraphs or use new child blocks. No anchor is removed or moved.

## Safety and sequencing

1. **Wait** for the special-text merge + full verify.
2. **Close NoteForest** (or at least the showcase tab) before writing: the showcase is open in the
   session and the app treats external writes as conflicts. This is a manual product-owner step.
3. **Backup** the whole package to `artifacts/showcase-backup-<timestamp>/` (document.json + assets).
4. Build `packages/core` to `dist`, run the transform script with `parseDocumentValue`,
   `stringifyDocument`, `orderBetween`, and the custom checks; write atomically
   (`document.json.tmp` → rename), `revision + 1`, `updatedAt = now`.
5. **Validate**: unique block/branch/anchor ids; every chapter top-level id exists; every branch
   source/target exists; no duplicate `(source, anchor, target)`; primary acyclic; anchors resolve to
   the source block and to a mark/attr; `order` unique per source/anchor/role; no orphan blocks;
   table cells inline-only; code blocks have a language; no unknown node types beyond the current
   set.
6. Reopen the app, open the showcase, screenshot Continuous and Page, check the outline and the
   arrows.

## Acceptance

- The showcase opens with no validation error; the outline shows the new chapters and children.
- The deep tree and the new tutorial trees render children/grandchildren arrows; no clipped labels.
- Code, tables and formulas demonstrate the shipped behaviour; the tutorial text matches it.
- Existing anchors and callouts still resolve; no broken/ambiguous anchor is introduced.
- The document keeps `schemaVersion: 2`; no setting or product file changes.

## Out of scope

- Product code, settings, Page/PDF changes.
- New document features (manual breaks, merged cells).
- A second showcase document; the existing one is updated in place.

## Open questions

- Chapter names: “Libreria e documenti”, “Impostazioni”, “Export PDF” are fine?
- Move the Images blocks under “Contenuto ricco” (my plan) or keep the Images chapter?
