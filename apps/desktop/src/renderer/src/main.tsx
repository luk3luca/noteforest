import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'katex/dist/katex.min.css';
import './styles.css';
import { App } from './App';
import { applyDesignTokens } from './lib/apply-design-tokens';

// Geometry tokens become root custom properties before the first render; the
// stylesheet only reads `var(--nf-*)` for them.
applyDesignTokens();

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
