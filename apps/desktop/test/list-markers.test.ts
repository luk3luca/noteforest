import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * List markers (list-fixes).
 *
 * Tailwind preflight resets `ul`/`ol` to `list-style: none`, so the markers are
 * restored by explicit `.nf-block-prose` rules. This guard keeps the restoration
 * inside the editor prose: the Page renderer draws its own `.nf-li-marker`
 * glyphs and the print compositor renders those segments, so no page/print
 * selector may gain a `list-style` declaration from this change.
 */

const stylesPath = resolve(import.meta.dirname, '../src/renderer/src/styles.css');

interface CssRule {
  selector: string;
  body: string;
}

function rules(css: string): CssRule[] {
  const result: CssRule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').replace(/\s+/g, ' ').trim();
    const body = match[2] ?? '';
    if (selector.length > 0) result.push({ selector, body });
  }
  return result;
}

/** The sheet without comments, so a leading comment never joins a selector. */
async function sheet(): Promise<string> {
  const css = await readFile(stylesPath, 'utf8');
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function declarations(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    if (property.length === 0) continue;
    result.set(property, part.slice(colon + 1).trim());
  }
  return result;
}

/** Every declaration of `list-style*` in the sheet, with its selector. */
async function listStyleRules(): Promise<CssRule[]> {
  return rules(await sheet()).filter((rule) =>
    [...declarations(rule.body).keys()].some((property) => property.startsWith('list-style')),
  );
}

describe('list markers', () => {
  it('cycles bullet and ordered markers by list depth inside the block prose', async () => {
    const all = rules(await sheet());
    const typeOf = (selector: string): string | undefined => {
      const rule = all.find((candidate) => candidate.selector === selector);
      return rule === undefined ? undefined : declarations(rule.body).get('list-style-type');
    };

    expect(typeOf('.nf-block-prose ul')).toBe('disc');
    expect(typeOf('.nf-block-prose :is(ul, ol) ul')).toBe('circle');
    expect(typeOf('.nf-block-prose ol')).toBe('decimal');
    expect(typeOf('.nf-block-prose :is(ul, ol) ol')).toBe('lower-alpha');
    // The brief's ordered cycle is decimal -> lower-alpha -> lower-roman.
    const ordered = all.filter(
      (rule) =>
        rule.selector.startsWith('.nf-block-prose') &&
        rule.selector.trimEnd().endsWith(' ol') &&
        declarations(rule.body).has('list-style-type'),
    );
    expect(ordered.map((rule) => declarations(rule.body).get('list-style-type'))).toEqual([
      'decimal',
      'lower-alpha',
      'lower-roman',
      'decimal',
      'lower-alpha',
      'lower-roman',
    ]);
    // The bullet cycle repeats after depth 3 (depth 4 is disc again).
    const bullet = all.filter(
      (rule) =>
        rule.selector.startsWith('.nf-block-prose') &&
        rule.selector.trimEnd().endsWith(' ul') &&
        declarations(rule.body).has('list-style-type'),
    );
    expect(bullet.map((rule) => declarations(rule.body).get('list-style-type'))).toEqual([
      'disc',
      'circle',
      'square',
      'disc',
      'circle',
      'square',
    ]);
  });

  it('uses the muted text role for the marker and keeps the 20 px gutter', async () => {
    const all = rules(await sheet());
    const marker = all.find((rule) => rule.selector === '.nf-block-prose li::marker');
    expect(marker).toBeDefined();
    expect(declarations(marker?.body ?? '').get('color')).toBe('var(--text-3)');

    const padding = all.find((rule) => rule.selector === '.nf-block-prose ul, .nf-block-prose ol');
    expect(padding).toBeDefined();
    expect(declarations(padding?.body ?? '').get('padding-left')).toBe('20px');
    // An outside marker is painted inside the list's own left padding, so the
    // card edge never clips it; the restoration never moves the list box.
    expect(
      all.some(
        (rule) =>
          rule.selector.startsWith('.nf-block-prose') &&
          /list-style-position\s*:\s*inside/.test(rule.body),
      ),
    ).toBe(false);
  });

  it('keeps every list-style declaration out of the page, print, and shell scopes', async () => {
    const scoped = await listStyleRules();
    expect(scoped.length).toBeGreaterThan(0);
    const shellResets = new Set([
      '.nf-health-list',
      '.nf-health-branches',
      // Unused images (DR1b): a sidebar file list and the confirm's record list
      // are shell UI, not note content; neither may restore markers.
      '.nf-health-unused-list',
      '.nf-unused-images-list',
      '.nf-delete-reference-list',
      '.nf-settings-advanced-summary',
    ]);
    for (const rule of scoped) {
      if (shellResets.has(rule.selector)) continue;
      expect(
        rule.selector.startsWith('.nf-block-prose'),
        `${rule.selector} restores markers only inside the block prose`,
      ).toBe(true);
      expect(rule.selector).not.toContain('.nf-page-scope');
      expect(rule.selector).not.toContain('.nf-page-edit-prose');
      expect(rule.selector).not.toContain('.nf-print');
    }
  });

  it('leaves the Page renderer explicit marker glyphs untouched', async () => {
    const pageMarker = rules(await sheet()).find(
      (rule) => rule.selector === '.nf-page-scope .nf-li-marker',
    );
    expect(pageMarker).toBeDefined();
    const declarationsOfMarker = declarations(pageMarker?.body ?? '');
    expect(declarationsOfMarker.get('min-width')).toBe('1.2em');
    expect(declarationsOfMarker.get('color')).toBe('var(--nf-page-muted)');

    const segments = await readFile(
      resolve(import.meta.dirname, '../src/renderer/src/page/segments.ts'),
      'utf8',
    );
    // Page/PDF keep emitting their own bullet/number glyph; the editor CSS
    // never reaches that markup.
    expect(segments).toContain('class="nf-li-marker"');
    expect(segments).toContain("ordered ? `${index}.` : '•'");
  });
});
