/**
 * Upload-Error-Helper — zeigt benutzerfreundliche Toasts bei
 * Upload-Fehlschlaegen, mit Sonder-Behandlung fuer ClamAV-Treffer.
 *
 * Wenn das Backend 422 mit details.signature liefert, hat ClamAV den
 * Upload als Malware erkannt. Wir zeigen die Signatur damit der User
 * weiss "es war keine willkuerliche Ablehnung sondern ein konkreter
 * Virus-Treffer".
 */

import { toast } from '@/components/ui/toast';
import { PrilogApiError } from '@/core/errors/prilog-error';

export function showUploadError(err: unknown, defaultMessage = 'Upload fehlgeschlagen'): void {
    if (err instanceof PrilogApiError && err.status === 422) {
        const signature = (err.payload?.details as { signature?: string } | undefined)?.signature;
        if (signature) {
            toast.error(`🛡️ Malware erkannt — Datei abgelehnt (${signature})`);
            return;
        }
    }
    const detail = err instanceof Error ? err.message : String(err);
    toast.error(`${defaultMessage}: ${detail.slice(0, 120)}`);
}

export function isAvBlock(err: unknown): boolean {
    if (!(err instanceof PrilogApiError)) return false;
    if (err.status !== 422) return false;
    return Boolean((err.payload?.details as { signature?: string } | undefined)?.signature);
}
