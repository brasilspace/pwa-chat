import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { logger } from '@/core/logging/logger';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';

export interface Contact {
    id: string;
    /** UserDirectoryEntry.id — nur fuer Admins, fuer PATCH/Extend/Reset-Calls. */
    directoryId?: string;
    username: string;
    displayName: string;
    email: string | null;
    userType: string | null;
    userTypeKey?: string | null;
    audience: 'staff' | 'guardian' | 'minor' | 'external';
    phone?: string | null;
    street?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    birthDate?: string | null;
    // Office-Felder (admin-only)
    admin?: boolean;
    active?: boolean;
    expiresAt?: string | null;
    isPermanent?: boolean;
    membershipCount?: number;
    source?: string;
    /** CRM-Foundation C: für client-seitige View-Engine (cf:<key>). */
    customFields?: Record<string, unknown>;
}

type RawUser = Partial<Contact> & {
    id: string; username: string; displayName: string; email: string | null;
    userType: string | null; audience?: string; showAvatar?: boolean;
};

const platformGateway = createPlatformGateway();
const REFRESH_INTERVAL = 60_000; // 60 seconds (Fallback fuer Polling)

export function useContacts(): { contacts: Contact[]; loading: boolean } {
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const load = useCallback(() => {
        const token = snapshot.platform?.token;
        const myUserId = snapshot.matrix?.userId;
        if (!token) return;

        platformGateway.getUsers(token)
            .then((res) => {
                if (mountedRef.current) {
                    setContacts(res.users.filter((u) => u.id !== myUserId).map((u: RawUser) => ({
                        ...u,
                        audience: (u.audience ?? 'staff') as Contact['audience'],
                    } as Contact)));
                }
            })
            .catch((err: unknown) => {
                logger.error('Failed to load contacts', { error: err });
            })
            .finally(() => {
                if (mountedRef.current) setLoading(false);
            });
    }, [snapshot.platform?.token, snapshot.matrix?.userId]);

    useEffect(() => {
        mountedRef.current = true;

        if (snapshot.state !== 'ready' || !snapshot.platform?.token) {
            setContacts([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        load();

        // Polling als Fallback (SSE ist primaer)
        const interval = setInterval(load, REFRESH_INTERVAL);

        return () => {
            mountedRef.current = false;
            clearInterval(interval);
        };
    }, [snapshot.state, snapshot.platform?.token, load]);

    // SSE: Kontakte sofort aktualisieren
    useWorkflowEvents(useCallback((eventType: string) => {
        if (eventType === 'contacts.changed') {
            load();
        }
    }, [load]));

    return { contacts, loading };
}
