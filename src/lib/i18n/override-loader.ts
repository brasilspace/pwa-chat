// Override-Loader — Phase 3 der i18n-Architektur.
//
// Holt Override-Bundles vom Backend (GET /api/platform/v1/i18n/bundle)
// und mergt sie mit i18next.addResourceBundle in die laufende Instanz.
// Effekt: Strings, die das Prilog-Team im admin.prilog.chat (oder Schul-
// Admins in den Tenant-Settings) editiert hat, werden hier sichtbar —
// _ohne_ Page-Reload.
//
// Architektur-Auflösung (siehe i18n-konzept.md):
//
//   Build-Default (kommt mit dem JS-Bundle, immer da)
//   ──▶ Global-Override (tenantId=NULL, von Prilog-Team)
//       ──▶ Tenant-Override (tenantId=<eigener>, von Schul-Admin)
//
// Das Backend liefert in einem einzigen Bundle die _gemergte_ Sicht
// (Tenant ueberschreibt Global). Wir mergen das hier mit dem Build-
// Default zu der finalen Sicht.
//
// Caching:
//  - localStorage als Cache mit ETag — beim Boot sofort verfuegbar
//    (kein Flash-of-Default beim Render)
//  - Background-Polling alle 60s mit If-None-Match → 304 wenn nichts
//    neu ist → minimaler Traffic
//  - Bei Logout: Cache wird gepurged

import { i18n } from './index';

const POLL_INTERVAL_MS = 60_000;
const STORAGE_PREFIX = 'i18n:override:';

interface CachedBundle {
    etag: string;
    overrides: Record<string, unknown>;
    fetchedAt: number;
}

type GetJwtFn = () => string | null;

class OverrideLoader {
    private timer: ReturnType<typeof setInterval> | null = null;
    private getJwt: GetJwtFn = () => null;
    private apiBase = '';
    private locale = '';
    private namespaces: string[] = ['common'];
    private inFlight = new Map<string, Promise<void>>();

    /**
     * Startet das Polling. Vorhandene Cache-Bundles werden sofort
     * angewandt; im Hintergrund laufen frische Fetches.
     */
    start(opts: {
        getJwt: GetJwtFn;
        apiBase: string;
        locale: string;
        namespaces?: string[];
    }): void {
        this.stop();
        this.getJwt = opts.getJwt;
        this.apiBase = opts.apiBase.replace(/\/+$/, '');
        this.locale = opts.locale;
        this.namespaces = opts.namespaces ?? ['common'];

        // Schritt 1: sofort den localStorage-Cache anwenden
        for (const ns of this.namespaces) {
            const cached = this.loadFromCache(this.locale, ns);
            if (cached) {
                this.applyOverride(this.locale, ns, cached.overrides);
            }
        }

        // Schritt 2: erste Server-Runde anstossen
        void this.refreshAll();

        // Schritt 3: periodisches Polling
        this.timer = setInterval(() => {
            void this.refreshAll();
        }, POLL_INTERVAL_MS);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.inFlight.clear();
    }

    /** Wechselt die Locale ohne neu zu starten. Cache + erster Fetch erneut. */
    setLocale(locale: string): void {
        if (locale === this.locale) return;
        this.locale = locale;
        for (const ns of this.namespaces) {
            const cached = this.loadFromCache(locale, ns);
            if (cached) this.applyOverride(locale, ns, cached.overrides);
        }
        void this.refreshAll();
    }

    /** Cache + i18next-Bundle leeren (Logout). */
    purge(): void {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(STORAGE_PREFIX)) {
                localStorage.removeItem(key);
            }
        }
    }

    // ────────── intern ──────────

    private async refreshAll(): Promise<void> {
        if (!this.getJwt()) return;
        await Promise.all(this.namespaces.map((ns) => this.refreshOne(this.locale, ns)));
    }

    private async refreshOne(locale: string, namespace: string): Promise<void> {
        const key = `${locale}::${namespace}`;
        const running = this.inFlight.get(key);
        if (running) return running;

        const promise = this.doFetch(locale, namespace).finally(() => {
            this.inFlight.delete(key);
        });
        this.inFlight.set(key, promise);
        return promise;
    }

    private async doFetch(locale: string, namespace: string): Promise<void> {
        const jwt = this.getJwt();
        if (!jwt) return;

        const cached = this.loadFromCache(locale, namespace);
        const url = `${this.apiBase}/api/platform/v1/i18n/bundle?locale=${encodeURIComponent(locale)}&namespace=${encodeURIComponent(namespace)}`;

        const headers: Record<string, string> = {
            Authorization: `Bearer ${jwt}`,
        };
        if (cached?.etag) headers['If-None-Match'] = cached.etag;

        try {
            const res = await fetch(url, { headers, credentials: 'omit' });
            if (res.status === 304) return; // unverändert

            if (!res.status.toString().startsWith('2')) {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.warn(`[i18n-override] HTTP ${res.status} für ${locale}:${namespace}`);
                }
                return;
            }

            const etag = res.headers.get('ETag') ?? '';
            const body = (await res.json()) as { overrides?: Record<string, unknown> };
            const overrides = body.overrides ?? {};

            this.saveToCache(locale, namespace, { etag, overrides, fetchedAt: Date.now() });
            this.applyOverride(locale, namespace, overrides);
        } catch (e) {
            // Offline / Backend nicht erreichbar — Cache bleibt aktiv,
            // wir versuchen es einfach beim nächsten Tick wieder.
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.warn(`[i18n-override] fetch failed for ${locale}:${namespace}:`, e);
            }
        }
    }

    private applyOverride(locale: string, namespace: string, overrides: Record<string, unknown>): void {
        // deep=true: nested keys werden gemerged, nicht ueberschrieben
        // overwrite=true: Override schlaegt Default
        i18n.addResourceBundle(locale, namespace, overrides, true, true);
    }

    private loadFromCache(locale: string, namespace: string): CachedBundle | null {
        try {
            const raw = localStorage.getItem(`${STORAGE_PREFIX}${locale}:${namespace}`);
            if (!raw) return null;
            return JSON.parse(raw) as CachedBundle;
        } catch {
            return null;
        }
    }

    private saveToCache(locale: string, namespace: string, bundle: CachedBundle): void {
        try {
            localStorage.setItem(`${STORAGE_PREFIX}${locale}:${namespace}`, JSON.stringify(bundle));
        } catch {
            // QuotaExceeded oder localStorage disabled — egal, nur Cache
        }
    }
}

export const overrideLoader = new OverrideLoader();
