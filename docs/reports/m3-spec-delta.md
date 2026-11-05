# M3 spec/UX/ADR delta — implementation report

**Date:** 5 November 2026  
**Role:** Planner / Architect (scoped specialist)  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-8c581762`  
**Branch:** `t3/m3-spec-delta-docs`  
**Base:** `main` at `c34f928` (docs: approve M3 design and start spec/UX/ADR delta)  
**Commits:** `b988668` (docs delta), `235f8b2` (report), `ca45b89` (OD-4 citation), `0498675`
(approved OD cross-reference note); this report update is the final follow-up commit.  
**Spec version:** `docs/spec.md` **v0.4.5**  
**UX version:** `docs/ux.md` **v1.3**  
**ADR:** `docs/adr/0005-anchor-binding-and-identity.md` (Accepted). `docs/adr/0006-reference-edges.md`
was **not** written; the design package §13.4 marks it optional, and ADR-0005 §9 records why the
spec/UX are sufficient.

## Summary

Applied the product owner's approved M3 decisions (C1, C8, C9, OD-1–OD-12) to the canonical docs in
one pass:

- spec v0.4.5: `anchorIds` binding, one-contiguous-binding I10, anchored-primary promotion on block
  delete, idle anchor lifetime, role-independent dedupe, make-home root rule, callout lane, dashed
  reference edges/chips, health sheet, AC-56 M3 manifest / M4 PDF, AC-18 split/merge in M3f,
  cross-chapter merge rejection, and text-selection projection;
- UX v1.3: C1 fixed (anchored children first), F5/F7/F8 aligned, callout/health/reference wording
  aligned, and M3 page-view caveats added;
- ADR-0005: binding shape, selector/quote rules, resolution states, identity invariants, undo/repair
  boundaries, validation rules A1–A12, and the reference-edge boundary;
- design package: C1–C9 and OD-1–OD-12 marked approved on 5 November 2026, with the resolution
  retained; body not rewritten.

No application code, tests, schema, `docs/plan.md`, M4/PDF, or M5 API was changed. No app was
launched.

## Files changed

| File | Change |
|---|---|
| `docs/spec.md` | v0.4.5; §4.4/§4.5/§4.6/§4.10/§5.2/§5.3/§5.4/§6.3/§7.4/§7.7/§8.2–§8.10/§9.2/§13.1/§13.2/§15.2/§15.3/§15.4/§15.10/§16.1/Appendix B |
| `docs/ux.md` | v1.3; §0 D9/D11, F4/F5/F7/F8, §4.6, §5.5, §8.5, §10.2–§10.4, §11.3, §11.5, Q10/Q11, end note |
| `docs/adr/0005-anchor-binding-and-identity.md` | New accepted ADR |
| `docs/adr/README.md` | Index row for ADR-0005 |
| `docs/design/m3-anchors-references.md` | Header status, §1.4/§1.5/§2.3/§11.2/§13/§14/§16 status markers; body retained |
| `docs/reports/m3-spec-delta.md` | This report |

## Decision-to-doc mapping

| Decision | Where a Builder will find it |
|---|---|
| **C1** | `docs/ux.md` §8.5, F4, F5; spec §4.6 already had D3 anchored-first. No doc now says anchored children come after direct children. |
| **C2** | spec §8.9, §15.10 AC-56; ADR-0005 §8 (OD-5). |
| **C3** | spec §5.2 split/merge, §15.3 AC-18; ADR-0005 §8 (OD-6). |
| **C4** | `docs/ux.md` F7, §0 D11, Q10; spec §7.6 already shared collapse. M3 editor aligned; paginated Reader/Page deferred to M4. |
| **C5** | spec §4.5, I8, §5.3, §13.1; `docs/ux.md` F8; ADR-0005 §6 (OD-3). |
| **C6** | spec §4.4, §9.2; ADR-0005 §1 (OD-4). "Node ID" wording replaced by `attrs.anchorIds`. |
| **C7** | spec §4.6, §5.3, §13.1; `docs/ux.md` F8; ADR-0005 §9 (OD-7). |
| **C8** | spec §4.4, I10, §5.2 split; ADR-0005 §3 (one contiguous binding). |
| **C9** | spec §5.2 delete block, §13.2; ADR-0005 §8 (promote anchored primary children, keep target IDs, undo restores). |
| **OD-1** | `docs/ux.md` §8.5 (C1); spec §4.6 already D3. |
| **OD-2** | spec §5.4, §8.3, §8.5; `docs/ux.md` F5, §8.5, §10.4, §11.3, §11.5; ADR-0005 §8. |
| **OD-3** | spec §4.5, I8, §5.3, §13.1; `docs/ux.md` F8; ADR-0005 §6. |
| **OD-4** | spec §4.4, §9.2; ADR-0005 §1. |
| **OD-5** | spec §8.9, §15.10 AC-56; ADR-0005 §8. |
| **OD-6** | spec §5.2 split/merge, §15.3 AC-18; ADR-0005 §8. |
| **OD-7** | spec §4.6, §5.3, §13.1; `docs/ux.md` F8; ADR-0005 §9. |
| **OD-8** | spec §7.4, §15.2 AC-10; `docs/ux.md` F5, §10.3; ADR-0005 §10. |
| **OD-9** | spec §6.3, §7.7, §15.4 AC-26; `docs/ux.md` F8, §10.2, §10.3, Q11; ADR-0005 §9. |
| **OD-10** | spec §5.4, §8.5, §8.9; `docs/ux.md` §4.6, §10.4, §11.3; ADR-0005 §8/§10. |
| **OD-11** | spec §5.2 merge, §15.3 AC-18, §13.1; ADR-0005 §9. |
| **OD-12** | spec §4.4, §5.4, §8.6, §8.8, §13.2; `docs/ux.md` F5; ADR-0005 §2/§3. |

## Consistency fixes made beyond the explicit decision list

These were required to avoid a Builder implementing from a contradictory line; they do not add a new
product decision.

- **spec §8.2:** replaced "if one candidate is clearly best, resolve" with the exact-unique rule.
  This aligns the spec with ratified AC-55 and D5; the design package §3.2 already called the old
  wording stricter. Candidate ranking is UI order only.
- **spec §8.6:** split the image row into "resize display" (resolved) and "change crop" (broken or
  confirmation). This aligns §8.6 with §8.10/D5; the old combined row contradicted the image policy.
- **spec §4.4:** replaced the unimplementable "node ID" wording with the approved `attrs.anchorIds`
  binding; added the selector-mirror rule, derived-state rule, and the `anchorIds` legacy read.
- **spec §9.2:** updated the anchor mark row from `anchorId` to `anchorIds` (legacy string accepted).
- **spec §13.2:** fixed "branch source anchor deleted with block" from "delete the branch" to the
  C9 promotion rule; added idle, crop, projection, and contiguous-binding rows.
- **`docs/ux.md` §4.6:** added an M3 note that the inspector is not built in M3; anchor health uses
  the status chip + sheet and reference links use block-menu See also/Referenced by lists. This
  keeps UX consistent with `docs/ux-shell.md` and ADR-0004.

## Residual conflicts and open notes

1. **Reader/Page collapse (C4)** — the M3 continuous editor follows spec §7.6 and hides anchored
   callouts with the subtree. The paginated Reader/Page rule ("always show the full layout") remains
   v1.2 and is explicitly deferred to M4. Not a blocker for M3; it is a known M4 decision.
2. **No page view in M3** — UX v1.3 still contains v1.2 page-view flows (F9/F12, sample walkthrough)
   as the v1 target. F8/§8.5/§10.2/§10.3/Q11 now say M3 chips show chapter/label and M4 adds the
   page number. A Builder must not implement page numbers or page-view chips in M3.
3. **Keymap** — F5 uses `⌘⇧Return` for an anchored child; `docs/ux-shell.md` uses `Control+Enter`
   for a new child. These are different actions, but the design's U3 ("confirm `⌘⇧Return` against
   the M2 keymap") was not in the approved list, so the keymap was not changed. The Orchestrator
   should confirm the final key in the M3b brief.
4. **Detach wording** — `docs/ux.md` F6 says Detach makes a block top-level "at the top of the
   current chapter"; spec §5.5 says "after the former top-level block." This pre-existing difference
   is not in C1–C9 and was not changed. The spec is authoritative for behavior.
5. **Inspector** — `docs/ux.md` §4.6 remains the v1 inspector target; M3 does not build it (explicit
   M3 note). Anchor health and reference lists in M3 use the sheet/chips/menu.
6. **`AGENTS.md` current phase** — still says spec v0.4.4 until the delta lands. The Orchestrator
   should update the phase line after merge; AGENTS.md was outside this brief.
7. **`docs/plan.md`** — not edited. The M3 gate should record the AC-56 split (M3 manifest / M4 PDF)
   and AC-18 in M3f. The Orchestrator owns the plan.
8. **`docs/ux-shell.md` M3 addendum (U4)** — not added. The M3 surfaces (callout lane, markers,
   chips, health sheet) are specified in `docs/ux.md`; `docs/ux-shell.md` remains the M2 shell record.
   This is a scope boundary, not a contradiction.
9. **ADR-0006** — not written. The design package §13.4 marks it optional; the reference-edge rules
   (OD-3/OD-7/OD-9/OD-11, layout neutrality) live in spec §4.5/§5.3/§7.7 and UX F8, and ADR-0005 §9
   records the boundary and why a second ADR would duplicate without a new decision.
10. **Design package vocabulary** — §0 still defines "Proposal (not applied)" and "Open decision" as
    historical vocabulary; the header, §13, and §14 explicitly state that the package is approved and
    applied. The body was intentionally not rewritten.

## Checks

- Consistency read of spec §4.4–§4.10, §5.2–§5.4, §7.4/§7.7, §8.2–§8.10, §15.2/§15.3/§15.4/§15.10,
  UX §0, F4/F5/F7/F8, §4.6, §8.5, §10.2–§10.4, §11.3/§11.5, Q10/Q11, ADR-0005, and the design
  package.
- `grep` sweep for stale wording: "after unanchored", "same source, target, role", "node ID",
  "clearly best", "anchor health panel", "Removing the last branch from an anchor removes",
  "Resize/crop" — no remaining hits in the changed docs.
- `git diff --check`: only intentional Markdown hard-break trailing spaces in the existing header
  style; no code or whitespace errors.
- No app launch, no `npm` run, no code/test/schema/plan change.

## Next step

1. Orchestrator reviews and merges this docs branch.
2. Orchestrator updates `AGENTS.md` (current phase/spec version) and `docs/plan.md` (AC-56 M3
   manifest / M4 PDF; AC-18 in M3f; cross-chapter merge rejection).
3. Orchestrator writes the M3a–M3f Builder briefs from the design package §12, with the keymap
   confirmation for M3b (residual note 3).
4. Builders read spec v0.4.5, UX v1.3, ADR-0005, and the relevant design section; they stop and
   report if a new conflict appears.
