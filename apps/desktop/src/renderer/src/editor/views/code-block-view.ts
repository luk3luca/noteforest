/**
 * Code block DOM node view (special-text editing, area A).
 *
 * Implemented as a plain ProseMirror node view rather than a React one: the
 * contentDOM must be the `pre > code` body, and a React contentDOM nested in a
 * `pre` made Chromium recurse on mount. The chrome is built once and toggled:
 * the code body is the only editable part, so lowlight decorations, selection
 * and the caret stay native.
 *
 * States: idle (no fences, language label top-right), editing (opening fence
 * with an editable language token and the copy action, closing-fence row).
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  codeFenceLanguageToken,
  codeLanguageLabel,
} from '../../lib/code-fence';
import { writeClipboardText } from '../../lib/clipboard';
import { commitCodeLanguage, exitCodeBlock } from '../code-block-actions';
import { installLocalTextKeys } from '../../lib/local-text-keys';

const COPIED_FEEDBACK_MS = 1200;

export interface CodeBlockNodeViewOptions {
  editor: Editor;
  node: PMNode;
  getPos: () => number | undefined;
}

export class CodeBlockNodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;

  private readonly editor: Editor;
  private readonly getPos: () => number | undefined;
  private readonly actions: HTMLElement;
  private readonly label: HTMLElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly openFence: HTMLElement;
  private readonly closeRow: HTMLElement;
  private readonly languageInput: HTMLInputElement;
  private readonly pre: HTMLPreElement;
  private node: PMNode;
  private editing = false;
  private copiedTimer: number | null = null;
  private readonly onSelectionChange: () => void;

  constructor(options: CodeBlockNodeViewOptions) {
    this.editor = options.editor;
    this.node = options.node;
    this.getPos = options.getPos;

    this.dom = document.createElement('div');
    this.dom.className = 'nf-code-block';

    this.actions = document.createElement('div');
    this.actions.className = 'nf-code-actions';
    this.actions.contentEditable = 'false';
    this.actions.dataset['codeChrome'] = 'true';

    this.label = document.createElement('span');
    this.label.className = 'nf-code-label';
    this.label.dataset['codeLabel'] = 'true';
    this.label.hidden = true;

    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'nf-code-copy';
    this.copyButton.dataset['codeAction'] = 'copy';
    this.copyButton.title = 'Copy code';
    this.copyButton.setAttribute('aria-label', 'Copy code');
    this.copyButton.textContent = 'Copy';
    this.copyButton.addEventListener('mousedown', (event) => event.preventDefault());
    this.copyButton.addEventListener('click', () => this.copy());

    this.actions.append(this.label);

    this.openFence = document.createElement('div');
    this.openFence.className = 'nf-code-fence nf-code-fence-open';
    this.openFence.contentEditable = 'false';
    this.openFence.dataset['codeChrome'] = 'true';
    const fenceMark = document.createElement('span');
    fenceMark.className = 'nf-code-fence-mark';
    fenceMark.setAttribute('aria-hidden', 'true');
    fenceMark.textContent = '```';
    this.languageInput = document.createElement('input');
    this.languageInput.className = 'nf-code-lang-input';
    this.languageInput.dataset['codeLanguageInput'] = 'true';
    this.languageInput.setAttribute('aria-label', 'Code language');
    this.languageInput.title = 'Language; empty means plain text';
    this.languageInput.spellcheck = false;
    this.languageInput.placeholder = 'language';
    installLocalTextKeys(this.languageInput);
    this.languageInput.addEventListener('mousedown', (event) => event.stopPropagation());
    this.languageInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitLanguage();
        this.editor.view.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.languageInput.value = codeFenceLanguageToken(this.node.attrs['language']);
        this.editor.view.focus();
      }
    });
    this.languageInput.addEventListener('blur', () => this.commitLanguage());
    this.openFence.append(fenceMark, this.languageInput, this.copyButton);

    this.pre = document.createElement('pre');
    this.pre.className = 'nf-code-pre';
    this.pre.dataset['anchorKind'] = 'code';
    const code = document.createElement('code');
    code.className = 'nf-code-content';
    code.spellcheck = false;
    this.pre.appendChild(code);
    this.contentDOM = code;

    this.closeRow = document.createElement('div');
    this.closeRow.className = 'nf-code-fence nf-code-fence-close-row';
    this.closeRow.contentEditable = 'false';
    this.closeRow.dataset['codeChrome'] = 'true';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'nf-code-fence-close';
    closeButton.dataset['codeAction'] = 'close';
    closeButton.title = 'Close the code block and write below';
    const closeMark = document.createElement('span');
    closeMark.className = 'nf-code-fence-mark';
    closeMark.setAttribute('aria-hidden', 'true');
    closeMark.textContent = '```';
    const closeHint = document.createElement('span');
    closeHint.className = 'nf-code-fence-hint';
    closeHint.textContent = 'close and write below';
    closeButton.append(closeMark, closeHint);
    closeButton.addEventListener('mousedown', (event) => event.preventDefault());
    closeButton.addEventListener('click', () => {
      const pos = this.getPos();
      if (typeof pos === 'number') exitCodeBlock(this.editor, pos);
    });
    this.closeRow.appendChild(closeButton);

    this.dom.append(this.actions, this.openFence, this.pre, this.closeRow);

    this.onSelectionChange = () => this.syncState();
    this.editor.on('selectionUpdate', this.onSelectionChange);
    this.editor.on('transaction', this.onSelectionChange);
    this.render();
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'codeBlock') return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Element && target.closest('[data-code-chrome]') !== null;
  }

  ignoreMutation(mutation: { target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.editor.off('selectionUpdate', this.onSelectionChange);
    this.editor.off('transaction', this.onSelectionChange);
    if (this.copiedTimer !== null) window.clearTimeout(this.copiedTimer);
  }

  private render(): void {
    const language = codeLanguageLabel(this.node.attrs['language']);
    this.dom.dataset['codeBlock'] = 'true';
    this.dom.dataset['codeLanguage'] = language ?? 'plaintext';
    this.label.textContent = language ?? '';
    this.label.hidden = language === null;
    const anchorIds = Array.isArray(this.node.attrs['anchorIds'])
      ? (this.node.attrs['anchorIds'] as string[])
      : [];
    if (anchorIds.length > 0) this.pre.dataset['anchorIds'] = anchorIds.join(',');
    else delete this.pre.dataset['anchorIds'];
    if (document.activeElement !== this.languageInput) {
      this.languageInput.value = codeFenceLanguageToken(this.node.attrs['language']);
    }
    this.syncState();
  }

  private syncState(): void {
    const pos = this.getPos();
    let editing = false;
    if (typeof pos === 'number') {
      const current = this.editor.state.doc.nodeAt(pos);
      if (current !== null && current.type.name === 'codeBlock') {
        const { from, to } = this.editor.state.selection;
        editing = from > pos && to < pos + current.nodeSize;
      }
    }
    if (editing === this.editing) {
      this.applyVisibility();
      return;
    }
    this.editing = editing;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.dom.dataset['codeState'] = this.editing ? 'editing' : 'idle';
    this.actions.hidden = this.editing;
    this.openFence.hidden = !this.editing;
    this.closeRow.hidden = !this.editing;
    this.label.hidden = this.editing || codeLanguageLabel(this.node.attrs['language']) === null;
  }

  private commitLanguage(): void {
    const pos = this.getPos();
    if (typeof pos === 'number') {
      commitCodeLanguage(this.editor, pos, this.languageInput.value);
    }
    this.languageInput.value = codeFenceLanguageToken(
      this.node.attrs['language'],
    );
  }

  private copy(): void {
    void writeClipboardText(this.node.textContent).then((ok) => {
      if (!ok) return;
      this.copyButton.textContent = 'Copied';
      if (this.copiedTimer !== null) window.clearTimeout(this.copiedTimer);
      this.copiedTimer = window.setTimeout(() => {
        this.copiedTimer = null;
        this.copyButton.textContent = 'Copy';
      }, COPIED_FEEDBACK_MS);
    });
  }
}
