import type {
  ContinuousLayout,
  NoteDocument,
  PaginatedDocument,
  PageSetup,
} from '@noteforest/layout';

export interface FixtureSummary {
  file: string;
  id: string;
  title: string;
  blockCount: number;
  chapterCount: number;
  bytes: number;
}

export interface LoadedFixture {
  file: string;
  document: NoteDocument;
  /** asset id -> data URL, loaded from fixtures/assets. */
  assets: Record<string, string>;
}

export interface ExportRequest {
  document: NoteDocument;
  layout: ContinuousLayout;
  pages: PaginatedDocument;
  pageSetup: PageSetup;
  assets: Record<string, string>;
  outputName?: string;
}

export interface ExportResult {
  ok: boolean;
  path?: string;
  error?: string;
  expectedPageCount?: number;
  pdfPageCount?: number;
  bytes?: number;
  durationMs?: number;
}

export interface PrintPayload {
  exportId: string;
  document: NoteDocument;
  layout: ContinuousLayout;
  pages: PaginatedDocument;
  assets: Record<string, string>;
}

export interface SystemInfo {
  electron: string;
  chrome: string;
  node: string;
  v8: string;
  platform: string;
  arch: string;
  appVersion: string;
}

export interface NoteForestApi {
  listFixtures(): Promise<FixtureSummary[]>;
  loadFixture(file: string): Promise<LoadedFixture>;
  exportPdf(request: ExportRequest): Promise<ExportResult>;
  printHello(): Promise<void>;
  onPrintPayload(handler: (payload: PrintPayload) => void): () => void;
  printReady(exportId: string): Promise<void>;
  getSystemInfo(): Promise<SystemInfo>;
}
