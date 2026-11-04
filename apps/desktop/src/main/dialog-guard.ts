import type { Dialog } from 'electron';

export interface E2EDialogCall {
  method: 'showMessageBox' | 'showMessageBoxSync' | 'showSaveDialog' | 'showOpenDialog';
  options: unknown;
}

interface GuardGlobal {
  __nfDialogCalls?: E2EDialogCall[];
}

/**
 * E2E-only safety net: no native OS dialog may ever open during an automated
 * test. Tests that need to assert a dialog replace these methods explicitly
 * after launch; anything that fires before that override resolves with a safe
 * non-blocking default instead of waiting for a human click.
 */
export function installE2EDialogGuard(target: Dialog): void {
  const globals = globalThis as GuardGlobal;
  const calls: E2EDialogCall[] = [];
  globals.__nfDialogCalls = calls;

  const record = (method: E2EDialogCall['method'], args: unknown[]): void => {
    calls.push({ method, options: args.at(-1) });
  };

  target.showMessageBox = (async (...args: unknown[]) => {
    record('showMessageBox', args);
    const options = (args.at(-1) ?? {}) as { cancelId?: number };
    return { response: options.cancelId ?? 1, checkboxChecked: false };
  }) as unknown as Dialog['showMessageBox'];

  target.showMessageBoxSync = ((...args: unknown[]) => {
    record('showMessageBoxSync', args);
    const options = (args.at(-1) ?? {}) as { cancelId?: number };
    return options.cancelId ?? 1;
  }) as unknown as Dialog['showMessageBoxSync'];

  target.showSaveDialog = (async (...args: unknown[]) => {
    record('showSaveDialog', args);
    return { canceled: true, filePath: undefined, bookmark: undefined };
  }) as unknown as Dialog['showSaveDialog'];

  target.showOpenDialog = (async (...args: unknown[]) => {
    record('showOpenDialog', args);
    return { canceled: true, filePaths: [] };
  }) as unknown as Dialog['showOpenDialog'];
}
