import type {
  ChapterLayout,
  ContinuousLayout,
  DerivedPage,
  EdgeLayout,
  NoteDocument,
} from '@noteforest/layout';
import { segmentsHtml, type RenderSegment } from '../content/segments';

interface ReaderViewProps {
  layout: ContinuousLayout;
  document: NoteDocument;
  pages: DerivedPage[];
  segmentsByBlock: Record<string, RenderSegment[]>;
}

function edgePath(edge: EdgeLayout): string {
  const dx = Math.max(28, Math.abs(edge.to.x - edge.from.x) * 0.45);
  return `M ${edge.from.x} ${edge.from.y} C ${edge.from.x + dx} ${edge.from.y}, ${edge.to.x - dx} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;
}

function ChapterEdges({ edges, chapterId, width, height }: {
  edges: EdgeLayout[];
  chapterId: string;
  width: number;
  height: number;
}) {
  const chapterEdges = edges.filter((edge) => edge.chapterId === chapterId && !edge.crossChapter);
  if (chapterEdges.length === 0) return null;
  const primaryId = `reader-arrow-primary-${chapterId}`;
  const referenceId = `reader-arrow-reference-${chapterId}`;
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
      {chapterEdges.map((edge) => (
        <path
          key={edge.branchId}
          d={edgePath(edge)}
          className={edge.role === 'primary' ? 'edge-primary' : 'edge-reference'}
          markerEnd={edge.role === 'primary' ? `url(#${primaryId})` : `url(#${referenceId})`}
          data-edge={edge.branchId}
        />
      ))}
    </svg>
  );
}

function ChapterView({
  chapter,
  layout,
  document,
  pages,
  segmentsByBlock,
}: {
  chapter: ChapterLayout;
  layout: ContinuousLayout;
  document: NoteDocument;
  pages: DerivedPage[];
  segmentsByBlock: Record<string, RenderSegment[]>;
}) {
  const blocks = layout.blocks.filter((block) => block.chapterId === chapter.id);
  const chapterPages = pages.filter((page) => page.chapterId === chapter.id);
  const pageRange =
    chapterPages.length > 0
      ? chapterPages.length === 1
        ? `page ${chapterPages[0]!.pageNumber}`
        : `pages ${chapterPages[0]!.pageNumber}–${chapterPages[chapterPages.length - 1]!.pageNumber}`
      : 'no pages';
  return (
    <section className="reader-chapter" data-reader-chapter={chapter.id}>
      <div className="reader-chapter-title">
        <h2>{chapter.title}</h2>
        <span>{pageRange}</span>
      </div>
      <div
        className="reader-chapter-inner"
        style={{ width: `${layout.geometry.contentWidthPx}px`, height: `${Math.max(1, chapter.height)}px` }}
      >
        <ChapterEdges
          edges={layout.edges}
          chapterId={chapter.id}
          width={layout.geometry.contentWidthPx}
          height={Math.max(1, chapter.height)}
        />
        {blocks.map((block) => {
          const content = document.blocks[block.blockId];
          if (!content) return null;
          const segments = segmentsByBlock[block.blockId] ?? [];
          const warnings = layout.anchors.filter(
            (anchor) => anchor.blockId === block.blockId && anchor.state !== 'resolved',
          );
          const blocking = layout.defects.some(
            (defect) => defect.blockId === block.blockId && defect.blocksExport,
          );
          return (
            <div
              key={block.blockId}
              className="nf-card reader-block"
              style={{
                left: block.x,
                top: block.y,
                width: block.width,
                height: block.height,
              }}
              data-reader-block={block.blockId}
              data-x={block.x}
              data-y={block.y}
              data-width={block.width}
              data-height={block.height}
              data-role={block.role}
              data-depth={block.depth}
              data-defect={blocking ? '1' : '0'}
            >
              {content.label ? <div className="nf-label">{content.label}</div> : null}
              <div
                className="nf-block-content"
                dangerouslySetInnerHTML={{ __html: segmentsHtml(segments) }}
              />
              {warnings.map((warning) => {
                if (!warning.warningPoint) return null;
                return (
                  <span
                    key={warning.anchorId}
                    className="anchor-warning"
                    style={{
                      left: Math.max(4, warning.warningPoint.x - block.x),
                      top: Math.max(4, warning.warningPoint.y - block.y),
                    }}
                  >
                    ⚠ anchor {warning.state}
                  </span>
                );
              })}
              {blocking ? <span className="anchor-warning">layout defect</span> : null}
            </div>
          );
        })}
        {chapterPages.map((page, index) =>
          index < chapterPages.length - 1 && page.yEnd < chapter.height - 0.5 ? (
            <div
              key={page.pageNumber}
              className="reader-page-break"
              style={{ top: page.yEnd }}
              data-page-break={page.pageNumber}
            >
              <span>
                page {page.pageNumber} ends · continues on page {page.pageNumber + 1}
              </span>
            </div>
          ) : null,
        )}
      </div>
      <div className="reader-chapter-footer">
        <span>{pageRange}</span>
        <span>{blocks.length} blocks</span>
      </div>
    </section>
  );
}

export function ReaderView({ layout, document, pages, segmentsByBlock }: ReaderViewProps) {
  return (
    <div className="reader-scroll">
      <div className="reader-doc">
        {layout.chapters.map((chapter) => (
          <ChapterView
            key={chapter.id}
            chapter={chapter}
            layout={layout}
            document={document}
            pages={pages}
            segmentsByBlock={segmentsByBlock}
          />
        ))}
      </div>
    </div>
  );
}
