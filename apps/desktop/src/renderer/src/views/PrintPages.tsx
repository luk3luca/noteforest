import type {
  AnchorAttachment,
  ContinuousLayout,
  NoteDocument,
  PageFragment,
} from '@noteforest/layout';
import type { PrintEdge, PrintModel, PrintPage } from '@noteforest/pdf';
import { segmentsHtml, type RenderSegment } from '../content/segments';

interface PrintPagesProps {
  model: PrintModel;
  document: NoteDocument;
  layout: ContinuousLayout;
  segmentsByBlock: Record<string, RenderSegment[]>;
  mode: 'screen' | 'print';
}

function labelOf(document: NoteDocument, blockId: string): string {
  return document.blocks[blockId]?.label ?? blockId;
}

function anchorWarnings(layout: ContinuousLayout, blockId: string): AnchorAttachment[] {
  return layout.anchors.filter(
    (anchor) => anchor.blockId === blockId && anchor.state !== 'resolved',
  );
}

function PageEdges({ edges, width, height, pageNumber }: {
  edges: PrintEdge[];
  width: number;
  height: number;
  pageNumber: number;
}) {
  if (edges.length === 0) return null;
  const primaryId = `nf-arrow-primary-${pageNumber}`;
  const referenceId = `nf-arrow-reference-${pageNumber}`;
  return (
    <svg className="edge-layer" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <marker id={primaryId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 z" fill="#3f8f6b" />
        </marker>
        <marker id={referenceId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 z" fill="#7f93a0" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const colorClass = edge.role === 'primary' ? 'edge-primary' : 'edge-reference';
        const marker = edge.role === 'primary' ? `url(#${primaryId})` : `url(#${referenceId})`;
        if (edge.direction === 'same-page') {
          const dx = Math.max(28, Math.abs(edge.to.x - edge.from.x) * 0.45);
          const path = `M ${edge.from.x} ${edge.from.y} C ${edge.from.x + dx} ${edge.from.y}, ${edge.to.x - dx} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;
          return (
            <path
              key={edge.branchId}
              d={path}
              className={colorClass}
              markerEnd={marker}
              data-edge={edge.branchId}
            />
          );
        }
        return (
          <g key={edge.branchId} data-edge={edge.branchId} data-direction={edge.direction}>
            <line
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              className={colorClass}
              markerEnd={marker}
            />
            {edge.label ? (
              <text
                x={edge.direction === 'to-edge' ? Math.max(8, edge.to.x - 34) : edge.to.x + 6}
                y={Math.max(10, edge.to.y - 4)}
                className="edge-label"
              >
                {edge.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function PageFragmentView({
  page,
  fragment,
  document,
  layout,
  segments,
  mode,
}: {
  page: PrintPage;
  fragment: PageFragment;
  document: NoteDocument;
  layout: ContinuousLayout;
  segments: RenderSegment[];
  mode: 'screen' | 'print';
}) {
  const block = document.blocks[fragment.blockId];
  if (!block) return null;
  const start = Math.min(fragment.startSegment, segments.length);
  const end = Math.min(fragment.endSegment, segments.length);
  const warnings = anchorWarnings(layout, fragment.blockId);
  const fragmentClass = [
    'nf-card',
    'page-fragment',
    fragment.isFirst ? 'nf-frag-first' : 'nf-frag-cont',
    fragment.isLast ? 'nf-frag-last' : 'nf-frag-mid',
  ].join(' ');
  const blocking = layout.defects.some(
    (defect) => defect.blockId === fragment.blockId && defect.blocksExport,
  );
  return (
    <div
      className={fragmentClass}
      style={{
        left: fragment.page.x,
        top: fragment.page.y,
        width: fragment.page.width,
        height: fragment.page.height,
      }}
      data-fragment-block={fragment.blockId}
      data-fragment-page={page.pageNumber}
      data-fragment-start={fragment.startSegment}
      data-fragment-end={fragment.endSegment}
      data-fragment-first={fragment.isFirst ? '1' : '0'}
      data-fragment-last={fragment.isLast ? '1' : '0'}
      data-defect={blocking ? '1' : '0'}
    >
      {fragment.isFirst && block.label ? <div className="nf-label">{block.label}</div> : null}
      <div
        className="nf-block-content"
        dangerouslySetInnerHTML={{ __html: segmentsHtml(segments, start, end) }}
      />
      {mode === 'screen' && blocking ? <span className="page-warning">layout defect</span> : null}
      {warnings
        .filter((warning) => warning.warningPoint && fragment.isFirst)
        .map((warning) => {
          const point = warning.warningPoint;
          if (!point) return null;
          const localY = point.y - page.yStart - fragment.page.y;
          if (localY < -4 || localY > fragment.page.height + 4) return null;
          return (
            <span
              key={warning.anchorId}
              className="page-warning"
              style={{ left: 6, top: Math.max(2, localY - 6) }}
              title={`Anchor ${warning.anchorId} is ${warning.state}`}
            >
              ⚠ anchor {warning.state}
            </span>
          );
        })}
    </div>
  );
}

function PageChrome({
  page,
  model,
  document,
}: {
  page: PrintPage;
  model: PrintModel;
  document: NoteDocument;
}) {
  const margins = model.pageSetup.margins;
  const headerTop = Math.max(3, margins.top * 0.3);
  const ghostTop = Math.max(headerTop + 4, margins.top * 0.62);
  const footerBottom = Math.max(2.5, margins.bottom * 0.3);
  const continuesBottom = Math.max(footerBottom + 4, margins.bottom * 0.6);
  return (
    <>
      <div
        className="page-header"
        style={{ left: `${margins.left}mm`, right: `${margins.right}mm`, top: `${headerTop}mm` }}
      >
        <span className="title">{model.documentTitle}</span>
        <span>{page.chapterTitle}</span>
      </div>
      {page.continuationIn.length > 0 ? (
        <div
          className="page-ghost-list"
          style={{ left: `${margins.left}mm`, right: `${margins.right}mm`, top: `${ghostTop}mm` }}
        >
          {page.continuationIn.map((continuation) => (
            <div className="page-ghost" key={`${continuation.blockId}-${continuation.fromPage}`}>
              ↳ continued from page {continuation.fromPage} · {continuation.ghostParent.parentLabel}
              {continuation.ghostParent.anchorQuote
                ? ` (${continuation.ghostParent.anchorQuote})`
                : ''}{' '}
              → {continuation.ghostParent.blockLabel}
            </div>
          ))}
        </div>
      ) : null}
      <div
        className="page-footer"
        style={{ left: `${margins.left}mm`, right: `${margins.right}mm`, bottom: `${footerBottom}mm` }}
      >
        Page {page.pageNumber} of {model.pageCount}
      </div>
      {page.continuationOut.length > 0 ? (
        <div
          className="page-continues-list"
          style={{ left: `${margins.left}mm`, right: `${margins.right}mm`, bottom: `${continuesBottom}mm` }}
        >
          {page.continuationOut.map((continuation) => (
            <div className="page-continues" key={`${continuation.blockId}-${continuation.toPage}`}>
              continues on page {continuation.toPage} · {labelOf(document, continuation.blockId)} →
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function PageSurface({
  page,
  model,
  document,
  layout,
  segmentsByBlock,
  mode,
}: {
  page: PrintPage;
  model: PrintModel;
  document: NoteDocument;
  layout: ContinuousLayout;
  segmentsByBlock: Record<string, RenderSegment[]>;
  mode: 'screen' | 'print';
}) {
  const margins = model.pageSetup.margins;
  return (
    <div
      className={mode === 'print' ? 'pdf-page' : 'pdf-page screen-page'}
      style={{
        width: `${model.geometry.pageWidthMm}mm`,
        height: `${model.geometry.pageHeightMm}mm`,
      }}
      data-page-number={page.pageNumber}
      data-chapter={page.chapterId}
      data-overflow={page.overflow ? '1' : '0'}
    >
      <PageChrome page={page} model={model} document={document} />
      <div
        className="page-content"
        data-page-content={page.pageNumber}
        style={{
          left: `${margins.left}mm`,
          top: `${margins.top}mm`,
          width: `${model.geometry.contentWidthPx}px`,
          height: `${model.geometry.contentHeightPx}px`,
        }}
      >
        <PageEdges
          edges={page.edges}
          width={model.geometry.contentWidthPx}
          height={model.geometry.contentHeightPx}
          pageNumber={page.pageNumber}
        />
        {page.fragments.map((fragment) => (
          <PageFragmentView
            key={`${fragment.blockId}-${fragment.startSegment}`}
            page={page}
            fragment={fragment}
            document={document}
            layout={layout}
            segments={segmentsByBlock[fragment.blockId] ?? []}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
}

export function PrintPages({ model, document, layout, segmentsByBlock, mode }: PrintPagesProps) {
  return (
    <div className={mode === 'print' ? 'print-root' : 'page-stage'}>
      {model.pages.map((page) =>
        mode === 'print' ? (
          <PageSurface
            key={page.pageNumber}
            page={page}
            model={model}
            document={document}
            layout={layout}
            segmentsByBlock={segmentsByBlock}
            mode={mode}
          />
        ) : (
          <div key={page.pageNumber} style={{ display: 'contents' }}>
            {page.overflow ? (
              <div className="page-overflow-label">
                Page {page.pageNumber} overflows its content area; export is blocked.
              </div>
            ) : null}
            <PageSurface
              page={page}
              model={model}
              document={document}
              layout={layout}
              segmentsByBlock={segmentsByBlock}
              mode={mode}
            />
          </div>
        ),
      )}
    </div>
  );
}
