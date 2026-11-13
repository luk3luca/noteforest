/**
 * Session memory for the table insert picker (special-text editing, D).
 *
 * The last chosen N×M size is remembered for the app session; a relaunch starts
 * from 3×3 again.
 */

export interface TableInsertSize {
  rows: number;
  cols: number;
}

export const TABLE_PICKER_MIN = 1;
export const TABLE_PICKER_MAX = 10;

let remembered: TableInsertSize = { rows: 3, cols: 3 };

function clamp(value: number): number {
  if (!Number.isFinite(value)) return TABLE_PICKER_MIN;
  return Math.min(TABLE_PICKER_MAX, Math.max(TABLE_PICKER_MIN, Math.trunc(value)));
}

export function rememberTableSize(rows: number, cols: number): TableInsertSize {
  remembered = { rows: clamp(rows), cols: clamp(cols) };
  return { ...remembered };
}

export function rememberedTableSize(): TableInsertSize {
  return { ...remembered };
}
