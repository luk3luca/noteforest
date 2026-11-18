# ADR-0003 — External Agent API (withdrawn)

- **Status:** **Withdrawn** by the product owner (14 November 2026). Kept only to record why the
  app has no server.

## What was proposed

A local HTTP + MCP API with auth, document locking and an audit log, so an external agent could
read and mutate notes.

## Why it was withdrawn

The product's authoring path is file-based: an agent writes a `.md` file, and the app opens it as a
flat guest file. That needs no server, no tokens, no network surface and no audit model, and it
keeps the app's local-first and privacy posture intact. A live API would add a security boundary
and a compatibility contract that v1 does not need.

## What would reopen it

A v2 decision on a **command surface without a server** (a command file/inbox in the library, a
CLI, or MCP-over-stdio). That needs a new ADR covering the operation schema, atomicity, live-lock
behavior and the delete policy. Nothing is built before those answers.
