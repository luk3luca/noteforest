import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe a node view to the canonical runtime revision. ProseMirror only
 * re-renders a React node view when its node or decorations change, so a
 * content/asset commit that changes derived state would otherwise leave the
 * view one revision behind until an unrelated click.
 */
export function useRuntimeVersion(runtime: {
  subscribe: (listener: () => void) => () => void;
  version: number;
} | null): number {
  const subscribe = useCallback(
    (listener: () => void) => runtime?.subscribe(listener) ?? (() => undefined),
    [runtime],
  );
  return useSyncExternalStore(
    subscribe,
    () => runtime?.version ?? 0,
    () => 0,
  );
}
