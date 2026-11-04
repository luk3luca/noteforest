/**
 * Map a core store `CoreError` onto the renderer-facing save failure code.
 *
 * Kept free of Electron/Node imports so the classification (especially
 * permission vs disk-full vs external modification) is unit-tested without
 * launching the app. The original code is preserved alongside it.
 */

import type { CoreError } from '@noteforest/core';
import type { SaveFailureCode } from '../shared/api.js';

export function saveFailureCode(error: CoreError): SaveFailureCode {
  switch (error.code) {
    case 'read-only':
      return 'read-only';
    case 'external-modification':
      return 'external-modification';
    case 'lock-lost':
      return 'lock-lost';
    case 'backup-failed':
      return 'backup-failed';
    case 'invalid-document':
      return 'invalid-document';
    case 'not-found':
      return 'not-found';
    case 'io-error': {
      const reason = error.details?.['reason'];
      if (reason === 'permission') return 'permission';
      if (reason === 'disk-full') return 'disk-full';
      return 'unknown';
    }
    default:
      return 'unknown';
  }
}
