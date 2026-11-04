/**
 * Pure quit-lifecycle decisions for the Electron main process.
 *
 * Kept free of Electron imports so the S1 regression — quit after the last
 * window closed — is covered by a fast unit test without launching the app.
 */
export function quitCanProceed(allowClose: boolean, hasLiveWindow: boolean): boolean {
  // No live window can show the save prompt or complete a close handshake.
  // Blocking the quit here used to leave the process alive with zero windows.
  return allowClose || !hasLiveWindow;
}
