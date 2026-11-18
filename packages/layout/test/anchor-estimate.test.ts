/**
 * Estimate port anchor coverage (batch anchor-resolution-index, step 3).
 *
 * The DOM adapter reads `anchorIds` from marks and atomic node attrs; the
 * estimate port must do the same or M3 fixtures produce zero measured rects and
 * layout tests cannot prove anything about their states.
 */

import { describe, expect, it } from 'vitest';
import { createEstimatedMeasurement } from '../src/estimate.js';
import type { ContentNode, NoteDocument } from '../src/types.js';
import { loadFixture } from './helpers.js';

function measuredAnchors(name: string): Set<string> {
  const document = loadFixture(name);
  const port = createEstimatedMeasurement(document);
  const anchors = new Set<string>();
  for (const block of Object.values(document.blocks)) {
    for (const rect of port.measure(block, { kind: 'max-content' }).anchors) {
      anchors.add(rect.anchorId);
    }
  }
  return anchors;
}

describe('estimate measurement anchors', () => {
  it('produces rects for text, formula and code M3 anchors', () => {
    const anchors = measuredAnchors('m3-anchor-kinds.json');
    expect(anchors.has('m3k-a-text')).toBe(true);
    expect(anchors.has('m3k-a-formula-whole')).toBe(true);
    expect(anchors.has('m3k-a-formula-term')).toBe(true);
    expect(anchors.has('m3k-a-code')).toBe(true);
  });

  it('produces rects for image anchors', () => {
    const anchors = measuredAnchors('m3-image-regions.json');
    expect(anchors.has('m3i-a-region-a')).toBe(true);
    expect(anchors.has('m3i-a-region-b')).toBe(true);
    expect(anchors.has('m3i-a-shared')).toBe(true);
  });

  it('keeps the legacy singular anchorId working', () => {
    const document: NoteDocument = {
      schemaVersion: 2,
      id: 'legacy-estimate',
      title: 'Legacy',
      blocks: {
        block: {
          id: 'block',
          content: {
            type: 'doc',
            children: [
              {
                type: 'paragraph',
                children: [
                  { type: 'text', text: 'Alpha ' },
                  {
                    type: 'text',
                    text: 'target',
                    marks: [{ type: 'anchor', attrs: { anchorId: 'legacy-anchor' } }],
                  } as ContentNode,
                ],
              },
            ],
          },
        },
      },
      anchors: {},
      branches: {},
      chapters: [{ id: 'chapter', title: 'One', topLevelBlockIds: ['block'] }],
      assets: {},
    };
    const port = createEstimatedMeasurement(document);
    const measurement = port.measure(document.blocks['block']!, { kind: 'max-content' });
    expect(measurement.anchors.map((rect) => rect.anchorId)).toEqual(['legacy-anchor']);
  });
});
