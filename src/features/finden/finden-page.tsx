/**
 * FindenPage — globale Volltextsuche.
 *
 * Layout: Such-Eingabe oben + Ergebnis-Liste fuellt den Rest.
 * Die Typ-/Sort-/Group-Filter sitzen in der App-Sidebar (FindenWorld).
 * Geteilter State ueber finden-filter-store, Live-Counts ueber
 * finden-counts-store.
 */

import { type JSX, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { cn } from '@/lib/utils';
import {
    findenFilterStore,
    FINDEN_ALL_TYPES,
    type FindenResultType,
} from './finden-filter-store';
import { findenCountsStore } from './finden-counts-store';
import { useT } from "@/lib/i18n/use-t";

interface FindenResult {
    type: FindenResultType;
    id: string;
    title: string;
    snippet: string;
    context: string | null;
    url: string;
    updatedAt: string | null;
    score: number;
}

interface FindenResponse {
    query: string;
    results: FindenResult[];
    counts: Record<FindenResultType, number>;
    durationMs: number;
}

const TYPE_LABEL_KEY: Record<FindenResultType, string> = {
    document: 'app.misc.dokumente',
    contact: 'common.external',
    member: 'common.members',
    space: 'app.misc.spaces',
    task: 'app.misc.aufgaben',
    event: 'common.appointments',
    tag: 'app.misc.tags',
    transcription: 'app.misc.transkriptionen',
};

const TYPE_ICON: Record<FindenResultType, string> = {
    document: 'description',
    contact: 'contacts',
    member: 'person',
    space: 'grid_view',
    task: 'check_box',
    event: 'calendar_today',
    tag: 'sell',
    transcription: 'mic',
};

export function FindenPage(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const filter = useSyncExternalStore(findenFilterStore.subscribe, findenFilterStore.getSnapshot);

    const initialQ = searchParams.get('q') ?? '';
    const [input, setInput] = useState(initialQ);
    const [activeQuery, setActiveQuery] = useState(initialQ);
    const [data, setData] = useState<FindenResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounce: 300ms nach letzter Tastendruck
    useEffect(() => {
        const handle = window.setTimeout(() => {
            setActiveQuery(input.trim());
            const next = new URLSearchParams(searchParams);
            if (input.trim()) next.set('q', input.trim()); else next.delete('q');
            setSearchParams(next, { replace: true });
        }, 300);
        return () => window.clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input]);

    // Fetch wenn Query oder Filter sich aendert
    useEffect(() => {
        if (!jwt || activeQuery.length === 0) {
            setData(null);
            findenCountsStore.clear();
            return;
        }
        let aborted = false;
        setLoading(true);
        setError(null);
        const gw = createPlatformGateway();
        const typesParam = filter.enabledTypes.size === FINDEN_ALL_TYPES.length
            ? ''
            : `&types=${Array.from(filter.enabledTypes).join(',')}`;
        gw.fetchJson<FindenResponse>(jwt, `/platform/v1/finden?q=${encodeURIComponent(activeQuery)}${typesParam}&limit=20`)
            .then(res => {
                if (!aborted) {
                    setData(res);
                    findenCountsStore.setCounts(res.counts);
                }
            })
            .catch(err => { if (!aborted) setError(err instanceof Error ? err.message : 'Suche fehlgeschlagen'); })
            .finally(() => { if (!aborted) setLoading(false); });
        return () => { aborted = true; };
    }, [jwt, activeQuery, filter.enabledTypes]);

    const sortedResults = useMemo(() => {
        const r = data?.results ?? [];
        const sorted = [...r];
        if (filter.sortBy === 'score') sorted.sort((a, b) => b.score - a.score);
        else if (filter.sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, 'de'));
        else if (filter.sortBy === 'date') {
            sorted.sort((a, b) => {
                const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return tb - ta;
            });
        }
        return sorted;
    }, [data?.results, filter.sortBy]);

    const grouped = useMemo(() => {
        if (!filter.groupByType) return null;
        const groups = new Map<FindenResultType, FindenResult[]>();
        for (const r of sortedResults) {
            const arr = groups.get(r.type) ?? [];
            arr.push(r);
            groups.set(r.type, arr);
        }
        return groups;
    }, [sortedResults, filter.groupByType]);

    return (
        <div className="flex h-full flex-col">
            {/* Such-Eingabe oben */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <MaterialIcon name="search" size={16} className="text-primary" />
                <span className="text-sm font-semibold">{t('finden.finden_page.finden')}</span>
                <div className="relative ml-2 flex-1">
                    <MaterialIcon name="search" size={14}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={t('finden.finden_page.suche_in_allen_inhalten_kontakte_dokumen')}
                        className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                    />
                    {input && (
                        <button onClick={() => setInput('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-muted">
                            <MaterialIcon name="close" size={14} />
                        </button>
                    )}
                </div>

                {data && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                        {data.results.length} {t('finden.finden_page.treffer')} {data.durationMs}ms
                    </span>
                )}
            </div>

            {/* Ergebnis-Liste */}
            <ScrollArea className="flex-1">
                {activeQuery.length === 0 ? (
                    <EmptyState
                        icon="search"
                        title={t('finden.finden_page.was_moechtest_du_finden')}
                        hint="Tippe einen Begriff ein — es werden alle Inhalte durchsucht in denen Du Mitglied bist. Die Filter (Typ, Sort, Gruppierung) findest Du links in der Sidebar."
                    />
                ) : loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <EmptyState icon="error_outline" title={t('finden.finden_page.fehler')} hint={error} />
                ) : !data || data.results.length === 0 ? (
                    <EmptyState
                        icon="search_off"
                        title={t('finden.finden_page.nichts_gefunden')}
                        hint={`Keine Treffer fuer "${activeQuery}". Versuche andere Begriffe oder erweitere die Typ-Auswahl in der Sidebar.`}
                    />
                ) : grouped ? (
                    <div className="divide-y">
                        {FINDEN_ALL_TYPES.filter(_t => (grouped.get(_t)?.length ?? 0) > 0).map(_t => (
                            <ResultGroup
                                key={_t}
                                type={_t}
                                results={grouped.get(_t) ?? []}
                                onClick={(r) => navigate(r.url)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="divide-y">
                        {sortedResults.map(r => (
                            <ResultRow key={`${r.type}:${r.id}`} result={r} onClick={() => navigate(r.url)} />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

function ResultGroup({ type, results, onClick }: {
    type: FindenResultType; results: FindenResult[]; onClick: (r: FindenResult) => void;
}): JSX.Element {
    const t = useT();
    return (
        <div>
            <div className="flex items-center gap-2 bg-muted/30 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name={TYPE_ICON[type]} size={12} />
                <span>{t(TYPE_LABEL_KEY[type])}</span>
                <span className="ml-auto text-[10px]">{results.length}</span>
            </div>
            {results.map(r => (
                <ResultRow key={`${r.type}:${r.id}`} result={r} onClick={() => onClick(r)} />
            ))}
        </div>
    );
}

function ResultRow({ result, onClick }: { result: FindenResult; onClick: () => void }): JSX.Element {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
        >
            <MaterialIcon name={TYPE_ICON[result.type]} size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{result.title || '(ohne Titel)'}</span>
                    {result.updatedAt && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                            {new Date(result.updatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </span>
                    )}
                </div>
                {result.snippet && (
                    <p
                        className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-900/60"
                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                )}
                {result.context && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{result.context}</p>
                )}
            </div>
        </button>
    );
}

function EmptyState({ icon, title, hint }: { icon: string; title: string; hint: string }): JSX.Element {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center">
            <MaterialIcon name={icon} size={48} className="text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className={cn('max-w-md text-[11px] text-muted-foreground')}>{hint}</p>
        </div>
    );
}
