/**
 * Formula DOM node view (special-text editing, area C).
 *
 * Single click keeps the existing anchor workflow (NodeSelection); double
 * click opens an in-place source editor instead of the modal math dialog.
 * Enter/blur commits `attrs.latex`, Escape cancels, and a KaTeX preview follows
 * the draft.
 *
 * A plain DOM node view is used because the source textarea must keep native
 * caret navigation: a React node view re-render reset it. While the source
 * editor is open one stable action row offers Branch from term, Copy formula
 * and Inline/Block; the row never reflows when a term selection appears.
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import katex from 'katex';
import { toast } from 'sonner';
import { formulaTermSelection } from '../../lib/anchor-selection';
import { writeClipboardText } from '../../lib/clipboard';
import { formulaCopySource, formulaKindTarget, type FormulaKind } from '../../lib/formula-clipboard';
import { consumeFormulaAutoEdit, convertFormulaKind } from '../../lib/formula-convert';
import { unwrapFormulaSource } from '../../lib/formula-input';
import { branchFromFormulaTerm } from '../../lib/formula-term-branch';
import { getEditorBindings } from '../bindings';
import { subscribeEditorUi } from '../editor-ui';
import { installLocalTextKeys } from '../../lib/local-text-keys';

const COPIED_FEEDBACK_MS = 1000;

function renderKatex(element: HTMLElement, latex: string, block: boolean): void {
  element.replaceChildren();
  if (latex.trim().length === 0) return;
  try {
    katex.render(latex, element, {
      displayMode: block,
      throwOnError: false,
      output: 'html',
      strict: 'ignore',
      trust: false,
    });
  } catch {
    element.textContent = latex;
  }
}

export interface FormulaNodeViewOptions {
  editor: Editor;
  node: PMNode;
  getPos: () => number | undefined;
}

export class FormulaNodeView {
  readonly dom: HTMLElement;

  private readonly editor: Editor;
  private readonly getPos: () => number | undefined;
  private readonly block: boolean;
  private node: PMNode;
  private editing = false;
  private readonly renderHost: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private preview: HTMLElement | null = null;
  private termButton: HTMLButtonElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private copiedTimer: number | null = null;
  /** Cleanup for the current source textarea's local key handling. */
  private cleanupTextKeys: (() => void) | null = null;
  private readonly cleanupEditorUi: () => void;
  /** True while the clipboard helper (which steals DOM focus) is running. */
  private copying = false;

  constructor(options: FormulaNodeViewOptions) {
    this.editor = options.editor;
    this.node = options.node;
    this.getPos = options.getPos;
    this.block = options.node.type.name === 'blockMath';
    this.dom = document.createElement(this.block ? 'div' : 'span');
    this.dom.className = 'tiptap-mathematics-render nf-formula-node';
    this.dom.dataset['type'] = this.block ? 'block-math' : 'inline-math';
    this.dom.dataset['anchorKind'] = 'formula';
    this.dom.contentEditable = 'false';
    this.renderHost = document.createElement('span');
    this.renderHost.className = 'nf-formula-render';
    this.dom.appendChild(this.renderHost);
    this.dom.addEventListener('click', this.handleClick);
    // The mode switch is neither a selection update nor a transaction; the
    // shell mirrors it through the editor UI state instead (F1).
    this.cleanupEditorUi = subscribeEditorUi(this.editor, () => this.syncEditMode());
    this.render();
    // An Inline/Block conversion replaces the node type, so ProseMirror mounts
    // a fresh node view. The conversion marks the target position and that new
    // view reopens the source editor once its DOM is attached.
    requestAnimationFrame(() => {
      if (this.editing || !this.dom.isConnected || !this.editor.isEditable) return;
      const pos = this.getPos();
      if (typeof pos === 'number' && consumeFormulaAutoEdit(this.editor, pos)) {
        this.openSource();
      }
    });
  }

  update(node: PMNode): boolean {
    if (node.type.name !== this.node.type.name) return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode');
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.dom.removeEventListener('click', this.handleClick);
    this.cleanupEditorUi();
    this.cleanupTextKeys?.();
    this.cleanupTextKeys = null;
    if (this.copiedTimer !== null) {
      window.clearTimeout(this.copiedTimer);
      this.copiedTimer = null;
    }
  }

  /**
   * Read mode closes the in-place source editor without committing its draft.
   * The node view is the only surface outside the shell gates that owns a
   * writable text control (F1).
   */
  private syncEditMode(): void {
    if (!this.editor.isEditable && this.editing) this.closeSource();
  }

  private render(): void {
    const latex = this.latex();
    this.dom.dataset['latex'] = latex;
    const anchorIds = Array.isArray(this.node.attrs['anchorIds'])
      ? (this.node.attrs['anchorIds'] as string[])
      : [];
    if (anchorIds.length > 0) this.dom.dataset['anchorIds'] = anchorIds.join(',');
    else delete this.dom.dataset['anchorIds'];
    this.dom.classList.toggle('nf-formula-anchor', anchorIds.length > 0);
    this.dom.classList.toggle('nf-formula-node-editing', this.editing);
    if (!this.editing) renderKatex(this.renderHost, latex, this.block);
  }

  private latex(): string {
    const value = this.node.attrs['latex'];
    return typeof value === 'string' ? value : '';
  }

  private handleClick = (event: MouseEvent): void => {
    if (this.editing) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.nf-formula-source-editor') !== null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    if (event.detail >= 2) {
      if (!this.editor.isEditable) return;
      this.openSource();
      return;
    }
    const current = this.editor.state.doc.nodeAt(pos);
    if (current === null) return;
    this.editor.view.dispatch(
      this.editor.state.tr.setSelection(NodeSelection.create(this.editor.state.doc, pos)),
    );
    this.editor.view.focus();
  };

  private openSource(): void {
    if (!this.editor.isEditable) return;
    this.editing = true;
    this.render();
    this.dom.replaceChildren(this.buildSourceEditor());
    const textarea = this.textarea;
    if (textarea !== null) {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      const preview = this.preview;
      if (preview !== null) {
        renderKatex(preview, unwrapFormulaSource(textarea.value), this.block);
      }
      this.syncTerm();
    }
  }

  private closeSource(): void {
    this.editing = false;
    this.textarea = null;
    this.preview = null;
    this.termButton = null;
    this.copyButton = null;
    this.cleanupTextKeys?.();
    this.cleanupTextKeys = null;
    if (this.copiedTimer !== null) {
      window.clearTimeout(this.copiedTimer);
      this.copiedTimer = null;
    }
    this.dom.replaceChildren(this.renderHost);
    this.render();
  }

  private actionButton(label: string, testId: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nf-button nf-formula-action';
    button.dataset['testid'] = testId;
    button.textContent = label;
    // Keep the textarea focused: the action row is editor chrome, not a focus
    // target of its own.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    return button;
  }

  private buildSourceEditor(): HTMLElement {
    const editor = document.createElement('span');
    editor.className = 'nf-formula-source-editor';
    editor.dataset['formulaSourceEditor'] = 'true';
    editor.dataset['nfFormulaChrome'] = 'true';
    editor.addEventListener('mousedown', (event) => event.stopPropagation());

    const open = document.createElement('span');
    open.className = 'nf-formula-source-delim';
    open.setAttribute('aria-hidden', 'true');
    open.textContent = this.block ? '$$' : '$';

    const textarea = document.createElement('textarea');
    textarea.className = 'nf-textarea nf-formula-source';
    textarea.dataset['formulaSource'] = 'true';
    textarea.setAttribute('aria-label', 'Formula LaTeX source');
    textarea.spellcheck = false;
    textarea.rows = this.block ? 2 : 1;
    textarea.value = this.latex();
    this.cleanupTextKeys = installLocalTextKeys(textarea);
    textarea.addEventListener('input', () => {
      if (this.preview !== null) {
        renderKatex(this.preview, unwrapFormulaSource(textarea.value), this.block);
      }
      this.syncTerm();
    });
    textarea.addEventListener('select', () => this.syncTerm());
    textarea.addEventListener('keyup', () => this.syncTerm());
    textarea.addEventListener('mouseup', () => this.syncTerm());
    textarea.addEventListener('blur', () => {
      // The clipboard fallback focuses a temporary textarea for a moment; that
      // focus loss is not a commit.
      if (this.copying) return;
      this.commitSource(false);
    });
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.commitSource(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelSource();
      }
    });

    const close = document.createElement('span');
    close.className = 'nf-formula-source-delim';
    close.setAttribute('aria-hidden', 'true');
    close.textContent = this.block ? '$$' : '$';

    const actions = document.createElement('span');
    actions.className = 'nf-formula-actions';
    actions.dataset['formulaActions'] = 'true';
    actions.contentEditable = 'false';

    const termButton = this.actionButton('Branch from term', 'branch-from-term');
    termButton.disabled = true;
    termButton.addEventListener('click', () => this.branch());
    const copyButton = this.actionButton('Copy formula', 'copy-formula');
    copyButton.addEventListener('click', () => this.copyFormula());
    const kindButton = this.actionButton(this.block ? 'Inline' : 'Block', 'toggle-formula-kind');
    kindButton.dataset['formulaKindTarget'] = this.block ? 'inline' : 'block';
    kindButton.setAttribute(
      'aria-label',
      this.block ? 'Convert to inline formula' : 'Convert to block formula',
    );
    kindButton.title = this.block ? 'Convert to inline formula' : 'Convert to block formula';
    kindButton.addEventListener('click', () => this.toggleKind());
    actions.append(termButton, copyButton, kindButton);
    this.termButton = termButton;
    this.copyButton = copyButton;

    const preview = document.createElement('span');
    preview.className = 'nf-formula-preview';
    preview.setAttribute('aria-hidden', 'true');

    editor.append(open, textarea, close, actions, preview);
    this.textarea = textarea;
    this.preview = preview;
    return editor;
  }

  private syncTerm(): void {
    const textarea = this.textarea;
    if (textarea === null) return;
    const selected = formulaTermSelection(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    const ready = selected !== null && selected.term.trim().length > 0;
    if (this.termButton !== null) this.termButton.disabled = !ready;
  }

  private copyFormula(): void {
    const textarea = this.textarea;
    if (this.copying || textarea === null) return;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const latex = unwrapFormulaSource(textarea.value);
    const kind: FormulaKind = this.block ? 'blockMath' : 'inlineMath';
    this.copying = true;
    void writeClipboardText(formulaCopySource(latex, kind))
      .then((ok) => {
        if (!ok || this.copyButton === null) return;
        this.copyButton.textContent = 'Copied';
        if (this.copiedTimer !== null) window.clearTimeout(this.copiedTimer);
        this.copiedTimer = window.setTimeout(() => {
          this.copiedTimer = null;
          if (this.copyButton !== null) this.copyButton.textContent = 'Copy formula';
        }, COPIED_FEEDBACK_MS);
      })
      .finally(() => {
        this.copying = false;
        // Restore the source caret after the temporary clipboard element.
        if (!this.editing || this.textarea === null) return;
        this.textarea.focus();
        this.textarea.setSelectionRange(selectionStart, selectionEnd);
        this.syncTerm();
      });
  }

  private toggleKind(): void {
    if (!this.editor.isEditable) return;
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    const current = this.editor.state.doc.nodeAt(pos);
    if (current === null) return;
    const target = formulaKindTarget(current.type.name);
    if (target === null) return;
    const latex = unwrapFormulaSource(this.textarea?.value ?? this.latex());
    // One transaction covers type, latex and selection: one undo entry. The new
    // node view reopens the source editor at the marked position.
    const converted = convertFormulaKind(this.editor, pos, target, latex);
    if (!converted.ok) {
      // Inline→block is rejected inside a table cell (inline-only). Never leave
      // the action as a silent no-op. The reason goes through the shared toast
      // helper rather than editor bindings: the Page Edit overlay mounts this
      // node view without registering bindings (R3).
      toast.info(
        target === 'blockMath'
          ? 'A formula inside a table cell stays inline. Move it out of the table for a block formula.'
          : 'This formula could not be converted.',
      );
    }
  }

  private commitSource(refocus: boolean): void {
    // Read mode never writes the source editor, even if a pending blur fires.
    if (!this.editor.isEditable) {
      this.closeSource();
      return;
    }
    const pos = this.getPos();
    const textarea = this.textarea;
    const next = unwrapFormulaSource(textarea?.value ?? this.latex());
    if (typeof pos === 'number' && next !== this.latex()) {
      const current = this.editor.state.doc.nodeAt(pos);
      if (current !== null && current.type.name === this.node.type.name) {
        this.editor.view.dispatch(
          this.editor.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            latex: next,
          }),
        );
      }
    }
    this.closeSource();
    if (refocus) this.editor.view.focus();
  }

  private cancelSource(): void {
    this.closeSource();
    this.editor.view.focus();
  }

  private branch(): void {
    if (!this.editor.isEditable) return;
    const pos = this.getPos();
    const textarea = this.textarea;
    const bindings = getEditorBindings(this.editor);
    if (typeof pos !== 'number' || textarea === null || bindings === null) return;
    const branched = branchFromFormulaTerm(
      bindings.runtime,
      this.editor,
      pos,
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    if (branched) this.closeSource();
  }
}
