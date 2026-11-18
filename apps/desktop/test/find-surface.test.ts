import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSession, writeSession } from '../src/main/library';
import { snippetParts } from '../src/renderer/src/lib/find-snippet';
import {
  currentFindResult,
  findSurfaceActive,
  useShell,
} from '../src/renderer/src/state/shell';
import type { FindResult } from '../src/renderer/src/lib/find';

/**
 * Shared find surface (docs/design/find-bar.md).
 *
 * One state feeds two presentations: the toolbar cluster (`findOpen`) and the
 * sidebar Search section. These tests pin the store contract both read — query,
 * results, current occurrence, active surface — and the session value that lets
 * the Search section survive a restart. The two-line snippet split is pure
 * presentation over the engine's own `snippet`/`snippetStart`.
 */

function result(id: string, blockId: string, start: number, snippet: string): FindResult {
  return {
    id,
    kind: 'text',
    field: 'text',
    blockId,
    chapterId: 'chapter-1',
    start,
    end: start + 5,
    snippetStart: start,
    occurrence: 0,
    snippet,
  };
}

const RESULTS: FindResult[] = [
  result('text:a:0:', 'a', 10, '…A scalar λ is an eigenvalue of A…'),
  result('text:a:30:', 'a', 30, '…the eigenvalue λ of the matrix is 1…'),
  result('text:b:0:', 'b', 2, '…an eigenvector of A when Av = λv…'),
];

function seedFind(results: FindResult[] = RESULTS): void {
  useShell.getState().setFindQuery('eigen');
  useShell.getState().setFindResults(results, results.length, false);
}

let root = '';
let support = '';
let previousSupport: string | undefined;

beforeEach(async () => {
  useShell.setState({
    sidebarTab: 'library',
    sidebarTabBeforeSearch: null,
    findOpen: false,
    findQuery: '',
    findWholeWord: false,
    findResults: [],
    findTotal: 0,
    findTruncated: false,
    findIndex: -1,
    findFocusRequest: 0,
  });
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-find-surface-'));
  support = path.join(root, 'support');
  await fs.mkdir(support, { recursive: true });
  previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_APP_SUPPORT'] = support;
});

afterEach(async () => {
  if (previousSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousSupport;
  await fs.rm(root, { recursive: true, force: true });
});

function sessionFile(): string {
  return path.join(support, 'shell-session.json');
}

async function writeRawSession(extra: Record<string, unknown>): Promise<void> {
  await fs.writeFile(
    sessionFile(),
    JSON.stringify({
      tabs: [],
      activeTab: null,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      ...extra,
    }),
  );
}

describe('shared find state', () => {
  it('runs query → results → current in the store both views read', () => {
    const state = useShell.getState();
    state.setFindQuery('eigen');
    expect(useShell.getState().findQuery).toBe('eigen');
    expect(useShell.getState().findResults).toHaveLength(0);

    state.setFindResults(RESULTS, RESULTS.length, false);
    expect(useShell.getState().findTotal).toBe(3);
    expect(useShell.getState().findIndex).toBe(0);
    expect(currentFindResult(useShell.getState())?.id).toBe('text:a:0:');

    useShell.getState().nextFind();
    expect(useShell.getState().findIndex).toBe(1);
    expect(currentFindResult(useShell.getState())?.id).toBe('text:a:30:');
    useShell.getState().previousFind();
    expect(useShell.getState().findIndex).toBe(0);
    useShell.getState().previousFind();
    expect(useShell.getState().findIndex).toBe(2, 'previous wraps to the last occurrence');
    useShell.getState().lastFind();
    expect(useShell.getState().findIndex).toBe(2);
    useShell.getState().firstFind();
    expect(useShell.getState().findIndex).toBe(0);
    useShell.getState().setFindIndex(1);
    expect(useShell.getState().findIndex).toBe(1);
    useShell.getState().setFindIndex(99);
    expect(useShell.getState().findIndex).toBe(2, 'an out-of-range index clamps');
  });

  it('reports the current hit with no open-state gate, so the sidebar can own it', () => {
    seedFind();
    expect(useShell.getState().findOpen).toBe(false);
    expect(currentFindResult(useShell.getState())?.id).toBe('text:a:0:');
    expect(findSurfaceActive(useShell.getState())).toBe(false);

    useShell.getState().setSidebarTab('search');
    expect(findSurfaceActive(useShell.getState())).toBe(true);
    expect(currentFindResult(useShell.getState())?.id).toBe('text:a:0:');

    useShell.getState().openFind();
    expect(findSurfaceActive(useShell.getState())).toBe(true);
    useShell.getState().closeFind();
    expect(
      currentFindResult(useShell.getState())?.id,
      'closing the cluster keeps the browsing list',
    ).toBe('text:a:0:');
  });

  it('clears the results when the last surface closes', () => {
    seedFind();
    useShell.getState().openFind();
    useShell.getState().closeFind();
    expect(useShell.getState().findResults).toHaveLength(0);
    expect(useShell.getState().findIndex).toBe(-1);
    expect(currentFindResult(useShell.getState())).toBeNull();
    expect(useShell.getState().findQuery, 'the query survives the session').toBe('eigen');
  });

  it('opens and closes the sidebar Search from the section it came from', () => {
    useShell.getState().setSidebarTab('outline');
    seedFind();
    useShell.getState().setSidebarTab('search');
    expect(useShell.getState().sidebarTab).toBe('search');
    expect(useShell.getState().sidebarTabBeforeSearch).toBe('outline');

    useShell.getState().closeSearchSection();
    expect(useShell.getState().sidebarTab).toBe('outline');
    expect(useShell.getState().sidebarTabBeforeSearch).toBeNull();
    expect(useShell.getState().findResults, 'the section close drops the list').toHaveLength(0);
  });

  it('returns to Outline when Search was restored without a previous section', () => {
    useShell.setState({ sidebarTab: 'search', sidebarTabBeforeSearch: null, findOpen: true });
    useShell.getState().closeSearchSection();
    expect(useShell.getState().sidebarTab).toBe('outline');
    expect(useShell.getState().findResults, 'the open cluster keeps the list').toHaveLength(0);
  });

  it('keeps the list when the section closes while the toolbar cluster is open', () => {
    seedFind();
    useShell.getState().openFind();
    useShell.getState().setSidebarTab('search');
    useShell.getState().closeSearchSection();
    expect(useShell.getState().findResults).toHaveLength(3);
    expect(currentFindResult(useShell.getState())?.id).toBe('text:a:0:');
  });

  it('rejects an unknown sidebar tab and accepts every find section', () => {
    useShell.getState().setSidebarTab('files' as never);
    expect(useShell.getState().sidebarTab).toBe('library');
    for (const tab of ['outline', 'health', 'search', 'library'] as const) {
      useShell.getState().setSidebarTab(tab);
      expect(useShell.getState().sidebarTab).toBe(tab);
    }
  });

  it('bumps the focus request on every open so ⌘F re-selects the query', () => {
    const before = useShell.getState().findFocusRequest;
    useShell.getState().openFind();
    useShell.getState().openFind();
    expect(useShell.getState().findFocusRequest).toBe(before + 2);
    expect(useShell.getState().findOpen).toBe(true);
  });

  it('keeps one shared whole-word mode across both surfaces', () => {
    expect(useShell.getState().findWholeWord).toBe(false);
    useShell.getState().setFindWholeWord(true);
    expect(useShell.getState().findWholeWord).toBe(true);

    useShell.getState().openFind();
    useShell.getState().closeFind();
    expect(
      useShell.getState().findWholeWord,
      'closing the toolbar keeps the shared mode',
    ).toBe(true);

    useShell.getState().setSidebarTab('search');
    useShell.getState().setFindWholeWord(false);
    useShell.getState().closeSearchSection();
    expect(
      useShell.getState().findWholeWord,
      'closing the sidebar keeps the shared mode',
    ).toBe(false);
  });
});

describe('sidebar Search session value', () => {
  it('persists and restores the search section', async () => {
    await writeSession({
      tabs: [],
      activeTab: null,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'search',
    });
    expect((await readSession()).sidebarTab).toBe('search');
  });

  it('falls back to Library for a legacy session without the field', async () => {
    await writeRawSession({});
    expect((await readSession()).sidebarTab).toBe('library');
  });

  it('still normalizes an unknown persisted value', async () => {
    await writeRawSession({ sidebarTab: 'find' });
    expect((await readSession()).sidebarTab).toBe('library');
  });
});

describe('sidebar snippet split', () => {
  it('splits the engine snippet at the match and keeps the ellipses', () => {
    const parts = snippetParts(
      '…A scalar λ is an eigenvalue of A…',
      'eigen',
      22,
    );
    expect(parts.lead).toBe(true);
    expect(parts.trail).toBe(true);
    expect(parts.match).toBe('eigen');
    expect(parts.before.endsWith('an ')).toBe(true);
    expect(parts.after.startsWith('value')).toBe(true);
  });

  it('picks the occurrence nearest the engine offset when the word repeats', () => {
    const parts = snippetParts('…eigen and eigenvalue…', 'eigen', 14);
    expect(parts.match).toBe('eigen');
    expect(parts.before).toBe('eigen and ');
    expect(parts.after).toBe('value');
  });

  it('returns the whole body when the match cannot be located', () => {
    const parts = snippetParts('…no needle here…', 'eigen', 0);
    expect(parts).toMatchObject({ lead: true, trail: true, match: '', before: 'no needle here', after: '' });
  });

  it('keeps a whole-field snippet without ellipses', () => {
    const parts = snippetParts('Anchored quote about eigenvalues', 'eigen', 24);
    expect(parts.lead).toBe(false);
    expect(parts.trail).toBe(false);
    expect(parts.match).toBe('eigen');
    expect(parts.before).toBe('Anchored quote about ');
    expect(parts.after).toBe('values');
  });

  it('splits with the shared whitespace-loose query mode', () => {
    const parts = snippetParts('…come  qui and more…', 'come   qui', 5);
    expect(parts.lead).toBe(true);
    expect(parts.trail).toBe(true);
    expect(parts.match).toBe('come  qui');
    expect(parts.before).toBe('');
    expect(parts.after).toBe(' and more');
  });

  it('honours whole-word when splitting the snippet', () => {
    const standalone = snippetParts('An eigenvalue about eigen.', 'eigen', 3, true);
    expect(standalone.match).toBe('eigen');
    expect(standalone.before).toBe('An eigenvalue about ');
    expect(standalone.after).toBe('.');

    const onlySubstring = snippetParts('eigenvalue', 'eigen', 0, true);
    expect(onlySubstring.match).toBe('');
    expect(onlySubstring.before).toBe('eigenvalue');
  });
});
