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
import { useRuntime } from '../state/registry';
import {
  activeRuntime,
  closeTab,
  renameChapter,
  renameDocument,
  report,
  undoActive,
} from '../actions';
import { blockTitle, chapterIdOf, subtreeIds } from '../lib/tree';
import { overwriteConfirmation } from '../lib/save-failure';
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
  const apply = (): void => {
    const editor = activeRuntime()?.editor;
    const clean = value.trim();
    if (editor !== null && editor !== undefined && clean.length > 0) {
      if (pos !== null) {
        if (kind === 'inline') editor.chain().focus().updateInlineMath({ latex: clean, pos }).run();
        else editor.chain().focus().updateBlockMath({ latex: clean, pos }).run();
      } else if (kind === 'inline') {
        editor.chain().focus().insertInlineMath({ latex: clean }).run();
      } else {
        editor.chain().focus().insertBlockMath({ latex: clean }).run();
      }
    }
    onClose();
  };
  return (
    <Frame
      title={pos === null ? 'Insert math' : 'Edit math'}
      description="KaTeX renders the expression. LaTeX only; no remote content."
      actions={
        <>
          <Button className="nf-button" onPress={onClose}>Cancel</Button>
          <Button className="nf-button nf-button-primary" onPress={apply}>Apply</Button>
        </>
      }
    >
      <label className="nf-field">
        <span className="nf-field-label">LaTeX</span>
        <TextArea
          className="nf-input nf-textarea"
          autoFocus
          value={value}
          placeholder="\\lambda^2 + \\mu^2"
          onChange={(event) => setValue(event.target.value)}
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
          Undo last structural change
        </Button>
      </div>
      <p className="nf-dialog-note">
        Documents are local folders with <code>document.json</code> and an assets directory. Autosave runs after
        800 ms; ⌘S flushes immediately.
      </p>
    </Frame>
  );
}
