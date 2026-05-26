/**
 * AudioGuideProgressBar — wiederverwendbare Player-Visualisierung.
 *
 * Schmaler Track (default 3px) mit gruener Fuell-Flaeche und runden
 * Cue-Markern oben drauf. Marker zeigen das jeweilige Lucide-Icon, sind
 * klickbar (springt zur Cue-Position) und wechseln die Farbe von muted
 * auf emerald, sobald die Position ueberschritten ist.
 *
 * Mit `interactive={true}` wird zusaetzlich der gesamte Track klickbar
 * (Click-to-Seek auf jede beliebige Position) und ein kleiner Thumb am
 * aktuellen Playhead angezeigt — sinnvoll fuer Editor-Modus, wo man
 * waehrend der Bearbeitung zu beliebigen Stellen springen will, ohne
 * von vorne anhoeren zu muessen.
 *
 * Default-Layout ist `absolute inset-x-0 bottom-0` — ideal fuer Header/
 * Toolbar-Border-Replacement. Wer die Bar inline rendern will, gibt
 * `inline` auf true und positioniert den umgebenden Container selbst.
 */

import { type JSX, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import type { AudioGuideCue, AudioGuideMarkerMap } from './audio-guide-types';

interface Props<TKey extends string> {
    /** Cue-Liste — gleicher Datensatz, den der Player-Hook konsumiert. */
    cues: AudioGuideCue<TKey>[];
    /** Wieviele Sekunden ist der Audio-Track lang. 0 → Bar bleibt leer. */
    duration: number;
    /** Aktuelle Wiedergabe-Position in Sekunden. */
    currentTime: number;
    /** Icon + Label pro Cue-Key fuer Marker-Anzeige. */
    markers: AudioGuideMarkerMap<TKey>;
    /** Klick auf einen Marker → springe zu dieser Sekunde. */
    onSeek?: (time: number) => void;
    /** Inline-Variante: Bar steht im normalen Flow, nicht absolut. */
    inline?: boolean;
    /**
     * Editor-Modus: ganzer Track ist klickbar (Click-to-Seek), Thumb am
     * Playhead. Default false (passive ProgressBar im Header / Embed).
     */
    interactive?: boolean;
    /** Track-Hoehe in px (default 3). */
    height?: number;
    /** Fuell-Farbe als Tailwind-Klasse (default emerald). */
    fillClassName?: string;
    className?: string;
}

export function AudioGuideProgressBar<TKey extends string>({
    cues,
    duration,
    currentTime,
    markers,
    onSeek,
    inline = false,
    interactive = false,
    height = 3,
    fillClassName = 'bg-emerald-500',
    className,
}: Props<TKey>): JSX.Element {
    const pct = duration > 0
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0;

    const handleTrackClick = (e: MouseEvent<HTMLDivElement>) => {
        if (!interactive || !onSeek || duration <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = Math.min(1, Math.max(0, x / rect.width));
        onSeek(ratio * duration);
    };

    return (
        <div
            className={cn(
                inline ? 'relative w-full' : 'pointer-events-none absolute inset-x-0 bottom-0 z-10',
                className,
            )}
        >
            <div
                className={cn('relative bg-muted/40', interactive && 'pointer-events-auto cursor-pointer rounded-full')}
                style={{ height }}
                onClick={handleTrackClick}
                role={interactive ? 'slider' : undefined}
                aria-valuemin={interactive ? 0 : undefined}
                aria-valuemax={interactive ? Math.round(duration) : undefined}
                aria-valuenow={interactive ? Math.round(currentTime) : undefined}
                aria-label={interactive ? 'Wiedergabe-Position' : undefined}
            >
                {/* Fuell-Flaeche */}
                <div
                    className={cn(
                        'absolute inset-y-0 left-0 transition-[width] duration-150 ease-linear',
                        fillClassName,
                        interactive && 'rounded-full',
                    )}
                    style={{ width: `${pct}%` }}
                />

                {/* Thumb am Playhead — nur im interaktiven Modus. */}
                {interactive && duration > 0 && (
                    <div
                        className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-3 rounded-full border-2 border-emerald-600 bg-background shadow"
                        style={{ left: `${pct}%` }}
                        aria-hidden
                    />
                )}

                {/* Cue-Marker */}
                {duration > 0 && cues.map((cue, i) => {
                    const cuePct = Math.min(100, Math.max(0, (cue.at / duration) * 100));
                    const reached = currentTime >= cue.at;
                    const meta = markers[cue.key];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onSeek?.(cue.at + 0.05); }}
                            title={`${meta.label} (${formatTime(cue.at)})`}
                            className={cn(
                                'pointer-events-auto absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
                                'flex size-5 items-center justify-center rounded-full border bg-background shadow-sm transition-all',
                                'hover:scale-125 hover:z-10',
                                reached
                                    ? 'border-emerald-500 text-emerald-600'
                                    : 'border-border text-muted-foreground',
                            )}
                            style={{ left: `${cuePct}%` }}
                            aria-label={`Springe zu: ${meta.label}`}
                        >
                            <Icon className="size-3" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}
