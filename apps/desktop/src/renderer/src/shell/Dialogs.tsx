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
import { anchorQuote, blockTitle, chapterIdOf, externalReferenceParents, subtreeIds } from '../lib/tree';
import {
  formulaNodeAt,
  formulaTermBinding,
  formulaTermSelection,
  formulaTermSelector,
  type FormulaTermSelection,
} from '../lib/anchor-selection';
import { overwriteConfirmation } from '../lib/save-failure';
import { backupMetadataLine } from '../lib/backup-restore';
import {
  anchorCandidateViews,
  anchorContextLine,
  anchorHealthReason,
  anchorRepairPreview,
  buildAnchorHealthRows,
  filterAnchorHealthRows,
  repairCommandForCandidate,
  summarizeAnchorHealth,
  type AnchorHealthFilter,
  type AnchorHealthRow,
  type AnchorRepairPreview,
} from '../lib/anchor-health';
import type { BackupCandidateView } from '../../../shared/api';
import type { DocumentRuntime } from '../state/runtime';

interface FrameProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  wide?: boolean;
}

function Frame({ title, description, children, actions, wide = false }: FrameProps): JSX.Element {
  return (
    <ModalOverlay className="nf-overlay" isOpen onOpenChange={(open) => {
      if (!open) useShell.getState().closeDialog();
    }} isDismissable>
      <Modal className={wide ? 'nf-dialog-modal nf-dialog-modal-wide' : 'nf-dialog-modal'}>
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

  if (dialog.kind === 'anchor-health') {
    return (
      <AnchorHealthDialog
        runtime={runtime}
        initialAnchorId={dialog.anchorId}
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

type HealthConfirm =
  | { kind: 'attach' }
  | { kind: 'delete-branch'; branchId: string; targetTitle: string }
  | { kind: 'delete-anchor'; mode: 'attach' | 'delete' };

interface HealthRepairPreviewState {
  preview: AnchorRepairPreview;
  origin: 'candidate' | 'selection';
}

const HEALTH_KIND_LABEL: Record<string, string> = {
  text: 'Text',
  formula: 'Formula',
  code: 'Code',
  image: 'Image',
};

function healthStateLabel(state: 'broken' | 'ambiguous' | 'idle'): string {
  if (state === 'idle') return 'Idle anchor';
  return state === 'ambiguous' ? 'Ambiguous anchor' : 'Lost anchor';
}

/**
 * M3e health sheet: list broken/ambiguous anchors, filter by state, navigate
 * to the source block, choose an ambiguous candidate, relink from the editor
 * selection, attach branches to the block, delete one branch, delete the
 * anchor with an explicit branch policy, or keep it broken for this session.
 */
function AnchorHealthDialog({
  runtime,
  initialAnchorId,
  onClose,
}: {
  runtime: DocumentRuntime;
  initialAnchorId?: string;
  onClose: () => void;
}): JSX.Element {
  const [filter, setFilter] = useState<AnchorHealthFilter>('all');
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(
    initialAnchorId ?? null,
  );
  const [confirm, setConfirm] = useState<HealthConfirm | null>(null);
  const [preview, setPreview] = useState<HealthRepairPreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => buildAnchorHealthRows(runtime.document),
    [runtime.document, runtime.version],
  );
  const summary = summarizeAnchorHealth(rows);
  const visible = filterAnchorHealthRows(rows, filter);
  const selected =
    selectedAnchorId === null
      ? null
      : rows.find((row) => row.anchorId === selectedAnchorId) ?? null;
  const candidates =
    selected === null
      ? []
      : anchorCandidateViews(runtime.document, selected.anchorId, selected.resolution);

  const navigate = (row: AnchorHealthRow): void => {
    onClose();
    runtime.focusBlock(row.blockId, { select: true });
    runtime.selectAnchor(row.blockId, row.anchorId);
  };

  const perform = async (
    action: Promise<{ ok: boolean; message?: string }>,
    success: string,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = await action;
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message ?? 'The repair action was rejected.');
      return;
    }
    toast.success(success);
    onClose();
  };

  const repairCandidate = (index: number): void => {
    if (selected === null) return;
    const view = candidates.find((candidate) => candidate.index === index);
    const command =
      view === undefined
        ? null
        : repairCommandForCandidate(runtime.document, selected.anchorId, view.candidate);
    if (command === null) {
      setError('That candidate cannot be applied with the current selector.');
      return;
    }
    const next = anchorRepairPreview(runtime.document, selected.anchorId, command);
    if (next === null) {
      setError('That candidate cannot be previewed.');
      return;
    }
    setConfirm(null);
    setError(null);
    setPreview({ preview: next, origin: 'candidate' });
  };

  const previewRelink = async (): Promise<void> => {
    if (selected === null) return;
    setBusy(true);
    setError(null);
    const prepared = await runtime.prepareRepairFromSelection(selected.anchorId);
    setBusy(false);
    if (!prepared.ok) {
      setError(prepared.message);
      return;
    }
    const next = anchorRepairPreview(
      runtime.document,
      selected.anchorId,
      prepared.command,
    );
    if (next === null) {
      setError('The current selection cannot be previewed.');
      return;
    }
    setConfirm(null);
    setPreview({ preview: next, origin: 'selection' });
  };

  const confirmRepair = (): void => {
    if (preview === null) return;
    const { command } = preview.preview;
    void perform(
      runtime.repairAnchor(command.anchorId, command.selector, command.binding),
      preview.origin === 'candidate'
        ? 'Anchor candidate applied.'
        : 'Anchor relinked from the selection.',
    );
  };

  // OD-2: an idle record has no branches, so removal needs no branch policy or
  // confirmation. One structural command removes the record and binding; undo
  // restores both exactly. The target blocks are never part of the command.
  const removeIdle = (anchorId: string): void => {
    void (async () => {
      setBusy(true);
      setError(null);
      const outcome = await runtime.removeIdleAnchor(anchorId);
      setBusy(false);
      if (!outcome.ok) {
        setError(outcome.message ?? 'The idle anchor could not be removed.');
        return;
      }
      toast.success('Anchor removed. The target block was kept.', {
        action: { label: 'Undo', onClick: () => undoActive() },
      });
      onClose();
    })();
  };

  return (
    <Frame
      title="Anchor health"
      description={
        summary.total === 0
          ? summary.idle === 0
            ? 'No broken or ambiguous anchors.'
            : `${summary.idle} idle ${summary.idle === 1 ? 'anchor' : 'anchors'} · no anchors need repair`
          : `${summary.total} ${summary.total === 1 ? 'anchor needs' : 'anchors need'} repair · ${summary.broken} broken · ${summary.ambiguous} ambiguous${
              summary.idle === 0
                ? ''
                : ` · ${summary.idle} idle ${summary.idle === 1 ? 'anchor' : 'anchors'}`
            }`
      }
      wide
      actions={<Button className="nf-button" onPress={onClose}>Close</Button>}
    >
      <div className="nf-health" data-anchor-health="true">
        {selected === null ? (
          <>
            <div className="nf-health-filters" role="group" aria-label="Filter anchors">
              {(['all', 'broken', 'ambiguous'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="nf-health-filter"
                  data-health-filter={value}
                  aria-pressed={filter === value}
                  autoFocus={value === 'all'}
                  onClick={() => setFilter(value)}
                >
                  {value === 'all'
                    ? `All anchors · ${rows.length}`
                    : value === 'broken'
                      ? `Broken · ${summary.broken}`
                      : `Ambiguous · ${summary.ambiguous}`}
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <p className="nf-health-empty" data-health-empty="true">
                {rows.length === 0
                  ? 'All anchors are healthy.'
                  : 'No anchors match this filter.'}
              </p>
            ) : (
              <ul className="nf-health-list" aria-label="Anchors">
                {visible.map((row) => (
                  <li
                    key={row.anchorId}
                    className="nf-health-row"
                    data-health-anchor={row.anchorId}
                    data-health-state={row.state}
                    data-health-kind={row.kind}
                  >
                    <button
                      type="button"
                      className="nf-health-row-main"
                      data-health-navigate={row.anchorId}
                      onClick={() => navigate(row)}
                    >
                      <span className="nf-health-row-top">
                        <span
                          className={`nf-health-state nf-health-state-${row.state}`}
                          data-health-state-label={row.state}
                        >
                          {healthStateLabel(row.state)}
                        </span>
                        <span className="nf-health-kind">{HEALTH_KIND_LABEL[row.kind] ?? row.kind}</span>
                        <span
                          className="nf-health-branch-count"
                          data-health-branch-count={row.branchCount}
                        >
                          {row.branchCount} {row.branchCount === 1 ? 'branch' : 'branches'}
                        </span>
                      </span>
                      <span className="nf-health-quote">“{row.quote || 'anchor'}”</span>
                      <span className="nf-health-context">
                        {anchorContextLine(row.prefix, row.quote, row.suffix)}
                      </span>
                      <span className="nf-health-block">
                        {row.blockTitle} · {row.chapterTitle}
                      </span>
                      <span className="nf-health-reason">{row.reasonLabel}</span>
                    </button>
                    {row.state === 'idle' ? (
                      <button
                        type="button"
                        className="nf-health-repair nf-health-remove"
                        data-health-remove={row.anchorId}
                        aria-label={`Remove idle anchor “${row.quote || 'anchor'}”`}
                        disabled={busy}
                        onClick={() => removeIdle(row.anchorId)}
                      >
                        Remove anchor
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="nf-health-repair"
                        data-health-repair={row.anchorId}
                        aria-label={`Repair anchor “${row.quote || 'anchor'}”`}
                        onClick={() => {
                          setSelectedAnchorId(row.anchorId);
                          setConfirm(null);
                          setPreview(null);
                          setError(null);
                        }}
                      >
                        Repair
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="nf-health-detail" data-health-detail={selected.anchorId}>
            <button
              type="button"
              className="nf-health-back"
              onClick={() => {
                setSelectedAnchorId(null);
                setConfirm(null);
                setPreview(null);
                setError(null);
              }}
            >
              ← All anchors
            </button>
            <div className="nf-health-detail-head">
              <span
                className={`nf-health-state nf-health-state-${selected.state}`}
                data-health-state-label={selected.state}
              >
                {healthStateLabel(selected.state)}
              </span>
              <span className="nf-health-kind">
                {HEALTH_KIND_LABEL[selected.kind] ?? selected.kind}
              </span>
              <span className="nf-health-quote">“{selected.quote || 'anchor'}”</span>
            </div>
            <p className="nf-health-detail-meta">
              {selected.blockTitle} · {selected.chapterTitle}
            </p>
            <p className="nf-health-detail-context">
              {anchorContextLine(selected.prefix, selected.quote, selected.suffix)}
            </p>
            <p className="nf-health-reason" data-health-reason={selected.reason}>
              {anchorHealthReason(selected.reason)}
            </p>

            {preview === null ? null : (
              <section
                className="nf-health-preview"
                data-health-preview="true"
                data-health-preview-origin={preview.origin}
                data-health-preview-anchor={preview.preview.anchorId}
                aria-label="Repair preview"
              >
                <h3 className="nf-health-section-title">Confirm repair</h3>
                <p className="nf-dialog-note">
                  Confirm applies one undoable repair. Cancel or closing this sheet changes
                  nothing; the anchor and branch IDs stay the same.
                </p>
                <div className="nf-health-preview-grid">
                  <div className="nf-health-preview-side" data-health-preview-side="before">
                    <span className="nf-health-preview-label">Before</span>
                    <span className="nf-health-preview-quote">
                      “{preview.preview.before.quote}”
                    </span>
                    <span className="nf-health-preview-context">
                      {preview.preview.before.context}
                    </span>
                    {preview.preview.before.descriptors.map((descriptor) => (
                      <span key={descriptor} className="nf-health-preview-descriptor">
                        {descriptor}
                      </span>
                    ))}
                  </div>
                  <span className="nf-health-preview-arrow" aria-hidden="true">
                    →
                  </span>
                  <div className="nf-health-preview-side" data-health-preview-side="after">
                    <span className="nf-health-preview-label">After</span>
                    <span className="nf-health-preview-quote">
                      “{preview.preview.after.quote}”
                    </span>
                    <span className="nf-health-preview-context">
                      {preview.preview.after.context}
                    </span>
                    {preview.preview.after.descriptors.map((descriptor) => (
                      <span key={descriptor} className="nf-health-preview-descriptor">
                        {descriptor}
                      </span>
                    ))}
                  </div>
                </div>
                <dl className="nf-health-preview-meta">
                  <div>
                    <dt>Anchor</dt>
                    <dd>{preview.preview.anchorId}</dd>
                  </div>
                  <div>
                    <dt>Block</dt>
                    <dd>
                      {preview.preview.blockTitle} · {preview.preview.chapterTitle}
                    </dd>
                  </div>
                  <div>
                    <dt>Branches</dt>
                    <dd>
                      {preview.preview.branches.length === 0
                        ? 'No outgoing branches'
                        : preview.preview.branches.map((branch) => (
                            <span
                              key={branch.id}
                              className="nf-health-preview-branch"
                              data-health-preview-branch={branch.id}
                              data-health-preview-branch-role={branch.role}
                            >
                              {branch.role} → {branch.targetTitle} · {branch.id}
                            </span>
                          ))}
                    </dd>
                  </div>
                  <div>
                    <dt>Targets</dt>
                    <dd>
                      {preview.preview.branches.length === 0
                        ? 'No target blocks'
                        : [
                            ...new Map(
                              preview.preview.branches.map((branch) => [
                                branch.targetBlockId,
                                branch,
                              ]),
                            ).values(),
                          ].map((branch) => (
                            <span
                              key={branch.targetBlockId}
                              className="nf-health-preview-target"
                              data-health-preview-target={branch.targetBlockId}
                            >
                              {branch.targetTitle}
                            </span>
                          ))}
                    </dd>
                  </div>
                </dl>
                <div className="nf-dialog-inline-actions">
                  <Button
                    className="nf-button"
                    data-health-preview-cancel="true"
                    isDisabled={busy}
                    onPress={() => setPreview(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="nf-button nf-button-primary"
                    data-health-preview-confirm="true"
                    isDisabled={busy}
                    onPress={confirmRepair}
                  >
                    Confirm repair
                  </Button>
                </div>
              </section>
            )}

            <section className="nf-health-section">
              <h3 className="nf-health-section-title">Branches</h3>
              {selected.branchCount === 0 ? (
                <p className="nf-dialog-note" data-health-idle-note="true">
                  This anchor has no branches.
                </p>
              ) : (
                <ul className="nf-health-branches">
                  {selected.branches.map((branch) => (
                    <li
                      key={branch.id}
                      className="nf-health-branch"
                      data-health-branch={branch.id}
                      data-health-branch-role={branch.role}
                    >
                      <span className="nf-health-branch-role">{branch.role}</span>
                      <span className="nf-health-branch-target">
                        {branch.label === undefined
                          ? branch.targetTitle
                          : `${branch.targetTitle} · ${branch.label}`}
                      </span>
                      <Button
                        className="nf-button nf-button-quiet nf-health-branch-delete"
                        data-health-action="delete-branch"
                        isDisabled={busy}
                        onPress={() => {
                          setPreview(null);
                          setConfirm({
                            kind: 'delete-branch',
                            branchId: branch.id,
                            targetTitle: branch.targetTitle,
                          });
                        }}
                      >
                        Delete branch…
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {candidates.length > 0 ? (
              <section className="nf-health-section" data-health-candidates="true">
                <h3 className="nf-health-section-title">
                  {selected.state === 'ambiguous' ? 'Choose a matching location' : 'Matching locations'}
                </h3>
                <div className="nf-health-candidate-list">
                  {candidates.map((view) => (
                    <button
                      key={`${view.index}-${view.label}`}
                      type="button"
                      className="nf-health-candidate"
                      data-health-candidate={view.index}
                      disabled={busy}
                      onClick={() => repairCandidate(view.index)}
                    >
                      <span className="nf-health-candidate-label">{view.label}</span>
                      <span className="nf-health-candidate-context">{view.context}</span>
                    </button>
                  ))}
                </div>
                <p className="nf-dialog-note">
                  Selecting a candidate shows a before/after preview. Nothing changes until
                  Confirm; then the repair keeps the anchor and branch IDs and is one undo
                  entry. Repeated identical terms or code quotes remain ambiguous until the
                  source itself is unique.
                </p>
              </section>
            ) : null}

            {selected.state === 'idle' ? (
              <div className="nf-health-actions">
                <Button
                  className="nf-button nf-button-quiet"
                  data-health-action="remove-idle"
                  isDisabled={busy}
                  onPress={() => removeIdle(selected.anchorId)}
                >
                  Remove anchor
                </Button>
              </div>
            ) : (
              <div className="nf-health-actions">
                <Button
                  className="nf-button"
                  data-health-action="relink"
                  isDisabled={busy}
                  onPress={() => void previewRelink()}
                >
                  Relink to current selection
                </Button>
                <Button
                  className="nf-button"
                  data-health-action="attach"
                  isDisabled={busy}
                  onPress={() => {
                    setPreview(null);
                    setConfirm({ kind: 'attach' });
                  }}
                >
                  Attach branches to block…
                </Button>
                <Button
                  className="nf-button"
                  data-health-action="keep-broken"
                  isDisabled={busy}
                  onPress={() => {
                    runtime.keepAnchorBroken(selected.anchorId);
                    toast.info('Kept broken for this session. Nothing was changed.');
                    onClose();
                  }}
                >
                  Keep broken
                </Button>
                <Button
                  className="nf-button nf-button-danger"
                  data-health-action="delete-anchor"
                  isDisabled={busy}
                  onPress={() => {
                    setPreview(null);
                    setConfirm({ kind: 'delete-anchor', mode: 'attach' });
                  }}
                >
                  Delete anchor…
                </Button>
              </div>
            )}

            {confirm === null ? null : (
              <div
                className="nf-health-confirm"
                data-health-confirm={confirm.kind}
                role="group"
                aria-label="Confirm anchor action"
              >
                {confirm.kind === 'attach' ? (
                  <>
                    <p className="nf-dialog-text">
                      Move {selected.branchCount}{' '}
                      {selected.branchCount === 1 ? 'branch' : 'branches'} from this anchor to
                      the block itself. Branch IDs, labels, and target blocks stay; one undo
                      restores the anchored sources.
                    </p>
                    <div className="nf-dialog-inline-actions">
                      <Button
                        className="nf-button"
                        onPress={() => setConfirm(null)}
                        isDisabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="nf-button nf-button-primary"
                        data-health-confirm-action="attach"
                        isDisabled={busy}
                        onPress={() =>
                          void perform(
                            runtime.attachAnchorToBlock(selected.anchorId),
                            'Branches attached to the block.',
                          )
                        }
                      >
                        Attach
                      </Button>
                    </div>
                  </>
                ) : null}
                {confirm.kind === 'delete-branch' ? (
                  <>
                    <p className="nf-dialog-text">
                      Delete this branch to “{confirm.targetTitle}”? The target block and its
                      subtree stay; a primary target becomes a top-level block. Undo restores
                      the branch.
                    </p>
                    <div className="nf-dialog-inline-actions">
                      <Button
                        className="nf-button"
                        onPress={() => setConfirm(null)}
                        isDisabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="nf-button nf-button-danger"
                        data-health-confirm-action="delete-branch"
                        isDisabled={busy}
                        onPress={() =>
                          void perform(
                            runtime.deleteAnchorBranch(confirm.branchId),
                            'Branch deleted. The target block was kept.',
                          )
                        }
                      >
                        Delete branch
                      </Button>
                    </div>
                  </>
                ) : null}
                {confirm.kind === 'delete-anchor' ? (
                  <>
                    <p className="nf-dialog-text">
                      Delete the anchor itself? Target blocks are never deleted. Choose what
                      happens to the outgoing branches.
                    </p>
                    <fieldset className="nf-fieldset">
                      <legend className="nf-legend">Branches</legend>
                      <label className="nf-radio">
                        <input
                          type="radio"
                          name="health-delete-mode"
                          checked={confirm.mode === 'attach'}
                          onChange={() => setConfirm({ kind: 'delete-anchor', mode: 'attach' })}
                        />
                        <span>Attach them to the block (branch IDs stay)</span>
                      </label>
                      <label className="nf-radio">
                        <input
                          type="radio"
                          name="health-delete-mode"
                          checked={confirm.mode === 'delete'}
                          onChange={() => setConfirm({ kind: 'delete-anchor', mode: 'delete' })}
                        />
                        <span>Delete them; primary targets become top-level</span>
                      </label>
                    </fieldset>
                    <div className="nf-dialog-inline-actions">
                      <Button
                        className="nf-button"
                        onPress={() => setConfirm(null)}
                        isDisabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="nf-button nf-button-danger"
                        data-health-confirm-action="delete-anchor"
                        isDisabled={busy}
                        onPress={() =>
                          void perform(
                            runtime.deleteAnchor(selected.anchorId, confirm.mode),
                            'Anchor deleted. Target blocks were kept.',
                          )
                        }
                      >
                        Delete anchor
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {error !== null ? (
              <p className="nf-dialog-text nf-dialog-error" role="alert" data-health-error="true">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
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
  const references = useMemo(
    () => externalReferenceParents(runtime.document, blockId, mode),
    [runtime.document, runtime.version, blockId, mode],
  );

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
            {references.length === 1 ? 'This reference link points at' : 'These reference links point at'}{' '}
            {mode === 'delete-subtree' ? 'this subtree' : 'this block'} and will be removed.
            The source blocks and their content stay.
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
        toast.error(outcome.message ?? 'Could not save the alt text.');
        setSaving(false);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Could not save the alt text.');
        setSaving(false);
      });
  };

  return (
    <Frame
      title="Image alt text"
      description="Describe the image for screen readers, search, and the exported PDF. Leave it empty for a decorative image."
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
