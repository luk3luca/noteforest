import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_VIEW,
  normalizeDocumentViewState,
} from '../src/shared/view-state';
import { buildSession } from '../src/renderer/src/state/session';
import { useShell } from '../src/renderer/src/state/shell';
import { readSession } from '../src/main/library';

const temporaryDirectories: string[] = [];
let previousAppSupport: string | undefined;

async function supportDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'noteforest-session-'));
  temporaryDirectories.push(directory);
  previousAppSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_APP_SUPPORT'] = directory;
  return directory;
}

beforeEach(() => {
  useShell.setState({
    tabs: [],
    activeTab: null,
    viewByDoc: {},
  });
});

afterEach(async () => {
  if (previousAppSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousAppSupport;
  previousAppSupport = undefined;
  while (temporaryDirectories.length > 0) {
    await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
  useShell.setState({ tabs: [], activeTab: null, viewByDoc: {} });
});

describe('editor layout and interaction-mode state', () => {
  it('defaults to Continuous Edit and normalizes legacy or invalid values', () => {
    expect(normalizeDocumentViewState({})).toEqual(DEFAULT_DOCUMENT_VIEW);
    expect(normalizeDocumentViewState(undefined)).toEqual(DEFAULT_DOCUMENT_VIEW);

    const pageWithEdit = normalizeDocumentViewState({
      layout: 'page',
      interactionMode: 'edit',
    });
    expect(pageWithEdit.layout).toBe('page');
    expect(pageWithEdit.interactionMode).toBe('read');

    const invalid = normalizeDocumentViewState({
      layout: 'map',
      interactionMode: 'preview',
      currentPage: -4.4,
      pageZoom: 99,
      pageFit: 'bogus',
      zoom: 0.01,
      focusBlockId: 42,
    });
    expect(invalid).toEqual({
      zoom: 0.5,
      focusBlockId: null,
      layout: 'continuous',
      interactionMode: 'edit',
      currentPage: 1,
      pageZoom: 2.5,
      pageFit: 'page',
    });

    expect(normalizeDocumentViewState({ zoom: 1.239 }).zoom).toBe(1.24);
    expect(normalizeDocumentViewState({ pageZoom: 0 }).pageZoom).toBe(0.1);
    expect(normalizeDocumentViewState({ currentPage: 3.6 }).currentPage).toBe(4);
  });

  it('switches Page to Read, keeps Page Edit disabled, and returns to Continuous Edit', () => {
    const store = useShell.getState();
    expect(store.viewByDoc['doc']).toBeUndefined();

    store.setDocumentLayout('doc', 'page');
    expect(useShell.getState().viewByDoc['doc']?.layout).toBe('page');
    expect(useShell.getState().viewByDoc['doc']?.interactionMode).toBe('read');

    useShell.getState().setDocumentInteractionMode('doc', 'edit');
    expect(useShell.getState().viewByDoc['doc']?.interactionMode).toBe('read');

    useShell.getState().setDocumentLayout('doc', 'continuous');
    expect(useShell.getState().viewByDoc['doc']?.interactionMode).toBe('edit');
    useShell.getState().setDocumentInteractionMode('doc', 'read');
    expect(useShell.getState().viewByDoc['doc']?.interactionMode).toBe('read');
  });

  it('clamps navigation setters and restores a full view state', () => {
    const store = useShell.getState();
    store.setDocumentViewState('doc', {
      zoom: 1.2,
      layout: 'page',
      interactionMode: 'edit',
      currentPage: 3,
      pageZoom: 1.4,
      pageFit: 'none',
    });
    expect(useShell.getState().viewByDoc['doc']).toMatchObject({
      zoom: 1.2,
      layout: 'page',
      interactionMode: 'read',
      currentPage: 3,
      pageZoom: 1.4,
      pageFit: 'none',
    });

    useShell.getState().setDocumentPageZoom('doc', 99);
    expect(useShell.getState().viewByDoc['doc']?.pageZoom).toBe(2.5);
    useShell.getState().setDocumentZoom('doc', 0.01);
    expect(useShell.getState().viewByDoc['doc']?.zoom).toBe(0.5);
    useShell.getState().setDocumentPage('doc', -2);
    expect(useShell.getState().viewByDoc['doc']?.currentPage).toBe(1);
  });

  it('writes per-document view state in buildSession', () => {
    useShell.setState({
      tabs: [{ packagePath: '/tmp/doc', title: 'Doc' }],
      activeTab: '/tmp/doc',
      viewByDoc: {
        '/tmp/doc': {
          zoom: 1.2,
          focusBlockId: null,
          layout: 'page',
          interactionMode: 'read',
          currentPage: 3,
          pageZoom: 1.4,
          pageFit: 'none',
        },
      },
    });
    const session = buildSession();
    expect(session.tabs[0]).toMatchObject({
      packagePath: '/tmp/doc',
      layout: 'page',
      interactionMode: 'read',
      currentPage: 3,
      pageZoom: 1.4,
      pageFit: 'none',
      zoom: 1.2,
    });
  });

  it('reads legacy tabs with safe defaults and clamps corrupt values', async () => {
    const directory = await supportDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'shell-session.json'),
      JSON.stringify({
        tabs: [
          {
            packagePath: '/legacy/doc',
            scrollTop: 0,
            selectedBlockId: null,
            collapsed: [],
          },
          {
            packagePath: '/corrupt/doc',
            scrollTop: -5,
            selectedBlockId: 42,
            collapsed: ['keep', 7],
            layout: 'page',
            interactionMode: 'edit',
            currentPage: -1,
            pageZoom: 99,
            pageFit: 'bogus',
            zoom: 0.01,
          },
        ],
        activeTab: '/legacy/doc',
        sidebarCollapsed: false,
        sidebarWidth: 264,
        collapsedTopics: {},
      }),
    );

    const session = await readSession();
    expect(session.tabs[0]).toMatchObject({
      packagePath: '/legacy/doc',
      layout: 'continuous',
      interactionMode: 'edit',
      currentPage: 1,
      pageZoom: 1,
      pageFit: 'page',
      zoom: 1,
    });
    expect(session.tabs[1]).toMatchObject({
      packagePath: '/corrupt/doc',
      scrollTop: 0,
      selectedBlockId: null,
      collapsed: ['keep'],
      layout: 'page',
      interactionMode: 'read',
      currentPage: 1,
      pageZoom: 2.5,
      pageFit: 'page',
      zoom: 0.5,
    });
  });

  it('round-trips buildSession through readSession', async () => {
    const directory = await supportDirectory();
    await mkdir(directory, { recursive: true });
    useShell.setState({
      tabs: [{ packagePath: '/tmp/doc', title: 'Doc' }],
      activeTab: '/tmp/doc',
      viewByDoc: {
        '/tmp/doc': {
          zoom: 1.3,
          focusBlockId: null,
          layout: 'page',
          interactionMode: 'read',
          currentPage: 4,
          pageZoom: 1.7,
          pageFit: 'width',
        },
      },
    });
    const built = buildSession();
    await writeFile(
      path.join(directory, 'shell-session.json'),
      JSON.stringify(built, null, 2),
    );
    const restored = await readSession();
    expect(restored.tabs[0]).toMatchObject({
      packagePath: '/tmp/doc',
      layout: 'page',
      interactionMode: 'read',
      currentPage: 4,
      pageZoom: 1.7,
      pageFit: 'width',
      zoom: 1.3,
    });
  });
});
