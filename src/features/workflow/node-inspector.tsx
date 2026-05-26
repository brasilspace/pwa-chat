/**
 * NodeInspector — Rechtes Panel zum Bearbeiten der Node-Konfiguration
 *
 * Nutzt lokalen State fuer alle Eingabefelder und schreibt erst bei
 * Blur oder Enter in den Graph-Store. So wird der Canvas nicht bei
 * jedem Tastendruck neu gerendert.
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Trash2, X, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import type { BuilderNodeDefinition, WorkflowNodeDef } from './workflow-types';
import { NODE_COLORS } from './workflow-types';
import { graphStore } from './graph-store';
import { useT } from "@/lib/i18n/use-t";

interface NodeInspectorProps {
    palette: BuilderNodeDefinition[];
}

export function NodeInspector({ palette }: NodeInspectorProps) {
    const t = useT();
    const state = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot);

    const selectedNode = state.selectedNodeId
        ? state.nodes.find((n) => n.id === state.selectedNodeId)
        : null;

    if (!selectedNode) {
        return (
            <div className="flex h-full items-center justify-center border-l border-[var(--border)] bg-[var(--sidebar-background)] p-6 text-center text-sm text-[var(--muted-foreground)]">
                {t('workflow.node_inspector.waehle_einen_node_aus_um_seine_eigenscha')}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--sidebar-background)]">
            <NodeForm
                key={selectedNode.id}
                node={selectedNode}
                palette={palette}
            />
        </div>
    );
}

/**
 * NodeForm — Eigene Komponente mit lokalem State pro Node.
 * Key={node.id} sorgt dafuer dass bei Node-Wechsel der State zurueckgesetzt wird.
 */
function NodeForm({ node, palette }: { node: WorkflowNodeDef; palette: BuilderNodeDefinition[] }) {
    const t = useT();
    const def = palette.find((p) => p.type === node.type);
    const color = NODE_COLORS[node.type] ?? '#64748b';

    // Lokaler State fuer alle Felder
    const [name, setName] = useState(node.name);
    const [config, setConfig] = useState<Record<string, unknown>>({ ...node.config });

    // Sync wenn Node sich extern aendert (z.B. nach Undo)
    useEffect(() => {
        setName(node.name);
        setConfig({ ...node.config });
    }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const commitName = useCallback(() => {
        if (name !== node.name) {
            graphStore.updateNode(node.id, { name });
        }
    }, [node.id, node.name, name]);

    const commitConfig = useCallback((key: string, value: unknown) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);
        graphStore.updateNode(node.id, { config: newConfig });
    }, [node.id, config]);

    const updateConfigLocal = (key: string, value: unknown) => {
        setConfig((prev) => ({ ...prev, [key]: value }));
    };

    const commitAllConfig = useCallback(() => {
        graphStore.updateNode(node.id, { config });
    }, [node.id, config]);

    return (
        <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium">{def?.label ?? node.type}</span>
                </div>
                <button
                    onClick={() => graphStore.selectNode(null)}
                    className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Fields */}
            <div className="flex flex-col gap-4 p-4">
                {/* Name field */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">{t('workflow.node_inspector.name')}</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitName(); }}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                    />
                </div>

                {/* Dynamic fields */}
                {def?.fields.map((field) => (
                    <div key={field.key}>
                        <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
                            {field.label}
                            {field.required && <span className="ml-1 text-red-500">*</span>}
                        </label>

                        {field.type === 'text' && (
                            <input
                                type="text"
                                value={String(config[field.key] ?? '')}
                                onChange={(e) => updateConfigLocal(field.key, e.target.value)}
                                onBlur={() => commitAllConfig()}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitAllConfig(); }}
                                placeholder={field.helpText}
                                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                            />
                        )}

                        {field.type === 'textarea' && (
                            <textarea
                                value={String(config[field.key] ?? '')}
                                onChange={(e) => updateConfigLocal(field.key, e.target.value)}
                                onBlur={() => commitAllConfig()}
                                placeholder={field.helpText}
                                rows={3}
                                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                            />
                        )}

                        {field.type === 'number' && (
                            <input
                                type="number"
                                value={Number(config[field.key] ?? 0)}
                                onChange={(e) => commitConfig(field.key, Number(e.target.value))}
                                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                            />
                        )}

                        {field.type === 'select' && (
                            <select
                                value={String(config[field.key] ?? '')}
                                onChange={(e) => commitConfig(field.key, e.target.value)}
                                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                            >
                                <option value="">{t('workflow.node_inspector.bitte_waehlen')}</option>
                                {field.options?.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        )}

                        {field.type === 'boolean' && (
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={Boolean(config[field.key])}
                                    onChange={(e) => commitConfig(field.key, e.target.checked)}
                                    className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)]"
                                />
                                <span className="text-sm text-[var(--muted-foreground)]">{field.helpText}</span>
                            </label>
                        )}

                        {field.type === 'role' && (
                            <input
                                type="text"
                                value={String(config[field.key] ?? '')}
                                onChange={(e) => updateConfigLocal(field.key, e.target.value)}
                                onBlur={() => commitAllConfig()}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitAllConfig(); }}
                                placeholder={t('workflow.node_inspector.zb_schulleitung_krisenteam')}
                                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                            />
                        )}

                        {(field.type === 'expression' || field.type === 'cron') && (
                            <input
                                type="text"
                                value={String(config[field.key] ?? '')}
                                onChange={(e) => updateConfigLocal(field.key, e.target.value)}
                                onBlur={() => commitAllConfig()}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitAllConfig(); }}
                                placeholder={field.helpText}
                                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 font-mono text-sm text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                            />
                        )}

                        {field.type === 'form_schema' && (
                            <FormSchemaEditor
                                value={Array.isArray(config[field.key]) ? config[field.key] as any[] : []}
                                onChange={(schema) => { updateConfigLocal(field.key, schema); commitConfig(field.key, schema); }}
                            />
                        )}

                        {field.helpText && field.type !== 'boolean' && field.type !== 'form_schema' && (
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{field.helpText}</p>
                        )}
                    </div>
                ))}
            </div>

            {/* Delete button */}
            {node.type !== 'start' && (
                <div className="mt-auto border-t border-[var(--border)] p-4">
                    <button
                        onClick={() => graphStore.removeNode(node.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                        <Trash2 size={14} />
                        {t('workflow.node_inspector.node_entfernen')}
                    </button>
                </div>
            )}
        </>
    );
}

// ─── Form Schema Editor ──────────────────────────────────────────────────────

const FIELD_TYPES = [
    { value: 'text', label: 'Textfeld' },
    { value: 'textarea', label: 'Textbereich' },
    { value: 'number', label: 'Zahl' },
    { value: 'date', label: 'Datum' },
    { value: 'datetime', label: 'Datum & Uhrzeit' },
    { value: 'select', label: 'Auswahl (Dropdown)' },
    { value: 'multiselect', label: 'Mehrfachauswahl' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'rating', label: 'Bewertung (Sterne)' },
    { value: 'file', label: 'Datei-Upload' },
    { value: 'signature', label: 'Unterschrift' },
    { value: 'richtext', label: 'Rich-Text' },
];

interface SchemaField {
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    helpText?: string;
    options?: Array<{ value: string; label: string }>;
    writesToVariable?: string;
}

function FormSchemaEditor({ value, onChange }: { value: SchemaField[]; onChange: (schema: SchemaField[]) => void }) {
    const t = useT();
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    const addField = () => {
        const idx = value.length;
        const newField: SchemaField = {
            key: `feld_${idx + 1}`,
            label: `Feld ${idx + 1}`,
            type: 'text',
            required: false,
        };
        onChange([...value, newField]);
        setExpandedIdx(idx);
    };

    const updateField = (idx: number, updates: Partial<SchemaField>) => {
        const updated = value.map((f, i) => i === idx ? { ...f, ...updates } : f);
        onChange(updated);
    };

    const removeField = (idx: number) => {
        onChange(value.filter((_, i) => i !== idx));
        setExpandedIdx(null);
    };

    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
            {/* Field list */}
            {value.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
                    {t('workflow.node_inspector.noch_keine_felder_klicke_unten_auf_quotf')}
                </p>
            )}

            {value.map((field, idx) => {
                const isExpanded = expandedIdx === idx;
                const typeLabel = FIELD_TYPES.find((_t) => _t.value === field.type)?.label ?? field.type;

                return (
                    <div key={idx} className="border-b border-[var(--border)] last:border-0">
                        {/* Collapsed header */}
                        <button
                            onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--accent)]"
                        >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span className="flex-1 truncate font-medium">{field.label}</span>
                            <span className="text-[10px] text-[var(--muted-foreground)]">{typeLabel}</span>
                            {field.required && <span className="text-[10px] text-red-500">*</span>}
                        </button>

                        {/* Expanded editor */}
                        {isExpanded && (
                            <div className="flex flex-col gap-2.5 border-t border-[var(--border)] bg-[var(--accent)]/30 px-3 py-3">
                                {/* Label */}
                                <div>
                                    <label className="mb-0.5 block text-[10px] font-medium text-[var(--muted-foreground)]">{t('workflow.node_inspector.bezeichnung')}</label>
                                    <input
                                        type="text"
                                        value={field.label}
                                        onChange={(e) => updateField(idx, { label: e.target.value })}
                                        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
                                    />
                                </div>

                                {/* Key */}
                                <div>
                                    <label className="mb-0.5 block text-[10px] font-medium text-[var(--muted-foreground)]">{t('workflow.node_inspector.schluessel_fuer_variablen')}</label>
                                    <input
                                        type="text"
                                        value={field.key}
                                        onChange={(e) => updateField(idx, { key: e.target.value.replace(/[^a-z0-9_]/g, '') })}
                                        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-xs focus:border-[var(--ring)] focus:outline-none"
                                    />
                                </div>

                                {/* Type */}
                                <div>
                                    <label className="mb-0.5 block text-[10px] font-medium text-[var(--muted-foreground)]">{t('workflow.node_inspector.feldtyp')}</label>
                                    <select
                                        value={field.type}
                                        onChange={(e) => updateField(idx, { type: e.target.value })}
                                        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
                                    >
                                        {FIELD_TYPES.map((_t) => (
                                            <option key={_t.value} value={_t.value}>{_t.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Options (for select/multiselect) */}
                                {(field.type === 'select' || field.type === 'multiselect') && (
                                    <div>
                                        <label className="mb-0.5 block text-[10px] font-medium text-[var(--muted-foreground)]">
                                            {t('workflow.node_inspector.optionen_eine_pro_zeile_wertbezeichnung')}
                                        </label>
                                        <textarea
                                            value={(field.options ?? []).map((o) => `${o.value}|${o.label}`).join('\n')}
                                            onChange={(e) => {
                                                const options = e.target.value.split('\n').filter(Boolean).map((line) => {
                                                    const [val, ...rest] = line.split('|');
                                                    return { value: val.trim(), label: rest.join('|').trim() || val.trim() };
                                                });
                                                updateField(idx, { options });
                                            }}
                                            rows={3}
                                            placeholder={t('workflow.node_inspector.hochhoch10mittelmittel10niedrigniedrig')}
                                            className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-xs focus:border-[var(--ring)] focus:outline-none"
                                        />
                                    </div>
                                )}

                                {/* Writes to variable */}
                                <div>
                                    <label className="mb-0.5 block text-[10px] font-medium text-[var(--muted-foreground)]">{t('workflow.node_inspector.schreibt_in_variable_optional')}</label>
                                    <input
                                        type="text"
                                        value={field.writesToVariable ?? ''}
                                        onChange={(e) => updateField(idx, { writesToVariable: e.target.value || undefined })}
                                        placeholder={t('workflow.node_inspector.zb_schweregrad')}
                                        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-xs focus:border-[var(--ring)] focus:outline-none"
                                    />
                                </div>

                                {/* Required + Placeholder row */}
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-1.5 text-xs">
                                        <input
                                            type="checkbox"
                                            checked={field.required}
                                            onChange={(e) => updateField(idx, { required: e.target.checked })}
                                            className="h-3.5 w-3.5 rounded"
                                        />
                                        {t('workflow.node_inspector.pflichtfeld')}
                                    </label>
                                </div>

                                {/* Placeholder */}
                                <div>
                                    <label className="mb-0.5 block text-[10px] font-medium text-[var(--muted-foreground)]">{t('workflow.node_inspector.platzhalter-text')}</label>
                                    <input
                                        type="text"
                                        value={field.placeholder ?? ''}
                                        onChange={(e) => updateField(idx, { placeholder: e.target.value || undefined })}
                                        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
                                    />
                                </div>

                                {/* Delete */}
                                <button
                                    onClick={() => removeField(idx)}
                                    className="flex items-center gap-1 self-start rounded px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                                >
                                    <Trash2 size={10} />
                                    {t('workflow.node_inspector.feld_entfernen')}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Add button */}
            <button
                onClick={addField}
                className="flex w-full items-center justify-center gap-1.5 rounded-b-lg px-3 py-2 text-xs font-medium text-[var(--primary)] transition-colors hover:bg-[var(--accent)]"
            >
                <Plus size={12} />
                {t('workflow.node_inspector.feld_hinzufuegen')}
            </button>
        </div>
    );
}
