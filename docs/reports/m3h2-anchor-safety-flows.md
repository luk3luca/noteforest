# M3h2 — anchor safety flows: repair preview and delete disclosure

**Role:** Builder
**Milestone:** M3h — Sentinel review fixes
**Scope:** S2-2 (AC-55) and S2-3 (AC-06). No live-state, idle-anchor, token, image, or placement
work. No core command shape changed.

## Summary

- AC-55: selecting a repair candidate or pressing **Relink to current selection** now only opens a
  before/after preview. **Confirm repair** applies the existing `anchor.repair` command; **Cancel**
  or closing the sheet mutates nothing. The preview shows old/new quote and context, formula/code
  occurrence and offsets, anchor ID, branch IDs/roles, target blocks, and the source block/chapter.
- AC-06: the delete confirmation now lists every external reference parent whose edge targets the
  deleted block (promote) or any block in the deleted primary subtree (delete-subtree), including
  source block, chapter, role, and target. Cancel mutates nothing; Confirm still uses the existing
  core `block.delete` and one undo restores the exact graph.
- The one-click repair UI test is replaced by preview → Cancel (no mutation) → Confirm; the relink
  test also proves preview/Cancel/no-mutation before Confirm. A new reference UI test covers the
  delete disclosure, both delete modes, cancel, confirm, and exact undo.

## Implementation

- `lib/anchor-health.ts`: pure `AnchorRepairPreview` projection plus `anchorRepairPreview`; it
  returns the exact command that will run and never resolves a selector itself.
- `lib/tree.ts`: pure `externalReferenceParents(document, blockId, mode)`; excludes primary edges
  and references sourced inside the deletion.
- `state/runtime.ts`: `prepareRepairFromSelection` derives the selection command without applying it;
  the core `anchor.repair` remains the validation authority on Confirm.
- `shell/Dialogs.tsx`: repair preview state and Confirm/Cancel actions; external-reference section in
  the delete dialog.
- `styles.css`: preview and disclosure styling.

## Files changed

- `apps/desktop/src/renderer/src/lib/anchor-health.ts`
- `apps/desktop/src/renderer/src/lib/tree.ts`
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx`
- `apps/desktop/src/renderer/src/state/runtime.ts`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/anchor-health.test.ts` (new)
- `apps/desktop/test/delete-references.test.ts` (new)
- `tests/ui/m3-repair.test.mjs`
- `tests/ui/m3-reference.test.mjs`

## Evidence

- `artifacts/m3h2/anchor-repair-preview-1440x900.png`
- `artifacts/m3h2/delete-reference-disclosure-1440x900.png`

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| targeted vitest (anchor health, delete refs, tree, core repair, destructive undo) | 31/31 pass |
| `npm test` | 499/499 pass, 1.91 s |
| `node --test tests/ui/m3-repair.test.mjs` | 4/4 pass |
| `node --test tests/ui/m3-reference.test.mjs` | 4/4 pass |
| `node --test tests/ui/m2-shell.test.mjs` | 4/4 pass |
| `npm run e2e:critical` | 21/21 pass, 45.0 s |
| `npm run verify:fast` | pass, ~60 s |

## Risks / not verified

- Repair preview supports text, formula, and code; image anchors have no editor UI in M3 (AC-21 is
  deferred), so image preview is core-only/not app-tested.
- The preview projects the command's selector and binding for display; it is not a second resolver.
  If the document changes while the sheet is open, core validation rejects a stale Confirm and the
  sheet keeps the previous selector.
- Subtree delete inclusion is based on the primary subtree; references sourced inside the deleted
  subtree are removed with it and are not listed as external parents.
