/**
 * Type the size of a table (special-text editing, D).
 *
 * A 1–10 grid picker with a header row. The last chosen size is remembered for
 * the session (`lib/table-insert`), so reopening the picker starts where the
 * user left it. The existing `insertTable` command is what actually inserts.
 */

import { Button, Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  rememberTableSize,
  rememberedTableSize,
  TABLE_PICKER_MAX,
  TABLE_PICKER_MIN,
} from '../lib/table-insert';
import { activeRuntime } from '../actions';

const COLS = Array.from(
  { length: TABLE_PICKER_MAX - TABLE_PICKER_MIN + 1 },
  (_, index) => TABLE_PICKER_MIN + index,
);

export function TableSizeDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const initial = rememberedTableSize();
  const [size, setSize] = useState(initial);
  const [hover, setHover] = useState(initial);

  const insert = (target: { rows: number; cols: number }): void => {
    const editor = activeRuntime()?.editor;
    if (editor === null || editor === undefined) {
      toast.error('Open a document before inserting a table.');
      onClose();
      return;
    }
    rememberTableSize(target.rows, target.cols);
    setSize(target);
    editor
      .chain()
      .focus()
      .insertTable({ rows: target.rows, cols: target.cols, withHeaderRow: true })
      .run();
    onClose();
  };

  const preview = hover;

  return (
    <ModalOverlay className="nf-overlay" isOpen onOpenChange={(open) => {
      if (!open) onClose();
    }} isDismissable>
      <Modal className="nf-dialog-modal">
        <Dialog className="nf-dialog nf-table-size-dialog" aria-label="Insert table">
          <h2 className="nf-dialog-title">Insert table</h2>
          <p className="nf-dialog-description">
            Pick the size; the first row is the header. The last size is remembered
            for this session.
          </p>
          <div className="nf-table-size-body">
            <div
              className="nf-table-size-grid"
              role="grid"
              aria-label="Table size"
              onMouseLeave={() => setHover(size)}
            >
              {COLS.map((rows) => (
                <div className="nf-table-size-row" role="row" key={`row-${rows}`}>
                  {COLS.map((cols) => {
                    const active = rows <= preview.rows && cols <= preview.cols;
                    return (
                      <button
                        key={`${rows}:${cols}`}
                        type="button"
                        role="gridcell"
                        className="nf-table-size-cell"
                        data-table-size={`${rows}:${cols}`}
                        data-table-size-active={active ? 'true' : undefined}
                        aria-label={`${rows} by ${cols}`}
                        aria-pressed={rows === size.rows && cols === size.cols}
                        onMouseEnter={() => setHover({ rows, cols })}
                        onFocus={() => setHover({ rows, cols })}
                        onClick={() => insert({ rows, cols })}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="nf-table-size-label" data-table-size-label="true">
              {preview.rows} × {preview.cols}
            </p>
          </div>
          <div className="nf-dialog-actions">
            <Button className="nf-button" onPress={onClose}>
              Cancel
            </Button>
            <Button
              className="nf-button nf-button-primary"
              data-table-size-insert="true"
              onPress={() => insert(size)}
            >
              Insert {size.rows} × {size.cols}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
