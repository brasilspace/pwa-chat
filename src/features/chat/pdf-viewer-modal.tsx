import { type JSX, useEffect, useRef, useState } from 'react';
import { loadPdfJs } from './pdf-loader';
import { triggerMatrixDownload } from '@/components/ui/use-matrix-media';
import { logger } from '@/core/logging/logger';
import { Loader2, Download } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface PdfViewerModalProps {
    /** Blob-URL der bereits geholten PDF-Datei (durch useMatrixMedia). */
    pdfBlobUrl: string;
    filename: string;
    /** Fuer den Download-Button: Original-mxc + Access-Token. */
    mxcUri: string;
    accessToken: string;
    onClose: () => void;
}

/**
 * Einfacher Modal-PDF-Viewer. Rendered Seiten via pdfjs in ein Canvas,
 * Navigation per Prev/Next. Wir laden nur die aktuelle Seite ins Canvas
 * und tauschen beim Wechseln aus — das spart Speicher bei langen PDFs.
 *
 * Bewusst einfach gehalten: keine Zoom-Steuerung, kein Text-Layer, keine
 * Annotationen. Fuer "kurz reinschauen im Chat" reicht das vollstaendig,
 * wer mehr braucht, klickt Download und oeffnet die Datei lokal.
 */
export function PdfViewerModal({ pdfBlobUrl, filename, mxcUri, accessToken, onClose }: PdfViewerModalProps): JSX.Element {
    const t = useT();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdfDoc, setPdfDoc] = useState<Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfJs>>['getDocument']>['promise']> | null>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [rendering, setRendering] = useState(false);

    // PDF laden (einmalig). Wir fetchen den Blob selbst als ArrayBuffer und
    // uebergeben ihn als { data } — robuster als blob: URLs an pdfjs direkt.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(pdfBlobUrl);
                if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
                const data = await res.arrayBuffer();
                if (cancelled) return;

                const pdfjs = await loadPdfJs();
                if (cancelled) return;

                const doc = await pdfjs.getDocument({ data }).promise;
                if (cancelled) { doc.destroy(); return; }

                setPdfDoc(doc);
                setNumPages(doc.numPages);
                setPageNum(1);
            } catch (err) {
                logger.error('PdfViewerModal load failed', { error: err });
                // eslint-disable-next-line no-console
                console.error('[PdfViewerModal] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pdfBlobUrl]);

    // Aktuelle Seite rendern
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return;
        let cancelled = false;
        setRendering(true);
        (async () => {
            try {
                const page = await pdfDoc.getPage(pageNum);
                if (cancelled) return;
                const container = canvasRef.current?.parentElement;
                if (!container || !canvasRef.current) return;

                // Skalieren auf Container-Breite. Wir nehmen 90% der Breite
                // und max. 90% der Hoehe.
                const maxW = container.clientWidth * 0.95;
                const maxH = container.clientHeight * 0.95;
                const viewport = page.getViewport({ scale: 1 });
                const scale = Math.min(maxW / viewport.width, maxH / viewport.height, 3);
                const scaledViewport = page.getViewport({ scale });

                const canvas = canvasRef.current;
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                await page.render({
                    canvas,
                    canvasContext: ctx,
                    viewport: scaledViewport,
                }).promise;
            } catch (err) {
                logger.warn('PdfViewerModal render page failed', { error: err });
                // eslint-disable-next-line no-console
                console.error('[PdfViewerModal] render failed', err);
            } finally {
                if (!cancelled) setRendering(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pdfDoc, pageNum]);

    // ESC schliesst, Pfeiltasten navigieren
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft') setPageNum((p) => Math.max(1, p - 1));
            else if (e.key === 'ArrowRight') setPageNum((p) => Math.min(numPages, p + 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [numPages, onClose]);

    const handleDownload = async () => {
        await triggerMatrixDownload(mxcUri, accessToken, filename);
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/80"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Toolbar */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-black/60 px-4 text-white">
                <span className="truncate text-sm font-medium">{filename}</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                        disabled={pageNum <= 1}
                        className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10 disabled:opacity-30"
                    >
                        <MaterialIcon name="chevron_left" size={16} className="size-4" />
                    </button>
                    <span className="text-xs tabular-nums">
                        {t('chat.pdf_viewer_modal.seite')} {pageNum} / {numPages || '…'}
                    </span>
                    <button
                        onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                        disabled={pageNum >= numPages}
                        className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10 disabled:opacity-30"
                    >
                        <MaterialIcon name="chevron_right" size={16} className="size-4" />
                    </button>
                    <div className="mx-2 h-6 w-px bg-white/20" />
                    <button
                        onClick={handleDownload}
                        className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                        title={t('chat.pdf_viewer_modal.herunterladen')}
                    >
                        <MaterialIcon name="download" size={16} className="size-4" />
                    </button>
                    <button
                        onClick={onClose}
                        className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                        title={t('chat.pdf_viewer_modal.schliessen')}
                    >
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>
            </div>

            {/* Canvas-Container */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
                {loading && <Loader2 className="size-8 animate-spin text-white" />}
                <canvas
                    ref={canvasRef}
                    className={cn('shadow-2xl', (loading || rendering) && 'opacity-60')}
                />
                {rendering && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="size-6 animate-spin text-white/70" />
                    </div>
                )}
            </div>
        </div>
    );
}
