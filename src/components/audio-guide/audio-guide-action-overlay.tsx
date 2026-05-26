/**
 * AudioGuideActionOverlay — globaler Single-Mount, der Cue-Aktionen
 * waehrend einer Wiedergabe visuell umsetzt.
 *
 * Hoermi-Helper und der Standalone-Player publizieren ueber den
 * audioGuideActionStore, welche Aktion gerade aktiv ist:
 *   - show-overlay: rendert eine kleine Bubble mit Markdown-Text (vereinfacht
 *     auf Plain + Zeilenumbrueche, kein voller Markdown-Renderer noetig).
 *   - pause-and-wait: rendert eine "Weiter"-Bubble. Klick ruft
 *     `onContinueRequested` aus dem Store auf, der Player setzt dann fort.
 *   - highlight-element: setzt eine Highlight-Class auf das Element mit
 *     dem matching data-tour-Attribut, mit scroll-into-view.
 *
 * start-flow ist ein Sofort-Effekt — wird im Player direkt navigiert,
 * kein Overlay-Render noetig.
 */

import { useEffect, useState, useSyncExternalStore, type JSX } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { audioGuideActionStore, type ActiveAction } from './audio-guide-action-store';
import { useT } from "@/lib/i18n/use-t";

const HIGHLIGHT_CLASS = 'audio-guide-tour-highlight';

export function AudioGuideActionOverlay(): JSX.Element | null {
    const action = useSyncExternalStore(audioGuideActionStore.subscribe, audioGuideActionStore.getSnapshot);
    const [hasStyled, setHasStyled] = useState(false);

    // Highlight-Class auf das Ziel-Element setzen + scrollen.
    useEffect(() => {
        if (!action || action.type !== 'highlight-element' || !action.target) {
            // Cleanup: alle bisherigen Highlights entfernen.
            for (const el of document.querySelectorAll<HTMLElement>('.' + HIGHLIGHT_CLASS)) {
                el.classList.remove(HIGHLIGHT_CLASS);
            }
            return;
        }
        const target = action.target.trim();
        // Einfache Selektor-Logik: data-tour="..." oder roher CSS-Selektor.
        const selector = target.startsWith('data-tour=')
            ? `[${target}]`
            : target;
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) return;
        el.classList.add(HIGHLIGHT_CLASS);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return () => {
            el.classList.remove(HIGHLIGHT_CLASS);
        };
    }, [action]);

    // Style-Tag einmalig injizieren.
    useEffect(() => {
        if (hasStyled) return;
        const style = document.createElement('style');
        style.textContent = `
.${HIGHLIGHT_CLASS} {
  position: relative;
  outline: 3px solid var(--primary, #10b981);
  outline-offset: 4px;
  border-radius: 6px;
  animation: audioGuidePulse 1.4s ease-in-out infinite;
  z-index: 30;
}
@keyframes audioGuidePulse {
  0%, 100% { outline-color: rgba(16, 185, 129, 0.95); }
  50%     { outline-color: rgba(16, 185, 129, 0.4);  }
}
`;
        document.head.appendChild(style);
        setHasStyled(true);
    }, [hasStyled]);

    if (!action) return null;

    if (action.type === 'show-overlay') {
        return <OverlayBubble text={action.target ?? ''} />;
    }
    if (action.type === 'pause-and-wait') {
        return <ContinueBubble label={action.label} onContinue={() => audioGuideActionStore.requestContinue()} />;
    }
    return null;
}

function OverlayBubble({ text }: { text: string }): JSX.Element {
    const t = useT();
    return (
        <div className="fixed bottom-6 right-6 z-[60] max-w-sm">
            <div className="relative rounded border border-emerald-500/40 bg-card p-4 pr-9 shadow-lg">
                <button
                    type="button"
                    onClick={() => audioGuideActionStore.dismissOverlay()}
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted"
                    aria-label={t('app.misc.schliessen')}
                >
                    <MaterialIcon name="close" size={16} className="size-3.5" />
                </button>
                <p className="text-sm leading-relaxed whitespace-pre-line">{text}</p>
            </div>
        </div>
    );
}

function ContinueBubble({ label, onContinue }: { label: string; onContinue: () => void }): JSX.Element {
    const t = useT();
    return (
        <div className="fixed bottom-6 right-6 z-[60] max-w-sm">
            <div className="rounded border border-amber-500/40 bg-card p-4 shadow-lg">
                <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                    {t('app.misc.hoermi_pausiert')}
                </p>
                <p className="text-sm leading-relaxed mb-3">{label || 'Probier es selbst aus, dann klick auf Weiter.'}</p>
                <button
                    type="button"
                    onClick={onContinue}
                    className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                    {t('app.misc.weiter')}
                </button>
            </div>
        </div>
    );
}
