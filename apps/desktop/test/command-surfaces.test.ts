import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { toast } from 'sonner';
import {
  COMMAND_REASONS,
  appCommandIds,
  commandById,
  type AppCommandId,
  type CommandContext,
} from '../src/shared/commands';
import { RUNNERS } from '../src/renderer/src/commands/runners';
import {
  channelAllows,
  commandAction,
  runAppCommand,
} from '../src/renderer/src/commands/run';
import { matchAppKey, type AppKeyEvent } from '../src/renderer/src/commands/keys';
import { useShell } from '../src/renderer/src/state/shell';

const NOTE_EDIT: CommandContext = {
  document: 'note',
  layout: 'continuous',
  mode: 'edit',
  canAuthor: true,
  hasSelection: true,
  findBarOpen: false,
  findActive: false,
  tabCount: 2,
};

const NO_DOCUMENT: CommandContext = {
  document: 'none',
  layout: 'continuous',
  mode: 'edit',
  canAuthor: false,
  hasSelection: false,
  findBarOpen: false,
  findActive: false,
  tabCount: 0,
};

const GUEST: CommandContext = { ...NOTE_EDIT, document: 'guest', canAuthor: false };

function press(
  key: string,
  extra: Partial<AppKeyEvent> = {},
): AppKeyEvent {
  return {
    key,
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    ...extra,
  };
}

afterEach(() => {
  useShell.setState({ dialog: null, paletteOpen: false, tabs: [], activeTab: null, findOpen: false });
  vi.mocked(toast.info).mockClear();
});

describe('the surface policy', () => {
  it('runs enabled, reports a disabled refusal once, and ignores hidden', () => {
    expect(commandAction({ kind: 'enabled' }, 'menu')).toEqual({ kind: 'run' });
    expect(commandAction({ kind: 'enabled' }, 'key')).toEqual({ kind: 'run' });
    expect(commandAction({ kind: 'enabled' }, 'palette')).toEqual({ kind: 'run' });

    expect(commandAction({ kind: 'disabled', reason: 'R' }, 'menu')).toEqual({
      kind: 'report',
      reason: 'R',
    });
    expect(commandAction({ kind: 'disabled', reason: 'R' }, 'key')).toEqual({
      kind: 'report',
      reason: 'R',
    });
    // The palette row states the reason inline; clicking it must not double-report.
    expect(commandAction({ kind: 'disabled', reason: 'R' }, 'palette')).toEqual({
      kind: 'ignore',
    });

    for (const surface of ['menu', 'key', 'palette'] as const) {
      expect(commandAction({ kind: 'hidden' }, surface)).toEqual({ kind: 'ignore' });
    }
  });
});

describe('the key router', () => {
  it('maps a chord to its one command and to the manifest decision', () => {
    expect(matchAppKey(press('n'), NOTE_EDIT)?.command.id).toBe('new-document');
    expect(matchAppKey(press('s'), NOTE_EDIT)?.command.id).toBe('save');
    expect(matchAppKey(press('z', { shiftKey: true }), NOTE_EDIT)?.command.id).toBe('redo');
    // A disabled decision still belongs to the command: the router consumes and
    // reports it (D4: ⇧⌘L with no selection).
    const blocked = matchAppKey(press('l', { shiftKey: true }), {
      ...NOTE_EDIT,
      hasSelection: false,
    });
    expect(blocked?.command.id).toBe('link-reference');
    expect(blocked?.decision).toEqual({
      kind: 'disabled',
      reason: COMMAND_REASONS.NO_SELECTION,
    });
    // No document: ⌘S reports instead of silently doing nothing.
    expect(matchAppKey(press('s'), NO_DOCUMENT)?.decision).toEqual({
      kind: 'disabled',
      reason: COMMAND_REASONS.NO_DOCUMENT,
    });
  });

  it('leaves a hidden chord to the local surface', () => {
    // Esc outside an open find bar is the dialog's own key.
    expect(matchAppKey(press('Escape', { metaKey: false }), NOTE_EDIT)).toBeNull();
    // ⌘↑ is block navigation in Continuous and a page step in Page.
    expect(matchAppKey(press('ArrowUp'), NOTE_EDIT)).toBeNull();
    expect(matchAppKey(press('ArrowUp'), { ...NOTE_EDIT, layout: 'page' })?.command.id).toBe(
      'page-previous',
    );
    // ⌃Tab with one tab does not switch anything.
    const controlTab = press('Tab', { metaKey: false, ctrlKey: true });
    expect(matchAppKey(controlTab, { ...NOTE_EDIT, tabCount: 1 })).toBeNull();
    expect(matchAppKey(controlTab, NOTE_EDIT)?.command.id).toBe('tab-next');
    // A guest has no note find.
    expect(matchAppKey(press('f'), GUEST)).toBeNull();
    // ⌘G steps a find only while one is active.
    expect(matchAppKey(press('g'), NOTE_EDIT)).toBeNull();
    expect(matchAppKey(press('g'), { ...NOTE_EDIT, findActive: true })?.command.id).toBe(
      'find-next',
    );
  });

  it('suppresses auto-repeat except for history and zoom', () => {
    expect(matchAppKey(press('s', { repeat: true }), NOTE_EDIT)).toBeNull();
    expect(matchAppKey(press('n', { repeat: true }), NOTE_EDIT)).toBeNull();
    expect(matchAppKey(press('z', { repeat: true }), NOTE_EDIT)?.command.id).toBe('undo');
    expect(matchAppKey(press('z', { repeat: true, shiftKey: true }), NOTE_EDIT)?.command.id).toBe(
      'redo',
    );
    expect(matchAppKey(press('+', { repeat: true }), NOTE_EDIT)?.command.id).toBe('zoom-in');
    expect(matchAppKey(press('-', { repeat: true }), NOTE_EDIT)?.command.id).toBe('zoom-out');
  });

  it('stops propagation only for the chords ProseMirror must not also handle', () => {
    expect(matchAppKey(press('z'), NOTE_EDIT)?.stopPropagation).toBe(true);
    expect(matchAppKey(press('g'), { ...NOTE_EDIT, findActive: true })?.stopPropagation).toBe(
      true,
    );
    expect(matchAppKey(press('l', { shiftKey: true }), NOTE_EDIT)?.stopPropagation).toBe(true);
    expect(matchAppKey(press('s'), NOTE_EDIT)?.stopPropagation).toBe(false);
  });
});

describe('the runner map', () => {
  it('is exhaustive over the manifest ids', () => {
    expect(Object.keys(RUNNERS).sort()).toEqual([...appCommandIds()].sort());
  });
});

describe('the dispatcher', () => {
  it('ignores an unknown id without throwing', () => {
    expect(() => runAppCommand('not-a-command' as AppCommandId, 'menu')).not.toThrow();
    expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
  });

  it('runs an enabled command once', () => {
    runAppCommand('settings', 'menu');
    expect(useShell.getState().dialog).toEqual({ kind: 'settings' });
  });

  it('reports a disabled command from the key and the menu, not from the palette', () => {
    runAppCommand('export-pdf', 'key');
    expect(vi.mocked(toast.info)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(COMMAND_REASONS.EXPORT_NO_NOTE);

    vi.mocked(toast.info).mockClear();
    runAppCommand('export-pdf', 'menu');
    expect(vi.mocked(toast.info)).toHaveBeenCalledTimes(1);

    vi.mocked(toast.info).mockClear();
    runAppCommand('export-pdf', 'palette');
    expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
    expect(useShell.getState().dialog).toBeNull();
  });

  it('stays silent for a hidden command', () => {
    runAppCommand('find-open', 'key');
    expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
    expect(useShell.getState().findOpen).toBe(false);
  });

  it('keeps the modal gate, with the palette toggle and close-window as exceptions', () => {
    const settings = commandById('settings');
    const palette = commandById('command-palette');
    const sidebar = commandById('toggle-sidebar');
    const closeWindow = commandById('close-window');
    expect(settings && palette && sidebar && closeWindow).toBeTruthy();

    expect(channelAllows(settings!, 'menu')).toBe(true);
    useShell.setState({ dialog: { kind: 'settings' } });
    expect(channelAllows(settings!, 'menu')).toBe(false);
    expect(channelAllows(sidebar!, 'key')).toBe(false);
    expect(channelAllows(palette!, 'key')).toBe(false);
    expect(channelAllows(closeWindow!, 'key')).toBe(true);
    // The palette's own ⌘K closes the surface that owns the channel.
    useShell.setState({ dialog: null, paletteOpen: true });
    expect(channelAllows(palette!, 'key')).toBe(true);
    expect(channelAllows(sidebar!, 'key')).toBe(false);
    // A palette row is never blocked by the palette's own gate.
    expect(channelAllows(sidebar!, 'palette')).toBe(true);

    // With the channel free the menu runs; behind a dialog it does nothing.
    useShell.setState({ paletteOpen: false });
    const before = useShell.getState().sidebarCollapsed;
    runAppCommand('toggle-sidebar', 'menu');
    expect(useShell.getState().sidebarCollapsed).toBe(!before);

    useShell.setState({ dialog: { kind: 'settings' } });
    runAppCommand('toggle-sidebar', 'menu');
    expect(useShell.getState().sidebarCollapsed).toBe(!before);
  });
});
