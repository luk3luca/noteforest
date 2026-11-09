/** Ambient bridge exposed by the preload script. */
import type * as React from 'react';
import type { DocumentCommand } from '@noteforest/core';
import type { PrintModel } from '@noteforest/pdf';
import type { NoteForestApi } from '../../shared/api';

declare global {
  interface Window {
    noteforest: NoteForestApi;
    /** Entry point loaded by the print surface (M4c2 hidden window). */
    __noteforestPrint?: {
      entryReady: Promise<boolean>;
      build: (snapshot: import('../../shared/export').ExportSnapshot) => Promise<
        import('../../shared/export').PrintBuildResult
      >;
      render: (payload: { model: PrintModel; assets?: Record<string, string> }) => void;
      clear: () => void;
    };
    __noteforestTest?: {
      state: () => unknown;
      viewState?: () => unknown;
      openPath: (packagePath: string) => Promise<boolean>;
      flushSession: () => Promise<void>;
      setFlushMode: (mode: 'normal' | 'error' | 'hang') => void;
      /** Test-only: visible M4d2 export surface state. */
      exportState?: () => unknown;
      /** Test-only: ordered M4d2 export surface transitions. */
      exportHistory?: () => unknown;
      /** Test-only: mount the print compositor from the active Page model. */
      renderPrint?: () => unknown;
      /** Test-only: remove the print compositor test host. */
      clearPrint?: () => boolean;
      /** Test-only: derived page block/continuation summary of the active Page model. */
      pageModelPages?: () => unknown;
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
      /** Test-only: set one document override and persist it durably. */
      setPageSettingsOverride?: (
        packagePath: string,
        override: unknown,
      ) => Promise<unknown>;
      /** Test-only: resolved page settings for one document. */
      resolvedPageSettings?: (packagePath: string) => unknown;
      /** Test-only: await every queued settings write. */
      flushSettings?: () => Promise<unknown>;
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
