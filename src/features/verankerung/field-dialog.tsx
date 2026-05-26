/**
 * FieldDialog — generischer Formular-Dialog (ersetzt window.prompt).
 * Felder: text | textarea | select, mit Pflicht + bedingter Sichtbarkeit.
 * Verwendet die bestehende Dialog-UI-Komponente (Radix).
 */
import { type JSX, useEffect, useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

export interface FieldDef {
    name: string;
    label: string;
    type?: 'text' | 'textarea' | 'select' | 'date';
    options?: { value: string; label: string }[];
    required?: boolean;
    placeholder?: string;
    help?: string;
    defaultValue?: string;
    /** Feld nur anzeigen/validieren, wenn anderes Feld einen Wert hat. */
    visibleIf?: (values: Record<string, string>) => boolean;
}

interface Props {
    open: boolean;
    title: string;
    description?: string;
    fields: FieldDef[];
    submitLabel?: string;
    busy?: boolean;
    onSubmit: (values: Record<string, string>) => void | Promise<void>;
    onClose: () => void;
}

export function FieldDialog({
    open, title, description, fields, submitLabel = 'Speichern', busy, onSubmit, onClose,
}: Props): JSX.Element {
    const [values, setValues] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            const init: Record<string, string> = {};
            for (const f of fields) init[f.name] = f.defaultValue ?? (f.type === 'select' ? (f.options?.[0]?.value ?? '') : '');
            setValues(init);
            setError(null);
        }
    }, [open, fields]);

    const visible = (f: FieldDef) => !f.visibleIf || f.visibleIf(values);

    const submit = async () => {
        for (const f of fields) {
            if (visible(f) && f.required && !values[f.name]?.trim()) {
                setError(`Pflichtfeld: ${f.label}`);
                return;
            }
        }
        setError(null);
        await onSubmit(values);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <div className="space-y-3">
                    {fields.filter(visible).map(f => (
                        <div key={f.name}>
                            <label className="mb-1 block text-[12px] font-medium">{f.label}{f.required ? ' *' : ''}</label>
                            {f.type === 'select' ? (
                                <select
                                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]"
                                    value={values[f.name] ?? ''}
                                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}>
                                    {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            ) : f.type === 'textarea' ? (
                                <textarea
                                    className="min-h-[72px] w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]"
                                    placeholder={f.placeholder}
                                    value={values[f.name] ?? ''}
                                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))} />
                            ) : (
                                <input
                                    type={f.type === 'date' ? 'date' : 'text'}
                                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]"
                                    placeholder={f.placeholder}
                                    value={values[f.name] ?? ''}
                                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))} />
                            )}
                            {f.help && <p className="mt-1 text-[11px] text-muted-foreground">{f.help}</p>}
                        </div>
                    ))}
                    {error && <p className="text-[12px] text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <button onClick={onClose} disabled={busy}
                        className="rounded-lg border px-3 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50">Abbrechen</button>
                    <button onClick={() => void submit()} disabled={busy}
                        className="rounded-lg bg-primary px-3 py-1.5 text-[12px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                        {submitLabel}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
