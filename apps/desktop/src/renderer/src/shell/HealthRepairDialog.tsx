/**
 * Document health repair modal (S2, S2.1).
 *
 * One issue per modal, opened from a row in the Health sidebar; the list stays
 * behind it, so closing never loses the report.
 *
 * The body is at most three blocks — context, problem, decision — and never
 * shows internal data (no stale bindings, node paths, anchor/branch/target IDs
 * and no "Text anchor"). Every action lives in the footer in a fixed slot:
 * `Show in note` on the left, then the rare/destructive `…` menu, `Close`, and
 * the category's primary action. A chosen repair previews Before/After in the
 * same modal; Back returns to the issue, Esc follows the same stack, and Confirm
 * applies exactly what was previewed as one undoable command and closes the
 * modal. Read mode keeps Show in note and Close and disables every mutation
 * with one line of why.
 */

import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AnchorKind } from '@noteforest/core';
import { undoActive } from '../actions';
import { useShell } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import {
  anchorCandidateViews,
  anchorRepairPreview,
  repairCommandForCandidate,
  type AnchorRepairPreview,
} from '../lib/anchor-health';
import type { DocumentHealthRow } from '../lib/document-health';
import {
  DOCUMENT_HEALTH_CANDIDATE_NOTE,
  DOCUMENT_HEALTH_IMAGE_NOTE,
  DOCUMENT_HEALTH_MOVE_NOTE,
  DOCUMENT_HEALTH_REPAIR_CONFIRM_NOTE,
  HEALTH_ACTIONS,
  documentHealthActionPlan,
  documentHealthBranchCountText,
  documentHealthGuidanceText,
  documentHealthProblemLine,
  documentHealthStateText,
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

/** The kind word is only useful where the anchor's medium is not obvious. */
const KIND_VISIBLE: ReadonlySet<AnchorKind> = new Set(['formula', 'code', 'image']);

const SEVERITY_LABEL: Record<DocumentHealthRow['severity'], string> = {
  S1: 'Data risk',
  S2: 'Needs repair',
  S3: 'Information',
};

type HealthConfirm =
  | { kind: 'repair'; preview: AnchorRepairPreview; origin: 'candidate' | 'selection' }
  | { kind: 'attach' }
  | { kind: 'delete-branch'; branchId: string; targetTitle: string }
  | { kind: 'delete-anchor' }
  | { kind: 'remove-branch'; branchId: string; targetTitle: string }
  | { kind: 'delete-orphan-block'; blockId: string; title: string }
  | { kind: 'delete-chapter'; chapterId: string; title: string };

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
  return documentHealthStateText(row.category);
}

/** The block, plus the chapter only when it says something different. */
function whereLine(row: DocumentHealthRow): string {
  if (row.chapterTitle.trim().length === 0 || row.chapterTitle === row.blockTitle) {
    return row.blockTitle;
  }
  return `${row.blockTitle} · ${row.chapterTitle}`;
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
  const [confirm, setConfirm] = useState<HealthConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branchTarget, setBranchTarget] = useState('');
  const [moveChapterId, setMoveChapterId] = useState('');
  const [candidateIndex, setCandidateIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const editingEnabled = useShell((state) =>
    editingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  const layout = useShell(
    (state) => state.viewByDoc[runtime.packagePath]?.layout ?? 'continuous',
  );

  useEffect(() => {
    if (row === null) onClose();
  }, [row, onClose]);

  // Esc is the modal's own stack: menu → confirm → issue → close. A capture
  // listener runs before the modal's dismiss handler, so one keypress moves one
  // step and an open footer menu never closes the modal.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (menuOpen) {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
        return;
      }
      setMenuOpen(false);
      if (confirm !== null) {
        setConfirm(null);
        return;
      }
      onClose();
      focusHealthRow(row?.id ?? null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [menuOpen, confirm, onClose, row?.id]);

  // The footer menu is a small disclosure inside the modal: focus the first
  // item, and close it on any pointer down outside the trigger or the menu.
  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) === true) return;
      if (menuTriggerRef.current?.contains(target) === true) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [menuOpen]);

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
    setError(null);
    setConfirm({ kind: 'repair', preview: next, origin: 'candidate' });
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
    setError(null);
    setConfirm({ kind: 'repair', preview: next, origin: 'selection' });
  };

  const confirmRepair = (preview: AnchorRepairPreview, origin: 'candidate' | 'selection'): void => {
    const { command } = preview;
    void perform(
      runtime.repairAnchor(command.anchorId, command.selector, command.binding),
      origin === 'candidate'
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

  const plan = documentHealthActionPlan(row.category, {
    kind: row.kind,
    hasCandidates: candidates.length > 0,
  });

  const actionHandlers: Record<HealthActionId, () => void> = {
    'preview-repair': previewCandidate,
    relink: () => void previewRelink(),
    'recreate-link': () => void recreateLink(),
    'remove-mark': removeMark,
    attach: () => setConfirm({ kind: 'attach' }),
    'delete-anchor': () => setConfirm({ kind: 'delete-anchor' }),
    'add-branch': branchFromAnchor,
    'remove-anchor': removeAnchorRecord,
    'delete-unused': () => setConfirm({ kind: 'delete-anchor' }),
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

  const runAction = (action: HealthActionId): void => {
    actionHandlers[action]();
  };

  const footerAction = (
    action: HealthActionId,
    slots: { primary?: boolean } = {},
  ): JSX.Element => {
    const definition = HEALTH_ACTIONS[action];
    const primary = slots.primary === true;
    return (
      <button
        key={action}
        type="button"
        className={
          primary
            ? `nf-button ${definition.danger ? 'nf-button-danger' : 'nf-button-primary'}`
            : 'nf-button'
        }
        data-health-action={action}
        disabled={busy || !editingEnabled || actionDisabled(action)}
        title={editingEnabled ? undefined : READ_ONLY_REASON}
        onClick={() => runAction(action)}
      >
        {definition.label}
      </button>
    );
  };

  const runConfirm = (): void => {
    if (confirm === null) return;
    switch (confirm.kind) {
      case 'repair':
        confirmRepair(confirm.preview, confirm.origin);
        return;
      case 'attach':
        attachAnchor();
        return;
      case 'delete-branch':
        deleteAnchorBranch(confirm.branchId);
        return;
      case 'delete-anchor':
        if (row.category === 'orphan-record') removeAnchorRecord();
        else deleteAnchorWithBranches();
        return;
      case 'remove-branch':
        removeHealthBranch(confirm.branchId);
        return;
      case 'delete-orphan-block':
        deleteBlock(confirm.blockId);
        return;
      case 'delete-chapter':
        deleteChapter(confirm.chapterId);
        return;
    }
  };

  const confirmLabel = (): string => {
    if (confirm === null) return '';
    switch (confirm.kind) {
      case 'repair':
        return 'Confirm repair';
      case 'attach':
        return 'Remove anchor';
      case 'delete-branch':
        return 'Delete branch';
      case 'delete-anchor':
        return row.category === 'orphan-record' ? 'Delete anchor' : 'Delete anchor and branches';
      case 'remove-branch':
        return 'Remove branch';
      case 'delete-orphan-block':
        return 'Delete block';
      case 'delete-chapter':
        return 'Delete chapter';
    }
  };

  /** One line: what changes, what stays, one undo entry. Never an ID. */
  const confirmNote = (): string => {
    if (confirm === null) return '';
    switch (confirm.kind) {
      case 'repair':
        return DOCUMENT_HEALTH_REPAIR_CONFIRM_NOTE;
      case 'attach':
        return 'What changes: the anchor and its mark. What stays: the branches, their targets, the block. One undo entry.';
      case 'delete-branch':
        return `What changes: the branch to “${confirm.targetTitle}”. What stays: the target block and its subtree. One undo entry.`;
      case 'delete-anchor':
        return row.category === 'orphan-record'
          ? 'What changes: the unused anchor. What stays: every block and branch. One undo entry.'
          : 'What changes: the anchor and its branches. What stays: every target block. One undo entry.';
      case 'remove-branch':
        return `What changes: the dangling branch to “${confirm.targetTitle}”. What stays: every block and anchor. One undo entry.`;
      case 'delete-orphan-block':
        return `What changes: “${confirm.title}” and its unreachable subtree. What stays: every chapter. One undo entry.`;
      case 'delete-chapter':
        return `What changes: the empty chapter “${confirm.title}”. What stays: every block. One undo entry.`;
    }
  };

  const confirmDanger = (): boolean =>
    confirm !== null && confirm.kind !== 'repair' && confirm.kind !== 'attach';

  const renderBranches = (): JSX.Element | null => {
    // A hidden marker is repaired by expanding its parent: no branch action.
    if (row.category === 'hidden' || row.branches.length === 0) return null;
    return (
      <ul className="nf-health-branches" data-health-branches="true">
        {row.branches.map((branch) => (
          <li
            key={branch.id}
            className="nf-health-branch"
            data-health-branch={branch.id}
            data-health-branch-role={branch.role}
          >
            <span className="nf-health-branch-label">
              {row.branches.length === 1 ? documentHealthBranchCountText(1) : branch.role}
            </span>
            <span className="nf-health-branch-separator" aria-hidden="true">
              ·
            </span>
            <span className="nf-health-branch-target">
              {branch.label === undefined
                ? branch.targetTitle
                : `${branch.targetTitle} · ${branch.label}`}
            </span>
            {row.anchorId === undefined ? null : (
              <button
                type="button"
                className="nf-health-branch-remove"
                data-health-action="delete-branch"
                disabled={busy || !editingEnabled}
                title={editingEnabled ? undefined : READ_ONLY_REASON}
                onClick={() =>
                  setConfirm({
                    kind: 'delete-branch',
                    branchId: branch.id,
                    targetTitle: branch.targetTitle,
                  })
                }
              >
                Delete branch…
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const renderDecision = (): JSX.Element | null => {
    if (showCandidates) {
      return (
        <div className="nf-health-decision" data-health-candidates="true">
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
          <p className="nf-dialog-note">{DOCUMENT_HEALTH_CANDIDATE_NOTE}</p>
        </div>
      );
    }
    if (row.category === 'idle') {
      if (branchChoices.length === 0) {
        return (
          <div className="nf-health-decision">
            <p className="nf-dialog-note">There is no other block to branch to.</p>
          </div>
        );
      }
      return (
        <div className="nf-health-decision">
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
        </div>
      );
    }
    if (row.category === 'orphan-block') {
      return (
        <div className="nf-health-decision">
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
          <p className="nf-dialog-note">{DOCUMENT_HEALTH_MOVE_NOTE}</p>
        </div>
      );
    }
    return null;
  };

  const renderContext = (): JSX.Element => (
    <div className="nf-health-issue-head" data-health-context="true">
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
      {row.kind !== null && KIND_VISIBLE.has(row.kind) ? (
        <span className="nf-health-issue-kind" data-health-kind-label={row.kind}>
          {KIND_LABEL[row.kind]}
        </span>
      ) : null}
    </div>
  );

  const renderIssue = (): JSX.Element => (
    <>
      {renderContext()}
      <p className="nf-health-issue-quote">“{rowLabel(row)}”</p>
      <p className="nf-health-issue-meta" data-health-where="true">
        {whereLine(row)}
      </p>
      <p className="nf-health-issue-reason" data-health-reason={row.reason}>
        {documentHealthProblemLine(row)}
      </p>
      {plan.guidance === null ? null : (
        <p className="nf-health-issue-guidance" data-health-guidance={plan.guidance}>
          {documentHealthGuidanceText(plan.guidance)}
        </p>
      )}
      {row.kind === 'image' && isLive ? (
        <p className="nf-dialog-note" data-health-image-repair-note="true">
          {DOCUMENT_HEALTH_IMAGE_NOTE}
        </p>
      ) : null}
      {renderBranches()}
      {renderDecision()}
    </>
  );

  const renderConfirmStage = (): JSX.Element | null => {
    if (confirm === null) return null;
    return (
      <>
        <p className="nf-health-issue-quote">“{rowLabel(row)}”</p>
        <p className="nf-health-issue-meta">{whereLine(row)}</p>
        {confirm.kind === 'repair' ? (
          <section
            className="nf-health-preview"
            data-health-preview="true"
            data-health-preview-origin={confirm.origin}
            aria-label="Repair preview"
          >
            <div className="nf-health-preview-grid">
              <div className="nf-health-preview-side" data-health-preview-side="before">
                <span className="nf-health-preview-label">Before</span>
                <span className="nf-health-preview-quote">“{confirm.preview.before.quote}”</span>
                <span className="nf-health-preview-context">
                  {confirm.preview.before.context}
                </span>
                {confirm.preview.before.descriptors.map((descriptor) => (
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
                <span className="nf-health-preview-quote">“{confirm.preview.after.quote}”</span>
                <span className="nf-health-preview-context">{confirm.preview.after.context}</span>
                {confirm.preview.after.descriptors.map((descriptor) => (
                  <span key={descriptor} className="nf-health-preview-descriptor">
                    {descriptor}
                  </span>
                ))}
              </div>
            </div>
            <p className="nf-dialog-note nf-health-preview-note">{confirmNote()}</p>
          </section>
        ) : (
          <div
            className="nf-health-confirm"
            data-health-confirm={confirm.kind}
            role="group"
            aria-label="Confirm document health action"
          >
            <p className="nf-dialog-note">{confirmNote()}</p>
          </div>
        )}
      </>
    );
  };

  const kindLabel =
    row.kind === null ? 'structure' : row.kind;
  const menuActions = plan.menu;
  const menuDisabled = busy || !editingEnabled;
  const confirmButtonLabel =
    confirm !== null && confirm.kind === 'repair' ? 'Confirm repair' : confirmLabel();

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
          aria-label={`Document health — ${documentHealthStateText(row.category)}`}
          data-health-dialog="true"
          data-health-row={row.id}
          data-health-state={row.category}
          data-health-severity={row.severity}
          data-health-kind={kindLabel}
        >
          <header className="nf-health-dialog-head">
            <div className="nf-health-dialog-heading">
              <p className="nf-health-kicker">Document health</p>
              <h2 className="nf-dialog-title nf-health-dialog-title">
                {documentHealthStateText(row.category)}
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
            {confirm === null ? renderIssue() : renderConfirmStage()}
            {error === null ? null : (
              <p className="nf-dialog-text nf-dialog-error" role="alert" data-health-error="true">
                {error}
              </p>
            )}
          </div>
          {confirm === null ? (
            <div className="nf-dialog-actions nf-health-dialog-actions">
              <button
                type="button"
                className="nf-button nf-button-quiet nf-health-show-in-note"
                data-health-action="show-in-note"
                onClick={() => navigate(row)}
              >
                Show in note
              </button>
              <span className="nf-health-dialog-spacer" />
              {plan.secondary === null ? null : footerAction(plan.secondary)}
              {menuActions.length === 0 ? null : (
                <div className="nf-health-menu-anchor">
                  <button
                    ref={menuTriggerRef}
                    type="button"
                    className="nf-button nf-health-menu-button"
                    data-health-menu="true"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="More actions"
                    title={menuDisabled ? READ_ONLY_REASON : 'More actions'}
                    disabled={menuDisabled}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <span aria-hidden="true">…</span>
                  </button>
                  {menuOpen ? (
                    <div
                      ref={menuRef}
                      className="nf-health-menu"
                      role="menu"
                      aria-label="More actions"
                      data-health-menu-list="true"
                      onKeyDown={(event) => {
                        const items = [
                          ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
                            []),
                        ];
                        const index = items.indexOf(document.activeElement as HTMLElement);
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          items[(index + 1 + items.length) % items.length]?.focus();
                          return;
                        }
                        if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          items[(index - 1 + items.length) % items.length]?.focus();
                          return;
                        }
                        if (event.key === 'Tab') {
                          setMenuOpen(false);
                          menuTriggerRef.current?.focus();
                        }
                      }}
                    >
                      {menuActions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          role="menuitem"
                          className={`nf-health-menu-item${
                            HEALTH_ACTIONS[action].danger ? ' nf-health-menu-item-danger' : ''
                          }`}
                          data-menu-entry={`health-action-${action}`}
                          onClick={() => {
                            setMenuOpen(false);
                            runAction(action);
                          }}
                        >
                          {HEALTH_ACTIONS[action].label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
              <button
                type="button"
                className="nf-button"
                data-health-close="true"
                onClick={() => closeWithFocus(row.id)}
              >
                Close
              </button>
              {plan.primary === null ? null : footerAction(plan.primary, { primary: true })}
            </div>
          ) : (
            <div className="nf-dialog-actions nf-health-dialog-actions">
              <button
                type="button"
                className="nf-button"
                data-health-stage-back="true"
                {...(confirm.kind === 'repair' ? { 'data-health-preview-back': 'true' } : {})}
                onClick={() => setConfirm(null)}
              >
                Back
              </button>
              <span className="nf-health-dialog-spacer" />
              <button
                type="button"
                className={`nf-button ${
                  confirmDanger()
                    ? 'nf-button-danger nf-health-primary-danger'
                    : 'nf-button-primary'
                }`}
                {...(confirm.kind === 'repair'
                  ? { 'data-health-preview-confirm': 'true' }
                  : { 'data-health-confirm-action': confirm.kind })}
                disabled={busy || !editingEnabled}
                onClick={runConfirm}
              >
                {confirmButtonLabel}
              </button>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
