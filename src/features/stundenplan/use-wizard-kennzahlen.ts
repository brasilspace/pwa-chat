/**
 * useWizardKennzahlen
 *
 * Aggregiert die laufenden Stundenplan-Daten zu einer ueberschaubaren
 * Status-Box: Bedarf (Wochenstunden), Angebot (Lehrer-Deputate), Fach-
 * Luecken. Wird im Wizard-Header gezeigt und in Step 4 als Banner.
 *
 * Quellen (alle ueber das bestehende Gateway):
 *   - ClassSpaces  (Wieviele Klassen)
 *   - Staff        (Wieviele Lehrer / Schulmitglieder)
 *   - SubjectGradeHours (echte Stundentafel-Eintraege, wenn schon angelegt)
 *   - Lehrplan-Vorlage  (Fallback: Klassen × Stunden aus Lehrplan)
 *   - TeacherQualifications  (welche Faecher abgedeckt)
 *   - EmployeeDeputats       (vertragliche Stunden)
 *
 * Bedarf:
 *   1. Wenn SubjectGradeHours fuer aktuelle Klassen befuellt: Summe daraus.
 *   2. Sonst: Klassenname → Stufenziffer extrahieren → Lehrplan-Slot
 *      aus dieser Stufe nehmen, weeklyHours pro Klasse summieren.
 *
 * Angebot:
 *   - Summe EmployeeDeputat.contractedHoursWeek fuer alle Lehrer.
 *   - Fallback wenn nichts hinterlegt: teacherCount × DEFAULT_DEPUTAT.
 */
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import {
    createStundenplanGateway,
    type ReadinessReport,
    type ReadinessVector,
} from '@/gateways/platform/stundenplan-gateway';
import { setupWizardStore } from './setup-wizard-store';

const gateway = createStundenplanGateway();

/** Standard-Deputat einer Vollzeit-Lehrkraft (Bayern ~25, NRW ~26-28h). */
const DEFAULT_DEPUTAT_HOURS = 25;

export interface WizardKennzahlen {
    loading: boolean;
    classCount: number;
    teacherCount: number;
    staffCount: number;
    /** Geschaetzter wochenstunden-Bedarf (siehe Doc oben). */
    demandHours: number;
    demandSource: 'stundentafel' | 'lehrplan-geschaetzt' | 'unbekannt';
    /** Wochenstunden-Angebot durch Lehrer-Deputate. */
    supplyHours: number;
    supplySource: 'deputate' | 'pauschal-geschaetzt';
    /** Anteil Angebot/Bedarf (z.B. 1.07 = 107% Versorgung). null wenn Bedarf=0. */
    coverageRatio: number | null;
    /** Faecher die in Stundentafel/Lehrplan vorkommen — Set fuer Vergleiche. */
    requiredSubjectKeys: Set<string>;
    /** Faecher die kein Lehrer abdeckt (subjectKey + Label). */
    missingTeacherSubjects: Array<{ key: string; label: string }>;
    /** Faecher die noch nicht in der Stundentafel stehen. */
    missingStundentafelSubjects: Array<{ key: string; label: string }>;
    /** Lehrplan-Fach-Keys, die noch nicht als Subject-Entity in der DB existieren. */
    missingSubjectEntities: Array<{ key: string; label: string }>;

    /**
     * Pro-Fach-Versorgung. Schluessel = subject.key (oder label-slug falls
     * key fehlt). Bedarf summiert aus SubjectGradeHours oder Lehrplan,
     * Angebot teilt die Deputat-Stunden eines Lehrers gleichmaessig auf
     * seine qualifizierten Faecher auf — eine vereinfachte aber stabile
     * Heuristik, bis der Solver konkrete Zuweisungen kennt.
     */
    perSubject: Array<{
        subjectKey: string;
        subjectLabel: string;
        /** Wochenstunden-Bedarf ueber alle Klassen. */
        requiredHours: number;
        /** Anzahl Lehrer, die das Fach unterrichten duerfen. */
        qualifiedTeacherCount: number;
        /** Gewichteter Anteil der Deputat-Stunden, die rechnerisch fuer
         *  dieses Fach bereitstehen. */
        availableHours: number;
        /** Status: ok / warning / blocker — basierend auf required vs available. */
        status: 'ok' | 'warning' | 'blocker';
    }>;

    /**
     * Raum-Bedarf. Ein Raum kann pro Stunde nur einer Klasse/einem Lehrer
     * dienen — eine pauschale Untergrenze fuer die noetige Raum-Anzahl ist
     * `classCount` (parallele Stammraeume). Spezial-Raeume kommen pro
     * `requiredResourceTag` der genutzten Faecher dazu.
     */
    rooms: {
        roomCount: number;
        /** classCount — minimaler Bedarf an Stammraeumen. */
        stammraumNeeded: number;
        /** Anzahl Raeume ohne spezielle Tags, also Allzweck-Klassenraeume. */
        stammraumHave: number;
        /** Pro requiredResourceTag eines Fachs: wie viele Raeume tragen ihn. */
        specialRooms: Array<{
            tag: string;
            have: number;
            /** Anzahl Faecher die diesen Tag benoetigen (proxy fuer Mindest-Bedarf). */
            need: number;
            usedBy: string[]; // Fach-Labels
            status: 'ok' | 'warning' | 'blocker';
        }>;
    };

    // ── Bereitschaft (aus dem Backend-Readiness-Endpoint) ──────────
    /** 'ready' = Solver kann starten, 'warning' = startet aber suboptimal,
     * 'blocked' = essentielles fehlt. null wenn nicht geladen. */
    readinessVerdict: 'ready' | 'warning' | 'blocked' | null;
    blockerCount: number;
    warningCount: number;
    /** Lesbare Liste der Blocker (z.B. „Keine Klassen angelegt"). */
    blockerSummaries: string[];
    /** Lesbare Liste der Warnings. */
    warningSummaries: string[];
    /** Roher Readiness-Report fuer Detailansichten. */
    readinessVectors: ReadinessVector[];
}

const EMPTY: WizardKennzahlen = {
    loading: true,
    classCount: 0, teacherCount: 0, staffCount: 0,
    demandHours: 0, demandSource: 'unbekannt',
    supplyHours: 0, supplySource: 'pauschal-geschaetzt',
    coverageRatio: null,
    requiredSubjectKeys: new Set(),
    missingTeacherSubjects: [],
    missingStundentafelSubjects: [],
    missingSubjectEntities: [],
    perSubject: [],
    rooms: { roomCount: 0, stammraumNeeded: 0, stammraumHave: 0, specialRooms: [] },
    readinessVerdict: null,
    blockerCount: 0,
    warningCount: 0,
    blockerSummaries: [],
    warningSummaries: [],
    readinessVectors: [],
};

/**
 * Extrahiert die fuehrende Klassenstufen-Ziffer aus einem Klassennamen.
 *   "5a" → 5, "10b" → 10, "Q1" → null, "Klasse 7" → 7.
 */
function extractGradeNumber(name: string): number | null {
    const m = name.match(/(\d{1,2})/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 13 ? n : null;
}

/**
 * Mapped eine Klassenstufen-Ziffer auf einen Lehrplan-stageKey.
 * Probiert verschiedene Konventionen (z.B. "klasse-5", "5", "stufe-5",
 * "lower" vs "upper"). Faellt auf null zurueck wenn nichts passt.
 */
function findStageKeyForGrade(grade: number, stageKeys: string[]): string | null {
    const candidates = [
        String(grade),
        `klasse-${grade}`,
        `stufe-${grade}`,
        `grade-${grade}`,
    ];
    for (const c of candidates) {
        if (stageKeys.includes(c)) return c;
    }
    // Range-Stufen wie "5-6", "7-9", "10-12"
    for (const sk of stageKeys) {
        const m = sk.match(/^(\d{1,2})-(\d{1,2})$/);
        if (m) {
            const lo = parseInt(m[1], 10);
            const hi = parseInt(m[2], 10);
            if (grade >= lo && grade <= hi) return sk;
        }
    }
    // Semantik-Stufen — grobe Heuristik fuer DE-Gymnasium
    if (grade <= 4 && stageKeys.includes('orientation')) return 'orientation';
    if (grade >= 5 && grade <= 7 && stageKeys.includes('lower')) return 'lower';
    if (grade >= 8 && grade <= 9 && stageKeys.includes('middle')) return 'middle';
    if (grade >= 10 && stageKeys.includes('upper')) return 'upper';
    return null;
}

export function useWizardKennzahlen(): WizardKennzahlen {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const ui = useSyncExternalStore(setupWizardStore.subscribe, setupWizardStore.getSnapshot);
    const jwt = session.platform?.token;
    const lehrplanKey = ui.form.lehrplanKey;

    const enabled = !!jwt;

    const classesQ = useQuery({
        queryKey: ['stundenplan-class-spaces'] as const,
        enabled,
        queryFn: async () => gateway.listClassSpaces(jwt!),
    });
    const staffQ = useQuery({
        queryKey: ['stundenplan-staff'] as const,
        enabled,
        queryFn: async () => gateway.listStaffWithRoles(jwt!),
    });
    const qualsQ = useQuery({
        queryKey: ['stundenplan-quals'] as const,
        enabled,
        queryFn: async () => gateway.listTeacherQualifications(jwt!),
    });
    const subjectsQ = useQuery({
        queryKey: ['stundenplan-subjects'] as const,
        enabled,
        queryFn: async () => gateway.listSubjects(jwt!),
    });
    const sgHoursQ = useQuery({
        queryKey: ['stundenplan-subject-grade-hours'] as const,
        enabled,
        queryFn: async () => gateway.listSubjectGradeHours(jwt!),
    });
    const deputatsQ = useQuery({
        queryKey: ['stundenplan-deputats'] as const,
        enabled,
        queryFn: async () => gateway.listEmployeeDeputats(jwt!),
    });
    const lehrplanQ = useQuery({
        queryKey: ['stundenplan-lehrplan', lehrplanKey] as const,
        enabled: enabled && !!lehrplanKey,
        queryFn: async () => gateway.getLehrplan(jwt!, lehrplanKey!),
    });
    // Backend-Readiness-Report: liefert verdict + Blocker/Warnings auf
    // Vektorebene (qualifications/stammdaten/capacity/...).
    const readinessQ = useQuery({
        queryKey: ['stundenplan-readiness'] as const,
        enabled,
        queryFn: async () => gateway.getReadinessReport(jwt!),
    });
    const roomsQ = useQuery({
        queryKey: ['stundenplan-rooms'] as const,
        enabled,
        queryFn: async () => gateway.listRooms(jwt!),
    });

    if (!enabled || classesQ.isLoading || staffQ.isLoading || qualsQ.isLoading || subjectsQ.isLoading || sgHoursQ.isLoading || deputatsQ.isLoading || readinessQ.isLoading || roomsQ.isLoading) {
        return EMPTY;
    }

    const classes = classesQ.data?.classes ?? [];
    const staff = staffQ.data?.staff ?? [];
    const quals = qualsQ.data?.qualifications ?? [];
    const subjects = subjectsQ.data?.subjects ?? [];
    const sgHours = sgHoursQ.data?.entries ?? [];
    const deputats = deputatsQ.data?.deputats ?? [];
    const lehrplan = lehrplanQ.data?.template ?? null;

    const teachers = staff.filter((s) => s.grants?.some((g) => g.role === 'teacher'));
    const teacherIds = new Set(teachers.map((t) => t.matrixUserId));

    // ── Bedarf ───────────────────────────────────────────────────────
    let demandHours = 0;
    let demandSource: WizardKennzahlen['demandSource'] = 'unbekannt';

    // 1. Echte Stundentafel-Daten — falls schon Eintraege vorhanden
    if (sgHours.length > 0) {
        for (const e of sgHours) {
            demandHours += Number(e.weeklyHours) || 0;
        }
        demandSource = 'stundentafel';
    } else if (lehrplan && classes.length > 0) {
        // 2. Schaetzen aus Lehrplan-Vorlage
        for (const c of classes) {
            const grade = extractGradeNumber(c.name);
            if (!grade) continue;
            const stageKey = findStageKeyForGrade(grade, Object.keys(lehrplan.gradeStages));
            if (!stageKey) continue;
            const slots = lehrplan.gradeStages[stageKey] ?? [];
            for (const slot of slots) {
                demandHours += slot.weeklyHours;
            }
        }
        if (demandHours > 0) demandSource = 'lehrplan-geschaetzt';
    }

    // ── Angebot ──────────────────────────────────────────────────────
    // Pro Lehrer entscheiden, ob er ein hinterlegtes Deputat hat oder den
    // Pauschal-Default bekommt. Frueherer Bug: sobald irgendein Deputat
    // existierte, fielen ALLE anderen Lehrer auf 0 zurueck (statt 25h
    // Default). Folge: 35 Lehrer mit nur 1 Deputat = 25h gesamt
    // statt 25 + 34*25 = 875h.
    let supplyHours = 0;
    let hasAnyDeputat = false;
    const teacherDeputats = deputats.filter((d) => teacherIds.has(d.matrixUserId));
    const deputatByTeacher = new Map<string, number>();
    for (const d of teacherDeputats) {
        const contract = Number(d.contractedHoursWeek) || 0;
        const reduction = Number(d.reductionHoursWeek) || 0;
        deputatByTeacher.set(d.matrixUserId, Math.max(0, contract - reduction));
        hasAnyDeputat = true;
    }
    for (const teacher of teachers) {
        const explicit = deputatByTeacher.get(teacher.matrixUserId);
        supplyHours += explicit ?? DEFAULT_DEPUTAT_HOURS;
    }
    const supplySource: WizardKennzahlen['supplySource'] = hasAnyDeputat ? 'deputate' : 'pauschal-geschaetzt';

    // ── Fach-Luecken ────────────────────────────────────────────────
    // requiredSubjectKeys speichert key UND Label aus dem Lehrplan, damit
    // wir spaeter beim Subject-Lookup auch ueber das Label matchen koennen
    // (Lehrplan-Key 'EUR' ≠ DB-Subject-Key 'EU', aber gleiches Label
    // „Eurythmie"). Frueher landete „Eurythmie" daher faelschlich auf
    // der „Kein Lehrer fuer dieses Fach"-Liste obwohl 4 Lehrer es haben.
    const requiredSubjectKeys = new Set<string>();
    const requiredLabelByKey = new Map<string, string>();
    if (sgHours.length > 0) {
        for (const e of sgHours) {
            if (e.subject?.key) {
                requiredSubjectKeys.add(e.subject.key);
                requiredLabelByKey.set(e.subject.key, e.subject.label);
            }
        }
    } else if (lehrplan) {
        for (const slots of Object.values(lehrplan.gradeStages)) {
            for (const slot of slots) {
                requiredSubjectKeys.add(slot.subjectKey);
                if (!requiredLabelByKey.has(slot.subjectKey)) {
                    requiredLabelByKey.set(slot.subjectKey, slot.subjectLabel);
                }
            }
        }
    }

    const subjectByKey = new Map(subjects.map((s) => [s.key, s]));
    const subjectByLabel = new Map(subjects.map((s) => [s.label.trim().toLowerCase(), s]));
    const coveredSubjectIds = new Set(quals.map((q) => q.subjectId));
    const missingTeacherSubjects: Array<{ key: string; label: string }> = [];
    const seenInMissing = new Set<string>();
    for (const reqKey of requiredSubjectKeys) {
        // Erst per Key suchen, dann ueber Label als Fallback — sonst
        // verfehlt der Lookup z.B. EUR (Lehrplan) → EU (DB) und meldet
        // „kein Lehrer" obwohl genug zugeordnet sind.
        const reqLabel = requiredLabelByKey.get(reqKey) ?? reqKey;
        const subj = subjectByKey.get(reqKey)
            ?? subjectByLabel.get(reqLabel.trim().toLowerCase());
        if (!subj) continue; // Fach noch nicht angelegt — separater Befund
        if (seenInMissing.has(subj.id)) continue;
        if (!coveredSubjectIds.has(subj.id)) {
            missingTeacherSubjects.push({ key: subj.key, label: subj.label });
            seenInMissing.add(subj.id);
        }
    }

    // Faecher die im Lehrplan vorkommen, aber NICHT in der Stundentafel
    const subjectsInTafel = new Set<string>();
    for (const e of sgHours) if (e.subject?.key) subjectsInTafel.add(e.subject.key);
    const missingStundentafelSubjects: Array<{ key: string; label: string }> = [];
    if (lehrplan && sgHours.length > 0) {
        for (const slots of Object.values(lehrplan.gradeStages)) {
            for (const slot of slots) {
                if (!subjectsInTafel.has(slot.subjectKey)) {
                    missingStundentafelSubjects.push({ key: slot.subjectKey, label: slot.subjectLabel });
                }
            }
        }
        // Dedupe
        const seen = new Set<string>();
        const out: typeof missingStundentafelSubjects = [];
        for (const m of missingStundentafelSubjects) {
            if (seen.has(m.key)) continue;
            seen.add(m.key); out.push(m);
        }
        missingStundentafelSubjects.length = 0;
        missingStundentafelSubjects.push(...out);
    }

    // Lehrplan-Faecher, die als Subject-Entity noch nicht existieren.
    // Vergleich nach key UND case-insensitivem Label — sonst zaehlt
    // „Eurythmie" als fehlend, obwohl es schon unter anderem Key existiert.
    const subjectKeysInDb = new Set(subjects.map((s) => s.key));
    const subjectLabelsInDb = new Set(subjects.map((s) => s.label.trim().toLowerCase()));
    const missingSubjectEntities: Array<{ key: string; label: string }> = [];
    if (lehrplan) {
        const seen = new Set<string>();
        for (const slots of Object.values(lehrplan.gradeStages)) {
            for (const slot of slots) {
                const labelKey = slot.subjectLabel.trim().toLowerCase();
                if (subjectKeysInDb.has(slot.subjectKey)) continue;
                if (subjectLabelsInDb.has(labelKey)) continue;
                if (seen.has(labelKey)) continue;
                seen.add(labelKey);
                missingSubjectEntities.push({ key: slot.subjectKey, label: slot.subjectLabel });
            }
        }
    }

    // Readiness-Report auswerten — Bereitschafts-Verdict + Blocker/Warnings
    const report: ReadinessReport | null = readinessQ.data?.report ?? null;
    const readinessVerdict = report?.verdict ?? null;
    const blockerSummaries: string[] = [];
    const warningSummaries: string[] = [];
    const readinessVectors = report?.vectors ?? [];
    for (const v of readinessVectors) {
        const phrase = v.detail
            ? `${v.label}: ${v.detail}`
            : v.delta < 0
                ? `${v.label}: ${v.have}/${v.need} (fehlen ${Math.abs(v.delta)})`
                : v.label;
        if (v.status === 'blocker') {
            blockerSummaries.push(phrase);
            // Wenn der Vektor Items hat (z.B. einzelne Fach×Stufe-
            // Kombinationen) reichen wir die konkreten Blocker auch durch,
            // damit der User sieht welche genau fehlen statt nur „12
            // Kombinationen ohne Lehrer" als Aggregat.
            if (v.items) {
                const blockerItems = v.items.filter((it) => it.status === 'blocker').slice(0, 12);
                for (const it of blockerItems) {
                    const detail = it.detail ? ` (${it.detail})` : '';
                    blockerSummaries.push(`  → ${it.label}${detail}`);
                }
            }
        } else if (v.status === 'warning') {
            warningSummaries.push(phrase);
        }
    }

    // ── Pro-Fach-Versorgung ─────────────────────────────────────────
    //
    // Bedarfsstunden pro Fach: aus Stundentafel (wenn befuellt) oder
    // geschaetzt aus Lehrplan × passende Klassen.
    // Angebot pro Fach: jeder Lehrer hat ein Deputat (oder Default 25h).
    // Wir teilen das gleichmaessig auf seine qualifizierten Faecher auf.
    // Damit aendert sich der Versorgungsgrad sofort, wenn man Lehrer
    // einem Fach mehr/weniger zuordnet.
    const teacherDeputatByUserId = new Map<string, number>();
    for (const d of teacherDeputats) {
        const contract = Number(d.contractedHoursWeek) || 0;
        const reduction = Number(d.reductionHoursWeek) || 0;
        teacherDeputatByUserId.set(d.matrixUserId, Math.max(0, contract - reduction));
    }
    const qualsByTeacher = new Map<string, string[]>(); // matrixUserId → subjectIds
    for (const q of quals) {
        const arr = qualsByTeacher.get(q.matrixUserId) ?? [];
        arr.push(q.subjectId);
        qualsByTeacher.set(q.matrixUserId, arr);
    }
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    const demandBySubjectKey = new Map<string, { label: string; hours: number }>();
    if (sgHours.length > 0) {
        for (const e of sgHours) {
            const subj = e.subject;
            if (!subj) continue;
            const cur = demandBySubjectKey.get(subj.key) ?? { label: subj.label, hours: 0 };
            cur.hours += Number(e.weeklyHours) || 0;
            demandBySubjectKey.set(subj.key, cur);
        }
    } else if (lehrplan) {
        for (const c of classes) {
            const grade = extractGradeNumber(c.name);
            if (!grade) continue;
            const stageKey = findStageKeyForGrade(grade, Object.keys(lehrplan.gradeStages));
            if (!stageKey) continue;
            for (const slot of lehrplan.gradeStages[stageKey] ?? []) {
                const cur = demandBySubjectKey.get(slot.subjectKey) ?? { label: slot.subjectLabel, hours: 0 };
                cur.hours += slot.weeklyHours;
                demandBySubjectKey.set(slot.subjectKey, cur);
            }
        }
    }

    // Angebot pro subjectId aggregieren
    const supplyBySubjectId = new Map<string, { hours: number; teacherCount: number }>();
    for (const teacher of teachers) {
        const deputatTotal = teacherDeputatByUserId.get(teacher.matrixUserId) ?? DEFAULT_DEPUTAT_HOURS;
        const teacherSubjectIds = qualsByTeacher.get(teacher.matrixUserId) ?? [];
        if (teacherSubjectIds.length === 0) continue;
        const share = deputatTotal / teacherSubjectIds.length;
        for (const sid of teacherSubjectIds) {
            const cur = supplyBySubjectId.get(sid) ?? { hours: 0, teacherCount: 0 };
            cur.hours += share;
            cur.teacherCount += 1;
            supplyBySubjectId.set(sid, cur);
        }
    }

    const perSubject: WizardKennzahlen['perSubject'] = [];
    // Erst Faecher mit Bedarf
    for (const [key, demand] of demandBySubjectKey) {
        const subj = subjects.find((s) => s.key === key
            || s.label.trim().toLowerCase() === demand.label.trim().toLowerCase());
        const supply = subj ? supplyBySubjectId.get(subj.id) ?? { hours: 0, teacherCount: 0 } : { hours: 0, teacherCount: 0 };
        const status: 'ok' | 'warning' | 'blocker' =
            supply.teacherCount === 0 ? 'blocker'
                : supply.hours >= demand.hours ? 'ok'
                    : supply.hours >= demand.hours * 0.7 ? 'warning'
                        : 'blocker';
        perSubject.push({
            subjectKey: key,
            subjectLabel: subj?.label ?? demand.label,
            requiredHours: Math.round(demand.hours),
            qualifiedTeacherCount: supply.teacherCount,
            availableHours: Math.round(supply.hours),
            status,
        });
    }
    // Sortierung: Blocker zuerst, dann warnings, dann ok
    perSubject.sort((a, b) => {
        const order: Record<typeof a.status, number> = { blocker: 0, warning: 1, ok: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return b.requiredHours - a.requiredHours;
    });

    // ── Raum-Bedarf ─────────────────────────────────────────────────
    //
    // Stammraeume: pro Klasse einen, da im Standard-Schultag alle Klassen
    // gleichzeitig irgendwo lernen muessen.
    // Spezialraeume: pro requiredResourceTag eines genutzten Fachs braucht
    // es mindestens einen passend getaggten Raum. Wie viele genau haengt
    // vom Stundenplan ab (parallele Sport-Stunden brauchen zwei Hallen) —
    // hier zaehlen wir nur Faecher, die den Tag tatsaechlich brauchen.
    const rooms = roomsQ.data?.rooms ?? [];
    const stammraumHave = rooms.filter((r) => (r.resourceTags?.length ?? 0) === 0).length;
    // Tag → Set von Fach-Labels, die ihn brauchen
    const requiredTagToSubjects = new Map<string, Set<string>>();
    for (const subj of subjects) {
        for (const tag of subj.requiredResourceTags ?? []) {
            // Nur Faecher, die im aktuellen Lehrplan/Tafel auch vorkommen
            if (!requiredSubjectKeys.has(subj.key)) continue;
            const set = requiredTagToSubjects.get(tag) ?? new Set();
            set.add(subj.label);
            requiredTagToSubjects.set(tag, set);
        }
    }
    const specialRooms: WizardKennzahlen['rooms']['specialRooms'] = [];
    for (const [tag, subjectLabels] of requiredTagToSubjects) {
        const have = rooms.filter((r) => r.resourceTags?.includes(tag)).length;
        const need = 1; // mindestens 1 Raum mit diesem Tag
        const status: 'ok' | 'warning' | 'blocker' = have >= need ? 'ok' : 'blocker';
        specialRooms.push({ tag, have, need, usedBy: [...subjectLabels], status });
    }
    specialRooms.sort((a, b) => {
        const order = { blocker: 0, warning: 1, ok: 2 } as const;
        return order[a.status] - order[b.status];
    });

    return {
        loading: false,
        classCount: classes.length,
        teacherCount: teachers.length,
        staffCount: staff.length,
        demandHours: Math.round(demandHours),
        demandSource,
        supplyHours: Math.round(supplyHours),
        supplySource,
        coverageRatio: demandHours > 0 ? supplyHours / demandHours : null,
        requiredSubjectKeys,
        missingTeacherSubjects,
        missingStundentafelSubjects,
        missingSubjectEntities,
        perSubject,
        rooms: {
            roomCount: rooms.length,
            stammraumNeeded: classes.length,
            stammraumHave,
            specialRooms,
        },
        readinessVerdict,
        blockerCount: report?.summary.blockerCount ?? 0,
        warningCount: report?.summary.warningCount ?? 0,
        blockerSummaries,
        warningSummaries,
        readinessVectors,
    };
}
