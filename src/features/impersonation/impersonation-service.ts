// ─────────────────────────────────────────────────────────────────────────────
// Impersonation Service – Admin-Support-Zugriff auf Benutzer-Accounts
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';
import { sessionStore } from '../../core/session/session-store';
import { bootstrapLoader } from '../bootstrap/bootstrap-loader';

interface ImpersonateResponse {
    success: boolean;
    token: string;
    expiresIn: number;
    impersonationLogId: string;
    targetUser: {
        userId: string;
        displayName: string;
    };
}

interface ImpersonationNotice {
    id: string;
    adminDisplayName: string;
    createdAt: string;
}

export const impersonationService = {
    /**
     * Starte Impersonation: Holt ein temporaeres Token und wechselt die Session.
     */
    async startImpersonation(targetUserId: string): Promise<void> {
        const snapshot = sessionStore.getSnapshot();
        if (!snapshot.platform || !snapshot.matrix) {
            throw new Error('Keine aktive Session');
        }
        if (snapshot.impersonation) {
            throw new Error('Bereits in einer Impersonation-Session');
        }

        const adminToken = snapshot.platform.token;
        const adminDisplayName = snapshot.bootstrap?.user.displayName ?? 'Admin';

        // API Call: Impersonation-Token holen
        const res = await requestJson<ImpersonateResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/impersonate/${encodeURIComponent(targetUserId)}`,
            method: 'POST',
            bearerToken: adminToken,
            body: '{}',
        });

        // Original-Session sichern + Impersonation-Daten setzen
        sessionStore.setImpersonation({
            originalToken: adminToken,
            originalMatrix: snapshot.matrix,
            logId: res.impersonationLogId,
            targetUser: res.targetUser,
            adminDisplayName,
        });

        // Platform-Token auf Impersonation-Token umschalten
        sessionStore.setPlatform({
            token: res.token,
            expiresAt: Date.now() + res.expiresIn * 1000,
        });

        // Bootstrap neu laden (laedt Daten als Ziel-User)
        await bootstrapLoader.load();
    },

    /**
     * Starte Impersonation von einem bereits vorhandenen Token (z.B. via URL-Parameter vom Portal).
     */
    async startFromToken(token: string, logId: string, targetDisplayName: string): Promise<void> {
        const snapshot = sessionStore.getSnapshot();
        if (!snapshot.platform || !snapshot.matrix) return;
        if (snapshot.impersonation) return;

        const adminToken = snapshot.platform.token;
        const adminDisplayName = snapshot.bootstrap?.user.displayName ?? 'Admin';

        // Original-Session sichern
        sessionStore.setImpersonation({
            originalToken: adminToken,
            originalMatrix: snapshot.matrix,
            logId,
            targetUser: {
                userId: '',
                displayName: decodeURIComponent(targetDisplayName),
            },
            adminDisplayName,
        });

        // Platform-Token NUR in-memory setzen (nicht in localStorage!)
        // So bleibt das Admin-Token im localStorage erhalten, falls der Tab
        // geschlossen wird ohne "Beenden" zu klicken.
        sessionStore.setPlatformInMemory({
            token,
            expiresAt: Date.now() + 1800 * 1000, // 30 Min
        });

        // Bootstrap neu laden (laedt Daten als Ziel-User)
        await bootstrapLoader.load();

        // targetUser mit echtem Namen aus Bootstrap aktualisieren
        const newSnapshot = sessionStore.getSnapshot();
        if (newSnapshot.impersonation && newSnapshot.bootstrap) {
            sessionStore.setImpersonation({
                ...newSnapshot.impersonation,
                targetUser: {
                    userId: newSnapshot.bootstrap.user.matrixUserId,
                    displayName: newSnapshot.bootstrap.user.displayName,
                },
            });
        }
    },

    /**
     * Beende Impersonation: Zurueck zum Admin-Account.
     */
    async endImpersonation(): Promise<void> {
        const snapshot = sessionStore.getSnapshot();
        if (!snapshot.impersonation) return;

        const { originalToken, originalMatrix, logId } = snapshot.impersonation;

        // API Call: Session als beendet markieren
        try {
            await requestJson<{ success: boolean }>({
                target: 'platform',
                baseUrl: env.platformBaseUrl,
                path: `/platform/v1/impersonate/${logId}/end`,
                method: 'POST',
                bearerToken: snapshot.platform?.token ?? originalToken,
                body: '{}',
            });
        } catch {
            // Ignorieren — Session wird trotzdem lokal beendet
        }

        // Original-Session wiederherstellen (zurueck in localStorage)
        sessionStore.setImpersonation(null);
        sessionStore.setPlatform({
            token: originalToken,
            expiresAt: Date.now() + 3600 * 1000,
        });

        // Bootstrap als Admin neu laden
        await bootstrapLoader.load();
    },

    /**
     * Pruefe ob aktuell eine Impersonation aktiv ist.
     */
    isImpersonating(): boolean {
        return sessionStore.getSnapshot().impersonation !== null;
    },

    /**
     * Lade ungelesene Impersonation-Benachrichtigungen fuer den aktuellen User.
     */
    async getNotices(): Promise<ImpersonationNotice[]> {
        const snapshot = sessionStore.getSnapshot();
        if (!snapshot.platform) return [];

        try {
            const res = await requestJson<{ success: boolean; notices: ImpersonationNotice[] }>({
                target: 'platform',
                baseUrl: env.platformBaseUrl,
                path: '/platform/v1/impersonation-notices',
                method: 'GET',
                bearerToken: snapshot.platform.token,
            });
            return res.notices;
        } catch {
            return [];
        }
    },

    /**
     * Markiere alle Impersonation-Benachrichtigungen als gelesen.
     */
    async markNoticesRead(): Promise<void> {
        const snapshot = sessionStore.getSnapshot();
        if (!snapshot.platform) return;

        try {
            await requestJson<{ success: boolean }>({
                target: 'platform',
                baseUrl: env.platformBaseUrl,
                path: '/platform/v1/impersonation-notices/read',
                method: 'POST',
                bearerToken: snapshot.platform.token,
                body: '{}',
            });
        } catch {
            // Ignorieren
        }
    },
};
