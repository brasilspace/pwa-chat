/**
 * GenericPropertiesForm — rendert ein Component-Properties-Panel
 * automatisch aus dem PropertyField[]-Schema (geliefert vom Backend
 * mit jedem ComponentKind.designer.propertiesSchema).
 *
 * So muessen Apps Components nur EINMAL deklarieren (mit Schema), dann
 * funktioniert der Editor — kein React-Code pro Kind in flows-editor
 * oder guide-editor.
 *
 * Drittanbieter-Apps profitieren genauso: Manifest mit Schema → Editor
 * laeuft ohne Frontend-Aenderung.
 */
import { useState, type JSX } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import type { PropertyField, ProcessComponent } from './flows-gateway';
import { FilePickerDialog } from './file-picker-dialog';
import { isPrilogFileLink } from '@/lib/prilog-link';

interface Props {
    component: ProcessComponent;
    schema: PropertyField[];
    onChange: (patch: Record<string, unknown>) => void;
    /** Liste aller Bildschirme im Template — fuer 'screen-ref'-Felder. */
    screensForRef?: Array<{ id: string; label: string }>;
}

export function GenericPropertiesForm({ component, schema, onChange, screensForRef = [] }: Props): JSX.Element {
    const cfg = (component.config ?? {}) as Record<string, unknown>;

    return (
        <div className="space-y-3">
            {schema.map(field => (
                <Field
                    key={field.key}
                    field={field}
                    value={cfg[field.key]}
                    onChange={(v) => onChange({ [field.key]: v })}
                    screensForRef={screensForRef}
                />
            ))}
        </div>
    );
}

function Field({ field, value, onChange, screensForRef }: {
    field: PropertyField;
    value: unknown;
    onChange: (v: unknown) => void;
    screensForRef: Array<{ id: string; label: string }>;
}): JSX.Element {
    const t = useT();
    const helpText = 'helpText' in field && field.helpText ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{field.helpText}</p>
    ) : null;

    if (field.type === 'text') {
        return (
            <div>
                <Label label={field.label} required={field.required} />
                <input
                    value={(value as string) ?? ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                {helpText}
            </div>
        );
    }

    if (field.type === 'longtext') {
        return (
            <div>
                <Label label={field.label} />
                <textarea
                    value={(value as string) ?? ''}
                    onChange={e => onChange(e.target.value)}
                    rows={field.rows ?? 3}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                {helpText}
            </div>
        );
    }

    if (field.type === 'number') {
        return (
            <div>
                <Label label={field.label} />
                <input
                    type="number"
                    value={(value as number) ?? ''}
                    onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                {helpText}
            </div>
        );
    }

    if (field.type === 'boolean') {
        return (
            <label className="flex items-center gap-2 text-xs">
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={e => onChange(e.target.checked)}
                    className="size-3.5 rounded border-border"
                />
                {field.label}
                {helpText}
            </label>
        );
    }

    if (field.type === 'select') {
        return (
            <div>
                <Label label={field.label} />
                <select
                    value={(value as string) ?? field.options[0]?.value ?? ''}
                    onChange={e => onChange(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                >
                    {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {helpText}
            </div>
        );
    }

    if (field.type === 'string-array') {
        return <StringArrayField label={field.label} placeholder={field.placeholder} value={(value as string[]) ?? []} onChange={onChange as (v: string[]) => void} />;
    }

    if (field.type === 'choice-options') {
        return <ChoiceOptionsField label={field.label} value={(value as Array<{ label: string; value: string }>) ?? []} onChange={onChange as (v: Array<{ label: string; value: string }>) => void} />;
    }

    if (field.type === 'screen-ref') {
        return (
            <div>
                <Label label={field.label} />
                <select
                    value={(value as string) ?? ''}
                    onChange={e => onChange(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                >
                    <option value="">{t('flows.generic_properties_form.kein_ziel')}</option>
                    {screensForRef.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                {helpText}
            </div>
        );
    }

    if (field.type === 'json') {
        const stringValue = value === undefined ? '' : JSON.stringify(value, null, 2);
        return (
            <div>
                <Label label={field.label} />
                <textarea
                    value={stringValue}
                    onChange={e => {
                        try {
                            onChange(e.target.value === '' ? undefined : JSON.parse(e.target.value));
                        } catch {
                            // ungueltig — wir lassen den User weiter tippen
                        }
                    }}
                    rows={field.rows ?? 4}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-mono"
                />
                {helpText}
            </div>
        );
    }

    if (field.type === 'color') {
        return (
            <div>
                <Label label={field.label} />
                <input
                    type="color"
                    value={(value as string) ?? '#000000'}
                    onChange={e => onChange(e.target.value)}
                    className="h-8 w-full rounded-md border border-border"
                />
                {helpText}
            </div>
        );
    }

    if (field.type === 'file-url') {
        return <FileUrlField field={field} value={value as string ?? ''} onChange={onChange} />;
    }

    return <></>;
}

function FileUrlField({ field, value, onChange }: {
    field: Extract<PropertyField, { type: 'file-url' }>;
    value: string;
    onChange: (v: unknown) => void;
}): JSX.Element {
    const t = useT();
    const [pickerOpen, setPickerOpen] = useState(false);
    const isPrilog = isPrilogFileLink(value);
    const isExternal = !!value && !isPrilog;

    return (
        <div>
            <Label label={field.label} />
            <div className="flex gap-1">
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={field.placeholder ?? 'https://...'}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
                />
                <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="rounded-md border border-border bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
                    title={t('flows.generic_properties_form.aus_dms_waehlen')}
                >
                    <MaterialIcon name="attach_file" size={16} className="size-3" />
                    {t('flows.generic_properties_form.aus_dms')}
                </button>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
                        title={t('flows.generic_properties_form.leeren')}
                    >
                        <MaterialIcon name="delete" size={16} className="size-3" />
                    </button>
                )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px]">
                {isPrilog && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{t('flows.generic_properties_form.interner_prilog-link')}</span>}
                {isExternal && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><MaterialIcon name="open_in_new" size={16} className="size-2.5" /> {t('flows.generic_properties_form.externe_url')}</span>}
                {!value && <span className="text-muted-foreground">{t('flows.generic_properties_form.noch_nichts_gesetzt')}</span>}
            </div>
            {field.helpText && <p className="mt-1 text-[10px] text-muted-foreground">{field.helpText}</p>}

            {pickerOpen && (
                <FilePickerDialog
                    onlyImages={field.key === 'url'}
                    onClose={() => setPickerOpen(false)}
                    onSelect={(link) => {
                        onChange(link);
                        setPickerOpen(false);
                    }}
                />
            )}
        </div>
    );
}

function Label({ label, required }: { label: string; required?: boolean }) {
    return (
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}{required && <span className="ml-1 text-red-500">*</span>}
        </label>
    );
}

// ─── String-Array ──────────────────────────────────────────────────────────

function StringArrayField({ label, value, onChange, placeholder }: {
    label: string;
    value: string[];
    onChange: (v: string[]) => void;
    placeholder?: string;
}) {
    const [draft, setDraft] = useState('');
    return (
        <div>
            <Label label={label} />
            <div className="space-y-1">
                {value.map((item, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <input
                            value={item}
                            onChange={e => { const c = [...value]; c[i] = e.target.value; onChange(c); }}
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                        />
                        <button
                            onClick={() => onChange(value.filter((_, j) => j !== i))}
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                        >
                            <MaterialIcon name="delete" size={16} className="size-3" />
                        </button>
                    </div>
                ))}
                <div className="flex items-center gap-1">
                    <input
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && draft.trim()) {
                                onChange([...value, draft.trim()]);
                                setDraft('');
                            }
                        }}
                        placeholder={placeholder}
                        className="flex-1 rounded-md border border-dashed border-border bg-background px-2 py-1 text-xs"
                    />
                    <button
                        onClick={() => { if (draft.trim()) { onChange([...value, draft.trim()]); setDraft(''); } }}
                        className="rounded-md bg-blue-600 p-1 text-white hover:bg-blue-700"
                    >
                        <MaterialIcon name="add" size={16} className="size-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Choice-Options ─────────────────────────────────────────────────────────

function ChoiceOptionsField({ label, value, onChange }: {
    label: string;
    value: Array<{ label: string; value: string }>;
    onChange: (v: Array<{ label: string; value: string }>) => void;
}) {
    const t = useT();
    return (
        <div>
            <Label label={label} />
            <div className="space-y-1.5">
                {value.map((o, i) => (
                    <div key={i} className="space-y-1 rounded-md border border-border p-2">
                        <input
                            value={o.label}
                            onChange={e => { const c = [...value]; c[i] = { ...c[i], label: e.target.value }; onChange(c); }}
                            placeholder={t('flows.generic_properties_form.label_was_der_user_sieht')}
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                        />
                        <div className="flex gap-1">
                            <input
                                value={o.value}
                                onChange={e => { const c = [...value]; c[i] = { ...c[i], value: e.target.value }; onChange(c); }}
                                placeholder={t('flows.generic_properties_form.wert_intern')}
                                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[10px]"
                            />
                            <button
                                onClick={() => onChange(value.filter((_, j) => j !== i))}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                            >
                                <MaterialIcon name="delete" size={16} className="size-3" />
                            </button>
                        </div>
                    </div>
                ))}
                <button
                    onClick={() => onChange([...value, { label: '', value: `opt${value.length + 1}` }])}
                    className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                    <MaterialIcon name="add" size={16} className="size-3" /> {t('flows.generic_properties_form.option_hinzufuegen')}
                </button>
            </div>
        </div>
    );
}

// ─── Lucide-Icon-Lookup ────────────────────────────────────────────────────

import {
    Smartphone, Type as TypeIcon, AlignLeft, Image as ImageIcon, MousePointer2,
    ListChecks, Phone, Film, MessageSquare, AlertTriangle, Webhook, Calendar,
    Globe, Database, ListTodo, Repeat, Mail, Workflow, GitBranch, Hash, Zap,
    BookOpen,
} from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

const ICON_MAP: Record<string, typeof Smartphone> = {
    'smartphone': Smartphone,
    'type': TypeIcon,
    'align-left': AlignLeft,
    'image': ImageIcon,
    'mouse-pointer-2': MousePointer2,
    'list-checks': ListChecks,
    'phone': Phone,
    'film': Film,
    'message-square': MessageSquare,
    'alert-triangle': AlertTriangle,
    'webhook': Webhook,
    'calendar': Calendar,
    'globe': Globe,
    'database': Database,
    'list-todo': ListTodo,
    'repeat': Repeat,
    'mail': Mail,
    'workflow': Workflow,
    'git-branch': GitBranch,
    'hash': Hash,
    'zap': Zap,
    'book-open': BookOpen,
};

export function iconForKind(iconName: string | undefined): typeof Smartphone {
    if (!iconName) return Hash;
    return ICON_MAP[iconName] ?? Hash;
}

const COLOR_TOKENS: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 border-blue-300',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    red: 'bg-red-100 text-red-700 border-red-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300',
    violet: 'bg-violet-100 text-violet-700 border-violet-300',
    pink: 'bg-pink-100 text-pink-700 border-pink-300',
    rose: 'bg-rose-100 text-rose-700 border-rose-300',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    zinc: 'bg-zinc-100 text-zinc-700 border-zinc-300',
    gray: 'bg-gray-100 text-gray-700 border-gray-300',
    purple: 'bg-purple-100 text-purple-700 border-purple-300',
};

export function colorClassForKind(color: string | undefined): string {
    if (!color) return COLOR_TOKENS.gray;
    return COLOR_TOKENS[color] ?? COLOR_TOKENS.gray;
}
