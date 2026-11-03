/** Shared deterministic fixtures for core tests. */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CommandSuccess, DocumentCommand } from '../src/commands.js';
import { executeCommand } from '../src/commands.js';
import type { CoreContext } from '../src/ids.js';
import { sequentialIdFactory } from '../src/ids.js';
import type { ContentNode, Document } from '../src/types.js';

export function deterministicContext(startTick = 0): CoreContext {
  let tick = startTick;
  return {
    newId: sequentialIdFactory('id'),
    now: () => {
      const value = new Date(Date.UTC(2026, 10, 3, 10, 0, tick));
      tick += 1;
      return value.toISOString();
    },
  };
}

export function newDocument(context: CoreContext = deterministicContext()): Document {
  const result = executeCommand(
    null,
    { type: 'document.create', title: 'Test document', chapterTitle: 'Chapter One' },
    { context },
  );
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

export function run(
  document: Document,
  command: DocumentCommand,
  context: CoreContext = deterministicContext(1000),
  options: { skipInputValidation?: boolean } = {},
): CommandSuccess {
  const result = executeCommand(document, command, {
    context,
    ...(options.skipInputValidation === undefined
      ? {}
      : { skipInputValidation: options.skipInputValidation }),
  });
  if (!result.ok) {
    throw new Error(`${command.type} failed: ${result.code}: ${result.message}`);
  }
  return result;
}

export function tryRun(
  document: Document,
  command: DocumentCommand,
  context: CoreContext = deterministicContext(1000),
) {
  return executeCommand(document, command, { context });
}

export function applyAll(
  document: Document,
  commands: DocumentCommand[],
  context: CoreContext = deterministicContext(1000),
): Document {
  let current = document;
  for (const command of commands) {
    current = run(current, command, context).document;
  }
  return current;
}

export function textContent(text: string): ContentNode {
  return {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: text.length === 0 ? [] : [{ type: 'text', text }],
      },
    ],
  };
}

export function blockText(block: { content: ContentNode }): string {
  const collect = (node: ContentNode): string => {
    if (node.type === 'text') return node.text ?? '';
    return (node.children ?? []).map(collect).join('');
  };
  return collect(block.content);
}

/** Add a top-level block and return [document, blockId, branchIds]. */
export function addTopLevel(
  document: Document,
  label: string,
  context: CoreContext,
): { document: Document; blockId: string } {
  const result = run(
    document,
    {
      type: 'block.create',
      label,
      content: textContent(label),
      placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
    },
    context,
  );
  const blockId = result.affected.blockIds.find((id) => !(id in document.blocks));
  if (blockId === undefined) throw new Error('block.create did not report its block ID');
  return { document: result.document, blockId };
}

export function addChild(
  document: Document,
  parentBlockId: string,
  label: string,
  context: CoreContext,
): { document: Document; blockId: string; branchId: string } {
  const result = run(
    document,
    {
      type: 'block.create',
      label,
      content: textContent(label),
      placement: { kind: 'child', parentBlockId },
    },
    context,
  );
  const blockId = result.affected.blockIds.find((id) => !(id in document.blocks));
  const branchId = result.affected.branchIds.find((id) => !(id in document.branches));
  if (blockId === undefined || branchId === undefined) {
    throw new Error('block.create child did not report IDs');
  }
  return { document: result.document, blockId, branchId };
}

/** Chapter top-level order followed by depth-first direct children. */
export function outlineOrder(document: Document): string[] {
  const order: string[] = [];
  const visit = (blockId: string): void => {
    order.push(blockId);
    const children = Object.values(document.branches)
      .filter(
        (branch) =>
          branch.role === 'primary' &&
          branch.source.blockId === blockId &&
          branch.source.anchorId === undefined,
      )
      .sort((left, right) =>
        left.order === right.order
          ? left.id < right.id
            ? -1
            : 1
          : left.order < right.order
            ? -1
            : 1,
      );
    for (const child of children) visit(child.targetBlockId);
  };
  for (const chapter of document.chapters) {
    for (const blockId of chapter.topLevelBlockIds) visit(blockId);
  }
  return order;
}

export function directChildren(document: Document, blockId: string): string[] {
  return Object.values(document.branches)
    .filter(
      (branch) =>
        branch.role === 'primary' &&
        branch.source.blockId === blockId &&
        branch.source.anchorId === undefined,
    )
    .sort((left, right) =>
      left.order === right.order
        ? left.id < right.id
          ? -1
          : 1
        : left.order < right.order
          ? -1
          : 1,
    )
    .map((branch) => branch.targetBlockId);
}

export function primaryParentId(document: Document, blockId: string): string | null {
  const branch = Object.values(document.branches).find(
    (candidate) => candidate.role === 'primary' && candidate.targetBlockId === blockId,
  );
  return branch?.source.blockId ?? null;
}

export async function makeTempDir(prefix = 'noteforest-core-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeDir(directory: string): Promise<void> {
  await fs.rm(directory, { recursive: true, force: true });
}
