# S1 — Sidebar system: one rhythm, one type scale, one scroll

**Role:** Builder
**Milestone:** post-copy sidebar pass
**Base:** `main` at launch (the docs commit that adds this brief).
**Worktree:** created by the Orchestrator, branch `t3/sidebar-system`.
**Timebox:** 3 hours.

## Context

The four sidebar sections share no value except the panel inset: Library rows are 12.5 px, Outline rows
inherit 13 px from `body`, Health rows are 12/10.5 with radius 3, Search rows are 11 px cards with
radius 4; headers differ, dividers belong to the header that follows a group, and a 10 px classic
scrollbar shrinks the content whenever a section overflows. The design, the measurements and the
approved decisions are in `docs/design/sidebar.md` (approved 16 November 2026) and
`docs/design/sidebar-ui-lab/`.

## Goal

The four sections read as one surface: one header pattern, one row ladder, one five-value type scale,
one scroll owner with a reserved invisible gutter, collapsible Search chapters, Health on the result
card, and a dot instead of the needs-repair counter.

## In scope

### 1. Tokens and scale

Add to `styles.css` (near the other design tokens), all through `calc(px * var(--ui-scale))`:

| Token | Value |
|---|---|
| `--sb-title` | 13 px, weight 600 |
| `--sb-row` | 12.5 px, weight 400 |
| `--sb-result` | 12 px, weight 400, line-height 1.45 |
| `--sb-meta` | 10.5 px, weight 400 |
| `--sb-label` | 9.5 px, weight 600, letter-spacing 0.09em, uppercase |
| `--sb-row-height` | 28 px |
| `--sb-result-height` | 40 px |

Every sidebar rule uses them. No literal `font-size` value inside a sidebar selector; the Outline's
inherited 13 px becomes `--sb-row`.

### 2. Section header

One pattern for Library, Outline, Health and Search: 28 px row, `padding: 2px 6px 4px`, title
`--sb-title` in `--text-1`, count 11 px tabular in `--text-3`, controls 22 px.
- **Library:** the switcher stays in the title slot; no second title above it.
- **Health:** the refresh control stays **next to the filter field** in the filter row (approved in
  S2.1) — it does not move into the header. The header carries `Health` and the summary count only.
- Search's `ab` toggle and close stay in its header, after the count, as today.

### 3. Rows

- **Navigation row** (Library document, Outline node): `--sb-row-height`, radius `--radius-control`,
  hover `--surface-1` + `--text-1`, selected `--accent-soft` + 1 px inset `--accent` ring.
- **Outline:** depth step 12 px, **capped at 3 levels** — level 4 and deeper render at the level-3
  indent. The chapter row is level 0.
- **Result card** (Search occurrence, Health problem): the shared `.nf-result-row`, 1 px `--border-1`,
  `--surface-1`, radius 4, `padding: 7px 8px`, 3 px gap between cards, first line `--sb-result`, second
  line `--sb-meta`. Hover `--border-2` + `--surface-2`. Two variants only:
  `data-current` (accent border + `0 0 0 1px var(--accent)` ring) for Search,
  `data-selected` (`--surface-2` + `--border-2`, no accent) for Health.
- Health's rows become cards, keep two lines (quote, then state · block · references), and its 3 px
  radius disappears.

### 4. Dividers

A divider is `border-top` **on the group**, with symmetric `padding: 8px 0`. No header that follows a
group carries `border-top`. This fixes the last card touching the next chapter's rule.

### 5. Collapsible groups

Health already has `.nf-health-section-row[aria-expanded]`; Search adopts the same control: 28 px row,
16 px chevron **on the left**, `--sb-label` name, 10.5 px tabular count on the right.

Rules:
1. Default open.
2. The count is visible when the group is closed.
3. Navigating to an occurrence (`findIndex` change) whose chapter is closed **opens it**.
4. A query change reopens every chapter.
5. State is component-local in `SearchSection` (a `Set` of closed chapter keys): do **not** add fields
   to `state/shell.ts`, do not persist it, and let it reset when the section unmounts.

### 6. ARIA

The Search results container becomes `role="tree"` (`aria-label="Search results"`): each chapter is a
`treeitem` with `aria-expanded` and `aria-level="1"`, each occurrence a `treeitem` with
`aria-level="2"` — the occurrence rows stop being `role="option"`. The input keeps `role="combobox"`,
`aria-controls` the tree and `aria-activedescendant` the current occurrence (valid for a tree popup).
Health keeps its plain buttons: it has no activedescendant.

### 7. Scroll

`scrollbar-gutter: stable` on `.nf-sidebar-scroll`, `overflow-x: hidden` unchanged, no inner scroll
containers. The gutter is internal: **do not change** `shared/shell.ts` or any persisted width. At 264
the content box is 238 px in every state.

### 8. Needs-repair dot

Replace the 13 px square counter with a 6 px circle in `--danger` at `top: 4px; right: 4px`. Nothing at
zero (no empty box). Keep `documentHealthBadgeLabel` as the `aria-label` and add the same text as
`title`. The Health header keeps the exact number.

### 9. Guard

Add a test that fails if a sidebar selector introduces a literal `font-size`, i.e. that the sidebar
rules use the `--sb-*` tokens. Put it where the existing CSS-guard tests live; it must not depend on the
app running.

### 10. Docs

Update `docs/design/find-bar.md` §3 and `docs/design/document-health-sidebar.md` §2 to point at
`docs/design/sidebar.md` for row and header rules instead of restating them. Write
`docs/reports/sidebar-system.md`.

## Out of scope

- Behaviour: queries, counts, ordering, navigation, the find engine, the health audit, repairs.
- The shell frame, titlebar, tab bar, canvas, Page/PDF, Settings, the editor body, the code palette.
- `state/shell.ts`, `shared/shell.ts`, schema, settings, IPC.
- The activity bar's icons, geometry or the 48 px width.

## Files

Read:
- `docs/design/sidebar.md` (the authority), `docs/design/sidebar-ui-lab/index.html`.
- `apps/desktop/src/renderer/src/styles.css` — the sidebar blocks: `.nf-sidebar-scroll`,
  `.nf-sidebar-section`, `.nf-section-head`, `.nf-library-*`, `.nf-tree-*`, `.nf-health-*`,
  `.nf-search-*`, `.nf-activity-badge`.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx`, `SearchSection.tsx`, `HealthSection.tsx`.

Expected to touch:
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx`, `SearchSection.tsx`, `HealthSection.tsx`
- `apps/desktop/test/` — one new guard test
- `tests/ui/find-bar.test.mjs`, `tests/ui/document-health.test.mjs`, and any suite that asserts the old
  geometry or the old `role="option"`
- `docs/design/find-bar.md`, `docs/design/document-health-sidebar.md`, `docs/reports/sidebar-system.md`

## Acceptance criteria

- [ ] All four sections show the same header height, title size and 8 px inset. Library shows the
      switcher as its title; Health shows `Health` + count with the refresh still beside the filter.
- [ ] Outline rows are 12.5 px, not 13; depth steps are 12 px and stop growing after level 3.
- [ ] Search occurrences and Health problems are cards with the same anatomy; Search's current card has
      the accent ring, Health's selected card does not; neither uses a pill.
- [ ] The last card of a group is at least 8 px away from the next divider, for every group, at any
      sidebar width between 180 and 640.
- [ ] Search chapters collapse with a left chevron; a closed chapter still shows its count; navigating
      into a closed chapter opens it; a new query reopens all.
- [ ] Search results are a `tree` with `aria-expanded` chapters and `aria-level` rows; the input still
      moves the current occurrence with `aria-activedescendant`; `Esc`, `↵`, arrows, `Home`/`End` work.
- [ ] No sidebar content shifts when a section starts to overflow; the scroll thumb appears only when
      there is something to scroll; no persisted width changed.
- [ ] The activity bar shows a 6 px dot when something needs repair and nothing at zero; the count is
      in `aria-label` and `title`.
- [ ] No behaviour change elsewhere: same query, same counts, same navigation, same repairs.

## Tests and evidence

- Targeted while working: `npx vitest run` (the guard + `activity-bar.test.ts`),
  `node tests/ui/run.mjs --group shell,anchors --concurrency 2`.
- End of task: `npm run verify:fast`.
- Do not run `npm run verify`: the Orchestrator runs the full integration gate.
- Screenshots under `artifacts/sidebar-system/`: the four sections with content, a collapsed chapter, a
  closed Health group, the dot at 0 and at 3, a long list with the scroll thumb visible.

## Stop and ask

- if a UI suite asserts `role="option"`/`listbox` for the results: migrate it to the tree and say so,
  but stop if the migration would weaken a keyboard or navigation assertion;
- if the 28 px row or the header change breaks the `17..253` grid assertions in the shell suite, or any
  measured x/y, and the cause is not obvious from this brief;
- if the gutter changes a measured content width anywhere outside `.nf-sidebar-scroll`;
- if the dot needs the activity-button geometry to change;
- on any schema/settings/engine change, or any product decision the brief leaves open.

## Report format

Summary, files changed, checks with real timings, pass/fail per acceptance criterion, open
questions/risks, next step. One commit in the worktree; do not merge; do not change spec/UX/ADR/plan.
