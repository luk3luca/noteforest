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
