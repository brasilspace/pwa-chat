/**
 * Prilog Internal File-Link Schema: `prilog://file/<documentId>`
 *
 * Universal Verweis auf eine Datei im DMS (Mein Fach + Space-Files).
 * Wird vom Backend zu einer Presigned-Download-URL aufgeloest, die 15 Min
 * gueltig ist. Renderer in Tiptap/Guide-Player/Letters substituieren das
 * vor Display.
 *
 * Erkennung: parsePrilogFileLink('prilog://file/cmoabc...') → 'cmoabc...'
 * Erzeugung: buildPrilogFileLink('cmoabc...') → 'prilog://file/cmoabc...'
 */

import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface ResolvedFile {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    downloadUrl: string;
    expiresAt: string;
}

const PRILOG_LINK_PREFIX = 'prilog://file/';

export function isPrilogFileLink(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PRILOG_LINK_PREFIX);
}

export function parsePrilogFileLink(value: string): string | null {
    if (!isPrilogFileLink(value)) return null;
    const id = value.slice(PRILOG_LINK_PREFIX.length).trim();
    return id || null;
}

export function buildPrilogFileLink(documentId: string): string {
    return `${PRILOG_LINK_PREFIX}${documentId}`;
}

/** In-flight + done cache, damit ein Bild im Player nicht 5x resolved wird. */
const resolveCache = new Map<string, Promise<ResolvedFile>>();
const RESOLVED_TTL_MS = 12 * 60_000; // 12 min — kurz vor presigned-Ablauf (15 min)

export function resolvePrilogFile(documentId: string, jwt: string): Promise<ResolvedFile> {
    const cached = resolveCache.get(documentId);
    if (cached) return cached;

    const p = requestJson<ResolvedFile>({
        target: 'platform',
        baseUrl: env.platformBaseUrl,
        path: `/platform/v1/files/${encodeURIComponent(documentId)}/resolve`,
        method: 'GET',
        bearerToken: jwt,
    });

    resolveCache.set(documentId, p);
    // Cache nach Ablauf entsorgen
    setTimeout(() => { resolveCache.delete(documentId); }, RESOLVED_TTL_MS);
    // Bei Fehler nicht cachen — sonst bleibt ein toter Eintrag haengen
    p.catch(() => { resolveCache.delete(documentId); });
    return p;
}

/** Bei prilog-Link → Resolver, sonst direkt als externe URL zurueckgeben. */
export async function resolveImageUrl(src: string, jwt: string | null | undefined): Promise<string> {
    const id = parsePrilogFileLink(src);
    if (!id || !jwt) return src;
    try {
        const resolved = await resolvePrilogFile(id, jwt);
        return resolved.downloadUrl;
    } catch {
        return src; // Fallback: Browser zeigt broken-image, besser als Crash
    }
}
