import { describe, expect, it } from 'vitest';
import {
  editingEnabledFor,
  pageBlockEditingEnabledFor,
  READ_MODE_SUFFIX,
  READ_MODE_TITLE,
  READ_MODE_TOAST,
  type EditabilityRuntime,
  type EditabilityView,
} from '../src/renderer/src/lib/editability';

const editable: EditabilityRuntime = { editable: true };
const readOnly: EditabilityRuntime = { editable: false };

const continuousEdit: EditabilityView = {
  layout: 'continuous',
  interactionMode: 'edit',
};
const continuousRead: EditabilityView = {
  layout: 'continuous',
  interactionMode: 'read',
};
const pageRead: EditabilityView = { layout: 'page', interactionMode: 'read' };
const pageEdit: EditabilityView = { layout: 'page', interactionMode: 'edit' };

describe('read-mode editability helper', () => {
  it.each([
    ['no active runtime', null, continuousEdit, false],
    ['read-only document in Continuous Edit', readOnly, continuousEdit, false],
    ['editable runtime in Continuous Edit', editable, continuousEdit, true],
    ['Continuous Read', editable, continuousRead, false],
    ['Page Read', editable, pageRead, false],
    ['Page Edit stays outside shell authoring', editable, pageEdit, false],
    ['missing view defaults to Continuous Edit', editable, undefined, true],
    ['read-only runtime with a missing view', readOnly, undefined, false],
  ] as const)('%s', (_name, runtime, view, expected) => {
    expect(editingEnabledFor(runtime, view)).toBe(expected);
  });

  it('enables only the Page block overlay predicate in Page Edit', () => {
    expect(pageBlockEditingEnabledFor(editable, pageEdit)).toBe(true);
    expect(pageBlockEditingEnabledFor(readOnly, pageEdit)).toBe(false);
    expect(pageBlockEditingEnabledFor(editable, pageRead)).toBe(false);
    expect(pageBlockEditingEnabledFor(editable, continuousEdit)).toBe(false);
    expect(pageBlockEditingEnabledFor(editable, continuousRead)).toBe(false);
    expect(pageBlockEditingEnabledFor(editable, undefined)).toBe(false);
    expect(pageBlockEditingEnabledFor(null, pageEdit)).toBe(false);
  });

  it('exposes one shared Read-mode reason for every surface', () => {
    expect(READ_MODE_TITLE).toBe('Read mode — switch to Edit to make changes');
    expect(READ_MODE_SUFFIX).toBe(' — Read mode');
    expect(READ_MODE_TOAST).toBe('Read mode — switch to Edit to make changes.');
  });
});
