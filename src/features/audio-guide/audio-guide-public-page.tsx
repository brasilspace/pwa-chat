/**
 * AudioGuidePublicPage — Public-Share-Player ohne Login.
 *
 * Aufruf: /audio-guide-share/:slug
 *
 * Holt Cues + presigned Audio-URL ohne Auth (Slug ist das Geheimnis).
 * Rendert einen schlanken Player mit ProgressBar — keine Edit-UI,
 * keine Auto-Navigation (User ist nicht angemeldet, hat kein App-Kontext).
 *
 * Mediaformat-Erkennung: ist mimeType video/* oder hat die URL eine
 * Video-Endung, wird ein <video>-Element gerendert. Sonst <audio>.
 */

import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Pause } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { env } from '@/core/config/env';
import { AudioGuideProgressBar } from '@/components/audio-guide/audio-guide-progress-bar';
import type { AudioGuideCue, AudioGuideMarkerMap } from '@/components/audio-guide/audio-guide-types';
import { getIcon } from './icon-picker';
import type { AudioGuideCueRecord } from './use-audio-guide';
import { useT } from "@/lib/i18n/use-t";

interface PublicResponse {
    document: { id: string; title: string; mimeType: string; sizeBytes: number };
    cues: AudioGuideCueRecord[];
    audioUrl: string;
    expiresAt: string | null;
}

export function AudioGuidePublicPage(): JSX.Element {
    const t = useT();
    const { slug } = useParams<{ slug: string }>();
    const [data, setData] = useState<PublicResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        if (!slug) return;
        const url = `${env.platformBaseUrl}/api/public/audio-guide/${encodeURIComponent(slug)}`;
        fetch(url)
            .then(async (r) => {
                if (!r.ok) {
                    if (r.status === 410) throw new Error('Dieser Link ist abgelaufen.');
                    if (r.status === 404) throw new Error('Dieser Link wurde nicht gefunden oder zurueckgezogen.');
                    throw new Error(`Fehler ${r.status}`);
                }
                return r.json();
            })
            .then((d) => setData(d))
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoading(false));
    }, [slug]);

    useEffect(() => {
        const m = mediaRef.current;
        if (!m) return;
        const onTime = () => setCurrentTime(m.currentTime);
        const onMeta = () => setDuration(m.duration || 0);
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onEnd = () => setPlaying(false);
        m.addEventListener('timeupdate', onTime);
        m.addEventListener('loadedmetadata', onMeta);
        m.addEventListener('play', onPlay);
        m.addEventListener('pause', onPause);
        m.addEventListener('ended', onEnd);
        return () => {
            m.removeEventListener('timeupdate', onTime);
            m.removeEventListener('loadedmetadata', onMeta);
            m.removeEventListener('play', onPlay);
            m.removeEventListener('pause', onPause);
            m.removeEventListener('ended', onEnd);
        };
    }, [data]);

    const togglePlay = () => {
        const m = mediaRef.current;
        if (!m) return;
        if (m.paused) m.play().catch(() => { /* noop */ });
        else m.pause();
    };

    const seek = (_t: number) => {
        const m = mediaRef.current;
        if (!m) return;
        m.currentTime = Math.max(0, Math.min(m.duration || _t, _t));
    };

    const cuesForBar: AudioGuideCue<string>[] = useMemo(
        () => (data?.cues ?? []).map((c) => ({ at: c.atSeconds, duration: c.duration, key: c.id })),
        [data?.cues],
    );
    const markers: AudioGuideMarkerMap<string> = useMemo(() => {
        const m: AudioGuideMarkerMap<string> = {};
        for (const c of data?.cues ?? []) m[c.id] = { icon: getIcon(c.iconName), label: c.label };
        return m;
    }, [data?.cues]);

    const isVideo = data?.document.mimeType.startsWith('video/') === true;

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <Loader2 className="size-8 animate-spin text-gray-400" />
            </div>
        );
    }
    if (error || !data) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
                <div className="max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
                    <p className="text-lg font-semibold text-gray-900">{t('audio-guide.audio_guide_public_page.audioguide_nicht_verfuegbar')}</p>
                    <p className="mt-2 text-sm text-gray-500">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h1 className="text-xl font-semibold">{data.document.title}</h1>
                <p className="mt-1 text-xs text-gray-500">
                    {isVideo ? 'Video-Tutorial' : 'AudioGuide'} · {data.cues.length} {t('audio-guide.audio_guide_public_page.kapitel')}
                </p>

                {isVideo ? (
                    <video
                        ref={mediaRef as React.RefObject<HTMLVideoElement>}
                        src={data.audioUrl}
                        controls
                        className="mt-4 w-full rounded"
                        preload="metadata"
                    />
                ) : (
                    <>
                        <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={data.audioUrl} preload="metadata" />
                        <div className="mt-6 flex items-center gap-3">
                            <button
                                onClick={togglePlay}
                                className="flex h-12 items-center gap-2 rounded-full bg-emerald-600 px-6 text-sm font-medium text-white hover:bg-emerald-700"
                            >
                                {playing ? <Pause className="size-5" /> : <MaterialIcon name="play_arrow" size={16} className="size-5" />}
                                {playing ? 'Pause' : 'Anhoeren'}
                            </button>
                            <span className="text-sm tabular-nums text-gray-500">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        </div>
                    </>
                )}

                <div className="relative mt-6 px-3">
                    <AudioGuideProgressBar
                        cues={cuesForBar}
                        duration={duration}
                        currentTime={currentTime}
                        markers={markers}
                        onSeek={seek}
                        inline
                        interactive
                        height={6}
                    />
                </div>

                {data.cues.length > 0 && (
                    <div className="mt-6">
                        <h2 className="text-sm font-semibold mb-2">{t('audio-guide.audio_guide_public_page.kapitel')}</h2>
                        <ul className="space-y-1">
                            {data.cues.map((c) => {
                                const Ico = getIcon(c.iconName);
                                const reached = currentTime >= c.atSeconds;
                                return (
                                    <li key={c.id}>
                                        <button
                                            onClick={() => seek(c.atSeconds + 0.05)}
                                            className="flex w-full items-center gap-2 rounded p-2 text-left text-sm hover:bg-gray-50"
                                        >
                                            <Ico className={reached ? 'size-4 text-emerald-600' : 'size-4 text-gray-400'} />
                                            <span className="flex-1 truncate">{c.label}</span>
                                            <span className="text-xs tabular-nums text-gray-400">{formatTime(c.atSeconds)}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                <p className="mt-8 text-center text-xs text-gray-400">
                    {t('audio-guide.audio_guide_public_page.bereitgestellt_von_prilog')}
                </p>
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
