/**
 * React bridge for the appearance contract (R3).
 *
 * `useResolvedTheme` follows `prefers-color-scheme` while the stored theme is
 * `system`. `useAppearanceSync` applies the stored appearance to the document
 * root exactly once (App owns it) and returns the resolved theme for surfaces
 * that mirror it (the toast theme). There is no second writer.
 */

import { useEffect, useState } from 'react';
import { resolveTheme, type ResolvedTheme } from '@noteforest/layout';
import { useSettingsStore } from '../state/settings';
import { applyAppearance, DARK_MEDIA_QUERY, prefersDarkNow } from '../lib/apply-appearance';

/** The resolved theme: the stored value, with `system` matched to the OS. */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useSettingsStore((state) => state.app.appearance.theme);
  const [prefersDark, setPrefersDark] = useState(prefersDarkNow);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (): void => setPrefersDark(query.matches);
    query.addEventListener('change', onChange);
    onChange();
    return () => query.removeEventListener('change', onChange);
  }, []);

  return resolveTheme(theme, prefersDark);
}

export function useAppearanceSync(): ResolvedTheme {
  const appearance = useSettingsStore((state) => state.app.appearance);
  const [prefersDark, setPrefersDark] = useState(prefersDarkNow);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (): void => setPrefersDark(query.matches);
    query.addEventListener('change', onChange);
    onChange();
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyAppearance(appearance, { prefersDark });
  }, [appearance, prefersDark]);

  return resolveTheme(appearance.theme, prefersDark);
}
