/**
 * Live Continuous settings preview (R6, moved to the shared rail).
 *
 * A fixed sample tree, not the current document and not a Page preview. It
 * uses the resolved Continuous CSS variables, spacing, edge corridor, arrow
 * size, stroke widths, and note surface. Card widths are the configured caps
 * scaled by one documented preview factor, and the resolved stage is scaled to
 * fit the rail width as a single transform, so the sample never clips while the
 * cards drive the configured caps. Spacing, corridor, and arrow geometry are
 * the real values; only the presentation is uniformly scaled.
 */

import { useMemo, type CSSProperties } from 'react';
import {
  continuousCssVariables,
  continuousEdgeStyle,
  type ContinuousSettings,
} from '@noteforest/layout';
import { EdgeLayer, type EdgeDescriptor } from '../editor/edges/EdgeLayer';
import { buildContinuousPreview } from './continuous-preview';
import { useMeasuredElement } from './useMeasuredSize';

const EMPTY_PATH: ReadonlySet<string> = new Set();

export function ContinuousSettingsPreview({
  settings,
}: {
  settings: ContinuousSettings;
}): JSX.Element {
  const sample = useMemo(() => buildContinuousPreview(settings), [settings]);
  const css = useMemo(
    () => continuousCssVariables(settings) as CSSProperties,
    [settings],
  );
  const edgeStyle = useMemo(() => continuousEdgeStyle(settings), [settings]);
  const { ref: fitRef, size: fit } = useMeasuredElement();
  // Scale-to-fit the rail: a single uniform transform, never a second layout.
  // Below the stage width (the maximum width caps) it scales down; at the
  // defaults the 355 px sample fits and stays at 1.
  const scale = fit.width > 0 ? Math.min(1, fit.width / sample.width) : 1;
  const edges = useMemo<EdgeDescriptor[]>(
    () => [
      {
        id: 'sample-child-1',
        parentId: 'sample-root',
        childId: 'sample-child-1',
        index: 0,
        count: 2,
        kind: 'direct',
        placement: 'right',
      },
      {
        id: 'sample-child-2',
        parentId: 'sample-root',
        childId: 'sample-child-2',
        index: 1,
        count: 2,
        kind: 'direct',
        placement: 'right',
      },
      {
        id: 'sample-callout',
        parentId: 'sample-root',
        childId: 'sample-callout',
        index: 0,
        count: 1,
        kind: 'callout',
        placement: 'below',
        anchorId: 'sample-anchor',
      },
    ],
    [],
  );
  const rects = useMemo(
    () =>
      new Map([
        ['sample-root', sample.root],
        ['sample-child-1', sample.childOne],
        ['sample-child-2', sample.childTwo],
        ['sample-callout', sample.callout],
      ]),
    [sample],
  );

  const card = (
    id: string,
    rect: { x: number; y: number; width: number; height: number },
    label: string,
    variant: 'root' | 'child' | 'callout',
  ): JSX.Element => (
    <div
      key={id}
      className="nf-settings-continuous-card"
      data-preview-card={variant}
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    >
      <span className="nf-settings-continuous-card-label">
        {variant === 'root' ? 'Top-level' : variant === 'callout' ? 'Callout' : 'Child'}
      </span>
      <span className="nf-settings-continuous-card-body">{label}</span>
    </div>
  );

  return (
    <aside
      className="nf-settings-preview"
      data-continuous-preview="true"
      data-continuous-preview-scale={scale.toFixed(3)}
      style={css}
      role="region"
      aria-label="Continuous preview"
    >
      <h4 className="nf-settings-preview-title">Preview</h4>
      <p className="nf-settings-preview-scope" data-continuous-preview-scope="true">
        Global · every document
      </p>
      <div className="nf-continuous-preview-fit" ref={fitRef}>
        <div
          className="nf-continuous-preview-frame"
          data-continuous-preview-frame="true"
          style={{
            width: `${sample.width * scale}px`,
            height: `${sample.height * scale}px`,
          }}
        >
          <div
            className="nf-continuous-preview-stage"
            data-continuous-preview-stage="true"
            style={{
              width: `${sample.width}px`,
              height: `${sample.height}px`,
              transform: `scale(${scale})`,
            }}
          >
            {card('sample-root', sample.root, 'Sample note', 'root')}
            {card('sample-child-1', sample.childOne, 'First child', 'child')}
            {card('sample-child-2', sample.childTwo, 'Second child', 'child')}
            {card('sample-callout', sample.callout, 'Anchored note', 'callout')}
            <EdgeLayer
              edges={edges}
              rects={rects}
              activePath={EMPTY_PATH}
              edgeStyle={edgeStyle}
            />
          </div>
        </div>
      </div>
      <p className="nf-settings-help" data-continuous-preview-note="true">
        Sample tree: one top-level note, two direct children, and one callout. Card widths follow
        the caps; spacing and arrows match the canvas exactly.
      </p>
    </aside>
  );
}
