import { useId, useMemo } from 'react';
import { GEOMETRY, type Rect } from '../../lib/geometry';
import {
  routeChildGroup,
  type RoutedEdge,
  type RoutedTrunk,
} from '../../lib/edge-routing';
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
  onTrunkClick?: (parentId: string) => void;
}

interface RoutedGroupResult {
  edges: RoutedEdge[];
  trunks: RoutedTrunk[];
}

export function EdgeLayer({ edges, rects, activePath, onEdgeClick, onTrunkClick }: EdgeLayerProps): JSX.Element {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const hasSelection = activePath.size > 1;

  const routed = useMemo(() => {
    const started = performance.now();
    const grouped = new Map<
      string,
      { parent: Rect; children: Array<{ id: string; rect: Rect }> }
    >();
    for (const edge of edges) {
      const parent = rects.get(edge.parentId);
      const child = rects.get(edge.childId);
      if (parent === undefined || child === undefined) continue;
      let group = grouped.get(edge.parentId);
      if (group === undefined) {
        group = { parent, children: [] };
        grouped.set(edge.parentId, group);
      }
      group.children.push({ id: edge.id, rect: child });
    }
    const result = new Map<string, RoutedGroupResult>();
    for (const [parentId, group] of grouped) {
      result.set(
        parentId,
        routeChildGroup({ parentId, parent: group.parent, children: group.children }),
      );
    }
    recordPerf('edge', performance.now() - started);
    return result;
  }, [edges, rects]);

  const groupedEdges = useMemo(() => {
    const byParent = new Map<string, RoutedGroupResult>();
    for (const edge of edges) {
      const group = routed.get(edge.parentId);
      if (group !== undefined) byParent.set(edge.parentId, group);
    }
    return byParent;
  }, [edges, routed]);

  const edgeClass = (descriptor: EdgeDescriptor, routedEdge: RoutedEdge): string => {
    const parentActive = activePath.has(descriptor.parentId);
    const childActive = activePath.has(descriptor.childId);
    const active = parentActive && childActive;
    const muted = hasSelection && !active;
    return [
      'nf-edge-path',
      active ? 'nf-edge-active' : '',
      muted ? 'nf-edge-muted' : '',
      routedEdge.defect ? 'nf-edge-defect' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
  };

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
        {[...groupedEdges.entries()].flatMap(([parentId, group]) =>
          group.trunks.map((trunk) => {
            const trunkActive =
              activePath.has(parentId) &&
              edges.some(
                (edge) =>
                  edge.parentId === parentId &&
                  activePath.has(edge.childId) &&
                  group.edges.some((item) => item.id === edge.id),
              );
            const muted = hasSelection && !trunkActive;
            const className = [
              'nf-edge-trunk',
              trunkActive ? 'nf-edge-active' : '',
              muted ? 'nf-edge-muted' : '',
            ]
              .filter((part) => part.length > 0)
              .join(' ');
            return (
              <g key={`${parentId}:${trunk.id}`}>
                <path
                  d={trunk.path}
                  className={className}
                  data-trunk-id={trunk.id}
                  data-trunk-kind={trunk.kind}
                  data-parent-id={parentId}
                  fill="none"
                />
                {onTrunkClick === undefined ? null : (
                  <path
                    d={trunk.path}
                    className="nf-edge-trunk-hit"
                    data-trunk-hit={parentId}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    vectorEffect="non-scaling-stroke"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTrunkClick(parentId);
                    }}
                  />
                )}
              </g>
            );
          }),
        )}
      </g>
      <g>
        {edges.map((descriptor) => {
          const group = routed.get(descriptor.parentId);
          const edge = group?.edges.find((candidate) => candidate.id === descriptor.id);
          if (edge === undefined) return null;
          const active = activePath.has(descriptor.parentId) && activePath.has(descriptor.childId);
          const marker = active ? `${uid}-arrow-active` : `${uid}-arrow`;
          return (
            <g
              key={descriptor.id}
              data-edge-id={descriptor.id}
              data-parent-id={descriptor.parentId}
              data-child-id={descriptor.childId}
              data-placement={edge.placement}
            >
              <path
                d={edge.path}
                className={edgeClass(descriptor, edge)}
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
