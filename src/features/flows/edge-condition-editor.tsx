/**
 * Edge-Condition-Editor (Phase 6.2).
 *
 * Modal das geoeffnet wird wenn eine Edge angeklickt wird. Erlaubt Wechsel
 * zwischen always / if (JsonLogic) / delay (ms).
 *
 * Backend hat keinen PUT /process/edges/:id — es gibt nur POST + DELETE.
 * Daher: bei Aenderung der Condition wird die Edge neu erstellt + die alte
 * geloescht. Optimistisch im Frontend updaten.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { flowsGateway, type EdgeCondition, type ProcessEdge } from './flows-gateway';
import { useT } from "@/lib/i18n/use-t";

interface EdgeConditionEditorProps {
    jwt: string;
    edge: ProcessEdge;
    onClose: () => void;
    onUpdated: (newEdge: ProcessEdge) => void;
    onDeleted: () => void;
}

type ConditionType = 'always' | 'if' | 'delay';

export function EdgeConditionEditor({ jwt, edge, onClose, onUpdated, onDeleted }: EdgeConditionEditorProps) {
    const t = useT();
    const initialType: ConditionType =
        edge.condition?.type === 'if' ? 'if' :
            edge.condition?.type === 'delay' ? 'delay' :
                'always';

    const [type, setType] = useState<ConditionType>(initialType);
    const [delayMs, setDelayMs] = useState<number>(
        edge.condition?.type === 'delay' ? edge.condition.ms : 60_000,
    );
    const [exprJson, setExprJson] = useState<string>(
        edge.condition?.type === 'if' ? JSON.stringify(edge.condition.expr, null, 2) : '{}',
    );
    const [label, setLabel] = useState(edge.label ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const buildCondition = (): EdgeCondition => {
        if (type === 'always') return { type: 'always' };
        if (type === 'delay') return { type: 'delay', ms: delayMs };
        return { type: 'if', expr: JSON.parse(exprJson) };
    };

    const handleSave = async () => {
        let newCondition: EdgeCondition;
        try { newCondition = buildCondition(); }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Ungueltige Condition');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            // Edge-Update via Replace: alte loeschen, neue erstellen
            await flowsGateway.deleteEdge(jwt, edge.id);
            const r = await flowsGateway.addEdge(jwt, edge.templateId, {
                sourceId: edge.sourceId,
                targetId: edge.targetId,
                condition: newCondition,
                label: label || undefined,
            });
            onUpdated(r.edge);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Verbindung wirklich löschen?')) return;
        setSaving(true);
        try {
            await flowsGateway.deleteEdge(jwt, edge.id);
            onDeleted();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Loeschen fehlgeschlagen');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <div className="font-semibold">{t('flows.edge_condition_editor.verbindung_bearbeiten')}</div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">{t('flows.edge_condition_editor.bedingung')}</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setType('always')}
                                className={`px-3 py-2 rounded border text-sm ${type === 'always' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                            >
                                {t('flows.edge_condition_editor.immer')}
                            </button>
                            <button
                                onClick={() => setType('if')}
                                className={`px-3 py-2 rounded border text-sm ${type === 'if' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                            >
                                {t('flows.edge_condition_editor.wenn')}
                            </button>
                            <button
                                onClick={() => setType('delay')}
                                className={`px-3 py-2 rounded border text-sm ${type === 'delay' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                            >
                                {t('flows.edge_condition_editor.verzoegerung')}
                            </button>
                        </div>
                    </div>

                    {type === 'delay' && (
                        <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">
                                {t('flows.edge_condition_editor.verzoegerung')} {Math.round(delayMs / 1000)} {t('flows.edge_condition_editor.sekunden')}
                            </label>
                            <input
                                type="range"
                                min={1000}
                                max={3_600_000}
                                step={1000}
                                value={delayMs}
                                onChange={e => setDelayMs(Number(e.target.value))}
                                className="w-full"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>{t('flows.edge_condition_editor.1s')}</span>
                                <span>{t('flows.edge_condition_editor.1h')}</span>
                            </div>
                            <input
                                type="number"
                                value={delayMs}
                                onChange={e => setDelayMs(Number(e.target.value))}
                                className="mt-2 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                        </div>
                    )}

                    {type === 'if' && (
                        <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">{t('flows.edge_condition_editor.jsonlogic-expression')}</label>
                            <textarea
                                value={exprJson}
                                onChange={e => setExprJson(e.target.value)}
                                rows={6}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                            />
                            <div className="text-xs text-gray-500 mt-1">
                                {t('flows.edge_condition_editor.zb')} <code>{`{ "==": [{"var": "data.status"}, "ok"] }`}</code>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">{t('flows.edge_condition_editor.label_optional')}</label>
                        <input
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                    </div>

                    {error && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-200 p-3 flex items-center justify-between">
                    <button
                        onClick={handleDelete}
                        disabled={saving}
                        className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                    >
                        {t('flows.edge_condition_editor.verbindung_loeschen')}
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
                            disabled={saving}
                        >
                            {t('flows.edge_condition_editor.abbrechen')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
                        >
                            {saving ? 'Speichere…' : t('common.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
