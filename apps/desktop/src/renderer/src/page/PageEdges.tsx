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
  EDGE_STYLE,
  arrowPath,
  openArrowForDirection,
  roundedPath,
  type PageEdge,
  type PageEdgePoint,
  type PageGeometry,
  type PageRoute,
} from '@noteforest/layout';

interface PageEdgesProps {
  edges: readonly PageEdge[];
  geometry: PageGeometry;
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
  return roundedPath(route.points, EDGE_STYLE.radius);
}

function routeArrow(edge: PageEdge): string {
  return edge.role === 'primary'
    ? arrowPath(edge.route.tip, edge.route.direction)
    : openArrowForDirection(edge.route.tip, edge.route.direction);
}

function edgeLabelText(edge: PageEdge): string | null {
  // Short print-style marker; the full sentence stays in the aria-label. The
  // long “→ page 12” chip did not fit the margin and covered the block text.
  if (edge.direction === 'to-edge' && edge.targetPage !== null) {
    return `→ p.${edge.targetPage}`;
  }
  if (edge.direction === 'from-edge' && edge.targetPage !== null) {
    return `← p.${edge.targetPage}`;
  }
  return null;
}

function accessibleLabel(edge: PageEdge): string {
  const parts: string[] = [];
  if (edge.role === 'reference') parts.push('Reference');
  else parts.push('Branch');
  if (edge.branchLabel !== undefined) parts.push(edge.branchLabel);
  if (edge.direction === 'to-edge' && edge.targetPage !== null) {
    parts.push(`continues on page ${edge.targetPage}`);
  } else if (edge.direction === 'from-edge' && edge.targetPage !== null) {
    parts.push(`continued from page ${edge.targetPage}`);
  }
  return parts.join(' · ');
}

export function PageEdges({ edges, geometry }: PageEdgesProps): JSX.Element | null {
  if (edges.length === 0) return null;
  const width = geometry.contentWidthPx;
  const height = geometry.contentHeightPx;
  const labels = edges
    .map((edge) => {
      if (edge.direction === 'same-page') {
        // Same-page branch/anchor quotes already live inside the callout card
        // and the arrow's accessible title. A route midpoint chip sat on top of
        // block text, so the page layer never duplicates it.
        return null;
      }
      const text = edgeLabelText(edge);
      if (text === null) return null;
      if (edge.direction === 'to-edge') {
        const margin = Math.max(18, geometry.marginsPx.right - 4);
        return {
          key: `${edge.branchId}-to`,
          text,
          aria: accessibleLabel(edge),
          style: {
            right: -geometry.marginsPx.right + 2,
            top: edge.from.y,
            maxWidth: margin,
            transform: 'translateY(-50%)',
          },
          attribute: 'to-edge' as const,
          edge,
        };
      }
      const margin = Math.max(18, geometry.marginsPx.left - 4);
      return {
        key: `${edge.branchId}-from`,
        text,
        aria: accessibleLabel(edge),
        style: {
          left: -geometry.marginsPx.left + 2,
          top: edge.to.y,
          maxWidth: margin,
          transform: 'translateY(-50%)',
        },
        attribute: 'from-edge' as const,
        edge,
      };
    })
    .filter((label) => label !== null);

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
      >
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
              data-page-edge-trunk-x={edge.trunk ? number(edge.trunk.x) : undefined}
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
                <title>{accessibleLabel(edge)}</title>
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
              key={label.key}
              className={`nf-page-edge-label nf-page-edge-label-${label.edge.role}`}
              style={label.style}
              title={label.aria}
              aria-label={label.aria}
              data-page-edge-label={label.attribute}
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
