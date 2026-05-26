import { useCallback, useRef } from 'react';

/**
 * Detect "swipe right to go back" auf einem beliebigen Element. Im Gegensatz zu
 * useEdgeSwipeBack, das nur am linken Bildschirmrand triggert, fuehrt dieser
 * Hook die Geste auf dem ganzen Element aus — gedacht fuer den Chat-Panel auf
 * Mobile, wo der User intuitiv von ueberall im Hauptfenster nach rechts wischen
 * koennen soll, um zur Spaces-Liste zurueckzukehren.
 *
 * Schwellen:
 *  - dx >= 80px nach rechts
 *  - dy < 60px (sonst ist es vertikales Scrollen)
 *  - dt <= 600ms (sonst ist es kein Wisch sondern ein langsames Ziehen)
 *
 * Die Geste konkurriert mit dem horizontalen Scroll-Snap (Chat <-> Info-Panel),
 * funktioniert aber: wenn der User auf dem linken Snap-Punkt (Chat) ist und
 * nach rechts wischt, kann der Snap-Container nicht weiter nach links gehen
 * — also bewegt sich nichts visuell, aber unser Handler feuert und navigiert.
 */
export function useSwipeRightToBack(enabled: boolean, onBack: () => void) {
    const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
    const onBackRef = useRef(onBack);
    onBackRef.current = onBack;

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (!enabled || e.touches.length !== 1) return;
        const t = e.touches[0];
        startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    }, [enabled]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        const start = startRef.current;
        if (!enabled || !start || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - start.x;
        const dy = Math.abs(t.clientY - start.y);
        const dt = Date.now() - start.t;

        // Vertikales Scrollen — kein Back-Swipe
        if (dy > 60) {
            startRef.current = null;
            return;
        }
        // Linkswisch (negative dx) ist kein Back-Swipe
        if (dx < 0 && Math.abs(dx) > 20) {
            startRef.current = null;
            return;
        }
        if (dx >= 80 && dt <= 600) {
            startRef.current = null;
            onBackRef.current();
        }
    }, [enabled]);

    const onTouchEnd = useCallback(() => {
        startRef.current = null;
    }, []);

    return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd };
}
