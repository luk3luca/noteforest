/**
 * Settings → Continuous (R6).
 *
 * Global-only canvas controls: spacing, arrow widths/size, and the Advanced
 * width caps. Works with no document open. Instant save with a debounced
 * slider; there is no scope switch and no per-document override. Zoom is not a
 * Settings control; it stays per-document view state in the toolbar/View menu.
 */

import { useState, type ReactNode } from 'react';
import {
  CONTINUOUS_ARROW_MAX,
  CONTINUOUS_ARROW_MIN,
  CONTINUOUS_SPACING_MAX,
  CONTINUOUS_SPACING_MIN,
  CONTINUOUS_STEP,
  CONTINUOUS_WIDTH_MAX,
  CONTINUOUS_WIDTH_MIN,
} from '@noteforest/layout';
import type { ContinuousSettingsController } from './useContinuousSettingsController';

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function valueText(value: number): string {
  return `${formatValue(value)} px`;
}

interface SliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Test/automation hook for the row and slider. */
  attribute: string;
  onChange: (value: number) => void;
}

function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  attribute,
  onChange,
}: SliderRowProps): JSX.Element {
  const valueId = `${id}-value`;
  return (
    <div className="nf-settings-row nf-continuous-row" data-continuous-field={attribute}>
      <label className="nf-settings-row-label" htmlFor={id}>
        {label}
      </label>
      <div className="nf-settings-control nf-continuous-control">
        <input
          id={id}
          type="range"
          className="nf-range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={valueText(value)}
          aria-describedby={valueId}
          data-continuous-slider={attribute}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="nf-density-value nf-continuous-value" id={valueId} data-continuous-value={attribute}>
          {valueText(value)}
        </span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="nf-settings-section">
      <h4 className="nf-settings-section-title">{title}</h4>
      {children}
    </section>
  );
}

export function ContinuousSettingsPage({
  controller,
}: {
  controller: ContinuousSettingsController;
}): JSX.Element {
  const { settings } = controller;
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <h3 className="nf-settings-page-title">Continuous</h3>
      <p className="nf-settings-page-description" data-continuous-page-description="true">
        Canvas spacing and arrows. Global; Page and PDF don’t change.
      </p>

      <Section title="Spacing">
        <SliderRow
          id="continuous-chapter-gap"
          label="Chapter gap"
          attribute="chapterGap"
          value={settings.spacing.chapterGap}
          min={CONTINUOUS_SPACING_MIN.chapterGap}
          max={CONTINUOUS_SPACING_MAX.chapterGap}
          step={CONTINUOUS_STEP.spacing}
          onChange={(value) => controller.setSpacing('chapterGap', value)}
        />
        <SliderRow
          id="continuous-sibling-gap"
          label="Sibling gap"
          attribute="siblingGap"
          value={settings.spacing.siblingGap}
          min={CONTINUOUS_SPACING_MIN.siblingGap}
          max={CONTINUOUS_SPACING_MAX.siblingGap}
          step={CONTINUOUS_STEP.spacing}
          onChange={(value) => controller.setSpacing('siblingGap', value)}
        />
        <SliderRow
          id="continuous-child-row-gap"
          label="Child row gap"
          attribute="childRowGap"
          value={settings.spacing.childRowGap}
          min={CONTINUOUS_SPACING_MIN.childRowGap}
          max={CONTINUOUS_SPACING_MAX.childRowGap}
          step={CONTINUOUS_STEP.spacing}
          onChange={(value) => controller.setSpacing('childRowGap', value)}
        />
        <p className="nf-settings-help">Gaps between chapters, cards, and rows.</p>
      </Section>

      <Section title="Arrows">
        <SliderRow
          id="continuous-arrow-width"
          label="Resting width"
          attribute="width"
          value={settings.arrows.width}
          min={CONTINUOUS_ARROW_MIN.width}
          max={CONTINUOUS_ARROW_MAX.width}
          step={CONTINUOUS_STEP.arrowWidth}
          onChange={(value) => controller.setArrow('width', value)}
        />
        <SliderRow
          id="continuous-arrow-active"
          label="Active width"
          attribute="activeWidth"
          value={settings.arrows.activeWidth}
          min={CONTINUOUS_ARROW_MIN.activeWidth}
          max={CONTINUOUS_ARROW_MAX.activeWidth}
          step={CONTINUOUS_STEP.arrowWidth}
          onChange={(value) => controller.setArrow('activeWidth', value)}
        />
        <SliderRow
          id="continuous-arrow-muted"
          label="Muted width"
          attribute="mutedWidth"
          value={settings.arrows.mutedWidth}
          min={CONTINUOUS_ARROW_MIN.mutedWidth}
          max={CONTINUOUS_ARROW_MAX.mutedWidth}
          step={CONTINUOUS_STEP.arrowWidth}
          onChange={(value) => controller.setArrow('mutedWidth', value)}
        />
        <SliderRow
          id="continuous-arrow-size"
          label="Arrow size"
          attribute="size"
          value={settings.arrows.size}
          min={CONTINUOUS_ARROW_MIN.size}
          max={CONTINUOUS_ARROW_MAX.size}
          step={CONTINUOUS_STEP.arrowSize}
          onChange={(value) => controller.setArrow('size', value)}
        />
        <p className="nf-settings-help" data-continuous-arrow-help="true">
          Resting and active arrow widths. The arrowhead is fixed; reference arrows stay dashed.
        </p>
      </Section>

      <details className="nf-continuous-advanced" data-continuous-advanced="true">
        <summary>Advanced</summary>
        <div className="nf-continuous-advanced-body">
          <SliderRow
            id="continuous-canvas-max"
            label="Canvas max width"
            attribute="canvasMax"
            value={settings.widths.canvasMax}
            min={CONTINUOUS_WIDTH_MIN.canvasMax}
            max={CONTINUOUS_WIDTH_MAX.canvasMax}
            step={CONTINUOUS_STEP.canvasMax}
            onChange={(value) => controller.setWidth('canvasMax', value)}
          />
          <SliderRow
            id="continuous-top-level-max"
            label="Top-level max"
            attribute="topLevelMax"
            value={settings.widths.topLevelMax}
            min={CONTINUOUS_WIDTH_MIN.topLevelMax}
            max={CONTINUOUS_WIDTH_MAX.topLevelMax}
            step={CONTINUOUS_STEP.cardWidth}
            onChange={(value) => controller.setWidth('topLevelMax', value)}
          />
          <SliderRow
            id="continuous-child-max"
            label="Child max"
            attribute="childMax"
            value={settings.widths.childMax}
            min={CONTINUOUS_WIDTH_MIN.childMax}
            max={CONTINUOUS_WIDTH_MAX.childMax}
            step={CONTINUOUS_STEP.cardWidth}
            onChange={(value) => controller.setWidth('childMax', value)}
          />
          <p className="nf-settings-help" data-continuous-width-help="true">
            The canvas widens automatically to fit the cards.
          </p>
        </div>
      </details>

      <section className="nf-settings-section" data-continuous-reset-section="true">
        {confirmReset ? (
          <div className="nf-settings-warning" role="group" aria-label="Confirm reset Continuous settings">
            <p>Reset every Continuous setting? Page and PDF aren’t affected.</p>
            <div className="nf-dialog-inline-actions">
              <button
                type="button"
                className="nf-button nf-button-primary"
                data-continuous-reset-confirm="true"
                onClick={() => {
                  setConfirmReset(false);
                  controller.reset();
                }}
              >
                Reset settings
              </button>
              <button
                type="button"
                className="nf-button"
                data-continuous-reset-cancel="true"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          className="nf-button"
          data-continuous-reset="true"
          disabled={!controller.changed}
          onClick={() => setConfirmReset(true)}
        >
          Reset Continuous settings
        </button>
        {controller.changed ? null : (
          <p className="nf-settings-help" data-continuous-defaults="true">
            Every Continuous setting is at its default.
          </p>
        )}
      </section>
    </>
  );
}
