import { enUS, es, type Locale } from "date-fns/locale";
import { useTranslation } from "react-i18next";

const LOCALES: Record<string, Locale> = {
  es,
  en: enUS,
};

export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  const base = i18n.language?.split("-")[0] ?? "es";
  return LOCALES[base] ?? es;
}

export function localeForLanguage(language: string | undefined): Locale {
  const base = language?.split("-")[0] ?? "es";
  return LOCALES[base] ?? es;
}
