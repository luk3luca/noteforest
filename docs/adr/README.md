# Architecture Decision Records

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](0001-stack-electron.md) | v1 stack: Electron + React + TypeScript | Accepted | 3 November 2026 |
| [0002](0002-pdf-pipeline.md) | PDF pipeline: shared paginator + Electron `printToPDF` | Accepted; gate runs in Spike 1 | 3 November 2026 |
| [0003](0003-external-agent-api.md) | External Agent API: local HTTP + MCP, auth, locking, audit | **Withdrawn** | 3 November 2026; withdrawn 14 November 2026 |
| [0004](0004-ui-shell-and-branch-editor.md) | M2 UI shell and branch editor stack | Accepted | 3 November 2026 |
| [0005](0005-anchor-binding-and-identity.md) | Anchor binding, resolution, and identity (M3) | Accepted | 5 November 2026 |

## Conventions

- One decision per record; status is `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- An accepted ADR is binding until a new ADR supersedes it.
- Code and product docs must not contradict an accepted ADR. If they do, the ADR wins until amended.
- Spike results may tighten an ADR's gates, never silently change its decision.
