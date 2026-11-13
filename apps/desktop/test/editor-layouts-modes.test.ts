import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_VIEW,
  normalizeDocumentViewState,
} from '../src/shared/view-state';
import { buildSession } from '../src/renderer/src/state/session';
import {
  resetSettingsForTests,
  useSettingsStore,
} from '../src/renderer/src/state/settings';
import { useShell } from '../src/renderer/src/state/shell';
import { readSession, readSessionWithOverrides } from '../src/main/library';

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
  resetSettingsForTests();
});

afterEach(async () => {
  if (previousAppSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousAppSupport;
  previousAppSupport = undefined;
  while (temporaryDirectories.length > 0) {
    await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
  useShell.setState({ tabs: [], activeTab: null, viewByDoc: {} });
  resetSettingsForTests();
});

describe('editor layout and interaction-mode state', () => {
  it('defaults to Continuous Edit and normalizes legacy or invalid values', () => {
    expect(normalizeDocumentViewState({})).toEqual(DEFAULT_DOCUMENT_VIEW);
    expect(normalizeDocumentViewState(undefined)).toEqual(DEFAULT_DOCUMENT_VIEW);

    // An explicit Page Edit persists; Page only opens Read on a new switch.
    const pageWithEdit = normalizeDocumentViewState({
      layout: 'page',
      interactionMode: 'edit',
    });
    expect(pageWithEdit.layout).toBe('page');
    expect(pageWithEdit.interactionMode).toBe('edit');

    // Unknown/missing modes still fall back by layout.
    const pageUnknownMode = normalizeDocumentViewState({
      layout: 'page',
      interactionMode: 'preview',
    });
    expect(pageUnknownMode.interactionMode).toBe('read');
    expect(normalizeDocumentViewState({ layout: 'page' }).interactionMode).toBe('read');
    expect(
      normalizeDocumentViewState({ layout: 'continuous', interactionMode: 'preview' })
        .interactionMode,
    ).toBe('edit');

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

  it('opens Page in Read, allows explicit Page Edit, and returns to Continuous Edit', () => {
    const store = useShell.getState();
    expect(store.viewByDoc['doc']).toBeUndefined();

    store.setDocumentLayout('doc', 'page');
    expect(useShell.getState().viewByDoc['doc']?.layout).toBe('page');
    expect(useShell.getState().viewByDoc['doc']?.interactionMode).toBe('read');

    useShell.getState().setDocumentInteractionMode('doc', 'edit');
    expect(useShell.getState().viewByDoc['doc']?.interactionMode).toBe('edit');

    // Re-selecting the same layout is a no-op and never resets Page Edit.
    useShell.getState().setDocumentLayout('doc', 'page');
    expect(useShell.getState().viewByDoc['doc']?.interactionMode).toBe('edit');

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
      interactionMode: 'edit',
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
      // Explicit Page Edit is restored; corrupt values are handled above.
      interactionMode: 'edit',
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
          interactionMode: 'edit',
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
      interactionMode: 'edit',
      currentPage: 4,
      pageZoom: 1.7,
      pageFit: 'width',
      zoom: 1.3,
    });
  });

  it('keeps personal settings overrides out of the session (S2-2)', () => {
    useShell.setState({
      tabs: [{ packagePath: '/tmp/doc', title: 'Doc' }],
      activeTab: '/tmp/doc',
    });
    useSettingsStore.getState().setPageSettingsOverride(
      '/tmp/doc',
      {
        setup: { size: 'A5', orientation: 'portrait' },
        theme: { preset: 'comfortable' },
        manualBreakBeforeBlockIds: ['b2'],
      },
      'doc-id',
    );

    const session = buildSession();
    expect(session.tabs[0]).not.toHaveProperty('pageSettingsOverride');
    expect(session.tabs[0]).not.toHaveProperty('continuousSettingsOverride');
    // The override is durable in the document map, not in the tab.
    expect(useSettingsStore.getState().documentSettings).toEqual([
      {
        documentId: 'doc-id',
        packagePath: '/tmp/doc',
        page: {
          setup: { size: 'A5', orientation: 'portrait' },
          theme: { preset: 'comfortable' },
          manualBreakBeforeBlockIds: ['b2'],
        },
      },
    ]);
  });

  it('reads legacy session overrides only for migration and strips them from tabs', async () => {
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
            packagePath: '/override/doc',
            scrollTop: 0,
            selectedBlockId: null,
            collapsed: [],
            pageSettingsOverride: {
              setup: { size: 'Letter', orientation: 'portrait', margins: { top: 18 } },
              theme: { preset: 'comfortable', bodyPt: 11, bogus: 2 },
              manualBreakBeforeBlockIds: ['b3', 'b3', 7],
              extra: 'dropped',
            },
            continuousSettingsOverride: { zoom: 1.5, extra: true },
          },
          {
            packagePath: '/corrupt/doc',
            scrollTop: 0,
            selectedBlockId: null,
            collapsed: [],
            pageSettingsOverride: 'not-an-object',
            continuousSettingsOverride: { zoom: 'bad' },
          },
        ],
        activeTab: '/legacy/doc',
        sidebarCollapsed: false,
        sidebarWidth: 264,
        collapsedTopics: {},
      }),
    );

    const read = await readSessionWithOverrides();
    expect(read.session.tabs[0]).not.toHaveProperty('pageSettingsOverride');
    expect(read.session.tabs[1]).not.toHaveProperty('pageSettingsOverride');
    expect(read.session.tabs[1]).not.toHaveProperty('continuousSettingsOverride');
    expect(read.session.tabs[2]).not.toHaveProperty('pageSettingsOverride');
    expect(read.legacyOverrides).toEqual([
      {
        packagePath: '/override/doc',
        pageSettingsOverride: {
          setup: { size: 'Letter', orientation: 'portrait', margins: { top: 18 } },
          theme: { preset: 'comfortable', bodyPt: 11 },
          manualBreakBeforeBlockIds: ['b3'],
        },
      },
    ]);
  });

  it('round-trips view state and never writes personal settings into the session', async () => {
    const directory = await supportDirectory();
    await mkdir(directory, { recursive: true });
    useShell.setState({
      tabs: [{ packagePath: '/tmp/doc', title: 'Doc' }],
      activeTab: '/tmp/doc',
      viewByDoc: {
        '/tmp/doc': {
          zoom: 0.8,
          focusBlockId: null,
          layout: 'continuous',
          interactionMode: 'edit',
          currentPage: 1,
          pageZoom: 1,
          pageFit: 'page',
        },
      },
    });
    useSettingsStore.getState().setPageSettingsOverride(
      '/tmp/doc',
      { setup: { size: 'A5' }, theme: { bodyPt: 9.5 } },
      'doc-id',
    );

    await writeFile(
      path.join(directory, 'shell-session.json'),
      JSON.stringify(buildSession(), null, 2),
    );
    const restored = await readSessionWithOverrides();
    expect(restored.session.tabs[0]).toMatchObject({ packagePath: '/tmp/doc', zoom: 0.8 });
    expect(restored.session.tabs[0]).not.toHaveProperty('pageSettingsOverride');
    expect(restored.legacyOverrides).toEqual([]);
  });

  it('keeps one Continuous zoom source in per-document view state (S2-6)', () => {
    // No global setting can shadow the per-document zoom: R6 adds canvas
    // geometry only, never a zoom field.
    expect(useSettingsStore.getState().app.continuous).not.toHaveProperty('zoom');
    expect(useSettingsStore.getState().app.continuous).not.toHaveProperty('viewState');
    useShell.setState({
      tabs: [{ packagePath: '/tmp/doc', title: 'Doc' }],
      activeTab: '/tmp/doc',
    });
    useShell.getState().setDocumentZoom('/tmp/doc', 1.4);
    expect(useShell.getState().viewByDoc['/tmp/doc']?.zoom).toBe(1.4);
    expect(buildSession().tabs[0]?.zoom).toBe(1.4);
  });
});
