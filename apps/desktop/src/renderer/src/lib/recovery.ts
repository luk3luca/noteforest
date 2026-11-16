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
      return 'This note comes from a newer NoteForest.';
    case 'missing':
      return 'This note is missing.';
    case 'unreadable':
      return 'This note couldn’t be read.';
  }
}

export function recoveryDescription(status: RecoveryStatus): string {
  switch (status) {
    case 'newer-schema':
      return 'Open it in the newer NoteForest. This version leaves the file unchanged.';
    case 'missing':
      return 'The folder is gone; it may have been moved or deleted. Nothing on disk was changed.';
    case 'unreadable':
      return 'The file couldn’t be read and was not changed. Restore a backup, or check Details.';
  }
}
