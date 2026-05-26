/**
 * Verlauf-Sidebar (Slide-Over):
 *
 * Zeigt die letzten Bulk-Aktionen mit Status (applied / undone / partially_undone),
 * Zeitstempel, Akteur und Anzahl betroffener Kontakte. Bei `canUndoNow=true`
 * gibt es einen "Rueckgaengig"-Button — sonst nur Info-Text.
 */
import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
const gateway = createProjectGateway();
import { cn } from '@/lib/utils';

interface Batch {
    id: string;
    actorId: string;
    actionType: string;
    affectedCount: number;
    summary: string;
    status: string;
    undoUntil: string;
    undoneAt: string | null;
    undoneBy: string | null;
    undoNote: string | null;
    createdAt: string;
    canUndoNow: boolean;
}

export function HistoryPanel({ jwt, onClose, refreshSignal }: { jwt: string; onClose: () => void; refreshSignal: number }) {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [undoing, setUndoing] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const r = await gateway.listContactBatches(jwt, { limit: 50 });
            setBatches(r.batches as Batch[]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [jwt, refreshSignal]);

    const undo = async (batchId: string, force = false) => {
        if (undoing) return;
        setUndoing(batchId);
        try {
            await gateway.undoContactBatch(jwt, batchId, force ? { forceOverride: true } : undefined);
            await load();
        } finally {
            setUndoing(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className="relative flex h-full w-96 flex-col border-l bg-background shadow-xl">
                <div className="flex items-center justify-between border-b px-3 py-2">
                    <div className="flex items-center gap-2">
                        <MaterialIcon name="history" size={18} />
                        <span className="text-[13px] font-medium">Verlauf</span>
                    </div>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-6 text-center text-[12px] text-muted-foreground">Laedt…</div>
                    ) : batches.length === 0 ? (
                        <div className="p-6 text-center text-[12px] text-muted-foreground">
                            Noch keine Aktionen.
                        </div>
                    ) : (
                        <div className="divide-y">
                            {batches.map(b => (
                                <BatchRow
                                    key={b.id}
                                    batch={b}
                                    busy={undoing === b.id}
                                    onUndo={() => undo(b.id)}
                                    onForce={() => undo(b.id, true)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function BatchRow({ batch, busy, onUndo, onForce }: {
    batch: Batch;
    busy: boolean;
    onUndo: () => void;
    onForce: () => void;
}) {
    const time = new Date(batch.createdAt);
    const status = batch.status;
    return (
        <div className="px-3 py-2 text-[12px]">
            <div className="flex items-start gap-2">
                <StatusDot status={status} />
                <div className="min-w-0 flex-1">
                    <div className="font-medium">{batch.summary}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                        <span>{time.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        <span>·</span>
                        <span>{batch.actorId.split(':')[0]}</span>
                        <span>·</span>
                        <span>{batch.affectedCount} betroffen</span>
                    </div>
                    {batch.undoNote && (
                        <div className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            {batch.undoNote}
                        </div>
                    )}
                </div>
                {batch.canUndoNow && (
                    <button
                        onClick={onUndo}
                        disabled={busy}
                        className="shrink-0 rounded border border-primary/30 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                        Rueckgaengig
                    </button>
                )}
                {status === 'partially_undone' && (
                    <button
                        onClick={onForce}
                        disabled={busy}
                        className="shrink-0 rounded border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        title="Konflikte ignorieren und vollstaendig zuruecksetzen"
                    >
                        Erzwingen
                    </button>
                )}
            </div>
        </div>
    );
}

function StatusDot({ status }: { status: string }) {
    return (
        <span className={cn(
            'mt-1 size-2 shrink-0 rounded-full',
            status === 'applied' && 'bg-primary',
            status === 'undone' && 'bg-emerald-500',
            status === 'partially_undone' && 'bg-amber-500',
        )} />
    );
}
