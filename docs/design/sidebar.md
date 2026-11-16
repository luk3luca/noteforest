# Sidebar — one rhythm, one type scale, one scroll

**Status:** approved 16 November 2026; the four open questions are resolved (§10). No code yet.
**Lab:** `docs/design/sidebar-ui-lab/`.
**Owner:** Orchestrator. The Builder brief is written after the lab pass.
**Inputs:** the product-owner review of find v3 (16 November 2026, five findings), `docs/design/find-bar.md`
§3, `docs/design/document-health-sidebar.md`, `docs/design/library-and-documents.md`.
**Scope:** the four sidebar sections (Library, Outline, Health, Search), their headers, their rows,
their scroll behaviour and the activity-bar badge. Not the shell frame, not the Settings dialog.

## 1. The problem, in numbers

Measured on `main` at `341fb53`. The four sections do not share a single value except the panel inset.

| | Library | Outline | Health | Search |
|---|---|---|---|---|
| Row height | 28 | 28 | 30 (section) / 40 (problem) | card ≈ 46 |
| Row text | 12.5 | **13 (inherited from `body`)** | 12 / 10.5 | 11 |
| Row decoration | hover surface, selected accent-soft + inset ring | same | hover surface, selected surface-2 | **1 px border card** |
| Label style | 12.5 switcher | none (chapter 13/500) | 9.5 uppercase + count | none (chapter 9.5 uppercase + count, added in find v3) |
| Section title | switcher 12.5 | 28 px head | 13/600 + 11 summary | 13/600 + 11 count |
| Radius | control | control | 3 | 4 |
| Divider | bottom padding | bottom padding | bottom padding | **border-top on the next header** |

Consequences the product owner reported: the last result card touches the next chapter's rule
(§6.3), a scrollbar appears and the content shifts sideways (§7), the Outline reads as a different
app because it is the only section at 13 px, and collapsible chapters are missing although Health
already collapses (§6).

## 2. Principles

1. **One scroll owner.** `.nf-sidebar-scroll` scrolls; nothing inside it scrolls. Its gutter is
   reserved permanently so content never changes width.
2. **One row ladder.** 28 px for navigation rows, 40 px for two-line problem rows, card height only
   when the row is a result. No section invents a fourth height.
3. **One type scale.** Five values, all through `calc(px * var(--ui-scale))`, no inherited sizes.
4. **Cards mean "result", not "row".** Search occurrences and Health problems are cards. Library
   documents, Outline nodes and section headers are plain rows. A tree of cards is noise.
5. **The group owns its divider and its spacing.** A divider is never a property of the header that
   follows a group.

## 3. The scale

Proposed as tokens in `styles.css` (the same single-source approach as M3h4), so a section cannot
invent a size:

| Token | Value | Used by |
|---|---|---|
| `--sb-title` | `calc(13px * var(--ui-scale))`, 600 | section title (Library switcher, Outline, Health, Search) |
| `--sb-row` | `calc(12.5px * var(--ui-scale))`, 400 | navigation rows: Library document, Outline node |
| `--sb-result` | `calc(12px * var(--ui-scale))`, 400, line-height 1.45 | first line of a result card (snippet, problem quote) |
| `--sb-meta` | `calc(10.5px * var(--ui-scale))`, 400 | second line: meta, reason, count |
| `--sb-label` | `calc(9.5px * var(--ui-scale))`, 600, 0.09em, uppercase | group label (chapter, Health section) |

Heights: `--sb-row-height` 28 px, `--sb-result-height` 40 px (two lines) and auto for cards.
Indents: 0 (section content), 12 (a result card under its group label), 24 (second level).
Radius: 4 px for cards, `--radius-control` for controls. No pill.

## 4. Section header

One pattern for all four sections:

```
[ title 13/600 ............ count 11 text-3 ]  [ up to 2 controls, 28 px ]
```

- 28 px tall, `padding: 2px 6px 4px`, always the first element of a section.
- The count is tabular, `--text-3`, hidden at zero in Library and Outline, **always shown** in Health
  (four sections with `0` is the approved all-clear) and Search (`No results`).
- **Library exception:** its title slot is the library switcher (a 22 px control, 28 px row). The
  switcher is the title: no second title above it.
- No section gets a second header row: a filter or a refresh joins the header's control slot, it does
  not push the content down.

## 5. Rows

**Navigation row** (Library document, Outline node): 28 px, radius control, hover `surface-1` +
`text-1`, selection `accent-soft` + 1 px inset accent ring, `--sb-row`, icon 13, gap 7. Depth step for
the Outline is 12 px per level; the chapter row is level 0.

**Result card** (Search occurrence, Health problem): 1 px `--border-1`, `surface-1`, radius 4,
`padding: 7px 8px`, 3 px gap between cards, `--sb-result` first line, `--sb-meta` second line.
Hover: `border-2` + `surface-2`. Two selection variants, and only two:
- **current** (Search): `accent` border + `0 0 0 1px var(--accent)` ring — the same language as the
  Page block ring;
- **selected** (Health): `surface-2` + `border-2`, no accent.

Health adopts the card and keeps its two lines (quote, then state · block · references). Search keeps
its two-line snippet. Neither invents a third variant.

The card lives in one class, `.nf-result-row`, with the variant as a data attribute:
`.nf-result-row[data-current]` and `.nf-result-row[data-selected]`. `.nf-search-row` and a new
`.nf-health-row-card` add only their own metrics.

## 6. Collapsible groups

Health already does this (`.nf-health-section-row[aria-expanded]`); Search adopts the same control.

1. **Default open**, always. A collapsed-by-default result list shows nothing.
2. **The count stays in the group header** when closed, so a closed group is not a dead end.
3. **Navigating into a closed group opens it** (the toolbar's `↵`/arrows, `⌘G`, or a click on the
   group). Same rule as the Continuous editor expanding a collapsed block.
4. **A new query reopens everything.** The state is per session, not in settings: results are
   transient.
5. **One control, one look:** 30 px row, label 9.5 uppercase, count 10.5 tabular, chevron 16 px on
   the left for Search (matching the Health section row) or on the right — one choice, §10 q3.
6. **ARIA.** The Search results stop being a `listbox`: the container becomes `role="tree"`, each
   chapter a `treeitem aria-expanded aria-level="1"`, each occurrence a `treeitem aria-level="2"`.
   The input stays `role="combobox"` and keeps `aria-activedescendant` → the current occurrence, which
   a tree allows (a listbox did, but a disclosure button inside a listbox is invalid). Health has no
   activedescendant, so it keeps its plain buttons.

## 7. Scroll

- `.nf-sidebar-scroll` is the only scroll owner: `overflow-y: auto`, `overflow-x: hidden`.
- `scrollbar-gutter: stable` on it. The application styles a 10 px classic scrollbar globally, so any
  section that overflows currently loses 10 px of content width and everything shifts. With a
  permanent gutter the content box is fixed: 264 − 8 − 8 − 10 = 238 px at the default width, always.
- The reserved gutter is **invisible**: only `::-webkit-scrollbar-thumb` is painted, the track is
  transparent, and the thumb exists only while the content actually overflows. Nothing is drawn when
  there is nothing to scroll; the space is simply reserved, so the content never moves.
- The gutter is part of the measured content width (`sidebarContentWidth` in `shared/shell.ts` must
  account for it, or the panel keeps reporting 10 px more than it has).
- No inner scroll containers. A long Health list scrolls the panel, not the section.

## 8. Activity-bar badge

The needs-repair counter becomes a **dot**, not a number.

- 6 px circle, `--danger`, `top: 4px; right: 4px` inside the 28 px button, no ring, no text.
- Absent at zero: no empty box, no outline, nothing.
- The count moves to `aria-label` and `title` (`3 blocks need repair`), so VoiceOver and the tooltip
  keep it. The Health header carries the exact number.
- A dot is not a pill: it is a status dot, not a text chip.

## 9. What changes

- `styles.css`: the `--sb-*` tokens, the `.nf-result-row` variants, the section header pattern, the
  divider rule moved from the header to the group, `scrollbar-gutter`, the badge dot, the Outline's
  inherited 13 px → `--sb-row`, Health's 3 px radius → 4 and its row padding onto the card.
- `shared/shell.ts`: the gutter in the content-width model, plus its unit test.
- `Sidebar.tsx`, `SearchSection.tsx`, `HealthSection.tsx`: the shared header, the Search tree, the
  collapse state, the dot.
- `docs/design/find-bar.md` §3 and `docs/design/document-health-sidebar.md` §2: the row and header
  rules point here instead of restating them.
- Guard test: `tests/ui` or a CSS test asserting the sidebar selectors only use the `--sb-*` tokens
  (no literal `font-size` in a sidebar rule), so the drift cannot come back.

No behaviour change except the collapse: every query, count, navigation and repair path stays as it is.

## 10. Resolved decisions (16 November 2026)

1. **Result text is 12 px.** Clearer snippets and one scale with Health; about one fewer row visible in
   a 264 px panel, accepted.
2. **Outline depth step is 12 px, capped at 3 levels.** Level 4 and deeper render at the level-3
   indent; the chevron carries the rest.
3. **The group chevron is on the left**, one choice for Health and Search.
4. **The library switcher stays in the title slot.** No "Library" title above it.
5. **The needs-repair counter becomes a dot** (§8 is in scope for this batch, not a separate fix).

## 11. Out of scope

The shell frame, the tab bar, the Canvas/Page chrome, the Settings dialog, the editor body, the find
engine, any schema or settings change, and the code palette (separate decision).
