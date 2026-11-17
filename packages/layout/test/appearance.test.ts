import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  ACCENT_GROUPS,
  CODE_FONTS,
  CODE_THEME_IDS,
  DEFAULT_APPEARANCE,
  DEFAULT_ACCENT_ID,
  DEFAULT_CODE_FONT,
  DEFAULT_CODE_THEME,
  UI_FONTS,
  UI_FONT_STACKS,
  UI_SCALES,
  accentSet,
  accentValues,
  accentsInGroup,
  appearanceCssVariables,
  codeFontStack,
  isCodeThemeSetting,
  normalizeAppearance,
  resolveTheme,
  uiFontStack,
  type AccentValues,
} from '../src/index.js';

/**
 * R3 appearance contract: the registry is the single source for accent values,
 * every set is complete for dark and light, and the contrast thresholds hold
 * where the design requires them (text on the accent fill, focus/control rings
 * against the surfaces). Adding a palette later is registry data only.
 */

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : cleaned;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(left: string, right: string): number {
  const first = luminance(left);
  const second = luminance(right);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const DARK_SURFACES = [
  '#101113',
  '#17181a',
  '#131416',
  '#1b1d20',
  '#202329',
  '#262a30',
];
const LIGHT_SURFACES = [
  '#f3f5f7',
  '#ffffff',
  '#edf1f4',
  '#f2f5f7',
  '#e8edf1',
  '#f2f6f9',
  '#e9f0f5',
];
/** Tertiary text values from the shell theme blocks (12 November 2026 tune). */
const TEXT_3 = { dark: '#949aa2', light: '#5b6771' } as const;

describe('accent registry', () => {
  it('ships the four pastel and four vivid accents with both theme value sets', () => {
    expect(ACCENTS.map((accent) => accent.id)).toEqual([
      'blue',
      'teal',
      'amber',
      'rose',
      'violet',
      'magenta',
      'cyan',
      'orange',
    ]);
    expect(ACCENTS.map((accent) => accent.label)).toEqual([
      'Blue',
      'Teal',
      'Amber',
      'Rose',
      'Violet',
      'Magenta',
      'Cyan',
      'Orange',
    ]);
    expect(ACCENT_GROUPS.map((group) => [group.id, group.label])).toEqual([
      ['pastel', 'Pastel'],
      ['vivid', 'Vivid'],
    ]);
    expect(accentsInGroup('pastel').map((accent) => accent.id)).toEqual([
      'blue',
      'teal',
      'amber',
      'rose',
    ]);
    expect(accentsInGroup('vivid').map((accent) => accent.id)).toEqual([
      'violet',
      'magenta',
      'cyan',
      'orange',
    ]);
    for (const accent of ACCENTS) {
      expect(accent.group === 'pastel' || accent.group === 'vivid').toBe(true);
      for (const theme of ['dark', 'light'] as const) {
        const values = accent[theme];
        const keys: (keyof AccentValues)[] = [
          'accent',
          'strong',
          'soft',
          'hover',
          'contrast',
        ];
        for (const key of keys) {
          expect(values[key], `${accent.id}.${theme}.${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      }
    }
  });

  it('keeps the blue values the product owner approved', () => {
    expect(accentSet('blue').dark).toEqual({
      accent: '#9bb7d4',
      strong: '#b9d0e6',
      soft: '#26313c',
      hover: '#a9c3dc',
      contrast: '#101418',
    });
    expect(accentSet('blue').light).toEqual({
      accent: '#2f5f8a',
      strong: '#1f4a6d',
      soft: '#e2edf6',
      hover: '#264d71',
      contrast: '#ffffff',
    });
  });

  it('keeps the tuned pastel steps', () => {
    expect(accentSet('teal').dark).toMatchObject({
      accent: '#89c0ba',
      strong: '#99d1ca',
      hover: '#92cac3',
    });
    expect(accentSet('rose').dark).toMatchObject({
      accent: '#e5a5b3',
      strong: '#f6b5c3',
      hover: '#efaebc',
    });
    expect(accentSet('rose').light.hover).toBe('#873348');
    expect(accentSet('amber').dark.soft).toBe('#382f22');
  });

  it('keeps the approved Vivid values exactly', () => {
    expect(accentSet('violet')).toEqual({
      id: 'violet',
      label: 'Violet',
      group: 'vivid',
      dark: {
        accent: '#BE38F3',
        strong: '#D26BFF',
        soft: '#2A173A',
        hover: '#C94DFF',
        contrast: '#0B0F12',
      },
      light: {
        accent: '#8B2BB8',
        strong: '#6F1E96',
        soft: '#F3E1FB',
        hover: '#7A25A6',
        contrast: '#FFFFFF',
      },
    });
    expect(accentSet('magenta')).toMatchObject({
      dark: { accent: '#F43F8E', strong: '#FF6BA8', soft: '#361524', hover: '#FF57A0', contrast: '#101418' },
      light: { accent: '#B0185C', strong: '#8E124A', soft: '#FBE0EC', hover: '#9F1553', contrast: '#FFFFFF' },
    });
    expect(accentSet('cyan')).toMatchObject({
      dark: { accent: '#22D3EE', strong: '#67E8F9', soft: '#0C242B', hover: '#3BDDF3', contrast: '#101418' },
      light: { accent: '#0E7490', strong: '#0B5F77', soft: '#DDF5FA', hover: '#0C6A84', contrast: '#FFFFFF' },
    });
    expect(accentSet('orange')).toMatchObject({
      dark: { accent: '#FB923C', strong: '#FDBA74', soft: '#2C1E12', hover: '#FCA55A', contrast: '#101418' },
      light: { accent: '#C2410C', strong: '#9A3412', soft: '#FDE8D7', hover: '#AD3A0B', contrast: '#FFFFFF' },
    });
  });

  it('falls back to blue for an unknown or missing accent id', () => {
    expect(accentSet('ultraviolet').id).toBe(DEFAULT_ACCENT_ID);
    expect(accentSet(undefined).id).toBe(DEFAULT_ACCENT_ID);
    expect(accentSet(null).id).toBe(DEFAULT_ACCENT_ID);
    expect(accentValues('ultraviolet', 'light')).toEqual(accentSet('blue').light);
  });

  it('meets text-on-accent 4.5:1 for every accent and theme', () => {
    for (const accent of ACCENTS) {
      for (const theme of ['dark', 'light'] as const) {
        const values = accent[theme];
        expect(
          contrast(values.contrast, values.accent),
          `${accent.id}.${theme} text on accent`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(values.contrast, values.hover),
          `${accent.id}.${theme} text on accent hover`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(values.contrast, values.strong),
          `${accent.id}.${theme} text on accent strong`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('meets 3:1 for the focus ring, control border, and selection ring', () => {
    for (const accent of ACCENTS) {
      for (const surface of DARK_SURFACES) {
        expect(
          contrast(accent.dark.strong, surface),
          `${accent.id}.dark strong on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(accent.dark.accent, surface),
          `${accent.id}.dark accent on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
      for (const surface of LIGHT_SURFACES) {
        expect(
          contrast(accent.light.strong, surface),
          `${accent.id}.light strong on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(accent.light.accent, surface),
          `${accent.id}.light accent on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps tertiary text readable on every selected soft fill', () => {
    for (const accent of ACCENTS) {
      expect(
        contrast(TEXT_3.dark, accent.dark.soft),
        `${accent.id}.dark text-3 on soft`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(TEXT_3.light, accent.light.soft),
        `${accent.id}.light text-3 on soft`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('appearance normalization', () => {
  it('uses the product defaults for a missing or invalid appearance', () => {
    expect(DEFAULT_APPEARANCE).toEqual({
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
      codeTheme: 'auto',
    });
    expect(normalizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({})).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance('light')).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance([])).toEqual(DEFAULT_APPEARANCE);
  });

  it('accepts every documented value and normalizes the rest', () => {
    expect(
      normalizeAppearance({
        theme: 'system',
        accent: 'rose',
        uiScale: 0.9,
        uiFont: 'serif',
        codeFont: 'system-mono',
        codeTheme: 'dark-plus',
      }),
    ).toEqual({
      theme: 'system',
      accent: 'rose',
      uiScale: 0.9,
      uiFont: 'serif',
      codeFont: 'system-mono',
      codeTheme: 'dark-plus',
    });
    expect(
      normalizeAppearance({
        theme: 'neon',
        accent: 'teal',
        uiScale: 1.25,
        uiFont: 'mono',
        codeFont: 'fira',
        codeTheme: 'solarized',
        futureField: 'keep-me',
      }),
    ).toEqual({ ...DEFAULT_APPEARANCE, accent: 'teal' });
  });

  it('B2: keeps a stored code theme and falls back to auto for anything else', () => {
    expect(CODE_THEME_IDS).toEqual(['dark-plus', 'light-plus', 'monokai', 'one-light']);
    expect(DEFAULT_CODE_THEME).toBe('auto');
    for (const id of CODE_THEME_IDS) {
      expect(isCodeThemeSetting(id), id).toBe(true);
      expect(normalizeAppearance({ codeTheme: id }).codeTheme).toBe(id);
    }
    expect(isCodeThemeSetting('auto')).toBe(true);
    for (const value of ['solarized', '', 'Dark+', null, 42, {}, undefined]) {
      expect(isCodeThemeSetting(value), String(value)).toBe(false);
      expect(normalizeAppearance({ codeTheme: value }).codeTheme).toBe('auto');
    }
    // A file without the key loads as auto; the other appearance fields stay.
    expect(
      normalizeAppearance({ theme: 'light', accent: 'teal', uiFont: 'serif' }),
    ).toEqual({ ...DEFAULT_APPEARANCE, theme: 'light', accent: 'teal', uiFont: 'serif' });
  });

  it('is idempotent', () => {
    const once = normalizeAppearance({ theme: 'light', accent: 'amber', uiScale: 1.1 });
    expect(normalizeAppearance(once)).toEqual(once);
  });
});

describe('appearance resolution', () => {
  it('resolves system against the OS preference and keeps explicit themes', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('lists the documented option sets', () => {
    expect(UI_SCALES).toEqual([0.9, 1, 1.1]);
    expect(UI_FONTS).toEqual(['system', 'serif']);
    expect(CODE_FONTS).toEqual(['jetbrains', 'system-mono']);
    expect(DEFAULT_CODE_FONT).toBe('jetbrains');
  });

  it('falls back to the system UI font and JetBrains code font', () => {
    expect(uiFontStack('comic')).toBe(UI_FONT_STACKS.system);
    expect(uiFontStack('serif')).toBe(UI_FONT_STACKS.serif);
    expect(codeFontStack(undefined)).toContain('JetBrains Mono');
    expect(codeFontStack('papyrus')).toContain('JetBrains Mono');
    expect(codeFontStack('system-mono')).toContain('ui-monospace');
  });

  it('publishes the accent scale, UI scale, and fonts as root variables', () => {
    const variables = appearanceCssVariables(
      { theme: 'dark', accent: 'teal', uiScale: 1.1, uiFont: 'serif', codeFont: 'system-mono' },
      'dark',
    );
    expect(variables).toEqual({
      '--accent': '#89c0ba',
      '--accent-strong': '#99d1ca',
      '--accent-soft': '#233432',
      '--accent-hover': '#92cac3',
      '--accent-contrast': '#101418',
      '--ui-scale': '1.1',
      '--ui-font': UI_FONT_STACKS.serif,
      '--mono-font': expect.stringContaining('ui-monospace') as unknown as string,
    });
    const light = appearanceCssVariables(
      { theme: 'light', accent: 'teal', uiScale: 1, uiFont: 'system', codeFont: 'jetbrains' },
      'light',
    );
    expect(light['--accent']).toBe('#1f6f66');
    expect(light['--ui-scale']).toBe('1');
  });
});
