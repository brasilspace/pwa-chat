import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { initI18n } from './lib/i18n';
import { startI18nOverrides } from './lib/i18n/bootstrap';
import { initInContextEdit } from './lib/i18n/in-context-edit';
import './styles.css';

// Service Worker registrieren fuer PWA-Install + Offline-Asset-Cache.
// vite-plugin-pwa erzeugt den SW beim Build, im Dev-Mode ist er deaktiviert
// (devOptions: { enabled: false } in vite.config.ts).
//
// Auto-Update-Strategie: sobald der SW eine neue Version sieht, aktivieren
// wir sie sofort (skipWaiting + clientsClaim in workbox), und in onNeedRefresh
// rufen wir updateSW(true) — das laedt den Tab automatisch neu mit dem neuen
// Bundle. Endbenutzer sollen nie einen Reload-Knopf druecken muessen.
//
// Period 60s: zusaetzlicher periodischer Check, falls die App lange offen ist
// (PWA Standalone-Mode auf dem Handy). Sonst wuerde der SW erst beim naechsten
// Navigations-Event nach Updates suchen, was bei Dauer-Chat-Sessions selten ist.
const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
        // Neue Version ist installiert + bereit. Sofort aktivieren + reload.
        // updateSW(true) ruft skipWaiting auf dem wartenden SW + reload des
        // aktuellen Tabs. Da clientsClaim true ist, uebernimmt der neue SW
        // sofort die Kontrolle.
        updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
        // Alle 60s nach Updates suchen. Ohne diesen Loop wuerde der SW nur
        // bei Navigation oder Tab-Reaktivierung pruefen — bei Dauer-Sessions
        // bekaeme der User Tage spaet erst neue Versionen.
        if (registration) {
            setInterval(() => {
                registration.update().catch(() => { /* offline ist ok */ });
            }, 60_000);
        }
    },
});

// i18n vor dem ersten Render initialisieren, damit der erste Paint
// bereits die richtige Sprache zeigt (sonst Flash-of-DE auf en/fr-Boxen).
initI18n().finally(() => {
    // Override-Loader an die Session binden — sobald ein Platform-JWT
    // vorhanden ist, pollt er das Backend nach Override-Updates.
    startI18nOverrides();
    // In-Context-Edit-Mode (?i18n-edit=1) — zeigt Stift-Overlays
    // bei jedem t()-Resultat zum direkten Editieren im Admin.
    initInContextEdit();
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    );
});