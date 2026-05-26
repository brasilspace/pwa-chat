import { useEffect, useState } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import { logger } from '@/core/logging/logger';

const matrixGateway = createMatrixGateway();

// Prozess-weiter Cache. Matrix's Media-Config aendert sich nur bei
// Server-Config-Aenderungen, die wir nicht rennen sehen — also genau
// einmal pro Session fetchen reicht vollkommen.
let cachedLimitBytes: number | null = null;
let inflight: Promise<number | null> | null = null;

async function fetchLimit(): Promise<number | null> {
    if (cachedLimitBytes !== null) return cachedLimitBytes;
    if (inflight) return inflight;
    const token = sessionStore.getSnapshot().matrix?.accessToken;
    if (!token) return null;
    inflight = matrixGateway
        .getMediaConfig(token)
        .then((res) => {
            const size = res['m.upload.size'];
            if (typeof size === 'number' && size > 0) {
                cachedLimitBytes = size;
                return size;
            }
            return null;
        })
        .catch((err) => {
            logger.warn('getMediaConfig failed', { error: err });
            return null;
        })
        .finally(() => { inflight = null; });
    return inflight;
}

/**
 * Hook fuer die Matrix-Upload-Groesse in Bytes. Laedt automatisch
 * einmal pro Session. Waehrend des ersten Fetches liefert der Hook
 * null — Aufrufer sollten defensive gegen null pruefen.
 */
export function useUploadLimit(): number | null {
    const [limit, setLimit] = useState<number | null>(cachedLimitBytes);

    useEffect(() => {
        if (limit !== null) return;
        let cancelled = false;
        fetchLimit().then((value) => {
            if (!cancelled && value !== null) setLimit(value);
        });
        return () => { cancelled = true; };
    }, [limit]);

    return limit;
}

/** Bytes → Human-readable String fuer Fehlermeldungen. */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
