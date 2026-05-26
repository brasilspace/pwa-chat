/// <reference lib="webworker" />
/**
 * Eigener Service-Worker (vite-plugin-pwa injectManifest-Strategie).
 *
 * Verantwortlich fuer:
 *   - Precache der Build-Assets (precacheAndRoute aus dem Manifest)
 *   - Runtime-Caching: Matrix-Media (CacheFirst), API/Matrix (NetworkOnly)
 *   - PWA share_target: POST /mein-fach/share-receive faengt File ab,
 *     legt es in IndexedDB ab und redirected zur React-Seite, die die
 *     Datei aus IDB liest und in's Mein Fach hochlaedt.
 *
 * Hintergrund: bei generateSW kann Workbox keinen POST-Navigation-Body
 * konservieren. Mit eigenem SW haben wir volle Kontrolle.
 */

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

// ─── Standard-Verhalten: skipWaiting + clientsClaim ─────────────────────────
self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', () => { void self.clients.claim(); });

// ─── Precache (von vite-plugin-pwa injiziert) ───────────────────────────────
precacheAndRoute(self.__WB_MANIFEST);

// ─── Matrix-Media: CacheFirst, mxc-IDs sind immutable ───────────────────────
registerRoute(
  ({ url }) => /\/_matrix\/client\/v1\/media\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'matrix-media',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  }),
);

// ─── /_matrix und /api: niemals cachen, immer Network ───────────────────────
registerRoute(({ url }) => /\/_matrix\//.test(url.pathname), new NetworkOnly());
registerRoute(({ url }) => /\/api\//.test(url.pathname), new NetworkOnly());

// ─── PWA Share-Target Bridge ────────────────────────────────────────────────
// Android System-Share → Prilog feuert POST mit multipart/form-data an
// /mein-fach/share-receive. Wir extrahieren das File, legen es in IDB,
// redirecten dann zur React-Seite (GET) die das File aus IDB konsumiert.
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST') return;
  if (url.pathname !== '/mein-fach/share-receive') return;

  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const files = form.getAll('files') as File[];
      const text = (form.get('text') as string | null) ?? '';
      const title = (form.get('title') as string | null) ?? '';

      const file = files.find((f) => f instanceof File && f.size > 0);
      if (file) {
        await putShared(file);
      } else if (text || title) {
        // Falls reiner Text/URL geteilt wird — speichern wir als .txt
        const txt = [title, text].filter(Boolean).join('\n');
        const synth = new File([txt], `geteilt-${Date.now()}.txt`, { type: 'text/plain' });
        await putShared(synth);
      }
      // 303 → Browser macht GET auf die React-Seite, die liest aus IDB
      return Response.redirect('/mein-fach/share-receive', 303);
    } catch (err) {
      // Bei Fehler trotzdem auf die Seite redirecten — sie zeigt dann "no-file"
      return Response.redirect('/mein-fach/share-receive', 303);
    }
  })());
});

// ─── SPA-Navigation-Fallback: alle Navigationen ohne Treffer → index.html ──
// (NavigationRoute wuerde alle Sub-Pfade auf index.html mappen — nicht noetig
// wenn der Server bereits SPA-Fallback macht. nginx-Setup hat das schon, daher
// kann der SW hier weg. /api und /_matrix bleiben durch Routes oben gefuehrt.)

// ─── IndexedDB Helper (gleiche DB wie share-receive.tsx) ────────────────────
const DB_NAME = 'prilog-share';
const STORE = 'pending';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putShared(file: File): Promise<void> {
  return openIdb().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, 'latest');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}


// ───── Web-Push (pwa-chat) ─────────────────────────────────────────
//
// Synapse pusht via Sygnal an /api/webpush/notify, von dort wird Web-Push
// rausgeschickt. Hier landet dann der `push`-Event im Service Worker.
// Payload kommt vom Backend mit { title, body, url, tag }.
self.addEventListener('push', (event) => {
    const e = event as PushEvent;
    let data: { title?: string; body?: string; url?: string; tag?: string } = {};
    try { data = (e.data?.json() as typeof data) ?? {}; }
    catch { data = { title: 'prilog Chat', body: 'Neue Nachricht' }; }

    const title = data.title ?? 'prilog Chat';
    const options: NotificationOptions = {
        body: data.body ?? 'Neue Nachricht',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: data.tag ?? 'chat',
        data: { url: data.url ?? '/' },
        // requireInteraction false: Banner verschwindet nach kurzer Zeit von alleine
    };

    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    const e = event as NotificationEvent;
    e.notification.close();
    const url = (e.notification.data as { url?: string })?.url ?? '/';
    e.waitUntil((async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // Wenn schon ein Tab offen: dort hin navigieren & fokussieren
        for (const c of clients) {
            if ('focus' in c) {
                await (c as WindowClient).focus();
                if ('navigate' in c) {
                    try { await (c as WindowClient).navigate(url); } catch { /* ignore */ }
                }
                return;
            }
        }
        await self.clients.openWindow(url);
    })());
});
