/**
 * Page indicator in the Toolbar (PG1).
 *
 * `N / M` next to the zoom: the page whose box contains the centre of the
 * viewport, published by the Page surface. Clicking it opens the page jump;
 * `⌘↑`/`⌘↓` move to the previous/next page start. The number in the seam is
 * gone: the toolbar names the page, the paper does not.
 *
 * Only Page has pages, so the control is absent in Continuous and in a
 * Markdown guest file.
 */

import { useShell } from '../state/shell';
import { usePageStatus } from '../page/use-page-status';
import { clampPageNumber } from '../page/model';

export function PagePosition(): JSX.Element | null {
  const activeTab = useShell((state) => state.activeTab);
  const layout = useShell((state) =>
    state.activeTab === null
      ? 'continuous'
      : state.viewByDoc[state.activeTab]?.layout ?? 'continuous',
  );
  const storedPage = useShell((state) =>
    state.activeTab === null ? 1 : state.viewByDoc[state.activeTab]?.currentPage ?? 1,
  );
  const status = usePageStatus(activeTab);
  if (layout !== 'page' || activeTab === null) return null;

  const pageCount = status?.pageCount ?? 0;
  const ready = status?.ready === true && pageCount > 0;
  const page = ready ? clampPageNumber(storedPage, pageCount) : 1;
  const openJump = (): void => {
    useShell.getState().openDialog({ kind: 'page-jump' });
  };

  return (
    <button
      type="button"
      className="nf-page-position"
      data-page-position="true"
      data-page-position-ready={ready ? 'true' : 'false'}
      data-page-position-page={ready ? page : undefined}
      data-page-position-count={ready ? pageCount : undefined}
      aria-label={ready ? `Page ${page} of ${pageCount}. Go to page` : 'Page position'}
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+ArrowUp Meta+ArrowDown"
      title={ready ? `Go to page (⌘↑ / ⌘↓)` : 'Laying out pages…'}
      disabled={!ready}
      onClick={openJump}
    >
      {ready ? `${page} / ${pageCount}` : '– / –'}
    </button>
  );
}
