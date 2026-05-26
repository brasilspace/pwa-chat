/**
 * Update-Switch Settings-Section (P2 — Tenant-Admin).
 *
 * Spec: prilog_docs/umsetzung/update-switch/p0-spec-freeze-tenant-update-policy-release-channels.md
 *
 * Liest und schreibt die Tenant-Update-Policy. Schreibwege sind heute
 * sichtbar, aber bis zur P3 Reconcile-Verdrahtung *noch nicht wirksam*
 * — das wird im UI auch klar kommuniziert (Status "geplant").
 */
import { type JSX, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useT } from '@/lib/i18n/use-t';
import { RefreshCw, Save, ShieldAlert, Snowflake, History, GitBranch, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    createUpdateSwitchGateway,
    type DesiredReleaseInfo,
    type FreezeLevel,
    type TenantUpdatePolicy,
    type UpdateAuditEntry,
    type UpdateMode,
} from '@/gateways/platform/update-switch-gateway';

const UPDATE_MODES: UpdateMode[] = [
    'continuous',
    'auto_stable',
    'patch_only',
    'manual_approval',
    'major_bundle_only',
    'frozen',
    'pilot',
];

// Bis P5 wirksam: nur diese beiden Werte als Freeze-Level erlaubt.
const FREEZE_LEVELS_TODAY: FreezeLevel[] = ['none', 'frontend_only'];

const gateway = createUpdateSwitchGateway();

export function UpdateSwitchSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';

    const [policy, setPolicy] = useState<TenantUpdatePolicy | null>(null);
    const [audit, setAudit] = useState<UpdateAuditEntry[]>([]);
    const [desired, setDesired] = useState<DesiredReleaseInfo | null>(null);
    const [draft, setDraft] = useState<Partial<TenantUpdatePolicy> & { reason?: string }>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [auditDetail, setAuditDetail] = useState<UpdateAuditEntry | null>(null);

    // ESC schliesst Audit-Slide-Over (Hook vor jedem early-return)
    useEffect(() => {
        if (!auditDetail) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setAuditDetail(null);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [auditDetail]);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setError(null);
        try {
            const [p, a, d] = await Promise.all([
                gateway.getPolicy(jwt),
                gateway.listAudit(jwt),
                gateway.getDesiredRelease(jwt),
            ]);
            setPolicy(p.policy);
            setAudit(a.audit);
            setDesired(d);
            setDraft({});
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => {
        load();
    }, [load]);

    const current = useMemo(() => ({ ...(policy ?? {}), ...draft }) as TenantUpdatePolicy, [policy, draft]);

    const dirty = useMemo(() => Object.keys(draft).length > 0, [draft]);

    const set = <K extends keyof TenantUpdatePolicy>(field: K, value: TenantUpdatePolicy[K]) => {
        setDraft((d) => ({ ...d, [field]: value }));
    };

    const save = async () => {
        if (!policy) return;
        setSaving(true);
        setError(null);
        setInfo(null);
        try {
            const patch = {
                updateMode: current.updateMode,
                freezeLevel: current.freezeLevel,
                pinnedFrontendReleaseId: current.pinnedFrontendReleaseId,
                pinnedBackendApiVersion: current.pinnedBackendApiVersion,
                pinnedTenantBoxVersion: current.pinnedTenantBoxVersion,
                pinnedSchemaVersion: current.pinnedSchemaVersion,
                allowSecurityUpdates: current.allowSecurityUpdates,
                allowPatchUpdates: current.allowPatchUpdates,
                allowMinorUpdates: current.allowMinorUpdates,
                allowMajorUpdates: current.allowMajorUpdates,
                requireAdminApproval: current.requireAdminApproval,
                maintenanceWindow: current.maintenanceWindow,
                freezeReason: current.freezeReason,
                freezeUntil: current.freezeUntil,
                reason: draft.reason,
            };
            const res = await gateway.putPolicy(jwt, patch);
            setPolicy(res.policy);
            setDraft({});
            setInfo(t('settings.update_switch.gespeichert'));
            const a = await gateway.listAudit(jwt);
            setAudit(a.audit);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!jwt) {
        return <div className="text-sm text-muted-foreground">{t('common.not_signed_in')}</div>;
    }

    if (loading && !policy) {
        return (
            <div className="space-y-3">
                <div className="h-8 w-64 rounded bg-muted/60 animate-pulse" />
                <div className="h-32 rounded bg-muted/30 animate-pulse" />
                <div className="h-32 rounded bg-muted/30 animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <GitBranch className="size-5" /> {t('settings.update_switch.titel')}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('settings.update_switch.untertitel')}
                    </p>
                </div>
                <button
                    onClick={load}
                    title={t('settings.update_switch.neu_laden')}
                    className="flex size-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-50"
                    disabled={loading}
                >
                    <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{t('settings.update_switch.p2_hinweis')}</span>
                </p>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}
            {info && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    {info}
                </div>
            )}

            {/* ─── Aktuelles Soll ───────────────────────────────────── */}
            <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">{t('settings.update_switch.aktuelles_soll')}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                    {t('settings.update_switch.aktuelles_soll_hinweis')}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <KeyValue
                        label={t('settings.update_switch.gewuenschte_release')}
                        value={desired?.releaseId ?? t('settings.update_switch.kein_release_gepinned')}
                    />
                    <KeyValue
                        label={t('settings.update_switch.begruendung')}
                        value={desired?.reason ?? '–'}
                    />
                </div>
            </section>

            {/* ─── Policy bearbeiten ────────────────────────────────── */}
            <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">{t('settings.update_switch.policy')}</h3>

                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Update-Modus */}
                    <label className="block text-sm">
                        <span className="text-muted-foreground">{t('settings.update_switch.update_modus')}</span>
                        <select
                            value={current.updateMode}
                            onChange={(e) => set('updateMode', e.target.value as UpdateMode)}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {UPDATE_MODES.map((m) => (
                                <option key={m} value={m}>
                                    {t(`settings.update_switch.mode.${m}`)}
                                </option>
                            ))}
                        </select>
                    </label>

                    {/* Freeze-Level */}
                    <label className="block text-sm">
                        <span className="text-muted-foreground">{t('settings.update_switch.freeze_level')}</span>
                        <select
                            value={current.freezeLevel}
                            onChange={(e) => set('freezeLevel', e.target.value as FreezeLevel)}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {FREEZE_LEVELS_TODAY.map((l) => (
                                <option key={l} value={l}>
                                    {t(`settings.update_switch.freeze.${l}`)}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            {t('settings.update_switch.freeze_p5_hint')}
                        </p>
                    </label>
                </div>

                {current.updateMode === 'frozen' && (
                    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                        <p className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-200">
                            <Snowflake className="size-4" /> {t('settings.update_switch.freeze_aktiv')}
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="block text-sm">
                                <span className="text-muted-foreground">{t('settings.update_switch.freeze_grund')}</span>
                                <textarea
                                    value={current.freezeReason ?? ''}
                                    onChange={(e) => set('freezeReason', e.target.value)}
                                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    rows={2}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-muted-foreground">{t('settings.update_switch.freeze_bis')}</span>
                                <input
                                    type="date"
                                    value={current.freezeUntil ? current.freezeUntil.slice(0, 10) : ''}
                                    onChange={(e) =>
                                        set('freezeUntil', e.target.value ? new Date(e.target.value).toISOString() : null)
                                    }
                                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                />
                            </label>
                        </div>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Toggle
                        checked={!!current.allowSecurityUpdates}
                        onChange={(v) => set('allowSecurityUpdates', v)}
                        label={t('settings.update_switch.allow_security')}
                    />
                    <Toggle
                        checked={!!current.allowPatchUpdates}
                        onChange={(v) => set('allowPatchUpdates', v)}
                        label={t('settings.update_switch.allow_patch')}
                    />
                    <Toggle
                        checked={!!current.allowMinorUpdates}
                        onChange={(v) => set('allowMinorUpdates', v)}
                        label={t('settings.update_switch.allow_minor')}
                    />
                    <Toggle
                        checked={!!current.allowMajorUpdates}
                        onChange={(v) => set('allowMajorUpdates', v)}
                        label={t('settings.update_switch.allow_major')}
                    />
                    <Toggle
                        checked={!!current.requireAdminApproval}
                        onChange={(v) => set('requireAdminApproval', v)}
                        label={t('settings.update_switch.require_approval')}
                    />
                </div>

                <label className="mt-4 block text-sm">
                    <span className="text-muted-foreground">{t('settings.update_switch.aenderungsgrund')}</span>
                    <input
                        type="text"
                        value={draft.reason ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
                        placeholder={t('settings.update_switch.aenderungsgrund_placeholder')}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                </label>

                <div className="mt-4 flex items-center justify-end">
                    <button
                        type="button"
                        onClick={save}
                        disabled={!dirty || saving}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Save className="size-4" />
                        {saving ? t('common.saving') : t('settings.update_switch.speichern')}
                    </button>
                </div>
            </section>

            {/* ─── Audit-Trail ──────────────────────────────────────── */}
            <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <History className="size-4" /> {t('settings.update_switch.audit')}
                </h3>
                {audit.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t('settings.update_switch.kein_audit')}</p>
                ) : (
                    <ul className="mt-3 divide-y divide-border text-sm">
                        {audit.map((a) => (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => setAuditDetail(a)}
                                    className="w-full py-2 text-left transition-colors hover:bg-muted/40"
                                >
                                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                        <span className="font-mono">{a.action}</span>
                                        <span>{new Date(a.createdAt).toLocaleString()}</span>
                                    </div>
                                    {a.reason && <p className="mt-1 text-sm">{a.reason}</p>}
                                    {a.actorId && (
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            {humanizeActor(a.actorId)}
                                        </p>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Slide-Over: Audit-Detail (no-modal-Regel) */}
            <div
                className={cn(
                    'fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out',
                    auditDetail ? 'translate-x-0' : 'translate-x-full pointer-events-none',
                )}
                aria-hidden={!auditDetail}
            >
                <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                    <History className="size-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{t('settings.update_switch.audit_detail')}</span>
                    <button
                        onClick={() => setAuditDetail(null)}
                        className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        title={t('common.close', { defaultValue: 'Schliessen' })}
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
                    {auditDetail && (
                        <>
                            <KeyValue
                                label={t('settings.update_switch.audit_action')}
                                value={auditDetail.action}
                            />
                            <KeyValue
                                label={t('settings.update_switch.audit_when')}
                                value={new Date(auditDetail.createdAt).toLocaleString()}
                            />
                            {auditDetail.actorId && (
                                <KeyValue
                                    label={t('settings.update_switch.audit_actor')}
                                    value={humanizeActor(auditDetail.actorId)}
                                />
                            )}
                            {auditDetail.reason && (
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('settings.update_switch.audit_reason')}
                                    </div>
                                    <div className="mt-0.5 whitespace-pre-wrap text-sm">{auditDetail.reason}</div>
                                </div>
                            )}
                            <div>
                                <div className="text-xs text-muted-foreground">
                                    {t('settings.update_switch.audit_old')}
                                </div>
                                <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-2 text-[11px]">
                                    {auditDetail.oldPolicy
                                        ? JSON.stringify(auditDetail.oldPolicy, null, 2)
                                        : '—'}
                                </pre>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">
                                    {t('settings.update_switch.audit_new')}
                                </div>
                                <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-2 text-[11px]">
                                    {auditDetail.newPolicy
                                        ? JSON.stringify(auditDetail.newPolicy, null, 2)
                                        : '—'}
                                </pre>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function KeyValue({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 font-mono text-sm">{value}</div>
        </div>
    );
}

/** Macht aus internen actorId-Strings lesbare Labels — Audit ist
 *  workspace-internal, also keine DSGVO-Pseudonymisierung noetig,
 *  aber Operator-Begriffe sind klarer als "portal:admin". */
function humanizeActor(actor: string): string {
    if (actor.startsWith('system:')) return 'System';
    if (actor.startsWith('script:')) return `Skript (${actor.slice('script:'.length)})`;
    if (actor.startsWith('portal:')) return 'Prilog Operator';
    if (actor.startsWith('@')) {
        // Matrix-ID: nur local-part zeigen
        const idx = actor.indexOf(':');
        return idx > 0 ? actor.slice(0, idx) : actor;
    }
    return actor;
}

function Toggle({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
}): JSX.Element {
    return (
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <span>{label}</span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="size-4 accent-primary"
            />
        </label>
    );
}
