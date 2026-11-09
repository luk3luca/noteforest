import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { ExportJobView } from '../src/shared/export';
import { createExportService } from '../src/main/export-service';

/**
 * M4c3 S3-2: the main process binds the snapshot reply to the requested
 * package and the app sender. A stale/wrong reply is refused instead of being
 * printed as this export. The hidden-window path is faked; the job state
 * machine is the real one.
 */

interface FakeWindow {
  window: BrowserWindow;
  sent: Array<{ channel: string; payload: unknown }>;
}

function fakeWindow(): FakeWindow {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      id: 7,
      send: (channel: string, payload: unknown) => {
        sent.push({ channel, payload });
      },
    },
  } as unknown as BrowserWindow;
  return { window, sent };
}

const tempDirs: string[] = [];

async function serviceWithWindow(options: { snapshotTimeoutMs?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'nf-export-service-'));
  tempDirs.push(dir);
  const fake = fakeWindow();
  const service = createExportService({
    getWindow: () => fake.window,
    printPageTarget: () => ({ kind: 'file', path: '/tmp/print.html' }),
    ...options,
  });
  return { service, fake, dir, outputPath: join(dir, 'note.pdf') };
}

async function waitTerminal(
  service: ReturnType<typeof createExportService>,
  jobId: string,
): Promise<ExportJobView> {
  await vi.waitFor(
    () => {
      const job = service.getExportJob(jobId);
      expect(job).not.toBeNull();
      expect(job!.status).not.toBe('running');
    },
    { timeout: 5000, interval: 5 },
  );
  return service.getExportJob(jobId)!;
}

function start(service: ReturnType<typeof createExportService>, outputPath: string) {
  const started = service.exportPdf({
    packagePath: '/library/export-test',
    outputPath,
  });
  expect(started.ok).toBe(true);
  return started as { ok: true; jobId: string };
}

async function waitForRequest(fake: FakeWindow) {
  await vi.waitFor(() => expect(fake.sent.length).toBeGreaterThan(0), {
    timeout: 5000,
    interval: 5,
  });
  return fake.sent[0]!.payload as { jobId: string };
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('export service snapshot binding', () => {
  it('maps a null snapshot to document-not-open', async () => {
    const { service, fake, outputPath } = await serviceWithWindow();
    const started = start(service, outputPath);
    const request = await waitForRequest(fake);
    expect(request.jobId).toBe(started.jobId);
    service.handleSnapshotReply(started.jobId, null, 7);
    const job = await waitTerminal(service, started.jobId);
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('document-not-open');
  });

  it('times out when the renderer never replies', async () => {
    const { service, outputPath } = await serviceWithWindow({ snapshotTimeoutMs: 20 });
    const started = start(service, outputPath);
    const job = await waitTerminal(service, started.jobId);
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('snapshot-timeout');
  });

  it('refuses a reply from an unexpected sender', async () => {
    const { service, fake, outputPath } = await serviceWithWindow();
    const started = start(service, outputPath);
    await waitForRequest(fake);
    service.handleSnapshotReply(started.jobId, null, 8);
    const job = await waitTerminal(service, started.jobId);
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('snapshot-failed');
    expect(job.error?.message).toContain('unexpected renderer');
  });

  it('refuses a snapshot for another package', async () => {
    const { service, fake, outputPath } = await serviceWithWindow();
    const started = start(service, outputPath);
    await waitForRequest(fake);
    service.handleSnapshotReply(
      started.jobId,
      {
        packagePath: '/library/another-document',
        documentId: 'doc-1',
        revision: 1,
        title: 'Another',
        document: {},
        settings: {},
        settingsFingerprint: 'fingerprint-1',
        assetUrls: {},
        failedAssetIds: [],
      },
      7,
    );
    const job = await waitTerminal(service, started.jobId);
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('document-mismatch');
    expect(job.error?.message).toContain('/library/another-document');
  });

  it('accepts only the app window sender', async () => {
    const { service } = await serviceWithWindow();
    expect(service.acceptsSender(7)).toBe(true);
    expect(service.acceptsSender(8)).toBe(false);
  });
});
