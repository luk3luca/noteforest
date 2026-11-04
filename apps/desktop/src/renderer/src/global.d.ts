/** Ambient bridge exposed by the preload script. */
import type * as React from 'react';
import type { NoteForestApi } from '../../shared/api';

declare global {
  interface Window {
    noteforest: NoteForestApi;
    __noteforestTest?: {
      state: () => unknown;
      openPath: (packagePath: string) => Promise<boolean>;
      flushSession: () => Promise<void>;
      setFlushMode: (mode: 'normal' | 'error' | 'hang') => void;
      seed: (kind: 'demo' | 'performance' | 'performance-1000') => Promise<string>;
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
