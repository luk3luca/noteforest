/**
 * Core index ↔ layout parity over the checked-in fixtures.
 *
 * The layout must place or skip an anchor exactly as the session index reports
 * it: one semantic state, no rect-count or occurrence-hint derivation.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAnchorIndex } from '@noteforest/core';
import type { AnchorResolutionView as CoreAnchorView } from '@noteforest/core';
import {
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
} from '@noteforest/layout';
import type { AnchorResolutionView as LayoutAnchorView } from '@noteforest/layout';
import type { Document } from '@noteforest/core';
import { toLayoutDocument } from '../src/renderer/src/page/adapter';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures');

function fixtures(): string[] {
  return readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function load(name: string): Document {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')) as Document;
}

function layoutOf(
  document: Document,
  anchorView: LayoutAnchorView,
  setup = DEFAULT_PAGE_SETTINGS.setup,
) {
  const noteDocument = toLayoutDocument(document);
  return layoutDocument(
    noteDocument,
    createEstimatedMeasurement(noteDocument),
    {},
    setup,
    anchorView,
  );
}

/** The compile-time seam: a core view is a layout view. */
function asLayoutView(view: CoreAnchorView): LayoutAnchorView {
  return view;
}

describe('core index and layout parity', () => {
  it('assigns the core view type to the layout mirror', () => {
    const document = load('m3-anchor-kinds.json');
    expect(asLayoutView(buildAnchorIndex(document).view()).documentId).toBe(document.id);
  });

  it('matches every placed anchor state for every fixture', () => {
    for (const name of fixtures()) {
      const document = load(name);
      const serializedBefore = JSON.stringify(document);
      const coreView = buildAnchorIndex(document).view();
      const layout = layoutOf(document, asLayoutView(coreView));

      const placedBlockIds = new Set(layout.blocks.map((block) => block.blockId));
      const placedAnchors = new Map<string, { blockId: string; state: string }>();
      for (const [blockId, entries] of Object.entries(coreView.byBlock)) {
        if (!placedBlockIds.has(blockId)) continue;
        for (const entry of entries) {
          placedAnchors.set(entry.anchorId, { blockId, state: entry.state });
        }
      }

      const attachments = new Map(
        layout.anchors.map((attachment) => [attachment.anchorId, attachment]),
      );
      for (const [anchorId, entry] of placedAnchors) {
        if (entry.state === 'idle' || entry.state === 'block-missing') {
          expect(attachments.has(anchorId), `${name}:${anchorId} idle attachment`).toBe(false);
          continue;
        }
        const attachment = attachments.get(anchorId);
        expect(attachment, `${name}:${anchorId} attachment`).toBeDefined();
        if (attachment === undefined) continue;
        expect(attachment.blockId, `${name}:${anchorId} block`).toBe(entry.blockId);
        expect(attachment.state, `${name}:${anchorId} state`).toBe(entry.state);
        if (entry.state === 'resolved') {
          expect(attachment.rect, `${name}:${anchorId} resolved rect`).not.toBeNull();
        } else {
          expect(attachment.rect, `${name}:${anchorId} warning rect`).toBeNull();
          expect(
            attachment.warningPoint,
            `${name}:${anchorId} warning point`,
          ).not.toBeNull();
        }
      }
      // Every attachment is a placed anchor the view reports.
      for (const attachment of layout.anchors) {
        expect(placedAnchors.get(attachment.anchorId)?.state, `${name}:${attachment.anchorId} view`).toBe(
          attachment.state,
        );
      }

      const defectAnchors = (code: 'broken-anchor' | 'ambiguous-anchor') =>
        new Set(
          layout.defects
            .filter((defect) => defect.code === code)
            .map((defect) => defect.message.match(/^Anchor (\S+)/)?.[1] ?? ''),
        );
      const expected = (state: 'broken' | 'ambiguous') =>
        new Set(
          [...placedAnchors.entries()]
            .filter(([, entry]) => entry.state === state)
            .map(([anchorId]) => anchorId),
        );
      expect(defectAnchors('broken-anchor'), `${name}: broken defects`).toEqual(
        expected('broken'),
      );
      expect(defectAnchors('ambiguous-anchor'), `${name}: ambiguous defects`).toEqual(
        expected('ambiguous'),
      );
      expect(JSON.stringify(document), `${name}: document.json unchanged`).toBe(
        serializedBefore,
      );
    }
  });

  it('shows the broken image state after an availability change', () => {
    const document = load('m3-image-regions.json');
    const assetId = '2492f7a53cb3fced6fd50d12d994a18891e56945d3a508a593678b31992c6f04';
    const view = asLayoutView(
      buildAnchorIndex(document, {
        assetAvailabilityPort: () => ({ [assetId]: 'asset-changed' }),
      }).view(),
    );
    const layout = layoutOf(document, view);
    const attachment = layout.anchors.find((anchor) => anchor.anchorId === 'm3i-a-region-a');
    expect(attachment?.state).toBe('broken');
    expect(attachment?.rect).toBeNull();
    expect(
      layout.defects.some(
        (defect) =>
          defect.code === 'broken-anchor' &&
          defect.message.startsWith('Anchor m3i-a-region-a '),
      ),
    ).toBe(true);
  });

  it('keeps split/merge anchor states equal to core', () => {
    const document = load('m3-split-merge.json');
    const coreView = buildAnchorIndex(document).view();
    const layout = layoutOf(document, asLayoutView(coreView));
    for (const attachment of layout.anchors) {
      const entry = Object.values(coreView.byBlock)
        .flat()
        .find((candidate) => candidate.anchorId === attachment.anchorId);
      expect(entry?.state, attachment.anchorId).toBe(attachment.state);
    }
    expect(layout.anchors.length).toBeGreaterThan(0);
  });
});
