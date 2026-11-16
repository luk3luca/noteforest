import { Menu, app, type BrowserWindow } from 'electron';
import type { MenuCommand } from '../shared/api.js';
import { buildMenuTemplate } from './menu-template.js';

export type { MenuSender } from './menu-template.js';

export function installApplicationMenu(getWindow: () => BrowserWindow | null, send: (command: MenuCommand) => void): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate({
        isMac: process.platform === 'darwin',
        send,
        getWindow,
      }),
    ),
  );
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
