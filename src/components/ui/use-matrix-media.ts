import { useEffect, useState } from 'react';
import { env } from '@/core/config/env';
import { sessionStore } from '@/core/session/session-store';

/**
 * Gemeinsamer Cache ueber alle Hook-Aufrufe. Key ist eine Kombination
 * aus mxcUri + thumbnail-Params, damit Thumbnail-Varianten sich nicht
 * gegenseitig verdraengen.
 *
 * Matrix authenticated media endpoints (/client/v1/media/*) verlangen
 * den Bearer-Token im Authorization-Header — Query-Param ?access_token=
 * funktioniert nicht. Da <img src> keine Custom-Header senden kann,
 * muessen wir die Datei via fetch() mit Authorization-Header holen und
 * daraus eine blob: URL bauen.
 */
const mediaCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export interface MatrixThumbnailOptions {
    width: number;
    height: number;
    /** 'crop' fuellt den Rahmen, 'scale' erhaelt das Seitenverhaeltnis. Default scale. */
    method?: 'crop' | 'scale';
}

function buildUrl(serverName: string, mediaId: string, thumbnail?: MatrixThumbnailOptions): string {
    if (thumbnail) {
        return `${env.matrixBaseUrl}/client/v1/media/thumbnail/${serverName}/${mediaId}`
            + `?width=${thumbnail.width}&height=${thumbnail.height}&method=${thumbnail.method ?? 'scale'}&animated=true`;
    }
    return `${env.matrixBaseUrl}/client/v1/media/download/${serverName}/${mediaId}`;
}

function cacheKey(mxcUri: string, thumbnail?: MatrixThumbnailOptions): string {
    return thumbnail ? `${mxcUri}|${thumbnail.width}x${thumbnail.height}|${thumbnail.method ?? 'scale'}` : mxcUri;
}

async function fetchMedia(mxcUri: string, accessToken: string, thumbnail?: MatrixThumbnailOptions): Promise<string | null> {
    const key = cacheKey(mxcUri, thumbnail);
    const cached = mediaCache.get(key);
    if (cached) return cached;

    const existing = inflight.get(key);
    if (existing) return existing;

    // Phase 11: Pseudo-mxc-URLs (mxc://__prilog__/<docId>) zeigen auf das DMS,
    // nicht auf Synapse. Wir holen die presigned-URL und laden sie als Blob.
    const prilogMatch = mxcUri.match(/^mxc:\/\/__prilog__\/(.+)$/);
    if (prilogMatch) {
        const docId = prilogMatch[1];
        const session = sessionStore.getSnapshot();
        const platformToken = session.platform?.token;
        if (!platformToken) return null;

        const promise = fetch(`${env.platformBaseUrl}/platform/v1/documents/${encodeURIComponent(docId)}/preview`, {
            headers: { Authorization: `Bearer ${platformToken}` },
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`DMS preview failed: ${res.status}`);
                const json = await res.json() as { previewUrl: string };
                // Direkt die presigned URL als Blob laden, damit <img src=blob:>
                // funktioniert wie bei Matrix-Media (selber Lebenszyklus + Cache).
                const blobRes = await fetch(json.previewUrl);
                if (!blobRes.ok) throw new Error(`DMS S3 fetch failed: ${blobRes.status}`);
                const blob = await blobRes.blob();
                const blobUrl = URL.createObjectURL(blob);
                mediaCache.set(key, blobUrl);
                return blobUrl;
            })
            .catch(() => null)
            .finally(() => { inflight.delete(key); });
        inflight.set(key, promise);
        return promise;
    }

    const match = mxcUri.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) return null;

    const url = buildUrl(match[1], match[2], thumbnail);
    const promise = fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(async (res) => {
            if (!res.ok) throw new Error(`Matrix media fetch failed: ${res.status}`);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            mediaCache.set(key, blobUrl);
            return blobUrl;
        })
        .catch(() => null)
        .finally(() => { inflight.delete(key); });

    inflight.set(key, promise);
    return promise;
}

/**
 * Lazy-Lazy-Load eines Matrix-Medien-Objekts als blob: URL.
 *
 * Bei Bildern uebergibt man `thumbnail`-Dimensionen, um einen
 * Server-seitig verkleinerten Thumbnail zu holen — spart Bandbreite,
 * loest das authentifizierte-Media-Problem und haelt das DOM klein.
 * Ohne thumbnail wird die Originaldatei heruntergeladen (fuer
 * "Klick → Original oeffnen / downloaden").
 */
export function useMatrixMedia(
    mxcUri: string | null | undefined,
    accessToken: string | null | undefined,
    thumbnail?: MatrixThumbnailOptions,
): string | null {
    const [url, setUrl] = useState<string | null>(() => {
        if (!mxcUri) return null;
        return mediaCache.get(cacheKey(mxcUri, thumbnail)) ?? null;
    });

    useEffect(() => {
        if (!mxcUri || !accessToken) { setUrl(null); return; }
        let cancelled = false;
        fetchMedia(mxcUri, accessToken, thumbnail).then((blobUrl) => {
            if (!cancelled) setUrl(blobUrl);
        });
        return () => { cancelled = true; };
    // thumbnail ist ein Objekt — wir haengen an den Werten, nicht an der Referenz
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mxcUri, accessToken, thumbnail?.width, thumbnail?.height, thumbnail?.method]);

    return url;
}

/**
 * Triggered einen Download als Benutzer-Klick. Holt die Datei via fetch
 * mit Bearer-Token und simuliert einen <a download>-Klick auf die
 * entstehende blob: URL. So umgeht man das authentifizierte-Media-
 * Problem auch fuer Downloads.
 */
export async function triggerMatrixDownload(mxcUri: string, accessToken: string, filename: string): Promise<void> {
    const blobUrl = await fetchMedia(mxcUri, accessToken);
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
