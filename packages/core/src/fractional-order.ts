/**
 * Fractional order keys (base 36, lexicographic).
 *
 * Branch `order` strings sort lexicographically and are unique within a source
 * port and role (docs/spec.md §4.5). Insertion between two neighbours never
 * renumbers the siblings. Keys generated here never start or end with `0`,
 * which keeps `orderBetween` total for all keys this module produces.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

function digitValue(character: string): number {
  return DIGITS.indexOf(character);
}

/** True when a key is one this module could have produced. */
export function isValidOrderKey(key: string): boolean {
  if (key.length === 0) return false;
  if (key.startsWith('0') || key.endsWith('0')) return false;
  for (const character of key) {
    if (digitValue(character) < 0) return false;
  }
  return true;
}

function midpoint(low: string, high: string | null): string {
  if (high !== null && low >= high) {
    throw new Error(`order keys out of order: ${low} >= ${high}`);
  }
  if (high !== null) {
    let prefixLength = 0;
    while (
      prefixLength < low.length &&
      prefixLength < high.length &&
      low[prefixLength] === high[prefixLength]
    ) {
      prefixLength += 1;
    }
    if (prefixLength > 0) {
      return (
        high.slice(0, prefixLength) +
        midpoint(low.slice(prefixLength), high.slice(prefixLength))
      );
    }
  }

  const lowDigit = low.length > 0 ? digitValue(low[0] ?? '') : 0;
  const highDigit = high !== null ? digitValue(high[0] ?? '') : DIGITS.length;
  if (lowDigit < 0 || highDigit < 0 || lowDigit >= highDigit) {
    throw new Error(`invalid order key interval: ${low} .. ${String(high)}`);
  }
  if (highDigit - lowDigit > 1) {
    const middleDigit = Math.floor((lowDigit + highDigit) / 2);
    return DIGITS[middleDigit] ?? '';
  }
  if (high !== null && high.length > 1) {
    return high.slice(0, 1);
  }
  return (DIGITS[lowDigit] ?? '') + midpoint(low.slice(1), null);
}

/**
 * Return a key strictly between `low` and `high` (either may be null for an
 * open end). Throws if the interval is not orderable.
 */
export function orderBetween(low: string | null, high: string | null): string {
  if (low !== null && high !== null && low >= high) {
    throw new Error(`order keys out of order: ${low} >= ${high}`);
  }
  if (low === null && high === null) return 'm';
  if (low === null) return midpoint('', high);
  if (high === null) return midpoint(low, null);
  return midpoint(low, high);
}

/**
 * Generate `count` increasing keys strictly between `low` and `high`.
 * Used when reattaching several promoted children into one gap.
 */
export function orderKeysBetween(
  low: string | null,
  high: string | null,
  count: number,
): string[] {
  const keys: string[] = [];
  let previous = low;
  for (let index = 0; index < count; index += 1) {
    const key = orderBetween(previous, high);
    keys.push(key);
    previous = key;
  }
  return keys;
}

/** Generate `count` increasing keys after an optional last key. */
export function orderKeysAfter(last: string | null, count: number): string[] {
  const keys: string[] = [];
  let previous = last;
  for (let index = 0; index < count; index += 1) {
    const key = orderBetween(previous, null);
    keys.push(key);
    previous = key;
  }
  return keys;
}
