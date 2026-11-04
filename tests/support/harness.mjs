import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
export const root = resolve(import.meta.dirname, '../..');
export const appDir = resolve(root, 'apps/desktop');
export const artifactsRoot = resolve(root, process.env.NOTEFOREST_ARTIFACTS ?? 'artifacts');
export const axePath = require.resolve('axe-core/axe.min.js');

export function artifactsPath(...parts) {
  return resolve(artifactsRoot, ...parts);
}

export function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/** Poll a Node-side predicate; for main-process state that page.waitForFunction cannot see. */
export async function waitUntil(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await delay(50);
  }
  assert.fail(`timed out waiting for ${label}`);
}

/** PNG dimensions straight from the IHDR chunk; avoids macOS-only `sips`. */
export async function pngSize(path) {
  const bytes = await readFile(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * One Electron app per test, plus condition-based waits shared by the critical,
 * performance and visual suites. Artifact roots honour NOTEFOREST_ARTIFACTS.
 */
export function createHarness({ tempRoot }) {
  let app;
  let page;
  const pageErrors = [];

  function baseEnv(overrides = {}) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    return {
      ...env,
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'support'),
      NOTEFOREST_E2E: '1',
      NOTEFOREST_ALLOW_SEED: '1',
      ...overrides,
    };
  }

  async function launch(overrides = {}) {
    app = await electron.launch({ args: ['.'], cwd: appDir, env: baseEnv(overrides) });
    page = await app.firstWindow();
    await page.bringToFront();
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    await page.waitForFunction(() => window.__noteforestTest?.state().ready === true, undefined, {
      timeout: 20000,
    });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    return { app, page };
  }

  async function quit() {
    if (app === undefined) return;
    const current = app;
    app = undefined;
    page = undefined;
    const child = current.process();
    if (child.exitCode !== null || child.signalCode !== null) {
      await current.close().catch(() => undefined);
      return;
    }
    const closed = new Promise((resolveClose) => current.once('close', resolveClose));
    try {
      await current.evaluate(({ app: electronApp }) => electronApp.quit());
    } catch {
      // Already gone (for example the close-window-then-quit regression test).
    }
    await Promise.race([closed, delay(8000)]);
    try {
      await current.close();
    } catch {
      // Already closed by quit.
    }
  }

  function activeEditor() {
    return page.locator('.nf-editor[data-active="true"]');
  }

  async function state() {
    return page.evaluate(() => window.__noteforestTest.state());
  }

  async function activeRuntimeInfo() {
    const current = await state();
    return current.runtimes.find((runtime) => runtime.packagePath === current.activeTab);
  }

  async function waitSelected(blockId) {
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === expected;
      },
      blockId,
      { timeout: 10000 },
    );
  }

  async function waitSaved() {
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return (
          current.runtimes.length > 0 &&
          current.runtimes.every((runtime) => runtime.saveState === 'saved')
        );
      },
      undefined,
      { timeout: 10000 },
    );
  }

  async function waitBlockCount(count) {
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]').length ===
        expected,
      count,
      { timeout: 10000 },
    );
  }

  async function waitCanonicalBlockCount(count) {
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.blocks ?? -1) === expected;
      },
      count,
      { timeout: 10000 },
    );
  }

  async function waitEdges(count) {
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('.nf-editor[data-active="true"] .nf-edge-path').length === expected,
      count,
      { timeout: 10000 },
    );
  }

  async function waitEditorText(text, present = true) {
    await page.waitForFunction(
      ({ expected, shouldExist }) => {
        const content = document.querySelector('.nf-editor[data-active="true"]')?.textContent ?? '';
        return content.includes(expected) === shouldExist;
      },
      { expected: text, shouldExist: present },
      { timeout: 10000 },
    );
  }

  /**
   * Wait until the active canvas geometry (card rects and arrow paths) has not
   * changed for three animation frames. This replaces the 700 ms "let layout
   * settle" sleeps and fails loudly instead of hiding a moving layout.
   */
  async function waitLayout({ blocks, arrows, timeout = 15000 } = {}) {
    await page.waitForFunction(
      (expected) =>
        new Promise((resolveLayout) => {
          const scope = document.querySelector('.nf-editor[data-active="true"]');
          if (scope === null) {
            resolveLayout(false);
            return;
          }
          let last = '';
          let stable = 0;
          let frames = 0;
          const tick = () => {
            frames += 1;
            const cards = [...scope.querySelectorAll('[data-block-card]')];
            if (cards.length === 0 || cards.length !== (expected.blocks ?? cards.length)) {
              resolveLayout(false);
              return;
            }
            if (
              expected.arrows !== undefined &&
              scope.querySelectorAll('.nf-edge-path').length !== expected.arrows
            ) {
              resolveLayout(false);
              return;
            }
            const signature = cards
              .map((card) => {
                const rect = card.getBoundingClientRect();
                return `${rect.x.toFixed(1)},${rect.y.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`;
              })
              .join('|');
            if (signature === last) stable += 1;
            else {
              stable = 0;
              last = signature;
            }
            if (stable >= 3) resolveLayout(true);
            else if (frames > 180) resolveLayout(false);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { blocks, arrows },
      { timeout },
    );
  }

  async function flushSession() {
    await page.evaluate(() => window.__noteforestTest.flushSession());
  }

  async function waitNativeEdited(expected) {
    const deadline = Date.now() + 10000;
    let actual;
    while (Date.now() < deadline) {
      actual = await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isDocumentEdited() ?? false,
      );
      if (actual === expected) return;
      await delay(50);
    }
    assert.equal(actual, expected, 'native document edited state');
  }

  async function setWindowSize(width, height) {
    const before = await page.evaluate(() => ({ width: window.innerWidth }));
    await app.evaluate(
      ({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setSize(size.width, size.height);
        window.center();
      },
      { width, height },
    );
    await page
      .waitForFunction(
        ({ targetWidth, previousWidth }) =>
          Math.abs(window.innerWidth - targetWidth) <= 1 ||
          Math.abs(window.innerWidth - previousWidth) <= 1,
        { targetWidth: width, previousWidth: before.width },
        { timeout: 5000 },
      )
      .catch(() => undefined);
    await waitLayout();
  }

  async function parity() {
    return page.evaluate(() => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      const active = window.__noteforestTest.state();
      return {
        canvas: scope === null ? 0 : scope.querySelectorAll('[data-block-card]').length,
        sidebar: document.querySelectorAll('.nf-tree-row[data-block-id]').length,
        arrows: scope === null ? 0 : scope.querySelectorAll('.nf-edge-path').length,
        trunks: scope === null ? 0 : scope.querySelectorAll('.nf-edge-trunk').length,
        canonical:
          active.runtimes.find((runtime) => runtime.packagePath === active.activeTab)?.blocks ?? 0,
        canvasIds:
          scope === null
            ? []
            : [...scope.querySelectorAll('[data-block-card]')].map((card) =>
                card.getAttribute('data-block-card'),
              ),
        canonicalIds:
          active.runtimes.find((runtime) => runtime.packagePath === active.activeTab)?.blockIds ?? [],
      };
    });
  }

  async function layoutSnapshot() {
    return page.evaluate(() => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      const rootElement = scope?.querySelector('.nf-canvas-content');
      const scroller = scope?.querySelector('.nf-editor-scroll');
      if (rootElement === null || rootElement === undefined || scroller === null || scroller === undefined) {
        return null;
      }
      const rootRect = rootElement.getBoundingClientRect();
      const cards = [...rootElement.querySelectorAll('[data-block-card]')].map((card) => {
        const rect = card.getBoundingClientRect();
        const host = card.closest('.nf-block-inner');
        return {
          id: card.getAttribute('data-block-card'),
          depth: Number(card.getAttribute('data-depth')),
          x: Math.round((rect.left - rootRect.left) * 10) / 10,
          y: Math.round((rect.top - rootRect.top) * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          column: host?.style.getPropertyValue('--nf-card-col') ?? '',
          text: card.textContent?.slice(0, 24) ?? '',
        };
      });
      const byDepth = new Map();
      for (const card of cards) {
        const list = byDepth.get(card.depth) ?? [];
        list.push(card);
        byDepth.set(card.depth, list);
      }
      return {
        cards,
        depths: [...byDepth.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([depth, list]) => ({
            depth,
            xs: [...new Set(list.map((card) => card.x))],
            width: Math.max(...list.map((card) => card.width)),
            count: list.length,
          })),
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        scrollLeft: scroller.scrollLeft,
        overflow: scroller.scrollWidth - scroller.clientWidth,
        zoom: Number(scope.querySelector('.nf-canvas')?.getAttribute('data-zoom') ?? 100),
      };
    });
  }

  async function trunkSnapshot() {
    return page.evaluate(() => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      const rootElement = scope?.querySelector('.nf-canvas-content');
      if (rootElement === null || rootElement === undefined) return null;
      const rootRect = rootElement.getBoundingClientRect();
      const firstGroup = rootElement.querySelector('g[data-edge-id]');
      const edgePath = firstGroup?.querySelector('path');
      const childId = firstGroup?.getAttribute('data-child-id');
      const parentId = firstGroup?.getAttribute('data-parent-id');
      const child = childId ? rootElement.querySelector(`[data-block-card="${childId}"]`) : null;
      const parent = parentId ? rootElement.querySelector(`[data-block-card="${parentId}"]`) : null;
      const trunk = parentId
        ? rootElement.querySelector(`.nf-edge-trunk[data-parent-id="${parentId}"]`)
        : null;
      if (edgePath === null || edgePath === undefined || child === null || parent === null) return null;
      const numbers = (value) =>
        (value ?? '')
          .split(/[^0-9.-]+/)
          .filter((part) => part.length > 0)
          .map(Number);
      const edgeNumbers = numbers(edgePath.getAttribute('d'));
      const trunkNumbers = trunk === null ? [] : numbers(trunk.getAttribute('d'));
      const pairs = (list) => {
        const points = [];
        for (let index = 0; index + 1 < list.length; index += 2) {
          points.push({ x: list[index], y: list[index + 1] });
        }
        return points;
      };
      const childRect = child.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      return {
        childId,
        parentId,
        edgePairs: pairs(edgeNumbers),
        trunkPairs: pairs(trunkNumbers),
        edgeStart: pairs(edgeNumbers)[0] ?? null,
        parentRight: Math.round(parentRect.right - rootRect.left),
        parentCenterY: Math.round((parentRect.top - rootRect.top + parentRect.height / 2) * 100) / 100,
        childLeft: Math.round(childRect.left - rootRect.left),
        childCenterY: Math.round((childRect.top - rootRect.top + childRect.height / 2) * 100) / 100,
        trunkCount: rootElement.querySelectorAll('.nf-edge-trunk').length,
      };
    });
  }

  /** Fire several structural keydowns before any IPC round-trip can finish. */
  async function rapidKeydowns(key, count, options = {}) {
    const sequence = Array.from({ length: count }, () => ({ key, options }));
    await rapidKeySequence(sequence);
  }

  async function rapidKeySequence(sequence) {
    await page.evaluate(
      (events) => {
        const target = document.querySelector('.nf-editor[data-active="true"] .nf-prosemirror');
        if (target === null) throw new Error('no active editor');
        for (const event of events) {
          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: event.key,
              code: event.key === 'Enter' ? 'Enter' : event.key,
              bubbles: true,
              cancelable: true,
              ...event.options,
            }),
          );
        }
      },
      sequence.map((entry) => ({ key: entry.key, options: entry.options ?? {} })),
    );
  }

  /** CSS-pixel screenshot; replaces the macOS-only `sips` resample step. */
  async function screenshot(path, size) {
    await page.screenshot({ path, scale: 'css' });
    if (size !== undefined) {
      const actual = await pngSize(path);
      assert.equal(
        `${actual.width}x${actual.height}`,
        `${size.width}x${size.height}`,
        `${path} size`,
      );
    }
  }

  return {
    get app() {
      return app;
    },
    get page() {
      return page;
    },
    pageErrors,
    launch,
    quit,
    activeEditor,
    state,
    activeRuntimeInfo,
    waitSelected,
    waitSaved,
    waitBlockCount,
    waitCanonicalBlockCount,
    waitEdges,
    waitEditorText,
    waitLayout,
    flushSession,
    waitNativeEdited,
    setWindowSize,
    parity,
    layoutSnapshot,
    trunkSnapshot,
    rapidKeydowns,
    rapidKeySequence,
    screenshot,
  };
}
