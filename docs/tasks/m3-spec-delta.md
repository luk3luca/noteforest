# M3 spec/UX/ADR delta — approved design decisions

**Role:** Planner / Architect (scoped specialist)  
**Milestone:** M3  
**Base:** current `main` (includes `docs/design/m3-anchors-references.md`)  
**Worktree:** fresh docs-only worktree from `main`  
**Timebox:** half a day

## Context

The product owner approved all recommended decisions in the M3 design package
(`docs/design/m3-anchors-references.md`, §14). Apply them to the canonical docs in one pass and
write the binding/identity ADR. Do not change application code, tests, or `docs/plan.md`.

## Approved decisions

| ID | Decision |
|---|---|
| C1 | Outline order: anchored primary children first, then direct primary children (spec/D3 wins). Fix UX §8.5. |
| C8 | I10: one text anchor is one contiguous binding; the mark ID may repeat across adjacent text nodes of that range. A second disjoint range is the violation. |
| C9 | Deleting a block with anchored primary children promotes all primary children, including anchored ones; create a new primary branch from the deleted block's primary parent or make the child top-level, remove the old anchored branch, keep target/block IDs, and undo restores the old anchored branch. Never leave an unreachable target. |
| OD-2 | After the last branch is removed, the anchor record stays idle, the marker is hidden, and an explicit "Remove anchor" command deletes it. |
| OD-3 | Branch dedupe is source + target, role-independent: one edge per pair; role is a property of that edge. Update validation/UX wording. |
| OD-4 | Atomic-node binding uses additive `attrs.anchorIds` arrays plus the kind-specific selector; no schema bump. Record in ADR-0005. |
| OD-5 | M3 proves a pure exactly-once export manifest; M4 proves the PDF rendering/marker. Add the acceptance note. |
| OD-6 | `block.split`/`block.merge` are in M3f (minimal text-leaf split, same-chapter merge) so AC-18 stays in M3. |
| OD-7 | "Make home" is disabled when the target is already a root; use "Move here"/"Add as child." |
| OD-8 | Callout lane below the parent card, anchor-aligned; geometry is best-effort in M3. |
| OD-9 | Reference edges render as a dashed edge when both endpoints are visible, plus chips otherwise. |
| OD-10 | Anchor health is a status chip plus sheet/dialog, not a full inspector, and no modal on load. |
| OD-11 | Cross-chapter merge is rejected in M3. |
| OD-12 | Text selections containing inline math/images are supported via plain-text projection; the mark binding remains truth. |

## Deliverables

1. `docs/spec.md` — apply the decisions above, including:
   - I10 contiguous-binding reading;
   - delete-block promotion of anchored primary children;
   - idle anchor lifetime and explicit removal;
   - role-independent dedupe;
   - `attrs.anchorIds` binding shape;
   - AC-56 M3/M4 evidence split and AC-18 split/merge placement;
   - make-home root rule, cross-chapter merge rejection, selection projection.
   - Bump the spec version to **v0.4.5** and add a short changelog line: M3 design decisions applied.
2. `docs/ux.md` — fix §8.5 outline order; align F5/F8/F7 and the branch/create/make-home/callout/
   health wording with the decisions; keep the interaction detail consistent with `docs/ux-shell.md`.
3. `docs/adr/0005-anchor-binding-and-identity.md` (new) — binding shape, selector/quote rules,
   resolution states, identity invariants, undo/repair boundaries. Use §13.3 of the design package.
   If the design recommends a separate ADR for reference edges, write
   `docs/adr/0006-reference-edges.md`; otherwise record why one ADR is enough.
4. `docs/design/m3-anchors-references.md` — update §1.4/§1.5/§14 to mark C1–C9 and OD-1–OD-12 as
   **approved on 5 November 2026**, with the resolution; do not rewrite the design body.
5. A short report `docs/reports/m3-spec-delta.md`: files, decisions applied, any residual wording
   conflict, spec version.

## Out of scope

- Application code, tests, schema changes, migrations.
- `docs/plan.md` (the Orchestrator updates the plan).
- M4 page/PDF visuals, M5 External API, annotations, iPad.
- Reopening ratified decisions or inventing new behavior.

## Acceptance

- [ ] Every approved decision appears in the spec/UX/ADR where a Builder will look for it.
- [ ] C1 is fixed in UX; no doc still says anchored children come after direct children.
- [ ] C8/I10 and C9 delete behavior are unambiguous and testable.
- [ ] ADR-0005 records the binding/identity contract; ADR-0006 exists only if justified.
- [ ] Spec version is v0.4.5 and the changelog notes the M3 clarification.
- [ ] The design package marks the decisions approved, not open.
- [ ] No code, tests, plan, or unrelated docs changed.

## Stop and ask

Stop if an approved decision conflicts with another ratified doc in a way the design package did
not list, or if applying C9 would require a new command that the design does not name.

## Report format

Summary, files, decision-to-doc mapping, residual conflicts, spec version, next step.
