/**
 * Lazy-Loader fuer pdfjs-dist. Wir ziehen pdf.js nur bei Bedarf, damit
 * der Haupt-Bundle nicht um ~800 KB waechst — PDFs sind ein seltener
 * Anhangs-Typ verglichen mit Bildern, und die meisten Chat-Sitzungen
 * werden nie eine PDF-Vorschau anfordern.
 *
 * Vite braucht den Worker als ?url-Import, damit er als eigener Chunk
 * gebaut wird. pdfjs-dist bringt den Worker in zwei Varianten mit (mjs
 * und js), wir nehmen die mjs-Variante weil unser Build-Target ESM ist.
 */

type PdfJsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJsModule> | null = null;

export async function loadPdfJs(): Promise<PdfJsModule> {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = (async () => {
        const pdfjs = await import('pdfjs-dist');
        // Worker als URL-Import. Vite bundelt ihn als separaten Asset-Chunk
        // und gibt die URL zurueck. Das funktioniert sowohl im Dev- als
        // auch im Build-Modus ohne weitere Config.
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        return pdfjs;
    })();
    return pdfjsPromise;
}
