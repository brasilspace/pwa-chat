// useT — Wrapper-Hook um useTranslation aus react-i18next.
//
// Warum eigener Wrapper:
//  - Eine Stelle fuer kuenftige Erweiterungen (Override-Merge,
//    Tenant-Strings, Telemetry fuer fehlende Keys).
//  - Type-Safety: t() liefert immer string (kein TFunctionReturn-Mix).
//  - Default-Namespace ist 'common' — explizit fuer Klarheit.
//
// Benutzung:
//   const t = useT();          // common-Namespace
//   const t = useT('dms');     // dms-Namespace
//   <h1>{t('settings.profile.title')}</h1>
//   <p>{t('files.count', { count: 5 })}</p>

import { useTranslation } from 'react-i18next';

export function useT(namespace?: string) {
    const { t } = useTranslation(namespace ?? 'common');
    return (key: string, options?: Record<string, unknown>): string => {
        const result = t(key, options as never);
        return typeof result === 'string' ? result : String(result);
    };
}

/**
 * Aktive Sprache als BCP-47-Locale (z.B. 'de', 'en', 'fr-CA').
 * Fuer Intl.NumberFormat / Intl.DateTimeFormat.
 */
export function useLocale(): string {
    const { i18n } = useTranslation();
    return i18n.language || 'de';
}

/**
 * Sprach-Umschaltung. Persistiert via localStorage (siehe i18n/index.ts).
 */
export function useChangeLocale() {
    const { i18n } = useTranslation();
    return (locale: string) => i18n.changeLanguage(locale);
}
