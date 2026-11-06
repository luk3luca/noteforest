/**
 * Supported image formats for the M3c3b1 pipeline.
 *
 * The list is shared by the main-process import path and the renderer paste/
 * drop path so both accept the same files and both reject remote or unknown
 * types before any bytes reach the package.
 */

export const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
] as const;

export const IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

export const SUPPORTED_IMAGE_MIMES: ReadonlySet<string> = new Set(
  Object.values(IMAGE_MIME_BY_EXTENSION),
);

export function imageMimeFromName(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return undefined;
  return IMAGE_MIME_BY_EXTENSION[fileName.slice(dot).toLowerCase()];
}
