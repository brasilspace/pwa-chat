# prilog Chat PWA

Chat-only-Variante der Prilog-App. Eigene Installation neben der Voll-App
auf `<tenant>.prilog.team`.

- **Voll-App:** `https://<tenant>.prilog.team` (alle Module)
- **Chat-PWA:** `https://<tenant>.prilog.chat` (nur Chat, installierbar)

## Architektur

```
Login → ChatRuntimeProvider → MessengerShell
              │                    │
              └─→ Matrix-Sync       └─→ Chat-Liste + Chat-Detail
              └─→ IndexedDB
```

- Backend: gemeinsam mit Voll-App (`api.prilog.chat`)
- Matrix: gemeinsame Synapse pro Tenant
- Auth: Backend mapped `<sub>.prilog.chat` → `<sub>.prilog.team` (kanonische `matrixDomain`)

## Web-Push

- VAPID-Public-Key: `/api/platform/v1/web-push/public-key`
- Subscribe: `POST /api/platform/v1/web-push/subscribe`
- Sygnal-Gateway: `POST /api/webpush/notify` (Synapse pusht direkt hierhin)

Beim Aktivieren wird parallel ein Matrix-Pusher via `/_matrix/client/r0/pushers/set`
registriert, damit Synapse bei Events automatisch pushen kann.

## Build/Deploy

```bash
npm install --legacy-peer-deps
npm run build
# dist/ wird auf <tenant>.prilog.chat ausgeliefert
```

Initial-Setup pro neuem Tenant (manuell, bis ins Reconcile-Skript verlagert):

1. DNS: `<tenant>.prilog.chat` A-Record auf Shared-Host
2. nginx vhost (siehe `/etc/nginx/sites-available/leander.prilog.chat.conf` als Vorlage)
3. `certbot --nginx -d <tenant>.prilog.chat`

## TODO V1.1

- Automatischer Refresh-Token-Flow beim App-Start (Endpoint ist da, Frontend speichert,
  aber nutzt ihn noch nicht automatisch)
- Chatliste-Polish (Last-Message, Unread-Badge pro Space)
- `useSpaceCan` im Composer (heute: Sichtbarkeit via `mode`/`canBroadcast`)
- Reconcile-Skript erweitern: bei `tenant-box.create` automatisch DNS+nginx+SSL für `.chat`
