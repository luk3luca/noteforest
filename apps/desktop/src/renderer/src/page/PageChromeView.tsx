/**
 * One chrome renderer for Page Read, Page Edit, the Settings preview, and print.
 *
 * The records come from the shared `pageChromeContent`/`pageChromeLayout`
 * helpers, so every surface renders the same header, footer, number, ghost, and
 * continues bands. A source set to None renders nothing at all; the page number
 * is centered in the footer band with an empty right slot. The margin-band
 * geometry is never recomputed here.
 */

import type { PageChromeContent, PageChromeLayout } from '@noteforest/layout';

export type PageChromeRecord = PageChromeContent & PageChromeLayout;

export function PageChromeView({ chrome }: { chrome: PageChromeRecord }): JSX.Element {
  const { left, right, headerTop, ghostTop, footerBottom, continuesBottom } = chrome;
  return (
    <>
      {chrome.headerText === null ? null : (
        <div className="nf-page-header" style={{ left, right, top: headerTop }}>
          <span className="nf-page-header-text">{chrome.headerText}</span>
        </div>
      )}
      {chrome.continuedFrom.length > 0 ? (
        <div
          className="nf-page-ghost-list"
          style={{ left, right, top: ghostTop }}
          data-page-ghost-list="true"
          data-page-continued-from={chrome.continuedFrom[0]?.fromPage}
        >
          {chrome.continuedFrom.map((continuation) => (
            <div
              className="nf-page-ghost"
              key={`${continuation.blockId}-${continuation.fromPage}`}
            >
              ↳ continued from page {continuation.fromPage} ·{' '}
              {continuation.parentLabel}
              {continuation.anchorQuote === null ? '' : ` (${continuation.anchorQuote})`}{' '}
              → {continuation.blockLabel}
            </div>
          ))}
        </div>
      ) : null}
      {chrome.footerText === null && chrome.pageLabel === null ? null : (
        <div className="nf-page-footer" style={{ left, right, bottom: footerBottom }}>
          <span className="nf-page-footer-text">
            {chrome.footerText === null ? '' : chrome.footerText}
          </span>
          {chrome.pageLabel === null ? null : (
            <span
              className="nf-page-footer-number"
              style={{ transform: `translateX(${chrome.pageNumberShift}px)` }}
              data-page-indicator="true"
              data-page-number-shift={chrome.pageNumberShift.toFixed(3)}
            >
              {chrome.pageLabel}
            </span>
          )}
        </div>
      )}
      {chrome.continuesOn.length > 0 ? (
        <div
          className="nf-page-continues-list"
          style={{ left, right, bottom: continuesBottom }}
          data-page-continues-list="true"
          data-page-continues-on={chrome.continuesOn[0]?.toPage}
        >
          {chrome.continuesOn.map((continuation) => (
            <div
              className="nf-page-continues"
              key={`${continuation.blockId}-${continuation.toPage}`}
            >
              continues on page {continuation.toPage} ·{' '}
              {continuation.blockLabel} →
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
