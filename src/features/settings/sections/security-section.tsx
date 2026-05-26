import type { JSX } from 'react';
import { sessionMachine } from '@/core/session/session-machine';
import { sessionStore } from '@/core/session/session-store';
import { deleteChatDb } from '@/features/chat/chat-db';
import { ChangePassword } from '../change-password';
import { DatabaseZap } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export function SecuritySection(): JSX.Element {
    const t = useT();
    const handleResetCache = async () => {
        const userId = sessionStore.getSnapshot().matrix?.userId;
        if (userId) await deleteChatDb(userId);
        // Fallback: delete all prilog-chat DBs even if userId is missing
        if ('databases' in indexedDB) {
            const dbs = await indexedDB.databases();
            for (const db of dbs) {
                if (db.name?.startsWith('prilog-chat-')) {
                    indexedDB.deleteDatabase(db.name);
                }
            }
        }
        window.location.reload();
    };

    return (
        <div className="space-y-10">
            {/* Passwort */}
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="lock" size={16} className="size-5" /> {t('settings.security.sicherheit')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.security.passwort_sitzung_und_lokaler_cache')}</p>
                <div className="mt-6">
                    <ChangePassword />
                </div>
            </div>

            <hr className="border-border" />

            {/* Cache */}
            <div>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                    <DatabaseZap className="size-4" /> {t('settings.security.chat-cache')}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.security.der_chat-cache_speichert_nachrichten_und')}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                    <strong>{t('settings.security.sinnvoll_wenn')}</strong> {t('settings.security.nachrichten_fehlen_profilbilder_nicht_ge')}
                </p>
                <button
                    onClick={handleResetCache}
                    className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 px-4 py-2.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
                >
                    <DatabaseZap className="size-4" /> {t('settings.security.chat-cache_zuruecksetzen')}
                </button>
            </div>

            <hr className="border-border" />

            {/* Logout */}
            <div>
                <h3 className="text-base font-semibold">{t('settings.security.abmelden')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.security.du_wirst_ausgeloggt_und_zur_anmeldeseite')}</p>
                <button
                    onClick={() => sessionMachine.logout()}
                    className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                    <MaterialIcon name="logout" size={16} className="size-4" /> {t('settings.security.abmelden')}
                </button>
            </div>
        </div>
    );
}
