import { describe, expect, it } from 'vitest';
import {
  GENERIC_COMMAND_REASON,
  commandRejection,
  commandRejectionText,
  libraryRowReasonText,
  recoveryReasonText,
} from '../src/main/core-reasons';

/**
 * Copy-plan §E follow-up: a `packages/core` reason never reaches a row, a toast,
 * or the recovery surface verbatim. These tests pin the mapping itself; the
 * boundary tests live next to the surfaces that consume it.
 */

/** Every `CommandErrorCode` in `packages/core/src/commands/types.ts`. */
const COMMAND_CODES = [
  'invalid-command',
  'invalid-document',
  'not-found',
  'duplicate-id',
  'invalid-placement',
  'cycle',
  'last-chapter',
  'chapter-in-use',
  'chapter-would-be-empty',
  'invalid-content',
  'anchor-exists',
  'asset-in-use',
  'read-only',
  'internal-invariant',
] as const;

/** The same banned list the copy guard applies to user sentences. */
const BANNED_WORDS = [
  'paginator',
  'pagetheme',
  'packing',
  'trunk',
  'lane',
  'callout mode',
  'heartbeat',
  'binding',
  'command layer',
  'schema',
  'json',
  'id',
  'node path',
  'app support',
];

function violations(value: string): string[] {
  const lower = value.toLowerCase();
  return BANNED_WORDS.filter((word) => {
    const pattern = new RegExp(`(^|[^a-z0-9])${word.replace(' ', '\\s+')}([^a-z0-9]|$)`);
    return pattern.test(lower);
  });
}

describe('command rejection copy', () => {
  it('gives every core command code its own short line', () => {
    for (const code of COMMAND_CODES) {
      const text = commandRejectionText(code);
      expect(text.length, code).toBeGreaterThan(0);
      expect(text, code).toMatch(/^[A-Z].*\.$/);
      expect(text.length, code).toBeLessThanOrEqual(60);
      if (code !== 'internal-invariant') expect(text, code).not.toBe(GENERIC_COMMAND_REASON);
    }
    expect(violations(COMMAND_CODES.map((code) => commandRejectionText(code)).join(' '))).toEqual(
      [],
    );
  });

  it('falls back to one generic sentence for an unknown or absent code', () => {
    expect(commandRejectionText(undefined)).toBe(GENERIC_COMMAND_REASON);
    expect(commandRejectionText('io-error')).toBe(GENERIC_COMMAND_REASON);
    expect(commandRejectionText('read-only')).toBe('This note is open read-only.');
  });

  it('keeps the raw core sentence in details', () => {
    expect(commandRejection('asset-in-use', 'asset "abc" is still referenced by 1 image node')).toEqual(
      {
        message: 'This image is still in use.',
        details: 'asset "abc" is still referenced by 1 image node',
      },
    );
    expect(commandRejection('not-found', 'block "b1" does not exist')).toEqual({
      message: 'That item no longer exists.',
      details: 'block "b1" does not exist',
    });
  });

  it('never fabricates details from an empty or identical sentence', () => {
    expect(commandRejection('not-found', '')).toEqual({ message: 'That item no longer exists.' });
    expect(
      commandRejection('read-only', 'This note is open read-only.'),
    ).toEqual({ message: 'This note is open read-only.' });
  });

  it('keeps the raw reason out of the message for every code', () => {
    const raw = 'document.json is not valid JSON: unexpected token';
    for (const code of COMMAND_CODES) {
      const mapped = commandRejection(code, raw);
      expect(mapped.message).not.toContain('document.json');
      expect(mapped.message).not.toContain('unexpected token');
      expect(mapped.details).toBe(raw);
      expect(violations(mapped.message)).toEqual([]);
    }
  });
});

describe('package state copy', () => {
  it('names each recovery state in one short line', () => {
    expect(recoveryReasonText('unreadable')).toBe('The file isn’t valid NoteForest data.');
    expect(recoveryReasonText('missing')).toBe('The folder or the file is missing.');
    expect(recoveryReasonText('newer-schema')).toBe('A newer NoteForest wrote the file.');
    for (const status of ['unreadable', 'missing', 'newer-schema'] as const) {
      expect(violations(recoveryReasonText(status))).toEqual([]);
    }
  });

  it('keeps the library row line short and kind-aware', () => {
    expect(libraryRowReasonText('unreadable')).toBe('This note couldn’t be read.');
    expect(libraryRowReasonText('unreadable', 'markdown')).toBe('This file couldn’t be read.');
    expect(libraryRowReasonText('missing')).toBe('This note’s file is missing.');
    expect(libraryRowReasonText('newer-schema')).toBe('A newer NoteForest wrote this note.');
    for (const status of ['unreadable', 'missing', 'newer-schema'] as const) {
      for (const kind of ['note', 'markdown'] as const) {
        const text = libraryRowReasonText(status, kind);
        expect(text.length).toBeLessThanOrEqual(60);
        expect(violations(text)).toEqual([]);
      }
    }
  });
});
