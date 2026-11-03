/**
 * M2a harness: create → edit → save → reopen → corrupt → recover.
 *
 * Run after building the package:
 *   npm run harness -w @noteforest/core
 * or:
 *   npm run build -w @noteforest/core && node packages/core/dist/harness/run.js --keep
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CommandSuccess, DocumentCommand } from '../src/commands.js';
import type { ContentNode } from '../src/types.js';
import type { DocumentStore } from '../src/node/store.js';
import {
  createDocumentPackage,
  findNewestValidRecovery,
  inspectRecoveryCandidates,
  openDocumentPackage,
  readRecentDocuments,
  restoreCandidateToPackage,
} from '../src/node/index.js';

function apply(store: DocumentStore, command: DocumentCommand): CommandSuccess {
  const result = store.apply(command);
  if (!result.ok) {
    throw new Error(`${command.type} failed: ${result.code}: ${result.message}`);
  }
  return result;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function textContent(text: string): ContentNode {
  return { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] };
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[harness] ${message}`);
}

const keep = process.argv.includes('--keep');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-core-harness-'));
const library = path.join(root, 'library');
const appSupport = path.join(root, 'app-support');
const options = {
  appSupportDir: appSupport,
  heartbeatIntervalMs: 0,
  registerRecent: true,
};

log(`workspace ${root}`);

const created = await createDocumentPackage(
  library,
  { title: 'Eigenvalues', chapterTitle: 'Linear algebra' },
  options,
);
assert(created.ok, 'document package creation');
const store = created.store;
log(`created ${created.packagePath} (revision ${created.document.revision})`);

const first = apply(store, {
  type: 'block.create',
  label: 'Eigenvalues',
  content: textContent('An eigenvalue is a scalar λ such that Av = λv.'),
  placement: { kind: 'top-level', chapterId: created.document.chapters[0]?.id ?? '' },
});
const firstId = first.affected.blockIds.find((id) => id in first.document.blocks) ?? '';

const second = apply(store, {
  type: 'block.create',
  label: 'Cayley–Hamilton',
  content: textContent('Every square matrix satisfies its own characteristic polynomial.'),
  placement: { kind: 'top-level', chapterId: created.document.chapters[0]?.id ?? '' },
});
const secondId = second.affected.blockIds.find((id) => id in second.document.blocks) ?? '';
assert(firstId.length > 0 && secondId.length > 0, 'top-level block IDs');

const child = apply(store, {
  type: 'block.create',
  label: 'Eigenvector',
  content: textContent('A non-zero vector v with Av = λv.'),
  placement: { kind: 'child', parentBlockId: firstId },
});
const childId = child.affected.blockIds.find((id) => id in child.document.blocks) ?? '';
const branchId = child.affected.branchIds.find((id) => id in child.document.branches) ?? '';
assert(childId.length > 0 && branchId.length > 0, 'child block and primary branch');

apply(store, {
  type: 'branch.relabel',
  branchId,
  label: 'has eigenvector',
});
apply(store, {
  type: 'block.editContent',
  blockId: firstId,
  content: textContent('An eigenvalue λ makes Av = λv for some non-zero vector v.'),
});

const saveStarted = performance.now();
const saved = await store.save();
const saveMs = performance.now() - saveStarted;
if (!saved.ok) throw new Error(`save failed: ${saved.error.message}`);
log(
  `saved revision ${saved.revision} in ${saveMs.toFixed(1)} ms (${saved.bytes} bytes, backup ${
    saved.backupPath ?? 'none'
  })`,
);

// A second committed save makes sure a later backup exists that already
// contains edited content (backups are taken before the save they precede).
apply(store, {
  type: 'block.create',
  label: 'Diagonalization',
  content: textContent('A diagonalizable matrix has a basis of eigenvectors.'),
  placement: { kind: 'top-level', chapterId: created.document.chapters[0]?.id ?? '' },
});
const secondSave = await store.save();
if (!secondSave.ok) throw new Error(`second save failed: ${secondSave.error.message}`);
log(`saved revision ${secondSave.revision} (backup ${secondSave.backupPath ?? 'none'})`);
await store.close();

const reopenStarted = performance.now();
const reopened = await openDocumentPackage(created.packagePath, { ...options, mode: 'read' });
const reopenMs = performance.now() - reopenStarted;
assert(reopened.document !== null, 'reopened document');
const reopenedBranches = Object.values(reopened.document.branches);
log(
  `reopened ${reopened.status}: ${Object.keys(reopened.document.blocks).length} blocks, ${
    reopenedBranches.length
  } primary branch(es), revision ${reopened.document.revision} in ${reopenMs.toFixed(1)} ms`,
);
const arrow = reopenedBranches[0];
assert(arrow !== undefined, 'persisted primary branch');
log(
  `arrow ${arrow.id}: ${reopened.document.blocks[arrow.source.blockId]?.label ?? '?'} → ${
    reopened.document.blocks[arrow.targetBlockId]?.label ?? '?'
  } (${arrow.role}${arrow.label === undefined ? '' : `, "${arrow.label}"`})`,
);
await reopened.store.close();

const documentPath = path.join(created.packagePath, 'document.json');
const corruptBytes = Buffer.from('{ "schemaVersion": 1, "id": "truncated"', 'utf8');
await fs.writeFile(documentPath, corruptBytes);
log('corrupted document.json intentionally');

const corruptOpen = await openDocumentPackage(created.packagePath, options);
log(
  `opening corrupt file: ${corruptOpen.status} (${corruptOpen.readOnlyReason ?? 'no reason'}), error ${
    corruptOpen.errors[0]?.code ?? 'none'
  }`,
);
assert(corruptOpen.status === 'read-only', 'corrupt document must be read-only');
const blocked = await corruptOpen.store.save();
assert(!blocked.ok && blocked.error.code === 'read-only', 'corrupt document save must be blocked');
await corruptOpen.store.close();

const candidates = await inspectRecoveryCandidates(created.packagePath, { appSupportDir: appSupport });
log(
  `recovery candidates: ${candidates
    .map((candidate) => `${candidate.kind}:${candidate.valid ? 'valid' : 'invalid'}`)
    .join(', ')}`,
);
const recovery = await findNewestValidRecovery(created.packagePath, { appSupportDir: appSupport });
assert(recovery.status === 'found', 'a valid backup must exist');
log(
  `newest valid backup: ${recovery.candidate.kind} revision ${String(
    recovery.candidate.revision,
  )}, ${recovery.candidate.blockCount ?? 0} blocks`,
);

const recoveredDir = path.join(library, 'recovered-copy');
const restored = await restoreCandidateToPackage(recovery.candidate.path, recoveredDir);
if (!restored.ok) throw new Error(`restore failed: ${restored.error.message}`);
log(`restored a new copy at ${restored.targetPackagePath}`);

const recoveredOpen = await openDocumentPackage(recoveredDir, options);
assert(recoveredOpen.status === 'editable', 'restored copy opens editable');
log(
  `recovered copy: ${Object.keys(recoveredOpen.document?.blocks ?? {}).length} blocks, revision ${
    recoveredOpen.document?.revision ?? '?'
  }`,
);
await recoveredOpen.store.close();

const stillCorrupt = await fs.readFile(documentPath);
assert(stillCorrupt.equals(corruptBytes), 'corrupt canonical file must not be overwritten');
const recent = await readRecentDocuments(appSupport);
log(`recent manifest: ${recent.manifest.items.length} entr(ies)`);
log('OK: create → edit → save → reopen → corrupt recovery');

if (!keep) {
  await fs.rm(root, { recursive: true, force: true });
} else {
  log(`kept workspace ${root}`);
}
