/**
 * ChatRuntimeProvider
 *
 * Aus dem Web-Client extrahierter Lebenszyklus fuer Matrix-Sync + IndexedDB.
 * In der Voll-App haengt das an ShellLayout — bei der Chat-only-PWA gibt es
 * kein ShellLayout, daher hier eigenstaendig als Wrapper um die Chat-Shell.
 *
 *   <ChatRuntimeProvider>
 *     <ChatOnlyShell />
 *   </ChatRuntimeProvider>
 */
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { openChatDb, closeChatDb } from '@/features/chat/chat-db';
import { startSync, stopSync } from '@/features/chat/chat-sync';

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);

    useEffect(() => {
        const userId = session.matrix?.userId;
        if (!userId) return;

        // Sync sofort starten — der braucht nur den Matrix-Access-Token.
        // IndexedDB kann unter bestimmten Bedingungen haengen (stale conns,
        // version conflicts), deshalb parallel mit Timeout: Cache wenn er
        // kommt, Chat laeuft auch ohne.
        startSync();

        void Promise.race([
            openChatDb(userId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB timeout')), 3000)),
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
