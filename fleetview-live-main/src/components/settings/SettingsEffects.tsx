import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import i18n from '@/i18n';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Applies the user's effective settings to the live UI. Each effect keys off a
 * single field, so it only fires when *that* setting changes — it won't fight
 * the rail toggles (which also write the same fields back to the store).
 * Mounted once inside the authenticated layout.
 */
export function SettingsEffects() {
  const settings = useAuthStore((s) => s.settings);
  const { setTheme } = useTheme();

  // Language ← locale
  useEffect(() => {
    const base = i18n.language?.split('-')[0];
    if (settings?.locale && base !== settings.locale) {
      void i18n.changeLanguage(settings.locale);
    }
  }, [settings?.locale]);

  // Theme ← next-themes
  useEffect(() => {
    if (settings?.theme) setTheme(settings.theme);
  }, [settings?.theme, setTheme]);

  // Density ← data attribute on <html> (consumed by CSS)
  useEffect(() => {
    document.documentElement.setAttribute('data-density', settings?.density || 'comfortable');
  }, [settings?.density]);

  return null;
}
