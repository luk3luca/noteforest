/**
 * Intrinsic image dimensions from a file header.
 *
 * The native picker imports bytes in the main process, where no DOM `Image`
 * exists. M4 layout/PDF must not fall back to the 220×120 estimator for a
 * picker image, so the import path records the decoded dimensions on the asset
 * and image node. This reader is deliberately header-only: it never decodes
 * pixels, allocates full frames, or depends on Electron `nativeImage`.
 *
 * Supported headers: PNG, JPEG, GIF, WebP, BMP, and AVIF (`ispe`). A malformed
 * or unsupported file is `null`; the caller stores the asset without
 * dimensions rather than inventing them.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

function positive(value: number): number | undefined {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function pngSize(bytes: Uint8Array): ImageDimensions | null {
  // 8-byte signature, then the IHDR chunk: length(4), "IHDR"(4), width(4), height(4).
  if (bytes.length < 24) return null;
  const data = view(bytes);
  const width = positive(data.getUint32(16, false));
  const height = positive(data.getUint32(20, false));
  return width === undefined || height === undefined ? null : { width, height };
}

function jpegSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4) return null;
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = bytes[offset + 1] ?? 0;
    // Skip fill bytes (0xff 0xff ...) before the marker code.
    while (marker === 0xff) {
      offset += 1;
      marker = bytes[offset + 1] ?? 0;
    }
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) return null;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (length < 7) return null;
      const height = positive((bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0));
      const width = positive((bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0));
      return width === undefined || height === undefined ? null : { width, height };
    }
    offset += length;
  }
  return null;
}

function gifSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;
  const width = positive((bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8));
  const height = positive((bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8));
  return width === undefined || height === undefined ? null : { width, height };
}

function bmpSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 26) return null;
  const data = view(bytes);
  // BITMAPINFOHEADER and later store a signed 32-bit width/height. A negative
  // height means a top-down bitmap and is still a positive pixel height.
  const width = positive(Math.abs(data.getInt32(18, true)));
  const height = positive(Math.abs(data.getInt32(22, true)));
  return width === undefined || height === undefined ? null : { width, height };
}

function webpSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (chunk === 'VP8 ') {
    // Lossy: 3-byte frame tag, then the 3-byte start code, then 14-bit size.
    if ((bytes[23] ?? 0) !== 0x9d || (bytes[24] ?? 0) !== 0x01 || (bytes[25] ?? 0) !== 0x2a) {
      return null;
    }
    const width = positive(((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff);
    const height = positive(((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff);
    return width === undefined || height === undefined ? null : { width, height };
  }
  if (chunk === 'VP8L') {
    if ((bytes[20] ?? 0) !== 0x2f) return null;
    const bits =
      (bytes[21] ?? 0) |
      ((bytes[22] ?? 0) << 8) |
      ((bytes[23] ?? 0) << 16) |
      ((bytes[24] ?? 0) << 24);
    const width = positive((bits & 0x3fff) + 1);
    const height = positive(((bits >> 14) & 0x3fff) + 1);
    return width === undefined || height === undefined ? null : { width, height };
  }
  if (chunk === 'VP8X') {
    const width = positive(
      1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)),
    );
    const height = positive(
      1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)),
    );
    return width === undefined || height === undefined ? null : { width, height };
  }
  return null;
}

function avifSize(bytes: Uint8Array): ImageDimensions | null {
  // ISO BMFF boxes are big-endian length + 4-byte type. The property box holds
  // `ispe` with a full-box header (4 bytes) before width and height.
  for (let offset = 0; offset + 12 <= bytes.length; ) {
    const length = view(bytes).getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    if (length < 8) break;
    if (type === 'ispe' && offset + 20 <= bytes.length) {
      // ispe: version/flags (4), then width (4), height (4).
      const width = positive(view(bytes).getUint32(offset + 12, false));
      const height = positive(view(bytes).getUint32(offset + 16, false));
      return width === undefined || height === undefined ? null : { width, height };
    }
    const next = offset + length;
    if (next <= offset) break;
    offset = next;
  }
  return null;
}

/** Intrinsic dimensions, or null when the header is malformed/unsupported. */
export function readImageDimensions(bytes: Uint8Array | null | undefined): ImageDimensions | null {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return pngSize(bytes);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return gifSize(bytes);
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return webpSize(bytes);
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return bmpSize(bytes);
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return avifSize(bytes);
  }
  return null;
}
