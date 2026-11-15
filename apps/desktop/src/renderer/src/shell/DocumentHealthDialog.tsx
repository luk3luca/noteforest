/**
 * Document health sheet (product name for the M3e anchor-health surface).
 *
 * The sheet is read-only until an explicit action: it renders the pure audit,
 * filters and searches it, locates a row in Continuous or Page, and runs one
 * typed command per action. A rejected command keeps the sheet open with the
 * reason; nothing is fixed automatically.
 */

import { Button, Input } from 'react-aria-components';
import { useMemo, useState } from 'react';
import type { AnchorKind } from '@noteforest/core';
import { toast } from 'sonner';
import { undoActive } from '../actions';
import { useShell } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import {
  anchorCandidateViews,
  anchorContextLine,
  anchorHealthReason,
  anchorRepairPreview,
  repairCommandForCandidate,
  type AnchorRepairPreview,
} from '../lib/anchor-health';
import {
  DOCUMENT_HEALTH_FILTERS,
  auditDocumentHealth,
  documentHealthFilterCount,
  documentHealthStateLabel,
  filterDocumentHealthRows,
  type DocumentHealthFilter,
  type DocumentHealthRow,
} from '../lib/document-health';
import { editingEnabledFor } from '../lib/editability';
import { anchorQuote, blockTitle, chapterIdOf } from '../lib/tree';
import { printPageModelSnapshot } from '../page/print-model-registry';
import { Frame } from './DialogFrame';

const READ_ONLY_REASON = 'Read mode — switch to Continuous Edit to repair document issues.';

const KIND_LABEL: Record<AnchorKind, string> = {
  text: 'Text',
  formula: 'Formula',
  code: 'Code',
  image: 'Image',
};

const SEVERITY_LABEL: Record<string, string> = {
  S1: 'Data loss',
  S2: 'Repair',
  S3: 'Info',
};

type HealthConfirm =
  | { kind: 'attach' }
  | { kind: 'delete-branch'; branchId: string; targetTitle: string }
  | { kind: 'delete-anchor'; mode: 'attach' | 'delete' }
  | { kind: 'remove-branch'; branchId: string; targetTitle: string }
  | { kind: 'delete-orphan-block'; blockId: string; title: string }
  | { kind: 'delete-chapter'; chapterId: string; title: string };

interface HealthRepairPreviewState {
  preview: AnchorRepairPreview;
  origin: 'candidate' | 'selection';
}

interface BlockChoice {
  id: string;
  label: string;
}

interface ChapterChoice {
  id: string;
  label: string;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function summaryText(report: ReturnType<typeof auditDocumentHealth>): string {
  const { counts } = report;
  const parts: string[] = [];
  if (counts.broken > 0) parts.push(`${counts.broken} broken`);
  if (counts.ambiguous > 0) parts.push(`${counts.ambiguous} ambiguous`);
  if (counts.idle > 0) parts.push(`${counts.idle} idle`);
  if (counts.orphans > 0) parts.push(plural(counts.orphans, 'orphan', 'orphans'));
  if (counts.structure > 0) parts.push(`${counts.structure} structure`);
  if (counts.hidden > 0) parts.push(`${counts.hidden} hidden`);
  const detail = parts.length === 0 ? '' : ` · ${parts.join(' · ')}`;
  if (counts.needsRepair === 0) return `No issues need repair${detail}`;
  return `${counts.needsRepair} ${
    counts.needsRepair === 1 ? 'issue needs' : 'issues need'
  } repair${detail}`;
}

/** The no-document state for the palette entry and a closed session. */
export function DocumentHealthEmptyDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Frame
      title="Document health"
      description="A read-only audit of anchors and structure. It never fixes anything automatically."
      wide
      actions={<Button className="nf-button" onPress={onClose}>Close</Button>}
    >
      <div className="nf-health" data-anchor-health="true" data-health-no-document="true">
        <p className="nf-health-empty" data-health-empty="true">
          Open a document to check its anchors and structure.
        </p>
        <p className="nf-dialog-note">
          Every repair is one typed command with undo. Hidden rows, idle anchors, and structural
          problems are listed here once a document is open.
        </p>
      </div>
    </Frame>
  );
}

export function DocumentHealthDialog({
  runtime,
  initialAnchorId,
  initialFilter,
  onClose,
}: {
  runtime: DocumentRuntime;
  initialAnchorId?: string;
  initialFilter?: DocumentHealthFilter;
  onClose: () => void;
}): JSX.Element {
  const [filter, setFilter] = useState<DocumentHealthFilter>(initialFilter ?? 'all');
  const [query, setQuery] = useState('');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(
    initialAnchorId === undefined ? null : `anchor:${initialAnchorId}`,
  );
  const [confirm, setConfirm] = useState<HealthConfirm | null>(null);
  const [preview, setPreview] = useState<HealthRepairPreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkToken, setCheckToken] = useState(0);
  const [branchTarget, setBranchTarget] = useState('');
  const [moveChapterId, setMoveChapterId] = useState('');

  const editingEnabled = useShell((state) =>
    editingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  const layout = useShell(
    (state) => state.viewByDoc[runtime.packagePath]?.layout ?? 'continuous',
  );

  const report = useMemo(
    () =>
      auditDocumentHealth(runtime.document, {
        ...(runtime.assetAvailability === undefined
          ? {}
          : { assetAvailability: runtime.assetAvailability }),
        collapsedBlockIds: runtime.collapsed,
      }),
    // `runtime.version` advances on collapse and content notifications; the
    // audit is O(content) and the manual Check again token forces a re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtime.document, runtime.version, runtime.assetAvailability, checkToken],
  );

  const visible = useMemo(
    () => filterDocumentHealthRows(report.rows, filter, query),
    [report.rows, filter, query],
  );
  const selected =
    selectedRowId === null
      ? null
      : report.rows.find((row) => row.id === selectedRowId) ?? null;
  const candidates =
    selected === null || selected.resolution === undefined
      ? []
      : anchorCandidateViews(runtime.document, selected.anchorId ?? '', selected.resolution);

  const branchChoices = useMemo<BlockChoice[]>(() => {
    const sourceBlockId = selected?.blockId;
    return Object.keys(runtime.document.blocks)
      .filter((id) => id !== sourceBlockId)
      .map((id) => {
        const chapterId = chapterIdOf(runtime.document, id);
        const chapter = runtime.document.chapters.find((item) => item.id === chapterId);
        return {
          id,
          label: `${blockTitle(runtime.document.blocks[id])} · ${chapter?.title ?? 'No chapter'}`,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [runtime.document, selected?.blockId]);

  const chapterChoices = useMemo<ChapterChoice[]>(
    () =>
      runtime.document.chapters.map((chapter, index) => ({
        id: chapter.id,
        label: chapter.title?.trim() || `Untitled chapter ${index + 1}`,
      })),
    [runtime.document],
  );

  /** Locate: close, expand ancestors, select the block/term, honor Page. */
  const navigate = (row: DocumentHealthRow): void => {
    onClose();
    if (row.category === 'empty-chapter') {
      if (row.chapterId === undefined) return;
      if (layout === 'page') {
        useShell.getState().setDocumentLayout(runtime.packagePath, 'continuous');
      }
      const chapterId = row.chapterId;
      requestAnimationFrame(() => {
        const section = document.querySelector(
          `.nf-editor[data-active="true"] [data-chapter-id="${CSS.escape(chapterId)}"]`,
        );
        section?.scrollIntoView({ block: 'center' });
      });
      return;
    }
    if (row.blockId === undefined) return;
    if (layout === 'page') {
      const model = printPageModelSnapshot(runtime.packagePath);
      const index =
        model?.pages.findIndex((page) =>
          page.fragments.some((fragment) => fragment.blockId === row.blockId),
        ) ?? -1;
      if (index >= 0) {
        useShell.getState().setDocumentPage(runtime.packagePath, index + 1);
        runtime.selectBlock(row.blockId);
        if (row.anchorId !== undefined) {
          runtime.selectAnchor(row.blockId, row.anchorId);
        }
        return;
      }
      // An unreachable block has no derived page; fall back to Continuous so
      // Locate still reaches it instead of silently doing nothing.
      useShell.getState().setDocumentLayout(runtime.packagePath, 'continuous');
    }
    runtime.expandAncestors(row.blockId);
    runtime.focusBlock(row.blockId, { select: true });
    if (row.anchorId !== undefined) {
      runtime.selectAnchor(row.blockId, row.anchorId);
    }
  };

  const perform = async (
    action: Promise<{ ok: boolean; message?: string }>,
    success: string,
  ): Promise<void> => {
    if (!editingEnabled) {
      setError(READ_ONLY_REASON);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await action;
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message ?? 'The action was rejected.');
      return;
    }
    toast.success(success, {
      action: { label: 'Undo', onClick: () => undoActive() },
    });
    onClose();
  };

  const openDetail = (row: DocumentHealthRow): void => {
    setSelectedRowId(row.id);
    setConfirm(null);
    setPreview(null);
    setError(null);
    setBranchTarget('');
    setMoveChapterId(
      row.category === 'orphan-block'
        ? runtime.document.chapters[0]?.id ?? ''
        : '',
    );
  };

  const closeDetail = (): void => {
    setSelectedRowId(null);
    setConfirm(null);
    setPreview(null);
    setError(null);
    setBranchTarget('');
    setMoveChapterId('');
  };

  // OD-2: an idle record has no branches, so removal needs no branch policy or
  // confirmation. One structural command removes the record and binding; undo
  // restores both exactly. The target blocks are never part of the command.
  const removeIdle = (anchorId: string): void => {
    void (async () => {
      if (!editingEnabled) {
        setError(READ_ONLY_REASON);
        return;
      }
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

  const repairCandidate = (index: number): void => {
    if (!editingEnabled) {
      setError(READ_ONLY_REASON);
      return;
    }
    if (selected === null || selected.anchorId === undefined) return;
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
    if (!editingEnabled) {
      setError(READ_ONLY_REASON);
      return;
    }
    if (selected === null || selected.anchorId === undefined) return;
    setBusy(true);
    setError(null);
    const prepared = await runtime.prepareRepairFromSelection(selected.anchorId);
    setBusy(false);
    if (!prepared.ok) {
      setError(prepared.message);
      return;
    }
    const next = anchorRepairPreview(runtime.document, selected.anchorId, prepared.command);
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

  const branchFromAnchor = (): void => {
    if (selected === null || selected.anchorId === undefined || selected.blockId === undefined) {
      return;
    }
    if (branchTarget.length === 0) return;
    void perform(
      runtime.linkReference({
        sourceBlockId: selected.blockId,
        sourceAnchorId: selected.anchorId,
        targetBlockId: branchTarget,
      }),
      'Reference branch created from the anchor.',
    );
  };

  const stripOrphan = (row: DocumentHealthRow): void => {
    if (row.blockId === undefined || row.anchorId === undefined) return;
    void perform(
      runtime.stripOrphanAnchor(row.blockId, row.anchorId),
      'Anchor ID stripped from the content.',
    );
  };

  const recreateOrphan = (row: DocumentHealthRow): void => {
    if (row.blockId === undefined || row.anchorId === undefined) return;
    void (async () => {
      if (!editingEnabled) {
        setError(READ_ONLY_REASON);
        return;
      }
      setBusy(true);
      setError(null);
      const outcome = await runtime.recreateOrphanAnchor(row.blockId as string, row.anchorId as string);
      setBusy(false);
      if (!outcome.ok) {
        setError(outcome.message ?? 'The anchor could not be recreated.');
        return;
      }
      toast.success('Anchor recreated from the selection.', {
        action: { label: 'Undo', onClick: () => undoActive() },
      });
      onClose();
    })();
  };

  const deleteRecord = (row: DocumentHealthRow): void => {
    if (row.anchorId === undefined) return;
    void (async () => {
      if (!editingEnabled) {
        setError(READ_ONLY_REASON);
        return;
      }
      setBusy(true);
      setError(null);
      const outcome = await runtime.removeIdleAnchor(row.anchorId as string);
      setBusy(false);
      if (!outcome.ok) {
        setError(outcome.message ?? 'The record could not be deleted.');
        return;
      }
      toast.success('Anchor record deleted. No block was changed.', {
        action: { label: 'Undo', onClick: () => undoActive() },
      });
      onClose();
    })();
  };

  const removeBranch = (confirmState: Extract<HealthConfirm, { kind: 'remove-branch' }>): void => {
    void perform(
      runtime.deleteHealthBranch(confirmState.branchId),
      'Branch deleted. The target block was kept.',
    );
  };

  const deleteOrphanBlock = (
    confirmState: Extract<HealthConfirm, { kind: 'delete-orphan-block' }>,
  ): void => {
    void perform(
      runtime.deleteBlock(confirmState.blockId, 'delete-subtree'),
      'Unreachable block deleted.',
    );
  };

  const moveOrphanBlock = (): void => {
    if (selected === null || selected.blockId === undefined || moveChapterId.length === 0) return;
    void perform(
      runtime.moveBlock(selected.blockId, {
        kind: 'top-level',
        chapterId: moveChapterId,
      }),
      'Block moved to the chapter.',
    );
  };

  const addChapterBlock = (): void => {
    if (selected === null || selected.chapterId === undefined) return;
    void perform(
      runtime.addTopLevel(selected.chapterId),
      'Top-level block added to the chapter.',
    );
  };

  const deleteChapter = (confirmState: Extract<HealthConfirm, { kind: 'delete-chapter' }>): void => {
    void perform(
      runtime.deleteEmptyChapter(confirmState.chapterId),
      'Empty chapter deleted.',
    );
  };

  // -----------------------------------------------------------------------
  // Row list
  // -----------------------------------------------------------------------
  const renderRow = (row: DocumentHealthRow): JSX.Element => {
    const isAnchorRow = row.anchorId !== undefined && row.category !== 'orphan-reference';
    return (
      <li
        key={row.id}
        className={`nf-health-row${row.needsRepair ? '' : ' nf-health-row-info'}`}
        data-health-row={row.id}
        data-health-anchor={isAnchorRow ? row.anchorId : undefined}
        data-health-state={row.category}
        data-health-severity={row.severity}
        data-health-kind={row.kind ?? 'structure'}
        data-health-info={row.needsRepair ? undefined : 'true'}
      >
        <button
          type="button"
          className="nf-health-row-main"
          data-health-navigate={isAnchorRow ? row.anchorId : row.id}
          onClick={() => navigate(row)}
        >
          <span className="nf-health-row-top">
            <span
              className={`nf-health-severity nf-health-severity-${row.severity.toLowerCase()}`}
              data-health-severity-label={row.severity}
              title={SEVERITY_LABEL[row.severity]}
            >
              {row.severity}
            </span>
            <span
              className={`nf-health-state nf-health-state-${row.category}`}
              data-health-state-label={row.category}
            >
              {documentHealthStateLabel(row.category)}
            </span>
            <span className="nf-health-kind">
              {row.kind === null ? 'Structure' : KIND_LABEL[row.kind]}
            </span>
            <span
              className="nf-health-branch-count"
              data-health-branch-count={row.branchCount}
            >
              {row.branchCount} {row.branchCount === 1 ? 'branch' : 'branches'}
            </span>
          </span>
          {row.quote.length > 0 ? (
            <span className="nf-health-quote">“{row.quote}”</span>
          ) : null}
          {row.prefix.length > 0 || row.suffix.length > 0 ? (
            <span className="nf-health-context">
              {anchorContextLine(row.prefix, row.quote, row.suffix)}
            </span>
          ) : null}
          <span className="nf-health-block">
            {row.blockTitle} · {row.chapterTitle}
          </span>
          <span className="nf-health-reason">{row.reasonLabel}</span>
        </button>
        {row.category === 'broken' || row.category === 'ambiguous' ? (
          <button
            type="button"
            className="nf-health-repair"
            data-health-repair={row.anchorId}
            aria-label={`Repair anchor “${row.quote || 'anchor'}”`}
            onClick={() => openDetail(row)}
          >
            Repair
          </button>
        ) : null}
        {row.category === 'idle' ? (
          <>
            <button
              type="button"
              className="nf-health-repair nf-health-remove"
              data-health-remove={row.anchorId}
              aria-label={`Remove idle anchor “${row.quote || 'anchor'}”`}
              disabled={busy || !editingEnabled}
              title={editingEnabled ? undefined : READ_ONLY_REASON}
              onClick={() => removeIdle(row.anchorId as string)}
            >
              Remove anchor
            </button>
            <button
              type="button"
              className="nf-health-repair"
              data-health-open={row.id}
              onClick={() => openDetail(row)}
            >
              Review
            </button>
          </>
        ) : null}
        {row.category !== 'broken' &&
        row.category !== 'ambiguous' &&
        row.category !== 'idle' ? (
          <button
            type="button"
            className="nf-health-repair"
            data-health-open={row.id}
            onClick={() => openDetail(row)}
          >
            Review
          </button>
        ) : null}
      </li>
    );
  };

  // -----------------------------------------------------------------------
  // Anchor detail (existing M3e behavior preserved)
  // -----------------------------------------------------------------------
  const renderAnchorDetail = (row: DocumentHealthRow): JSX.Element => {
    const anchorId = row.anchorId ?? '';
    const isLive = row.category === 'broken' || row.category === 'ambiguous';
    return (
      <div className="nf-health-detail" data-health-detail={anchorId}>
        <button type="button" className="nf-health-back" onClick={closeDetail}>
          ← All issues
        </button>
        <div className="nf-health-detail-head">
          <span
            className={`nf-health-severity nf-health-severity-${row.severity.toLowerCase()}`}
            data-health-severity-label={row.severity}
          >
            {row.severity}
          </span>
          <span
            className={`nf-health-state nf-health-state-${row.category}`}
            data-health-state-label={row.category}
          >
            {documentHealthStateLabel(row.category)}
          </span>
          {row.kind === null ? null : (
            <span className="nf-health-kind">{KIND_LABEL[row.kind]}</span>
          )}
          {row.quote.length === 0 ? (
            <span className="nf-health-quote">“anchor”</span>
          ) : (
            <span className="nf-health-quote">“{row.quote}”</span>
          )}
        </div>
        <p className="nf-health-detail-meta">
          {row.blockTitle} · {row.chapterTitle}
        </p>
        {row.prefix.length > 0 || row.suffix.length > 0 ? (
          <p className="nf-health-detail-context">
            {anchorContextLine(row.prefix, row.quote, row.suffix)}
          </p>
        ) : null}
        <p className="nf-health-reason" data-health-reason={row.reason}>
          {row.reasonLabel}
        </p>

        {row.category === 'anchor-block-missing' ? (
          <p className="nf-dialog-note" data-health-missing-block-note="true">
            The anchor’s block no longer exists. NoteForest refuses this structure on open, so
            no repair is applied here; a branch removal reports the exact reason if attempted.
          </p>
        ) : null}

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
              Confirm applies one undoable repair. Cancel or closing this sheet changes nothing;
              the anchor and branch IDs stay the same.
            </p>
            <div className="nf-health-preview-grid">
              <div className="nf-health-preview-side" data-health-preview-side="before">
                <span className="nf-health-preview-label">Before</span>
                <span className="nf-health-preview-quote">“{preview.preview.before.quote}”</span>
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
                <span className="nf-health-preview-quote">“{preview.preview.after.quote}”</span>
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
                isDisabled={busy || !editingEnabled}
                onPress={confirmRepair}
              >
                Confirm repair
              </Button>
            </div>
          </section>
        )}

        <section className="nf-health-section">
          <h3 className="nf-health-section-title">Branches</h3>
          {row.branchCount === 0 ? (
            <p className="nf-dialog-note" data-health-idle-note="true">
              This anchor has no branches.
            </p>
          ) : (
            <ul className="nf-health-branches">
              {row.branches.map((branch) => (
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
                    isDisabled={busy || !editingEnabled}
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

        {isLive && candidates.length > 0 && row.kind !== 'image' ? (
          <section className="nf-health-section" data-health-candidates="true">
            <h3 className="nf-health-section-title">
              {row.category === 'ambiguous' ? 'Choose a matching location' : 'Matching locations'}
            </h3>
            <div className="nf-health-candidate-list">
              {candidates.map((view) => (
                <button
                  key={`${view.index}-${view.label}`}
                  type="button"
                  className="nf-health-candidate"
                  data-health-candidate={view.index}
                  disabled={busy || !editingEnabled}
                  title={editingEnabled ? undefined : READ_ONLY_REASON}
                  onClick={() => repairCandidate(view.index)}
                >
                  <span className="nf-health-candidate-label">{view.label}</span>
                  <span className="nf-health-candidate-context">{view.context}</span>
                </button>
              ))}
            </div>
            <p className="nf-dialog-note">
              Selecting a candidate shows a before/after preview. Nothing changes until Confirm;
              then the repair keeps the anchor and branch IDs and is one undo entry. Repeated
              identical terms or code quotes remain ambiguous until the source itself is unique.
            </p>
          </section>
        ) : null}

        {row.category === 'idle' ? (
          <>
            <div className="nf-health-actions">
              <Button
                className="nf-button nf-button-quiet"
                data-health-action="remove-idle"
                isDisabled={busy || !editingEnabled}
                onPress={() => removeIdle(anchorId)}
              >
                Remove anchor
              </Button>
              <Button
                className="nf-button nf-button-quiet"
                data-health-action="locate-expand"
                onPress={() => navigate(row)}
              >
                Expand &amp; locate
              </Button>
            </div>
            <section className="nf-health-section" data-health-branch-from-anchor="true">
              <h3 className="nf-health-section-title">Branch from anchor</h3>
              {branchChoices.length === 0 ? (
                <p className="nf-dialog-note">There is no other block to branch to.</p>
              ) : (
                <>
                  <label className="nf-field">
                    <span className="nf-field-label">Target block</span>
                    <select
                      className="nf-input"
                      data-health-branch-target="true"
                      aria-label="Branch target block"
                      value={branchTarget}
                      disabled={busy || !editingEnabled}
                      onChange={(event) => setBranchTarget(event.target.value)}
                    >
                      <option value="">Choose a block…</option>
                      {branchChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="nf-health-actions">
                    <Button
                      className="nf-button"
                      data-health-action="branch-from-anchor"
                      isDisabled={busy || !editingEnabled || branchTarget.length === 0}
                      onPress={branchFromAnchor}
                    >
                      Branch from anchor…
                    </Button>
                  </div>
                  <p className="nf-dialog-note">
                    The target keeps its primary home; this adds a reference edge from the anchor
                    in one undoable command.
                  </p>
                </>
              )}
            </section>
          </>
        ) : null}

        {row.category === 'orphan-record' ? (
          <div className="nf-health-actions">
            <Button
              className="nf-button nf-button-danger"
              data-health-action="delete-record"
              isDisabled={busy || !editingEnabled}
              onPress={() => deleteRecord(row)}
            >
              Delete record
            </Button>
          </div>
        ) : null}

        {row.category === 'hidden' ? (
          <div className="nf-health-actions">
            <Button
              className="nf-button"
              data-health-action="locate-expand"
              onPress={() => navigate(row)}
            >
              Expand &amp; locate
            </Button>
          </div>
        ) : null}

        {isLive ? (
          <div className="nf-health-actions">
            {row.kind === 'image' ? (
              <p className="nf-dialog-note" data-health-image-repair-note="true">
                Re-picking an image region is a follow-up. The branch, target, and alt text are
                kept: attach the branches to the block, delete the anchor, or keep it broken.
              </p>
            ) : (
              <Button
                className="nf-button"
                data-health-action="relink"
                isDisabled={busy || !editingEnabled}
                onPress={() => void previewRelink()}
              >
                Relink to current selection
              </Button>
            )}
            <Button
              className="nf-button"
              data-health-action="attach"
              isDisabled={busy || !editingEnabled}
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
                runtime.keepAnchorBroken(anchorId);
                toast.info('Kept broken for this session. Nothing was changed.');
                onClose();
              }}
            >
              Keep broken
            </Button>
            <Button
              className="nf-button nf-button-danger"
              data-health-action="delete-anchor"
              isDisabled={busy || !editingEnabled}
              onPress={() => {
                setPreview(null);
                setConfirm({ kind: 'delete-anchor', mode: 'attach' });
              }}
            >
              Delete anchor…
            </Button>
          </div>
        ) : null}

        {renderConfirm(row)}
        {error === null ? null : (
          <p className="nf-dialog-text nf-dialog-error" role="alert" data-health-error="true">
            {error}
          </p>
        )}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Structure / orphan-reference detail
  // -----------------------------------------------------------------------
  const renderStructureDetail = (row: DocumentHealthRow): JSX.Element => {
    return (
      <div className="nf-health-detail" data-health-detail={row.id}>
        <button type="button" className="nf-health-back" onClick={closeDetail}>
          ← All issues
        </button>
        <div className="nf-health-detail-head">
          <span
            className={`nf-health-severity nf-health-severity-${row.severity.toLowerCase()}`}
            data-health-severity-label={row.severity}
          >
            {row.severity}
          </span>
          <span
            className={`nf-health-state nf-health-state-${row.category}`}
            data-health-state-label={row.category}
          >
            {documentHealthStateLabel(row.category)}
          </span>
          <span className="nf-health-kind">
            {row.kind === null ? 'Structure' : KIND_LABEL[row.kind]}
          </span>
          {row.quote.length > 0 ? (
            <span className="nf-health-quote">“{row.quote}”</span>
          ) : null}
        </div>
        <p className="nf-health-detail-meta">
          {row.blockTitle} · {row.chapterTitle}
        </p>
        <p className="nf-health-reason" data-health-reason={row.reason}>
          {row.reasonLabel}
        </p>

        {row.occurrences !== undefined && row.occurrences.length > 0 ? (
          <section className="nf-health-section" data-health-occurrences="true">
            <h3 className="nf-health-section-title">Stale bindings</h3>
            <ul className="nf-health-branches">
              {row.occurrences.map((occurrence) => (
                <li
                  key={`${occurrence.blockId}:${occurrence.nodePath.join('.')}`}
                  className="nf-health-branch"
                  data-health-occurrence={occurrence.nodePath.join('.')}
                >
                  <span className="nf-health-branch-role">{occurrence.source}</span>
                  <span className="nf-health-branch-target">
                    {occurrence.nodeType} at node {occurrence.nodePath.join('.')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {row.category === 'branch-target-missing' ? (
          <>
            <p className="nf-dialog-note">
              The branch points at a block that no longer exists. Relinking a missing target is
              planned for v2; removing the dangling branch is the safe v1 action.
            </p>
            <div className="nf-health-actions">
              <Button
                className="nf-button nf-button-danger"
                data-health-action="remove-branch"
                isDisabled={busy || !editingEnabled}
                onPress={() => {
                  if (row.branchId === undefined) return;
                  setConfirm({
                    kind: 'remove-branch',
                    branchId: row.branchId,
                    targetTitle: row.branches[0]?.targetTitle ?? 'Missing block',
                  });
                }}
              >
                Remove branch…
              </Button>
            </div>
          </>
        ) : null}

        {row.category === 'orphan-block' ? (
          <>
            <section className="nf-health-section" data-health-move-orphan="true">
              <h3 className="nf-health-section-title">Move to chapter</h3>
              <label className="nf-field">
                <span className="nf-field-label">Chapter</span>
                <select
                  className="nf-input"
                  data-health-move-chapter="true"
                  aria-label="Move the unreachable block to a chapter"
                  value={moveChapterId}
                  disabled={busy || !editingEnabled}
                  onChange={(event) => setMoveChapterId(event.target.value)}
                >
                  {chapterChoices.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="nf-health-actions">
                <Button
                  className="nf-button"
                  data-health-action="move-orphan-block"
                  isDisabled={
                    busy || !editingEnabled || moveChapterId.length === 0
                  }
                  onPress={moveOrphanBlock}
                >
                  Move to chapter…
                </Button>
              </div>
            </section>
            <div className="nf-health-actions">
              <Button
                className="nf-button nf-button-danger"
                data-health-action="delete-orphan-block"
                isDisabled={busy || !editingEnabled}
                onPress={() => {
                  if (row.blockId === undefined) return;
                  setConfirm({
                    kind: 'delete-orphan-block',
                    blockId: row.blockId,
                    title: row.blockTitle,
                  });
                }}
              >
                Delete block…
              </Button>
            </div>
          </>
        ) : null}

        {row.category === 'orphan-reference' ? (
          <>
            <p className="nf-dialog-note">
              Strip the stale ID, or select the orphaned range in the editor and recreate the
              anchor record from that selection. Recreating the record at a different range is
              rejected by the command layer so a second binding can never appear.
            </p>
            <div className="nf-health-actions">
              <Button
                className="nf-button"
                data-health-action="strip-orphan"
                isDisabled={busy || !editingEnabled}
                onPress={() => stripOrphan(row)}
              >
                Strip ID
              </Button>
              <Button
                className="nf-button"
                data-health-action="recreate-orphan"
                isDisabled={busy || !editingEnabled}
                onPress={() => recreateOrphan(row)}
              >
                Recreate anchor from selection…
              </Button>
            </div>
          </>
        ) : null}

        {row.category === 'duplicate-primary' || row.category === 'cycle' ? (
          <p className="nf-dialog-note" data-health-no-fix={row.category}>
            Document health never rewrites branch structure automatically and offers no
            destructive bulk fix. Restore a backup copy, or repair the primary edges with the
            normal branch commands.
          </p>
        ) : null}

        {row.category === 'empty-chapter' ? (
          <div className="nf-health-actions">
            <Button
              className="nf-button"
              data-health-action="add-chapter-block"
              isDisabled={busy || !editingEnabled}
              onPress={addChapterBlock}
            >
              Add block
            </Button>
            <Button
              className="nf-button nf-button-danger"
              data-health-action="delete-chapter"
              isDisabled={busy || !editingEnabled}
              onPress={() => {
                if (row.chapterId === undefined) return;
                setConfirm({
                  kind: 'delete-chapter',
                  chapterId: row.chapterId,
                  title: row.chapterTitle,
                });
              }}
            >
              Delete chapter…
            </Button>
          </div>
        ) : null}

        {row.category !== 'empty-chapter' && row.category !== 'orphan-block' ? (
          <div className="nf-health-actions">
            <Button
              className="nf-button"
              data-health-action="locate-expand"
              onPress={() => navigate(row)}
            >
              Expand &amp; locate
            </Button>
          </div>
        ) : null}

        {renderConfirm(row)}
        {error === null ? null : (
          <p className="nf-dialog-text nf-dialog-error" role="alert" data-health-error="true">
            {error}
          </p>
        )}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Confirmation blocks shared by both detail variants
  // -----------------------------------------------------------------------
  function renderConfirm(row: DocumentHealthRow): JSX.Element | null {
    if (confirm === null) return null;
    const confirmBox = (children: React.ReactNode): JSX.Element => (
      <div
        className="nf-health-confirm"
        data-health-confirm={confirm.kind}
        role="group"
        aria-label="Confirm document health action"
      >
        {children}
      </div>
    );
    const cancel = (
      <Button className="nf-button" onPress={() => setConfirm(null)} isDisabled={busy}>
        Cancel
      </Button>
    );

    if (confirm.kind === 'attach') {
      return confirmBox(
        <>
          <p className="nf-dialog-text">
            Move {row.branchCount} {row.branchCount === 1 ? 'branch' : 'branches'} from this
            anchor to the block itself. Branch IDs, labels, and target blocks stay; one undo
            restores the anchored sources.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <Button
              className="nf-button nf-button-primary"
              data-health-confirm-action="attach"
              isDisabled={busy || !editingEnabled}
              onPress={() =>
                void perform(
                  runtime.attachAnchorToBlock(row.anchorId as string),
                  'Branches attached to the block.',
                )
              }
            >
              Attach
            </Button>
          </div>
        </>,
      );
    }

    if (confirm.kind === 'delete-branch') {
      return confirmBox(
        <>
          <p className="nf-dialog-text">
            Delete this branch to “{confirm.targetTitle}”? The target block and its subtree stay;
            a primary target becomes a top-level block. Undo restores the branch.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <Button
              className="nf-button nf-button-danger"
              data-health-confirm-action="delete-branch"
              isDisabled={busy || !editingEnabled}
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
        </>,
      );
    }

    if (confirm.kind === 'delete-anchor') {
      return confirmBox(
        <>
          <p className="nf-dialog-text">
            Delete the anchor itself? Target blocks are never deleted. Choose what happens to the
            outgoing branches.
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
            {cancel}
            <Button
              className="nf-button nf-button-danger"
              data-health-confirm-action="delete-anchor"
              isDisabled={busy || !editingEnabled}
              onPress={() =>
                void perform(
                  runtime.deleteAnchor(row.anchorId as string, confirm.mode),
                  'Anchor deleted. Target blocks were kept.',
                )
              }
            >
              Delete anchor
            </Button>
          </div>
        </>,
      );
    }

    if (confirm.kind === 'remove-branch') {
      return confirmBox(
        <>
          <p className="nf-dialog-text">
            Delete the dangling edge to “{confirm.targetTitle}”? No block or anchor is deleted.
            The command layer refuses a document whose target is missing, so a rejection is shown
            here instead of a partial change.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <Button
              className="nf-button nf-button-danger"
              data-health-confirm-action="remove-branch"
              isDisabled={busy || !editingEnabled}
              onPress={() => removeBranch(confirm)}
            >
              Remove branch
            </Button>
          </div>
        </>,
      );
    }

    if (confirm.kind === 'delete-orphan-block') {
      return confirmBox(
        <>
          <p className="nf-dialog-text">
            Delete “{confirm.title}” and its unreachable subtree? The block is not part of any
            chapter, so it is invisible in the editor. Undo restores it.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <Button
              className="nf-button nf-button-danger"
              data-health-confirm-action="delete-orphan-block"
              isDisabled={busy || !editingEnabled}
              onPress={() => deleteOrphanBlock(confirm)}
            >
              Delete block
            </Button>
          </div>
        </>,
      );
    }

    return confirmBox(
      <>
        <p className="nf-dialog-text">
          Delete the empty chapter “{confirm.title}”? It has no top-level blocks, so no content is
          removed. Undo restores the chapter.
        </p>
        <div className="nf-dialog-inline-actions">
          {cancel}
          <Button
            className="nf-button nf-button-danger"
            data-health-confirm-action="delete-chapter"
            isDisabled={busy || !editingEnabled}
            onPress={() => deleteChapter(confirm)}
          >
            Delete chapter
          </Button>
        </div>
      </>,
    );
  }

  const emptyInfoParts: string[] = [];
  if (report.info.idle > 0) {
    emptyInfoParts.push(`${report.info.idle} idle ${report.info.idle === 1 ? 'anchor' : 'anchors'}`);
  }
  if (report.info.orphans > 0) {
    emptyInfoParts.push(plural(report.info.orphans, 'orphan', 'orphans'));
  }
  if (report.info.structure > 0) {
    emptyInfoParts.push(
      `${report.info.structure} ${report.info.structure === 1 ? 'structure' : 'structures'}`,
    );
  }
  if (report.info.hidden > 0) {
    emptyInfoParts.push(`${report.info.hidden} hidden`);
  }

  return (
    <Frame
      title="Document health"
      description="A read-only audit of anchors and structure. Actions are single undoable commands; nothing is fixed automatically."
      wide
      actions={<Button className="nf-button" onPress={onClose}>Close</Button>}
    >
      <div className="nf-health" data-anchor-health="true">
        {editingEnabled ? null : (
          <p className="nf-dialog-note" data-health-read-only="true">
            {READ_ONLY_REASON}
          </p>
        )}
        <div className="nf-health-toolbar">
          <p className="nf-health-summary" data-health-summary="true">
            <span
              data-health-count-all={report.counts.all}
              data-health-count-needs-repair={report.counts.needsRepair}
              data-health-count-broken={report.counts.broken}
              data-health-count-ambiguous={report.counts.ambiguous}
              data-health-count-idle={report.counts.idle}
              data-health-count-orphans={report.counts.orphans}
              data-health-count-structure={report.counts.structure}
              data-health-count-hidden={report.counts.hidden}
            >
              {summaryText(report)}
            </span>
          </p>
          <Button
            className="nf-button nf-button-quiet"
            data-health-check-again="true"
            onPress={() => {
              setError(null);
              setCheckToken((value) => value + 1);
            }}
          >
            Check again
          </Button>
        </div>

        {selected === null ? (
          <>
            <Input
              className="nf-input"
              data-health-search="true"
              aria-label="Search document health"
              placeholder="Search block, chapter, quote, or kind"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="nf-health-filters" role="group" aria-label="Filter document health">
              {DOCUMENT_HEALTH_FILTERS.map((definition) => {
                const count = documentHealthFilterCount(report.counts, definition.id);
                return (
                  <button
                    key={definition.id}
                    type="button"
                    className="nf-health-filter"
                    data-health-filter={definition.id}
                    data-health-filter-count={count}
                    aria-pressed={filter === definition.id}
                    autoFocus={definition.id === 'all'}
                    onClick={() => setFilter(definition.id)}
                  >
                    {definition.label} · {count}
                  </button>
                );
              })}
            </div>
            {visible.length === 0 ? (
              <div className="nf-health-empty" data-health-empty="true">
                <p>
                  {report.counts.all === 0
                    ? 'No document issues need repair.'
                    : 'No issues match this filter.'}
                </p>
                {report.counts.all === 0 && emptyInfoParts.length > 0 ? (
                  <p className="nf-health-empty-info" data-health-empty-info="true">
                    {emptyInfoParts.join(' · ')}
                  </p>
                ) : null}
              </div>
            ) : (
              <ul className="nf-health-list" aria-label="Document health issues">
                {visible.map(renderRow)}
              </ul>
            )}
            {error === null ? null : (
              <p className="nf-dialog-text nf-dialog-error" role="alert" data-health-error="true">
                {error}
              </p>
            )}
          </>
        ) : selected.anchorId !== undefined &&
          (selected.category === 'broken' ||
            selected.category === 'ambiguous' ||
            selected.category === 'idle' ||
            selected.category === 'hidden' ||
            selected.category === 'orphan-record' ||
            selected.category === 'anchor-block-missing') ? (
          renderAnchorDetail(selected)
        ) : (
          renderStructureDetail(selected)
        )}
      </div>
    </Frame>
  );
}
