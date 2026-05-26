export type SessionState =
    | 'logged_out'
    | 'matrix_authenticating'
    | 'matrix_authenticated'
    | 'platform_exchanging'
    | 'ready'
    | 'platform_token_expired'
    | 'refreshing_platform_token'
    | 'session_invalid';

export interface MatrixSession {
    accessToken: string;
    deviceId: string;
    userId: string;
    homeserver: string;
}

export interface PlatformSession {
    token: string;
    expiresAt: number;
}

export interface BootstrapModule {
    key: string;
    version: string;
    enabled: boolean;
    /** Module ID from module registry (Handbuch modules only) */
    moduleId?: string;
    /** API prefix for module endpoints */
    apiPrefix?: string;
}

export interface BootstrapData {
    user: {
        matrixUserId: string;
        displayName: string;
    };
    tenant?: {
        adminMatrixUserId: string | null;
    };
    context: {
        schoolId: string;
        orgId: string;
        roles: string[];
    };
    modules?: BootstrapModule[];
    roomTypes?: unknown[];
    featureFlags?: Record<string, boolean>;
    branding?: {
        tenantName: string | null;
    };
    /** Voice-Recording-Limits (Flurfunk). Wenn nicht gesetzt, Fallback 30s. */
    voice?: {
        maxRecordingSeconds: number;
    };
    policyVersion?: string | null;
    apiVersion?: string;
    /**
     * Freemium: Cutoff-Zeitstempel (ISO). Wenn gesetzt, werden im
     * Web-Client Inhalte mit timestamp < cutoff ausgeblendet (Matrix-
     * Timeline). Backend-Listen filtern bereits selbst. Bei aktivem
     * Abo: null → kein Filter.
     */
    visibilityCutoff?: string | null;
    /**
     * Phase 16: Tenant aelter als 3 Tage UND Rechnungsadresse unvollstaendig.
     * Frontend redirected dann auf /settings/rechnungsadresse — nur Admins.
     */
    billingRequired?: boolean;
}

export interface PermissionsData {
    effectiveInstanceRole: string;
    capabilities: string[];
    effectivePermissions: string[];
    roleAssignments: string[];
    /** Darf in Spaces mit mode='INFOTAFEL' Nachrichten senden. */
    canBroadcast?: boolean;
    /** Darf "Flurfunk"-Sprachnachrichten aufnehmen + transkribieren lassen. */
    canUseTranscription?: boolean;
    /** Whisper-Server gerade erreichbar? Backend-Cache, 30s TTL. UI gried den
     *  Mic-Button aus wenn false — keine 3min-Spinner-ohne-Antwort UX. */
    whisperAvailable?: boolean;
    /**
     * Aggregat-Status fuer den Tenant: 'ok' im Normalfall, 'overdue' wenn
     * Rechnungen offen sind, 'suspended' wenn der Dienst wegen ausstehender
     * Zahlung pausiert wurde. Der Web-Client zeigt bei suspended einen
     * fullscreen Banner ueber dem Chat.
     */
    paymentHealthStatus?: 'ok' | 'overdue' | 'suspended' | 'cancelled';
    /** UserType-Key des eingeloggten Users (z.B. 'mitarbeiter', 'eltern', 'schueler') */
    userTypeKey?: string | null;
    /** Zielgruppen-Kategorie: staff, guardian, minor, external */
    audience?: 'staff' | 'guardian' | 'minor' | 'external';
    /** Sichtbarkeits-Matrix pro UserType — bestimmt welche Hubs/Tabs sichtbar sind */
    visibilityMatrix?: Record<string, Record<string, boolean>> | null;
}

export interface ImpersonationData {
    /** Admin's original platform token */
    originalToken: string;
    /** Admin's original matrix session */
    originalMatrix: MatrixSession;
    /** Impersonation audit log ID (for ending the session) */
    logId: string;
    /** Target user info */
    targetUser: {
        userId: string;
        displayName: string;
    };
    /** Admin's own display name */
    adminDisplayName: string;
}

export interface SessionSnapshot {
    state: SessionState;
    matrix: MatrixSession | null;
    platform: PlatformSession | null;
    bootstrap: BootstrapData | null;
    permissions: PermissionsData | null;
    lastError: string | null;
    /** Set when admin is impersonating another user */
    impersonation: ImpersonationData | null;
}