/**
 * Shared modal frame for shell dialogs (docs/design/dialogs.md §1).
 *
 * One frame owns the overlay, modal, header (optional kicker, title, close X),
 * one-line description, scrolling body, and fixed footer slots. Every dialog
 * has the same focus trap, Esc dismissal, focus restore, and geometry; the
 * dialog content itself never manages the overlay.
 *
 * Sizes: 480 by default, 560 for a body that is a list or a record. There is no
 * 640 variant. The footer is `[navigation] … [secondary] [primary]`; the
 * `…` menu slot stays empty (and is never rendered) until a dialog needs one.
 */

import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useShell } from '../state/shell';

export interface FrameProps {
  /** Sentence-case title, at most six words; it is the accessible name. */
  title: string;
  /** Optional family kicker; never decorative and never repeated from the title. */
  kicker?: string;
  /** One line that states the outcome. Never repeats the title. */
  description?: string;
  /** 560 only for a list/record body; long copy is cut, never stretched. */
  size?: 'default' | 'records';
  /** Left slot: `Show in note`, `Back`. Never confirms or destroys. */
  navigation?: React.ReactNode;
  /** Right slots, in order: secondary, then the single primary. */
  actions: React.ReactNode;
  /**
   * Focus the secondary (Cancel) on open. Required for a danger primary, so a
   * destructive action is never the default focus target.
   */
  focusSecondary?: boolean;
  children: React.ReactNode;
}

export function Frame({
  title,
  kicker,
  description,
  size = 'default',
  navigation,
  actions,
  focusSecondary = false,
  children,
}: FrameProps): JSX.Element {
  const titleId = `nf-dialog-title-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const footerRef = useRef<HTMLElement | null>(null);
  // Capture the real trigger before the modal focus scope moves focus. The
  // shell closes by removing the surface, so restore explicitly on unmount.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  if (
    returnFocusRef.current === null &&
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
  ) {
    returnFocusRef.current = document.activeElement;
  }

  useEffect(
    () => () => {
      const target = returnFocusRef.current;
      if (target === null) return;
      // Run after React Aria's modal focus scope restores; a surface opened
      // while this one closed (Settings -> Export) keeps its own focus.
      requestAnimationFrame(() => {
        if (document.querySelector('[role="dialog"]') !== null) return;
        if (target.isConnected) target.focus({ preventScroll: true });
      });
    },
    [],
  );

  useEffect(() => {
    if (!focusSecondary) return;
    footerRef.current
      ?.querySelector<HTMLElement>('[data-dialog-secondary="true"]')
      ?.focus();
  }, [focusSecondary]);

  const close = (): void => {
    useShell.getState().closeDialog();
  };

  return (
    <ModalOverlay
      className="nf-overlay"
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
      isDismissable
    >
      <Modal
        className={
          size === 'records' ? 'nf-dialog-modal nf-dialog-modal-records' : 'nf-dialog-modal'
        }
      >
        <Dialog
          className="nf-dialog"
          aria-labelledby={titleId}
          data-dialog-frame="true"
          data-dialog-size={size}
        >
          <header className="nf-dialog-head">
            <div className="nf-dialog-heading">
              {kicker === undefined ? null : <p className="nf-dialog-kicker">{kicker}</p>}
              <h2 id={titleId} className="nf-dialog-title">
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="nf-icon-button nf-dialog-close"
              data-dialog-close="true"
              aria-label="Close"
              title="Close (Esc)"
              onClick={close}
            >
              <X size={13} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </header>
          {description === undefined ? null : (
            <p className="nf-dialog-description" title={description}>
              {description}
            </p>
          )}
          <div className="nf-dialog-body">{children}</div>
          <footer ref={footerRef} className="nf-dialog-actions">
            {navigation === undefined ? null : (
              <div className="nf-dialog-navigation" data-dialog-navigation="true">
                {navigation}
              </div>
            )}
            <span className="nf-dialog-spacer" />
            {actions}
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
