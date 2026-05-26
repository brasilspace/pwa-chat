/**
 * cascade-designer.tsx — Grafik-Layer Designer + Player + Flow-Log
 */

import { type JSX, useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X, Play, Clock, User, ChevronDown, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { env } from '@/core/config/env';
import { ELEMENT_TYPES, getElementDef, getVisibilityOptions, isElementVisible, extractVariables } from './cascade-elements';
import { useT } from "@/lib/i18n/use-t";

// ─── Element-Kategorien fuer die Palette ─────────────────────────────────────

const ELEMENT_CATEGORIES: { key: string; label: string; types: string[] }[] = [
    { key: 'input', label: 'Eingabe', types: ['decision', 'dropdown', 'checklist', 'radio', 'textfield', 'form', 'rating', 'quiz', 'table'] },
    { key: 'display', label: 'Anzeige', types: ['info', 'video', 'notification'] },
    { key: 'data', label: 'Daten', types: ['setVariable', 'createDocument', 'webhook'] },
    { key: 'logic', label: 'Logik', types: ['condition', 'timestamp', 'delay'] },
    { key: 'actions', label: 'Aktionen', types: ['link', 'space', 'createSpace', 'createTasks', 'button'] },
    { key: 'flow', label: 'Flow-Steuerung', types: ['parallel_split', 'parallel_join', 'checkpoint'] },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeDesign {
    heading?: string;
    body?: string;
    yesLabel?: string;
    noLabel?: string;
}

interface DesignerNode {
    id: string;
    title: string;
    nodeType?: string;
    nodeConfig?: any;
    nodeState?: any;
}

interface DesignerEdge {
    id: string;
    sourceColumnId: string;
    targetColumnId: string;
    condition?: { answer?: string } | null;
}

interface LogEntry {
    id: string;
    sessionId: string;
    userId: string;
    userName: string;
    columnTitle: string;
    action: string;
    detail?: string;
    createdAt: string;
}

const api = (path: string, jwt: string, init?: RequestInit) =>
    fetch(`${env.platformBaseUrl}/platform/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...init?.headers },
    });

// ─── Designer Panel ───────────────────────────────────────────────────────────

interface DesignerProps {
    node: DesignerNode;
    allNodes?: { id: string; title: string }[];
    onSave: (design: NodeDesign) => void;
    onClose: () => void;
    onPreview: () => void;
}

export function CascadeDesigner({ node, allNodes, onSave, onClose, onPreview }: DesignerProps): JSX.Element {
    const t = useT();
    const existing: NodeDesign = node.nodeConfig?.design ?? {};
    const [heading, setHeading] = useState(existing.heading ?? node.title);
    const [body, setBody] = useState(existing.body ?? '');
    const [yesLabel, setYesLabel] = useState(existing.yesLabel ?? 'Ja');
    const [noLabel, setNoLabel] = useState(existing.noLabel ?? 'Nein');
    const [elements, setElements] = useState<any[]>(node.nodeConfig?.elements ?? []);
    const [newOption, setNewOption] = useState('');
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    const handleSave = () => {
        onSave({ heading, body, _elements: elements } as any);
    };

    const updateElement = (idx: number, patch: any) => {
        setElements(prev => prev.map((el, i) => i === idx ? { ...el, ...patch } : el));
    };

    const addOptionToElement = (idx: number, label: string) => {
        setElements(prev => prev.map((el, i) => i === idx ? { ...el, options: [...(el.options ?? []), { id: `opt-${Date.now()}`, label }] } : el));
    };

    const removeOptionFromElement = (elIdx: number, optId: string) => {
        setElements(prev => prev.map((el, i) => i === elIdx ? { ...el, options: (el.options ?? []).filter((o: any) => o.id !== optId) } : el));
    };

    const removeElement = (idx: number) => {
        setElements(prev => prev.filter((_, i) => i !== idx));
    };

    const moveElement = (fromIdx: number, toIdx: number) => {
        if (fromIdx === toIdx) return;
        setElements(prev => {
            const next = [...prev];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            return next;
        });
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
                <span className="text-xs font-semibold">{t('cascade.cascade_designer.designer')} {node.title}</span>
                <div className="flex items-center gap-1">
                    <button onClick={onPreview} className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20">
                        <MaterialIcon name="play_arrow" size={16} className="size-3" /> {t('cascade.cascade_designer.vorschau')}
                    </button>
                    <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* Live preview */}
                <div className="rounded-2xl border-2 border-primary/20 bg-card p-5 space-y-3 shadow-sm max-w-sm mx-auto">
                    <h2 className="text-lg font-bold">{heading || t('common.heading')}</h2>
                    {body && <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>}
                    {elements.length === 0 && (
                        <div className="rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground">{t('cascade.cascade_designer.weiter')}</div>
                    )}
                </div>

                <div className="h-px bg-border" />

                {/* Überschrift */}
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_designer.ueberschrift')}</label>
                    <input value={heading} onChange={(e) => setHeading(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>

                {/* Text */}
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_designer.text')}</label>
                    <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>

                {/* Elemente — via Registry */}
                {elements.map((el, idx) => {
                    const def = getElementDef(el.type);
                    if (!def) return null;
                    return (
                        <div key={idx}
                            draggable
                            onDragStart={() => setDragIdx(idx)}
                            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                            onDragEnd={() => { if (dragIdx !== null && dragOverIdx !== null) moveElement(dragIdx, dragOverIdx); setDragIdx(null); setDragOverIdx(null); }}
                            className={cn("rounded-lg border p-3 space-y-2 transition-all",
                                dragIdx === idx && "opacity-40",
                                dragOverIdx === idx && dragIdx !== idx && "border-primary border-dashed")}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <MaterialIcon name="drag_indicator" size={16} className="size-3 text-muted-foreground/30 cursor-grab active:cursor-grabbing shrink-0" />
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">{def.label}</span>
                                </div>
                                <button onClick={() => removeElement(idx)} className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive">
                                    <MaterialIcon name="close" size={16} className="size-3" />
                                </button>
                            </div>
                            <input value={el.question ?? el.label ?? ''} onChange={(e) => {
                                const key = (el.type === 'checklist' || el.type === 'radio') ? 'label' : 'question';
                                updateElement(idx, { [key]: e.target.value });
                            }}
                                placeholder={t('cascade.cascade_designer.bezeichnung_frage')}
                                className="h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                            {/* Variablenname — nur für Elemente die Daten sammeln */}
                            {!['button', 'link', 'condition'].includes(el.type) && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground/60 shrink-0">{t('cascade.cascade_designer.variable')}</span>
                                    <input value={String(el.variableName ?? '')}
                                        onChange={(e) => updateElement(idx, { variableName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                                        placeholder={t('cascade.cascade_designer.zb_schweregrad')}
                                        className="h-6 flex-1 rounded border border-dashed border-border/50 bg-muted/20 px-2 text-[10px] font-mono outline-none focus:border-primary focus:bg-background" />
                                </div>
                            )}
                            {def.renderDesigner({
                                el, idx, allElements: elements,
                                onChange: (patch) => updateElement(idx, patch),
                                onAddOption: (label) => addOptionToElement(idx, label),
                                onRemoveOption: (optId) => removeOptionFromElement(idx, optId),
                                t,
                            })}
                            {/* Sichtbar wenn — conditional visibility */}
                            {/* Sichtbar wenn (IF) + Dann weiter zu (THEN) */}
                            <div className="pt-1 border-t border-border/30 space-y-1.5">
                                {(() => {
                                    const visOpts = getVisibilityOptions(idx, elements);
                                    if (visOpts.length === 0) return null;
                                    const currentVal = el.visibleWhen ? JSON.stringify(el.visibleWhen) : '';
                                    return (
                                        <div>
                                            <label className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">{t('cascade.cascade_designer.sichtbar_wenn_if')}</label>
                                            <select value={currentVal}
                                                onChange={(e) => updateElement(idx, { visibleWhen: e.target.value ? JSON.parse(e.target.value) : undefined })}
                                                className="mt-0.5 h-7 w-full rounded-lg border border-border/50 bg-muted/30 px-2 text-[10px] outline-none">
                                                <option value="">{t('cascade.cascade_designer.immer')}</option>
                                                {visOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                    );
                                })()}
                                {allNodes && allNodes.length > 1 && el.type === 'decision' && (
                                    <div className="space-y-1">
                                        <div>
                                            <label className="text-[9px] text-emerald-600 uppercase tracking-widest">{t('cascade.cascade_designer.bei')} {el.yesLabel ?? 'Ja'} {t('cascade.cascade_designer.weiter_zu')}</label>
                                            <select value={String(el.thenGoToYes ?? '')}
                                                onChange={(e) => updateElement(idx, { thenGoToYes: e.target.value || undefined })}
                                                className="mt-0.5 h-7 w-full rounded-lg border border-emerald-300/50 bg-emerald-50/30 dark:bg-emerald-900/10 px-2 text-[10px] outline-none">
                                                <option value="">{t('cascade.cascade_designer.intern_standard')}</option>
                                                {allNodes.map((n, i) => n.id !== node.id ? (
                                                    <option key={n.id} value={n.id}>#{i + 1} {n.title}</option>
                                                ) : null)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-red-600 uppercase tracking-widest">{t('cascade.cascade_designer.bei')} {el.noLabel ?? 'Nein'} {t('cascade.cascade_designer.weiter_zu')}</label>
                                            <select value={String(el.thenGoToNo ?? '')}
                                                onChange={(e) => updateElement(idx, { thenGoToNo: e.target.value || undefined })}
                                                className="mt-0.5 h-7 w-full rounded-lg border border-red-300/50 bg-red-50/30 dark:bg-red-900/10 px-2 text-[10px] outline-none">
                                                <option value="">{t('cascade.cascade_designer.intern_standard')}</option>
                                                {allNodes.map((n, i) => n.id !== node.id ? (
                                                    <option key={n.id} value={n.id}>#{i + 1} {n.title}</option>
                                                ) : null)}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                {allNodes && allNodes.length > 1 && el.type !== 'decision' && (
                                    <div>
                                        <label className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">{t('cascade.cascade_designer.dann_weiter_zu_then')}</label>
                                        <select value={String(el.thenGoTo ?? '')}
                                            onChange={(e) => updateElement(idx, { thenGoTo: e.target.value || undefined })}
                                            className="mt-0.5 h-7 w-full rounded-lg border border-border/50 bg-muted/30 px-2 text-[10px] outline-none">
                                            <option value="">{t('cascade.cascade_designer.kein_sprung')}</option>
                                            {allNodes.map((n, i) => n.id !== node.id ? (
                                                <option key={n.id} value={n.id}>#{i + 1} {n.title}</option>
                                            ) : null)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Element-Palette — kategorisiert */}
                <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-2">{t('cascade.cascade_designer.element_hinzufuegen')}</p>
                    {ELEMENT_CATEGORIES.map(cat => {
                        const defs = cat.types.map(_t => ELEMENT_TYPES.find(d => d.type === _t)).filter(Boolean) as typeof ELEMENT_TYPES;
                        if (defs.length === 0) return null;
                        return (
                            <div key={cat.key} className="mb-2 last:mb-0">
                                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">{cat.label}</p>
                                <div className="flex flex-wrap gap-1">
                                    {defs.map(def => (
                                        <button key={def.type}
                                            onClick={() => setElements(prev => [...prev, def.defaultConfig()])}
                                            className={cn("flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-[10px] transition-colors hover:border-primary/50 hover:bg-primary/5", def.color)}>
                                            {def.icon} {def.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="border-t px-4 py-2.5 shrink-0 bg-muted/20">
                <button onClick={handleSave}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    <MaterialIcon name="save" size={16} className="size-3.5" /> {t('cascade.cascade_designer.speichern')}
                </button>
            </div>
        </div>
    );
}

// ─── Player (Endnutzer-Ansicht mit Echtzeit-Logging) ──────────────────────────

interface PlayerProps {
    nodes: DesignerNode[];
    edges: DesignerEdge[];
    startNodeId: string;
    boardId: string;
    jwt: string;
    userId: string;
    userName: string;
    onClose: () => void;
    onNavigateApp?: (path: string) => void;
}

export function CascadePlayer({ nodes, edges, startNodeId, boardId, jwt, userId, userName, onClose, onNavigateApp }: PlayerProps): JSX.Element {
    const t = useT();
    const [currentNodeId, setCurrentNodeId] = useState(startNodeId);
    const [history, setHistory] = useState<string[]>([]);
    const [selectedOption, setSelectedOption] = useState('');
    const sessionIdRef = useRef(`flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    // Variablen über alle Knoten hinweg sammeln
    const collectedVarsRef = useRef<Record<string, unknown>>({});

    const node = nodes.find(n => n.id === currentNodeId);

    // Log-Eintrag senden (fire-and-forget)
    const log = useCallback((columnId: string, columnTitle: string, action: string, detail?: string) => {
        api(`/cascade-boards/${boardId}/flow-log`, jwt, {
            method: 'POST',
            body: JSON.stringify({ sessionId: sessionIdRef.current, columnId, columnTitle, action, detail, userName }),
        }).catch(() => { });
    }, [boardId, jwt, userName]);

    // Start loggen
    useEffect(() => {
        const startNode = nodes.find(n => n.id === startNodeId);
        if (startNode) log(startNode.id, startNode.title, 'start');
    }, []);

    const [elState, setElState] = useState<any>({});

    if (!node) return <div className="p-4 text-sm text-muted-foreground">{t('cascade.cascade_designer.knoten_nicht_gefunden')}</div>;

    const design: NodeDesign = node.nodeConfig?.design ?? {};
    const heading = design.heading ?? node.title;
    const body = design.body ?? '';
    const elements: any[] = node.nodeConfig?.elements ?? [];

    // Variablen einsammeln bevor der Knoten verlassen wird
    const collectCurrentVars = () => {
        const nodeVars = extractVariables(elements, elState);
        Object.assign(collectedVarsRef.current, nodeVars);
    };

    const navigateFlow = (answer?: string, option?: string) => {
        const outgoing = edges.filter(e => e.sourceColumnId === currentNodeId);
        let nextEdge: typeof outgoing[0] | undefined;

        // Suche nach passender Routing-Bedingung
        if (answer || option) {
            for (const e of outgoing) {
                const routing = (e.condition as any)?.routing as string | undefined;
                if (routing) {
                    const [, val] = routing.split(':');
                    if (answer && (val === answer || val === 'yes' && answer === 'yes' || val === 'no' && answer === 'no' || val === 'then' && answer === 'yes' || val === 'else' && answer === 'no')) { nextEdge = e; break; }
                    if (option && val === option) { nextEdge = e; break; }
                }
                // Legacy conditions
                if (answer && (e.condition as any)?.answer === answer) { nextEdge = e; break; }
                if (option && (e.condition as any)?.option === option) { nextEdge = e; break; }
            }
        }
        if (!nextEdge) nextEdge = outgoing.find(e => !e.condition);
        if (!nextEdge) nextEdge = outgoing[0];

        if (nextEdge) {
            collectCurrentVars();
            log(node.id, node.title, answer ? `answer_${answer}` : option ? 'select_option' : 'navigate', answer ?? option);
            setHistory(h => [...h, currentNodeId]);
            setCurrentNodeId(nextEdge.targetColumnId);
            setElState({});
        }
    };

    const handleFinish = () => {
        collectCurrentVars();

        log(node.id, node.title, 'finish');

        // Flow-Result speichern wenn Variablen gesammelt wurden
        const vars = collectedVarsRef.current;
        if (Object.keys(vars).length > 0) {
            api(`/cascade-boards/${boardId}/flow-results`, jwt, {
                method: 'POST',
                body: JSON.stringify({ sessionId: sessionIdRef.current, variables: vars }),
            }).catch(() => { });
        }

        onClose();
    };

    const goBack = () => {
        if (history.length > 0) {
            setCurrentNodeId(history[history.length - 1]);
            setHistory(h => h.slice(0, -1));
        } else {
            onClose();
        }
    };

    const hasNext = edges.some(e => e.sourceColumnId === currentNodeId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
            <div className="flex h-full w-full max-w-md flex-col mx-auto">
                <div className="flex items-center justify-between px-4 py-3 shrink-0">
                    <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                        <MaterialIcon name="chevron_left" size={16} className="size-4" /> {history.length > 0 ? t('common.back') : t('common.close')}
                    </button>
                    <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-8">
                    <div className="flex flex-col justify-center min-h-full">
                        <div className="space-y-6">
                            <h1 className="text-2xl font-bold leading-tight">{heading}</h1>
                            {body && <p className="text-base text-muted-foreground leading-relaxed">{body}</p>}
                        </div>

                        <div className="mt-8 space-y-3">
                            {/* Render elements — decisions navigate directly, others get one shared Weiter */}
                            {elements.map((el: any, idx: number) => {
                                const def = getElementDef(el.type);
                                if (!def) return null;
                                if (!isElementVisible(el, elements, elState)) return null;
                                const isDecisionType = el.type === 'decision';
                                return (
                                    <div key={idx}>
                                        {(el.question || el.label) && <p className="text-sm text-muted-foreground mb-2">{el.question ?? el.label}</p>}
                                        {def.renderPlayer({
                                            el, idx, state: elState, allElements: elements,
                                            onNavigate: (answer, option) => {
                                                collectCurrentVars();
                                                // Helper: prüfe ob Ziel-Knoten existiert
                                                const nodeExists = (id: string) => nodes.some(n => n.id === id);
                                                // Decision: Ja/Nein mit eigenen Zielen
                                                if (el.type === 'decision' && answer === 'yes' && el.thenGoToYes && nodeExists(el.thenGoToYes)) {
                                                    log(node.id, node.title, 'answer_yes', el.yesLabel ?? 'Ja');
                                                    setHistory(h => [...h, currentNodeId]);
                                                    setCurrentNodeId(el.thenGoToYes);
                                                    setElState({});
                                                    return;
                                                }
                                                if (el.type === 'decision' && answer === 'no' && el.thenGoToNo && nodeExists(el.thenGoToNo)) {
                                                    log(node.id, node.title, 'answer_no', el.noLabel ?? 'Nein');
                                                    setHistory(h => [...h, currentNodeId]);
                                                    setCurrentNodeId(el.thenGoToNo);
                                                    setElState({});
                                                    return;
                                                }
                                                // Allgemeiner thenGoTo — nur wenn Ziel existiert
                                                if (el.thenGoTo && nodeExists(el.thenGoTo)) {
                                                    log(node.id, node.title, 'navigate', `→ ${el.thenGoTo}`);
                                                    setHistory(h => [...h, currentNodeId]);
                                                    setCurrentNodeId(el.thenGoTo);
                                                    setElState({});
                                                } else {
                                                    // Fallback: normale Kanten-Navigation
                                                    navigateFlow(answer, option);
                                                }
                                            },
                                            onStateChange: setElState,
                                            onNavigateApp, jwt,
                                            hideNavigation: !isDecisionType && elements.length > 1,
                                            t,
                                        })}
                                    </div>
                                );
                            })}
                            {/* Shared Weiter button when multiple non-decision elements */}
                            {elements.length > 1 && !elements.some((el: any) => el.type === 'decision' && isElementVisible(el, elements, elState)) && (hasNext || elements.some((el: any) => el.thenGoTo)) && (
                                <button onClick={() => {
                                    collectCurrentVars();
                                    const elWithGoTo = elements.find((el: any) => el.thenGoTo && nodes.some(n => n.id === el.thenGoTo) && isElementVisible(el, elements, elState));
                                    if (elWithGoTo) {
                                        log(node.id, node.title, 'navigate', `→ ${elWithGoTo.thenGoTo}`);
                                        setHistory(h => [...h, currentNodeId]);
                                        setCurrentNodeId(elWithGoTo.thenGoTo);
                                        setElState({});
                                    } else {
                                        navigateFlow();
                                    }
                                }}
                                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                                    {t('cascade.cascade_designer.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                                </button>
                            )}
                            {/* Default Weiter/Fertig wenn keine Elemente oder alle ohne Navigation */}
                            {elements.length === 0 && (hasNext ? (
                                <button onClick={() => navigateFlow()}
                                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                                    {t('cascade.cascade_designer.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                                </button>
                            ) : (
                                <button onClick={handleFinish}
                                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform">
                                    {t('cascade.cascade_designer.fertig')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-center gap-1.5 pb-6 shrink-0">
                    {nodes.map((n, i) => {
                        const histIdx = history.indexOf(n.id);
                        const isCurrent = n.id === currentNodeId;
                        const isVisited = histIdx >= 0;
                        return <div key={n.id} className={cn("size-2 rounded-full transition-colors",
                            isCurrent ? "bg-primary scale-125" : isVisited ? "bg-primary/40" : "bg-border")} />;
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Flow-Log Ansicht ─────────────────────────────────────────────────────────

interface FlowLogProps {
    boardId: string;
    jwt: string;
    onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
    start: 'Gestartet',
    navigate: 'Weiter',
    answer_yes: 'Ja',
    answer_no: 'Nein',
    select_option: 'Gewählt',
    finish: 'Abgeschlossen',
};

const ACTION_COLORS: Record<string, string> = {
    start: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    navigate: 'bg-muted text-muted-foreground',
    answer_yes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    answer_no: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    select_option: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    finish: 'bg-primary/10 text-primary',
};

export function CascadeFlowLog({ boardId, jwt, onClose }: FlowLogProps): JSX.Element {
    const t = useT();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

    const loadLogs = useCallback(async () => {
        const res = await api(`/cascade-boards/${boardId}/flow-log`, jwt);
        if (res.ok) {
            const data = await res.json();
            setLogs(data.logs ?? []);
        }
        setLoading(false);
    }, [boardId, jwt]);

    useEffect(() => {
        loadLogs();
        // Echtzeit: alle 3 Sekunden neu laden
        intervalRef.current = setInterval(loadLogs, 3000);
        return () => clearInterval(intervalRef.current);
    }, [loadLogs]);

    // Gruppiere nach Session
    const sessions = new Map<string, LogEntry[]>();
    for (const log of logs) {
        if (!sessions.has(log.sessionId)) sessions.set(log.sessionId, []);
        sessions.get(log.sessionId)!.push(log);
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
                <div className="flex items-center gap-2">
                    <MaterialIcon name="description" size={16} className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold">{t('cascade.cascade_designer.flow-protokoll')}</span>
                    <span className="text-[10px] text-muted-foreground">({sessions.size} {t('cascade.cascade_designer.durchlaeufe')}</span>
                </div>
                <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                    <MaterialIcon name="close" size={16} className="size-3.5" />
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                {loading && <div className="p-4 text-sm text-muted-foreground">{t('cascade.cascade_designer.laden')}</div>}
                {!loading && sessions.size === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                        <MaterialIcon name="schedule" size={16} className="size-6 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('cascade.cascade_designer.noch_keine_durchlaeufe')}</p>
                    </div>
                )}
                {Array.from(sessions.entries()).map(([sessionId, entries]) => {
                    const first = entries[entries.length - 1]; // ältester (logs sind desc)
                    const last = entries[0]; // neuester
                    return (
                        <div key={sessionId} className="border-b">
                            <div className="flex items-center gap-2 px-4 py-2 bg-muted/20">
                                <User className="size-3 text-muted-foreground" />
                                <span className="text-[11px] font-medium">{first.userName}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {new Date(first.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <div className="px-4 py-1.5 space-y-1">
                                {[...entries].reverse().map(entry => (
                                    <div key={entry.id} className="flex items-center gap-2 text-[11px]">
                                        <span className="text-[9px] text-muted-foreground/50 w-10 shrink-0">
                                            {new Date(entry.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-medium', ACTION_COLORS[entry.action] ?? 'bg-muted text-muted-foreground')}>
                                            {ACTION_LABELS[entry.action] ?? entry.action}
                                        </span>
                                        <span className="truncate text-muted-foreground">{entry.columnTitle}</span>
                                        {entry.detail && <span className="text-[10px] text-muted-foreground/60">({entry.detail})</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Dossier / Flow-Ergebnisse ──────────────────────────────────────────────

interface FlowResult {
    id: string;
    sessionId: string;
    userId: string;
    userName: string;
    variables: Record<string, unknown>;
    status: string;
    createdAt: string;
}

interface ResultsProps {
    boardId: string;
    boardName: string;
    jwt: string;
    onClose: () => void;
}

export function CascadeResults({ boardId, boardName, jwt, onClose }: ResultsProps): JSX.Element {
    const t = useT();
    const [results, setResults] = useState<FlowResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const loadResults = useCallback(async () => {
        const res = await api(`/cascade-boards/${boardId}/flow-results`, jwt);
        if (res.ok) {
            const data = await res.json();
            setResults(data.results ?? []);
        }
        setLoading(false);
    }, [boardId, jwt]);

    useEffect(() => { loadResults(); }, [loadResults]);

    const renderValue = (value: unknown): string => {
        if (value === null || value === undefined) return '—';
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'object') {
            return Object.entries(value as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${v}`)
                .join('; ');
        }
        return String(value);
    };

    const exportAsText = (result: FlowResult) => {
        const lines = [`Dossier: ${boardName}`, `Erstellt: ${new Date(result.createdAt).toLocaleString('de-DE')}`, `Von: ${result.userName}`, ''];
        for (const [key, val] of Object.entries(result.variables)) {
            lines.push(`${key}: ${renderValue(val)}`);
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${boardName}_${new Date(result.createdAt).toISOString().slice(0, 10)}.txt`;
        a.click(); URL.revokeObjectURL(url);
    };

    const exportAsPdf = (result: FlowResult) => {
        const date = new Date(result.createdAt).toLocaleString('de-DE');
        const rows = Object.entries(result.variables).map(([k, v]) =>
            `<tr><td style="padding:6px 12px;font-weight:600;vertical-align:top;white-space:nowrap;color:#6b7280">${k}</td><td style="padding:6px 12px">${renderValue(v)}</td></tr>`
        ).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dossier: ${boardName}</title>
      <style>body{font-family:Inter,system-ui,sans-serif;margin:40px;color:#1f2937}h1{font-size:20px;margin-bottom:4px}
      .meta{color:#6b7280;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse}
      tr{border-bottom:1px solid #e5e7eb}td{font-size:14px}@media print{body{margin:20px}}</style></head>
      <body><h1>${boardName}</h1><p class="meta">Erstellt: ${date} &middot; Von: ${result.userName}</p>
      <table>${rows}</table></body></html>`;
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300); }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
                <div className="flex items-center gap-2">
                    <MaterialIcon name="list_alt" size={16} className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold">{t('cascade.cascade_designer.ergebnisse')}</span>
                    <span className="text-[10px] text-muted-foreground">({results.length} {t('cascade.cascade_designer.dossiers')}</span>
                </div>
                <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                    <MaterialIcon name="close" size={16} className="size-3.5" />
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                {loading && <div className="p-4 text-sm text-muted-foreground">{t('cascade.cascade_designer.laden')}</div>}
                {!loading && results.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                        <MaterialIcon name="list_alt" size={16} className="size-6 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('cascade.cascade_designer.noch_keine_ergebnisse')}</p>
                        <p className="text-[11px] text-muted-foreground/60">{t('cascade.cascade_designer.ergebnisse_erscheinen_wenn_jemand_den_ab')}</p>
                    </div>
                )}
                {results.map(result => {
                    const varEntries = Object.entries(result.variables);
                    const isExpanded = expanded === result.id;
                    return (
                        <div key={result.id} className="border-b">
                            <button onClick={() => setExpanded(isExpanded ? null : result.id)}
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors">
                                <User className="size-3 text-muted-foreground shrink-0" />
                                <span className="text-[11px] font-medium flex-1">{result.userName}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {new Date(result.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-[9px] text-muted-foreground">{varEntries.length} {t('cascade.cascade_designer.felder')}</span>
                                <ChevronDown className={cn("size-3 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                            </button>
                            {isExpanded && (
                                <div className="px-4 pb-3">
                                    <div className="rounded-lg border bg-card p-3 space-y-2">
                                        {varEntries.map(([key, val]) => (
                                            <div key={key} className="flex items-start gap-2">
                                                <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-28 text-right">{key}:</span>
                                                <span className="text-[11px] flex-1">{renderValue(val)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex gap-1">
                                        <button onClick={() => exportAsPdf(result)}
                                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                                            <MaterialIcon name="description" size={16} className="size-3" /> PDF
                                        </button>
                                        <button onClick={() => exportAsText(result)}
                                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                                            <MaterialIcon name="download" size={16} className="size-3" /> {t('cascade.cascade_designer.text')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Runs Panel (Server-seitige Durchlaeufe starten/ueberwachen) ────────────

interface RunsPanelProps {
    boardId: string;
    jwt: string;
    onClose: () => void;
}

interface CascadeRunItem {
    id: string;
    status: string;
    activeColumnId: string | null;
    variables: Record<string, unknown>;
    startedAt: string;
    completedAt: string | null;
    slaBreached: boolean;
}

const RUN_STATUS: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    running: { icon: Play, color: 'text-blue-500', label: 'Laeuft' },
    waiting: { icon: Clock, color: 'text-amber-500', label: 'Wartet' },
    completed: { icon: CheckCircle, color: 'text-emerald-500', label: 'Fertig' },
    failed: { icon: XCircle, color: 'text-destructive', label: 'Fehlgeschlagen' },
    canceled: { icon: X, color: 'text-muted-foreground', label: 'Abgebrochen' },
};

export function CascadeRunsPanel({ boardId, jwt, onClose }: RunsPanelProps): JSX.Element {
    const t = useT();
    const [runs, setRuns] = useState<CascadeRunItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    const loadRuns = useCallback(async () => {
        const res = await api(`/cascade-boards/${boardId}/runs`, jwt);
        if (res.ok) { const data = await res.json(); setRuns(data.runs ?? []); }
        setLoading(false);
    }, [boardId, jwt]);

    useEffect(() => { loadRuns(); }, [loadRuns]);
    useEffect(() => { const i = setInterval(loadRuns, 5000); return () => clearInterval(i); }, [loadRuns]);

    const handleStart = async () => {
        setStarting(true);
        await api(`/cascade-boards/${boardId}/runs`, jwt, { method: 'POST', body: '{}' });
        await loadRuns(); setStarting(false);
    };

    const handleAdvance = async (runId: string) => {
        await api(`/cascade-runs/${runId}/advance`, jwt, { method: 'POST', body: JSON.stringify({ answers: {} }) });
        await loadRuns();
    };

    const handleCancel = async (runId: string) => {
        await api(`/cascade-runs/${runId}/cancel`, jwt, { method: 'POST', body: '{}' });
        await loadRuns();
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
                <div className="flex items-center gap-2">
                    <MaterialIcon name="play_arrow" size={16} className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold">{t('cascade.cascade_designer.server-runs')}</span>
                    <span className="text-[10px] text-muted-foreground">({runs.length})</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={handleStart} disabled={starting}
                        className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50">
                        {starting ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="add" size={16} className="size-3" />} {t('cascade.cascade_designer.starten')}
                    </button>
                    <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-3.5" />
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-auto">
                {loading && <div className="p-4 text-sm text-muted-foreground">{t('cascade.cascade_designer.laden')}</div>}
                {!loading && runs.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                        <MaterialIcon name="play_arrow" size={16} className="size-6 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('cascade.cascade_designer.keine_server-runs')}</p>
                        <p className="text-[11px] text-muted-foreground/60">{t('cascade.cascade_designer.server-runs_fuehren_den_ablauf_ohne_brow')}</p>
                    </div>
                )}
                {runs.map(run => {
                    const cfg = RUN_STATUS[run.status] ?? RUN_STATUS.running;
                    const StatusIcon = cfg.icon;
                    return (
                        <div key={run.id} className="border-b px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <StatusIcon className={cn('size-4 shrink-0', cfg.color)} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium">{cfg.label}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {new Date(run.startedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        {run.completedAt && ` → ${new Date(run.completedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                                    </p>
                                </div>
                                {run.slaBreached && <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 text-[8px] font-medium text-red-600">SLA</span>}
                                {Object.keys(run.variables).length > 0 && <span className="text-[9px] text-muted-foreground">{Object.keys(run.variables).length} {t('cascade.cascade_designer.var')}</span>}
                            </div>
                            {(run.status === 'running' || run.status === 'waiting') && (
                                <div className="mt-1.5 flex gap-1">
                                    {run.status === 'running' && (
                                        <button onClick={() => handleAdvance(run.id)} className="rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20">{t('cascade.cascade_designer.weiter')}</button>
                                    )}
                                    <button onClick={() => handleCancel(run.id)} className="rounded border border-destructive/30 px-2 py-0.5 text-[10px] text-destructive hover:bg-destructive/10">{t('cascade.cascade_designer.abbrechen')}</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
