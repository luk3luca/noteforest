/**
 * React binding for the Page surface status. The pure registry lives in
 * `page-status.ts`; this hook is the one subscription point for the Toolbar
 * page indicator and the zoom stepper.
 */

import { useSyncExternalStore } from 'react';
import { pageStatusFor, subscribePageStatus, type PageStatus } from './page-status';

export function usePageStatus(packagePath: string | null | undefined): PageStatus | null {
  return useSyncExternalStore(
    subscribePageStatus,
    () => pageStatusFor(packagePath),
    () => null,
  );
}
