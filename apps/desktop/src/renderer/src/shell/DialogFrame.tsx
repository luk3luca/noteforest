/**
 * Shared modal frame for shell dialogs.
 *
 * The frame owns the overlay, modal, title, description, body, and action row
 * so every sheet has the same focus trap, Esc dismissal, and geometry. The
 * dialog content itself never manages the overlay.
 */

import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useShell } from '../state/shell';

export interface FrameProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  wide?: boolean;
}

export function Frame({ title, description, children, actions, wide = false }: FrameProps): JSX.Element {
  return (
    <ModalOverlay
      className="nf-overlay"
      isOpen
      onOpenChange={(open) => {
        if (!open) useShell.getState().closeDialog();
      }}
      isDismissable
    >
      <Modal className={wide ? 'nf-dialog-modal nf-dialog-modal-wide' : 'nf-dialog-modal'}>
        <Dialog className="nf-dialog" aria-label={title}>
          <h2 className="nf-dialog-title">{title}</h2>
          {description === undefined ? null : <p className="nf-dialog-description">{description}</p>}
          <div className="nf-dialog-body">{children}</div>
          <div className="nf-dialog-actions">{actions}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
