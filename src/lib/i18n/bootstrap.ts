// i18n-Bootstrap — verdrahtet i18next, Override-Loader und Session.
//
// Aufgerufen ein einziges Mal aus main.tsx nach `initI18n()`. Macht:
//  1. Subscribed auf den session-store: sobald ein Platform-JWT da ist,
//     startet der Override-Loader. Bei Logout wird er gestoppt + Cache
//     geleert.
//  2. Subscribed auf i18n.languageChanged: bei Sprach-Wechsel zieht
//     der Loader die Bundles für die neue Locale.
//
// Effekt: User sieht Build-Defaults sofort beim ersten Render, danach
// schiebt der Loader im Hintergrund Override-Edits aus dem Backend
// drüber — ohne Flash, ohne F5.

import { sessionStore } from '@/core/session/session-store';
import { i18n } from './index';
import { overrideLoader } from './override-loader';

const API_BASE = import.meta.env.VITE_PLATFORM_API_URL ?? 'https://api.prilog.chat';

// Welche Namespaces der Loader pullen soll. Wenn neue Namespaces
// dazukommen (z.B. 'dms', 'flow-designer'), hier eintragen.
const NAMESPACES = ['common'];

let started = false;

export function startI18nOverrides(): void {
    if (started) return;
    started = true;

    let lastToken: string | null = null;

    const getJwt = (): string | null => {
        const snap = sessionStore.getSnapshot();
        return snap.platform?.token ?? null;
    };

    const startOrRestart = (): void => {
        overrideLoader.start({
            getJwt,
            apiBase: API_BASE,
            locale: (i18n.language || 'de').split('-')[0],
            namespaces: NAMESPACES,
        });
    };

    // Session-Subscriber: Token-Wechsel triggert Start/Stop.
    sessionStore.subscribe(() => {
        const token = getJwt();
        if (token && token !== lastToken) {
            lastToken = token;
            startOrRestart();
        } else if (!token && lastToken) {
            lastToken = null;
            overrideLoader.stop();
            overrideLoader.purge();
        }
    });

    // Falls beim Boot bereits ein Token im sessionStore liegt
    // (Reload mit gespeichertem JWT), sofort starten.
    if (getJwt()) {
        lastToken = getJwt();
        startOrRestart();
    }

    // Sprach-Wechsel: Loader umschalten.
    i18n.on('languageChanged', (lng: string) => {
        overrideLoader.setLocale(lng.split('-')[0]);
    });
}
