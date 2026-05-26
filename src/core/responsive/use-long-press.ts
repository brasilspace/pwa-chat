import { useCallback, useRef } from 'react';

/**
 * Touch-Long-Press-Hook fuer Mobile-Aktionen, die auf Desktop ein Hover-Menu sind.
 *
 * Pattern: pointerdown startet einen Timer, pointerup oder pointermove
 * (mit groesserer Distanz) bricht ihn ab. Wenn der Timer durchlaeuft,
 * feuert callback() — und wir vibrieren kurz fuer Haptic Feedback
 * (funktioniert auf Android, iOS ignoriert es still).
 *
 * Wir blockieren auf Long-Press das Standard-Kontextmenu (Right-Click /
 * iOS-Selection-Popup), weil das sonst gleichzeitig aufklappt und
 * UX-Chaos verursacht.
 *
 * Verwendung:
 *   const longPressHandlers = useLongPress(() => openActionsMenu(), 500);
 *   <div {...longPressHandlers}>...</div>
 */
export function useLongPress(callback: () => void, ms = 500) {
    const timerRef = useRef<number | null>(null);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);
    const triggeredRef = useRef(false);

    const clear = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startPosRef.current = null;
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        // Nur Touch — Maus-Long-Press waere unerwartetes Verhalten auf Desktop
        if (e.pointerType !== 'touch') return;
        triggeredRef.current = false;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        timerRef.current = window.setTimeout(() => {
            triggeredRef.current = true;
            // Haptic Feedback (Android, iOS ignoriert)
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try { navigator.vibrate(50); } catch { /* ignore */ }
            }
            callback();
        }, ms);
    }, [callback, ms]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!startPosRef.current) return;
        const dx = e.clientX - startPosRef.current.x;
        const dy = e.clientY - startPosRef.current.y;
        // Bewegung > 10px → User scrollt, kein Long-Press
        if (dx * dx + dy * dy > 100) clear();
    }, [clear]);

    const onPointerUp = useCallback(() => {
        clear();
    }, [clear]);

    const onPointerCancel = useCallback(() => {
        clear();
    }, [clear]);

    const onContextMenu = useCallback((e: React.MouseEvent) => {
        // Wenn wir gerade einen Long-Press ausgeloest haben, das System-
        // Kontextmenu unterdruecken — sonst kommt unser Bottom-Sheet UND
        // das Browser-Kontextmenu gleichzeitig.
        if (triggeredRef.current) {
            e.preventDefault();
            triggeredRef.current = false;
        }
    }, []);

    return {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onContextMenu,
    };
}
