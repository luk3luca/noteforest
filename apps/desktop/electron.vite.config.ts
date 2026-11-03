import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

/**
 * The core workspace ships TypeScript with Node-style `.js` import specifiers.
 * Rollup does not map those to `.ts` on its own, so resolve them explicitly.
 */
function coreTsResolver(): Plugin {
  return {
    name: 'noteforest-core-ts-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer === undefined || !source.startsWith('.') || !source.endsWith('.js')) {
        return null;
      }
      const candidate = resolve(dirname(importer), source.replace(/\.js$/, '.ts'));
      return existsSync(candidate) ? candidate : null;
    },
  };
}

export default defineConfig({
  main: {
    plugins: [
      coreTsResolver(),
      externalizeDepsPlugin({ exclude: ['@noteforest/core', '@noteforest/core/node'] }),
    ],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    base: './',
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
