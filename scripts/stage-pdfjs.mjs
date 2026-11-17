/**
 * Stage the one runtime node_modules dependency the packaged main process needs.
 *
 * electron-vite bundles @noteforest/* and the rest into `out/`; `pdfjs-dist`
 * stays external (its worker/legacy modules do not bundle) and must exist as a
 * real node_modules entry inside the app directory for electron-builder to copy.
 * npm workspaces hoist it to the repo root, so it is copied here before packing.
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/pdfjs-dist');
const to = resolve(root, 'apps/desktop/node_modules/pdfjs-dist');

await rm(to, { recursive: true, force: true });
await mkdir(dirname(to), { recursive: true });
await cp(from, to, { recursive: true });
console.log('staged pdfjs-dist → apps/desktop/node_modules/pdfjs-dist');
