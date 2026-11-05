import {
  Button,
  Dialog,
  Input,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  TextArea,
} from 'react-aria-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShell } from '../state/shell';
import { registerRuntime, useRuntime } from '../state/registry';
import {
  activeRuntime,
  closeTab,
  renameChapter,
  renameDocument,
  report,
  undoActive,
} from '../actions';
import { anchorQuote, blockTitle, chapterIdOf, subtreeIds } from '../lib/tree';
import {
  formulaNodeAt,
  formulaTermBinding,
  formulaTermSelection,
  formulaTermSelector,
  type FormulaTermSelection,
} from '../lib/anchor-selection';
import { overwriteConfirmation } from '../lib/save-failure';
import { backupMetadataLine } from '../lib/backup-restore';
import type { BackupCandidateView } from '../../../shared/api';
import type { DocumentRuntime } from '../state/runtime';

interface FrameProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}

function Frame({ title, description, children, actions }: FrameProps): JSX.Element {
  return (
    <ModalOverlay className="nf-overlay" isOpen onOpenChange={(open) => {
      if (!open) useShell.getState().closeDialog();
    }} isDismissable>
      <Modal className="nf-dialog-modal">
        <Dialog className="nf-dialog" aria-label={title}>
          <h2 className="nf-dialog-title">{title}</h2>
          {description === undefined ? null : <p className="nf-dialog-description">{description}</p>}
          <div className="nf-dialog-body">{children}</div>
          <div className="nf-dialog-actions">{actions}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export function Dialogs(): JSX.Element | null {
  const dialog = useShell((state) => state.dialog);
  const close = useShell((state) => state.closeDialog);
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);

  if (dialog === null) return null;
  if (runtime === null) {
    return (
      <Frame
        title="No document open"
        actions={<Button className="nf-button" onPress={close}>Close</Button>}
      >
        <p className="nf-dialog-text">Open a document before using this command.</p>
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

  if (dialog.kind === 'delete-branch') {
    return (
      <Frame
        title="Detach branch?"
        description="The block becomes a top-level block in the same chapter. Its content and subtree are kept."
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
              Detach
            </Button>
          </>
        }
      >
        <p className="nf-dialog-text">
          “{blockTitle(document.blocks[dialog.blockId])}” will lose its incoming arrow.
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

  if (dialog.kind === 'close-tab') {
    const target = useShell.getState().tabs.find((tab) => tab.packagePath === dialog.packagePath);
    return (
      <Frame
        title="Close tab?"
        description="This tab has changes that have not been saved yet."
        actions={
          <>
            <Button className="nf-button" onPress={close}>Cancel</Button>
            <Button
              className="nf-button"
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
        <p className="nf-dialog-text">{target?.title ?? 'This document'}</p>
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
        description="Unsaved changes in this window will be discarded. The file on disk is not modified."
        actions={
          <>
            <Button className="nf-button" onPress={close}>Cancel</Button>
            <Button
              className="nf-button nf-button-danger"
              onPress={() => {
                close();
                void runtime.reloadFromDisk().then((outcome) => {
                  if (!outcome.ok) toast.error(outcome.message ?? 'Could not reload the document.');
                });
              }}
            >
              Reload from disk
            </Button>
          </>
        }
      >
        <p className="nf-dialog-text">
          “{document.title}” will be reopened from <code>{runtime.packagePath}</code>. This cannot be
          undone.
        </p>
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

  if (dialog.kind === 'settings') {
    return <SettingsDialog onClose={close} />;
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirm = overwriteConfirmation(runtime.packagePath);
  // Overwrite is destructive and must never be the default. Focus Cancel
  // explicitly instead of relying on dialog focus order.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <Frame
      title={confirm.title}
      description={confirm.description}
      actions={
        <>
          <Button ref={cancelRef} className="nf-button" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="nf-button nf-button-danger"
            onPress={() => {
              onClose();
              void runtime.overwriteExternal().then((outcome) => {
                if (!outcome.ok) {
                  toast.error(outcome.message ?? 'Could not overwrite the file on disk.');
                }
              });
            }}
          >
            {confirm.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="nf-dialog-text">
        “{runtime.document.title}” will replace <code>{runtime.packagePath}</code>.
      </p>
      <p className="nf-dialog-note">
        The external changes will be lost. Reload from disk instead if you want to keep them.
      </p>
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
    | { status: 'error'; message: string };

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
          setState({ status: 'error', message: result.message });
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
        toast.success('Restored a backup and opened it.');
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
      description="Choose a backup to restore as a new copy. The current document and its file are not changed."
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
        <p className="nf-dialog-text" role="alert" data-restore-error="true">
          {state.message}
        </p>
      ) : null}

      {state.status === 'ready' && usable.length === 0 ? (
        <div className="nf-backup-empty" data-backup-empty="true">
          <p className="nf-backup-empty-title">No usable backups</p>
          <p className="nf-dialog-note">
            NoteForest has no valid backup for this document yet. Save a copy or fix the
            original folder instead.
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

      <p className="nf-dialog-note">
        The restored copy opens in a new tab. This window’s unsaved changes and the original
        file are left untouched.
      </p>
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
          toast.error(outcome.message ?? 'Could not link the block.');
          return;
        }
        if (outcome.duplicate === true) {
          toast.info('That link already exists; focused the linked block.');
        }
      });
  };

  return (
    <Frame
      title="Link as reference"
      description="Link an existing block without changing its primary home, outline position, or layout. Reference links may form cycles."
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
      <p className="nf-dialog-note">
        The target stays once at its primary home. This only adds a “See also” link
        here and a “Referenced by” chip there.
      </p>
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
      description="Choose a new primary parent. Cycles and descendant moves are rejected."
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

  return (
    <Frame
      title="Delete block"
      description={children > 0 ? 'This block has descendants.' : 'This block has no descendants.'}
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>Cancel</Button>
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
      toast.error('Open a document before branching from a term.');
      onClose();
      return;
    }
    const location = formulaNodeAt(editor, pos);
    if (location === null) {
      toast.error('The formula could not be found; close the dialog and try again.');
      onClose();
      return;
    }
    // Branch from exactly what the user sees. If the dialog source changed,
    // apply it first so the selected term exists in the canonical formula.
    if (value !== location.latex) {
      if (!writeFormula(value)) {
        toast.error('The formula could not be updated; check the LaTeX and try again.');
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
      description="KaTeX renders the expression. LaTeX only; no remote content."
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

function SettingsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const library = useShell((state) => state.library);
  return (
    <Frame
      title="Settings"
      actions={<Button className="nf-button" onPress={onClose}>Done</Button>}
    >
      <dl className="nf-settings-list">
        <div>
          <dt>Library</dt>
          <dd>{library?.libraryPath ?? '—'}</dd>
        </div>
        <div>
          <dt>App data</dt>
          <dd>{library?.appSupportPath ?? '—'}</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd>Graphite · dark (light tokens reserved)</dd>
        </div>
      </dl>
      <div className="nf-dialog-inline-actions">
        <Button
          className="nf-button"
          onPress={() => void window.noteforest.revealLibrary()}
        >
          Reveal library in Finder
        </Button>
        <Button className="nf-button" onPress={undoActive}>
          Undo last change
        </Button>
      </div>
      <p className="nf-dialog-note">
        Documents are local folders with <code>document.json</code> and an assets directory. Autosave runs after
        800 ms; ⌘S flushes immediately.
      </p>
    </Frame>
  );
}
