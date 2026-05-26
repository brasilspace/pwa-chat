/**
 * AudioGuideEmbedView — React-NodeView fuer den Tiptap-Embed-Block.
 *
 * Liest documentId aus den Node-Attrs und rendert einen kompakten Player
 * mit Cue-Progress-Bar inline im Editor (oder im read-only Viewer).
 *
 * Read-only: keine Edit-UI im Embed selbst — wer Cues bearbeiten will,
 * oeffnet den AudioGuide-Standalone-Player ueber den Bleistift-Button.
 */

import { type JSX, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Pause, Loader2, SkipBack, SkipForward } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { audioGuideApi, useAudioGuide } from '@/features/audio-guide/use-audio-guide';
import { getIcon } from '@/features/audio-guide/icon-picker';
import { AudioGuideProgressBar } from '@/components/audio-guide/audio-guide-progress-bar';
import type { AudioGuideCue, AudioGuideMarkerMap } from '@/components/audio-guide/audio-guide-types';
import { useT } from "@/lib/i18n/use-t";

export function AudioGuideEmbedView({ node, editor }: NodeViewProps): JSX.Element {
    const t = useT();
    const documentId = (node.attrs as { documentId?: string }).documentId ?? '';
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const { cues, meta, canEdit, loading, error } = useAudioGuide(documentId || null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [streamErr, setStreamErr] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        if (!jwt || !documentId) return;
        audioGuideApi.streamUrl(jwt, documentId)
            .then((r) => setStreamUrl(r.url))
            .catch((e) => setStreamErr(e instanceof Error ? e.message : String(e)));
    }, [jwt, documentId]);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const onTime = () => setCurrentTime(a.currentTime);
        const onMeta = () => setDuration(a.duration || 0);
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onEnd = () => setPlaying(false);
        a.addEventListener('timeupdate', onTime);
        a.addEventListener('loadedmetadata', onMeta);
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        a.addEventListener('ended', onEnd);
        return () => {
            a.removeEventListener('timeupdate', onTime);
            a.removeEventListener('loadedmetadata', onMeta);
            a.removeEventListener('play', onPlay);
            a.removeEventListener('pause', onPause);
            a.removeEventListener('ended', onEnd);
        };
    }, [streamUrl]);

    const playerCues: AudioGuideCue<string>[] = useMemo(
        () => cues.map((c) => ({ at: c.atSeconds, duration: c.duration, key: c.id })),
        [cues],
    );

    const markers: AudioGuideMarkerMap<string> = useMemo(() => {
        const m: AudioGuideMarkerMap<string> = {};
        for (const c of cues) m[c.id] = { icon: getIcon(c.iconName), label: c.label };
        return m;
    }, [cues]);

    const togglePlayback = () => {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused) a.play().catch(() => { /* no-op */ });
        else a.pause();
    };

    const seek = (_t: number) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = Math.max(0, Math.min(a.duration || _t, _t));
    };

    const skipCue = (direction: -1 | 1) => {
        if (cues.length === 0) return;
        const sorted = [...cues].sort((a, b) => a.atSeconds - b.atSeconds);
        if (direction > 0) {
            const next = sorted.find((c) => c.atSeconds > currentTime + 0.2);
            if (next) seek(next.atSeconds + 0.05);
        } else {
            const target = currentTime - 1.0;
            const prev = [...sorted].reverse().find((c) => c.atSeconds <= target);
            seek(prev ? prev.atSeconds + 0.05 : 0);
        }
    };

    // Wenn keine documentId gesetzt ist (User hat den Block leer eingefuegt),
    // einen Platzhalter zeigen, damit der Editor weiss was passiert.
    if (!documentId) {
        return (
            <NodeViewWrapper className="my-3">
                <div
                    contentEditable={false}
                    className="rounded border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground"
                >
                    {t('app.misc.audioguide-block_ohne_document-id_diesen')}
                </div>
            </NodeViewWrapper>
        );
    }

    return (
        <NodeViewWrapper className="my-3">
            <div
                contentEditable={false}
                className="rounded border border-border bg-card overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
                    <MaterialIcon name="headphones" size={16} className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate text-xs font-medium">
                        {loading ? 'Laedt…' : (meta?.title ?? 'AudioGuide')}
                    </span>
                    {canEdit && !editor.isEditable && (
                        <button
                            type="button"
                            onClick={() => navigate(`/audio-guides/${documentId}`)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('app.misc.in_standalone-player_oeffnen_cues_bearbe')}
                        >
                            <MaterialIcon name="open_in_new" size={16} className="size-3.5" />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-3">
                    {error && (
                        <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">{error}</p>
                    )}
                    {streamErr && (
                        <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">{streamErr}</p>
                    )}
                    {!error && !streamErr && (
                        <>
                            {streamUrl && <audio ref={audioRef} src={streamUrl} preload="metadata" />}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => skipCue(-1)}
                                    disabled={!streamUrl || cues.length === 0}
                                    title={t('app.misc.zur_vorherigen_cue')}
                                    className="flex h-8 items-center justify-center rounded border border-border px-1.5 hover:bg-muted disabled:opacity-50"
                                >
                                    <SkipBack className="size-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={togglePlayback}
                                    disabled={!streamUrl}
                                    className="flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {!streamUrl ? <Loader2 className="size-3 animate-spin" /> : (playing ? <Pause className="size-3" /> : <MaterialIcon name="play_arrow" size={16} className="size-3" />)}
                                    {playing ? 'Pause' : 'Abspielen'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => skipCue(1)}
                                    disabled={!streamUrl || cues.length === 0}
                                    title={t('app.misc.zur_naechsten_cue')}
                                    className="flex h-8 items-center justify-center rounded border border-border px-1.5 hover:bg-muted disabled:opacity-50"
                                >
                                    <SkipForward className="size-3" />
                                </button>
                                <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </span>
                            </div>
                            <div className="relative mt-3 px-2">
                                <AudioGuideProgressBar
                                    cues={playerCues}
                                    duration={duration}
                                    currentTime={currentTime}
                                    markers={markers}
                                    onSeek={seek}
                                    inline
                                    height={3}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </NodeViewWrapper>
    );
}

function formatTime(s: number): string {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}
