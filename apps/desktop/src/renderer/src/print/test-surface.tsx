/**
 * Test-only mount of the print compositor inside the running renderer.
 *
 * The component is the same one the `print.html` entry renders; this helper
 * only owns a detached test host and lifecycle. It is not part of the print
 * model or the compositor contract.
 */

import { createRoot, type Root } from 'react-dom/client';
import type { PrintModel } from '@noteforest/pdf';
import { PrintDocument } from './PrintDocument';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

export function clearPrintTestSurface(): void {
  if (root !== null) {
    root.unmount();
    root = null;
  }
  host?.remove();
  host = null;
}

export function mountPrintTestSurface(
  model: PrintModel,
  assets?: Record<string, string>,
): HTMLDivElement {
  clearPrintTestSurface();
  host = document.createElement('div');
  host.setAttribute('data-print-test-host', 'true');
  // Attached but offscreen: attribute/DOM parity needs a real document tree,
  // not a second layout pass. The print sheets keep their model page size.
  host.style.position = 'absolute';
  host.style.left = '-200000px';
  host.style.top = '0';
  document.body.appendChild(host);
  const container = document.createElement('div');
  host.appendChild(container);
  root = createRoot(container);
  root.render(<PrintDocument model={model} assets={assets} />);
  return host;
}
