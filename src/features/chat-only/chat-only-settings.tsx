/**
 * Stark reduzierte Settings fuer die Chat-PWA. Bewusst KEINE
 * Module/User-Mgmt/Rechnungen — die leben in der Voll-App auf .team.
 */
import { type JSX, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { sessionMachine } from '@/core/session/session-machine';
import { closeChatDb } from '@/features/chat/chat-db';
import { stopSync } from '@/features/chat/chat-sync';
import { WebPushToggle } from './web-push-toggle';

export function ChatOnlySettings(): JSX.Element {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const navigate = useNavigate();

    async function logout() {
        if (!confirm('Wirklich abmelden? Dein lokaler Chat-Cache wird geloescht.')) return;
        stopSync();
        try { closeChatDb(); } catch { /* ignore */ }
        // IndexedDB explizit loeschen
        try {
            const userId = session.matrix?.userId;
            if (userId) indexedDB.deleteDatabase(`prilog-chat-${userId}`);
        } catch { /* ignore */ }
        // SW-Caches loeschen
        if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
        }
        sessionMachine.logout();
        navigate('/login', { replace: true });
    }

    async function clearCache() {
        if (!confirm('Lokalen Chat-Cache loeschen? Der Chat wird beim naechsten Mal frisch geladen.')) return;
        try {
            const userId = session.matrix?.userId;
            if (userId) {
                stopSync();
                closeChatDb();
                indexedDB.deleteDatabase(`prilog-chat-${userId}`);
            }
        } catch { /* ignore */ }
        if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
        }
        location.reload();
    }

    const displayName = session.bootstrap?.user?.displayName ?? session.matrix?.userId;

    return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <MaterialIcon name="arrow_back" size={16} />
                Zurück zum Chat
            </Link>

            <h1 className="text-2xl font-bold">Einstellungen</h1>

            <section className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                    <MaterialIcon name="person" size={20} className="text-primary" />
                    <div className="flex-1">
                        <div className="font-medium">{displayName}</div>
                        <div className="text-xs text-muted-foreground">{session.bootstrap?.branding?.tenantName}</div>
                    </div>
                </div>
            </section>

            <WebPushToggle />

            <section className="rounded-lg border border-border p-4">
                <h2 className="mb-2 text-sm font-semibold">App</h2>
                <Link
                    to="/install"
                    className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                    <MaterialIcon name="install_mobile" size={18} className="text-muted-foreground" />
                    <span className="flex-1">App installieren</span>
                    <MaterialIcon name="chevron_right" size={16} className="text-muted-foreground" />
                </Link>
            </section>

            <section className="rounded-lg border border-border p-4">
                <h2 className="mb-2 text-sm font-semibold">Daten</h2>
                <button
                    onClick={clearCache}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                >
                    <MaterialIcon name="cleaning_services" size={18} className="text-muted-foreground" />
                    Chat-Cache zurücksetzen
                </button>
            </section>

            <button
                onClick={logout}
                className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
                <MaterialIcon name="logout" size={16} className="-mt-0.5 mr-1 inline" />
                Abmelden
            </button>

            <p className="mt-auto pt-6 text-center text-[10px] text-muted-foreground">
                Die volle Prilog-App ist auf <strong>{session.matrix?.homeserver}</strong> erreichbar.
            </p>
        </div>
    );
}
