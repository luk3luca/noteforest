/**
 * Appearance preview rail (settings-shell layout batch).
 *
 * The same surface/action/focus/selection/code sample that used to sit at the
 * bottom of the Appearance page. It now lives in the shared right rail so it is
 * visible while the theme, accent, and type controls are in view. At rail width
 * the two-column sample grid stacks into one column.
 *
 * Pure presentation: every value is read from the real settings store, so the
 * sample follows the resolved theme exactly like the rest of the shell.
 */

import {
  accentValues,
  type AppearanceSettings,
} from '@noteforest/layout';
import { useSettingsStore } from '../state/settings';
import { useResolvedTheme } from '../shell/useAppearanceSync';

export function AppearanceSettingsPreview(): JSX.Element {
  const appearance: AppearanceSettings = useSettingsStore(
    (state) => state.app.appearance,
  );
  const resolvedTheme = useResolvedTheme();
  const accent = accentValues(appearance.accent, resolvedTheme);

  return (
    <aside
      className="nf-settings-preview"
      data-appearance-preview="true"
      role="region"
      aria-label="Appearance preview"
    >
      <h4 className="nf-settings-preview-title">Preview</h4>
      <p className="nf-settings-preview-scope" data-appearance-preview-scope="true">
        Global · this app
      </p>
      <div className="nf-appearance-preview" data-appearance-preview-sample="true">
        <div className="nf-appearance-preview-surface">
          <span className="nf-appearance-preview-title">Surface text</span>
          <span className="nf-appearance-preview-muted">Secondary text</span>
        </div>
        <div className="nf-appearance-preview-actions">
          <span className="nf-button nf-button-primary nf-appearance-preview-button">
            Primary
          </span>
          <span
            className="nf-appearance-preview-focus"
            style={{ borderColor: accent.strong }}
            data-appearance-preview-focus="true"
          />
          <span
            className="nf-appearance-preview-row"
            style={{ background: accent.soft }}
            data-appearance-preview-selection="true"
          >
            Selected row
          </span>
        </div>
        <code className="nf-appearance-preview-code" data-appearance-preview-code="true">
          const forest = {'{ notes: 42 }'};
        </code>
      </div>
      <p className="nf-settings-help" data-appearance-preview-note="true">
        Surface, primary action, focus ring, selection, and code follow the app. Page and PDF
        keep the paper light.
      </p>
    </aside>
  );
}
