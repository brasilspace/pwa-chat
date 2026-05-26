/**
 * DocumentTypesSettings — Settings-Seite zum Anlegen/Editieren/Loeschen
 * von Document-Types + ihren Custom-Field-Schemas. Admin-only.
 */

import { type JSX, useState } from 'react';
import { useDocumentTypes, documentTypesApi, type CustomField, type FieldType } from './use-document-types';
import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useRetentionPolicies } from './use-retention-policies';
import { useT } from "@/lib/i18n/use-t";

export function DocumentTypesSettings(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const { types, loading, refresh } = useDocumentTypes();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    if (!isAdmin) {
        return <div className="p-6 text-sm text-muted-foreground">{t('dms.document_types_settings.nur_tenant-admins_koennen_document-types')}</div>;
    }

    return (
        <div className="space-y-4 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-semibold"><MaterialIcon name="description" size={16} className="size-5" /> {t('dms.document_types_settings.dokument-typen')}</h1>
                    <p className="text-xs text-muted-foreground">{t('dms.document_types_settings.klassifikation_fuer_dokumente_zb_vertrag')}</p>
                </div>
                <button onClick={() => setCreating(true)} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1">
                    <MaterialIcon name="add" size={16} className="size-3.5" /> {t('dms.document_types_settings.neuer_typ')}
                </button>
            </div>

            {loading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}

            {creating && <TypeForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />}

            {!loading && types.length === 0 && !creating && (
                <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {t('dms.document_types_settings.noch_keine_typen_klick_neuer_typ_um_den_')}
                </p>
            )}

            <ul className="space-y-2">
                {types.map(_t => (
                    <li key={_t.id} className="rounded border border-border bg-card">
                        {editingId === _t.id ? (
                            <TypeForm initial={_t} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); refresh(); }} />
                        ) : (
                            <div className="flex items-center gap-3 p-3">
                                {_t.iconEmoji && <span className="text-xl">{_t.iconEmoji}</span>}
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium">{_t.label}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dms.document_types_settings.key')} <code className="rounded bg-muted px-1">{_t.key}</code> ·
                                        {' '}{_t.fields.length} {t('dms.document_types_settings.feld')}{_t.fields.length !== 1 ? 'er' : ''} ·
                                        {' '}{_t.documentCount ?? 0} {t('dms.document_types_settings.dokument')}{(_t.documentCount ?? 0) !== 1 ? 'e' : ''}
                                    </div>
                                    {_t.description && <div className="mt-0.5 text-xs text-muted-foreground">{_t.description}</div>}
                                </div>
                                <button onClick={() => setEditingId(_t.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">{t('common.edit')}</button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function TypeForm({ initial, onCancel, onDone }: { initial?: { id?: string; key?: string; label?: string; iconEmoji?: string | null; description?: string | null; fields?: CustomField[]; retentionPolicyId?: string | null }; onCancel: () => void; onDone: () => void }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { policies } = useRetentionPolicies();
    const [key, setKey] = useState(initial?.key ?? '');
    const [label, setLabel] = useState(initial?.label ?? '');
    const [emoji, setEmoji] = useState(initial?.iconEmoji ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [fields, setFields] = useState<CustomField[]>(initial?.fields ?? []);
    const [retentionPolicyId, setRetentionPolicyId] = useState<string>(initial?.retentionPolicyId ?? '');
    const [saving, setSaving] = useState(false);

    const isEdit = !!initial?.id;

    const addField = () => setFields(prev => [...prev, { key: '', label: '', type: 'text' }]);
    const removeField = (idx: number) => setFields(prev => prev.filter((_, i) => i !== idx));
    const updateField = (idx: number, patch: Partial<CustomField>) =>
        setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
    const moveField = (idx: number, dir: -1 | 1) => {
        setFields(prev => {
            const next = [...prev];
            const target = idx + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[idx], next[target]] = [next[target], next[idx]];
            return next;
        });
    };

    const submit = async () => {
        if (!jwt || !label.trim()) return;
        setSaving(true);
        try {
            if (isEdit && initial?.id) {
                await documentTypesApi.patch(jwt, initial.id, {
                    label: label.trim(),
                    iconEmoji: emoji.trim(),
                    description: description.trim(),
                    fields,
                    retentionPolicyId: retentionPolicyId || null,
                });
            } else {
                if (!key.trim().match(/^[a-z0-9-]+$/)) {
                    alert('Key: nur Kleinbuchstaben, Zahlen, Bindestrich');
                    setSaving(false);
                    return;
                }
                await documentTypesApi.create(jwt, {
                    key: key.trim(),
                    label: label.trim(),
                    iconEmoji: emoji.trim() || undefined,
                    description: description.trim() || undefined,
                    fields,
                    retentionPolicyId: retentionPolicyId || null,
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
        if (!jwt || !initial?.id) return;
        if (!confirm(`Typ "${label}" loeschen?\n\nDokumente verlieren die Typ-Zuordnung, customFields bleiben erhalten.`)) return;
        try {
            await documentTypesApi.delete(jwt, initial.id);
            onDone();
        } catch (e) {
            alert('Loeschen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.document_types_settings.emoji')}</label>
                    <input value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 2))} placeholder="📄" className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-center" />
                </div>
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.document_types_settings.bezeichnung')}</label>
                    <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t('dms.document_types_settings.zb_vertrag')} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
                </div>
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.document_types_settings.key_technisch')} {!isEdit && '*'}</label>
                    <input
                        value={key}
                        onChange={e => setKey(e.target.value.toLowerCase())}
                        placeholder={t('dms.document_types_settings.zb_vertrag')}
                        disabled={isEdit}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono disabled:opacity-50"
                    />
                </div>
            </div>
            <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t('dms.document_types_settings.beschreibung_optional')}</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
            </div>

            <div>
                <label className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <MaterialIcon name="schedule" size={16} className="size-3" /> {t('dms.document_types_settings.aufbewahrungsregel_optional')}
                </label>
                <select
                    value={retentionPolicyId}
                    onChange={e => setRetentionPolicyId(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                >
                    <option value="">{t('dms.document_types_settings.keine_regel')}</option>
                    {policies.map(p => (
                        <option key={p.id} value={p.id}>
                            {p.label} ({p.durationDays >= 365 ? `${(p.durationDays / 365).toFixed(p.durationDays % 365 === 0 ? 0 : 1)}J` : `${p.durationDays}T`})
                        </option>
                    ))}
                </select>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {t('dms.document_types_settings.beim_setzen_dieses_typs_auf_einem_doc_wi')}
                </p>
            </div>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.document_types_settings.custom_fields')}</label>
                    <button onClick={addField} className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted inline-flex items-center gap-1">
                        <MaterialIcon name="add" size={16} className="size-3" /> {t('dms.document_types_settings.feld')}
                    </button>
                </div>
                <ul className="space-y-1">
                    {fields.map((f, idx) => (
                        <li key={idx} className="rounded border border-border bg-muted/20 p-2 space-y-1">
                            <div className="flex items-center gap-1">
                                <button onClick={() => moveField(idx, -1)} disabled={idx === 0} className="rounded p-1 disabled:opacity-30 hover:bg-muted"><MaterialIcon name="expand_less" size={16} className="size-3" /></button>
                                <button onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1} className="rounded p-1 disabled:opacity-30 hover:bg-muted"><MaterialIcon name="expand_more" size={16} className="size-3" /></button>
                                <input
                                    value={f.label}
                                    onChange={e => updateField(idx, { label: e.target.value })}
                                    placeholder={t('dms.document_types_settings.feldname')}
                                    className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs"
                                />
                                <input
                                    value={f.key}
                                    onChange={e => updateField(idx, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                                    placeholder="key"
                                    className="w-24 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono"
                                />
                                <select
                                    value={f.type}
                                    onChange={e => updateField(idx, { type: e.target.value as FieldType })}
                                    className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                                >
                                    <option value="text">{t('dms.document_types_settings.text')}</option>
                                    <option value="longtext">{t('dms.document_types_settings.mehrzeilig')}</option>
                                    <option value="number">{t('dms.document_types_settings.zahl')}</option>
                                    <option value="money">{t('dms.document_types_settings.geld_eur')}</option>
                                    <option value="date">{t('common.date')}</option>
                                    <option value="boolean">{t('dms.document_types_settings.janein')}</option>
                                    <option value="select">{t('dms.document_types_settings.auswahl')}</option>
                                </select>
                                <label className={t('dms.document_types_settings.pflichtfeld')} title={t('dms.document_types_settings.pflichtfeld')}>
                                    <input type="checkbox" checked={f.required ?? false} onChange={e => updateField(idx, { required: e.target.checked })} className="size-3" />
                                    *
                                </label>
                                <button onClick={() => removeField(idx)} className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                                    <MaterialIcon name="delete" size={16} className="size-3" />
                                </button>
                            </div>
                            {f.type === 'select' && (
                                <SelectOptionsEditor options={f.options ?? []} onChange={opts => updateField(idx, { options: opts })} />
                            )}
                            {/* Phase 7: Auto-Extraktion via Regex */}
                            <div className="ml-12 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span title={t('dms.document_types_settings.regex_zur_automatischen_befuellung_aus_d')}>{t('dms.document_types_settings.auto-extraktion_regex')}</span>
                                <input
                                    value={f.extractionPattern ?? ''}
                                    onChange={e => updateField(idx, { extractionPattern: e.target.value || undefined })}
                                    placeholder={t('dms.document_types_settings.zb_bded20b_oder_rechnungsnummerss')}
                                    className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono"
                                />
                            </div>
                        </li>
                    ))}
                </ul>
                {fields.length === 0 && <p className="py-2 text-center text-[11px] text-muted-foreground italic">{t('dms.document_types_settings.keine_felder_klick_feld_um_eines_hinzuzu')}</p>}
            </div>

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

function SelectOptionsEditor({ options, onChange }: { options: Array<{ value: string; label: string }>; onChange: (opts: Array<{ value: string; label: string }>) => void }): JSX.Element {
    const t = useT();
    const add = () => onChange([...options, { value: '', label: '' }]);
    const remove = (idx: number) => onChange(options.filter((_, i) => i !== idx));
    const update = (idx: number, patch: Partial<{ value: string; label: string }>) =>
        onChange(options.map((o, i) => i === idx ? { ...o, ...patch } : o));

    return (
        <div className="ml-12 space-y-1">
            <p className="text-[10px] text-muted-foreground">{t('dms.document_types_settings.auswahl-optionen')}</p>
            {options.map((o, idx) => (
                <div key={idx} className="flex items-center gap-1">
                    <input value={o.value} onChange={e => update(idx, { value: e.target.value })} placeholder="value" className="w-24 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-mono" />
                    <span className="text-muted-foreground">→</span>
                    <input value={o.label} onChange={e => update(idx, { label: e.target.value })} placeholder={t('dms.document_types_settings.anzeige-label')} className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]" />
                    <button onClick={() => remove(idx)} className="rounded p-0.5 text-muted-foreground hover:bg-muted"><MaterialIcon name="close" size={16} className="size-3" /></button>
                </div>
            ))}
            <button onClick={add} className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] hover:bg-muted">{t('dms.document_types_settings.option')}</button>
        </div>
    );
}
