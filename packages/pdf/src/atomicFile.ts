import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface AtomicWriteOptions {
  /** Called after the temporary file is written and before the rename. */
  validate?: (temporaryPath: string) => Promise<void>;
}

/**
 * Writes a file to a sibling temporary path, optionally validates it, then
 * renames it into place. On any failure the temporary file is removed and the
 * target is left untouched.
 */
export async function writeFileAtomic(
  targetPath: string,
  data: Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, data);
    if (options.validate) await options.validate(temporaryPath);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // The temporary file may not exist; the original target is untouched.
    }
    throw error;
  }
}
