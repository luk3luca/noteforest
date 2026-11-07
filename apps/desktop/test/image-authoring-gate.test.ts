import { describe, expect, it } from 'vitest';
import {
  imageAnchorAuthoringGate,
  imageAuthoringDisabledSuffix,
} from '../src/renderer/src/lib/image';

const ASSET_ID = 'a'.repeat(64);

function gate(
  overrides: Partial<Parameters<typeof imageAnchorAuthoringGate>[0]> = {},
) {
  return imageAnchorAuthoringGate({
    editable: true,
    assetId: ASSET_ID,
    hasAssetRecord: true,
    availability: undefined,
    ...overrides,
  });
}

describe('image anchor authoring availability gate', () => {
  it('allows authoring when the record exists and no availability problem was observed', () => {
    expect(gate()).toEqual({ allowed: true });
    expect(gate({ availability: {} })).toEqual({ allowed: true });
    expect(gate({ availability: { [ASSET_ID]: 'available' } })).toEqual({ allowed: true });
    expect(
      gate({ availability: { ['b'.repeat(64)]: 'asset-missing' } }),
    ).toEqual({ allowed: true });
  });

  it('distinguishes an unchecked asset, a missing file, and a changed asset', () => {
    // Undefined means unchecked/observed-available, not missing.
    expect(gate({ availability: undefined })).toEqual({ allowed: true });
    expect(gate({ availability: { [ASSET_ID]: 'asset-missing' } })).toEqual({
      allowed: false,
      reason: 'asset-missing',
    });
    expect(gate({ availability: { [ASSET_ID]: 'asset-changed' } })).toEqual({
      allowed: false,
      reason: 'asset-changed',
    });
  });

  it('blocks a missing record and a read-only document before availability', () => {
    expect(gate({ hasAssetRecord: false })).toEqual({
      allowed: false,
      reason: 'asset-record-missing',
    });
    expect(gate({ assetId: '' })).toEqual({
      allowed: false,
      reason: 'asset-record-missing',
    });
    expect(
      gate({
        editable: false,
        availability: { [ASSET_ID]: 'asset-missing' },
      }),
    ).toEqual({ allowed: false, reason: 'read-only' });
  });

  it('names every disabled reason in the menu suffix', () => {
    expect(imageAuthoringDisabledSuffix(undefined)).toBe('');
    expect(imageAuthoringDisabledSuffix('read-only')).toBe(' — document is read-only');
    expect(imageAuthoringDisabledSuffix('asset-record-missing')).toBe(
      ' — image asset missing',
    );
    expect(imageAuthoringDisabledSuffix('asset-missing')).toBe(' — image file missing');
    expect(imageAuthoringDisabledSuffix('asset-changed')).toBe(' — image asset changed');
  });
});
