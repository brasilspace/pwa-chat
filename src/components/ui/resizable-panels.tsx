import { type JSX, type ReactNode, forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { useT } from "@/lib/i18n/use-t";

interface ResizablePanelsProps {
    left: ReactNode;
    right: ReactNode;
    /** Default width of the left panel as fraction (0-1). Default: 0.65 */
    defaultLeftRatio?: number;
    /** Minimum width of the left panel as fraction. Default: 0.3 */
    minLeftRatio?: number;
    /** Maximum width of the left panel as fraction. Default: 0.85 */
    maxLeftRatio?: number;
    /** Hide the right panel entirely */
    rightCollapsed?: boolean;
    className?: string;
}

/**
 * Imperative API, die ueber forwardRef + useImperativeHandle exponiert wird.
 *
 * Auf Mobile: scrollt den Snap-Container zum jeweiligen Panel. Damit
 * koennen Eltern-Komponenten (z.B. ChatModule) einen "Info-Panel
 * oeffnen"-Button anbieten, ohne den Wisch-Gestur zu kennen.
 *
 * Auf Desktop: no-ops (gibt's keinen Snap-Container).
 */
export interface ResizablePanelsHandle {
    showInfoPanel(): void;
    showLeftPanel(): void;
}

export const ResizablePanels = forwardRef<ResizablePanelsHandle, ResizablePanelsProps>(function ResizablePanels({
    left,
    right,
    defaultLeftRatio = 0.65,
    minLeftRatio = 0.3,
    maxLeftRatio = 0.85,
    rightCollapsed = false,
    className,
}, ref): JSX.Element {
    const t = useT();
    const isMobile = useIsMobile();
    const [leftRatio, setLeftRatio] = useState(defaultLeftRatio);
    const [mobileActivePanel, setMobileActivePanel] = useState<0 | 1>(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const mobileScrollRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    // Imperative API: scroll the mobile snap container to a specific panel.
    // Auf Desktop ist beides ein no-op.
    useImperativeHandle(ref, () => ({
        showInfoPanel() {
            const el = mobileScrollRef.current;
            if (!el) return;
            el.scrollTo({ left: el.clientWidth, behavior: 'smooth' });
        },
        showLeftPanel() {
            const el = mobileScrollRef.current;
            if (!el) return;
            el.scrollTo({ left: 0, behavior: 'smooth' });
        },
    }), []);

    // ── Mobile-Modus: CSS Scroll-Snap zwischen Vollbild-Panels ──────────
    // Der User wischt horizontal, der Browser snapped native. Kein JS-Gesture-
    // Code, keine Library. Wenn rightCollapsed gesetzt ist, zeigen wir nur
    // das linke Panel (Chat), ohne die Wisch-Leiste.
    if (isMobile) {
        if (rightCollapsed) {
            return (
                <div className={cn('flex h-full min-h-0', className)}>
                    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{left}</div>
                </div>
            );
        }
        return (
            <div className={cn('flex h-full min-h-0 w-full flex-col', className)}>
                <div
                    ref={mobileScrollRef}
                    className="flex min-h-0 flex-1 w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
                    style={{ overscrollBehaviorX: 'contain' }}
                    onScroll={(e) => {
                        const el = e.currentTarget;
                        const idx = Math.round(el.scrollLeft / el.clientWidth);
                        setMobileActivePanel(idx === 0 ? 0 : 1);
                    }}
                >
                    <div className="flex h-full w-full shrink-0 snap-start">
                        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{left}</div>
                    </div>
                    <div className="flex h-full w-full shrink-0 snap-start">
                        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{right}</div>
                    </div>
                </div>
                {/* Swipe-Indicator: zwei Punkte unten zeigen welches Panel aktiv ist */}
                <div className="flex shrink-0 items-center justify-center gap-1.5 border-t bg-background py-1.5">
                    <button
                        type="button"
                        onClick={() => mobileScrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })}
                        className={cn('h-2 rounded-full transition-all', mobileActivePanel === 0 ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/40')}
                        aria-label={t('app.misc.liste')}
                    />
                    <button
                        type="button"
                        onClick={() => mobileScrollRef.current?.scrollTo({ left: mobileScrollRef.current.clientWidth, behavior: 'smooth' })}
                        className={cn('h-2 rounded-full transition-all', mobileActivePanel === 1 ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/40')}
                        aria-label={t('app.misc.detail')}
                    />
                </div>
            </div>
        );
    }

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragging.current = true;

        const onMouseMove = (ev: MouseEvent) => {
            if (!dragging.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const ratio = (ev.clientX - rect.left) / rect.width;
            setLeftRatio(Math.min(maxLeftRatio, Math.max(minLeftRatio, ratio)));
        };

        const onMouseUp = () => {
            dragging.current = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [minLeftRatio, maxLeftRatio]);

    if (rightCollapsed) {
        return (
            <div ref={containerRef} className={cn('flex h-full min-h-0', className)}>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    {left}
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={cn('flex h-full min-h-0', className)}>
            <div className="min-h-0 min-w-0 overflow-hidden" style={{ width: `${leftRatio * 100}%` }}>
                {left}
            </div>

            <div
                onMouseDown={handleMouseDown}
                className="group relative z-10 flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-primary/10 active:bg-primary/20"
            >
                <div className="h-8 w-0.5 rounded-full bg-border transition-colors group-hover:bg-primary/40 group-active:bg-primary" />
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {right}
            </div>
        </div>
    );
});
