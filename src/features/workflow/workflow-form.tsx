/**
 * WorkflowForm — Dynamisches Formular fuer Form-Nodes
 *
 * Rendert Felder basierend auf dem formSchema des Nodes.
 * Unterstuetzte Feldtypen: text, textarea, richtext, number, date,
 * datetime, select, multiselect, checkbox, file, rating, user_picker, space_picker
 */

import { useState, useCallback } from 'react';
import { ClipboardList, Send, X, Star, Upload, Check } from 'lucide-react';
import type { WorkflowCheckpoint, WorkflowRun } from './workflow-types';
import { createWorkflowGateway } from './workflow-gateway';
import { useT } from "@/lib/i18n/use-t";

const gateway = createWorkflowGateway();

interface FormField {
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    helpText?: string;
    options?: Array<{ value: string; label: string } | string>;
    validation?: { min?: number; max?: number; pattern?: string };
    writesToVariable?: string;
}

interface WorkflowFormProps {
    run: WorkflowRun;
    checkpoint: WorkflowCheckpoint;
    formSchema: FormField[];
    jwt: string;
    onSubmitted: () => void;
    onCancel: () => void;
}

export function WorkflowForm({ run, checkpoint, formSchema, jwt, onSubmitted, onCancel }: WorkflowFormProps) {
    const t = useT();
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const setValue = (key: string, value: unknown) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    };

    const isValid = formSchema.every((field) => {
        if (!field.required) return true;
        const val = values[field.key];
        if (val === undefined || val === null || val === '') return false;
        return true;
    });

    const handleSubmit = useCallback(async () => {
        if (!isValid || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            await gateway.submitForm(jwt, run.id, checkpoint.nodeId, values);
            onSubmitted();
        } catch (err: any) {
            setError(err.message ?? 'Formular konnte nicht gesendet werden.');
        } finally {
            setSubmitting(false);
        }
    }, [jwt, run.id, checkpoint.nodeId, values, isValid, submitting, onSubmitted]);

    return (
        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
                        <ClipboardList size={16} className="text-teal-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">{checkpoint.title}</h3>
                        {checkpoint.description && (
                            <p className="text-xs text-[var(--muted-foreground)]">{checkpoint.description}</p>
                        )}
                    </div>
                </div>
                <button onClick={onCancel} className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
                    <X size={16} />
                </button>
            </div>

            {/* Form fields */}
            <div className="flex flex-col gap-4 px-5 py-4">
                {formSchema.map((field) => (
                    <FormFieldRenderer
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(val) => setValue(field.key, val)}
                    />
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
                <button
                    onClick={onCancel}
                    className="rounded-md px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                >
                    {t('workflow.workflow_form.abbrechen')}
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!isValid || submitting}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                    <Send size={14} />
                    {submitting ? 'Wird gesendet...' : 'Absenden'}
                </button>
            </div>
        </div>
    );
}

// ─── Field Renderer ──────────────────────────────────────────────────────────

function FormFieldRenderer({
    field, value, onChange,
}: {
    field: FormField;
    value: unknown;
    onChange: (val: unknown) => void;
}) {
    const t = useT();
    const inputClass = 'w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]';

    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                {field.label}
                {field.required && <span className="ml-1 text-red-500">*</span>}
            </label>

            {field.type === 'text' && (
                <input
                    type="text"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    className={inputClass}
                />
            )}

            {field.type === 'textarea' && (
                <textarea
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                    className={inputClass}
                />
            )}

            {field.type === 'richtext' && (
                <textarea
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    rows={6}
                    className={inputClass + ' font-serif'}
                />
            )}

            {field.type === 'number' && (
                <input
                    type="number"
                    value={value !== undefined && value !== null ? Number(value) : ''}
                    onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
                    min={field.validation?.min}
                    max={field.validation?.max}
                    placeholder={field.placeholder}
                    className={inputClass}
                />
            )}

            {field.type === 'date' && (
                <input
                    type="date"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputClass}
                />
            )}

            {field.type === 'datetime' && (
                <input
                    type="datetime-local"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputClass}
                />
            )}

            {field.type === 'select' && (
                <select
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputClass}
                >
                    <option value="">{t('workflow.workflow_form.bitte_waehlen')}</option>
                    {field.options?.map((opt) => {
                        const optValue = typeof opt === 'string' ? opt : opt.value;
                        const optLabel = typeof opt === 'string' ? opt : opt.label;
                        return <option key={optValue} value={optValue}>{optLabel}</option>;
                    })}
                </select>
            )}

            {field.type === 'multiselect' && (
                <div className="flex flex-wrap gap-2">
                    {field.options?.map((opt) => {
                        const optValue = typeof opt === 'string' ? opt : opt.value;
                        const optLabel = typeof opt === 'string' ? opt : opt.label;
                        const selected = Array.isArray(value) && value.includes(optValue);
                        return (
                            <button
                                key={optValue}
                                type="button"
                                onClick={() => {
                                    const arr = Array.isArray(value) ? [...value] : [];
                                    if (selected) onChange(arr.filter((v) => v !== optValue));
                                    else onChange([...arr, optValue]);
                                }}
                                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${selected
                                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                                        : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                                    }`}
                            >
                                {selected && <Check size={10} />}
                                {optLabel}
                            </button>
                        );
                    })}
                </div>
            )}

            {field.type === 'checkbox' && (
                <label className="flex items-center gap-2.5">
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-[var(--border)]"
                    />
                    <span className="text-sm text-[var(--foreground)]">{field.placeholder ?? field.label}</span>
                </label>
            )}

            {field.type === 'rating' && (
                <RatingField
                    value={Number(value ?? 0)}
                    max={field.validation?.max ?? 5}
                    onChange={(v) => onChange(v)}
                />
            )}

            {field.type === 'file' && (
                <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
                        <Upload size={14} />
                        {t('workflow.workflow_form.datei_waehlen')}
                        <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onChange(file.name);
                            }}
                        />
                    </label>
                    {value != null && <span className="text-xs text-[var(--foreground)]">{String(value)}</span>}
                </div>
            )}

            {field.type === 'signature' && (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center">
                    <label className="flex cursor-pointer flex-col items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
                        {value ? (
                            <>
                                <Check size={20} className="text-emerald-500" />
                                <span className="text-emerald-600">{t('workflow.workflow_form.unterschrieben')} {String(value)}</span>
                            </>
                        ) : (
                            <>
                                <span>{t('workflow.workflow_form.klicke_hier_um_digital_zu_unterschreiben')}</span>
                                <input
                                    type="text"
                                    placeholder={t('workflow.workflow_form.vollstaendiger_name_als_unterschrift')}
                                    className={inputClass + ' mt-2 text-center'}
                                    onBlur={(e) => { if (e.target.value.trim()) onChange(e.target.value.trim()); }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = (e.target as HTMLInputElement).value.trim();
                                            if (val) onChange(val);
                                        }
                                    }}
                                />
                            </>
                        )}
                    </label>
                </div>
            )}

            {/* Fallback for unknown types */}
            {!['text', 'textarea', 'richtext', 'number', 'date', 'datetime', 'select', 'multiselect', 'checkbox', 'rating', 'file', 'signature', 'user_picker', 'space_picker'].includes(field.type) && (
                <input
                    type="text"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    className={inputClass}
                />
            )}

            {field.helpText && field.type !== 'checkbox' && (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{field.helpText}</p>
            )}
        </div>
    );
}

// ─── Rating Stars ────────────────────────────────────────────────────────────

function RatingField({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
    const [hover, setHover] = useState(0);

    return (
        <div className="flex gap-1">
            {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star)}
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    className="rounded p-0.5 transition-colors"
                >
                    <Star
                        size={22}
                        className={
                            star <= (hover || value)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-[var(--muted-foreground)]'
                        }
                    />
                </button>
            ))}
            {value > 0 && (
                <span className="ml-2 self-center text-xs text-[var(--muted-foreground)]">{value}/{max}</span>
            )}
        </div>
    );
}
