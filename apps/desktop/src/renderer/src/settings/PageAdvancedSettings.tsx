/**
 * Batch C Page advanced typography and layout controls.
 *
 * First-class: max card width. Advanced: typography sizes/line heights and the
 * layout box/indent fields. Everything else in the frozen `PageTheme` stays
 * hidden (font/heading scales, packing/modes, trunk insets, callout lane gate,
 * chrome/marker sizes). Fields write through the Page settings controller so
 * they share instant save, scope/override, validation, and the Page Edit
 * commit-before-write ordering.
 */

import type { JSX } from 'react';
import {
  ADVANCED_LAYOUT_KEYS,
  ADVANCED_TYPOGRAPHY_KEYS,
  formatPageThemeNumber,
  PAGE_THEME_FIELD_SPECS,
  parsePageThemeNumber,
  type EditableThemeKey,
} from './page-advanced';
import type { PageSettingsController } from './usePageSettingsController';

function unitLabel(unit: 'pt' | 'px' | '×'): string {
  if (unit === 'pt') return 'in points';
  if (unit === 'px') return 'in pixels';
  return 'as a line-height multiplier';
}

function ThemeFieldError({
  controller,
  fieldKey,
}: {
  controller: PageSettingsController;
  fieldKey: EditableThemeKey;
}): JSX.Element | null {
  const error = controller.themeValidation.errors[fieldKey];
  if (error === undefined) return null;
  return (
    <span
      id={`page-theme-${fieldKey}-error`}
      className="nf-margin-field-error"
      role="alert"
      data-page-theme-error={fieldKey}
    >
      {error}
    </span>
  );
}

function ThemeFieldInput({
  controller,
  fieldKey,
}: {
  controller: PageSettingsController;
  fieldKey: EditableThemeKey;
}): JSX.Element {
  const spec = PAGE_THEME_FIELD_SPECS[fieldKey];
  const error = controller.themeValidation.errors[fieldKey];
  const overridden = controller.isThemeFieldOverridden(fieldKey);
  const step = (direction: 1 | -1, shift: boolean): void => {
    const current =
      parsePageThemeNumber(controller.themeDrafts[fieldKey]) ??
      controller.layerTheme[fieldKey];
    const amount = spec.step * (shift ? 5 : 1);
    const next = Math.min(
      spec.max,
      Math.max(spec.min, Math.round((current + direction * amount) * 1000) / 1000),
    );
    controller.setThemeField(fieldKey, formatPageThemeNumber(next));
  };
  return (
    <div className="nf-margin-input-row">
      <input
        id={`page-theme-${fieldKey}`}
        className="nf-input nf-margin-input"
        type="text"
        inputMode="decimal"
        value={controller.themeDrafts[fieldKey]}
        aria-label={`${spec.label} ${unitLabel(spec.unit)}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `page-theme-${fieldKey}-error`}
        data-page-theme-input={fieldKey}
        onChange={(event) => controller.setThemeField(fieldKey, event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          step(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
        }}
      />
      <span className="nf-margin-unit">{spec.unit}</span>
      {overridden ? (
        <button
          type="button"
          className="nf-icon-button nf-margin-use-global"
          data-page-theme-use-global={fieldKey}
          title={`Use the global ${spec.label.toLowerCase()}`}
          aria-label={`Use global for ${spec.label.toLowerCase()}`}
          onClick={() => controller.useGlobalThemeField(fieldKey)}
        >
          ↺
        </button>
      ) : null}
    </div>
  );
}

function AdvancedGroup({
  controller,
  title,
  fields,
  help,
  dataAttribute,
  useGlobalLabel,
  onUseGlobal,
  hasOverrides,
  overrideAttribute,
}: {
  controller: PageSettingsController;
  title: string;
  fields: readonly EditableThemeKey[];
  help: string;
  dataAttribute: 'typography' | 'layout';
  useGlobalLabel: string;
  onUseGlobal: () => void;
  hasOverrides: boolean;
  overrideAttribute: string;
}): JSX.Element {
  const dataProps =
    dataAttribute === 'typography'
      ? { 'data-page-advanced-typography': true }
      : { 'data-page-advanced-layout': true };
  return (
    <details className="nf-settings-advanced" {...dataProps}>
      <summary className="nf-settings-advanced-summary">
        {title}
        {hasOverrides ? (
          <span
            className="nf-override-dot"
            {...{ [overrideAttribute]: true }}
            title="This document overrides at least one value in this group"
            aria-label="Overridden for this document"
          />
        ) : null}
      </summary>
      <div className="nf-settings-advanced-body">
        <p className="nf-settings-help">{help}</p>
        {hasOverrides ? (
          <div className="nf-settings-advanced-actions">
            <button
              type="button"
              className="nf-button nf-button-quiet"
              {...{
                [`data-page-advanced-${dataAttribute}-use-global`]: true,
              }}
              onClick={onUseGlobal}
            >
              {useGlobalLabel}
            </button>
          </div>
        ) : null}
        <div className="nf-margin-grid">
          {fields.map((fieldKey) => (
            <div className="nf-margin-field" key={fieldKey} data-page-theme-field={fieldKey}>
              <label className="nf-margin-label" htmlFor={`page-theme-${fieldKey}`}>
                {PAGE_THEME_FIELD_SPECS[fieldKey].label}
                {controller.isThemeFieldOverridden(fieldKey) ? (
                  <span
                    className="nf-override-dot"
                    data-page-theme-override={fieldKey}
                    title="This document overrides the global value"
                    aria-label="Overridden for this document"
                  />
                ) : null}
              </label>
              <ThemeFieldInput controller={controller} fieldKey={fieldKey} />
              <ThemeFieldError controller={controller} fieldKey={fieldKey} />
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export function AdvancedTypographyFields({
  controller,
}: {
  controller: PageSettingsController;
}): JSX.Element {
  return (
    <AdvancedGroup
      controller={controller}
      title="Advanced typography"
      fields={ADVANCED_TYPOGRAPHY_KEYS}
      dataAttribute="typography"
      help="Sizes in points, line heights as a multiplier. Editing a value makes this layer Custom."
      useGlobalLabel="Use global typography"
      onUseGlobal={() => controller.useGlobalAdvancedTypography()}
      hasOverrides={controller.hasAdvancedTypographyOverrides}
      overrideAttribute="data-page-advanced-typography-override"
    />
  );
}

export function AdvancedLayoutFields({
  controller,
}: {
  controller: PageSettingsController;
}): JSX.Element {
  return (
    <AdvancedGroup
      controller={controller}
      title="Advanced layout"
      fields={ADVANCED_LAYOUT_KEYS}
      dataAttribute="layout"
      help="Values in pixels, per level. Editing a value makes this layer Custom."
      useGlobalLabel="Use global layout"
      onUseGlobal={() => controller.useGlobalAdvancedLayout()}
      hasOverrides={controller.hasAdvancedLayoutOverrides}
      overrideAttribute="data-page-advanced-layout-override"
    />
  );
}

/** First-class max card width plus the advanced layout disclosure. */
export function PageLayoutSection({
  controller,
}: {
  controller: PageSettingsController;
}): JSX.Element {
  const fieldKey = 'maxCardWidth' as const;
  const spec = PAGE_THEME_FIELD_SPECS[fieldKey];
  const error = controller.themeValidation.errors[fieldKey];
  const overridden = controller.isThemeFieldOverridden(fieldKey);
  return (
    <section className="nf-settings-section" data-page-layout-section="true">
      <div className="nf-settings-section-head">
        <h4 className="nf-settings-section-title">Layout</h4>
      </div>
      <div className="nf-settings-row" data-page-theme-field={fieldKey}>
        <label className="nf-settings-row-label" htmlFor={`page-theme-${fieldKey}`}>
          {spec.label}
          {overridden ? (
            <span
              className="nf-override-dot"
              data-page-theme-override={fieldKey}
              title="This document overrides the global max card width"
              aria-label="Overridden for this document"
            />
          ) : null}
        </label>
        <div className="nf-settings-control">
          <ThemeFieldInput controller={controller} fieldKey={fieldKey} />
        </div>
      </div>
      {error === undefined ? null : (
        <p
          id={`page-theme-${fieldKey}-error`}
          className="nf-settings-inline-error"
          data-page-theme-error={fieldKey}
          role="alert"
        >
          {error}
        </p>
      )}
      <p className="nf-settings-help" data-page-max-card-width-help="true">
        Card width limit. It follows density; images use the same limit.
      </p>
      <AdvancedLayoutFields controller={controller} />
    </section>
  );
}
