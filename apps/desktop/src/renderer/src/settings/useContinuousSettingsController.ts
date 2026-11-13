/**
 * Continuous settings controller (R6).
 *
 * Global-only. Every slider updates the live preview immediately and writes
 * through the existing global settings store after a short debounce. There is
 * no draft/Apply model and no per-document layer. Close/quit flushes the last
 * pending slider value through the shared pending-flush registry.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  continuousCanvasFloor,
  DEFAULT_CONTINUOUS_SETTINGS,
  normalizeContinuousSettings,
  type ContinuousArrowSettings,
  type ContinuousSettings,
  type ContinuousSpacingSettings,
  type ContinuousWidthSettings,
} from '@noteforest/layout';
import {
  flushSettingsWrites,
  registerPendingSettingsFlush,
  useSettingsStore,
} from '../state/settings';

const CONTINUOUS_DEBOUNCE_MS = 240;

export type ContinuousSpacingKey = keyof ContinuousSpacingSettings;
export type ContinuousArrowKey = keyof ContinuousArrowSettings;
export type ContinuousWidthKey = keyof ContinuousWidthSettings;

export interface ContinuousSettingsController {
  /** Resolved values currently shown and previewed (pending edits included). */
  settings: ContinuousSettings;
  saving: boolean;
  error: string | null;
  /** True when at least one field differs from the product defaults. */
  changed: boolean;
  /** Minimum canvas cap for the current widths and sibling gap. */
  minimumCanvasMax: number;
  setSpacing: (key: ContinuousSpacingKey, value: number) => void;
  setArrow: (key: ContinuousArrowKey, value: number) => void;
  setWidth: (key: ContinuousWidthKey, value: number) => void;
  reset: () => void;
  retry: () => void;
  /** Apply a debounced slider value now; resolves after the write settles. */
  flushPending: () => Promise<void>;
}

interface PendingWrite {
  settings: ContinuousSettings;
}

export function useContinuousSettingsController(): ContinuousSettingsController {
  const stored = useSettingsStore((state) => state.app.continuous);
  const [pending, setPending] = useState<ContinuousSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<PendingWrite | null>(null);
  const timerRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);

  const displayed = pending ?? stored;
  const displayedRef = useRef<ContinuousSettings>(displayed);
  displayedRef.current = displayed;

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const settle = useCallback(async (sequence: number): Promise<void> => {
    const result = await flushSettingsWrites();
    if (sequence !== sequenceRef.current) return;
    setSaving(false);
    setError(result.ok ? null : (result.message ?? 'Could not save settings.'));
  }, []);

  const write = useCallback(
    (next: ContinuousSettings): void => {
      const sequence = ++sequenceRef.current;
      clearTimer();
      pendingRef.current = null;
      displayedRef.current = next;
      setPending(null);
      setSaving(true);
      setError(null);
      useSettingsStore.getState().updateAppSettings({ continuous: next });
      void settle(sequence);
    },
    [settle],
  );

  const schedule = useCallback(
    (next: ContinuousSettings): void => {
      const normalized = normalizeContinuousSettings(next);
      displayedRef.current = normalized;
      setPending(normalized);
      setSaving(true);
      setError(null);
      pendingRef.current = { settings: normalized };
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const queued = pendingRef.current;
        pendingRef.current = null;
        if (queued !== null) write(queued.settings);
      }, CONTINUOUS_DEBOUNCE_MS);
    },
    [write],
  );

  const flushPending = useCallback(async (): Promise<void> => {
    const queued = pendingRef.current;
    if (queued === null) return;
    write(queued.settings);
    await flushSettingsWrites();
  }, [write]);

  useEffect(() => {
    return registerPendingSettingsFlush(flushPending);
  }, [flushPending]);

  useEffect(() => () => clearTimer(), []);

  const setSpacing = (key: ContinuousSpacingKey, value: number): void => {
    const current = displayedRef.current;
    schedule({
      ...current,
      spacing: { ...current.spacing, [key]: value },
    });
  };

  const setArrow = (key: ContinuousArrowKey, value: number): void => {
    const current = displayedRef.current;
    schedule({
      ...current,
      arrows: { ...current.arrows, [key]: value },
    });
  };

  const setWidth = (key: ContinuousWidthKey, value: number): void => {
    const current = displayedRef.current;
    schedule({
      ...current,
      widths: { ...current.widths, [key]: value },
    });
  };

  const reset = (): void => {
    const defaults = normalizeContinuousSettings(DEFAULT_CONTINUOUS_SETTINGS);
    displayedRef.current = defaults;
    write(defaults);
  };

  const retry = (): void => {
    const sequence = ++sequenceRef.current;
    setError(null);
    setSaving(true);
    useSettingsStore.getState().retrySettingsWrite();
    void settle(sequence);
  };

  const changed = useMemo(
    () => JSON.stringify(displayed) !== JSON.stringify(DEFAULT_CONTINUOUS_SETTINGS),
    [displayed],
  );
  const minimumCanvasMax = useMemo(() => continuousCanvasFloor(displayed), [displayed]);

  return {
    settings: displayed,
    saving,
    error,
    changed,
    minimumCanvasMax,
    setSpacing,
    setArrow,
    setWidth,
    reset,
    retry,
    flushPending,
  };
}
