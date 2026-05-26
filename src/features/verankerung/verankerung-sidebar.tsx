/**
 * verankerung-sidebar.tsx — Sidebar-Inhalt der Verankerungs-Welt.
 *
 * Die Konzept-Master-Liste lebt (wie Ordner/Trees anderer Hubs) in der
 * Sidebar. Auswahl → /verankerung/:flowId. Das Hauptfenster zeigt dann
 * die Konzept-Detailansicht, das Detailfenster die Hilfe-Texte.
 */
import { type JSX, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useT } from '@/lib/i18n/use-t';
import { conceptCockpitGateway, type ConceptFlowSummary } from '@/gateways/platform/concept-cockpit-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';

function statusClass(s: string): string {
    return s === 'review_faellig' ? 'bg-amber-400'
        : s === 'beschlossen' || s === 'in_umsetzung' ? 'bg-primary'
        : s === 'archiviert' ? 'bg-muted-foreground/40'
        : 'bg-muted-foreground/60';
}

export function VerankerungSidebar({ collapsed }: { collapsed: boolean }): JSX.Element | null {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const navigate = useNavigate();
    const { flowId } = useParams();

    const [items, setItems] = useState<ConceptFlowSummary[] | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!jwt) return;
        try { setItems((await conceptCockpitGateway.listConcepts(jwt)).concepts); }
        catch { /* still */ }
    }, [jwt]);
    useEffect(() => { void load(); }, [load]);

    if (collapsed) return null;

    const q = search.trim().toLowerCase();
    const visible = (items ?? [])
        .filter(c => showArchived || c.status !== 'archived')
        .filter(c => !q || c.name.toLowerCase().includes(q));

    const act = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        try { await fn(); await load(); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1 px-1">
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('verankerung.title', { defaultValue: 'Konzepte' })} · {visible.length}
                </span>
                <button disabled={busy} onClick={() => navigate('/verankerung/neu')}
                    title={t('verankerung.createConcept', { defaultValue: 'Konzept anlegen' })}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50">
                    <MaterialIcon name="add" size={18} />
                </button>
            </div>

            <div className="relative px-1">
                <MaterialIcon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="search" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={t('verankerung.searchPlaceholder', { defaultValue: 'Konzepte durchsuchen' })}
                    className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                />
            </div>

            <label className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
                {t('verankerung.showArchived', { defaultValue: 'Archivierte anzeigen' })}
            </label>

            <div className="space-y-0.5">
                {items && visible.length === 0 && (
                    <p className="px-2 py-3 text-[12px] text-muted-foreground">
                        {t('verankerung.emptyTitle', { defaultValue: 'Noch kein Konzept angelegt' })}
                    </p>
                )}
                {visible.map(c => {
                    const active = c.id === flowId;
                    const d = c.summary.decision;
                    return (
                        <div key={c.id}
                            className={`group rounded-md px-2 py-1.5 transition-colors ${active ? 'bg-sidebar-active' : 'hover:bg-sidebar-accent'}`}>
                            <button onClick={() => navigate(`/verankerung/${encodeURIComponent(c.id)}`)}
                                className="flex w-full items-center gap-2 text-left">
                                <span className={`size-2 shrink-0 rounded-full ${statusClass(d?.status ?? '')}`}
                                    title={d?.status ?? ''} />
                                <span className="flex-1 truncate text-[13px]">{c.name}</span>
                                {d?.reviewDue.overdue && <MaterialIcon name="warning" size={13} className="shrink-0 text-amber-500" />}
                            </button>
                            <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button disabled={busy}
                                    onClick={() => { const nm = window.prompt(t('verankerung.conceptName', { defaultValue: 'Name des Konzepts' }), c.name); if (nm && nm.trim() && nm.trim() !== c.name) void act(() => conceptCockpitGateway.patchConcept(jwt, c.id, { name: nm.trim() })); }}
                                    className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-background disabled:opacity-50">
                                    {t('verankerung.rename', { defaultValue: 'Umbenennen' })}
                                </button>
                                <button disabled={busy}
                                    onClick={() => { const toArchive = c.status !== 'archived'; if (!toArchive || window.confirm(t('verankerung.confirmArchive', { defaultValue: 'Konzept archivieren? Es wird ausgeblendet, bleibt aber erhalten.' }))) void act(() => conceptCockpitGateway.patchConcept(jwt, c.id, { status: toArchive ? 'archived' : 'active' })); }}
                                    className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-background disabled:opacity-50">
                                    {c.status === 'archived' ? t('verankerung.unarchive', { defaultValue: 'Reaktivieren' }) : t('verankerung.archive', { defaultValue: 'Archivieren' })}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
