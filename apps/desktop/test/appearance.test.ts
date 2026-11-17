import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, type AppearanceSettings } from '@noteforest/layout';
import {
  applyAppearance,
  prefersDarkNow,
} from '../src/renderer/src/lib/apply-appearance';

/**
 * R3 appearance application. The root is the only writer: a data attribute for
 * the theme and custom properties for the accent scale, UI scale, UI font, and
 * code font. Page/print never read the last three except the code font.
 */

function fakeRoot(): {
  dataset: Record<string, string | undefined>;
  style: { setProperty(name: string, value: string): void };
  applied: Map<string, string>;
} {
  const applied = new Map<string, string>();
  return {
    dataset: {},
    style: {
      setProperty: (name: string, value: string) => {
        applied.set(name, value);
      },
    },
    applied,
  };
}

function appearance(patch: Partial<AppearanceSettings>): AppearanceSettings {
  return { ...DEFAULT_APPEARANCE, ...patch };
}

describe('applyAppearance', () => {
  it('writes the dark theme and the blue accent by default', () => {
    const root = fakeRoot();
    const resolved = applyAppearance(DEFAULT_APPEARANCE, {
      prefersDark: true,
      target: root,
    });
    expect(resolved).toBe('dark');
    expect(root.dataset['theme']).toBe('dark');
    // B2: `auto` resolves by the app theme, so the root always carries a
    // concrete code theme for the stylesheet blocks.
    expect(root.dataset['codeTheme']).toBe('dark-plus');
    expect(root.applied.get('--accent')).toBe('#9bb7d4');
    expect(root.applied.get('--accent-strong')).toBe('#b9d0e6');
    expect(root.applied.get('--accent-soft')).toBe('#26313c');
    expect(root.applied.get('--accent-hover')).toBe('#a9c3dc');
    expect(root.applied.get('--accent-contrast')).toBe('#101418');
    expect(root.applied.get('--ui-scale')).toBe('1');
    expect(root.applied.get('--mono-font')).toContain('JetBrains Mono');
  });

  it('resolves system to the OS preference without changing the stored value', () => {
    const light = fakeRoot();
    expect(applyAppearance(appearance({ theme: 'system' }), {
      prefersDark: false,
      target: light,
    })).toBe('light');
    expect(light.dataset['theme']).toBe('light');
    // `auto` follows the resolved theme, not the stored `system` value.
    expect(light.dataset['codeTheme']).toBe('light-plus');

    const dark = fakeRoot();
    expect(applyAppearance(appearance({ theme: 'system' }), {
      prefersDark: true,
      target: dark,
    })).toBe('dark');
    expect(dark.dataset['theme']).toBe('dark');
    expect(dark.dataset['codeTheme']).toBe('dark-plus');
  });

  it('keeps an explicit code theme regardless of the app theme (B2)', () => {
    const root = fakeRoot();
    applyAppearance(appearance({ theme: 'light', codeTheme: 'monokai' }), {
      prefersDark: false,
      target: root,
    });
    expect(root.dataset['theme']).toBe('light');
    expect(root.dataset['codeTheme']).toBe('monokai');

    const dark = fakeRoot();
    applyAppearance(appearance({ theme: 'dark', codeTheme: 'one-light' }), {
      prefersDark: true,
      target: dark,
    });
    expect(dark.dataset['codeTheme']).toBe('one-light');

    // An unknown stored value normalizes to auto instead of leaving the
    // attribute unset (the stylesheet has no fallback palette).
    const unknown = fakeRoot();
    applyAppearance(
      { ...DEFAULT_APPEARANCE, codeTheme: 'solarized' } as unknown as AppearanceSettings,
      { prefersDark: true, target: unknown },
    );
    expect(unknown.dataset['codeTheme']).toBe('dark-plus');
  });

  it('applies the light accent set when the theme resolves to light', () => {
    const root = fakeRoot();
    applyAppearance(appearance({ theme: 'light', accent: 'rose' }), {
      prefersDark: true,
      target: root,
    });
    expect(root.dataset['theme']).toBe('light');
    expect(root.dataset['codeTheme']).toBe('light-plus');
    expect(root.applied.get('--accent')).toBe('#9b3f55');
    expect(root.applied.get('--accent-contrast')).toBe('#ffffff');
  });

  it('applies the UI scale, UI font, and code font values', () => {
    const root = fakeRoot();
    applyAppearance(
      appearance({ uiScale: 1.1, uiFont: 'serif', codeFont: 'system-mono' }),
      { prefersDark: true, target: root },
    );
    expect(root.applied.get('--ui-scale')).toBe('1.1');
    expect(root.applied.get('--ui-font')).toContain('ui-serif');
    expect(root.applied.get('--mono-font')).toContain('ui-monospace');
    expect(root.applied.get('--mono-font')).not.toContain('JetBrains Mono');
  });

  it('normalizes an invalid appearance before applying it', () => {
    const root = fakeRoot();
    applyAppearance(
      { theme: 'neon', accent: 'ultraviolet', uiScale: 2, uiFont: 'x', codeFont: 'y' } as unknown as AppearanceSettings,
      { prefersDark: true, target: root },
    );
    expect(root.dataset['theme']).toBe('dark');
    expect(root.applied.get('--accent')).toBe('#9bb7d4');
    expect(root.applied.get('--ui-scale')).toBe('1');
  });

  it('reads the OS preference through matchMedia when available', () => {
    // The unit environment has no window: dark is the product default.
    expect(typeof window).toBe('undefined');
    expect(prefersDarkNow()).toBe(true);
    const globals = globalThis as { window?: unknown };
    globals.window = {
      matchMedia: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    };
    try {
      expect(prefersDarkNow()).toBe(false);
    } finally {
      delete globals.window;
    }
  });
});
