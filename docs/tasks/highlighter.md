# F4b — the highlighter

**Role:** Builder
**Milestone:** highlighter (last v1 feature)
**Base:** `main` at launch, after F4a has merged (it reuses F4a's mapping).
**Worktree:** created by the Orchestrator, branch `t3/highlighter`.
**Timebox:** 5 hours.

## Context

The find paints a transient layer; this batch adds the permanent one. The design is
`docs/design/highlight.md` §2–§5. The product owner has decided: **four tones**, deleting the highlighted
text removes the highlight, it **exports to PDF**, and when a highlighted word is also a find match the
**find wins visually**.

## Goal

A selection can be highlighted in one of four tones from the inline toolbar (and `⌘⇧H`), the mark survives
edits, undo, reload and copy/paste, it renders in Continuous and Page, and it prints in the PDF — without
moving a single page.

## In scope

1. **The mark.** `type: 'highlight'`, attribute `tone` ∈ `blue | green | amber | rose`. Inline only. Add it
   to the editor schema **and** to the core content schema in the same commit, otherwise ProseMirror would
   drop it on the next edit. No id, no comment, no metadata.
2. **Colours** per `highlight.md` §3: a background tint only, in both fields; the text colour never
   changes; on paper the light tones are used because the paper is always light.
3. **Applying and removing.** The selection bubble gains four swatches; when the selection already carries
   a tone the row shows the active one pressed plus a remove control. `⌘⇧H` applies the last used tone and
   toggles it off when the selection is uniformly that tone; the last tone is session state.
   Read mode: visible, not editable.
4. **Rendering.** Continuous: a span with `data-highlight-tone` from the mark. Page: one more case in
   `applyMarks`; **background only**, no padding, no border, no weight, so the measurement cannot move.
5. **Print.** The print model carries the mark classes and the paper tones, so the PDF prints the tint.
   Verify the produced PDF: the tint is present and the page count is unchanged.
6. **Versioning.** Marks are not whitelisted, so this is **additive** and `schemaVersion` does not bump.
   Two tests pin it: a document without highlights opens byte-unchanged, and one with highlights reopens
   with them.

## Out of scope

- Notes, comments or any text annotation; tone customisation; a highlighter panel or a sidebar list.
- Highlighting images, formulas or whole blocks: the mark is on text.
- The find (F4a owns it), the paginator, the page chrome, the seam, the zoom, Page Edit's geometry.
- Any change to the selection bubble's existing actions beyond adding the swatch row.

## Files

Read: `docs/design/highlight.md`, `editor/SelectionToolbar.tsx`, the editor schema and the core content
schema, `page/segments.ts` (`applyMarks`), the print model builder, `docs/design/copy-plan.md` (the tone
labels, if the bubble needs one).

Expected to touch: the core content schema, the editor schema, `editor/SelectionToolbar.tsx`,
`editor/find-decorations.ts` or a sibling for the mark class, `page/segments.ts`, the print model,
`styles.css` (editor and page scopes), the keymap, the tests, `docs/reports/highlighter.md`.

## Acceptance criteria

- [ ] Four tones can be applied and removed from the bubble; `⌘⇧H` applies the last tone and toggles it.
- [ ] The mark survives reload, undo/redo (one entry per action) and copy/paste between blocks and between
      documents, keeping its tone.
- [ ] Deleting the highlighted text removes the highlight with it.
- [ ] Continuous and Page both show the tint; the Page's page count and a known block's measured box are
      identical with and without highlights.
- [ ] The produced PDF shows the tint; the page count is unchanged; a find highlight never appears in it.
- [ ] A highlighted word that is also a find match reads as the find, not as the highlight.
- [ ] Read mode shows highlights and cannot change them.
- [ ] A document without highlights is byte-unchanged by the update (`schemaVersion` does not bump).

## Tests and evidence

- Unit: the mark round-trips through save/load; a v2 document without highlights is unchanged; tones are
  validated (unknown tone → the default, never a crash).
- UI: apply/remove each tone; reload; undo; copy between blocks; delete the text; Page render; print model;
  the find-on-top case; Read gating.
- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group page --concurrency 2`, `--group shell`.
- End of task: `npm run verify:fast`. Do not run `npm run verify`.
- Screenshots under `artifacts/highlighter/`: the four tones in Continuous, the same in Page, the bubble
  with a tone active, the printed page with a tint, and a highlighted word inside a find match.

## Stop and ask

- if adding the mark requires a `schemaVersion` bump (say what breaks without it);
- if the Page Edit overlay drops the mark on commit;
- if the print model cannot carry the tone without touching geometry;
- if `⌘⇧H` collides with an existing shortcut.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, risks, next step. One commit; do not
merge.
