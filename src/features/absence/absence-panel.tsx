/**
 * AbsencePanel — Abwesenheits-/Krankmeldungsverwaltung.
 *
 * Lehrer: Tagesuebersicht wer fehlt, Bestaetigung, Monatsansicht.
 * Eltern: Button "Kind abwesend melden" mit einfachem Formular.
 */

import { type JSX, useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getMonthNames } from '@/lib/i18n/locale-date';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { sessionStore } from '@/core/session/session-store';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { MorningCheckPanel } from './morning-check-panel';
import { useT } from "@/lib/i18n/use-t";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AbsenceEntry {
    id: string;
    studentUserId: string;
    studentName: string;
    date: string;
    endDate: string | null;
    reason: 'sick' | 'family' | 'appointment' | 'other';
    reasonText: string | null;
    reportedBy: string;
    reportedAt: string;
    attestRequired: boolean;
    attestReceived: boolean;
    acknowledgedBy: string | null;
    acknowledgedAt: string | null;
    status: string;
}

const REASON_LABELS: Record<string, string> = {
    sick: 'Krank',
    family: 'Familiaer',
    appointment: 'Arzttermin',
    other: 'Sonstiges',
};
const REASON_COLORS: Record<string, string> = {
    sick: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    family: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    appointment: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    other: 'bg-muted text-muted-foreground',
};

// ─── API ────────────────────────────────────────────────────────────────────

const API_BASE = '/api/platform/v1';

async function fetchTodayAbsences(jwt: string, spaceId: string): Promise<{ absences: AbsenceEntry[]; total: number; absent: number }> {
    const res = await fetch(`${API_BASE}/absences/today?spaceId=${spaceId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    return res.json();
}

async function fetchAbsences(jwt: string, spaceId: string, from: string, to: string): Promise<AbsenceEntry[]> {
    const res = await fetch(`${API_BASE}/absences?spaceId=${spaceId}&from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json();
    return data.absences ?? [];
}

async function createAbsence(jwt: string, body: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}/absences`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

interface MorningCheckDay {
    date: string;
    status: string;
    entries: Array<{ studentUserId: string; studentName: string; status: string }>;
}

async function fetchMorningChecks(jwt: string, spaceId: string, from: string, to: string): Promise<MorningCheckDay[]> {
    const res = await fetch(`${API_BASE}/spaces/${encodeURIComponent(spaceId)}/morning-checks?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.checks ?? [];
}

async function acknowledgeAbsence(jwt: string, absenceId: string) {
    const res = await fetch(`${API_BASE}/absences/${absenceId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'acknowledged' }),
    });
    return res.json();
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AbsencePanel({ space }: { space: SpaceItem }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [absences, setAbsences] = useState<AbsenceEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showReport, setShowReport] = useState(false);
    const [view, setView] = useState<'check' | 'today' | 'month'>('check');
    const mountedRef = useRef(true);

    const loadToday = useCallback(async () => {
        if (!jwt) return;
        try {
            const data = await fetchTodayAbsences(jwt, space.id);
            if (mountedRef.current) {
                setAbsences(data.absences ?? []);
                setTotal(data.total ?? 0);
            }
        } catch { /* ignore */ }
        finally { if (mountedRef.current) setLoading(false); }
    }, [jwt, space.id]);

    useEffect(() => { mountedRef.current = true; loadToday(); return () => { mountedRef.current = false; }; }, [loadToday]);

    useWorkflowEvents((event) => {
        if (event === 'absence.changed') loadToday();
    });

    const present = total - absences.length;

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{t('absence.absence.anwesenheit')}</span>
                    <div className="flex gap-1">
                        <button onClick={() => setView('check')}
                            className={cn('rounded px-2 py-0.5 text-[10px] font-medium', view === 'check' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                            {t('absence.absence.check')}
                        </button>
                        <button onClick={() => setView('today')}
                            className={cn('rounded px-2 py-0.5 text-[10px] font-medium', view === 'today' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                            {t('absence.absence.heute')}
                        </button>
                        <button onClick={() => setView('month')}
                            className={cn('rounded px-2 py-0.5 text-[10px] font-medium', view === 'month' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                            {t('absence.absence.monat')}
                        </button>
                    </div>
                </div>
                <button
                    onClick={() => setShowReport(!showReport)}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                >
                    <MaterialIcon name="person_off" size={16} />{t('absence.absence.abwesend_melden')}
                </button>
            </div>

            {/* Report Form */}
            {showReport && <ReportAbsenceForm jwt={jwt!} onDone={() => { setShowReport(false); loadToday(); }} onCancel={() => setShowReport(false)} />}

            {/* Today View */}
            {view === 'check' && <MorningCheckPanel space={space} />}

            {view === 'today' && (
                <div className="flex-1 overflow-y-auto">
                    {/* Summary */}
                    <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/20">
                        <div className="flex items-center gap-1.5">
                            <div className="size-3 rounded-full bg-emerald-500" />
                            <span className="text-xs">{t('absence.absence.anwesend')} <strong>{present}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="size-3 rounded-full bg-red-500" />
                            <span className="text-xs">{t('absence.absence.abwesend')} <strong>{absences.length}</strong></span>
                        </div>
                    </div>

                    {absences.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                            <MaterialIcon name="check" size={40} className="text-emerald-500/30 mb-3" />
                            <p className="text-sm text-muted-foreground">{t('absence.absence.alle_anwesend')}</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {absences.map(a => (
                                <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                                    <MaterialIcon name="person_off" size={16} className="mt-0.5 shrink-0 text-red-500" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">{a.studentName}</span>
                                            <span className={cn('text-[9px] rounded px-1.5 py-0.5 font-medium', REASON_COLORS[a.reason])}>
                                                {REASON_LABELS[a.reason]}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                                            {a.endDate && a.endDate !== a.date ? `${a.date} bis ${a.endDate}` : 'Heute'}
                                            {a.reasonText && ` — ${a.reasonText}`}
                                        </div>
                                        {a.attestRequired && (
                                            <div className="mt-1 flex items-center gap-1 text-[10px]">
                                                <MaterialIcon name="warning" size={14} className="text-amber-500" />
                                                <span className={a.attestReceived ? 'text-emerald-600' : 'text-amber-600'}>
                                                    {a.attestReceived ? 'Attest eingereicht' : 'Attest erforderlich'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {a.status === 'reported' && (
                                        <button
                                            onClick={() => jwt && acknowledgeAbsence(jwt, a.id).then(() => loadToday())}
                                            className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20"
                                        >
                                            <MaterialIcon name="check" size={14} />{t('absence.absence.bestaetigen')}
                                        </button>
                                    )}
                                    {a.status === 'acknowledged' && (
                                        <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                                            <MaterialIcon name="check" size={14} />{t('absence.absence.bestaetigt')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Month View */}
            {view === 'month' && <MonthView spaceId={space.id} jwt={jwt!} />}
        </div>
    );
}

// ─── Abwesenheit melden ─────────────────────────────────────────────────────

function ReportAbsenceForm({ jwt, onDone, onCancel }: {
    jwt: string; onDone: () => void; onCancel: () => void;
}): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [userId, setUserId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState<string>('sick');
    const [reasonText, setReasonText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        try {
            await createAbsence(jwt, {
                studentUserId: userId || `@${name.toLowerCase().replace(/\s+/g, '-')}:prilog`,
                studentName: name.trim(),
                date,
                endDate: endDate || null,
                reason,
                reasonText: reasonText.trim() || null,
            });
            onDone();
        } finally { setSubmitting(false); }
    };

    return (
        <div className="border-b bg-red-50/50 dark:bg-red-950/10 px-4 py-3 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('absence.absence.abwesenheit_melden')}</span>

            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('absence.absence.name_des_kindes')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" autoFocus />

            <div className="flex gap-2">
                <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">{t('absence.absence.von')}</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                </div>
                <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">{t('absence.absence.bis_optional')}</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {Object.entries(REASON_LABELS).map(([k, label]) => (
                    <button key={k} onClick={() => setReason(k)}
                        className={cn('rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors',
                            reason === k ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30')}>
                        {label}
                    </button>
                ))}
            </div>

            <input type="text" value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder={t('absence.absence.anmerkung_optional')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary" />

            <div className="flex gap-2">
                <button onClick={handleSubmit} disabled={!name.trim() || submitting}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50">
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <MaterialIcon name="person_off" size={16} />}
                    {t('absence.absence.melden')}
                </button>
                <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-muted">
                    {t('absence.absence.abbrechen')}
                </button>
            </div>
        </div>
    );
}

// ─── Monatsansicht ──────────────────────────────────────────────────────────
//
// Merged zwei Datenquellen:
// 1. AbsenceEntry (Eltern-Meldungen) → Kuerzel K/A/F/S
// 2. MorningCheckEntry (Lehrer-Check) → Kuerzel U (unentschuldigt), ✓ (anwesend)

type DayCellInfo = { code: string; color: string } | null;

function MonthView({ spaceId, jwt }: { spaceId: string; jwt: string }): JSX.Element {
    const t = useT();
    const [absences, setAbsences] = useState<AbsenceEntry[]>([]);
    const [morningChecks, setMorningChecks] = useState<MorningCheckDay[]>([]);
    const [loading, setLoading] = useState(true);
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth());
    const [year, setYear] = useState(now.getFullYear());

    const MONTH_NAMES = useMemo(() => getMonthNames(), []);

    useEffect(() => {
        const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
        setLoading(true);
        Promise.all([
            fetchAbsences(jwt, spaceId, from, to),
            fetchMorningChecks(jwt, spaceId, from, to),
        ]).then(([a, mc]) => {
            setAbsences(a);
            setMorningChecks(mc);
            setLoading(false);
        });
    }, [jwt, spaceId, month, year]);

    // Index: morningChecks by date → by studentName
    const checkByDateStudent = new Map<string, Map<string, string>>();
    for (const check of morningChecks) {
        const studentMap = new Map<string, string>();
        for (const e of check.entries) {
            studentMap.set(e.studentName, e.status);
        }
        checkByDateStudent.set(check.date, studentMap);
    }

    // Alle Schueler-Namen sammeln (aus beiden Quellen)
    const allStudents = new Set<string>();
    for (const a of absences) allStudents.add(a.studentName);
    for (const check of morningChecks) {
        for (const e of check.entries) allStudents.add(e.studentName);
    }

    // Absence-Lookup: studentName → entries
    const absenceByStudent = new Map<string, AbsenceEntry[]>();
    for (const a of absences) {
        const list = absenceByStudent.get(a.studentName) ?? [];
        list.push(a);
        absenceByStudent.set(a.studentName, list);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Zelle berechnen: Absence hat Vorrang, dann MorningCheck
    function getCell(name: string, dayDate: string): DayCellInfo {
        // 1. Absence-Meldung?
        const entries = absenceByStudent.get(name);
        if (entries) {
            const match = entries.find(e => {
                const start = e.date.split('T')[0];
                const end = (e.endDate ?? e.date).split('T')[0];
                return dayDate >= start && dayDate <= end;
            });
            if (match) {
                const code = match.reason === 'sick' ? 'K' : match.reason === 'appointment' ? 'A' : match.reason === 'family' ? 'F' : 'S';
                return { code, color: match.reason === 'sick' ? 'text-red-500' : 'text-amber-500' };
            }
        }
        // 2. MorningCheck-Status?
        const dayCheck = checkByDateStudent.get(dayDate);
        if (dayCheck) {
            const status = dayCheck.get(name);
            if (status === 'absent_unreported') return { code: 'U', color: 'text-orange-500' };
            if (status === 'late') return { code: 'V', color: 'text-purple-500' };
            // present → kein Marker (Punkt)
        }
        return null;
    }

    if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;

    const sortedStudents = [...allStudents].sort((a, b) => a.localeCompare(b, 'de'));

    return (
        <div className="flex-1 overflow-auto px-4 py-3">
            <div className="flex items-center justify-between mb-3">
                <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
                    className="text-xs text-muted-foreground hover:text-foreground">{t('absence.absence.lt')}</button>
                <span className="text-xs font-medium">{MONTH_NAMES[month]} {year}</span>
                <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
                    className="text-xs text-muted-foreground hover:text-foreground">{t('absence.absence.gt')}</button>
            </div>

            {sortedStudents.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-4">{t('absence.absence.keine_daten_in_diesem_monat')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left font-medium text-muted-foreground py-1 pr-2 sticky left-0 bg-background">{t('absence.absence.name')}</th>
                                {Array.from({ length: daysInMonth }, (_, i) => (
                                    <th key={i} className="w-5 text-center font-normal text-muted-foreground/60">{i + 1}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedStudents.map((name) => (
                                <tr key={name}>
                                    <td className="py-1 pr-2 font-medium sticky left-0 bg-background">{name}</td>
                                    {Array.from({ length: daysInMonth }, (_, i) => {
                                        const day = i + 1;
                                        const dayDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const cell = getCell(name, dayDate);
                                        if (!cell) return <td key={i} className="text-center text-muted-foreground/30">·</td>;
                                        return <td key={i} className={cn('text-center font-medium', cell.color)}>{cell.code}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="mt-2 flex flex-wrap gap-3 text-[9px] text-muted-foreground">
                        <span><strong className="text-red-500">K</strong> {t('absence.absence.krank')}</span>
                        <span><strong className="text-amber-500">A</strong> {t('absence.absence.arzttermin')}</span>
                        <span><strong className="text-amber-500">F</strong> {t('absence.absence.familiaer')}</span>
                        <span><strong className="text-amber-500">S</strong> {t('absence.absence.sonstiges')}</span>
                        <span><strong className="text-orange-500">U</strong> {t('absence.absence.unentschuldigt')}</span>
                        <span><strong className="text-purple-500">V</strong> {t('absence.absence.verspaetet')}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
