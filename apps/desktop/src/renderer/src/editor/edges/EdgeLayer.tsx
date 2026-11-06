import { useMemo } from 'react';
import type { Rect } from '../../lib/geometry';
import {
  routeBelowStackGroup,
  routeRightChildren,
  type RoutedEdge,
  type RoutedTrunk,
} from '../../lib/edge-routing';
import { routeReferenceEdge } from '../../lib/reference-routing';
import type { EdgeKind, EdgePlacement, ReferenceEdgePair } from '../../lib/tree';
import { recordPerf } from '../../lib/perf';

export interface EdgeDescriptor {
  id: string;
  parentId: string;
  childId: string;
  index: number;
  count: number;
  kind: EdgeKind;
  placement: EdgePlacement;
  anchorId?: string;
}

export type ReferenceEdgeDescriptor = ReferenceEdgePair;

interface EdgeLayerProps {
  edges: readonly EdgeDescriptor[];
  referenceEdges?: readonly ReferenceEdgeDescriptor[];
  rects: ReadonlyMap<string, Rect>;
  activePath: ReadonlySet<string>;
  selectedBlockId?: string | null;
  onEdgeClick?: (childId: string, anchor: { x: number; y: number }) => void;
  onTrunkClick?: (parentId: string) => void;
  onReferenceEdgeClick?: (targetId: string) => void;
}

interface RoutedGroupResult {
  edges: RoutedEdge[];
  trunks: RoutedTrunk[];
}

export function EdgeLayer({ edges, referenceEdges = [], rects, activePath, selectedBlockId = null, onEdgeClick, onTrunkClick, onReferenceEdgeClick }: EdgeLayerProps): JSX.Element {
  const hasSelection = activePath.size > 1;

  const routed = useMemo(() => {
    const started = performance.now();
    const grouped = new Map<
      string,
      {
        parent: Rect;
        below: Array<{ id: string; rect: Rect }>;
        right: Array<{ id: string; rect: Rect }>;
      }
    >();
    for (const edge of edges) {
      const parent = rects.get(edge.parentId);
      const child = rects.get(edge.childId);
      if (parent === undefined || child === undefined) continue;
      let group = grouped.get(edge.parentId);
      if (group === undefined) {
        group = { parent, below: [], right: [] };
        grouped.set(edge.parentId, group);
      }
      // Placement comes from the same projection that builds the editor, not
      // from the measured kind: a callout and a wrapped direct child share the
      // one below-stack trunk.
      if (edge.placement === 'below') group.below.push({ id: edge.id, rect: child });
      else group.right.push({ id: edge.id, rect: child });
    }
    const result = new Map<string, RoutedGroupResult>();
    for (const [parentId, group] of grouped) {
      const edgesOut: RoutedEdge[] = [];
      const trunks: RoutedTrunk[] = [];
      if (group.below.length > 0) {
        const below = routeBelowStackGroup({
          parentId,
          parent: group.parent,
          children: group.below,
        });
        edgesOut.push(...below.edges);
        trunks.push(...below.trunks);
      }
      if (group.right.length > 0) {
        const right = routeRightChildren({
          parentId,
          parent: group.parent,
          children: group.right,
        });
        edgesOut.push(...right.edges);
        trunks.push(...right.trunks);
      }
      result.set(parentId, { edges: edgesOut, trunks });
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

  // Reference edges are routed after node placement and never share the
  // primary trunk. A two-way pair gets symmetric lane offsets so both dashed
  // curves stay visible instead of painting on top of each other.
  const referenceRoutes = useMemo(() => {
    const started = performance.now();
    const totals = new Map<string, number>();
    for (const edge of referenceEdges) {
      if (!rects.has(edge.sourceId) || !rects.has(edge.targetId)) continue;
      const key = [edge.sourceId, edge.targetId].sort().join('\u0000');
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const routes: Array<{
      edge: ReferenceEdgeDescriptor;
      path: string;
      arrowPath: string;
      active: boolean;
    }> = [];
    for (const edge of referenceEdges) {
      const source = rects.get(edge.sourceId);
      const target = rects.get(edge.targetId);
      if (source === undefined || target === undefined) continue;
      const key = [edge.sourceId, edge.targetId].sort().join('\u0000');
      const index = seen.get(key) ?? 0;
      seen.set(key, index + 1);
      const total = totals.get(key) ?? 1;
      const lane = total > 1 ? (index - (total - 1) / 2) * 14 : 0;
      const route = routeReferenceEdge(source, target, { lane });
      routes.push({
        edge,
        path: route.path,
        arrowPath: route.arrowPath,
        active:
          selectedBlockId !== null &&
          (selectedBlockId === edge.sourceId || selectedBlockId === edge.targetId),
      });
    }
    recordPerf('edge', performance.now() - started);
    return routes;
  }, [referenceEdges, rects, selectedBlockId]);

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

  const arrowClass = (descriptor: EdgeDescriptor, routedEdge: RoutedEdge): string => {
    const active = activePath.has(descriptor.parentId) && activePath.has(descriptor.childId);
    const muted = hasSelection && !active;
    return [
      'nf-edge-arrow',
      active ? 'nf-edge-active' : '',
      muted ? 'nf-edge-muted' : '',
      routedEdge.defect ? 'nf-edge-defect' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
  };

  return (
    <svg className="nf-edge-layer" aria-hidden="true" focusable="false">
      <g>
        {[...groupedEdges.entries()].flatMap(([parentId, group]) =>
          group.trunks.map((trunk) => {
            // Each trunk only owns its own placement group: a selected
            // callout must not light the right trunk, and a selected direct
            // child must not light the below trunk.
            const trunkActive =
              activePath.has(parentId) &&
              edges.some(
                (edge) =>
                  edge.parentId === parentId &&
                  edge.placement === trunk.placement &&
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
                  data-trunk-placement={trunk.placement}
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
          return (
            <g
              key={descriptor.id}
              data-edge-id={descriptor.id}
              data-parent-id={descriptor.parentId}
              data-child-id={descriptor.childId}
              data-edge-kind={descriptor.kind}
              data-anchor-id={descriptor.anchorId ?? undefined}
              data-placement={edge.placement}
            >
              <path
                d={edge.path}
                className={edgeClass(descriptor, edge)}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
              <path
                d={edge.arrow.path}
                className={arrowClass(descriptor, edge)}
                data-arrow="true"
                data-arrow-direction={edge.arrow.direction}
                fillRule="nonzero"
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
      <g className="nf-reference-edge-layer">
        {referenceRoutes.map(({ edge, path, arrowPath, active }) => (
          <g
            key={edge.id}
            data-reference-edge-id={edge.id}
            data-reference-source={edge.sourceId}
            data-reference-target={edge.targetId}
            data-reference-anchor-id={edge.anchorId ?? undefined}
            data-reference-active={active ? 'true' : undefined}
          >
            <path
              d={path}
              className={`nf-edge-reference${active ? ' nf-edge-reference-active' : ''}`}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
            <path
              d={arrowPath}
              className={`nf-edge-reference-arrow${active ? ' nf-edge-reference-active' : ''}`}
              data-reference-arrow="open"
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
            {onReferenceEdgeClick === undefined ? null : (
              <path
                d={path}
                className="nf-edge-reference-hit"
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                vectorEffect="non-scaling-stroke"
                onClick={(event) => {
                  event.stopPropagation();
                  onReferenceEdgeClick(edge.targetId);
                }}
              />
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
