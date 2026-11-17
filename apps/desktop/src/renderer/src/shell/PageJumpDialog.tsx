/**
 * Page jump (PG1): the toolbar indicator is also the way to a page.
 *
 * A number field on the shared dialog frame. The indicator itself reads the
 * page under the centre of the viewport; the jump moves to the start of the
 * page you name. It is a movement, not a mode, and it commits an open Page Edit
 * overlay first through the one `goToActivePage` action.
 */

import { Button, Input } from 'react-aria-components';
import { useState } from 'react';
import { useShell } from '../state/shell';
import { usePageStatus } from '../page/use-page-status';
import { clampPageNumber } from '../page/model';
import { goToActivePage } from '../actions';
import { Frame } from './DialogFrame';

export function PageJumpDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const storedPage = useShell((state) =>
    state.activeTab === null ? 1 : state.viewByDoc[state.activeTab]?.currentPage ?? 1,
  );
  const status = usePageStatus(activeTab);
  const pageCount = status?.pageCount ?? 0;
  const current = clampPageNumber(storedPage, pageCount);
  const [value, setValue] = useState(String(current));
  const parsed = Number(value);
  const target = Number.isFinite(parsed) ? clampPageNumber(parsed, pageCount) : current;
  const go = (): void => {
    if (pageCount <= 0) {
      onClose();
      return;
    }
    goToActivePage(target);
    onClose();
  };

  return (
    <Frame
      title="Go to page"
      description={
        pageCount > 0
          ? `Pages run 1 to ${pageCount}.`
          : 'The page layout is still measuring.'
      }
      actions={
        <>
          <Button className="nf-button" data-dialog-secondary="true" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-primary"
            data-page-jump-go="true"
            isDisabled={pageCount <= 0}
            onPress={go}
          >
            Go
          </Button>
        </>
      }
    >
      <Input
        className="nf-input"
        type="number"
        inputMode="numeric"
        min={1}
        max={Math.max(1, pageCount)}
        step={1}
        aria-label="Page number"
        data-page-jump-input="true"
        value={value}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          go();
        }}
      />
    </Frame>
  );
}
