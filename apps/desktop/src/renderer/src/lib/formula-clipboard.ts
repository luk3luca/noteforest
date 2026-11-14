/**
 * Formula clipboard and kind helpers (special-text polish, area E).
 *
 * Pure so the copy payload, the inline ↔ block target and the paste match are
 * unit-tested without an editor. The paste rule and the source-editor action
 * row both use these helpers, so a copied formula pastes back as a formula.
 */

export type FormulaKind = 'inlineMath' | 'blockMath';

export type FormulaPaste = { kind: FormulaKind; latex: string };

/** The other formula node type, or null for a non-formula node. */
export function formulaKindTarget(name: string): FormulaKind | null {
  if (name === 'inlineMath') return 'blockMath';
  if (name === 'blockMath') return 'inlineMath';
  return null;
}

/** Copy payload: `$…$` for inline, `$$…$$` for block. */
export function formulaCopySource(latex: string, kind: FormulaKind): string {
  const delimiters = kind === 'blockMath' ? '$$' : '$';
  return `${delimiters}${latex}${delimiters}`;
}

/**
 * A pasted plain-text string that is exactly one formula: `$…$` inline or
 * `$$…$$` block. Space guards mirror the input rules; surrounding whitespace is
 * ignored. Anything else stays a plain paste.
 */
export function parseFormulaPaste(value: string): FormulaPaste | null {
  const text = value.trim();
  if (text.length === 0) return null;
  const block = /^\$\$([^$\n]+)\$\$$/.exec(text);
  if (block !== null) {
    const latex = (block[1] ?? '').trim();
    return latex.length === 0 ? null : { kind: 'blockMath', latex };
  }
  const inline = /^\$([^\s$](?:[^$\n]*[^\s$])?)\$$/.exec(text);
  if (inline !== null) {
    const latex = inline[1] ?? '';
    return latex.length === 0 ? null : { kind: 'inlineMath', latex };
  }
  return null;
}
