# Phase 4 — shell activity bar (S1 + S2)

**Role:** Implementer / Builder
**Phase:** 4 (post-A–F)
**Base:** `main` at delegation
**Worktree:** created by the delegate; one commit per slice; no merge or push
**Design:** `docs/design/shell-activity-bar.md` (decisions 14 November 2026)
**Timebox:** 2 days for S1; 1 day for S2

## Product model

Replace the **Library/Outline segmented header** with a 48 px vertical activity bar. Document tabs
stay; they are not part of this change. Settings moves to the bar bottom. The bar is navigation only.

## S1 — bar, sections, collapse, token pass

- Bar 48 px, icons 17 px in 28 px buttons, 8 px rhythm, Settings at the bottom.
- Sections: Library, Outline, Document health (icon + badge, shown even if the view is S2), future
  Search/Topics/Data slots; only real sections render in S1.
- Remove the segmented header. Persist the active section in the existing session/view state.
- Collapse: explicit chevron at the top; the bar never collapses; collapsed width is the bar only;
  icons keep the same x in expanded/collapsed; `⌘\` still toggles.
- ARIA: vertical `tablist`, `aria-selected`, roving tabindex, Up/Down/Home/End, labels; badge label
  is accessible; focus visible.
- No `⌥1/2/3` shortcuts in S1; palette entries remain.
- Token pass from `docs/design/value-audit.md`: radii **4/8**, popover gaps **4/8/12**; the
  Continuous card padding **10** and Settings pane **536** stay (documented, not changed). Do not
  touch the Page edge corridor or measurement geometry.
- States: no document, Read mode, collapsed, active, hover, focus; no visual jump on collapse.

## S2 — Document health view + badge

- The Health icon switches the sidebar content to a compact read-only view:
  summary counts, filter chips, short list of rows, Locate, **Open full health** (the sheet).
- Badge = broken + ambiguous only; idle/orphans are a muted count inside the view, not on the badge.
- No repair actions in the view; the sheet is the repair surface.
- No document: “No document” and disabled body.
- Read mode: navigation only; no mutation.

## Files

`apps/desktop/src/renderer/src/shell/Sidebar.tsx`, `Workspace.tsx`, `App.tsx`, `state/shell.ts`,
`state/session.ts`, `styles.css`, `design-tokens.ts` (if a token), `CommandPalette.tsx` entries,
tests. Reuse the Document health selectors/audit from phase 3; do not duplicate.

## Tests

- Icon x is identical expanded/collapsed (measured ≤ 0.5 px); collapse does not move icons.
- Section switching/persistence; ARIA keyboard; focus; Settings gear position; footer no Settings
  label.
- Health view counts/filters/Locate/Open full health; badge label; no repair action; no document
  state; Read gating.
- Token pass: radii/gaps applied; Continuous/Page measurements unchanged; screenshots.
- No document tabs removed; existing tab tests green.
- No fixed sleeps/native dialogs; no schema/settingsVersion/Page/PDF/export/showcase change.

## Acceptance

- [ ] Bar + sections + collapse + Settings bottom; segmented header gone; tabs untouched.
- [ ] ARIA/keyboard/persistence; no icon shift; no document/Read states.
- [ ] S2 health view + badge + Locate + Open full health; read-only.
- [ ] Token pass (4/8 radii, 4/8/12 gaps) with no measurement change; card padding/pane unchanged.
- [ ] Existing shell/settings suites green; screenshots.

## Report

- `docs/reports/shell-activity-bar.md`: per-slice summary, files, checks with timings, PASS/FAIL,
  risks, next. One commit per slice; worktree/branch/head; no full verify.
