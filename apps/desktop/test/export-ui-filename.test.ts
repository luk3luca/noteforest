import { describe, expect, it } from 'vitest';
import {
  exportDateStamp,
  exportFileName,
  joinExportPath,
  pdfBaseNameForTitle,
  pdfFileNameForTitle,
} from '../src/shared/export';

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
    expect(pdfBaseNameForTitle('   ')).toBe('Untitled');
  });

  it('composes the sheet filename with an optional local date', () => {
    const day = new Date(2026, 10, 10);
    expect(exportDateStamp(day)).toBe('2026-11-10');
    expect(exportFileName('Linear algebra', false, day)).toBe('Linear algebra.pdf');
    expect(exportFileName('Linear algebra.pdf', true, day)).toBe(
      'Linear algebra — 2026-11-10.pdf',
    );
    expect(exportFileName('', false, day)).toBe('Untitled.pdf');
    expect(exportFileName('Notes / Lecture', false, day)).toBe('Notes Lecture.pdf');
  });

  it('joins a folder and a filename without doubling separators', () => {
    expect(joinExportPath('/Users/luca/Documents', 'Note.pdf')).toBe(
      '/Users/luca/Documents/Note.pdf',
    );
    expect(joinExportPath('/Users/luca/Documents/', 'Note.pdf')).toBe(
      '/Users/luca/Documents/Note.pdf',
    );
  });
});
