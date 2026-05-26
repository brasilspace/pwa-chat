/**
 * Erzeugt clientseitig einen Poster-Frame aus einem Video. Matrix-Clients
 * wie Element machen das genauso: <video> in-memory laden, auf 0.5s
 * seeken (damit der erste schwarze Frame umgangen wird), den Frame auf
 * ein Canvas zeichnen und als JPEG exportieren.
 *
 * Die Zielaufloesung wird auf max. 640px lange Kante begrenzt — mehr
 * braucht ein Chat-Thumbnail nie, und es spart Upload-Bandbreite.
 *
 * Gibt null zurueck, wenn das Browser den Codec nicht decoden kann
 * oder aus sonstigen Gruenden scheitert (fehlende tainted-canvas
 * Rechte kommen bei reinen File-API-Quellen nicht vor, sind aber
 * defensiv abgefangen).
 */
export async function generateVideoThumbnail(file: File): Promise<{
    blob: Blob;
    width: number;
    height: number;
} | null> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        // crossOrigin ist nicht noetig bei blob: URLs, aber schadet nicht
        video.crossOrigin = 'anonymous';
        video.src = objectUrl;

        // Metadaten laden — dann kennen wir Duration + Abmessungen
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                video.removeEventListener('loadedmetadata', onLoaded);
                video.removeEventListener('error', onError);
            };
            const onLoaded = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error('video metadata load failed')); };
            video.addEventListener('loadedmetadata', onLoaded, { once: true });
            video.addEventListener('error', onError, { once: true });
        });

        // Auf 0.5s seeken (oder Mitte wenn kuerzer als 1s), damit der
        // Thumbnail nicht der schwarze Startframe wird.
        const seekTarget = Math.min(0.5, (video.duration || 1) / 2);
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
            };
            const onSeeked = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error('video seek failed')); };
            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('error', onError, { once: true });
            video.currentTime = seekTarget;
        });

        // Zielgroesse: max 640px lange Kante
        const srcW = video.videoWidth || 640;
        const srcH = video.videoHeight || 360;
        const MAX = 640;
        const scale = srcW >= srcH ? Math.min(1, MAX / srcW) : Math.min(1, MAX / srcH);
        const targetW = Math.round(srcW * scale);
        const targetH = Math.round(srcH * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, targetW, targetH);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
        });
        if (!blob) return null;

        return { blob, width: targetW, height: targetH };
    } catch {
        return null;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
