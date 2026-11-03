import { BookOpen, ChevronRight, FileText, MoreHorizontal, Plus, Search, Settings } from 'lucide-react';
import {
  Button,
  Tree,
  TreeItem,
  TreeItemContent,
  type Selection,
} from 'react-aria-components';
import { useMemo, useState } from 'react';
import { useShell, type TabInfo } from '../state/shell';
import { useRegistry, useRuntime } from '../state/registry';
import { createNewDocument, focusBlock, openLibraryMenu, openBlockMenu, openChapterMenu, openPath, renameChapter } from '../actions';
import { buildChapterTrees, blockTitle, type BlockNode } from '../lib/tree';
import type { DocumentRuntime } from '../state/runtime';

function LibrarySection(): JSX.Element {
  const library = useShell((state) => state.library);
  const tabs = useShell((state) => state.tabs);
  const activeTab = useShell((state) => state.activeTab);
  const [query, setQuery] = useState('');

  const documents = library?.documents ?? [];
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length === 0) return documents;
    return documents.filter((document) => document.title.toLowerCase().includes(value));
  }, [documents, query]);

  const tabFor = (packagePath: string): TabInfo | undefined =>
    tabs.find((tab) => tab.packagePath === packagePath);

  return (
    <section className="nf-sidebar-section" aria-label="Library">
      <div className="nf-section-head">
        <span className="nf-section-label">Library</span>
        <button
          type="button"
          className="nf-icon-button"
          aria-label="New document"
          title="New document (⌘N)"
          onClick={() => void createNewDocument()}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <div className="nf-library-search">
        <Search size={13} strokeWidth={1.5} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Filter documents"
          aria-label="Filter documents"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="nf-library-list" role="list">
        {filtered.length === 0 ? (
          <p className="nf-empty-line">
            {documents.length === 0 ? 'No documents yet.' : 'No matching documents.'}
          </p>
        ) : (
          filtered.map((document) => {
            const tab = tabFor(document.packagePath);
            const isOpen = tab !== undefined;
            const isActive = tab?.packagePath === activeTab;
            return (
              <div key={document.packagePath} className="nf-library-row" role="listitem">
                <button
                  type="button"
                  className="nf-library-open"
                  data-active={isActive}
                  title={document.packagePath}
                  onClick={() => void openPath(document.packagePath)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openLibraryMenu(document.packagePath, { x: event.clientX, y: event.clientY });
                  }}
                >
                  <FileText size={13} strokeWidth={1.5} aria-hidden="true" />
                  <span className="nf-library-title">{document.title}</span>
                  {isOpen ? <span className="nf-open-dot" aria-label="Open" /> : null}
                </button>
                <button
                  type="button"
                  className="nf-row-menu"
                  aria-label={`Actions for ${document.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openLibraryMenu(document.packagePath, { x: rect.left - 140, y: rect.bottom + 2 });
                  }}
                >
                  <MoreHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

interface RenameTarget {
  kind: 'chapter' | 'block';
  id: string;
  value: string;
}

function BlockTreeItem({
  runtime,
  node,
  onRename,
}: {
  runtime: DocumentRuntime;
  node: BlockNode;
  onRename: (target: RenameTarget) => void;
}): JSX.Element {
  const block = runtime.document.blocks[node.id];
  const title = blockTitle(block);
  const children = node.children;
  const selected = runtime.selectedBlockId === node.id;
  const hasChildren = children.length > 0;

  return (
    <TreeItem id={node.id} textValue={title} className="nf-tree-item">
      <TreeItemContent>
        {({ level, hasChildItems, isExpanded }) => (
          <div
            className="nf-tree-row"
            data-selected={selected}
            style={{ paddingInlineStart: 6 + (level - 1) * 14 }}
            onDoubleClick={(event) => {
              event.preventDefault();
              onRename({ kind: 'block', id: node.id, value: block?.label ?? '' });
            }}
            onKeyDown={(event) => {
              if (event.key === 'F2') {
                event.preventDefault();
                onRename({ kind: 'block', id: node.id, value: block?.label ?? '' });
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              openBlockMenu(node.id, { x: event.clientX, y: event.clientY });
            }}
          >
            {hasChildItems ? (
              <Button slot="chevron" className="nf-tree-chevron" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                <ChevronRight size={12} strokeWidth={1.5} className={isExpanded ? 'nf-chevron-open' : ''} aria-hidden="true" />
              </Button>
            ) : (
              <span className="nf-tree-chevron-spacer" aria-hidden="true" />
            )}
            <span className="nf-tree-bullet" data-child={!node.topLevel} aria-hidden="true" />
            <span className="nf-tree-label" title={title}>
              {title}
            </span>
            {hasChildren ? (
              <span className="nf-tree-count" aria-hidden="true">
                {children.length}
              </span>
            ) : null}
          </div>
        )}
      </TreeItemContent>
      {children.map((child) => (
        <BlockTreeItem key={child.id} runtime={runtime} node={child} onRename={onRename} />
      ))}
    </TreeItem>
  );
}

function TopicSection(): JSX.Element {
  const activePath = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activePath);
  useRegistry();
  const collapsedTopics = useShell((state) => state.collapsedTopics);
  const setCollapsedTopics = useShell((state) => state.setCollapsedTopics);
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);

  const chapters = useMemo(
    () => (runtime === null ? [] : buildChapterTrees(runtime.document)),
    [runtime?.document, runtime?.version],
  );

  if (runtime === null || activePath === null) {
    return (
      <section className="nf-sidebar-section" aria-label="Topics">
        <div className="nf-section-head">
          <span className="nf-section-label">Topics</span>
        </div>
        <p className="nf-empty-line">{activePath === null ? 'No document open.' : 'Document unavailable.'}</p>
      </section>
    );
  }

  const expandable = new Set<string>();
  for (const chapter of chapters) {
    if (chapter.blocks.length > 0) expandable.add(chapter.id);
    const walk = (nodes: BlockNode[]): void => {
      for (const node of nodes) {
        if (node.children.length > 0) expandable.add(node.id);
        walk(node.children);
      }
    };
    walk(chapter.blocks);
  }
  const collapsedChapters = new Set(collapsedTopics[activePath] ?? []);
  const expandedKeys = new Set<string>();
  for (const id of expandable) {
    if (collapsedChapters.has(id) || runtime.collapsed.has(id)) continue;
    expandedKeys.add(id);
  }

  const onExpandedChange = (keys: Set<React.Key> | 'all'): void => {
    const next = keys === 'all' ? new Set(expandable) : new Set([...keys].map(String));
    const nextCollapsedChapters = chapters
      .filter((chapter) => chapter.blocks.length > 0 && !next.has(chapter.id))
      .map((chapter) => chapter.id);
    setCollapsedTopics(activePath, nextCollapsedChapters);
    const toggleBlock = (nodes: BlockNode[]): void => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          const shouldCollapse = !next.has(node.id);
          if (runtime.collapsed.has(node.id) !== shouldCollapse) {
            void runtime.toggleCollapse(node.id);
          }
        }
        toggleBlock(node.children);
      }
    };
    for (const chapter of chapters) toggleBlock(chapter.blocks);
  };

  const onSelectionChange = (keys: Selection): void => {
    if (keys === 'all') return;
    for (const key of keys) {
      const id = String(key);
      if (runtime.document.blocks[id] !== undefined) {
        focusBlock(activePath, id);
      }
    }
  };

  const commitRename = (): void => {
    if (renaming === null) return;
    if (renaming.kind === 'chapter') {
      void renameChapter(renaming.id, renaming.value);
    } else {
      const value = renaming.value.trim();
      void runtime.applyStructural({
        type: 'block.rename',
        blockId: renaming.id,
        label: value.length === 0 ? null : value,
      });
    }
    setRenaming(null);
  };

  return (
    <section className="nf-sidebar-section nf-topics-section" aria-label="Topics">
      <div className="nf-section-head">
        <span className="nf-section-label">Topics</span>
        <button
          type="button"
          className="nf-icon-button"
          aria-label="Add chapter"
          title="Add chapter"
          onClick={() => {
            const chapterId = crypto.randomUUID();
            void runtime.applyStructural({
              type: 'chapter.create',
              chapterId,
              title: 'New chapter',
            }).then(async (outcome) => {
              if (!outcome.ok) return;
              await runtime.applyStructural({
                type: 'block.create',
                placement: { kind: 'top-level', chapterId },
              });
              await runtime.saveNow();
            });
          }}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      {chapters.length === 0 ? (
        <p className="nf-empty-line">No blocks yet.</p>
      ) : (
        <Tree
          aria-label="Document topics"
          className="nf-tree"
          selectionMode="single"
          selectedKeys={runtime.selectedBlockId === null ? new Set() : new Set([runtime.selectedBlockId])}
          onSelectionChange={onSelectionChange}
          expandedKeys={expandedKeys}
          onExpandedChange={onExpandedChange}
        >
          {chapters.map((chapter) => (
            <TreeItem key={chapter.id} id={chapter.id} textValue={chapter.title} className="nf-tree-item">
              <TreeItemContent>
                {({ level, hasChildItems, isExpanded }) => (
                  <div
                    className="nf-tree-row nf-tree-chapter-row"
                    style={{ paddingInlineStart: 6 + (level - 1) * 14 }}
                    onDoubleClick={() =>
                      setRenaming({ kind: 'chapter', id: chapter.id, value: chapter.title })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'F2') {
                        event.preventDefault();
                        setRenaming({ kind: 'chapter', id: chapter.id, value: chapter.title });
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openChapterMenu(chapter.id, { x: event.clientX, y: event.clientY });
                    }}
                  >
                    {hasChildItems ? (
                      <Button slot="chevron" className="nf-tree-chevron" aria-label={isExpanded ? 'Collapse chapter' : 'Expand chapter'}>
                        <ChevronRight
                          size={12}
                          strokeWidth={1.5}
                          className={isExpanded ? 'nf-chevron-open' : ''}
                          aria-hidden="true"
                        />
                      </Button>
                    ) : (
                      <span className="nf-tree-chevron-spacer" aria-hidden="true" />
                    )}
                    <BookOpen size={13} strokeWidth={1.5} className="nf-tree-icon" aria-hidden="true" />
                    {renaming?.kind === 'chapter' && renaming.id === chapter.id ? (
                      <input
                        className="nf-tree-rename"
                        autoFocus
                        value={renaming.value}
                        aria-label="Chapter title"
                        onChange={(event) => setRenaming({ ...renaming, value: event.target.value })}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitRename();
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setRenaming(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="nf-tree-label">{chapter.title}</span>
                    )}
                    <span className="nf-tree-count">{chapter.blocks.length}</span>
                  </div>
                )}
              </TreeItemContent>
              {chapter.blocks.map((block) => (
                <BlockTreeItem key={block.id} runtime={runtime} node={block} onRename={setRenaming} />
              ))}
            </TreeItem>
          ))}
        </Tree>
      )}
      <div className="nf-section-foot">
        <button
          type="button"
          className="nf-text-button"
          onClick={() => {
            const chapterId = runtime.document.chapters.at(-1)?.id;
            if (chapterId !== undefined) void runtime.addTopLevel(chapterId);
          }}
        >
          <Plus size={12} strokeWidth={1.5} aria-hidden="true" /> Add block
        </button>
      </div>
    </section>
  );
}

export function Sidebar(): JSX.Element {
  const openDialog = useShell((state) => state.openDialog);
  const openPalette = useShell((state) => state.setPaletteOpen);
  return (
    <aside className="nf-sidebar" aria-label="Sidebar">
      <div className="nf-sidebar-head">
        <button type="button" className="nf-sidebar-search" onClick={() => openPalette(true)}>
          <Search size={13} strokeWidth={1.5} aria-hidden="true" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        <button type="button" className="nf-new-note" onClick={() => void createNewDocument()}>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>New note</span>
        </button>
      </div>
      <div className="nf-sidebar-scroll">
        <LibrarySection />
        <TopicSection />
      </div>
      <div className="nf-sidebar-foot">
        <button
          type="button"
          className="nf-icon-button"
          aria-label="Settings"
          title="Settings (⌘,)"
          onClick={() => openDialog({ kind: 'settings' })}
        >
          <Settings size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <span className="nf-sidebar-foot-label">Graphite</span>
      </div>
    </aside>
  );
}
