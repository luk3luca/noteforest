import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  joinExportPath,
  pdfBaseNameForTitle,
  pdfFileNameForTitle,
} from '../src/shared/export';

/**
 * R4: the export filename is always `<document title>.pdf`. The helper is
 * shared by the renderer (default name) and the sheet, so a title with path
 * separators or reserved characters can never leak into the name or add a
 * second extension. No date suffix and no filename pattern exist.
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
    expect(pdfBaseNameForTitle('   ')).toBe('Untitled');
  });

  it('composes the sheet filename with no date or pattern', () => {
    expect(exportFileName('Linear algebra')).toBe('Linear algebra.pdf');
    expect(exportFileName('Linear algebra.pdf')).toBe('Linear algebra.pdf');
    expect(exportFileName('')).toBe('Untitled.pdf');
    expect(exportFileName('Notes / Lecture')).toBe('Notes Lecture.pdf');
    expect(exportFileName('Linear algebra')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('joins a folder and a filename without doubling separators', () => {
    expect(joinExportPath('~/Documents', 'Note.pdf')).toBe(
      '~/Documents/Note.pdf',
    );
    expect(joinExportPath('~/Documents/', 'Note.pdf')).toBe(
      '~/Documents/Note.pdf',
    );
  });
});
