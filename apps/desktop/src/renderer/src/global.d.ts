/** Ambient bridge exposed by the preload script. */
import type * as React from 'react';
import type { DocumentCommand } from '@noteforest/core';
import type { NoteForestApi } from '../../shared/api';

declare global {
  interface Window {
    noteforest: NoteForestApi;
    __noteforestTest?: {
      state: () => unknown;
      viewState?: () => unknown;
      openPath: (packagePath: string) => Promise<boolean>;
      flushSession: () => Promise<void>;
      setFlushMode: (mode: 'normal' | 'error' | 'hang') => void;
      seed: (kind: 'demo' | 'performance' | 'performance-1000') => Promise<string>;
      /** Test-only: apply a typed command through the active runtime stack. */
      applyStructural?: (command: DocumentCommand) => Promise<unknown>;
      /** Test-only: exact canonical structural records of the active document. */
      structure?: () => unknown;
      /** Test-only: canonical asset records of the active document. */
      assets?: () => unknown;
      /** Test-only: session asset availability of the active document. */
      assetAvailability?: () => unknown;
      /** Test-only: canonical split caret of the active editor. */
      caretLocation?: () => unknown;
      /** Test-only: global and per-document personal settings. */
      settings?: () => unknown;
      /** Test-only: replace and persist the global app settings. */
      setSettings?: (settings: unknown) => Promise<unknown>;
      /** Test-only: set one document override and persist the session. */
      setPageSettingsOverride?: (
        packagePath: string,
        override: unknown,
      ) => Promise<unknown>;
      /** Test-only: resolved page settings for one document. */
      resolvedPageSettings?: (packagePath: string) => unknown;
      editorCheck?: () => unknown;
      editorJson?: () => unknown;
      perf?: () => unknown;
      benchmarkReflow?: (count?: number) => unknown;
    };
  }

  namespace JSX {
    type Element = React.JSX.Element;
    interface ElementClass extends React.Component<unknown> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}

export {};
