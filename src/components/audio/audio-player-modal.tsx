/**
 * AudioPlayerModal — minimaler Audio-Player mit Waveform-Scrub-Bar.
 *
 * UI: Top-Zeile zentriert mit Rewind / Play-Pause / Stop / FastForward.
 * Darunter Wavesurfer-Waveform die als Progress-/Seek-Bar funktioniert.
 * Authentifizierter Download als Blob → an WaveSurfer uebergeben.
 */

import { type JSX, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Square, Rewind, FastForward } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    title: string;
    /** signed download URL (kurzlebig) */
    downloadUrl: string;
    onClose: () => void;
}

function fmt(t: number): string {
    if (!isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export function AudioPlayerModal({ title, downloadUrl, onClose }: Props): JSX.Element {
    const t = useT();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#94a3b8',
            progressColor: 'rgb(59 130 246)',
            cursorColor: '#1e293b',
            cursorWidth: 2,
            height: 48,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            normalize: true,
        });
        wsRef.current = ws;

        ws.on('ready', () => {
            setDuration(ws.getDuration());
            setLoading(false);
        });
        ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('play', () => setPlaying(true));
        ws.on('pause', () => setPlaying(false));
        ws.on('finish', () => setPlaying(false));
        ws.on('error', (err) => {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
        });

        ws.load(downloadUrl).catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
        });

        return () => {
            try { ws.destroy(); } catch { /* ignore */ }
            wsRef.current = null;
        };
    }, [downloadUrl]);

    const playPause = () => wsRef.current?.playPause();
    const stop = () => { wsRef.current?.stop(); setPlaying(false); };
    const skip = (delta: number) => {
        const ws = wsRef.current;
        if (!ws) return;
        const t = Math.max(0, Math.min(ws.getDuration(), ws.getCurrentTime() + delta));
        ws.setTime(t);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div
                className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top row: title + controls + close */}
                <div className="flex items-center gap-3 border-b px-4 py-2">
                    <MaterialIcon name="music_note" size={18} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                    {/* Transport controls — zentriert */}
                    <div className="flex items-center gap-0.5">
                        <button onClick={() => skip(-5)} disabled={loading} title={t('app.misc.-5s')}
                            className={cn('flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground', loading && 'opacity-30')}>
                            <Rewind className="size-4" />
                        </button>
                        <button onClick={playPause} disabled={loading} title={playing ? 'Pause (Space)' : 'Play (Space)'}
                            className={cn('flex size-9 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90', loading && 'opacity-30')}>
                            {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                        </button>
                        <button onClick={stop} disabled={loading} title={t('app.misc.stop')}
                            className={cn('flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground', loading && 'opacity-30')}>
                            <Square className="size-3.5" />
                        </button>
                        <button onClick={() => skip(5)} disabled={loading} title={t('app.misc.5s')}
                            className={cn('flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground', loading && 'opacity-30')}>
                            <FastForward className="size-4" />
                        </button>
                    </div>
                    <button onClick={onClose} title={t('app.misc.schliessen')}
                        className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MaterialIcon name="close" size={18} />
                    </button>
                </div>

                {/* Waveform + time */}
                <div className="px-4 py-3">
                    <div ref={containerRef} className="rounded bg-muted/30" />
                    <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                        <span>{fmt(currentTime)}</span>
                        {error ? <span className="text-destructive">{error}</span> : <span>{fmt(duration)}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
