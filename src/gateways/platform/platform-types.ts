import type { BootstrapData } from '../../core/session/session-types';

export interface ExchangeRequest {
    matrix_access_token: string;
    homeserver: string;
}

export interface ExchangeResponse {
    token: string;
    expiresIn: number;
}

export interface PermissionsResponse {
    subject: string;
    scope: { type: string; id: string };
    effectiveInstanceRole: string;
    capabilities: string[];
    effectivePermissions: string[];
    roleAssignments: string[];
    policyVersion: string | null;
    /** Darf in Spaces mit mode='INFOTAFEL' Nachrichten senden. */
    canBroadcast?: boolean;
    /** Darf "Flurfunk"-Sprachnachrichten aufnehmen + transkribieren lassen. */
    canUseTranscription?: boolean;
    /** Whisper-Server gerade erreichbar? Backend-Cache 30s TTL. */
    whisperAvailable?: boolean;
    /** Tenant-weiter Zahlungsstatus: ok | overdue | suspended | cancelled */
    paymentHealthStatus?: 'ok' | 'overdue' | 'suspended' | 'cancelled';
    /** UserType-Key des eingeloggten Users */
    userTypeKey?: string | null;
    /** Zielgruppen-Kategorie */
    audience?: 'staff' | 'guardian' | 'minor' | 'external';
    /** Sichtbarkeits-Matrix pro UserType */
    visibilityMatrix?: Record<string, Record<string, boolean>> | null;
}

export interface SpacePermissionsResponse {
    spaceId: string;
    permissions: string[];
    membershipRole: string;
}

export interface ModulesResponse {
    modules: Array<{
        key: string;
        version: string;
        enabled: boolean;
    }>;
}

export interface ChangesResponse {
    nextCursor: string;
    changes: unknown[];
}

export interface JobResponse {
    jobId: string;
    status: string;
    progress: number;
}

export interface SpaceUserType {
    id: string;
    key: string;
    label: string;
}

export type SpaceMode = 'CHAT' | 'INFOTAFEL' | 'DISABLED';

export interface SpaceItem {
    id: string;
    name: string;
    /** Dauerhafter, immutable Klassen-Identifikator (z.B. "Abi 2030"). Wird einmal beim Anlegen gesetzt. */
    internalName?: string | null;
    type: string;
    visibility: string;
    description: string | null;
    color: string | null;
    memberCount: number;
    parentSpaceId: string | null;
    matrixRoomId: string | null;
    matrixChatRoomId: string | null;
    userTypes?: SpaceUserType[];
    /** 'CHAT' (bidirektional) oder 'INFOTAFEL' (nur Mitarbeiter senden). */
    mode?: SpaceMode;
    /** Im INFOTAFEL-Modus: ob Empfaenger Reaktionen setzen duerfen. */
    allowReactions?: boolean;
    /** Im INFOTAFEL-Modus: ob Sender die Lese-Statistik sehen. */
    showReadStats?: boolean;
    /** Tab-Keys die in diesem Space deaktiviert sind, z.B. ["tasks","calendar"]. */
    disabledTabs?: string[];
    /** Vertretung-App: aktive Vertretung für diese Klasse → orange Markierung. */
    vertretungActive?: boolean;
    /** Ob dieser Space eine Mail-Adresse hat (Stalwart-DistList). */
    emailEnabled?: boolean;
    /** Die anonymisierte Mail-Adresse des Spaces (z.B. blauer-falter-k3@mail.prilog.chat). */
    emailAddress?: string | null;
}

export interface SpaceReadStats {
    totalMembers: number;
    readCount: number;
    percentage: number;
}

export interface SpacesResponse {
    items: SpaceItem[];
    meta: { total: number; page: number; pageSize: number };
}

export interface SpaceMember {
    userId: string;
    spaceId: string;
    role: string;
    status: string;
    user: { id: string; displayName: string; email: string; active: boolean };
}

export interface SpaceMembersResponse {
    items: SpaceMember[];
    meta: { total: number; page: number; pageSize: number };
}

export type BootstrapResponse = BootstrapData;