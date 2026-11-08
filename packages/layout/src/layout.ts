import {
  branchAnchorQuote,
  compareBranches,
  primaryChildrenMap,
  primaryParentMap,
  validateDocument,
} from './document.js';
import { clamp } from './geometry.js';
import type {
  AnchorAttachment,
  AnchorState,
  BlockMeasurement,
  BlockRole,
  BranchRecord,
  BreakCandidate,
  ChapterLayout,
  ContentBlock,
  ContinuousLayout,
  EdgeLayout,
  LayoutBlock,
  LayoutDefect,
  LayoutOptions,
  MeasurementMode,
  MeasurementPort,
  NoteDocument,
} from './types.js';
import { DEFAULT_LAYOUT_OPTIONS } from './types.js';
import type { PageGeometry, PageSetup } from './page-settings.js';
import { DEFAULT_PAGE_SETTINGS, pageGeometry } from './page-settings.js';

const EPSILON = 0.25;

interface IncomingAnchor {
  anchorId: string | null;
  state: AnchorState;
  rect: { x: number; y: number; width: number; height: number } | null;
  warningPoint: { x: number; y: number } | null;
}

interface PlacementContext {
  chapterId: string;
  role: BlockRole;
  parentBlockId: string | null;
  anchorId: string | null;
  depth: number;
  /**
   * Maximum chapter-local x this subtree may occupy. Page packing uses it to
   * keep a callout subtree inside the left column instead of letting it spill
   * into the direct-child group. Continuous uses the page content width.
   */
  rightLimit: number;
  /**
   * Minimum chapter-local x for a wrapped group inside this lane. The default
   * is the page content left, matching the ADR-0006 cap. A direct-child group
   * that sits beside anchored callouts raises it to the right column origin so
   * a wrapped descendant can never wrap back across the safe gap.
   */
  wrapFloor: number;
  incomingAnchor?: AnchorAttachment | null;
}

interface BesideCallout {
  branch: BranchRecord;
  target: ContentBlock;
  x: number;
  rightLimit: number;
  anchorId: string | null;
  attachment: AnchorAttachment | null;
}

interface ResolvedBlockBox {
  width: number;
  contentWidth: number;
  chrome: number;
  availableContent: number;
  measurement: BlockMeasurement;
  contentTooWide: boolean;
  horizontalOverflow: boolean;
}

/** Layout coordinates are chapter-local; a page content box starts at x = 0. */
const PAGE_CONTENT_LEFT = 0;

class LayoutBuilder {
  readonly document: NoteDocument;
  readonly port: MeasurementPort;
  readonly options: LayoutOptions;
  readonly pageSetup: PageSetup;
  readonly geometry: PageGeometry;
  readonly chapterPositions = new Map<string, ChapterLayout>();
  readonly blocks: LayoutBlock[] = [];
  readonly blockById: Record<string, LayoutBlock> = {};
  readonly anchors: AnchorAttachment[] = [];
  readonly edges: EdgeLayout[] = [];
  readonly defects: LayoutDefect[] = [];
  readonly childrenMap: Map<string, BranchRecord[]>;
  readonly measurementCache = new Map<string, BlockMeasurement>();
  readonly visited = new Set<string>();
  readonly stack = new Set<string>();
  readonly anchorStates = new Map<string, AnchorState>();
  measurementCalls = 0;

  constructor(
    document: NoteDocument,
    port: MeasurementPort,
    options: LayoutOptions,
    pageSetup: PageSetup,
  ) {
    this.document = document;
    this.port = port;
    this.options = options;
    this.pageSetup = pageSetup;
    this.geometry = pageGeometry(pageSetup);
    this.childrenMap = primaryChildrenMap(document);
    for (const defect of validateDocument(document)) this.addDefect(defect);
  }

  addDefect(defect: LayoutDefect): void {
    const duplicate = this.defects.some(
      (existing) =>
        existing.code === defect.code &&
        existing.blockId === defect.blockId &&
        existing.message === defect.message,
    );
    if (!duplicate) this.defects.push(defect);
  }

  measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
    const key =
      mode.kind === 'fixed'
        ? `${block.id}:fixed:${mode.contentWidth.toFixed(3)}`
        : `${block.id}:${mode.kind}`;
    const cached = this.measurementCache.get(key);
    if (cached) return cached;
    this.measurementCalls += 1;
    const measured = this.port.measure(block, mode);
    this.measurementCache.set(key, measured);
    return measured;
  }

  run(): ContinuousLayout {
    for (const [chapterIndex, chapter] of this.document.chapters.entries()) {
      let cursorY = 0;
      for (const blockId of chapter.topLevelBlockIds) {
        const block = this.document.blocks[blockId];
        if (!block) continue;
        if (this.visited.has(blockId)) {
          this.addDefect({
            code: 'duplicate-primary',
            severity: 'warning',
            message: `Block ${blockId} appears more than once in the chapter tree; only the first placement is kept.`,
            blockId,
            chapterId: chapter.id,
            blocksExport: false,
          });
          continue;
        }
        const placed = this.layoutBlock(block, chapter.id, 0, cursorY, {
          chapterId: chapter.id,
          role: 'top-level',
          parentBlockId: null,
          anchorId: null,
          depth: 0,
          rightLimit: this.geometry.contentWidthPx,
          wrapFloor: PAGE_CONTENT_LEFT,
        });
        cursorY = placed.subtreeBottom + this.options.chapterGap;
      }
      const height = Math.max(0, cursorY - this.options.chapterGap);
      if (chapter.topLevelBlockIds.length === 0) {
        this.addDefect({
          code: 'empty-chapter',
          severity: 'warning',
          message: `Chapter ${chapter.id} has no top-level blocks; it is skipped to avoid a blank page.`,
          chapterId: chapter.id,
          blocksExport: false,
        });
      }
      this.chapterPositions.set(chapter.id, {
        id: chapter.id,
        title: chapter.title,
        index: chapterIndex,
        topLevelBlockIds: chapter.topLevelBlockIds,
        height,
      });
    }

    for (const blockId of Object.keys(this.document.blocks)) {
      if (!this.visited.has(blockId)) {
        this.addDefect({
          code: 'orphan-block',
          severity: 'warning',
          message: `Block ${blockId} was not reached from any chapter through primary edges.`,
          blockId,
          blocksExport: false,
        });
      }
    }

    this.buildEdges();

    return {
      documentId: this.document.id,
      title: this.document.title,
      pageSetup: this.pageSetup,
      geometry: this.geometry,
      chapters: [...this.chapterPositions.values()],
      blocks: this.blocks,
      blockById: this.blockById,
      anchors: this.anchors,
      edges: this.edges,
      defects: this.defects,
      measurementCalls: this.measurementCalls,
    };
  }

  /**
   * Resolve the card box for a block in a given available width. This is the
   * single width policy used both by placement and by the direct-child group
   * fit test, so a "fits right" decision cannot diverge from the layout result.
   */
  private resolveBlockBox(block: ContentBlock, availableWidth: number): ResolvedBlockBox {
    const chrome = 2 * (this.options.cardPadding + this.options.cardBorder);
    const availableContent = Math.max(0, availableWidth - chrome);
    const maxMeasurement = this.measure(block, { kind: 'max-content' });
    // Text is capped at a readable measure. Unbreakable content (images, long
    // code lines, wide tables) may use the full page width before it becomes a
    // content-too-wide defect.
    const unbreakable = maxMeasurement.minContentWidth > this.options.maxContentWidth;
    const wanted = unbreakable
      ? Math.min(maxMeasurement.contentWidth, availableContent)
      : Math.max(
          this.options.minContentWidth,
          Math.min(maxMeasurement.contentWidth, this.options.maxContentWidth),
        );
    const desiredContent = Math.min(availableContent, wanted);
    const measurement = this.measure(block, { kind: 'fixed', contentWidth: desiredContent });
    const width = Math.min(availableWidth, measurement.cardWidth);
    const contentWidth = Math.max(0, width - chrome);
    return {
      width,
      contentWidth,
      chrome,
      availableContent,
      measurement,
      contentTooWide: measurement.minContentWidth > contentWidth + EPSILON,
      horizontalOverflow: width <= 0 || availableContent <= 0,
    };
  }

  /** Capped left origin for a child group that wraps below its parent. */
  private wrapOriginX(parentX: number, wrapFloor: number): number {
    return Math.max(
      Math.min(
        parentX + this.options.wrapIndent,
        PAGE_CONTENT_LEFT + this.options.maxWrapIndent,
      ),
      wrapFloor,
    );
  }

  /**
   * A capped wrap can move a child group left under an ancestor card that is
   * taller than its immediate parent. The group's x stays at the ADR origin;
   * the first child starts below any ancestor card that shares that horizontal
   * band, so the cap can never create an overlap.
   */
  private wrapKeepOutBottom(context: PlacementContext, wrapX: number): number {
    let bottom = 0;
    const seen = new Set<string>();
    let ancestorId = context.parentBlockId;
    while (ancestorId && !seen.has(ancestorId)) {
      seen.add(ancestorId);
      const ancestor = this.blockById[ancestorId];
      if (!ancestor) break;
      const sharesBand =
        ancestor.x + ancestor.width > wrapX + EPSILON &&
        ancestor.x < this.geometry.contentWidthPx - EPSILON;
      if (sharesBand) bottom = Math.max(bottom, ancestor.y + ancestor.height);
      ancestorId = ancestor.parentBlockId;
    }
    return bottom;
  }

  /**
   * The same max-content/min-content/minContentWidth comparison used before
   * M4a, plus the ADR-0006 safety check: a child whose own placement would still
   * report `layout-overflow` is treated as not fitting. The check is local to
   * the direct child; descendants apply their own group rule.
   */
  private directChildFitsRight(
    target: ContentBlock,
    rightX: number,
    rightLimit: number,
  ): boolean {
    const rightAvailable = Math.max(0, rightLimit - rightX);
    const rightContent = Math.max(0, rightAvailable - 2 * (this.options.cardPadding + this.options.cardBorder));
    if (rightContent <= 0) return false;
    const childMax = this.measure(target, { kind: 'max-content' });
    const wantedChild = Math.max(
      this.options.minContentWidth,
      Math.min(childMax.contentWidth, this.options.maxContentWidth),
    );
    const fitsBand =
      rightContent >= this.options.minContentWidth - EPSILON &&
      rightContent >= wantedChild - EPSILON &&
      rightContent >= childMax.minContentWidth - EPSILON;
    if (!fitsBand) return false;
    // Requirement 2: the child itself must be placeable without a horizontal
    // overflow defect. This does not inspect descendants.
    return !this.resolveBlockBox(target, rightAvailable).horizontalOverflow;
  }

  private layoutBlock(
    block: ContentBlock,
    chapterId: string,
    x: number,
    y: number,
    context: PlacementContext,
  ): LayoutBlock {
    if (this.stack.has(block.id)) {
      this.addDefect({
        code: 'primary-cycle',
        severity: 'blocking',
        message: `Primary cycle reached block ${block.id}; the recursive placement was stopped.`,
        blockId: block.id,
        chapterId,
        blocksExport: true,
      });
      const empty = this.measure(block, { kind: 'fixed', contentWidth: 0 });
      return this.makePlaceholderBlock(block, chapterId, x, y, context, empty);
    }
    this.stack.add(block.id);

    const availableWidth = Math.max(0, context.rightLimit - x);
    const box = this.resolveBlockBox(block, availableWidth);
    const { measurement, width, contentWidth } = box;

    if (box.contentTooWide) {
      this.addDefect({
        code: 'content-too-wide',
        severity: 'blocking',
        message: `Block ${block.id} has content that needs ${Math.round(measurement.minContentWidth)} px but only ${Math.round(contentWidth)} px is available. The content is not scaled or clipped.`,
        blockId: block.id,
        chapterId,
        blocksExport: true,
      });
    }
    if (box.horizontalOverflow) {
      this.addDefect({
        code: 'layout-overflow',
        severity: 'blocking',
        message: `Block ${block.id} has no horizontal room in chapter ${chapterId}.`,
        blockId: block.id,
        chapterId,
        blocksExport: true,
      });
    }
    for (const assetId of measurement.missingAssetIds) {
      this.addDefect({
        code: 'missing-asset',
        severity: 'warning',
        message: `Block ${block.id} references missing asset ${assetId}; a labeled placeholder is rendered.`,
        blockId: block.id,
        chapterId,
        blocksExport: false,
      });
    }

    const anchorAttachments = this.resolveAnchors(block, measurement, x, y, chapterId);
    const incoming = this.resolveIncomingAnchor(context.incomingAnchor ?? null);
    const breakCandidates: BreakCandidate[] = measurement.segments
      .filter((segment) => segment.breakableBefore)
      .map((segment) => ({
        kind: segment.kind,
        nodePath: segment.nodePath,
        y: segment.y,
        segmentIndex: segment.index,
      }));

    const layoutBlock: LayoutBlock = {
      blockId: block.id,
      chapterId,
      role: context.role,
      parentBlockId: context.parentBlockId,
      anchorId: context.anchorId,
      depth: context.depth,
      x,
      y,
      width,
      height: measurement.cardHeight,
      contentWidth,
      contentTop: measurement.contentTop,
      contentHeight: measurement.contentHeight,
      measurement,
      breakCandidates,
      childIds: [],
      anchorState: incoming.state,
      anchorPoint: incoming.rect,
      warningPoint: incoming.warningPoint,
      subtreeBottom: y + measurement.cardHeight,
    };

    this.blocks.push(layoutBlock);
    this.blockById[block.id] = layoutBlock;
    this.visited.add(block.id);

    const branches = [...(this.childrenMap.get(block.id) ?? [])];
    const anchored = branches
      .filter((branch) => Boolean(branch.source.anchorId))
      .sort((a, b) => this.compareAnchoredBranches(a, b, anchorAttachments));
    const direct = branches.filter((branch) => !branch.source.anchorId).sort(compareBranches);

    // Direct candidates are resolved before callouts: the beside decision
    // depends on whether the whole direct-child group can stay in the right
    // column at the parent's y.
    const rightX = x + width + this.options.siblingGap;
    const candidates: Array<{ branch: BranchRecord; target: ContentBlock; fitsRight: boolean }> = [];
    const fitsByTarget = new Map<string, boolean>();
    for (const branch of direct) {
      const target = this.document.blocks[branch.targetBlockId];
      if (!target) continue;
      if (this.visited.has(target.id)) {
        // A duplicate that is already placed must not influence the group's
        // fit decision; it is skipped with the same warning as before.
        this.noteDuplicatePrimary('Primary', branch, target, chapterId);
        continue;
      }
      let fitsRight = fitsByTarget.get(target.id);
      if (fitsRight === undefined) {
        fitsRight = this.directChildFitsRight(target, rightX, context.rightLimit);
        fitsByTarget.set(target.id, fitsRight);
      }
      candidates.push({ branch, target, fitsRight });
    }

    // ADR-0006: the group is atomic. It stays right only when every direct
    // child's own card fits; otherwise every direct child moves below the
    // parent at one capped left origin. The two other policies are lab oracles.
    const groupFitsRight = candidates.every((candidate) => candidate.fitsRight);
    const wrapAll = this.options.wrapPolicy === 'group-left-origin' && !groupFitsRight;
    const groupWrapX = this.wrapOriginX(x, context.wrapFloor);

    // R2b beside packing: anchored callouts keep the below-parent order in the
    // left column, while the direct-child group starts at the parent's y in
    // the right column. The callout lane ends at the parent's right edge, so
    // the right column starts one sibling gap later. If any callout cannot fit
    // the lane without a new width defect, the whole block keeps the stacked
    // order instead of clipping or overlapping.
    const besidePlan =
      this.options.pagePacking === 'beside' &&
      anchored.length > 0 &&
      candidates.length > 0 &&
      !wrapAll
        ? this.planBesideCallouts(anchored, anchorAttachments, x, width, chapterId)
        : null;
    const beside = besidePlan !== null && besidePlan.length > 0;

    let subtreeBottom = y + measurement.cardHeight;
    let calloutCursor = y + measurement.cardHeight + this.options.calloutGap;

    if (beside && besidePlan !== null) {
      for (const plan of besidePlan) {
        if (this.visited.has(plan.target.id)) {
          this.noteDuplicatePrimary('Anchored', plan.branch, plan.target, chapterId);
          continue;
        }
        const placed = this.layoutBlock(plan.target, chapterId, plan.x, calloutCursor, {
          chapterId,
          role: 'callout',
          parentBlockId: block.id,
          anchorId: plan.anchorId,
          depth: context.depth + 1,
          rightLimit: plan.rightLimit,
          wrapFloor: context.wrapFloor,
          incomingAnchor: plan.attachment,
        });
        layoutBlock.childIds.push(plan.target.id);
        calloutCursor = placed.subtreeBottom + this.options.calloutGap;
        subtreeBottom = Math.max(subtreeBottom, placed.subtreeBottom);
      }
    } else {
      for (const branch of anchored) {
        const target = this.document.blocks[branch.targetBlockId];
        if (!target) continue;
        if (this.visited.has(target.id)) {
          this.noteDuplicatePrimary('Anchored', branch, target, chapterId);
          continue;
        }
        const anchorId = branch.source.anchorId ?? null;
        const attachment = anchorId
          ? anchorAttachments.find((candidate) => candidate.anchorId === anchorId)
          : undefined;
        const anchorPoint = attachment?.rect ?? null;
        const warningPoint = attachment?.warningPoint ?? {
          x: x + width - 16,
          y: y + 8,
        };
        const calloutX = anchorPoint ? anchorPoint.x : warningPoint.x;
        const placed = this.layoutBlock(target, chapterId, calloutX, calloutCursor, {
          chapterId,
          role: 'callout',
          parentBlockId: block.id,
          anchorId,
          depth: context.depth + 1,
          rightLimit: context.rightLimit,
          wrapFloor: context.wrapFloor,
          incomingAnchor: attachment ?? null,
        });
        layoutBlock.childIds.push(target.id);
        calloutCursor = placed.subtreeBottom + this.options.calloutGap;
        subtreeBottom = Math.max(subtreeBottom, placed.subtreeBottom);
      }
    }

    // In stacked order the direct-child group starts after the callouts, as
    // before. In beside order it starts at the parent's y; the callouts own
    // the left column and the right group owns the right column.
    const directStartY = beside ? y : anchored.length > 0 ? calloutCursor : y;
    // A wrapped descendant of the beside group must stay in the right column;
    // wrapping back across the safe gap is what would collide with a callout.
    const childWrapFloor = beside ? Math.max(context.wrapFloor, rightX) : context.wrapFloor;

    let childCursor = directStartY;
    if (wrapAll) {
      const keepOutBottom = this.wrapKeepOutBottom(context, groupWrapX);
      childCursor = Math.max(
        childCursor,
        y + measurement.cardHeight + this.options.siblingGap,
        keepOutBottom > 0 ? keepOutBottom + this.options.siblingGap : 0,
      );
    }
    for (const { branch, target, fitsRight } of candidates) {
      if (this.visited.has(target.id)) {
        this.noteDuplicatePrimary('Primary', branch, target, chapterId);
        continue;
      }
      let childX: number;
      if (this.options.wrapPolicy === 'group-left-origin') {
        childX = wrapAll ? groupWrapX : rightX;
      } else if (this.options.wrapPolicy === 'subtree-aware') {
        childX = fitsRight ? rightX : groupWrapX;
      } else {
        // Pre-M4a regression oracle: the old per-child wrap at parent.x + wrapIndent.
        childX = fitsRight ? rightX : x + this.options.wrapIndent;
      }
      if (!fitsRight && this.options.wrapPolicy !== 'group-left-origin') {
        childCursor = Math.max(childCursor, y + measurement.cardHeight + this.options.siblingGap);
        if (this.options.wrapPolicy === 'subtree-aware') {
          const keepOutBottom = this.wrapKeepOutBottom(context, childX);
          childCursor = Math.max(
            childCursor,
            keepOutBottom > 0 ? keepOutBottom + this.options.siblingGap : 0,
          );
        }
      }
      const placed = this.layoutBlock(target, chapterId, childX, childCursor, {
        chapterId,
        role: 'child',
        parentBlockId: block.id,
        anchorId: null,
        depth: context.depth + 1,
        rightLimit: context.rightLimit,
        wrapFloor: childWrapFloor,
      });
      layoutBlock.childIds.push(target.id);
      childCursor = placed.subtreeBottom + this.options.siblingGap;
      subtreeBottom = Math.max(subtreeBottom, placed.subtreeBottom);
    }

    layoutBlock.subtreeBottom = subtreeBottom;
    this.stack.delete(block.id);
    return layoutBlock;
  }

  private noteDuplicatePrimary(
    kind: 'Primary' | 'Anchored',
    branch: BranchRecord,
    target: ContentBlock,
    chapterId: string,
  ): void {
    this.addDefect({
      code: 'duplicate-primary',
      severity: 'warning',
      message: `${kind} branch ${branch.id} targets block ${target.id}, which already has a primary home; the duplicate placement is skipped.`,
      blockId: target.id,
      chapterId,
      blocksExport: false,
    });
  }

  /**
   * Plan the R2b beside callout lane without placing anything.
   *
   * The left lane is the parent card's horizontal band. A callout keeps its
   * anchor-aligned x while that leaves the preferred minimum content width;
   * otherwise it clamps left to the parent content edge and keeps the
   * connector (spec OD-8). If even that lane cannot hold the callout's measured
   * min-content, the caller falls back to the stacked order for the block.
   */
  private planBesideCallouts(
    anchored: readonly BranchRecord[],
    anchorAttachments: readonly AnchorAttachment[],
    x: number,
    width: number,
    chapterId: string,
  ): BesideCallout[] | null {
    const laneLeft = x + this.options.cardPadding + this.options.cardBorder;
    const laneRight = x + width;
    const chrome = 2 * (this.options.cardPadding + this.options.cardBorder);
    const preferredCardWidth = this.options.minContentWidth + chrome;
    const plan: BesideCallout[] = [];
    for (const branch of anchored) {
      const target = this.document.blocks[branch.targetBlockId];
      if (!target) continue;
      if (this.visited.has(target.id)) {
        this.noteDuplicatePrimary('Anchored', branch, target, chapterId);
        continue;
      }
      const anchorId = branch.source.anchorId ?? null;
      const attachment = anchorId
        ? (anchorAttachments.find((candidate) => candidate.anchorId === anchorId) ?? null)
        : null;
      const desiredX = Math.max(
        laneLeft,
        attachment?.rect?.x ?? attachment?.warningPoint?.x ?? x + width - 16,
      );
      const calloutX = desiredX + preferredCardWidth <= laneRight + EPSILON
        ? desiredX
        : laneLeft;
      const available = laneRight - calloutX;
      if (available <= chrome + EPSILON) return null;
      const box = this.resolveBlockBox(target, available);
      if (box.contentTooWide || box.horizontalOverflow) return null;
      plan.push({
        branch,
        target,
        x: calloutX,
        rightLimit: laneRight,
        anchorId,
        attachment,
      });
    }
    return plan.length > 0 ? plan : null;
  }

  private makePlaceholderBlock(
    block: ContentBlock,
    chapterId: string,
    x: number,
    y: number,
    context: PlacementContext,
    measurement: BlockMeasurement,
  ): LayoutBlock {
    const width = Math.min(Math.max(0, context.rightLimit - x), measurement.cardWidth);
    const placeholder: LayoutBlock = {
      blockId: block.id,
      chapterId,
      role: context.role,
      parentBlockId: context.parentBlockId,
      anchorId: context.anchorId,
      depth: context.depth,
      x,
      y,
      width,
      height: Math.max(1, measurement.cardHeight),
      contentWidth: Math.max(0, width - 2 * (this.options.cardPadding + this.options.cardBorder)),
      contentTop: measurement.contentTop,
      contentHeight: measurement.contentHeight,
      measurement,
      breakCandidates: [],
      childIds: [],
      anchorState: 'none',
      anchorPoint: null,
      warningPoint: null,
      subtreeBottom: y + Math.max(1, measurement.cardHeight),
    };
    this.blocks.push(placeholder);
    this.blockById[block.id] = placeholder;
    this.visited.add(block.id);
    this.stack.delete(block.id);
    return placeholder;
  }

  private resolveAnchors(
    block: ContentBlock,
    measurement: BlockMeasurement,
    x: number,
    y: number,
    chapterId: string,
  ): AnchorAttachment[] {
    const attachments: AnchorAttachment[] = [];
    const contentLeft = x + this.options.cardPadding + this.options.cardBorder;
    const contentTop = y + measurement.contentTop;
    for (const record of Object.values(this.document.anchors)) {
      if (record.blockId !== block.id) continue;
      const rects = measurement.anchors
        .filter((anchor) => anchor.anchorId === record.id)
        .sort((a, b) => a.occurrence - b.occurrence);
      let chosen = rects.length === 1 ? rects[0] : undefined;
      let state: AnchorState;
      if (rects.length === 0) {
        state = 'broken';
      } else if (rects.length > 1) {
        const hint = record.occurrenceHint;
        const hinted = hint ? rects.find((rect) => rect.occurrence === hint - 1) : undefined;
        if (hinted) {
          chosen = hinted;
          state = 'resolved';
        } else {
          state = 'ambiguous';
        }
      } else {
        state = 'resolved';
      }
      const rect = chosen
        ? {
            x: contentLeft + chosen.x,
            y: contentTop + chosen.y,
            width: chosen.width,
            height: chosen.height,
          }
        : null;
      const warningPoint =
        state === 'resolved'
          ? null
          : {
              x: x + measurement.cardWidth - 16,
              y: y + Math.max(8, measurement.contentTop / 2),
            };
      const attachment: AnchorAttachment = {
        anchorId: record.id,
        blockId: block.id,
        state,
        rect,
        warningPoint,
      };
      attachments.push(attachment);
      this.anchors.push(attachment);
      this.anchorStates.set(record.id, state);
      if (state === 'broken') {
        this.addDefect({
          code: 'broken-anchor',
          severity: 'warning',
          message: `Anchor ${record.id} on block ${block.id} could not be resolved; its branch still exports once, marked at a fallback point.`,
          blockId: block.id,
          chapterId,
          blocksExport: false,
        });
      } else if (state === 'ambiguous') {
        this.addDefect({
          code: 'ambiguous-anchor',
          severity: 'warning',
          message: `Anchor ${record.id} on block ${block.id} matches multiple spans and needs explicit repair; the branch still exports once from a warning point.`,
          blockId: block.id,
          chapterId,
          blocksExport: false,
        });
      }
    }
    return attachments;
  }

  private resolveIncomingAnchor(attachment: AnchorAttachment | null): IncomingAnchor {
    if (!attachment) return { anchorId: null, state: 'none', rect: null, warningPoint: null };
    return {
      anchorId: attachment.anchorId,
      state: attachment.state,
      rect: attachment.rect,
      warningPoint: attachment.warningPoint,
    };
  }

  private compareAnchoredBranches(
    a: BranchRecord,
    b: BranchRecord,
    parentAnchors: AnchorAttachment[],
  ): number {
    const ao = this.anchorSortKey(a, parentAnchors);
    const bo = this.anchorSortKey(b, parentAnchors);
    if (ao.y !== bo.y) return ao.y - bo.y;
    if (ao.x !== bo.x) return ao.x - bo.x;
    return compareBranches(a, b);
  }

  private anchorSortKey(
    branch: BranchRecord,
    parentAnchors: AnchorAttachment[],
  ): { x: number; y: number } {
    const anchorId = branch.source.anchorId;
    const attachment = anchorId
      ? parentAnchors.find((candidate) => candidate.anchorId === anchorId)
      : undefined;
    if (attachment?.rect) return { x: attachment.rect.x, y: attachment.rect.y };
    return { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
  }

  private buildEdges(): void {
    for (const branch of Object.values(this.document.branches).sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )) {
      const from = this.blockById[branch.source.blockId];
      const to = this.blockById[branch.targetBlockId];
      if (!from || !to) continue;
      let fromPoint = { x: from.x + from.width, y: from.y + from.height / 2 };
      let anchorQuote: string | null = null;
      if (branch.source.anchorId) {
        const attachment = this.anchors.find(
          (candidate) =>
            candidate.anchorId === branch.source.anchorId && candidate.blockId === from.blockId,
        );
        if (attachment?.rect) {
          fromPoint = {
            x: attachment.rect.x + attachment.rect.width,
            y: attachment.rect.y + attachment.rect.height / 2,
          };
        } else if (attachment?.warningPoint) {
          fromPoint = attachment.warningPoint;
        }
        anchorQuote = branchAnchorQuote(this.document, branch);
      }
      const toPoint = { x: to.x, y: to.y + to.height / 2 };
      const crossChapter = from.chapterId !== to.chapterId;
      this.edges.push({
        branchId: branch.id,
        role: branch.role,
        fromBlockId: from.blockId,
        toBlockId: to.blockId,
        anchorId: branch.source.anchorId ?? null,
        chapterId: from.chapterId,
        from: fromPoint,
        to: toPoint,
        label: branch.label ?? anchorQuote ?? undefined,
        crossChapter,
      });
    }
  }
}

export function layoutDocument(
  document: NoteDocument,
  port: MeasurementPort,
  options: Partial<LayoutOptions> = {},
  pageSetup: PageSetup = DEFAULT_PAGE_SETTINGS.setup,
): ContinuousLayout {
  const resolvedOptions: LayoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  return new LayoutBuilder(document, port, resolvedOptions, pageSetup).run();
}

export function blockRect(block: LayoutBlock): { x: number; y: number; width: number; height: number } {
  return { x: block.x, y: block.y, width: block.width, height: block.height };
}

export function totalBlockCount(layout: ContinuousLayout): number {
  return layout.blocks.length;
}

export function clampContentWidth(
  measurement: BlockMeasurement,
  min: number,
  max: number,
): number {
  return clamp(measurement.contentWidth, min, max);
}
