import {
  branchAnchorQuote,
  compareBranches,
  primaryChildrenMap,
  primaryParentMap,
  validateDocument,
} from './document.js';
import { clamp } from './geometry.js';
import { PAGE_EDGE_STYLE } from './edge-style.js';
import type {
  AnchorAttachment,
  AnchorResolutionView,
  AnchorState,
  AnchorViewEntry,
  BlockMeasurement,
  BlockRole,
  BranchRecord,
  BreakCandidate,
  ChapterLayout,
  ContentBlock,
  ContinuousLayout,
  EdgeLayout,
  EdgePlacement,
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
  /** Semantic placement relative to the parent, decided by the caller. */
  placement: EdgePlacement;
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
   * is the page content left, matching the ADR-0006 cap.
   */
  wrapFloor: number;
  /**
   * Minimum chapter-local y for a wrapped group inside this lane. It keeps a
   * descendant wrap below the callout lane that belongs to its parent, even
   * when the descendant's own card is short. This lets a beside group use the
   * same left-origin wrap as a stacked group without crossing the callout lane.
   */
  wrapFloorY: number;
  /**
   * Left edge of the column that owns this subtree. Page compaction caps the
   * accumulated wrap indent at `columnOriginX + maxWrapIndent`, so a column can
   * reserve `max(subtree min card) + maxWrapIndent` and every descendant still
   * fits at a readable width. Continuous keeps the page content left.
   */
  columnOriginX: number;
  /** Page R2j B2 group discriminator; absent for Continuous and shared groups. */
  trunkGroup?: 'callout' | 'child';
  /** Page R2j below-trunk inset; absent uses `PAGE_EDGE_STYLE.trunkInset`. */
  trunkInset?: number;
  incomingAnchor?: AnchorAttachment | null;
}

/** R2j per-parent Page callout placement. */
type PageCalloutMode = 'A' | 'B2' | 'stacked';

/** One anchored callout before placement. */
interface CalloutEntry {
  branch: BranchRecord;
  target: ContentBlock;
  anchorId: string | null;
  attachment: AnchorAttachment | null;
}

interface BesideCallout {
  branch: BranchRecord;
  target: ContentBlock;
  x: number;
  rightLimit: number;
  anchorId: string | null;
  attachment: AnchorAttachment | null;
}

/** One ordered page-compaction component: an anchored callout or a direct child. */
interface CompactionComponent {
  branch: BranchRecord;
  target: ContentBlock;
  anchorId: string | null;
  attachment: AnchorAttachment | null;
  isCallout: boolean;
}

/** One placed component and the column width reserved for its subtree. */
interface CompactionColumn {
  component: CompactionComponent;
  allocation: number;
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

/** One block's right-column budget, with the wrap fallback applied recursively. */
interface SubtreeColumn {
  /** Outer card width resolved at the requested available width. */
  cardWidth: number;
  /**
   * Width of the right column this subtree needs when descendant groups may
   * wrap below their own parent: the card plus the widest child column when
   * the whole child group fits to the right, otherwise just the card.
   */
  preferredWidth: number;
  /**
   * True when the card and every descendant group stay to the right inside the
   * requested available width. Any wrap below a block makes this false, so a
   * parent can move the whole direct-child group below instead of burning a
   * lower-left column under a child that stayed right.
   */
  fits: boolean;
}

/** Layout coordinates are chapter-local; a page content box starts at x = 0. */
const PAGE_CONTENT_LEFT = 0;
/**
 * Legacy R2b beside-lane readability floor (pre-A/B2 callout modes).
 *
 * The production Page path uses the resolved `PageTheme.minContentWidth`
 * through the A/B2 callout modes. This smaller historical floor survives only
 * for the explicit `calloutModes: false` regression oracle, so it is an engine
 * constant, not a Page design token.
 */
const LEGACY_BESIDE_READABLE_WIDTH = 144;
/**
 * Legacy R2b fallback inset from the parent right edge for a callout warning
 * anchor. Kept as an engine constant for the same regression oracle; the
 * production path resolves a real anchor or the line start.
 */
const LEGACY_BESIDE_ANCHOR_INSET = 16;

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
  /** Page-compaction preferred subtree widths, keyed by block + available width. */
  readonly preferredWidthCache = new Map<string, number>();
  readonly preferredWidthStack = new Set<string>();
  /** Page-compaction subtree min-card widths, keyed by block + available width. */
  readonly subtreeMinCardCache = new Map<string, number>();
  readonly subtreeMinCardStack = new Set<string>();
  /** R2i right-column budget per block + available width. */
  readonly subtreeColumnCache = new Map<string, SubtreeColumn>();
  readonly subtreeColumnStack = new Set<string>();
  readonly visited = new Set<string>();
  readonly stack = new Set<string>();
  /** Resolved anchors whose range had no measured rect (diagnostic only). */
  readonly anchorGeometryFallbacks: string[] = [];
  readonly anchorView: AnchorResolutionView | null;
  measurementCalls = 0;

  constructor(
    document: NoteDocument,
    port: MeasurementPort,
    options: LayoutOptions,
    pageSetup: PageSetup,
    anchorView: AnchorResolutionView | null = null,
  ) {
    this.document = document;
    this.port = port;
    this.options = options;
    this.pageSetup = pageSetup;
    this.anchorView = anchorView;
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
          placement: 'below',
          parentBlockId: null,
          anchorId: null,
          depth: 0,
          rightLimit: this.geometry.contentWidthPx,
          wrapFloor: PAGE_CONTENT_LEFT,
          wrapFloorY: 0,
          columnOriginX: PAGE_CONTENT_LEFT,
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
      // Identity of the measured run, checked by the print model (M4c2 R1/R5).
      revision: this.document.revision,
      title: this.document.title,
      pageSetup: this.pageSetup,
      layoutOptions: this.options,
      geometry: this.geometry,
      chapters: [...this.chapterPositions.values()],
      blocks: this.blocks,
      blockById: this.blockById,
      anchors: this.anchors,
      edges: this.edges,
      defects: this.defects,
      anchorGeometryFallbacks: [...this.anchorGeometryFallbacks],
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
    // A rendered inline formula never wraps or shrinks. Once it is wider than
    // the readable measure, the card takes the whole available Page content
    // width (plan #12), like the display-formula/wide-table case. A formula
    // wider than that content box stays `content-too-wide` through the
    // unbreakable minimum below; no second overflow mode.
    const formulaGrowsCard =
      maxMeasurement.inlineFormulaWidth > this.options.maxContentWidth;
    const wanted = formulaGrowsCard
      ? availableContent
      : unbreakable
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

  /**
   * Left origin for a child group that wraps below its parent.
   *
   * Product-owner tree rule (8 November 2026): the group starts one wrap
   * indent from its own parent, not from a global page-left column. If that
   * origin would push the widest card past the right limit, shift the group
   * left just enough to fit. This keeps a wrapped grandchild under its own
   * parent subtree instead of jumping back to the page left.
   *
   * R2i: the per-level indent is the PageTheme `childIndent` token. It has to
   * leave room for the below trunk and its 12 px left stem, so the effective
   * indent is at least `wrapIndent` and at most `maxWrapIndent`.
   *
   * R2j1/corridor: the child indent is a hard floor. A density- or
   * custom-scaled `maxWrapIndent` below it (for example 21.6 px at 60%) must not
   * pull a wrapped child inside the 12 + 14 px artery.
   *
   * R2j1: a group whose max-content width nearly fills the page used to be
   * shifted to the content left, which put the below trunk exactly on the
   * child card's left edge: the horizontal arm had zero length and the
   * arrowhead disappeared. When the child cards are still readable at the
   * stem origin, reserve `trunkInset + stemMin`; the cards reflow narrower and
   * the arm keeps a visible 12 px left stem. If an unbreakable child cannot
   * fit there, the caller falls back to the old shift so a genuine width defect
   * stays explicit instead of being hidden by a forced overlap.
   */
  private wrapOriginX(
    parentX: number,
    rightLimit: number,
    groupWidth: number,
    wrapFloor: number,
    minimumStemOrigin = PAGE_CONTENT_LEFT,
  ): number {
    const indent = Math.max(
      this.options.childIndent,
      Math.min(this.options.maxWrapIndent, this.options.wrapIndent),
    );
    const preferred = Math.max(parentX + indent, minimumStemOrigin);
    const maxStart = Math.max(PAGE_CONTENT_LEFT, rightLimit - groupWidth);
    const start = Math.max(minimumStemOrigin, maxStart);
    return Math.max(wrapFloor, Math.min(preferred, start));
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
   * Card-only fit test used by the lab wrap policies and as the base case of
   * the R2i subtree recursion.
   *
   * The same max-content/min-content/minContentWidth comparison used before
   * M4a, plus the ADR-0006 safety check: a child whose own placement would still
   * report `layout-overflow` is treated as not fitting. The check is local to
   * the card; descendants apply their own group rule.
   */
  private cardFitsAvailable(target: ContentBlock, available: number): boolean {
    const rightContent = Math.max(
      0,
      available - 2 * (this.options.cardPadding + this.options.cardBorder),
    );
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
    return !this.resolveBlockBox(target, available).horizontalOverflow;
  }

  private directChildFitsRight(
    target: ContentBlock,
    rightX: number,
    rightLimit: number,
  ): boolean {
    return this.cardFitsAvailable(target, Math.max(0, rightLimit - rightX));
  }

  /** Direct primary targets; anchored callouts own the below lane, not the right column. */
  private directTargets(blockId: string): ContentBlock[] {
    const targets: ContentBlock[] = [];
    for (const branch of this.childrenMap.get(blockId) ?? []) {
      if (branch.source.anchorId) continue;
      const target = this.document.blocks[branch.targetBlockId];
      if (target) targets.push(target);
    }
    return targets;
  }

  /**
   * R2i right-column budget for one block at `available` width.
   *
   * It is the same card box policy used by placement, so a "fits right"
   * decision cannot diverge from the layout result. A block contributes its
   * card plus the widest child column only when the whole child group fits to
   * the right recursively; otherwise the group would wrap below it and the
   * subtree contributes only its own card. `fits` is the strict recursive
   * answer the parent group decision needs: it is false when any level would
   * wrap below.
   *
   * Cached by block and available width. A primary cycle (invalid document)
   * is treated as not fitting; the placement pass still reports the cycle.
   */
  private subtreeColumn(target: ContentBlock, available: number): SubtreeColumn {
    if (available <= EPSILON) {
      return { cardWidth: 0, preferredWidth: 0, fits: false };
    }
    const key = `${target.id}:${available.toFixed(2)}`;
    const cached = this.subtreeColumnCache.get(key);
    if (cached) return cached;

    const box = this.resolveBlockBox(target, available);
    const cardWidth = Math.max(0, box.width);
    const cardFits = this.cardFitsAvailable(target, available);
    const children = this.directTargets(target.id);
    if (children.length === 0) {
      const column: SubtreeColumn = {
        cardWidth,
        preferredWidth: cardWidth,
        fits: cardFits,
      };
      this.subtreeColumnCache.set(key, column);
      return column;
    }

    const remaining = available - cardWidth - this.options.rightGroupGap;
    if (!cardFits || remaining <= EPSILON || this.subtreeColumnStack.has(target.id)) {
      const column: SubtreeColumn = {
        cardWidth,
        preferredWidth: cardWidth,
        fits: false,
      };
      this.subtreeColumnCache.set(key, column);
      return column;
    }

    this.subtreeColumnStack.add(target.id);
    let widestChild = 0;
    let childrenFit = true;
    for (const child of children) {
      const childColumn = this.subtreeColumn(child, remaining);
      widestChild = Math.max(widestChild, childColumn.preferredWidth);
      if (!childColumn.fits) childrenFit = false;
    }
    this.subtreeColumnStack.delete(target.id);

    const fits = childrenFit && widestChild <= remaining + EPSILON;
    const column: SubtreeColumn = {
      cardWidth,
      preferredWidth: fits
        ? cardWidth + this.options.rightGroupGap + widestChild
        : cardWidth,
      fits,
    };
    this.subtreeColumnCache.set(key, column);
    return column;
  }

  /** R2i: does the whole subtree stay right at this origin? */
  private subtreeFitsRight(target: ContentBlock, available: number): boolean {
    return this.subtreeColumn(target, available).fits;
  }

  /**
   * R2j: can a block card sit at a fixed offset without a blocking width
   * defect? Unlike `cardFitsAvailable`, this accepts a narrower reflowed card
   * as long as it keeps `minContentWidth` and its unbreakable min content. It
   * is the mode A/B2 readability gate, not a beside-column preference.
   */
  private fitsAtOffset(target: ContentBlock, available: number): boolean {
    if (available <= EPSILON) return false;
    const chrome = 2 * (this.options.cardPadding + this.options.cardBorder);
    const content = available - chrome;
    if (content < this.options.minContentWidth - EPSILON) return false;
    const max = this.measure(target, { kind: 'max-content' });
    if (max.minContentWidth > content + EPSILON) return false;
    const box = this.resolveBlockBox(target, available);
    return !box.contentTooWide && !box.horizontalOverflow;
  }

  /**
   * R2j per-parent callout mode.
   *
   * A: the callout stack fits the free right lane of the parent card. B2: the
   * parent is placed in a below row, with an outer child trunk at
   * `childTrunkInset` and an inner callout trunk at `calloutTrunkInset`; both
   * fixed card offsets must keep a readable card and a full left stem.
   * Otherwise the block keeps the stacked order (callouts first, children
   * below). The decision uses the resolved page right limit and the placed
   * parent box, never a viewport or zoom.
   */
  private planCalloutMode(input: {
    x: number;
    width: number;
    rightLimit: number;
    callouts: readonly CalloutEntry[];
    children: readonly ContentBlock[];
  }): PageCalloutMode {
    const { x, width, rightLimit, callouts, children } = input;
    if (callouts.length === 0 || children.length === 0) return 'stacked';

    const laneLeft = x + width + this.options.calloutRightGap;
    const laneAvailable = rightLimit - laneLeft;
    if (
      laneAvailable >= this.options.calloutModeMinWidth - EPSILON &&
      callouts.every((entry) => this.fitsAtOffset(entry.target, laneAvailable))
    ) {
      return 'A';
    }

    const calloutStem = this.options.calloutCardIndent - this.options.calloutTrunkInset;
    const childStem = this.options.childIndent - this.options.childTrunkInset;
    if (
      calloutStem < PAGE_EDGE_STYLE.stemMin - EPSILON ||
      childStem < PAGE_EDGE_STYLE.stemMin - EPSILON
    ) {
      return 'stacked';
    }
    const calloutAvailable = rightLimit - (x + this.options.calloutCardIndent);
    const childAvailable = rightLimit - (x + this.options.childIndent);
    if (
      callouts.every((entry) => this.fitsAtOffset(entry.target, calloutAvailable)) &&
      children.every((target) => this.fitsAtOffset(target, childAvailable))
    ) {
      return 'B2';
    }
    return 'stacked';
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
      placement: context.placement,
      ...(context.trunkGroup === undefined ? {} : { trunkGroup: context.trunkGroup }),
      ...(context.trunkInset === undefined ? {} : { trunkInset: context.trunkInset }),
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

    // R2c page compaction: the block owns a row, and every callout/child is an
    // ordered component placed left-to-right at its measured width. Each
    // component owns a column for its own recursive row, so a subtree cannot
    // collide with the next sibling. Reference branches are not components.
    if (this.options.pagePacking === 'compaction') {
      const subtreeBottom = this.layoutCompactionComponents(
        layoutBlock,
        chapterId,
        x,
        y,
        width,
        measurement,
        anchored,
        direct,
        anchorAttachments,
        context,
      );
      layoutBlock.subtreeBottom = subtreeBottom;
      this.stack.delete(block.id);
      return layoutBlock;
    }

    // Direct candidates are resolved before callouts: the beside decision
    // depends on whether the whole direct-child group can stay in the right
    // column at the parent's y.
    const rightX = x + width + this.options.rightGroupGap;
    const rightAvailable = Math.max(0, context.rightLimit - rightX);
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
        // R2i production rule: the whole subtree has to fit right, not only
        // the child card. The lab policies keep their documented own-card
        // oracles so the regression comparison stays intact.
        fitsRight =
          this.options.wrapPolicy === 'group-left-origin'
            ? this.subtreeFitsRight(target, rightAvailable)
            : this.directChildFitsRight(target, rightX, context.rightLimit);
        fitsByTarget.set(target.id, fitsRight);
      }
      candidates.push({ branch, target, fitsRight });
    }

    // ADR-0006: the group is atomic. It stays right only when every direct
    // child's own card fits; otherwise every direct child moves below the
    // parent at one capped left origin. The two other policies are lab oracles.
    const groupFitsRight = candidates.every((candidate) => candidate.fitsRight);
    const wrapAll = this.options.wrapPolicy === 'group-left-origin' && !groupFitsRight;
    const chrome = 2 * (this.options.cardPadding + this.options.cardBorder);
    const groupWidth = candidates.reduce((widest, candidate) => {
      const max = this.measure(candidate.target, { kind: 'max-content' });
      return Math.max(
        widest,
        Math.min(max.contentWidth, this.options.maxContentWidth) + chrome,
      );
    }, 0);
    // R2j1: the below group must keep a visible 12 px left stem. The old
    // shift-to-fit moved a nearly full-width child group to the content left,
    // so the trunk sat on the card edge and the arrowhead vanished. Reserve
    // the stem only when every direct-child card is still readable there;
    // unbreakable content keeps the old shift and its explicit width defect.
    const effectiveIndent = Math.min(
      this.options.maxWrapIndent,
      Math.max(this.options.wrapIndent, this.options.childIndent),
    );
    const stemOrigin = Math.max(
      context.wrapFloor,
      x + PAGE_EDGE_STYLE.trunkInset + PAGE_EDGE_STYLE.stemMin,
    );
    const keepStem =
      effectiveIndent >=
        PAGE_EDGE_STYLE.trunkInset + PAGE_EDGE_STYLE.stemMin - EPSILON &&
      stemOrigin > context.wrapFloor + EPSILON &&
      stemOrigin < context.rightLimit - EPSILON &&
      candidates.every((candidate) =>
        this.fitsAtOffset(candidate.target, context.rightLimit - stemOrigin),
      );
    const groupWrapX = this.wrapOriginX(
      x,
      context.rightLimit,
      groupWidth,
      context.wrapFloor,
      keepStem ? stemOrigin : PAGE_CONTENT_LEFT,
    );

    // R2j: resolve anchored callouts before choosing a mode. The page-only
    // modes are part of the beside tree packing; the explicit `stacked` policy
    // keeps the historical geometry. Duplicate targets are reported during the
    // placement loop, exactly as before.
    const calloutEntries: CalloutEntry[] = [];
    for (const branch of anchored) {
      const target = this.document.blocks[branch.targetBlockId];
      if (!target) continue;
      const anchorId = branch.source.anchorId ?? null;
      const attachment = anchorId
        ? (anchorAttachments.find((candidate) => candidate.anchorId === anchorId) ?? null)
        : null;
      calloutEntries.push({ branch, target, anchorId, attachment });
    }
    const useCalloutModes =
      this.options.calloutModes && this.options.wrapPolicy === 'group-left-origin';
    const calloutMode: PageCalloutMode = useCalloutModes
      ? this.planCalloutMode({
          x,
          width,
          rightLimit: context.rightLimit,
          callouts: calloutEntries.filter((entry) => !this.visited.has(entry.target.id)),
          children: candidates.map((candidate) => candidate.target),
        })
      : 'stacked';
    const childrenBelowInMode = calloutMode === 'A' || calloutMode === 'B2';
    const cardBottom = y + measurement.cardHeight;

    // R2b beside packing (legacy/no-mode path): anchored callouts keep the
    // below-parent order in the left column, while the direct-child group
    // starts at the parent's y in the right column. The callout lane ends at
    // the parent's right edge, so the right column starts one right-group
    // corridor (horizontal) later. If any callout cannot fit the lane without
    // a new width defect, the whole block keeps the stacked order instead of
    // clipping.
    const besidePlan =
      !useCalloutModes &&
      this.options.pagePacking === 'beside' &&
      anchored.length > 0 &&
      candidates.length > 0 &&
      !wrapAll
        ? this.planBesideCallouts(anchored, anchorAttachments, x, width, chapterId)
        : null;
    const beside = besidePlan !== null && besidePlan.length > 0;

    let subtreeBottom = cardBottom;
    let calloutCursor = cardBottom + this.options.calloutGap;
    let calloutStackBottom = cardBottom;

    if (childrenBelowInMode) {
      const calloutX =
        calloutMode === 'A' ? x + width + this.options.calloutRightGap : x + this.options.calloutCardIndent;
      if (calloutMode === 'A') {
        // Mode A: the callout stack shares the parent card's top y. The leader
        // may leave through the parent's right edge.
        calloutCursor = y;
      } else {
        // Mode B2: callouts start below the parent, on the inner/right trunk.
        calloutCursor = Math.max(
          cardBottom + this.options.calloutGap,
          this.wrapKeepOutBottom(context, calloutX) + this.options.calloutGap,
        );
      }
      for (const entry of calloutEntries) {
        if (this.visited.has(entry.target.id)) {
          this.noteDuplicatePrimary('Anchored', entry.branch, entry.target, chapterId);
          continue;
        }
        const placed = this.layoutBlock(entry.target, chapterId, calloutX, calloutCursor, {
          chapterId,
          role: 'callout',
          placement: calloutMode === 'A' ? 'right' : 'below',
          ...(calloutMode === 'B2'
            ? {
                trunkGroup: 'callout' as const,
                trunkInset: this.options.calloutTrunkInset,
              }
            : {}),
          parentBlockId: block.id,
          anchorId: entry.anchorId,
          depth: context.depth + 1,
          rightLimit: context.rightLimit,
          wrapFloor: context.wrapFloor,
          wrapFloorY: context.wrapFloorY,
          columnOriginX: context.columnOriginX,
          incomingAnchor: entry.attachment,
        });
        layoutBlock.childIds.push(entry.target.id);
        calloutCursor = placed.subtreeBottom + this.options.calloutGap;
        calloutStackBottom = Math.max(calloutStackBottom, placed.subtreeBottom);
        subtreeBottom = Math.max(subtreeBottom, placed.subtreeBottom);
      }
    } else if (beside && besidePlan !== null) {
      for (const plan of besidePlan) {
        if (this.visited.has(plan.target.id)) {
          this.noteDuplicatePrimary('Anchored', plan.branch, plan.target, chapterId);
          continue;
        }
        const placed = this.layoutBlock(plan.target, chapterId, plan.x, calloutCursor, {
          chapterId,
          role: 'callout',
          placement: 'below',
          ...(plan.attachment?.calloutTrunkInset === undefined
            ? {}
            : { trunkInset: plan.attachment.calloutTrunkInset }),
          parentBlockId: block.id,
          anchorId: plan.anchorId,
          depth: context.depth + 1,
          rightLimit: plan.rightLimit,
          wrapFloor: context.wrapFloor,
          wrapFloorY: context.wrapFloorY,
          columnOriginX: context.columnOriginX,
          incomingAnchor: plan.attachment,
        });
        layoutBlock.childIds.push(plan.target.id);
        calloutCursor = placed.subtreeBottom + this.options.calloutGap;
        calloutStackBottom = Math.max(calloutStackBottom, placed.subtreeBottom);
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
        const warningPoint = attachment?.warningPoint ?? {
          x: x + width - 16,
          y: y + 8,
        };
        // The card keeps its measured/fallback lane even when the anchor is a
        // dot; the dot and the edge stay at the warning point.
        const calloutX = attachment?.calloutX ?? warningPoint.x;
        const placed = this.layoutBlock(target, chapterId, calloutX, calloutCursor, {
          chapterId,
          role: 'callout',
          placement: 'below',
          ...(attachment?.calloutTrunkInset === undefined
            ? {}
            : { trunkInset: attachment.calloutTrunkInset }),
          parentBlockId: block.id,
          anchorId,
          depth: context.depth + 1,
          rightLimit: context.rightLimit,
          wrapFloor: context.wrapFloor,
          wrapFloorY: context.wrapFloorY,
          columnOriginX: context.columnOriginX,
          incomingAnchor: attachment ?? null,
        });
        layoutBlock.childIds.push(target.id);
        calloutCursor = placed.subtreeBottom + this.options.calloutGap;
        calloutStackBottom = Math.max(calloutStackBottom, placed.subtreeBottom);
        subtreeBottom = Math.max(subtreeBottom, placed.subtreeBottom);
      }
    }

    // In stacked order the direct-child group starts after the callouts, as
    // before. In beside order it starts at the parent's y; the callouts own
    // the left column and the right group owns the right column. In mode A/B2
    // the lane decision already moved the child group below the parent and the
    // callout stack; this is the "re-check" for a lane that changes the origin.
    const directStartY = childrenBelowInMode
      ? Math.max(
          cardBottom + this.options.siblingGap,
          calloutStackBottom + this.options.siblingGap,
        )
      : beside
        ? y
        : anchored.length > 0
          ? calloutCursor
          : y;
    const childWrapFloor = context.wrapFloor;
    const childWrapFloorY = childrenBelowInMode
      ? directStartY
      : Math.max(
          context.wrapFloorY,
          anchored.length > 0 ? subtreeBottom + this.options.siblingGap : 0,
        );
    const childModeX =
      calloutMode === 'B2' ? x + this.options.childIndent : groupWrapX;

    let childCursor = directStartY;
    if (wrapAll || childrenBelowInMode) {
      const keepOutBottom = this.wrapKeepOutBottom(context, childModeX);
      childCursor = Math.max(
        childCursor,
        cardBottom + this.options.siblingGap,
        childWrapFloorY,
        keepOutBottom > 0 ? keepOutBottom + this.options.siblingGap : 0,
      );
    }
    for (const { branch, target, fitsRight } of candidates) {
      if (this.visited.has(target.id)) {
        this.noteDuplicatePrimary('Primary', branch, target, chapterId);
        continue;
      }
      let childX: number;
      if (childrenBelowInMode) {
        childX = calloutMode === 'B2' ? x + this.options.childIndent : groupWrapX;
      } else if (this.options.wrapPolicy === 'group-left-origin') {
        childX = wrapAll ? groupWrapX : rightX;
      } else if (this.options.wrapPolicy === 'subtree-aware') {
        childX = fitsRight ? rightX : groupWrapX;
      } else {
        // Pre-M4a regression oracle: the old per-child wrap at parent.x + wrapIndent.
        childX = fitsRight ? rightX : x + this.options.wrapIndent;
      }
      const childPlacement: EdgePlacement = childrenBelowInMode
        ? 'below'
        : this.options.wrapPolicy === 'group-left-origin'
          ? wrapAll
            ? 'below'
            : 'right'
          : fitsRight
            ? 'right'
            : 'below';
      if (!childrenBelowInMode && !fitsRight && this.options.wrapPolicy !== 'group-left-origin') {
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
        placement: childPlacement,
        ...(calloutMode === 'B2'
          ? {
              trunkGroup: 'child' as const,
              trunkInset: this.options.childTrunkInset,
            }
          : {}),
        parentBlockId: block.id,
        anchorId: null,
        depth: context.depth + 1,
        rightLimit: context.rightLimit,
        wrapFloor: childWrapFloor,
        wrapFloorY: childWrapFloorY,
        columnOriginX: context.columnOriginX,
      });
      layoutBlock.childIds.push(target.id);
      childCursor = placed.subtreeBottom + this.options.siblingGap;
      subtreeBottom = Math.max(subtreeBottom, placed.subtreeBottom);
    }

    layoutBlock.subtreeBottom = subtreeBottom;
    this.stack.delete(block.id);
    return layoutBlock;
  }

  /**
   * Legacy R2c finite-space compaction (lab oracle only; not a preset).
   *
   * The product-owner tree model (8 November 2026) uses the beside/stacked
   * column paths instead: siblings share one level column, never a row. This
   * row-fill policy remains for the density lab and old fixtures.
   *
   * The block card starts the current row. Anchored callouts (in anchor order)
   * and primary direct children (in branch order) are one ordered component
   * list. Components fill the row left-to-right at measured widths; when the
   * next component cannot fit, the row ends and the next row starts below the
   * tallest component of the previous row at one capped wrap indent from the
   * parent.
   *
   * Every component owns a column: its own subtree is laid out inside
   * `[x, x + allocation]`, so a wrapped descendant can never enter the next
   * sibling's column. Reference targets are not components; they stay at their
   * primary home and only draw edges.
   */
  private layoutCompactionComponents(
    layoutBlock: LayoutBlock,
    chapterId: string,
    x: number,
    y: number,
    width: number,
    measurement: BlockMeasurement,
    anchored: readonly BranchRecord[],
    direct: readonly BranchRecord[],
    anchorAttachments: readonly AnchorAttachment[],
    context: PlacementContext,
  ): number {
    const components: CompactionComponent[] = [];
    for (const branch of anchored) {
      const target = this.document.blocks[branch.targetBlockId];
      if (!target) continue;
      const anchorId = branch.source.anchorId ?? null;
      const attachment = anchorId
        ? (anchorAttachments.find((candidate) => candidate.anchorId === anchorId) ?? null)
        : null;
      components.push({ branch, target, anchorId, attachment, isCallout: true });
    }
    for (const branch of direct) {
      const target = this.document.blocks[branch.targetBlockId];
      if (!target) continue;
      components.push({ branch, target, anchorId: null, attachment: null, isCallout: false });
    }

    // Compaction mixes both axes: the in-row item gap is the horizontal
    // parent → right-group corridor, while a row top is the vertical child gap.
    const horizontalGap = this.options.rightGroupGap;
    const verticalGap = this.options.siblingGap;
    const rightLimit = context.rightLimit;
    const firstRowX = x + width + horizontalGap;
    // The wrap origin must leave room for the widest component's readable card;
    // otherwise a later wide component would be forced into a zero-width column.
    const wrapMinCard = components.reduce(
      (widest, component) =>
        Math.max(widest, this.compactionRequiredCardWidth(component.target)),
      0,
    );
    const wrapX = this.compactionWrapX(x, context.columnOriginX, rightLimit, wrapMinCard);
    const cardBottom = y + measurement.cardHeight;
    let subtreeBottom = cardBottom;
    let rowTop = y;
    let firstRow = true;
    let index = 0;

    while (index < components.length) {
      const rowX = firstRow ? firstRowX : wrapX;
      const available = Math.max(0, rightLimit - rowX);

      // Collect the still-unplaced components from the pointer. Already placed
      // duplicate primaries are skipped with the historical warning.
      const pending: CompactionComponent[] = [];
      for (let cursor = index; cursor < components.length; cursor += 1) {
        const component = components[cursor]!;
        if (this.visited.has(component.target.id)) {
          this.noteDuplicatePrimary(
            component.isCallout ? 'Anchored' : 'Primary',
            component.branch,
            component.target,
            chapterId,
          );
          continue;
        }
        pending.push(component);
      }
      if (pending.length === 0) break;

      // A full-width parent card leaves no usable side column. Wrap below the
      // parent instead of forcing a zero-width component; this is the
      // "component does not fit -> lower row" fallback, not a defect.
      if (firstRow) {
        const firstMin = this.compactionRequiredCardWidth(pending[0]!.target);
        if (firstRowX > rightLimit - EPSILON || available < firstMin - EPSILON) {
          firstRow = false;
          rowTop = cardBottom + verticalGap;
          continue;
        }
      }

      const columns = this.planCompactionRow(pending, available);
      if (columns.length === 0) {
        // Defensive: never loop forever or overlap. A zero-width column makes
        // the normal layout path report a blocking defect for the component.
        columns.push({ component: pending[0]!, allocation: available });
      }

      let itemX = rowX;
      let rowBottom = firstRow ? cardBottom : rowTop;
      let consumed = 0;
      for (const column of columns) {
        const { component } = column;
        consumed += 1;
        if (this.visited.has(component.target.id)) {
          this.noteDuplicatePrimary(
            component.isCallout ? 'Anchored' : 'Primary',
            component.branch,
            component.target,
            chapterId,
          );
          continue;
        }
        const placed = this.layoutBlock(component.target, chapterId, itemX, rowTop, {
          chapterId,
          role: component.isCallout ? 'callout' : 'child',
          placement: firstRow ? 'right' : 'below',
          parentBlockId: layoutBlock.blockId,
          anchorId: component.anchorId,
          depth: context.depth + 1,
          rightLimit: itemX + column.allocation,
          wrapFloor: context.wrapFloor,
          wrapFloorY: context.wrapFloorY,
          columnOriginX: itemX,
          incomingAnchor: component.attachment,
        });
        layoutBlock.childIds.push(component.target.id);
        rowBottom = Math.max(rowBottom, placed.subtreeBottom);
        itemX += column.allocation + horizontalGap;
      }

      subtreeBottom = Math.max(subtreeBottom, rowBottom);
      rowTop = rowBottom + verticalGap;
      firstRow = false;
      // Advance past the consumed components. Any skipped duplicate before the
      // next pending component is re-reported (deduplicated) on the next pass.
      if (consumed >= pending.length) {
        index = components.length;
      } else {
        index = components.indexOf(pending[consumed]!);
      }
    }

    return subtreeBottom;
  }

  /**
   * Choose one row's component prefix and distribute the available width.
   *
   * - If every remaining component fits at its preferred subtree width, use it.
   * - Otherwise take the largest prefix whose readable minimum columns fit and
   *   grow those columns proportionally toward their preferred widths.
   * - A first component that cannot fit is still returned with the full
   *   available width, so the normal layout path reports the defect.
   */
  private planCompactionRow(
    components: readonly CompactionComponent[],
    available: number,
  ): CompactionColumn[] {
    if (components.length === 0) return [];
    const gap = this.options.rightGroupGap;
    const minWidths = components.map((component) =>
      this.compactionMinColumnWidth(component.target, available),
    );
    const prefWidths = components.map((component) =>
      this.preferredSubtreeWidth(component.target.id, available),
    );
    const allPref =
      prefWidths.reduce((total, value) => total + value, 0) + gap * (components.length - 1);
    if (allPref <= available + EPSILON) {
      return components.map((component, index) => ({
        component,
        allocation: Math.max(minWidths[index]!, prefWidths[index]!),
      }));
    }

    let count = 0;
    let used = 0;
    for (let cursor = 0; cursor < components.length; cursor += 1) {
      const next = used + minWidths[cursor]! + (cursor === 0 ? 0 : gap);
      if (next > available + EPSILON) break;
      used = next;
      count = cursor + 1;
    }
    if (count === 0) count = 1;

    const prefix = components.slice(0, count);
    const mins = minWidths.slice(0, count);
    const prefs = prefWidths.slice(0, count);
    const usedMin = mins.reduce((total, value) => total + value, 0) + gap * (count - 1);
    const extra = Math.max(0, available - usedMin);
    const diffs = prefs.map((pref, index) => Math.max(0, pref - mins[index]!));
    const totalDiff = diffs.reduce((total, value) => total + value, 0);
    return prefix.map((component, index) => {
      const min = mins[index]!;
      const pref = Math.max(min, prefs[index]!);
      const allocation =
        totalDiff > 0 ? Math.min(pref, min + (extra * diffs[index]!) / totalDiff) : min;
      return { component, allocation };
    });
  }

  /** Readable card width a component needs before it can be squeezed. */
  private compactionRequiredCardWidth(target: ContentBlock): number {
    const chrome = 2 * (this.options.cardPadding + this.options.cardBorder);
    const measurement = this.measure(target, { kind: 'min-content' });
    const minContent = Math.max(this.options.minContentWidth, measurement.minContentWidth);
    return minContent + chrome;
  }

  /** Readable minimum card width for a component at the available width. */
  private compactionMinCardWidth(target: ContentBlock, available: number): number {
    const chrome = 2 * (this.options.cardPadding + this.options.cardBorder);
    if (available <= chrome + EPSILON) return Math.max(0, available);
    return Math.min(available, this.compactionRequiredCardWidth(target));
  }

  /**
   * Readable minimum column for a component. The widest min-card anywhere in
   * the subtree must fit after the deepest allowed indent, so a column can
   * always fall back to wrapping without clipping a descendant.
   */
  private compactionMinColumnWidth(target: ContentBlock, available: number): number {
    const card = this.compactionMinCardWidth(target, available);
    if (!this.hasPrimaryComponents(target.id)) return card;
    const widest = this.subtreeMinCardWidth(target.id, available);
    return Math.min(
      available,
      Math.max(card, widest) + Math.min(this.options.wrapIndent, this.options.maxWrapIndent),
    );
  }

  /** Widest readable min card anywhere in this primary subtree. */
  private subtreeMinCardWidth(blockId: string, available: number): number {
    const key = `${blockId}:${available.toFixed(2)}`;
    const cached = this.subtreeMinCardCache.get(key);
    if (cached !== undefined) return cached;
    const block = this.document.blocks[blockId];
    if (!block) return 0;
    if (this.subtreeMinCardStack.has(blockId)) {
      return this.compactionMinCardWidth(block, available);
    }
    this.subtreeMinCardStack.add(blockId);
    let widest = this.compactionMinCardWidth(block, available);
    for (const branch of this.childrenMap.get(blockId) ?? []) {
      const target = this.document.blocks[branch.targetBlockId];
      if (!target) continue;
      widest = Math.max(widest, this.subtreeMinCardWidth(target.id, available));
    }
    this.subtreeMinCardStack.delete(blockId);
    this.subtreeMinCardCache.set(key, widest);
    return widest;
  }

  /**
   * Left origin for a wrapped compaction row. One wrap indent from the block,
   * capped at the owning column's max indent; if that leaves less than a
   * readable card, move left within the column instead of clipping.
   */
  private compactionWrapX(
    blockX: number,
    columnOriginX: number,
    rightLimit: number,
    minCard: number,
  ): number {
    const indent = Math.max(
      columnOriginX,
      Math.min(
        blockX + this.options.wrapIndent,
        columnOriginX + Math.min(this.options.wrapIndent, this.options.maxWrapIndent),
      ),
    );
    const maxStart = Math.max(columnOriginX, rightLimit - minCard);
    return Math.min(indent, maxStart);
  }

  private hasPrimaryComponents(blockId: string): boolean {
    return (this.childrenMap.get(blockId) ?? []).some(
      (branch) => this.document.blocks[branch.targetBlockId] !== undefined,
    );
  }

  /**
   * Preferred subtree width: the card plus its own component row(s), bounded by
   * the available width. This is the width a component would take if it had a
   * row to itself; row packing shrinks it toward `compactionMinColumnWidth`.
   */
  private preferredSubtreeWidth(blockId: string, available: number): number {
    if (available <= EPSILON) return 0;
    const key = `${blockId}:${available.toFixed(2)}`;
    const cached = this.preferredWidthCache.get(key);
    if (cached !== undefined) return cached;
    const block = this.document.blocks[blockId];
    if (!block) return 0;
    if (this.preferredWidthStack.has(blockId)) return 0;
    this.preferredWidthStack.add(blockId);
    const box = this.resolveBlockBox(block, available);
    let width = box.width;
    const branches = this.childrenMap.get(blockId) ?? [];
    if (branches.length > 0 && available > box.width + this.options.rightGroupGap) {
      const remaining = available - box.width - this.options.rightGroupGap;
      const widths: number[] = [];
      for (const branch of branches) {
        const target = this.document.blocks[branch.targetBlockId];
        if (!target) continue;
        widths.push(this.preferredSubtreeWidth(target.id, remaining));
      }
      if (widths.length > 0) {
        width = Math.min(
          available,
          box.width +
            this.options.rightGroupGap +
            this.packPreferredRows(widths, remaining, this.options.rightGroupGap),
        );
      }
    }
    // A component may never advertise less than a column in which its own
    // descendants can still be wrapped at a readable width.
    width = Math.max(width, this.compactionMinColumnWidth(block, available));
    this.preferredWidthStack.delete(blockId);
    this.preferredWidthCache.set(key, width);
    return width;
  }

  /** Greedy preferred-width row packing; returns the widest row. */
  private packPreferredRows(widths: readonly number[], available: number, gap: number): number {
    let rowWidth = 0;
    let maxRow = 0;
    for (const raw of widths) {
      const width = Math.min(raw, available);
      if (rowWidth > 0 && rowWidth + gap + width > available + EPSILON) {
        maxRow = Math.max(maxRow, rowWidth);
        rowWidth = width;
      } else {
        rowWidth += (rowWidth > 0 ? gap : 0) + width;
      }
    }
    return Math.max(maxRow, rowWidth);
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
   * This is the legacy `calloutModes: false` regression path, not the
   * production A/B2 callout-mode path. Its row origin is the resolved
   * `PageTheme.childIndent` (`LayoutOptions.childIndent`); only the historical
   * readability floor and warning-anchor inset stay as named engine constants.
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
        attachment?.calloutX ??
          attachment?.warningPoint?.x ??
          x + width - LEGACY_BESIDE_ANCHOR_INSET,
      );
      let calloutX = desiredX + preferredCardWidth <= laneRight + EPSILON
        ? desiredX
        : laneLeft;
      // A callout too close to the lane left cannot sit to the right of the
      // shared left trunk. Shift it to the row indent when the lane still
      // offers a readable card; otherwise keep the minimum stem from the
      // parent's left edge so a left entry never degenerates into a top entry.
      const stemLeft = laneLeft + this.options.childIndent;
      const shiftReadable = (left: number): boolean => {
        const available = laneRight - left;
        if (available - chrome < LEGACY_BESIDE_READABLE_WIDTH - EPSILON) return false;
        const shifted = this.resolveBlockBox(target, available);
        return !shifted.contentTooWide && !shifted.horizontalOverflow;
      };
      if (calloutX < stemLeft) {
        if (shiftReadable(stemLeft)) {
          calloutX = stemLeft;
        } else {
          const minimumStemLeft = Math.max(laneLeft, x + PAGE_EDGE_STYLE.stemMin);
          if (calloutX < minimumStemLeft && shiftReadable(minimumStemLeft)) {
            calloutX = minimumStemLeft;
          }
        }
      }
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
      placement: context.placement,
      ...(context.trunkGroup === undefined ? {} : { trunkGroup: context.trunkGroup }),
      ...(context.trunkInset === undefined ? {} : { trunkInset: context.trunkInset }),
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

  /**
   * Turn the document's semantic anchor states into layout geometry. The state
   * comes from the session's `AnchorResolutionView`; this method only picks the
   * measured rectangle(s) and the attach point. It never derives a state from
   * rect counts or an occurrence hint.
   */
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
    const contentRect = {
      x: contentLeft,
      y: contentTop,
      width: measurement.contentWidth,
      height: measurement.contentHeight,
    };
    const entries: readonly AnchorViewEntry[] = this.anchorView?.byBlock[block.id] ?? [];
    /** Card lane for a range the measurement cannot locate (callout indent). */
    const laneX = x + this.options.calloutCardIndent;
    const laneTrunkX = x + this.options.calloutTrunkInset;
    for (const entry of entries) {
      // Idle anchors have no branch yet and block-missing anchors have no placed
      // block: neither gets an attachment, a defect or a dot.
      if (entry.state === 'idle' || entry.state === 'block-missing') continue;
      const rects = measurement.anchors
        .filter((anchor) => anchor.anchorId === entry.anchorId)
        .sort((a, b) => a.occurrence - b.occurrence);
      if (entry.state === 'resolved') {
        let rect = contentRect;
        let attachPoint = {
          x: contentRect.x + contentRect.width,
          y: contentRect.y + contentRect.height / 2,
        };
        let calloutX = contentRect.x;
        // Every callout placed below uses the callout trunk inset; the zero-rect
        // fallback also starts its edge there.
        const calloutTrunkInset = this.options.calloutTrunkInset;
        if (rects.length === 0) {
          // A selector-resolved range has no measured wrapper. Attach to the
          // whole block content box and record the fallback; the state stays
          // resolved and no dot is drawn (spec §8.7). The callout uses the
          // dedicated lane offset so it never touches the page border, and its
          // edge starts at the callout trunk inset.
          this.anchorGeometryFallbacks.push(entry.anchorId);
          calloutX = laneX;
          attachPoint = {
            x: laneTrunkX,
            y: contentTop + measurement.contentHeight / 2,
          };
        } else {
          // A resolved binding is contiguous by definition, so the union of its
          // measured wrappers is exactly the range's box. The attach point is
          // the right-centre of the range's last line.
          const left = Math.min(...rects.map((candidate) => candidate.x));
          const top = Math.min(...rects.map((candidate) => candidate.y));
          const right = Math.max(...rects.map((candidate) => candidate.x + candidate.width));
          const bottom = Math.max(...rects.map((candidate) => candidate.y + candidate.height));
          rect = {
            x: contentLeft + left,
            y: contentTop + top,
            width: right - left,
            height: bottom - top,
          };
          calloutX = rect.x;
          const last = rects[rects.length - 1] as (typeof rects)[number];
          attachPoint = {
            x: contentLeft + last.x + last.width,
            y: contentTop + last.y + last.height / 2,
          };
        }
        // The card never starts left of the callout lane: the below trunk sits
        // at +24 and the card at +38, so the stem stays visible even when the
        // measured range begins at the block's content left.
        calloutX = Math.max(calloutX, laneX);
        const attachment: AnchorAttachment = {
          anchorId: entry.anchorId,
          blockId: block.id,
          state: 'resolved',
          rect,
          calloutX,
          calloutTrunkInset,
          attachPoint,
          warningPoint: null,
        };
        attachments.push(attachment);
        this.anchors.push(attachment);
        continue;
      }
      // A broken/ambiguous anchor is a dot at the block's top-right, but its
      // callout card keeps the measured lane it would have had while the
      // binding still resolved. A range with no measured rect uses the callout
      // indent so the card cannot touch the page border.
      const warningPoint = {
        x: x + measurement.cardWidth - 16,
        y: y + Math.max(8, measurement.contentTop / 2),
      };
      const hasRects = rects.length > 0;
      const attachment: AnchorAttachment = {
        anchorId: entry.anchorId,
        blockId: block.id,
        state: entry.state,
        rect: null,
        // A warning card keeps the measured lane when it is already right of
        // the callout lane, but never starts left of it: the below trunk at
        // +24 would otherwise pass behind the card.
        calloutX: hasRects
          ? Math.max(contentLeft + Math.min(...rects.map((candidate) => candidate.x)), laneX)
          : laneX,
        calloutTrunkInset: this.options.calloutTrunkInset,
        attachPoint: null,
        warningPoint,
      };
      attachments.push(attachment);
      this.anchors.push(attachment);
      if (entry.state === 'broken') {
        this.addDefect({
          code: 'broken-anchor',
          severity: 'warning',
          message: `Anchor ${entry.anchorId} on block ${block.id} could not be resolved; its branch still exports once, marked at a fallback point.`,
          blockId: block.id,
          chapterId,
          blocksExport: false,
        });
      } else {
        this.addDefect({
          code: 'ambiguous-anchor',
          severity: 'warning',
          message: `Anchor ${entry.anchorId} on block ${block.id} matches multiple spans and needs explicit repair; the branch still exports once from a warning point.`,
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
    // One lookup map per run: an anchor-bearing document can have many branches,
    // and a linear scan per branch was quadratic.
    const attachmentById = new Map(
      this.anchors.map((attachment) => [attachment.anchorId, attachment]),
    );
    for (const branch of Object.values(this.document.branches).sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )) {
      const from = this.blockById[branch.source.blockId];
      const to = this.blockById[branch.targetBlockId];
      if (!from || !to) continue;
      let fromPoint = { x: from.x + from.width, y: from.y + from.height / 2 };
      let anchorQuote: string | null = null;
      if (branch.source.anchorId) {
        const attachment = attachmentById.get(branch.source.anchorId);
        if (attachment?.attachPoint) {
          fromPoint = attachment.attachPoint;
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

/**
 * Lay out one measured document.
 *
 * `anchorView` is the session index's projection. It is optional only so
 * anchor-free documents (most layout tests and PDF fixtures) need no view; a
 * document with anchor records and no view throws instead of silently falling
 * back to rect counting. A mismatched document or revision throws too, so a
 * stale projection can never be rendered.
 */
export function layoutDocument(
  document: NoteDocument,
  port: MeasurementPort,
  options: Partial<LayoutOptions> = {},
  pageSetup: PageSetup = DEFAULT_PAGE_SETTINGS.setup,
  anchorView?: AnchorResolutionView,
): ContinuousLayout {
  if (Object.keys(document.anchors).length > 0 && anchorView === undefined) {
    throw new Error(
      `layout: document ${document.id} has anchors but no anchor resolution view`,
    );
  }
  if (anchorView !== undefined) {
    if (anchorView.documentId !== document.id) {
      throw new Error(
        `layout: anchor view is for ${anchorView.documentId}, not ${document.id}`,
      );
    }
    if (
      anchorView.revision !== undefined &&
      document.revision !== undefined &&
      anchorView.revision !== document.revision
    ) {
      throw new Error(
        `layout: anchor view revision ${anchorView.revision} does not match document revision ${document.revision}`,
      );
    }
  }
  const resolvedOptions: LayoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  return new LayoutBuilder(document, port, resolvedOptions, pageSetup, anchorView ?? null).run();
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
