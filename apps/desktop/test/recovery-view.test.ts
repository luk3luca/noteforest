import { describe, expect, it } from 'vitest';
import { coreError } from '@noteforest/core';
import {
  recoveryDetails,
  recoveryStatus,
  recoveryTitle,
} from '../src/main/recovery-view';

describe('recovery view helpers', () => {
  it('reads a readable title and falls back to the package folder', () => {
    expect(recoveryTitle('/library/linear-algebra', '{"title":"Eigenvalues"}')).toBe(
      'Eigenvalues',
    );
    expect(recoveryTitle('/library/linear-algebra', '{"title":')).toBe('linear-algebra');
    expect(recoveryTitle('/library/linear-algebra', '{"title":"   "}')).toBe(
      'linear-algebra',
    );
    expect(recoveryTitle('/library/', null)).toBe('library');
  });

  it('maps read-only reasons onto the closed recovery statuses', () => {
    expect(recoveryStatus('newer-schema')).toBe('newer-schema');
    expect(recoveryStatus('missing')).toBe('missing');
    expect(recoveryStatus('corrupt')).toBe('unreadable');
    expect(recoveryStatus('invalid')).toBe('unreadable');
    expect(recoveryStatus(undefined)).toBe('unreadable');
  });

  it('flattens validation issues into readable details', () => {
    const error = coreError('invalid-document', 'document failed validation with 2 error(s)');
    error.issues = [
      { severity: 'error', code: 'dangling-target', message: 'branch points at a missing block', path: 'branches.b1' },
      { severity: 'error', code: 'invalid-shape', message: 'chapter title must be a string' },
    ];
    expect(recoveryDetails([error])).toEqual([
      'branches.b1: branch points at a missing block',
      'chapter title must be a string',
    ]);
    expect(recoveryDetails([coreError('malformed-json', 'not JSON')])).toEqual([]);
  });
});
