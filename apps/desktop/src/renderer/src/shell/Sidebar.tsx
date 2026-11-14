import { Anchor, BookOpen, ChevronDown, ChevronRight, FileText, FileWarning, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, TriangleAlert } from 'lucide-react';
import {
  Button,
  Tree,
  TreeItem,
  TreeItemContent,
  type Selection,
} from 'react-aria-components';
import { useMemo, useRef, useState } from 'react';
import { useShell, type MenuEntry, type TabInfo } from '../state/shell';
import { useRegistry, useRuntime } from '../state/registry';
import {
  createChapter,
  createNewDocument,
  focusBlock,
  locateLibrary,
  openBlockMenu,
  openChapterMenu,
  openLibrary,
  openLibraryMenu,
  openPath,
  refreshLibrary,
  removeRecentLibrary,
  renameChapter,
  revealLibraryPath,
  switchLibrary,
} from '../actions';
import {
  anchorIsWarning,
  anchorQuote,
  anchorState,
  blockTitle,
  buildChapterTrees,
  incomingBranch,
  incomingReferenceBranches,
  type BlockNode,
} from '../lib/tree';
import { recoveryStatusLabel } from '../lib/recovery';
import { editingEnabledFor, READ_MODE_TITLE } from '../lib/editability';
import type { DocumentRuntime } from '../state/runtime';
import type { SidebarTab } from '../../../shared/api';
import { isMarkdownPath } from '../../../shared/markdown';

const SIDEBAR_TABS: ReadonlyArray<{ id: SidebarTab; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'outline', label: 'Outline' },
];

/**
 * Library/Outline tab strip (LD-01). Automatic activation on arrow keys matches
 * the design's keyboard model; focus moves with the selected tab. The footer
 * Settings entry is outside the tablist and the panel.
 */
function SidebarTabs(): JSX.Element {
  const sidebarTab = useShell((state) => state.sidebarTab);
  const setSidebarTab = useShell((state) => state.setSidebarTab);
  const refs = useRef<Record<SidebarTab, HTMLButtonElement | null>>({
    library: null,
    outline: null,
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const index = SIDEBAR_TABS.findIndex((tab) => tab.id === sidebarTab);
    let next: SidebarTab | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = SIDEBAR_TABS[(index + 1) % SIDEBAR_TABS.length]?.id ?? null;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next =
        SIDEBAR_TABS[(index - 1 + SIDEBAR_TABS.length) % SIDEBAR_TABS.length]?.id ?? null;
    } else if (event.key === 'Home') {
      next = SIDEBAR_TABS[0]?.id ?? null;
    } else if (event.key === 'End') {
      next = SIDEBAR_TABS.at(-1)?.id ?? null;
    }
    if (next === null) return;
    event.preventDefault();
    setSidebarTab(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      className="nf-sidebar-tabs"
      role="tablist"
      aria-label="Sidebar views"
      data-sidebar-tabs="true"
      onKeyDown={onKeyDown}
    >
      {SIDEBAR_TABS.map((tab) => (
        <button
          key={tab.id}
          ref={(element) => {
            refs.current[tab.id] = element;
          }}
          type="button"
          role="tab"
          id={`nf-sidebar-tab-${tab.id}`}
          className="nf-sidebar-tab"
          data-sidebar-tab={tab.id}
          aria-selected={sidebarTab === tab.id}
          aria-controls="nf-sidebar-panel"
          tabIndex={sidebarTab === tab.id ? 0 : -1}
          onClick={() => setSidebarTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function libraryDisplayName(libraryPath: string | undefined): string {
  if (libraryPath === undefined || libraryPath.length === 0) return 'Library';
  return libraryPath.split('/').filter((part) => part.length > 0).at(-1) ?? 'Library';
}

function LibrarySection(): JSX.Element {
  const library = useShell((state) => state.library);
  const tabs = useShell((state) => state.tabs);
  const activeTab = useShell((state) => state.activeTab);
  const openDialog = useShell((state) => state.openDialog);
  const [query, setQuery] = useState('');

  const documents = library?.documents ?? [];
  const libraryPath = library?.libraryPath ?? '';
  const libraryName = library?.libraryName ?? libraryDisplayName(libraryPath);
  const missing = library?.missing === true;
  const noLibrary = library !== null && libraryPath.length === 0;

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length === 0) return documents;
    return documents.filter((document) => document.title.toLowerCase().includes(value));
  }, [documents, query]);

  const tabFor = (packagePath: string): TabInfo | undefined =>
    tabs.find((tab) => tab.packagePath === packagePath);

  const openSwitcher = (anchor: { x: number; y: number }): void => {
    const entries: MenuEntry[] = [];
    for (const recent of library?.libraries ?? []) {
      entries.push({
        id: `library-switch-${recent.path}`,
        label: recent.name,
        ...(recent.parentPath === undefined ? {} : { description: recent.parentPath }),
        checked: recent.active,
        onSelect: () => {
          if (!recent.active) void switchLibrary(recent.path);
        },
      });
    }
    if (entries.length === 0) {
      entries.push({
        id: 'library-empty',
        label: 'No recent libraries',
        disabled: true,
      });
    }
    entries.push(
      { id: 'sep-library', label: '', separator: true },
      {
        id: 'library-open',
        label: 'Open Folder as Library…',
        onSelect: () => void openLibrary(),
      },
      {
        id: 'library-new',
        label: 'New Library…',
        onSelect: () => openDialog({ kind: 'new-library' }),
      },
      {
        id: 'library-refresh',
        label: 'Refresh',
        onSelect: () => void refreshLibrary(),
      },
      {
        id: 'library-reveal',
        label: 'Reveal in Finder',
        onSelect: () => void revealLibraryPath(libraryPath),
      },
    );
    useShell.getState().openContextMenu(anchor.x, anchor.y, entries);
  };

  if (library === null) {
    return (
      <section className="nf-sidebar-section nf-library-section" aria-label="Library">
        <p className="nf-empty-line">Loading library…</p>
      </section>
    );
  }

  return (
    <section className="nf-sidebar-section nf-library-section" aria-label="Library">
      <div className="nf-library-head">
        <button
          type="button"
          className="nf-library-switcher"
          data-library-switcher="true"
          data-library-name={libraryName}
          title={libraryPath.length > 0 ? libraryPath : 'No library open'}
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openSwitcher({ x: rect.left, y: rect.bottom + 2 });
          }}
        >
          <span className="nf-library-name">{libraryName}</span>
          <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <span className="nf-section-tail">
          <span className="nf-section-count" data-library-count="true">
            {documents.length}
          </span>
          <button
            type="button"
            className="nf-icon-button nf-section-add"
            data-library-new="true"
            aria-label="New note"
            title={
              missing || noLibrary ? 'Open a library before creating a note' : 'New note (⌘N)'
            }
            disabled={missing || noLibrary}
            onClick={() => void createNewDocument()}
          >
            <Plus size={13} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </span>
      </div>
      {missing ? (
        <div className="nf-library-missing" data-library-missing="true">
          <p className="nf-library-missing-title">Library not found</p>
          <p className="nf-library-missing-path" data-library-missing-path="true" title={libraryPath}>
            {libraryPath}
          </p>
          <div className="nf-library-missing-actions">
            <button
              type="button"
              className="nf-text-button"
              data-library-locate="true"
              onClick={() => void locateLibrary(libraryPath)}
            >
              Locate…
            </button>
            <button
              type="button"
              className="nf-text-button"
              data-library-remove="true"
              onClick={() => void removeRecentLibrary(libraryPath)}
            >
              Remove from Recent
            </button>
            <button
              type="button"
              className="nf-text-button"
              data-library-open-another="true"
              onClick={() => void openLibrary()}
            >
              Open another…
            </button>
          </div>
        </div>
      ) : noLibrary ? (
        <div className="nf-library-missing" data-library-none="true">
          <p className="nf-library-missing-title">No library open</p>
          <p className="nf-library-missing-copy">
            Open a folder of NoteForest notes as your library.
          </p>
          <div className="nf-library-missing-actions">
            <button
              type="button"
              className="nf-text-button"
              data-library-open-another="true"
              onClick={() => void openLibrary()}
            >
              Open Folder as Library…
            </button>
            <button
              type="button"
              className="nf-text-button"
              data-library-new-library="true"
              onClick={() => openDialog({ kind: 'new-library' })}
            >
              New Library…
            </button>
          </div>
        </div>
      ) : (
        <>
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
              <p className="nf-empty-line" data-library-empty="true">
                {documents.length === 0 ? 'No documents yet.' : 'No matching documents.'}
              </p>
            ) : (
              filtered.map((document) => {
                const tab = tabFor(document.packagePath);
                const isOpen = tab !== undefined;
                const isActive = tab?.packagePath === activeTab;
                return (
                  <div
                    key={document.packagePath}
                    className="nf-library-row"
                    role="listitem"
                    data-active={isActive}
                  >
                    <button
                      type="button"
                      className="nf-library-open"
                      data-library-document="true"
                      data-library-kind={document.kind ?? 'note'}
                      data-doc-status={document.status}
                      title={
                        document.status === 'ok'
                          ? document.packagePath
                          : `${document.packagePath}\n${document.reason ?? ''}`
                      }
                      onClick={() => void openPath(document.packagePath)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openLibraryMenu(document.packagePath, {
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                    >
                      {document.status === 'ok' ? (
                        <FileText size={13} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <FileWarning
                          size={13}
                          strokeWidth={1.5}
                          className="nf-library-warning-icon"
                          aria-hidden="true"
                        />
                      )}
                      <span className="nf-library-copy">
                        <span className="nf-library-title">{document.title}</span>
                        {document.status === 'ok' ? null : (
                          <span className="nf-library-reason" data-doc-reason="true">
                            {document.reason ?? 'The package could not be read.'}
                          </span>
                        )}
                      </span>
                      {document.status === 'ok' ? null : (
                        <span className="nf-library-status" data-doc-status-label="true">
                          {recoveryStatusLabel(document.status)}
                        </span>
                      )}
                      {isOpen ? <span className="nf-open-dot" aria-label="Open" /> : null}
                    </button>
                    <button
                      type="button"
                      className="nf-row-menu"
                      aria-label={`Actions for ${document.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        openLibraryMenu(document.packagePath, {
                          x: rect.left - 140,
                          y: rect.bottom + 2,
                        });
                      }}
                    >
                      <MoreHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}

interface RenameTarget {
  kind: 'chapter' | 'block';
  id: string;
  value: string;
}

interface AnchorRowInfo {
  anchorId: string;
  quote: string;
  state: ReturnType<typeof anchorState>;
  warning: boolean;
  count: number;
  first: boolean;
  last: boolean;
}

interface AnchorGroup {
  anchorId: string;
  quote: string;
  state: ReturnType<typeof anchorState>;
  warning: boolean;
  nodes: BlockNode[];
}

/**
 * Group anchored siblings by anchor in outline order. `directChildIds` already
 * returns anchored primary children before direct ones, so first-seen order is
 * the D3 order shared with the callout lane.
 */
function groupAnchoredChildren(
  runtime: DocumentRuntime,
  children: readonly BlockNode[],
): AnchorGroup[] {
  const groups: AnchorGroup[] = [];
  for (const child of children) {
    if (child.anchorId === null) continue;
    let group = groups.find((candidate) => candidate.anchorId === child.anchorId);
    if (group === undefined) {
      const state = anchorState(runtime.document, child.anchorId, {
        assetAvailability: runtime.assetAvailability,
      });
      group = {
        anchorId: child.anchorId,
        quote: anchorQuote(runtime.document, child.anchorId),
        state,
        warning: anchorIsWarning(state),
        nodes: [],
      };
      groups.push(group);
    }
    group.nodes.push(child);
  }
  return groups;
}

function BlockTreeItem({
  runtime,
  node,
  onRename,
  anchor,
}: {
  runtime: DocumentRuntime;
  node: BlockNode;
  onRename: (target: RenameTarget) => void;
  anchor?: AnchorRowInfo;
}): JSX.Element {
  const block = runtime.document.blocks[node.id];
  const title = blockTitle(block);
  const children = node.children;
  const selected = runtime.selectedBlockId === node.id;
  const anchorSelected = anchor !== undefined && runtime.selectedAnchor?.branchId === node.branchId;
  const hasChildren = children.length > 0;
  const anchorGroups = groupAnchoredChildren(runtime, children);
  const directChildren = children.filter((child) => child.anchorId === null);
  const anchorIds = [...new Set(anchorGroups.map((group) => group.anchorId))];
  const warningCount = anchorGroups.filter((group) => group.warning).length;
  const incomingReferences = incomingReferenceBranches(runtime.document, node.id);

  return (
    <TreeItem
      id={node.id}
      textValue={anchor === undefined ? title : `↳ “${anchor.quote || 'anchor'}” ${title}`}
      className="nf-tree-item"
    >
      <TreeItemContent>
        {({ level, hasChildItems, isExpanded }) => (
          <div
            className={anchor === undefined ? 'nf-tree-row' : 'nf-tree-row nf-tree-anchor-row'}
            data-block-id={node.id}
            data-selected={selected}
            {...(anchor === undefined
              ? {}
              : {
                  'data-anchor-id': anchor.anchorId,
                  'data-anchor-group': anchor.anchorId,
                  'data-anchor-first': anchor.first ? 'true' : 'false',
                  'data-anchor-last': anchor.last ? 'true' : 'false',
                  'data-anchor-selected': anchorSelected ? 'true' : 'false',
                  'data-anchor-state': anchor.state,
                  'data-branch-id': node.branchId ?? '',
                })}
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
            {anchor === undefined ? (
              <span className="nf-tree-bullet" data-child={!node.topLevel} aria-hidden="true" />
            ) : (
              <span className="nf-tree-anchor-prefix" title={`Anchor: “${anchor.quote || 'anchor'}”`}>
                <span className="nf-tree-anchor-arrow" aria-hidden="true">
                  ↳
                </span>{' '}
                <span className="nf-tree-anchor-quote">“{anchor.quote || 'anchor'}”</span>
              </span>
            )}
            <span className="nf-tree-label" title={title}>
              {title}
            </span>
            {anchor !== undefined && anchor.count > 1 ? (
              <span
                className="nf-tree-count nf-tree-anchor-branches"
                data-anchor-branch-count={anchor.count}
                title={`${anchor.count} branches from “${anchor.quote || 'anchor'}”`}
              >
                {anchor.count}
              </span>
            ) : null}
            {anchor !== undefined && anchor.warning ? (
              <span
                className="nf-tree-anchor-warning"
                data-anchor-warning={anchor.state}
                title={anchor.state === 'ambiguous' ? 'Ambiguous anchor' : 'Lost anchor'}
              >
                <TriangleAlert size={10} strokeWidth={1.5} aria-hidden="true" />
              </span>
            ) : null}
            {anchorIds.length > 0 ? (
              <span
                className="nf-tree-anchor-count"
                data-anchor-count={anchorIds.length}
                title={`${anchorIds.length} anchors`}
                aria-label={`${anchorIds.length} anchors`}
              >
                <Anchor size={10} strokeWidth={1.5} aria-hidden="true" />
                <span>{anchorIds.length}</span>
              </span>
            ) : null}
            {incomingReferences.length > 0 ? (
              <button
                type="button"
                className="nf-tree-shared"
                data-shared-count={incomingReferences.length}
                aria-label={`Shared: referenced by ${incomingReferences.length} ${
                  incomingReferences.length === 1 ? 'block' : 'blocks'
                }`}
                title={incomingReferences
                  .map((branch) => blockTitle(runtime.document.blocks[branch.source.blockId]))
                  .join(' · ')}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const first = incomingReferences[0];
                  if (first !== undefined) {
                    focusBlock(runtime.packagePath, first.source.blockId);
                  }
                }}
              >
                Shared · {incomingReferences.length}
              </button>
            ) : null}
            {warningCount > 0 ? (
              <span
                className="nf-tree-anchor-warning"
                data-anchor-warning-count={warningCount}
                title={
                  warningCount === 1
                    ? 'One anchor cannot be resolved'
                    : `${warningCount} anchors cannot be resolved`
                }
                aria-label={`${warningCount} anchors cannot be resolved`}
              >
                <TriangleAlert size={10} strokeWidth={1.5} aria-hidden="true" />
                <span>{warningCount}</span>
              </span>
            ) : null}
            {anchor === undefined && hasChildren ? (
              <span className="nf-tree-count" aria-hidden="true">
                {children.length}
              </span>
            ) : null}
          </div>
        )}
      </TreeItemContent>
      {anchorGroups.flatMap((group) =>
        group.nodes.map((child, index) => (
          <BlockTreeItem
            key={child.id}
            runtime={runtime}
            node={child}
            onRename={onRename}
            anchor={{
              anchorId: group.anchorId,
              quote: group.quote,
              state: group.state,
              warning: group.warning,
              count: group.nodes.length,
              first: index === 0,
              last: index === group.nodes.length - 1,
            }}
          />
        )),
      )}
      {directChildren.map((child) => (
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
  // Reactive form of the global editability helper: mode/layout changes must
  // re-enable or disable the shell controls without remounting the sidebar.
  const editingEnabled = useShell((state) =>
    activePath === null ? false : editingEnabledFor(runtime, state.viewByDoc[activePath]),
  );
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const markdownActive = activePath !== null && isMarkdownPath(activePath);

  const chapters = useMemo(
    () => (runtime === null ? [] : buildChapterTrees(runtime.document)),
    [runtime?.document, runtime?.version],
  );

  if (runtime === null || activePath === null) {
    return (
      <section className="nf-sidebar-section nf-topics-section" aria-label="Outline">
        <div className="nf-section-head">
          <span className="nf-section-label">Outline</span>
        </div>
        <p className="nf-empty-line" data-outline-empty="true">
          {markdownActive
            ? 'A Markdown file has no outline.'
            : activePath === null
              ? 'Open a document to see its outline.'
              : 'Document unavailable.'}
        </p>
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
      const block = runtime.document.blocks[id];
      if (block === undefined) continue;
      const incoming = incomingBranch(runtime.document, id);
      focusBlock(activePath, id);
      const anchorId = incoming?.source.anchorId;
      if (incoming !== undefined && anchorId !== undefined) {
        // The row targets an anchored callout: keep the branch selected and
        // highlight its quote/anchor on the source block. The explicit block
        // selection clears any previous anchor; selectAnchor then installs
        // this row's anchor and holds it through the focus-driven canvas sync.
        runtime.selectBlock(id);
        runtime.selectAnchor(incoming.source.blockId, anchorId, incoming.id);
      }
    }
  };

  const beginRename = (target: RenameTarget): void => {
    if (!editingEnabled) return;
    setRenaming(target);
  };

  const commitRename = (): void => {
    if (renaming === null) return;
    // A rename input that was open when the mode switched must not commit into
    // the document from Read.
    if (!editingEnabled) {
      setRenaming(null);
      return;
    }
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
    <section className="nf-sidebar-section nf-topics-section" aria-label="Outline">
      <div className="nf-section-head">
        <span className="nf-section-label">Outline</span>
        <button
          type="button"
          className="nf-icon-button"
          disabled={!editingEnabled}
          aria-label={editingEnabled ? 'Add chapter' : `Add chapter — ${READ_MODE_TITLE}`}
          title={editingEnabled ? 'Add chapter' : READ_MODE_TITLE}
          onClick={() => {
            void createChapter();
          }}
        >
          <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
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
                      beginRename({ kind: 'chapter', id: chapter.id, value: chapter.title })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'F2') {
                        event.preventDefault();
                        beginRename({ kind: 'chapter', id: chapter.id, value: chapter.title });
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
                <BlockTreeItem key={block.id} runtime={runtime} node={block} onRename={beginRename} />
              ))}
            </TreeItem>
          ))}
        </Tree>
      )}
      <div className="nf-section-foot">
        <button
          type="button"
          className="nf-text-button"
          disabled={!editingEnabled}
          aria-label={editingEnabled ? 'Add block' : `Add block — ${READ_MODE_TITLE}`}
          title={editingEnabled ? 'Add block' : READ_MODE_TITLE}
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

/**
 * The Sidebar is a persistent column. Expanded it is a rounded panel with the
 * search/new/collapse header, Library and Topics, and a footer container whose
 * Settings entry is a button (not the whole footer). Collapsed it stays mounted
 * as a 48 px rail with expand at the top and Settings at the bottom; `⌘\`
 * toggles it and the Toolbar shifts with the rail.
 */
export function Sidebar({
  collapsed = false,
  onExpand,
}: {
  collapsed?: boolean;
  onExpand?: () => void;
} = {}): JSX.Element {
  const openDialog = useShell((state) => state.openDialog);
  const openPalette = useShell((state) => state.setPaletteOpen);
  const sidebarTab = useShell((state) => state.sidebarTab);
  const collapseSidebar = (): void => useShell.getState().setSidebarCollapsed(true);
  const expandSidebar = (): void => {
    if (onExpand !== undefined) onExpand();
    else useShell.getState().setSidebarCollapsed(false);
  };
  const openSettings = (): void => openDialog({ kind: 'settings' });

  if (collapsed) {
    return (
      <aside
        className="nf-sidebar nf-sidebar-rail"
        id="nf-sidebar"
        aria-label="Sidebar"
        data-collapsed="true"
      >
        <div className="nf-rail-head">
          <button
            type="button"
            className="nf-icon-button nf-rail-button"
            data-sidebar-expand="true"
            aria-label="Expand sidebar"
            aria-expanded={false}
            aria-controls="nf-sidebar"
            title="Expand sidebar (⌘\\)"
            onClick={expandSidebar}
          >
            <PanelLeftOpen size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="nf-rail-spacer" />
        <div className="nf-rail-foot">
          <button
            type="button"
            className="nf-icon-button nf-rail-button"
            data-rail-settings="true"
            aria-label="Settings"
            title="Settings (⌘,)"
            onClick={openSettings}
          >
            <Settings size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="nf-sidebar" id="nf-sidebar" aria-label="Sidebar" data-collapsed="false">
      <div className="nf-sidebar-head">
        <button
          type="button"
          className="nf-icon-button nf-sidebar-collapse"
          aria-label="Collapse sidebar"
          aria-expanded={true}
          aria-controls="nf-sidebar"
          title="Collapse sidebar (⌘\\)"
          onClick={collapseSidebar}
        >
          <PanelLeftClose size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button type="button" className="nf-sidebar-search" onClick={() => openPalette(true)}>
          <Search size={13} strokeWidth={1.5} aria-hidden="true" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
      <SidebarTabs />
      <div
        className="nf-sidebar-scroll"
        id="nf-sidebar-panel"
        role="tabpanel"
        aria-labelledby={`nf-sidebar-tab-${sidebarTab}`}
        data-sidebar-panel={sidebarTab}
      >
        {sidebarTab === 'library' ? <LibrarySection /> : <TopicSection />}
      </div>
      <div className="nf-sidebar-foot">
        <button
          type="button"
          className="nf-sidebar-settings"
          aria-label="Settings"
          title="Settings (⌘,)"
          onClick={openSettings}
        >
          <span className="nf-sidebar-settings-icon">
            <Settings size={15} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Settings</span>
        </button>
        <span className="nf-sidebar-foot-spacer" aria-hidden="true" />
      </div>
    </aside>
  );
}
