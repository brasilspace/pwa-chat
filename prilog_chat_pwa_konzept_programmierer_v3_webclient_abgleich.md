# prilog Chat-App / Chat-PWA  
## Präzisiertes Umsetzungskonzept nach Analyse von Backend-API und Web-Client

**Projekt:** prilog  
**Ziel:** schnell eine Android-/iPhone-nutzbare Chat-App als PWA bereitstellen  
**Basis:** vorhandener `prilog-web-client` + vorhandenes Backend  
**Stand:** 27. Mai 2026  
**Zielgruppe:** Programmierer / Product Owner / DevOps / QA  
**Analysegrundlage:**  
- Backend-ZIP: `prilog-backend-api-main (5).zip`  
- Web-Client-ZIP: `prilog-web-client-main (5).zip`

---

## 1. Kurzentscheidung

Nach Analyse der eigentlichen Web-App ist die schnellste und sauberste Lösung:

```text
Nicht neu bauen.
Den vorhandenen prilog-web-client als Chat-only-Variante verwenden.
```

Die vorhandene App enthält bereits fast alles, was für die schnelle Chat-App gebraucht wird:

- React + Vite
- PWA-Setup mit `vite-plugin-pwa`
- eigener Service Worker
- Manifest und Icons
- Login gegen das prilog-Backend
- Matrix/Synapse-Chat ohne `matrix-js-sdk`
- eigener Matrix-Gateway
- eigener Chat-Store
- IndexedDB-Cache
- Chat-Komponenten
- Messenger-Layout für Eltern/Schüler
- Datei-/Medienanhänge über DMS
- Reaktionen
- Threads
- Lesestatus
- Infotafel-Modus
- Mobile Layouts
- iOS-Safe-Area-Handling

Die neue App sollte daher technisch eine **Chat-only-Variante des bestehenden Web-Clients** werden.

---

## 2. Wichtigste Erkenntnis aus dem Web-Client

Der Web-Client hat bereits eine vereinfachte Messenger-Oberfläche:

```text
src/features/messenger/messenger-shell.tsx
```

Diese Oberfläche ist sehr nah an dem, was für eine schnelle Chat-App gebraucht wird.

Sie bietet:

```text
Space-Liste
→ Chat öffnen
→ Vollbild-Chat
→ Einstellungen
→ Logout
```

Aber: Sie ist noch nicht sauber als eigenständige Chat-App fertig.

---

## 3. Kritischer Punkt: Chat-Runtime hängt aktuell im falschen Layout

Der wichtigste technische Befund:

```text
Der Matrix-Sync und die IndexedDB-Initialisierung starten aktuell in ShellLayout.
```

Datei:

```text
src/features/shell/shell-layout.tsx
```

Dort werden gestartet:

```ts
openChatDb(userId)
startSync()
stopSync()
closeChatDb()
```

Problem:

```text
MessengerShell wird in App.tsx direkt gerendert und umgeht ShellLayout.
```

Datei:

```text
src/app/App.tsx
```

Aktuell:

```tsx
function AuthenticatedApp(): JSX.Element {
    const isMessenger = useMessengerMode();

    if (isMessenger) {
        return <MessengerShell />;
    }

    return (
        <Routes>
            <Route path="/" element={<ShellLayout />}>
                ...
            </Route>
        </Routes>
    );
}
```

Das bedeutet für eine Chat-only-App:

```text
Wenn wir einfach MessengerShell verwenden, kann die Chat-Synchronisation fehlen oder unzuverlässig sein.
```

### Pflichtänderung

Die Chat-Runtime muss aus `ShellLayout` herausgezogen werden.

Neuer Baustein:

```text
src/features/chat/chat-runtime-provider.tsx
```

Vorschlag:

```tsx
import { type ReactNode, useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { openChatDb, closeChatDb } from '@/features/chat/chat-db';
import { startSync, stopSync } from '@/features/chat/chat-sync';

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);

    useEffect(() => {
        const userId = session.matrix?.userId;
        if (!userId) return;

        startSync();

        void Promise.race([
            openChatDb(userId),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('IndexedDB timeout')), 3000),
            ),
        ]).catch(() => {
            console.warn('[CHAT] IndexedDB open failed/timed out, running without cache');
        });

        return () => {
            stopSync();
            closeChatDb();
        };
    }, [session.matrix?.userId]);

    return <>{children}</>;
}
```

Danach:

```tsx
<ChatRuntimeProvider>
    <MessengerShell />
</ChatRuntimeProvider>
```

und auch:

```tsx
<ChatRuntimeProvider>
    <ShellLayout />
</ChatRuntimeProvider>
```

Damit läuft der Chat unabhängig davon, ob die normale Workspace-App oder die Chat-only-App gerendert wird.

---

## 4. Nicht neu implementieren

Diese Teile sind bereits vorhanden und sollten wiederverwendet werden.

### Chat-Core

```text
src/features/chat/chat-store.ts
src/features/chat/chat-sync.ts
src/features/chat/chat-db.ts
src/features/chat/use-chat-room.ts
src/features/chat/use-mark-room-as-read.ts
src/gateways/matrix/matrix-gateway.ts
src/gateways/matrix/matrix-types.ts
```

### Chat-UI

```text
src/features/modules/chat-module.tsx
src/features/modules/dm-chat.tsx
src/components/chat/chat-composer.tsx
src/components/chat/chat-bubble.tsx
src/components/chat/chat-thread-panel.tsx
src/components/chat/share-dialog.tsx
src/components/chat/use-voice-recorder.ts
```

### Messenger-UI

```text
src/features/messenger/messenger-shell.tsx
src/features/messenger/use-messenger-mode.ts
src/features/messenger/post-card.tsx
```

### PWA

```text
vite.config.ts
src/sw.ts
public/pwa-192x192.png
public/pwa-512x512.png
public/pwa-maskable-512x512.png
public/apple-touch-icon.png
index.html
```

---

## 5. Empfohlene Architektur der Chat-only-App

```text
Chat-only PWA
├── Login
├── ChatRuntimeProvider
├── ChatOnlyShell
│   ├── Chatliste
│   ├── Chatansicht
│   ├── Installationshinweis
│   └── minimale Einstellungen
├── Matrix/Synapse für Nachrichten
└── prilog API für Auth, Bootstrap, Spaces, Rechte, DMS, Lesestatus
```

---

## 6. Beste Strategie: App-Variante statt neues Repository

Empfohlen:

```text
Ein Repository
zwei Build-Varianten
```

### Variante 1: Vollständiger Web-Client

```text
VITE_APP_VARIANT=full
```

### Variante 2: Chat-only-App

```text
VITE_APP_VARIANT=chat
```

Neue `.env.chat`:

```env
VITE_APP_VARIANT=chat
VITE_APP_NAME=prilog Chat
VITE_PLATFORM_BASE_URL=/api
VITE_MATRIX_BASE_URL=/_matrix
VITE_CHAT_SHOW_ABSENCE=false
VITE_CHAT_SHOW_POSTS=false
```

---

## 7. Env-Konfiguration erweitern

Datei:

```text
src/core/config/env.ts
```

Ergänzen:

```ts
export const env = {
    platformBaseUrl: required(import.meta.env.VITE_PLATFORM_BASE_URL, 'VITE_PLATFORM_BASE_URL'),
    matrixBaseUrl: resolveMatrixBaseUrl(),
    appName: import.meta.env.VITE_APP_NAME ?? 'prilog',
    appVariant: import.meta.env.VITE_APP_VARIANT ?? 'full',
    chatShowAbsence: import.meta.env.VITE_CHAT_SHOW_ABSENCE === 'true',
    chatShowPosts: import.meta.env.VITE_CHAT_SHOW_POSTS === 'true',
    isDev: import.meta.env.DEV,
} as const;
```

---

## 8. App.tsx anpassen

Datei:

```text
src/app/App.tsx
```

Ziel:

```text
Wenn VITE_APP_VARIANT=chat, immer Chat-only-Shell anzeigen.
```

Beispiel:

```tsx
import { env } from '@/core/config/env';
import { ChatRuntimeProvider } from '@/features/chat/chat-runtime-provider';
import { ChatOnlyShell } from '@/features/chat-only/chat-only-shell';

function AuthenticatedApp(): JSX.Element {
    const isMessenger = useMessengerMode();
    const isChatOnly = env.appVariant === 'chat';

    if (isChatOnly) {
        return (
            <ChatRuntimeProvider>
                <ChatOnlyShell />
            </ChatRuntimeProvider>
        );
    }

    if (isMessenger) {
        return (
            <ChatRuntimeProvider>
                <MessengerShell />
            </ChatRuntimeProvider>
        );
    }

    return (
        <ChatRuntimeProvider>
            <Routes>
                <Route path="/" element={<ShellLayout />}>
                    ...
                </Route>
            </Routes>
        </ChatRuntimeProvider>
    );
}
```

Danach die alte Chat-Runtime-Logik aus `ShellLayout` entfernen, damit der Sync nicht doppelt startet.

---

## 9. Neue ChatOnlyShell statt MessengerShell direkt verwenden

Die vorhandene `MessengerShell` ist gut, enthält aber Dinge, die für „nur Chat“ nicht unbedingt passen:

- Abwesenheit melden
- volle Settings-Seite
- PostCards für Briefe/Umfragen
- teilweise noch kein Unread/Last-Message in der Liste

Daher besser:

```text
src/features/chat-only/chat-only-shell.tsx
```

Diese kann viel Code aus `MessengerShell` übernehmen, aber konsequent reduziert werden.

### Routen

```tsx
<Routes>
    <Route index element={<ChatSpaceList />} />
    <Route path="spaces/:spaceId/*" element={<ChatOnlyChat />} />
    <Route path="settings" element={<ChatOnlySettings />} />
    <Route path="install" element={<InstallPwaPage />} />
    <Route path="offline" element={<OfflinePage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

---

## 10. Chatliste verbessern

Die vorhandene `MessengerSpaceList` zeigt aktuell im Wesentlichen:

- Space-Name
- Beschreibung
- Avatar/Initial

Für eine Messenger-App braucht sie zusätzlich:

- letzte Nachricht
- Zeitpunkt
- ungelesene Nachrichten
- Infotafel-Marker
- deaktivierte Chats ausblenden

### Filterregel

Aus `useSpaces()` kommen `SpaceItem`s mit:

```text
matrixRoomId
matrixChatRoomId
mode
memberCount
color
name
description
```

Empfohlene Filterung:

```ts
function getChatRoomId(space: SpaceItem): string | null {
    return space.matrixChatRoomId ?? space.matrixRoomId ?? null;
}

const chatSpaces = spaces.filter((space) => {
    const roomId = getChatRoomId(space);
    return Boolean(roomId) && space.mode !== 'DISABLED';
});
```

Falls Backend künftig `chatEnabled` liefert:

```ts
return Boolean(roomId) && space.chatEnabled !== false && space.mode !== 'DISABLED';
```

### Last Message / Unread

```tsx
const chatSnapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);

const roomId = getChatRoomId(space);
const room = roomId ? chatSnapshot.rooms.get(roomId) : null;
const mainMessages = (room?.messages ?? []).filter(m => !m.threadId && !m.isTranscriptReply);
const last = mainMessages.at(-1);
const unread = room?.unreadCount ?? 0;
```

Anzeige:

```text
Klasse 5a Eltern                3
Neue Nachricht in prilog
09:14
```

Aus Datenschutzsicht sollte optional nicht der Inhalt angezeigt werden:

```text
Neue Nachricht in prilog
```

statt:

```text
Frau Müller: Ihr Kind hat ...
```

Konfigurationsvorschlag:

```env
VITE_CHAT_PREVIEW_MODE=neutral
```

Mögliche Werte:

```text
neutral
sender_only
message_preview
```

Für Schulen empfehlenswert:

```text
neutral
```

---

## 11. Chatansicht wiederverwenden

Die bestehende Chatansicht ist:

```text
src/features/modules/chat-module.tsx
```

Sie kann im Chat-only-Modus mit `compact` verwendet werden:

```tsx
<ChatModule compact />
```

Das vorhandene Verhalten:

- Vollbild-Chat
- mobile Header
- zurück zur Liste
- Chatblasen
- Composer
- Typing
- Lesestatus
- Infotafel-Hinweis
- PostCards im Messenger-Modus

Für eine reine Chat-App sollte `compact` weiter genutzt werden, aber PostCards optional deaktivieren.

### PostCards optional machen

In `chat-module.tsx` aktuell:

```ts
const [compactPosts, setCompactPosts] = useState<any[]>([]);
```

Empfehlung:

```ts
const postsEnabled = env.chatShowPosts;
```

und dann:

```ts
useEffect(() => {
    if (!compact || !postsEnabled || !spaceId || !session.platform?.token) return;
    ...
}, [compact, postsEnabled, spaceId, session.platform?.token]);
```

Für „nur Chat“:

```env
VITE_CHAT_SHOW_POSTS=false
```

---

## 12. Schreibrechte sauber prüfen

Aktuell prüft `ChatModule` im Wesentlichen:

```ts
const isInfotafel = space?.mode === 'INFOTAFEL';
const canBroadcast = session.permissions?.canBroadcast ?? false;
const canSendInThisSpace = !isInfotafel || canBroadcast;
```

Das reicht für die UI nicht vollständig.

Es gibt bereits Space-Permissions:

```text
message:create
message:read
file:upload
```

Dateien:

```text
src/core/permissions/use-space-permissions.ts
src/core/permissions/permission-context.tsx
```

Empfehlung:

```ts
import { useSpaceCan } from '@/core/permissions';

const canCreateMessage = useSpaceCan(spaceId, 'message:create');
const canUploadFile = useSpaceCan(spaceId, 'file:upload');

const canSendInThisSpace =
    canCreateMessage === true &&
    (!isInfotafel || canBroadcast);
```

Composer nur anzeigen, wenn:

```ts
canSendInThisSpace === true
```

Anhang-Button nur aktivieren, wenn:

```ts
canUploadFile === true
```

Wichtig:

```text
Die Matrix-/Backend-Rechte müssen serverseitig weiterhin erzwingen.
Die UI-Prüfung ist nur Komfort und Fehlervermeidung.
```

---

## 13. Domain-Strategie: sehr wichtig

Der aktuelle Web-Client nimmt beim Login:

```ts
server: window.location.hostname
```

Datei:

```text
src/features/auth/components/login-form.tsx
```

Außerdem ist in `.env.production` gesetzt:

```env
VITE_PLATFORM_BASE_URL=/api
VITE_MATRIX_BASE_URL=/_matrix
```

Das bedeutet:

```text
Der Client ist aktuell für tenantbezogene Domains gebaut.
```

Beispiel:

```text
https://test-schule.prilog.team
```

Dort zeigt:

```text
/api      → prilog Backend
/_matrix  → Matrix/Synapse des Tenants
```

### Schnellste Lösung

Für den schnellen Start:

```text
Chat-PWA auf derselben Tenant-Domain ausliefern.
```

Beispiele:

```text
https://test-schule.prilog.team
https://test-schule.prilog.team/chat
```

oder als Variante:

```text
https://test-schule.prilog.team/app/chat
```

Dann funktionieren diese Annahmen weiter:

```text
window.location.hostname = Tenant
/api = Backend
/_matrix = richtiger Matrix-Homeserver
```

### Nicht sofort empfehlenswert

```text
https://chat.prilog.team
```

Das wäre eine zentrale Domain. Dafür müsste man umbauen:

1. Tenant-/Schulkennung im Login abfragen.
2. Matrix-Base-URL dynamisch aus `loginResponse.homeserver` ableiten.
3. `matrix-gateway.ts` dürfte nicht mehr nur `env.matrixBaseUrl` verwenden.
4. Relative Fetches auf `/_matrix` müssten ersetzt werden.
5. CORS für Matrix und API muss sauber konfiguriert sein.

### Falls zentrale Domain gewünscht ist

Dann braucht `matrix-gateway.ts` eine dynamische Base-URL.

Beispiel:

```ts
function getMatrixBaseUrl(): string {
    const session = sessionStore.getSnapshot();
    const homeserver = session.matrix?.homeserver;

    if (homeserver && homeserver !== window.location.hostname) {
        return `https://${homeserver}/_matrix`;
    }

    return env.matrixBaseUrl;
}
```

Dann überall statt:

```ts
env.matrixBaseUrl
```

verwenden:

```ts
getMatrixBaseUrl()
```

Zusätzlich müssen direkte Fetches wie:

```ts
fetch(`/_matrix/client/v3/rooms/...`)
```

umgestellt werden.

---

## 14. Direkte Fetches vereinheitlichen

Im Chat-Code gibt es noch direkte relative Fetches:

```text
src/features/chat/use-chat-room.ts
```

Beispiele:

```ts
fetch(`/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${txnId}`)
fetch(`/_matrix/client/v3/rooms/${roomId}/send/m.reaction/${txnId}`)
```

Für Tenant-Domain mit Proxy ist das okay.

Für zentrale Chat-Domain ist das nicht okay.

Empfehlung:

```text
Alle Matrix-Aufrufe über matrixGateway laufen lassen.
```

Ergänzen in `matrix-gateway.ts`:

```ts
sendRawMessageEvent(...)
sendReaction(...)
```

Oder die bestehenden Fetches so umbauen, dass sie `env.matrixBaseUrl` bzw. `getMatrixBaseUrl()` verwenden.

Auch relative API-Fetches im Messenger-/Chatbereich prüfen:

```text
src/components/chat/chat-composer.tsx
src/features/modules/chat-module.tsx
src/features/messenger/post-card.tsx
src/features/messenger/messenger-shell.tsx
```

Für Chat-only sollten sie entweder:

```text
a) über gleichen Origin /api laufen
```

oder:

```text
b) konsequent env.platformBaseUrl verwenden
```

---

## 15. Session / Refresh Token

Aktuell ruft `auth-service.ts` den Login so auf:

```ts
issueRefreshToken: false
```

Das ist für eine normale Websession akzeptabel, aber für eine installierbare Chat-App schlecht.

Für eine Messenger-App erwarten Nutzer:

```text
einmal anmelden
lange angemeldet bleiben
bei Tokenablauf automatisch erneuern
```

### Pflicht für PWA-Version 1

Ändern auf:

```ts
issueRefreshToken: true
```

Dann Refresh-Flow im Frontend implementieren:

```http
POST /api/auth/v1/refresh
```

TokenStore erweitern:

```text
matrix session
platform access token
platform expiresAt
refresh token
refresh expiresAt
```

### Bessere Zielvariante

Für Browser-PWA sicherer:

```text
Refresh Token als HttpOnly Secure SameSite Cookie
Access Token kurzlebig im Speicher
Matrix Access Token sauber erneuern
```

Das braucht Backend-Unterstützung, ist aber langfristig besser.

### Minimal für schnellen Start

```text
issueRefreshToken=true
Refresh Token speichern
bei App-Start /api/auth/v1/refresh versuchen
bei Fehlschlag Login anzeigen
```

---

## 16. IndexedDB / Cache

Vorhanden:

```text
src/features/chat/chat-db.ts
```

DB:

```text
prilog-chat-{userId}
```

Stores:

```text
messages
rooms
syncState
```

Wichtig:

Die Dokumentation `docs/chat-architektur.md` beschreibt eine DB-Hydration mit gespeicherten Sync-Tokens.

Im aktuellen Code ist `hydrateFromDb()` aber nicht aktiv verwendet.

`chat-sync.ts` startet aktuell mit:

```ts
sinceToken = null;
```

Das bedeutet:

```text
Bei jedem Reload startet ein Initial-Sync.
```

Für den Schnellstart ist das in Ordnung.

Für viele Räume / viele Nutzer sollte man später wieder nutzen:

```ts
const since = await chatStore.hydrateFromDb();
startSync(since);
```

Dafür müsste `startSync()` einen optionalen Parameter erhalten:

```ts
export async function startSync(initialSinceToken?: string | null) {
    if (running) return;
    running = true;
    sinceToken = initialSinceToken ?? null;
    chatStore.setSyncState('initial');
    syncLoop();
}
```

Empfehlung:

```text
MVP: bestehendes Verhalten übernehmen.
Version 1.1: DB-Hydration wieder aktivieren.
```

---

## 17. PWA ist bereits vorbereitet

Vorhanden:

```text
vite-plugin-pwa
injectManifest
src/sw.ts
public/pwa-icons
index.html mit iOS-Meta-Tags
```

Das ist gut.

Für Chat-only muss aber das Manifest angepasst werden.

Aktuell:

```text
name: Prilog
description: Schul-Plattform: Chat, Kalender, Aufgaben, Krisenmanagement
start_url: /
share_target: /mein-fach/share-receive
```

Für Chat-only:

```text
name: prilog Chat
short_name: prilog Chat
description: Sicherer Schulchat
start_url: /
scope: /
display: standalone
orientation: portrait
```

`share_target` kann für den ersten Chat-MVP entfernt werden, außer Dateien sollen direkt in den Chat geteilt werden.

### Variante in `vite.config.ts`

```ts
const APP_VARIANT = process.env.VITE_APP_VARIANT ?? 'full';
const isChatApp = APP_VARIANT === 'chat';
```

Dann im Manifest:

```ts
manifest: {
    name: isChatApp ? 'prilog Chat' : 'prilog',
    short_name: isChatApp ? 'Chat' : 'prilog',
    description: isChatApp
        ? 'Sicherer Schulchat'
        : 'Schul-Plattform: Chat, Kalender, Aufgaben, Krisenmanagement',
    start_url: '/',
    ...
    ...(isChatApp ? {} : { share_target: ... }),
}
```

---

## 18. Service Worker: Push fehlt noch

Der vorhandene Service Worker macht:

```text
Precache
Matrix-Media Cache
NetworkOnly für /api und /_matrix
Share Target
```

Datei:

```text
src/sw.ts
```

Noch nicht vorhanden:

```text
push event
notificationclick event
web-push subscription
badge handling
```

Für PWA-Push braucht es:

### Frontend

```ts
const registration = await navigator.serviceWorker.ready;

const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
});
```

### Backend-Endpunkte neu

```http
POST /api/platform/v1/web-push/subscribe
POST /api/platform/v1/web-push/unsubscribe
GET  /api/platform/v1/web-push/status
```

### Service Worker ergänzen

```ts
self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {};
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'Neue Nachricht in prilog', {
            body: data.body ?? 'Öffnen Sie prilog Chat, um die Nachricht zu lesen.',
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            data: data.data ?? {},
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/';
    event.waitUntil(self.clients.openWindow(url));
});
```

### Datenschutzregel

Push-Payload neutral halten:

```text
Neue Nachricht in prilog
```

Nicht:

```text
Frau Müller: Ihr Kind hat ...
```

---

## 19. Push-Strategie realistisch entscheiden

Backend-Analyse ergab:

```text
Die iOS/Android-Geräte-Registry existiert.
APNs/FCM-Versand ist vorbereitet, aber im Code noch Stub.
PWA-Web-Push existiert noch nicht.
```

Deshalb gibt es zwei realistische Wege.

### Weg A: schneller MVP ohne Push

```text
Chat-App funktioniert, wenn geöffnet.
Push kommt in Version 1.1.
```

Vorteil:

- sehr schnell
- wenig Backend-Arbeit
- geringes Risiko

Nachteil:

- kein echter Messenger-Komfort

### Weg B: MVP mit Web Push

Zusätzlich bauen:

- WebPushSubscription-Modell
- VAPID-Konfiguration
- Push-Subscribe-API
- Service-Worker-Push-Event
- Matrix-Event-Bridge oder Push-Gateway
- Datenschutzneutrale Payloads

Vorteil:

- App wirkt wirklich wie Messenger

Nachteil:

- deutlich mehr Aufwand
- iOS benötigt installierte Home-Screen-PWA

### Empfehlung

Für „auf die schnelle“:

```text
Version 1 ohne Push veröffentlichen, aber die UI schon vorbereiten.
Version 1.1 Web Push.
Version 2 optional Capacitor + native Push.
```

Wenn Push zwingend ist:

```text
Nicht nur Frontend bauen. Push braucht Backend + Matrix-Event-Pfad.
```

---

## 20. iPhone / iOS

Auf iOS gilt:

```text
Web Push funktioniert nur für installierte Home-Screen-Web-Apps.
```

Daher braucht die Chat-only-App eine Installationsseite:

```text
/install
```

Inhalt:

```text
1. Teilen-Symbol antippen
2. „Zum Home-Bildschirm“ wählen
3. prilog Chat öffnen
4. Benachrichtigungen erlauben
```

Wichtig:

```text
Push-Berechtigung nicht sofort beim ersten Seitenaufruf abfragen.
Erst erklären, dann fragen.
```

---

## 21. Einstellungen für Chat-only

Die vorhandene Settings-Seite ist zu groß.

Für Chat-only besser:

```text
src/features/chat-only/chat-only-settings.tsx
```

Minimal:

```text
Benutzername / Schule
Benachrichtigungen
App installieren
Chat-Design
Chat-Cache zurücksetzen
Abmelden
Datenschutz / Impressum
```

Nicht in Chat-only:

```text
Benutzerverwaltung
Rechnungen
Module
AV-Vertrag
DMS-Einstellungen
Drucker
Server-Info
```

---

## 22. Dateianhänge

Der vorhandene Chat kann Dateien senden.

Wichtig: Anhänge gehen nicht direkt ins Matrix-Media-Repo, sondern über DMS.

Datei:

```text
src/features/chat/dms-chat-upload.ts
```

Flow:

```text
1. POST /platform/v1/spaces/:spaceId/documents/upload
2. PUT zur presigned S3 URL
3. POST /platform/v1/spaces/:spaceId/documents/confirm-upload
4. Matrix-Nachricht mit pseudo-mxc:
   mxc://__prilog__/<documentId>
```

Das ist gut und sollte für Chat-only übernommen werden.

### Für MVP entscheiden

Option:

```text
Version 1: nur Textnachrichten
Version 1.1: Anhänge
```

Da Code schon vorhanden ist, können Anhänge wahrscheinlich übernommen werden. Aber für eine schnelle und robuste erste Version ist Text zuerst einfacher.

---

## 23. Sprachnachrichten / Flurfunk

Im Composer ist bereits Sprachnachricht-Logik vorhanden.

Datei:

```text
src/components/chat/chat-composer.tsx
```

Gesteuert durch:

```text
canUseTranscription
whisperAvailable
voice.maxRecordingSeconds
```

Für Chat-only Version 1 empfehle ich:

```text
Sprachnachrichten deaktivieren, außer sie sind zwingend benötigt.
```

Begründung:

- Mikrofonrechte auf iOS/Android testen
- Audio-Upload testen
- Transkription/Whisper-Verfügbarkeit testen
- Push/Background-Verhalten beachten

Aktivierung später:

```text
Version 1.2
```

---

## 24. Infotafel-Modus

Vorhanden:

```text
mode: CHAT | INFOTAFEL | DISABLED
allowReactions
showReadStats
canBroadcast
```

In Chat-only sollte das beibehalten werden.

Regeln:

```text
CHAT:
- Mitglieder können schreiben, wenn message:create erlaubt ist.

INFOTAFEL:
- normale Nutzer lesen nur.
- Reaktionen je nach allowReactions.
- Sender/Admins schreiben, wenn canBroadcast=true.
- Lesestatistik je nach showReadStats.

DISABLED:
- nicht in der Chatliste anzeigen.
```

---

## 25. Lesestatus

Vorhanden:

```text
src/features/chat/use-mark-room-as-read.ts
```

Es setzt:

```text
Matrix read markers:
m.fully_read
m.read

prilog Platform mark-read:
POST /platform/v1/spaces/:spaceId/mark-read
```

Das sollte übernommen werden.

Wichtig für Chat-only:

```text
Beim Öffnen eines Chats am Ende automatisch gelesen setzen.
Bei Scroll nach unten gelesen setzen.
Nicht bei jeder Nachricht sofort spammen.
```

Die vorhandene Hook throttled bereits auf 5 Sekunden.

---

## 26. Reaktionen und Threads

Vorhanden:

```text
m.reaction
m.thread
ChatThreadPanel
Mobile Long-Press Action Sheet
```

Für schnelle Version:

```text
Reaktionen können bleiben.
Threads können bleiben, wenn sie stabil sind.
```

Falls maximal einfach:

```text
Threads in Version 1 ausblenden.
```

Dazu:

```text
onReply nicht übergeben
onOpenThread nicht übergeben
```

Empfehlung:

```text
Threads zunächst drin lassen, weil sie bereits implementiert sind.
```

---

## 27. Offline-Verhalten

Aktueller Stand:

- App-Shell kann als PWA gecached werden.
- Chatdaten werden teilweise in IndexedDB gespeichert.
- `/api` und `/_matrix` sind `NetworkOnly`.
- Es gibt keine vollständige Offline-Outbox.

Für MVP ausreichend:

```text
Wenn offline:
- App startet
- deutlicher Offline-Hinweis
- alte Nachrichten eventuell sichtbar
- neue Nachricht nicht senden oder als fehlgeschlagen markieren
```

Nicht in MVP:

```text
vollständige Offline-Sync-Outbox
Hintergrund-Sync
Konfliktauflösung
```

---

## 28. Build-Skripte

Aktuell:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest"
}
```

Ergänzen:

```json
{
  "dev:chat": "VITE_APP_VARIANT=chat vite",
  "build:chat": "VITE_APP_VARIANT=chat tsc -b && VITE_APP_VARIANT=chat vite build"
}
```

Unter Windows ggf. mit `cross-env`:

```bash
npm install -D cross-env
```

Dann:

```json
{
  "dev:chat": "cross-env VITE_APP_VARIANT=chat vite",
  "build:chat": "cross-env VITE_APP_VARIANT=chat tsc -b && cross-env VITE_APP_VARIANT=chat vite build"
}
```

---

## 29. Deployment

### Schnellste Variante

```text
Tenant-Domain mit bestehender Proxystruktur
```

Beispiel:

```text
https://test-schule.prilog.team
/api
/_matrix
```

Dort kann die Chat-PWA als eigene Build-Variante ausgeliefert werden.

### Mögliche Pfade

```text
/
```

wenn die Domain nur Chat zeigen soll.

Oder:

```text
/chat
```

wenn die Voll-App parallel bestehen bleibt.

### Falls `/chat`

Vite-Base prüfen:

```ts
base: process.env.VITE_APP_VARIANT === 'chat' ? '/chat/' : '/'
```

Manifest:

```text
start_url: /chat/
scope: /chat/
```

Service Worker Scope beachten.

### Einfacher

Für den MVP besser:

```text
eigene Subdomain pro Tenant oder eigene Chat-Domain mit Root /
```

Nicht mit Subpath beginnen, wenn es nicht nötig ist.

---

## 30. Akzeptanzkriterien Version 1

Version 1 ist brauchbar, wenn:

```text
Nutzer kann sich anmelden.
Nutzer bleibt angemeldet oder bekommt saubere Re-Login-Führung.
Chat-Runtime startet auch in Chat-only.
Matrix-Sync läuft.
Chatliste zeigt erlaubte Spaces.
DISABLED-Spaces werden ausgeblendet.
Infotafel ist für normale Nutzer readonly.
Nutzer kann Chat öffnen.
Nutzer sieht Nachrichten.
Nutzer kann schreiben, wenn erlaubt.
Lesestatus wird gesetzt.
Unread-Badge funktioniert.
Logout löscht Session und Chat-Cache.
App ist als PWA installierbar.
App funktioniert auf Android Chrome.
App funktioniert auf iPhone Safari/Home-Screen.
```

Optional Version 1.1:

```text
Web Push
Dateianhänge
Installationsseite
Chat-Cache zurücksetzen
Neutraler Push-Text
```

---

## 31. Konkrete To-do-Liste für Programmierer

### Block A: Chat-only-Variante

- [ ] `VITE_APP_VARIANT=chat` einführen
- [ ] `env.ts` erweitern
- [ ] `ChatRuntimeProvider` erstellen
- [ ] Runtime aus `ShellLayout` entfernen
- [ ] `App.tsx` für Chat-only umbauen
- [ ] `ChatOnlyShell` erstellen
- [ ] `ChatSpaceList` erstellen oder `MessengerSpaceList` refaktorisieren
- [ ] `ChatOnlySettings` erstellen
- [ ] Abwesenheit in Chat-only entfernen
- [ ] PostCards in Chat-only per Env deaktivieren

### Block B: Chatliste

- [ ] Spaces nach `mode !== DISABLED` und Matrix-Raum filtern
- [ ] Matrix-Room-ID bestimmen: `matrixChatRoomId ?? matrixRoomId`
- [ ] Unread-Badge anzeigen
- [ ] letzte Nachricht anzeigen oder neutralisieren
- [ ] Infotafel-Marker anzeigen
- [ ] Leerer Zustand anzeigen

### Block C: Rechte

- [ ] `useSpaceCan(spaceId, 'message:create')` in `ChatModule` verwenden
- [ ] `file:upload` für Anhänge prüfen
- [ ] Composer ausblenden, wenn kein Senderecht
- [ ] Infotafel-Regel beibehalten
- [ ] Fehlerfall „keine Berechtigung“ sauber anzeigen

### Block D: Session

- [ ] `issueRefreshToken` für Chat-App auf `true`
- [ ] Refresh Token speichern oder Cookie-Variante bauen
- [ ] `/auth/v1/refresh` integrieren
- [ ] Login bei abgelaufener Session sauber anzeigen
- [ ] Logout löscht Tokens, DB, Service-Worker-Cache soweit sinnvoll

### Block E: PWA

- [ ] Manifest für Chat-App anpassen
- [ ] App-Name `prilog Chat`
- [ ] Beschreibung anpassen
- [ ] Installationsseite bauen
- [ ] Share Target für Chat-App deaktivieren oder gezielt neu bauen
- [ ] Service Worker prüfen
- [ ] Offline-Hinweis bauen

### Block F: Push

- [ ] Entscheidung: V1 ohne Push oder V1 mit Web Push
- [ ] Falls Web Push: VAPID Keys
- [ ] Backend-Endpunkte für Web Push
- [ ] Service Worker Push-Handler
- [ ] Notification Click Routing
- [ ] neutrale Push-Texte
- [ ] iOS-Installationshinweis

### Block G: Qualität

- [ ] Vitest für Chat-Filterung
- [ ] Vitest für Space-Mapping
- [ ] Playwright für Login → Chatliste → Chat öffnen → Nachricht senden
- [ ] Mobile Viewport Tests
- [ ] iPhone manuell testen
- [ ] Android manuell testen

---

## 32. Minimaler Code-Plan

### Neue Dateien

```text
src/features/chat/chat-runtime-provider.tsx
src/features/chat-only/chat-only-shell.tsx
src/features/chat-only/chat-space-list.tsx
src/features/chat-only/chat-only-settings.tsx
src/features/chat-only/install-pwa-page.tsx
src/features/chat-only/offline-page.tsx
```

### Geänderte Dateien

```text
src/core/config/env.ts
src/app/App.tsx
src/features/shell/shell-layout.tsx
src/features/modules/chat-module.tsx
src/features/auth/auth-service.ts
vite.config.ts
src/sw.ts
```

Optional:

```text
src/gateways/matrix/matrix-gateway.ts
src/features/auth/components/login-form.tsx
```

wenn zentrale Domain statt Tenant-Domain gewünscht ist.

---

## 33. Testplan

### Unit Tests

```text
getChatRoomId(space)
filterChatSpaces(spaces)
buildChatPreview(room)
canSendInSpace(space, permissions)
```

### Integration Tests

```text
Login speichert Matrix- und Platform-Session
Bootstrap lädt Module
Spaces werden geladen
Matrix-Sync startet nach Login
Logout stoppt Sync und löscht Cache
```

### E2E mit Playwright

```text
01_login_success
02_chat_list_loads
03_disabled_space_hidden
04_open_chat
05_send_message
06_infotafel_readonly_for_guardian
07_unread_badge_updates
08_logout_clears_session
09_install_page_visible_on_ios
10_offline_state_shown
```

---

## 34. Wichtige Risiken

### Risiko 1: MessengerShell ohne ChatRuntime

Sehr kritisch.

Gegenmaßnahme:

```text
ChatRuntimeProvider bauen und überall verwenden.
```

### Risiko 2: zentrale Domain funktioniert nicht mit aktuellem Matrix-Base-URL-Modell

Gegenmaßnahme:

```text
Für MVP Tenant-Domain nutzen.
Oder Matrix-Base dynamisch aus Login-Response ableiten.
```

### Risiko 3: Token laufen ab, Nutzer müssen zu oft neu einloggen

Gegenmaßnahme:

```text
Refresh Token für Chat-App aktivieren.
```

### Risiko 4: Push wird erwartet, ist aber nicht fertig

Gegenmaßnahme:

```text
Push explizit als V1.1 planen oder Backend-Web-Push direkt bauen.
```

### Risiko 5: relative Fetches brechen bei anderer Domain

Gegenmaßnahme:

```text
entweder gleiche Origin mit /api und /_matrix Proxy
oder konsequent env.platformBaseUrl / dynamic matrixBase verwenden.
```

### Risiko 6: Datenschutz durch Nachrichtenvorschau

Gegenmaßnahme:

```text
Preview neutralisieren.
Push neutral halten.
```

---

## 35. Empfehlung für den schnellsten realistischen MVP

### Nicht bauen

```text
neue Flutter-App
neue native Android-App
neue native iOS-App
neue Chat-REST-API
neuer Matrix-Client
```

### Bauen

```text
Chat-only Build des vorhandenen Web-Clients
```

### Reihenfolge

```text
1. ChatRuntimeProvider
2. App-Variante VITE_APP_VARIANT=chat
3. ChatOnlyShell aus MessengerShell ableiten
4. Chatliste mit Unread und Filterung
5. Rechteprüfung im Composer
6. Session/Refresh lösen
7. PWA-Manifest anpassen
8. Auf Android/iPhone testen
9. Push danach
```

---

## 36. Konkretes MVP-Ziel in einem Satz

```text
Ein Nutzer öffnet die installierbare prilog Chat-PWA, meldet sich an, sieht seine Chat-Spaces, öffnet einen Chat, liest und schreibt Nachrichten, bekommt saubere Lesestände und kann sich sicher abmelden.
```

---

## 37. Wichtigster technischer Satz

```text
Die Chat-App sollte nicht neu entwickelt werden, sondern als reduzierte Build-Variante des vorhandenen Web-Clients entstehen; dafür muss die Chat-Runtime aus ShellLayout herausgelöst und in einen gemeinsamen Provider verschoben werden.
```
