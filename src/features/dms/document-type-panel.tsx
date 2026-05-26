/**
 * DocumentTypePanel — im Doc-Detail: Type-Picker + Custom-Field-Form.
 *
 * Falls Tenant Document-Types definiert hat: Picker zeigt alle Types,
 * Auswahl loest Custom-Field-Form aus. Speichern via PATCH.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDocumentTypes, documentTypesApi, type DocumentType, type CustomField } from './use-document-types';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useNavigate } from 'react-router-dom';
import { SectionHeader } from '@/components/ui/section-header';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
    initialTypeId: string | null;
    initialCustomFields: Record<string, unknown> | null;
    /** Aufruf nach Aenderung. */
    onChange?: () => void;
}

interface Suggestion {
    typeId: string;
    confidence: number;
    suggestedAt: string;
}

export function DocumentTypePanel({ documentId, initialTypeId, initialCustomFields, onChange }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const { types, loading } = useDocumentTypes();
    const [typeId, setTypeId] = useState<string | null>(initialTypeId);
    const [values, setValues] = useState<Record<string, unknown>>(initialCustomFields ?? {});
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    useEffect(() => { setTypeId(initialTypeId); setValues(initialCustomFields ?? {}); }, [documentId, initialTypeId, initialCustomFields]);

    const selectedType = types.find(_t => _t.id === typeId) ?? null;
    // Phase 7: vom Classifier abgelegter Vorschlag in customFields._suggestion
    const suggestion = (initialCustomFields?._suggestion ?? null) as Suggestion | null;
    const suggestedType = suggestion ? types.find(_t => _t.id === suggestion.typeId) : null;

    const save = async () => {
        if (!jwt) return;
        setSaving(true);
        try {
            await documentTypesApi.setDocumentType(jwt, documentId, typeId, typeId ? values : undefined);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
            onChange?.();
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            <SectionHeader
                action={
                    <button
                        onClick={() => navigate('/settings/dms-types')}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('dms.document_type.typen_verwalten')}
                    >
                        <MaterialIcon name="settings" size={16} className="size-3" />
                    </button>
                }
            >
                {t('dms.document_type.dokument-typ')}
            </SectionHeader>

            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

            {!loading && types.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                    {t('dms.document_type.keine_typen_definiert_im_admin_settings_')}
                </p>
            )}

            {!loading && types.length > 0 && (
                <>
                    {/* Phase 7: Auto-Klassifikator-Vorschlag */}
                    {!typeId && suggestedType && (
                        <div className="rounded border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-2 space-y-1">
                            <p className="text-[11px] font-medium">
                                {t('dms.document_type.vorschlag')} <span className="text-amber-700 dark:text-amber-300">{suggestedType.iconEmoji ? `${suggestedType.iconEmoji} ` : ''}{suggestedType.label}</span>
                                <span className="ml-1 text-[10px] text-muted-foreground">({Math.round(suggestion!.confidence * 100)}{t('dms.document_type.sicher')}</span>
                            </p>
                            <button
                                onClick={() => { setTypeId(suggestion!.typeId); setValues({}); }}
                                className="rounded bg-amber-600 px-2 py-0.5 text-[11px] text-white hover:bg-amber-700"
                            >
                                {t('dms.document_type.vorschlag_uebernehmen')}
                            </button>
                        </div>
                    )}

                    <select
                        value={typeId ?? ''}
                        onChange={e => { setTypeId(e.target.value || null); setValues({}); }}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                        <option value="">{t('dms.document_type.kein_typ')}</option>
                        {types.map(_t => (
                            <option key={_t.id} value={_t.id}>{_t.iconEmoji ? `${_t.iconEmoji} ` : ''}{_t.label}</option>
                        ))}
                    </select>

                    {selectedType && selectedType.fields.length > 0 && (
                        <div className="rounded border border-border bg-muted/20 p-2 space-y-2">
                            {selectedType.fields.map(f => (
                                <FieldInput
                                    key={f.key}
                                    field={f}
                                    value={values[f.key]}
                                    onChange={v => setValues(prev => ({ ...prev, [f.key]: v }))}
                                />
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={save}
                            disabled={saving}
                            className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-3" />}
                            {t('dms.document_type.speichern')}
                        </button>
                        {savedFlash && <span className="text-[11px] text-emerald-600">{t('dms.document_type.gespeichert')}</span>}
                    </div>
                </>
            )}
        </div>
    );
}

function FieldInput({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }): JSX.Element {
    const t = useT();
    const label = (
        <label className="block text-[10px] font-medium text-muted-foreground">
            {field.label}{field.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
    );
    const helpText = field.helpText && <p className="mt-0.5 text-[9px] text-muted-foreground">{field.helpText}</p>;
    const cls = 'w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs';

    switch (field.type) {
        case 'text':
            return (<div>{label}<input value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={cls} />{helpText}</div>);
        case 'longtext':
            return (<div>{label}<textarea value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} rows={3} className={cls} />{helpText}</div>);
        case 'number':
            return (<div>{label}<input type="number" value={(value as number | undefined) ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={cls} />{helpText}</div>);
        case 'money':
            return (<div>{label}<div className="flex gap-1 items-center"><input type="number" step="0.01" value={(value as number | undefined) ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={cls} /><span className="text-[10px] text-muted-foreground">EUR</span></div>{helpText}</div>);
        case 'date':
            return (<div>{label}<input type="date" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={cls} />{helpText}</div>);
        case 'boolean':
            return (<label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} className="size-3" />{field.label}</label>);
        case 'select':
            return (
                <div>{label}
                    <select value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={cls}>
                        <option value="">{t('dms.document_type.bitte_waehlen')}</option>
                        {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {helpText}
                </div>
            );
    }
}

// Re-export for the settings UI
export { useDocumentTypes, documentTypesApi };
export type { DocumentType, CustomField };
