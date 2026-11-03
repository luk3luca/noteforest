import { Menu, app, type BrowserWindow } from 'electron';
import type { MenuCommand } from '../shared/api.js';

export type MenuSender = (command: MenuCommand) => void;

export function installApplicationMenu(getWindow: () => BrowserWindow | null, send: MenuSender): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: 'NoteForest',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => send('settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New Document',
        accelerator: 'CmdOrCtrl+N',
        click: () => send('new-document'),
      },
      {
        label: 'Open Document…',
        accelerator: 'CmdOrCtrl+O',
        click: () => send('open-document'),
      },
      {
        label: 'New Chapter',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => send('new-chapter'),
      },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => send('save'),
      },
      { type: 'separator' },
      {
        label: 'Close Tab',
        accelerator: 'CmdOrCtrl+W',
        click: () => send('close-tab'),
      },
      {
        label: 'Reopen Closed Tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => send('reopen-tab'),
      },
      {
        label: 'Close Window',
        accelerator: 'CmdOrCtrl+Shift+W',
        click: () => getWindow()?.close(),
      },
    ],
  });

  template.push({
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        click: () => send('undo'),
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => send('redo'),
      },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Command Palette…',
        accelerator: 'CmdOrCtrl+K',
        click: () => send('command-palette'),
      },
      {
        label: 'Toggle Sidebar',
        accelerator: 'CmdOrCtrl+\\',
        click: () => send('toggle-sidebar'),
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Window',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [])],
  });

  template.push({
    role: 'help',
    submenu: [
      {
        label: 'Keyboard shortcuts',
        click: () => send('settings'),
      },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Native text editing context menu; block/tab/tree menus are renderer-owned. */
export function attachTextContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const menu = Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' },
    ]);
    menu.popup({ window });
  });
}

export function appName(): string {
  return app.getName();
}
