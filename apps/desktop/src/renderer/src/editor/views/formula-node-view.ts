/**
 * Formula DOM node view (special-text editing, area C).
 *
 * Single click keeps the existing anchor workflow (NodeSelection); double
 * click opens an in-place source editor instead of the modal math dialog.
 * Enter/blur commits `attrs.latex`, Escape cancels, and a KaTeX preview follows
 * the draft.
 *
 * In Page Edit the source is a body-mounted, viewport-clamped panel: ⌘⏎ commits
 * the formula source and the block overlay in one structural undo, while Escape
 * closes the source first and leaves the overlay open.
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
import { PAGE_EDIT_SHORTCUT_COMMIT_EVENT } from '../../page/page-edit-state';
import {
  openTextOnlyContextMenu,
  rememberTextControlSelection,
} from '../../lib/editor-context-menu';

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
  /**
   * True while the editor context menu owns focus. A blur caused by the menu
   * is not a commit: the source stays open with its value and selection.
   */
  private suppressBlur = false;
  /** Page Edit mounts the source as viewport-clamped chrome, not inline text. */
  private pagePanel: HTMLElement | null = null;
  /** The Page Edit overlay root the panel belongs to; null outside Page Edit. */
  private pageOverlay: HTMLElement | null = null;
  private panelFrame: number | null = null;
  private cleanupPagePanel: (() => void) | null = null;

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
    this.detachPagePanel();
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
    const source = this.buildSourceEditor();
    const overlay = this.dom.closest<HTMLElement>('.nf-page-edit-overlay');
    if (overlay !== null) {
      // Page Edit: the inline formula sits in one fragment-sized block, which
      // is far too narrow for the action row. The source is editor chrome, so
      // it becomes a viewport-clamped panel anchored to the formula instead of
      // widening or scrolling the page overlay.
      this.pageOverlay = overlay;
      this.mountPagePanel(source);
    } else {
      this.dom.replaceChildren(source);
    }
    const textarea = this.textarea;
    if (textarea !== null) {
      textarea.focus({ preventScroll: true });
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      const preview = this.preview;
      if (preview !== null) {
        renderKatex(preview, unwrapFormulaSource(textarea.value), this.block);
      }
      this.syncTerm();
      this.repositionPagePanel();
    }
  }

  private closeSource(): void {
    this.editing = false;
    this.suppressBlur = false;
    this.textarea = null;
    this.preview = null;
    this.termButton = null;
    this.copyButton = null;
    this.cleanupTextKeys?.();
    this.cleanupTextKeys = null;
    this.detachPagePanel();
    this.pageOverlay = null;
    if (this.copiedTimer !== null) {
      window.clearTimeout(this.copiedTimer);
      this.copiedTimer = null;
    }
    this.dom.replaceChildren(this.renderHost);
    this.render();
  }

  /** Page Edit formula panel: fixed and clamped to the viewport. */
  private mountPagePanel(panel: HTMLElement): void {
    panel.classList.add('nf-formula-panel-page');
    panel.dataset['pageEditExtension'] = 'true';
    document.body.appendChild(panel);
    this.pagePanel = panel;
    const request = (): void => this.requestPagePanelPosition();
    window.addEventListener('scroll', request, true);
    window.addEventListener('resize', request);
    this.cleanupPagePanel = () => {
      window.removeEventListener('scroll', request, true);
      window.removeEventListener('resize', request);
    };
    this.repositionPagePanel();
  }

  private requestPagePanelPosition(): void {
    if (this.panelFrame !== null) return;
    this.panelFrame = requestAnimationFrame(() => {
      this.panelFrame = null;
      this.repositionPagePanel();
    });
  }

  private repositionPagePanel(): void {
    const panel = this.pagePanel;
    if (panel === null || !panel.isConnected) return;
    const anchor = this.dom.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(420, Math.max(280, window.innerWidth - margin * 2));
    panel.style.width = `${width}px`;
    const height = panel.offsetHeight;
    const left = Math.min(Math.max(margin, anchor.left), window.innerWidth - width - margin);
    let top = anchor.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      const above = anchor.top - height - 6;
      top =
        above >= margin
          ? above
          : Math.max(margin, window.innerHeight - height - margin);
    }
    if (top < margin) top = margin;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  private detachPagePanel(): void {
    if (this.panelFrame !== null) {
      cancelAnimationFrame(this.panelFrame);
      this.panelFrame = null;
    }
    this.cleanupPagePanel?.();
    this.cleanupPagePanel = null;
    const panel = this.pagePanel;
    this.pagePanel = null;
    panel?.remove();
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
    textarea.addEventListener('mousedown', (event) => {
      if (event.button === 2) rememberTextControlSelection(textarea);
    });
    textarea.addEventListener('focus', () => {
      // Returning from the menu is not a new commit condition.
      this.suppressBlur = false;
    });
    // The custom menu owns the right-click inside the source. It must neither
    // close the source nor commit the draft: the value and selection stay.
    textarea.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.suppressBlur = true;
      openTextOnlyContextMenu(
        textarea,
        { x: event.clientX, y: event.clientY },
        { onClose: () => { this.suppressBlur = false; } },
      );
    });
    textarea.addEventListener('blur', () => {
      // The menu temporarily owns focus; the draft must survive it. The
      // clipboard fallback also focuses a temporary textarea for a moment.
      if (this.copying || this.suppressBlur) return;
      this.commitSource(false);
    });
    textarea.addEventListener('keydown', (event) => {
      const commitChord = event.key === 'Enter' && (event.metaKey || event.ctrlKey);
      if (commitChord && this.pageOverlay !== null) {
        // Page Edit hint: “Esc or ⌘⏎ commits”. One ⌘⏎ commits the formula
        // source and the block overlay in one structural undo. The panel is
        // body-mounted, so it forwards the chord to the overlay instead of
        // committing only the source (F3).
        event.preventDefault();
        event.stopPropagation();
        const overlay = this.pageOverlay;
        this.commitSource(false);
        overlay.dispatchEvent(new CustomEvent(PAGE_EDIT_SHORTCUT_COMMIT_EVENT));
        return;
      }
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
