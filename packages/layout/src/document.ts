import type {
  AnchorRecord,
  BranchRecord,
  ContentBlock,
  ContentNode,
  LayoutDefect,
  NoteDocument,
} from './types.js';

export function primaryBranches(document: NoteDocument): BranchRecord[] {
  return Object.values(document.branches).filter((branch) => branch.role === 'primary');
}

export function referenceBranches(document: NoteDocument): BranchRecord[] {
  return Object.values(document.branches).filter((branch) => branch.role === 'reference');
}

export function primaryParentMap(document: NoteDocument): Map<string, BranchRecord> {
  const map = new Map<string, BranchRecord>();
  for (const branch of primaryBranches(document)) {
    if (!map.has(branch.targetBlockId)) map.set(branch.targetBlockId, branch);
  }
  return map;
}

export function primaryChildrenMap(document: NoteDocument): Map<string, BranchRecord[]> {
  const map = new Map<string, BranchRecord[]>();
  for (const branch of primaryBranches(document)) {
    const list = map.get(branch.source.blockId) ?? [];
    list.push(branch);
    map.set(branch.source.blockId, list);
  }
  return map;
}

export function branchOrderKey(branch: BranchRecord): string {
  return `${branch.order ?? ''}\u0000${branch.id}`;
}

export function compareBranches(a: BranchRecord, b: BranchRecord): number {
  const ao = a.order ?? '';
  const bo = b.order ?? '';
  if (ao !== bo) return ao < bo ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function anchorOf(document: NoteDocument, anchorId: string | undefined): AnchorRecord | null {
  if (!anchorId) return null;
  return document.anchors[anchorId] ?? null;
}

export function branchAnchorQuote(document: NoteDocument, branch: BranchRecord): string | null {
  const anchor = anchorOf(document, branch.source.anchorId);
  if (!anchor) return null;
  if (anchor.kind === 'formula') return 'formula';
  if (anchor.kind === 'image') return anchor.quote ?? 'image region';
  if (anchor.kind === 'code') return anchor.quote ?? 'code';
  if (anchor.quote) return anchor.quote;
  const block = document.blocks[anchor.blockId];
  if (!block) return null;
  const text = blockPlainText(block).replace(/\s+/g, ' ').trim();
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

export function inlineText(node: ContentNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'inlineMath') {
    const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
    return latex;
  }
  if (node.type === 'image') {
    const alt = typeof node.attrs?.['alt'] === 'string' ? node.attrs['alt'] : '';
    return alt ? `[image: ${alt}]` : '[image]';
  }
  return (node.children ?? []).map(inlineText).join('');
}

function blockText(node: ContentNode, out: string[]): void {
  switch (node.type) {
    case 'doc':
    case 'blockquote':
      for (const child of node.children ?? []) blockText(child, out);
      break;
    case 'paragraph':
    case 'heading':
      out.push(inlineText(node));
      break;
    case 'bulletList':
    case 'orderedList':
      for (const child of node.children ?? []) blockText(child, out);
      break;
    case 'listItem':
      for (const child of node.children ?? []) blockText(child, out);
      break;
    case 'codeBlock': {
      const text = typeof node.attrs?.['text'] === 'string' ? node.attrs['text'] : '';
      out.push(text);
      break;
    }
    case 'mathBlock': {
      const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
      out.push(latex);
      break;
    }
    case 'table':
      for (const row of node.children ?? []) {
        for (const cell of row.children ?? []) blockText(cell, out);
      }
      break;
    case 'tableRow':
    case 'tableCell':
      for (const child of node.children ?? []) blockText(child, out);
      break;
    case 'image': {
      const alt = typeof node.attrs?.['alt'] === 'string' ? node.attrs['alt'] : '';
      out.push(alt ? `[image: ${alt}]` : '[image]');
      break;
    }
    default:
      for (const child of node.children ?? []) blockText(child, out);
  }
}

export function blockPlainText(block: ContentBlock): string {
  const out: string[] = [];
  blockText(block.content, out);
  return out.filter((line) => line.length > 0).join('\n');
}

export function documentPlainText(document: NoteDocument): string {
  return Object.values(document.blocks)
    .map(blockPlainText)
    .filter((line) => line.length > 0)
    .join('\n');
}

function collectNodeText(node: ContentNode, out: string[]): string[] {
  if (typeof node.text === 'string' && node.text.length > 0) out.push(node.text);
  for (const child of node.children ?? []) collectNodeText(child, out);
  return out;
}

/**
 * Stable display title shared by Page Read chrome and the print compositor.
 *
 * The label wins; otherwise the first non-empty content node supplies the
 * title, and a whole-block text fallback keeps empty/unknown content visible.
 * Page/print use this one function so a continuation marker cannot drift.
 */
export function contentBlockTitle(block: ContentBlock | undefined): string {
  if (block === undefined) return 'Untitled block';
  if (typeof block.label === 'string' && block.label.trim().length > 0) {
    return block.label.trim();
  }
  const first = block.content.children?.find((node) => {
    const text = collectNodeText(node, []).join(' ').trim();
    return text.length > 0;
  });
  const text =
    first === undefined
      ? blockPlainText(block)
      : collectNodeText(first, []).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length === 0) return 'Empty block';
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

export function allBlockIdsInContent(node: ContentNode, out: string[] = []): string[] {
  const anchorId = node.attrs?.['anchorId'];
  if (typeof anchorId === 'string') out.push(anchorId);
  for (const child of node.children ?? []) allBlockIdsInContent(child, out);
  return out;
}

/**
 * Static validation that does not need measurement. Layout defects found here
 * are copied into the continuous layout.
 */
export function validateDocument(document: NoteDocument): LayoutDefect[] {
  const defects: LayoutDefect[] = [];
  const seenPrimary = new Map<string, string>();
  for (const branch of primaryBranches(document)) {
    if (!document.blocks[branch.targetBlockId]) {
      defects.push({
        code: 'unknown-block',
        severity: 'blocking',
        message: `Primary branch ${branch.id} targets unknown block ${branch.targetBlockId}.`,
        blockId: branch.targetBlockId,
        blocksExport: true,
      });
      continue;
    }
    if (!document.blocks[branch.source.blockId]) {
      defects.push({
        code: 'unknown-block',
        severity: 'blocking',
        message: `Primary branch ${branch.id} starts at unknown block ${branch.source.blockId}.`,
        blockId: branch.source.blockId,
        blocksExport: true,
      });
      continue;
    }
    const existing = seenPrimary.get(branch.targetBlockId);
    if (existing) {
      defects.push({
        code: 'duplicate-primary',
        severity: 'blocking',
        message: `Block ${branch.targetBlockId} has more than one primary parent (${existing}, ${branch.id}).`,
        blockId: branch.targetBlockId,
        blocksExport: true,
      });
    } else {
      seenPrimary.set(branch.targetBlockId, branch.id);
    }
  }

  // Primary cycle detection (reference cycles are allowed).
  const parent = new Map<string, string>();
  for (const [child, branch] of seenPrimary) {
    const branchRecord = document.branches[branch];
    if (branchRecord) parent.set(child, branchRecord.source.blockId);
  }
  for (const blockId of Object.keys(document.blocks)) {
    const path = new Set<string>();
    let current: string | undefined = blockId;
    while (current) {
      if (path.has(current)) {
        defects.push({
          code: 'primary-cycle',
          severity: 'blocking',
          message: `Primary-parent cycle detected at block ${current}.`,
          blockId,
          blocksExport: true,
        });
        break;
      }
      path.add(current);
      current = parent.get(current);
    }
  }

  const referenced = new Set<string>();
  for (const chapter of document.chapters) {
    for (const id of chapter.topLevelBlockIds) {
      if (!document.blocks[id]) {
        defects.push({
          code: 'unknown-block',
          severity: 'blocking',
          message: `Chapter ${chapter.id} references unknown top-level block ${id}.`,
          chapterId: chapter.id,
          blockId: id,
          blocksExport: true,
        });
      }
      referenced.add(id);
    }
  }
  for (const branch of primaryBranches(document)) {
    if (document.blocks[branch.source.blockId]) referenced.add(branch.source.blockId);
    if (document.blocks[branch.targetBlockId]) referenced.add(branch.targetBlockId);
  }
  for (const blockId of Object.keys(document.blocks)) {
    if (!referenced.has(blockId)) {
      defects.push({
        code: 'orphan-block',
        severity: 'warning',
        message: `Block ${blockId} is neither top-level nor the target of a primary branch; it is not laid out.`,
        blockId,
        blocksExport: false,
      });
    }
  }
  return defects;
}
