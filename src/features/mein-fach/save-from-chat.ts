/**
 * save-from-chat — Speichert eine Chat-Datei (Matrix mxc:// URL) ins eigene
 * Mein-Fach > Dokumente.
 *
 * Flow:
 *   1. Datei via Matrix-Access-Token von der Synapse holen (Bearer-Auth)
 *   2. Mein-Fach Upload-URL anfordern
 *   3. Datei via presigned PUT zu MinIO
 *   4. Confirm-Upload → Document-Row + Virus-Scan
 */

import { sessionStore } from '@/core/session/session-store';
import { meinFachApi } from './use-mein-fach';
import { toast } from '@/components/ui/toast';
import { env } from '@/core/config/env';

export interface SaveFromChatInput {
    mxcUrl: string;
    fileName: string;
    mimeType: string;
}

function parseMxc(mxc: string): { server: string; mediaId: string } | null {
    const m = mxc.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    return m ? { server: m[1], mediaId: m[2] } : null;
}

export async function saveAttachmentToMeinFach(input: SaveFromChatInput): Promise<boolean> {
    const session = sessionStore.getSnapshot();
    const matrixToken = session.matrix?.accessToken;
    if (!matrixToken) {
        toast.error('Matrix-Verbindung fehlt — bitte neu einloggen.');
        return false;
    }

    const parsed = parseMxc(input.mxcUrl);
    if (!parsed) {
        toast.error('Ungueltige Datei-URL.');
        return false;
    }

    try {
        // 1. Datei aus Matrix holen
        const url = `${env.matrixBaseUrl}/_matrix/client/v1/media/download/${parsed.server}/${parsed.mediaId}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${matrixToken}` } });
        if (!res.ok) {
            toast.error(`Datei konnte nicht aus Chat geladen werden (${res.status}).`);
            return false;
        }
        const blob = await res.blob();

        // 2. Mein-Fach Upload-URL
        const upload = await meinFachApi.getUploadUrl({
            fileName: input.fileName,
            mimeType: input.mimeType || blob.type || 'application/octet-stream',
            sizeBytes: blob.size,
        });
        if (!upload?.uploadUrl?.url) {
            toast.error('Datei-Speicher gerade nicht verfuegbar.');
            return false;
        }

        // 3. Direkt-Upload
        const putRes = await fetch(upload.uploadUrl.url, {
            method: 'PUT',
            headers: { 'Content-Type': input.mimeType || blob.type || 'application/octet-stream' },
            body: blob,
        });
        if (!putRes.ok) {
            toast.error(`Upload fehlgeschlagen (${putRes.status}).`);
            return false;
        }

        // 4. Confirm
        await meinFachApi.confirmUpload({
            storageKey: upload.storageKey,
            fileName: input.fileName,
            mimeType: input.mimeType || blob.type || 'application/octet-stream',
            sizeBytes: blob.size,
            description: 'Aus Chat in Mein Fach kopiert',
        });

        toast.success(`"${input.fileName}" in Mein Fach gespeichert.`);
        return true;
    } catch (err) {
        const msg = (err as Error).message ?? '';
        if (msg.includes('VIRUS') || msg.includes('422')) {
            toast.error('Datei wurde abgelehnt (Virus erkannt).');
        } else {
            toast.error(`Speichern fehlgeschlagen: ${msg || 'Unbekannter Fehler'}`);
        }
        return false;
    }
}
