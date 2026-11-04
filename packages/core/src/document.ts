/** Document/block factories and small pure mutators. */

import { createContext } from './ids.js';
import type { CoreContext } from './ids.js';
import type {
  ContentBlock,
  ContentNode,
  Document,
  JsonObject,
  MarginsMm,
  PageOrientation,
  PageSetup,
} from './types.js';
import { DEFAULT_MARGINS_MM, DEFAULT_PAGE_ORIENTATION, CURRENT_SCHEMA_VERSION, emptyContent } from './types.js';

export interface CreateDocumentInput {
  title?: string;
  id?: string;
  chapterId?: string;
  chapterTitle?: string;
  pageSetup?: {
    orientation?: PageOrientation;
    margins?: Partial<MarginsMm>;
  };
  annotations?: unknown[];
  extensions?: JsonObject;
}

function pageSetupFromInput(input: CreateDocumentInput): PageSetup {
  const margins: MarginsMm = { ...DEFAULT_MARGINS_MM, ...(input.pageSetup?.margins ?? {}) };
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = margins[side];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`Invalid page margin "${side}": ${String(value)}`);
    }
  }
  const orientation = input.pageSetup?.orientation ?? DEFAULT_PAGE_ORIENTATION;
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    throw new RangeError(`Invalid orientation: ${String(orientation)}`);
  }
  const pageWidth = orientation === 'portrait' ? 210 : 297;
  if (margins.left + margins.right >= pageWidth) {
    throw new RangeError('Margins leave no positive content width');
  }
  return { size: 'A4', orientation, margins };
}

/**
 * Create a new, empty document with one empty chapter.
 *
 * IDs come from `context.newId` (UUID v4 by default), timestamps from
 * `context.now`. The document starts at revision 0 and has no view state.
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
    pageSetup: pageSetupFromInput(input),
    manualBreakBeforeBlockIds: [],
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
