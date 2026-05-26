import { useEffect, useState } from 'react';
import { env } from '@/core/config/env';

const cache = new Map<string, string>();

/**
 * Fetches a Matrix media thumbnail with auth header and returns a blob URL.
 * Results are cached in memory.
 */
export function useMatrixAvatar(mxcUri: string | null | undefined, accessToken: string | null | undefined): string | null {
    const [url, setUrl] = useState<string | null>(() => {
        if (!mxcUri) return null;
        return cache.get(mxcUri) ?? null;
    });

    useEffect(() => {
        if (!mxcUri || !accessToken) { setUrl(null); return; }

        // Already cached
        const cached = cache.get(mxcUri);
        if (cached) { setUrl(cached); return; }

        const match = mxcUri.match(/^mxc:\/\/([^/]+)\/(.+)$/);
        if (!match) return;

        let cancelled = false;
        const fetchUrl = `${env.matrixBaseUrl}/client/v1/media/thumbnail/${match[1]}/${match[2]}?width=64&height=64&method=crop`;

        fetch(fetchUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
            .then((res) => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.blob();
            })
            .then((blob) => {
                const blobUrl = URL.createObjectURL(blob);
                cache.set(mxcUri, blobUrl);
                if (!cancelled) setUrl(blobUrl);
            })
            .catch(() => {
                // Silently fail — fallback to initials
            });

        return () => { cancelled = true; };
    }, [mxcUri, accessToken]);

    return url;
}
