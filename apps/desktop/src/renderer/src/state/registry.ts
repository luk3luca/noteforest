import { useCallback, useSyncExternalStore } from 'react';
import type { OpenDocumentSnapshot, SessionTabState } from '../../../shared/api';
import { createElectronDocumentGateway } from './electron-document-gateway';
import { DocumentRuntime, type RestorePoint } from './runtime';

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
  runtimes.set(snapshot.packagePath, runtime);
  bump();
  void runtime.ensureChaptersHaveBlocks();
  return runtime;
}

export function getRuntime(packagePath: string | null | undefined): DocumentRuntime | null {
  if (packagePath === null || packagePath === undefined) return null;
  return runtimes.get(packagePath) ?? null;
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
