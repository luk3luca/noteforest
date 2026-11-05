/**
 * Canonical document validation (docs/spec.md §4.10 and §10.5).
 *
 * The validator never throws on malformed JSON data. It reports typed errors
 * and warnings, and treats unknown fields/content as forward-compatible data
 * (they are not errors and are never stripped).
 */

import type {
  AnchorBindingKindCheck,
  BlockAnchorIndex,
} from './anchors.js';
import {
  anchorSelectorMirrorIssues,
  buildBlockAnchorIndex,
  checkAnchorBindingKind,
  contentHasAnchorBinding,
  inspectAnchorBinding,
  isKnownAnchorKind,
  validateAnchorSelector,
} from './anchors.js';
import type { ValidationCode, ValidationIssue, ValidationReport, ValidationSeverity } from './errors.js';
import { formatIssues } from './errors.js';
import type { Anchor, AnchorKind, Branch, ContentNode, Document } from './types.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRelativeAssetPath(assetPath: string): boolean {
  if (assetPath.length === 0) return false;
  if (assetPath.startsWith('/') || assetPath.startsWith('\\')) return false;
  if (/^[A-Za-z]:[\\/]/.test(assetPath)) return false;
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) return false;
  const segments = assetPath.split(/[\\/]/);
  return !segments.includes('..');
}

class Collector {
  readonly errors: ValidationIssue[] = [];
  readonly warnings: ValidationIssue[] = [];
  private readonly seen = new Set<string>();

  add(
    severity: ValidationSeverity,
    code: ValidationCode,
    message: string,
    path?: string,
    ids?: string[],
  ): void {
    const key = `${severity}\u0000${code}\u0000${message}\u0000${path ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const issue: ValidationIssue = { severity, code, message };
    if (path !== undefined) issue.path = path;
    if (ids !== undefined) issue.ids = ids;
    if (severity === 'error') this.errors.push(issue);
    else this.warnings.push(issue);
  }

  error(
    code: ValidationCode,
    message: string,
    path?: string,
    ids?: string[],
  ): void {
    this.add('error', code, message, path, ids);
  }

  warning(
    code: ValidationCode,
    message: string,
    path?: string,
    ids?: string[],
  ): void {
    this.add('warning', code, message, path, ids);
  }
}

function validatePageSetup(value: unknown, collector: Collector): void {
  if (!isRecord(value)) {
    collector.error('invalid-page-setup', 'pageSetup must be an object', 'pageSetup');
    return;
  }
  if (value['size'] !== 'A4') {
    collector.error('invalid-page-setup', 'pageSetup.size must be "A4"', 'pageSetup.size');
  }
  const orientation = value['orientation'];
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    collector.error(
      'invalid-page-setup',
      'pageSetup.orientation must be "portrait" or "landscape"',
      'pageSetup.orientation',
    );
  }
  const margins = value['margins'];
  if (!isRecord(margins)) {
    collector.error('invalid-page-setup', 'pageSetup.margins must be an object', 'pageSetup.margins');
    return;
  }
  let validMargins = true;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const margin = margins[side];
    if (!isFiniteNumber(margin) || margin < 0) {
      validMargins = false;
      collector.error(
        'invalid-page-setup',
        `pageSetup.margins.${side} must be a finite non-negative number`,
        `pageSetup.margins.${side}`,
      );
    }
  }
  if (!validMargins || (orientation !== 'portrait' && orientation !== 'landscape')) return;
  const portrait = orientation === 'portrait';
  const pageWidth = portrait ? 210 : 297;
  const pageHeight = portrait ? 297 : 210;
  const top = margins['top'] as number;
  const right = margins['right'] as number;
  const bottom = margins['bottom'] as number;
  const left = margins['left'] as number;
  if (left + right >= pageWidth || top + bottom >= pageHeight) {
    collector.error(
      'invalid-page-setup',
      'page margins leave no positive content area',
      'pageSetup.margins',
    );
  }
}

function validateContentBlock(
  blockId: string,
  value: unknown,
  path: string,
  collector: Collector,
): void {
  if (!isRecord(value)) {
    collector.error('invalid-shape', 'block must be an object', path, [blockId]);
    return;
  }
  if (value['id'] !== blockId) {
    collector.error(
      'map-key-mismatch',
      `block map key "${blockId}" does not match block.id`,
      path,
      [blockId],
    );
  }
  const content = value['content'];
  if (!isRecord(content) || !isString(content['type'])) {
    collector.error(
      'invalid-content',
      'block.content must be a content node with a string "type"',
      `${path}.content`,
      [blockId],
    );
  } else {
    try {
      JSON.stringify(content);
    } catch {
      collector.error(
        'invalid-content',
        'block.content must be JSON-serializable',
        `${path}.content`,
        [blockId],
      );
    }
  }
  if (value['label'] !== undefined && !isString(value['label'])) {
    collector.error('invalid-shape', 'block.label must be a string', `${path}.label`, [blockId]);
  }
  const border = value['border'];
  if (border !== undefined && border !== 'none' && border !== 'subtle' && border !== 'strong') {
    collector.error(
      'invalid-shape',
      'block.border must be "none", "subtle", or "strong"',
      `${path}.border`,
      [blockId],
    );
  }
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (value[key] !== undefined && !isTimestamp(value[key])) {
      collector.error(
        'invalid-timestamp',
        `block.${key} must be an ISO 8601 timestamp`,
        `${path}.${key}`,
        [blockId],
      );
    }
  }
}

export function validateDocument(value: unknown): ValidationReport {
  const collector = new Collector();

  if (!isRecord(value)) {
    collector.error('invalid-shape', 'document must be a JSON object');
    return {
      ok: false,
      errors: collector.errors,
      warnings: collector.warnings,
      stats: { blocks: 0, chapters: 0, branches: 0, anchors: 0, assets: 0 },
    };
  }

  const blocksRaw = value['blocks'];
  const chaptersRaw = value['chapters'];
  const anchorsRaw = value['anchors'];
  const branchesRaw = value['branches'];
  const assetsRaw = value['assets'];

  const stats = {
    blocks: isRecord(blocksRaw) ? Object.keys(blocksRaw).length : 0,
    chapters: Array.isArray(chaptersRaw) ? chaptersRaw.length : 0,
    branches: isRecord(branchesRaw) ? Object.keys(branchesRaw).length : 0,
    anchors: isRecord(anchorsRaw) ? Object.keys(anchorsRaw).length : 0,
    assets: isRecord(assetsRaw) ? Object.keys(assetsRaw).length : 0,
  };

  // ---------------------------------------------------------------------
  // Shape and scalar fields.
  // ---------------------------------------------------------------------
  const schemaVersion = value['schemaVersion'];
  if (!isInteger(schemaVersion) || schemaVersion < 1) {
    collector.error(
      'invalid-schema-version',
      'schemaVersion must be a positive integer',
      'schemaVersion',
    );
  } else if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    collector.error(
      'invalid-schema-version',
      `schemaVersion ${schemaVersion} is newer than supported ${CURRENT_SCHEMA_VERSION}`,
      'schemaVersion',
    );
  }

  if (!isString(value['id']) || value['id'].length === 0) {
    collector.error('invalid-shape', 'document id must be a non-empty string', 'id');
  }
  if (!isString(value['title'])) {
    collector.error('invalid-shape', 'document title must be a string', 'title');
  }
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (!isTimestamp(value[key])) {
      collector.error('invalid-timestamp', `document ${key} must be an ISO 8601 timestamp`, key);
    }
  }
  const revision = value['revision'];
  if (!isInteger(revision) || revision < 0) {
    collector.error('invalid-revision', 'document revision must be a non-negative integer', 'revision');
  }
  validatePageSetup(value['pageSetup'], collector);

  if (value['manualBreakBeforeBlockIds'] === undefined) {
    collector.warning(
      'missing-field',
      'manualBreakBeforeBlockIds is missing; treated as an empty list',
      'manualBreakBeforeBlockIds',
    );
  } else if (!isStringArray(value['manualBreakBeforeBlockIds'])) {
    collector.error(
      'invalid-shape',
      'manualBreakBeforeBlockIds must be an array of block IDs',
      'manualBreakBeforeBlockIds',
    );
  }
  if (!Array.isArray(chaptersRaw)) {
    collector.error('invalid-shape', 'chapters must be an array', 'chapters');
  }
  if (!isRecord(blocksRaw)) {
    collector.error('invalid-shape', 'blocks must be an object map', 'blocks');
  }
  if (!isRecord(anchorsRaw)) {
    collector.error('invalid-shape', 'anchors must be an object map', 'anchors');
  }
  if (!isRecord(branchesRaw)) {
    collector.error('invalid-shape', 'branches must be an object map', 'branches');
  }
  if (!isRecord(assetsRaw)) {
    collector.error('invalid-shape', 'assets must be an object map', 'assets');
  }
  if (value['annotations'] !== undefined && !Array.isArray(value['annotations'])) {
    collector.error('invalid-shape', 'annotations must be an array', 'annotations');
  }
  if (value['viewState'] !== undefined && !isRecord(value['viewState'])) {
    collector.error('invalid-shape', 'viewState must be an object', 'viewState');
  }

  const containersOk =
    isRecord(blocksRaw) &&
    Array.isArray(chaptersRaw) &&
    isRecord(anchorsRaw) &&
    isRecord(branchesRaw) &&
    isRecord(assetsRaw);
  if (!containersOk) {
    return {
      ok: false,
      errors: collector.errors,
      warnings: collector.warnings,
      stats,
    };
  }

  // ---------------------------------------------------------------------
  // IDs are globally unique within the document (I1).
  // ---------------------------------------------------------------------
  const allIds = new Set<string>();
  const registerId = (id: string, kind: string, path: string): boolean => {
    if (allIds.has(id)) {
      collector.error(
        'duplicate-id',
        `duplicate ID "${id}" (${kind}); IDs must be globally unique`,
        path,
        [id],
      );
      return false;
    }
    allIds.add(id);
    return true;
  };

  const documentId = isString(value['id']) ? value['id'] : '';
  if (documentId.length > 0) registerId(documentId, 'document', 'id');

  const blockIds = new Set<string>();
  for (const [blockId, blockValue] of Object.entries(blocksRaw)) {
    registerId(blockId, 'block', `blocks.${blockId}`);
    blockIds.add(blockId);
    validateContentBlock(blockId, blockValue, `blocks.${blockId}`, collector);
  }

  const chapterIds = new Set<string>();
  const blockChapter = new Map<string, string>();
  const topLevelEntries: Array<{ blockId: string; chapterId: string; path: string }> = [];

  for (const [chapterIndex, chapterValue] of chaptersRaw.entries()) {
    const path = `chapters[${chapterIndex}]`;
    if (!isRecord(chapterValue)) {
      collector.error('invalid-shape', 'chapter must be an object', path);
      continue;
    }
    const chapterId = chapterValue['id'];
    if (!isString(chapterId) || chapterId.length === 0) {
      collector.error('invalid-shape', 'chapter id must be a non-empty string', `${path}.id`);
      continue;
    }
    if (chapterIds.has(chapterId)) {
      collector.error('duplicate-id', `duplicate chapter ID "${chapterId}"`, `${path}.id`, [chapterId]);
      continue;
    }
    chapterIds.add(chapterId);
    registerId(chapterId, 'chapter', `${path}.id`);
    if (chapterValue['title'] !== undefined && !isString(chapterValue['title'])) {
      collector.error('invalid-shape', 'chapter.title must be a string', `${path}.title`, [chapterId]);
    }
    const topLevel = chapterValue['topLevelBlockIds'];
    if (!isStringArray(topLevel)) {
      collector.error(
        'invalid-shape',
        'chapter.topLevelBlockIds must be an array of block IDs',
        `${path}.topLevelBlockIds`,
        [chapterId],
      );
      continue;
    }
    for (const [entryIndex, blockId] of topLevel.entries()) {
      const entryPath = `${path}.topLevelBlockIds[${entryIndex}]`;
      topLevelEntries.push({ blockId, chapterId, path: entryPath });
      if (!blockIds.has(blockId)) {
        collector.error(
          'unknown-block',
          `chapter references missing block "${blockId}"`,
          entryPath,
          [blockId],
        );
        continue;
      }
      const existing = blockChapter.get(blockId);
      if (existing !== undefined) {
        if (existing === chapterId) {
          collector.error(
            'duplicate-top-level-entry',
            `block "${blockId}" appears more than once in chapter "${chapterId}"`,
            entryPath,
            [blockId, chapterId],
          );
        } else {
          collector.error(
            'block-in-two-chapters',
            `block "${blockId}" is a top-level block in more than one chapter`,
            entryPath,
            [blockId, existing, chapterId],
          );
        }
        continue;
      }
      blockChapter.set(blockId, chapterId);
    }
  }

  if (chaptersRaw.length === 0) {
    collector.error('invalid-shape', 'a document must have at least one chapter', 'chapters');
  }

  // ---------------------------------------------------------------------
  // Anchors and assets (M3 binding/selector validation, A1–A5, A12).
  // ---------------------------------------------------------------------
  const blockAnchorIndexes = new Map<string, BlockAnchorIndex>();
  for (const blockId of blockIds) {
    const block = blocksRaw[blockId];
    if (!isRecord(block)) continue;
    const content = block['content'];
    if (!isRecord(content) || !isString(content['type'])) continue;
    const contentNode = content as unknown as ContentNode;
    if (!contentHasAnchorBinding(contentNode)) continue;
    blockAnchorIndexes.set(blockId, buildBlockAnchorIndex(blockId, contentNode));
  }

  for (const [anchorId, anchorValue] of Object.entries(anchorsRaw)) {
    const path = `anchors.${anchorId}`;
    if (!isRecord(anchorValue)) {
      collector.error('invalid-shape', 'anchor must be an object', path);
      continue;
    }
    registerId(anchorId, 'anchor', path);
    if (anchorValue['id'] !== anchorId) {
      collector.error(
        'map-key-mismatch',
        `anchor map key "${anchorId}" does not match anchor.id`,
        path,
        [anchorId],
      );
    }
    const anchorBlockId = anchorValue['blockId'];
    if (!isString(anchorBlockId) || !blockIds.has(anchorBlockId)) {
      collector.error(
        'dangling-anchor',
        `anchor "${anchorId}" belongs to a missing block`,
        `${path}.blockId`,
        [anchorId],
      );
    }

    const kindValue = anchorValue['kind'];
    let knownKind: AnchorKind | undefined;
    if (typeof kindValue !== 'string') {
      collector.error('invalid-shape', 'anchor.kind must be a string', `${path}.kind`, [anchorId]);
    } else if (isKnownAnchorKind(kindValue)) {
      knownKind = kindValue;
    } else {
      collector.warning(
        'unsupported-anchor-kind',
        `anchor "${anchorId}" has unknown kind "${kindValue}"; record preserved`,
        `${path}.kind`,
        [anchorId],
      );
    }

    const selectorValue = anchorValue['selector'];
    if (!isRecord(selectorValue)) {
      collector.error('invalid-shape', 'anchor.selector must be an object', `${path}.selector`, [
        anchorId,
      ]);
    } else {
      const selectorValidation = validateAnchorSelector(selectorValue, knownKind);
      for (const selectorIssue of selectorValidation.issues) {
        collector.warning(selectorIssue.code, selectorIssue.message, `${path}.selector`, [anchorId]);
      }
      for (const mirrorIssue of anchorSelectorMirrorIssues(anchorValue as unknown as Anchor)) {
        collector.warning(
          'anchor-selector-mismatch',
          mirrorIssue.message,
          path,
          [anchorId],
        );
      }
    }

    if (knownKind !== undefined && isString(anchorBlockId)) {
      const index = blockAnchorIndexes.get(anchorBlockId);
      if (index !== undefined) {
        const inspection = inspectAnchorBinding(index, anchorId);
        if (inspection.presence !== 'none') {
          const kindCheck: AnchorBindingKindCheck = checkAnchorBindingKind(inspection, knownKind);
          if (!kindCheck.ok) {
            collector.warning(
              'anchor-kind-mismatch',
              `anchor "${anchorId}" is bound to a content node that does not match its kind`,
              `${path}.kind`,
              [anchorId, anchorBlockId],
            );
          }
          if (inspection.reason === 'duplicate-binding' || inspection.reason === 'mixed-binding') {
            collector.warning(
              'duplicate-anchor-binding',
              `anchor "${anchorId}" has more than one binding in block "${anchorBlockId}"`,
              `${path}.id`,
              [anchorId, anchorBlockId],
            );
          } else if (inspection.reason === 'not-contiguous') {
            collector.warning(
              'anchor-not-contiguous',
              `text anchor "${anchorId}" has an unmarked gap between marked runs`,
              `${path}.id`,
              [anchorId, anchorBlockId],
            );
          } else if (inspection.reason === 'crosses-barrier') {
            collector.warning(
              'anchor-crosses-barrier',
              `text anchor "${anchorId}" crosses a block-level atomic node or table-cell boundary`,
              `${path}.id`,
              [anchorId, anchorBlockId],
            );
          } else if (
            inspection.reason === 'empty-binding' ||
            inspection.reason === 'invalid-binding'
          ) {
            collector.warning(
              'anchor-not-contiguous',
              `anchor "${anchorId}" has an empty or unusable content binding`,
              `${path}.id`,
              [anchorId, anchorBlockId],
            );
          }
        }
      }
    }
  }

  // A2: every content binding has a record in the block it claims. A record
  // without a binding is valid and resolves by selector. A mark without a
  // record is inert and never creates a phantom branch.
  for (const [blockId, index] of blockAnchorIndexes) {
    const contentPath = `blocks.${blockId}.content`;
    for (const anchorId of index.occurrences.keys()) {
      const record = anchorsRaw[anchorId];
      if (!isRecord(record)) {
        collector.warning(
          'anchor-without-record',
          `content binding "${anchorId}" has no anchor record; the mark is inert`,
          contentPath,
          [anchorId, blockId],
        );
        continue;
      }
      const declaredBlockId = record['blockId'];
      if (isString(declaredBlockId) && declaredBlockId !== blockId) {
        collector.warning(
          'anchor-binding-wrong-block',
          `anchor "${anchorId}" is bound in block "${blockId}" but belongs to "${declaredBlockId}"`,
          contentPath,
          [anchorId, blockId, declaredBlockId],
        );
      }
      if (index.occurrences.get(anchorId)?.some((occurrence) => occurrence.legacyConflict)) {
        collector.warning(
          'anchor-legacy-conflict',
          `anchor "${anchorId}" has both anchorIds and a legacy anchorId that is not listed`,
          contentPath,
          [anchorId, blockId],
        );
      }
    }
  }

  for (const [assetId, assetValue] of Object.entries(assetsRaw)) {
    const path = `assets.${assetId}`;
    if (!isRecord(assetValue)) {
      collector.error('invalid-shape', 'asset must be an object', path);
      continue;
    }
    registerId(assetId, 'asset', path);
    if (assetValue['id'] !== assetId) {
      collector.error(
        'map-key-mismatch',
        `asset map key "${assetId}" does not match asset.id`,
        path,
        [assetId],
      );
    }
    const assetPath = assetValue['path'];
    if (!isString(assetPath)) {
      collector.error('invalid-shape', 'asset.path must be a string', `${path}.path`, [assetId]);
    } else if (!isRelativeAssetPath(assetPath)) {
      collector.warning(
        'invalid-asset-path',
        `asset path "${assetPath}" must be relative and inside the package`,
        `${path}.path`,
        [assetId],
      );
    }
    if (!isString(assetValue['mime'])) {
      collector.error('invalid-shape', 'asset.mime must be a string', `${path}.mime`, [assetId]);
    }
  }

  // ---------------------------------------------------------------------
  // Branches: existence, roles, one primary parent, uniqueness (I2–I8).
  // ---------------------------------------------------------------------
  const parentOf = new Map<string, Branch>();
  const branchByTarget = new Map<string, string>();
  const duplicatePorts = new Map<string, string>();
  const orderPorts = new Map<string, string>();

  for (const [branchId, branchValue] of Object.entries(branchesRaw)) {
    const path = `branches.${branchId}`;
    if (!isRecord(branchValue)) {
      collector.error('invalid-shape', 'branch must be an object', path);
      continue;
    }
    registerId(branchId, 'branch', path);
    if (branchValue['id'] !== branchId) {
      collector.error(
        'map-key-mismatch',
        `branch map key "${branchId}" does not match branch.id`,
        path,
        [branchId],
      );
    }
    const source = branchValue['source'];
    if (!isRecord(source) || !isString(source['blockId'])) {
      collector.error('invalid-branch', 'branch.source.blockId must be a string', `${path}.source`, [
        branchId,
      ]);
      continue;
    }
    const sourceBlockId = source['blockId'];
    const anchorId = source['anchorId'];
    if (anchorId !== undefined && !isString(anchorId)) {
      collector.error(
        'invalid-branch',
        'branch.source.anchorId must be a string when present',
        `${path}.source.anchorId`,
        [branchId],
      );
    }
    const targetBlockId = branchValue['targetBlockId'];
    if (!isString(targetBlockId)) {
      collector.error(
        'invalid-branch',
        'branch.targetBlockId must be a string',
        `${path}.targetBlockId`,
        [branchId],
      );
      continue;
    }
    const role = branchValue['role'];
    if (role !== 'primary' && role !== 'reference') {
      collector.error(
        'invalid-branch',
        'branch.role must be "primary" or "reference"',
        `${path}.role`,
        [branchId],
      );
      continue;
    }
    const order = branchValue['order'];
    if (!isString(order)) {
      collector.error('invalid-branch', 'branch.order must be a string', `${path}.order`, [branchId]);
    }

    if (!blockIds.has(sourceBlockId)) {
      collector.error(
        'dangling-source',
        `branch source block "${sourceBlockId}" does not exist`,
        `${path}.source.blockId`,
        [branchId, sourceBlockId],
      );
    }
    if (!blockIds.has(targetBlockId)) {
      collector.error(
        'dangling-target',
        `branch target block "${targetBlockId}" does not exist`,
        `${path}.targetBlockId`,
        [branchId, targetBlockId],
      );
    }
    if (sourceBlockId === targetBlockId) {
      collector.error('self-branch', 'a branch cannot target its source block', path, [branchId]);
    }
    if (isString(anchorId)) {
      const anchor = anchorsRaw[anchorId];
      if (!isRecord(anchor)) {
        collector.error(
          'dangling-anchor',
          `branch source anchor "${anchorId}" does not exist`,
          `${path}.source.anchorId`,
          [branchId, anchorId],
        );
      } else if (anchor['blockId'] !== sourceBlockId) {
        collector.error(
          'dangling-anchor',
          `branch source anchor "${anchorId}" belongs to a different block`,
          `${path}.source.anchorId`,
          [branchId, anchorId],
        );
      }
    }

    const duplicateKey = `${sourceBlockId}\u0000${isString(anchorId) ? anchorId : ''}\u0000${targetBlockId}`;
    const previousBranchId = duplicatePorts.get(duplicateKey);
    if (previousBranchId !== undefined) {
      collector.warning(
        'duplicate-branch',
        'duplicate branch with the same source and target (role-independent); keep the primary edge',
        path,
        [branchId, previousBranchId],
      );
    } else {
      duplicatePorts.set(duplicateKey, branchId);
    }

    if (isString(order)) {
      const portKey = `${role}\u0000${sourceBlockId}\u0000${isString(anchorId) ? anchorId : ''}`;
      const orderKey = `${portKey}\u0000${order}`;
      if (orderPorts.has(orderKey)) {
        collector.warning(
          'duplicate-branch-order',
          `duplicate ${role} branch order "${order}" in one source port; tie-break by branch ID`,
          `${path}.order`,
          [branchId, orderPorts.get(orderKey) ?? ''],
        );
      } else {
        orderPorts.set(orderKey, branchId);
      }
    }

    if (role === 'primary') {
      const existingBranchId = branchByTarget.get(targetBlockId);
      if (existingBranchId !== undefined) {
        collector.error(
          'multiple-primary-parents',
          `block "${targetBlockId}" has more than one incoming primary branch`,
          path,
          [targetBlockId, existingBranchId, branchId],
        );
      } else {
        branchByTarget.set(targetBlockId, branchId);
        if (blockIds.has(sourceBlockId) && blockIds.has(targetBlockId)) {
          parentOf.set(targetBlockId, { ...branchValue, id: branchId } as Branch);
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Chapter assignment (I5–I6).
  // ---------------------------------------------------------------------
  for (const blockId of blockIds) {
    const isTopLevel = blockChapter.has(blockId);
    const hasParent = parentOf.has(blockId);
    if (!isTopLevel && !hasParent) {
      collector.error(
        'unassigned-block',
        `root block "${blockId}" is not assigned to exactly one chapter`,
        'chapters',
        [blockId],
      );
    }
    if (isTopLevel && hasParent) {
      collector.error(
        'top-level-block-has-parent',
        `top-level block "${blockId}" also has a primary parent`,
        'chapters',
        [blockId],
      );
    }
  }

  for (const entry of topLevelEntries) {
    if (blockChapter.get(entry.blockId) !== entry.chapterId) {
      // Duplicate assignment was reported above; avoid a second message.
      continue;
    }
    if (parentOf.has(entry.blockId)) {
      collector.error(
        'top-level-block-has-parent',
        `top-level block "${entry.blockId}" also has a primary parent`,
        entry.path,
        [entry.blockId],
      );
    }
  }

  // Every non-root block must live in the chapter of its top-level ancestor.
  const rootCache = new Map<string, string | null>();
  const resolveRoot = (blockId: string): string | null => {
    const cached = rootCache.get(blockId);
    if (cached !== undefined) return cached;
    const chain: string[] = [];
    const seen = new Set<string>();
    let current = blockId;
    for (;;) {
      const known = rootCache.get(current);
      if (known !== undefined) {
        for (const item of chain) rootCache.set(item, known);
        return known;
      }
      if (seen.has(current)) {
        for (const item of chain) rootCache.set(item, null);
        return null;
      }
      seen.add(current);
      chain.push(current);
      const parent = parentOf.get(current);
      if (parent === undefined) {
        for (const item of chain) rootCache.set(item, current);
        return current;
      }
      current = parent.source.blockId;
    }
  };

  for (const blockId of blockIds) {
    if (!parentOf.has(blockId)) continue;
    const root = resolveRoot(blockId);
    if (root === null) continue; // cycle reported below
    if (!blockChapter.has(root)) {
      collector.error(
        'unassigned-block',
        `block "${blockId}" belongs to parent chain with no chapter assignment`,
        'chapters',
        [blockId, root],
      );
    }
  }

  // ---------------------------------------------------------------------
  // Primary cycle detection (I4).
  // ---------------------------------------------------------------------
  const childrenByParent = new Map<string, string[]>();
  for (const branch of parentOf.values()) {
    const list = childrenByParent.get(branch.source.blockId) ?? [];
    list.push(branch.targetBlockId);
    childrenByParent.set(branch.source.blockId, list);
  }
  const visitState = new Map<string, 0 | 1 | 2>();
  const reportedCycles = new Set<string>();
  const stackPath: string[] = [];

  const visit = (blockId: string): void => {
    visitState.set(blockId, 1);
    stackPath.push(blockId);
    for (const child of childrenByParent.get(blockId) ?? []) {
      if (!blockIds.has(child)) continue;
      const state = visitState.get(child) ?? 0;
      if (state === 1) {
        const cycleStart = stackPath.indexOf(child);
        const cycle = cycleStart >= 0 ? stackPath.slice(cycleStart) : [child];
        const key = [...cycle].sort().join('\u0000');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          collector.error(
            'primary-cycle',
            `primary branch cycle: ${[...cycle, child].join(' → ')}`,
            'branches',
            [...cycle, child],
          );
        }
      } else if (state === 0) {
        visit(child);
      }
    }
    stackPath.pop();
    visitState.set(blockId, 2);
  };

  for (const blockId of blockIds) {
    if ((visitState.get(blockId) ?? 0) === 0) visit(blockId);
  }

  // ---------------------------------------------------------------------
  // Manual page-break hints (I7).
  // ---------------------------------------------------------------------
  const manualBreaks = value['manualBreakBeforeBlockIds'];
  if (isStringArray(manualBreaks)) {
    const seenHints = new Set<string>();
    for (const [index, blockId] of manualBreaks.entries()) {
      if (!blockIds.has(blockId)) {
        collector.warning(
          'invalid-break-hint',
          `manual break hint references missing block "${blockId}"`,
          `manualBreakBeforeBlockIds[${index}]`,
          [blockId],
        );
      } else if (seenHints.has(blockId)) {
        collector.warning(
          'invalid-break-hint',
          `duplicate manual break hint for block "${blockId}"`,
          `manualBreakBeforeBlockIds[${index}]`,
          [blockId],
        );
      }
      seenHints.add(blockId);
    }
  }

  return {
    ok: collector.errors.length === 0,
    errors: collector.errors,
    warnings: collector.warnings,
    stats,
  };
}

/** Throw a formatted error when validation fails; used by trusted fixtures. */
export function assertValidDocument(value: unknown): asserts value is Document {
  const report = validateDocument(value);
  if (!report.ok) {
    throw new Error(`Invalid document: ${formatIssues(report.errors)}`);
  }
}
