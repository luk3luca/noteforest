# ADR-0006 — Page layout: group-level left-origin wrap

- **Status:** Accepted (7 November 2026); implemented and validated in the layout lab.

## Context

A Page child group must decide, per parent, whether its direct children sit to the right or wrap
below. Two earlier approaches failed:

- **Per-node wrap**: each child decides independently, which fragments a level into a staircase of
  narrow rows.
- **Fixed depth columns**: every depth shares an x origin, which widens the whole page for one wide
  block.

## Decision

**Wrap the whole direct-child group, at a bounded left origin.**

- The group goes to the right only if **every** direct child fits.
- Otherwise all direct children go below the parent at
  `min(parent.x + wrapIndent, pageContentLeft + maxWrapIndent)`.
- The rule applies recursively: each child keeps its own children right only if they fit there.
- Callouts stay below the parent (or in the right lane in mode A); they never decide the group.

## Why

- A level stays a level: siblings share a column and remain readable.
- The bounded origin stops a wrapped group from drifting right on deep chains.
- Group atomicity makes the layout deterministic and testable; the lab measured the page count
  before and after.

## Consequences

- One wide child can push its whole group below, using more vertical space.
- The indent is capped, so a deep wrapped chain keeps a visible stem.
- Page count is a measured outcome, not a promise; the lab and the PDF gate compare before/after.

## Revisit triggers

- Real documents show group atomicity wasting significant width.
- A future manual resize or pin feature changes the placement contract.
