/**
 * PrintButton — kombinierter Drucken-Button mit Dropdown.
 *
 * Klick öffnet Menü:
 *   • Browser-Dialog (Stufe 1) — funktioniert immer
 *   • Schul-Drucker A, B, C — Direkt-IPP (Stufe 2), nur wenn registriert
 */

import { type JSX, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { MaterialIcon } from '@/components/ui/material-icon';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Printer {
    id: string;
    name: string;
    location?: string | null;
}

export function PrintButton({ docId, className }: { docId: string; className?: string }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [open, setOpen] = useState(false);
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [busy, setBusy] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/printers', { headers: { Authorization: `Bearer ${jwt}` } })
            .then(r => r.ok ? r.json() : { printers: [] })
            .then(d => setPrinters(d.printers ?? []))
            .catch(() => setPrinters([]));
    }, [jwt]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, [open]);

    const printBrowser = async () => {
        if (!jwt) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/platform/v1/documents/${docId}/print-url`, {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { url } = await res.json();
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: 'none' });
            iframe.src = url;
            iframe.onload = () => {
                try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
                catch { window.open(url, '_blank'); }
            };
            document.body.appendChild(iframe);
            setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* */ } }, 60000);
        } catch (e) {
            toast.error('Drucken fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
            setOpen(false);
        }
    };

    const printDirect = async (printerId: string, printerName: string) => {
        if (!jwt) return;
        setBusy(true);
        try {
            const res = await fetch('/api/platform/v1/print/jobs', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ printerId, documentIds: [docId], copies: 1, duplex: false, color: true }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { job } = await res.json();
            toast.success(`Druckauftrag an ${printerName} gesendet (${job.id.slice(0, 6)})`);
        } catch (e) {
            toast.error('Direkt-Druck fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
            setOpen(false);
        }
    };

    return (
        <div ref={ref} className={cn('relative', className)}>
            <button
                onClick={() => {
                    if (printers.length === 0) {
                        // Kein Drucker registriert → direkt Browser
                        printBrowser();
                    } else {
                        setOpen(o => !o);
                    }
                }}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50"
                title={t('app.misc.drucken')}
            >
                <MaterialIcon name="print" size={16} className="size-3.5" />
                {t('app.misc.drucken')}
                {printers.length > 0 && <MaterialIcon name="expand_more" size={14} className="size-3" />}
            </button>
            {open && printers.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-0.5 w-56 rounded border bg-background py-1 shadow-md">
                    <button
                        type="button"
                        onClick={printBrowser}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                    >
                        <MaterialIcon name="open_in_browser" size={14} className="size-3.5" />
                        {t('app.misc.browser-dialog')}
                    </button>
                    <div className="my-1 border-t" />
                    {printers.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => printDirect(p.id, p.name)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                        >
                            <MaterialIcon name="print" size={14} className="size-3.5 text-primary" />
                            <span className="flex-1 truncate">{p.name}</span>
                            {p.location && <span className="text-[10px] text-muted-foreground truncate">{p.location}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
