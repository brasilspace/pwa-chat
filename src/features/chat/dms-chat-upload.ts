/**
 * dms-chat-upload — Datei aus Chat-Composer ins DMS hochladen statt Synapse-mxc.
 *
 * Hintergrund: Phase 11 (2026-04-30). Vorher landete jeder Chat-Anhang per
 * Synapse-Content-Repository (mxc://) und wurde optional in ein paralleles
 * FileItem-Modell synced. Jetzt: alle Anhaenge gehen direkt ins DMS
 * (Document-Modell, scope=SPACE), liegen in Per-Tenant-S3, sind volltextsuchbar.
 *
 * Matrix-Message verwendet eine "interne mxc-URL" `mxc://__prilog__/<docId>`
 * die unser Chat-Renderer erkennt und als presigned S3-URL aufloest.
 * Andere Matrix-Clients (falls je angeschlossen) sehen das als nicht-ladbares
 * Medium — fuer Prilog egal, wir sind closed-loop.
 */

import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

interface UploadResponse {
    uploadUrl: string;
    storageKey: string;
    expiresAt: string;
}

interface ConfirmResponse {
    document: { id: string; storageKey: string; mimeType: string; sizeBytes: number };
}

export interface DmsChatUploadResult {
    documentId: string;
    /** Pseudo-mxc-URL die unser Chat-Renderer erkennt: mxc://__prilog__/<docId> */
    pseudoMxcUrl: string;
    storageKey: string;
}

/**
 * Laedt Datei ueber den 2-Step-DMS-Flow hoch:
 *   1. POST /spaces/:id/documents/upload → presigned S3 URL
 *   2. PUT auf presigned URL → S3
 *   3. POST /spaces/:id/documents/confirm-upload → Document-Eintrag
 *
 * Returnt eine Pseudo-mxc-URL die in der Matrix-Message als content.url
 * gesetzt wird. Der Chat-Renderer matcht "mxc://__prilog__/" und ruft den
 * preview-Endpoint statt Synapse-Media-Repo an.
 */
export async function uploadFileForChat(
    platformJwt: string,
    spaceId: string,
    file: File,
): Promise<DmsChatUploadResult> {
    const base = env.platformBaseUrl;

    // 1. Presigned URL holen
    const presigned = await requestJson<UploadResponse>({
        target: 'platform', baseUrl: base,
        path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/documents/upload`,
        method: 'POST', bearerToken: platformJwt,
        body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
        }),
    });

    // 2. Direkt zu S3 (ohne Backend-Proxy)
    const putRes = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
        },
    });
    if (!putRes.ok) throw new Error(`S3-Upload fehlgeschlagen: ${putRes.status}`);

    // 3. Document-Eintrag bestaetigen
    const confirmed = await requestJson<ConfirmResponse>({
        target: 'platform', baseUrl: base,
        path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/documents/confirm-upload`,
        method: 'POST', bearerToken: platformJwt,
        body: JSON.stringify({
            storageKey: presigned.storageKey,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
        }),
    });

    return {
        documentId: confirmed.document.id,
        pseudoMxcUrl: `mxc://__prilog__/${confirmed.document.id}`,
        storageKey: confirmed.document.storageKey,
    };
}

/**
 * Holt eine presigned Inline-URL fuer ein Dokument — wird vom Chat-Renderer
 * benutzt um Bilder/Videos per <img src=...> oder <video src=...> zu zeigen.
 *
 * URL ist 15 Min gueltig. Renderer cached + holt bei Ablauf neu.
 */
export async function getDocumentPreviewUrl(
    platformJwt: string,
    spaceId: string,
    documentId: string,
): Promise<{ url: string; mimeType: string }> {
    const r = await requestJson<{ previewUrl: string | null; mimeType: string; extractedContent?: string | null }>({
        target: 'platform', baseUrl: env.platformBaseUrl,
        path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/documents/${encodeURIComponent(documentId)}/preview`,
        method: 'GET', bearerToken: platformJwt,
    });
    if (!r.previewUrl) throw new Error('Keine Preview-URL fuer Dokument');
    return { url: r.previewUrl, mimeType: r.mimeType };
}

/**
 * Erkennt ob eine mxc-URL eine Pseudo-DMS-URL ist und extrahiert die
 * documentId.
 */
export function parsePseudoMxc(url: string): { documentId: string } | null {
    const m = /^mxc:\/\/__prilog__\/(.+)$/.exec(url);
    return m ? { documentId: m[1] } : null;
}
