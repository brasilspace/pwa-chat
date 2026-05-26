import { useEffect, useRef } from 'react';

/**
 * Erkennt einen "Swipe-from-left-edge"-Gesten — die iOS/Android-Konvention
 * fuer "Zurueck". Im normalen Browser uebernimmt das System das, aber im
 * PWA-Standalone-Mode (ohne Browser-Chrome) muessen wir die Geste selbst
 * implementieren.
 *
 * Heuristik:
 *  - Touch-Start in den linken 24px des Bildschirms
 *  - Bewegung mind. 80px nach rechts
 *  - Vertikale Bewegung weniger als 60px (nicht versehentlich beim Scrollen
 *    triggern)
 *  - Geste muss innerhalb von 600ms abgeschlossen sein
 *
 * Wir attachen den Listener an `document` im Capture-Phase, damit der
 * Gestur auch funktioniert, wenn die Touch-Events innerhalb eines
 * scroll-snap-Containers (wie ResizablePanels auf Mobile) starten.
 *
 * Aktiv nur wenn `enabled` true ist (z.B. nur in deep views, nicht auf
 * der Spaces-Liste selbst).
 */
export function useEdgeSwipeBack(enabled: boolean, onBack: () => void): void {
    const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
    const onBackRef = useRef(onBack);
    onBackRef.current = onBack;

    useEffect(() => {
        if (!enabled) return;

        const EDGE_PX = 24;
        const MIN_DX = 80;
        const MAX_DY = 60;
        const MAX_MS = 600;

        function handleStart(e: TouchEvent) {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            if (t.clientX > EDGE_PX) {
                startRef.current = null;
                return;
            }
            startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
        }

        function handleMove(e: TouchEvent) {
            const start = startRef.current;
            if (!start || e.touches.length !== 1) return;
            const t = e.touches[0];
            const dx = t.clientX - start.x;
            const dy = Math.abs(t.clientY - start.y);
            const dt = Date.now() - start.t;

            if (dy > MAX_DY) {
                // Vertikales Scrollen — kein Back-Swipe
                startRef.current = null;
                return;
            }

            if (dx >= MIN_DX && dt <= MAX_MS) {
                // Treffer — Back-Geste ausloesen
                startRef.current = null;
                onBackRef.current();
            }
        }

        function handleEnd() {
            startRef.current = null;
        }

        // Capture-Phase, damit wir die Events vor scroll-snap-Containern bekommen
        document.addEventListener('touchstart', handleStart, { capture: true, passive: true });
        document.addEventListener('touchmove', handleMove, { capture: true, passive: true });
        document.addEventListener('touchend', handleEnd, { capture: true, passive: true });
        document.addEventListener('touchcancel', handleEnd, { capture: true, passive: true });

        return () => {
            document.removeEventListener('touchstart', handleStart, { capture: true } as EventListenerOptions);
            document.removeEventListener('touchmove', handleMove, { capture: true } as EventListenerOptions);
            document.removeEventListener('touchend', handleEnd, { capture: true } as EventListenerOptions);
            document.removeEventListener('touchcancel', handleEnd, { capture: true } as EventListenerOptions);
        };
    }, [enabled]);
}
