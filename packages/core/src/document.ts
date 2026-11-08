/** Document/block factories and small pure mutators. */

import { createContext } from './ids.js';
import type { CoreContext } from './ids.js';
import type { ContentBlock, ContentNode, Document, JsonObject } from './types.js';
import { CURRENT_SCHEMA_VERSION, emptyContent } from './types.js';

export interface CreateDocumentInput {
  title?: string;
  id?: string;
  chapterId?: string;
  chapterTitle?: string;
  annotations?: unknown[];
  extensions?: JsonObject;
}

/**
 * Create a new, empty document with one empty chapter.
 *
 * IDs come from `context.newId` (UUID v4 by default), timestamps from
 * `context.now`. The document starts at revision 0. Page setup, manual breaks,
 * and view state are personal settings and are never seeded here (ADR-0008).
 */
export function createDocument(
  input: CreateDocumentInput = {},
  context: Partial<CoreContext> = {},
): Document {
  const { newId, now } = createContext(context);
  const timestamp = now();
  const documentId = input.id ?? newId();
  const chapterId = input.chapterId ?? newId();
  if (documentId === chapterId) {
    throw new RangeError('Document ID and chapter ID must be distinct');
  }

  const document: Document = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: documentId,
    title: input.title ?? 'Untitled',
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 0,
    chapters: [
      {
        id: chapterId,
        ...(input.chapterTitle === undefined ? {} : { title: input.chapterTitle }),
        topLevelBlockIds: [],
      },
    ],
    blocks: {},
    anchors: {},
    branches: {},
    assets: {},
    annotations: structuredClone(input.annotations ?? []),
  };
  if (input.extensions !== undefined) document.extensions = structuredClone(input.extensions);
  return document;
}

export interface CreateBlockInput {
  id: string;
  content?: ContentNode;
  label?: string;
  border?: ContentBlock['border'];
  createdAt?: string;
  updatedAt?: string;
  extensions?: JsonObject;
}

export function createContentBlock(input: CreateBlockInput): ContentBlock {
  const content = structuredClone(input.content ?? emptyContent());
  const block: ContentBlock = { id: input.id, content };
  if (input.label !== undefined) block.label = input.label;
  if (input.border !== undefined) block.border = input.border;
  if (input.createdAt !== undefined) block.createdAt = input.createdAt;
  if (input.updatedAt !== undefined) block.updatedAt = input.updatedAt;
  if (input.extensions !== undefined) block.extensions = structuredClone(input.extensions);
  return block;
}

/** Deep copy of JSON-compatible document data. */
export function cloneDocument(document: Document): Document {
  return structuredClone(document);
}

/** Byte-stable canonical JSON used for comparisons in tests and diagnostics. */
export function documentFingerprint(document: Document): string {
  return JSON.stringify(document);
}
