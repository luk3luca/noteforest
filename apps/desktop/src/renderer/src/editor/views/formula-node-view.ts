/**
 * Formula DOM node view (special-text editing, area C).
 *
 * Single click keeps the existing anchor workflow (NodeSelection); double
 * click opens an in-place source editor instead of the modal math dialog.
 * Enter/blur commits `attrs.latex`, Escape cancels, and a KaTeX preview follows
 * the draft.
 *
 * A plain DOM node view is used because the source textarea must keep native
 * caret navigation: a React node view re-render reset it. The term-anchor
 * action stays available for a non-empty LaTeX selection.
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import katex from 'katex';
import { formulaTermSelection } from '../../lib/anchor-selection';
import { unwrapFormulaSource } from '../../lib/formula-input';
import { branchFromFormulaTerm } from '../../lib/formula-term-branch';
import { getEditorBindings } from '../bindings';
import { installLocalTextKeys } from '../../lib/local-text-keys';

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
  private termReady = false;
  private readonly renderHost: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private preview: HTMLElement | null = null;
  private termButton: HTMLButtonElement | null = null;

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
    this.render();
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
    this.editing = true;
    this.termReady = false;
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
    }
  }

  private closeSource(): void {
    this.editing = false;
    this.termReady = false;
    this.textarea = null;
    this.preview = null;
    this.termButton = null;
    this.dom.replaceChildren(this.renderHost);
    this.render();
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
    installLocalTextKeys(textarea);
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

    const preview = document.createElement('span');
    preview.className = 'nf-formula-preview';
    preview.setAttribute('aria-hidden', 'true');

    editor.append(open, textarea, close, preview);
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
    const ready = selected !== null;
    if (ready === this.termReady) return;
    this.termReady = ready;
    if (ready) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nf-button nf-formula-term-action';
      button.dataset['testid'] = 'branch-from-term';
      button.textContent = 'Branch from term';
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => this.branch());
      this.termButton = button;
      this.preview?.before(button);
      return;
    }
    this.termButton?.remove();
    this.termButton = null;
  }

  private commitSource(refocus: boolean): void {
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
