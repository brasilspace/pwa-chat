// i18n-Foundation fuer Prilog Web-Client.
//
// Architektur (siehe prilog_docs/docs/umsetzung/i18n-konzept.md):
//
//   Build-Default (statisch, im Bundle)
//   ──▶ Global-Override (Postgres, via Admin)
//       ──▶ Tenant-Override (Postgres, pro Tenant)
//
// Hier in Phase 0 ist nur die Build-Default-Ebene implementiert.
// Phase 3 ergaenzt das Override-Loading aus dem Backend.
//
// Default-Sprache ist Deutsch — alle bestehenden Strings sind die
// Quelle der Wahrheit. Fremdsprachen wachsen Stueck fuer Stueck.

import i18n, { type Resource } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// Eager-Load aller Locale-JSONs via Vite-glob. In Phase 3 wechseln wir
// auf Lazy-Loading pro Namespace via i18next-resources-to-backend.
const localeFiles = import.meta.glob('../../locales/**/*.json', {
    eager: true,
    import: 'default',
}) as Record<string, unknown>;

// Pfad-Pattern: "../../locales/<locale>/<namespace>.json"
function buildResources(): Resource {
    const resources: Resource = {};
    for (const [path, content] of Object.entries(localeFiles)) {
        const match = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
        if (!match) continue;
        const [, locale, namespace] = match;
        if (!resources[locale]) resources[locale] = {};
        (resources[locale] as Record<string, unknown>)[namespace] = content;
    }
    return resources;
}

export const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'it', 'es', 'pl', 'nl'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'de';
export const FALLBACK_LOCALE: SupportedLocale = 'en';

let initPromise: Promise<typeof i18n> | null = null;

/**
 * Idempotenter Init — ruft beim ersten Aufruf i18n.init, danach
 * gibt die schon initialisierte Instanz zurueck. Vor `ReactDOM.render`
 * mit `await initI18n()` aufrufen.
 */
export function initI18n(): Promise<typeof i18n> {
    if (initPromise) return initPromise;

    // Pseudo-Locale als zusaetzliche Sprache aktivieren (nur im Dev/Test).
    // Wird nicht in den Settings-Auswahl-Listen angezeigt, aber via
    // ?lang=xx-pl aufrufbar.
    const supported = [...SUPPORTED_LOCALES, 'xx-pl'];

    initPromise = i18n
        .use(LanguageDetector)
        .use(initReactI18next)
        .init({
            resources: buildResources(),
            // CLDR-Plural-Regeln (i18next v23+ default; wir setzen es
            // explizit fuer Klarheit). Erlaubt `t('files', { count })`.
            compatibilityJSON: 'v4',
            fallbackLng: FALLBACK_LOCALE,
            supportedLngs: supported,
            // Beim Lookup: wenn `fr` keinen Treffer hat, schau in `en`,
            // dann `de` (Default-Sprache — der String existiert garantiert).
            nonExplicitSupportedLngs: true,
            defaultNS: 'common',
            ns: ['common'],
            interpolation: {
                // React entweicht ohnehin — keine doppelte Escape-Pass.
                escapeValue: false,
            },
            detection: {
                // Priorisierung: URL-Param ?lang=fr -> localStorage -> Cookie
                // -> Browser navigator.languages -> Default.
                order: ['querystring', 'localStorage', 'cookie', 'navigator'],
                lookupQuerystring: 'lang',
                lookupLocalStorage: 'prilog-locale',
                lookupCookie: 'prilog-locale',
                caches: ['localStorage'],
            },
            // Sprach-Bundles sind klein — kein React-Suspense noetig.
            react: {
                useSuspense: false,
            },
        })
        .then(async () => {
            // Pseudo-Locale-Bundle registrieren — passt die deutschen
            // Strings dynamisch an, wenn der User die Locale waehlt.
            const { registerPseudoLocale } = await import('./pseudo-locale');
            registerPseudoLocale();
            return i18n;
        });

    // Dev-Helfer: fehlende Keys in der Konsole loggen.
    if (import.meta.env.DEV) {
        i18n.on('missingKey', (lngs, namespace, key) => {
            // eslint-disable-next-line no-console
            console.warn(`[i18n] missing key: ${namespace}:${key} (lng=${lngs.join(',')})`);
        });
    }

    return initPromise;
}

export { i18n };
