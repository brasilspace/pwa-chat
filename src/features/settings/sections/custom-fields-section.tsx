/**
 * CustomFieldsSection — Tenant-Admin definiert eigene Personen-Felder.
 * CRM-Foundation Phase B.5. Flag-gated (crm_foundation_v2).
 */
import { type JSX, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useT } from '@/lib/i18n/use-t';
import { fieldDefinitionsGateway, type FieldDef, type FieldType } from '@/gateways/platform/field-definitions-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';

const TYPES: FieldType[] = [
    'TEXT', 'LONGTEXT', 'NUMBER', 'DATE', 'DATETIME', 'BOOLEAN',
    'SELECT', 'MULTISELECT', 'EMAIL', 'PHONE', 'URL', 'CURRENCY',
];

export function CustomFieldsSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [fields, setFields] = useState<FieldDef[]>([]);
    const [crmV2, setCrmV2] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Partial<FieldDef> | null>(null);
    const [saving, setSaving] = useState(false);

    const reload = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const r = await fieldDefinitionsGateway.list(jwt);
            setFields(r.fields);
            setCrmV2(r.crmV2);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('common.error'));
        } finally {
            setLoading(false);
        }
        // t bewusst NICHT in deps: useT() liefert pro Render eine neue
        // Funktion → sonst Endlos-Reload-Schleife (Liste flimmert).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt]);

    useEffect(() => { void reload(); }, [reload]);

    const save = async () => {
        if (!jwt || !editing) return;
        setSaving(true);
        try {
            const labelDe = (editing.label?.de ?? '').trim();
            if (!labelDe) throw new Error(t('settings.custom_fields.label_required'));
            const payload = {
                key: editing.key,
                label: editing.label ?? { de: labelDe },
                type: editing.type ?? 'TEXT',
                required: editing.required ?? false,
                options: editing.options ?? {},
                sortOrder: editing.sortOrder ?? (fields.length + 1) * 10,
            };
            if (editing.id) {
                await fieldDefinitionsGateway.update(jwt, editing.id, payload);
            } else {
                await fieldDefinitionsGateway.create(jwt, payload);
            }
            setEditing(null);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : t('common.error'));
        } finally {
            setSaving(false);
        }
    };

    const deprecate = async (f: FieldDef) => {
        if (!jwt || !window.confirm(t('settings.custom_fields.confirm_deprecate'))) return;
        try {
            await fieldDefinitionsGateway.deprecate(jwt, f.id);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : t('common.error'));
        }
    };

    if (loading) return <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>;

    if (crmV2 === false) {
        return (
            <div className="p-4">
                <h2 className="form-section-title">{t('settings.custom_fields.title')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t('settings.custom_fields.not_available')}</p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="form-section-title">{t('settings.custom_fields.title')}</h2>
            <p className="form-description">{t('settings.custom_fields.description')}</p>

            {error && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="mt-4 space-y-2">
                {fields.filter(f => !f.deprecated).map(f => (
                    <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <MaterialIcon name="label" size={16} className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{f.label.de ?? f.key}</div>
                            <div className="text-xs text-muted-foreground">
                                <code>{f.key}</code> · {f.type}{f.required ? ` · ${t('settings.custom_fields.required')}` : ''}
                            </div>
                        </div>
                        <button onClick={() => setEditing(f)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={t('common.edit')}>
                            <MaterialIcon name="edit" size={16} />
                        </button>
                        <button onClick={() => deprecate(f)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title={t('common.delete')}>
                            <MaterialIcon name="delete" size={16} />
                        </button>
                    </div>
                ))}
            </div>

            <button
                onClick={() => setEditing({ type: 'TEXT', label: { de: '' } })}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
                <MaterialIcon name="add" size={16} /> {t('settings.custom_fields.add')}
            </button>

            {editing && (
                <div className="mt-4 rounded-xl border border-border bg-card p-4 space-y-3">
                    <div>
                        <label className="text-xs font-medium text-muted-foreground">{t('settings.custom_fields.label_de')}</label>
                        <input
                            value={editing.label?.de ?? ''}
                            onChange={e => setEditing({ ...editing, label: { ...editing.label, de: e.target.value } })}
                            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
                            placeholder="z.B. Allergien"
                        />
                    </div>
                    {!editing.id && (
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">{t('settings.custom_fields.key')}</label>
                            <input
                                value={editing.key ?? ''}
                                onChange={e => setEditing({ ...editing, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                                className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono"
                                placeholder="allergien"
                            />
                        </div>
                    )}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground">{t('settings.custom_fields.type')}</label>
                        <select
                            value={editing.type ?? 'TEXT'}
                            onChange={e => setEditing({ ...editing, type: e.target.value as FieldType })}
                            disabled={!!editing.id}
                            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
                        >
                            {TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                        </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={editing.required ?? false} onChange={e => setEditing({ ...editing, required: e.target.checked })} />
                        {t('settings.custom_fields.required')}
                    </label>
                    <div className="flex gap-2">
                        <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                        <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
