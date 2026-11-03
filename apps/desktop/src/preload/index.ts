import { contextBridge, ipcRenderer } from 'electron';
import type {
  ExportRequest,
  ExportResult,
  FixtureSummary,
  LoadedFixture,
  NoteForestApi,
  PrintPayload,
  SystemInfo,
} from '../shared/api.js';

const api: NoteForestApi = {
  listFixtures: (): Promise<FixtureSummary[]> => ipcRenderer.invoke('fixtures:list'),
  loadFixture: (file: string): Promise<LoadedFixture> => ipcRenderer.invoke('fixtures:load', file),
  exportPdf: (request: ExportRequest): Promise<ExportResult> =>
    ipcRenderer.invoke('export:pdf', request),
  printHello: async (): Promise<void> => {
    ipcRenderer.send('print:hello');
  },
  onPrintPayload: (handler: (payload: PrintPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: PrintPayload): void => {
      handler(payload);
    };
    ipcRenderer.on('print:payload', listener);
    return () => ipcRenderer.removeListener('print:payload', listener);
  },
  printReady: async (exportId: string): Promise<void> => {
    ipcRenderer.send('print:ready', { exportId });
  },
  getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('system:info'),
};

contextBridge.exposeInMainWorld('noteforest', api);
