/**
 * useVisibility — prueft ob ein Hub oder Tab fuer den aktuellen User sichtbar ist.
 *
 * Liest userTypeKey und visibilityMatrix aus dem Session-Store.
 * Wenn keine Matrix konfiguriert ist, ist alles sichtbar (Default).
 * Mitarbeiter sehen immer alles.
 */

import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';

export function useVisibility(): {
    isVisible: (key: string) => boolean;
    userTypeKey: string | null;
} {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const perms = session.permissions;

    const userTypeKey = perms?.userTypeKey ?? null;
    const matrix = perms?.visibilityMatrix ?? null;

    const audience = perms?.audience ?? 'staff';

    const isVisible = (key: string): boolean => {
        // Ohne Matrix: alles sichtbar
        if (!matrix || !userTypeKey) return true;

        // Staff sehen immer alles (robust: unabhaengig vom UserType-Key)
        if (audience === 'staff') return true;

        const typeConfig = matrix[userTypeKey];
        if (!typeConfig) return true; // Unbekannter UserType → alles sichtbar

        // Explizit konfiguriert: true/false. Nicht konfiguriert: sichtbar (Default)
        return typeConfig[key] !== false;
    };

    return { isVisible, userTypeKey };
}
