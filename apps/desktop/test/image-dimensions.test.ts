import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readImageDimensions } from '../src/main/image-dimensions';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ]);
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  bytes[6] = width & 0xff;
  bytes[7] = (width >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (height >> 8) & 0xff;
  return bytes;
}

function bmp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set([0x42, 0x4d], 0);
  const view = new DataView(bytes.buffer);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = ((width - 1) >> 16) & 0xff;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = ((height - 1) >> 16) & 0xff;
  return bytes;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

/** One ISO BMFF box: big-endian size, four-character type, then the body. */
function isoBox(type: string, ...body: Uint8Array[]): Uint8Array {
  const payload = concat(body);
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length, false);
  bytes.set(ascii(type), 4);
  bytes.set(payload, 8);
  return bytes;
}

/** A box that uses the 64-bit `largesize` form (size 1 + type + 64-bit size). */
function isoBox64(type: string, ...body: Uint8Array[]): Uint8Array {
  const payload = concat(body);
  const bytes = new Uint8Array(16 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, false);
  bytes.set(ascii(type), 4);
  view.setUint32(8, 0, false);
  view.setUint32(12, bytes.length, false);
  bytes.set(payload, 16);
  return bytes;
}

/** A full-box `ispe`: version/flags then width and height. */
function ispeBox(width: number, height: number): Uint8Array {
  return isoBox('ispe', new Uint8Array(4), uint32(width), uint32(height));
}

/** AVIF-shaped header: ftyp, then meta (full box) > iprp > ipco > ispe. */
function syntheticAvif(width: number, height: number): Uint8Array {
  return concat([
    isoBox('ftyp', ascii('avif'), new Uint8Array(4)),
    isoBox(
      'meta',
      new Uint8Array(4),
      isoBox('hdlr', new Uint8Array(12)),
      isoBox('iprp', isoBox('ipco', ispeBox(width, height))),
      isoBox('iloc', new Uint8Array(8)),
    ),
  ]);
}


describe('main-process image dimensions', () => {
  it('reads intrinsic dimensions from checked-in PNG fixtures', async () => {
    const forest = await readFile(
      path.resolve(import.meta.dirname, '../../../fixtures/assets/forest.png'),
    );
    const chart = await readFile(
      path.resolve(import.meta.dirname, '../../../fixtures/assets/chart.png'),
    );
    expect(readImageDimensions(forest)).toEqual({ width: 640, height: 360 });
    expect(readImageDimensions(chart)).toEqual({ width: 420, height: 240 });
  });

  it('reads PNG, JPEG, GIF, BMP, and WebP headers', () => {
    expect(readImageDimensions(png(1234, 567))).toEqual({ width: 1234, height: 567 });
    expect(readImageDimensions(jpeg(800, 600))).toEqual({ width: 800, height: 600 });
    expect(readImageDimensions(gif(320, 200))).toEqual({ width: 320, height: 200 });
    // Negative BMP height is a top-down bitmap and still a positive pixel size.
    expect(readImageDimensions(bmp(64, 48))).toEqual({ width: 64, height: 48 });
    expect(readImageDimensions(webpVp8x(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it('reads intrinsic dimensions from the checked-in AVIF fixture', async () => {
    const forest = await readFile(
      path.resolve(import.meta.dirname, '../../../fixtures/assets/forest.avif'),
    );
    expect(readImageDimensions(forest)).toEqual({ width: 640, height: 360 });
  });

  it('walks meta/iprp/ipco to find a nested AVIF ispe', () => {
    expect(readImageDimensions(syntheticAvif(640, 360))).toEqual({ width: 640, height: 360 });
    expect(readImageDimensions(syntheticAvif(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
    // A top-level ispe still works (the pre-nesting M2 assumption).
    expect(
      readImageDimensions(
        concat([isoBox('ftyp', ascii('avif'), new Uint8Array(4)), ispeBox(320, 180)]),
      ),
    ).toEqual({ width: 320, height: 180 });
    // A 64-bit largesize container is readable, not a truncation.
    expect(
      readImageDimensions(
        concat([
          isoBox('ftyp', ascii('avif'), new Uint8Array(4)),
          isoBox64('meta', new Uint8Array(4), isoBox('iprp', isoBox('ipco', ispeBox(800, 600)))),
        ]),
      ),
    ).toEqual({ width: 800, height: 600 });
  });

  it('bounds AVIF nesting and fails closed on malformed nested boxes', () => {
    let deep = ispeBox(640, 360);
    for (let level = 0; level < 8; level += 1) {
      deep = isoBox('meta', new Uint8Array(4), isoBox('iprp', isoBox('ipco', deep)));
    }
    expect(
      readImageDimensions(concat([isoBox('ftyp', ascii('avif'), new Uint8Array(4)), deep])),
    ).toBeNull();

    const truncated = syntheticAvif(640, 360);
    expect(readImageDimensions(truncated.subarray(0, truncated.length - 8))).toBeNull();
    expect(
      readImageDimensions(
        concat([
          isoBox('ftyp', ascii('avif'), new Uint8Array(4)),
          isoBox('meta', new Uint8Array(4), isoBox('iprp', isoBox('ipco', ispeBox(0, 360)))),
        ]),
      ),
    ).toBeNull();
    expect(
      readImageDimensions(
        concat([
          isoBox('ftyp', ascii('avif'), new Uint8Array(4)),
          isoBox('meta', new Uint8Array(4), isoBox('iprp', isoBox('ipco', ispeBox(640, 0)))),
        ]),
      ),
    ).toBeNull();
  });

  it('returns null for malformed, truncated, empty, and unsupported bytes', () => {
    expect(readImageDimensions(null)).toBeNull();
    expect(readImageDimensions(undefined)).toBeNull();
    expect(readImageDimensions(new Uint8Array())).toBeNull();
    expect(readImageDimensions(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(readImageDimensions(png(0, 360))).toBeNull();
    expect(readImageDimensions(png(640, 360).subarray(0, 18))).toBeNull();
    const truncatedJpeg = jpeg(800, 600).subarray(0, 6);
    expect(readImageDimensions(truncatedJpeg)).toBeNull();
  });
});
