/** Copy and labels for damaged/missing/newer packages (pure, unit-tested). */

import type { RecoveryStatus } from '../../../shared/api';

export function recoveryStatusLabel(status: RecoveryStatus): string {
  switch (status) {
    case 'newer-schema':
      return 'Newer version';
    case 'missing':
      return 'Missing';
    case 'unreadable':
      return 'Unreadable';
  }
}

export function recoveryHeadline(status: RecoveryStatus): string {
  switch (status) {
    case 'newer-schema':
      return 'This document was saved by a newer NoteForest.';
    case 'missing':
      return 'This document is missing.';
    case 'unreadable':
      return 'This document could not be read.';
  }
}

export function recoveryDescription(status: RecoveryStatus): string {
  switch (status) {
    case 'newer-schema':
      return 'This version of NoteForest cannot open it. The file stays read-only: it will not be downgraded, edited, or overwritten. Open it in the newer version, or restore an older backup as a new copy.';
    case 'missing':
      return 'The folder or its document.json is missing. It may have been moved or deleted. NoteForest has not changed anything on disk.';
    case 'unreadable':
      return 'The file did not parse into a valid document and has not been changed. Inspect the reason below, or restore a valid backup as a new copy.';
  }
}
