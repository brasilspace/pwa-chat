/**
 * useMessengerMode — prueft ob der aktuelle User den Messenger-Modus sehen soll.
 *
 * Messenger = UserType mit hub_contacts === false in der Visibility-Matrix.
 * Workspace = alles andere (Mitarbeiter, Admins, oder kein UserType gesetzt).
 */

import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';

export function useMessengerMode(): boolean {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const perms = session.permissions;

    if (!perms) return false; // Noch nicht geladen → Workspace (default)

    const userTypeKey = perms.userTypeKey;
    const matrix = perms.visibilityMatrix;

    // Kein UserType oder keine Matrix → Workspace
    if (!userTypeKey || !matrix) return false;

    const typeConfig = matrix[userTypeKey];
    if (!typeConfig) return false;

    // Messenger wenn hub_contacts explizit false ist
    return typeConfig.hub_contacts === false;
}
