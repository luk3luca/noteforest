import { DESIGN_TOKEN_CSS_VARIABLES } from './design-tokens';

interface StyleTarget {
  style: {
    setProperty(name: string, value: string): void;
  };
}

/**
 * Publish every CSS-bound design token as a root custom property.
 *
 * Called once from `main.tsx` before the React root mounts. `styles.css` uses
 * `var(--nf-*)` for these values, so a token change is a visual change without
 * editing CSS. Do not duplicate the values in a stylesheet declaration.
 */
export function applyDesignTokens(
  target: StyleTarget = document.documentElement,
): void {
  for (const [name, value] of Object.entries(DESIGN_TOKEN_CSS_VARIABLES)) {
    target.style.setProperty(name, value);
  }
}
