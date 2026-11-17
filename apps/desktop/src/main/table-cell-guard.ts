/**
 * The table-cell load guard — the main-process name for the shared judgement.
 *
 * The detection itself lives in `@noteforest/core` (`table-cells.ts`), because
 * the library scan needs the same answer as the loader: a rich-cell package
 * must list as `unreadable` for the same reason it refuses to open (P2 item 5).
 * One predicate, two callers, no second parse.
 *
 * This module stays the loader's import: `library.ts` refuses **before**
 * `repository.open`, so no lock, migration, or save can touch `document.json`,
 * and the raw sentence belongs under `Details`; no row ever reads it verbatim.
 */

export {
  mentionsTableCells,
  unrepresentableTableCells,
  type TableCellRefusal,
} from '@noteforest/core';
