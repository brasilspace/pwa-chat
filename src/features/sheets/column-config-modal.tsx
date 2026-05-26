/**
 * ColumnConfigModal — Spaltentyp festlegen.
 *
 * Eigentuemer/Bearbeiter waehlen einen Typ (Auswahl/Status/Datum/Zahl/...)
 * und konfigurieren dessen Optionen. Save → Backend persistiert in
 * sheet_columns + Frontend wendet Univer-Data-Validation auf die
 * Spalten-Range an.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { sheetColumnsApi, COLUMN_TYPE_LABELS, DEFAULT_STATUS_OPTIONS, type SheetColumn, type SheetColumnType, type SelectOption } from './use-sheet-columns';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    sheetId: string;
    worksheetId: string;
    columnIndex: number;
    /** Vorhandene Config falls schon gesetzt (zum Bearbeiten). */
    existing?: SheetColumn | null;
    onClose: () => void;
    onSaved: (column: SheetColumn) => void;
    onDeleted?: () => void;
}

const COLUMN_LETTER = (i: number) => {
    let s = '';
    let n = i;
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s;
};

const TYPE_DESCRIPTIONS: Record<SheetColumnType, string> = {
    text: 'Freier Text',
    number: 'Zahlen, optional mit Min/Max',
    date: 'Datums-Picker',
    checkbox: 'Wahr/Falsch',
    select: 'Eine Option aus einer Liste',
    'multi-select': 'Mehrere Optionen aus einer Liste',
    status: 'Status mit Farben (Offen/In Arbeit/...)',
    link: 'URL mit optionalem Anzeigetext',
    person: 'Person aus den Space-Mitgliedern (Phase 2.3)',
    file: 'Datei aus dem DMS (Phase 2.3)',
};

const ENABLED_TYPES: SheetColumnType[] = [
    'text', 'number', 'date', 'checkbox', 'select', 'multi-select', 'status', 'link', 'person', 'file',
];

export function ColumnConfigModal({ sheetId, worksheetId, columnIndex, existing, onClose, onSaved, onDeleted }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [type, setType] = useState<SheetColumnType>(existing?.type ?? 'text');
    const [name, setName] = useState(existing?.name ?? '');
    const [options, setOptions] = useState<SelectOption[]>(
        (existing?.config?.options as SelectOption[] | undefined) ?? [],
    );
    const [numMin, setNumMin] = useState<string>(existing?.config?.min !== undefined ? String(existing.config.min) : '');
    const [numMax, setNumMax] = useState<string>(existing?.config?.max !== undefined ? String(existing.config.max) : '');
    const [busy, setBusy] = useState(false);

    // Wenn Status oder Select gewaehlt aber options leer → Defaults vorbelegen
    const ensureOptions = (forType: SheetColumnType) => {
        if ((forType === 'status' || forType === 'select' || forType === 'multi-select') && options.length === 0) {
            setOptions(forType === 'status' ? [...DEFAULT_STATUS_OPTIONS] : [{ value: '' }]);
        }
    };

    const addOption = () => setOptions([...options, { value: '' }]);
    const updateOption = (i: number, patch: Partial<SelectOption>) => {
        setOptions(options.map((o, idx) => idx === i ? { ...o, ...patch } : o));
    };
    const removeOption = (i: number) => setOptions(options.filter((_, idx) => idx !== i));

    const save = async () => {
        if (!jwt) return;
        setBusy(true);
        try {
            const config: Record<string, unknown> = {};
            if (type === 'select' || type === 'multi-select' || type === 'status') {
                const filtered = options.filter(o => o.value.trim());
                if (filtered.length === 0) { alert('Mindestens eine Option erforderlich'); setBusy(false); return; }
                config.options = filtered;
            }
            if (type === 'number') {
                if (numMin) config.min = Number(numMin);
                if (numMax) config.max = Number(numMax);
            }
            const r = await sheetColumnsApi.upsert(jwt, sheetId, {
                worksheetId,
                columnIndex,
                name: name.trim() || null,
                type,
                config: Object.keys(config).length > 0 ? config : null,
            });
            onSaved(r.column);
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    const remove = async () => {
        if (!jwt || !existing) return;
        if (!confirm(`Spaltentyp fuer Spalte ${COLUMN_LETTER(columnIndex)} entfernen?`)) return;
        setBusy(true);
        try {
            await sheetColumnsApi.delete(jwt, sheetId, existing.id);
            onDeleted?.();
        } catch (e) {
            alert('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="font-semibold">
                        {t('sheets.column_config_modal.spalte')} {COLUMN_LETTER(columnIndex)}{t('sheets.column_config_modal.typ_festlegen')}
                    </h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div>
                        <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.column_config_modal.anzeigename_optional')}</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={`Spalte ${COLUMN_LETTER(columnIndex)}`}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.column_config_modal.typ')}</label>
                        <div className="mt-1 grid grid-cols-2 gap-1">
                            {ENABLED_TYPES.map(_t => (
                                <button
                                    key={_t}
                                    onClick={() => { setType(_t); ensureOptions(_t); }}
                                    className={cn(
                                        'rounded border p-2 text-left text-xs transition-colors',
                                        type === _t ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                                    )}
                                >
                                    <div className="font-medium">{COLUMN_TYPE_LABELS[_t]}</div>
                                    <div className="text-[10px] text-muted-foreground">{TYPE_DESCRIPTIONS[_t]}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Typ-spezifische Konfiguration */}
                    {(type === 'select' || type === 'multi-select' || type === 'status') && (
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.column_config_modal.optionen')}</label>
                            <div className="space-y-1">
                                {options.map((opt, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                        {type === 'status' && (
                                            <input
                                                type="color"
                                                value={opt.color ?? '#9CA3AF'}
                                                onChange={e => updateOption(i, { color: e.target.value })}
                                                className="size-7 rounded border border-border"
                                                title={t('sheets.column_config_modal.farbe')}
                                            />
                                        )}
                                        <input
                                            value={opt.value}
                                            onChange={e => updateOption(i, { value: e.target.value })}
                                            placeholder={t('sheets.column_config_modal.wert')}
                                            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                        <button
                                            onClick={() => removeOption(i)}
                                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        >
                                            <MaterialIcon name="delete" size={16} className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={addOption}
                                    className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                                >
                                    <MaterialIcon name="add" size={16} className="size-3" /> {t('sheets.column_config_modal.option_hinzufuegen')}
                                </button>
                            </div>
                        </div>
                    )}

                    {type === 'number' && (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.column_config_modal.minimum_optional')}</label>
                                <input
                                    type="number"
                                    value={numMin}
                                    onChange={e => setNumMin(e.target.value)}
                                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.column_config_modal.maximum_optional')}</label>
                                <input
                                    type="number"
                                    value={numMax}
                                    onChange={e => setNumMax(e.target.value)}
                                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {type === 'person' && (
                        <p className="rounded bg-muted/30 p-2 text-[11px] text-muted-foreground">
                            {t('sheets.column_config_modal.person-spalte_zeigt_einen_dropdown_mit_a')}
                        </p>
                    )}
                    {type === 'file' && (
                        <p className="rounded bg-muted/30 p-2 text-[11px] text-muted-foreground">
                            {t('sheets.column_config_modal.datei-spalte_in_der_aktiven_zelle_ersche')}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-border p-3">
                    <div>
                        {existing && (
                            <button
                                onClick={remove}
                                disabled={busy}
                                className="rounded border border-border px-3 py-1.5 text-xs text-red-600 hover:bg-destructive/10 disabled:opacity-50"
                            >
                                {t('sheets.column_config_modal.typ_entfernen')}
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs">{t('common.cancel')}</button>
                        <button
                            onClick={save}
                            disabled={busy}
                            className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {busy ? <Loader2 className="size-3 animate-spin inline" /> : t('common.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
