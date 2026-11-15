/**
 * Document health repair modal (S2, 520 px).
 *
 * One issue per modal, opened from a row in the Health sidebar; the list stays
 * behind it, so closing never loses the report. The body carries the context,
 * the matching locations and the branches; the footer carries Show in note,
 * Close and the category's primary action. A chosen repair previews Before/After
 * in the same modal: Back returns to the issue, Esc follows the same stack, and
 * Confirm applies exactly what was previewed as one undoable command and closes
 * the modal. Read mode keeps Show in note and Close and disables every mutation
 * with one line of why.
 */

import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useEffect, useMemo, useState } from 'react';
import { Info, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AnchorKind } from '@noteforest/core';
import { undoActive } from '../actions';
import { useShell } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import {
  anchorCandidateViews,
  anchorContextLine,
  anchorRepairPreview,
  repairCommandForCandidate,
  type AnchorRepairPreview,
} from '../lib/anchor-health';
import {
  DOCUMENT_HEALTH_CATEGORY_LABELS,
  type DocumentHealthRow,
} from '../lib/document-health';
import {
  HEALTH_ACTIONS,
  documentHealthActionPlan,
  type HealthActionId,
} from '../lib/document-health-actions';
import { nextDocumentHealthRowId } from '../lib/document-health-sections';
import { editingEnabledFor } from '../lib/editability';
import { blockTitle, chapterIdOf } from '../lib/tree';
import { printPageModelSnapshot } from '../page/print-model-registry';
import { useDocumentHealthReport } from './useDocumentHealth';
import { focusHealthRow } from './health-focus';

const READ_ONLY_REASON = 'Read mode — switch to Continuous Edit to repair document issues.';

const KIND_LABEL: Record<AnchorKind, string> = {
  text: 'Text',
  formula: 'Formula',
  code: 'Code',
  image: 'Image',
};

const SEVERITY_LABEL: Record<DocumentHealthRow['severity'], string> = {
  S1: 'Data risk',
  S2: 'Needs repair',
  S3: 'Information',
};

type HealthConfirm =
  | { kind: 'attach' }
  | { kind: 'delete-branch'; branchId: string; targetTitle: string }
  | { kind: 'delete-anchor' }
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

function rowLabel(row: DocumentHealthRow): string {
  if (row.quote.length > 0) return row.quote;
  return DOCUMENT_HEALTH_CATEGORY_LABELS[row.category];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function HealthRepairDialog({
  runtime,
  rowId,
  onClose,
}: {
  runtime: DocumentRuntime;
  rowId: string;
  onClose: () => void;
}): JSX.Element | null {
  const report = useDocumentHealthReport(runtime);
  // The issue is a snapshot: a successful command removes it from the audit
  // before the modal unmounts, and the closing frame must not flicker.
  const [row] = useState<DocumentHealthRow | null>(
    () => report?.rows.find((candidate) => candidate.id === rowId) ?? null,
  );
  const nextRowId = useMemo(
    () => (report === null ? null : nextDocumentHealthRowId(report.rows, rowId)),
    [report, rowId],
  );
  const [preview, setPreview] = useState<HealthRepairPreviewState | null>(null);
  const [candidateIndex, setCandidateIndex] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<HealthConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branchTarget, setBranchTarget] = useState('');
  const [moveChapterId, setMoveChapterId] = useState('');

  const editingEnabled = useShell((state) =>
    editingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  const layout = useShell(
    (state) => state.viewByDoc[runtime.packagePath]?.layout ?? 'continuous',
  );

  useEffect(() => {
    if (row === null) onClose();
  }, [row, onClose]);

  // Esc is the modal's own stack: confirm → issue → close. A capture listener
  // runs before the modal's dismiss handler, so one keypress moves one step.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (preview !== null) {
        setPreview(null);
        return;
      }
      if (confirm !== null) {
        setConfirm(null);
        return;
      }
      onClose();
      focusHealthRow(row?.id ?? null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [preview, confirm, onClose, row?.id]);

  if (row === null) return null;

  const candidates =
    row.resolution === undefined
      ? []
      : anchorCandidateViews(runtime.document, row.anchorId ?? '', row.resolution);

  const branchChoices: BlockChoice[] = Object.keys(runtime.document.blocks)
    .filter((id) => id !== row.blockId)
    .map((id) => {
      const chapterId = chapterIdOf(runtime.document, id);
      const chapter = runtime.document.chapters.find((item) => item.id === chapterId);
      return {
        id,
        label: `${blockTitle(runtime.document.blocks[id])} · ${chapter?.title ?? 'No chapter'}`,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  const chapterChoices: ChapterChoice[] = runtime.document.chapters.map(
    (chapter, index) => ({
      id: chapter.id,
      label: chapter.title?.trim() || `Untitled chapter ${index + 1}`,
    }),
  );

  const closeWithFocus = (nextId: string | null): void => {
    onClose();
    focusHealthRow(nextId);
  };

  /** Show in note: close, reveal the block/term, never change the layout. */
  const navigate = (target: DocumentHealthRow): void => {
    onClose();
    requestAnimationFrame(() => {
      if (target.category === 'empty-chapter') {
        if (target.chapterId === undefined) return;
        const section = document.querySelector(
          `.nf-editor[data-active="true"] [data-chapter-id="${CSS.escape(
            target.chapterId,
          )}"]`,
        );
        section?.scrollIntoView({ block: 'center' });
        return;
      }
      if (target.blockId === undefined) return;
      if (layout === 'page') {
        const model = printPageModelSnapshot(runtime.packagePath);
        const index =
          model?.pages.findIndex((page) =>
            page.fragments.some((fragment) => fragment.blockId === target.blockId),
          ) ?? -1;
        // An unreachable block has no derived page. The layout never changes
        // from here: the modal closes and the user stays in Page.
        if (index < 0) return;
        useShell.getState().setDocumentPage(runtime.packagePath, index + 1);
        runtime.selectBlock(target.blockId);
        if (target.anchorId !== undefined) {
          runtime.selectAnchor(target.blockId, target.anchorId);
        }
        return;
      }
      runtime.expandAncestors(target.blockId);
      runtime.focusBlock(target.blockId, { select: true });
      if (target.anchorId !== undefined) {
        runtime.selectAnchor(target.blockId, target.anchorId);
      }
    });
  };

  const finish = (success: string): void => {
    toast.success(success, {
      action: { label: 'Undo', onClick: () => undoActive() },
    });
    useShell.getState().setHealthSelectedRowId(nextRowId);
    closeWithFocus(nextRowId);
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
    finish(success);
  };

  // -----------------------------------------------------------------------
  // Actions (v1 coverage, design §4)
  // -----------------------------------------------------------------------
  const previewCandidate = (): void => {
    if (!editingEnabled) {
      setError(READ_ONLY_REASON);
      return;
    }
    if (candidateIndex === null || row.anchorId === undefined) return;
    const view = candidates.find((candidate) => candidate.index === candidateIndex);
    const command =
      view === undefined
        ? null
        : repairCommandForCandidate(runtime.document, row.anchorId, view.candidate);
    if (command === null) {
      setError('That candidate cannot be applied with the current selector.');
      return;
    }
    const next = anchorRepairPreview(runtime.document, row.anchorId, command);
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
    if (row.anchorId === undefined) return;
    setBusy(true);
    setError(null);
    const prepared = await runtime.prepareRepairFromSelection(row.anchorId);
    setBusy(false);
    if (!prepared.ok) {
      setError(prepared.message);
      return;
    }
    const next = anchorRepairPreview(runtime.document, row.anchorId, prepared.command);
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

  const attachAnchor = (): void => {
    if (row.anchorId === undefined) return;
    void perform(
      runtime.attachAnchorToBlock(row.anchorId),
      'Branches kept; the anchor was removed.',
    );
  };

  const deleteAnchorWithBranches = (): void => {
    if (row.anchorId === undefined) return;
    void perform(
      runtime.deleteAnchor(row.anchorId, 'delete'),
      'Anchor and branches deleted. Target blocks were kept.',
    );
  };

  const keepAsIs = (): void => {
    if (row.anchorId === undefined) return;
    runtime.keepAnchorBroken(row.anchorId);
    toast.info('Kept as is for this session. Nothing was changed.');
    closeWithFocus(row.id);
  };

  const removeAnchorRecord = (): void => {
    if (row.anchorId === undefined) return;
    void perform(
      runtime.removeIdleAnchor(row.anchorId),
      row.category === 'orphan-record'
        ? 'Unused anchor deleted. No block was changed.'
        : 'Anchor removed. The target block was kept.',
    );
  };

  const removeMark = (): void => {
    if (row.blockId === undefined || row.anchorId === undefined) return;
    void perform(
      runtime.stripOrphanAnchor(row.blockId, row.anchorId),
      'Mark removed from the content.',
    );
  };

  const recreateLink = async (): Promise<void> => {
    if (!editingEnabled) {
      setError(READ_ONLY_REASON);
      return;
    }
    if (row.blockId === undefined || row.anchorId === undefined) return;
    setBusy(true);
    setError(null);
    const outcome = await runtime.recreateOrphanAnchor(row.blockId, row.anchorId);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message ?? 'The link could not be recreated.');
      return;
    }
    finish('Link recreated from the selection.');
  };

  const branchFromAnchor = (): void => {
    if (row.anchorId === undefined || row.blockId === undefined) return;
    if (branchTarget.length === 0) return;
    void perform(
      runtime.linkReference({
        sourceBlockId: row.blockId,
        sourceAnchorId: row.anchorId,
        targetBlockId: branchTarget,
      }),
      'Branch added from the anchor.',
    );
  };

  const removeHealthBranch = (branchId: string): void => {
    void perform(
      runtime.deleteHealthBranch(branchId),
      'Branch deleted. The target block was kept.',
    );
  };

  const deleteAnchorBranch = (branchId: string): void => {
    void perform(
      runtime.deleteAnchorBranch(branchId),
      'Branch deleted. The target block was kept.',
    );
  };

  const deleteBlock = (blockId: string): void => {
    void perform(runtime.deleteBlock(blockId, 'delete-subtree'), 'Unreachable block deleted.');
  };

  const moveBlock = (): void => {
    if (row.blockId === undefined || moveChapterId.length === 0) return;
    void perform(
      runtime.moveBlock(row.blockId, { kind: 'top-level', chapterId: moveChapterId }),
      'Block moved to the chapter.',
    );
  };

  const addChapterBlock = (): void => {
    if (row.chapterId === undefined) return;
    void perform(runtime.addTopLevel(row.chapterId), 'Top-level block added to the chapter.');
  };

  const deleteChapter = (chapterId: string): void => {
    void perform(runtime.deleteEmptyChapter(chapterId), 'Empty chapter deleted.');
  };

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------
  const isLive = row.category === 'broken' || row.category === 'ambiguous';
  const showCandidates = isLive && row.kind !== 'image' && candidates.length > 0;
  const showRelink = isLive && row.kind !== 'image';

  const section = (
    title: string,
    body: React.ReactNode,
    extra: Record<string, string> = {},
  ): JSX.Element => (
    <section className="nf-health-issue-section" {...extra}>
      <h3 className="nf-health-issue-section-title">{title}</h3>
      {body}
    </section>
  );

  const renderCandidates = (): JSX.Element | null => {
    if (!showCandidates) return null;
    return section(
      row.category === 'ambiguous' ? 'Choose a matching location' : 'Matching locations',
      <>
        <div className="nf-health-candidate-list">
          {candidates.map((view) => (
            <button
              key={`${view.index}-${view.label}`}
              type="button"
              className="nf-health-candidate"
              data-health-candidate={view.index}
              aria-pressed={candidateIndex === view.index}
              disabled={busy || !editingEnabled}
              title={editingEnabled ? undefined : READ_ONLY_REASON}
              onClick={() => {
                setCandidateIndex(view.index);
                setError(null);
              }}
            >
              <span className="nf-health-candidate-label">{view.label}</span>
              <span className="nf-health-candidate-context">{view.context}</span>
            </button>
          ))}
        </div>
        <p className="nf-dialog-note">
          Choosing a match then Preview repair shows the exact before/after. Nothing changes
          until Confirm; the anchor and branch IDs stay the same.
        </p>
      </>,
      { 'data-health-candidates': 'true' },
    );
  };

  const renderBranches = (): JSX.Element =>
    section(
      'Branches',
      row.branches.length === 0 ? (
        <p className="nf-dialog-note" data-health-idle-note="true">
          {row.category === 'idle' || row.category === 'orphan-record'
            ? 'This anchor has no branches.'
            : 'No outgoing branches.'}
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
              {row.anchorId === undefined ? null : (
                <button
                  type="button"
                  className="nf-button nf-button-quiet nf-health-branch-delete"
                  data-health-action="delete-branch"
                  disabled={busy || !editingEnabled}
                  title={editingEnabled ? undefined : READ_ONLY_REASON}
                  onClick={() => {
                    setPreview(null);
                    setConfirm({
                      kind: 'delete-branch',
                      branchId: branch.id,
                      targetTitle: branch.targetTitle,
                    });
                  }}
                >
                  Delete branch…
                </button>
              )}
            </li>
          ))}
        </ul>
      ),
    );

  const plan = documentHealthActionPlan(row.category, {
    kind: row.kind,
    hasCandidates: candidates.length > 0,
  });

  const actionHandlers: Record<HealthActionId, () => void> = {
    'preview-repair': previewCandidate,
    relink: () => void previewRelink(),
    'recreate-link': () => void recreateLink(),
    'remove-mark': removeMark,
    attach: () => {
      setPreview(null);
      setConfirm({ kind: 'attach' });
    },
    keep: keepAsIs,
    'delete-anchor': () => {
      setPreview(null);
      setConfirm({ kind: 'delete-anchor' });
    },
    'add-branch': branchFromAnchor,
    'remove-anchor': removeAnchorRecord,
    'delete-unused': () => {
      setPreview(null);
      setConfirm({ kind: 'delete-anchor' });
    },
    'remove-branch': () => {
      if (row.branchId === undefined) return;
      setConfirm({
        kind: 'remove-branch',
        branchId: row.branchId,
        targetTitle: row.branches[0]?.targetTitle ?? 'Missing block',
      });
    },
    'move-block': moveBlock,
    'delete-block': () => {
      if (row.blockId === undefined) return;
      setConfirm({
        kind: 'delete-orphan-block',
        blockId: row.blockId,
        title: row.blockTitle,
      });
    },
    'add-block': addChapterBlock,
    'delete-chapter': () => {
      if (row.chapterId === undefined) return;
      setConfirm({
        kind: 'delete-chapter',
        chapterId: row.chapterId,
        title: row.chapterTitle,
      });
    },
  };

  const actionDisabled = (action: HealthActionId): boolean => {
    if (action === 'preview-repair') return candidateIndex === null;
    if (action === 'add-branch') return branchTarget.length === 0;
    if (action === 'move-block') return moveChapterId.length === 0;
    return false;
  };

  const renderAction = (
    action: HealthActionId,
    emphasis: 'quiet' | 'primary',
  ): JSX.Element => {
    const definition = HEALTH_ACTIONS[action];
    const disabled = busy || (emphasis === 'primary' ? !editingEnabled : false);
    // `keep` changes no document content, so Read mode keeps it available.
    const readOnly = !editingEnabled && action !== 'keep';
    return (
      <button
        key={action}
        type="button"
        className={`nf-button ${
          emphasis === 'primary' ? 'nf-button-primary' : 'nf-button-quiet'
        }${definition.danger && emphasis === 'quiet' ? ' nf-health-danger' : ''}`}
        data-health-action={action}
        disabled={disabled || readOnly || actionDisabled(action)}
        title={readOnly ? READ_ONLY_REASON : undefined}
        onClick={actionHandlers[action]}
      >
        {definition.label}
      </button>
    );
  };

  const renderActions = (): JSX.Element | null => {
    if (plan.body.length === 0) return null;
    return (
      <div className="nf-health-actions">
        {plan.body.map((action) => renderAction(action, 'quiet'))}
      </div>
    );
  };

  const renderGuidance = (): JSX.Element | null => {
    if (plan.guidance === 'missing-block') {
      return (
        <p className="nf-dialog-note" data-health-missing-block-note="true">
          The anchor’s block no longer exists. NoteForest refuses this structure on open, so no
          repair is applied here; a branch removal reports the exact reason if attempted.
        </p>
      );
    }
    if (plan.guidance === 'no-fix') {
      return (
        <p className="nf-dialog-note" data-health-no-fix={row.category}>
          Document health never rewrites branch structure automatically and offers no destructive
          bulk fix. Restore a backup copy, or repair the primary edges with the normal branch
          commands.
        </p>
      );
    }
    if (plan.guidance === 'missing-target') {
      return (
        <p className="nf-dialog-note" data-health-missing-target-note="true">
          The branch points at a block that no longer exists. Relinking a missing target is
          planned for v2; removing the dangling branch is the safe v1 action.
        </p>
      );
    }
    if (plan.guidance === 'unlinked-mark') {
      return (
        <p className="nf-dialog-note" data-health-unlinked-mark-note="true">
          Remove the stale ID, or select the orphaned range in the editor and recreate the anchor
          record from that selection. Recreating at a different range is rejected so a second
          binding can never appear.
        </p>
      );
    }
    return null;
  };

  const renderPrimary = (): JSX.Element | null =>
    plan.primary === null ? null : renderAction(plan.primary, 'primary');

  const renderInlineConfirm = (): JSX.Element | null => {
    if (confirm === null) return null;
    const box = (children: React.ReactNode): JSX.Element => (
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
      <button
        type="button"
        className="nf-button"
        disabled={busy}
        onClick={() => setConfirm(null)}
      >
        Cancel
      </button>
    );
    if (confirm.kind === 'attach') {
      return box(
        <>
          <p className="nf-dialog-text">
            Keep {plural(row.branchCount, 'branch', 'branches')} and remove the anchor? Branch
            IDs, labels and target blocks stay; one undo restores the anchored source.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <button
              type="button"
              className="nf-button nf-button-primary"
              data-health-confirm-action="attach"
              disabled={busy || !editingEnabled}
              onClick={attachAnchor}
            >
              Remove anchor
            </button>
          </div>
        </>,
      );
    }
    if (confirm.kind === 'delete-branch') {
      return box(
        <>
          <p className="nf-dialog-text">
            Delete this branch to “{confirm.targetTitle}”? The target block and its subtree stay;
            a primary target becomes a top-level block. Undo restores the branch.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <button
              type="button"
              className="nf-button nf-button-danger"
              data-health-confirm-action="delete-branch"
              disabled={busy || !editingEnabled}
              onClick={() => deleteAnchorBranch(confirm.branchId)}
            >
              Delete branch
            </button>
          </div>
        </>,
      );
    }
    if (confirm.kind === 'delete-anchor') {
      return box(
        <>
          <p className="nf-dialog-text">
            Delete the anchor and its outgoing branches? Target blocks are never deleted; a
            primary target becomes a top-level block. Undo restores the anchor and every branch.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <button
              type="button"
              className="nf-button nf-button-danger"
              data-health-confirm-action="delete-anchor"
              disabled={busy || !editingEnabled}
              onClick={
                row.category === 'orphan-record'
                  ? removeAnchorRecord
                  : deleteAnchorWithBranches
              }
            >
              {row.category === 'orphan-record' ? 'Delete anchor' : 'Delete anchor and branches'}
            </button>
          </div>
        </>,
      );
    }
    if (confirm.kind === 'remove-branch') {
      return box(
        <>
          <p className="nf-dialog-text">
            Delete the dangling edge to “{confirm.targetTitle}”? No block or anchor is deleted.
            The command layer refuses a document whose target is missing, so a rejection is shown
            here instead of a partial change.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <button
              type="button"
              className="nf-button nf-button-danger"
              data-health-confirm-action="remove-branch"
              disabled={busy || !editingEnabled}
              onClick={() => removeHealthBranch(confirm.branchId)}
            >
              Remove branch
            </button>
          </div>
        </>,
      );
    }
    if (confirm.kind === 'delete-orphan-block') {
      return box(
        <>
          <p className="nf-dialog-text">
            Delete “{confirm.title}” and its unreachable subtree? The block is not part of any
            chapter, so it is invisible in the editor. Undo restores it.
          </p>
          <div className="nf-dialog-inline-actions">
            {cancel}
            <button
              type="button"
              className="nf-button nf-button-danger"
              data-health-confirm-action="delete-orphan-block"
              disabled={busy || !editingEnabled}
              onClick={() => deleteBlock(confirm.blockId)}
            >
              Delete block
            </button>
          </div>
        </>,
      );
    }
    return box(
      <>
        <p className="nf-dialog-text">
          Delete the empty chapter “{confirm.title}”? It has no top-level blocks, so no content is
          removed. Undo restores the chapter.
        </p>
        <div className="nf-dialog-inline-actions">
          {cancel}
          <button
            type="button"
            className="nf-button nf-button-danger"
            data-health-confirm-action="delete-chapter"
            disabled={busy || !editingEnabled}
            onClick={() => deleteChapter(confirm.chapterId)}
          >
            Delete chapter
          </button>
        </div>
      </>,
    );
  };

  const renderIssue = (): JSX.Element => (
    <>
      <div className="nf-health-issue-head">
        <span
          className={`nf-health-severity-word nf-health-severity-${row.severity.toLowerCase()}`}
          data-health-severity-label={SEVERITY_LABEL[row.severity]}
        >
          {row.severity === 'S3' ? (
            <Info size={12} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <TriangleAlert size={12} strokeWidth={1.5} aria-hidden="true" />
          )}
          {SEVERITY_LABEL[row.severity]}
        </span>
        <span className="nf-health-issue-kind" data-health-kind-label={row.kind ?? 'structure'}>
          {row.kind === null ? 'Structure' : `${KIND_LABEL[row.kind]} anchor`}
        </span>
      </div>
      <p className="nf-health-issue-quote">“{rowLabel(row)}”</p>
      <p className="nf-health-issue-meta">
        {row.blockTitle} · {row.chapterTitle}
      </p>
      {row.prefix.length > 0 || row.suffix.length > 0 ? (
        <p className="nf-health-issue-context">
          {anchorContextLine(row.prefix, row.quote, row.suffix)}
        </p>
      ) : null}
      <p className="nf-health-issue-reason" data-health-reason={row.reason}>
        {row.reasonLabel}
      </p>

      {renderGuidance()}

      {row.kind === 'image' && isLive ? (
        <p className="nf-dialog-note" data-health-image-repair-note="true">
          Re-picking an image region is a follow-up. The branch, target, and alt text are kept:
          keep the branches, delete the anchor, or keep it as it is.
        </p>
      ) : null}

      {row.occurrences !== undefined && row.occurrences.length > 0
        ? section(
            'Stale bindings',
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
            </ul>,
            { 'data-health-occurrences': 'true' },
          )
        : null}

      {renderCandidates()}
      {renderBranches()}

      {row.category === 'idle' ? (
        <section className="nf-health-issue-section" data-health-branch-from-anchor="true">
          <h3 className="nf-health-issue-section-title">Branch from anchor</h3>
          {branchChoices.length === 0 ? (
            <p className="nf-dialog-note">There is no other block to branch to.</p>
          ) : (
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
          )}
        </section>
      ) : null}

      {row.category === 'orphan-block' ? (
        <section className="nf-health-issue-section" data-health-move-orphan="true">
          <h3 className="nf-health-issue-section-title">Move to chapter</h3>
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
              <option value="">Choose a chapter…</option>
              {chapterChoices.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {renderActions()}
      {renderInlineConfirm()}
    </>
  );

  const renderConfirmStage = (): JSX.Element | null => {
    if (preview === null) return null;
    return (
      <>
        <p className="nf-health-issue-quote">“{rowLabel(row)}”</p>
        <p className="nf-health-issue-meta">
          {row.blockTitle} · {row.chapterTitle}
        </p>
        <section
          className="nf-health-preview"
          data-health-preview="true"
          data-health-preview-origin={preview.origin}
          data-health-preview-anchor={preview.preview.anchorId}
          aria-label="Repair preview"
        >
          <h3 className="nf-health-issue-section-title">Confirm repair</h3>
          <p className="nf-dialog-note">
            Confirm applies one undoable repair; the anchor and branch IDs stay the same. Back or
            Esc returns to the issue and changes nothing.
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
              <span className="nf-health-preview-context">{preview.preview.after.context}</span>
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
        </section>
      </>
    );
  };

  const primary = preview === null ? renderPrimary() : null;

  return (
    <ModalOverlay
      className="nf-overlay"
      isOpen
      onOpenChange={(open) => {
        if (!open) closeWithFocus(row.id);
      }}
      isDismissable
    >
      <Modal className="nf-dialog-modal nf-dialog-modal-repair">
        <Dialog
          className="nf-dialog nf-health-dialog"
          aria-label={`Document health — ${DOCUMENT_HEALTH_CATEGORY_LABELS[row.category]}`}
          data-health-dialog="true"
          data-health-row={row.id}
          data-health-state={row.category}
          data-health-severity={row.severity}
        >
          <header className="nf-health-dialog-head">
            <div className="nf-health-dialog-heading">
              <p className="nf-health-kicker">Document health</p>
              <h2 className="nf-dialog-title nf-health-dialog-title">
                {DOCUMENT_HEALTH_CATEGORY_LABELS[row.category]}
              </h2>
            </div>
            <button
              type="button"
              className="nf-icon-button nf-health-dialog-close"
              data-health-close="true"
              aria-label="Close"
              onClick={() => closeWithFocus(row.id)}
            >
              <X size={13} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </header>
          <div className="nf-dialog-body nf-health-dialog-body">
            {editingEnabled ? null : (
              <p className="nf-dialog-note" data-health-read-only="true">
                {READ_ONLY_REASON}
              </p>
            )}
            {preview === null ? renderIssue() : renderConfirmStage()}
            {error === null ? null : (
              <p className="nf-dialog-text nf-dialog-error" role="alert" data-health-error="true">
                {error}
              </p>
            )}
          </div>
          <div className="nf-dialog-actions nf-health-dialog-actions">
            <button
              type="button"
              className="nf-button nf-button-quiet"
              data-health-action="show-in-note"
              onClick={() => navigate(row)}
            >
              Show in note
            </button>
            <span className="nf-health-dialog-spacer" />
            {preview === null ? (
              <button
                type="button"
                className="nf-button"
                data-health-close="true"
                onClick={() => closeWithFocus(row.id)}
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="nf-button"
                  data-health-preview-back="true"
                  onClick={() => setPreview(null)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="nf-button nf-button-primary"
                  data-health-preview-confirm="true"
                  disabled={busy || !editingEnabled}
                  onClick={confirmRepair}
                >
                  Confirm repair
                </button>
              </>
            )}
            {primary}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
