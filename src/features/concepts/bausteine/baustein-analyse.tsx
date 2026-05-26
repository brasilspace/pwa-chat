/**
 * BausteinAnalyse — Kanban-Board fuer Risiko-Erfassung
 *
 * Nutzt die bestehende Board/WorkItem-API via project-gateway.
 * Die spaceId kommt aus der Konzept-Instanz-Config.
 */

import { useEffect, useState, useCallback } from 'react';
import { Search, Plus } from 'lucide-react';
import type { ConceptBaustein, ConceptInstance } from '../concept-gateway';
import { createProjectGateway } from '../../../gateways/platform/project-gateway';
import { useT } from "@/lib/i18n/use-t";

const projectGateway = createProjectGateway();

interface Props {
    baustein: ConceptBaustein;
    instance: ConceptInstance;
    jwt: string;
}

interface RiskItem {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
}

const STATUS_COLUMNS = [
    { key: 'todo', labelKey: 'app.misc.identifiziert', color: '#94a3b8' },
    { key: 'in_progress', labelKey: 'app.misc.in_arbeit', color: '#3b82f6' },
    { key: 'review', labelKey: 'app.misc.bewertung', color: '#f59e0b' },
    { key: 'done', labelKey: 'app.misc.behoben', color: '#10b981' },
];

const PRIORITY_COLORS: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#94a3b8',
};

const PRIORITY_LABELS: Record<string, string> = {
    critical: 'Kritisch',
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig',
};

export function BausteinAnalyse({ baustein, instance, jwt }: Props) {
    const t = useT();
    const [items, setItems] = useState<RiskItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newPriority, setNewPriority] = useState('medium');
    const [newDescription, setNewDescription] = useState('');
    const [adding, setAdding] = useState(false);

    const spaceId = (instance.config as Record<string, unknown>)?.spaceId as string | undefined;
    const boardId = baustein.boardId;

    const loadItems = useCallback(async () => {
        if (!spaceId || !boardId) {
            setLoading(false);
            return;
        }
        try {
            const res = await projectGateway.listItems(jwt, spaceId, boardId);
            setItems(res.items.map((i: any) => ({
                id: i.id,
                title: i.title,
                description: i.description,
                status: i.status ?? 'todo',
                priority: i.priority ?? 'medium',
            })));
        } catch (err) {
            console.warn('Board-Items laden fehlgeschlagen:', err);
        } finally {
            setLoading(false);
        }
    }, [jwt, spaceId, boardId]);

    useEffect(() => { loadItems(); }, [loadItems]);

    const handleAdd = async () => {
        if (!spaceId || !boardId || !newTitle.trim() || adding) return;
        setAdding(true);
        try {
            await projectGateway.createItem(jwt, spaceId, boardId, {
                title: newTitle.trim(),
                description: newDescription.trim() || undefined,
                status: 'todo',
                priority: newPriority,
            });
            setNewTitle('');
            setNewDescription('');
            setNewPriority('medium');
            setShowAddForm(false);
            await loadItems();
        } finally {
            setAdding(false);
        }
    };

    const handleStatusChange = async (itemId: string, newStatus: string) => {
        if (!spaceId) return;
        try {
            await projectGateway.moveItem(jwt, spaceId, itemId, { status: newStatus });
            setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, status: newStatus } : i));
        } catch (err) {
            console.warn('Status-Aenderung fehlgeschlagen:', err);
        }
    };

    if (!boardId) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
                {t('concepts.bausteine.baustein_analyse.kein_board_verknuepft')}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2">
                <div className="flex items-center gap-2">
                    <Search size={15} className="text-[var(--muted-foreground)]" />
                    <span className="text-sm font-medium">{t('concepts.bausteine.baustein_analyse.risiko-analyse')}</span>
                    <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                        {items.length}
                    </span>
                </div>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs text-white"
                >
                    <Plus size={12} />
                    {t('concepts.bausteine.baustein_analyse.risiko_erfassen')}
                </button>
            </div>

            {/* Add form */}
            {showAddForm && (
                <div className="border-b border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex flex-col gap-3">
                        <input
                            type="text"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder={t('concepts.bausteine.baustein_analyse.risiko-bezeichnung_zb_unbeaufsichtigte_r')}
                            autoFocus
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none"
                            onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) handleAdd(); }}
                        />
                        <textarea
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            placeholder={t('concepts.bausteine.baustein_analyse.beschreibung_optional')}
                            rows={2}
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none"
                        />
                        <div className="flex items-center gap-3">
                            <select
                                value={newPriority}
                                onChange={(e) => setNewPriority(e.target.value)}
                                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm"
                            >
                                <option value="critical">{t('concepts.bausteine.baustein_analyse.kritisch')}</option>
                                <option value="high">{t('concepts.bausteine.baustein_analyse.hoch')}</option>
                                <option value="medium">{t('concepts.bausteine.baustein_analyse.mittel')}</option>
                                <option value="low">{t('concepts.bausteine.baustein_analyse.niedrig')}</option>
                            </select>
                            <div className="flex-1" />
                            <button
                                onClick={() => setShowAddForm(false)}
                                className="rounded-md px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                            >
                                {t('concepts.bausteine.baustein_analyse.abbrechen')}
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={!newTitle.trim() || adding}
                                className="rounded-md bg-[var(--primary)] px-4 py-1.5 text-xs text-white disabled:opacity-50"
                            >
                                {adding ? 'Wird erstellt...' : 'Erfassen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kanban columns */}
            <div className="flex flex-1 gap-3 overflow-x-auto p-4">
                {STATUS_COLUMNS.map((col) => {
                    const colItems = items.filter((i) => i.status === col.key);
                    return (
                        <div key={col.key} className="flex w-64 shrink-0 flex-col rounded-xl bg-[var(--accent)]/30">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                                <span className="text-xs font-semibold text-[var(--foreground)]">{t(col.labelKey)}</span>
                                <span className="ml-auto text-xs text-[var(--muted-foreground)]">{colItems.length}</span>
                            </div>
                            <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                                {colItems.map((item) => (
                                    <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-sm font-medium text-[var(--foreground)]">{item.title}</span>
                                            <div
                                                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                                style={{ backgroundColor: PRIORITY_COLORS[item.priority] ?? '#94a3b8' }}
                                                title={PRIORITY_LABELS[item.priority] ?? item.priority}
                                            />
                                        </div>
                                        {item.description && (
                                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.description}</p>
                                        )}
                                        {/* Status-Move-Buttons */}
                                        <div className="mt-2 flex gap-1">
                                            {STATUS_COLUMNS.filter((c) => c.key !== item.status).map((c) => (
                                                <button
                                                    key={c.key}
                                                    onClick={() => handleStatusChange(item.id, c.key)}
                                                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
                                                    title={`${t('app.misc.verschieben_nach')} "${t(c.labelKey)}"`}
                                                >
                                                    {t(c.labelKey)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {colItems.length === 0 && (
                                    <div className="flex flex-1 items-center justify-center py-8 text-xs text-[var(--muted-foreground)]">
                                        {t('concepts.bausteine.baustein_analyse.keine_eintraege')}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
