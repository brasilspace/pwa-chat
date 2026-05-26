/**
 * BausteinIntervention — Kaskaden-basierte Ablauf-Ansicht
 *
 * Zeigt den verlinkten Kaskaden-Board-Editor, eine Liste der Durchlaeufe,
 * und erlaubt das Starten neuer Flows + Freigabe von Checkpoints.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import type { ConceptBaustein } from '../concept-gateway';
import { createConceptGateway } from '../concept-gateway';
import { env } from '@/core/config/env';
import { useT } from "@/lib/i18n/use-t";

const conceptGateway = createConceptGateway();
const API = `${env.platformBaseUrl}/platform/v1`;

async function fetchApi<T>(path: string, jwt: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

interface CascadeRun {
    id: string;
    status: string;
    activeColumnId: string | null;
    variables: Record<string, unknown>;
    startedAt: string;
    completedAt: string | null;
    slaBreached: boolean;
}

interface CascadeCheckpoint {
    id: string;
    title: string;
    status: string;
    assignedRole: string | null;
    requiredApprovals: number;
    approvals: Array<{ userId: string; decision: string }>;
}

interface Props {
    baustein: ConceptBaustein;
    instanceId: string;
    jwt: string;
}

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
    completed: CheckCircle,
    running: Play,
    waiting: Clock,
    failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
    completed: '#10b981',
    running: '#3b82f6',
    waiting: '#f59e0b',
    failed: '#ef4444',
    canceled: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
    completed: 'Abgeschlossen',
    running: 'Laeuft',
    waiting: 'Wartet auf Freigabe',
    failed: 'Fehlgeschlagen',
    canceled: 'Abgebrochen',
};

export function BausteinIntervention({ baustein, instanceId, jwt }: Props) {
    const t = useT();
    const navigate = useNavigate();
    const boardId = baustein.cascadeBoardId ?? baustein.workflowTemplateId; // Fallback auf alten Wert
    const [runs, setRuns] = useState<CascadeRun[]>([]);
    const [checkpoints, setCheckpoints] = useState<CascadeCheckpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [boardName, setBoardName] = useState('');

    const loadData = useCallback(async () => {
        if (!boardId) { setLoading(false); return; }
        try {
            const [runsRes, cpRes] = await Promise.all([
                fetchApi<{ runs: CascadeRun[] }>(`/cascade-boards/${boardId}/runs`, jwt),
                fetchApi<{ checkpoints: CascadeCheckpoint[] }>(`/cascade-checkpoints/my`, jwt),
            ]);
            setRuns(runsRes.runs ?? []);
            setCheckpoints(cpRes.checkpoints ?? []);
            // Board-Name laden
            const boardRes = await fetchApi<{ board: { name: string } }>(`/cascade-boards/${boardId}/graph`, jwt).catch(() => null);
            if (boardRes) setBoardName(boardRes.board.name);
        } catch { /* ignore */ }
        setLoading(false);
    }, [boardId, jwt]);

    useEffect(() => { loadData(); }, [loadData]);

    // Periodisch aktualisieren (alle 10s)
    useEffect(() => {
        if (!boardId) return;
        const interval = setInterval(loadData, 10_000);
        return () => clearInterval(interval);
    }, [boardId, loadData]);

    const handleStartRun = async () => {
        if (!boardId || starting) return;
        setStarting(true);
        try {
            await fetchApi(`/cascade-boards/${boardId}/runs`, jwt, { method: 'POST', body: '{}' });
            await loadData();
        } finally { setStarting(false); }
    };

    const handleApprove = async (checkpointId: string) => {
        await fetchApi(`/cascade-checkpoints/${checkpointId}/approve`, jwt, { method: 'POST', body: '{}' });
        await loadData();
    };

    const handleReject = async (checkpointId: string) => {
        await fetchApi(`/cascade-checkpoints/${checkpointId}/reject`, jwt, { method: 'POST', body: '{}' });
        await loadData();
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!boardId) {
        return (
            <CreateCascadePrompt instanceId={instanceId} jwt={jwt} onCreated={() => { window.location.reload(); }} />
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                    <h3 className="text-sm font-semibold">{boardName || 'Interventions-Ablauf'}</h3>
                    <p className="text-xs text-muted-foreground">{runs.length} {t('concepts.bausteine.baustein_intervention.durchlaeufe')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('/kaskaden')}
                        className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted">
                        <MaterialIcon name="schema" size={16} className="size-3" /> {t('concepts.bausteine.baustein_intervention.editor')}
                    </button>
                    <button onClick={handleStartRun} disabled={starting}
                        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
                        <MaterialIcon name="play_arrow" size={16} className="size-3" /> {starting ? 'Startet...' : 'Ablauf starten'}
                    </button>
                </div>
            </div>

            {/* Offene Checkpoints */}
            {checkpoints.length > 0 && (
                <div className="border-b bg-amber-50 dark:bg-amber-900/10 px-4 py-2">
                    <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1">{t('concepts.bausteine.baustein_intervention.offene_freigaben')}</p>
                    {checkpoints.map(cp => (
                        <div key={cp.id} className="flex items-center gap-2 py-1">
                            <MaterialIcon name="verified_user" size={16} className="size-3.5 text-amber-500 shrink-0" />
                            <span className="text-xs flex-1">{cp.title}</span>
                            {cp.assignedRole && <span className="text-[10px] text-muted-foreground">{cp.assignedRole}</span>}
                            <button onClick={() => handleApprove(cp.id)}
                                className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-600">
                                {t('concepts.bausteine.baustein_intervention.freigeben')}
                            </button>
                            <button onClick={() => handleReject(cp.id)}
                                className="rounded border border-destructive/30 px-2 py-0.5 text-[10px] text-destructive hover:bg-destructive/10">
                                {t('concepts.bausteine.baustein_intervention.ablehnen')}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Runs */}
            <div className="flex-1 overflow-y-auto p-4">
                {runs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                        <MaterialIcon name="schedule" size={16} className="size-6 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('concepts.bausteine.baustein_intervention.noch_keine_ablaeufe_ausgefuehrt')}</p>
                        <p className="text-xs text-muted-foreground/60">{t('concepts.bausteine.baustein_intervention.klicke_quotablauf_startenquot_um_den_ers')}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('concepts.bausteine.baustein_intervention.durchlaeufe')}{runs.length})
                        </h4>
                        {runs.map(run => {
                            const StatusIcon = STATUS_ICONS[run.status] ?? Clock;
                            const color = STATUS_COLORS[run.status] ?? '#94a3b8';
                            return (
                                <div key={run.id} className={`rounded-lg border px-4 py-3 ${run.status === 'waiting' ? 'border-amber-300 dark:border-amber-700' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: color + '15' }}>
                                            <StatusIcon className="size-4" style={{ color }} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium">{STATUS_LABELS[run.status] ?? run.status}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {t('concepts.bausteine.baustein_intervention.gestartet')} {new Date(run.startedAt).toLocaleString('de-DE')}
                                                {run.completedAt && ` · Fertig ${new Date(run.completedAt).toLocaleString('de-DE')}`}
                                            </p>
                                        </div>
                                        {run.slaBreached && (
                                            <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                                                {t('concepts.bausteine.baustein_intervention.sla_ueberschritten')}
                                            </span>
                                        )}
                                        {Object.keys(run.variables).length > 0 && (
                                            <span className="text-[10px] text-muted-foreground">{Object.keys(run.variables).length} {t('concepts.bausteine.baustein_intervention.variablen')}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Create Cascade Prompt ──────────────────────────────────────────────────

function CreateCascadePrompt({ instanceId, jwt, onCreated }: { instanceId: string; jwt: string; onCreated: () => void }) {
    const t = useT();
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!name.trim() || creating) return;
        setCreating(true);
        try {
            // Konzept-Space finden
            const instRes = await fetchApi<{ instance: { config: { spaceId?: string } } }>(`/concepts/instances/${instanceId}`, jwt);
            const spaceId = instRes.instance.config.spaceId as string;
            if (!spaceId) { alert('Kein Space fuer dieses Konzept gefunden'); return; }

            // Kaskaden-Board erstellen
            const boardRes = await fetchApi<{ board: { id: string } }>(`/spaces/${spaceId}/cascade-boards`, jwt, {
                method: 'POST', body: JSON.stringify({ name: name.trim() }),
            });

            // Board als aktiv setzen
            await fetchApi(`/cascade-boards/${boardRes.board.id}`, jwt, {
                method: 'PATCH', body: JSON.stringify({ status: 'active' }),
            });

            // Baustein verknuepfen
            await conceptGateway.updateBaustein(jwt, instanceId, 'intervention', {
                cascadeBoardId: boardRes.board.id,
            });

            onCreated();
        } finally { setCreating(false); }
    };

    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-purple-500/10">
                <MaterialIcon name="schema" size={16} className="size-8 text-purple-500" />
            </div>
            <div>
                <h3 className="text-base font-semibold">{t('concepts.bausteine.baustein_intervention.handlungsablauf_erstellen')}</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {t('concepts.bausteine.baustein_intervention.erstelle_einen_visuellen_ablauf_der_schr')}
                </p>
            </div>
            {!showForm ? (
                <button onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                    <MaterialIcon name="add" size={16} className="size-4" /> {t('concepts.bausteine.baustein_intervention.neuen_ablauf_erstellen')}
                </button>
            ) : (
                <div className="flex w-full max-w-sm flex-col gap-3">
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                        placeholder={t('concepts.bausteine.baustein_intervention.name_des_ablaufs_zb_interventionskette')}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleCreate(); }} />
                    <div className="flex gap-2">
                        <button onClick={() => setShowForm(false)}
                            className="flex-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">{t('concepts.bausteine.baustein_intervention.abbrechen')}</button>
                        <button onClick={handleCreate} disabled={!name.trim() || creating}
                            className="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
                            {creating ? 'Wird erstellt...' : 'Erstellen'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
