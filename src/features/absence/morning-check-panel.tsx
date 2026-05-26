/**
 * MorningCheckPanel — Klassenliste mit Farbstatus.
 *
 * Gruen = anwesend (Standard)
 * Grau = entschuldigt abwesend (aus Krankmeldung)
 * Orange = fehlt ohne Meldung (Tap durch Lehrkraft)
 *
 * Tap auf gruen → orange (fehlt)
 * Tap auf orange → gruen (doch da / verspaetet)
 * Grau ist nicht antippbar
 */

import { type JSX, useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Loader2, Check } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface CheckEntry {
    id: string;
    studentUserId: string;
    studentName: string;
    status: 'present' | 'absent_reported' | 'absent_unreported' | 'late';
    source: string;
}

interface CheckData {
    id: string;
    expectedCount: number;
    reportedAbsentCount: number;
    mustBePresent: number;
    status: string;
}

const API_BASE = '/api/platform/v1';

export function MorningCheckPanel({ space }: { space: SpaceItem }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [check, setCheck] = useState<CheckData | null>(null);
    const [entries, setEntries] = useState<CheckEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await fetch(`${API_BASE}/spaces/${space.id}/morning-check`, {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) { setLoading(false); return; }
            const data = await res.json();
            setCheck(data.check);
            setEntries(data.entries);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [jwt, space.id]);

    useEffect(() => { load(); }, [load]);

    const handleToggle = useCallback(async (entryId: string) => {
        if (!jwt) return;
        setToggling(entryId);
        try {
            const res = await fetch(`${API_BASE}/spaces/${space.id}/morning-check/toggle`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ entryId }),
            });
            if (res.ok) {
                const data = await res.json();
                setEntries(prev => prev.map(e =>
                    e.id === entryId ? { ...e, status: data.entry.status } : e
                ));
                if (check) setCheck({ ...check, status: data.checkStatus });
            }
        } catch { /* ignore */ }
        finally { setToggling(null); }
    }, [jwt, space.id, check]);

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    if (!check || entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center">
                <MaterialIcon name="groups" size={16} className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">{t('absence.morning_check.kein_morgen-check_verfuegbar')}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{t('absence.morning_check.dieser_space_hat_keine_schueler_als_mitg')}</p>
            </div>
        );
    }

    const presentCount = entries.filter(e => e.status === 'present').length;
    const unreportedCount = entries.filter(e => e.status === 'absent_unreported').length;
    const reportedCount = entries.filter(e => e.status === 'absent_reported').length;

    return (
        <div className="flex flex-col h-full">
            {/* Header mit Soll-Zahl */}
            <div className={cn(
                'flex items-center justify-between border-b px-4 py-3',
                unreportedCount > 0 ? 'bg-orange-50 dark:bg-orange-950/10' : 'bg-background',
            )}>
                <div>
                    <span className="text-sm font-semibold">{t('absence.morning_check.morgen-check')}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums">
                        {check.mustBePresent}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{t('absence.morning_check.muessen_da_sein')}</div>
                </div>
            </div>

            {/* Status-Zusammenfassung */}
            <div className="flex items-center gap-4 px-4 py-2 border-b text-xs">
                <span className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded-full bg-emerald-500" />
                    {t('absence.morning_check.anwesend')} <strong>{presentCount}</strong>
                </span>
                {reportedCount > 0 && (
                    <span className="flex items-center gap-1.5">
                        <div className="size-2.5 rounded-full bg-gray-400" />
                        {t('absence.morning_check.entschuldigt')} <strong>{reportedCount}</strong>
                    </span>
                )}
                {unreportedCount > 0 && (
                    <span className="flex items-center gap-1.5 text-orange-600 font-medium">
                        <MaterialIcon name="warning" size={16} className="size-3" />
                        {t('absence.morning_check.unentschuldigt')} <strong>{unreportedCount}</strong>
                    </span>
                )}
            </div>

            {/* Schueler-Liste */}
            <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1 p-2">
                    {entries.map(entry => {
                        const isReported = entry.status === 'absent_reported';
                        const isUnreported = entry.status === 'absent_unreported';
                        const isPresent = entry.status === 'present';
                        const isToggling = toggling === entry.id;

                        return (
                            <button
                                key={entry.id}
                                onClick={() => {
                                    if (isReported) return; // Grau nicht antippbar
                                    handleToggle(entry.id);
                                }}
                                disabled={isReported || isToggling}
                                className={cn(
                                    'relative flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all',
                                    isPresent && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50',
                                    isReported && 'bg-gray-100 text-gray-400 dark:bg-gray-800/30 dark:text-gray-500 cursor-default',
                                    isUnreported && 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 ring-2 ring-orange-400/50',
                                    isToggling && 'opacity-60',
                                )}
                            >
                                {isPresent && <MaterialIcon name="check" size={16} className="size-3.5 shrink-0" />}
                                {isUnreported && <MaterialIcon name="warning" size={16} className="size-3.5 shrink-0" />}
                                <span className="truncate">{entry.studentName}</span>
                                {isReported && (
                                    <span className="ml-auto text-[9px] font-normal">entschuldigt</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
