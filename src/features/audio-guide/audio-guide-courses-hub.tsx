/**
 * AudioGuideCoursesHub — Liste aller Lehrgaenge des Tenants + "Meine
 * Tutorials"-Bereich (laufende und abgeschlossene Kurse des Users).
 *
 * Aufruf: /audio-guide-courses
 */

import { type JSX, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { Loader2, Plus, BookOpen } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { audioGuideCoursesApi, useAudioGuideCourses, type PlaySession } from './use-audio-guide-courses';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

export function AudioGuideCoursesHub(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { collections, loading, refresh } = useAudioGuideCourses();

    const [sessions, setSessions] = useState<PlaySession[]>([]);
    useEffect(() => {
        if (!jwt) return;
        audioGuideCoursesApi.mySessions(jwt).then((r) => setSessions(r.sessions)).catch(() => { /* noop */ });
    }, [jwt]);

    const progressByCollection = useMemo(() => {
        const map = new Map<string, { started: number; completed: number }>();
        for (const s of sessions) {
            if (!s.collectionId) continue;
            const cur = map.get(s.collectionId) ?? { started: 0, completed: 0 };
            cur.started += 1;
            if (s.completedAt) cur.completed += 1;
            map.set(s.collectionId, cur);
        }
        return map;
    }, [sessions]);

    const create = async () => {
        if (!jwt) return;
        const title = window.prompt('Titel des neuen Lehrgangs:');
        if (!title?.trim()) return;
        try {
            const r = await audioGuideCoursesApi.create(jwt, { title: title.trim() });
            navigate(`/audio-guide-courses/${r.collection.id}`);
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
        refresh();
    };

    return (
        <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold">
                        <BookOpen size={28} className="text-emerald-600" />
                        {t('audio-guide.audio_guide_courses_hub.lehrgaenge_tutorials')}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t('audio-guide.audio_guide_courses_hub.geordnete_audioguide-sequenzen_lektion_f')}
                    </p>
                </div>
                <button
                    onClick={create}
                    title={t('audio-guide.audio_guide_courses_hub.neu')}
                    aria-label={t('audio-guide.audio_guide_courses_hub.neu')}
                    className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                    <Plus size={18} />
                </button>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 size={24} className="animate-spin" />
                </div>
            )}

            {!loading && collections.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
                    <BookOpen size={48} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-500 text-sm">
                        {t('audio-guide.audio_guide_courses_hub.noch_keine_lehrgaenge_klick_quotneuer_le')}
                    </p>
                </div>
            )}

            {!loading && collections.length > 0 && (
                <div className="grid gap-3">
                    {collections.map((c) => {
                        const progress = progressByCollection.get(c.id);
                        const pct = c.memberCount === 0 ? 0
                            : Math.round(((progress?.completed ?? 0) / c.memberCount) * 100);
                        return (
                            <button
                                key={c.id}
                                onClick={() => navigate(`/audio-guide-courses/${c.id}`)}
                                className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
                            >
                                <span className={cn(
                                    'flex size-10 items-center justify-center rounded-full',
                                    pct === 100 ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700',
                                )}>
                                    {pct === 100 ? <MaterialIcon name="check_circle" size={16} className="size-5" /> : <MaterialIcon name="checklist" size={16} className="size-5" />}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium">{c.title}</div>
                                    {c.description && (
                                        <div className="mt-0.5 truncate text-sm text-gray-500">{c.description}</div>
                                    )}
                                    <div className="mt-1 text-xs text-gray-400">
                                        {c.memberCount} {t('audio-guide.audio_guide_courses_hub.lektion')}{c.memberCount === 1 ? '' : 'en'}
                                        {progress && progress.started > 0 && ` · ${progress.completed}/${c.memberCount} erledigt`}
                                    </div>
                                </div>
                                {/* Progress-Bar */}
                                <div className="w-24">
                                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 transition-[width]"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <div className="mt-1 text-right text-[10px] text-gray-500 tabular-nums">{pct}%</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
