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

export interface CreateDocumentCopyInput {
  /** Title of the copy; usually the destination package name. */
  title: string;
  /** Deterministic id/clock injection for tests. */
  context?: Partial<CoreContext>;
}

/**
 * Copy a document under a **new identity** (ADR-0009, "Save a copy").
 *
 * A copy is a new document: a fresh id from the id factory, the destination
 * name as its title, `createdAt`/`updatedAt` at copy time, and revision 1.
 * Content, anchors, branches, shared children, assets, and unknown fields are
 * preserved verbatim. The source document is never mutated, and a package's
 * personal Page settings are not part of the document, so a new id cannot
 * inherit the source's overrides.
 */
export function createDocumentCopy(
  document: Document,
  input: CreateDocumentCopyInput,
): Document {
  const { newId, now } = createContext(input.context);
  const timestamp = now();
  const title = input.title.trim().length > 0 ? input.title.trim() : 'Untitled';
  let id = newId();
  for (let attempt = 0; attempt < 32 && id === document.id; attempt += 1) {
    id = newId();
  }
  if (id === document.id) {
    throw new RangeError('Could not generate a new document ID for the copy');
  }
  return {
    ...structuredClone(document),
    id,
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

/** Byte-stable canonical JSON used for comparisons in tests and diagnostics. */
export function documentFingerprint(document: Document): string {
  return JSON.stringify(document);
}
