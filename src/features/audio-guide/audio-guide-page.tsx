/**
 * AudioGuidePage — Standalone-Player + Editor fuer einen AudioGuide.
 *
 * Aufruf: /audio-guides/:documentId
 *
 * Layout:
 *   - Header: Titel des Documents + Edit-Toggle (nur wenn canEdit).
 *   - Player: HTMLAudioElement + AudioGuideProgressBar inline.
 *   - Editor (toggle): Tabelle mit Cues, je Zeile at/duration/icon/label,
 *     Action-Auswahl und Loeschen-Knopf. + "Cue hinzufuegen".
 *
 * Datenmodell:
 *   - useAudioGuide laedt Cues + Document-Meta + canEdit.
 *   - audioGuideApi.streamUrl liefert presigned-URL fuer den Stream.
 *   - audioGuideApi.save ueberschreibt komplett die Cue-Liste.
 */

import { type JSX, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { Loader2, Pause, Save, SkipBack, SkipForward } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { audioGuideApi, useAudioGuide, type AudioGuideCueInput, type AudioGuideActionType } from './use-audio-guide';
import { IconPicker, getIcon } from './icon-picker';
import { AudioGuideProgressBar } from '@/components/audio-guide/audio-guide-progress-bar';
import type { AudioGuideCue, AudioGuideMarkerMap } from '@/components/audio-guide/audio-guide-types';
import { WavesurferTimeline, type WavesurferCueInput } from './wavesurfer-timeline';
import { useT } from "@/lib/i18n/use-t";

interface EditableCue {
    /** Stable ID nur fuer React-Key — aus DB oder client-generiert. */
    rid: string;
    atSeconds: number;
    duration: number;
    iconName: string;
    label: string;
    actionType: AudioGuideActionType;
    actionTarget: string;
}

let nextRid = 1;
const newRid = () => `c-${++nextRid}-${Date.now()}`;

export function AudioGuidePage(): JSX.Element {
    const t = useT();
    const { documentId } = useParams<{ documentId: string }>();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const { cues: serverCues, meta, canEdit, loading, error, refresh } = useAudioGuide(documentId ?? null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [streamErr, setStreamErr] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const isVideo = useMemo(() => {
        const mt = meta?.mimeType ?? '';
        const t = meta?.title ?? '';
        return /^video\//.test(mt) || /\.(mp4|webm|mov|m4v)$/i.test(t);
    }, [meta]);

    // Editor-State (lokale Kopie der Cues, dirty-Flag, Save-Aktion)
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<EditableCue[]>([]);
    const [saving, setSaving] = useState(false);
    /** Snapshot der Cues nach letztem Save — Vergleich gegen draft = dirty-Flag. */
    const [savedSnapshot, setSavedSnapshot] = useState<string>('');
    const dirty = useMemo(() => {
        const current = JSON.stringify(draft.slice().sort((a, b) => a.atSeconds - b.atSeconds));
        return current !== savedSnapshot;
    }, [draft, savedSnapshot]);

    // Stream-URL einmalig laden, sobald JWT + ID vorhanden.
    useEffect(() => {
        if (!jwt || !documentId) return;
        audioGuideApi.streamUrl(jwt, documentId)
            .then((r) => setStreamUrl(r.url))
            .catch((e) => setStreamErr(e instanceof Error ? e.message : String(e)));
    }, [jwt, documentId]);

    // Bei Server-Cues-Update den Draft synchron halten (wenn nicht gerade editiert).
    // Beim Sync auch den savedSnapshot setzen, damit dirty-Erkennung gegen den
    // gerade frisch geladenen Stand misst.
    useEffect(() => {
        if (editing) return;
        const next = serverCues.map((c) => ({
            rid: c.id,
            atSeconds: c.atSeconds,
            duration: c.duration,
            iconName: c.iconName,
            label: c.label,
            actionType: c.actionType,
            actionTarget: c.actionTarget ?? '',
        }));
        setDraft(next);
        setSavedSnapshot(JSON.stringify(next.slice().sort((a, b) => a.atSeconds - b.atSeconds)));
    }, [serverCues, editing]);

    // Browser-Warning bei unsaved Cues: Reload / Tab-Close.
    useEffect(() => {
        if (!editing || !dirty) return;
        const beforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [editing, dirty]);

    // Audio-Element-Events an State binden.
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
        () => draft.map((c) => ({ at: c.atSeconds, duration: c.duration, key: c.rid })),
        [draft],
    );

    const markers: AudioGuideMarkerMap<string> = useMemo(() => {
        const m: AudioGuideMarkerMap<string> = {};
        for (const c of draft) m[c.rid] = { icon: getIcon(c.iconName), label: c.label || '(ohne Label)' };
        return m;
    }, [draft]);

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

    /** Springt zur vorherigen / naechsten Cue ab currentTime. */
    const skipCue = (direction: -1 | 1) => {
        if (draft.length === 0) return;
        const sorted = [...draft].sort((a, b) => a.atSeconds - b.atSeconds);
        if (direction > 0) {
            const next = sorted.find((c) => c.atSeconds > currentTime + 0.2);
            if (next) seek(next.atSeconds + 0.05);
        } else {
            // Etwas Toleranz, damit man bei "kurz nach Cue X" auf X springt, nicht X-1.
            const target = currentTime - 1.0;
            const prev = [...sorted].reverse().find((c) => c.atSeconds <= target);
            if (prev) seek(prev.atSeconds + 0.05);
            else seek(0);
        }
    };

    const addCue = () => {
        const at = Math.round(currentTime * 10) / 10;
        // Smart-Duration: Lücke bis zum naechsten Cue, gekappt auf 30s.
        // Wenn keiner folgt: bis zum Audio-Ende, gekappt auf 30s.
        const sorted = [...draft].sort((a, b) => a.atSeconds - b.atSeconds);
        const next = sorted.find((c) => c.atSeconds > at);
        const upperBound = next ? next.atSeconds : (duration > 0 ? duration : at + 5);
        const gap = Math.max(0.5, upperBound - at);
        const smartDuration = Math.min(30, Math.round(gap * 10) / 10);

        const fresh: EditableCue = {
            rid: newRid(),
            atSeconds: at,
            duration: smartDuration,
            iconName: 'sparkles',
            label: 'Neuer Cue',
            actionType: 'none',
            actionTarget: '',
        };
        setDraft((prev) => [...prev, fresh].sort((a, b) => a.atSeconds - b.atSeconds));
    };

    const updateCue = (rid: string, patch: Partial<EditableCue>) => {
        setDraft((prev) => prev.map((c) => c.rid === rid ? { ...c, ...patch } : c));
    };

    const removeCue = (rid: string) => {
        setDraft((prev) => prev.filter((c) => c.rid !== rid));
    };

    const save = async () => {
        if (!jwt || !documentId) return;
        setSaving(true);
        try {
            const sortedDraft = draft.slice().sort((a, b) => a.atSeconds - b.atSeconds);
            const payload: AudioGuideCueInput[] = sortedDraft.map((c, i) => ({
                atSeconds: c.atSeconds,
                duration: c.duration,
                iconName: c.iconName,
                label: c.label.trim() || 'Cue',
                actionType: c.actionType,
                actionTarget: needsTarget(c.actionType) ? (c.actionTarget.trim() || null) : null,
                sortOrder: i,
            }));
            await audioGuideApi.save(jwt, documentId, payload);
            // Snapshot updaten — dirty geht zurueck auf false ohne Refetch.
            setSavedSnapshot(JSON.stringify(sortedDraft));
            refresh();
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
    }

    if (error) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm font-medium text-destructive">{t('audio-guide.audio_guide_page.fehler_beim_laden')}</p>
                <p className="text-xs text-muted-foreground">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-4 py-2">
                <button onClick={() => navigate(-1)} className="rounded p-1.5 hover:bg-muted" title={t('common.back')}>
                    <MaterialIcon name="arrow_back" size={16} className="size-4" />
                </button>
                <h1 className="flex-1 truncate text-sm font-medium">{meta?.title ?? 'AudioGuide'}</h1>
                {canEdit && (
                    <button
                        onClick={() => {
                            if (editing && dirty) {
                                if (!confirm('Es gibt nicht gespeicherte Aenderungen. Wirklich verlassen?')) return;
                            }
                            setEditing((v) => !v);
                        }}
                        className={cn(
                            'relative rounded border border-border px-3 py-1.5 text-xs',
                            editing ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                        )}
                    >
                        {editing ? t('common.editing_done') : t('common.edit')}
                        {editing && dirty && (
                            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400 ring-2 ring-background" aria-hidden />
                        )}
                    </button>
                )}
            </div>

            {/* Player — Edit-Mode: Wavesurfer-Timeline (Drag-Marker, Zoom,
                Speed-Control). Read-Mode: schlanker Player + ProgressBar. */}
            <div className="border-b p-4">
                {streamErr && (
                    <p className="mb-2 rounded bg-destructive/10 p-2 text-xs text-destructive">{streamErr}</p>
                )}

                {editing && streamUrl && (
                    <WavesurferTimeline
                        audioUrl={streamUrl}
                        cues={draft.map((c): WavesurferCueInput => ({
                            rid: c.rid,
                            atSeconds: c.atSeconds,
                            duration: c.duration,
                            label: c.label,
                        }))}
                        onCueUpdate={(rid, patch) => {
                            updateCue(rid, {
                                atSeconds: Math.round(patch.atSeconds * 100) / 100,
                                duration: Math.round(patch.duration * 100) / 100,
                            });
                        }}
                        onCueDelete={removeCue}
                        onTimeUpdate={setCurrentTime}
                        onPlayingChange={setPlaying}
                        onDurationChange={setDuration}
                    />
                )}

                {!editing && (
                    <>
                        {streamUrl && (
                            isVideo ? (
                                <video
                                    ref={audioRef as React.RefObject<HTMLVideoElement>}
                                    src={streamUrl}
                                    preload="metadata"
                                    className="mt-1 mb-2 max-h-[40vh] w-full rounded bg-black"
                                    controls
                                />
                            ) : (
                                <audio
                                    ref={audioRef as React.RefObject<HTMLAudioElement>}
                                    src={streamUrl}
                                    preload="metadata"
                                />
                            )
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => skipCue(-1)}
                                disabled={!streamUrl || draft.length === 0}
                                title={t('audio-guide.audio_guide_page.zur_vorherigen_cue')}
                                className="flex h-10 items-center justify-center rounded border border-border px-2 hover:bg-muted disabled:opacity-50"
                            >
                                <SkipBack className="size-4" />
                            </button>
                            <button
                                onClick={togglePlayback}
                                disabled={!streamUrl}
                                className="flex h-10 items-center gap-2 rounded bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {playing ? <Pause className="size-4" /> : <MaterialIcon name="play_arrow" size={16} className="size-4" />}
                                {playing ? 'Pause' : 'Abspielen'}
                            </button>
                            <button
                                onClick={() => skipCue(1)}
                                disabled={!streamUrl || draft.length === 0}
                                title={t('audio-guide.audio_guide_page.zur_naechsten_cue')}
                                className="flex h-10 items-center justify-center rounded border border-border px-2 hover:bg-muted disabled:opacity-50"
                            >
                                <SkipForward className="size-4" />
                            </button>
                            <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        </div>
                        <div className="relative mt-4 px-3">
                            <AudioGuideProgressBar
                                cues={playerCues}
                                duration={duration}
                                currentTime={currentTime}
                                markers={markers}
                                onSeek={seek}
                                inline
                                interactive
                                height={8}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Editor */}
            {editing && (
                <div className="flex-1 overflow-auto p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold">{t('audio-guide.audio_guide_page.cues_bearbeiten')}</h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={addCue}
                                className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1.5 text-xs hover:bg-muted"
                            >
                                <MaterialIcon name="add" size={16} className="size-3" /> {t('audio-guide.audio_guide_page.cue_hinzufuegen')}
                            </button>
                            <button
                                onClick={save}
                                disabled={saving || !dirty}
                                title={dirty ? 'Aenderungen speichern' : 'Keine Aenderungen'}
                                className="relative inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-3" />}
                                {t('audio-guide.audio_guide_page.speichern')}
                                {dirty && !saving && (
                                    <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400 ring-2 ring-background" aria-hidden />
                                )}
                            </button>
                        </div>
                    </div>

                    {draft.length === 0 && (
                        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                            {t('audio-guide.audio_guide_page.noch_keine_cues_hoer_dir_das_audio_an_dr')}
                        </p>
                    )}

                    {draft.length > 0 && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-[60px_60px_44px_1fr_120px_1fr_28px] gap-2 border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <div>{t('audio-guide.audio_guide_page.bei_s')}</div>
                                <div>{t('common.duration')}</div>
                                <div>{t('audio-guide.audio_guide_page.icon')}</div>
                                <div>{t('audio-guide.audio_guide_page.label')}</div>
                                <div>{t('audio-guide.audio_guide_page.aktion')}</div>
                                <div>URL</div>
                                <div></div>
                            </div>
                            {draft.map((c) => (
                                <div key={c.rid} className="grid grid-cols-[60px_60px_44px_1fr_120px_1fr_28px] gap-2 items-center">
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        value={c.atSeconds}
                                        onChange={(e) => updateCue(c.rid, { atSeconds: Number(e.target.value) })}
                                        className="rounded border border-border bg-background px-2 py-1 text-xs tabular-nums"
                                    />
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        value={c.duration}
                                        onChange={(e) => updateCue(c.rid, { duration: Number(e.target.value) })}
                                        className="rounded border border-border bg-background px-2 py-1 text-xs tabular-nums"
                                    />
                                    <IconPicker value={c.iconName} onChange={(name) => updateCue(c.rid, { iconName: name })} />
                                    <input
                                        type="text"
                                        value={c.label}
                                        onChange={(e) => updateCue(c.rid, { label: e.target.value })}
                                        className="rounded border border-border bg-background px-2 py-1 text-xs"
                                    />
                                    <select
                                        value={c.actionType}
                                        onChange={(e) => updateCue(c.rid, { actionType: e.target.value as AudioGuideActionType })}
                                        className="rounded border border-border bg-background px-2 py-1 text-xs"
                                    >
                                        <option value="none">{t('audio-guide.audio_guide_page.nur_highlight')}</option>
                                        <option value="navigate-url">{t('audio-guide.audio_guide_page.navigieren')}</option>
                                        <option value="show-overlay">{t('audio-guide.audio_guide_page.hinweis-bubble')}</option>
                                        <option value="pause-and-wait">{t('audio-guide.audio_guide_page.pausieren')}</option>
                                        <option value="start-flow">{t('audio-guide.audio_guide_page.flow_starten')}</option>
                                        <option value="highlight-element">{t('audio-guide.audio_guide_page.element_hervorheben')}</option>
                                    </select>
                                    <input
                                        type="text"
                                        placeholder={actionPlaceholder(c.actionType)}
                                        value={c.actionTarget}
                                        onChange={(e) => updateCue(c.rid, { actionTarget: e.target.value })}
                                        disabled={!needsTarget(c.actionType)}
                                        className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-40"
                                    />
                                    <button
                                        onClick={() => removeCue(c.rid)}
                                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        title={t('audio-guide.audio_guide_page.cue_entfernen')}
                                    >
                                        <MaterialIcon name="delete" size={16} className="size-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!editing && (
                <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
                    {draft.length === 0
                        ? 'Noch keine Cues. Klick auf Bearbeiten, um Marker zu setzen.'
                        : `${draft.length} Cue${draft.length === 1 ? '' : 's'} — fuer Bearbeitung auf "Bearbeiten" klicken.`}
                </div>
            )}
        </div>
    );
}

function formatTime(s: number): string {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Welche Action-Typen brauchen ein Target-Feld? */
function needsTarget(actionType: AudioGuideActionType): boolean {
    return actionType === 'navigate-url'
        || actionType === 'show-overlay'
        || actionType === 'start-flow'
        || actionType === 'highlight-element';
}

/** Placeholder-Hint je Action-Typ. */
function actionPlaceholder(actionType: AudioGuideActionType): string {
    switch (actionType) {
        case 'navigate-url': return '/calendar';
        case 'show-overlay': return 'Markdown-Text fuer die Bubble';
        case 'start-flow': return 'flow-template-id';
        case 'highlight-element': return 'data-tour="element-id"';
        default: return '';
    }
}
