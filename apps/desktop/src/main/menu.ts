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
        label: 'Open Markdown…',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: () => send('open-markdown'),
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
      {
        id: 'menu-export-pdf',
        label: 'Export PDF…',
        accelerator: 'CmdOrCtrl+Shift+E',
        click: () => send('export-pdf'),
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
        id: 'menu-undo',
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        // The renderer owns the shortcut so one keypress has exactly one
        // delivery path. The menu item still shows the accelerator and clicks
        // still send the same routed command.
        registerAccelerator: false,
        click: () => send('undo'),
      },
      {
        id: 'menu-redo',
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        registerAccelerator: false,
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
        // Renderer-owned accelerator: one keypress is one toggle path. The menu
        // still shows the shortcut and a menu click sends the same command.
        registerAccelerator: false,
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
      {
        label: 'Fit Width',
        accelerator: 'CmdOrCtrl+Shift+0',
        registerAccelerator: false,
        click: () => send('fit-width'),
      },
      {
        label: 'Focus Branch',
        accelerator: 'CmdOrCtrl+Shift+F',
        registerAccelerator: false,
        click: () => send('focus-branch'),
      },
      {
        label: 'Actual Size',
        accelerator: 'CmdOrCtrl+0',
        registerAccelerator: false,
        click: () => send('zoom-reset'),
      },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        registerAccelerator: false,
        click: () => send('zoom-in'),
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        registerAccelerator: false,
        click: () => send('zoom-out'),
      },
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
        id: 'menu-keyboard-shortcuts',
        // Opens Settings on the Editor page instead of the default Page page:
        // the menu item promises the shortcut list, not the whole Settings modal.
        label: 'Keyboard shortcuts',
        click: () => send('settings-shortcuts'),
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
