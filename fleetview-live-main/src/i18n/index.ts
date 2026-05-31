import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enAuth from "./locales/en/auth.json";
import enCommon from "./locales/en/common.json";
import enCustomers from "./locales/en/customers.json";
import enDashboard from "./locales/en/dashboard.json";
import enDrivers from "./locales/en/drivers.json";
import enErrors from "./locales/en/errors.json";
import enHistory from "./locales/en/history.json";
import enMonitoring from "./locales/en/monitoring.json";
import enNav from "./locales/en/nav.json";
import enReports from "./locales/en/reports.json";
import enRoutes from "./locales/en/routes.json";
import enVehicles from "./locales/en/vehicles.json";

import esAuth from "./locales/es/auth.json";
import esCommon from "./locales/es/common.json";
import esCustomers from "./locales/es/customers.json";
import esDashboard from "./locales/es/dashboard.json";
import esDrivers from "./locales/es/drivers.json";
import esErrors from "./locales/es/errors.json";
import esHistory from "./locales/es/history.json";
import esMonitoring from "./locales/es/monitoring.json";
import esNav from "./locales/es/nav.json";
import esReports from "./locales/es/reports.json";
import esRoutes from "./locales/es/routes.json";
import esVehicles from "./locales/es/vehicles.json";

export const SUPPORTED_LANGUAGES = ["es", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "fleetview.language";

const resources = {
  en: {
    auth: enAuth,
    common: enCommon,
    customers: enCustomers,
    dashboard: enDashboard,
    drivers: enDrivers,
    errors: enErrors,
    history: enHistory,
    monitoring: enMonitoring,
    nav: enNav,
    reports: enReports,
    routes: enRoutes,
    vehicles: enVehicles,
  },
  es: {
    auth: esAuth,
    common: esCommon,
    customers: esCustomers,
    dashboard: esDashboard,
    drivers: esDrivers,
    errors: esErrors,
    history: esHistory,
    monitoring: esMonitoring,
    nav: esNav,
    reports: esReports,
    routes: esRoutes,
    vehicles: esVehicles,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "es",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true,
    ns: Object.keys(resources.es),
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    returnNull: false,
  });

export default i18n;
