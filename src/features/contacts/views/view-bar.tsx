/**
 * ViewBar — Ansichts-Selektor + Builder (CRM-Foundation C.5).
 *
 * Additiv ÜBER den bestehenden Quick-Filtern des Hubs (D18): wählt eine
 * gespeicherte ViewDefinition, legt neue an (USER / SHARED=Admin),
 * klont SYSTEM/SHARED, löscht eigene. Anwenden passiert im Hub via
 * view-engine. Bewusst simpel: Filter = Feld/Op/Wert-Zeilen, keine
 * verschachtelte Boolean-Logik.
 */
import { type JSX, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/use-t';
import { viewDefinitionsGateway } from '@/gateways/platform/view-definitions-gateway';
import { fieldDefinitionsGateway, type FieldDef } from '@/gateways/platform/field-definitions-gateway';
import type { ViewDef, ViewFilter, FilterOp, ViewType } from '@/lib/view-engine';

const CORE_FIELDS: { key: string; label: string }[] = [
    { key: 'displayName', label: 'Name' },
    { key: 'primaryEmail', label: 'E-Mail' },
    { key: 'primaryPhone', label: 'Telefon' },
    { key: 'userType', label: 'Benutzertyp' },
    { key: 'userTypeKey', label: 'Benutzertyp (Schlüssel)' },
    { key: 'source', label: 'Quelle (member/person/organization)' },
    { key: 'active', label: 'Aktiv' },
    { key: 'organization', label: 'Organisation' },
    { key: 'birthDate', label: 'Geburtsdatum' },
];
const OPS: FilterOp[] = ['eq', 'neq', 'contains', 'gt', 'lt', 'in', 'exists'];

function fieldOptions(fields: FieldDef[]): { key: string; label: string }[] {
    return [
        ...CORE_FIELDS,
        ...fields.map(f => ({ key: `cf:${f.key}`, label: (f.label.de ?? f.key) + ' (Feld)' })),
    ];
}

export function ViewBar({
    jwt, activeViewId, onSelect, isAdmin,
}: {
    jwt: string;
    activeViewId: string | null;
    onSelect: (view: ViewDef | null) => void;
    isAdmin: boolean;
}): JSX.Element | null {
    const t = useT();
    const [views, setViews] = useState<ViewDef[]>([]);
    const [crmV2, setCrmV2] = useState<boolean | null>(null);
    const [fields, setFields] = useState<FieldDef[]>([]);
    const [open, setOpen] = useState(false);
    const [editor, setEditor] = useState<ViewDef | 'new' | null>(null);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const reload = () => viewDefinitionsGateway.list(jwt).then(r => {
        setCrmV2(r.crmV2);
        setViews(r.views ?? []);
        setLoadErr(null);
    }).catch((e: unknown) => {
        // Fetch-Fehler NICHT verschlucken (sonst verschwindet der Selektor
        // kommentarlos). crmV2=false ≠ "Endpoint kaputt".
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[view-bar] views list failed:', msg);
        setLoadErr(msg);
    });

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [jwt]);
    useEffect(() => {
        fieldDefinitionsGateway.list(jwt)
            .then(r => setFields(r.fields ?? []))
            .catch((e: unknown) => console.error('[view-bar] field-defs failed:', e));
    }, [jwt]);
    useEffect(() => {
        if (activeViewId == null) return;
        const v = views.find(x => x.id === activeViewId) ?? null;
        if (v) onSelect(v);
        // eslint-disable-next-line
    }, [views]);

    if (loadErr) {
        return (
            <button type="button"
                onClick={() => { setLoadErr(null); reload(); }}
                className="flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 text-[12px] text-destructive hover:bg-destructive/10"
                title={`${loadErr} — ${t('contacts.views.retry', { defaultValue: 'Klicken zum erneut Versuchen' })}`}>
                <MaterialIcon name="refresh" size={14} />
                {t('contacts.views.load_failed', { defaultValue: 'Ansichten nicht ladbar' })}
            </button>
        );
    }
    if (crmV2 === false || crmV2 === null) return null;

    const active = views.find(v => v.id === activeViewId) ?? null;

    return (
        <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative">
                <button type="button" onClick={() => setOpen(o => !o)}
                    className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[13px]',
                        active ? 'text-primary' : 'text-muted-foreground')}
                    aria-haspopup="menu" aria-expanded={open}>
                    <MaterialIcon name="table_view" size={15} />
                    <span className="max-w-[140px] truncate">{active ? active.name : t('contacts.views.all', { defaultValue: 'Alle' })}</span>
                    <MaterialIcon name="expand_more" size={14} />
                </button>
                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <div className="absolute left-0 top-full z-50 mt-0.5 w-64 rounded border bg-background py-1 shadow-md">
                            <button onClick={() => { onSelect(null); setOpen(false); }}
                                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted',
                                    !active && 'text-primary')}>
                                <MaterialIcon name="list" size={14} />
                                {t('contacts.views.all', { defaultValue: 'Alle Kontakte' })}
                            </button>
                            {(['SYSTEM', 'SHARED', 'USER'] as const).map(grp => {
                                const grpViews = views.filter(v => v.ownerType === grp);
                                if (grpViews.length === 0) return null;
                                return (
                                    <div key={grp}>
                                        <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {grp === 'SYSTEM' ? 'System' : grp === 'SHARED' ? 'Geteilt' : 'Persönlich'}
                                        </div>
                                        {grpViews.map(v => (
                                            <button key={v.id} onClick={() => { onSelect(v); setOpen(false); }}
                                                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted',
                                                    active?.id === v.id && 'text-primary')}>
                                                <MaterialIcon name={v.viewType === 'KANBAN' ? 'view_kanban' : 'table_rows'} size={14} />
                                                <span className="flex-1 truncate">{v.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                            <div className="my-1 border-t" />
                            <button onClick={() => { setEditor('new'); setOpen(false); }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                                <MaterialIcon name="add" size={14} className="text-emerald-500" />
                                {t('contacts.views.new', { defaultValue: 'Neue Ansicht…' })}
                            </button>
                        </div>
                    </>
                )}
            </div>
            {active && (
                <>
                    <button type="button" title="Duplizieren"
                        onClick={async () => { const r = await viewDefinitionsGateway.clone(jwt, active.id); await reload(); onSelect(r.view); }}
                        className="inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground">
                        <MaterialIcon name="content_copy" size={15} />
                    </button>
                    {active.ownerType !== 'SYSTEM' && (
                        <>
                            <button type="button" title="Bearbeiten" onClick={() => setEditor(active)}
                                className="inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground">
                                <MaterialIcon name="edit" size={15} />
                            </button>
                            <button type="button" title="Löschen"
                                onClick={async () => { if (!confirm(`Ansicht "${active.name}" löschen?`)) return; await viewDefinitionsGateway.remove(jwt, active.id); onSelect(null); await reload(); }}
                                className="inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-destructive">
                                <MaterialIcon name="delete" size={15} />
                            </button>
                        </>
                    )}
                </>
            )}
            {editor && (
                <ViewEditor
                    jwt={jwt}
                    isAdmin={isAdmin}
                    fieldOpts={fieldOptions(fields)}
                    initial={editor === 'new' ? null : editor}
                    onClose={() => setEditor(null)}
                    onSaved={async (v) => { setEditor(null); await reload(); onSelect(v); }}
                />
            )}
        </div>
    );
}

function ViewEditor({
    jwt, isAdmin, fieldOpts, initial, onClose, onSaved,
}: {
    jwt: string;
    isAdmin: boolean;
    fieldOpts: { key: string; label: string }[];
    initial: ViewDef | null;
    onClose: () => void;
    onSaved: (v: ViewDef) => void;
}): JSX.Element {
    const [name, setName] = useState(initial?.name ?? '');
    const [ownerType, setOwnerType] = useState<'USER' | 'SHARED'>(
        (initial?.ownerType as 'USER' | 'SHARED') ?? 'USER',
    );
    const [viewType, setViewType] = useState<ViewType>(initial?.viewType ?? 'TABLE');
    const [groupBy, setGroupBy] = useState<string>(initial?.groupBy ?? '');
    const [cols, setCols] = useState<string[]>(
        (initial?.columns ?? []).map(c => c.key).filter(Boolean) as string[],
    );
    const [filters, setFilters] = useState<ViewFilter[]>(initial?.filters ?? []);
    const [err, setErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const toggleCol = (k: string) =>
        setCols(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k]);

    const save = async () => {
        if (!name.trim()) { setErr('Name fehlt'); return; }
        setSaving(true); setErr(null);
        try {
            const payload = {
                name: name.trim(),
                ownerType,
                viewType,
                groupBy: viewType === 'KANBAN' && groupBy ? groupBy : null,
                columns: cols.map(k => ({ key: k })),
                filters: filters.filter(f => f.field),
                sort: initial?.sort ?? [],
            };
            const r = initial
                ? await viewDefinitionsGateway.update(jwt, initial.id, payload)
                : await viewDefinitionsGateway.create(jwt, payload);
            onSaved(r.view);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg border bg-background p-5 shadow-xl"
                onClick={e => e.stopPropagation()}>
                <h2 className="mb-3 text-sm font-semibold">{initial ? 'Ansicht bearbeiten' : 'Neue Ansicht'}</h2>
                {err && <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">{err}</div>}

                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                    className="mb-3 w-full rounded border border-input bg-background px-2 py-1.5 text-[13px]" />

                <div className="mb-3 flex gap-3">
                    {!initial && (
                        <div className="flex-1">
                            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Sichtbarkeit</label>
                            <select value={ownerType} onChange={e => setOwnerType(e.target.value as 'USER' | 'SHARED')}
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-[13px]">
                                <option value="USER">Persönlich (nur ich)</option>
                                {isAdmin && <option value="SHARED">Geteilt (alle)</option>}
                            </select>
                        </div>
                    )}
                    <div className="flex-1">
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Typ</label>
                        <select value={viewType} onChange={e => setViewType(e.target.value as ViewType)}
                            className="w-full rounded border border-input bg-background px-2 py-1.5 text-[13px]">
                            <option value="TABLE">Tabelle</option>
                            <option value="KANBAN">Kanban (gruppiert)</option>
                        </select>
                    </div>
                </div>

                {viewType === 'KANBAN' && (
                    <div className="mb-3">
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Gruppieren nach</label>
                        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1.5 text-[13px]">
                            <option value="">—</option>
                            {fieldOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                    </div>
                )}

                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Spalten</label>
                <div className="mb-3 flex flex-wrap gap-1.5">
                    {fieldOpts.map(o => (
                        <button key={o.key} type="button" onClick={() => toggleCol(o.key)}
                            className={cn('rounded-full border px-2 py-0.5 text-[11px]',
                                cols.includes(o.key) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>
                            {o.label}
                        </button>
                    ))}
                </div>

                <div className="mb-1 flex items-center justify-between">
                    <label className="text-[11px] font-medium text-muted-foreground">Filter</label>
                    <button type="button" onClick={() => setFilters(f => [...f, { field: fieldOpts[0].key, op: 'eq', value: '' }])}
                        className="text-[11px] text-primary hover:underline">+ Filter</button>
                </div>
                <div className="mb-4 space-y-1.5">
                    {filters.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <select value={f.field} onChange={e => setFilters(fs => fs.map((x, j) => j === i ? { ...x, field: e.target.value } : x))}
                                className="flex-1 rounded border border-input bg-background px-1.5 py-1 text-[12px]">
                                {fieldOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                            <select value={f.op} onChange={e => setFilters(fs => fs.map((x, j) => j === i ? { ...x, op: e.target.value as FilterOp } : x))}
                                className="rounded border border-input bg-background px-1.5 py-1 text-[12px]">
                                {OPS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <input value={String(f.value ?? '')} placeholder="Wert"
                                onChange={e => setFilters(fs => fs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                                className="w-24 rounded border border-input bg-background px-1.5 py-1 text-[12px]" />
                            <button type="button" onClick={() => setFilters(fs => fs.filter((_, j) => j !== i))}
                                className="text-muted-foreground hover:text-destructive">
                                <MaterialIcon name="close" size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-[12px]">Abbrechen</button>
                    <button onClick={save} disabled={saving}
                        className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {saving ? 'Speichern…' : 'Speichern'}
                    </button>
                </div>
            </div>
        </div>
    );
}
