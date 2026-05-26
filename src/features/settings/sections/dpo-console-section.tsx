/**
 * DSB-Konsole — zentrales Compliance-Cockpit pro Tenant.
 *
 * Owner-Direktive 2026-05-23: ein Gate — eine Stelle. Statt verstreuter
 * Feature-Flags und Genehmigungs-Spuren existiert hier EINE Seite mit
 * Karten pro Datenschutz-Gate. Backend-Features pruefen ihren Aktivierungs-
 * Status zentral via complianceService.isComplianceGateApproved.
 */
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import {
    createComplianceGateway,
    type DpoProfile,
    type GateView,
    type AuditEntry,
} from '@/gateways/platform/compliance-gateway';

const gateway = createComplianceGateway();

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: string; labelKey: string }> = {
    not_started:  { bg: 'bg-gray-100 dark:bg-gray-800',         text: 'text-gray-700 dark:text-gray-300',     icon: 'radio_button_unchecked', labelKey: 'dpo.status.not_started' },
    in_review:    { bg: 'bg-blue-100 dark:bg-blue-900/40',      text: 'text-blue-900 dark:text-blue-200',     icon: 'pending',                labelKey: 'dpo.status.in_review' },
    approved:     { bg: 'bg-emerald-100 dark:bg-emerald-900/40',text: 'text-emerald-900 dark:text-emerald-200',icon: 'check_circle',           labelKey: 'dpo.status.approved' },
    rejected:     { bg: 'bg-red-100 dark:bg-red-900/40',        text: 'text-red-900 dark:text-red-200',       icon: 'cancel',                 labelKey: 'dpo.status.rejected' },
    expired:      { bg: 'bg-amber-100 dark:bg-amber-900/40',    text: 'text-amber-900 dark:text-amber-200',   icon: 'event_busy',             labelKey: 'dpo.status.expired' },
};

export function DpoConsoleSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [profile, setProfile] = useState<DpoProfile | null>(null);
    const [gates, setGates] = useState<GateView[]>([]);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
    // initialLoading nur fuer das erste Laden — sonst wuerden Sub-Components
    // (GateCard) bei jedem reload() unmounted und ihren lokalen State (expanded,
    // reason-Eingabe) verlieren. Subsequent refreshes laufen transparent.
    const [initialLoading, setInitialLoading] = useState(true);
    const [showAudit, setShowAudit] = useState(false);

    async function reload() {
        if (!jwt) return;
        try {
            const [p, g, a] = await Promise.all([
                gateway.getDpoProfile(jwt),
                gateway.listGates(jwt),
                gateway.listAuditLog(jwt, { limit: 50 }),
            ]);
            setProfile(p.profile);
            setGates(g.gates);
            setAuditLog(a.entries);
        } finally {
            setInitialLoading(false);
        }
    }
    useEffect(() => { reload(); }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!jwt) return <p className="text-sm text-muted-foreground">Bitte anmelden.</p>;
    if (initialLoading) return <p className="text-sm text-muted-foreground">…</p>;

    return (
        <div className="space-y-6 max-w-4xl">
            <header>
                <h1 className="text-2xl font-semibold">{t('dpo.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('dpo.subtitle')}</p>
            </header>

            <DpoProfileCard profile={profile} jwt={jwt} onSaved={reload} />

            <section>
                <h2 className="mb-3 text-lg font-semibold">{t('dpo.gates_section')}</h2>
                <div className="space-y-3">
                    {gates.map((g) => (
                        <GateCard key={g.key} gate={g} jwt={jwt} onChange={reload} />
                    ))}
                </div>
            </section>

            <section>
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold">{t('dpo.audit_section')}</h2>
                    <button
                        onClick={() => setShowAudit(!showAudit)}
                        className="text-xs text-primary hover:underline"
                    >
                        {showAudit ? t('dpo.audit_hide') : t('dpo.audit_show')}
                    </button>
                </div>
                {showAudit && (
                    <div className="rounded-md border border-border bg-muted/30">
                        {auditLog.length === 0 ? (
                            <p className="p-3 text-xs text-muted-foreground">{t('dpo.audit_empty')}</p>
                        ) : (
                            <ul className="divide-y divide-border text-xs">
                                {auditLog.map((e) => (
                                    <li key={e.id} className="px-3 py-2 grid grid-cols-[120px_140px_1fr] gap-2 items-baseline">
                                        <span className="font-mono text-[10px] text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
                                        <span className="text-muted-foreground">{e.action}</span>
                                        <span>
                                            {e.gateKey && <code className="rounded bg-muted px-1 mr-1 text-[10px]">{e.gateKey}</code>}
                                            {e.beforeStatus && e.afterStatus && <span>{e.beforeStatus} → {e.afterStatus} · </span>}
                                            {e.reason && <span className="text-muted-foreground">{e.reason}</span>}
                                            {e.actorId && <span className="ml-1 text-[10px] text-muted-foreground">— {e.actorRole}:{e.actorId}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

// ─── DSB-Profil-Karte ─────────────────────────────────────────

function DpoProfileCard({ profile, jwt, onSaved }: { profile: DpoProfile | null; jwt: string; onSaved: () => void }) {
    const t = useT();
    const [editing, setEditing] = useState(!profile);
    const [form, setForm] = useState({
        dpoName: profile?.dpoName ?? '',
        dpoEmail: profile?.dpoEmail ?? '',
        dpoPhone: profile?.dpoPhone ?? '',
        isExternal: profile?.isExternal ?? false,
        externalOrg: profile?.externalOrg ?? '',
        notes: profile?.notes ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setSaving(true);
        setError(null);
        try {
            await gateway.upsertDpoProfile(jwt, {
                dpoName: form.dpoName.trim(),
                dpoEmail: form.dpoEmail.trim(),
                dpoPhone: form.dpoPhone.trim() || undefined,
                isExternal: form.isExternal,
                externalOrg: form.externalOrg.trim() || undefined,
                notes: form.notes.trim() || undefined,
            });
            setEditing(false);
            onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">{t('dpo.profile_title')}</h2>
                {profile && !editing && (
                    <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
                        <MaterialIcon name="edit" size={14} className="-mt-0.5 mr-1 inline" />{t('common.edit', { defaultValue: 'Bearbeiten' })}
                    </button>
                )}
            </div>

            {!profile && !editing && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <MaterialIcon name="warning" size={14} className="-mt-0.5 mr-1 inline" />
                    {t('dpo.profile_empty_warning')}
                </div>
            )}

            {profile && !editing && (
                <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2"><MaterialIcon name="person" size={14} className="text-muted-foreground" />{profile.dpoName}</div>
                    <div className="flex items-center gap-2"><MaterialIcon name="mail" size={14} className="text-muted-foreground" /><a href={`mailto:${profile.dpoEmail}`} className="text-primary hover:underline">{profile.dpoEmail}</a></div>
                    {profile.dpoPhone && <div className="flex items-center gap-2"><MaterialIcon name="phone" size={14} className="text-muted-foreground" />{profile.dpoPhone}</div>}
                    {profile.isExternal && (
                        <div className="flex items-center gap-2"><MaterialIcon name="business" size={14} className="text-muted-foreground" />{t('dpo.profile_external')} · {profile.externalOrg || '—'}</div>
                    )}
                    {profile.notes && <div className="mt-2 text-xs text-muted-foreground italic">{profile.notes}</div>}
                </div>
            )}

            {editing && (
                <div className="space-y-2">
                    {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>}
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-sm">
                            <span className="text-xs text-muted-foreground">{t('dpo.field_name')} *</span>
                            <input value={form.dpoName} onChange={(e) => setForm({ ...form, dpoName: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                        </label>
                        <label className="block text-sm">
                            <span className="text-xs text-muted-foreground">{t('dpo.field_email')} *</span>
                            <input type="email" value={form.dpoEmail} onChange={(e) => setForm({ ...form, dpoEmail: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                        </label>
                    </div>
                    <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">{t('dpo.field_phone')}</span>
                        <input value={form.dpoPhone} onChange={(e) => setForm({ ...form, dpoPhone: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.isExternal} onChange={(e) => setForm({ ...form, isExternal: e.target.checked })} />
                        <span>{t('dpo.field_is_external')}</span>
                    </label>
                    {form.isExternal && (
                        <label className="block text-sm">
                            <span className="text-xs text-muted-foreground">{t('dpo.field_external_org')}</span>
                            <input value={form.externalOrg} onChange={(e) => setForm({ ...form, externalOrg: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                        </label>
                    )}
                    <label className="block text-sm">
                        <span className="text-xs text-muted-foreground">{t('dpo.field_notes')}</span>
                        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    </label>
                    <div className="flex justify-end gap-2">
                        {profile && <button onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>}
                        <button onClick={save} disabled={saving || !form.dpoName.trim() || !form.dpoEmail.trim()} className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            <MaterialIcon name="save" size={14} />
                            {saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

// ─── Gate-Karte ───────────────────────────────────────────────

function GateCard({ gate, jwt, onChange }: { gate: GateView; jwt: string; onChange: () => void }) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const [reason, setReason] = useState('');
    const [actorRole, setActorRole] = useState<'dpo' | 'admin'>('admin');
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const style = STATUS_STYLE[gate.status] ?? STATUS_STYLE.not_started;
    const def = gate.definition;
    const isMandatory = def.mandatoryAnnex;
    const needsReason = gate.status === 'in_review' || gate.status === 'expired';
    const reasonTooShort = needsReason && reason.trim().length < 5;

    async function actOn(action: 'start_review' | 'approve' | 'reject' | 'reopen') {
        setWorking(true);
        setError(null);
        try {
            await gateway.changeGateStatus(jwt, gate.key, {
                action,
                actorRole,
                reason: (action === 'approve' || action === 'reject') ? reason : undefined,
            });
            setReason('');
            onChange();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setWorking(false);
        }
    }

    async function toggleChecklist(itemKey: string, checked: boolean) {
        try {
            await gateway.setChecklistItem(jwt, gate.key, itemKey, checked, actorRole);
            onChange();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <article className={cn('rounded-lg border bg-card transition-colors', style.bg, 'border-border')}>
            <header className="flex items-center gap-3 px-4 py-3">
                <MaterialIcon name={style.icon} size={20} className={style.text} />
                <div className="flex-1">
                    <h3 className="text-sm font-semibold">{t(def.titleKey, { defaultValue: def.key })}</h3>
                    <p className="text-xs text-muted-foreground">{t(def.summaryKey, { defaultValue: '' })}</p>
                </div>
                {needsReason && (
                    <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white animate-pulse" title={t('dpo.action_required_hint')}>
                        {t('dpo.action_required')}
                    </span>
                )}
                <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', style.text)}>
                    {t(style.labelKey, { defaultValue: gate.status })}
                </span>
                <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary hover:underline">
                    {expanded ? t('dpo.collapse') : t('dpo.expand')}
                </button>
            </header>

            {expanded && (
                <div className="border-t border-border bg-background/60 px-4 py-3 space-y-3 text-sm">
                    {/* Kontext */}
                    <KV label={t('dpo.context_what')} value={t(def.contextKeys.whatItIs, { defaultValue: '—' })} />
                    <KV label={t('dpo.context_data')} value={t(def.contextKeys.dataInvolved, { defaultValue: '—' })} />
                    <KV label={t('dpo.context_legal')} value={t(def.contextKeys.legalBasis, { defaultValue: '—' })} />
                    <KV label={t('dpo.context_risks')} value={t(def.contextKeys.risks, { defaultValue: '—' })} />
                    <KV label={t('dpo.context_toms')} value={t(def.contextKeys.toms, { defaultValue: '—' })} />

                    {/* Dokumente */}
                    {def.documents.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('dpo.documents')}</div>
                            <ul className="space-y-1">
                                {def.documents.map((d) => (
                                    <li key={d.docsPath} className="flex items-center gap-2 text-xs">
                                        <MaterialIcon name="description" size={14} className="text-muted-foreground" />
                                        <a
                                            href={`https://github.com/brasilspace/prilog_docs/blob/main/${d.docsPath}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-primary hover:underline"
                                        >
                                            {t(d.labelKey, { defaultValue: d.docsPath })}
                                        </a>
                                        {d.requiresUpload && (
                                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                                                {t('dpo.doc_requires_upload')}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Checkliste */}
                    {!isMandatory && def.checklist.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('dpo.checklist')}</div>
                            <ul className="space-y-1">
                                {def.checklist.map((item) => (
                                    <li key={item.key}>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={gate.checklistState[item.key] === true}
                                                onChange={(e) => toggleChecklist(item.key, e.target.checked)}
                                                disabled={gate.status === 'approved'}
                                            />
                                            <span>{t(item.labelKey, { defaultValue: item.key })}</span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Status-Aktionen */}
                    {!isMandatory && (
                        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                            {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>}
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">{t('dpo.acting_as')}</span>
                                <select
                                    value={actorRole}
                                    onChange={(e) => setActorRole(e.target.value as 'dpo' | 'admin')}
                                    className="rounded-md border border-input bg-background px-2 py-0.5 text-xs"
                                >
                                    <option value="dpo">{t('dpo.actor_dpo')}</option>
                                    <option value="admin">{t('dpo.actor_admin')}</option>
                                </select>
                            </div>
                            {needsReason && (
                                <>
                                    <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                                        <MaterialIcon name="info" size={12} className="-mt-0.5 mr-1 inline" />
                                        {t('dpo.in_review_hint')}
                                    </div>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground">{t('dpo.field_reason')} *</span>
                                        <textarea
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                            rows={2}
                                            placeholder={t('dpo.reason_placeholder', { defaultValue: 'Begruendung…' })}
                                            className={cn(
                                                'mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-xs',
                                                reasonTooShort ? 'border-blue-400 ring-2 ring-blue-200' : 'border-input',
                                            )}
                                        />
                                        {reasonTooShort && (
                                            <span className="mt-1 block text-[10px] text-blue-700 dark:text-blue-300">
                                                {t('dpo.reason_too_short', { defaultValue: 'Min. 5 Zeichen' })} ({reason.trim().length}/5)
                                            </span>
                                        )}
                                    </label>
                                </>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {gate.status === 'not_started' && (
                                    <button onClick={() => actOn('start_review')} disabled={working} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                                        {t('dpo.action_start_review')}
                                    </button>
                                )}
                                {(gate.status === 'in_review' || gate.status === 'expired') && (
                                    <>
                                        <button
                                            onClick={() => actOn('approve')}
                                            disabled={working || reasonTooShort}
                                            title={reasonTooShort ? t('dpo.button_disabled_reason') : undefined}
                                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <MaterialIcon name="check_circle" size={14} />
                                            {t('dpo.action_approve')}
                                        </button>
                                        <button
                                            onClick={() => actOn('reject')}
                                            disabled={working || reasonTooShort}
                                            title={reasonTooShort ? t('dpo.button_disabled_reason') : undefined}
                                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <MaterialIcon name="cancel" size={14} />
                                            {t('dpo.action_reject')}
                                        </button>
                                        <button
                                            onClick={() => actOn('reopen')}
                                            disabled={working}
                                            className="rounded-md bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 disabled:opacity-50"
                                            title={t('dpo.action_reopen_hint')}
                                        >
                                            {t('dpo.action_reopen')}
                                        </button>
                                    </>
                                )}
                                {gate.status === 'rejected' && (
                                    <button onClick={() => actOn('start_review')} disabled={working} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                                        {t('dpo.action_reopen_review')}
                                    </button>
                                )}
                                {gate.status === 'approved' && (
                                    <button onClick={() => actOn('reopen')} disabled={working} className="rounded-md bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 disabled:opacity-50">
                                        {t('dpo.action_reopen')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Status-Details */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {gate.approvedAt && (
                            <>
                                <span>{t('dpo.approved_at')}</span>
                                <span>{new Date(gate.approvedAt).toLocaleString()} {gate.approvedBy && <span className="ml-1">({gate.approvedByRole}:{gate.approvedBy})</span>}</span>
                            </>
                        )}
                        {gate.expiresAt && (
                            <>
                                <span>{t('dpo.expires_at')}</span>
                                <span>{new Date(gate.expiresAt).toLocaleDateString()}</span>
                            </>
                        )}
                        {gate.approvalReason && (
                            <>
                                <span>{t('dpo.approval_reason')}</span>
                                <span className="italic">{gate.approvalReason}</span>
                            </>
                        )}
                        {gate.rejectionReason && (
                            <>
                                <span>{t('dpo.rejection_reason')}</span>
                                <span className="italic">{gate.rejectionReason}</span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </article>
    );
}

function KV({ label, value }: { label: string; value: string }) {
    if (!value || value === '—') return null;
    return (
        <div className="text-sm">
            <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
            <span className="block">{value}</span>
        </div>
    );
}
