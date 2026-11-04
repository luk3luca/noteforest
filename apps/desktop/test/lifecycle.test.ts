import { describe, expect, it } from 'vitest';
import { quitCanProceed } from '../src/main/lifecycle';

describe('quit lifecycle', () => {
  it('allows a quit after the close handshake completed', () => {
    expect(quitCanProceed(true, true)).toBe(true);
  });

  it('allows a quit when the last window is already gone', () => {
    // S1 regression: `closed` must not leave this false; otherwise the app
    // stays alive with zero windows and can only be force-quit.
    expect(quitCanProceed(false, false)).toBe(true);
  });

  it('keeps guarding a live window that has not allowed the close yet', () => {
    expect(quitCanProceed(false, true)).toBe(false);
  });
});
