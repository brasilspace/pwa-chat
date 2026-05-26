import type { MatrixSession, PlatformSession } from './session-types';

const MATRIX_KEY = 'prilog.matrix.session';
const PLATFORM_KEY = 'prilog.platform.session';

export const tokenStore = {
    saveMatrix(session: MatrixSession): void {
        localStorage.setItem(MATRIX_KEY, JSON.stringify(session));
    },

    readMatrix(): MatrixSession | null {
        const raw = localStorage.getItem(MATRIX_KEY);
        return raw ? (JSON.parse(raw) as MatrixSession) : null;
    },

    savePlatform(session: PlatformSession): void {
        localStorage.setItem(PLATFORM_KEY, JSON.stringify(session));
    },

    readPlatform(): PlatformSession | null {
        const raw = localStorage.getItem(PLATFORM_KEY);
        return raw ? (JSON.parse(raw) as PlatformSession) : null;
    },

    clear(): void {
        localStorage.removeItem(MATRIX_KEY);
        localStorage.removeItem(PLATFORM_KEY);
    },
};