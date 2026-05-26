/**
 * Pre-Pinning-Editor
 *
 * Owner pflegt vor dem Solver-Lauf was er ueber seine Schule weiss:
 *   - pro Klasse den Stammraum
 *   - pro Klasse × Fach den Lehrer + Wichtigkeit (0-100)
 *   - optional Spezial-Raum (Sporthalle, Werkstatt) ueberschreibt Stammraum
 *
 * Reduziert den CP-SAT-Suchraum massiv — bei einer typischen Waldorf-
 * Schule fallen 50-70% der Variablen weg.
 *
 * UX:
 *   - Sidebar links: Klassen-Liste mit Vollstaendigkeits-%, Sortierung asc
 *   - Hauptbereich: pro Klasse Tabelle Fach × Lehrer-Picker × Wichtigkeit
 *   - Top-Bar mit Gesamt-%-Fortschritt
 *   - „Klassenlehrer uebernimmt"-Button setzt alle Pflicht-Faecher auf
 *     einen Lehrer in einem Schritt
 */
import { type JSX, useState, useSyncExternalStore, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import {
    createStundenplanGateway,
    type ClassSubjectAssignment,
    type ClassStammRoom,
    type Subject,
    type Room,
    type StaffMember,
    type SubjectGradeHoursEntry,
    type InstructionGroup,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();

export function PrePinningEditor({ onClose }: { onClose: () => void }): JSX.Element {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const qc = useQueryClient();
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [classFilter, setClassFilter] = useState('');

    const classesQ = useQuery({
        queryKey: ['stundenplan-class-spaces'] as const,
        enabled: !!jwt, queryFn: () => gateway.listClassSpaces(jwt),
    });
    const subjectsQ = useQuery({
        queryKey: ['stundenplan-subjects'] as const,
        enabled: !!jwt, queryFn: () => gateway.listSubjects(jwt),
    });
    const roomsQ = useQuery({
        queryKey: ['stundenplan-rooms'] as const,
        enabled: !!jwt, queryFn: () => gateway.listRooms(jwt),
    });
    const staffQ = useQuery({
        queryKey: ['stundenplan-staff'] as const,
        enabled: !!jwt, queryFn: () => gateway.listStaffWithRoles(jwt),
    });
    const sgHoursQ = useQuery({
        queryKey: ['stundenplan-subject-grade-hours'] as const,
        enabled: !!jwt, queryFn: () => gateway.listSubjectGradeHours(jwt),
    });
    const assignmentsQ = useQuery({
        queryKey: ['stundenplan-class-subject-assignments'] as const,
        enabled: !!jwt, queryFn: () => gateway.listClassSubjectAssignments(jwt),
    });
    const stammRoomsQ = useQuery({
        queryKey: ['stundenplan-class-stamm-rooms'] as const,
        enabled: !!jwt, queryFn: () => gateway.listClassStammRooms(jwt),
    });
    const groupsQ = useQuery({
        queryKey: ['stundenplan-instruction-groups'] as const,
        enabled: !!jwt, queryFn: () => gateway.listInstructionGroups(jwt),
    });

    const classes = classesQ.data?.classes ?? [];
    const subjects = subjectsQ.data?.subjects ?? [];
    const rooms = roomsQ.data?.rooms ?? [];
    const teachers = (staffQ.data?.staff ?? []).filter((s) => s.grants?.some((g) => g.role === 'teacher'));
    const sgHours = sgHoursQ.data?.entries ?? [];
    const assignments = assignmentsQ.data?.assignments ?? [];
    const stammRooms = stammRoomsQ.data?.stammRooms ?? [];
    const instructionGroups = groupsQ.data?.instructionGroups ?? [];

    // Halbgruppen pro Klasse — nur splitType in [half/third/quarter] mit
    // gesetztem classSpaceId. Sortiert nach groupIndex damit h1, h2 in
    // der richtigen Reihenfolge erscheinen.
    const splitGroupsByClass = useMemo(() => {
        const m = new Map<string, InstructionGroup[]>();
        for (const g of instructionGroups) {
            if (!g.classSpaceId) continue;
            if (!['half', 'third', 'quarter'].includes(g.splitType)) continue;
            const arr = m.get(g.classSpaceId) ?? [];
            arr.push(g);
            m.set(g.classSpaceId, arr);
        }
        for (const arr of m.values()) {
            arr.sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
        }
        return m;
    }, [instructionGroups]);

    // Assignments fuer Halbgruppen (instructionGroupId gesetzt) gruppieren
    const groupAssignmentsByGroupId = useMemo(() => {
        const m = new Map<string, ClassSubjectAssignment>();
        for (const a of assignments) {
            if (a.instructionGroupId) m.set(a.instructionGroupId, a);
        }
        return m;
    }, [assignments]);

    // Vorbereitete Lookups (memoized)
    const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
    const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
    const teachersByMatrixId = useMemo(() => new Map(teachers.map((t) => [t.matrixUserId, t])), [teachers]);
    const stammRoomByClass = useMemo(() => new Map(stammRooms.map((s) => [s.classSpaceId, s])), [stammRooms]);
    const assignmentByKey = useMemo(() => {
        const m = new Map<string, ClassSubjectAssignment>();
        // Nur "ganze Klasse"-Assignments (instructionGroupId=null) — Halbgruppen
        // werden separat ueber groupAssignmentsByGroupId angezeigt.
        for (const a of assignments) {
            if (!a.instructionGroupId) m.set(`${a.classSpaceId}::${a.subjectId}`, a);
        }
        return m;
    }, [assignments]);
    const sgHoursByClass = useMemo(() => {
        const m = new Map<string, SubjectGradeHoursEntry[]>();
        for (const e of sgHours) {
            const arr = m.get(e.classSpaceId) ?? [];
            arr.push(e);
            m.set(e.classSpaceId, arr);
        }
        return m;
    }, [sgHours]);

    // Pro Klasse: Vollstaendigkeit berechnen.
    //   = Anzahl Subjects mit teacherMatrixId gesetzt + Stammraum gesetzt
    //   / Anzahl Subjects in Stundentafel + 1 (fuer Stammraum)
    const completionByClass = useMemo(() => {
        const m = new Map<string, { done: number; total: number; pct: number }>();
        for (const cls of classes) {
            const sgList = sgHoursByClass.get(cls.id) ?? [];
            const total = sgList.length + 1; // +1 = Stammraum-Slot
            let done = stammRoomByClass.has(cls.id) ? 1 : 0;
            for (const sg of sgList) {
                const a = assignmentByKey.get(`${cls.id}::${sg.subjectId}`);
                if (a?.teacherMatrixId) done++;
            }
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            m.set(cls.id, { done, total, pct });
        }
        return m;
    }, [classes, sgHoursByClass, stammRoomByClass, assignmentByKey]);

    const filteredClasses = useMemo(() => {
        const q = classFilter.trim().toLowerCase();
        const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
        return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
    }, [classes, classFilter]);

    // Gesamt-Fortschritt
    const overall = useMemo(() => {
        let totalDone = 0, totalNeed = 0;
        for (const v of completionByClass.values()) {
            totalDone += v.done; totalNeed += v.total;
        }
        return { done: totalDone, total: totalNeed, pct: totalNeed > 0 ? Math.round((totalDone / totalNeed) * 100) : 0 };
    }, [completionByClass]);

    const loading = classesQ.isLoading || subjectsQ.isLoading || roomsQ.isLoading || staffQ.isLoading
        || sgHoursQ.isLoading || assignmentsQ.isLoading || stammRoomsQ.isLoading || groupsQ.isLoading;

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['stundenplan-class-subject-assignments'] });
        qc.invalidateQueries({ queryKey: ['stundenplan-class-stamm-rooms'] });
        qc.invalidateQueries({ queryKey: ['stundenplan-instruction-groups'] });
    };

    return (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
            <button
                type="button" onClick={onClose}
                className="flex-1 bg-foreground/40 backdrop-blur-sm"
                aria-label="Schliessen"
            />
            <div className="flex h-full w-full max-w-[1280px] flex-col border-l bg-background shadow-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
                    <MaterialIcon name="push_pin" size={20} className="text-primary" />
                    <div className="flex-1">
                        <div className="text-sm font-semibold">Voraus-Zuweisung (Klassenlehrer + Stammräume)</div>
                        <div className="text-[11px] text-muted-foreground">
                            Was Du fix weisst → der Solver muss nur noch die Rest-Konflikte lösen
                        </div>
                    </div>
                    <OverallProgress overall={overall} />
                    <button
                        onClick={onClose}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <MaterialIcon name="close" size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-1 items-center justify-center text-muted-foreground">
                        Lädt …
                    </div>
                ) : classes.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-muted-foreground">
                        Keine Klassen angelegt. Zuerst im Schuljahr-Wizard oder Stammdaten anlegen.
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1">
                        {/* Sidebar — Klassen-Liste */}
                        <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/10">
                            <div className="border-b p-2">
                                <div className="relative">
                                    <MaterialIcon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="search" value={classFilter}
                                        onChange={(e) => setClassFilter(e.target.value)}
                                        placeholder="Klasse suchen …"
                                        className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                            <ul className="flex-1 overflow-y-auto divide-y divide-border/40">
                                {filteredClasses.map((cls) => {
                                    const comp = completionByClass.get(cls.id) ?? { done: 0, total: 0, pct: 0 };
                                    const active = selectedClassId === cls.id;
                                    const tone = comp.pct >= 90 ? 'emerald' : comp.pct >= 50 ? 'amber' : 'rose';
                                    return (
                                        <li key={cls.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedClassId(cls.id)}
                                                className={cn(
                                                    'flex w-full flex-col gap-1.5 px-3 py-2 text-left transition-colors',
                                                    active ? 'bg-primary/10' : 'hover:bg-muted',
                                                )}
                                            >
                                                <div className="flex items-center justify-between text-[13px]">
                                                    <span className={cn('truncate font-medium', active && 'text-primary')}>{cls.name}</span>
                                                    <span className="tabular-nums text-[10px] text-muted-foreground">{comp.done}/{comp.total}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                                        <div className={cn(
                                                            'h-full transition-all',
                                                            tone === 'emerald' && 'bg-emerald-500',
                                                            tone === 'amber' && 'bg-amber-500',
                                                            tone === 'rose' && 'bg-rose-500',
                                                        )} style={{ width: `${comp.pct}%` }} />
                                                    </div>
                                                    <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{comp.pct}%</span>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </aside>

                        {/* Hauptbereich */}
                        <main className="flex flex-1 flex-col overflow-y-auto">
                            {!selectedClassId ? (
                                <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                                    Klasse links auswählen.
                                </div>
                            ) : (
                                <ClassDetail
                                    jwt={jwt}
                                    classSpace={classes.find((c) => c.id === selectedClassId)!}
                                    subjects={subjects}
                                    rooms={rooms}
                                    teachers={teachers}
                                    sgHours={sgHoursByClass.get(selectedClassId) ?? []}
                                    assignmentByKey={assignmentByKey}
                                    stammRoom={stammRoomByClass.get(selectedClassId) ?? null}
                                    subjectsById={subjectsById}
                                    roomsById={roomsById}
                                    teachersByMatrixId={teachersByMatrixId}
                                    splitGroups={splitGroupsByClass.get(selectedClassId) ?? []}
                                    groupAssignments={groupAssignmentsByGroupId}
                                    onChange={refresh}
                                />
                            )}
                        </main>
                    </div>
                )}
            </div>
        </div>
    );
}

function OverallProgress({ overall }: { overall: { done: number; total: number; pct: number } }): JSX.Element {
    const tone = overall.pct >= 90 ? 'bg-emerald-500' : overall.pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
    return (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
            <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Gesamt</span>
                <span className="text-[12px] font-semibold tabular-nums">{overall.done} von {overall.total}</span>
            </div>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full transition-all', tone)} style={{ width: `${overall.pct}%` }} />
            </div>
            <span className="w-9 text-right text-[13px] font-semibold tabular-nums">{overall.pct}%</span>
        </div>
    );
}

// ─── Klassen-Detail ────────────────────────────────────────────────
function ClassDetail({
    jwt, classSpace, subjects, rooms, teachers, sgHours,
    assignmentByKey, stammRoom, subjectsById, roomsById, teachersByMatrixId,
    splitGroups, groupAssignments, onChange,
}: {
    jwt: string;
    classSpace: { id: string; name: string };
    subjects: Subject[];
    rooms: Room[];
    teachers: StaffMember[];
    sgHours: SubjectGradeHoursEntry[];
    assignmentByKey: Map<string, ClassSubjectAssignment>;
    stammRoom: ClassStammRoom | null;
    subjectsById: Map<string, Subject>;
    roomsById: Map<string, Room>;
    teachersByMatrixId: Map<string, StaffMember>;
    splitGroups: InstructionGroup[];
    groupAssignments: Map<string, ClassSubjectAssignment>;
    onChange: () => void;
}): JSX.Element {
    const [bulkTeacher, setBulkTeacher] = useState('');
    const [busy, setBusy] = useState(false);
    const sorted = useMemo(() => {
        return [...sgHours].sort((a, b) => {
            const la = subjectsById.get(a.subjectId)?.label ?? '';
            const lb = subjectsById.get(b.subjectId)?.label ?? '';
            return la.localeCompare(lb, 'de');
        });
    }, [sgHours, subjectsById]);

    async function setStammRoom(roomId: string | null) {
        if (busy) return;
        setBusy(true);
        try {
            if (roomId) {
                await gateway.upsertClassStammRoom(jwt, { classSpaceId: classSpace.id, roomId });
            } else {
                await gateway.deleteClassStammRoom(jwt, classSpace.id);
            }
            onChange();
        } finally { setBusy(false); }
    }

    async function applyTeacherToAllPflicht(teacherMatrixId: string) {
        if (busy || !teacherMatrixId) return;
        setBusy(true);
        try {
            // "Pflicht"-Faecher = alle in der Stundentafel der Klasse.
            // Behalte bestehende splitInto/additionalTeachers (sonst geht der
            // Eurythmie-Split verloren wenn der Klassenlehrer alles
            // uebernimmt).
            for (const sg of sorted) {
                const existing = assignmentByKeyLocal.get(`${classSpace.id}::${sg.subjectId}`);
                await gateway.upsertClassSubjectAssignment(jwt, {
                    classSpaceId: classSpace.id,
                    subjectId: sg.subjectId,
                    teacherMatrixId,
                    pinnedRoomId: existing?.pinnedRoomId ?? null,
                    importance: 100,
                    splitInto: existing?.splitInto ?? 1,
                    additionalTeacherMatrixIds: existing?.additionalTeacherMatrixIds ?? [],
                });
            }
            setBulkTeacher('');
            onChange();
        } finally { setBusy(false); }
    }

    // assignmentByKey wird vom Parent uebergeben, aber lokales Lookup brauchen wir.
    const assignmentByKeyLocal = assignmentByKey;

    return (
        <div className="flex flex-col">
            {/* Klassen-Header */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background px-5 py-3">
                <MaterialIcon name="school" size={20} className="text-primary" />
                <h3 className="text-base font-semibold">{classSpace.name}</h3>
                <span className="text-[11px] text-muted-foreground">
                    {sorted.length} Faecher in Stundentafel
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <select
                        value={bulkTeacher}
                        onChange={(e) => setBulkTeacher(e.target.value)}
                        className="h-8 rounded-md border bg-background px-2 text-[12px]"
                    >
                        <option value="">— Klassenlehrer auswählen —</option>
                        {teachers.map((t) => (
                            <option key={t.matrixUserId} value={t.matrixUserId}>
                                {t.displayName ?? t.matrixUserId.split(':')[0].slice(1)}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => bulkTeacher && applyTeacherToAllPflicht(bulkTeacher)}
                        disabled={busy || !bulkTeacher}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        title="Setzt alle Faecher dieser Klasse auf diesen Lehrer mit Wichtigkeit 100"
                    >
                        <MaterialIcon name="auto_fix_high" size={14} />
                        Klassenlehrer übernimmt alles
                    </button>
                </div>
            </div>

            {/* Stammraum-Selector */}
            <div className="border-b bg-muted/20 px-5 py-3">
                <div className="flex items-center gap-3">
                    <MaterialIcon name="meeting_room" size={16} className="text-muted-foreground" />
                    <span className="text-[12px] font-medium">Stammraum:</span>
                    <select
                        value={stammRoom?.roomId ?? ''}
                        onChange={(e) => setStammRoom(e.target.value || null)}
                        disabled={busy}
                        className="h-8 rounded-md border bg-background px-2 text-[12px] flex-1 max-w-md"
                    >
                        <option value="">— keiner —</option>
                        {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.label}{r.resourceTags.length > 0 ? ` (${r.resourceTags.join(',')})` : ''}
                            </option>
                        ))}
                    </select>
                    {stammRoom && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                            ✓ Solver pinnt alle Faecher dieser Klasse in {roomsById.get(stammRoom.roomId)?.label ?? '?'}
                        </span>
                    )}
                </div>
            </div>

            {/* Pflichtfaecher-Tabelle (ganze Klasse) */}
            <div className="border-b px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pflichtfächer (ganze Klasse)
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 text-left">Fach</th>
                            <th className="px-3 py-2 text-right w-[60px]">h/Wo</th>
                            <th className="px-3 py-2 text-left w-[260px]">Lehrer</th>
                            <th className="px-3 py-2 text-left w-[200px]">Spezial-Raum</th>
                            <th className="px-3 py-2 text-left w-[200px]">Wichtigkeit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((sg) => {
                            const subj = subjectsById.get(sg.subjectId);
                            const a = assignmentByKey.get(`${classSpace.id}::${sg.subjectId}`);
                            return (
                                <SubjectRow
                                    key={sg.id}
                                    jwt={jwt}
                                    classSpaceId={classSpace.id}
                                    subjectId={sg.subjectId}
                                    subjectLabel={subj?.label ?? sg.subjectId}
                                    weeklyHours={Number(sg.weeklyHours)}
                                    teachers={teachers}
                                    rooms={rooms}
                                    assignment={a ?? null}
                                    onChange={onChange}
                                    teachersByMatrixId={teachersByMatrixId}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── Parallele Halbgruppen-Sektion ── */}
            <SplitGroupsSection
                jwt={jwt}
                classSpaceId={classSpace.id}
                splitGroups={splitGroups}
                groupAssignments={groupAssignments}
                subjects={subjects}
                rooms={rooms}
                teachers={teachers}
                onChange={onChange}
            />

            <div className="p-3 text-[11px] text-muted-foreground">
                <MaterialIcon name="info" size={11} className="-mt-0.5 mr-1 inline" />
                Wichtigkeit <strong>100</strong> = harter Pin (Solver MUSS diesen Lehrer nehmen).
                <strong> 80</strong> = stark bevorzugt, kann bei Konflikt weichen.
                <strong> 0</strong> = Lehrer ist nur Vorschlag.
            </div>
        </div>
    );
}

// ─── Parallele Halbgruppen (Eurythmie ↔ Sprache etc.) ──────────────
function SplitGroupsSection({
    jwt, classSpaceId, splitGroups, groupAssignments, subjects, rooms, teachers, onChange,
}: {
    jwt: string;
    classSpaceId: string;
    splitGroups: InstructionGroup[];
    groupAssignments: Map<string, ClassSubjectAssignment>;
    subjects: Subject[];
    rooms: Room[];
    teachers: StaffMember[];
    onChange: () => void;
}): JSX.Element {
    // Halbgruppen nach (splitType + groupCount) gruppieren → ein Block pro
    // Teilungstyp (z.B. alle ½-Gruppen, alle ⅓-Gruppen).
    const blocks = useMemo(() => {
        const m = new Map<string, InstructionGroup[]>();
        for (const g of splitGroups) {
            const key = `${g.splitType}::${g.groupCount ?? '?'}`;
            const arr = m.get(key) ?? [];
            arr.push(g);
            m.set(key, arr);
        }
        return Array.from(m.entries()).map(([key, gs]) => ({ key, groups: gs.sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0)) }));
    }, [splitGroups]);

    if (splitGroups.length === 0) {
        return (
            <div className="border-t border-dashed bg-muted/10 px-5 py-3 text-[11px] text-muted-foreground">
                <MaterialIcon name="call_split" size={12} className="-mt-0.5 mr-1 inline" />
                Keine Halbgruppen für diese Klasse — wenn z.B. Eurythmie ↔ Sprache parallel laufen sollen,
                lege sie in <strong>Stammdaten → Klassen & Gruppen</strong> mit dem Button „½ Halbe Klassen" an.
            </div>
        );
    }

    return (
        <div className="border-t bg-amber-50/30 dark:bg-amber-950/10 px-5 py-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                <MaterialIcon name="call_split" size={12} className="-mt-0.5 mr-1 inline" />
                Geteilte Stunden (parallele Halbgruppen)
            </div>
            {blocks.map((block) => {
                const cfg = block.groups[0];
                const icon = cfg.splitType === 'half' ? '½' : cfg.splitType === 'third' ? '⅓' : '¼';
                return (
                    <div key={block.key} className="rounded-md border border-amber-200 bg-background dark:border-amber-900/40">
                        <div className="flex items-center gap-2 border-b border-amber-200/50 bg-amber-100/40 px-3 py-1.5 text-[11px] dark:border-amber-900/40 dark:bg-amber-950/20">
                            <span className="text-base">{icon}</span>
                            <span className="font-medium">
                                {cfg.groupCount} parallele Gruppen — gleicher Zeitslot, verschiedene Fächer/Räume/Lehrer
                            </span>
                        </div>
                        <table className="w-full text-[12px]">
                            <thead className="bg-muted/20 text-[9px] uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-1.5 text-left w-[90px]">Gruppe</th>
                                    <th className="px-3 py-1.5 text-left">Fach</th>
                                    <th className="px-3 py-1.5 text-left w-[220px]">Lehrer</th>
                                    <th className="px-3 py-1.5 text-left w-[180px]">Raum</th>
                                    <th className="px-3 py-1.5 text-left w-[140px]">Wichtigkeit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {block.groups.map((g) => (
                                    <SplitGroupRow
                                        key={g.id}
                                        jwt={jwt}
                                        classSpaceId={classSpaceId}
                                        group={g}
                                        assignment={groupAssignments.get(g.id) ?? null}
                                        subjects={subjects}
                                        rooms={rooms}
                                        teachers={teachers}
                                        onChange={onChange}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </div>
    );
}

function SplitGroupRow({
    jwt, classSpaceId, group, assignment, subjects, rooms, teachers, onChange,
}: {
    jwt: string;
    classSpaceId: string;
    group: InstructionGroup;
    assignment: ClassSubjectAssignment | null;
    subjects: Subject[];
    rooms: Room[];
    teachers: StaffMember[];
    onChange: () => void;
}): JSX.Element {
    const [busy, setBusy] = useState(false);
    const subjectId = assignment?.subjectId ?? '';
    const teacherId = assignment?.teacherMatrixId ?? '';
    const roomId = assignment?.pinnedRoomId ?? '';
    const importance = assignment?.importance ?? 80;

    async function upsert(patch: {
        subjectId?: string;
        teacherMatrixId?: string | null;
        pinnedRoomId?: string | null;
        importance?: number;
    }) {
        if (busy) return;
        const nextSubject = patch.subjectId ?? assignment?.subjectId ?? '';
        if (!nextSubject) {
            // Ohne Fach kein Speichern (DB-Pflichtfeld). Falls Assignment existiert
            // und User wieder auf "kein Fach" stellt → Eintrag loeschen.
            if (assignment && patch.subjectId === '') {
                setBusy(true);
                try {
                    await gateway.deleteClassSubjectAssignment(jwt, assignment.id);
                    onChange();
                } finally { setBusy(false); }
            }
            return;
        }
        setBusy(true);
        try {
            await gateway.upsertClassSubjectAssignment(jwt, {
                classSpaceId,
                subjectId: nextSubject,
                instructionGroupId: group.id,
                teacherMatrixId: patch.teacherMatrixId !== undefined ? patch.teacherMatrixId : (assignment?.teacherMatrixId ?? null),
                pinnedRoomId: patch.pinnedRoomId !== undefined ? patch.pinnedRoomId : (assignment?.pinnedRoomId ?? null),
                importance: patch.importance ?? assignment?.importance ?? 80,
                splitInto: 1,
                additionalTeacherMatrixIds: [],
            });
            onChange();
        } finally { setBusy(false); }
    }

    const importanceLabel = importance === 100 ? 'Hard'
        : importance >= 80 ? 'Sehr wichtig'
            : importance >= 50 ? 'Mittel'
                : importance > 0 ? 'Weich'
                    : 'Frei';

    return (
        <tr className="border-t border-border/40 hover:bg-muted/10 align-top">
            <td className="px-3 py-1.5">
                <span className="inline-flex h-5 items-center rounded bg-amber-100 px-1.5 font-mono text-[10px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    {group.groupKey}
                </span>
            </td>
            <td className="px-3 py-1.5">
                <select
                    value={subjectId}
                    onChange={(e) => upsert({ subjectId: e.target.value })}
                    disabled={busy}
                    className="h-7 w-full rounded-md border bg-background px-2 text-[12px]"
                >
                    <option value="">— Fach wählen —</option>
                    {subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-1.5">
                <select
                    value={teacherId}
                    onChange={(e) => upsert({ teacherMatrixId: e.target.value || null })}
                    disabled={busy || !subjectId}
                    className="h-7 w-full rounded-md border bg-background px-2 text-[12px]"
                >
                    <option value="">— frei —</option>
                    {teachers.map((t) => (
                        <option key={t.matrixUserId} value={t.matrixUserId}>
                            {t.displayName ?? t.matrixUserId.split(':')[0].slice(1)}
                        </option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-1.5">
                <select
                    value={roomId}
                    onChange={(e) => upsert({ pinnedRoomId: e.target.value || null })}
                    disabled={busy || !subjectId}
                    className="h-7 w-full rounded-md border bg-background px-2 text-[12px]"
                >
                    <option value="">— Stammraum —</option>
                    {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.label}{r.resourceTags.length > 0 ? ` (${r.resourceTags.join(',')})` : ''}
                        </option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                    <input
                        type="range" min={0} max={100} step={10}
                        value={importance}
                        onChange={(e) => upsert({ importance: parseInt(e.target.value, 10) })}
                        disabled={busy || !subjectId}
                        className="flex-1"
                    />
                    <span className="w-16 text-right text-[10px] tabular-nums text-muted-foreground">
                        {importance} · {importanceLabel}
                    </span>
                </div>
            </td>
        </tr>
    );
}

// ─── Fach-Zeile ────────────────────────────────────────────────────
function SubjectRow({
    jwt, classSpaceId, subjectId, subjectLabel, weeklyHours,
    teachers, rooms, assignment, onChange, teachersByMatrixId,
}: {
    jwt: string;
    classSpaceId: string;
    subjectId: string;
    subjectLabel: string;
    weeklyHours: number;
    teachers: StaffMember[];
    rooms: Room[];
    assignment: ClassSubjectAssignment | null;
    onChange: () => void;
    teachersByMatrixId: Map<string, StaffMember>;
}): JSX.Element {
    const [busy, setBusy] = useState(false);
    const teacherId = assignment?.teacherMatrixId ?? '';
    const roomId = assignment?.pinnedRoomId ?? '';
    const importance = assignment?.importance ?? 80;

    async function upsert(patch: {
        teacherMatrixId?: string | null;
        pinnedRoomId?: string | null;
        importance?: number;
    }) {
        if (busy) return;
        setBusy(true);
        try {
            await gateway.upsertClassSubjectAssignment(jwt, {
                classSpaceId, subjectId,
                teacherMatrixId: patch.teacherMatrixId !== undefined ? patch.teacherMatrixId : (assignment?.teacherMatrixId ?? null),
                pinnedRoomId: patch.pinnedRoomId !== undefined ? patch.pinnedRoomId : (assignment?.pinnedRoomId ?? null),
                importance: patch.importance ?? assignment?.importance ?? 80,
                splitInto: 1,
                additionalTeacherMatrixIds: [],
            });
            onChange();
        } finally { setBusy(false); }
    }

    const importanceLabel = importance === 100 ? 'Hard'
        : importance >= 80 ? 'Sehr wichtig'
            : importance >= 50 ? 'Mittel'
                : importance > 0 ? 'Weich'
                    : 'Frei';
    const importanceTone = importance === 100 ? 'text-red-700 dark:text-red-300'
        : importance >= 80 ? 'text-amber-700 dark:text-amber-300'
            : 'text-muted-foreground';

    return (
        <tr className="border-t border-border/40 hover:bg-muted/20 align-top">
            <td className="px-3 py-2 font-medium">{subjectLabel}</td>
            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{weeklyHours}h</td>
            <td className="px-3 py-2">
                <select
                    value={teacherId}
                    onChange={(e) => upsert({ teacherMatrixId: e.target.value || null })}
                    disabled={busy}
                    className="h-7 w-full rounded-md border bg-background px-2 text-[12px]"
                >
                    <option value="">— frei —</option>
                    {teachers.map((t) => (
                        <option key={t.matrixUserId} value={t.matrixUserId}>
                            {t.displayName ?? t.matrixUserId.split(':')[0].slice(1)}
                        </option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-2">
                <select
                    value={roomId}
                    onChange={(e) => upsert({ pinnedRoomId: e.target.value || null })}
                    disabled={busy}
                    className="h-7 w-full rounded-md border bg-background px-2 text-[12px]"
                >
                    <option value="">— Stammraum —</option>
                    {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.label}{r.resourceTags.length > 0 ? ` (${r.resourceTags.join(',')})` : ''}
                        </option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                    <input
                        type="range" min={0} max={100} step={10}
                        value={importance}
                        onChange={(e) => upsert({ importance: parseInt(e.target.value, 10) })}
                        disabled={busy}
                        className="flex-1"
                    />
                    <span className={cn('w-20 text-right text-[10px] font-medium tabular-nums', importanceTone)}>
                        {importance} · {importanceLabel}
                    </span>
                </div>
            </td>
        </tr>
    );
}

