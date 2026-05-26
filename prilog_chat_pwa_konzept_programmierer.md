# prilog Chat-PWA  
## Erste Konzeptdatei für die Programmierer

**Projekt:** prilog  
**Modul:** Chat-App als Progressive Web App  
**Ziel:** Schnelle mobile Umsetzung des Chatmoduls für Android, iPhone und Browser  
**Stand:** 27. Mai 2026  
**Zielgruppe:** Programmierer, Product Owner, UX/UI, QA  
**Hinweis:** Dieses Dokument beschreibt eine erste technische Richtung. Es ersetzt keine abschließende Sicherheits-, Datenschutz- oder Architekturprüfung.

---

## 1. Kurzentscheidung

Für eine schnelle Umsetzung des Chatmoduls wird empfohlen:

```text
prilog Chat zunächst als PWA bauen.
Später optional dieselbe Codebasis mit Capacitor als Android- und iOS-App verpacken.
```

Nicht empfohlen für den Schnellstart:

```text
separate native Android-App
separate native iPhone-App
Flutter-Neuentwicklung nur für Chat
```

Begründung:

- eine Codebasis
- schnellere Umsetzung
- sofort im Browser nutzbar
- auf Android und iPhone installierbar
- später app-store-fähig verpackbar
- geringerer Pflegeaufwand

---

## 2. Ziel der App

Die Chat-PWA soll **nur das Chatmodul von prilog** abbilden.

Sie ist keine vollständige prilog-App.

### Zielbild

```text
chat.prilog.team
```

oder:

```text
prilog.team/chat
```

Die App soll auf Mobilgeräten wie eine einfache Messenger-App wirken:

```text
Login
→ Chatliste
→ Chat öffnen
→ Nachricht lesen
→ Nachricht schreiben
→ Push-Benachrichtigung erhalten
```

---

## 3. MVP-Funktionsumfang

### Muss in Version 1 enthalten sein

```text
Login
Logout
Chatliste
Einzelchat
Gruppenchat
Nachrichten senden
Nachrichten empfangen
Ungelesen-Zähler
Push-Benachrichtigungen
Lesestatus einfach
Fehleranzeige bei Verbindungsproblemen
Mobile-optimierte Oberfläche
```

### Sollte möglichst früh enthalten sein

```text
Nachrichten nachladen / Pagination
Anhänge anzeigen
einfache Datei- oder Bildanhänge senden
Push-Abonnement verwalten
Installationshinweis für PWA
Sitzung erneuern
Offline-Hinweis
```

### Nicht in Version 1

```text
Sprachnachrichten
Videocalls
Reaktionen / Emojis pro Nachricht
Threads
Nachrichten bearbeiten
Nachrichten löschen für alle
Ende-zu-Ende-Verschlüsselung
KI-Zusammenfassungen
komplexe Moderationsfunktionen
```

---

## 4. Technische Grundidee

### Architektur

```text
Mobile Browser / PWA
        │
        ▼
prilog Chat Frontend
        │
        ├── REST API für Login, Chatliste, Nachrichtenhistorie
        │
        ├── WebSocket oder Server-Sent Events für neue Nachrichten
        │
        └── Web Push für Benachrichtigungen
        │
        ▼
prilog Backend / Chat-Service
        │
        ▼
Datenbank
```

---

## 5. Technologie-Empfehlung

### Frontend

Empfohlen:

```text
React + Vite
oder
Next.js
```

Für einen schnellen, eigenständigen Chat ist `React + Vite` wahrscheinlich schlanker.

Wenn prilog ohnehin bereits Next.js nutzt, kann das Chatmodul als separater Bereich oder eigene App in der bestehenden Struktur entstehen.

### PWA-Bausteine

```text
Web App Manifest
Service Worker
Push Notifications
Responsive Mobile UI
Offline-Fallback
App Icons
Install Prompt
```

### Spätere native Verpackung

Optional später:

```text
Capacitor
```

Damit kann dieselbe Web-App als Android- und iOS-App verpackt werden.

---

## 6. Wichtige Plattformhinweise

### Android

Android unterstützt PWAs im Allgemeinen gut:

- Installation auf Startbildschirm
- Push-Benachrichtigungen
- App-ähnliches Vollbild
- Service Worker
- Background Push

### iPhone / iOS

Auf iOS ist besonders wichtig:

```text
Web Push funktioniert für Home-Screen-Web-Apps ab iOS/iPadOS 16.4.
```

Praktische Konsequenz:

- Nutzer müssen die PWA zum Home-Bildschirm hinzufügen.
- Erst danach funktionieren Web-Push-Benachrichtigungen zuverlässig.
- Die App braucht eine gute Anleitung zum Installieren.
- Push-Berechtigung darf erst abgefragt werden, wenn der Nutzer den Nutzen versteht.

### Installationshinweis

Die App sollte erkennen, ob sie installiert ist.

Beispieltext:

```text
prilog Chat installieren

Damit Sie neue Nachrichten direkt erhalten, fügen Sie prilog Chat bitte zum Home-Bildschirm hinzu.
```

---

## 7. Routing

Empfohlene Routen:

```text
/login
/chats
/chats/:chatId
/settings
/install
/offline
```

Optional später:

```text
/profile
/notifications
/attachments/:attachmentId
```

---

## 8. Hauptansichten

### 8.1 Login

Funktionen:

- E-Mail / Benutzername
- Passwort
- optional Schulkennung
- Fehleranzeige
- Session speichern
- Passwort vergessen optional verlinken

UI-Ziel:

```text
prilog Chat
[ E-Mail ]
[ Passwort ]
[ Einloggen ]
```

---

### 8.2 Chatliste

Anzeigen:

```text
Chatname
letzte Nachricht
Zeitpunkt
Ungelesen-Zähler
Avatar / Initialen
Stummschaltung optional
```

Beispiel:

```text
┌──────────────────────────────┐
│ 5a Eltern                    │
│ Neue Nachricht in prilog     │  3
│ heute 09:14                  │
├──────────────────────────────┤
│ Kollegium                    │
│ Maria: Danke für die Info    │
│ gestern                      │
└──────────────────────────────┘
```

Wichtig:

- keine sensiblen Inhalte in Push oder Vorschau, falls Schule das deaktiviert
- Sortierung nach letzter Aktivität
- Suche optional später

---

### 8.3 Einzelchat / Gruppenchat

Funktionen:

```text
Nachrichten anzeigen
Nachricht schreiben
Nachricht senden
neue Nachrichten live einfügen
Scrollposition halten
ältere Nachrichten nachladen
Lesestatus setzen
```

UI:

```text
┌──────────────────────────────┐
│ ← 5a Eltern                  │
├──────────────────────────────┤
│ Nachricht                    │
│ Nachricht                    │
│ Nachricht                    │
├──────────────────────────────┤
│ [Nachricht schreiben...] [↑] │
└──────────────────────────────┘
```

---

### 8.4 Einstellungen

Minimal:

```text
Benutzerkonto
Benachrichtigungen
PWA installieren
Logout
Datenschutz / Impressum
```

Optional:

```text
Benachrichtigung pro Chat stummschalten
Sprache
Theme
Geräteverwaltung
```

---

## 9. API-Entwurf

### Auth

```http
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/me
```

### Chats

```http
GET /api/chats
GET /api/chats/:chatId
GET /api/chats/:chatId/messages
POST /api/chats/:chatId/messages
POST /api/chats/:chatId/read
```

### Anhänge

```http
POST /api/chats/:chatId/attachments
GET  /api/attachments/:attachmentId
```

### Push

```http
POST /api/push/subscribe
POST /api/push/unsubscribe
GET  /api/push/status
```

### Geräte / Sessions

```http
GET    /api/devices
DELETE /api/devices/:deviceId
```

---

## 10. WebSocket-Entwurf

WebSocket-Endpunkt:

```text
wss://api.prilog.team/chat
```

### Client sendet

```json
{
  "type": "message.send",
  "chatId": "chat_123",
  "clientMessageId": "local_abc",
  "body": "Hallo zusammen"
}
```

```json
{
  "type": "message.read",
  "chatId": "chat_123",
  "messageId": "msg_456"
}
```

### Server sendet

```json
{
  "type": "message.created",
  "chatId": "chat_123",
  "message": {
    "id": "msg_456",
    "senderId": "user_1",
    "body": "Hallo zusammen",
    "createdAt": "2026-05-27T10:00:00Z"
  }
}
```

```json
{
  "type": "chat.updated",
  "chatId": "chat_123",
  "unreadCount": 3
}
```

### Optional später

```text
typing.started
typing.stopped
message.deleted
message.edited
presence.updated
```

Für den MVP können `typing` und `presence` weggelassen werden.

---

## 11. Datenmodell grob

### User

```text
User
- id
- school_id
- display_name
- role
- avatar_url
- status
```

### Chat

```text
Chat
- id
- school_id
- type: direct | group | class | system
- title
- created_by_user_id
- created_at
- updated_at
- last_message_at
```

### ChatMember

```text
ChatMember
- id
- chat_id
- user_id
- role: owner | admin | member | readonly
- joined_at
- muted_until
- last_read_message_id
- last_read_at
```

### Message

```text
Message
- id
- chat_id
- sender_user_id
- body
- type: text | attachment | system
- created_at
- edited_at
- deleted_at
- client_message_id
```

### MessageAttachment

```text
MessageAttachment
- id
- message_id
- file_id
- file_name
- mime_type
- size_bytes
- created_at
```

### PushSubscription

```text
PushSubscription
- id
- user_id
- endpoint
- p256dh
- auth
- user_agent
- platform
- created_at
- last_used_at
- revoked_at
```

### DeviceSession

```text
DeviceSession
- id
- user_id
- device_name
- platform
- created_at
- last_seen_at
- revoked_at
```

---

## 12. Authentifizierung

Empfohlen:

```text
Access Token kurzlebig
Refresh Token sicher gespeichert
Session serverseitig widerrufbar
```

Bei PWA beachten:

- keine sensiblen Tokens im Local Storage speichern, wenn vermeidbar
- bevorzugt HttpOnly Secure Cookies
- CSRF-Schutz bei Cookie-basiertem Login
- Token-Rotation
- Logout muss Push-Subscription deaktivieren können
- Geräteverlust bedenken

### Logout

Beim Logout:

```text
lokale Session löschen
Push-Subscription optional entfernen
Service Worker Cache sensibler Daten leeren
WebSocket schließen
```

---

## 13. Push-Benachrichtigungen

### Grundsatz

Push-Mitteilungen dürfen keine sensiblen Inhalte enthalten.

Empfohlen:

```text
Neue Nachricht in prilog
```

Nicht empfohlen:

```text
Frau Müller: Ihr Kind hat heute ...
```

### Push-Payload

Minimal:

```json
{
  "title": "Neue Nachricht in prilog",
  "body": "Öffnen Sie prilog Chat, um die Nachricht zu lesen.",
  "chatId": "chat_123"
}
```

### Benachrichtigungslogik

Push senden, wenn:

```text
Nutzer ist Mitglied im Chat
Nutzer hat Chat nicht geöffnet
Nutzer hat Benachrichtigungen erlaubt
Chat ist nicht stummgeschaltet
Nutzer ist nicht abgemeldet
```

### Badge

Optional:

```text
Badge = Gesamtzahl ungelesener Chats oder Nachrichten
```

---

## 14. Sicherheit und Datenschutz

Da prilog im Schulkontext eingesetzt wird, muss Chat besonders vorsichtig gebaut werden.

### Muss-Regeln

```text
keine offenen Chatlinks
keine Gastzugänge ohne Kontrolle
keine sensiblen Inhalte in Push
rollenbasierte Sichtbarkeit
serverseitige Rechteprüfung bei jedem API-Aufruf
Audit-Log für wichtige Ereignisse
sauberer Logout
Session-Widerruf
Transportverschlüsselung
```

### Serverseitige Prüfung

Der Client darf nie allein entscheiden, ob ein Nutzer einen Chat sehen darf.

Jede Anfrage braucht serverseitige Prüfung:

```text
Darf user_id diesen chat_id sehen?
Darf user_id in diesen chat_id schreiben?
Darf user_id diesen Anhang laden?
```

### Datenschutz

Zu klären:

```text
Aufbewahrungsfristen für Nachrichten
Exportierbarkeit
Löschkonzept
Rollen für Einsicht
Protokollierung von Zugriffen
Umgang mit ausgeschiedenen Nutzern
```

---

## 15. Offline-Verhalten

Für den MVP reicht ein einfaches Offline-Verhalten.

### Version 1

```text
App öffnet auch ohne Netz mit Offline-Hinweis
bereits geladene Chatliste kann optional angezeigt werden
Nachrichten senden ohne Verbindung wird blockiert oder als Entwurf gespeichert
```

### Später

```text
lokale Outbox
automatisches Senden nach Wiederverbindung
Konfliktbehandlung
verschlüsselter lokaler Speicher
```

Für den schnellen Start ist eine einfache Lösung besser:

```text
Offline erkennen
klar anzeigen
nicht versuchen, komplexe Synchronisierung zu bauen
```

---

## 16. Fehlerfälle

Die App sollte diese Fälle sauber behandeln:

```text
Login fehlgeschlagen
Session abgelaufen
keine Verbindung
WebSocket getrennt
Nachricht konnte nicht gesendet werden
Push nicht erlaubt
Push auf iOS nicht möglich, weil App nicht installiert
Chat nicht mehr verfügbar
Nutzer hat keine Berechtigung
Anhang zu groß
```

Beispielmeldung:

```text
Die Nachricht konnte nicht gesendet werden. Verbindung prüfen und erneut versuchen.
```

---

## 17. UI/UX-Prinzipien

### Mobile first

Die App wird primär auf Smartphones genutzt.

Regeln:

```text
große Touch-Flächen
wenige Menüs
keine überladenen Tabellen
schneller Zurück-Button
sichtbarer Senden-Button
Tastaturverhalten testen
Scrollverhalten testen
```

### Barrierearmut

```text
ausreichende Kontraste
Screenreader-Labels
sichtbarer Fokus
Buttons mit Text oder aria-label
keine reine Farbcodierung
```

### Sprache

Kurze, klare Texte:

```text
Neue Nachricht
Nachricht senden
Verbindung verloren
Wieder verbunden
Abmelden
```

---

## 18. PWA-Manifest

Beispiel:

```json
{
  "name": "prilog Chat",
  "short_name": "prilog Chat",
  "start_url": "/chats",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Hinweis:

Farben und Icons müssen an das endgültige prilog-Design angepasst werden.

---

## 19. Service Worker

Aufgaben:

```text
App-Shell cachen
Offline-Seite anzeigen
Push empfangen
Notification anzeigen
Cache bei Logout leeren
```

Nicht im ersten Schritt:

```text
vollständige Chatdaten offline speichern
komplexe Sync-Queue
verschlüsselte lokale Datenbank
```

### Cache-Regel

Für sensible Daten:

```text
Keine privaten Chatnachrichten unkontrolliert im Cache speichern.
```

App-Shell ja, sensible Inhalte nur sehr vorsichtig.

---

## 20. Spätere Verpackung mit Capacitor

Wenn die PWA stabil ist, kann sie mit Capacitor als App verpackt werden.

### Nutzen

```text
Android-App im Play Store
iPhone-App im App Store
native Push-Integration
App-Badge
Deep Links
bessere Geräteintegration
```

### Wichtig

Die App darf nicht nur wie eine einfache WebView wirken. Sie sollte einen klaren nativen Nutzen bieten:

```text
sicherer prilog Chat
Push
Badge
Login
Schulkommunikation
```

---

## 21. Deployment

Empfohlen:

```text
chat.prilog.team
```

Umgebung:

```text
dev-chat.prilog.team
staging-chat.prilog.team
chat.prilog.team
```

### Build-Pipeline

```text
Lint
Typecheck
Unit Tests
Build
E2E Tests
Deploy Staging
Smoke Test
Deploy Production
```

---

## 22. Monitoring

Zu messen:

```text
Login-Fehler
WebSocket-Verbindungsabbrüche
fehlgeschlagene Nachrichten
Push-Zustellfehler
API-Latenz
Frontend-Fehler
Service-Worker-Fehler
```

Tools abhängig vom bestehenden Stack:

```text
Sentry
OpenTelemetry
Server-Logs
Push-Fehlerlogs
```

Keine sensiblen Chatinhalte in Logs schreiben.

---

## 23. Teststrategie

### Unit Tests

```text
Nachrichtenformatierung
Unread Count
Permission Helpers
Push Subscription Helpers
```

### Integration Tests

```text
Login
Chatliste laden
Nachrichten laden
Nachricht senden
Lesestatus setzen
Push Subscription speichern
```

### E2E Tests

Empfohlen mit Playwright.

Testfälle:

```text
01_login_success
02_login_wrong_password
03_chat_list_loads
04_open_chat
05_send_message
06_receive_message
07_unread_counter_updates
08_logout
09_permission_denied_for_unknown_chat
10_offline_message_shows_error
```

### Mobile E2E

Besonders testen:

```text
iPhone Safari
Android Chrome
installierte PWA
nicht installierte PWA
Push erlaubt
Push abgelehnt
```

---

## 24. Beispiel Playwright-Test

```ts
import { test, expect } from '@playwright/test';

test('Nutzer kann einen Chat öffnen und eine Nachricht senden', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('E-Mail').fill('user@prilog.test');
  await page.getByLabel('Passwort').fill('test1234');
  await page.getByRole('button', { name: 'Einloggen' }).click();

  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();

  await page.getByRole('link', { name: /5a Eltern/ }).click();

  await page.getByLabel('Nachricht schreiben').fill('Hallo zusammen');
  await page.getByRole('button', { name: 'Senden' }).click();

  await expect(page.getByText('Hallo zusammen')).toBeVisible();
});
```

---

## 25. Akzeptanzkriterien für den MVP

Der MVP gilt als brauchbar, wenn:

```text
ein Nutzer sich anmelden kann
ein Nutzer seine Chatliste sieht
ein Nutzer einen Chat öffnen kann
ein Nutzer Nachrichten senden kann
neue Nachrichten ohne Reload erscheinen
ungelesene Nachrichten angezeigt werden
Push grundsätzlich funktioniert
Logout funktioniert
Berechtigungen serverseitig geprüft werden
keine sensiblen Inhalte in Push erscheinen
die App auf iPhone und Android nutzbar ist
```

---

## 26. Offene Fragen vor Umsetzung

Diese Fragen müssen geklärt werden:

1. Gibt es bereits eine prilog-Chat-API?
2. Gibt es bereits WebSocket-Infrastruktur?
3. Wie funktioniert der aktuelle Login?
4. Werden Tokens oder Cookies verwendet?
5. Welche Rollen dürfen chatten?
6. Gibt es Schul-, Klassen- oder Space-Chats?
7. Dürfen Eltern direkt mit Lehrkräften schreiben?
8. Gibt es moderierte Chats?
9. Müssen Nachrichten exportierbar sein?
10. Welche Aufbewahrungsfristen gelten?
11. Dürfen Anhänge versendet werden?
12. Welche Dateitypen sind erlaubt?
13. Wie sollen Push-Texte aussehen?
14. Muss Mandantenfähigkeit pro Schule berücksichtigt werden?
15. Gibt es ein bestehendes Design-System?

---

## 27. Empfohlene Umsetzungsreihenfolge

### Phase 1: Technisches Grundgerüst

```text
Projekt einrichten
PWA-Manifest
Service Worker minimal
Login
Routing
Layout
```

### Phase 2: Chat-Grundfunktionen

```text
Chatliste
Nachrichtenhistorie
Nachricht senden
WebSocket / Realtime
Unread Count
```

### Phase 3: Push und Mobile UX

```text
Push Subscription
Push senden
Installationshinweis
iOS/Android Tests
Offline-Hinweis
```

### Phase 4: Sicherheit und Stabilisierung

```text
Berechtigungsprüfung
Session-Widerruf
Logging ohne Inhalte
E2E-Tests
Fehlerzustände
```

### Phase 5: Optionale App-Verpackung

```text
Capacitor einrichten
Android Build
iOS Build
native Push prüfen
Store-Vorbereitung
```

---

## 28. Risiken

### Risiko: iPhone-Push wird falsch erwartet

Problem:

```text
Web Push auf iOS funktioniert nur für installierte Home-Screen-Web-Apps.
```

Gegenmaßnahme:

```text
Installationsseite und klare Anleitung bauen.
```

### Risiko: sensible Inhalte landen in Push

Gegenmaßnahme:

```text
Push-Texte neutral halten.
```

### Risiko: PWA wird später schwer als App verpackbar

Gegenmaßnahme:

```text
von Anfang an Capacitor-kompatibel bauen.
```

### Risiko: Chat wird zu groß für MVP

Gegenmaßnahme:

```text
kein Audio, kein Video, keine Reactions, keine Threads in Version 1.
```

### Risiko: Rechte werden nur im Frontend geprüft

Gegenmaßnahme:

```text
alle Berechtigungen serverseitig prüfen.
```

---

## 29. Quellen und technische Bezugspunkte

- MDN: Progressive Web Apps  
  https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps

- web.dev: Web App Manifest  
  https://web.dev/learn/pwa/web-app-manifest

- Apple Developer: Web Push für Web Apps und Browser  
  https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

- WebKit: Web Push for Web Apps on iOS and iPadOS  
  https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

- Capacitor  
  https://capacitorjs.com/

---

## 30. Kurzfazit

Für prilog ist der pragmatischste Weg:

```text
Zuerst eine schlanke Chat-PWA bauen.
Danach optional mit Capacitor als Android- und iPhone-App verpacken.
```

Der MVP soll bewusst klein bleiben:

```text
Login
Chatliste
Chat
Nachrichten
Push
Logout
Sicherheit
```

Wichtigste technische Regel:

```text
Chatnachrichten und Push-Benachrichtigungen müssen im Schulkontext datensparsam und sicher behandelt werden.
```
