/**
 * Stundenplan-Tool — Platform-Gateway (P1a read-only).
 *
 * Backend: /api/platform/v1/stundenplan/*
 */

import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface InstructionGroup {
    id: string;
    tenantId: string;
    classSpaceId: string | null;
    groupKey: string;
    label: string;
    splitType: string;
    groupIndex: number | null;
    groupCount: number | null;
    expectedSize: number | null;
    validFrom: string;
    validUntil: string | null;
    active: boolean;
}

export interface TimetableStaffAssignment {
    id: string;
    timetableEntryId: string;
    teacherMatrixUserId: string;
    role: string;
    required: boolean;
    coverageMode: string;
    sortOrder: number;
}

export interface PeriodSlotShort {
    id: string;
    key: string;
    label: string;
    ordinal: number;
    startsAt: string;
    endsAt: string;
}

export interface TimetableEntry {
    id: string;
    tenantId: string;
    revisionGroupId: string;
    version: number;
    status: 'active' | 'superseded' | 'retired';
    planningStatus: 'draft' | 'published' | 'archived';
    weekday: number;
    periodSlotId: string;
    /** MUST-3: 1 = Einzelstunde, 2 = Doppelstunde usw. */
    spansSlots?: number;
    weekParity: 'even' | 'odd' | null;
    roomId: string | null;
    instructionGroupId: string;
    subjectId: string;
    subjectKey: string | null;
    classSpaceId: string | null;
    groupKey: string | null;
    scenarioId: string | null;
    origin: string;
    source: string;
    validFrom: string;
    validUntil: string | null;
    staffAssignments?: TimetableStaffAssignment[];
    instructionGroup?: InstructionGroup;
    subject?: { id: string; key: string; label: string };
    periodSlot?: PeriodSlotShort;
    room?: { id: string; label: string } | null;
}

export interface PeriodSlot {
    id: string;
    key: string;
    label: string;
    ordinal: number;
    startsAt: string;
    endsAt: string;
    isBreak?: boolean;
}

export interface SchoolNonTeachingDay {
    id: string;
    tenantId: string;
    date: string;
    rangeEndDate: string | null;
    reasonCategory: 'holiday_state' | 'holiday_school' | 'vacation' | 'conference_day' | 'other';
    label: string;
    source: string;
    createdAt: string;
    createdBy?: string | null;
}

export interface GradeBand {
    id: string;
    key: string;
    label: string;
    sortOrder: number;
    active: boolean;
}

export interface Room {
    id: string;
    label: string;
    building: string | null;
    floor: string | null;
    capacity: number | null;
    resourceTags: string[];
}

export interface Subject {
    id: string;
    key: string;
    label: string;
    /** Auto-Mode 0c: Pflicht-Tags fuer Raum, hart. */
    requiredResourceTags?: string[];
    /** Auto-Mode 0c: Wunsch-Tags fuer Raum, soft. */
    preferredResourceTags?: string[];
    /** Whitelist konkreter Raum-IDs — Solver darf nur diese verwenden. */
    allowedRoomIds?: string[];
}

export interface TimetableScenario {
    id: string;
    name: string;
    description: string | null;
    status: 'draft' | 'comparing' | 'published_candidate' | 'published' | 'archived';
    createdAt: string;
    updatedAt: string;
}

export interface ViolationFinding {
    code: string;
    severity: 'hard' | 'soft';
    entryIds: string[];
    refKey: string;
    context: Record<string, unknown>;
}

export interface CheckPlanResult {
    violations: ViolationFinding[];
    checkedCodes: string[];
    summary: { total: number; byCode: Record<string, number> };
}

export interface FieldChange {
    field: 'weekday' | 'periodSlotId' | 'weekParity' | 'roomId' | 'instructionGroupId' | 'teachers';
    before: unknown;
    after: unknown;
}

export interface DiffEntry {
    matchKey: string;
    kind: 'added' | 'removed' | 'changed';
    cellA: { weekday: number; periodSlotId: string } | null;
    cellB: { weekday: number; periodSlotId: string } | null;
    fieldChanges: FieldChange[];
    a: TimetableEntry | null;
    b: TimetableEntry | null;
}

export interface ScenarioDiffResult {
    summary: { added: number; removed: number; changed: number; unchanged: number };
    diffs: DiffEntry[];
}

export interface TeacherCandidate {
    matrixUserId: string;
    displayName: string | null;
    email: string | null;
    userTypeLabel?: string | null;
    source?: 'grant' | 'audience';
}

export type FunctionalRole =
    | 'teacher'
    | 'class_lead'
    | 'subject_lead'
    | 'principal'
    | 'vice_principal'
    | 'substitute_pool'
    | 'external_teacher'
    | 'admin_staff';

export interface FunctionalGrant {
    id: string;
    role: FunctionalRole;
    scope: string;
    validFrom: string;
    validUntil: string | null;
}

export interface StaffMember {
    matrixUserId: string;
    displayName: string | null;
    email: string | null;
    userTypeLabel: string | null;
    grants: FunctionalGrant[];
}

// Klassenstufen-Baender sind ab Phase „Stammdaten editierbar" tenant-spezifisch
// und werden in der grade_band-Tabelle gepflegt. Der String-Typ ist absichtlich
// offen — Validierung erfolgt im Backend gegen die GradeBand-Tabelle.
export type TeacherGradeStage = string;

export interface SchedulingPolicy {
    id: string;
    tenantId: string;
    maxFreePeriodsPerDay: number;
    minLunchBreakMin: number;
    maxConsecutiveBlocks: number;
    earliestStartTime: string;
    latestEndTime: string;
    enableRhythmization: boolean;
    enableHomeworkBalance: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SchedulingPolicyInput {
    maxFreePeriodsPerDay: number;
    minLunchBreakMin: number;
    maxConsecutiveBlocks: number;
    earliestStartTime: string;
    latestEndTime: string;
    enableRhythmization: boolean;
    enableHomeworkBalance: boolean;
}

export interface TeacherPreference {
    id: string;
    tenantId: string;
    matrixUserId: string;
    preferredGradeStages: TeacherGradeStage[];
    preferredRoomId: string | null;
    notes: string | null;
    preferredRoom?: { id: string; label: string } | null;
    createdAt: string;
    updatedAt: string;
}

export type PinLockedField = 'weekday' | 'periodSlotId' | 'roomId' | 'staff';

export interface PinConstraint {
    id: string;
    tenantId: string;
    scenarioId: string | null;
    entryId: string;
    lockedFields: PinLockedField[];
    reason: string | null;
    autoCascadeFrom: string | null;
    createdAt: string;
    updatedAt: string;
    entry?: {
        id: string;
        weekday: number;
        periodSlotId: string;
        subject?: { key: string; label: string };
        instructionGroup?: { label: string };
    };
}

export interface LehrplanSummary {
    key: string;
    name: string;
    bundesland: string;
    schulform: string;
    trackVariant?: string;
    effectiveFrom: string;
    source: { title: string; url: string; publisher: string; lastChecked: string };
    notes?: string;
    stageKeys: string[];
}

export interface LehrplanSubjectSlot {
    subjectKey: string;
    subjectLabel: string;
    weeklyHours: number;
    notesByGrade?: string;
}

export interface LehrplanTemplate extends LehrplanSummary {
    schemaVersion: number;
    license: string;
    gradeStages: Record<string, LehrplanSubjectSlot[]>;
}

export interface LehrplanPreview {
    invalidClasses: string[];
    unknownStages: Array<{ classSpaceId: string; stageKey: string }>;
    subjectsToCreate: Array<{ key: string; label: string }>;
    entriesToCreate: Array<{ classSpaceId: string; subjectKey: string; weeklyHours: number }>;
    entriesToOverwrite: Array<{ classSpaceId: string; subjectKey: string; currentHours: number; newHours: number }>;
    entriesToSkip: Array<{ classSpaceId: string; subjectKey: string; currentHours: number }>;
}

export interface LehrplanApplyResult {
    createdSubjects: number;
    createdEntries: number;
    overwrittenEntries: number;
    skippedEntries: number;
    invalidClasses: string[];
    unknownStages: Array<{ classSpaceId: string; stageKey: string }>;
}

export interface SubjectGradeHoursEntry {
    id: string;
    tenantId: string;
    classSpaceId: string;
    subjectId: string;
    weeklyHours: number | string;
    preferDoubleSlot: boolean;
    notes: string | null;
    subject?: { id: string; key: string; label: string };
    createdAt: string;
    updatedAt: string;
}

export interface EmployeeDeputat {
    id: string;
    tenantId: string;
    matrixUserId: string;
    contractedHoursWeek: number | string;
    ftePercent: number;
    reductionHoursWeek: number | string;
    reductionReason: string | null;
    validFrom: string;
    validUntil: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TeacherQualification {
    id: string;
    tenantId: string;
    matrixUserId: string;
    subjectId: string;
    gradeLevels: string[];
    qualificationLevel: 'full' | 'partial' | 'in_training';
    validFrom: string;
    validUntil: string | null;
    notes: string | null;
    createdAt: string;
    createdBy: string | null;
}

export interface PublishEvent {
    id: string;
    tenantId: string;
    scenarioId: string;
    action: 'publish' | 'rollback';
    summary: Record<string, unknown>;
    actorId: string | null;
    reason: string | null;
    createdAt: string;
    scenario?: { id: string; name: string };
}

export interface Coupling {
    id: string;
    tenantId: string;
    key: string;
    kind: 'coupling' | 'band' | 'parallel_group';
    label: string;
    description: string | null;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ScoreResult {
    code: string;
    value: number | null;
    status: 'ok' | 'warning' | 'critical' | 'unavailable';
    note?: string;
    details?: Record<string, unknown>;
}

export interface ScoreSnapshot {
    scores: ScoreResult[];
    overall: number | null;
    availableCodes: string[];
}

export interface CheckPlanInput {
    scenarioId?: string;
    planningStatus?: 'draft' | 'published' | 'archived';
    overrideEntries?: Array<{
        id: string;
        weekday: number;
        periodSlotId: string;
        weekParity: 'even' | 'odd' | null;
        roomId: string | null;
        instructionGroupId: string;
        staffAssignments?: Array<{ teacherMatrixUserId: string; required?: boolean }>;
    }>;
}

export interface StundenplanGateway {
    listSubjects(jwt: string): Promise<{ subjects: Subject[] }>;
    listPeriodSlots(jwt: string): Promise<{ periodSlots: PeriodSlot[] }>;
    listRooms(jwt: string): Promise<{ rooms: Room[] }>;
    listInstructionGroups(jwt: string, classSpaceId?: string): Promise<{ instructionGroups: InstructionGroup[] }>;
    listScenarios(jwt: string): Promise<{ scenarios: TimetableScenario[] }>;
    listTimetableEntries(
        jwt: string,
        opts?: {
            scenarioId?: string;
            planningStatus?: 'draft' | 'published' | 'archived';
            instructionGroupId?: string;
            roomId?: string;
            teacherMatrixUserId?: string;
        },
    ): Promise<{ entries: TimetableEntry[] }>;
    checkPlan(jwt: string, input: CheckPlanInput): Promise<CheckPlanResult>;
    computeScores(
        jwt: string,
        opts?: { scenarioId?: string; planningStatus?: 'draft' | 'published' | 'archived' },
    ): Promise<ScoreSnapshot>;
    diffScenarios(jwt: string, input: { scenarioIdA: string; scenarioIdB: string }): Promise<ScenarioDiffResult>;
    listCouplings(jwt: string): Promise<{ couplings: Coupling[] }>;
    createCoupling(
        jwt: string,
        input: { key: string; kind: 'coupling' | 'band' | 'parallel_group'; label: string; description?: string; active?: boolean },
    ): Promise<{ coupling: Coupling }>;
    patchCoupling(
        jwt: string,
        id: string,
        input: { label?: string; description?: string | null; active?: boolean },
    ): Promise<{ coupling: Coupling }>;
    publishScenario(
        jwt: string,
        scenarioId: string,
        input: { reason?: string },
    ): Promise<{ scenario: TimetableScenario; event: PublishEvent }>;
    rollbackPublish(jwt: string, input: { reason?: string }): Promise<{ scenario: TimetableScenario; event: PublishEvent }>;
    listPublishEvents(jwt: string): Promise<{ events: PublishEvent[] }>;
    // P-Master Stammdaten-CRUD
    createSubject(jwt: string, input: { key: string; label: string; requiredResourceTags?: string[]; preferredResourceTags?: string[] }): Promise<{ subject: Subject }>;
    patchSubject(jwt: string, id: string, input: { key?: string; label?: string; requiredResourceTags?: string[]; preferredResourceTags?: string[]; allowedRoomIds?: string[] }): Promise<{ subject: Subject }>;
    deleteSubject(jwt: string, id: string): Promise<{ ok: true }>;
    createPeriodSlot(jwt: string, input: { key: string; label: string; ordinal: number; startsAt: string; endsAt: string; isBreak?: boolean }): Promise<{ periodSlot: PeriodSlot }>;
    patchPeriodSlot(jwt: string, id: string, input: Partial<{ key: string; label: string; ordinal: number; startsAt: string; endsAt: string; isBreak: boolean }>): Promise<{ periodSlot: PeriodSlot }>;
    deletePeriodSlot(jwt: string, id: string): Promise<{ ok: true }>;
    listNonTeachingDays(jwt: string, opts?: { from?: string; to?: string }): Promise<{ days: SchoolNonTeachingDay[] }>;
    createNonTeachingDay(jwt: string, input: { date: string; rangeEndDate?: string; reasonCategory: SchoolNonTeachingDay['reasonCategory']; label: string }): Promise<{ day: SchoolNonTeachingDay }>;
    deleteNonTeachingDay(jwt: string, id: string): Promise<{ ok: true }>;
    createRoom(jwt: string, input: { label: string; building?: string; floor?: string; capacity?: number; resourceTags?: string[] }): Promise<{ room: Room }>;
    patchRoom(jwt: string, id: string, input: Partial<{ label: string; building: string | null; floor: string | null; capacity: number | null; resourceTags: string[] }>): Promise<{ room: Room }>;
    deleteRoom(jwt: string, id: string): Promise<{ ok: true }>;
    // GradeBand (Klassenstufen-Baender)
    listGradeBands(jwt: string, opts?: { includeInactive?: boolean }): Promise<{ gradeBands: GradeBand[] }>;
    createGradeBand(jwt: string, input: { key: string; label: string; sortOrder?: number }): Promise<{ gradeBand: GradeBand }>;
    patchGradeBand(jwt: string, id: string, input: Partial<{ key: string; label: string; sortOrder: number; active: boolean }>): Promise<{ gradeBand: GradeBand }>;
    deleteGradeBand(jwt: string, id: string): Promise<{ ok: true; removedFromTeachers?: boolean }>;
    createInstructionGroup(jwt: string, input: { groupKey: string; label: string; splitType: string; classSpaceId?: string; groupIndex?: number; groupCount?: number; expectedSize?: number; validFrom: string; validUntil?: string }): Promise<{ instructionGroup: InstructionGroup }>;
    patchInstructionGroup(jwt: string, id: string, input: Partial<{ label: string; groupKey: string; expectedSize: number | null; active: boolean; validUntil: string | null }>): Promise<{ instructionGroup: InstructionGroup }>;
    deleteInstructionGroup(jwt: string, id: string): Promise<{ ok: true }>;
    createTimetableEntry(jwt: string, input: {
        instructionGroupId: string;
        subjectId: string;
        weekday: number;
        periodSlotId: string;
        spansSlots?: number;
        roomId?: string;
        weekParity?: 'even' | 'odd' | null;
        scenarioId?: string;
        validFrom: string;
        validUntil?: string;
        staffAssignments?: Array<{ teacherMatrixUserId: string; role?: string; required?: boolean; coverageMode?: string; sortOrder?: number }>;
    }): Promise<{ entry: TimetableEntry }>;
    deleteTimetableEntry(jwt: string, id: string, opts?: { endDate?: string }): Promise<{ ok: true; mode: 'deleted' | 'retired'; entry?: TimetableEntry }>;
    patchTimetableEntry(jwt: string, id: string, patch: {
        instructionGroupId?: string;
        subjectId?: string;
        weekday?: number;
        periodSlotId?: string;
        spansSlots?: number;
        roomId?: string | null;
        weekParity?: 'even' | 'odd' | null;
        validFrom?: string;
        validUntil?: string | null;
        staffAssignments?: Array<{ teacherMatrixUserId: string; role?: string; required?: boolean; coverageMode?: string; sortOrder?: number }>;
    }): Promise<{ entry: TimetableEntry; mode: 'updated' | 'superseded' }>;
    listTeacherCandidates(jwt: string, q?: string): Promise<{ candidates: TeacherCandidate[] }>;
    // MD-1
    listStaffWithRoles(jwt: string): Promise<{ staff: StaffMember[] }>;
    /** MUST-2: persoenlicher Stundenplan (Schueler/Eltern/Lehrer). */
    getMyPlan(jwt: string): Promise<{ entries: TimetableEntry[]; scope: { asTeacher: boolean; classSpaceIds: string[] } }>;
    /** MUST-4 Bulk-Import */
    bulkImport(jwt: string, input: {
        scenarioId?: string;
        rows: Array<{
            subjectKey: string;
            groupKey: string;
            weekday: number;
            periodSlotKey: string;
            roomLabel?: string;
            weekParity?: 'even' | 'odd';
            spansSlots?: number;
            teacherIds?: string[];
            validFrom?: string;
        }>;
    }): Promise<{ imported: Array<{ row: number; entryId: string }>; skipped: Array<{ row: number; reason: string }> }>;
    /** MUST-4 Vorjahres-Kopie */
    copyScenarioEntries(jwt: string, input: { sourceScenarioId: string; targetScenarioId: string; newValidFrom: string }): Promise<{ copied: number; entryIds: string[] }>;
    /** MD-3 EmployeeDeputat (gated) */
    listEmployeeDeputats(jwt: string): Promise<{ deputats: EmployeeDeputat[] }>;
    upsertEmployeeDeputat(jwt: string, input: { matrixUserId: string; contractedHoursWeek: number; ftePercent?: number; reductionHoursWeek?: number; reductionReason?: string; notes?: string }): Promise<{ deputat: EmployeeDeputat }>;
    /** Auto-Mode 0a: Stundentafel-Soll */
    listSubjectGradeHours(jwt: string, opts?: { classSpaceId?: string }): Promise<{ entries: SubjectGradeHoursEntry[] }>;
    upsertSubjectGradeHours(jwt: string, input: { classSpaceId: string; subjectId: string; weeklyHours: number; preferDoubleSlot?: boolean; notes?: string }): Promise<{ entry: SubjectGradeHoursEntry }>;
    deleteSubjectGradeHours(jwt: string, id: string): Promise<{ ok: true }>;
    copySubjectGradeHours(jwt: string, input: { sourceClassSpaceId: string; targetClassSpaceIds: string[]; overwrite?: boolean }): Promise<{ copied: number; skipped: number; removed?: number }>;
    /** Auto-Mode 0a.1: Lehrplan-Vorlagen */
    listLehrplaene(jwt: string): Promise<{ templates: LehrplanSummary[] }>;
    getLehrplan(jwt: string, key: string): Promise<{ template: LehrplanTemplate }>;
    previewLehrplan(jwt: string, key: string, input: { classMappings: Array<{ classSpaceId: string; gradeStageKey: string }>; overwrite?: boolean }): Promise<LehrplanPreview>;
    applyLehrplan(jwt: string, key: string, input: { classMappings: Array<{ classSpaceId: string; gradeStageKey: string }>; overwrite?: boolean }): Promise<LehrplanApplyResult>;
    autoMapLehrplan(jwt: string, key: string, input: { classes: Array<{ classSpaceId: string; name: string }> }): Promise<{ mapped: Array<{ classSpaceId: string; gradeStageKey: string }>; unmapped: Array<{ classSpaceId: string; name: string; guessedStage: string | null }> }>;
    /** Auto-Mode 0b: Pin-Constraints */
    listPinConstraints(jwt: string, opts?: { scenarioId?: string }): Promise<{ pins: PinConstraint[] }>;
    createPinConstraint(jwt: string, input: { entryId: string; scenarioId?: string; lockedFields: PinLockedField[]; reason?: string }): Promise<{ primary: PinConstraint; cascadedEntryIds: string[] }>;
    deletePinConstraint(jwt: string, id: string, opts?: { cascadeRemoval?: boolean }): Promise<{ ok: true }>;
    findPinConflicts(jwt: string, opts?: { scenarioId?: string }): Promise<{ conflicts: Array<{ slot: string; groupId: string; pinIds: string[] }> }>;
    listTeacherQualifications(jwt: string, opts?: { matrixUserId?: string; subjectId?: string }): Promise<{ qualifications: TeacherQualification[] }>;
    upsertTeacherQualification(jwt: string, input: { matrixUserId: string; subjectId: string; gradeLevels?: string[]; qualificationLevel?: 'full' | 'partial' | 'in_training'; notes?: string }): Promise<{ qualification: TeacherQualification }>;
    deleteTeacherQualification(jwt: string, id: string): Promise<{ ok: true }>;
    // Bereich C
    getSchedulingPolicy(jwt: string): Promise<{ policy: SchedulingPolicy }>;
    upsertSchedulingPolicy(jwt: string, input: Partial<SchedulingPolicyInput>): Promise<{ policy: SchedulingPolicy }>;
    // Bereich A
    listTeacherPreferences(jwt: string): Promise<{ preferences: TeacherPreference[] }>;
    getTeacherPreference(jwt: string, matrixUserId: string): Promise<{ preference: TeacherPreference | null }>;
    upsertTeacherPreference(jwt: string, input: { matrixUserId: string; preferredGradeStages?: TeacherGradeStage[]; preferredRoomId?: string | null; notes?: string | null }): Promise<{ preference: TeacherPreference }>;
    grantRole(jwt: string, input: { matrixUserId: string; role: FunctionalRole; scope?: string; validFrom?: string; validUntil?: string; reason?: string }): Promise<{ grant: FunctionalGrant }>;
    revokeRole(jwt: string, id: string, reason?: string): Promise<{ grant: FunctionalGrant }>;
    createScenario(
        jwt: string,
        input: { name: string; description?: string; status?: string; baseScenarioId?: string },
    ): Promise<{ scenario: TimetableScenario }>;
    patchScenario(
        jwt: string,
        scenarioId: string,
        input: { name?: string; description?: string | null; status?: string },
    ): Promise<{ scenario: TimetableScenario }>;
    deleteScenario(
        jwt: string,
        scenarioId: string,
        opts?: { dryRun?: boolean },
    ): Promise<{ result: { deletedScenarioId?: string; wouldDelete: { entries: number; pinConstraints: number; solveJobs: number; publishEvents: number } } }>;

    // Auto-Mode 0f/0g: Solver-Jobs
    listSolveJobs(jwt: string, opts?: { scenarioId?: string; limit?: number }): Promise<{ jobs: SolveJob[] }>;
    getSolveJob(jwt: string, jobId: string, opts?: { includeResult?: boolean; includeSnapshot?: boolean }): Promise<{ job: SolveJob }>;
    createSolveJob(jwt: string, input: { scenarioId: string; timeoutSeconds?: number }): Promise<{ job: SolveJob }>;
    cancelSolveJob(jwt: string, jobId: string): Promise<{ job: SolveJob }>;
    acceptSolveJob(jwt: string, jobId: string, input?: { targetScenarioId?: string; replaceExistingDraft?: boolean }): Promise<{ result: SolveAcceptResult }>;

    // Auto-Mode 0i: Bereitschafts-Diagnose
    getReadinessReport(jwt: string, opts?: { scenarioId?: string }): Promise<{ report: ReadinessReport }>;
    getSolverHealth(jwt: string): Promise<{ health: { status: string; version?: string; workerCount?: number; defaultTimeoutSeconds?: number; maxTimeoutSeconds?: number; error?: string } }>;

    // Klassen-Spaces (fuer InstructionGroup-Form-Dropdown)
    listClassSpaces(jwt: string): Promise<{ classes: ClassSpace[] }>;

    // ── Pre-Pinning (Klassenlehrer-Editor) ────────────────────────
    listClassSubjectAssignments(jwt: string, opts?: { classSpaceId?: string }): Promise<{ assignments: ClassSubjectAssignment[] }>;
    upsertClassSubjectAssignment(jwt: string, input: {
        classSpaceId: string; subjectId: string;
        /** Wenn gesetzt: gilt nur fuer diese Teilgruppe (z.B. 5a-h1). Sonst ganze Klasse. */
        instructionGroupId?: string | null;
        teacherMatrixId?: string | null;
        pinnedRoomId?: string | null;
        importance: number;
        splitInto?: number;
        additionalTeacherMatrixIds?: string[];
        notes?: string | null;
    }): Promise<{ assignment: ClassSubjectAssignment }>;
    patchClassSubjectAssignment(jwt: string, id: string, patch: {
        teacherMatrixId?: string | null;
        pinnedRoomId?: string | null;
        importance?: number;
        splitInto?: number;
        additionalTeacherMatrixIds?: string[];
        notes?: string | null;
    }): Promise<{ assignment: ClassSubjectAssignment }>;
    deleteClassSubjectAssignment(jwt: string, id: string): Promise<{ ok: true }>;
    listClassStammRooms(jwt: string): Promise<{ stammRooms: ClassStammRoom[] }>;
    upsertClassStammRoom(jwt: string, input: { classSpaceId: string; roomId: string }): Promise<{ stammRoom: ClassStammRoom }>;
    deleteClassStammRoom(jwt: string, classSpaceId: string): Promise<{ ok: true }>;
    // Klasse anlegen via Workspace-Template (Spaces type='class')
    createClassSpaceFromTemplate(jwt: string, input: { templateKey: string; name: string }): Promise<{ space: { id: string; name: string } }>;
}

export interface ClassSubjectAssignment {
    id: string;
    tenantId: string;
    classSpaceId: string;
    subjectId: string;
    /** Wenn gesetzt: gilt nur fuer diese Teilgruppe. Sonst ganze Klasse. */
    instructionGroupId: string | null;
    teacherMatrixId: string | null;
    pinnedRoomId: string | null;
    importance: number;
    splitInto: number;
    additionalTeacherMatrixIds: string[];
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ClassStammRoom {
    id: string;
    tenantId: string;
    classSpaceId: string;
    roomId: string;
    createdAt: string;
    updatedAt: string;
}

export interface ClassSpace {
    id: string;
    name: string;
    internalName: string | null;
}

// ---- Auto-Mode 0i: Bereitschafts-Diagnose -----------------------------------

export type ReadinessStatus = 'ok' | 'warning' | 'blocker';
export type ReadinessVerdict = 'ready' | 'warning' | 'blocked';
export type ReadinessCategory =
    | 'stammdaten'
    | 'capacity'
    | 'qualifications'
    | 'resources'
    | 'stundentafel';

export interface ReadinessItem {
    label: string;
    refId?: string;
    have: number;
    need: number;
    status: ReadinessStatus;
    detail?: string;
}

export interface ReadinessVector {
    key: string;
    label: string;
    category: ReadinessCategory;
    have: number;
    need: number;
    delta: number;
    status: ReadinessStatus;
    detail?: string;
    items?: ReadinessItem[];
}

export interface ReadinessReport {
    tenantId: string;
    scenarioId: string | null;
    computedAt: string;
    verdict: ReadinessVerdict;
    summary: {
        blockerCount: number;
        warningCount: number;
        totalRequiredHours: number;
        totalAvailableClassSlots: number;
        balance: number;
    };
    vectors: ReadinessVector[];
}

// ---- Auto-Mode 0f/0g: Solver-Jobs -------------------------------------------

export interface SolverEntry {
    classSpaceId: string;
    subjectId: string;
    teacherId: string;
    roomId: string;
    slotId: string;
    weekday: number;
    orderIndex: number;
}

export interface SolverUnplaced {
    classSpaceId: string;
    subjectId: string;
    requiredHours: number;
    placedHours: number;
    reason: string;
}

export interface SolverScore {
    free_periods: number;
    pref_grade_mismatch: number;
    missing_preferred_tags: number;
    double_slot_misses: number;
    teacher_day_overload: number;
    total: number;
}

export interface SolverResult {
    status: 'optimal' | 'feasible' | 'infeasible' | 'timeout' | 'error';
    scenarioId: string;
    entries: SolverEntry[];
    unplaced: SolverUnplaced[];
    score: SolverScore;
    solverWallSeconds: number;
    log: string[];
}

export interface SolveJob {
    id: string;
    tenantId: string;
    scenarioId: string;
    status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
    progress: number;
    timeoutSeconds: number;
    error: string | null;
    workerId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    createdBy: string | null;
    result?: SolverResult | null;
    inputSnapshot?: unknown;
}

export interface SolveAcceptResult {
    jobId: string;
    scenarioId: string;
    createdEntries: number;
    replacedEntries: number;
    skipped: Array<{ classSpaceId: string; subjectId: string; reason: string }>;
}

const B = env.platformBaseUrl;
const P = '/platform/v1/stundenplan';

function qs(params: Record<string, string | undefined>): string {
    const parts = Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
    return parts.length ? `?${parts.join('&')}` : '';
}

export const createStundenplanGateway = (): StundenplanGateway => ({
    listSubjects(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subjects`, method: 'GET', bearerToken: jwt });
    },
    listPeriodSlots(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/period-slots`, method: 'GET', bearerToken: jwt });
    },
    listRooms(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/rooms`, method: 'GET', bearerToken: jwt });
    },
    listInstructionGroups(jwt, classSpaceId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/instruction-groups${qs({ classSpaceId })}`, method: 'GET', bearerToken: jwt });
    },
    listScenarios(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/scenarios`, method: 'GET', bearerToken: jwt });
    },
    listTimetableEntries(jwt, opts = {}) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/timetable-entries${qs(opts)}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    checkPlan(jwt, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/check-plan`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    computeScores(jwt, opts = {}) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/scores${qs(opts)}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    diffScenarios(jwt, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/scenarios/diff`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    createScenario(jwt, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/scenarios`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    patchScenario(jwt, scenarioId, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/scenarios/${encodeURIComponent(scenarioId)}`,
            method: 'PATCH',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    deleteScenario(jwt, scenarioId, opts) {
        const query = opts?.dryRun ? '?dryRun=true' : '';
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/scenarios/${encodeURIComponent(scenarioId)}${query}`,
            method: 'DELETE',
            bearerToken: jwt,
        });
    },
    listCouplings(jwt) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/couplings`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    createCoupling(jwt, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/couplings`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    publishScenario(jwt, scenarioId, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/scenarios/${encodeURIComponent(scenarioId)}/publish`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    rollbackPublish(jwt, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/publish/rollback`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    listPublishEvents(jwt) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/publish/events`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    // P-Master
    createSubject(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subjects`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    patchSubject(jwt, id, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subjects/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteSubject(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subjects/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    createPeriodSlot(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/period-slots`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    patchPeriodSlot(jwt, id, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/period-slots/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deletePeriodSlot(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/period-slots/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    listNonTeachingDays(jwt, opts) {
        const query = qs(opts ?? {});
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/non-teaching-days${query}`, method: 'GET', bearerToken: jwt });
    },
    createNonTeachingDay(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/non-teaching-days`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteNonTeachingDay(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/non-teaching-days/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    createRoom(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/rooms`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    patchRoom(jwt, id, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/rooms/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteRoom(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/rooms/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    listGradeBands(jwt, opts) {
        const query = opts?.includeInactive ? '?includeInactive=true' : '';
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/grade-bands${query}`, method: 'GET', bearerToken: jwt });
    },
    createGradeBand(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/grade-bands`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    patchGradeBand(jwt, id, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/grade-bands/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteGradeBand(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/grade-bands/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    createInstructionGroup(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/instruction-groups`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    patchInstructionGroup(jwt, id, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/instruction-groups/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteInstructionGroup(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/instruction-groups/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    createTimetableEntry(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/timetable-entries`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteTimetableEntry(jwt, id, opts) {
        const query = opts?.endDate ? `?endDate=${encodeURIComponent(opts.endDate)}` : '';
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/timetable-entries/${encodeURIComponent(id)}${query}`, method: 'DELETE', bearerToken: jwt });
    },
    patchTimetableEntry(jwt, id, patch) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/timetable-entries/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    listTeacherCandidates(jwt, q) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/teacher-candidates${qs({ q })}`, method: 'GET', bearerToken: jwt });
    },
    listStaffWithRoles(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/staff`, method: 'GET', bearerToken: jwt });
    },
    getMyPlan(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/my-plan`, method: 'GET', bearerToken: jwt });
    },
    bulkImport(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/bulk-import`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    copyScenarioEntries(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/copy-scenario`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    listEmployeeDeputats(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/employee-deputats`, method: 'GET', bearerToken: jwt });
    },
    upsertEmployeeDeputat(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/employee-deputats`, method: 'PUT', bearerToken: jwt, body: JSON.stringify(input) });
    },
    listSubjectGradeHours(jwt, opts) {
        const query = opts?.classSpaceId ? `?classSpaceId=${encodeURIComponent(opts.classSpaceId)}` : '';
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subject-grade-hours${query}`, method: 'GET', bearerToken: jwt });
    },
    upsertSubjectGradeHours(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subject-grade-hours`, method: 'PUT', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteSubjectGradeHours(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subject-grade-hours/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    copySubjectGradeHours(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/subject-grade-hours/copy`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    listLehrplaene(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/lehrplaene`, method: 'GET', bearerToken: jwt });
    },
    getLehrplan(jwt, key) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/lehrplaene/${encodeURIComponent(key)}`, method: 'GET', bearerToken: jwt });
    },
    previewLehrplan(jwt, key, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/lehrplaene/${encodeURIComponent(key)}/preview`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    applyLehrplan(jwt, key, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/lehrplaene/${encodeURIComponent(key)}/apply`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    autoMapLehrplan(jwt, key, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/lehrplaene/${encodeURIComponent(key)}/auto-map`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    listPinConstraints(jwt, opts) {
        const q = opts?.scenarioId ? `?scenarioId=${encodeURIComponent(opts.scenarioId)}` : '';
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/pin-constraints${q}`, method: 'GET', bearerToken: jwt });
    },
    createPinConstraint(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/pin-constraints`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deletePinConstraint(jwt, id, opts) {
        const q = opts?.cascadeRemoval ? '?cascadeRemoval=true' : '';
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/pin-constraints/${encodeURIComponent(id)}${q}`, method: 'DELETE', bearerToken: jwt });
    },
    findPinConflicts(jwt, opts) {
        const q = opts?.scenarioId ? `?scenarioId=${encodeURIComponent(opts.scenarioId)}` : '';
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/pin-constraints/conflicts${q}`, method: 'GET', bearerToken: jwt });
    },
    grantRole(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/staff/grants`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    revokeRole(jwt, id, reason) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/staff/grants/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt, body: JSON.stringify({ reason }) });
    },
    listTeacherQualifications(jwt, opts) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/teacher-qualifications${qs(opts ?? {})}`, method: 'GET', bearerToken: jwt });
    },
    upsertTeacherQualification(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/teacher-qualifications`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    deleteTeacherQualification(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/teacher-qualifications/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    getSchedulingPolicy(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/scheduling-policy`, method: 'GET', bearerToken: jwt });
    },
    upsertSchedulingPolicy(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/scheduling-policy`, method: 'PUT', bearerToken: jwt, body: JSON.stringify(input) });
    },
    listTeacherPreferences(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/teacher-preferences`, method: 'GET', bearerToken: jwt });
    },
    getTeacherPreference(jwt, matrixUserId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/teacher-preferences/${encodeURIComponent(matrixUserId)}`, method: 'GET', bearerToken: jwt });
    },
    upsertTeacherPreference(jwt, input) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/teacher-preferences`, method: 'PUT', bearerToken: jwt, body: JSON.stringify(input) });
    },
    patchCoupling(jwt, id, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/couplings/${encodeURIComponent(id)}`,
            method: 'PATCH',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    listSolveJobs(jwt, opts) {
        const query = qs({
            scenarioId: opts?.scenarioId,
            limit: opts?.limit != null ? String(opts.limit) : undefined,
        });
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/solve-jobs${query}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    getSolveJob(jwt, jobId, opts) {
        const query = qs({
            includeResult: opts?.includeResult ? 'true' : undefined,
            includeSnapshot: opts?.includeSnapshot ? 'true' : undefined,
        });
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/solve-jobs/${encodeURIComponent(jobId)}${query}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    createSolveJob(jwt, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/solve-jobs`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    cancelSolveJob(jwt, jobId) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/solve-jobs/${encodeURIComponent(jobId)}/cancel`,
            method: 'POST',
            bearerToken: jwt,
            body: '{}',
        });
    },
    acceptSolveJob(jwt, jobId, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/solve-jobs/${encodeURIComponent(jobId)}/accept`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input ?? {}),
        });
    },
    getSolverHealth(jwt) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/solver-health`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    getReadinessReport(jwt, opts) {
        const query = qs({ scenarioId: opts?.scenarioId });
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/readiness${query}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    listClassSpaces(jwt) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/class-spaces`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    createClassSpaceFromTemplate(jwt, input) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `/platform/v1/spaces/from-template`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    listClassSubjectAssignments(jwt, opts) {
        const q = opts?.classSpaceId ? `?classSpaceId=${encodeURIComponent(opts.classSpaceId)}` : '';
        return requestJson({
            target: 'platform', baseUrl: B,
            path: `${P}/class-subject-assignments${q}`,
            method: 'GET', bearerToken: jwt,
        });
    },
    upsertClassSubjectAssignment(jwt, input) {
        return requestJson({
            target: 'platform', baseUrl: B,
            path: `${P}/class-subject-assignments`,
            method: 'POST', bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    patchClassSubjectAssignment(jwt, id, patch) {
        return requestJson({
            target: 'platform', baseUrl: B,
            path: `${P}/class-subject-assignments/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt,
            body: JSON.stringify(patch),
        });
    },
    deleteClassSubjectAssignment(jwt, id) {
        return requestJson({
            target: 'platform', baseUrl: B,
            path: `${P}/class-subject-assignments/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        });
    },
    listClassStammRooms(jwt) {
        return requestJson({
            target: 'platform', baseUrl: B,
            path: `${P}/class-stamm-rooms`,
            method: 'GET', bearerToken: jwt,
        });
    },
    upsertClassStammRoom(jwt, input) {
        return requestJson({
            target: 'platform', baseUrl: B,
            path: `${P}/class-stamm-rooms`,
            method: 'PUT', bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },
    deleteClassStammRoom(jwt, classSpaceId) {
        return requestJson({
            target: 'platform', baseUrl: B,
            path: `${P}/class-stamm-rooms/${encodeURIComponent(classSpaceId)}`,
            method: 'DELETE', bearerToken: jwt,
        });
    },
});
