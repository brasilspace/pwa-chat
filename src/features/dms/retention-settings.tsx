/**
 * RetentionSettings — Settings-Seite fuer Aufbewahrungsrichtlinien (DMS Phase 5).
 *
 * Admin-only. Listet Policies, erlaubt Anlegen/Editieren/Loeschen.
 * Default-Vorlagen werden im Anlege-Form als Quick-Picks angeboten
 * (DSGVO-Schule, §147 AO, §8a SGB VIII, ...).
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useRetentionPolicies, retentionApi, type RetentionPolicy, type RetentionAction } from './use-retention-policies';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface PresetTemplate {
    key: string;
    label: string;
    description: string;
    durationDays: number;
    triggerField: string;
    actionAfter: RetentionAction;
}

const PRESETS: PresetTemplate[] = [
    {
        key: 'schule-schuelerakte-5j', label: 'Schülerakte (5 Jahre nach Schulaustritt)',
        description: 'BASS NRW: allgemeine Schülerdaten 5 Jahre nach Austritt',
        durationDays: 5 * 365, triggerField: 'schulaustritt', actionAfter: 'offer'
    },
    {
        key: 'schule-zeugnis-50j', label: 'Zeugnis-Duplikat (50 Jahre)',
        description: 'BASS NRW: Duplikate von Abschluss-/Abgangszeugnissen',
        durationDays: 50 * 365, triggerField: 'createdAt', actionAfter: 'offer'
    },
    {
        key: 'ao-§147-10j', label: 'Geschäftsbriefe / Belege (10 Jahre §147 AO)',
        description: 'Steuerrelevante Belege: Buchungsbelege, Inventare, Bilanzen',
        durationDays: 10 * 365, triggerField: 'rechnungsdatum', actionAfter: 'archive'
    },
    {
        key: 'ao-§147-6j', label: 'Geschäftsbriefe Eingang/Ausgang (6 Jahre §147 AO)',
        description: 'Empfangene/abgesandte Handels- oder Geschäftsbriefe',
        durationDays: 6 * 365, triggerField: 'createdAt', actionAfter: 'archive'
    },
    {
        key: 'kjhg-§8a-10j', label: 'Kinderschutz-Akte (10 Jahre §8a SGB VIII)',
        description: 'Gefährdungseinschätzungen + Hilfeplan',
        durationDays: 10 * 365, triggerField: 'createdAt', actionAfter: 'offer'
    },
    {
        key: 'datenschutz-3j', label: 'Auftrags-Daten (3 Jahre DSGVO Art. 5)',
        description: 'Allgemeine personenbezogene Daten ohne sonstige Fristen',
        durationDays: 3 * 365, triggerField: 'createdAt', actionAfter: 'delete'
    },
];

const ACTION_LABELS: Record<RetentionAction, string> = {
    archive: 'Archivieren',
    delete: 'Löschen (Papierkorb)',
    offer: 'Nur melden (Admin entscheidet)',
};

export function RetentionSettings(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const { policies, loading, refresh } = useRetentionPolicies();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState<PresetTemplate | 'blank' | null>(null);

    if (!isAdmin) {
        return <div className="p-6 text-sm text-muted-foreground">{t('dms.retention_settings.nur_tenant-admins_koennen_aufbewahrungsr')}</div>;
    }

    return (
        <div className="space-y-4 p-4">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-semibold">
                        <MaterialIcon name="schedule" size={16} className="size-5" /> {t('dms.retention_settings.aufbewahrungsregeln')}
                    </h1>
                    <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
                        {t('dms.retention_settings.wie_lange_sollen_dokumente_aufbewahrt_we')}
                        <strong className="ml-1">{t('dms.retention_settings.legal_hold')}</strong> {t('dms.retention_settings.blockt_jede_loeschung_wichtig_fuer_laufe')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCreating('blank')} className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted inline-flex items-center gap-1">
                        <MaterialIcon name="add" size={16} className="size-3.5" /> {t('dms.retention_settings.eigene_regel')}
                    </button>
                </div>
            </div>

            {/* Presets als Quick-Picks */}
            {!creating && policies.length === 0 && !loading && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('dms.retention_settings.schnellstart_haeufige_regeln_nach_dschvo')}</p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {PRESETS.map(p => (
                            <li key={p.key}>
                                <button
                                    onClick={() => setCreating(p)}
                                    className="w-full rounded border border-border bg-card p-3 text-left hover:bg-muted/50"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">{p.label}</span>
                                        <MaterialIcon name="add" size={16} className="size-4 text-muted-foreground" />
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">{p.description}</p>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {loading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}

            {creating && <PolicyForm preset={creating === 'blank' ? null : creating} onCancel={() => setCreating(null)} onDone={() => { setCreating(null); refresh(); }} />}

            <ul className="space-y-2">
                {policies.map(p => (
                    <li key={p.id} className="rounded border border-border bg-card">
                        {editingId === p.id ? (
                            <PolicyForm initial={p} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); refresh(); }} />
                        ) : (
                            <div className="flex items-center gap-3 p-3">
                                <MaterialIcon name="schedule" size={16} className="size-5 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium">{p.label}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {formatDuration(p.durationDays)} {t('dms.retention_settings.ab')} <code className="rounded bg-muted px-1">{p.triggerField}</code> · {ACTION_LABELS[p.actionAfter]}
                                        {p.legalHoldOverride && <span className="ml-1 inline-flex items-center gap-0.5"><MaterialIcon name="gpp_maybe" size={16} className="size-2.5" /> {t('dms.retention_settings.legal_hold_blockt')}</span>}
                                    </div>
                                    {p.documentTypes && p.documentTypes.length > 0 && (
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                                            {t('dms.retention_settings.verwendet_von')} {p.documentTypes.map(_t => _t.label).join(', ')}
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setEditingId(p.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">{t('common.edit')}</button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function formatDuration(days: number): string {
    if (days < 365) return `${days} Tage`;
    const years = days / 365;
    if (Number.isInteger(years)) return `${years} Jahr${years === 1 ? '' : 'e'}`;
    return `${(days / 365).toFixed(1)} Jahre`;
}

function PolicyForm({ initial, preset, onCancel, onDone }: {
    initial?: RetentionPolicy;
    preset?: PresetTemplate | null;
    onCancel: () => void;
    onDone: () => void;
}): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const isEdit = !!initial;
    const [key, setKey] = useState(initial?.key ?? preset?.key ?? '');
    const [label, setLabel] = useState(initial?.label ?? preset?.label ?? '');
    const [description, setDescription] = useState(initial?.description ?? preset?.description ?? '');
    const [years, setYears] = useState(((initial?.durationDays ?? preset?.durationDays ?? 365) / 365).toString());
    const [triggerField, setTriggerField] = useState(initial?.triggerField ?? preset?.triggerField ?? 'createdAt');
    const [actionAfter, setActionAfter] = useState<RetentionAction>(initial?.actionAfter ?? preset?.actionAfter ?? 'offer');
    const [legalHoldOverride, setLegalHoldOverride] = useState(initial?.legalHoldOverride ?? true);
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!jwt || !label.trim()) return;
        const yearsNum = parseFloat(years);
        if (isNaN(yearsNum) || yearsNum <= 0 || yearsNum > 50) {
            alert('Dauer muss zwischen 0 und 50 Jahren liegen');
            return;
        }
        const durationDays = Math.round(yearsNum * 365);

        setSaving(true);
        try {
            if (isEdit) {
                await retentionApi.patch(jwt, initial!.id, {
                    label: label.trim(),
                    description: description.trim() || undefined,
                    durationDays,
                    triggerField: triggerField.trim() || 'createdAt',
                    actionAfter,
                    legalHoldOverride,
                });
            } else {
                if (!key.trim().match(/^[a-z0-9-§]+$/i)) {
                    alert('Key: nur Buchstaben/Zahlen/Bindestrich/§');
                    setSaving(false);
                    return;
                }
                await retentionApi.create(jwt, {
                    key: key.trim(),
                    label: label.trim(),
                    description: description.trim() || undefined,
                    durationDays,
                    triggerField: triggerField.trim() || 'createdAt',
                    actionAfter,
                    legalHoldOverride,
                });
            }
            onDone();
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!jwt || !initial) return;
        if (!confirm(`Regel "${label}" loeschen?\n\nVerknuepfte Document-Typen verlieren die Zuordnung. Documents verlieren retentionUntil.`)) return;
        try {
            await retentionApi.delete(jwt, initial.id);
            onDone();
        } catch (e) {
            alert('Loeschen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.retention_settings.bezeichnung')}</label>
                    <input value={label} onChange={e => setLabel(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
                </div>
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.retention_settings.key_technisch')} {!isEdit && '*'}</label>
                    <input
                        value={key}
                        onChange={e => setKey(e.target.value.toLowerCase())}
                        disabled={isEdit}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono disabled:opacity-50"
                    />
                </div>
            </div>

            <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t('common.description')}</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
            </div>

            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.retention_settings.dauer_jahre')}</label>
                    <input type="number" step="0.5" min="0.1" max="50" value={years} onChange={e => setYears(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
                </div>
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.retention_settings.frist_startet_bei')}</label>
                    <input value={triggerField} onChange={e => setTriggerField(e.target.value)} placeholder={t('dms.retention_settings.createdat_updatedat_field-key')} className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono" />
                </div>
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.retention_settings.aktion_nach_ablauf')}</label>
                    <select value={actionAfter} onChange={e => setActionAfter(e.target.value as RetentionAction)} className="w-full rounded border border-border bg-background px-2 py-1 text-sm">
                        <option value="offer">{t('dms.retention_settings.nur_melden')}</option>
                        <option value="archive">{t('dms.retention_settings.archivieren')}</option>
                        <option value="delete">{t('dms.retention_settings.loeschen_papierkorb')}</option>
                    </select>
                </div>
            </div>

            <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={legalHoldOverride} onChange={e => setLegalHoldOverride(e.target.checked)} className="size-3.5" />
                <MaterialIcon name="gpp_maybe" size={16} className="size-3 text-amber-600" />
                {t('dms.retention_settings.legal_hold_blockt_diese_aktion_empfohlen')}
            </label>

            <div className="flex items-center gap-2">
                <button onClick={submit} disabled={saving || !label.trim() || (!isEdit && !key.trim())} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1">
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-3" />} {t('common.save')}
                </button>
                <button onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs">{t('common.cancel')}</button>
                {isEdit && (
                    <button onClick={remove} className="ml-auto rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-600 hover:bg-red-500/10 inline-flex items-center gap-1">
                        <MaterialIcon name="delete" size={16} className="size-3" /> {t('common.delete')}
                    </button>
                )}
            </div>
        </div>
    );
}
