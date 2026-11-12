import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'katex/dist/katex.min.css';
import './styles.css';
import './print/print.css';
import { App } from './App';
import { applyDesignTokens } from './lib/apply-design-tokens';
import { applyAppearance, prefersDarkNow } from './lib/apply-appearance';
import { DEFAULT_APPEARANCE } from '@noteforest/layout';

// Geometry tokens become root custom properties before the first render; the
// stylesheet only reads `var(--nf-*)` for them.
applyDesignTokens();
// The default appearance (dark, blue, default scale/fonts) is applied before the
// first paint. Stored settings replace it when bootstrap resolves; without this
// the accent roles would be undefined for the first frame.
applyAppearance(DEFAULT_APPEARANCE, { prefersDark: prefersDarkNow() });

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
