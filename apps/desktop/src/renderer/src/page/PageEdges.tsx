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

import type { PageEdge, PageEdgePoint, PageGeometry } from '@noteforest/layout';

interface PageEdgesProps {
  edges: readonly PageEdge[];
  geometry: PageGeometry;
}

const ARROW_SIZE = 7;

function number(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function pointAttribute(point: PageEdgePoint): string {
  return `${number(point.x)},${number(point.y)}`;
}

function arrowHead(to: PageEdgePoint, control: PageEdgePoint, filled: boolean): string {
  const dx = to.x - control.x;
  const dy = to.y - control.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = to.x - ux * ARROW_SIZE;
  const baseY = to.y - uy * ARROW_SIZE;
  const wing = ARROW_SIZE * 0.55;
  const wingX = -uy * wing;
  const wingY = ux * wing;
  if (filled) {
    return `M ${number(to.x)} ${number(to.y)} L ${number(baseX + wingX)} ${number(
      baseY + wingY,
    )} L ${number(baseX - wingX)} ${number(baseY - wingY)} Z`;
  }
  return `M ${number(baseX + wingX)} ${number(baseY + wingY)} L ${number(to.x)} ${number(
    to.y,
  )} L ${number(baseX - wingX)} ${number(baseY - wingY)}`;
}

function routeEdge(edge: PageEdge): { path: string; arrow: string } {
  if (edge.direction !== 'same-page') {
    // Cross-page routes are straight lines to/from the content edge, so the
    // page margin never carries ink.
    return {
      path: `M ${number(edge.from.x)} ${number(edge.from.y)} L ${number(edge.to.x)} ${number(
        edge.to.y,
      )}`,
      arrow: arrowHead(edge.to, edge.from, edge.role === 'primary'),
    };
  }
  const dx = Math.max(24, Math.abs(edge.to.x - edge.from.x) * 0.45);
  const direction = edge.to.x >= edge.from.x ? 1 : -1;
  const control1 = { x: edge.from.x + direction * dx, y: edge.from.y };
  const control2 = { x: edge.to.x - direction * dx, y: edge.to.y };
  return {
    path: `M ${number(edge.from.x)} ${number(edge.from.y)} C ${number(control1.x)} ${number(
      control1.y,
    )} ${number(control2.x)} ${number(control2.y)} ${number(edge.to.x)} ${number(edge.to.y)}`,
    arrow: arrowHead(edge.to, control2, edge.role === 'primary'),
  };
}

function edgeLabelText(edge: PageEdge): string | null {
  if (edge.direction === 'to-edge' && edge.targetPage !== null) {
    return `→ page ${edge.targetPage}`;
  }
  if (edge.direction === 'from-edge' && edge.targetPage !== null) {
    return `← from page ${edge.targetPage}`;
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
        if (edge.branchLabel === undefined) return null;
        return {
          key: `${edge.branchId}-branch`,
          text: edge.branchLabel,
          aria: accessibleLabel(edge),
          style: {
            left: (edge.from.x + edge.to.x) / 2,
            top: (edge.from.y + edge.to.y) / 2,
            transform: 'translate(-50%, -50%)',
          },
          attribute: 'branch' as const,
          edge,
        };
      }
      const text = edgeLabelText(edge);
      if (text === null) return null;
      if (edge.direction === 'to-edge') {
        return {
          key: `${edge.branchId}-to`,
          text,
          aria: accessibleLabel(edge),
          style: {
            right: 4,
            top: edge.from.y,
            transform: 'translateY(-50%)',
          },
          attribute: 'to-edge' as const,
          edge,
        };
      }
      return {
        key: `${edge.branchId}-from`,
        text,
        aria: accessibleLabel(edge),
        style: {
          left: 4,
          top: edge.to.y,
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
          const route = routeEdge(edge);
          return (
            <g
              key={`${edge.branchId}-${edge.direction}-${edge.direction === 'same-page' ? '' : edge.targetPage ?? ''}`}
              className={`nf-page-edge nf-page-edge-${edge.role} nf-page-edge-${edge.direction}`}
              data-page-edge-id={edge.branchId}
              data-page-edge-role={edge.role}
              data-page-edge-direction={edge.direction}
              data-page-edge-target-page={edge.targetPage ?? undefined}
              data-page-edge-from={pointAttribute(edge.from)}
              data-page-edge-to={pointAttribute(edge.to)}
              data-page-edge-anchor-id={edge.anchorId}
              data-page-edge-anchor-start={
                edge.anchorId !== undefined && edge.direction === 'same-page' ? 'true' : undefined
              }
            >
              <path
                className={`nf-page-edge-path nf-page-edge-path-${edge.role}`}
                d={route.path}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
              <path
                className={`nf-page-edge-arrow nf-page-edge-arrow-${edge.role}`}
                d={route.arrow}
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
