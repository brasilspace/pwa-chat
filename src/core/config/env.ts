const required = (value: string | undefined, key: string): string => {
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }

    return value;
};

// When VITE_MATRIX_BASE_URL is empty, derive from current origin (customer domain)
const resolveMatrixBaseUrl = (): string => {
    const explicit = import.meta.env.VITE_MATRIX_BASE_URL;

    if (explicit) {
        return explicit;
    }

    // In browser: use origin + /_matrix as default
    if (typeof window !== 'undefined') {
        return `${window.location.origin}/_matrix`;
    }

    return '/_matrix';
};

export const env = {
    platformBaseUrl: required(import.meta.env.VITE_PLATFORM_BASE_URL, 'VITE_PLATFORM_BASE_URL'),
    matrixBaseUrl: resolveMatrixBaseUrl(),
    appName: import.meta.env.VITE_APP_NAME ?? 'Prilog',
    isDev: import.meta.env.DEV,
} as const;
