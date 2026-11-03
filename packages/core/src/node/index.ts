/**
 * @noteforest/core/node — Node-only persistence entrypoint.
 *
 * Filesystem, lock files, backups, recent-documents manifest, and recovery.
 * The pure model remains available from `@noteforest/core`.
 */

export * from './paths.js';
export * from './atomic.js';
export * from './lock.js';
export * from './backups.js';
export * from './recent.js';
export * from './store.js';
export * from './recovery.js';
