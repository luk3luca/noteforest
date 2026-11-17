/**
 * Print-only Page compositor (M4c1).
 *
 * Renders one fixed page container per `DerivedPage` as direct children of the
 * print root. It never measures, paginates, routes edges, or reflows: every
 * geometry record comes from the `PrintModel` built from the same real
 * `layoutDocument` + `paginate` output as Page Read. Content cards come from
 * the shared Page projection (`projectPageContent`), so segments, table
 * columns, anchors, and missing-asset placeholders are identical.
 *
 * The print skin lives in `print.css`: colours, borders, and shadows only. No
 * font size, line height, padding, page box, or edge metric may change here.
 */

import { useMemo, type CSSProperties } from 'react';
import type { PrintModel, PrintPage } from '@noteforest/pdf';
import type { LayoutDefect, PageFragment } from '@noteforest/layout';
import { codeFontStack, contentBlockTitle } from '@noteforest/layout';
import { PageEdges } from '../page/PageEdges';
import { PageChromeView } from '../page/PageChromeView';
import { projectPageContent, type ProjectedPage } from '../page/projection';
import {
  contentWrapperHtml,
  labelHtml,
  type PageContentBlock,
} from '../page/segments';

export interface PrintDocumentProps {
  model: PrintModel;
  /** Renderer-safe display URLs; failed assets must already be removed. */
  assets?: Readonly<Record<string, string>>;
}

function DefectBadge({
  defects,
  label = 'Layout defect',
}: {
  defects: readonly LayoutDefect[];
  label?: string;
}): JSX.Element {
  const title = defects.map((defect) => defect.message).join('\n');
  return (
    <span className="nf-page-badge nf-page-defect-badge" title={title} data-page-defect="true">
      {label}
    </span>
  );
}

interface PrintFragmentProps {
  model: PrintModel;
  page: PrintPage;
  projected: ProjectedPage | undefined;
  fragment: PageFragment;
}

function PrintFragment({ model, page, projected, fragment }: PrintFragmentProps): JSX.Element {
  const block: PageContentBlock | undefined = model.document.blocks[fragment.blockId];
  const segments = projected?.segmentsByBlock[fragment.blockId] ?? [];
  const start = Math.min(fragment.startSegment, segments.length);
  const end = Math.min(fragment.endSegment, segments.length);
  if (block === undefined) {
    return (
      <div
        className="nf-page-fragment nf-print-fragment nf-page-fragment-missing"
        style={{
          left: fragment.page.x,
          top: fragment.page.y,
          width: fragment.page.width,
          height: fragment.page.height,
        }}
        data-fragment-block={fragment.blockId}
        data-print-fragment="true"
      >
        Missing block content
      </div>
    );
  }
  const html = `${fragment.isFirst ? labelHtml(block) : ''}${contentWrapperHtml(
    segments,
    start,
    end,
  )}`;
  const blocking = model.blockingDefects.filter((defect) => defect.blockId === fragment.blockId);
  // Paper carries nothing about anchors (B1): no dot, no flag, no marker text.
  // Every other page↔print parity record comes from the same projection.
  return (
    <div
      className="nf-page-fragment nf-print-fragment"
      style={{
        left: fragment.page.x,
        top: fragment.page.y,
        width: fragment.page.width,
        height: fragment.page.height,
      }}
      data-fragment-block={fragment.blockId}
      data-fragment-role={fragment.role}
      data-fragment-depth={fragment.depth}
      data-fragment-page={page.pageNumber}
      data-fragment-start={fragment.startSegment}
      data-fragment-end={fragment.endSegment}
      data-fragment-first={fragment.isFirst ? '1' : '0'}
      data-fragment-last={fragment.isLast ? '1' : '0'}
      data-fragment-defect={blocking.length > 0 ? 'true' : undefined}
      data-print-fragment="true"
      role="group"
      aria-label={`${contentBlockTitle(block)}, page ${page.pageNumber}`}
    >
      <div
        className="nf-page-card nf-page-fragment-card"
        data-fragment-card="true"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {blocking.length > 0 ? <DefectBadge defects={blocking} label="Block defect" /> : null}
    </div>
  );
}

function PrintSheet({
  model,
  page,
  projected,
}: {
  model: PrintModel;
  page: PrintPage;
  projected: ProjectedPage | undefined;
}): JSX.Element {
  const margins = model.geometry.marginsPx;
  return (
    <section
      className="nf-print-sheet nf-page-sheet nf-page-scope"
      style={{
        width: `${model.geometry.pageWidthPx}px`,
        height: `${model.geometry.pageHeightPx}px`,
      }}
      role="document"
      aria-label={`Page ${page.pageNumber} of ${model.pageCount}`}
      data-print-page={page.pageNumber}
      data-page-number={page.pageNumber}
      data-page-count={model.pageCount}
      data-chapter-id={page.chapterId}
      data-overflow={page.overflow ? '1' : '0'}
      data-page-width-px={model.geometry.pageWidthPx.toFixed(3)}
      data-page-height-px={model.geometry.pageHeightPx.toFixed(3)}
      data-margin-top={margins.top.toFixed(3)}
      data-margin-right={margins.right.toFixed(3)}
      data-margin-bottom={margins.bottom.toFixed(3)}
      data-margin-left={margins.left.toFixed(3)}
    >
      <PageChromeView chrome={page.chrome} />
      <div
        className="nf-page-content"
        style={{
          left: `${margins.left}px`,
          top: `${margins.top}px`,
          width: `${model.geometry.contentWidthPx}px`,
          height: `${model.geometry.contentHeightPx}px`,
        }}
        data-page-content={page.pageNumber}
        data-print-content="true"
      >
        <PageEdges
          edges={page.edges}
          trunks={page.trunks}
          geometry={model.geometry}
          labels={page.edgeLabels}
        />
        {page.fragments.map((fragment) => (
          <PrintFragment
            key={`${fragment.blockId}-${fragment.startSegment}-${fragment.page.y.toFixed(2)}`}
            model={model}
            page={page}
            projected={projected}
            fragment={fragment}
          />
        ))}
      </div>
      {page.blockingDefects.length > 0 ? (
        <DefectBadge defects={page.blockingDefects} />
      ) : null}
    </section>
  );
}

export function PrintDocument({ model, assets }: PrintDocumentProps): JSX.Element {
  const resolvedAssets = assets ?? model.assetUrls;
  // Segment HTML is the same projection Page Read uses; the print model only
  // supplies records, never a second content renderer.
  const projection = useMemo(
    () =>
      projectPageContent({
        document: model.document,
        blocks: model.blocks,
        pages: model.pages,
        defects: model.defects,
        anchors: model.anchors,
        settings: model.settings,
        geometry: model.geometry,
        assets: resolvedAssets,
      }),
    [model, resolvedAssets],
  );
  return (
    <div
      className="nf-print-root nf-page-scope"
      style={
        {
          ...model.cssVariables,
          // The only appearance value the paper reads (R3). It is also part of
          // the model fingerprint, so a stale measured run cannot adopt it.
          '--mono-font': codeFontStack(model.codeFont),
        } as CSSProperties
      }
      data-print-root="true"
      data-print-page-count={model.pageCount}
      data-print-fingerprint={model.fingerprint}
      data-print-code-font={model.codeFont}
      data-print-page-width-mm={model.geometry.pageWidthMm}
      data-print-page-height-mm={model.geometry.pageHeightMm}
    >
      {/* Fixed page size only. Nothing here re-paginates content. */}
      <style>{`@page { size: ${model.geometry.pageWidthMm}mm ${model.geometry.pageHeightMm}mm; margin: 0; }`}</style>
      {model.pages.map((page, index) => (
        <PrintSheet
          key={page.pageNumber}
          model={model}
          page={page}
          projected={projection.pages[index]}
        />
      ))}
    </div>
  );
}
