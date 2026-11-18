# ADR-0009 — Save a copy mints a new document id

- **Status:** Accepted by the product owner (14 November 2026)
- **Decision owner:** Product owner
- **Related:** ADR-0005 (anchor binding and identity), `docs/design/library-and-documents.md`,
  the UI Sentinel round and its re-check (2026-11-13)
- **Code:** `apps/desktop/src/main/library.ts` (`saveDocumentCopy`), `packages/core/src/node/copy.ts`

## Context

`Save a copy` writes a second package from the open document. The copy keeps the source
`document.id`, so two packages can share one id. The id is a key for per-document Page overrides,
session tabs, recents, cleanup, and move reconciliation. A shared id makes those operations
ambiguous: trashing one copy can remove the other copy's settings, and reconciliation can bind a
missing tab to the wrong package.

A Finder duplicate of a package folder has the same problem, but the app cannot change it. Cleanup
must therefore stay path-first even after this decision.

There are no published documents or real legacy copies. The only documents in the library were
created for development and the showcase, and none currently share an id.

## Decision

**`Save a copy` mints a new `document.id`.** The copy is a new document:

- new id from the core id factory;
- title from the destination package name (the save dialog suggests `<name> copy`);
- `createdAt` and `updatedAt` set to the copy time;
- revision reset to 1 (new document identity);
- assets copied as today;
- no per-document settings override is inherited.

The source package is never modified. The copy opens as a normal document; if it is outside a
known library it is revealed in Finder, as today.

Finder duplicates keep the same id. For them the app keeps the id-safe cleanup rule: remove by
exact path, use the document id only when no other known package or session tab shares it, and
never bind a moved tab to one of two same-id copies.

## Consequences

- Per-document settings can keep one override per document id for app-created copies.
- `Save a copy` stops creating duplicate ids, so the F3/R1 ambiguity is limited to Finder copies,
  a folder-level operation outside the app.
- The copy is no longer a byte-identical clone of the canonical document: identity, title,
  timestamps, and revision differ. Content, anchors, branches, and assets are preserved.
- No schema change and no settingsVersion change.
- The cleanup and reconciliation path-first rules remain (and remain tested).

## Alternatives rejected

- **Keep the same id and key settings by `(id, path)`.** Invasive: the durable map, session,
  recents, cleanup, and reconciliation all need a composite identity, and a moved package still
  needs reconciliation. A copy is a new document; giving it a new id is the simpler model.
- **Only warn on duplicate ids.** Leaves the ambiguity and the settings collision in place.

## Tests

- Two `Save a copy` operations from one document produce distinct ids and titles.
- Trashing the original keeps the copy's override and session tab.
- The copy opens with its own id, revision 1, and valid canonical content.
- A Finder-style duplicate (same id) still uses path-first cleanup; the other copy keeps its
  override and tab.
