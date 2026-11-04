import { beforeEach, describe, expect, it } from 'vitest';
import type { Dialog } from 'electron';
import { installE2EDialogGuard, type E2EDialogCall } from '../src/main/dialog-guard.js';

interface TestGlobals {
  __nfDialogCalls?: E2EDialogCall[];
}

function fakeDialog() {
  return {
    showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
    showMessageBoxSync: () => 0,
    showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/x' }),
    showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/x'] }),
  } as unknown as Dialog;
}

describe('E2E dialog guard', () => {
  beforeEach(() => {
    delete (globalThis as TestGlobals).__nfDialogCalls;
  });

  it('never opens a native message box; defaults to cancel', async () => {
    const target = fakeDialog();
    installE2EDialogGuard(target);
    const result = await target.showMessageBox({ cancelId: 1 } as never, { cancelId: 1 } as never);
    expect(result.response).toBe(1);
    expect((globalThis as TestGlobals).__nfDialogCalls?.length).toBe(1);
    expect((globalThis as TestGlobals).__nfDialogCalls?.[0]?.method).toBe('showMessageBox');
  });

  it('honours an explicit cancelId and records a sync call', () => {
    const target = fakeDialog();
    installE2EDialogGuard(target);
    expect(target.showMessageBoxSync({ cancelId: 0 } as never, { cancelId: 0 } as never)).toBe(0);
    expect((globalThis as TestGlobals).__nfDialogCalls?.[0]?.method).toBe('showMessageBoxSync');
  });

  it('cancels native save/open dialogs instead of blocking', async () => {
    const target = fakeDialog();
    installE2EDialogGuard(target);
    const save = await target.showSaveDialog({} as never, {});
    expect(save.canceled).toBe(true);
    const open = await target.showOpenDialog({} as never, {});
    expect(open.canceled).toBe(true);
    expect((globalThis as TestGlobals).__nfDialogCalls?.map((call) => call.method)).toEqual([
      'showSaveDialog',
      'showOpenDialog',
    ]);
  });
});
