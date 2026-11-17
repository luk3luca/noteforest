import {
  Button,
  Input,
  ListBox,
  ListBoxItem,
  TextArea,
} from 'react-aria-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShell } from '../state/shell';
import { registerRuntime, useRuntime } from '../state/registry';
import {
  activeRuntime,
  chooseLibraryParent,
  closeTab,
  confirmRemoveMissingDocument,
  confirmTrashDocument,
  createLibrary,
  createVaultFolder,
  moveVaultEntryTo,
  renameChapter,
  renameDocument,
  renameVaultFolder,
  report,
} from '../actions';
import { anchorQuote, blockTitle, chapterIdOf, externalReferenceParents, subtreeIds } from '../lib/tree';
import {
  formulaNodeAt,
  formulaTermBinding,
  formulaTermSelection,
  formulaTermSelector,
  type FormulaTermSelection,
} from '../lib/anchor-selection';
import { overwriteConfirmation } from '../lib/save-failure';
import {
  reloadMarkdownFromDisk,
  overwriteMarkdownFile,
} from '../markdown/markdown-save';
import { backupMetadataLine } from '../lib/backup-restore';
import {
  UNUSED_IMAGES_CONFIRM_LIMIT,
  unusedImageViews,
  unusedImagesMoreLine,
  unusedImagesSummaryLine,
  unusedImagesTotalBytes,
  type UnusedImageView,
} from '../lib/unused-images';
import { cleanUnusedImages } from '../lib/unused-images-cleanup';
import type { BackupCandidateView, TrashPreflight } from '../../../shared/api';
import type { DocumentRuntime } from '../state/runtime';
import { Details, DetailsDialog } from './Details';
import { errorToast } from '../lib/toast-details';
import { Frame } from './DialogFrame';
import { HealthRepairDialog } from './HealthRepairDialog';
import { PageJumpDialog } from './PageJumpDialog';
import { SettingsDialog } from './SettingsDialog';
import { TableSizeDialog } from './TableSizeDialog';

function NewLibraryDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [name, setName] = useState('NoteForest');
  const [parentPath, setParentPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseParent = async (): Promise<void> => {
    const chosen = await chooseLibraryParent();
    if (chosen !== null) {
      setParentPath(chosen);
      setError(null);
    }
  };

  const create = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await createLibrary(name, parentPath);
    setBusy(false);
    if (ok) onClose();
    else setError('Couldn’t create the library. Check the name and the parent folder.');
  };

  return (
    <Frame
      title="New library"
      description="Create a folder for a new set of notes."
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-primary"
            data-new-library-create="true"
            isDisabled={busy || name.trim().length === 0 || parentPath.length === 0}
            onPress={() => void create()}
          >
            Create library
          </Button>
        </>
      }
    >
      <div data-new-library-dialog="true">
        <label className="nf-field">
          <span className="nf-field-label">Name</span>
          <Input
            className="nf-input"
            data-new-library-name="true"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            autoFocus
          />
        </label>
        <div className="nf-new-library-parent">
          <Button
            className="nf-button"
            data-new-library-choose-parent="true"
            onPress={() => void chooseParent()}
          >
            Choose parent folder…
          </Button>
          <p className="nf-settings-help" data-new-library-parent="true">
            {parentPath.length === 0 ? 'No parent folder chosen.' : parentPath}
          </p>
        </div>
        {error === null ? null : (
          <p className="nf-field-error" role="alert" data-new-library-error="true">
            {error}
          </p>
        )}
      </div>
    </Frame>
  );
}

/**
 * Move to Trash confirmation (L4). The title and path are named explicitly, the
 * primary action is destructive, and Cancel is focused by default. A missing
 * package gets the cleanup-only Remove from recents variant; a newer-schema
 * package gets a stronger warning; a stale lock is cleared only here. Phase 3
 * adds the plain-folder and `.md` guest-file variants.
 */
function TrashDocumentDialog({
  preflight,
  onClose,
}: {
  preflight: TrashPreflight;
  onClose: () => void;
}): JSX.Element {
  const missing = preflight.status === 'missing';
  const folder = preflight.kind === 'folder';
  const markdown = preflight.kind === 'markdown';
  const contained = preflight.contained;
  const title = missing
    ? 'Remove from recents?'
    : folder
      ? 'Move folder to Trash?'
      : markdown
        ? 'Move file to Trash?'
        : 'Move to Trash?';
  const description = missing
    ? 'This entry has no note folder. It is removed from the list; no files are deleted.'
    : folder
      ? 'The folder and everything inside it move to the Trash. You can restore them from there.'
      : markdown
        ? 'The file moves to the Trash. You can restore it from there.'
        : 'The note moves to the Trash. You can restore it from there.';
  return (
    <Frame
      title={title}
      description={description}
      size="records"
      focusSecondary
      actions={
        <>
          <Button className="nf-button" data-dialog-secondary="true" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-danger"
            data-trash-confirm="true"
            onPress={() => {
              onClose();
              if (missing) void confirmRemoveMissingDocument(preflight);
              else void confirmTrashDocument(preflight);
            }}
          >
            {missing ? 'Remove' : 'Move to Trash'}
          </Button>
        </>
      }
    >
      <div
        className="nf-trash-summary"
        data-trash-dialog="true"
        data-trash-status={preflight.status}
        data-trash-kind={preflight.kind ?? 'note'}
      >
        <p className="nf-dialog-text" data-trash-title="true">
          “{preflight.title}”
        </p>
        {folder && contained !== undefined ? (
          <p className="nf-settings-help" data-trash-contained="true">
            {contained.notes} {contained.notes === 1 ? 'note' : 'notes'}, {contained.markdown}{' '}
            Markdown {contained.markdown === 1 ? 'file' : 'files'}, and {contained.folders}{' '}
            {contained.folders === 1 ? 'folder' : 'folders'} inside.
          </p>
        ) : null}
        {preflight.status === 'newer-schema' ? (
          <p className="nf-field-error" data-trash-newer-schema="true" role="alert">
            This note comes from a newer NoteForest. Trashing it is safe, but this version
            can’t read it.
          </p>
        ) : null}
        {preflight.liveLock ? (
          <p className="nf-field-error" data-trash-live-lock="true" role="alert">
            Another window is writing this note. Close it there and try again.
          </p>
        ) : null}
        {preflight.lock !== null ? (
          <p className="nf-settings-help" data-trash-stale-lock="true">
            A lock from an earlier session is cleared first.
          </p>
        ) : null}
        <Details value={preflight.packagePath} />
      </div>
    </Frame>
  );
}

/**
 * Unused images (DR1b): one confirm that moves the bytes to the OS Trash.
 *
 * The dialog is the preview: it re-reads the backup scan and re-plans on open,
 * so the count and the total it states are current. `Remove` moves the files
 * first and removes each record after it; a failure stops the pass and the
 * toast names how many images were handled. The files are recoverable from the
 * Trash, which is why the button is outlined danger and Cancel has focus.
 */
function UnusedImagesDialog({
  runtime,
  packagePath,
  assetIds,
  onClose,
}: {
  runtime: DocumentRuntime;
  packagePath: string;
  assetIds: string[];
  onClose: () => void;
}): JSX.Element {
  type PlanState =
    | { status: 'loading' }
    | { status: 'ready'; items: UnusedImageView[]; totalBytes: number }
    | { status: 'error'; message: string; details?: string };

  const [state, setState] = useState<PlanState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const load = async (): Promise<void> => {
      const scan = await window.noteforest.backupAssetIds(packagePath);
      if (cancelled) return;
      if (!scan.ok) {
        setState({ status: 'error', message: scan.message, details: scan.details });
        return;
      }
      const requested = new Set(assetIds);
      const items = unusedImageViews(runtime.document, scan.assetIds).filter((item) =>
        requested.has(item.id),
      );
      setState({ status: 'ready', items, totalBytes: unusedImagesTotalBytes(items) });
    };
    void load().catch(() => {
      if (!cancelled) {
        setState({
          status: 'error',
          message: 'Couldn’t read the list of unused images.',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [packagePath, assetIds, runtime]);

  const remove = async (): Promise<void> => {
    if (state.status !== 'ready' || state.items.length === 0 || busy) return;
    setBusy(true);
    try {
      const result = await cleanUnusedImages(
        state.items.map((item) => item.id),
        {
          backupAssetIds: () => window.noteforest.backupAssetIds(packagePath),
          document: () => runtime.document,
          trash: (assetId) => window.noteforest.trashUnusedImage(packagePath, assetId),
          removeRecord: (assetId) => runtime.removeUnusedAsset(assetId),
        },
      );
      // Persist the record removals now: the section is derived from the saved
      // document after a reload, and a slow autosave would leave it stale.
      if (result.moved.length > 0) await runtime.flush();
      onClose();
      if (result.ok) {
        if (result.message.length > 0) {
          if (result.moved.length > 0) toast.success(result.message);
          else toast.info(result.message);
        }
        return;
      }
      errorToast(result.message, result.details);
    } catch {
      // A rejected platform call after a partial pass: the handled count is in
      // the section, which re-plans from the canonical document.
      onClose();
      errorToast('The unused images couldn’t be cleaned up.');
    } finally {
      setBusy(false);
    }
  };

  const removable = state.status === 'ready' && state.items.length > 0;
  const listed = state.status === 'ready' ? state.items.slice(0, UNUSED_IMAGES_CONFIRM_LIMIT) : [];
  const hidden = state.status === 'ready' ? state.items.length - listed.length : 0;
  const more = unusedImagesMoreLine(hidden);

  return (
    <Frame
      title="Clean up unused images?"
      description="The files move to the Trash. You can restore them from there."
      size="records"
      focusSecondary
      actions={
        <>
          {/* The safe exit is always the same DOM node, so the frame's
              secondary focus survives the scan and the footer never reorders. */}
          <Button
            className="nf-button"
            data-dialog-secondary="true"
            isDisabled={busy}
            onPress={onClose}
          >
            {removable || busy ? 'Cancel' : 'Close'}
          </Button>
          {removable || busy ? (
            <Button
              className="nf-button nf-button-danger"
              data-unused-images-confirm="true"
              isDisabled={busy}
              onPress={() => void remove()}
            >
              {busy ? 'Removing…' : 'Remove'}
            </Button>
          ) : null}
        </>
      }
    >
      {state.status === 'loading' ? (
        <p className="nf-dialog-text" data-unused-images-loading="true">
          Checking unused images…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <>
          <p className="nf-dialog-text nf-dialog-error" role="alert" data-unused-images-error="true">
            {state.message}
          </p>
          {state.details === undefined ? null : <Details value={state.details} />}
        </>
      ) : null}

      {state.status === 'ready' && !removable ? (
        <p className="nf-dialog-text" data-unused-images-empty="true">
          These images are in use again. Nothing was removed.
        </p>
      ) : null}

      {state.status === 'ready' && removable ? (
        <>
          <p className="nf-dialog-text" data-unused-images-summary="true">
            {unusedImagesSummaryLine(state.items.length, state.totalBytes)}
          </p>
          <ul className="nf-unused-images-list">
            {listed.map((item) => (
              <li
                key={item.id}
                className="nf-unused-images-item"
                data-unused-images-item={item.id}
              >
                <span className="nf-unused-images-name" title={item.name}>
                  {item.name}
                </span>
                <span className="nf-unused-images-meta">
                  {item.size.length === 0 ? item.mime : `${item.size} · ${item.mime}`}
                </span>
              </li>
            ))}
          </ul>
          {more.length === 0 ? null : (
            <p className="nf-dialog-note" data-unused-images-more="true">
              {more}
            </p>
          )}
        </>
      ) : null}
    </Frame>
  );
}

/**
 * New folder inside one library folder (phase 3). The parent path is named
 * explicitly; the main process validates the name and the library membership.
 */
function NewFolderDialog({
  parentPath,
  onClose,
}: {
  parentPath: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState('New folder');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await createVaultFolder(parentPath, name);
    setBusy(false);
    if (ok) onClose();
    else setError('Couldn’t create the folder. Check the name and try again.');
  };

  return (
    <Frame
      title="New folder"
      description={`Inside ${parentPath}`}
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-primary"
            data-new-folder-create="true"
            isDisabled={busy || name.trim().length === 0}
            onPress={() => void create()}
          >
            Create folder
          </Button>
        </>
      }
    >
      <div data-new-folder-dialog="true">
        <label className="nf-field">
          <span className="nf-field-label">Name</span>
          <Input
            className="nf-input"
            data-new-folder-name="true"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void create();
              }
            }}
          />
        </label>
        {error === null ? null : (
          <p className="nf-field-error" role="alert" data-new-folder-error="true">
            {error}
          </p>
        )}
      </div>
    </Frame>
  );
}

/** Rename one library folder in place; descendants move with it. */
function RenameFolderDialog({
  folderPath,
  initial,
  onClose,
}: {
  folderPath: string;
  initial: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await renameVaultFolder(folderPath, name);
    setBusy(false);
    if (ok) onClose();
    else setError('Couldn’t rename the folder. Check the name and try again.');
  };

  return (
    <Frame
      title="Rename folder"
      description={folderPath}
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-primary"
            data-rename-folder-save="true"
            isDisabled={busy || name.trim().length === 0}
            onPress={() => void save()}
          >
            Rename
          </Button>
        </>
      }
    >
      <div data-rename-folder-dialog="true">
        <label className="nf-field">
          <span className="nf-field-label">Name</span>
          <Input
            className="nf-input"
            data-rename-folder-name="true"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              }
            }}
          />
        </label>
        {error === null ? null : (
          <p className="nf-field-error" role="alert" data-rename-folder-error="true">
            {error}
          </p>
        )}
      </div>
    </Frame>
  );
}

interface MoveTarget {
  path: string;
  label: string;
  depth: number;
}

/**
 * Destination folders for one move: the library root plus every folder except
 * the moved folder itself, its descendants, and its current parent (a no-op).
 */
function moveTargets(
  library: ReturnType<typeof useShell.getState>['library'],
  sourcePath: string,
  entryKind: 'folder' | 'note' | 'markdown',
): MoveTarget[] {
  if (library === null || library.libraryPath.length === 0) return [];
  const targets: MoveTarget[] = [
    { path: library.libraryPath, label: library.libraryName, depth: 0 },
  ];
  const currentParent = sourcePath.slice(0, sourcePath.lastIndexOf('/'));
  const walk = (nodes: typeof library.tree, depth: number): void => {
    for (const node of nodes) {
      if (node.kind !== 'folder') continue;
      const insideSource =
        entryKind === 'folder' &&
        (node.path === sourcePath || node.path.startsWith(`${sourcePath}/`));
      if (!insideSource && node.path !== currentParent) {
        targets.push({ path: node.path, label: node.name, depth });
      }
      walk(node.children, depth + 1);
    }
  };
  walk(library.tree, 1);
  // The root is the current parent when the entry is a direct child: moving
  // "here" is a no-op, so it is not offered.
  return targets.filter((target) => target.path !== currentParent);
}

/**
 * Move one note, Markdown file, or folder to another library folder. A dialog
 * (not drag-and-drop) keeps the operation keyboard reachable and testable; the
 * main process re-checks the destination and the library boundary.
 */
function MoveVaultEntryDialog({
  path,
  name,
  entryKind,
  onClose,
}: {
  path: string;
  name: string;
  entryKind: 'folder' | 'note' | 'markdown';
  onClose: () => void;
}): JSX.Element {
  const library = useShell((state) => state.library);
  const targets = useMemo(
    () => moveTargets(library, path, entryKind),
    [library, path, entryKind],
  );
  const [target, setTarget] = useState(targets[0]?.path ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const move = async (): Promise<void> => {
    if (busy || target.length === 0) return;
    setBusy(true);
    setError(null);
    const ok = await moveVaultEntryTo(path, target);
    setBusy(false);
    if (ok) onClose();
    else setError('Couldn’t move the entry. Check the destination and try again.');
  };

  return (
    <Frame
      title={`Move “${name}”`}
      description="Choose a folder in this library."
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-primary"
            data-move-confirm="true"
            isDisabled={busy || target.length === 0 || targets.length === 0}
            onPress={() => void move()}
          >
            Move
          </Button>
        </>
      }
    >
      <div data-move-dialog="true">
        {targets.length === 0 ? (
          <p className="nf-empty-line">There is no other folder to move this into.</p>
        ) : (
          <div className="nf-move-targets" role="radiogroup" aria-label="Destination folder">
            {targets.map((folder) => (
              <label
                key={folder.path}
                className="nf-move-target"
                data-move-target={folder.path}
                style={{ paddingInlineStart: 8 + folder.depth * 14 }}
              >
                <input
                  type="radio"
                  name="nf-move-target"
                  value={folder.path}
                  checked={target === folder.path}
                  onChange={() => setTarget(folder.path)}
                />
                <span>{folder.label}</span>
              </label>
            ))}
          </div>
        )}
        {error === null ? null : (
          <p className="nf-field-error" role="alert" data-move-error="true">
            {error}
          </p>
        )}
      </div>
    </Frame>
  );
}



export function Dialogs(): JSX.Element | null {
  const dialog = useShell((state) => state.dialog);
  const close = useShell((state) => state.closeDialog);
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);

  if (dialog === null) return null;
  // Settings is app-level (S2-1): it opens with zero documents, before the
  // per-document dialog gate. Document-only sections are disabled inside.
  if (dialog.kind === 'settings') {
    return <SettingsDialog onClose={close} initialPage={dialog.page} />;
  }
  // D25: the one-line technical surface for a toast (opened by the toast host,
  // batch C). It is a Frame dialog like every other.
  if (dialog.kind === 'details') {
    return <DetailsDialog value={dialog.value} onClose={close} />;
  }
  // Library creation is app-level and works with no document open.
  if (dialog.kind === 'new-library') {
    return <NewLibraryDialog onClose={close} />;
  }
  // Move to Trash targets a library row and may be opened for a closed or
  // missing package; it must not require an active document.
  if (dialog.kind === 'trash-document') {
    return <TrashDocumentDialog preflight={dialog.preflight} onClose={close} />;
  }
  // Vault entries (folders, guest files) are app-level: these dialogs work with
  // no document open and never need a runtime.
  if (dialog.kind === 'new-folder') {
    return <NewFolderDialog parentPath={dialog.parentPath} onClose={close} />;
  }
  if (dialog.kind === 'rename-folder') {
    return (
      <RenameFolderDialog
        folderPath={dialog.path}
        initial={dialog.name}
        onClose={close}
      />
    );
  }
  if (dialog.kind === 'move-vault-entry') {
    return (
      <MoveVaultEntryDialog
        path={dialog.path}
        name={dialog.name}
        entryKind={dialog.entryKind}
        onClose={close}
      />
    );
  }
  // A Markdown guest file has no runtime. A dirty close asks Save / Don't Save
  // / Cancel, exactly like a note; Save runs the atomic write before closing.
  if (dialog.kind === 'markdown-close') {
    const tab = useShell.getState().tabs.find((item) => item.packagePath === dialog.path);
    return (
      <Frame
        title="Close file?"
        description="This file has unsaved changes."
        focusSecondary
        actions={
          <>
            <Button className="nf-button" data-dialog-secondary="true" onPress={close}>Cancel</Button>
            <Button
              className="nf-button nf-button-danger"
              data-markdown-close-discard="true"
              onPress={() => {
                close();
                void closeTab(dialog.path, { force: true, save: false });
              }}
            >
              Don’t Save
            </Button>
            <Button
              className="nf-button nf-button-primary"
              data-markdown-close-save="true"
              onPress={() => {
                close();
                void closeTab(dialog.path, { force: true, save: true });
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <p className="nf-dialog-text">{tab?.title ?? 'This Markdown file'}</p>
      </Frame>
    );
  }
  // The only destructive guest-file choice. Reload discards the local edits;
  // Overwrite keeps them and replaces the external version; Esc/Cancel writes
  // nothing and leaves the conflict flagged.
  if (dialog.kind === 'markdown-conflict') {
    const tab = useShell.getState().tabs.find((item) => item.packagePath === dialog.path);
    return (
      <Frame
        title="This file changed on disk"
        description="Another app wrote this file. Nothing has been overwritten."
        focusSecondary
        actions={
          <>
            <Button className="nf-button" data-dialog-secondary="true" onPress={close}>Cancel</Button>
            <Button
              className="nf-button"
              data-markdown-conflict-reload="true"
              onPress={() => {
                close();
                void reloadMarkdownFromDisk(dialog.path).then((outcome) => {
                  if (outcome.status === 'failed') toast.error(outcome.message);
                });
              }}
            >
              Reload
            </Button>
            <Button
              className="nf-button nf-button-danger"
              data-markdown-conflict-overwrite="true"
              onPress={() => {
                close();
                void overwriteMarkdownFile(dialog.path).then((outcome) => {
                  if (outcome.status === 'failed') {
                    errorToast(outcome.message, outcome.details);
                  } else if (outcome.status === 'missing') {
                    toast.error('This file is no longer on disk. Nothing was written.');
                  }
                });
              }}
            >
              Overwrite
            </Button>
          </>
        }
      >
        <p className="nf-dialog-text">{tab?.title ?? 'This Markdown file'}</p>
        <p className="nf-settings-help">
          Reload discards your edits. Overwrite keeps a backup of the version on disk.
        </p>
        <Details value={dialog.path} />
      </Frame>
    );
  }
  if (dialog.kind === 'health-issue') {
    if (runtime === null) return null;
    return (
      <HealthRepairDialog runtime={runtime} rowId={dialog.rowId} onClose={close} />
    );
  }

  if (dialog.kind === 'unused-images') {
    if (runtime === null) return null;
    return (
      <UnusedImagesDialog
        runtime={runtime}
        packagePath={dialog.packagePath}
        assetIds={dialog.assetIds}
        onClose={close}
      />
    );
  }

  if (runtime === null) {
    return (
      <Frame
        title="No note open"
        actions={<Button className="nf-button" onPress={close}>Close</Button>}
      >
        <p className="nf-dialog-text">Open a note first.</p>
      </Frame>
    );
  }

  const document = runtime.document;

  if (dialog.kind === 'move') {
    return (
      <MoveDialog
        runtime={runtime}
        blockId={dialog.blockId}
        onClose={close}
      />
    );
  }

  if (dialog.kind === 'delete-block') {
    return <DeleteBlockDialog runtime={runtime} blockId={dialog.blockId} onClose={close} />;
  }

  if (dialog.kind === 'link-reference') {
    return (
      <LinkReferenceDialog
        runtime={runtime}
        sourceBlockId={dialog.blockId}
        sourceAnchorId={dialog.anchorId}
        onClose={close}
      />
    );
  }

  if (dialog.kind === 'image-alt') {
    return (
      <ImageAltDialog
        runtime={runtime}
        blockId={dialog.blockId}
        path={dialog.path}
        alt={dialog.alt}
        onClose={close}
      />
    );
  }

  if (dialog.kind === 'delete-branch') {
    return (
      <Frame
        title="Detach from parent?"
        description="The block becomes top-level in its chapter. Its content is kept."
        actions={
          <>
            <Button className="nf-button" onPress={close}>Cancel</Button>
            <Button
              className="nf-button nf-button-primary"
              onPress={() => {
                close();
                report(runtime.deleteBranch(dialog.blockId));
              }}
            >
              Detach from parent
            </Button>
          </>
        }
      >
        <p className="nf-dialog-text">
          “{blockTitle(document.blocks[dialog.blockId])}”
        </p>
      </Frame>
    );
  }

  if (dialog.kind === 'rename-document') {
    return <RenameDialog title="Rename document" initial={document.title} onClose={close} onSave={(value) => void renameDocument(value)} />;
  }

  if (dialog.kind === 'rename-chapter') {
    const chapter = document.chapters.find((candidate) => candidate.id === dialog.chapterId);
    return (
      <RenameDialog
        title="Rename chapter"
        initial={chapter?.title ?? ''}
        onClose={close}
        onSave={(value) => void renameChapter(dialog.chapterId, value)}
      />
    );
  }

  if (dialog.kind === 'rename-block') {
    const block = document.blocks[dialog.blockId];
    return (
      <RenameDialog
        title="Rename block"
        initial={block?.label ?? ''}
        placeholder="Optional label"
        onClose={close}
        onSave={(value) => {
          report(
            runtime.applyStructural({
              type: 'block.rename',
              blockId: dialog.blockId,
              label: value.trim().length === 0 ? null : value.trim(),
            }),
          );
        }}
      />
    );
  }

  if (dialog.kind === 'link') {
    return <LinkDialog initial={dialog.href} onClose={close} />;
  }

  if (dialog.kind === 'math') {
    return <MathDialog mathKind={dialog.mathKind} latex={dialog.latex} pos={dialog.pos} onClose={close} />;
  }

  if (dialog.kind === 'table-size') {
    return <TableSizeDialog onClose={close} />;
  }

  if (dialog.kind === 'page-jump') {
    return <PageJumpDialog onClose={close} />;
  }

  if (dialog.kind === 'close-tab') {
    const target = useShell.getState().tabs.find((tab) => tab.packagePath === dialog.packagePath);
    return (
      <Frame
        title="Close tab?"
        description="This tab has unsaved changes."
        focusSecondary
        actions={
          <>
            <Button className="nf-button" data-dialog-secondary="true" onPress={close}>Cancel</Button>
            <Button
              className="nf-button nf-button-danger"
              onPress={() => {
                close();
                void closeTab(dialog.packagePath, { force: true, save: false });
              }}
            >
              Don’t Save
            </Button>
            <Button
              className="nf-button nf-button-primary"
              onPress={() => {
                close();
                void closeTab(dialog.packagePath, { force: true, save: true });
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <p className="nf-dialog-text">{target?.title ?? 'This note'}</p>
      </Frame>
    );
  }

  if (dialog.kind === 'reload-from-disk') {
    if (runtime.packagePath !== dialog.packagePath) {
      return null;
    }
    return (
      <Frame
        title="Reload from disk?"
        description="Unsaved changes in this window are discarded. The file on disk is not changed."
        focusSecondary
        actions={
          <>
            <Button className="nf-button" data-dialog-secondary="true" onPress={close}>Cancel</Button>
            <Button
              className="nf-button nf-button-danger"
              onPress={() => {
                close();
                void runtime.reloadFromDisk().then((outcome) => {
                  if (!outcome.ok) {
                    errorToast(outcome.message ?? 'Couldn’t reload the note.', outcome.details);
                  }
                });
              }}
            >
              Reload from disk
            </Button>
          </>
        }
      >
        <p className="nf-dialog-text">“{document.title}”</p>
        <Details value={runtime.packagePath} />
      </Frame>
    );
  }

  if (dialog.kind === 'overwrite-external') {
    if (runtime.packagePath !== dialog.packagePath) {
      return null;
    }
    return <OverwriteDialog runtime={runtime} onClose={close} />;
  }

  if (dialog.kind === 'restore-backup') {
    if (runtime.packagePath !== dialog.packagePath) {
      return null;
    }
    return (
      <RestoreBackupDialog
        runtime={runtime}
        packagePath={dialog.packagePath}
        onClose={close}
      />
    );
  }

  return null;
}

function OverwriteDialog({
  runtime,
  onClose,
}: {
  runtime: DocumentRuntime;
  onClose: () => void;
}): JSX.Element {
  const confirm = overwriteConfirmation(runtime.packagePath);
  return (
    <Frame
      title={confirm.title}
      description={confirm.description}
      focusSecondary
      actions={
        <>
          <Button className="nf-button" data-dialog-secondary="true" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-danger"
            onPress={() => {
              onClose();
              void runtime.overwriteExternal().then((outcome) => {
                if (!outcome.ok) {
                  toast.error(outcome.message ?? 'Couldn’t overwrite the file on disk.');
                }
              });
            }}
          >
            {confirm.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="nf-dialog-text">“{runtime.document.title}”</p>
      <Details value={confirm.path} />
    </Frame>
  );
}

function RestoreBackupDialog({
  runtime,
  packagePath,
  onClose,
}: {
  runtime: DocumentRuntime;
  packagePath: string;
  onClose: () => void;
}): JSX.Element {
  type ListState =
    | { status: 'loading' }
    | { status: 'ready'; backups: BackupCandidateView[] }
    | { status: 'error'; message: string; details?: string };

  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setSelected(null);
    void window.noteforest
      .listBackups(packagePath)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ status: 'error', message: result.message, details: result.details });
          return;
        }
        setState({ status: 'ready', backups: result.backups });
        setSelected(result.backups.find((backup) => backup.valid)?.sourcePath ?? null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [packagePath]);

  const usable =
    state.status === 'ready' ? state.backups.filter((backup) => backup.valid) : [];

  const restore = async (): Promise<void> => {
    if (selected === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.restoreBackup(selected);
      if (!result.ok) {
        if (result.canceled !== true) {
          setError(result.message ?? 'Could not restore the backup.');
        }
        return;
      }
      onClose();
      const shell = useShell.getState();
      shell.setLibrary(result.library);
      if (result.snapshot !== undefined) {
        registerRuntime(result.snapshot, undefined, undefined);
        shell.openTab({
          packagePath: result.snapshot.packagePath,
          title: result.snapshot.document.title,
        });
        toast.success('Restored a backup.');
      } else {
        toast.success(`Restored a backup to ${result.packagePath}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame
      title="Restore backup"
      description="Restores a copy. The current file is not changed."
      size="records"
      actions={
        <>
          <Button className="nf-button" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          {usable.length > 0 ? (
            <Button
              className="nf-button nf-button-primary"
              isDisabled={busy || selected === null}
              onPress={() => void restore()}
            >
              {busy ? 'Restoring…' : 'Restore copy…'}
            </Button>
          ) : null}
        </>
      }
    >
      {state.status === 'loading' ? (
        <p className="nf-dialog-text">Reading backups…</p>
      ) : null}

      {state.status === 'error' ? (
        <>
          <p className="nf-dialog-text" role="alert" data-restore-error="true">
            {state.message}
          </p>
          {state.details === undefined ? null : <Details value={state.details} />}
        </>
      ) : null}

      {state.status === 'ready' && usable.length === 0 ? (
        <div className="nf-backup-empty" data-backup-empty="true">
          <p className="nf-backup-empty-title">No usable backups</p>
          <p className="nf-dialog-note">
            No backup yet. Save the note as a copy instead.
          </p>
        </div>
      ) : null}

      {state.status === 'ready' && usable.length > 0 ? (
        <fieldset className="nf-fieldset" data-restore-backup="true">
          <legend className="nf-legend">Backups, newest first</legend>
          <div className="nf-backup-list">
            {state.backups.map((backup) => (
              <label
                key={backup.sourcePath}
                className={`nf-backup-row${backup.valid ? '' : ' nf-backup-row-invalid'}`}
                data-backup-row="true"
                data-backup-valid={backup.valid ? 'true' : 'false'}
                data-backup-kind={backup.kind}
                data-backup-created={backup.createdAt}
                data-backup-revision={String(backup.revision)}
                data-backup-blocks={String(backup.blockCount)}
                data-backup-title={backup.title}
                data-backup-source={backup.sourcePath}
              >
                <input
                  type="radio"
                  name="restore-backup"
                  data-backup-select="true"
                  checked={selected === backup.sourcePath}
                  disabled={!backup.valid || busy}
                  onChange={() => setSelected(backup.sourcePath)}
                />
                <span className="nf-backup-copy">
                  <span className="nf-backup-title">
                    {backup.title.length > 0 ? backup.title : 'Untitled'}
                  </span>
                  <span className="nf-backup-meta">{backupMetadataLine(backup)}</span>
                  {backup.valid ? null : (
                    <span className="nf-backup-invalid">
                      Unusable: {backup.error ?? 'invalid backup'}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {error !== null ? (
        <p className="nf-dialog-text nf-dialog-error" role="alert" data-restore-error="true">
          {error}
        </p>
      ) : null}
    </Frame>
  );
}

function LinkReferenceDialog({
  runtime,
  sourceBlockId,
  sourceAnchorId,
  onClose,
}: {
  runtime: DocumentRuntime;
  sourceBlockId: string;
  sourceAnchorId?: string;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const document = runtime.document;
  const sourceTitle = blockTitle(document.blocks[sourceBlockId]);
  const anchorText = sourceAnchorId === undefined ? '' : anchorQuote(document, sourceAnchorId);

  const candidates = useMemo(
    () =>
      Object.keys(document.blocks)
        .filter((id) => id !== sourceBlockId)
        .map((id) => {
          const chapterId = chapterIdOf(document, id);
          const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
          return {
            id,
            title: blockTitle(document.blocks[id]),
            chapter: chapter?.title ?? 'Untitled chapter',
          };
        }),
    [document, sourceBlockId],
  );

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length === 0) return candidates;
    return candidates.filter(
      (candidate) =>
        candidate.title.toLowerCase().includes(value) ||
        candidate.chapter.toLowerCase().includes(value),
    );
  }, [candidates, query]);

  const link = (): void => {
    if (target === null) return;
    onClose();
    void runtime
      .linkReference({
        sourceBlockId,
        ...(sourceAnchorId === undefined ? {} : { sourceAnchorId }),
        targetBlockId: target,
      })
      .then((outcome) => {
        if (!outcome.ok) {
          errorToast(outcome.message ?? 'Couldn’t add the link.', outcome.details);
          return;
        }
        if (outcome.duplicate === true) {
          toast.info('That link already exists.');
        }
      });
  };

  return (
    <Frame
      title="Link as reference"
      description="The target keeps its place. This adds a reference link."
      size="records"
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>Cancel</Button>
          <Button
            className="nf-button nf-button-primary"
            isDisabled={target === null}
            onPress={link}
          >
            Link
          </Button>
        </>
      }
    >
      <div className="nf-link-reference-source" data-link-reference-source={sourceBlockId}>
        <span className="nf-dialog-note">From</span>
        <span className="nf-link-reference-title">“{sourceTitle}”</span>
        {anchorText.length === 0 ? null : (
          <span className="nf-link-reference-anchor" data-link-reference-anchor="true">
            ↳ “{anchorText}”
          </span>
        )}
      </div>
      <label className="nf-field">
        <span className="nf-field-label">Find a block</span>
        <Input
          className="nf-input"
          autoFocus
          value={query}
          placeholder="Filter by title or chapter"
          aria-label="Filter blocks"
          data-link-reference-search="true"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {filtered.length === 0 ? (
        <p className="nf-dialog-text" data-link-reference-empty="true">
          No other block matches that filter.
        </p>
      ) : (
        <ListBox
          aria-label="Reference target"
          selectionMode="single"
          selectedKeys={target === null ? new Set() : new Set([target])}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next !== undefined) setTarget(String(next));
          }}
          className="nf-listbox"
        >
          {filtered.map((candidate) => (
            <ListBoxItem
              key={candidate.id}
              id={candidate.id}
              className="nf-listbox-item"
              textValue={`${candidate.title} — ${candidate.chapter}`}
              data-link-target={candidate.id}
            >
              <span className="nf-link-target-title">{candidate.title}</span>
              <span className="nf-link-target-chapter">{candidate.chapter}</span>
            </ListBoxItem>
          ))}
        </ListBox>
      )}
    </Frame>
  );
}

function MoveDialog({
  runtime,
  blockId,
  onClose,
}: {
  runtime: DocumentRuntime;
  blockId: string;
  onClose: () => void;
}): JSX.Element {
  const excluded = new Set(subtreeIds(runtime.document, blockId));
  const [target, setTarget] = useState('top');
  const candidates = useMemo(
    () =>
      Object.keys(runtime.document.blocks)
        .filter((id) => !excluded.has(id))
        .map((id) => ({ id, title: blockTitle(runtime.document.blocks[id]) })),
    [runtime.document, blockId],
  );
  const chapterId = chapterIdOf(runtime.document, blockId);

  return (
    <Frame
      title="Move to…"
      description="Choose a new parent. A block can’t move inside itself."
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>Cancel</Button>
          <Button
            className="nf-button nf-button-primary"
            onPress={() => {
              if (chapterId === null) return;
              onClose();
              report(
                runtime.moveBlock(
                  blockId,
                  target === 'top'
                    ? { kind: 'top-level', chapterId }
                    : { kind: 'child', parentBlockId: target },
                ),
              );
            }}
          >
            Move
          </Button>
        </>
      }
    >
      <ListBox
        aria-label="New parent"
        selectionMode="single"
        selectedKeys={new Set([target])}
        onSelectionChange={(keys) => {
          const next = [...keys][0];
          if (next !== undefined) setTarget(String(next));
        }}
        className="nf-listbox"
      >
        <ListBoxItem id="top" className="nf-listbox-item">
          Top level (chapter)
        </ListBoxItem>
        {candidates.map((candidate) => (
          <ListBoxItem key={candidate.id} id={candidate.id} className="nf-listbox-item" textValue={candidate.title}>
            {candidate.title}
          </ListBoxItem>
        ))}
      </ListBox>
    </Frame>
  );
}

function DeleteBlockDialog({
  runtime,
  blockId,
  onClose,
}: {
  runtime: DocumentRuntime;
  blockId: string;
  onClose: () => void;
}): JSX.Element {
  const [mode, setMode] = useState<'promote' | 'delete-subtree'>('promote');
  const title = blockTitle(runtime.document.blocks[blockId]);
  const children = subtreeIds(runtime.document, blockId).length - 1;
  const references = useMemo(
    () => externalReferenceParents(runtime.document, blockId, mode),
    [runtime.document, runtime.version, blockId, mode],
  );

  return (
    <Frame
      title="Delete block"
      description="The block and its content are removed."
      size="records"
      focusSecondary
      actions={
        <>
          <Button className="nf-button" data-dialog-secondary="true" onPress={onClose}>Cancel</Button>
          <Button
            className="nf-button nf-button-danger"
            onPress={() => {
              onClose();
              report(runtime.deleteBlock(blockId, mode));
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      <p className="nf-dialog-text">“{title}”</p>
      {children > 0 ? (
        <fieldset className="nf-fieldset">
          <legend className="nf-legend">What about its descendants?</legend>
          <label className="nf-radio">
            <input
              type="radio"
              name="delete-mode"
              checked={mode === 'promote'}
              onChange={() => setMode('promote')}
            />
            <span>Keep descendants as top-level blocks</span>
          </label>
          <label className="nf-radio">
            <input
              type="radio"
              name="delete-mode"
              checked={mode === 'delete-subtree'}
              onChange={() => setMode('delete-subtree')}
            />
            <span>Delete the whole subtree</span>
          </label>
        </fieldset>
      ) : null}
      {references.length > 0 ? (
        <section
          className="nf-delete-references"
          data-delete-references="true"
          data-delete-reference-count={references.length}
          aria-label="External references"
        >
          <h3 className="nf-delete-references-title">External references</h3>
          <p className="nf-dialog-text">
            {references.length === 1
              ? 'This reference link will be removed with the block. The source blocks stay.'
              : 'These reference links will be removed with the block. The source blocks stay.'}
          </p>
          <ul className="nf-delete-reference-list">
            {references.map((reference) => (
              <li
                key={reference.branchId}
                className="nf-delete-reference"
                data-delete-reference={reference.branchId}
                data-delete-reference-source={reference.sourceBlockId}
                data-delete-reference-chapter={reference.chapterId ?? ''}
                data-delete-reference-role={reference.role}
                data-delete-reference-target={reference.targetBlockId}
              >
                <span className="nf-delete-reference-source">{reference.sourceTitle}</span>
                <span className="nf-delete-reference-meta">
                  {reference.chapterTitle} ·{' '}
                  {reference.role === 'reference' ? 'Reference' : 'Primary'}
                  {reference.label === undefined ? '' : ` · ${reference.label}`}
                </span>
                <span className="nf-delete-reference-target">→ {reference.targetTitle}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Frame>
  );
}

function RenameDialog({
  title,
  initial,
  placeholder,
  onClose,
  onSave,
}: {
  title: string;
  initial: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (value: string) => void;
}): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <Frame
      title={title}
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>Cancel</Button>
          <Button
            className="nf-button nf-button-primary"
            onPress={() => {
              onClose();
              onSave(value);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <label className="nf-field">
        <span className="nf-field-label">Name</span>
        <Input
          className="nf-input"
          autoFocus
          value={value}
          placeholder={placeholder ?? 'Title'}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onClose();
              onSave(value);
            }
          }}
        />
      </label>
    </Frame>
  );
}

function LinkDialog({ initial, onClose }: { initial: string; onClose: () => void }): JSX.Element {
  const [href, setHref] = useState(initial);
  const apply = (): void => {
    const target = activeRuntime()?.editor;
    if (target !== null && target !== undefined) {
      const value = href.trim();
      if (value.length === 0) target.chain().focus().extendMarkRange('link').unsetLink().run();
      else target.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    }
    onClose();
  };
  return (
    <Frame
      title="Link"
      description="Add a link to the selected text."
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>Cancel</Button>
          <Button className="nf-button nf-button-primary" onPress={apply}>Apply</Button>
        </>
      }
    >
      <label className="nf-field">
        <span className="nf-field-label">URL</span>
        <Input
          className="nf-input"
          autoFocus
          value={href}
          placeholder="https://…"
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
        />
      </label>
    </Frame>
  );
}

function MathDialog({
  mathKind,
  latex,
  pos,
  onClose,
}: {
  mathKind: 'inline' | 'block';
  latex: string;
  pos: number | null;
  onClose: () => void;
}): JSX.Element {
  const [kind, setKind] = useState(mathKind);
  const [value, setValue] = useState(latex);
  const [termSelection, setTermSelection] = useState<FormulaTermSelection | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const readTermSelection = (source: string): FormulaTermSelection | null => {
    const element = textareaRef.current;
    if (element === null) return null;
    return formulaTermSelection(source, element.selectionStart, element.selectionEnd);
  };

  const syncTermSelection = (source: string): void => {
    setTermSelection(readTermSelection(source));
  };

  /** Write the current formula into the editor; false when it cannot apply. */
  const writeFormula = (next: string): boolean => {
    const editor = activeRuntime()?.editor;
    if (editor === null || editor === undefined || pos === null) return false;
    if (next.trim().length === 0) return false;
    return kind === 'inline'
      ? editor.chain().focus().updateInlineMath({ latex: next, pos }).run()
      : editor.chain().focus().updateBlockMath({ latex: next, pos }).run();
  };

  const apply = (): void => {
    const clean = value.trim();
    if (clean.length > 0) {
      if (pos !== null) {
        writeFormula(clean);
      } else {
        const editor = activeRuntime()?.editor;
        if (editor !== null && editor !== undefined) {
          if (kind === 'inline') editor.chain().focus().insertInlineMath({ latex: clean }).run();
          else editor.chain().focus().insertBlockMath({ latex: clean }).run();
        }
      }
    }
    onClose();
  };

  const branchFromTerm = (): void => {
    const element = textareaRef.current;
    const selected =
      element === null
        ? termSelection
        : formulaTermSelection(value, element.selectionStart, element.selectionEnd);
    if (pos === null || selected === null || selected.term.trim().length === 0) return;
    const runtime = activeRuntime();
    const editor = runtime?.editor ?? null;
    if (runtime === null || editor === null) {
      toast.error('Open a note before branching from a term.');
      onClose();
      return;
    }
    const location = formulaNodeAt(editor, pos);
    if (location === null) {
      toast.error('The formula isn’t in the note any more. Close the dialog and try again.');
      onClose();
      return;
    }
    // Branch from exactly what the user sees. If the dialog source changed,
    // apply it first so the selected term exists in the canonical formula.
    if (value !== location.latex) {
      if (!writeFormula(value)) {
        toast.error('The formula wasn’t updated. Check the LaTeX and try again.');
        return;
      }
    }
    const updated = formulaNodeAt(editor, pos) ?? location;
    const selection = {
      kind: 'formula' as const,
      blockId: updated.blockId,
      binding: formulaTermBinding(updated.nodePath, selected),
      selector: formulaTermSelector(selected),
    };
    onClose();
    report(runtime.branchFromSelection(selection));
  };

  const showTermAction =
    pos !== null && termSelection !== null && termSelection.term.trim().length > 0;

  return (
    <Frame
      title={pos === null ? 'Insert math' : 'Edit math'}
      description="LaTeX only. Nothing is loaded from the web."
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>Cancel</Button>
          {showTermAction ? (
            <Button
              className="nf-button"
              data-testid="branch-from-term"
              onPress={branchFromTerm}
            >
              Branch from term
            </Button>
          ) : null}
          <Button className="nf-button nf-button-primary" onPress={apply}>Apply</Button>
        </>
      }
    >
      <label className="nf-field">
        <span className="nf-field-label">LaTeX</span>
        <TextArea
          ref={textareaRef}
          className="nf-input nf-textarea"
          autoFocus
          value={value}
          placeholder="\\lambda^2 + \\mu^2"
          onChange={(event) => {
            setValue(event.target.value);
            syncTermSelection(event.target.value);
          }}
          onSelect={() => syncTermSelection(value)}
          onKeyUp={() => syncTermSelection(value)}
          onMouseUp={() => syncTermSelection(value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              apply();
            }
          }}
        />
      </label>
      <div className="nf-inline-radios">
        <label className="nf-radio">
          <input type="radio" checked={kind === 'inline'} onChange={() => setKind('inline')} /> Inline
        </label>
        <label className="nf-radio">
          <input type="radio" checked={kind === 'block'} onChange={() => setKind('block')} /> Display
        </label>
      </div>
      {pos !== null ? (
        <p className="nf-dialog-note">
          Select part of the LaTeX to branch from that term.
        </p>
      ) : null}
    </Frame>
  );
}

function ImageAltDialog({
  runtime,
  blockId,
  path,
  alt,
  onClose,
}: {
  runtime: DocumentRuntime;
  blockId: string;
  path: number[];
  alt: string;
  onClose: () => void;
}): JSX.Element {
  const [value, setValue] = useState(alt);
  const [saving, setSaving] = useState(false);

  const save = (): void => {
    setSaving(true);
    void runtime
      .setImageAlt(blockId, path, value)
      .then((outcome) => {
        if (outcome.ok) {
          onClose();
          return;
        }
        errorToast(outcome.message ?? 'Couldn’t save the alt text.', outcome.details);
        setSaving(false);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Couldn’t save the alt text.');
        setSaving(false);
      });
  };

  return (
    <Frame
      title="Image alt text"
      description="Describe the image. Leave it empty if it is decorative."
      actions={
        <>
          <Button className="nf-button" onPress={onClose} isDisabled={saving}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-primary"
            onPress={save}
            isDisabled={saving}
          >
            Save
          </Button>
        </>
      }
    >
      <Input
        className="nf-input"
        aria-label="Alt text"
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            save();
          }
        }}
      />
    </Frame>
  );
}
