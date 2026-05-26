/**
 * Undo-Toast: erscheint unten links, ~8s sichtbar, mit "Rueckgaengig"-Knopf.
 * Bewusst minimaler eigener Toast (kein react-hot-toast-Wrapper), damit die
 * Aktion + Knopf-Layout exakt steuerbar bleibt und keine doppelten Renders
 * bei Konflikt-Detection auftreten.
 */
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
const gateway = createProjectGateway();
import { cn } from '@/lib/utils';

interface ToastInput {
    jwt: string;
    batchId: string;
    summary: string;
    onUndone: () => void;
    /** Default 8000 ms. */
    durationMs?: number;
}

let mountEl: HTMLDivElement | null = null;
let root: Root | null = null;

function ensureMount() {
    if (mountEl) return mountEl;
    mountEl = document.createElement('div');
    mountEl.style.position = 'fixed';
    mountEl.style.bottom = '16px';
    mountEl.style.left = '16px';
    mountEl.style.zIndex = '9999';
    mountEl.style.pointerEvents = 'none';
    document.body.appendChild(mountEl);
    root = createRoot(mountEl);
    return mountEl;
}

let queue: ToastInput[] = [];
let renderTick = 0;

function rerender() {
    if (!root) return;
    renderTick++;
    root.render(<ToastStack key={renderTick} items={queue} onRemove={remove} />);
}

function remove(batchId: string) {
    queue = queue.filter(q => q.batchId !== batchId);
    rerender();
}

export function showUndoToast(input: ToastInput) {
    ensureMount();
    queue = [...queue, input];
    rerender();
}

function ToastStack({ items, onRemove }: { items: ToastInput[]; onRemove: (id: string) => void }) {
    return (
        <div className="flex flex-col gap-2">
            {items.map(it => (
                <ToastItem key={it.batchId} item={it} onRemove={onRemove} />
            ))}
        </div>
    );
}

function ToastItem({ item, onRemove }: { item: ToastInput; onRemove: (id: string) => void }) {
    const duration = item.durationMs ?? 8000;
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'pending' | 'undone' | 'partial' | 'error'>('pending');
    const [errMsg, setErrMsg] = useState<string | null>(null);

    useEffect(() => {
        if (status !== 'pending') return;
        const id = window.setTimeout(() => onRemove(item.batchId), duration);
        return () => window.clearTimeout(id);
    }, [duration, item.batchId, onRemove, status]);

    const undo = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const r = await gateway.undoContactBatch(item.jwt, item.batchId);
            const newStatus = r.result.newStatus;
            if (newStatus === 'undone') setStatus('undone');
            else if (newStatus === 'partially_undone') setStatus('partial');
            else setStatus('error');
            item.onUndone();
            window.setTimeout(() => onRemove(item.batchId), 4000);
        } catch (e) {
            setStatus('error');
            setErrMsg(e instanceof Error ? e.message : String(e));
            window.setTimeout(() => onRemove(item.batchId), 6000);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cn(
            'pointer-events-auto flex max-w-md items-center gap-3 rounded-md border bg-background px-3 py-2 shadow-lg',
            status === 'undone' && 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/40',
            status === 'partial' && 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/40',
            status === 'error' && 'border-red-500/60 bg-red-50 dark:bg-red-950/40',
        )}>
            <MaterialIcon
                name={status === 'undone' ? 'check_circle' : status === 'error' ? 'error' : status === 'partial' ? 'warning' : 'history'}
                size={16}
                className={cn(
                    'shrink-0',
                    status === 'undone' && 'text-emerald-600',
                    status === 'partial' && 'text-amber-600',
                    status === 'error' && 'text-red-600',
                )}
            />
            <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium">
                    {status === 'undone' ? 'Aktion rueckgaengig gemacht.' :
                        status === 'partial' ? 'Teilweise rueckgaengig — Konflikte uebersprungen.' :
                            status === 'error' ? (errMsg ?? 'Undo fehlgeschlagen.') :
                                item.summary}
                </div>
            </div>
            {status === 'pending' && (
                <button
                    type="button"
                    onClick={undo}
                    disabled={busy}
                    className="shrink-0 rounded border border-primary/30 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
                >
                    Rueckgaengig
                </button>
            )}
            <button
                type="button"
                onClick={() => onRemove(item.batchId)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
                <MaterialIcon name="close" size={14} />
            </button>
        </div>
    );
}
