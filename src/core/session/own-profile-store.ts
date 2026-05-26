// Eigenes-Profil-Store: hält avatarMxc + displayName des aktuellen Users
// zentral, damit Header, Mobile-Top-Bar und Settings-Page synchron bleiben.
// Settings ruft setAvatarMxc() nach Upload auf — alle Subscriber sehen die
// neue MXC-URL sofort, ohne Reload.
//
// Wird beim Bootstrap einmalig geladen (über loadFromMatrix), danach nur
// noch lokal aktualisiert.

import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';

export interface OwnProfile {
    displayName: string | null;
    avatarMxc: string | null;
    loaded: boolean;
}

let snapshot: OwnProfile = { displayName: null, avatarMxc: null, loaded: false };
const listeners = new Set<() => void>();
let loadingFor: string | null = null; // dedupe parallel loads per userId

const emit = (): void => {
    for (const l of listeners) l();
};

const matrixGateway = createMatrixGateway();

export const ownProfileStore = {
    getSnapshot(): OwnProfile {
        return snapshot;
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    setAvatarMxc(avatarMxc: string | null): void {
        snapshot = { ...snapshot, avatarMxc, loaded: true };
        emit();
    },

    setDisplayName(displayName: string | null): void {
        snapshot = { ...snapshot, displayName, loaded: true };
        emit();
    },

    /** Lädt das Profil per Matrix-API. Idempotent pro userId. */
    async loadFromMatrix(accessToken: string, userId: string): Promise<void> {
        if (loadingFor === userId) return;
        loadingFor = userId;
        try {
            const profile = await matrixGateway.getProfile(accessToken, userId);
            snapshot = {
                displayName: profile.displayname ?? null,
                avatarMxc: profile.avatar_url ?? null,
                loaded: true,
            };
            emit();
        } catch {
            // schweigend — UI fällt auf Initialen zurück
            snapshot = { ...snapshot, loaded: true };
            emit();
        } finally {
            loadingFor = null;
        }
    },

    clear(): void {
        snapshot = { displayName: null, avatarMxc: null, loaded: false };
        loadingFor = null;
        emit();
    },
};
