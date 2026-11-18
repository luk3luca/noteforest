import { describe, expect, it } from 'vitest';
import { createDocument, type Document } from '@noteforest/core';
import {
  DEFAULT_PAGE_SETTINGS,
  PAGE_THEME_PRESETS,
  mmToPx,
  normalizePageSettings,
  pageCssVariables,
  pageLayoutOptions,
} from '@noteforest/layout';
import {
  applyPageCssVariables,
  corePageGeometry,
  pageSetupOf,
  toLayoutDocument,
} from '../src/renderer/src/page/adapter';

function fixture(): Document {
  const document = createDocument({
    id: 'doc-m4b1',
    chapterId: 'ch-1',
    title: 'Page adapter',
  });
  document.chapters[0]!.title = 'Chapter one';
  document.chapters[0]!.topLevelBlockIds = ['b1'];
  document.blocks['b1'] = {
    id: 'b1',
    label: 'Root',
    border: 'strong',
    content: {
      type: 'doc',
      extensions: { keep: true },
      children: [
        {
          type: 'paragraph',
          attrs: { custom: 'kept' },
          children: [
            {
              type: 'text',
              text: 'Hello forest',
              marks: [{ type: 'anchor', attrs: { anchorIds: ['a-text'] } }],
            },
          ],
        },
      ],
    },
    extensions: { blockUnknown: 1 },
  };
  document.blocks['b2'] = {
    id: 'b2',
    content: {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Child' }] }],
    },
  };
  document.branches['br-primary'] = {
    id: 'br-primary',
    source: { blockId: 'b1' },
    targetBlockId: 'b2',
    role: 'primary',
    order: 'm',
  };
  document.branches['br-reference'] = {
    id: 'br-reference',
    source: { blockId: 'b2' },
    targetBlockId: 'b1',
    role: 'reference',
    order: 'z',
    label: 'see also',
  };
  document.anchors['a-text'] = {
    id: 'a-text',
    blockId: 'b1',
    kind: 'text',
    selector: { kind: 'text', quote: 'forest', prefix: 'Hello ', occurrenceHint: 1 },
    quote: 'forest',
  };
  document.assets['asset-1'] = {
    id: 'asset-1',
    path: 'assets/asset-1',
    mime: 'image/png',
    width: 120,
    height: 80,
    alt: 'Diagram',
  };
  return document;
}

describe('core -> layout page adapter', () => {
  it('preserves identity and order without mutating the canonical document', () => {
    const document = fixture();
    document['pageSetup'] = { size: 'A4', orientation: 'portrait' };
    document['manualBreakBeforeBlockIds'] = ['b2'];
    const before = JSON.stringify(document);
    const note = toLayoutDocument(document);

    expect(JSON.stringify(document)).toBe(before);
    expect(note.id).toBe('doc-m4b1');
    expect(note.title).toBe('Page adapter');
    expect(Object.keys(note.blocks)).toEqual(['b1', 'b2']);
    expect(note.blocks['b1']!.label).toBe('Root');
    expect(note.blocks['b1']!.border).toBe('subtle');
    expect(note.chapters.map((chapter) => chapter.id)).toEqual(['ch-1']);
    expect(note.chapters[0]!.title).toBe('Chapter one');
    expect(note.chapters[0]!.topLevelBlockIds).toEqual(['b1']);
    expect(note).not.toHaveProperty('manualBreakBeforeBlockIds');
    expect(note).not.toHaveProperty('pageSetup');
    expect(note.branches['br-primary']).toMatchObject({
      id: 'br-primary',
      source: { blockId: 'b1' },
      targetBlockId: 'b2',
      role: 'primary',
      order: 'm',
    });
    expect(note.branches['br-reference']).toMatchObject({
      id: 'br-reference',
      role: 'reference',
      label: 'see also',
    });
    expect(note.anchors['a-text']).toMatchObject({
      id: 'a-text',
      blockId: 'b1',
      kind: 'text',
      quote: 'forest',
      prefix: 'Hello ',
    });
    expect(note.assets['asset-1']).toEqual({
      id: 'asset-1',
      path: 'assets/asset-1',
      alt: 'Diagram',
      width: 120,
      height: 80,
    });

    // Unknown content fields survive the copy; the canonical object is untouched.
    const content = note.blocks['b1']!.content as Record<string, unknown>;
    expect(content['extensions']).toEqual({ keep: true });
    const paragraph = (content['children'] as Array<Record<string, unknown>>)[0]!;
    expect(paragraph['attrs']).toEqual({ custom: 'kept' });
  });

  it('resolves A4, A5, and Letter geometry from explicit settings', () => {
    const a4 = corePageGeometry(DEFAULT_PAGE_SETTINGS);
    expect(a4.pageWidthMm).toBe(297);
    expect(a4.pageHeightMm).toBe(210);
    expect(a4.contentWidthPx).toBeCloseTo(mmToPx(297 - 24), 6);
    expect(a4.contentHeightPx).toBeCloseTo(mmToPx(210 - 24), 6);

    const a5 = corePageGeometry(
      normalizePageSettings({ setup: { size: 'A5', orientation: 'portrait' } }),
    );
    expect(a5.pageWidthMm).toBe(148);
    expect(a5.pageHeightMm).toBe(210);
    expect(a5.contentWidthPx).toBeCloseTo(mmToPx(148 - 24), 6);

    const letter = corePageGeometry(
      normalizePageSettings({ setup: { size: 'Letter', orientation: 'portrait' } }),
    );
    expect(letter.pageWidthMm).toBe(215.9);
    expect(letter.pageHeightMm).toBe(279.4);

    const settings = normalizePageSettings({
      setup: {
        size: 'A5',
        orientation: 'landscape',
        margins: { top: 10, right: 9, bottom: 11, left: 8 },
      },
    });
    expect(pageSetupOf(settings)).toEqual({
      size: 'A5',
      orientation: 'landscape',
      margins: { top: 10, right: 9, bottom: 11, left: 8 },
    });
    expect(pageLayoutOptions(settings.theme).wrapPolicy).toBe('group-left-origin');
  });

  it('applies the theme CSS variables to a page/measurement target', () => {
    const theme = PAGE_THEME_PRESETS.comfortable;
    const properties: Record<string, string> = {};
    applyPageCssVariables(
      {
        style: {
          setProperty(name, value) {
            properties[name] = value;
          },
        },
      },
      theme,
    );
    expect(properties).toEqual(pageCssVariables(theme));
    expect(properties['--nf-page-body-size']).toBe('10.5pt');
    expect(properties['--nf-page-card-padding']).toBe('12px');
  });

  it('maps every anchor kind to the layout record without a second resolver', () => {
    const document = fixture();
    document.anchors['a-formula'] = {
      id: 'a-formula',
      blockId: 'b1',
      kind: 'formula',
      selector: { kind: 'formula', form: 'whole', latex: 'x^2' },
    };
    document.anchors['a-code'] = {
      id: 'a-code',
      blockId: 'b2',
      kind: 'code',
      selector: { kind: 'code', quote: 'const x', lineStart: 2 },
    };
    document.anchors['a-image'] = {
      id: 'a-image',
      blockId: 'b1',
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: 'asset-1',
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        point: false,
        label: 'region',
      },
    };
    const note = toLayoutDocument(document);
    expect(note.anchors['a-formula']).toMatchObject({ quote: 'x^2', kind: 'formula' });
    expect(note.anchors['a-code']).toMatchObject({
      quote: 'const x',
      kind: 'code',
      codeToken: 'const x',
      codeLine: 2,
    });
    expect(note.anchors['a-image']).toMatchObject({ quote: 'region', kind: 'image' });
  });
});
