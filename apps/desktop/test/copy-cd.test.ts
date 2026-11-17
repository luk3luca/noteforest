import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMenuTemplate } from '../src/main/menu-template';
import { withDetailsOptions } from '../src/renderer/src/lib/toast-details';
import { useShell } from '../src/renderer/src/state/shell';

const root = resolve(import.meta.dirname, '..');

async function sourceFor(modulePath: string): Promise<string> {
  return readFile(resolve(root, modulePath), 'utf8');
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Rows the C/D batch applies. Copy is asserted verbatim. */
const APPLIED_COPY: Record<string, readonly string[]> = {
  'src/renderer/src/lib/editability.ts': [
    'Read mode — switch to Edit to make changes',
    ' — Read mode',
    'Read mode — switch to Edit to make changes.',
  ],
  'src/renderer/src/lib/save-failure.ts': [
    'This note is open read-only.',
    'NoteForest can’t write to this folder.',
    'The disk is full.',
    'This file changed on disk.',
    'Another NoteForest window took over this note.',
    'The backup couldn’t be written.',
    'The note has a problem that stops the save.',
    'The note’s file is missing.',
    'The note couldn’t be saved.',
    'Reopen it read-write, or save a copy.',
    'Nothing was written. Reload, overwrite, or save a copy.',
    'Reopen it, or save a copy.',
  ],
  'src/renderer/src/lib/recovery.ts': [
    'This note comes from a newer NoteForest.',
    'This note is missing.',
    'This note couldn’t be read.',
    'Open it in the newer NoteForest. This version leaves the file unchanged.',
    'The folder is gone; it may have been moved or deleted. Nothing on disk was changed.',
    'The file couldn’t be read and was not changed. Restore a backup, or check Details.',
  ],
  'src/main/core-reasons.ts': [
    'That change isn’t available right now.',
    'That item no longer exists.',
    'That change isn’t available.',
    'The note can’t accept that change.',
    'That already exists.',
    'That move isn’t allowed here.',
    'That would create a loop.',
    'A note needs at least one chapter.',
    'This chapter still has blocks.',
    'A chapter needs at least one block.',
    'That content isn’t supported.',
    'That text is already linked.',
    'This image is still in use.',
    'This note is open read-only.',
    'A newer NoteForest wrote the file.',
    'The folder or the file is missing.',
    'The file isn’t valid NoteForest data.',
    'A newer NoteForest wrote this note.',
    'This note’s file is missing.',
    'This file couldn’t be read.',
    'This note couldn’t be read.',
  ],
  'src/renderer/src/shell/SaveFailureBanner.tsx': [
    'Autosave is paused.',
    'Couldn’t save a copy.',
    'Saved a copy.',
    'Couldn’t reveal the note.',
  ],
  'src/renderer/src/shell/StatusBar.tsx': ['No note open', '${info.idle} unused', 'Saving…'],
  'src/renderer/src/shell/RecoverySurface.tsx': [
    'No backup yet. Restore the note from another copy.',
    'No usable backup. Nothing on disk was changed.',
    'Newest first. Restoring makes a copy.',
    'No valid backup to restore.',
    'Restores a copy.',
    'Couldn’t restore a backup.',
    'Restored the newest backup.',
    'Still unavailable.',
    'Still unavailable. The folder is missing.',
    'The note opened.',
    'Couldn’t reveal the note.',
    'Close this tab. The folder is kept.',
    'Restore newest backup',
  ],
  'src/renderer/src/shell/DocumentStatusPanel.tsx': [
    'open in another window',
    'from a newer NoteForest',
    'the file couldn’t be read',
    'the file is invalid',
    'the file is missing',
    'This note opened read-only and your file is not being modified. Close the other NoteForest window; if none is open, quit and reopen NoteForest.',
    'Another NoteForest window left this note open. Take over only if no other window is using it.',
    'Lock taken over. You can edit now.',
    'Couldn’t reopen the note.',
    'Still read-only. Another window has it open.',
    'Reopened. You can edit now.',
    'Still read-only.',
    'Couldn’t take over the lock.',
  ],
  'src/renderer/src/markdown/markdown-save.ts': [
    'The editor isn’t available.',
    'Couldn’t reload the file.',
    'This file is no longer on disk. Nothing was written.',
  ],
  'src/renderer/src/markdown/MarkdownFileEditor.tsx': [
    'This file is open read-only.',
    'This file is no longer on disk. Copy what you need; saving is off.',
    'This file is too large to edit.',
    'Edit this file (⌘E)',
    'Can’t edit: ',
    'This file is no longer on disk. Copy anything you still need.',
  ],
  'src/renderer/src/export/export-flow.ts': [
    'Open a note before exporting a PDF.',
    'Page Edit wasn’t saved before the export.',
    'Couldn’t reveal the PDF.',
    'Couldn’t open the PDF.',
  ],
  'src/renderer/src/App.tsx': [
    'Some library folders couldn’t be read.',
    'Settings couldn’t be read. The defaults are in use.',
    'Note settings couldn’t be read. The defaults are in use.',
  ],
  'src/renderer/src/actions.ts': [
    'That command isn’t available right now.',
    'This note opened read-only. Your file was not changed.',
    'Couldn’t open the file.',
    'Page Edit wasn’t saved, so the library didn’t change.',
    'The note wasn’t saved, so the library didn’t change.',
    'Couldn’t reveal the library.',
    'Couldn’t create a chapter.',
    'The chapter wasn’t created.',
    'Couldn’t rename the document.',
    'Page Edit wasn’t saved.',
    'The note wasn’t saved.',
    'Page Edit wasn’t saved, so the tab stayed open.',
    'The note wasn’t saved, so the tab stayed open.',
    'That note is no longer available.',
    'Couldn’t reveal the file.',
    'Couldn’t reveal the note.',
    "label: 'Split at caret',",
    "description: 'Place the caret in a text block.'",
    "description: 'The previous block must be in the same chapter.'",
  ],
  'src/renderer/src/state/runtime.ts': [
    'This note is open read-only. It can’t be saved.',
    'The pending edit wasn’t saved.',
    'This note isn’t waiting on a stale lock.',
    'The note reopened read-only. The lock wasn’t taken over.',
    'That command isn’t available right now.',
    'This note is open read-only.',
    'This block no longer exists.',
    'The image wasn’t added.',
    'The image wasn’t replaced.',
    'The block wasn’t created.',
    'The branch wasn’t created.',
    'Place the caret in a text block first.',
    'The caret must be in the same block.',
    'The block wasn’t split.',
    'The block wasn’t merged.',
    'A block can’t link to itself.',
    'Couldn’t add the link.',
    'This reference is gone.',
    'Only a reference link can be removed here.',
    'The reference wasn’t removed.',
    'This anchor is gone.',
    'Open the editor first.',
    'Select the new text in the anchor’s block.',
    'Select one continuous range.',
    'This anchor has branches. Remove them first.',
    'This branch is gone.',
    'This branch has no anchor.',
    'The branch wasn’t removed.',
    'This anchor already exists. Repair or delete it instead.',
    'This anchor isn’t bound in the block any more.',
    'This anchor already exists.',
    'Select the unlinked range in its block first.',
    'The anchor wasn’t recreated. Select the unlinked range itself, or remove its link first.',
    'This reference couldn’t become the home.',
    'The target wasn’t moved here.',
    'The branch wasn’t turned into a reference.',
    'Couldn’t create a chapter.',
    'The chapter wasn’t created.',
    'The first block wasn’t added.',
    'This chapter is gone.',
    'This chapter still has blocks. Move or delete them first.',
    'The chapter wasn’t deleted.',
    'The block wasn’t moved.',
    'The block wasn’t indented.',
    'The block wasn’t outdented.',
    'The block wasn’t reordered.',
    'The block wasn’t deleted.',
    'This block has no parent branch.',
    'The block wasn’t detached.',
    'Undo failed.',
    'Redo failed.',
    'Kept as a reference from',
    'Select the text first.',
    'Select the formula first.',
    'Select the code first.',
  ],
  'src/main/library.ts': [
    'That folder doesn’t exist.',
    'That folder can’t be opened.',
    'That folder is inside a library. Choose another parent.',
    'A library already exists in that folder. Choose another parent.',
    'A library already exists in that parent. Choose another.',
    'Couldn’t create the library.',
    'That folder isn’t in this library. Choose a folder inside it.',
    'That folder name is reserved. Choose another name.',
    'That folder no longer exists. Choose another one.',
    'The library isn’t there any more. Locate it or open another.',
    'Couldn’t create the note.',
    'The note’s library is offline.',
    'This note isn’t open any more. Create a new one.',
    'This note isn’t open any more.',
    'Another window has this note open. Close it there and try again.',
    'The first block wasn’t created.',
    'The note couldn’t be opened.',
    'This note is open read-only; the image wasn’t added.',
    'The image couldn’t be read.',
    'That image can’t be copied.',
    'The source note couldn’t be read.',
    'There is no note to copy.',
    'That folder can’t be checked.',
    'A note already exists there. Choose a new folder.',
    'That folder isn’t writable.',
    'There is no valid backup for this note.',
    'Another window is writing a note in this folder.',
    'Couldn’t move “${preflight.title}” to the Trash. Nothing was changed.',
    'Another window is writing this note.',
    'Another window is writing this note. Nothing was moved.',
    'The note is still locked. Nothing was moved.',
    'Settings couldn’t be read. Nothing was written.',
    'Settings couldn’t be read. Reset them to the defaults.',
    'Settings weren’t saved.',
    'Settings weren’t reset.',
  ],
  'src/main/index.ts': [
    'NoteForest couldn’t save your changes.',
    'The window is still open. Retry, or cancel and keep working.',
    'Your changes weren’t saved.',
    'Save changes before closing?',
  ],
  'src/main/export-preflight.ts': [
    'The PDF was built from a different note.',
    'The PDF was built from an older version of the note.',
    'The print layout doesn’t match the page settings.',
    'The PDF page size doesn’t match the page settings.',
    'A block doesn’t fit the page.',
    'is too tall and would be cut.',
    'A broken anchor prints with a marker.',
    'An image couldn’t be read; the PDF shows a placeholder.',
    'An image is missing; the PDF shows a placeholder.',
    'The print step reported an error.',
    'A block is missing from the pages.',
    'The pages lost or duplicated content.',
    'The PDF has ${inspection.pageCount} pages; the layout has ${summary.pageCount}.',
    'Page ${page.pageNumber} has the wrong size.',
    'Page ${page.pageNumber} came out blank, so the export stopped.',
    'Page ${page.pageNumber} has no selectable text.',
    'The PDF has no selectable text.',
    'The PDF has ${inspection.missingGlyphCount} missing characters.',
  ],
  'src/main/markdown-file.ts': [
    'Couldn’t open the file.',
    'Couldn’t read the file.',
    'Couldn’t save the file.',
    'This file is no longer on disk. Nothing was written.',
  ],
  'src/main/backup-restore.ts': [
    'Choose a new folder. A restore never replaces the current note.',
    'A note already exists there. Choose a new folder.',
  ],
  'src/main/document-settings.ts': [
    'Note settings weren’t saved.',
    'That backup can’t be read.',
    'That backup has no settings.',
    'No valid backup was found.',
    'The backup couldn’t be read.',
  ],
  'src/main/markdown-backup.ts': ['The backup couldn’t be written.'],
  'src/main/menu-template.ts': [
    'New note',
    'Open note…',
    'New chapter',
    'Close tab',
    'Reopen closed tab',
    'Command palette…',
    'Toggle sidebar',
    'Fit width',
    'Fit page',
    'Focus branch',
    'Reset zoom',
    'Zoom in',
    'Zoom out',
    'Open Markdown…',
    'Close Window',
    'Keyboard shortcuts',
  ],
  'src/renderer/src/shell/SearchSection.tsx': ['No results', 'Refine the search'],
  'src/renderer/src/shell/Sidebar.tsx': [
    'Command palette (',
    'Open folder as library…',
    'New library…',
    'Remove from recents',
    'Open a note to see its outline.',
    'Note unavailable.',
    'This note couldn’t be read.',
  ],
  'src/renderer/src/shell/CanvasHeader.tsx': ['Export to PDF ('],
  'src/renderer/src/shell/ViewControls.tsx': ['Open a note to change the view'],
  'src/renderer/src/editor/views/BlockViews.tsx': ['Open document health to repair.'],
};

/** Rows the plan replaces; the old text must be gone from its module. */
const DELETED_COPY: Record<string, readonly string[]> = {
  'src/renderer/src/lib/editability.ts': ['switch to Edit to add content', 'Continuous Edit'],
  'src/renderer/src/lib/save-failure.ts': [
    'This document is open read-only.',
    'NoteForest cannot write to this folder.',
    'This file changed on disk outside NoteForest.',
    'Another copy of NoteForest took over this document.',
    'The safety backup could not be written.',
    'The document did not pass validation.',
    'The document file is missing.',
    'The document could not be saved.',
    'Reopen the document read-write',
    'Your changes were not written.',
    'Reopen the document to take a fresh lock',
  ],
  'src/renderer/src/lib/recovery.ts': ['This document was saved by a newer', 'document.json'],
  'src/renderer/src/shell/SaveFailureBanner.tsx': [
    '{saveFailureHint(failure.code)} Autosave is paused.',
    'title={runtime.packagePath}',
    'nf-save-failure-message',
    'Could not save a copy.',
    'Saved a copy and opened it.',
    'Could not reveal the document.',
  ],
  'src/renderer/src/shell/StatusBar.tsx': ['No document open', 'Writing atomically…', '} idle`'],
  'src/renderer/src/shell/RecoverySurface.tsx': [
    'NoteForest has no backup for this document yet',
    'Every backup listed below is invalid',
    'restoring always creates a new copy',
    'Restore newest valid backup',
    'There is no valid backup to restore.',
    'Restore the newest valid backup as a new copy.',
    'Could not restore a backup.',
    'Restored the newest backup as a new copy and opened it.',
    'Still unavailable: ',
    'The document opened.',
    'Could not reveal the document.',
    'The folder on disk is not deleted.',
  ],
  'src/renderer/src/shell/DocumentStatusPanel.tsx': [
    'another session holds the lock',
    'written by a newer NoteForest version',
    'the package could not be read',
    'the package is invalid',
    'the package is missing',
    'This document opened read-only.',
    'but its heartbeat is stale',
    'This document is now editable.',
    'Could not reopen the document.',
    'Still read-only: another NoteForest session holds the lock.',
    'Rechecked the document. It is still read-only.',
    'Could not take over the lock.',
  ],
  'src/renderer/src/markdown/markdown-save.ts': [
    'The Markdown editor is not available.',
    'Could not reload the Markdown file.',
  ],
  'src/renderer/src/markdown/MarkdownFileEditor.tsx': [
    'This Markdown file is open read-only.',
    'This Markdown file is no longer on disk.',
    'This Markdown file is too large to edit.',
    'Edit this Markdown file',
    'Edit unavailable:',
    'NoteForest will not recreate it',
  ],
  'src/renderer/src/export/export-flow.ts': [
    'Open a document before exporting a PDF.',
    'Could not commit the Page Edit block before the PDF export.',
    'Could not reveal the PDF.',
    'Could not open the PDF.',
  ],
  'src/renderer/src/App.tsx': [
    'Library warnings',
    'Settings could not be read.',
    'Per-document settings could not be read.',
  ],
  'src/renderer/src/actions.ts': [
    'The command was rejected.',
    'This document opened read-only. Your file was not modified.',
    'This document is open read-only and cannot be renamed.',
    'Could not open the Markdown file.',
    'Could not commit a Page Edit block before switching libraries.',
    'Could not save before switching libraries.',
    'Could not reveal the library.',
    'Could not create a chapter.',
    'The chapter was created without an ID.',
    'Could not rename the document.',
    'Could not commit the Page Edit block.',
    'Save failed.',
    'Could not commit the Page Edit block before closing the tab.',
    'Could not save before closing the tab.',
    'That document is no longer available.',
    'Could not reveal the Markdown file.',
    'Could not reveal the document.',
    'Split at caret — ${splitCheck.reason}',
    'Merge with previous — ${mergeCheck.reason}',
  ],
  'src/renderer/src/state/runtime.ts': [
    'This note is open read-only; it cannot be saved.',
    'Could not commit the pending edit.',
    'This document is not waiting on a stale lock.',
    'The document reopened read-only;',
    'This document is open read-only.',
    'The block no longer exists.',
    'Could not record the image asset.',
    'Could not insert the image.',
    'Could not replace the image.',
    'Could not create the block.',
    'Could not branch from the selection.',
    'Place the caret inside a text block, without a selection, first.',
    'The caret is in a different block.',
    'Could not split the block.',
    'Could not merge the block.',
    'A block cannot link to itself.',
    'Could not link the block.',
    'This reference no longer exists.',
    'Only reference links can be removed here.',
    'Could not remove the reference.',
    'This anchor no longer exists.',
    'Open the editor before relinking',
    'Select the replacement range in the anchor’s own block.',
    'Select one continuous text range.',
    'Only an idle anchor can be removed here.',
    'This branch no longer exists.',
    'This branch is not anchored.',
    'Could not delete the branch.',
    'That anchor record exists',
    'That block no longer exists.',
    'That anchor ID is no longer bound',
    'That anchor record already exists.',
    'Open the editor before recreating',
    'Select the orphaned range in its own block first.',
    'Could not recreate the anchor.',
    'Could not make this reference the home.',
    'Could not move the target here.',
    'Could not demote this branch to a reference.',
    'Could not add the first block.',
    'This chapter no longer exists.',
    'This chapter still has top-level blocks.',
    'Could not delete the chapter.',
    'Could not move the block.',
    'Could not indent the block.',
    'Could not outdent the block.',
    'Could not reorder the block.',
    'Could not delete the block.',
    'This block has no incoming branch.',
    'Could not detach the branch.',
    'Kept as reference from',
  ],
  'src/main/library.ts': [
    'does not exist or is not a directory',
    'The folder is not readable',
    'is already a library inside that folder',
    'would be inside the library',
    'is already a library inside that parent',
    'is not inside the active library',
    'is reserved for note assets or backups',
    'The active library was not found',
    'Could not create the draft',
    'The library this note was created in is not available',
    'This draft is no longer open.',
    'The note folder is locked by another NoteForest session',
    'Could not create the first block',
    'The new document could not be opened.',
    'This document is open read-only; the image was not copied.',
    'Could not read the image',
    'The copied image asset id is malformed.',
    'The source document could not be read',
    'There is no document to copy.',
    'Could not inspect the restore location',
    'A document already exists at that location.',
    'The chosen folder is not writable',
    'NoteForest has no valid backup for this document.',
    'It was not moved.',
    'The folder was not changed.',
    'Could not release the document lock',
    'settings.json could not be read',
    'settings.json is corrupt',
    'Could not save settings:',
    'Could not reset settings:',
    'Taking over is not allowed while its heartbeat is current.',
  ],
  'src/main/index.ts': [
    'could not save your changes before',
    'Could not save your changes.',
    'Save changes to “',
    'Invalid document id.',
  ],
  'src/main/export-preflight.ts': [
    'The print run measured document',
    'The print run measured revision',
    'PageTheme',
    'The print run reports a',
    'Block ${defectLabel',
    'overflows the resolved content area',
    'overflows after rendering',
    'has a broken or ambiguous anchor',
    'could not be decoded',
    'is missing from the package',
    'logged an error',
    'was not placed on any derived page',
    'lost or duplicated content:',
    'the paginator derived',
    'PDF page ${page.pageNumber} is',
    'The paginator produced an empty page',
    '(no text, image, or vector content)',
    'has no extractable text; the model page',
    'The produced PDF has no extractable text.',
    'replacement glyph(s)',
  ],
  'src/main/markdown-file.ts': [
    'Could not open the Markdown file',
    'Could not read the Markdown file',
    'Could not write the Markdown file',
    'Could not save the Markdown file',
  ],
  'src/main/backup-restore.ts': [
    'Choose a new folder; a restored copy cannot replace the current document.',
  ],
  'src/main/document-settings.ts': [
    'Could not save document settings',
    'The backup is not valid JSON',
    'The backup has no document settings entry list.',
    'No valid document settings backup was found.',
    'Could not read the backup',
  ],
  'src/main/markdown-backup.ts': ['Could not write the Markdown backup'],
  'src/main/menu-template.ts': [
    'New Document',
    'Open Document…',
    'New Chapter',
    'Close Tab',
    'Reopen Closed Tab',
    'Command Palette…',
    'Toggle Sidebar',
    'Fit Width',
    'Focus Branch',
    'Actual Size',
    'Zoom In',
    'Zoom Out',
  ],
  'src/renderer/src/shell/SearchSection.tsx': ["? '0'", 'data-search-empty="true"'],
  'src/renderer/src/shell/Sidebar.tsx': [
    'Open Folder as Library…',
    'New Library…',
    'Remove from Recent',
    'Open a document to see its outline.',
    'Document unavailable.',
    'The package could not be read.',
  ],
  'src/renderer/src/shell/CanvasHeader.tsx': ['Export this document to PDF'],
  'src/renderer/src/shell/ViewControls.tsx': ['Open a document to change the view'],
  'src/renderer/src/editor/views/BlockViews.tsx': [
    'Open document health to repair; the branch and target stay.',
    'anchorHealthReason',
  ],
};

describe('C/D copy', () => {
  it('applies every C/D row verbatim', async () => {
    const missing: string[] = [];
    for (const [modulePath, copies] of Object.entries(APPLIED_COPY)) {
      const source = normalize(await sourceFor(modulePath));
      for (const copy of copies) {
        if (!source.includes(normalize(copy))) missing.push(`${modulePath}: ${copy}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('removes every replaced C/D row', async () => {
    const present: string[] = [];
    for (const [modulePath, copies] of Object.entries(DELETED_COPY)) {
      const source = normalize(await sourceFor(modulePath));
      for (const copy of copies) {
        if (source.includes(normalize(copy))) present.push(`${modulePath}: ${copy}`);
      }
    }
    expect(present).toEqual([]);
  });

  it('keeps the find v3 hierarchy and the shared whole-word toggle', async () => {
    const source = await sourceFor('src/renderer/src/shell/SearchSection.tsx');
    // Item 6 is a label alignment only: the chapter rule, the per-chapter
    // counts, the shared `.nf-result-row` cards and the `ab` toggle stay.
    expect(source).toContain('data-search-chapter-count');
    expect(source).toContain('nf-result-row nf-search-row');
    expect(source).toContain('data-search-whole-word="true"');
    expect(source).toContain('Refine the search');
    // Zero says `No results` in the count and does not repeat an empty line.
    expect(source).toContain("? 'No results'");
  });

  it('keeps the sidebar palette button an icon plus ⌘K with the new label', async () => {
    const source = await sourceFor('src/renderer/src/shell/Sidebar.tsx');
    // The chord itself is never written here: it comes from the shortcut
    // catalogue (B1), which is what the label prints.
    expect(source).toContain('aria-label={`Command palette (${shortcutHint(\'command-palette\')})`}');
    expect(source).toContain('title={`Command palette (${shortcutHint(\'command-palette\')})`}');
    expect(source).not.toContain('<span>Search</span>');
  });
});

/**
 * The large C/D modules also carry internal diagnostics (OS errors, log lines,
 * persisted JSON). The guard therefore reads their **user copy**: a string that
 * is a sentence (it contains a space and ends with punctuation). Diagnostics and
 * `[noteforest]` log lines are not copy and never reach a dialog or a toast.
 */
const SENTENCE_MODULES = [
  'src/main/library.ts',
  'src/main/index.ts',
  'src/main/export-preflight.ts',
  'src/main/markdown-file.ts',
  'src/main/backup-restore.ts',
  'src/main/core-reasons.ts',
  'src/main/unused-images.ts',
  'src/main/document-settings.ts',
  'src/main/markdown-backup.ts',
  'src/renderer/src/state/runtime.ts',
  'src/renderer/src/actions.ts',
  'src/renderer/src/App.tsx',
];

/** Banned words, empty allowlist (copy-audit §2 rule 3, dialogs.md §4). */
const BANNED_WORDS = [
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

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sentenceLiterals(source: string): string[] {
  const text = stripComments(source);
  const found: string[] = [];
  const candidates: string[] = [];
  for (const match of text.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
    const value = match[1] ?? match[2] ?? '';
    if (/[A-Za-z]/.test(value)) candidates.push(value);
  }
  for (const match of text.matchAll(/`([^`]*)`/g)) {
    const value = match[1] ?? '';
    if (/[A-Za-z]/.test(value)) candidates.push(value);
  }
  for (const value of candidates) {
    const sentence = normalize(value);
    if (!/\s/.test(sentence)) continue;
    if (sentence.startsWith('[noteforest]')) continue;
    if (!/[.?!…]$/.test(sentence)) continue;
    found.push(sentence);
  }
  return found;
}

describe('banned words in the C/D modules', () => {
  it('keeps every sentence in the large modules free of an engine word', async () => {
    const violations: string[] = [];
    for (const modulePath of SENTENCE_MODULES) {
      for (const value of sentenceLiterals(await sourceFor(modulePath))) {
        const lower = value.toLowerCase();
        for (const word of BANNED_WORDS) {
          const pattern = new RegExp(
            `(^|[^a-z0-9])${word.replace(' ', '\\s+')}([^a-z0-9]|$)`,
          );
          if (pattern.test(lower)) violations.push(`${modulePath}: ${word}: ${value}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the applied C/D rows free of an engine word', () => {
    const violations: string[] = [];
    for (const [modulePath, copies] of Object.entries(APPLIED_COPY)) {
      for (const value of copies) {
        const lower = normalize(value).toLowerCase();
        for (const word of BANNED_WORDS) {
          const pattern = new RegExp(
            `(^|[^a-z0-9])${word.replace(' ', '\\s+')}([^a-z0-9]|$)`,
          );
          if (pattern.test(lower)) violations.push(`${modulePath}: ${word}: ${value}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the repairs inside Details only', async () => {
    // C-16: no engine word and no id may reach a preflight/warning row; the
    // block title stays on the warning record instead.
    const source = await sourceFor('src/main/export-preflight.ts');
    expect(source).toContain("message: 'A block doesn’t fit the page.',");
    expect(source).not.toContain('defectLabel');
    // C-08.15: PID/host/session/heartbeat live under the Lock details disclosure.
    const panel = await sourceFor('src/renderer/src/shell/DocumentStatusPanel.tsx');
    expect(panel).toContain('<summary>Lock details</summary>');
  });
});

describe('native menu labels', () => {
  const template = buildMenuTemplate({
    isMac: true,
    send: () => undefined,
    getWindow: () => null,
  });

  function submenu(label: string): Electron.MenuItemConstructorOptions[] {
    const top = template.find(
      (entry) => entry.label === label || (entry.role === 'help' && label === 'Help'),
    );
    expect(top, `${label} menu exists`).toBeDefined();
    return (top?.submenu ?? []) as Electron.MenuItemConstructorOptions[];
  }

  function labels(menuLabel: string): string[] {
    return submenu(menuLabel)
      .filter((entry) => entry.type !== 'separator' && typeof entry.label === 'string')
      .map((entry) => entry.label as string);
  }

  it('uses sentence case in every app menu', () => {
    expect(labels('File')).toEqual([
      'New note',
      'Open note…',
      'Open Markdown…',
      'New chapter',
      'Save',
      'Export PDF…',
      'Close tab',
      'Reopen closed tab',
      'Close Window',
    ]);
    expect(labels('View')).toEqual([
      'Command palette…',
      'Toggle sidebar',
      'Fit width',
      'Fit page',
      'Focus branch',
      'Reset zoom',
      'Zoom in',
      'Zoom out',
    ]);
    expect(labels('Edit')).toEqual([
      'Undo',
      'Redo',
      'Find…',
      'Find Next',
      'Find Previous',
    ]);
    expect(labels('Help')).toEqual(['Keyboard shortcuts']);
  });

  it('keeps every id and accelerator', () => {
    const all = template.flatMap((entry) =>
      Array.isArray(entry.submenu) ? entry.submenu : [],
    ) as Electron.MenuItemConstructorOptions[];
    const accelerators = new Map(
      all
        .filter((entry) => typeof entry.accelerator === 'string')
        .map((entry) => [entry.accelerator, entry.label ?? entry.role]),
    );
    expect(accelerators.get('CmdOrCtrl+N')).toBe('New note');
    expect(accelerators.get('CmdOrCtrl+P')).toBe('Export PDF…');
    expect(accelerators.get('CmdOrCtrl+W')).toBe('Close tab');
    expect(accelerators.get('CmdOrCtrl+Shift+T')).toBe('Reopen closed tab');
    expect(accelerators.get('CmdOrCtrl+K')).toBe('Command palette…');
    expect(accelerators.get('CmdOrCtrl+\\')).toBe('Toggle sidebar');
    const ids = all.map((entry) => entry.id).filter((id) => id !== undefined);
    expect(ids).toEqual([
      'menu-export-pdf',
      'menu-undo',
      'menu-redo',
      'menu-find',
      'menu-find-next',
      'menu-find-previous',
      'menu-fit-page',
      'menu-keyboard-shortcuts',
    ]);
    // Fit page is the menu-only fit: no accelerator at all.
    expect(accelerators.has('CmdOrCtrl+Shift+0')).toBe(true);
    const allItems = all;
    const fitPage = allItems.find((entry) => entry.id === 'menu-fit-page');
    expect(fitPage?.accelerator).toBeUndefined();
  });
});

describe('toast Details action', () => {
  it('adds exactly one Details action that opens D25', () => {
    useShell.setState({ dialog: null });
    const options = withDetailsOptions('/library/note/document.json');
    expect(options?.action).toMatchObject({ label: 'Details' });
    const action = options?.action;
    if (action === null || typeof action !== 'object') return;
    (action as { onClick: () => void }).onClick();
    expect(useShell.getState().dialog).toEqual({
      kind: 'details',
      value: '/library/note/document.json',
    });
    useShell.setState({ dialog: null });
  });

  it('adds no action when there is no technical value', () => {
    expect(withDetailsOptions(undefined)).toBeUndefined();
    expect(withDetailsOptions('')).toBeUndefined();
    expect(withDetailsOptions(undefined, { duration: 3000 })).toEqual({ duration: 3000 });
  });
});
