/**
 * Print compositor entry point (M4c1).
 *
 * M4c2 loads this page in a hidden BrowserWindow, builds the print model from
 * the same measured page model as Page Read, and calls
 * `window.__noteforestPrint.render({ model })`. Export orchestration, job IDs,
 * `printToPDF`, and atomic output deliberately stay out of this slice.
 */

import { createRoot } from 'react-dom/client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'katex/dist/katex.min.css';
import '../styles.css';
import './print.css';
import type { PrintModel } from '@noteforest/pdf';
import { applyDesignTokens } from '../lib/apply-design-tokens';
import { PrintDocument } from './PrintDocument';

export interface PrintRenderPayload {
  model: PrintModel;
  /** Optional display URLs; defaults to the model's available asset map. */
  assets?: Record<string, string>;
}

export interface NoteforestPrintBridge {
  render: (payload: PrintRenderPayload) => void;
  clear: () => void;
}

applyDesignTokens();

const container = document.getElementById('print-root');
if (container === null) throw new Error('missing #print-root');
const root = createRoot(container);

window.__noteforestPrint = {
  render(payload: PrintRenderPayload): void {
    if (payload?.model === undefined) {
      throw new Error('Print render requires a PrintModel.');
    }
    root.render(<PrintDocument model={payload.model} assets={payload.assets} />);
  },
  clear(): void {
    root.render(null);
  },
};

// M4c2 can wait for this marker instead of guessing when the bundle is ready.
document.body.dataset.printEntry = 'ready';
