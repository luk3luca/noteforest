import { useId, useMemo } from 'react';
import { GEOMETRY, type Rect } from '../../lib/geometry';
import { routeBranchEdge, type RoutedEdge } from '../../lib/edge-routing';
import { recordPerf } from '../../lib/perf';

export interface EdgeDescriptor {
  id: string;
  parentId: string;
  childId: string;
  index: number;
  count: number;
}

interface EdgeLayerProps {
  edges: readonly EdgeDescriptor[];
  rects: ReadonlyMap<string, Rect>;
  activePath: ReadonlySet<string>;
  onEdgeClick?: (childId: string, anchor: { x: number; y: number }) => void;
}

export function EdgeLayer({ edges, rects, activePath, onEdgeClick }: EdgeLayerProps): JSX.Element {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const hasSelection = activePath.size > 1;

  const routed = useMemo(() => {
    const started = performance.now();
    const result: RoutedEdge[] = [];
    for (const edge of edges) {
      const parent = rects.get(edge.parentId);
      const child = rects.get(edge.childId);
      if (parent === undefined || child === undefined) continue;
      result.push(
        routeBranchEdge({
          id: edge.id,
          parent,
          child,
          index: edge.index,
          count: edge.count,
        }),
      );
    }
    recordPerf('edge', performance.now() - started);
    return result;
  }, [edges, rects]);

  return (
    <svg className="nf-edge-layer" aria-hidden="true" focusable="false">
      <defs>
        <marker
          id={`${uid}-arrow`}
          viewBox="0 0 6 6"
          refX="5.4"
          refY="3"
          markerWidth="6"
          markerHeight="6"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M 0 0 L 6 3 L 0 6 z" className="nf-arrow-head" />
        </marker>
        <marker
          id={`${uid}-arrow-active`}
          viewBox="0 0 6 6"
          refX="5.4"
          refY="3"
          markerWidth="6"
          markerHeight="6"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M 0 0 L 6 3 L 0 6 z" className="nf-arrow-head-active" />
        </marker>
      </defs>
      <g>
        {routed.map((edge) => {
          const descriptor = edges.find((candidate) => candidate.id === edge.id);
          if (descriptor === undefined) return null;
          const active = activePath.has(descriptor.parentId) && activePath.has(descriptor.childId);
          const muted = hasSelection && !active;
          const className = [
            'nf-edge-path',
            active ? 'nf-edge-active' : '',
            muted ? 'nf-edge-muted' : '',
            edge.defect ? 'nf-edge-defect' : '',
          ]
            .filter((part) => part.length > 0)
            .join(' ');
          const marker = active ? `${uid}-arrow-active` : `${uid}-arrow`;
          return (
            <g key={edge.id} data-edge-id={edge.id} data-parent-id={descriptor.parentId} data-child-id={descriptor.childId}>
              <path
                d={edge.path}
                className={className}
                markerEnd={`url(#${marker})`}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
              {onEdgeClick === undefined ? null : (
                <path
                  d={edge.path}
                  className="nf-edge-hit"
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  vectorEffect="non-scaling-stroke"
                  onClick={(event) => {
                    onEdgeClick(descriptor.childId, { x: event.clientX, y: event.clientY });
                  }}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export const EDGE_CONSTANTS = GEOMETRY;
