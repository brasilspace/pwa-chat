import { type JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Card } from '@/components/ui/card';
import { meinFachApi } from './use-mein-fach';
import { toast } from '@/components/ui/toast';
import { useT } from "@/lib/i18n/use-t";

/**
 * ShareReceivePage — Endpoint fuer die PWA share_target Action.
 *
 * Android sendet beim "Teilen → Prilog" eine POST-Anfrage mit multipart/form-data
 * an /mein-fach/share-receive. Der Service-Worker (workbox) faengt das ab und
 * legt die Datei in IndexedDB ('shared-files'); dann redirect zu dieser Seite.
 *
 * IMPLEMENTIERUNGS-STATUS:
 *   - Manifest-Eintrag (vite.config.ts) → fertig
 *   - Service-Worker IndexedDB-Bridge → MVP: nicht implementiert (vite-plugin-pwa
 *     mit generateSW erlaubt keine custom fetch handler ohne injectManifest-
 *     Strategie). Diese Seite zeigt deshalb aktuell einen Hinweis-Text.
 *   - Vollstaendige Implementation: switch auf strategies='injectManifest'
 *     mit eigenem sw.ts und FetchEvent.respondWith → IndexedDB.put → 303 nach
 *     /mein-fach/share-receive.
 */
export const ShareReceivePage = (): JSX.Element => {
    const t = useT();
    const navigate = useNavigate();
    const [stage, setStage] = useState<'checking' | 'no-file' | 'uploading' | 'done' | 'error'>('checking');

    useEffect(() => {
        // Versuch 1: SW hat Datei in IDB ablegen koennen
        const checkIdb = async () => {
            try {
                const db = await openShareIdb();
                const file = await readSharedFile(db);
                if (!file) {
                    setStage('no-file');
                    return;
                }
                setStage('uploading');
                await uploadToFach(file);
                setStage('done');
                setTimeout(() => navigate('/mein-fach'), 1500);
            } catch (err) {
                console.error('share-receive', err);
                setStage('error');
            }
        };
        void checkIdb();
    }, [navigate]);

    return (
        <div className="flex h-full items-center justify-center p-6">
            <Card className="max-w-md p-6 text-center">
                <MaterialIcon name="inbox" size={16} className="mx-auto size-10 text-primary" />
                <h2 className="mt-3 text-lg font-semibold">{t('mein-fach.share_receive.mobile_share')}</h2>
                {stage === 'checking' && <p className="mt-2 text-sm text-muted-foreground">{t('mein-fach.share_receive.pruefe_geteilte_datei')}</p>}
                {stage === 'uploading' && (
                    <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> {t('mein-fach.share_receive.lade_in_mein_fach')}
                    </p>
                )}
                {stage === 'done' && <p className="mt-2 text-sm text-emerald-600">{t('mein-fach.share_receive.hochgeladen')}</p>}
                {stage === 'no-file' && (
                    <>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t('mein-fach.share_receive.keine_geteilte_datei_gefunden_diese_seit')}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t('mein-fach.share_receive.auf_android_system-share_prilog_datei_la')}
                        </p>
                    </>
                )}
                {stage === 'error' && (
                    <p className="mt-2 text-sm text-destructive">{t('mein-fach.share_receive.upload_fehlgeschlagen_bitte_aus_dem_mein')}</p>
                )}
            </Card>
        </div>
    );
};

// ─── IndexedDB-Bridge ────────────────────────────────────────────────────────

const DB_NAME = 'prilog-share';
const STORE = 'pending';

function openShareIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function readSharedFile(db: IDBDatabase): Promise<File | null> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const get = store.get('latest');
        get.onsuccess = () => {
            const file = get.result as File | undefined;
            if (file) {
                // einmal-konsumieren, damit nach Reload nichts doppelt hochgeladen wird
                store.delete('latest');
            }
            resolve(file ?? null);
        };
        get.onerror = () => reject(get.error);
    });
}

async function uploadToFach(file: File) {
    const upload = await meinFachApi.getUploadUrl({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
    });
    if (!upload?.uploadUrl?.url) throw new Error('Upload-URL nicht verfuegbar');
    await fetch(upload.uploadUrl.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    await meinFachApi.confirmUpload({
        storageKey: upload.storageKey,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        description: 'Aus Mobile-Share empfangen',
    });
    toast.success(`"${file.name}" in Mein Fach gespeichert.`);
}
