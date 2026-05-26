import { useEffect, useState } from 'react';
import { useMatrixMedia } from '@/components/ui/use-matrix-media';
import { loadPdfJs } from './pdf-loader';
import { logger } from '@/core/logging/logger';

const cache = new Map<string, string>();

/**
 * Rendered die erste Seite einer PDF-Datei als Thumbnail und liefert
 * eine data: URL zurueck. Verwendet useMatrixMedia fuers Fetch (inkl.
 * Auth-Handling und blob-Caching) und pdfjs fuers Rendering.
 *
 * Implementations-Notizen:
 *  - Wir laden die PDF als ArrayBuffer (via fetch der blob: URL), weil
 *    pdfjs v5's getDocument({ url }) mit blob: URLs manchmal zickt.
 *    ArrayBuffer via { data } ist die robusteste Methode.
 *  - Die resultierende data: URL wird pro mxcUri gecacht — ein PDF, das
 *    in mehreren Bubbles auftaucht, wird nur einmal gerendert.
 *  - Fehler werden sichtbar im Console geloggt, damit wir beim Debuggen
 *    sofort sehen was schiefgeht.
 */
export function usePdfThumbnail(mxcUri: string | null | undefined, accessToken: string | null | undefined): string | null {
    const pdfBlobUrl = useMatrixMedia(mxcUri, accessToken);
    const [dataUrl, setDataUrl] = useState<string | null>(() => (mxcUri ? cache.get(mxcUri) ?? null : null));

    useEffect(() => {
        if (!mxcUri || !pdfBlobUrl) return;
        const cached = cache.get(mxcUri);
        if (cached) { setDataUrl(cached); return; }

        let cancelled = false;
        (async () => {
            try {
                // 1) Blob als ArrayBuffer holen — robuster als blob: URL an pdfjs
                const res = await fetch(pdfBlobUrl);
                if (!res.ok) throw new Error(`fetch blob failed: ${res.status}`);
                const data = await res.arrayBuffer();
                if (cancelled) return;

                // 2) pdfjs lazy-laden (incl. Worker-Setup)
                const pdfjs = await loadPdfJs();
                if (cancelled) return;

                // 3) Dokument parsen, Seite 1 holen
                const loadingTask = pdfjs.getDocument({ data });
                const pdf = await loadingTask.promise;
                if (cancelled) { pdf.destroy(); return; }
                const page = await pdf.getPage(1);

                // 4) Viewport skalieren: max 600px lange Kante
                const viewport = page.getViewport({ scale: 1 });
                const MAX = 600;
                const scale = Math.min(MAX / viewport.width, MAX / viewport.height, 2);
                const scaledViewport = page.getViewport({ scale });

                // 5) Canvas anlegen, rendern
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(scaledViewport.width);
                canvas.height = Math.ceil(scaledViewport.height);
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas context not available');

                // pdfjs v5 API: canvas als primaerer Parameter (canvasContext
                // ist optional / backward-compat). Wir uebergeben beide,
                // damit wir sowohl alte als auch neue Versionen abdecken.
                await page.render({
                    canvas,
                    canvasContext: ctx,
                    viewport: scaledViewport,
                }).promise;

                if (cancelled) { pdf.destroy(); return; }

                // 6) Als Data-URL exportieren und cachen
                const result = canvas.toDataURL('image/jpeg', 0.85);
                cache.set(mxcUri, result);
                if (!cancelled) setDataUrl(result);

                pdf.destroy();
            } catch (err) {
                logger.error('usePdfThumbnail render failed', { error: err, mxcUri });
                // Console.error zusaetzlich, damit man's im DevTools sieht auch
                // wenn der logger selbst failed.
                // eslint-disable-next-line no-console
                console.error('[usePdfThumbnail] render failed', err);
            }
        })();

        return () => { cancelled = true; };
    }, [mxcUri, pdfBlobUrl]);

    return dataUrl;
}
