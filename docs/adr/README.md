# Architecture Decision Records

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](0001-stack-electron.md) | v1 stack: Electron + React + TypeScript | Accepted | 3 Nov 2026 |
| [0002](0002-pdf-pipeline.md) | PDF pipeline: shared paginator + `printToPDF` | Accepted | 3 Nov 2026 |
| [0003](0003-external-agent-api.md) | External Agent API | Withdrawn | 14 Nov 2026 |
| [0004](0004-ui-shell-and-branch-editor.md) | UI shell and branch editor stack | Accepted | 3 Nov 2026 |
| [0005](0005-anchor-binding-and-identity.md) | Anchor binding, resolution and identity | Accepted | 5 Nov 2026 |
| [0006](0006-page-group-wrap.md) | Page layout: group-level left-origin wrap | Accepted | 7 Nov 2026 |
| [0007](0007-editor-layouts-and-modes.md) | Editor layouts and interaction modes | Accepted | 7 Nov 2026 |
| [0008](0008-personal-page-settings.md) | Personal page settings, continuous canonical document | Accepted | 8 Nov 2026 |
| [0009](0009-copy-mints-new-document-id.md) | Save a copy mints a new document id | Accepted | 14 Nov 2026 |
| [0010](0010-page-sibling-gap.md) | Page sibling gap: vertical setting, fixed horizontal corridor | Accepted | 19 Nov 2026 |

## When to write one

All three must hold:

1. **Hard to reverse** — changing course costs a migration, a format or a contract.
2. **Surprising without context** — a reader of the code would ask "why this way?".
3. **A real trade-off** — there were alternatives, and one was chosen for specific reasons.

If one is missing: behavior goes in `docs/spec.md`, a local reason in a code comment, and batch
history in the commit message. An ADR is not a changelog.

## Conventions

- One decision per record; status is `Proposed`, `Accepted`, `Superseded`, `Rejected` or
  `Withdrawn`.
- An accepted ADR binds until a new ADR supersedes it.
- Code and docs must not contradict an accepted ADR; a conflict stops the work until amended.
- A record states the decision, the alternatives, the consequences and the trigger that would
  reopen it. Implementation detail belongs in the code and the spec.
