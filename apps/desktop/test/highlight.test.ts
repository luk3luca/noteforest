import { readFileSync } from 'node:fs';
import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HIGHLIGHT_TONE,
  HIGHLIGHT_MARK_TYPE,
  HIGHLIGHT_TONES,
  normalizeHighlightTone,
} from '@noteforest/core';
import {
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  pageLayoutOptions,
  pageSettingsFingerprint,
  paginate,
  type ContentBlock,
  type NoteDocument,
} from '@noteforest/layout';
import { buildPrintModel } from '@noteforest/pdf';
import type { Editor } from '@tiptap/core';
import { contentToPM } from '../src/renderer/src/lib/adapter';
import { blockContentFromEditorJson } from '../src/renderer/src/lib/page-edit';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import { toggleLastHighlight } from '../src/renderer/src/editor/highlight-mark';
import {
  highlightToggleAction,
  lastHighlightTone,
  rememberHighlightTone,
  resetHighlightSession,
} from '../src/renderer/src/lib/highlight';
import {
  buildSegments,
  segmentsHtml,
  type SegmentOptions,
} from '../src/renderer/src/page/segments';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const stylesSource = read('../src/renderer/src/styles.css');
const printCssSource = read('../src/renderer/src/print/print.css');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

const css = stripComments(stylesSource);

function block(selector: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`missing CSS block: ${marker}`);
  let depth = 0;
  const begin = start + marker.length;
  for (let index = begin - 1; index < css.length; index += 1) {
    const character = css[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(begin, index);
    }
  }
  throw new Error(`unterminated CSS block: ${marker}`);
}

function declarations(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of source.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    if (property.length === 0) continue;
    result.set(property, part.slice(colon + 1).trim());
  }
  return result;
}

function declaration(selector: string, property: string): string | undefined {
  return declarations(block(selector)).get(property);
}

/** First declaration of a custom property anywhere in the stylesheet. */
function customProperty(name: string): string | undefined {
  const match = new RegExp(`(?:^|[;{]\\s*)${name}\\s*:\\s*([^;]+);`).exec(css);
  return match?.[1]?.trim();
}

const options: SegmentOptions = { assets: {}, tableColumns: {}, listIndent: 18 };

function highlightedContent(tone: unknown) {
  return {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'plain ' },
          {
            type: 'text',
            text: 'tinted',
            marks: [{ type: HIGHLIGHT_MARK_TYPE, attrs: { tone } }],
          },
          { type: 'text', text: ' plain' },
        ],
      },
    ],
  };
}

function blockText(tone: unknown): ContentBlock {
  return {
    id: 'tone',
    label: 'Tone',
    content: highlightedContent(tone) as ContentBlock['content'],
  };
}

describe('highlight editor schema', () => {
  it('defines the inline mark with exactly one tone attribute', () => {
    const schema = getSchema(createEditorExtensions());
    const mark = schema.marks[HIGHLIGHT_MARK_TYPE];
    expect(mark).toBeDefined();
    expect(Object.keys(mark?.spec.attrs ?? {})).toEqual(['tone']);
    const bold = schema.marks['bold']?.create();
    expect(mark?.isInSet(bold === undefined ? [] : [bold])).toBeUndefined();
    // Inline only: the mark belongs to the mark set, never to a node.
    expect(schema.nodes[HIGHLIGHT_MARK_TYPE]).toBeUndefined();
    expect(mark?.spec.inclusive).toBe(false);
  });
});

describe('Page segment rendering', () => {
  it('renders one highlight span per tone with the tone attribute and nothing else', () => {
    for (const tone of HIGHLIGHT_TONES) {
      const segments = buildSegments(blockText(tone), options);
      const html = segmentsHtml(segments);
      expect(html).toContain(`<span class="nf-highlight" data-highlight-tone="${tone}">tinted</span>`);
      expect(html).not.toMatch(/data-highlight-tone="[^"]+" style=/);
      expect(html).not.toMatch(/nf-highlight[^"]*"[^>]*style=/);
    }
  });

  it('normalizes an unknown stored tone to the default instead of dropping the mark', () => {
    const html = segmentsHtml(buildSegments(blockText('violet'), options));
    expect(normalizeHighlightTone('violet')).toBe(DEFAULT_HIGHLIGHT_TONE);
    expect(html).toContain(
      `<span class="nf-highlight" data-highlight-tone="${DEFAULT_HIGHLIGHT_TONE}">tinted</span>`,
    );
    // A mark with no attrs at all still renders (never a crash, never lost).
    const bare = segmentsHtml(
      buildSegments(
        {
          id: 'bare',
          content: {
            type: 'doc',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'tinted', marks: [{ type: 'highlight' }] }],
              },
            ],
          },
        },
        options,
      ),
    );
    expect(bare).toContain(`data-highlight-tone="${DEFAULT_HIGHLIGHT_TONE}"`);
  });

  it('keeps the highlight markup to a background: no metric-bearing style', () => {
    const segments = buildSegments(blockText('amber'), options);
    const html = segmentsHtml(segments);
    // The only inline style the page projection ever emits is a list indent or
    // a measured table width; a highlight must add none of its own.
    expect(html).not.toContain('padding');
    expect(html).not.toContain('border');
    expect(html).not.toContain('font-weight');
  });
});

describe('Page Edit commit keeps the mark', () => {
  it('round-trips a highlighted run through the editor projection and back', () => {
    const base = {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'before tinted after' }],
        },
      ],
    } as ContentBlock['content'];

    // The overlay opens from the shared projection; the mark is in the schema.
    const projected = contentToPM(base);
    expect(JSON.stringify(projected)).not.toContain('highlight');

    // The overlay commits the same schema: one edited text run carries the mark.
    const committed = blockContentFromEditorJson(base, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            {
              type: 'text',
              text: 'tinted',
              marks: [{ type: 'highlight', attrs: { tone: 'blue' } }],
            },
            { type: 'text', text: ' after' },
          ],
        },
      ],
    });
    expect(JSON.stringify(committed)).toContain(
      '{"type":"highlight","attrs":{"tone":"blue"}}',
    );
    // And the projection of the committed content keeps it for the next open.
    expect(JSON.stringify(contentToPM(committed))).toContain('"type":"highlight"');
  });
});

describe('highlight tones in CSS', () => {
  it('uses the ratified Continuous strengths from the live roles', () => {
    expect(customProperty('--nf-highlight-blue')).toBe(
      'color-mix(in srgb, var(--accent) 20%, transparent)',
    );
    expect(customProperty('--nf-highlight-green')).toBe(
      'color-mix(in srgb, var(--success) 20%, transparent)',
    );
    expect(customProperty('--nf-highlight-amber')).toBe(
      'color-mix(in srgb, var(--warning) 22%, transparent)',
    );
    expect(customProperty('--nf-highlight-rose')).toBe(
      'color-mix(in srgb, var(--danger) 18%, transparent)',
    );
  });

  it('prints the fixed light paper tone at 28% over white for every tone', () => {
    // The paper never reads a shell role: the tone is the light-theme role at
    // 28 % over white, so a dark app still exports a highlighter on paper.
    const paper: Array<[string, string]> = [
      ['blue', '#c5d2de'],
      ['green', '#c5d6ce'],
      ['amber', '#ded1b8'],
      ['rose', '#e5c8c6'],
    ];
    for (const [tone, hex] of paper) {
      expect(customProperty(`--nf-page-highlight-${tone}`)).toBe(hex);
    }
  });

  it('declares background only on the mark rules', () => {
    for (const tone of HIGHLIGHT_TONES) {
      const continuous = declarations(
        block(`.nf-continuous-surface .nf-highlight[data-highlight-tone="${tone}"]`),
      );
      expect([...continuous.keys()]).toEqual(['background-color']);
      const paper = declarations(
        block(`.nf-page-scope .nf-highlight[data-highlight-tone="${tone}"]`),
      );
      expect([...paper.keys()]).toEqual(['background-color']);
    }
    // The base rules carry no box effect either: the text colour is inherited.
    expect([...declarations(block('.nf-continuous-surface .nf-highlight')).keys()]).toEqual([
      'color',
    ]);
    expect([...declarations(block('.nf-page-scope .nf-highlight')).keys()]).toEqual(['color']);
  });

  it('never paints a find highlight in print and keeps the print skin metric-free', () => {
    expect(printCssSource).not.toContain('::highlight');
    expect(printCssSource).not.toContain('nf-highlight');
    // The print root carries the Page scope, which owns the paper tones; the
    // print skin adds no metric for the mark.
    expect(printCssSource).not.toMatch(/nf-highlight[^}]*padding/);
  });
});

describe('the print model carries the highlight', () => {
  const TEXT = 'The tinted phrase survives into the paper model.';

  function documentWith(tone: string | null): NoteDocument {
    const marks = tone === null ? undefined : [{ type: HIGHLIGHT_MARK_TYPE, attrs: { tone } }];
    return {
      schemaVersion: 2,
      id: 'print-highlight',
      title: 'Print highlight',
      createdAt: '2026-11-17T00:00:00.000Z',
      updatedAt: '2026-11-17T00:00:00.000Z',
      revision: 1,
      blocks: {
        root: {
          id: 'root',
          label: 'Root',
          content: {
            type: 'doc',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: TEXT, ...(marks === undefined ? {} : { marks }) }],
              },
            ],
          },
        },
      },
      anchors: {},
      branches: {},
      chapters: [{ id: 'chapter-1', title: 'Chapter 1', topLevelBlockIds: ['root'] }],
      assets: {},
    };
  }

  function model(tone: string | null) {
    const document = documentWith(tone);
    const measurement = createEstimatedMeasurement(document);
    const settings = DEFAULT_PAGE_SETTINGS;
    const layout = layoutDocument(
      document,
      measurement,
      pageLayoutOptions(settings.theme),
      settings.setup,
    );
    const pages = paginate(layout, document);
    const print = buildPrintModel(document, layout, pages, {
      settings,
      pageModelFingerprint: pageSettingsFingerprint(settings),
    });
    return { document, layout, pages, print };
  }

  it('keeps the mark in the model and in the printable segment HTML', () => {
    const toned = model('rose');
    expect(toned.print.pageCount).toBeGreaterThan(0);
    const block = toned.print.document.blocks['root'];
    expect(JSON.stringify(block?.content)).toContain('"tone":"rose"');
    const segments = buildSegments(
      { id: 'root', content: block?.content as ContentBlock['content'] },
      { assets: {}, tableColumns: {}, listIndent: 18 },
    );
    const html = segmentsHtml(segments);
    expect(html).toContain('data-highlight-tone="rose"');
    expect(html).toContain('nf-highlight');
  });

  it('does not move the page count or the measured block box', () => {
    const plain = model(null);
    const toned = model('green');
    expect(toned.print.pageCount).toBe(plain.print.pageCount);
    expect(toned.print.pages.map((page) => page.fragments)).toEqual(
      plain.print.pages.map((page) => page.fragments),
    );
    expect(toned.print.blocks['root']?.measurement).toEqual(
      plain.print.blocks['root']?.measurement,
    );
  });
});

describe('highlighter session state', () => {
  it('starts on the default tone and remembers the last applied tone only', () => {
    resetHighlightSession();
    expect(lastHighlightTone()).toBe(DEFAULT_HIGHLIGHT_TONE);
    expect(rememberHighlightTone('amber')).toBe('amber');
    expect(lastHighlightTone()).toBe('amber');
    expect(rememberHighlightTone('violet')).toBe(DEFAULT_HIGHLIGHT_TONE);
    resetHighlightSession();
  });

  it('toggles only when the whole selection already carries the last tone', () => {
    expect(highlightToggleAction(true)).toBe('remove');
    expect(highlightToggleAction(false)).toBe('apply');
  });
});

/**
 * The `⌘⇧H` command itself, without a DOM: the decision only reads editability,
 * the selection, and the text-node marks, so a tiny editor double pins the gate
 * and the apply/remove choice.
 */
function fakeEditor(options: {
  editable?: boolean;
  empty?: boolean;
  /** One entry per text node; `null` means the node has no highlight. */
  tones: Array<string | null>;
}): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const type = { name: HIGHLIGHT_MARK_TYPE };
  const chain = {
    focus: () => chain,
    setMark: (name: string, attrs: { tone: string }) => {
      calls.push(`setMark:${name}:${attrs.tone}`);
      return chain;
    },
    unsetMark: (name: string) => {
      calls.push(`unsetMark:${name}`);
      return chain;
    },
    run: () => true,
  };
  const editor = {
    isEditable: options.editable ?? true,
    schema: { marks: { [HIGHLIGHT_MARK_TYPE]: type } },
    state: {
      selection: { empty: options.empty ?? false, from: 0, to: options.tones.length },
      doc: {
        nodesBetween: (
          _from: number,
          _to: number,
          callback: (node: unknown) => void,
        ): void => {
          for (const tone of options.tones) {
            callback({
              isText: true,
              marks: tone === null ? [] : [{ type, attrs: { tone } }],
            });
          }
        },
      },
    },
    chain: () => chain,
  };
  return { editor: editor as unknown as Editor, calls };
}

describe('⌘⇧H command', () => {
  it('does nothing in Read mode and never starts a chain', () => {
    const { editor, calls } = fakeEditor({ editable: false, tones: ['green'] });
    expect(toggleLastHighlight(editor)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does nothing with a caret', () => {
    const { editor, calls } = fakeEditor({ empty: true, tones: [] });
    expect(toggleLastHighlight(editor)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('removes the last tone when every selected text node carries it', () => {
    rememberHighlightTone('green');
    const { editor, calls } = fakeEditor({ tones: ['green', 'green'] });
    expect(toggleLastHighlight(editor)).toBe(true);
    expect(calls).toEqual([`unsetMark:${HIGHLIGHT_MARK_TYPE}`]);
  });

  it('applies the last tone to unmarked or mixed text', () => {
    rememberHighlightTone('rose');
    for (const tones of [['rose', null], ['amber'], ['rose', 'amber']] as Array<
      Array<string | null>
    >) {
      const { editor, calls } = fakeEditor({ tones });
      expect(toggleLastHighlight(editor)).toBe(true);
      expect(calls).toEqual([`setMark:${HIGHLIGHT_MARK_TYPE}:rose`]);
    }
    resetHighlightSession();
  });
});
