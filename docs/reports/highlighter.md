# F4b — the highlighter: implementation report

**Role:** Builder
**Worktree:** `t3/highlight-mark-f4b` (this worktree)
**Brief:** `docs/tasks/highlighter.md`
**Design:** `docs/design/highlight.md` §2–§5

## Summary

A stored text highlight is now a canonical inline mark `highlight` with one attribute `tone` ∈
`blue | green | amber | rose`. It is defined in the editor schema and in the core content contract,
it is applied from a four-swatch row in the selection bubble (plus an explicit remove control when
the selection already carries a tone), and `⌘⇧H` applies the session's last used tone or toggles it
off. Continuous renders it as a real `span[data-highlight-tone]` with the live accent/success/warning/
danger tint; Page renders it from `applyMarks` as a background-only span with the fixed light paper
tone; the print compositor uses the same projection and CSS, so the PDF prints the same tint. Nothing
in the paginator, the page model, the print geometry, the seam, zoom, Page Edit or the find changed.
The mark is additive: `schemaVersion` stays 2, unknown tones normalize to the default, and a document
without highlights is byte-unchanged.

## What changed

- **Core contract** (`packages/core/src/highlights.ts`): `HIGHLIGHT_MARK_TYPE`, the four-tone list,
  `DEFAULT_HIGHLIGHT_TONE` (`blue`), `isHighlightTone`, `normalizeHighlightTone`. `types.ts` records
  that marks are open data and the two product marks are `anchor` and `highlight`.
- **Editor schema** (`editor/highlight-mark.ts`): a real ProseMirror mark with one `tone` attribute.
  `parseHTML` reads `span[data-highlight-tone]`, `renderHTML` emits `class="nf-highlight"
  data-highlight-tone`, `inclusive: false` (typing at the right edge never grows a highlight),
  `keepOnSplit: true`. It is registered in `createEditorExtensions`, which is the same list the Page
  Edit overlay mounts, so a commit cannot drop the mark.
- **Applying** (`editor/SelectionToolbar.tsx`, `lib/highlight.ts`, `editor/keymap.ts`):
  four swatches after a divider; the active tone is pressed and a remove control appears first. The
  active tone uses `useEditorState` (TipTap v3 does not re-render on every transaction; a plain
  `isActive` read left the row stale). `⌘⇧H` (`Mod-Shift-h`) applies the session's last tone, or
  unmarks the selection when every selected text node already carries it; a caret and Read mode are
  no-ops. The last tone is renderer module state, never a setting.
- **Page/print rendering** (`page/segments.ts`): one more `applyMarks` case, a `span.nf-highlight`
  with `data-highlight-tone` and nothing else. The tone is normalized so an unknown id renders the
  default instead of dropping the mark.
- **Colours** (`styles.css`): Continuous tints are `color-mix` of the live role (`accent` 20 %,
  `success` 20 %, `warning` 22 %, `danger` 18 %; the text colour is inherited). The paper overrides
  them with the fixed light-theme roles at 28 % over white (`#c5d2de`, `#c5d6ce`, `#ded1b8`,
  `#e5c8c6`), because the paper is always light and Page/print never read the shell accent. Every
  mark rule declares `background-color` only; no padding, border, weight or effect.
- **Settings → Editor**: the shortcut list gains `Highlight — ⌘⇧H` (27 rows).
- **Docs**: the Page and Continuous token docs document the two tone sets and the "background only"
  rule.

## Files changed

- `packages/core/src/highlights.ts` (new), `packages/core/src/index.ts`, `packages/core/src/types.ts`
- `apps/desktop/src/renderer/src/editor/highlight-mark.ts` (new)
- `apps/desktop/src/renderer/src/lib/highlight.ts` (new)
- `apps/desktop/src/renderer/src/editor/extensions.ts`
- `apps/desktop/src/renderer/src/editor/keymap.ts`
- `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx`
- `apps/desktop/src/renderer/src/page/segments.ts`
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`
- `apps/desktop/src/renderer/src/styles.css`
- `docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`
- `packages/core/test/highlights.test.ts` (new)
- `apps/desktop/test/highlight.test.ts` (new)
- `tests/ui/highlighter.test.mjs` (new), `tests/ui/suites.mjs`, `tests/ui/ui-editor-shortcuts.test.mjs`
- `docs/reports/highlighter.md` (this report)

No change to `packages/layout`, `packages/pdf`, the paginator, the print geometry, Page Edit, find,
seam, zoom or page chrome.

## Checks

| Check | Command | Result |
|---|---|---|
| Core + unit | `npx vitest run` | 167 files / 1705 tests pass (6.7 s) |
| Typecheck | `npm run typecheck` | pass |
| Boundaries | `npm run check:boundaries` | pass (287 files, 1385 imports, 16 rules) |
| Highlighter UI | `node --test tests/ui/highlighter.test.mjs` | 5/5 pass (19.6 s) |
| Page group | `node tests/ui/run.mjs --group page --concurrency 2` | 20/20 pass, 165.5 s |
| Shell group | `node tests/ui/run.mjs --group shell --concurrency 2` | 23/23 pass, 229.6 s |
| End of task | `npm run verify:fast` | exit 0 (boundaries, typecheck, 167 unit files, e2e 16/16 in 46.7 s) |

## Acceptance criteria

- [x] Four tones apply and remove from the bubble; `⌘⇧H` applies the last tone and toggles it.
- [x] The mark survives reload, undo/redo (one entry per action), and copy/paste between blocks and
      documents with its tone.
- [x] Deleting the highlighted text removes the highlight with it.
- [x] Continuous and Page show the tint; the Page page count and a known block's card box are
      identical with and without highlights.
- [x] The produced PDF prints the tint; the page count is unchanged; a find highlight never appears
      in it.
- [x] A highlighted word that is also a find match reads as the find.
- [x] Read mode shows highlights and cannot change them.
- [x] A document without highlights is byte-unchanged (`schemaVersion` does not bump).

Evidence: `artifacts/highlighter/` — `continuous-four-tones-1440x900.png`,
`page-four-tones-1440x900.png`, `bubble-active-tone-1440x900.png`, `find-over-highlight-1440x900.png`,
`print-page-tint-150dpi.png`, `highlighter.pdf`, `plain.pdf`, `evidence.json` (page count, tinted
pixel counts per paper tone).

## Decisions and notes

- **Paper blue is fixed, not the shell accent.** `highlight.md` §3 says "accent-light at 28 %". The
  Page/print skin isolates from the accent registry (R3), and the print/measure identity does not
  carry the accent, so the paper uses the light blue accent value `#2f5f8a` at 28 % over white — the
  same visual weight as the other three tones. A shell accent change never changes a saved note's
  printed page.
- **No per-tone keys.** `⌘⇧H` is the only chord; it is a `⌘`+Shift chord (allowed by the shortcut
  rules) and does not collide with any shipped binding (`Mod-Shift-k` is Link, `Mod-Shift-Enter` is
  branch from selection).
- **Guest Markdown files do not get the row.** The flat `.md` schema and serializer are the approved
  guest surface; a highlight there would be silently dropped by the Markdown save, so the swatch row
  is hidden for that variant.
- **Page Edit** renders and preserves the mark (same extensions, same adapter), but this batch does
  not add a selection toolbar to the single-block overlay; applying a tone is a Continuous action.
- **The mark is content, not paint.** It never uses `CSS.highlights` and never reuses the find's
  offset mapping; the find keeps its own transient layer and wins visually (its decoration span is
  inner to the mark span in Continuous, and the highlight registry paints over element backgrounds
  in Page).
- **One stale-row fix was necessary:** the bubble reads the active tone through `useEditorState`,
  because TipTap v3 does not re-render on every transaction by default.

## Risks and follow-ups

- The Continuous tints are deliberately quiet at the design strengths (20/20/22/18 %). On a very
  dark or very light deck they are visible but subtle; if the product owner wants stronger tones that
  is a design-token change (one variable per tone), not a mark change.
- `--nf-page-highlight-*` is a Page-skin colour and is not part of the `pageCssVariables(theme)`
  map, because it is not derived from a `PageTheme` field. It is guarded by the unit test that pins
  the exact 28 % values and by the PDF raster evidence.
- The find count can transiently display the empty set during its 140 ms rescan after a document
  commit. The UI suite waits for the settled count before it takes the find-over-highlight evidence;
  the app's find behaviour itself is unchanged (F4a owns it).
- `tests/ui/highlighter.test.mjs` is in `SERIAL_FILES`: its copy/paste scenarios write the OS
  clipboard, like `markdown-file-view`, so it must not race another clipboard-writing suite.
- No schema migration was needed. A future tone (for example a fifth colour) is additive and renders
  the default until the editor schema and the CSS gain it.

## Next step

Product-owner visual pass over `artifacts/highlighter/` (four Continuous tones, four Page tones, the
bubble with an active tone, the find over a highlighted word, and the printed page). Then the
remaining v1 features outside this batch (P1 Page anchor dot, documentation/release).
