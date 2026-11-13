/**
 * Deterministic sample layout for the Continuous settings preview (R6).
 *
 * The preview never loads a document and never runs the page layout engine. It
 * builds one top-level card, two direct children, and one callout from the
 * resolved spacing and width caps, then lets the real Continuous edge router
 * draw the same primary/trunk edges the canvas uses.
 *
 * Card widths are a fixed fraction of the configured caps so the whole sample
 * fits the Settings pane; the fraction is the only preview-only scale. Spacing,
 * the edge corridor, the arrowhead, and stroke widths are exact.
 */

import {
  normalizeContinuousSettings,
  type ContinuousSettings,
} from '@noteforest/layout';
import { DESIGN_TOKENS } from '../lib/design-tokens';
import type { Rect } from '../lib/geometry';

export const PREVIEW_CARD_WIDTH_FACTOR = 0.35;
export const PREVIEW_STAGE_PADDING = 8;

const TOP_HEIGHT = 64;
const CHILD_HEIGHT = 44;
const CALLOUT_HEIGHT = 54;
const STAGE_BOTTOM_INSET = 8;

export interface ContinuousPreviewSample {
  settings: ContinuousSettings;
  root: Rect;
  childOne: Rect;
  childTwo: Rect;
  callout: Rect;
  /** Stage content width; the SVG edge layer fills it. */
  width: number;
  /** Stage content height; the SVG edge layer fills it. */
  height: number;
}

function scaledWidth(max: number): number {
  return Math.max(110, Math.round(max * PREVIEW_CARD_WIDTH_FACTOR));
}

export function buildContinuousPreview(input: ContinuousSettings): ContinuousPreviewSample {
  const settings = normalizeContinuousSettings(input);
  const pad = PREVIEW_STAGE_PADDING;
  const rootWidth = scaledWidth(settings.widths.topLevelMax);
  const childWidth = scaledWidth(settings.widths.childMax);
  const root: Rect = { x: pad, y: pad, width: rootWidth, height: TOP_HEIGHT };
  const childX = pad + rootWidth + settings.spacing.siblingGap;
  const childOne: Rect = { x: childX, y: pad, width: childWidth, height: CHILD_HEIGHT };
  const childTwo: Rect = {
    x: childX,
    y: pad + CHILD_HEIGHT + settings.spacing.childRowGap,
    width: childWidth,
    height: CHILD_HEIGHT,
  };
  const childrenBottom = childTwo.y + childTwo.height;
  // Below rows start at the shared 26 px row indent, matching the canvas.
  const calloutY = Math.max(pad + root.height, childrenBottom) + settings.spacing.childRowGap;
  const callout: Rect = {
    x: pad + DESIGN_TOKENS.rowIndent,
    y: calloutY,
    width: childWidth,
    height: CALLOUT_HEIGHT,
  };
  return {
    settings,
    root,
    childOne,
    childTwo,
    callout,
    width: Math.ceil(Math.max(childX + childWidth, callout.x + callout.width) + pad),
    height: Math.ceil(callout.y + callout.height + STAGE_BOTTOM_INSET),
  };
}
