/**
 * WebPushToggle
 *
 * Abonniert/de-abonniert Web-Push fuer diese Browser-Instanz. Speichert die
 * Subscription doppelt:
 *   1. Backend (POST /api/platform/v1/web-push/subscribe) — wir kennen das
 *      Geraet und koennen serverseitig auch Notifications schicken.
 *   2. Matrix-Pusher (PUT /_matrix/client/r0/pushers/set) — Synapse pusht
 *      automatisch an unseren Sygnal-Endpoint /api/webpush/notify bei jedem
 *      Matrix-Event, das fuer den User relevant ist (Notification Rules).
 *
 * Bei Unsubscribe: beide Seiten aufraeumen.
 */
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';

const VAPID_KEY_URL = '/api/platform/v1/web-push/public-key';
const PUSHER_APP_ID = 'chat.prilog.pwa';
const PUSHER_BASE = window.location.origin + '/api/webpush/notify';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    return navigator.serviceWorker.ready;
}

export function WebPushToggle(): JSX.Element | null {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const [supported, setSupported] = useState(true);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            setSupported(false);
            return;
        }
        setPermission(Notification.permission);
        (async () => {
            const reg = await getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            setSubscribed(!!sub);
        })();
    }, []);

    async function subscribe() {
        setBusy(true);
        setError(null);
        try {
            // 1. Permission
            if (permission !== 'granted') {
                const p = await Notification.requestPermission();
                setPermission(p);
                if (p !== 'granted') {
                    setError('Berechtigung verweigert.');
                    return;
                }
            }

            // 2. VAPID-Key
            const r = await fetch(VAPID_KEY_URL);
            if (!r.ok) throw new Error('VAPID-Key konnte nicht geladen werden.');
            const { publicKey } = await r.json() as { publicKey: string };

            // 3. SW-Registration + Browser-Subscription
            const reg = await getRegistration();
            if (!reg) throw new Error('Service Worker nicht aktiv.');
            // TS-Lib hat strikten ArrayBuffer-Typ — Cast auf BufferSource ist sicher.
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
            });

            const json = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
            if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
                throw new Error('Subscription unvollstaendig.');
            }

            // 4. Backend: speichern
            const token = session.platform?.token;
            await fetch('/api/platform/v1/web-push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }),
            });

            // 5. Matrix-Pusher registrieren (Sygnal-Gateway)
            // Synapse pusht ab jetzt automatisch an /api/webpush/notify.
            const matrixToken = session.matrix?.accessToken;
            if (matrixToken) {
                await fetch('/_matrix/client/r0/pushers/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${matrixToken}` },
                    body: JSON.stringify({
                        pushkey: json.endpoint,
                        kind: 'http',
                        app_id: PUSHER_APP_ID,
                        app_display_name: 'prilog Chat',
                        device_display_name: navigator.userAgent.slice(0, 60),
                        lang: 'de',
                        data: {
                            url: PUSHER_BASE,
                            format: 'event_id_only',
                        },
                        append: false,
                    }),
                }).catch((e) => {
                    // Wenn Pusher-Registration scheitert, ist das nicht
                    // tragisch — Backend kann immer noch direkt pushen.
                    console.warn('[push] matrix pusher set failed', e);
                });
            }

            setSubscribed(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    async function unsubscribe() {
        setBusy(true);
        setError(null);
        try {
            const reg = await getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            if (!sub) {
                setSubscribed(false);
                return;
            }
            const endpoint = sub.endpoint;
            await sub.unsubscribe();

            // Backend
            const token = session.platform?.token;
            await fetch('/api/platform/v1/web-push/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ endpoint }),
            }).catch(() => {});

            // Matrix-Pusher loeschen — kind:null = deregister
            const matrixToken = session.matrix?.accessToken;
            if (matrixToken) {
                await fetch('/_matrix/client/r0/pushers/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${matrixToken}` },
                    body: JSON.stringify({
                        pushkey: endpoint,
                        kind: null,
                        app_id: PUSHER_APP_ID,
                    }),
                }).catch(() => {});
            }
            setSubscribed(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    if (!supported) {
        return (
            <section className="rounded-lg border border-border p-4">
                <h2 className="mb-1 text-sm font-semibold">Benachrichtigungen</h2>
                <p className="text-xs text-muted-foreground">
                    Push-Benachrichtigungen werden in diesem Browser nicht unterstützt. Auf iPhone/iPad funktioniert das nur, wenn du prilog Chat <strong>vom Home-Bildschirm</strong> startest.
                </p>
            </section>
        );
    }

    return (
        <section className="rounded-lg border border-border p-4">
            <h2 className="mb-2 text-sm font-semibold">Benachrichtigungen</h2>
            {subscribed ? (
                <div className="space-y-2">
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        <MaterialIcon name="check_circle" size={12} className="-mt-0.5 mr-1 inline" />
                        Push-Benachrichtigungen sind aktiv. Du wirst auch bei geschlossenem Browser informiert.
                    </p>
                    <button
                        onClick={unsubscribe}
                        disabled={busy}
                        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                    >
                        Push abschalten
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Erhalte eine Mitteilung, wenn jemand dir schreibt — auch wenn der Browser geschlossen ist.
                    </p>
                    <button
                        onClick={subscribe}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <MaterialIcon name="notifications_active" size={14} />
                        {busy ? '…' : 'Benachrichtigungen einschalten'}
                    </button>
                    {permission === 'denied' && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300">
                            Du hast Benachrichtigungen früher abgelehnt. Aktiviere sie in den Browser-Einstellungen für diese Seite.
                        </p>
                    )}
                </div>
            )}
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </section>
    );
}
