import { describe, expect, it } from 'vitest';
import { pdfFileNameForTitle } from '../src/shared/export';

/**
 * M4d2: the export save dialog suggests `<document title>.pdf`. The helper is
 * shared by the renderer (default name) and main (dialog validation), so a
 * title with path separators or reserved characters can never leak into the
 * suggested filename or add a second extension.
 */
describe('export PDF filename', () => {
  it('uses the document title with one .pdf extension', () => {
    expect(pdfFileNameForTitle('Linear algebra')).toBe('Linear algebra.pdf');
    expect(pdfFileNameForTitle('Already.pdf')).toBe('Already.pdf');
  });

  it('replaces path separators and reserved characters', () => {
    expect(pdfFileNameForTitle('Notes / Lecture 3: eigenvalues?')).toBe(
      'Notes Lecture 3 eigenvalues.pdf',
    );
    expect(pdfFileNameForTitle('a\\b\u0000c')).toBe('a b c.pdf');
  });

  it('falls back to Untitled for an empty or whitespace title', () => {
    expect(pdfFileNameForTitle('')).toBe('Untitled.pdf');
    expect(pdfFileNameForTitle('   ')).toBe('Untitled.pdf');
  });
});
