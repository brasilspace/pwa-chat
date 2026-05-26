import { type JSX, useCallback, useRef, useState, useEffect } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface ImageCropperProps {
    imageUrl: string;
    onCrop: (blob: Blob) => void;
    onCancel: () => void;
    outputSize?: number;
}

export function ImageCropper({ imageUrl, onCrop, onCancel, outputSize = 256 }: ImageCropperProps): JSX.Element {
    const t = useT();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Image dimensions as displayed
    const [imgRect, setImgRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
    // Crop square position and size (in display coordinates)
    const [crop, setCrop] = useState({ x: 0, y: 0, size: 0 });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ mx: 0, my: 0, cx: 0, cy: 0 });
    const [ready, setReady] = useState(false);

    const handleImageLoad = useCallback(() => {
        const img = imgRef.current;
        const container = containerRef.current;
        if (!img || !container) return;

        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        const imgAspect = img.naturalWidth / img.naturalHeight;

        let dispW: number, dispH: number;
        if (imgAspect > containerW / containerH) {
            dispW = containerW;
            dispH = containerW / imgAspect;
        } else {
            dispH = containerH;
            dispW = containerH * imgAspect;
        }

        const dispX = (containerW - dispW) / 2;
        const dispY = (containerH - dispH) / 2;
        setImgRect({ x: dispX, y: dispY, w: dispW, h: dispH });

        // Initial crop: centered square, 70% of shortest side
        const cropSize = Math.min(dispW, dispH) * 0.7;
        setCrop({
            x: dispX + (dispW - cropSize) / 2,
            y: dispY + (dispH - cropSize) / 2,
            size: cropSize,
        });
        setReady(true);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        dragStart.current = { mx: e.clientX, my: e.clientY, cx: crop.x, cy: crop.y };
    }, [crop.x, crop.y]);

    useEffect(() => {
        if (!dragging) return;

        const handleMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStart.current.mx;
            const dy = e.clientY - dragStart.current.my;
            let nx = dragStart.current.cx + dx;
            let ny = dragStart.current.cy + dy;

            // Clamp to image bounds
            nx = Math.max(imgRect.x, Math.min(nx, imgRect.x + imgRect.w - crop.size));
            ny = Math.max(imgRect.y, Math.min(ny, imgRect.y + imgRect.h - crop.size));

            setCrop(c => ({ ...c, x: nx, y: ny }));
        };

        const handleUp = () => setDragging(false);

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [dragging, imgRect, crop.size]);

    // Mouse wheel to resize crop
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setCrop(c => {
            const delta = e.deltaY > 0 ? -10 : 10;
            const minSize = 40;
            const maxSize = Math.min(imgRect.w, imgRect.h);
            const newSize = Math.max(minSize, Math.min(maxSize, c.size + delta));

            // Keep centered
            const dx = (c.size - newSize) / 2;
            const dy = (c.size - newSize) / 2;
            let nx = c.x + dx;
            let ny = c.y + dy;
            nx = Math.max(imgRect.x, Math.min(nx, imgRect.x + imgRect.w - newSize));
            ny = Math.max(imgRect.y, Math.min(ny, imgRect.y + imgRect.h - newSize));

            return { x: nx, y: ny, size: newSize };
        });
    }, [imgRect]);

    const handleConfirm = useCallback(() => {
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas) return;

        // Convert display coords to image coords
        const scaleX = img.naturalWidth / imgRect.w;
        const scaleY = img.naturalHeight / imgRect.h;
        const srcX = (crop.x - imgRect.x) * scaleX;
        const srcY = (crop.y - imgRect.y) * scaleY;
        const srcSize = crop.size * scaleX;

        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outputSize, outputSize);
        canvas.toBlob(
            (blob) => { if (blob) onCrop(blob); },
            'image/webp',
            0.85,
        );
    }, [imgRect, crop, outputSize, onCrop]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl bg-background p-4 shadow-xl">
                <div className="text-sm font-medium">{t('app.misc.bildausschnitt_waehlen')}</div>
                <p className="text-xs text-muted-foreground">{t('app.misc.verschiebe_den_rahmen_oder_nutze_das_mau')}</p>

                <div
                    ref={containerRef}
                    className="relative h-80 overflow-hidden rounded-lg bg-black"
                    onWheel={handleWheel}
                >
                    <img
                        ref={imgRef}
                        src={imageUrl}
                        onLoad={handleImageLoad}
                        className="absolute max-h-full max-w-full object-contain"
                        style={{ left: imgRect.x, top: imgRect.y, width: imgRect.w || 'auto', height: imgRect.h || 'auto' }}
                        draggable={false}
                    />

                    {/* Darkened overlay outside crop area */}
                    {ready && (
                        <>
                            <div className="absolute inset-0 bg-black/50" style={{
                                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x}px ${crop.y}px, ${crop.x}px ${crop.y + crop.size}px, ${crop.x + crop.size}px ${crop.y + crop.size}px, ${crop.x + crop.size}px ${crop.y}px, ${crop.x}px ${crop.y}px)`,
                            }} />

                            {/* Crop frame */}
                            <div
                                onMouseDown={handleMouseDown}
                                className="absolute cursor-grab rounded-full border-2 border-white shadow-lg active:cursor-grabbing"
                                style={{
                                    left: crop.x,
                                    top: crop.y,
                                    width: crop.size,
                                    height: crop.size,
                                }}
                            />
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted"
                    >
                        <MaterialIcon name="close" size={16} className="size-4" /> {t('app.misc.abbrechen')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        <MaterialIcon name="check" size={16} className="size-4" /> {t('app.misc.zuschneiden')}
                    </button>
                </div>

                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    );
}
