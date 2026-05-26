import { tokenStore } from './token-store';
import type {
    BootstrapData,
    ImpersonationData,
    MatrixSession,
    PermissionsData,
    PlatformSession,
    SessionSnapshot,
    SessionState,
} from './session-types';

const listeners = new Set<() => void>();

// Nur ein vollständiges, wiederaufnehmbares Token-Paar (matrix + platform)
// startet in 'matrix_authenticated' — RequireAuth setzt dann Exchange +
// Bootstrap fort. Ein VERWAISTES Einzel-Token (z.B. nur matrix, weil ein
// Login zwischen matrixAuthenticated und platformAuthenticated abbrach)
// ist nutzlos: es gibt keinen Resume-Pfad, die Login-Seite hing dann in
// einem treiberlosen Endlos-Spinner ("Matrix verbunden", rssw 2026-05-19).
// Darum: verwaiste Token verwerfen und sauber als logged_out starten.
const persistedMatrix = tokenStore.readMatrix();
const persistedPlatform = tokenStore.readPlatform();
const resumable = Boolean(persistedMatrix?.accessToken && persistedPlatform?.token);
if (!resumable) tokenStore.clear();

let snapshot: SessionSnapshot = {
    state: resumable ? 'matrix_authenticated' : 'logged_out',
    matrix: resumable ? persistedMatrix : null,
    platform: resumable ? persistedPlatform : null,
    bootstrap: null,
    permissions: null,
    lastError: null,
    impersonation: null,
};

const emit = (): void => {
    for (const listener of listeners) {
        listener();
    }
};

export const sessionStore = {
    getSnapshot(): SessionSnapshot {
        return snapshot;
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },

    setState(state: SessionState, lastError: string | null = null): void {
        snapshot = { ...snapshot, state, lastError };
        emit();
    },

    setMatrix(matrix: MatrixSession): void {
        tokenStore.saveMatrix(matrix);
        snapshot = { ...snapshot, matrix };
        emit();
    },

    setPlatform(platform: PlatformSession): void {
        tokenStore.savePlatform(platform);
        snapshot = { ...snapshot, platform };
        emit();
    },

    /** Setzt Platform-Token nur in-memory (nicht in localStorage). Fuer Impersonation. */
    setPlatformInMemory(platform: PlatformSession): void {
        snapshot = { ...snapshot, platform };
        emit();
    },

    setBootstrap(bootstrap: BootstrapData): void {
        snapshot = { ...snapshot, bootstrap };
        emit();
    },

    setPermissions(permissions: PermissionsData): void {
        snapshot = { ...snapshot, permissions };
        emit();
    },

    setImpersonation(impersonation: ImpersonationData | null): void {
        snapshot = { ...snapshot, impersonation };
        emit();
    },

    clear(): void {
        tokenStore.clear();
        snapshot = {
            state: 'logged_out',
            matrix: null,
            platform: null,
            bootstrap: null,
            permissions: null,
            lastError: null,
            impersonation: null,
        };
        emit();
    },
};
