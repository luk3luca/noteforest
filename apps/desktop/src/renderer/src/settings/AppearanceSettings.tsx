/**
 * Appearance settings page (R3, B2).
 *
 * The shell's look and typography: theme, accent, UI text size/font, code font,
 * and the code theme. Every control is real and writes through the existing
 * instant-save settings path. Appearance is global and works with zero
 * documents: there is no document scope and no read-only scope.
 *
 * Page/PDF keep their paper: this page never changes the Page lens. The only
 * value that reaches the paper is the code font, and the preview strip says so;
 * the code theme and its own surfaces are shell-only, so the caption states
 * that the page and the PDF keep One Light.
 */

import { ChevronDown, RotateCcw } from 'lucide-react';
import {
  ACCENT_GROUPS,
  accentsInGroup,
  UI_SCALES,
  type AppearanceSettings,
  type AppearanceTheme,
  type CodeFontId,
  type CodeThemeSetting,
  type UiFontId,
  type UiScale,
} from '@noteforest/layout';
import { useSettingsStore } from '../state/settings';
import { useResolvedTheme } from '../shell/useAppearanceSync';
import { CODE_THEMES, codeThemeOptionLabel } from '../lib/code-themes';

const CODE_THEME_OPTIONS: { value: CodeThemeSetting; label: string }[] = [
  { value: 'auto', label: 'Match app theme' },
  ...CODE_THEMES.map((theme) => ({
    value: theme.id,
    label: codeThemeOptionLabel(theme),
  })),
];

const THEME_OPTIONS: { value: AppearanceTheme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const SCALE_OPTIONS: { value: UiScale; label: string }[] = [
  { value: 0.9, label: 'Compact' },
  { value: 1, label: 'Default' },
  { value: 1.1, label: 'Large' },
];

const UI_FONT_OPTIONS: { value: UiFontId; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'serif', label: 'Serif' },
];

const CODE_FONT_OPTIONS: { value: CodeFontId; label: string }[] = [
  { value: 'jetbrains', label: 'JetBrains Mono' },
  { value: 'system-mono', label: 'System Mono' },
];

function patchAppearance(patch: Partial<AppearanceSettings>): void {
  useSettingsStore.getState().updateAppSettings({ appearance: patch });
}

export function AppearanceSettingsPage(): JSX.Element {
  const appearance = useSettingsStore((state) => state.app.appearance);
  const resolvedTheme = useResolvedTheme();

  return (
    <>
      <h3 className="nf-settings-page-title">Appearance</h3>
      <p className="nf-settings-page-description" data-appearance-description="true">
        The app around the note. Page and PDF keep their paper.
      </p>

      <section className="nf-settings-section" data-appearance-theme-section="true">
        <h4 className="nf-settings-section-title">Theme</h4>
        <div className="nf-settings-row">
          <span className="nf-settings-row-label">Theme</span>
          <div className="nf-settings-control">
            <div className="nf-segmented" role="group" aria-label="Theme">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="nf-segmented-item"
                  data-appearance-theme-option={option.value}
                  aria-pressed={appearance.theme === option.value}
                  onClick={() => patchAppearance({ theme: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="nf-settings-help" data-appearance-theme-help="true">
          Follows the macOS appearance. Page and PDF keep their paper.
        </p>
      </section>

      <section className="nf-settings-section" data-appearance-accent-section="true">
        <h4 className="nf-settings-section-title">Accent</h4>
        <div className="nf-settings-row">
          <span className="nf-settings-row-label">Accent</span>
          <div className="nf-settings-control">
            <div
              className="nf-accent-groups"
              data-accent-options="true"
            >
              {ACCENT_GROUPS.map((group) => (
                <div
                  key={group.id}
                  className="nf-accent-group"
                  data-accent-group={group.id}
                  role="group"
                  aria-label={`${group.label} accent color`}
                >
                  <span className="nf-accent-group-label" aria-hidden="true">
                    {group.label}
                  </span>
                  <div className="nf-accent-swatches">
                    {accentsInGroup(group.id).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="nf-accent-swatch"
                        data-accent-option={entry.id}
                        aria-label={entry.label}
                        aria-pressed={appearance.accent === entry.id}
                        title={entry.label}
                        style={{ background: entry[resolvedTheme].accent }}
                        onClick={() => patchAppearance({ accent: entry.id })}
                      >
                        <span className="nf-sr-only">{entry.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="nf-settings-help" data-appearance-accent-help="true">
          Buttons, selection, and the active tab. Not Page or PDF.
        </p>
      </section>

      <section className="nf-settings-section" data-appearance-type-section="true">
        <h4 className="nf-settings-section-title">Typography</h4>
        <div className="nf-settings-row">
          <span className="nf-settings-row-label">UI text size</span>
          <div className="nf-settings-control">
            <div className="nf-segmented" role="group" aria-label="UI text size">
              {SCALE_OPTIONS.map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  className="nf-segmented-item"
                  data-ui-scale-option={option.value}
                  aria-pressed={appearance.uiScale === option.value}
                  onClick={() => patchAppearance({ uiScale: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="nf-settings-row">
          <label className="nf-settings-row-label" htmlFor="appearance-ui-font">
            UI font
          </label>
          <div className="nf-settings-control">
            <span className="nf-select-wrap">
              <select
                id="appearance-ui-font"
                className="nf-select"
                data-ui-font-select="true"
                value={appearance.uiFont}
                onChange={(event) =>
                  patchAppearance({ uiFont: event.target.value as UiFontId })
                }
              >
                {UI_FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="nf-select-chevron"
                size={14}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
        <div className="nf-settings-row">
          <label className="nf-settings-row-label" htmlFor="appearance-code-font">
            Code font
          </label>
          <div className="nf-settings-control">
            <span className="nf-select-wrap">
              <select
                id="appearance-code-font"
                className="nf-select"
                data-code-font-select="true"
                value={appearance.codeFont}
                onChange={(event) =>
                  patchAppearance({ codeFont: event.target.value as CodeFontId })
                }
              >
                {CODE_FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="nf-select-chevron"
                size={14}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
        <p className="nf-settings-help" data-appearance-type-help="true">
          Affects the app only, not Page or PDF. Code font applies to code everywhere.
        </p>
      </section>

      <section className="nf-settings-section" data-appearance-code-section="true">
        <h4 className="nf-settings-section-title">Code</h4>
        <div className="nf-settings-row">
          <label className="nf-settings-row-label" htmlFor="appearance-code-theme">
            Code theme
          </label>
          <div className="nf-settings-control">
            <span className="nf-select-wrap">
              <select
                id="appearance-code-theme"
                className="nf-select"
                data-code-theme-select="true"
                value={appearance.codeTheme}
                onChange={(event) =>
                  patchAppearance({
                    codeTheme: event.target.value as CodeThemeSetting,
                  })
                }
              >
                {CODE_THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="nf-select-chevron"
                size={14}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
        <p className="nf-settings-help" data-appearance-code-help="true">
          Worst colour contrast on the theme’s own background; AA is 4.5:1.
        </p>
        <p className="nf-settings-help" data-appearance-code-paper="true">
          Page and PDF keep One Light.
        </p>
      </section>

      <section className="nf-settings-section" data-appearance-preview-section="true">
        <h4 className="nf-settings-section-title">Preview</h4>
        <div className="nf-settings-section-actions">
          <button
            type="button"
            className="nf-button nf-button-quiet"
            data-appearance-reset="true"
            onClick={() =>
              patchAppearance({
                theme: 'dark',
                accent: 'blue',
                uiScale: 1,
                uiFont: 'system',
                codeFont: 'jetbrains',
                codeTheme: 'auto',
              })
            }
          >
            <RotateCcw size={12} strokeWidth={1.5} aria-hidden="true" />
            Reset appearance
          </button>
        </div>
      </section>
    </>
  );
}
