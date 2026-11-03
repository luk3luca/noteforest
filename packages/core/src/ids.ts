/**
 * Opaque ID and clock helpers.
 *
 * IDs are UUID v4 strings generated with the platform Web Crypto API. They are
 * opaque and never derived from titles or positions. Tests can inject a
 * deterministic factory through `CoreContext`.
 */

export type IdFactory = () => string;

export type Clock = () => string;

/** UUID v4, using the platform Web Crypto API (Node 19+, browsers). */
export const defaultIdFactory: IdFactory = () => {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!webCrypto?.randomUUID) {
    throw new Error('No Web Crypto randomUUID available; pass an explicit IdFactory');
  }
  return webCrypto.randomUUID();
};

/** ISO 8601 UTC timestamp with millisecond precision. */
export const systemClock: Clock = () => new Date().toISOString();

export interface CoreContext {
  newId: IdFactory;
  now: Clock;
}

export function createContext(overrides: Partial<CoreContext> = {}): CoreContext {
  return {
    newId: overrides.newId ?? defaultIdFactory,
    now: overrides.now ?? systemClock,
  };
}

/** Deterministic counter-based IDs for tests and fixtures (`b1`, `b2`, …). */
export function sequentialIdFactory(prefix = 'id'): IdFactory {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}${counter}`;
  };
}
