import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exportFailureMessage,
  warningDetailsValue,
  warningRowLabel,
} from '../src/renderer/src/export/export-copy';
import type { ExportFailureCode } from '../src/shared/export';

const root = resolve(import.meta.dirname, '..');

/**
 * Copy-bearing modules (docs/tasks/dialog-copy-a-b.md item 9, extended by
 * docs/tasks/copy-c-d.md item 7). Every string/template literal and plain JSX
 * text node in these files is user copy, so the scan needs no exceptions; the
 * banned-word allowlist stays empty.
 */
const COPY_MODULES = [
  'src/renderer/src/shell/DialogFrame.tsx',
  'src/renderer/src/shell/Dialogs.tsx',
  'src/renderer/src/shell/TableSizeDialog.tsx',
  'src/renderer/src/shell/SettingsDialog.tsx',
  'src/renderer/src/shell/Details.tsx',
  'src/renderer/src/export/ExportSheet.tsx',
  'src/renderer/src/export/export-copy.ts',
  'src/renderer/src/settings/AppearanceSettings.tsx',
  'src/renderer/src/settings/ContinuousSettings.tsx',
  'src/renderer/src/settings/ExportSettings.tsx',
  'src/renderer/src/settings/PageAdvancedSettings.tsx',
  'src/renderer/src/settings/PageSettingsPreview.tsx',
  'src/renderer/src/lib/save-failure.ts',
  // Batch C+D copy-bearing modules.
  'src/renderer/src/lib/recovery.ts',
  'src/renderer/src/lib/editability.ts',
  'src/renderer/src/lib/toast-details.ts',
  'src/renderer/src/export/export-flow.ts',
  'src/renderer/src/markdown/markdown-save.ts',
  'src/renderer/src/markdown/MarkdownFileEditor.tsx',
  'src/renderer/src/markdown/MarkdownImageView.tsx',
  'src/renderer/src/shell/StatusBar.tsx',
  'src/renderer/src/shell/SaveFailureBanner.tsx',
  'src/renderer/src/shell/DraftMaterializeBanner.tsx',
  'src/renderer/src/shell/RecoverySurface.tsx',
  'src/renderer/src/shell/DocumentStatusPanel.tsx',
  'src/renderer/src/shell/SearchSection.tsx',
  'src/renderer/src/shell/Sidebar.tsx',
  'src/renderer/src/shell/CanvasHeader.tsx',
  'src/renderer/src/shell/ViewControls.tsx',
  'src/renderer/src/shell/Toolbar.tsx',
  'src/renderer/src/shell/CommandPalette.tsx',
  'src/renderer/src/editor/views/BlockViews.tsx',
  'src/renderer/src/state/save-coordinator.ts',
  'src/renderer/src/state/document-session.ts',
  'src/renderer/src/lib/image-insert.ts',
  'src/renderer/src/lib/image-authoring.ts',
  'src/main/menu-template.ts',
];

/** Confirmed banned words (copy-audit §2.3, dialogs.md §4). */
const BANNED = [
  'paginator',
  'pagetheme',
  'packing',
  'trunk',
  'lane',
  'callout mode',
  'heartbeat',
  'binding',
  'command layer',
  'schema',
  'json',
  'id',
  'node path',
  'app support',
];

/** The exact A/B rows applied by this batch. Copy is asserted verbatim. */
const APPLIED_COPY: Record<string, readonly string[]> = {
  'src/renderer/src/shell/DialogFrame.tsx': [
    'Close',
    'Close (Esc)',
  ],
  'src/renderer/src/shell/Details.tsx': [
    'Details',
    'Technical details',
    'Copy',
    'Copied',
    'Close',
  ],
  'src/renderer/src/shell/Dialogs.tsx': [
    'New library',
    'Create a folder for a new set of notes.',
    'Create library',
    'Couldn’t create the library. Check the name and the parent folder.',
    'This entry has no note folder. It is removed from the list; no files are deleted.',
    'The folder and everything inside it move to the Trash. You can restore them from there.',
    'The file moves to the Trash. You can restore it from there.',
    'The note moves to the Trash. You can restore it from there.',
    'This note comes from a newer NoteForest. Trashing it is safe, but this version can’t read it.',
    'Another window is writing this note. Close it there and try again.',
    'A lock from an earlier session is cleared first.',
    'Couldn’t create the folder. Check the name and try again.',
    'Couldn’t rename the folder. Check the name and try again.',
    'Couldn’t move the entry. Check the destination and try again.',
    'Close file?',
    'This file has unsaved changes.',
    'Another app wrote this file. Nothing has been overwritten.',
    'Reload discards your edits. Overwrite keeps a backup of the version on disk.',
    'No note open',
    'Open a note first.',
    'Detach from parent?',
    'The block becomes top-level in its chapter. Its content is kept.',
    'Detach from parent',
    'LaTeX only. Nothing is loaded from the web.',
    'Open a note before branching from a term.',
    'The formula isn’t in the note any more. Close the dialog and try again.',
    'The formula wasn’t updated. Check the LaTeX and try again.',
    'This tab has unsaved changes.',
    'This note',
    'Unsaved changes in this window are discarded. The file on disk is not changed.',
    'The target keeps its place. This adds a reference link.',
    'That link already exists.',
    'Couldn’t add the link.',
    'Choose a new parent. A block can’t move inside itself.',
    'The block and its content are removed.',
    'This reference link will be removed with the block. The source blocks stay.',
    'These reference links will be removed with the block. The source blocks stay.',
    'Describe the image. Leave it empty if it is decorative.',
    'Couldn’t save the alt text.',
    'Restores a copy. The current file is not changed.',
    'No backup yet. Save the note as a copy instead.',
    'Restored a backup.',
  ],
  'src/renderer/src/shell/TableSizeDialog.tsx': [
    'Insert table',
    'Pick a size. The first row is a header.',
    'Open a note before inserting a table.',
  ],
  'src/renderer/src/shell/SettingsDialog.tsx': [
    'Page, Page Edit, the preview, and PDF share these settings.',
    'Open a note to override Page settings.',
    'Up to 100 mm per side. The content needs at least 20 mm.',
    'The header and footer use the note and chapter titles. The page number stays centered.',
    'and replace the custom values in this layer?',
    'Density for notes without their own setting.',
    '60–70% is densest; 80% and up keeps larger type.',
    'Saves automatically. ⌘S saves now.',
    'Page settings for this note and the app default.',
    'Shortcuts are fixed.',
    'One library per window. Removing one from the list never deletes files.',
    'Reset replaces these settings with the defaults. The note is not changed.',
    'Settings were upgraded. Your values are kept.',
    'Can’t read — using defaults',
    'From a newer version',
    'These settings come from a newer NoteForest. They are used as they are.',
    'These settings couldn’t be read. The defaults are in use.',
    'Note settings couldn’t be read. The defaults are in use until you reset or restore them.',
    'Page overrides are stored per document. Resetting them never changes the note.',
    'Reset overrides',
    'Confirm reset overrides',
    'This removes every Page override. The note is not changed.',
    'Restore the newest backup? The current file is saved as a backup first.',
    'Open library…',
    'Remove from recents',
    '⌥↑ / ⌥↓',
  ],
  'src/renderer/src/settings/AppearanceSettings.tsx': [
    'The app around the note. Page and PDF keep their paper.',
    'Follows the macOS appearance. Page and PDF keep their paper.',
    'Buttons, selection, and the active tab. Not Page or PDF.',
    'Affects the app only, not Page or PDF. Code font applies to code everywhere.',
  ],
  'src/renderer/src/settings/ContinuousSettings.tsx': [
    'Canvas spacing and arrows. Global; Page and PDF don’t change.',
    'Gaps between chapters, cards, and rows.',
    'Resting and active arrow widths. The arrowhead is fixed; reference arrows stay dashed.',
    'The canvas widens automatically to fit the cards.',
    'Reset every Continuous setting? Page and PDF aren’t affected.',
  ],
  'src/renderer/src/settings/ExportSettings.tsx': [
    'Exports the Page layout with these page settings.',
    'New exports go here.',
    'New exports go here. You can pick another folder when exporting.',
    'The file is named after the note. You can rename it when exporting.',
    'Couldn’t choose an export folder.',
  ],
  'src/renderer/src/settings/PageAdvancedSettings.tsx': [
    'Sizes in points, line heights as a multiplier. Editing a value makes this layer Custom.',
    'Values in pixels, per level. Editing a value makes this layer Custom.',
    'Card width limit. It follows density; images use the same limit.',
  ],
  'src/renderer/src/settings/PageSettingsPreview.tsx': [
    'The preview couldn’t be built.',
  ],
  'src/renderer/src/export/ExportSheet.tsx': [
    'Close',
    'Close (Esc)',
    'The file is named after the note.',
    'Page layout',
    'Page count is calculated at export · whole document',
    'A file already exists there. Replacing it cannot be undone.',
    'Cancel keeps the existing file.',
  ],
  'src/renderer/src/export/export-copy.ts': [
    'The export didn’t start.',
    'A file already exists there.',
    'The note couldn’t be read in time.',
    'The PDF didn’t match the note, so the export stopped.',
    'The note has no pages to export.',
    'The pages couldn’t be laid out.',
    'The PDF couldn’t be printed.',
    'A layout problem would break the PDF.',
    'The PDF failed its checks.',
    'The file couldn’t be written.',
    'The export was cancelled.',
    'The export stopped unexpectedly.',
  ],
  'src/renderer/src/lib/save-failure.ts': [
    'This replaces the file on disk; the external changes are lost. Reload instead to keep them.',
  ],
};

/** Rows the plan deletes; the string and its element are gone. */
const DELETED_COPY: Record<string, readonly string[]> = {
  'src/renderer/src/shell/Dialogs.tsx': [
    'will be reopened from',
    'The external changes will be lost',
    'The restored copy opens in a new tab',
    'The target stays once at its primary home',
    'This block has descendants.',
    'This block has no descendants.',
    "missing ? 'Remove from recents'",
    'app support',
  ],
  'src/renderer/src/shell/SettingsDialog.tsx': [
    'page-1 exception',
    'engine values',
    'right lane and below',
    'A searchable list lives on the Editor page.',
    'Autosave runs after 800 ms',
    'read-only reference of the app shortcuts',
    'Per-document page overrides live in document-settings.json',
    'Open a document to override Page settings',
    'Global Page density is',
    'Reset map',
    'Confirm reset map',
  ],
  'src/renderer/src/settings/ContinuousSettings.tsx': [
    'Space between chapters',
    'Canvas max is at least',
    'trunk, lane, and stem internals',
    'The sample tree is in the right rail',
    'Zoom is view state',
  ],
  'src/renderer/src/settings/ExportSettings.tsx': [
    'A missing folder is reported',
    'Folder and replacement decisions stay in the sheet',
    'The document title is the file name, sanitized',
  ],
  'src/renderer/src/settings/PageAdvancedSettings.tsx': [
    'Hidden engine values',
    '120–2000 px',
  ],
  'src/renderer/src/settings/AppearanceSettings.tsx': [
    'Theme, accent, and type are visible in the right rail',
  ],
  'src/renderer/src/export/ExportSheet.tsx': [
    'Preflight runs automatically when you export.',
    'Page layout will be exported',
    'A file already exists at this path.',
    'Cancel returns to Configure with the path intact',
  ],
};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function sourceFor(modulePath: string): Promise<string> {
  return readFile(resolve(root, modulePath), 'utf8');
}

/**
 * Explicit `KEEP` labels that are technical by design and live inside Details
 * only: B-01.31 `Schema version` (a settings-file term) and C-08.15
 * `Heartbeat` (the lock record, shown under Lock details). They are the plan's
 * own kept strings, not copy this batch adds.
 */
const KEEP_LABELS = new Set(['Schema version', 'Heartbeat']);

/** Every string literal and template literal in the module. */
function stringLiterals(source: string): string[] {
  const text = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const found: string[] = [];
  for (const match of text.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
    const value = match[1] ?? match[2] ?? '';
    if (/[A-Za-z]/.test(value)) found.push(value);
  }
  for (const match of text.matchAll(/`([^`]*)`/g)) {
    const value = match[1] ?? '';
    if (/[A-Za-z]/.test(value)) found.push(value);
  }
  return found;
}

/** Plain JSX text nodes (no attribute values, expressions, or code lines). */
function jsxText(source: string): string[] {
  const text = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const found: string[] = [];
  for (const match of text.matchAll(/>([^<>{}=;]{1,400})</g)) {
    const value = normalize(match[1]);
    if (value.length === 0 || !/[A-Za-z]/.test(value)) continue;
    if (KEEP_LABELS.has(value)) continue;
    found.push(value);
  }
  return found;
}

/**
 * Identifiers, selectors, class names, and data values are not user copy
 * (`[data-anchor-marker-id]` is an attribute selector, not a sentence).
 */
function isIdentifierLike(value: string): boolean {
  return !/\s/.test(value) && /^[a-z0-9_.$:{}<>/=\[\]-]+$/.test(value);
}

describe('A/B copy', () => {
  it('applies every applied row verbatim', async () => {
    const missing: string[] = [];
    for (const [modulePath, copies] of Object.entries(APPLIED_COPY)) {
      const source = normalize(await sourceFor(modulePath));
      for (const copy of copies) {
        if (!source.includes(normalize(copy))) missing.push(`${modulePath}: ${copy}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('removes every deleted row and element', async () => {
    const present: string[] = [];
    for (const [modulePath, copies] of Object.entries(DELETED_COPY)) {
      const source = normalize(await sourceFor(modulePath));
      for (const copy of copies) {
        if (source.includes(normalize(copy))) present.push(`${modulePath}: ${copy}`);
      }
    }
    expect(present).toEqual([]);
  });

  it('contains no banned word in the applied or literal copy', async () => {
    const violations: string[] = [];
    const copy = [
      ...Object.values(APPLIED_COPY).flat(),
      ...(await Promise.all(COPY_MODULES.map(async (modulePath) => {
        const source = await sourceFor(modulePath);
        return [...stringLiterals(source), ...jsxText(source)];
      }))).flat().filter((value) => !isIdentifierLike(value)),
    ];
    for (const value of copy) {
      const lower = value.toLowerCase();
      for (const word of BANNED) {
        const pattern = new RegExp(`(^|[^a-z0-9])${word.replace(' ', '\\s+')}([^a-z0-9]|$)`);
        if (pattern.test(lower)) violations.push(`${word}: ${value}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the frame free of the retired 640 wide modifier', async () => {
    const frame = await sourceFor('src/renderer/src/shell/DialogFrame.tsx');
    expect(frame).not.toContain('wide');
    expect(frame).toContain('nf-dialog-modal-records');
    const css = await sourceFor('src/renderer/src/styles.css');
    expect(css).not.toContain('nf-dialog-modal-wide');
    expect(css).toContain('.nf-dialog-modal-records');
    expect(css).toContain('width: 560px;');
  });
});

describe('export failure copy', () => {
  const codes: ExportFailureCode[] = [
    'invalid-input',
    'output-exists',
    'document-not-open',
    'snapshot-failed',
    'snapshot-timeout',
    'document-mismatch',
    'settings-mismatch',
    'empty-document',
    'model-mismatch',
    'model-error',
    'render-error',
    'preflight-blocked',
    'print-failed',
    'validation-failed',
    'write-failed',
    'window-failed',
    'cancelled',
    'internal-error',
  ];

  it('maps the 18 codes onto the 12 confirmed short sentences', () => {
    expect(new Set(codes.map((code) => exportFailureMessage(code))).size).toBe(12);
    expect(exportFailureMessage('invalid-input')).toBe('The export didn’t start.');
    expect(exportFailureMessage('document-not-open')).toBe('The export didn’t start.');
    expect(exportFailureMessage('output-exists')).toBe('A file already exists there.');
    expect(exportFailureMessage('snapshot-timeout')).toBe('The note couldn’t be read in time.');
    expect(exportFailureMessage('settings-mismatch')).toBe(
      'The PDF didn’t match the note, so the export stopped.',
    );
    expect(exportFailureMessage('empty-document')).toBe('The note has no pages to export.');
    expect(exportFailureMessage('model-error')).toBe('The pages couldn’t be laid out.');
    expect(exportFailureMessage('window-failed')).toBe('The PDF couldn’t be printed.');
    expect(exportFailureMessage('preflight-blocked')).toBe(
      'A layout problem would break the PDF.',
    );
    expect(exportFailureMessage('validation-failed')).toBe('The PDF failed its checks.');
    expect(exportFailureMessage('write-failed')).toBe('The file couldn’t be written.');
    expect(exportFailureMessage('cancelled')).toBe('The export was cancelled.');
    expect(exportFailureMessage('internal-error')).toBe('The export stopped unexpectedly.');
    expect(exportFailureMessage(undefined)).toBe('The export stopped unexpectedly.');
  });

  it('keeps warning rows to source and group and joins messages in Details', () => {
    const warnings = [
      {
        kind: 'blocking-defect' as const,
        code: 'block-too-tall',
        message: 'Tall block is too tall for the page.',
        blockTitle: 'Tall block',
      },
      {
        kind: 'page-overflow' as const,
        code: 'page-overflow',
        message: 'Page 3 is too tall.',
        pageNumber: 3,
      },
      { kind: 'render' as const, code: 'render', message: 'A font was missing.' },
    ];
    expect(warnings.map(warningRowLabel)).toEqual([
      'Tall block · Layout defects',
      'Page 3 · Page overflow',
      'Rendering',
    ]);
    expect(warningDetailsValue(warnings)).toBe(
      'Tall block is too tall for the page.\nPage 3 is too tall.\nA font was missing.',
    );
    for (const label of warnings.map(warningRowLabel)) {
      expect(label).not.toContain('too tall');
      expect(label).not.toMatch(/font/);
    }
  });
});
