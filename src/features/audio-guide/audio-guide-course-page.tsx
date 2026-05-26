/**
 * AudioGuideCoursePage — Course-Player + Editor.
 *
 * Aufruf: /audio-guide-courses/:collectionId
 *
 * Read-Mode:
 *   - Liste der Lektionen mit Fortschritts-Markern.
 *   - Klick auf Lektion → spielt sie ab.
 *   - Nach Lektions-Ende automatisch zur naechsten Lektion (mit kleinem
 *     "Naechste Lektion"-Knopf falls man nicht warten will).
 *   - lastPosition wird kontinuierlich an den Server gemeldet, completed
 *     beim Audio-Ende.
 *
 * Edit-Mode (canEdit):
 *   - Title + Description bearbeiten.
 *   - Lektionen hinzufuegen (AudioGuidePicker), entfernen, neu sortieren.
 *   - Members-Speichern via PUT.
 */

import { type JSX, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { Loader2, Pause, Edit } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import {
    audioGuideCoursesApi, type CollectionDetail, type CollectionMember, type PlaySession,
} from './use-audio-guide-courses';
import { audioGuideApi } from './use-audio-guide';
import { AudioGuideProgressBar } from '@/components/audio-guide/audio-guide-progress-bar';
import type { AudioGuideCue, AudioGuideMarkerMap } from '@/components/audio-guide/audio-guide-types';
import { getIcon } from './icon-picker';
import { AudioGuidePickerDialog } from '@/components/editor/audio-guide-picker-dialog';
import { useT } from "@/lib/i18n/use-t";

interface LessonState {
    streamUrl: string | null;
    cues: Array<{ id: string; atSeconds: number; duration: number; iconName: string; label: string }>;
}

export function AudioGuideCoursePage(): JSX.Element {
    const t = useT();
    const { collectionId } = useParams<{ collectionId: string }>();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [detail, setDetail] = useState<CollectionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeIdx, setActiveIdx] = useState(0);
    const [lesson, setLesson] = useState<LessonState>({ streamUrl: null, cues: [] });
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const [sessions, setSessions] = useState<Map<string, PlaySession>>(new Map());

    // Edit-Mode
    const [editing, setEditing] = useState(false);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDescription, setDraftDescription] = useState('');
    const [draftMembers, setDraftMembers] = useState<CollectionMember[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [saving, setSaving] = useState(false);

    const refresh = () => {
        if (!jwt || !collectionId) { setLoading(false); return; }
        setLoading(true);
        Promise.all([
            audioGuideCoursesApi.get(jwt, collectionId),
            audioGuideCoursesApi.mySessions(jwt),
        ]).then(([d, s]) => {
            setDetail(d);
            setDraftTitle(d.collection.title);
            setDraftDescription(d.collection.description ?? '');
            setDraftMembers(d.members);
            const m = new Map<string, PlaySession>();
            for (const sess of s.sessions) {
                if (sess.collectionId !== collectionId) continue;
                const prev = m.get(sess.documentId);
                if (!prev || (prev.completedAt === null && sess.completedAt !== null)) {
                    m.set(sess.documentId, sess);
                }
            }
            setSessions(m);
        }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoading(false));
    };

    useEffect(refresh, [jwt, collectionId]);

    // Aktive Lektion laden, wenn sich activeIdx oder detail aendert.
    useEffect(() => {
        if (!jwt || !detail) return;
        const member = detail.members[activeIdx];
        if (!member || !member.available) {
            setLesson({ streamUrl: null, cues: [] });
            return;
        }
        Promise.all([
            audioGuideApi.streamUrl(jwt, member.documentId),
            audioGuideApi.get(jwt, member.documentId),
        ]).then(([s, g]) => {
            setLesson({
                streamUrl: s.url,
                cues: g.cues.map((c) => ({
                    id: c.id, atSeconds: c.atSeconds, duration: c.duration,
                    iconName: c.iconName, label: c.label,
                })),
            });
        }).catch(() => setLesson({ streamUrl: null, cues: [] }));
    }, [jwt, detail, activeIdx]);

    // Audio-Element wiring + Session-Tracking.
    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        let saveTimer: ReturnType<typeof setTimeout> | null = null;

        const onTime = () => {
            setCurrentTime(a.currentTime);
            // Throttled Session-Update alle 5s.
            if (jwt && detail && detail.members[activeIdx]) {
                if (saveTimer) clearTimeout(saveTimer);
                saveTimer = setTimeout(() => {
                    audioGuideCoursesApi.upsertSession(jwt, {
                        documentId: detail.members[activeIdx].documentId,
                        collectionId: detail.collection.id,
                        lastPosition: a.currentTime,
                    }).catch(() => { /* noop */ });
                }, 5_000);
            }
        };
        const onMeta = () => setDuration(a.duration || 0);
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onEnd = () => {
            setPlaying(false);
            if (jwt && detail && detail.members[activeIdx]) {
                audioGuideCoursesApi.upsertSession(jwt, {
                    documentId: detail.members[activeIdx].documentId,
                    collectionId: detail.collection.id,
                    lastPosition: a.duration,
                    completed: true,
                }).then(() => refresh()).catch(() => { /* noop */ });
            }
            // Auto-Advance nach 1.5s — kann der User wegklicken.
            setTimeout(() => {
                if (detail && activeIdx + 1 < detail.members.length) {
                    setActiveIdx((i) => i + 1);
                }
            }, 1500);
        };
        a.addEventListener('timeupdate', onTime);
        a.addEventListener('loadedmetadata', onMeta);
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        a.addEventListener('ended', onEnd);
        return () => {
            if (saveTimer) clearTimeout(saveTimer);
            a.removeEventListener('timeupdate', onTime);
            a.removeEventListener('loadedmetadata', onMeta);
            a.removeEventListener('play', onPlay);
            a.removeEventListener('pause', onPause);
            a.removeEventListener('ended', onEnd);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lesson.streamUrl, activeIdx]);

    const togglePlay = () => {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused) a.play().catch(() => { /* noop */ });
        else a.pause();
    };

    const seek = (_t: number) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = Math.max(0, Math.min(a.duration || _t, _t));
    };

    const playerCues: AudioGuideCue<string>[] = useMemo(
        () => lesson.cues.map((c) => ({ at: c.atSeconds, duration: c.duration, key: c.id })),
        [lesson.cues],
    );
    const markers: AudioGuideMarkerMap<string> = useMemo(() => {
        const m: AudioGuideMarkerMap<string> = {};
        for (const c of lesson.cues) m[c.id] = { icon: getIcon(c.iconName), label: c.label };
        return m;
    }, [lesson.cues]);

    const isCompleted = (docId: string): boolean => {
        const s = sessions.get(docId);
        return !!s?.completedAt;
    };

    const overallProgress = detail && detail.members.length > 0
        ? Math.round((detail.members.filter((m) => isCompleted(m.documentId)).length / detail.members.length) * 100)
        : 0;

    // ── Edit-Mode-Handlers ───────────────────────────────────────────────
    const saveMeta = async () => {
        if (!jwt || !detail) return;
        setSaving(true);
        try {
            await audioGuideCoursesApi.update(jwt, detail.collection.id, {
                title: draftTitle.trim() || 'Lehrgang',
                description: draftDescription.trim() || null,
            });
            await audioGuideCoursesApi.saveMembers(jwt, detail.collection.id,
                draftMembers.map((m) => ({ documentId: m.documentId })));
            refresh();
            setEditing(false);
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    const moveMember = (idx: number, direction: -1 | 1) => {
        const next = idx + direction;
        if (next < 0 || next >= draftMembers.length) return;
        const arr = [...draftMembers];
        [arr[idx], arr[next]] = [arr[next], arr[idx]];
        setDraftMembers(arr);
    };

    const removeMember = (idx: number) => {
        setDraftMembers((prev) => prev.filter((_, i) => i !== idx));
    };

    const addMember = (docId: string) => {
        setDraftMembers((prev) => [...prev, {
            id: `tmp-${Date.now()}`,
            documentId: docId,
            sortOrder: prev.length,
            title: '(wird geladen)',
            cueCount: 0,
            available: true,
        }]);
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
    }
    if (error || !detail) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm font-medium text-destructive">{t('audio-guide.audio_guide_course_page.fehler_beim_laden')}</p>
                <p className="text-xs text-muted-foreground">{error}</p>
            </div>
        );
    }

    const member = detail.members[activeIdx];

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-4 py-2">
                <button onClick={() => navigate('/audio-guide-courses')} className="rounded p-1.5 hover:bg-muted" title={t('common.back')}>
                    <MaterialIcon name="arrow_back" size={16} className="size-4" />
                </button>
                <MaterialIcon name="menu_book" size={16} className="size-4 text-emerald-600" />
                <h1 className="flex-1 truncate text-sm font-medium">{detail.collection.title}</h1>
                <span className="text-xs text-muted-foreground">{overallProgress}{t('audio-guide.audio_guide_course_page.gelernt')}</span>
                {detail.canEdit && (
                    <button
                        onClick={() => setEditing((v) => !v)}
                        className={cn(
                            'rounded border border-border px-3 py-1.5 text-xs',
                            editing ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                        )}
                    >
                        {editing ? t('common.editing_done') : t('common.edit')}
                    </button>
                )}
            </div>

            {!editing && (
                <>
                    {/* Player */}
                    <div className="border-b p-4">
                        {!member && (
                            <p className="text-center text-xs text-muted-foreground py-6">
                                {t('audio-guide.audio_guide_course_page.noch_keine_lektionen_in_diesem_lehrgang')}
                            </p>
                        )}
                        {member && (
                            <>
                                <div className="mb-3 flex items-center gap-2 text-sm">
                                    <MaterialIcon name="headphones" size={16} className="size-4 text-muted-foreground" />
                                    <span className="font-medium">{t('audio-guide.audio_guide_course_page.lektion')} {activeIdx + 1}: {member.title}</span>
                                    {isCompleted(member.documentId) && (
                                        <MaterialIcon name="check_circle" size={16} className="size-4 text-emerald-600" />
                                    )}
                                </div>
                                {lesson.streamUrl && <audio ref={audioRef} src={lesson.streamUrl} preload="metadata" />}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={togglePlay}
                                        disabled={!lesson.streamUrl}
                                        className="flex h-10 items-center gap-2 rounded bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                    >
                                        {playing ? <Pause className="size-4" /> : <MaterialIcon name="play_arrow" size={16} className="size-4" />}
                                        {playing ? 'Pause' : 'Abspielen'}
                                    </button>
                                    <span className="text-xs tabular-nums text-muted-foreground">
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
                                        height={6}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Lektionen-Liste */}
                    <div className="flex-1 overflow-auto p-4">
                        {detail.collection.description && (
                            <p className="mb-4 text-sm text-muted-foreground">{detail.collection.description}</p>
                        )}
                        <ul className="space-y-1">
                            {detail.members.map((m, i) => {
                                const completed = isCompleted(m.documentId);
                                const isActive = i === activeIdx;
                                return (
                                    <li key={m.id}>
                                        <button
                                            onClick={() => setActiveIdx(i)}
                                            className={cn(
                                                'flex w-full items-center gap-3 rounded border p-3 text-left transition-colors',
                                                isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30',
                                            )}
                                        >
                                            <span className={cn(
                                                'flex size-7 items-center justify-center rounded-full text-xs font-semibold shrink-0',
                                                completed ? 'bg-emerald-500 text-white' :
                                                    isActive ? 'bg-primary text-primary-foreground' :
                                                        'bg-muted text-muted-foreground',
                                            )}>
                                                {completed ? <MaterialIcon name="check_circle" size={16} className="size-3.5" /> : (i + 1)}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{m.title}</div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    {m.cueCount} {t('audio-guide.audio_guide_course_page.cue')}{m.cueCount === 1 ? '' : 's'}
                                                    {!m.available && ' · Datei nicht verfuegbar'}
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </>
            )}

            {editing && (
                <div className="flex-1 overflow-auto p-4 space-y-4">
                    <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('audio-guide.audio_guide_course_page.titel')}</label>
                        <input
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('common.description')}</label>
                        <textarea
                            value={draftDescription}
                            onChange={(e) => setDraftDescription(e.target.value)}
                            rows={3}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm resize-none"
                        />
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-sm font-semibold">{t('audio-guide.audio_guide_course_page.lektionen')}{draftMembers.length})</h3>
                            <button
                                onClick={() => setShowPicker(true)}
                                className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-xs hover:bg-muted"
                            >
                                <MaterialIcon name="add" size={16} className="size-3" /> {t('audio-guide.audio_guide_course_page.lektion_hinzufuegen')}
                            </button>
                        </div>
                        <ul className="space-y-1">
                            {draftMembers.map((m, i) => (
                                <li key={m.id} className="flex items-center gap-2 rounded border border-border p-2">
                                    <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px]">
                                        {i + 1}
                                    </span>
                                    <span className="flex-1 truncate text-sm">{m.title}</span>
                                    <button onClick={() => moveMember(i, -1)} disabled={i === 0} className="rounded p-1 disabled:opacity-30 hover:bg-muted">
                                        <MaterialIcon name="expand_less" size={16} className="size-3.5" />
                                    </button>
                                    <button onClick={() => moveMember(i, 1)} disabled={i === draftMembers.length - 1} className="rounded p-1 disabled:opacity-30 hover:bg-muted">
                                        <MaterialIcon name="expand_more" size={16} className="size-3.5" />
                                    </button>
                                    <button onClick={() => removeMember(i)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                        <MaterialIcon name="delete" size={16} className="size-3.5" />
                                    </button>
                                </li>
                            ))}
                            {draftMembers.length === 0 && (
                                <li className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                                    {t('audio-guide.audio_guide_course_page.noch_keine_lektionen_klick_lektion_hinzu')}
                                </li>
                            )}
                        </ul>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <button
                            onClick={() => { setDraftTitle(detail.collection.title); setDraftDescription(detail.collection.description ?? ''); setDraftMembers(detail.members); setEditing(false); }}
                            className="rounded border border-border px-3 py-1.5 text-xs"
                        >
                            {t('audio-guide.audio_guide_course_page.abbrechen')}
                        </button>
                        <button
                            onClick={saveMeta}
                            disabled={saving}
                            className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-3" />}
                            {t('audio-guide.audio_guide_course_page.speichern')}
                        </button>
                    </div>
                </div>
            )}

            {showPicker && (
                <AudioGuidePickerDialog
                    onPick={(docId) => addMember(docId)}
                    onClose={() => setShowPicker(false)}
                />
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
