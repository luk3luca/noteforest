import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readMarkdownFile,
  resolveMarkdownAsset,
  resolveMarkdownImage,
} from '../src/main/markdown-file';
import {
  markdownAssetUrl,
  markdownProtocolResponse,
  parseMarkdownAssetUrl,
} from '../src/main/markdown-protocol-response';
import { classifyMarkdownImageSource, isMarkdownPath, markdownFileTitle } from '../src/shared/markdown';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const roots: string[] = [];

async function fixture(): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), 'noteforest-markdown-'));
  roots.push(root);
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'pic.png'), PNG);
  const file = join(root, 'notes.md');
  await writeFile(file, '# Notes\n\n![pic](assets/pic.png)\n');
  return { root, file };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Markdown image sources', () => {
  it('recognizes Markdown paths and their basenames', () => {
    expect(isMarkdownPath('/notes/today.md')).toBe(true);
    expect(isMarkdownPath('/notes/today.MARKDOWN')).toBe(true);
    expect(isMarkdownPath('/notes/today.mdx')).toBe(false);
    expect(isMarkdownPath('/notes/folder/')).toBe(false);
    expect(markdownFileTitle('/notes/today.md')).toBe('today.md');
  });

  it('accepts only relative local paths', () => {
    expect(classifyMarkdownImageSource('assets/pic.png')).toEqual({
      kind: 'local',
      relative: 'assets/pic.png',
    });
    expect(classifyMarkdownImageSource('./assets/pic%20one.png')).toEqual({
      kind: 'local',
      relative: 'assets/pic one.png',
    });
    expect(classifyMarkdownImageSource('https://example.com/pic.png').kind).toBe('remote');
    expect(classifyMarkdownImageSource('//example.com/pic.png').kind).toBe('remote');
    expect(classifyMarkdownImageSource('data:image/png;base64,AAAA').kind).toBe('unsafe');
    expect(classifyMarkdownImageSource('file:///tmp/pic.png').kind).toBe('unsafe');
    expect(classifyMarkdownImageSource('/tmp/pic.png').kind).toBe('unsafe');
    expect(classifyMarkdownImageSource('../secret.png').kind).toBe('unsafe');
    expect(classifyMarkdownImageSource('assets/%2e%2e/secret.png').kind).toBe('unsafe');
    expect(classifyMarkdownImageSource('.hidden/pic.png').kind).toBe('unsafe');
    expect(classifyMarkdownImageSource('assets\\pic.png').kind).toBe('unsafe');
    expect(classifyMarkdownImageSource('   ').kind).toBe('unsafe');
  });
});

describe('Markdown file read', () => {
  it('returns the canonical path and UTF-8 source', async () => {
    const { file } = await fixture();
    const result = await readMarkdownFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.title).toBe('notes.md');
    expect(result.file.markdown).toContain('# Notes');
  });

  it('refuses a non-Markdown path and a missing file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noteforest-markdown-'));
    roots.push(root);
    const textPath = join(root, 'notes.txt');
    await writeFile(textPath, 'nope');
    expect((await readMarkdownFile(textPath)).ok).toBe(false);
    expect((await readMarkdownFile(join(root, 'missing.md'))).ok).toBe(false);
    expect((await readMarkdownFile('relative.md')).ok).toBe(false);
  });
});

describe('Markdown image resolution', () => {
  it('maps a local image to a confined protocol URL', async () => {
    const { file } = await fixture();
    expect((await readMarkdownFile(file)).ok).toBe(true);
    const resolved = await resolveMarkdownImage(file, 'assets/pic.png');
    expect(resolved.ok).toBe(true);
    const url = new URL(resolved.url ?? '');
    expect(url.protocol).toBe('noteforest-md:');
    expect(url.host).toBe('asset');
    expect(parseMarkdownAssetUrl(url.toString())).not.toBeNull();
  });

  it('refuses remote, traversal, missing, symlinked, and non-image sources', async () => {
    const { root, file } = await fixture();
    expect((await readMarkdownFile(file)).ok).toBe(true);
    expect((await resolveMarkdownImage(file, 'https://example.com/pic.png')).ok).toBe(false);
    expect((await resolveMarkdownImage(file, '../pic.png')).ok).toBe(false);
    expect((await resolveMarkdownImage(file, 'assets/missing.png')).ok).toBe(false);
    expect((await resolveMarkdownImage(file, 'assets/pic.txt')).ok).toBe(false);
    await symlink(join(root, 'assets', 'pic.png'), join(root, 'assets', 'link.png'));
    expect((await resolveMarkdownImage(file, 'assets/link.png')).ok).toBe(false);
    // A file that was not opened has no registered root.
    const other = join(root, 'other.md');
    await writeFile(other, '# Other\n');
    expect((await resolveMarkdownImage(other, 'assets/pic.png')).ok).toBe(false);
  });

  it('serves only registered roots and image MIME types', async () => {
    const { file } = await fixture();
    expect((await readMarkdownFile(file)).ok).toBe(true);
    const resolved = await resolveMarkdownImage(file, 'assets/pic.png');
    const request = parseMarkdownAssetUrl(resolved.url ?? '');
    expect(request).not.toBeNull();
    const asset = await resolveMarkdownAsset(request?.rootId ?? '', request?.relativePath ?? '');
    expect(asset.ok).toBe(true);
    expect(asset.mime).toBe('image/png');
    expect(asset.bytes?.byteLength).toBe(PNG.byteLength);
    expect((await resolveMarkdownAsset(request?.rootId ?? '', '../notes.md')).ok).toBe(false);
    expect((await resolveMarkdownAsset('0000000000000000', 'assets/pic.png')).ok).toBe(false);
  });
});

describe('Markdown protocol response', () => {
  it('rejects traversal, encoded dots, queries, and non-image paths', () => {
    expect(parseMarkdownAssetUrl('noteforest-md://asset/0123456789abcdef/assets/pic.png')).toEqual({
      rootId: '0123456789abcdef',
      relativePath: 'assets/pic.png',
    });
    expect(
      parseMarkdownAssetUrl('noteforest-md://asset/0123456789abcdef/assets/../secret.png'),
    ).toBeNull();
    expect(
      parseMarkdownAssetUrl('noteforest-md://asset/0123456789abcdef/assets/%2e%2e/secret.png'),
    ).toBeNull();
    expect(
      parseMarkdownAssetUrl('noteforest-md://asset/0123456789abcdef/assets/pic.png?x=1'),
    ).toBeNull();
    expect(parseMarkdownAssetUrl('noteforest-md://asset/0123456789abcdef/assets/pic.txt')).toBeNull();
    expect(parseMarkdownAssetUrl('noteforest-md://other/0123456789abcdef/assets/pic.png')).toBeNull();
  });

  it('builds a typed 404 without bytes on failure and a typed 200 on success', async () => {
    const rootId = '0123456789abcdef';
    const url = markdownAssetUrl(rootId, 'assets/pic one.png');
    expect(url).toContain('assets/pic%20one.png');

    const missing = await markdownProtocolResponse(url, async () => ({
      ok: false,
      reason: 'image-missing',
    }));
    expect(missing.status).toBe(404);
    expect(missing.headers.get('x-noteforest-md-error')).toBe('image-missing');

    const ok = await markdownProtocolResponse(url, async () => ({
      ok: true,
      bytes: PNG,
      mime: 'image/png',
    }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');

    const unsupported = await markdownProtocolResponse(url, async () => ({
      ok: true,
      bytes: PNG,
      mime: 'text/html',
    }));
    expect(unsupported.status).toBe(404);
    expect(unsupported.headers.get('x-noteforest-md-error')).toBe('unsupported-image');
  });
});
