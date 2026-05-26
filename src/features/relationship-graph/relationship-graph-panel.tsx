/**
 * RelationshipGraphPanel — vollwertige Page-Komponente (kein Modal).
 *
 * Wird in den Hubs als Tab oder View-Modus eingebunden statt als Overlay.
 * Layout-Konventionen wie die anderen Hub-Panels:
 *   - 1./2.-Balken-Toolbar mit toolbar-height
 *   - Inhaltsbereich darunter mit flex-1
 *   - Kein Modal-Overlay, kein onClose
 *
 * Pivot-History und Such-Logik bleiben internal state.
 */

import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Loader2 } from 'lucide-react';
import { sessionStore } from '@/core/session/session-store';
import { useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import type { GraphAdapter, GraphData, GraphNode } from './graph-types';
import { resolveSymbol } from './graph-symbols';
import { useT } from "@/lib/i18n/use-t";

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export interface RelationshipGraphPanelProps {
    adapter: GraphAdapter;
    rootId: string;
    rootName: string;
    /** Optionale Adapter-spezifische Filter/Toggle-Optionen. */
    options?: Record<string, unknown>;
    /** Zusaetzliche Toolbar-Buttons rechts vom Suchfeld. */
    toolbarSlot?: JSX.Element;
    /** Wenn der Caller (z.B. ein Tab-Container) den Pivot via URL/State sync will. */
    onPivotChange?: (target: { id: string; name: string }) => void;
}

export function RelationshipGraphPanel({
    adapter, rootId, rootName, options, toolbarSlot, onPivotChange,
}: RelationshipGraphPanelProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const navigate = useNavigate();

    // Re-init wenn rootId von aussen aendert (Hub navigiert zu anderem Kontakt)
    const [currentRoot, setCurrentRoot] = useState<{ id: string; name: string }>({ id: rootId, name: rootName });
    useEffect(() => {
        setCurrentRoot({ id: rootId, name: rootName });
        setPivotHistory([]);
    }, [rootId, rootName]);

    const [pivotHistory, setPivotHistory] = useState<{ id: string; name: string }[]>([]);
    const [data, setData] = useState<GraphData | null>(null);
    const [loading, setLoading] = useState(true);
    const [reheatKey, setReheatKey] = useState(0);
    const [searchInput, setSearchInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

    // Graph-Tuning: Tiefe (Hops) + Aeste (Knoten-Limit). Persistiert in
    // localStorage damit es ueber Sessions bleibt.
    const [hopLimit, setHopLimit] = useState<number>(() => {
        if (typeof window === 'undefined') return 1;
        const v = parseInt(window.localStorage.getItem('prilog:graph:hopLimit') ?? '', 10);
        return Number.isFinite(v) && v >= 1 && v <= 4 ? v : 1;
    });
    const [branchLimit, setBranchLimit] = useState<number>(() => {
        if (typeof window === 'undefined') return 20;
        const v = parseInt(window.localStorage.getItem('prilog:graph:branchLimit') ?? '', 10);
        return Number.isFinite(v) && v >= 5 && v <= 100 ? v : 20;
    });
    const [showTasks, setShowTasks] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem('prilog:graph:showTasks') === '1';
    });
    const [showFiles, setShowFiles] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem('prilog:graph:showFiles') === '1';
    });
    const persistTuning = (key: string, value: string) => {
        try { window.localStorage.setItem(key, value); } catch { /* localStorage blocked */ }
    };

    // options-Merge: Caller-Optionen + Graph-Tuning. Memoization stabil halten.
    const mergedOptions = useMemo(() => ({
        ...(options ?? {}),
        hopLimit,
        branchLimit,
        showTasks,
        showFiles,
    }), [options, hopLimit, branchLimit, showTasks, showFiles]);

    useEffect(() => {
        if (!jwt) return;
        let aborted = false;
        setLoading(true);
        (async () => {
            try {
                const result = await adapter.loadGraph({ rootId: currentRoot.id, jwt, options: mergedOptions });
                if (!aborted) { setData(result); setLoading(false); }
            } catch (err) {
                if (!aborted) { console.error('[graph] loadGraph failed', err); setLoading(false); }
            }
        })();
        return () => { aborted = true; };
    }, [adapter, currentRoot.id, jwt, mergedOptions]);

    const pivotTo = useCallback((target: { id: string; name: string }) => {
        setPivotHistory(prev => [...prev, currentRoot]);
        setCurrentRoot(target);
        setSearchInput('');
        setShowSuggestions(false);
        onPivotChange?.(target);
    }, [currentRoot, onPivotChange]);

    const goBack = useCallback(() => {
        setPivotHistory(prev => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const previous = next.pop()!;
            setCurrentRoot(previous);
            onPivotChange?.(previous);
            return next;
        });
    }, [onPivotChange]);

    const reheat = () => setReheatKey(k => k + 1);

    // Entwirren-Boost: setzt fuer 4s erhoehte Repulsion + laengere Kanten +
    // schwaechere Gravity. Danach kehrt der Graph zu den auto-skalierten
    // Standard-Forces zurueck. Wirkt wie ein "Atmen" das Knoten auseinander
    // schiebt und sich danach geordneter neu setzen laesst.
    const [untangleBoost, setUntangleBoost] = useState(false);
    const untangle = () => {
        setUntangleBoost(true);
        setReheatKey(k => k + 1);
        window.setTimeout(() => {
            setUntangleBoost(false);
            setReheatKey(k => k + 1);
        }, 4000);
    };

    // Kategorie-Filter (eigene Checkbox-Leiste statt ECharts-Legende).
    // hiddenCategories enthaelt Kategorie-Namen die ausgeblendet sind.
    // Reset bei jeder neuen Datenladung — sonst bleiben Filter haengen.
    const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
    useEffect(() => { setHiddenCategories(new Set()); }, [currentRoot.id]);
    const toggleCategory = (name: string) => {
        setHiddenCategories(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    // Nur Kategorien anzeigen, die mind. einen Knoten haben (Sinn-Filter).
    const visibleCategories = useMemo(() => {
        if (!data) return [];
        const used = new Set<number>();
        for (const n of data.nodes) used.add(n.category);
        return data.categories
            .map((cat, idx) => ({ cat, idx }))
            .filter(({ idx }) => used.has(idx))
            .map(({ cat }) => cat);
    }, [data]);

    const searchSuggestions = useMemo(() => {
        const q = searchInput.trim();
        if (q.length < 1) return [];
        return adapter.searchPivotTargets(q).filter(c => c.id !== currentRoot.id).slice(0, 8);
    }, [searchInput, adapter, currentRoot.id]);

    const option = useMemo(() => {
        if (!data) return {};
        return {
            backgroundColor: 'transparent',
            animation: true,
            tooltip: {
                trigger: 'item' as const,
                formatter: (p: { dataType: string; data: { id?: string; name?: string; label?: { formatter?: string } } }) => {
                    if (p.dataType === 'edge') return p.data.label?.formatter ?? '';
                    if (p.dataType !== 'node') return '';
                    const n = data.nodes.find(x => x.id === p.data.id);
                    if (!n) return `<b>${escapeHtml(p.data.name ?? '')}</b>`;
                    const lines = [`<b style="font-size:13px">${escapeHtml(n.name)}</b>`];
                    if (n.subtitle) lines.push(`<span style="opacity:0.7">${escapeHtml(n.subtitle)}</span>`);
                    if (n.pivotable !== false) lines.push(`<span style="opacity:0.5; font-size:10px; margin-top:4px; display:block">Klick: Pivot</span>`);
                    return `<div style="font-size:11px; line-height:1.5">${lines.join('<br/>')}</div>`;
                },
                backgroundColor: 'rgba(255,255,255,0.96)',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                padding: [8, 10],
                extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); max-width: 240px;',
            },
            // ECharts-Legende ausgeblendet — wir rendern eine eigene
            // Checkbox-Leiste unter dem Graph (siehe JSX). hiddenCategories
            // filtert die Knoten direkt im data.map.
            legend: [{ show: false }],
            series: [{
                type: 'graph' as const,
                layout: 'force' as const,
                roam: true,
                draggable: true,
                center: ['50%', '50%'],
                zoom: 1,
                symbol: 'circle' as const,
                edgeSymbol: ['none', 'arrow'] as ['none', 'arrow'],
                edgeSymbolSize: [0, 6],
                label: {
                    show: true,
                    position: 'right' as const,
                    fontSize: 11,
                    color: '#1f2937',
                    backgroundColor: 'rgba(255,255,255,0.85)',
                    padding: [3, 6],
                    borderRadius: 4,
                },
                emphasis: {
                    focus: 'adjacency' as const,
                    scale: 1.15,
                    lineStyle: { width: 3 },
                    label: { fontWeight: 700 },
                },
                blur: { itemStyle: { opacity: 0.25 }, lineStyle: { opacity: 0.1 } },
                categories: data.categories.map(c => ({ name: c.name, itemStyle: { color: c.color } })),
                // Force-Parameter automatisch an Knoten-Anzahl skaliert.
                // Mehr Knoten → mehr Abstossung + laengere Kanten = weniger
                // Ueberlapp. Im untangleBoost zusaetzlich ~80% mehr Spreizung.
                force: (() => {
                    const n = data.nodes.length;
                    const baseRepulsion = Math.max(380, 60 * n);
                    const baseEdgeMin = Math.max(80, 6 * Math.min(n, 30));
                    const baseEdgeMax = baseEdgeMin * 2.2;
                    const boost = untangleBoost ? 1.8 : 1;
                    return {
                        repulsion: baseRepulsion * boost,
                        gravity: untangleBoost ? 0.05 : 0.2,
                        edgeLength: [baseEdgeMin * boost, baseEdgeMax * boost],
                        friction: untangleBoost ? 0.08 : 0.18,
                        layoutAnimation: true,
                    };
                })(),
                data: data.nodes
                    .filter(n => !hiddenCategories.has(data.categories[n.category]?.name ?? ''))
                    .map(n => {
                        // Color-Vorrang: explizites n.color (Adapter-Override) >
                        // Kategorie-Farbe. Wird z.B. fuer Tree-vererbte Space-Farben
                        // benutzt — alle Spaces einer Schul-Hierarchie teilen die
                        // Farbe des Top-Spaces.
                        const color = n.color ?? data.categories[n.category]?.color ?? '#6b7280';
                        const symbol = resolveSymbol(n);
                        return {
                            id: n.id, name: n.name, category: n.category, symbolSize: n.symbolSize,
                            symbol,
                            symbolKeepAspect: true,
                            itemStyle: { color, shadowBlur: 12, shadowColor: color + '66' },
                            label: { show: true, fontWeight: n.id === currentRoot.id ? 700 : 500 },
                        };
                    }),
                links: (() => {
                    // Visible-Set fuer Edge-Filter — Kanten zu/von versteckten Knoten weglassen.
                    const visibleNodeIds = new Set(
                        data.nodes
                            .filter(n => !hiddenCategories.has(data.categories[n.category]?.name ?? ''))
                            .map(n => n.id),
                    );
                    return data.edges
                        .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
                        .map((e, i) => {
                            const sourceNode = data.nodes.find(n => n.id === e.source);
                            const color = e.color ?? (sourceNode ? data.categories[sourceNode.category]?.color : '#9ca3af');
                            return {
                                id: `e${i}`, source: e.source, target: e.target,
                                label: e.label ? { show: true, formatter: e.label } : undefined,
                                lineStyle: {
                                    color, width: e.width ?? 2,
                                    type: e.dashed ? 'dashed' as const : 'solid' as const, curveness: 0.1,
                                },
                            };
                        });
                })(),
                lineStyle: { color: 'source', width: 2, curveness: 0.1, opacity: 0.85 },
                animationDurationUpdate: 800,
                animationEasingUpdate: 'quinticInOut' as const,
            }],
        };
    }, [data, currentRoot.id, untangleBoost, hiddenCategories]);

    return (
        <div className="flex h-full flex-col">
            {/* 2. Balken (Tool-Bar) — analog NavBar im calendar-panel */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name={adapter.icon} size={16} className="text-primary" />
                <span className="truncate text-sm font-semibold">{currentRoot.name}</span>
                {pivotHistory.length > 0 && (
                    <button onClick={goBack}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('relationship-graph.relationship_graph.zurueck')}>
                        <MaterialIcon name="arrow_back" size={14} />
                    </button>
                )}

                <div className="relative ml-2 flex-1 max-w-md">
                    <MaterialIcon name="search" size={14}
                        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={e => { setSearchInput(e.target.value); setShowSuggestions(true); }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder={t('relationship-graph.relationship_graph.pivot-ziel_suchen')}
                        className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                    />
                    {showSuggestions && searchSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-background shadow-lg">
                            {searchSuggestions.map(c => (
                                <button key={c.id}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); pivotTo(c); }}
                                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-muted">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{c.name}</p>
                                        {c.subtitle && <p className="truncate text-[10px] text-muted-foreground">{c.subtitle}</p>}
                                    </div>
                                    <MaterialIcon name="account_tree" size={12} className="size-3 text-muted-foreground" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {toolbarSlot}

                {/* Tuning-Regler: Tiefe (Hops) + Aeste (Knoten-Limit) */}
                <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]" title={t('relationship-graph.relationship_graph.wie_weit_der_graph_vom_mittelpunkt_aus_b')}>
                    <MaterialIcon name="account_tree" size={14} className="size-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('relationship-graph.relationship_graph.tiefe')}</span>
                    <input
                        type="range"
                        min={1} max={4} step={1}
                        value={hopLimit}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); setHopLimit(v); persistTuning('prilog:graph:hopLimit', String(v)); }}
                        className="w-16 accent-primary"
                    />
                    <span className="w-3 text-center font-mono tabular-nums">{hopLimit}</span>
                </div>

                <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]" title={t('relationship-graph.relationship_graph.maximale_anzahl_aesteknoten_pro_ebene')}>
                    <MaterialIcon name="hub" size={14} className="size-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('relationship-graph.relationship_graph.aeste')}</span>
                    <input
                        type="range"
                        min={5} max={100} step={5}
                        value={branchLimit}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); setBranchLimit(v); persistTuning('prilog:graph:branchLimit', String(v)); }}
                        className="w-20 accent-primary"
                    />
                    <span className="w-7 text-center font-mono tabular-nums">{branchLimit}</span>
                </div>

                <button type="button"
                    onClick={() => { const next = !showTasks; setShowTasks(next); persistTuning('prilog:graph:showTasks', next ? '1' : '0'); }}
                    className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]',
                        showTasks ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
                    title={t('relationship-graph.relationship_graph.aufgaben_pro_space_anzeigen')}>
                    <MaterialIcon name="checklist" size={14} className="size-3.5" />
                    {t('relationship-graph.relationship_graph.aufgaben')}
                </button>

                <button type="button"
                    onClick={() => { const next = !showFiles; setShowFiles(next); persistTuning('prilog:graph:showFiles', next ? '1' : '0'); }}
                    className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]',
                        showFiles ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
                    title={t('relationship-graph.relationship_graph.dateien_pro_space_anzeigen')}>
                    <MaterialIcon name="description" size={14} className="size-3.5" />
                    {t('relationship-graph.relationship_graph.dateien')}
                </button>

                <button onClick={untangle}
                    disabled={untangleBoost}
                    className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]',
                        untangleBoost ? 'cursor-wait bg-primary/10 text-primary' : 'hover:bg-muted')}
                    title={t('relationship-graph.relationship_graph.graph_spreizen_und_neu_setzen_lassen_kno')}>
                    <MaterialIcon name="open_in_full" size={14} className="size-3.5 text-emerald-500" />
                    {untangleBoost ? 'Entwirre...' : 'Entwirren'}
                </button>

                <button onClick={reheat}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
                    title={t('relationship-graph.relationship_graph.graph_neu_schwingen_lassen')}>
                    <MaterialIcon name="bolt" size={14} className="size-3.5 text-amber-500" />
                    {t('relationship-graph.relationship_graph.neu_mischen')}
                </button>
            </div>

            {/* Inhalt */}
            <div className="min-h-0 flex-1">
                {loading ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                ) : !data || data.nodes.length <= 1 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <MaterialIcon name={adapter.icon} size={48} className="text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('relationship-graph.relationship_graph.noch_keine_verknuepfungen')}</p>
                        <p className="text-[11px] text-muted-foreground">{t('relationship-graph.relationship_graph.verknuepfungen_entstehen_durch_zuordnung')}</p>
                    </div>
                ) : (
                    <ReactECharts
                        key={reheatKey}
                        option={option}
                        style={{ height: '100%', width: '100%', cursor: 'pointer' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge={true}
                        onEvents={{
                            click: (params: { dataType?: string; data?: { id?: string } }) => {
                                if (params.dataType !== 'node' || !params.data?.id) return;
                                if (params.data.id === currentRoot.id) return;
                                const node = data?.nodes.find(n => n.id === params.data?.id);
                                if (!node || node.pivotable === false) return;
                                pivotTo({ id: node.id, name: node.name });
                            },
                            contextmenu: (params: { dataType?: string; data?: { id?: string }; event?: { event?: MouseEvent } }) => {
                                if (params.dataType !== 'node' || !params.data?.id) return;
                                const node = data?.nodes.find(n => n.id === params.data?.id);
                                if (!node) return;
                                const evt = params.event?.event;
                                if (evt?.preventDefault) evt.preventDefault();
                                setContextMenu({ x: evt?.clientX ?? 100, y: evt?.clientY ?? 100, node });
                            },
                        }}
                    />
                )}
            </div>

            {/* Kategorie-Filter (eigene Checkboxen statt ECharts-Legende).
                Zeigt nur Kategorien an, die mind. einen Knoten haben. */}
            {!loading && data && visibleCategories.length > 0 && (
                <div className="shrink-0 border-t bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
                        {visibleCategories.map(cat => {
                            const isHidden = hiddenCategories.has(cat.name);
                            return (
                                <label key={cat.name} className="flex cursor-pointer items-center gap-1.5 select-none">
                                    <input
                                        type="checkbox"
                                        checked={!isHidden}
                                        onChange={() => toggleCategory(cat.name)}
                                        className="size-3.5 accent-primary"
                                    />
                                    <span className={cn(isHidden && 'text-muted-foreground line-through')}>
                                        {cat.name}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {contextMenu && (
                <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}>
                    <div className="absolute min-w-[200px] rounded-md border bg-background py-1 shadow-lg"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={e => e.stopPropagation()}>
                        <div className="border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground truncate">
                            {contextMenu.node.name}
                        </div>
                        {contextMenu.node.id !== currentRoot.id && contextMenu.node.pivotable !== false && (
                            <button onClick={() => {
                                pivotTo({ id: contextMenu.node.id, name: contextMenu.node.name });
                                setContextMenu(null);
                            }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                                <MaterialIcon name="account_tree" size={14} className="text-primary" />
                                {t('relationship-graph.relationship_graph.als_mittelpunkt')}
                            </button>
                        )}
                        {adapter.nodeActions?.(contextMenu.node).map((action, i) => (
                            <button key={i}
                                onClick={() => { action.onClick(navigate, () => setContextMenu(null)); }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                                <MaterialIcon name={action.icon} size={14} />
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

void cn; // referenced indirectly via panels
