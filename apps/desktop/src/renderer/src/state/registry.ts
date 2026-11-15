import { useCallback, useSyncExternalStore } from 'react';
import type { LibraryView, OpenDocumentSnapshot, SessionTabState } from '../../../shared/api';
import { createElectronDocumentGateway } from './electron-document-gateway';
import { DocumentRuntime, type RestorePoint } from './runtime';
import { rekeyScroll } from './scroll-store';
import { useSettingsStore } from './settings';
import { useShell } from './shell';

const runtimes = new Map<string, DocumentRuntime>();
const documentGateway = createElectronDocumentGateway();
let registrySeq = 0;
const listeners = new Set<() => void>();

function bump(): void {
  registrySeq += 1;
  for (const listener of listeners) listener();
}

export function subscribeRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Draft materialization moved this runtime from `draft:<id>` to a package path.
 * The runtime instance, its canonical document, undo history, selection, and
 * the mounted editor are untouched; only identity maps and the shell tab move.
 */
function handlePackagePathChange(
  runtime: DocumentRuntime,
  previous: string,
  next: string,
  library?: LibraryView,
): void {
  if (runtimes.get(previous) === runtime) {
    runtimes.delete(previous);
    runtimes.set(next, runtime);
  }
  rekeyScroll(previous, next);
  const documentId = runtime.document.id;
  // Materialization can add a package inside a folder ("New note here"); the
  // scan returned by the same IPC call is the tree the user must see now.
  if (library !== undefined) useShell.getState().setLibrary(library);
  useShell.getState().rekeyDocument(previous, next, runtime.document.title);
  // Materialization does not change the document id: any per-document override
  // created while it was a draft follows the document to its package path.
  useSettingsStore.getState().adoptDocumentSettings(next, documentId);
  bump();
}

export function registerRuntime(
  snapshot: OpenDocumentSnapshot,
  tab: SessionTabState | undefined,
  collapsedTopics: readonly string[] | undefined,
): DocumentRuntime {
  const existing = runtimes.get(snapshot.packagePath);
  if (existing !== undefined) return existing;
  const collapsed = tab?.collapsed ?? collapsedTopics ?? [];
  const restore: RestorePoint | null =
    tab === undefined
      ? null
      : { scrollTop: tab.scrollTop, selectedBlockId: tab.selectedBlockId };
  const runtime = new DocumentRuntime(snapshot, collapsed, restore, documentGateway);
  runtime.onPackagePathChange = (previous, next, _documentId, library) => {
    handlePackagePathChange(runtime, previous, next, library);
  };
  runtimes.set(snapshot.packagePath, runtime);
  bump();
  void runtime.ensureChaptersHaveBlocks();
  return runtime;
}

export function getRuntime(packagePath: string | null | undefined): DocumentRuntime | null {
  if (packagePath === null || packagePath === undefined) return null;
  return runtimes.get(packagePath) ?? null;
}

/**
 * The open runtime for one canonical document id, or null when none is open or
 * two open packages share the id (a Finder duplicate). Callers must not guess
 * between ambiguous same-id copies.
 */
export function getRuntimeByDocumentId(
  documentId: string | null | undefined,
): DocumentRuntime | null {
  if (documentId === null || documentId === undefined || documentId.length === 0) return null;
  let found: DocumentRuntime | null = null;
  for (const runtime of runtimes.values()) {
    if (runtime.document.id !== documentId) continue;
    if (found !== null && found !== runtime) return null;
    found = runtime;
  }
  return found;
}

export function removeRuntime(packagePath: string): void {
  const runtime = runtimes.get(packagePath);
  if (runtime === undefined) return;
  runtime.dispose();
  runtimes.delete(packagePath);
  bump();
}

export function allRuntimes(): DocumentRuntime[] {
  return [...runtimes.values()];
}

export function registryVersion(): number {
  return registrySeq;
}

export function useRegistry(): number {
  const subscribe = useCallback((listener: () => void) => subscribeRegistry(listener), []);
  return useSyncExternalStore(subscribe, registryVersion, () => 0);
}

export function useRuntime(packagePath: string | null | undefined): {
  runtime: DocumentRuntime | null;
  seq: number;
} {
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeRegistry = subscribeRegistry(listener);
      const runtime = getRuntime(packagePath);
      const unsubscribeRuntime = runtime?.subscribe(listener) ?? (() => undefined);
      return () => {
        unsubscribeRegistry();
        unsubscribeRuntime();
      };
    },
    [packagePath],
  );
  const seq = useSyncExternalStore(
    subscribe,
    () => getRuntime(packagePath)?.seq ?? registrySeq,
    () => 0,
  );
  return { runtime: getRuntime(packagePath), seq };
}

export function useAllDirty(): boolean {
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribeRegistry = subscribeRegistry(listener);
    const unsubscribes = allRuntimes().map((runtime) => runtime.subscribe(listener));
    return () => {
      unsubscribeRegistry();
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, []);
  useSyncExternalStore(
    subscribe,
    () => allRuntimes().some((runtime) => runtime.dirty),
    () => false,
  );
  return allRuntimes().some((runtime) => runtime.dirty);
}
