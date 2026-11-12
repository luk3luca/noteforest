/**
 * Page-local arrow layer.
 *
 * The SVG is inside each page content box and is `aria-hidden`; it never
 * intercepts pointer input. Cross-page indicators and author labels are plain
 * HTML chips outside the SVG so their text stays in the accessibility tree.
 *
 * All geometry comes from `buildPageEdges` in `@noteforest/layout`, the same
 * mapper the PDF print model consumes. This component only turns those points
 * into paths; it does not route edges again.
 */

import {
  PAGE_EDGE_STYLE,
  arrowPath,
  openArrowForDirection,
  pageEdgeAccessibleLabel,
  pageEdgeLabelLayout,
  roundedPath,
  type PageEdge,
  type PageEdgeLabelLayout,
  type PageEdgePoint,
  type PageEdgeTrunkView,
  type PageGeometry,
  type PageRoute,
} from '@noteforest/layout';

interface PageEdgesProps {
  edges: readonly PageEdge[];
  trunks: readonly PageEdgeTrunkView[];
  geometry: PageGeometry;
  /**
   * Print passes the label records already resolved by the print model; Page
   * Read omits them and derives the identical records from the shared helper.
   */
  labels?: readonly PageEdgeLabelLayout[];
}

function number(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function pointAttribute(point: PageEdgePoint): string {
  return `${number(point.x)},${number(point.y)}`;
}

function routeAttribute(route: PageRoute): string {
  return route.points.map((point) => pointAttribute(point)).join(' ');
}

function routePath(route: PageRoute): string {
  return roundedPath(route.points, PAGE_EDGE_STYLE.radius);
}

function routeArrow(edge: PageEdge): string {
  // Page Read, Page Edit, and print pass the Page style explicitly: a future
  // Continuous edge setting can never change the paper.
  return edge.role === 'primary'
    ? arrowPath(edge.route.tip, edge.route.direction, PAGE_EDGE_STYLE)
    : openArrowForDirection(edge.route.tip, edge.route.direction, PAGE_EDGE_STYLE);
}

export function PageEdges({ edges, trunks, geometry, labels: resolvedLabels }: PageEdgesProps): JSX.Element | null {
  if (edges.length === 0 && trunks.length === 0) return null;
  const width = geometry.contentWidthPx;
  const height = geometry.contentHeightPx;
  // Positions and text come from the shared page-edge label layout, the same
  // records the print compositor consumes.
  const labels = resolvedLabels ?? pageEdgeLabelLayout(edges, geometry);

  return (
    <>
      <svg
        className="nf-page-edges"
        viewBox={`0 0 ${number(width)} ${number(height)}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        data-page-edges="true"
        data-page-edge-count={edges.length}
        data-page-trunk-count={trunks.length}
      >
        {trunks.map(({ trunk, segment }) => (
          <g
            key={`trunk-${trunk.id}-${segment.pageNumber}`}
            className={`nf-page-trunk nf-page-trunk-${trunk.placement}`}
            data-page-trunk-id={trunk.id}
            data-page-trunk-parent={trunk.parentBlockId}
            data-page-trunk-placement={trunk.placement}
            data-page-trunk-group={trunk.trunkGroup ?? undefined}
            data-page-trunk-x={number(trunk.x)}
            data-page-trunk-port={pointAttribute(trunk.port)}
            data-page-trunk-port-page={trunk.portPage}
            data-page-trunk-page={segment.pageNumber}
            data-page-trunk-start={pointAttribute(segment.start)}
            data-page-trunk-end={pointAttribute(segment.end)}
            data-page-trunk-lead={
              segment.lead === null
                ? undefined
                : `${pointAttribute(segment.lead.from)} ${pointAttribute(segment.lead.to)}`
            }
            data-page-trunk-segment-count={trunk.segments.length}
          >
            <path
              className="nf-page-trunk-path nf-page-edge-path nf-page-edge-path-primary"
              d={[
                segment.lead === null
                  ? ''
                  : roundedPath([segment.lead.from, segment.lead.to], 0),
                roundedPath([segment.start, segment.end], 0),
              ]
                .filter((part) => part.length > 0)
                .join(' ')}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
          </g>
        ))}
        {edges.map((edge) => {
          return (
            <g
              key={`${edge.branchId}-${edge.direction}-${edge.direction === 'same-page' ? '' : edge.targetPage ?? ''}`}
              className={`nf-page-edge nf-page-edge-${edge.role} nf-page-edge-${edge.direction}${
                edge.route.blocked ? ' nf-page-edge-blocked' : ''
              }`}
              data-page-edge-id={edge.branchId}
              data-page-edge-role={edge.role}
              data-page-edge-direction={edge.direction}
              data-page-edge-target-page={edge.targetPage ?? undefined}
              data-page-edge-from={pointAttribute(edge.from)}
              data-page-edge-to={pointAttribute(edge.to)}
              data-page-edge-from-block={edge.fromBlockId}
              data-page-edge-to-block={edge.toBlockId}
              data-page-edge-route={routeAttribute(edge.route)}
              data-page-edge-tip={pointAttribute(edge.route.tip)}
              data-page-edge-entry={edge.route.entry}
              data-page-edge-arrow={edge.route.direction}
              data-page-edge-stem={number(edge.route.stem)}
              data-page-edge-blocked={edge.route.blocked ? 'true' : undefined}
              data-page-edge-placement={edge.placement}
              data-page-edge-trunk-id={edge.trunk?.id}
              data-page-edge-trunk-placement={edge.trunk?.placement}
              data-page-edge-trunk-group={edge.trunk?.trunkGroup ?? undefined}
              data-page-edge-trunk-x={edge.trunk ? number(edge.trunk.x) : undefined}
              data-page-edge-trunk-port-page={edge.trunk?.portPage}
              data-page-edge-trunk-segment-page={edge.trunkSegment?.pageNumber}
              data-page-edge-trunk-segment-start={
                edge.trunkSegment ? pointAttribute(edge.trunkSegment.start) : undefined
              }
              data-page-edge-trunk-segment-end={
                edge.trunkSegment ? pointAttribute(edge.trunkSegment.end) : undefined
              }
              data-page-edge-anchor-id={edge.anchorId}
              data-page-edge-anchor-start={
                edge.anchorId !== undefined && edge.direction === 'same-page' ? 'true' : undefined
              }
            >
              <path
                className={`nf-page-edge-path nf-page-edge-path-${edge.role}`}
                d={routePath(edge.route)}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
              <path
                className={`nf-page-edge-arrow nf-page-edge-arrow-${edge.role}`}
                d={routeArrow(edge)}
                vectorEffect="non-scaling-stroke"
                fill={edge.role === 'primary' ? 'currentColor' : 'none'}
              />
              {edge.branchLabel === undefined ? null : (
                <title>{pageEdgeAccessibleLabel(edge)}</title>
              )}
            </g>
          );
        })}
      </svg>
      {labels.length === 0 ? null : (
        <div
          className="nf-page-edge-labels"
          role="group"
          aria-label="Page reference indicators"
          data-page-edge-labels="true"
        >
          {labels.map((label) => (
            <span
              key={`${label.edge.branchId}-${label.direction === 'to-edge' ? 'to' : 'from'}`}
              className={`nf-page-edge-label nf-page-edge-label-${label.edge.role}`}
              style={{
                ...(label.left === null ? {} : { left: label.left }),
                ...(label.right === null ? {} : { right: label.right }),
                top: label.top,
                maxWidth: label.maxWidth,
                transform: 'translateY(-50%)',
              }}
              title={label.accessibleLabel}
              aria-label={label.accessibleLabel}
              data-page-edge-label={label.direction}
              data-page-edge-label-for={label.edge.branchId}
              data-page-edge-target-page={label.edge.targetPage ?? undefined}
            >
              {label.text}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
