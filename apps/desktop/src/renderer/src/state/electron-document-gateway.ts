/**
 * Composition-layer adapter from the `DocumentGateway` port to the preload
 * bridge.
 *
 * `window.noteforest` is resolved at call time, not when the adapter is built,
 * so a runtime created before the bridge is ready (or a test that stubs the
 * global before invoking a method) still reaches the current implementation.
 */

import type { DocumentGateway } from './document-gateway';

export function createElectronDocumentGateway(): DocumentGateway {
  return {
    takeOverLock: (packagePath) => window.noteforest.takeOverLock(packagePath),
    materializeDraft: (documentKey) => window.noteforest.materializeDraft(documentKey),
    apply: (packagePath, command) => window.noteforest.apply(packagePath, command),
    save: (packagePath, options) => window.noteforest.save(packagePath, options),
    saveCopy: (packagePath) => window.noteforest.saveCopy(packagePath),
    restoreBackup: (packagePath, sourcePath) =>
      window.noteforest.restoreBackup(packagePath, sourcePath),
    reloadDocument: (packagePath) => window.noteforest.reloadDocument(packagePath),
  };
}
