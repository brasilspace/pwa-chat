/**
 * WavesurferTimeline — Audacity-Style-Editor fuer AudioGuide-Cues.
 *
 * Verwendet wavesurfer.js v7 + Regions-Plugin. Funktionen:
 *   - Visualisierte Waveform der Audio-Datei.
 *   - Cues als farbige Regions auf der Waveform: drag verschiebt
 *     atSeconds, Resize aendert duration.
 *   - Transport-Buttons: Play/Pause, Stop, -5s/+5s, Speed-Selector.
 *   - Zoom-Slider — bei langen Dateien horizontal streckbar.
 *   - Click in den Waveform-Hintergrund seekt zur Position.
 *
 * Owns die Audio-Wiedergabe (kein separates HTMLAudioElement noetig);
 * publiziert currentTime / duration / playing nach aussen via Callbacks.
 */

import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.js';
import { Play, Pause, Square, Rewind, FastForward } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

export interface WavesurferCueInput {
    rid: string;
    atSeconds: number;
    duration: number;
    label: string;
    /** Hex-Farbe oder undefined (default emerald). */
    color?: string;
}

interface Props {
    audioUrl: string;
    cues: WavesurferCueInput[];
    /** Drag/Resize einer Region → neue at/duration. */
    onCueUpdate?: (rid: string, patch: { atSeconds: number; duration: number }) => void;
    /** Klick auf eine Region — vom Eltern-Element fuer Selektion nutzbar. */
    onCueClick?: (rid: string) => void;
    /** X-Knopf in der Region → Cue komplett entfernen. */
    onCueDelete?: (rid: string) => void;
    /** Wiedergabe-State an den Eltern fuer Anzeigen / Status-Sync. */
    onTimeUpdate?: (t: number) => void;
    onPlayingChange?: (p: boolean) => void;
    onDurationChange?: (d: number) => void;
    /** Hoehe der Waveform in px (default 96). */
    height?: number;
}

const SPEEDS = [0.75, 1, 1.25, 1.5];

export function WavesurferTimeline({
    audioUrl,
    cues,
    onCueUpdate,
    onCueClick,
    onCueDelete,
    onTimeUpdate,
    onPlayingChange,
    onDurationChange,
    height = 96,
}: Props): JSX.Element {
    const t = useT();
    /** onCueDelete in einem Ref halten — DOM-Element-Listener wuerde sonst beim
     * Re-Render veraltete Closure haben. */
    const onCueDeleteRef = useRef(onCueDelete);
    useEffect(() => { onCueDeleteRef.current = onCueDelete; }, [onCueDelete]);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<RegionsPlugin | null>(null);
    const regionMapRef = useRef<Map<string, Region>>(new Map());

    const [ready, setReady] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [zoomPx, setZoomPx] = useState(50); // px pro Sekunde
    const [speed, setSpeed] = useState(1);

    // Initial-Setup: WaveSurfer-Instanz + Regions-Plugin.
    useEffect(() => {
        if (!containerRef.current) return;
        const regionsPlugin = RegionsPlugin.create();
        const ws = WaveSurfer.create({
            container: containerRef.current,
            url: audioUrl,
            waveColor: '#94a3b8',     // slate-400
            progressColor: '#10b981', // emerald-500
            cursorColor: '#059669',   // emerald-600
            cursorWidth: 2,
            height,
            barWidth: 2,
            barGap: 1,
            barRadius: 1,
            normalize: true,
            plugins: [regionsPlugin],
        });
        wsRef.current = ws;
        regionsRef.current = regionsPlugin;

        const offReady = ws.on('ready', () => {
            setReady(true);
            setDuration(ws.getDuration());
            onDurationChange?.(ws.getDuration());
        });
        const offTime = ws.on('timeupdate', (_t) => {
            setCurrentTime(_t);
            onTimeUpdate?.(_t);
        });
        const offPlay = ws.on('play', () => { setPlaying(true); onPlayingChange?.(true); });
        const offPause = ws.on('pause', () => { setPlaying(false); onPlayingChange?.(false); });
        const offFinish = ws.on('finish', () => { setPlaying(false); onPlayingChange?.(false); });

        const offRegionUpdated = regionsPlugin.on('region-updated', (region) => {
            const rid = region.id;
            onCueUpdate?.(rid, {
                atSeconds: region.start,
                duration: Math.max(0.1, region.end - region.start),
            });
        });
        const offRegionClick = regionsPlugin.on('region-clicked', (region, e) => {
            e.stopPropagation();
            region.play();
            onCueClick?.(region.id);
        });

        return () => {
            offReady();
            offTime();
            offPlay();
            offPause();
            offFinish();
            offRegionUpdated();
            offRegionClick();
            try { ws.destroy(); } catch { /* noop */ }
            wsRef.current = null;
            regionsRef.current = null;
            regionMapRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioUrl, height]);

    // Cues → Regions synchronisieren. Diff-basiert, damit Drag-Updates
    // nicht in die eigene Region zurueckgespiegelt werden (Loop-Schutz
    // ueber start/end-Vergleich).
    useEffect(() => {
        if (!ready || !regionsRef.current) return;
        const regions = regionsRef.current;
        const desiredIds = new Set(cues.map((c) => c.rid));
        const map = regionMapRef.current;

        // 1) Entfernen, was nicht mehr in cues vorkommt
        for (const [rid, region] of map.entries()) {
            if (!desiredIds.has(rid)) {
                try { region.remove(); } catch { /* noop */ }
                map.delete(rid);
            }
        }

        // 2) Hinzufuegen / aktualisieren
        for (const c of cues) {
            const existing = map.get(c.rid);
            const start = c.atSeconds;
            const end = c.atSeconds + Math.max(0.1, c.duration);
            const color = c.color ? hexToRgba(c.color, 0.25) : 'rgba(16, 185, 129, 0.22)';
            if (existing) {
                if (Math.abs(existing.start - start) > 0.05 || Math.abs(existing.end - end) > 0.05) {
                    existing.setOptions({ start, end });
                }
                // Label-Text aktualisieren — wir fassen nur den Text-Teil an,
                // X-Knopf bleibt davon unberuehrt.
                const labelEl = existing.content?.querySelector<HTMLElement>('[data-cue-label]');
                if (labelEl && labelEl.textContent !== c.label) labelEl.textContent = c.label;
            } else {
                const region = regions.addRegion({
                    id: c.rid,
                    start,
                    end,
                    content: buildRegionContent(c.rid, c.label, onCueDeleteRef),
                    color,
                    drag: true,
                    resize: true,
                });
                map.set(c.rid, region);
            }
        }
    }, [cues, ready]);

    // Zoom anwenden, sobald ws ready ist.
    useEffect(() => {
        if (!ready || !wsRef.current) return;
        try { wsRef.current.zoom(zoomPx); } catch { /* noop */ }
    }, [zoomPx, ready]);

    // Speed anwenden.
    useEffect(() => {
        if (!ready || !wsRef.current) return;
        try { wsRef.current.setPlaybackRate(speed); } catch { /* noop */ }
    }, [speed, ready]);

    const togglePlay = () => wsRef.current?.playPause();
    const stop = () => {
        const ws = wsRef.current;
        if (!ws) return;
        ws.pause();
        ws.seekTo(0);
    };
    const skip = (delta: number) => {
        const ws = wsRef.current;
        if (!ws) return;
        const next = Math.max(0, Math.min(ws.getDuration() || 0, ws.getCurrentTime() + delta));
        ws.setTime(next);
    };

    const fmt = useMemo(() => formatTime, []);

    return (
        <div className="space-y-3">
            {/* Waveform-Container */}
            <div className="rounded border border-border bg-muted/20 p-2">
                <div ref={containerRef} className="w-full overflow-x-auto" />
                {!ready && (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        {t('audio-guide.wavesurfer_timeline.lade_waveform')}
                    </p>
                )}
            </div>

            {/* Transport */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={togglePlay}
                    disabled={!ready}
                    className={cn(
                        'flex h-9 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors',
                        playing ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-primary text-primary-foreground hover:bg-primary/90',
                        !ready && 'opacity-50 cursor-not-allowed',
                    )}
                >
                    {playing ? <Pause className="size-3.5" /> : <MaterialIcon name="play_arrow" size={16} className="size-3.5" />}
                    {playing ? 'Pause' : 'Abspielen'}
                </button>
                <button
                    type="button"
                    onClick={stop}
                    disabled={!ready}
                    title={t('audio-guide.wavesurfer_timeline.stop_zurueck_zum_anfang')}
                    className="flex h-9 items-center justify-center rounded border border-border px-2 hover:bg-muted disabled:opacity-50"
                >
                    <Square className="size-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => skip(-5)}
                    disabled={!ready}
                    title={t('audio-guide.wavesurfer_timeline.5_sekunden_zurueck')}
                    className="flex h-9 items-center justify-center rounded border border-border px-2 hover:bg-muted disabled:opacity-50"
                >
                    <Rewind className="size-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => skip(5)}
                    disabled={!ready}
                    title={t('audio-guide.wavesurfer_timeline.5_sekunden_vor')}
                    className="flex h-9 items-center justify-center rounded border border-border px-2 hover:bg-muted disabled:opacity-50"
                >
                    <FastForward className="size-3.5" />
                </button>

                <span className="px-2 text-xs tabular-nums text-muted-foreground">
                    {fmt(currentTime)} / {fmt(duration)}
                </span>

                <div className="ml-auto flex items-center gap-2">
                    {/* Speed */}
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {t('audio-guide.wavesurfer_timeline.tempo')}
                        <select
                            value={speed}
                            onChange={(e) => setSpeed(Number(e.target.value))}
                            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
                        >
                            {SPEEDS.map((s) => (
                                <option key={s} value={s}>{s}×</option>
                            ))}
                        </select>
                    </label>

                    {/* Zoom-Slider */}
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MaterialIcon name="restart_alt" size={16} className="size-3" />
                        {t('audio-guide.wavesurfer_timeline.zoom')}
                        <input
                            type="range"
                            min={10}
                            max={400}
                            value={zoomPx}
                            onChange={(e) => setZoomPx(Number(e.target.value))}
                            className="w-32"
                        />
                    </label>
                </div>
            </div>
        </div>
    );
}

function formatTime(s: number): string {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Baut den Region-Content — Label + kleiner X-Knopf zum Loeschen.
 * Wavesurfer akzeptiert HTMLElement als content.
 */
function buildRegionContent(
    rid: string,
    label: string,
    onDeleteRef: { current?: ((rid: string) => void) | undefined },
): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:4px;padding:0 4px;';

    const labelEl = document.createElement('span');
    labelEl.setAttribute('data-cue-label', '');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:11px;line-height:1;';
    wrap.appendChild(labelEl);

    const x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cue loeschen');
    x.title = 'Cue loeschen';
    x.textContent = '×';
    x.style.cssText = 'border:none;background:rgba(0,0,0,0.15);color:#fff;border-radius:9999px;width:16px;height:16px;line-height:14px;font-size:14px;cursor:pointer;padding:0;';
    x.addEventListener('mousedown', (e) => {
        // mousedown statt click, damit wavesurfer's Drag-Handler nicht greift.
        e.stopPropagation();
        e.preventDefault();
        onDeleteRef.current?.(rid);
    });
    wrap.appendChild(x);

    return wrap;
}

function hexToRgba(hex: string, alpha: number): string {
    const m = /^#?([a-f0-9]{6})$/i.exec(hex);
    if (!m) return `rgba(16, 185, 129, ${alpha})`;
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
